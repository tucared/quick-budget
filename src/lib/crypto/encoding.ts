// Byte / string / base64 / JSON encoding helpers shared by the crypto modules.
//
// Kept dependency-free (no imports) so both `primitives.ts` and `codec.ts` can
// depend on it without an import cycle. Isomorphic: relies only on TextEncoder,
// TextDecoder, btoa, atob — all available in Node 24 and the browser.

// WebCrypto's `BufferSource` requires ArrayBuffer-backed views (not the wider
// `ArrayBufferLike` that `Uint8Array` now defaults to). Standardizing the crypto
// modules on this alias keeps every byte string assignable at the
// `crypto.subtle.*` boundary without per-call casts.
export type Bytes = Uint8Array<ArrayBuffer>

export function encodeUtf8(text: string): Bytes {
  // TextEncoder always allocates a fresh ArrayBuffer-backed view at runtime.
  return new TextEncoder().encode(text) as Bytes
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

// Deterministic JSON: object keys sorted recursively so a given value always
// serializes to the same string. Used for the field blob plaintext and for
// building AAD, so encrypt/decrypt agree byte-for-byte regardless of key order.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) sorted[key] = sortKeysDeep(obj[key])
    return sorted
  }
  return value
}
