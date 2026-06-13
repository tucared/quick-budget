import { describe, it, expect } from "vitest"
import {
  resolveMembers,
  parseDecimalToCents,
  householdShareCents,
  signedHouseholdShareCents,
  paidByHouseholdCents,
  entryDateOnly,
  isSyncableEntry,
  isReconcilableEntry,
  contentHash,
  mapEntry,
  mapReconcileEntry,
  type HouseholdUser,
  type RegistryMember,
} from "./mapping"
import type { TricountMembership, TricountRegistryEntry } from "./types"

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

function membership(memberId: number): TricountMembership {
  return {
    RegistryMembershipNonUser: {
      id: memberId,
      uuid: "x",
      alias: { pointer: { type: "UUID", value: "x", name: "n" } },
    },
  }
}

function alloc(memberId: number, value: string) {
  return { amount: { currency: "EUR", value }, membership: membership(memberId) }
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
    membership_owned: membership(1), // paid by household member 1
    allocations: [alloc(3, "-74.00"), alloc(1, "-74.00"), alloc(2, "-74.00")],
    date: "2026-06-07 13:33:31.295000",
    ...overrides,
  } as Entry
}

// Income matches the real "Test Income" fixture: positive amount + positive
// allocations, paid by household member 1.
function incomeEntry(overrides: Partial<Entry> = {}): Entry {
  return entry({
    id: 500,
    description: "Test Income",
    type_transaction: "INCOME",
    amount: { currency: "EUR", value: "500.00" },
    membership_owned: membership(1),
    allocations: [alloc(3, "166.67"), alloc(1, "166.67"), alloc(2, "166.66")],
    ...overrides,
  })
}

describe("resolveMembers (explicit only — no auto-match)", () => {
  it("treats members absent from the map as unset (not counted)", () => {
    const { resolved, householdMemberIds } = resolveMembers(MEMBERS, USERS, {})
    expect(householdMemberIds).toEqual([])
    for (const r of resolved) expect(r.status).toBe("unset")
  })

  it("counts only explicitly mapped members", () => {
    const { resolved, householdMemberIds } = resolveMembers(MEMBERS, USERS, {
      "1": "u1",
      "2": "u2",
    })
    expect(householdMemberIds.sort()).toEqual([1, 2])
    expect(resolved.find((r) => r.id === 1)).toMatchObject({ userId: "u1", status: "mapped" })
    expect(resolved.find((r) => r.id === 3)).toMatchObject({ userId: null, status: "unset" })
  })

  it("null maps to an explicit exclude", () => {
    const { resolved, householdMemberIds } = resolveMembers(MEMBERS, USERS, { "1": null })
    expect(householdMemberIds).toEqual([])
    expect(resolved.find((r) => r.id === 1)).toMatchObject({ status: "excluded" })
  })

  it("treats a stale id (non-household user) as excluded", () => {
    const { householdMemberIds, resolved } = resolveMembers(MEMBERS, USERS, { "3": "ghost" })
    expect(householdMemberIds).toEqual([])
    expect(resolved.find((r) => r.id === 3)).toMatchObject({ status: "excluded" })
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
  it("keeps a mid-day UTC timestamp on its day in a UTC+ zone", () => {
    expect(entryDateOnly("2026-06-07 13:33:31.295000", "Europe/Paris")).toBe("2026-06-07")
  })

  it("rolls a late-UTC timestamp forward into the next local day (Europe)", () => {
    // 22:30 UTC is 00:30 the next day in CEST — the reported 'a day earlier in
    // QB' bug: a naive slice would keep 2026-06-07.
    expect(entryDateOnly("2026-06-07 22:30:00", "Europe/Paris")).toBe("2026-06-08")
  })

  it("rolls an early-UTC timestamp back into the previous local day (Brazil)", () => {
    // 00:30 UTC is 21:30 the previous day in BRT (UTC-3).
    expect(entryDateOnly("2026-06-08 00:30:00", "America/Sao_Paulo")).toBe("2026-06-07")
  })

  it("falls back to a plain slice for date-only or malformed input", () => {
    expect(entryDateOnly("2026-06-07", "Europe/Paris")).toBe("2026-06-07")
    expect(entryDateOnly("", "Europe/Paris")).toBe("")
  })
})

describe("signedHouseholdShareCents", () => {
  it("is positive (consumption) for a NORMAL expense", () => {
    expect(signedHouseholdShareCents(entry(), new Set([1, 2]))).toBe(14800)
  })
  it("is negative (money received) for INCOME", () => {
    // 166.67 + 166.66 = 333.33 received → −33333
    expect(signedHouseholdShareCents(incomeEntry(), new Set([1, 2]))).toBe(-33333)
  })
})

describe("paidByHouseholdCents", () => {
  it("is the full positive amount when a household member paid an expense", () => {
    expect(paidByHouseholdCents(entry(), new Set([1, 2]))).toBe(22200)
  })
  it("is zero when an outsider paid", () => {
    expect(paidByHouseholdCents(entry({ membership_owned: membership(3) }), new Set([1, 2]))).toBe(0)
  })
  it("is zero when no payer is set", () => {
    expect(paidByHouseholdCents(entry({ membership_owned: undefined }), new Set([1, 2]))).toBe(0)
  })
  it("is negative (cash in) when a household member received INCOME", () => {
    expect(paidByHouseholdCents(incomeEntry(), new Set([1, 2]))).toBe(-50000)
  })
})

describe("isSyncableEntry / isReconcilableEntry", () => {
  it("syncable accepts ACTIVE NORMAL only", () => {
    expect(isSyncableEntry(entry())).toBe(true)
    expect(isSyncableEntry(incomeEntry())).toBe(false)
  })
  it("reconcilable accepts ACTIVE NORMAL and INCOME", () => {
    expect(isReconcilableEntry(entry())).toBe(true)
    expect(isReconcilableEntry(incomeEntry())).toBe(true)
  })
  it("both reject BALANCE settlements and non-active rows", () => {
    expect(isSyncableEntry(entry({ type_transaction: "BALANCE" }))).toBe(false)
    expect(isReconcilableEntry(entry({ type_transaction: "BALANCE" }))).toBe(false)
    expect(isReconcilableEntry(entry({ status: "DELETED" }))).toBe(false)
  })
})

describe("contentHash", () => {
  const base = { shareCents: 14800, paidCents: 22200, currency: "EUR", expenseDate: "2026-06-07", description: "Test" }
  it("is deterministic", () => {
    expect(contentHash(base)).toBe(contentHash({ ...base }))
  })
  it("changes when share, payer, or description changes", () => {
    expect(contentHash(base)).not.toBe(contentHash({ ...base, description: "Changed" }))
    expect(contentHash(base)).not.toBe(contentHash({ ...base, shareCents: 14801 }))
    expect(contentHash(base)).not.toBe(contentHash({ ...base, paidCents: 0 }))
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
  it("resolves the expense date in the passed timezone (near-midnight UTC)", () => {
    // 22:30 UTC is 00:30 the next day in CEST.
    const e = entry({ date: "2026-06-07 22:30:00.000000" })
    expect(mapEntry(e, new Set([1, 2]), "Europe/Paris")!.expenseDate).toBe("2026-06-08")
    expect(mapEntry(e, new Set([1, 2]), "America/Sao_Paulo")!.expenseDate).toBe("2026-06-07")
  })
})

describe("mapReconcileEntry (owe/owed, signed)", () => {
  const HH = new Set([1, 2])
  const net = (e: Entry) => {
    const rc = mapReconcileEntry(e, HH)
    return rc && (rc.paidCents - rc.shareCents) / 100
  }

  it("expense paid by household: +74 owed (paid 222 − share 148)", () => {
    expect(net(entry())).toBe(74)
  })
  it("expense paid by an outsider: −60 owe (paid 0 − share 60)", () => {
    // member 1 not allocated; member 2 owes 60; outsider 3 paid the 120.
    const e = entry({
      amount: { currency: "EUR", value: "-120.00" },
      membership_owned: membership(3),
      allocations: [alloc(3, "-60.00"), alloc(2, "-60.00")],
    })
    expect(net(e)).toBe(-60)
  })
  it("income received by household: −166.67 owe (paid −500 − share −333.33)", () => {
    expect(net(incomeEntry())).toBeCloseTo(-166.67, 2)
  })
  it("produces a record for INCOME (so it reconciles without a budget expense)", () => {
    const rc = mapReconcileEntry(incomeEntry(), HH)
    expect(rc).not.toBeNull()
    expect(rc!.shareCents).toBe(-33333)
    expect(rc!.paidCents).toBe(-50000)
    // INCOME never mirrors a budget expense.
    expect(mapEntry(incomeEntry(), HH)).toBeNull()
  })
  it("returns null when the household neither paid nor consumed", () => {
    const e = entry({
      membership_owned: membership(3),
      allocations: [alloc(3, "-74.00")],
    })
    expect(mapReconcileEntry(e, HH)).toBeNull()
  })
  it("reconciles a household-paid, outsider-only entry (paid, zero share)", () => {
    // Household member 1 paid 100, fully allocated to outsider 3.
    const e = entry({
      amount: { currency: "EUR", value: "-100.00" },
      membership_owned: membership(1),
      allocations: [alloc(3, "-100.00")],
    })
    const rc = mapReconcileEntry(e, HH)
    expect(rc).not.toBeNull()
    expect(rc!.shareCents).toBe(0)
    expect(rc!.paidCents).toBe(10000)
    // No budget expense (zero household share), but it still owes a balance.
    expect(mapEntry(e, HH)).toBeNull()
  })
})
