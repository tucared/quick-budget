import type { ExpenseListItem, ExpenseWithDetails, SplitGroup } from "./types"
import { isSplitGroup } from "./types"

export const isSplitGroupItem = isSplitGroup

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
