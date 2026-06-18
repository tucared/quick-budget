// Client-side auth glue for the E2E vault cutover (M3a). Wraps Supabase auth so
// the app authenticates with the KDF-derived auth secret instead of the raw
// password, while remaining non-breaking for existing (legacy) accounts.
//
// Login flow: try derived-auth; on failure fall back once to the raw password.
// A successful raw login means a legacy account — sign-in stands, and we run the
// idempotent `ensureVaultAuth` migration (establish key material + re-key GoTrue
// to the derived secret). The migration is best-effort: it never blocks login,
// because a failure simply retries on the next login (derived-auth fails again →
// raw fallback → here). Once an account is migrated, derived-auth succeeds and
// the raw fallback is never taken.

import type { SupabaseClient } from "@supabase/supabase-js"
import { decodeJwtClaim } from "@/lib/jwt-claim"
import {
  createSupabaseVaultStore,
  deriveAuthSecret,
  ensureVaultAuth,
  grantPendingMembers,
  hasKeyMaterial,
  setupVault,
} from "@/lib/crypto"

export type VaultSignInResult =
  | { ok: true; legacy: boolean }
  | { ok: false; reason: "invalid" | "network" }

export async function signInWithVaultAuth(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<VaultSignInResult> {
  const authSecret = await deriveAuthSecret(password, email)

  const derived = await supabase.auth.signInWithPassword({ email, password: authSecret })
  if (!derived.error) {
    await runAutoGrant(supabase, password)
    return { ok: true, legacy: false }
  }

  // Derived-auth failed: either a legacy account (GoTrue still holds the raw
  // password) or genuinely wrong credentials. Try the raw password once.
  const raw = await supabase.auth.signInWithPassword({ email, password })
  if (!raw.error) {
    try {
      await migrateLegacyLogin(supabase, email, password, authSecret)
    } catch (err) {
      // Best-effort — never block login on migration failure; it converges on a
      // later login. Surface it (the error carries no secrets) so a half-migrated
      // account is observable rather than failing silently.
      console.warn("Vault auth migration deferred to a later login:", err)
    }
    await runAutoGrant(supabase, password)
    return { ok: true, legacy: true }
  }

  const isNetwork = (raw.error.message ?? "").toLowerCase().includes("fetch")
  return { ok: false, reason: isNetwork ? "network" : "invalid" }
}

async function migrateLegacyLogin(
  supabase: SupabaseClient,
  email: string,
  password: string,
  authSecret: string,
): Promise<void> {
  const { user, householdId } = await currentUserAndHousehold(supabase)
  // Without a verified household claim we can't set up the vault safely; leave
  // the account legacy and retry next login (the auth hook must be enabled).
  if (!user || !householdId) return

  const store = createSupabaseVaultStore(supabase)
  await ensureVaultAuth({
    store,
    userId: user.id,
    householdId,
    password,
    authSecret,
    reKeyPassword: async (secret) => {
      const { error } = await supabase.auth.updateUser({ password: secret })
      if (error) throw error
    },
  })
}

// After a successful sign-in, wrap the HDK to any household partner who set up
// after this member (so their vault unlocks on their next login). Best-effort
// and cheap: it only derives the KEK when there is actually someone to grant,
// and never affects the login outcome.
async function runAutoGrant(supabase: SupabaseClient, password: string): Promise<void> {
  try {
    const { user, householdId } = await currentUserAndHousehold(supabase)
    if (!user || !householdId) return
    const store = createSupabaseVaultStore(supabase)
    await grantPendingMembers({ store, householdId, granterUserId: user.id, password })
  } catch (err) {
    // Best-effort — a partner simply gets granted on a later login. Surfaced
    // (no secrets in the error) rather than swallowed silently.
    console.warn("Partner auto-grant deferred to a later login:", err)
  }
}

// Used by the set-password (recovery / onboarding) flow so a freshly set
// password is stored as its derived auth secret and, for a first-time user,
// establishes their vault. A true password *reset* for a user who already has
// key material needs keypair regeneration + partner re-grant (DATA_MODEL #10);
// that is deferred to the vault-provider milestone, so here we only set up when
// no key material exists yet.
export async function setPasswordWithVaultAuth(
  supabase: SupabaseClient,
  newPassword: string,
): Promise<{ error: { message?: string } | null }> {
  const { user, householdId } = await currentUserAndHousehold(supabase)
  if (!user?.email) return { error: { message: "No authenticated user" } }

  const authSecret = await deriveAuthSecret(newPassword, user.email)
  const { error } = await supabase.auth.updateUser({ password: authSecret })
  if (error) return { error }

  if (householdId) {
    const store = createSupabaseVaultStore(supabase)
    if (!(await hasKeyMaterial(store, user.id))) {
      await setupVault({ store, userId: user.id, householdId, password: newPassword })
    }
  }
  return { error: null }
}

async function currentUserAndHousehold(supabase: SupabaseClient): Promise<{
  user: { id: string; email?: string } | null
  householdId: string | null
}> {
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  const user = userData.user
  const householdId = decodeJwtClaim(sessionData.session?.access_token, [
    "app_metadata",
    "household_id",
  ])
  return {
    user: user ? { id: user.id, email: user.email } : null,
    householdId,
  }
}
