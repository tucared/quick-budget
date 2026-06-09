import type { Category, ExpenseListItem, ExpenseWithDetails, SplitGroup } from "./types"
import { isSplitGroup } from "./types"

export const isSplitGroupItem = isSplitGroup

// Round to 2 decimals (cents). Amounts written to the DECIMAL amount /
// converted_amount columns must go through this so the client convention
// matches the server-side sync path (src/lib/tricount/sync.ts).
export function round2(value: number): number {
  return +value.toFixed(2)
}

// Cap-with-overflow derivation (JTBD #8). Given the selected category's cap
// configuration and the entered amount + exchange rate, returns whether the
// expense exceeds the configured cap and — if so — the exact original- and
// EUR-currency amounts that should be written to the primary (capped) and
// overflow sibling rows. The overflow's target category is picked at log time
// in the UI; this function only does the math.
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
  primaryOriginal: number
  primaryEUR: number
  overflowOriginal: number
  overflowEUR: number
}

type CapConfigInput = Pick<Category, "cap_amount" | "exclude_from_budget_total">

const EMPTY_DERIVATION: CapDerivation = {
  exceedsCap: false,
  capEUR: 0,
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
  if (category.cap_amount == null) return EMPTY_DERIVATION
  if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) return EMPTY_DERIVATION
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return EMPTY_DERIVATION

  const capEUR = Number(category.cap_amount)
  const totalEUR = amountOriginal * exchangeRate

  if (totalEUR <= capEUR) {
    return { ...EMPTY_DERIVATION, capEUR }
  }

  const overflowEUR = round2(totalEUR - capEUR)
  const primaryOriginal =
    exchangeRate === 1 ? capEUR : round2(capEUR / exchangeRate)
  const overflowOriginal = round2(amountOriginal - primaryOriginal)

  // A total that exceeds the cap by less than half a cent — in EUR or, for
  // foreign-currency inputs, in the original currency — rounds one overflow
  // side to 0.00, which the DB CHECK (amount <> 0) would reject with a
  // cryptic error. Treat it as not exceeding the cap instead: no split.
  if (overflowEUR < 0.01 || overflowOriginal < 0.01) {
    return { ...EMPTY_DERIVATION, capEUR }
  }

  return {
    exceedsCap: true,
    capEUR,
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
// missing other half lives on a different page or is data debt. An
// over-populated group (3+ rows — data debt the app's two-sibling invariant
// doesn't expect) emits the first two as the SplitGroup and passes the extras
// through as plain expenses, so no row that counts in totals is hidden.
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
      const siblings = buckets.get(exp.split_group_id)!
      if (siblings.length >= 2) {
        // 3rd+ row of an over-populated group: pass through at its original
        // position instead of silently dropping it.
        if (siblings.indexOf(exp) >= 2) {
          out.push(exp)
          continue
        }
        if (emitted.has(exp.split_group_id)) continue
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
