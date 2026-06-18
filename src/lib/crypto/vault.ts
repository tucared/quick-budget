// The stateful vault (M2). Holds the unlocked Household Data Key (HDK) and the
// user's private key in memory for the lifetime of a session, and exposes the
// row-blob codec bound to the current household. Nothing here persists key
// material in plaintext — `setupVault`/`unlockVault` read and write only the
// wrapped forms via a `VaultStore`.
//
// Multi-member model (DATA_MODEL: admin-blind households): the *first* member to
// set up generates the HDK and self-wraps it. A *joining* member can publish
// their key material but cannot obtain the HDK alone — an already-unlocked member
// must `grantAccessTo` them (wrap the HDK to their public key). Until then the
// joiner's vault is "pending-grant".

import { decryptFields, encryptFields } from "./codec"
import { fromBase64, toBase64 } from "./encoding"
import {
  deriveKek,
  exportPublicKey,
  generateHdk,
  generateUserKeyPair,
  importPublicKey,
  randomBytes,
  unwrapKeyWithPrivateKey,
  unwrapPrivateKey,
  wrapKeyForPublicKey,
  wrapPrivateKey,
} from "./primitives"
import type { HdkWrapRow, VaultStore } from "./vault-repo"
import { DEFAULT_KDF, type StoredBlob } from "./types"

const SALT_BYTES = 16
const WRAP_SCHEME = "ECDH-P256-HKDF-SHA256-AESGCM"

export type VaultErrorCode =
  | "no-key-material" // user has never set up — caller should run setupVault
  | "bad-password" // KEK could not unwrap the private key
  | "pending-grant" // key material exists but no HDK wrap yet (joining member)
  | "no-public-key" // grant target hasn't published key material

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, message?: string) {
    super(message ?? code)
    this.name = "VaultError"
  }
}

// Outcome of `setupVault`: a joining member whose household already has an HDK
// gets `status: "pending-grant"` and a null vault until a partner grants access.
export type SetupResult =
  | { status: "ready"; vault: Vault }
  | { status: "pending-grant"; vault: null }

export class Vault {
  // `hdk` and `privateKey` stay private: callers encrypt/decrypt through the
  // bound helpers and grant access through `grantAccessTo`, never touching the
  // raw keys. Both are non-extractable beyond what the primitives require.
  private constructor(
    readonly householdId: string,
    readonly userId: string,
    private readonly hdk: CryptoKey,
    private readonly privateKey: CryptoKey,
  ) {}

  /** @internal — constructed only by setup/unlock in this module. */
  static _create(householdId: string, userId: string, hdk: CryptoKey, privateKey: CryptoKey): Vault {
    return new Vault(householdId, userId, hdk, privateKey)
  }

  // Encrypt a row's sensitive fields, pinning the blob to (table, id, household).
  encryptRow(table: string, id: string, fields: Record<string, unknown>): Promise<StoredBlob> {
    return encryptFields(this.hdk, { table, id, householdId: this.householdId }, fields)
  }

  decryptRow<T = Record<string, unknown>>(table: string, id: string, blob: StoredBlob): Promise<T> {
    return decryptFields<T>(this.hdk, { table, id, householdId: this.householdId }, blob)
  }

  // Wrap the HDK to another household member's published public key so they can
  // unlock the same shared data. Called by an already-unlocked member to onboard
  // a partner or restore one who reset their password.
  async grantAccessTo(store: VaultStore, targetUserId: string): Promise<void> {
    const pub = await store.getPublicKey(this.householdId, targetUserId)
    if (!pub) throw new VaultError("no-public-key")
    const wrapped = await wrapKeyForPublicKey(this.hdk, await importPublicKey(fromBase64(pub)))
    await store.putHdkWrap({
      household_id: this.householdId,
      user_id: targetUserId,
      ephemeral_public_key: toBase64(wrapped.ephemeralPublicKey),
      wrapped_hdk: toBase64(wrapped.ciphertext),
      wrap_nonce: toBase64(wrapped.nonce),
      wrap_scheme: WRAP_SCHEME,
    })
  }
}

interface SetupParams {
  store: VaultStore
  userId: string
  householdId: string
  password: string
}

// First-time setup: generate the user's ECDH keypair, derive the password KEK,
// store the wrapped private key + public key. If the household has no HDK yet
// this user becomes the first member (generate + self-wrap the HDK → ready);
// otherwise they're a joining member awaiting a grant (pending-grant).
export async function setupVault({ store, userId, householdId, password }: SetupParams): Promise<SetupResult> {
  const keyPair = await generateUserKeyPair()
  const salt = randomBytes(SALT_BYTES)
  const kek = await deriveKek(password, salt, DEFAULT_KDF)
  const wrappedPriv = await wrapPrivateKey(kek, keyPair.privateKey)
  const publicKeyBytes = await exportPublicKey(keyPair.publicKey)

  await store.putUserKeyMaterial({
    user_id: userId,
    household_id: householdId,
    kdf_params: DEFAULT_KDF,
    kdf_salt: toBase64(salt),
    public_key: toBase64(publicKeyBytes),
    enc_private_key: toBase64(wrappedPriv.ciphertext),
    enc_private_key_nonce: toBase64(wrappedPriv.nonce),
  })

  const householdHasHdk = await store.householdHasHdk(householdId)
  if (householdHasHdk) {
    // A partner already holds the HDK; they must grant this member access.
    return { status: "pending-grant", vault: null }
  }

  // First member: mint the household data key and wrap it to ourselves.
  const hdk = await generateHdk()
  const vault = Vault._create(householdId, userId, hdk, keyPair.privateKey)
  await vault.grantAccessTo(store, userId)
  return { status: "ready", vault }
}

interface UnlockParams {
  store: VaultStore
  userId: string
  password: string
}

// Unlock an existing vault: re-derive the KEK from the password + stored salt,
// unwrap the private key, then unwrap the HDK from this user's wrap. Throws a
// typed VaultError the caller can branch on (wrong password vs. needs setup vs.
// awaiting a grant from a partner).
export async function unlockVault({ store, userId, password }: UnlockParams): Promise<Vault> {
  const km = await store.getUserKeyMaterial(userId)
  if (!km) throw new VaultError("no-key-material")

  const kek = await deriveKek(password, fromBase64(km.kdf_salt), km.kdf_params)
  let privateKey: CryptoKey
  try {
    privateKey = await unwrapPrivateKey(
      kek,
      fromBase64(km.enc_private_key_nonce),
      fromBase64(km.enc_private_key),
    )
  } catch {
    // AES-GCM tag failure on the wrapped private key means the wrong password.
    throw new VaultError("bad-password")
  }

  const wrap = await store.getHdkWrap(km.household_id, userId)
  if (!wrap) throw new VaultError("pending-grant")

  const hdk = await unwrapKeyWithPrivateKey(
    {
      ephemeralPublicKey: fromBase64(wrap.ephemeral_public_key),
      nonce: fromBase64(wrap.wrap_nonce),
      ciphertext: fromBase64(wrap.wrapped_hdk),
    },
    privateKey,
  )

  return Vault._create(km.household_id, userId, hdk, privateKey)
}

// Convenience guard for the login flow: does this user already have key material?
export async function hasKeyMaterial(store: VaultStore, userId: string): Promise<boolean> {
  return (await store.getUserKeyMaterial(userId)) !== null
}

export type { HdkWrapRow }
