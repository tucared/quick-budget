// Pure mapping logic between Tricount registry entries and Quick Budget
// expenses. No I/O — unit-tested in mapping.test.ts, and safe to import from
// both the server sync engine (sync.ts) and the client mapping editor.

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

// Manual membership→user overrides stored on tricount_links.member_map.
// Keyed by Tricount membership id (string). Value = QB user id, or null to
// force "exclude" (treat as outsider). A membership absent from the map is
// auto-matched by name, so renames self-heal while explicit picks persist.
export type MemberMap = Record<string, string | null>

/** Lowercase, trim, collapse internal whitespace — for tolerant name matching. */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Index household users by normalized full name and email local-part. */
function userNameIndex(users: HouseholdUser[]): Map<string, string> {
  const byName = new Map<string, string>()
  for (const u of users) {
    if (u.full_name) byName.set(normalizeName(u.full_name), u.id)
    const local = u.email.split("@")[0]
    if (local && !byName.has(normalizeName(local))) {
      byName.set(normalizeName(local), u.id)
    }
  }
  return byName
}

/** Auto-match a Tricount member name to a household user id, or null if none. */
export function autoMatchUserId(name: string, users: HouseholdUser[]): string | null {
  return userNameIndex(users).get(normalizeName(name)) ?? null
}

export interface ResolvedMember {
  id: number
  name: string
  userId: string | null // resolved QB user id, or null = excluded (outsider)
  source: "manual" | "auto"
}

/**
 * Resolve every registry member to a household user (or excluded), applying
 * manual overrides first and falling back to name auto-match. Returns the
 * per-member resolution (for the editor) and the set of membership ids that
 * count toward the household share (those mapped to a valid household user).
 */
export function resolveMembers(
  members: RegistryMember[],
  users: HouseholdUser[],
  manual: MemberMap
): { resolved: ResolvedMember[]; householdMemberIds: number[] } {
  const userIds = new Set(users.map((u) => u.id))
  const resolved: ResolvedMember[] = []
  const householdMemberIds: number[] = []

  for (const m of members) {
    const key = String(m.id)
    let userId: string | null
    let source: "manual" | "auto"
    if (Object.prototype.hasOwnProperty.call(manual, key)) {
      userId = manual[key]
      source = "manual"
    } else {
      userId = autoMatchUserId(m.name, users)
      source = "auto"
    }
    // Guard against stale overrides pointing at a user no longer in the household.
    if (userId && !userIds.has(userId)) userId = null
    resolved.push({ id: m.id, name: m.name, userId, source })
    if (userId) householdMemberIds.push(m.id)
  }

  return { resolved, householdMemberIds }
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

// Deterministic FNV-1a hash (hex) of the fields that, when changed, should
// update the mirrored expense. The caller passes the *final* (title-prefixed)
// description so a tricount rename propagates; the EUR rate is intentionally
// excluded so day-to-day rate caching never triggers spurious updates.
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
  ].join("")
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
  description: string | null // raw Tricount description (title prefix added in sync)
}

/**
 * Map one registry entry to the household-share fields, or null when the entry
 * shouldn't be synced (non-syncable, no date, or zero household share — e.g.
 * fully allocated to outsiders).
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
  return {
    tricountEntryId: entry.id,
    shareCents,
    currency: entry.amount?.currency ?? "EUR",
    expenseDate,
    description: entry.description ?? null,
  }
}

/**
 * Compose the stored expense description: the tricount title prefixes the raw
 * entry description so all tricounts can share one category yet stay readable.
 */
export function composeDescription(title: string | null, raw: string | null): string | null {
  const t = (title ?? "").trim()
  const r = (raw ?? "").trim()
  if (!t) return r || null
  return r ? `${t} · ${r}` : t
}
