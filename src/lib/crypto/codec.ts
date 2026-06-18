// Field-blob codec: turns a row's sensitive fields into the storable
// `enc_data`/`enc_nonce` shape and back, binding each blob to its row via AAD.
// Pure given the HDK — the stateful vault (M2) calls these with the in-memory
// key, but they are unit-testable on their own.

import { aesGcmDecrypt, aesGcmEncrypt } from "./primitives"
import {
  canonicalJson,
  decodeUtf8,
  encodeUtf8,
  fromBase64,
  toBase64,
  type Bytes,
} from "./encoding"
import type { AadParts, StoredBlob } from "./types"

// Bump when the field set / blob format changes. Bound into the AAD and stored
// on each blob so old rows decrypt with the version they were written under.
export const BLOB_SCHEMA_VERSION = 1

// Additional Authenticated Data pins ciphertext to (table, row id, household,
// version). Decryption with mismatched parts fails the GCM tag check, so the
// admin cannot move a blob between rows or tables.
export function buildAad(parts: AadParts): Bytes {
  return encodeUtf8(
    canonicalJson({
      t: parts.table,
      id: parts.id,
      h: parts.householdId,
      v: parts.v ?? BLOB_SCHEMA_VERSION,
    }),
  )
}

export async function encryptFields(
  hdk: CryptoKey,
  parts: AadParts,
  fields: Record<string, unknown>,
): Promise<StoredBlob> {
  const v = parts.v ?? BLOB_SCHEMA_VERSION
  const aad = buildAad({ ...parts, v })
  const plaintext = encodeUtf8(canonicalJson(fields))
  const { nonce, ciphertext } = await aesGcmEncrypt(hdk, plaintext, aad)
  return { v, nonce: toBase64(nonce), ct: toBase64(ciphertext) }
}

export async function decryptFields<T = Record<string, unknown>>(
  hdk: CryptoKey,
  parts: AadParts,
  blob: StoredBlob,
): Promise<T> {
  const aad = buildAad({ ...parts, v: blob.v })
  const plaintext = await aesGcmDecrypt(hdk, fromBase64(blob.nonce), fromBase64(blob.ct), aad)
  return JSON.parse(decodeUtf8(plaintext)) as T
}
