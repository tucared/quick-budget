# Realtime Subscription Audit

Findings from auditing the subscription/state update patterns across the codebase (Feb 2026).

## High Impact

### 1. No subscription error/status handling
**Files:** `use-expense-subscription.ts:60-88`, `use-budget-allocation-subscription.ts:34-58`

Neither subscription manager checks the return value of `.subscribe()` or handles status callbacks (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`). If the WebSocket connection drops, users silently stop receiving realtime updates with no indication. Supabase JS v2 has built-in reconnection, but channel-level errors are not surfaced.

### ~~2. Undebounced budget refetch in expense form~~ (Fixed)
**File:** `expense-form.tsx:294-296`

~~Every expense event (INSERT/UPDATE/DELETE across the entire household) triggers a full budget re-query via `setBudgetRefreshTick`. No debouncing or throttling. Rapid expense entry (or a partner bulk-entering) causes a cascade of database queries.~~

**Fix:** `budgetRefreshTick` is now debounced with a 500ms delay via `useDebouncedValue`, so rapid realtime events coalesce into a single budget query.

## Medium Impact

### ~~3. `deletingIds` never cleared on success~~ (Fixed)
**File:** `use-expense-delete.ts:16-33`

~~On successful delete, `deletingIds` is never explicitly cleared within the hook. Cleanup relies on the realtime DELETE event removing the expense from parent state. If the realtime event is delayed or lost, the expense card stays in "deleting" visual state indefinitely. A timeout fallback would be more robust.~~

**Fix:** On successful delete, a 5-second timeout fallback now clears the deleting state, so the UI recovers even if the realtime DELETE event is delayed or lost.

### 4. Module-level singleton Supabase clients
**Files:** `use-expense-subscription.ts:25`, `use-budget-allocation-subscription.ts:13`

Both subscription managers instantiate a Supabase client at module load time (class construction). The singleton survives across React mount/unmount cycles. If a user logs out and another logs in without a full page reload, the singleton retains a stale client instance.

## Low Impact

### 5. `optimisticIdsRef` never pruned
**File:** `expenses-page-client.tsx:23-38`

If the realtime INSERT echo never arrives (subscription drop, network issue), the ID stays in `optimisticIdsRef` forever. No cleanup mechanism, though in practice the set stays tiny.

### 6. 50-item state cap silently drops expenses
**File:** `expenses-page-client.tsx:28,41`

The 50-item cap on INSERT drops the oldest visible expense from state. If a user then deletes an expense, the list shrinks with no way to recover the dropped item without a page reload. Intentional memory bound (commit 393b6b9).

### 7. Missing month filter on DELETE fallthrough
**File:** `budget-page-content.tsx:91-95`

For DELETE events, if `expense_date` is missing from the old record, the month filter is skipped and the delta applies regardless of month. With `REPLICA IDENTITY FULL` this should not happen, but it is a defensive gap.
