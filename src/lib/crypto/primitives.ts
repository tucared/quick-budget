// Low-level WebCrypto primitives for the E2E crypto layer. Pure (stateless) —
// every function takes its keys/inputs explicitly so they are unit-testable
// without the in-memory vault. Uses only the global WebCrypto (`crypto.subtle`),
// available in Node 24 and every modern browser.

import { encodeUtf8, toBase64, type Bytes } from "./encoding"
import { DEFAULT_KDF, type KdfParams, type SealedBytes, type WrappedKey } from "./types"

const AES_GCM = "AES-GCM"
const AES_PARAMS: AesKeyGenParams = { name: AES_GCM, length: 256 }
const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" }
const NONCE_BYTES = 12
const SHARED_BITS = 256
const HKDF_INFO = encodeUtf8("qb-hdk-wrap-v1")

// ---------------------------------------------------------------------------
// Randomness & key generation
// ---------------------------------------------------------------------------

export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length)
  crypto.getRandomValues(out)
  return out
}

// The Household Data Key. Extractable because it must be exported to be wrapped
// per member; it never leaves the client unencrypted.
export function generateHdk(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES_PARAMS, true, ["encrypt", "decrypt"])
}

// A user's long-lived ECDH keypair. The private key is exported (pkcs8) and
// wrapped by the password-derived KEK before storage.
export function generateUserKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey", "deriveBits"])
}

// ---------------------------------------------------------------------------
// Password-based key derivation (KDF)
// ---------------------------------------------------------------------------

function importPasswordMaterial(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encodeUtf8(password), "PBKDF2", false, [
    "deriveKey",
    "deriveBits",
  ])
}

// Derive the Key-Encryption-Key from the user's password + a per-user random
// salt. Used to wrap/unwrap the user's private key. Non-extractable: only ever
// used in-memory to encrypt/decrypt.
export async function deriveKek(
  password: string,
  salt: Bytes,
  params: KdfParams = DEFAULT_KDF,
): Promise<CryptoKey> {
  const base = await importPasswordMaterial(password)
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: params.iterations, hash: "SHA-256" },
    base,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"],
  )
}

// Derive the auth secret handed to Supabase as the "password". Salted with the
// (normalized) email so the client can compute it before any round-trip, and
// kept independent from the KEK (different salt domain) so the value the server
// sees can't be turned into the data key. The raw password never leaves the
// browser; GoTrue only ever sees this derivative.
export async function deriveAuthSecret(
  password: string,
  email: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<string> {
  const base = await importPasswordMaterial(password)
  const salt = encodeUtf8(`qb-auth:${email.trim().toLowerCase()}`)
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: params.iterations, hash: "SHA-256" },
    base,
    SHARED_BITS,
  )
  return toBase64(new Uint8Array(bits))
}

// ---------------------------------------------------------------------------
// AES-GCM authenticated encryption
// ---------------------------------------------------------------------------

export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Bytes,
  aad?: Bytes,
): Promise<SealedBytes> {
  const nonce = randomBytes(NONCE_BYTES)
  const algo: AesGcmParams = aad
    ? { name: AES_GCM, iv: nonce, additionalData: aad }
    : { name: AES_GCM, iv: nonce }
  const ciphertext = await crypto.subtle.encrypt(algo, key, plaintext)
  return { nonce, ciphertext: new Uint8Array(ciphertext) }
}

export async function aesGcmDecrypt(
  key: CryptoKey,
  nonce: Bytes,
  ciphertext: Bytes,
  aad?: Bytes,
): Promise<Bytes> {
  const algo: AesGcmParams = aad
    ? { name: AES_GCM, iv: nonce, additionalData: aad }
    : { name: AES_GCM, iv: nonce }
  const plaintext = await crypto.subtle.decrypt(algo, key, ciphertext)
  return new Uint8Array(plaintext)
}

// ---------------------------------------------------------------------------
// Key import / export
// ---------------------------------------------------------------------------

async function exportRaw(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key))
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey("spki", publicKey))
}

export function importPublicKey(bytes: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", bytes, ECDH_PARAMS, true, [])
}

async function exportPrivateKey(privateKey: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey))
}

function importPrivateKey(bytes: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", bytes, ECDH_PARAMS, true, ["deriveKey", "deriveBits"])
}

function importHdkRaw(bytes: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, AES_PARAMS, true, ["encrypt", "decrypt"])
}

// ---------------------------------------------------------------------------
// Wrapping the user's private key with their KEK
// ---------------------------------------------------------------------------

export async function wrapPrivateKey(kek: CryptoKey, privateKey: CryptoKey): Promise<SealedBytes> {
  return aesGcmEncrypt(kek, await exportPrivateKey(privateKey))
}

export async function unwrapPrivateKey(
  kek: CryptoKey,
  nonce: Bytes,
  ciphertext: Bytes,
): Promise<CryptoKey> {
  const raw = await aesGcmDecrypt(kek, nonce, ciphertext)
  return importPrivateKey(raw)
}

// ---------------------------------------------------------------------------
// Wrapping the HDK to a member's public key (ECIES-style)
// ---------------------------------------------------------------------------

// ECDH(ephemeral|recipient) → HKDF → AES-GCM wrapping key. Both sides derive the
// same key: the wrapper from (ephemeralPriv, recipientPub), the recipient from
// (recipientPriv, ephemeralPub).
async function deriveSharedWrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    SHARED_BITS,
  )
  const hkdfBase = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfBase,
    AES_PARAMS,
    false,
    ["encrypt", "decrypt"],
  )
}

export async function wrapKeyForPublicKey(
  hdk: CryptoKey,
  recipientPublicKey: CryptoKey,
): Promise<WrappedKey> {
  const ephemeral = await generateUserKeyPair()
  const wrappingKey = await deriveSharedWrappingKey(ephemeral.privateKey, recipientPublicKey)
  const { nonce, ciphertext } = await aesGcmEncrypt(wrappingKey, await exportRaw(hdk))
  return {
    ephemeralPublicKey: await exportPublicKey(ephemeral.publicKey),
    nonce,
    ciphertext,
  }
}

export async function unwrapKeyWithPrivateKey(
  wrapped: WrappedKey,
  recipientPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const ephemeralPublicKey = await importPublicKey(wrapped.ephemeralPublicKey)
  const wrappingKey = await deriveSharedWrappingKey(recipientPrivateKey, ephemeralPublicKey)
  const raw = await aesGcmDecrypt(wrappingKey, wrapped.nonce, wrapped.ciphertext)
  return importHdkRaw(raw)
}
