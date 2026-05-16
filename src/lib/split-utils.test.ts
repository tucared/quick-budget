import { describe, it, expect } from "vitest"
import type { Category, ExpenseWithDetails, SplitGroup } from "./types"
import { deriveCapState, groupSplitSiblings, partitionSplitSiblings, isSplitGroupItem } from "./split-utils"
import { isSplitGroup } from "./types"

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-primary",
    household_id: "hh-1",
    name: "Dining Out",
    exclude_from_budget_total: false,
    icon: null,
    is_active: true,
    cap_amount: null,
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  }
}

function makeExpense(overrides: Partial<ExpenseWithDetails> & { id: string }): ExpenseWithDetails {
  return {
    id: overrides.id,
    logged_by_user_id: "user-1",
    household_id: "hh-1",
    category_id: overrides.category_id ?? "cat-1",
    is_cash: false,
    amount: overrides.amount ?? 10,
    currency: "EUR",
    converted_amount: overrides.converted_amount ?? overrides.amount ?? 10,
    converted_currency: "EUR",
    exchange_rate: 1,
    expense_date: overrides.expense_date ?? "2026-05-15",
    description: overrides.description ?? null,
    split_group_id: overrides.split_group_id ?? null,
    created_at: overrides.created_at ?? "2026-05-15T10:00:00Z",
    updated_at: overrides.updated_at ?? "2026-05-15T10:00:00Z",
  }
}

describe("groupSplitSiblings", () => {
  it("returns non-split rows unchanged", () => {
    const a = makeExpense({ id: "a" })
    const b = makeExpense({ id: "b" })
    const out = groupSplitSiblings([a, b])
    expect(out).toEqual([a, b])
  })

  it("groups adjacent siblings into one SplitGroup", () => {
    const a = makeExpense({ id: "a", split_group_id: "g1", category_id: "cat-dining", amount: 10 })
    const b = makeExpense({ id: "b", split_group_id: "g1", category_id: "cat-allowance", amount: 20 })
    const out = groupSplitSiblings([a, b])
    expect(out).toHaveLength(1)
    expect(isSplitGroup(out[0])).toBe(true)
    const group = out[0] as SplitGroup
    expect(group.splitGroupId).toBe("g1")
    expect(group.siblings.map((s) => s.id)).toEqual(["a", "b"])
  })

  it("groups non-adjacent siblings into one SplitGroup", () => {
    const a = makeExpense({ id: "a", split_group_id: "g1" })
    const middle = makeExpense({ id: "m" })
    const b = makeExpense({ id: "b", split_group_id: "g1" })
    const out = groupSplitSiblings([a, middle, b])
    // First occurrence of g1 (at index 0) emits the group; middle passes through.
    expect(out).toHaveLength(2)
    expect(isSplitGroup(out[0])).toBe(true)
    expect(out[1]).toBe(middle)
  })

  it("emits an orphan singleton split row as a plain expense", () => {
    const orphan = makeExpense({ id: "a", split_group_id: "g1" })
    const out = groupSplitSiblings([orphan])
    expect(out).toEqual([orphan])
    expect(isSplitGroup(out[0])).toBe(false)
  })

  it("preserves the original ordering across mixed input", () => {
    const a = makeExpense({ id: "a" })
    const s1 = makeExpense({ id: "s1", split_group_id: "g1" })
    const s2 = makeExpense({ id: "s2", split_group_id: "g1" })
    const b = makeExpense({ id: "b" })
    const out = groupSplitSiblings([a, s1, s2, b])
    expect(out).toHaveLength(3)
    expect(out[0]).toBe(a)
    expect(isSplitGroup(out[1])).toBe(true)
    expect(out[2]).toBe(b)
  })

  it("emits the group at the position of the first sibling, hiding the second occurrence", () => {
    const head = makeExpense({ id: "head" })
    const s1 = makeExpense({ id: "s1", split_group_id: "g1" })
    const middle = makeExpense({ id: "middle" })
    const s2 = makeExpense({ id: "s2", split_group_id: "g1" })
    const tail = makeExpense({ id: "tail" })
    const out = groupSplitSiblings([head, s1, middle, s2, tail])
    expect(out).toHaveLength(4)
    expect(out[0]).toBe(head)
    expect(isSplitGroup(out[1])).toBe(true)
    expect(out[2]).toBe(middle)
    expect(out[3]).toBe(tail)
  })
})

describe("partitionSplitSiblings", () => {
  it("treats the non-allowance sibling as the primary", () => {
    const a = makeExpense({ id: "a", split_group_id: "g1", category_id: "cat-dining", amount: 10 })
    const b = makeExpense({ id: "b", split_group_id: "g1", category_id: "cat-allowance", amount: 20 })
    const group: SplitGroup = { splitGroupId: "g1", siblings: [a, b] }
    const flags = new Map([["cat-dining", false], ["cat-allowance", true]])
    const { primary, overflow } = partitionSplitSiblings(group, flags)
    expect(primary.id).toBe("a")
    expect(overflow.id).toBe("b")
  })

  it("falls back to the larger amount when both siblings have the same exclude flag", () => {
    const a = makeExpense({ id: "a", split_group_id: "g1", category_id: "cat-1", converted_amount: 5 })
    const b = makeExpense({ id: "b", split_group_id: "g1", category_id: "cat-2", converted_amount: 25 })
    const group: SplitGroup = { splitGroupId: "g1", siblings: [a, b] }
    const flags = new Map([["cat-1", false], ["cat-2", false]])
    const { primary, overflow } = partitionSplitSiblings(group, flags)
    expect(primary.id).toBe("b")
    expect(overflow.id).toBe("a")
  })
})

describe("deriveCapState", () => {
  it("returns exceedsCap=false when no category is provided", () => {
    expect(deriveCapState(null, 25, 1).exceedsCap).toBe(false)
    expect(deriveCapState(undefined, 25, 1).exceedsCap).toBe(false)
  })

  it("returns exceedsCap=false when the category has no cap configured", () => {
    const cat = makeCategory()
    const result = deriveCapState(cat, 25, 1)
    expect(result.exceedsCap).toBe(false)
    expect(result.capEUR).toBe(0)
  })

  it("returns exceedsCap=false when the category is an allowance", () => {
    const cat = makeCategory({
      exclude_from_budget_total: true,
      cap_amount: 10,
    })
    expect(deriveCapState(cat, 25, 1).exceedsCap).toBe(false)
  })

  it("returns exceedsCap=false when amount equals the cap (no strict overflow)", () => {
    const cat = makeCategory({ cap_amount: 10 })
    const result = deriveCapState(cat, 10, 1)
    expect(result.exceedsCap).toBe(false)
    expect(result.capEUR).toBe(10)
  })

  it("splits cleanly in EUR when amount > cap", () => {
    const cat = makeCategory({ cap_amount: 10 })
    const result = deriveCapState(cat, 25, 1)
    expect(result.exceedsCap).toBe(true)
    expect(result.capEUR).toBe(10)
    expect(result.primaryOriginal).toBe(10)
    expect(result.primaryEUR).toBe(10)
    expect(result.overflowOriginal).toBe(15)
    expect(result.overflowEUR).toBe(15)
  })

  it("splits BRL into primary cap-in-EUR + overflow with input sum preserved", () => {
    const cat = makeCategory({ cap_amount: 10 })
    const rate = 0.189
    const amountBRL = 55.55
    const result = deriveCapState(cat, amountBRL, rate)

    expect(result.exceedsCap).toBe(true)
    expect(result.primaryEUR).toBe(10)
    expect(result.primaryOriginal + result.overflowOriginal).toBeCloseTo(amountBRL, 2)
    expect(result.overflowEUR).toBeCloseTo(amountBRL * rate - 10, 2)
  })

  it("excludes allowance overflow when total just barely crosses cap (sub-cent)", () => {
    const cat = makeCategory({ cap_amount: 10 })
    const result = deriveCapState(cat, 10.005, 1)
    expect(result.exceedsCap).toBe(true)
    expect(result.primaryEUR).toBe(10)
    expect(result.overflowEUR).toBeCloseTo(0.01, 2)
  })

  it("returns exceedsCap=false for zero/negative/NaN inputs", () => {
    const cat = makeCategory({ cap_amount: 10 })
    expect(deriveCapState(cat, 0, 1).exceedsCap).toBe(false)
    expect(deriveCapState(cat, NaN, 1).exceedsCap).toBe(false)
    expect(deriveCapState(cat, 25, 0).exceedsCap).toBe(false)
    expect(deriveCapState(cat, 25, NaN).exceedsCap).toBe(false)
  })
})

describe("isSplitGroupItem", () => {
  it("re-exports the type guard from types.ts so consumers don't need two imports", () => {
    const exp = makeExpense({ id: "a" })
    const group: SplitGroup = { splitGroupId: "g1", siblings: [exp, exp] }
    expect(isSplitGroupItem(exp)).toBe(false)
    expect(isSplitGroupItem(group)).toBe(true)
  })
})
