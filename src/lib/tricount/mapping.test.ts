import { describe, it, expect } from "vitest"
import {
  normalizeName,
  autoMatchUserId,
  resolveMembers,
  parseDecimalToCents,
  householdShareCents,
  entryDateOnly,
  isSyncableEntry,
  contentHash,
  mapEntry,
  composeDescription,
  type HouseholdUser,
  type RegistryMember,
} from "./mapping"
import type { TricountRegistryEntry } from "./types"

type Entry = TricountRegistryEntry["RegistryEntry"]

const USERS: HouseholdUser[] = [
  { id: "u1", full_name: "User One", email: "user1@example.com" },
  { id: "u2", full_name: "User Two", email: "user2@example.com" },
]

const MEMBERS: RegistryMember[] = [
  { id: 1, name: "User one" }, // matches User One (case-insensitive)
  { id: 2, name: "User two" }, // matches User Two
  { id: 3, name: "Other User" }, // outsider
]

function alloc(memberId: number, value: string) {
  return {
    amount: { currency: "EUR", value },
    membership: { RegistryMembershipNonUser: { id: memberId, uuid: "x", alias: { pointer: { type: "UUID", value: "x", name: "n" } } } },
  }
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 999,
    uuid: "e",
    status: "ACTIVE",
    amount: { currency: "EUR", value: "-222.00" },
    description: "Test Expense",
    type: "MANUAL",
    type_transaction: "NORMAL",
    allocations: [alloc(3, "-74.00"), alloc(1, "-74.00"), alloc(2, "-74.00")],
    date: "2026-06-07 13:33:31.295000",
    ...overrides,
  } as Entry
}

describe("normalizeName", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalizeName("  User   One ")).toBe("user one")
  })
})

describe("autoMatchUserId", () => {
  it("matches by name and email local-part, null otherwise", () => {
    expect(autoMatchUserId("User one", USERS)).toBe("u1")
    expect(autoMatchUserId("user2", USERS)).toBe("u2")
    expect(autoMatchUserId("Nobody", USERS)).toBeNull()
  })
})

describe("resolveMembers", () => {
  it("auto-matches household members and flags outsiders", () => {
    const { resolved, householdMemberIds } = resolveMembers(MEMBERS, USERS, {})
    expect(householdMemberIds.sort()).toEqual([1, 2])
    expect(resolved.find((r) => r.id === 3)).toMatchObject({ userId: null, source: "auto" })
    expect(resolved.find((r) => r.id === 1)).toMatchObject({ userId: "u1", source: "auto" })
  })

  it("manual override assigns an unmatched member", () => {
    const { householdMemberIds, resolved } = resolveMembers(MEMBERS, USERS, { "3": "u1" })
    expect(householdMemberIds.sort()).toEqual([1, 2, 3])
    expect(resolved.find((r) => r.id === 3)).toMatchObject({ userId: "u1", source: "manual" })
  })

  it("manual null override excludes an auto-matched member", () => {
    const { householdMemberIds } = resolveMembers(MEMBERS, USERS, { "1": null })
    expect(householdMemberIds.sort()).toEqual([2])
  })

  it("ignores overrides pointing at a non-household user", () => {
    const { householdMemberIds } = resolveMembers(MEMBERS, USERS, { "3": "ghost" })
    expect(householdMemberIds.sort()).toEqual([1, 2])
  })
})

describe("parseDecimalToCents", () => {
  it.each([
    ["-74.00", -7400],
    ["12.5", 1250],
    ["30", 3000],
    ["0.01", 1],
    ["abc", 0],
  ])("parses %s -> %i", (input, expected) => {
    expect(parseDecimalToCents(input)).toBe(expected)
  })
})

describe("householdShareCents", () => {
  it("sums only household allocations, absolute value", () => {
    expect(householdShareCents(entry(), new Set([1, 2]))).toBe(14800)
  })
  it("is zero when only outsiders are allocated", () => {
    expect(
      householdShareCents(entry({ allocations: [alloc(3, "-74.00")] }), new Set([1, 2]))
    ).toBe(0)
  })
})

describe("entryDateOnly", () => {
  it("extracts YYYY-MM-DD", () => {
    expect(entryDateOnly("2026-06-07 13:33:31.295000")).toBe("2026-06-07")
  })
})

describe("isSyncableEntry", () => {
  it("accepts ACTIVE NORMAL", () => {
    expect(isSyncableEntry(entry())).toBe(true)
  })
  it("rejects BALANCE settlements", () => {
    expect(isSyncableEntry(entry({ type_transaction: "BALANCE" }))).toBe(false)
  })
  it("rejects non-active rows", () => {
    expect(isSyncableEntry(entry({ status: "DELETED" }))).toBe(false)
  })
})

describe("contentHash", () => {
  const base = { shareCents: 14800, currency: "EUR", expenseDate: "2026-06-07", description: "Test" }
  it("is deterministic", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }))
  })
  it("changes when a field changes", () => {
    expect(contentHash(base)).not.toBe(contentHash({ ...base, description: "Changed" }))
    expect(contentHash(base)).not.toBe(contentHash({ ...base, shareCents: 14801 }))
  })
})

describe("composeDescription", () => {
  it("prefixes the raw description with the tricount title", () => {
    expect(composeDescription("Test Claude", "Dinner")).toBe("Test Claude · Dinner")
  })
  it("uses the title alone when there is no description", () => {
    expect(composeDescription("Test Claude", null)).toBe("Test Claude")
    expect(composeDescription("Test Claude", "")).toBe("Test Claude")
  })
  it("falls back to the raw description when there is no title", () => {
    expect(composeDescription(null, "Dinner")).toBe("Dinner")
    expect(composeDescription("", "")).toBeNull()
  })
})

describe("mapEntry", () => {
  it("maps a syncable entry to the household share (raw description)", () => {
    const m = mapEntry(entry(), new Set([1, 2]))
    expect(m).not.toBeNull()
    expect(m!.shareCents).toBe(14800)
    expect(m!.currency).toBe("EUR")
    expect(m!.expenseDate).toBe("2026-06-07")
    expect(m!.description).toBe("Test Expense")
    expect(m!.tricountEntryId).toBe(999)
  })
  it("returns null for outsider-only (zero share) entries", () => {
    expect(mapEntry(entry({ allocations: [alloc(3, "-74.00")] }), new Set([1, 2]))).toBeNull()
  })
  it("returns null for BALANCE settlements", () => {
    expect(mapEntry(entry({ type_transaction: "BALANCE" }), new Set([1, 2]))).toBeNull()
  })
})
