import type { Category, ExpenseListItem, ExpenseWithDetails, SplitGroup } from "./types"
import { isSplitGroup } from "./types"

export const isSplitGroupItem = isSplitGroup

// Cap-with-overflow derivation (JTBD #8). Given the selected category's
// configuration and the entered amount + exchange rate, returns whether the
// expense exceeds the configured cap and — if so — the exact original- and
// EUR-currency amounts that should be written to the primary (capped) and
// overflow (allowance) sibling rows.
//
// Invariants on the returned values when exceedsCap is true:
//   - primaryEUR === capEUR (no rounding loss on the budget side)
//   - primaryOriginal + overflowOriginal === amountOriginal (input sum preserved)
//   - exchange_rate is unchanged; both siblings use the same rate
//
// Pure / no side effects — safe to call in render. Used by the expense form,
// edit dialog, and the matching tests.
export interface CapDerivation {
  exceedsCap: boolean
  capEUR: number
  overflowCategoryId: string
  primaryOriginal: number
  primaryEUR: number
  overflowOriginal: number
  overflowEUR: number
}

type CapConfigInput = Pick<
  Category,
  "cap_amount" | "overflow_category_id" | "exclude_from_budget_total"
>

const EMPTY_DERIVATION: CapDerivation = {
  exceedsCap: false,
  capEUR: 0,
  overflowCategoryId: "",
  primaryOriginal: 0,
  primaryEUR: 0,
  overflowOriginal: 0,
  overflowEUR: 0,
}

export function deriveCapState(
  category: CapConfigInput | null | undefined,
  amountOriginal: number,
  exchangeRate: number,
): CapDerivation {
  if (!category) return EMPTY_DERIVATION
  if (category.exclude_from_budget_total) return EMPTY_DERIVATION
  if (category.cap_amount == null || !category.overflow_category_id) return EMPTY_DERIVATION
  if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) return EMPTY_DERIVATION
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return EMPTY_DERIVATION

  const capEUR = Number(category.cap_amount)
  const overflowCategoryId = category.overflow_category_id
  const totalEUR = amountOriginal * exchangeRate

  if (totalEUR <= capEUR) {
    return { ...EMPTY_DERIVATION, capEUR, overflowCategoryId }
  }

  const overflowEUR = +(totalEUR - capEUR).toFixed(2)
  const primaryOriginal =
    exchangeRate === 1 ? capEUR : +(capEUR / exchangeRate).toFixed(2)
  const overflowOriginal = +(amountOriginal - primaryOriginal).toFixed(2)

  return {
    exceedsCap: true,
    capEUR,
    overflowCategoryId,
    primaryOriginal,
    primaryEUR: capEUR,
    overflowOriginal,
    overflowEUR,
  }
}

// Collapse adjacent sibling expense rows (same split_group_id) into a single
// SplitGroup item, preserving the original order. Rows without a
// split_group_id pass through unchanged. An orphan sibling (only one row in
// the page for a given group) also passes through as a plain expense — the
// missing other half lives on a different page or is data debt.
export function groupSplitSiblings(expenses: ExpenseWithDetails[]): ExpenseListItem[] {
  const buckets = new Map<string, ExpenseWithDetails[]>()
  for (const exp of expenses) {
    if (exp.split_group_id) {
      const arr = buckets.get(exp.split_group_id) ?? []
      arr.push(exp)
      buckets.set(exp.split_group_id, arr)
    }
  }

  const emitted = new Set<string>()
  const out: ExpenseListItem[] = []
  for (const exp of expenses) {
    if (exp.split_group_id) {
      if (emitted.has(exp.split_group_id)) continue
      const siblings = buckets.get(exp.split_group_id)!
      if (siblings.length >= 2) {
        const group: SplitGroup = {
          splitGroupId: exp.split_group_id,
          siblings: [siblings[0], siblings[1]],
        }
        out.push(group)
        emitted.add(exp.split_group_id)
        continue
      }
    }
    out.push(exp)
  }
  return out
}

// Classify the two siblings of a split into a "primary" (capped category) and
// "overflow" (allowance) row. Used by the list display and edit dialog so the
// shared category and the personal-allowance overflow are always rendered in
// a predictable order. Falls back to the larger amount when both siblings
// share the same exclude_from_budget_total flag.
//
// Structurally typed so callers can pass either `Expense` or
// `ExpenseWithDetails` — only `category_id` and `converted_amount` are read.
type PartitionableRow = Pick<ExpenseWithDetails, "category_id" | "converted_amount">

export function partitionSplitSiblings<T extends PartitionableRow>(
  group: { siblings: readonly [T, T] },
  categoryExcludeFlags: Map<string, boolean>,
): { primary: T; overflow: T } {
  const [a, b] = group.siblings
  const aExcludes = a.category_id ? categoryExcludeFlags.get(a.category_id) === true : false
  const bExcludes = b.category_id ? categoryExcludeFlags.get(b.category_id) === true : false

  if (aExcludes !== bExcludes) {
    return aExcludes ? { primary: b, overflow: a } : { primary: a, overflow: b }
  }
  return Number(a.converted_amount) >= Number(b.converted_amount)
    ? { primary: a, overflow: b }
    : { primary: b, overflow: a }
}
