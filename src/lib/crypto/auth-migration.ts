// Idempotent auth-cutover orchestration (M3a). Establishes a user's E2E key
// material and re-keys their GoTrue password to the KDF-derived auth secret.
// Pure given a `VaultStore` + a re-key callback, so it is unit-tested against an
// in-memory store with real WebCrypto (`auth-migration.test.ts`) — the Supabase
// glue lives in `src/lib/auth/vault-auth.ts`.
//
// Background (DATA_MODEL #10): existing users hold their *raw* password in
// GoTrue and have no key material. The cutover to `deriveAuthSecret` must be
// non-breaking — a legacy login (raw-password fallback succeeds) runs this once
// to set up the vault and swap the stored password. It is safe to call on every
// legacy-path login: it converges even if a previous attempt failed partway.

import { hasKeyMaterial, setupVault } from "./vault"
import type { VaultStore } from "./vault-repo"

export interface EnsureVaultAuthParams {
  store: VaultStore
  userId: string
  householdId: string
  // The user's real password (used to derive the KEK during first-time setup).
  password: string
  // Precomputed deriveAuthSecret(password, email) — what GoTrue should store.
  authSecret: string
  // Swaps the stored GoTrue password to `authSecret`. Throws on failure.
  reKeyPassword: (authSecret: string) => Promise<void>
}

export interface EnsureVaultAuthResult {
  // "existing" when key material was already present (re-key only).
  setupStatus: "ready" | "pending-grant" | "existing"
}

export async function ensureVaultAuth({
  store,
  userId,
  householdId,
  password,
  authSecret,
  reKeyPassword,
}: EnsureVaultAuthParams): Promise<EnsureVaultAuthResult> {
  let setupStatus: EnsureVaultAuthResult["setupStatus"]
  if (await hasKeyMaterial(store, userId)) {
    setupStatus = "existing"
  } else {
    // First-time: mint key material. First household member mints + self-wraps
    // the HDK ("ready"); a joining member publishes their keys but waits for a
    // partner to grant access ("pending-grant"). Either way the vault is
    // established; nothing here is load-bearing until data columns are encrypted.
    const res = await setupVault({ store, userId, householdId, password })
    setupStatus = res.status
  }

  // Re-key last: if setup succeeded but this throws, the next legacy login finds
  // key material already present and only retries the re-key. Converges.
  await reKeyPassword(authSecret)

  return { setupStatus }
}
