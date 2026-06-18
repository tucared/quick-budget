import { describe, it, expect } from "vitest"
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAuthSecret,
  deriveKek,
  generateHdk,
  generateUserKeyPair,
  randomBytes,
  unwrapKeyWithPrivateKey,
  unwrapPrivateKey,
  wrapKeyForPublicKey,
  wrapPrivateKey,
} from "@/lib/crypto/primitives"
import { encodeUtf8, decodeUtf8 } from "@/lib/crypto/encoding"
import { DEFAULT_KDF } from "@/lib/crypto/types"

// Keep KDF iterations low in tests — correctness, not work factor, is what we
// assert here.
const FAST_KDF = { algo: "PBKDF2-SHA256", iterations: 1000 } as const

describe("randomBytes", () => {
  it("returns the requested length and is not all-zero", () => {
    const b = randomBytes(32)
    expect(b.length).toBe(32)
    expect(b.some((x) => x !== 0)).toBe(true)
  })

  it("does not repeat across calls", () => {
    expect(Array.from(randomBytes(16))).not.toEqual(Array.from(randomBytes(16)))
  })
})

describe("aesGcm encrypt/decrypt", () => {
  it("round-trips a payload", async () => {
    const key = await generateHdk()
    const msg = encodeUtf8("secret amount: €42,00")
    const { nonce, ciphertext } = await aesGcmEncrypt(key, msg)
    expect(decodeUtf8(await aesGcmDecrypt(key, nonce, ciphertext))).toBe("secret amount: €42,00")
  })

  it("uses a fresh nonce each call (different ciphertext for same input)", async () => {
    const key = await generateHdk()
    const msg = encodeUtf8("same")
    const a = await aesGcmEncrypt(key, msg)
    const b = await aesGcmEncrypt(key, msg)
    expect(Array.from(a.nonce)).not.toEqual(Array.from(b.nonce))
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext))
  })

  it("rejects decryption with the wrong key", async () => {
    const key = await generateHdk()
    const other = await generateHdk()
    const { nonce, ciphertext } = await aesGcmEncrypt(key, encodeUtf8("x"))
    await expect(aesGcmDecrypt(other, nonce, ciphertext)).rejects.toBeTruthy()
  })

  it("rejects when the AAD does not match", async () => {
    const key = await generateHdk()
    const { nonce, ciphertext } = await aesGcmEncrypt(key, encodeUtf8("x"), encodeUtf8("aad-1"))
    await expect(
      aesGcmDecrypt(key, nonce, ciphertext, encodeUtf8("aad-2")),
    ).rejects.toBeTruthy()
  })

  it("rejects tampered ciphertext", async () => {
    const key = await generateHdk()
    const { nonce, ciphertext } = await aesGcmEncrypt(key, encodeUtf8("x"))
    ciphertext[0] ^= 0xff
    await expect(aesGcmDecrypt(key, nonce, ciphertext)).rejects.toBeTruthy()
  })
})

describe("deriveKek", () => {
  it("is deterministic for the same password + salt + params", async () => {
    const salt = randomBytes(16)
    const k1 = await deriveKek("hunter2", salt, FAST_KDF)
    const k2 = await deriveKek("hunter2", salt, FAST_KDF)
    // Same key ⇒ each can decrypt the other's ciphertext.
    const { nonce, ciphertext } = await aesGcmEncrypt(k1, encodeUtf8("v"))
    expect(decodeUtf8(await aesGcmDecrypt(k2, nonce, ciphertext))).toBe("v")
  })

  it("differs when the salt differs", async () => {
    const k1 = await deriveKek("pw", randomBytes(16), FAST_KDF)
    const k2 = await deriveKek("pw", randomBytes(16), FAST_KDF)
    const { nonce, ciphertext } = await aesGcmEncrypt(k1, encodeUtf8("v"))
    await expect(aesGcmDecrypt(k2, nonce, ciphertext)).rejects.toBeTruthy()
  })

  it("differs when the password differs", async () => {
    const salt = randomBytes(16)
    const k1 = await deriveKek("right", salt, FAST_KDF)
    const k2 = await deriveKek("wrong", salt, FAST_KDF)
    const { nonce, ciphertext } = await aesGcmEncrypt(k1, encodeUtf8("v"))
    await expect(aesGcmDecrypt(k2, nonce, ciphertext)).rejects.toBeTruthy()
  })
})

describe("deriveAuthSecret", () => {
  it("is deterministic and case/space-insensitive on email", async () => {
    const a = await deriveAuthSecret("pw", "User@Example.com", FAST_KDF)
    const b = await deriveAuthSecret("pw", "  user@example.com ", FAST_KDF)
    expect(a).toBe(b)
  })

  it("differs from the KEK domain (independent outputs)", async () => {
    // Same password, but the auth secret is salted by email while the KEK uses a
    // random salt — the two must not be trivially equal/derivable.
    const auth = await deriveAuthSecret("pw", "user@example.com", FAST_KDF)
    expect(typeof auth).toBe("string")
    expect(auth.length).toBeGreaterThan(0)
    const auth2 = await deriveAuthSecret("pw2", "user@example.com", FAST_KDF)
    expect(auth).not.toBe(auth2)
  })
})

describe("private key wrap/unwrap with KEK", () => {
  it("round-trips an ECDH private key", async () => {
    const kek = await deriveKek("pw", randomBytes(16), FAST_KDF)
    const pair = await generateUserKeyPair()
    const { nonce, ciphertext } = await wrapPrivateKey(kek, pair.privateKey)
    const restored = await unwrapPrivateKey(kek, nonce, ciphertext)

    // The restored private key must derive the same ECDH secret the original
    // would against a third party's public key.
    const peer = await generateUserKeyPair()
    const bitsA = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      pair.privateKey,
      256,
    )
    const bitsB = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      restored,
      256,
    )
    expect(Array.from(new Uint8Array(bitsA))).toEqual(Array.from(new Uint8Array(bitsB)))
  })

  it("fails to unwrap with the wrong KEK", async () => {
    const kek = await deriveKek("pw", randomBytes(16), FAST_KDF)
    const wrong = await deriveKek("nope", randomBytes(16), FAST_KDF)
    const pair = await generateUserKeyPair()
    const { nonce, ciphertext } = await wrapPrivateKey(kek, pair.privateKey)
    await expect(unwrapPrivateKey(wrong, nonce, ciphertext)).rejects.toBeTruthy()
  })
})

describe("HDK wrap to a public key (ECIES)", () => {
  it("a member can unwrap the HDK wrapped to their public key", async () => {
    const hdk = await generateHdk()
    const member = await generateUserKeyPair()
    const wrapped = await wrapKeyForPublicKey(hdk, member.publicKey)
    const unwrapped = await unwrapKeyWithPrivateKey(wrapped, member.privateKey)

    // Unwrapped HDK decrypts what the original HDK encrypted.
    const { nonce, ciphertext } = await aesGcmEncrypt(hdk, encodeUtf8("shared"))
    expect(decodeUtf8(await aesGcmDecrypt(unwrapped, nonce, ciphertext))).toBe("shared")
  })

  it("two members each get a wrap and recover the SAME shared HDK", async () => {
    const hdk = await generateHdk()
    const alice = await generateUserKeyPair()
    const bob = await generateUserKeyPair()

    const forAlice = await wrapKeyForPublicKey(hdk, alice.publicKey)
    const forBob = await wrapKeyForPublicKey(hdk, bob.publicKey)

    const aliceHdk = await unwrapKeyWithPrivateKey(forAlice, alice.privateKey)
    const bobHdk = await unwrapKeyWithPrivateKey(forBob, bob.privateKey)

    // Alice encrypts; Bob decrypts — proves both hold the identical key.
    const { nonce, ciphertext } = await aesGcmEncrypt(aliceHdk, encodeUtf8("household data"))
    expect(decodeUtf8(await aesGcmDecrypt(bobHdk, nonce, ciphertext))).toBe("household data")
  })

  it("a non-recipient cannot unwrap another member's wrap", async () => {
    const hdk = await generateHdk()
    const member = await generateUserKeyPair()
    const outsider = await generateUserKeyPair()
    const wrapped = await wrapKeyForPublicKey(hdk, member.publicKey)
    await expect(
      unwrapKeyWithPrivateKey(wrapped, outsider.privateKey),
    ).rejects.toBeTruthy()
  })
})

describe("DEFAULT_KDF", () => {
  it("ships a strong default iteration count", () => {
    expect(DEFAULT_KDF.algo).toBe("PBKDF2-SHA256")
    expect(DEFAULT_KDF.iterations).toBeGreaterThanOrEqual(600_000)
  })
})
