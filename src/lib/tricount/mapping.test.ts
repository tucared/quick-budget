import { describe, it, expect } from "vitest"
import {
  normalizeName,
  matchMembers,
  parseDecimalToCents,
  householdShareCents,
  entryDateOnly,
  isSyncableEntry,
  contentHash,
  mapEntry,
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

describe("matchMembers", () => {
  it("maps household members by name and flags outsiders", () => {
    const { memberMap, householdMemberIds, unmatched } = matchMembers(MEMBERS, USERS)
    expect(memberMap).toEqual({ "1": "u1", "2": "u2" })
    expect(householdMemberIds.sort()).toEqual([1, 2])
    expect(unmatched).toEqual(["Other User"])
  })

  it("falls back to the email local-part", () => {
    const { memberMap } = matchMembers(
      [{ id: 5, name: "user1" }],
      USERS
    )
    expect(memberMap).toEqual({ "5": "u1" })
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

describe("mapEntry", () => {
  it("maps a syncable entry to the household share", () => {
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
