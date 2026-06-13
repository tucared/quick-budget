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

/**
 * The household's *signed* share of an entry, in cents — like
 * `householdShareCents` but preserving Tricount's sign so income and expenses
 * unify. Expense allocations are negative (consumption), income allocations are
 * positive (money received), so we negate: a NORMAL expense yields a positive
 * share (cash consumed), an INCOME entry a negative share (cash received). Used
 * only for owe/owed reconciliation — the mirrored budget expense keeps using the
 * absolute `householdShareCents`.
 */
export function signedHouseholdShareCents(
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
  // Normalize −0 → 0 so the signed value compares and stores cleanly.
  return cents === 0 ? 0 : -cents
}

/**
 * The *signed* cash flowing through the household for an entry, in cents: the
 * full entry amount when a household member is the payer (`membership_owned`),
 * else 0. Negated so it matches the share sign convention — a NORMAL expense
 * paid by the household is positive (cash out), an INCOME received by the
 * household is negative (cash in). The household's net balance on the entry is
 * `paid − share`: positive = owed to the household, negative = the household
 * owes.
 */
export function paidByHouseholdCents(
  entry: Entry,
  householdMemberIds: Set<number>
): number {
  const payerId = entry.membership_owned?.RegistryMembershipNonUser?.id
  if (payerId != null && householdMemberIds.has(payerId)) {
    return -parseDecimalToCents(entry.amount?.value ?? "0")
  }
  return 0
}

// Default IANA zone for resolving a Tricount entry's calendar date when a link
// carries no explicit timezone (and for the unit tests' implicit calls). Each
// link stores its own `timezone`; sync passes it through.
export const DEFAULT_TRICOUNT_TIME_ZONE = "Europe/Paris"

/**
 * Local calendar date (YYYY-MM-DD) for a Tricount entry timestamp like
 * "2026-06-07 13:33:31.295000", resolved in `timeZone`. Tricount serves the
 * timestamp in UTC with no zone in the payload, and its app renders each entry
 * in the device's local zone — so a naive slice keeps the UTC day and lands
 * evening/near-midnight entries on the wrong date. We parse the timestamp as UTC
 * and reformat the date in the household's chosen zone (`en-CA` → YYYY-MM-DD).
 * Date-only or unexpected input falls back to a plain slice.
 */
export function entryDateOnly(
  dateStr: string,
  timeZone: string = DEFAULT_TRICOUNT_TIME_ZONE
): string {
  const m = (dateStr ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return (dateStr ?? "").slice(0, 10)
  const utc = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`)
  if (Number.isNaN(utc.getTime())) return (dateStr ?? "").slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utc)
}

/**
 * Whether an entry should produce a Quick Budget expense at all: only ACTIVE,
 * NORMAL entries. BALANCE rows are member-to-member settlements (not spend),
 * and non-active rows are deletions to reconcile away. INCOME entries are
 * reconciled for owe/owed (see `isReconcilableEntry`) but never mirrored as
 * budget expenses — the app does not track income as spend.
 */
export function isSyncableEntry(entry: Entry): boolean {
  return entry.status === "ACTIVE" && entry.type_transaction === "NORMAL"
}

/**
 * Whether an entry counts toward the household's owe/owed reconciliation: ACTIVE
 * NORMAL expenses AND ACTIVE INCOME. BALANCE settlements stay excluded (settling
 * is out of scope). Superset of `isSyncableEntry`.
 */
export function isReconcilableEntry(entry: Entry): boolean {
  return (
    entry.status === "ACTIVE" &&
    (entry.type_transaction === "NORMAL" || entry.type_transaction === "INCOME")
  )
}

// Deterministic FNV-1a hash (hex) of the Tricount-derived fields that, when
// changed, should re-reconcile the entry. `shareCents` and `paidCents` are the
// *signed* reconciliation amounts, so a change to either the household's share
// or who paid is detected. The caller passes the raw Tricount description (the
// tricount title is surfaced as a UI tag, not stored on the row, so a rename
// needs no update); the EUR rate is intentionally excluded so day-to-day rate
// caching never triggers spurious updates.
export function contentHash(parts: {
  shareCents: number
  paidCents: number
  currency: string
  expenseDate: string
  description: string | null
}): string {
  const canonical = [
    parts.shareCents,
    parts.paidCents,
    parts.currency,
    parts.expenseDate,
    parts.description ?? "",
  ].join("|")
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
  householdMemberIds: Set<number>,
  timeZone: string = DEFAULT_TRICOUNT_TIME_ZONE
): MappedEntry | null {
  if (!isSyncableEntry(entry)) return null
  const expenseDate = entryDateOnly(entry.date, timeZone)
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

export interface ReconcileEntry {
  tricountEntryId: number
  entryDate: string
  currency: string
  description: string | null
  shareCents: number // signed household consumption (expense +, income −)
  paidCents: number // signed household cash flow (paid out +, received −)
}

/**
 * Map one registry entry to its owe/owed reconciliation record (signed share +
 * paid), covering NORMAL expenses and INCOME alike. Returns null when the entry
 * isn't reconcilable, has no valid date, or leaves the household with no stake
 * (neither consumed nor paid anything). Unlike `mapEntry`, this never filters on
 * a zero share — a household member paying an entry fully allocated to outsiders
 * still produces a balance.
 */
export function mapReconcileEntry(
  entry: Entry,
  householdMemberIds: Set<number>,
  timeZone: string = DEFAULT_TRICOUNT_TIME_ZONE
): ReconcileEntry | null {
  if (!isReconcilableEntry(entry)) return null
  const entryDate = entryDateOnly(entry.date, timeZone)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null
  const shareCents = signedHouseholdShareCents(entry, householdMemberIds)
  const paidCents = paidByHouseholdCents(entry, householdMemberIds)
  if (shareCents === 0 && paidCents === 0) return null
  return {
    tricountEntryId: entry.id,
    entryDate,
    currency: entry.amount?.currency ?? "EUR",
    description: entry.description ?? null,
    shareCents,
    paidCents,
  }
}
