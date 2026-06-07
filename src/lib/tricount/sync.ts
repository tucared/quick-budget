import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { fetchExchangeRate } from "@/lib/exchange-rate-api"
import { FALLBACK_RATES_TO_EUR } from "@/lib/currency"
import { fetchRegistry } from "./client"
import { matchMembers, mapEntry, type HouseholdUser, type MappedEntry } from "./mapping"

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
function expenseFields(m: MappedEntry, rate: number, categoryId: string | null) {
  const amount = round2(m.shareCents / 100)
  const convertedAmount = round2(amount * rate)
  return {
    amount,
    currency: m.currency,
    converted_amount: convertedAmount,
    converted_currency: "EUR",
    exchange_rate: rate,
    expense_date: m.expenseDate,
    description: m.description,
    category_id: categoryId,
    is_cash: false,
  }
}

/**
 * Reconcile a household's linked tricount into Quick Budget expenses.
 *
 * Pulls the full registry (all months), computes each entry's household share,
 * and upserts one expense per entry via the tricount_entry_map idempotency
 * ledger: new entries are inserted, changed ones updated, and entries that
 * disappeared (deleted, became settlements, or dropped to a zero household
 * share) have their mirrored expense removed. Runs in the caller's session, so
 * RLS scopes every write to their household.
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

  const { memberMap, householdMemberIds, unmatched } = matchMembers(
    registry.members,
    (users ?? []) as HouseholdUser[]
  )
  const householdIdSet = new Set(householdMemberIds)

  // Desired state: tricountEntryId -> mapped fields.
  const desired = new Map<number, MappedEntry>()
  for (const entry of registry.entries) {
    const m = mapEntry(entry, householdIdSet)
    if (m) desired.set(m.tricountEntryId, m)
  }

  // Current state from the idempotency ledger.
  const { data: existingRows, error: mapError } = await supabase
    .from("tricount_entry_map")
    .select("id, tricount_entry_id, expense_id, content_hash")
    .eq("link_id", link.id)
  if (mapError) throw new Error(`Failed to load sync map: ${mapError.message}`)

  const existing = new Map<number, { id: string; expense_id: string; content_hash: string }>()
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

  for (const [entryId, m] of desired) {
    const prior = existing.get(entryId)

    if (prior && prior.content_hash === m.hash) {
      skipped++
      continue
    }

    const rate = await getRateToEur(supabase, m.currency, m.expenseDate, rateCache)
    const fields = expenseFields(m, rate, link.default_category_id)

    if (prior) {
      // Changed entry — update the mirrored expense in place.
      const { error: updErr } = await supabase
        .from("expenses")
        .update(fields)
        .eq("id", prior.expense_id)
      if (updErr) throw new Error(`Failed to update expense: ${updErr.message}`)

      const { error: mapUpdErr } = await supabase
        .from("tricount_entry_map")
        .update({ content_hash: m.hash })
        .eq("id", prior.id)
      if (mapUpdErr) throw new Error(`Failed to update sync map: ${mapUpdErr.message}`)
      updated++
    } else {
      // New entry — insert expense, then claim it in the ledger.
      const expenseId = randomUUID()
      const { error: insErr } = await supabase.from("expenses").insert({
        id: expenseId,
        household_id: householdId,
        logged_by_user_id: userId,
        ...fields,
      })
      if (insErr) throw new Error(`Failed to insert expense: ${insErr.message}`)

      const { error: mapInsErr } = await supabase.from("tricount_entry_map").insert({
        household_id: householdId,
        link_id: link.id,
        tricount_entry_id: entryId,
        expense_id: expenseId,
        content_hash: m.hash,
      })
      if (mapInsErr) {
        // Likely a concurrent sync already claimed this entry — roll back the
        // orphan expense we just created so we don't leave a duplicate.
        await supabase.from("expenses").delete().eq("id", expenseId)
        skipped++
        continue
      }
      created++
    }
  }

  // Reconcile removals: ledger entries no longer present in the registry.
  for (const [entryId, prior] of existing) {
    if (desired.has(entryId)) continue
    // Deleting the expense cascades the map row away (FK ON DELETE CASCADE).
    const { error: delErr } = await supabase.from("expenses").delete().eq("id", prior.expense_id)
    if (delErr) throw new Error(`Failed to delete expense: ${delErr.message}`)
    deleted++
  }

  await supabase
    .from("tricount_links")
    .update({
      title: registry.title,
      member_map: memberMap,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", link.id)

  return { title: registry.title, created, updated, deleted, skipped, unmatchedMembers: unmatched }
}
