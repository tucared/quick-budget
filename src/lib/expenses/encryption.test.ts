import { describe, expect, it } from "vitest"
import { generateHdk, Vault } from "@/lib/crypto"
import {
  parseStoredBlob,
  resolveExpenseDescription,
  resolveExpenseDescriptions,
  sealExpenseFields,
} from "./encryption"

const HOUSEHOLD = "11111111-1111-1111-1111-111111111111"
const OTHER_HOUSEHOLD = "22222222-2222-2222-2222-222222222222"
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

// A vault backed by a freshly-generated HDK — enough to exercise the codec
// without the full setup/unlock store dance (covered in vault.test.ts).
async function makeVault(householdId = HOUSEHOLD): Promise<Vault> {
  return Vault._fromHdk(householdId, USER, await generateHdk())
}

describe("parseStoredBlob", () => {
  it("accepts a well-formed blob and rejects malformed values", () => {
    expect(parseStoredBlob({ v: 1, nonce: "n", ct: "c" })).toEqual({ v: 1, nonce: "n", ct: "c" })
    expect(parseStoredBlob(null)).toBeNull()
    expect(parseStoredBlob("nope")).toBeNull()
    expect(parseStoredBlob({ v: 1, nonce: "n" })).toBeNull()
    expect(parseStoredBlob({ v: "1", nonce: "n", ct: "c" })).toBeNull()
  })
})

describe("sealExpenseFields / resolveExpenseDescription", () => {
  it("round-trips a description through enc_blob", async () => {
    const vault = await makeVault()
    const blob = await sealExpenseFields(vault, "exp-1", { description: "Lunch with Sam" })
    expect(blob).not.toBeNull()

    // The plaintext column is deliberately wrong to prove the decrypted value wins.
    const resolved = await resolveExpenseDescription(vault, {
      id: "exp-1",
      description: "PLAINTEXT FALLBACK",
      enc_blob: blob,
    })
    expect(resolved).toBe("Lunch with Sam")
  })

  it("seals null with no vault and falls back to plaintext on read", async () => {
    expect(await sealExpenseFields(null, "exp-1", { description: "x" })).toBeNull()

    // No vault → plaintext.
    expect(
      await resolveExpenseDescription(null, { id: "exp-1", description: "plain", enc_blob: null }),
    ).toBe("plain")
  })

  it("falls back to plaintext when there's no blob (Tricount/legacy rows)", async () => {
    const vault = await makeVault()
    expect(
      await resolveExpenseDescription(vault, {
        id: "exp-1",
        description: "tricount entry",
        enc_blob: null,
      }),
    ).toBe("tricount entry")
  })

  it("falls back to plaintext when the blob can't be decrypted (wrong key)", async () => {
    const sealer = await makeVault(HOUSEHOLD)
    const blob = await sealExpenseFields(sealer, "exp-1", { description: "secret" })

    // A different household/HDK can't decrypt → AAD/tag mismatch → plaintext.
    const other = await makeVault(OTHER_HOUSEHOLD)
    expect(
      await resolveExpenseDescription(other, {
        id: "exp-1",
        description: "fallback",
        enc_blob: blob,
      }),
    ).toBe("fallback")
  })

  it("batch-resolves a mix of encrypted and plaintext rows", async () => {
    const vault = await makeVault()
    const blob = await sealExpenseFields(vault, "enc", { description: "encrypted one" })

    const map = await resolveExpenseDescriptions(vault, [
      { id: "enc", description: "ignored", enc_blob: blob },
      { id: "plain", description: "plain one", enc_blob: null },
    ])
    expect(map.get("enc")).toBe("encrypted one")
    expect(map.get("plain")).toBe("plain one")
  })
})
