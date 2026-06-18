// Persistence seam for the stateful vault (M2). The vault orchestration in
// `vault.ts` is written against the `VaultStore` interface so it can be unit-
// tested with an in-memory store (no DB, real WebCrypto) — the same pure-logic-
// island approach used elsewhere. `createSupabaseVaultStore` is the production
// implementation backed by the two M1 tables (`user_key_material`,
// `household_hdk_wrap`), all columns base64 TEXT to match the row-blob codec.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { KdfParams } from "./types"

// Row shape of `user_key_material` (decision: E2E key material). Mirrors the DB
// columns; all binary fields are base64 TEXT.
export interface UserKeyMaterialRow {
  user_id: string
  household_id: string
  kdf_params: KdfParams
  kdf_salt: string
  public_key: string
  enc_private_key: string
  enc_private_key_nonce: string
}

// Row shape of `household_hdk_wrap`: the shared HDK wrapped to one member's
// public key (ECIES). `wrap_scheme` defaults at the DB level.
export interface HdkWrapRow {
  household_id: string
  user_id: string
  ephemeral_public_key: string
  wrapped_hdk: string
  wrap_nonce: string
  wrap_scheme?: string
}

// The only IO the vault needs. Kept deliberately narrow so the orchestration is
// testable against an in-memory fake and the Supabase binding stays thin.
export interface VaultStore {
  getUserKeyMaterial(userId: string): Promise<UserKeyMaterialRow | null>
  putUserKeyMaterial(row: UserKeyMaterialRow): Promise<void>
  // True when *any* member of the household already holds an HDK wrap — i.e. the
  // household data key exists and this user is a joining member, not the first.
  householdHasHdk(householdId: string): Promise<boolean>
  getHdkWrap(householdId: string, userId: string): Promise<HdkWrapRow | null>
  putHdkWrap(row: HdkWrapRow): Promise<void>
  // A member's published ECDH public key (base64 spki), used to wrap the HDK to
  // them when granting access. Null when they haven't set up key material yet.
  getPublicKey(householdId: string, userId: string): Promise<string | null>
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

// Untyped client is fine here: these tables are addressed by name and the row
// shapes are validated by the interfaces above. RLS scopes every read/write to
// the caller's own household.
export function createSupabaseVaultStore(supabase: SupabaseClient): VaultStore {
  return {
    async getUserKeyMaterial(userId) {
      const { data, error } = await supabase
        .from("user_key_material")
        .select("user_id, household_id, kdf_params, kdf_salt, public_key, enc_private_key, enc_private_key_nonce")
        .eq("user_id", userId)
        .maybeSingle()
      if (error) throw error
      return (data as UserKeyMaterialRow | null) ?? null
    },

    async putUserKeyMaterial(row) {
      const { error } = await supabase
        .from("user_key_material")
        .upsert(row, { onConflict: "user_id" })
      if (error) throw error
    },

    async householdHasHdk(householdId) {
      const { count, error } = await supabase
        .from("household_hdk_wrap")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
      if (error) throw error
      return (count ?? 0) > 0
    },

    async getHdkWrap(householdId, userId) {
      const { data, error } = await supabase
        .from("household_hdk_wrap")
        .select("household_id, user_id, ephemeral_public_key, wrapped_hdk, wrap_nonce, wrap_scheme")
        .eq("household_id", householdId)
        .eq("user_id", userId)
        .maybeSingle()
      if (error) throw error
      return (data as HdkWrapRow | null) ?? null
    },

    async putHdkWrap(row) {
      const { error } = await supabase
        .from("household_hdk_wrap")
        .upsert(row, { onConflict: "household_id,user_id" })
      if (error) throw error
    },

    async getPublicKey(householdId, userId) {
      const { data, error } = await supabase
        .from("user_key_material")
        .select("public_key")
        .eq("household_id", householdId)
        .eq("user_id", userId)
        .maybeSingle()
      if (error) throw error
      return (data as { public_key: string } | null)?.public_key ?? null
    },
  }
}
