// Shared types for the E2E crypto layer. See the plan / DATA_MODEL decision on
// admin-blind households: a per-household Household Data Key (HDK) encrypts all
// sensitive fields; each user holds an ECDH keypair whose private key is wrapped
// by a password-derived KEK; the HDK is wrapped once per member to their public
// key so both partners decrypt the same shared data.

import type { Bytes } from "./encoding"

// Versioned KDF descriptor stored alongside each user's key material so the
// parameters (and, later, the algorithm) can be upgraded without guessing.
// PBKDF2-SHA256 is the dependency-free default; `algo` leaves room to swap in
// Argon2id (via hash-wasm) later without breaking stored material.
export interface KdfParams {
  algo: "PBKDF2-SHA256"
  iterations: number
}

export const DEFAULT_KDF: KdfParams = {
  algo: "PBKDF2-SHA256",
  iterations: 600_000,
}

// An HDK wrapped to a recipient's ECDH public key (ECIES-style): the ephemeral
// public key + AES-GCM nonce + ciphertext are all that need to be stored.
export interface WrappedKey {
  ephemeralPublicKey: Bytes
  nonce: Bytes
  ciphertext: Bytes
}

// AES-GCM output: nonce travels with the ciphertext.
export interface SealedBytes {
  nonce: Bytes
  ciphertext: Bytes
}

// The storable encrypted-field blob that lands in a row's `enc_data`/`enc_nonce`
// columns. `v` is the blob schema version (also bound into the AAD), so a future
// field-set change can be migrated rather than silently mis-decrypted.
export interface StoredBlob {
  v: number
  nonce: string
  ct: string
}

// Identity bound into a blob's AAD so ciphertext is cryptographically pinned to
// its row — the admin cannot transplant one row's blob onto another.
export interface AadParts {
  table: string
  id: string
  householdId: string
  v?: number
}
