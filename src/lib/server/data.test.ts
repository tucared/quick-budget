import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { computeTopCategoryIds } from "@/lib/server/data"
import type { Category, ExpenseWithDetails } from "@/lib/types"

// With "now" pinned to 2026-05-12, subDays(now, 30) → 2026-04-12 (the cutoff).
// Expenses with expense_date < "2026-04-12" are excluded.
const NOW = new Date("2026-05-12T12:00:00Z")

function expense(partial: { id?: string; category_id: string | null; expense_date: string }): ExpenseWithDetails {
  return { id: partial.id ?? "e", category_id: partial.category_id, expense_date: partial.expense_date } as unknown as ExpenseWithDetails
}

function category(id: string): Category {
  return { id } as unknown as Category
}

describe("computeTopCategoryIds", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns [] for empty expenses", () => {
    expect(computeTopCategoryIds([], [category("a"), category("b")])).toEqual([])
  })

  it("returns [] when no expenses match active categories", () => {
    const expenses = [
      expense({ category_id: "inactive", expense_date: "2026-05-10" }),
      expense({ category_id: "also-inactive", expense_date: "2026-05-11" }),
    ]
    expect(computeTopCategoryIds(expenses, [category("a")])).toEqual([])
  })

  it("skips expenses with null category_id", () => {
    const expenses = [
      expense({ category_id: null, expense_date: "2026-05-10" }),
      expense({ category_id: "a", expense_date: "2026-05-10" }),
    ]
    expect(computeTopCategoryIds(expenses, [category("a")])).toEqual(["a"])
  })

  it("skips expenses outside the 30-day window", () => {
    const expenses = [
      expense({ category_id: "a", expense_date: "2026-04-11" }), // before cutoff
      expense({ category_id: "b", expense_date: "2026-05-10" }), // inside window
    ]
    expect(computeTopCategoryIds(expenses, [category("a"), category("b")])).toEqual(["b"])
  })

  it("includes expenses exactly at the cutoff date (strict <, so cutoff itself is in)", () => {
    const expenses = [
      expense({ category_id: "a", expense_date: "2026-04-12" }), // exactly at cutoff — included
    ]
    expect(computeTopCategoryIds(expenses, [category("a")])).toEqual(["a"])
  })

  it("sorts by count descending", () => {
    const expenses = [
      expense({ id: "1", category_id: "rare", expense_date: "2026-05-01" }),
      expense({ id: "2", category_id: "common", expense_date: "2026-05-02" }),
      expense({ id: "3", category_id: "common", expense_date: "2026-05-03" }),
      expense({ id: "4", category_id: "common", expense_date: "2026-05-04" }),
      expense({ id: "5", category_id: "mid", expense_date: "2026-05-05" }),
      expense({ id: "6", category_id: "mid", expense_date: "2026-05-06" }),
    ]
    expect(
      computeTopCategoryIds(expenses, [category("rare"), category("common"), category("mid")])
    ).toEqual(["common", "mid", "rare"])
  })

  it("respects a custom limit", () => {
    const expenses = [
      expense({ id: "1", category_id: "a", expense_date: "2026-05-01" }),
      expense({ id: "2", category_id: "b", expense_date: "2026-05-02" }),
      expense({ id: "3", category_id: "c", expense_date: "2026-05-03" }),
    ]
    const result = computeTopCategoryIds(
      expenses,
      [category("a"), category("b"), category("c")],
      2
    )
    expect(result).toHaveLength(2)
  })

  it("defaults limit to 7 when not provided", () => {
    const cats = Array.from({ length: 10 }, (_, i) => category(`cat-${i}`))
    // Build expenses with distinct counts: cat-0 gets 10, cat-1 gets 9, ..., cat-9 gets 1
    const expenses: ExpenseWithDetails[] = []
    cats.forEach((c, i) => {
      for (let j = 0; j <= 10 - i - 1; j++) {
        expenses.push(expense({ id: `${c.id}-${j}`, category_id: c.id, expense_date: "2026-05-01" }))
      }
    })
    const result = computeTopCategoryIds(expenses, cats)
    expect(result).toHaveLength(7)
    expect(result).toEqual(["cat-0", "cat-1", "cat-2", "cat-3", "cat-4", "cat-5", "cat-6"])
  })
})
