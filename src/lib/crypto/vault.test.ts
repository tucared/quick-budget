import { describe, expect, it } from "vitest"
import { grantPendingMembers, setupVault, unlockVault, VaultError, type SetupResult } from "./vault"
import type { HdkWrapRow, UserKeyMaterialRow, VaultStore } from "./vault-repo"

// In-memory VaultStore — exercises the real WebCrypto path (Node 24 / happy-dom)
// without a database, the same way primitives.test.ts / codec.test.ts do.
function createMemoryStore(): VaultStore {
  const keyMaterial = new Map<string, UserKeyMaterialRow>()
  const wraps = new Map<string, HdkWrapRow>() // key: `${household}:${user}`
  const wrapKey = (h: string, u: string) => `${h}:${u}`

  return {
    async getUserKeyMaterial(userId) {
      return keyMaterial.get(userId) ?? null
    },
    async putUserKeyMaterial(row) {
      keyMaterial.set(row.user_id, row)
    },
    async householdHasHdk(householdId) {
      for (const row of wraps.values()) if (row.household_id === householdId) return true
      return false
    },
    async getHdkWrap(householdId, userId) {
      return wraps.get(wrapKey(householdId, userId)) ?? null
    },
    async putHdkWrap(row) {
      wraps.set(wrapKey(row.household_id, row.user_id), row)
    },
    async getPublicKey(householdId, userId) {
      const km = keyMaterial.get(userId)
      return km && km.household_id === householdId ? km.public_key : null
    },
    async listMembersNeedingGrant(householdId) {
      const wrapped = new Set(
        [...wraps.values()].filter((w) => w.household_id === householdId).map((w) => w.user_id),
      )
      return [...keyMaterial.values()]
        .filter((km) => km.household_id === householdId && !wrapped.has(km.user_id))
        .map((km) => km.user_id)
    },
  }
}

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111"
const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

function expectReady(result: SetupResult) {
  if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`)
  return result.vault
}

describe("vault setup / unlock", () => {
  it("first member: setup is ready and round-trips encrypted fields", async () => {
    const store = createMemoryStore()
    const result = await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "correct horse" })
    const vault = expectReady(result)

    const blob = await vault.encryptRow("expenses", "exp-1", { description: "Lunch", amount: 1234 })
    const decoded = await vault.decryptRow("expenses", "exp-1", blob)
    expect(decoded).toEqual({ description: "Lunch", amount: 1234 })
  })

  it("unlock with the right password reconstructs a working vault", async () => {
    const store = createMemoryStore()
    const setup = expectReady(
      await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "pw-123" }),
    )
    const blob = await setup.encryptRow("expenses", "exp-1", { secret: "value" })

    const reopened = await unlockVault({ store, userId: ALICE, password: "pw-123" })
    expect(await reopened.decryptRow("expenses", "exp-1", blob)).toEqual({ secret: "value" })
  })

  it("unlock with the wrong password throws bad-password", async () => {
    const store = createMemoryStore()
    await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "right" })
    await expect(unlockVault({ store, userId: ALICE, password: "wrong" })).rejects.toMatchObject({
      code: "bad-password",
    })
  })

  it("unlock without key material throws no-key-material", async () => {
    const store = createMemoryStore()
    await expect(unlockVault({ store, userId: ALICE, password: "x" })).rejects.toBeInstanceOf(VaultError)
    await expect(unlockVault({ store, userId: ALICE, password: "x" })).rejects.toMatchObject({
      code: "no-key-material",
    })
  })
})

describe("vault multi-member grant", () => {
  it("joining member is pending-grant until an unlocked member grants access", async () => {
    const store = createMemoryStore()
    const alice = expectReady(
      await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "alice-pw" }),
    )

    // Bob joins the same household: HDK already exists, so he can't unlock yet.
    const bobSetup = await setupVault({ store, userId: BOB, householdId: HOUSEHOLD, password: "bob-pw" })
    expect(bobSetup.status).toBe("pending-grant")
    expect(bobSetup.vault).toBeNull()

    await expect(unlockVault({ store, userId: BOB, password: "bob-pw" })).rejects.toMatchObject({
      code: "pending-grant",
    })

    // Alice grants Bob access; Bob can now unlock and read the SAME shared HDK.
    const shared = await alice.encryptRow("expenses", "exp-9", { note: "shared" })
    await alice.grantAccessTo(store, BOB)

    const bob = await unlockVault({ store, userId: BOB, password: "bob-pw" })
    expect(await bob.decryptRow("expenses", "exp-9", shared)).toEqual({ note: "shared" })
  })

  it("granting to a member with no published key throws no-public-key", async () => {
    const store = createMemoryStore()
    const alice = expectReady(
      await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "alice-pw" }),
    )
    await expect(alice.grantAccessTo(store, BOB)).rejects.toMatchObject({ code: "no-public-key" })
  })
})

describe("grantPendingMembers (login-time auto-grant)", () => {
  it("grants a pending partner, who can then unlock the shared HDK", async () => {
    const store = createMemoryStore()
    const alice = expectReady(
      await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "alice-pw" }),
    )
    const shared = await alice.encryptRow("expenses", "exp-1", { note: "shared" })

    // Bob sets up after Alice — pending-grant, no wrap yet.
    await setupVault({ store, userId: BOB, householdId: HOUSEHOLD, password: "bob-pw" })

    // Alice's next login auto-grants Bob.
    const granted = await grantPendingMembers({
      store,
      householdId: HOUSEHOLD,
      granterUserId: ALICE,
      password: "alice-pw",
    })
    expect(granted).toEqual([BOB])

    const bob = await unlockVault({ store, userId: BOB, password: "bob-pw" })
    expect(await bob.decryptRow("expenses", "exp-1", shared)).toEqual({ note: "shared" })
  })

  it("is a no-op (no KDF) when there is nobody to grant", async () => {
    const store = createMemoryStore()
    await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "alice-pw" })

    // No partner pending: returns empty and never needs the granter's password.
    const granted = await grantPendingMembers({
      store,
      householdId: HOUSEHOLD,
      granterUserId: ALICE,
      password: "wrong-on-purpose",
    })
    expect(granted).toEqual([])
  })

  it("excludes the granter from the pending set", async () => {
    const store = createMemoryStore()
    await setupVault({ store, userId: ALICE, householdId: HOUSEHOLD, password: "alice-pw" })
    // Alice already holds her own wrap, so she is never a grant target.
    const granted = await grantPendingMembers({
      store,
      householdId: HOUSEHOLD,
      granterUserId: ALICE,
      password: "alice-pw",
    })
    expect(granted).toEqual([])
  })
})
