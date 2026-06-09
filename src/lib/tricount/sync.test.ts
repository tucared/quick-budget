import { describe, it, expect } from "vitest"
import { expenseFields, publicSyncErrorMessage, EmptyRegistryError } from "./sync"
import type { MappedEntry } from "./mapping"

function mapped(overrides: Partial<MappedEntry> = {}): MappedEntry {
  return {
    tricountEntryId: 1,
    shareCents: 1234,
    currency: "EUR",
    expenseDate: "2026-06-07",
    description: "Test Expense",
    ...overrides,
  }
}

describe("expenseFields", () => {
  it("builds the expense columns at rate 1 (EUR)", () => {
    expect(expenseFields(mapped(), "Test Expense", 1, "cat-1")).toEqual({
      amount: 12.34,
      currency: "EUR",
      converted_amount: 12.34,
      converted_currency: "EUR",
      exchange_rate: 1,
      expense_date: "2026-06-07",
      description: "Test Expense",
      category_id: "cat-1",
      is_cash: false,
    })
  })

  it("converts a foreign-currency share at the resolved rate", () => {
    const fields = expenseFields(mapped({ shareCents: 1000, currency: "BRL" }), null, 0.164, null)
    expect(fields).toMatchObject({
      amount: 10,
      currency: "BRL",
      converted_amount: 1.64,
      exchange_rate: 0.164,
      description: null,
      category_id: null,
    })
  })

  it("returns null when the converted EUR amount rounds to 0 (sub-cent share)", () => {
    // 0.02 BRL × 0.164 = 0.00328 → rounds to €0.00, which the DB CHECK
    // converted_amount <> 0 would reject.
    expect(expenseFields(mapped({ shareCents: 2, currency: "BRL" }), null, 0.164, null)).toBeNull()
    // 0.03 BRL × 0.164 = 0.00492 → still €0.00.
    expect(expenseFields(mapped({ shareCents: 3, currency: "BRL" }), null, 0.164, null)).toBeNull()
  })

  it("keeps the smallest share that rounds to a whole cent", () => {
    // 0.04 BRL × 0.164 = 0.00656 → rounds to €0.01.
    expect(
      expenseFields(mapped({ shareCents: 4, currency: "BRL" }), null, 0.164, null)
    ).toMatchObject({ amount: 0.04, converted_amount: 0.01 })
    // A 1-cent EUR share at rate 1 stays a valid expense.
    expect(expenseFields(mapped({ shareCents: 1 }), null, 1, null)).toMatchObject({
      amount: 0.01,
      converted_amount: 0.01,
    })
  })
})

describe("publicSyncErrorMessage", () => {
  it("passes the shape-drift abort message through verbatim", () => {
    const message = '"Trip" returned no entries while 5 synced entries exist — sync aborted.'
    expect(publicSyncErrorMessage(new EmptyRegistryError(message))).toBe(message)
  })

  it("launders internal errors instead of leaking raw detail", () => {
    const raw = 'Failed to insert expense: violates check constraint "expenses_converted_amount_check"'
    const message = publicSyncErrorMessage(new Error(raw))
    expect(message).not.toContain("check constraint")
    expect(message).not.toContain(raw)
  })

  it("launders non-Error values", () => {
    expect(typeof publicSyncErrorMessage("boom")).toBe("string")
    expect(publicSyncErrorMessage(undefined)).not.toContain("undefined")
  })
})
