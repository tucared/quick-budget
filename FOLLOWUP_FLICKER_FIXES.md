# Follow-up: UI Flicker Fixes

Remaining items after the initial fix in `claude/fix-expense-save-flicker-zYpvu`.

## Done

- [x] Expenses page: optimistic list update on save (no waiting for realtime)
- [x] Budget status: stale-while-revalidate (no skeleton flash on refresh)

## To do

### ~~Budget page reload flash~~
Fixed: expense realtime events now apply optimistically (INSERT/UPDATE/DELETE mutate `expenses`, `budgets`, and `allowances` state directly, recomputing `spent_amount`/`remaining_amount`/`percent_spent`). `reloadBudgets()` is still called for budget allocation changes (user-initiated, infrequent).

### Cap expense list state size
The old code capped the in-memory list at 20 items (`prev.slice(0, 19)`). The new code grows unboundedly with each INSERT. Should add a cap (e.g., 50) to keep memory bounded, since only `visibleCount` items are rendered anyway.

### ~~Realtime / optimistic dedup race~~
Fixed: realtime INSERT handler now checks `prev.some((exp) => exp.id === newExpense.id)` before adding, so a duplicate is never inserted even if the realtime event races ahead of the `.select().single()` response.
