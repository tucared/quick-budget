// Pure mapping logic between Tricount registry entries and Quick Budget
// expenses. No I/O — unit-tested in mapping.test.ts. The sync engine
// (sync.ts) layers currency conversion and persistence on top.

import type { TricountRegistryEntry } from "./types"

type Entry = TricountRegistryEntry["RegistryEntry"]

export interface HouseholdUser {
  id: string
  full_name: string | null
  email: string
}

export interface RegistryMember {
  id: number
  name: string
}

/** Lowercase, trim, collapse internal whitespace — for tolerant name matching. */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Match Tricount members to Quick Budget household users by display name,
 * falling back to the email local-part. Returns the member→user map (keyed by
 * Tricount membership id as a string, for JSON storage), the set of Tricount
 * membership ids that belong to the household, and the names of members with
 * no household match (outsiders — their shares are excluded from spend).
 */
export function matchMembers(
  members: RegistryMember[],
  users: HouseholdUser[]
): {
  memberMap: Record<string, string>
  householdMemberIds: number[]
  unmatched: string[]
} {
  const byName = new Map<string, string>()
  for (const u of users) {
    if (u.full_name) byName.set(normalizeName(u.full_name), u.id)
    const local = u.email.split("@")[0]
    if (local && !byName.has(normalizeName(local))) {
      byName.set(normalizeName(local), u.id)
    }
  }

  const memberMap: Record<string, string> = {}
  const householdMemberIds: number[] = []
  const unmatched: string[] = []

  for (const m of members) {
    const userId = byName.get(normalizeName(m.name))
    if (userId) {
      memberMap[String(m.id)] = userId
      householdMemberIds.push(m.id)
    } else {
      unmatched.push(m.name)
    }
  }

  return { memberMap, householdMemberIds, unmatched }
}

/**
 * Parse a Tricount decimal string ("-74.00", "12.5", "30") to integer cents.
 * Avoids float drift by working on the string. Returns 0 for unparseable input.
 */
export function parseDecimalToCents(value: string): number {
  const m = value.trim().match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!m) return 0
  const sign = m[1] === "-" ? -1 : 1
  const whole = m[2]
  const frac = (m[3] ?? "").padEnd(2, "0").slice(0, 2)
  return sign * (parseInt(whole, 10) * 100 + parseInt(frac || "0", 10))
}

/**
 * The household's share of an entry, in absolute cents: the sum of allocation
 * amounts whose membership maps to a household member. Allocations are stored
 * negative (money owed/spent); we return the absolute value.
 */
export function householdShareCents(
  entry: Entry,
  householdMemberIds: Set<number>
): number {
  let cents = 0
  for (const alloc of entry.allocations ?? []) {
    const mid = alloc.membership?.RegistryMembershipNonUser?.id
    if (mid != null && householdMemberIds.has(mid)) {
      cents += parseDecimalToCents(alloc.amount.value)
    }
  }
  return Math.abs(cents)
}

/** Date-only (YYYY-MM-DD) from a Tricount timestamp like "2026-06-07 13:33:31.295". */
export function entryDateOnly(dateStr: string): string {
  return (dateStr ?? "").slice(0, 10)
}

/**
 * Whether an entry should produce a Quick Budget expense at all: only ACTIVE,
 * NORMAL entries. BALANCE rows are member-to-member settlements (not spend),
 * and non-active rows are deletions to reconcile away.
 */
export function isSyncableEntry(entry: Entry): boolean {
  return entry.status === "ACTIVE" && entry.type_transaction === "NORMAL"
}

// Deterministic FNV-1a hash (hex) of the Tricount-derived fields that, when
// changed, should update the mirrored expense. Excludes the EUR exchange rate
// so day-to-day rate caching never triggers spurious updates.
export function contentHash(parts: {
  shareCents: number
  currency: string
  expenseDate: string
  description: string | null
}): string {
  const canonical = [
    parts.shareCents,
    parts.currency,
    parts.expenseDate,
    parts.description ?? "",
  ].join("")
  let h = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

export interface MappedEntry {
  tricountEntryId: number
  shareCents: number
  currency: string
  expenseDate: string
  description: string | null
  hash: string
}

/**
 * Map one registry entry to the household-share fields needed for an expense,
 * or null when the entry shouldn't be synced (non-syncable, no date, or zero
 * household share — e.g. fully allocated to outsiders).
 */
export function mapEntry(
  entry: Entry,
  householdMemberIds: Set<number>
): MappedEntry | null {
  if (!isSyncableEntry(entry)) return null
  const expenseDate = entryDateOnly(entry.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return null
  const shareCents = householdShareCents(entry, householdMemberIds)
  if (shareCents === 0) return null
  const currency = entry.amount?.currency ?? "EUR"
  const description = entry.description ?? null
  return {
    tricountEntryId: entry.id,
    shareCents,
    currency,
    expenseDate,
    description,
    hash: contentHash({ shareCents, currency, expenseDate, description }),
  }
}
