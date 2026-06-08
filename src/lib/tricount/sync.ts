import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { fetchExchangeRate } from "@/lib/exchange-rate-api"
import { FALLBACK_RATES_TO_EUR } from "@/lib/currency"
import { fetchRegistry } from "./client"
import {
  resolveMembers,
  mapEntry,
  mapReconcileEntry,
  contentHash,
  type HouseholdUser,
  type MemberMap,
  type MappedEntry,
  type ReconcileEntry,
} from "./mapping"

type DB = SupabaseClient<Database>
type TricountLink = Database["public"]["Tables"]["tricount_links"]["Row"]

export interface SyncResult {
  title: string
  created: number
  updated: number
  deleted: number
  skipped: number
  unmatchedMembers: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Resolve currency → rate_to_eur for a date, reusing the exchange_rates cache
 * (and Frankfurter, with a hardcoded fallback) exactly like /api/exchange-rates.
 * `cache` memoizes within a single sync run to avoid duplicate lookups.
 */
async function getRateToEur(
  supabase: DB,
  currency: string,
  date: string,
  cache: Map<string, number>
): Promise<number> {
  if (currency === "EUR") return 1
  const key = `${currency}:${date}`
  const memo = cache.get(key)
  if (memo != null) return memo

  const { data: cached } = await supabase
    .from("exchange_rates")
    .select("rate_to_eur")
    .eq("currency", currency)
    .eq("rate_date", date)
    .maybeSingle()

  if (cached) {
    const rate = Number(cached.rate_to_eur)
    cache.set(key, rate)
    return rate
  }

  try {
    const rate = await fetchExchangeRate(currency, date)
    // Cache confirmed rates (best-effort; ignore insert races/errors).
    await supabase.from("exchange_rates").insert({ currency, rate_date: date, rate_to_eur: rate })
    cache.set(key, rate)
    return rate
  } catch {
    const rate = FALLBACK_RATES_TO_EUR[currency] ?? 1
    cache.set(key, rate)
    return rate
  }
}

/** Build the expense column values for a mapped entry at a resolved rate. */
function expenseFields(
  m: MappedEntry,
  description: string | null,
  rate: number,
  categoryId: string | null
) {
  const amount = round2(m.shareCents / 100)
  const convertedAmount = round2(amount * rate)
  return {
    amount,
    currency: m.currency,
    converted_amount: convertedAmount,
    converted_currency: "EUR",
    exchange_rate: rate,
    expense_date: m.expenseDate,
    description,
    category_id: categoryId,
    is_cash: false,
  }
}

/**
 * Reconcile one linked tricount into Quick Budget expenses.
 *
 * Pulls the full registry (all months), resolves each member to a household
 * user via the explicit `link.member_map` only (no name auto-match; members
 * absent from the map are uncounted), and upserts the tricount_entry_map ledger:
 * new entries are inserted, changed ones updated, and entries that disappeared
 * (deleted, became settlements, dropped to a zero household stake, or whose
 * member was un-mapped) removed. Every reconcilable entry — NORMAL expenses AND
 * INCOME — gets a ledger row carrying the signed owe/owed amounts (paid vs
 * consumed). NORMAL expenses with a non-zero household share also mirror a budget
 * expense in the shared Tricount category (the row's `expense_id`); INCOME is
 * reconciled for owe/owed only, never mirrored as spend (`expense_id` null). The
 * tricount title is surfaced as a read-only UI tag, not prefixed into the
 * description. Runs in the caller's session, so RLS scopes every write to their
 * household.
 */
export async function runSync(
  supabase: DB,
  opts: { userId: string; householdId: string; link: TricountLink }
): Promise<SyncResult> {
  const { userId, householdId, link } = opts

  const registry = await fetchRegistry(link.public_identifier_token)

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, full_name, email")
    .eq("household_id", householdId)
  if (usersError) throw new Error(`Failed to load household users: ${usersError.message}`)

  const manual = (link.member_map ?? {}) as MemberMap
  const { resolved, householdMemberIds } = resolveMembers(
    registry.members,
    (users ?? []) as HouseholdUser[],
    manual
  )
  const householdIdSet = new Set(householdMemberIds)
  // Members still awaiting an explicit decision (not counted until mapped).
  const unmatchedMembers = resolved.filter((r) => r.status === "unset").map((r) => r.name)

  // Desired state, keyed by tricount entry id. `rc` is the signed owe/owed
  // reconciliation record (covers NORMAL + INCOME); `exp` is the mirrored budget
  // expense, present only for NORMAL entries with a non-zero household share
  // (INCOME is reconciled but never mirrored as spend).
  const desired = new Map<
    number,
    { rc: ReconcileEntry; exp: MappedEntry | null; description: string | null; hash: string }
  >()
  for (const entry of registry.entries) {
    const rc = mapReconcileEntry(entry, householdIdSet)
    if (!rc) continue
    const exp = mapEntry(entry, householdIdSet)
    // The mirrored row's description is the raw entry description; the tricount
    // name is surfaced as a tag in the UI (not prefixed here).
    const description = rc.description
    const hash = contentHash({
      shareCents: rc.shareCents,
      paidCents: rc.paidCents,
      currency: rc.currency,
      expenseDate: rc.entryDate,
      description,
    })
    desired.set(rc.tricountEntryId, { rc, exp, description, hash })
  }

  // Current state from the idempotency ledger. `expense_id` is null for income
  // rows (reconciled, but not mirrored as an expense).
  const { data: existingRows, error: mapError } = await supabase
    .from("tricount_entry_map")
    .select("id, tricount_entry_id, expense_id, content_hash")
    .eq("link_id", link.id)
  if (mapError) throw new Error(`Failed to load sync map: ${mapError.message}`)

  const existing = new Map<
    number,
    { id: string; expense_id: string | null; content_hash: string }
  >()
  for (const r of existingRows ?? []) {
    existing.set(r.tricount_entry_id, {
      id: r.id,
      expense_id: r.expense_id,
      content_hash: r.content_hash,
    })
  }

  const rateCache = new Map<string, number>()
  let created = 0
  let updated = 0
  let deleted = 0
  let skipped = 0

  for (const [entryId, { rc, exp, description, hash }] of desired) {
    const prior = existing.get(entryId)

    if (prior && prior.content_hash === hash) {
      skipped++
      continue
    }

    const rate = await getRateToEur(supabase, rc.currency, rc.entryDate, rateCache)
    // Signed EUR reconciliation amounts, stored on the ledger row.
    const ledgerFields = {
      entry_date: rc.entryDate,
      paid_converted_amount: round2((rc.paidCents / 100) * rate),
      share_converted_amount: round2((rc.shareCents / 100) * rate),
      content_hash: hash,
    }

    if (prior) {
      // Changed entry — reconcile the mirrored expense to the desired presence.
      let expenseId = prior.expense_id
      if (exp) {
        const fields = expenseFields(exp, description, rate, link.default_category_id)
        if (expenseId) {
          const { error } = await supabase.from("expenses").update(fields).eq("id", expenseId)
          if (error) throw new Error(`Failed to update expense: ${error.message}`)
        } else {
          // Entry gained a budget expense (e.g. INCOME → NORMAL).
          expenseId = randomUUID()
          const { error } = await supabase.from("expenses").insert({
            id: expenseId,
            household_id: householdId,
            logged_by_user_id: userId,
            ...fields,
          })
          if (error) throw new Error(`Failed to insert expense: ${error.message}`)
        }
      } else if (expenseId) {
        // Entry lost its budget expense (e.g. NORMAL → INCOME). Deleting it
        // cascades the ledger row away, so we re-insert a fresh income-only row.
        const { error } = await supabase.from("expenses").delete().eq("id", expenseId)
        if (error) throw new Error(`Failed to delete expense: ${error.message}`)
        expenseId = null
      }

      if (prior.expense_id && !expenseId) {
        // The prior ledger row was cascaded away with its expense — re-create it.
        const { error } = await supabase.from("tricount_entry_map").insert({
          household_id: householdId,
          link_id: link.id,
          tricount_entry_id: entryId,
          expense_id: null,
          ...ledgerFields,
        })
        if (error) throw new Error(`Failed to insert sync map: ${error.message}`)
      } else {
        const { error } = await supabase
          .from("tricount_entry_map")
          .update({ expense_id: expenseId, ...ledgerFields })
          .eq("id", prior.id)
        if (error) throw new Error(`Failed to update sync map: ${error.message}`)
      }
      updated++
    } else {
      // New entry — insert the expense (NORMAL only), then claim it in the ledger.
      let expenseId: string | null = null
      if (exp) {
        expenseId = randomUUID()
        const fields = expenseFields(exp, description, rate, link.default_category_id)
        const { error: insErr } = await supabase.from("expenses").insert({
          id: expenseId,
          household_id: householdId,
          logged_by_user_id: userId,
          ...fields,
        })
        if (insErr) throw new Error(`Failed to insert expense: ${insErr.message}`)
      }

      const { error: mapInsErr } = await supabase.from("tricount_entry_map").insert({
        household_id: householdId,
        link_id: link.id,
        tricount_entry_id: entryId,
        expense_id: expenseId,
        ...ledgerFields,
      })
      if (mapInsErr) {
        // Likely a concurrent sync already claimed this entry — roll back any
        // orphan expense we just created so we don't leave a duplicate.
        if (expenseId) await supabase.from("expenses").delete().eq("id", expenseId)
        skipped++
        continue
      }
      created++
    }
  }

  // Reconcile removals: ledger entries no longer present in the desired set.
  for (const [entryId, prior] of existing) {
    if (desired.has(entryId)) continue
    if (prior.expense_id) {
      // Deleting the expense cascades the map row away (FK ON DELETE CASCADE).
      const { error: delErr } = await supabase.from("expenses").delete().eq("id", prior.expense_id)
      if (delErr) throw new Error(`Failed to delete expense: ${delErr.message}`)
    } else {
      // Income row — no expense to cascade, drop the ledger row directly.
      const { error: delErr } = await supabase
        .from("tricount_entry_map")
        .delete()
        .eq("id", prior.id)
      if (delErr) throw new Error(`Failed to delete sync map: ${delErr.message}`)
    }
    deleted++
  }

  // Refresh cached title + member list (for the mapping editor) and timestamp.
  // member_map is left untouched so manual overrides persist.
  await supabase
    .from("tricount_links")
    .update({
      title: registry.title,
      members: registry.members,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", link.id)

  return { title: registry.title, created, updated, deleted, skipped, unmatchedMembers }
}

/** Reconcile every *active* tricount linked to a household (paused ones are skipped). */
// Auto-sync (on app load) skips a link that was reconciled this recently, so a
// session reload — or the other partner opening the app moments later — doesn't
// re-hit Tricount's undocumented API. `last_synced_at` is server-side on the
// link row, so the throttle dedupes across both partners and all tabs/devices.
// Manual "Sync"/"Sync all" pass auto=false and always force a fresh pull.
export const AUTO_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000

export type LinkSyncOutcome = {
  linkId: string
  title: string
  result?: SyncResult
  error?: string
  throttled?: boolean
}

export async function runSyncAll(
  supabase: DB,
  opts: { userId: string; householdId: string; auto?: boolean }
): Promise<LinkSyncOutcome[]> {
  const { data: links, error } = await supabase
    .from("tricount_links")
    .select("*")
    .eq("household_id", opts.householdId)
    .eq("is_active", true)
  if (error) throw new Error(`Failed to load tricount links: ${error.message}`)

  const out: LinkSyncOutcome[] = []
  for (const link of links ?? []) {
    if (opts.auto && link.last_synced_at) {
      const age = Date.now() - new Date(link.last_synced_at).getTime()
      if (age >= 0 && age < AUTO_SYNC_MIN_INTERVAL_MS) {
        out.push({ linkId: link.id, title: link.title ?? "tricount", throttled: true })
        continue
      }
    }
    try {
      const result = await runSync(supabase, { userId: opts.userId, householdId: opts.householdId, link })
      out.push({ linkId: link.id, title: result.title, result })
    } catch (e) {
      out.push({
        linkId: link.id,
        title: link.title ?? "tricount",
        error: e instanceof Error ? e.message : "Sync failed",
      })
    }
  }
  return out
}
