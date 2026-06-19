// Client-side encryption seam for expense rows (M5 vertical slice). Wraps the
// generic vault codec with the expenses-specific sealed field set and the
// dual-write / plaintext-fallback policy, so the form, edit dialog, and every
// read path share one definition of "what's encrypted and how to resolve it".
//
// Dual-write phase: writes store BOTH the plaintext columns AND `enc_blob`, and
// reads prefer the decrypted blob when the vault is unlocked and a blob exists,
// else fall back to plaintext. This keeps the app working for not-yet-encrypted
// rows (Tricount-synced rows, legacy rows pre-backfill) and for a locked vault.
// The admin-blind flip (stop writing plaintext, backfill+null existing rows) is
// a later, deliberate step.

import type { Expense } from "@/lib/types"
import { type StoredBlob, type Vault } from "@/lib/crypto"

const TABLE = "expenses"

// The sensitive fields sealed into `expenses.enc_blob`. Currently the free-text
// description; amounts join this set in a later milestone (which is why it's a
// record, not a bare string).
export interface SealedExpenseFields {
  description: string | null
}

// Just the columns the read-side resolver needs. `enc_blob` is `unknown` (the
// DB types it as `Json | null`) so the resolver accepts both real rows and the
// narrowed test shape; `parseStoredBlob` validates it.
export interface DecryptableExpense {
  id: Expense["id"]
  description: Expense["description"]
  enc_blob: unknown
}

// Narrow an `enc_blob` JSON value to a usable StoredBlob, or null when it's
// absent/malformed (treated as "not encrypted" → plaintext fallback).
export function parseStoredBlob(value: unknown): StoredBlob | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (typeof v.v === "number" && typeof v.nonce === "string" && typeof v.ct === "string") {
    return { v: v.v, nonce: v.nonce, ct: v.ct }
  }
  return null
}

/**
 * Seal an expense's sensitive fields for storage in `enc_blob`. Returns null
 * when there's no unlocked vault — the caller then writes plaintext only
 * (pre-encryption / locked-vault fallback). The row `id` must be the one the row
 * will actually have (minted client-side before insert) so the AAD pins the blob
 * to it.
 */
export async function sealExpenseFields(
  vault: Vault | null,
  id: string,
  fields: SealedExpenseFields,
): Promise<StoredBlob | null> {
  if (!vault) return null
  return vault.encryptRow(TABLE, id, fields as unknown as Record<string, unknown>)
}

/**
 * Resolve a row's effective description: the decrypted `enc_blob` value when the
 * vault is unlocked and a valid blob is present, otherwise the plaintext column.
 * A decryption failure (tampered blob, wrong key, version mismatch) also falls
 * back to plaintext rather than throwing, so one bad row never blanks the list.
 */
export async function resolveExpenseDescription(
  vault: Vault | null,
  row: DecryptableExpense,
): Promise<string | null> {
  const blob = parseStoredBlob(row.enc_blob)
  if (vault && blob) {
    try {
      const fields = await vault.decryptRow<SealedExpenseFields>(TABLE, row.id, blob)
      return fields.description ?? null
    } catch {
      return row.description ?? null
    }
  }
  return row.description ?? null
}

/**
 * Batch resolver for a list of rows → a map of `id → resolved description`.
 * Rows decrypt independently and concurrently; a per-row failure falls back to
 * plaintext (handled in `resolveExpenseDescription`).
 */
export async function resolveExpenseDescriptions(
  vault: Vault | null,
  rows: DecryptableExpense[],
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    rows.map(async (row) => [row.id, await resolveExpenseDescription(vault, row)] as const),
  )
  return new Map(entries)
}
