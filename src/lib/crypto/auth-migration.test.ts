import { describe, expect, it, vi } from "vitest"
import { ensureVaultAuth } from "./auth-migration"
import { unlockVault } from "./vault"
import type { HdkWrapRow, UserKeyMaterialRow, VaultStore } from "./vault-repo"

function createMemoryStore() {
  const keyMaterial = new Map<string, UserKeyMaterialRow>()
  const wraps = new Map<string, HdkWrapRow>()
  const wrapKey = (h: string, u: string) => `${h}:${u}`
  const store: VaultStore = {
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
  }
  return { store, keyMaterial }
}

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111"
const ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

describe("ensureVaultAuth", () => {
  it("first member: sets up a ready vault and re-keys the password", async () => {
    const { store, keyMaterial } = createMemoryStore()
    const reKeyPassword = vi.fn(async () => {})

    const result = await ensureVaultAuth({
      store,
      userId: ALICE,
      householdId: HOUSEHOLD,
      password: "real-pw",
      authSecret: "derived-secret",
      reKeyPassword,
    })

    expect(result.setupStatus).toBe("ready")
    expect(keyMaterial.has(ALICE)).toBe(true)
    expect(reKeyPassword).toHaveBeenCalledWith("derived-secret")
    // The established vault unlocks with the real password.
    await expect(unlockVault({ store, userId: ALICE, password: "real-pw" })).resolves.toBeDefined()
  })

  it("joining member: reports pending-grant but still re-keys", async () => {
    const { store } = createMemoryStore()
    // Alice is already set up (household has an HDK).
    await ensureVaultAuth({
      store, userId: ALICE, householdId: HOUSEHOLD,
      password: "alice-pw", authSecret: "alice-secret", reKeyPassword: async () => {},
    })

    const reKeyPassword = vi.fn(async () => {})
    const result = await ensureVaultAuth({
      store, userId: BOB, householdId: HOUSEHOLD,
      password: "bob-pw", authSecret: "bob-secret", reKeyPassword,
    })

    expect(result.setupStatus).toBe("pending-grant")
    expect(reKeyPassword).toHaveBeenCalledWith("bob-secret")
  })

  it("is idempotent: a second call only re-keys, without re-running setup", async () => {
    const { store, keyMaterial } = createMemoryStore()
    await ensureVaultAuth({
      store, userId: ALICE, householdId: HOUSEHOLD,
      password: "real-pw", authSecret: "s1", reKeyPassword: async () => {},
    })
    const firstMaterial = keyMaterial.get(ALICE)

    const reKeyPassword = vi.fn(async () => {})
    const result = await ensureVaultAuth({
      store, userId: ALICE, householdId: HOUSEHOLD,
      password: "real-pw", authSecret: "s2", reKeyPassword,
    })

    expect(result.setupStatus).toBe("existing")
    expect(reKeyPassword).toHaveBeenCalledWith("s2")
    // Key material untouched (same wrapped private key — no re-generation).
    expect(keyMaterial.get(ALICE)).toBe(firstMaterial)
  })

  it("converges after a failed re-key: setup persists, retry only re-keys", async () => {
    const { store } = createMemoryStore()
    await expect(
      ensureVaultAuth({
        store, userId: ALICE, householdId: HOUSEHOLD,
        password: "real-pw", authSecret: "s1",
        reKeyPassword: async () => {
          throw new Error("network")
        },
      }),
    ).rejects.toThrow("network")

    // Key material was written before the re-key threw; the retry finds it.
    const reKeyPassword = vi.fn(async () => {})
    const result = await ensureVaultAuth({
      store, userId: ALICE, householdId: HOUSEHOLD,
      password: "real-pw", authSecret: "s1", reKeyPassword,
    })
    expect(result.setupStatus).toBe("existing")
    expect(reKeyPassword).toHaveBeenCalledOnce()
  })
})
