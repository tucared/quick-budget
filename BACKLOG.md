# Backlog

Cleanup items parked from the May 2026 audit (`claude/audit-dead-code-4hZR5`). Each entry below includes a self-contained prompt at the bottom — paste it into a fresh Claude Code session to pick that item up without re-explaining context.

---

## 1. Narrow `reloadData()` scope per subscription

**Where:** `src/components/budget-page-content.tsx`

**Problem:** `useExpenseSubscription(reloadData)` and `useBudgetAllocationSubscription(reloadData)` both call the same `reloadData()`, which runs all four queries (`fetchBudgetSummary`, `fetchAllowanceSummary`, `fetchMonthlyBudgetTarget`, `fetchMonthlyExpenses`) on every realtime event. An expense insert refetches allowances + target unnecessarily; an allocation update refetches expenses unnecessarily.

**Idea:** Split into two callbacks (or pass a "what to refresh" flag). Expense subscription → budget summary + expenses. Allocation subscription → allocations + target.

**Tradeoff:** A few more lines for clearer intent and ~½ the round-trips on every realtime event in a 2-person household. Low user-visible impact today.

**Launch prompt:**
> In `src/components/budget-page-content.tsx`, the `reloadData()` callback runs all four queries (`fetchBudgetSummary`, `fetchAllowanceSummary`, `fetchMonthlyBudgetTarget`, `fetchMonthlyExpenses` from `src/lib/client/data.ts`) on every realtime event from both `useExpenseSubscription` and `useBudgetAllocationSubscription`. Split into two narrower callbacks so the expense subscription only refetches budget_summary + expenses, and the allocation subscription only refetches allocations + target. Keep current behaviour on month navigation. Verify with the dogfood skill: log an expense and confirm the budget page reflects it.

---

## 2. Standardize error handling

**Problem:** Three patterns in use:
- Server data functions in `src/lib/server/data.ts` `console.error` and return `[]` / `null`.
- Client mutations call `setError(getErrorMessage(...))`.
- RPC wrappers occasionally throw.

There's no convention doc, so additions drift.

**Idea:** Pick one pattern per layer (server / client mutation / RPC), document it as a comment in `src/lib/error-handler.ts`, and align outliers.

**Tradeoff:** Mostly a documentation task — small code change, but forces a decision on what to do when a server query fails. Today the page silently renders empty data on a server error; that may not be the desired UX.

**Launch prompt:**
> Audit error handling across `src/lib/server/data.ts`, `src/lib/client/data.ts`, the mutation paths in `src/components/expense-form.tsx`, `src/components/edit-expense-dialog.tsx`, `src/components/budget-edit-dialog.tsx`, `src/components/rebalance-dialog.tsx`, and the RPC callers. Document the conventions in a top-of-file comment in `src/lib/error-handler.ts` (one paragraph per layer) and align any outliers. The current server pattern of "log + return empty" silently hides errors from the user — surface that tradeoff and propose a fix if appropriate. Don't change UX without flagging.

---

## 3. Add unit tests for pure logic

**Problem:** Zero tests in the repo. The pure-logic islands (`src/lib/currency.ts` formatting + fallback rates, `src/lib/budget-utils.ts` status calculations, `src/lib/date-utils.ts`, `src/lib/server/data.ts:computeTopCategoryIds`) are easy to cover and protect against regressions.

**Idea:** Add Vitest. Cover:
- `formatNumber`, `formatCurrency` edge cases (negatives, zero, large values, BRL symbol)
- `getBudgetStatus` thresholds (the boundary at 95%, 100%, day-of-month pace)
- `computeTopCategoryIds` (active filter, 30-day window, ordering)
- `nextMonthString` across year boundaries

**Tradeoff:** Adds Vitest + a ~50-100 line config. Pure-logic coverage doesn't catch UI/integration bugs, but it's the highest leverage per minute spent.

**Launch prompt:**
> Add Vitest to the repo (no UI testing yet — pure logic only). Target three files: `src/lib/currency.ts`, `src/lib/budget-utils.ts`, `src/lib/date-utils.ts`. Also test `computeTopCategoryIds` from `src/lib/server/data.ts`. Cover boundary cases — for example: `getBudgetStatus` thresholds at exactly 95% and 100%, `formatCurrency` with zero / negative / BRL, `nextMonthString` across year boundaries (Dec → Jan). Add `npm test` script. Do NOT touch React components or add UI testing infra. Aim for a single targeted PR.

---

## How to use this file

When you have time for one of these, copy its launch prompt into a fresh Claude Code session. Each prompt is self-contained — it references the right files and constraints.

Add new items by appending another `## N. Title` section with the same shape.
