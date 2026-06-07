// Pure mapping logic between Tricount registry entries and Quick Budget
// expenses. No I/O — unit-tested in mapping.test.ts, and safe to import from
// both the server sync engine (sync.ts) and the client mapping editor.

import type { TricountRegistryEntry } from "./types"

type Entry = TricountRegistryEntry["RegistryEntry"]

// Manual membership→user mapping stored on tricount_links.member_map.
// Keyed by Tricount membership id (string). Value = QB user id (counts toward
// the household share), or null (explicitly excluded — outsider). A membership
// ABSENT from the map is "unset": it is not counted and is surfaced in the UI
// as needing a decision. Mapping is always explicit — there is no name-based
// auto-match — so a member only contributes once a person has deliberately
// assigned them.
export type MemberMap = Record<string, string | null>

export interface HouseholdUser {
  id: string
  full_name: string | null
  email: string
}

export interface RegistryMember {
  id: number
  name: string
}

export type MemberStatus = "mapped" | "excluded" | "unset"

export interface ResolvedMember {
  id: number
  name: string
  userId: string | null // resolved QB user id when mapped, else null
  status: MemberStatus
}

/**
 * Resolve every registry member from the explicit manual map only. Returns the
 * per-member resolution (for the editor) and the set of membership ids that
 * count toward the household share (those explicitly mapped to a household
 * user). Members absent from the map are "unset" and never counted.
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
    let userId: string | null = null
    let status: MemberStatus
    if (Object.prototype.hasOwnProperty.call(manual, key)) {
      const v = manual[key]
      if (v && userIds.has(v)) {
        userId = v
        status = "mapped"
      } else {
        // null override, or a stale id pointing at a non-household user.
        status = "excluded"
      }
    } else {
      status = "unset"
    }
    resolved.push({ id: m.id, name: m.name, userId, status })
    if (status === "mapped") householdMemberIds.push(m.id)
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
