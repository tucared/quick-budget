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

## 4. Migrate realtime to broadcast-via-trigger (postgres_changes is broken on this project)

**Diagnosis (confirmed on Vercel preview, May 2026):** `.on("postgres_changes", ...)` subscriptions on this project return `CHANNEL_ERROR: mismatch between server and client bindings for postgres changes` — the realtime broker accepts the channel join but returns zero accepted bindings while the client expects one. Verified:
- `pg_publication_tables` includes `expenses`, `budget_allocations`, `categories` in `supabase_realtime`.
- `REPLICA IDENTITY FULL` is set on all three.
- Realtime Service is enabled in the dashboard, "Allow public access to channels" is on.
- Tested with both publishable key and legacy anon JWT — same error.
- Tested with `private: true` channel config — error became "Unauthorized" (auth flow works, no policies on `realtime.messages`).

It is not a network/proxy artifact, not a key-format issue, and not a publication issue. The realtime broker on this project simply isn't accepting `postgres_changes` bindings. Supabase has been pushing new projects toward the broadcast-via-trigger pattern (`realtime.broadcast_changes()` + RLS on `realtime.messages` + `private: true`); the partition tables `realtime.messages_2026_05_07` etc. are already provisioned, suggesting that's the intended path here.

**Where it bites today:**
- Partner-sync: changes by user A don't appear for user B until refresh.
- `/budget` page: editing an allocation in one tab doesn't update another tab; expense inserts elsewhere don't update category totals live.
- `/expenses` page: same-tab edits/deletes already work via the optimistic-update path shipped in commit `163d4db`. Partner-sync remains broken.

**Migration plan:**
1. Add a Postgres trigger on `expenses` and `budget_allocations` that calls `realtime.broadcast_changes('expenses_household_' || NEW.household_id, TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD)` (and the equivalent for `budget_allocations`). Topic name encodes household.
2. Add an RLS policy on `realtime.messages` allowing authenticated users to read topics matching `'expenses_household_' || get_my_household_id()::text` or the budget allocation equivalent. Don't grant write — clients shouldn't push events.
3. In `useExpenseSubscription` / `useBudgetAllocationSubscription`, set `config: { private: true }` on the channel and replace `.on("postgres_changes", ...)` with `.on("broadcast", { event: "*" }, ...)`. The payload shape changes from `{ eventType, new, old }` to `{ event, payload: { record, old_record, op } }` — adapt the handler accordingly.
4. Drop the postgres_changes publication entries for these tables once broadcast is verified working (optional — keeps migrations idempotent).
5. Verify partner-sync: open two browser sessions for different household members, edit in one, watch the other refresh.

**Tradeoff vs option 3 ("live with it"):** ~1 hour of work for proper partner-sync that won't break under future Supabase realtime changes, vs zero work but partners always see stale state until manual refresh. For a 2-person household used daily, a manual refresh is annoying but not blocking.

**Launch prompt:**
> The Supabase project's realtime postgres_changes feature returns `CHANNEL_ERROR: mismatch between server and client bindings`, confirmed on production. Migrate the two subscription hooks (`src/lib/hooks/use-expense-subscription.ts`, `src/lib/hooks/use-budget-allocation-subscription.ts`) to use the broadcast-via-trigger pattern: add Postgres triggers on `expenses` and `budget_allocations` that call `realtime.broadcast_changes()` with a household-scoped topic, add an RLS policy on `realtime.messages` keyed off `get_my_household_id()`, and switch the client hooks to `private: true` channels using `.on("broadcast", { event: "*" })`. Drop the now-unused `expenses` / `budget_allocations` entries from the `supabase_realtime` postgres_changes publication. The optimistic-update fix already in place (commit 163d4db) means same-tab edits keep working through the migration, so this can ship as a single PR. Verify partner-sync end-to-end with two browser sessions before considering it done.

---

## How to use this file

When you have time for one of these, copy its launch prompt into a fresh Claude Code session. Each prompt is self-contained — it references the right files and constraints.

Add new items by appending another `## N. Title` section with the same shape.
