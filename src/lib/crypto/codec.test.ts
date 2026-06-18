import { describe, it, expect } from "vitest"
import { BLOB_SCHEMA_VERSION, buildAad, decryptFields, encryptFields } from "@/lib/crypto/codec"
import { generateHdk } from "@/lib/crypto/primitives"
import type { AadParts } from "@/lib/crypto/types"

const PARTS: AadParts = {
  table: "expenses",
  id: "11111111-1111-4111-8111-111111111111",
  householdId: "22222222-2222-4222-8222-222222222222",
}

const FIELDS = {
  amount: 42.5,
  converted_amount: 42.5,
  currency: "EUR",
  description: "Dinner with friends",
}

describe("encryptFields / decryptFields", () => {
  it("round-trips a field set", async () => {
    const hdk = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    expect(blob.v).toBe(BLOB_SCHEMA_VERSION)
    expect(typeof blob.nonce).toBe("string")
    expect(typeof blob.ct).toBe("string")

    const out = await decryptFields<typeof FIELDS>(hdk, PARTS, blob)
    expect(out).toEqual(FIELDS)
  })

  it("produces no plaintext substrings in the stored blob", async () => {
    const hdk = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    const serialized = JSON.stringify(blob)
    expect(serialized).not.toContain("Dinner")
    expect(serialized).not.toContain("EUR")
    expect(serialized).not.toContain("42.5")
  })

  it("fails to decrypt under a different row id (AAD pinning)", async () => {
    const hdk = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    await expect(
      decryptFields(hdk, { ...PARTS, id: "33333333-3333-4333-8333-333333333333" }, blob),
    ).rejects.toBeTruthy()
  })

  it("fails to decrypt under a different table (AAD pinning)", async () => {
    const hdk = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    await expect(
      decryptFields(hdk, { ...PARTS, table: "categories" }, blob),
    ).rejects.toBeTruthy()
  })

  it("fails to decrypt under a different household (AAD pinning)", async () => {
    const hdk = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    await expect(
      decryptFields(hdk, { ...PARTS, householdId: "44444444-4444-4444-8444-444444444444" }, blob),
    ).rejects.toBeTruthy()
  })

  it("fails to decrypt with a different HDK", async () => {
    const hdk = await generateHdk()
    const other = await generateHdk()
    const blob = await encryptFields(hdk, PARTS, FIELDS)
    await expect(decryptFields(other, PARTS, blob)).rejects.toBeTruthy()
  })
})

describe("buildAad", () => {
  it("is stable regardless of field insertion order in parts", () => {
    const a = buildAad({ table: "t", id: "i", householdId: "h", v: 1 })
    const b = buildAad({ householdId: "h", v: 1, id: "i", table: "t" })
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it("defaults the version to the current schema version", () => {
    const withDefault = buildAad(PARTS)
    const explicit = buildAad({ ...PARTS, v: BLOB_SCHEMA_VERSION })
    expect(Array.from(withDefault)).toEqual(Array.from(explicit))
  })
})
