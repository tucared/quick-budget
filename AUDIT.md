# Codebase Audit: Over-engineering & Dead Code

Audit date: 2026-02-26

---

## Dead Code

### 1. Entire file unused — `src/proxy.ts`

An 87-line middleware proxy file exists at the root of `src/` but is **never imported** and there is **no `middleware.ts`** in the project. Auth protection is handled by Supabase RLS + server-side redirects in page components instead.

**Action:** Delete `src/proxy.ts`.

### 2. Deprecated functions never called — `currency.ts:18-40`

`convertToEUR()` and `getExchangeRate()` are marked `@deprecated` and exported, but **never imported anywhere** in the codebase. The comment says "kept for backwards compatibility" but there are no consumers. The fallback rates they contain are also duplicated in the API route (`app/api/exchange-rates/route.ts:123-130`).

**Action:** Remove both functions and the `DEPRECATED` comment block. The `FALLBACK_RATES_TO_EUR` constant can stay since `fetchExchangeRateFromAPI` uses it as a fallback on line 80.

### 3. Unused `GroupedCombobox` component — `components/grouped-combobox.tsx`

The entire 134-line `GroupedCombobox` component is **never rendered**. It was superseded by `CategoryTileSelector`, which reimplements the same grouping/sorting logic inline. Only the `GroupedOption` type is imported from this file.

**Action:** Move the `GroupedOption` interface to `category-tile-selector.tsx` (its only real consumer) and delete `grouped-combobox.tsx`.

### 4. Unused server data functions — `lib/server/data.ts:107-155`

Two exported functions are **never called anywhere**:
- `getBudgetAllocations()` (line 107)
- `getBudgetHistory()` (line 131)

**Action:** Remove both functions.

### 5. Unused type `ExpenseFormData` — `lib/types.ts:19-26`

The `ExpenseFormData` interface is exported but **never imported**. The codebase uses the Zod-inferred `ExpenseFormValues` from `validations.ts` instead.

**Action:** Remove the interface.

### 6. Unused type `Household` — `lib/types.ts:12`

`Household` is exported but **never imported** by any file.

**Action:** Remove it.

### 7. Unused validation schema — `validations.ts:35-46`

`budgetAllocationInputSchema` and its inferred type `BudgetAllocationInput` are defined but **never imported** by any component or API route.

**Action:** Remove both.

### 8. Unused `onSuccess` prop — `components/expense-form.tsx:26`

The `ExpenseForm` component declares an `onSuccess?: () => void` prop, but the only consumer (`ExpensesPageClient`) never passes it. Only `onExpenseSaved` is actually used.

**Action:** Remove the `onSuccess` prop and its usage on lines 393-396.

### 9. Unused `householdId` prop — `components/category-expense-dialog.tsx`

The prop is accepted but immediately aliased to `_householdId` to suppress the unused variable warning. It is never referenced in the component body.

**Action:** Remove the prop from the interface and the destructuring.

### 10. Unreachable error branch — `components/budget-burndown-chart-client.tsx:51`

```typescript
const [error] = useState("")
```

`error` is initialized to `""` and **never set**. The conditional `if (error)` on line 161 is always false, making the error UI (lines 161-174) unreachable dead code.

**Action:** Remove the state and the dead error rendering block.

### 11. Unnecessary exports in `error-handler.ts`

Only `getErrorMessage()` is imported by consumers. The following are exported but **never imported**:
- `ErrorType` type (line 3)
- `AppError` interface (line 5)
- `handleSupabaseError()` function (line 14)
- `logError()` function (line 105)

**Action:** Remove the `export` keyword from all four. They can remain as internal helpers to `getErrorMessage()`.

### 12. Unnecessary exports in `budget-utils.ts`

- `BudgetStatus` type — never imported externally
- `getBudgetStatus()` function — never imported externally (only called internally by the other functions)

**Action:** Remove the `export` keyword from both.

---

## Over-engineering

### 13. `getBudgetStatusIcon` is a no-op — `budget-utils.ts:43-52`

The `statusIcons` record maps every status to the same value `"●"`. This function always returns `"●"` regardless of input, making it a pointless abstraction.

**Action:** Inline the `"●"` string literal at the two call sites and remove the function and its record.

### 14. Duplicated `UserData` interface

The same `UserData` shape is defined independently in two files:
- `lib/hooks/use-user.ts:4-9` (exported)
- `lib/server/data.ts:11-16` (private)

**Action:** Define once in `lib/types.ts` and import in both files.

### 15. Duplicated fallback exchange rates

Hardcoded fallback rates exist in two places:
- `lib/currency.ts:8-13` — `FALLBACK_RATES_TO_EUR`
- `app/api/exchange-rates/route.ts:123-130` — inline `fallbackRates`

The API route version is a superset (includes CHF, JPY, CAD). If the API route fails, it returns its own fallback. If `fetchExchangeRateFromAPI` fails client-side, it falls back to the `currency.ts` version. The two can drift.

**Action:** Extract a single shared `FALLBACK_RATES` constant and import it in both places.

### 16. Duplicated grouping/sorting logic

`CategoryTileSelector` (lines 48-61) duplicates the grouping + frequency-sorting logic from `GroupedCombobox` (lines 51-74), even referencing it in a comment: `"same logic as GroupedCombobox"`.

**Action:** After removing `GroupedCombobox` (finding #3), if this logic is needed again elsewhere, extract a plain utility function.

### 17. Dead `fromApi` guard — `app/api/exchange-rates/route.ts:144`

```typescript
if (fromApi) { // line 144
```

This is always `true` at this point because the `catch` block (line 118) that would have set `fromApi = false` does an early return on line 134. The variable and the conditional add nothing.

**Action:** Remove the `fromApi` variable and the `if` guard. The caching code always executes at this point.

### 18. Redundant PGRST116 check — `app/api/exchange-rates/route.ts:93`

```typescript
if (selectError && selectError.code !== 'PGRST116') {
```

Since the query uses `.maybeSingle()`, it returns `null` for zero results instead of erroring with PGRST116. This check can never match.

**Action:** Simplify to `if (selectError) { ... }`.

### 19. Realtime hooks bypass UserProvider context

Both `use-expense-subscription.ts` and `use-budget-allocation-subscription.ts` import `useUser` directly from `./use-user` (the raw hook), not from `@/lib/contexts/user-context`. This means each subscription hook makes its own independent auth call to Supabase, rather than sharing the user data already loaded by `UserProvider`.

**Action:** Import `useUser` from `@/lib/contexts/user-context` instead. This eliminates redundant Supabase auth calls.

---

## Summary by priority

### Quick wins (remove dead code, no behavior change)
| # | Finding | File(s) | Lines to remove |
|---|---------|---------|----------------|
| 1 | Entire unused file | `src/proxy.ts` | ~87 lines |
| 2 | Deprecated currency functions | `currency.ts` | ~25 lines |
| 3 | Unused `GroupedCombobox` | `grouped-combobox.tsx` | ~134 lines |
| 4 | Unused server data functions | `server/data.ts` | ~50 lines |
| 5 | Unused `ExpenseFormData` type | `types.ts` | ~8 lines |
| 6 | Unused `Household` type | `types.ts` | ~1 line |
| 7 | Unused validation schema | `validations.ts` | ~12 lines |
| 8 | Unused `onSuccess` prop | `expense-form.tsx` | ~5 lines |
| 9 | Unused `householdId` prop | `category-expense-dialog.tsx` | ~2 lines |
| 10 | Unreachable error branch | `budget-burndown-chart-client.tsx` | ~15 lines |
| 11 | Unnecessary exports | `error-handler.ts` | keyword only |
| 12 | Unnecessary exports | `budget-utils.ts` | keyword only |

### Moderate effort (consolidation, small refactors)
| # | Finding | File(s) |
|---|---------|---------|
| 13 | No-op `getBudgetStatusIcon` | `budget-utils.ts` + 2 consumers |
| 14 | Duplicated `UserData` | `use-user.ts` + `server/data.ts` |
| 15 | Duplicated fallback rates | `currency.ts` + `route.ts` |
| 16 | Duplicated grouping logic | `category-tile-selector.tsx` |
| 17 | Dead `fromApi` variable | `route.ts` |
| 18 | Redundant PGRST116 check | `route.ts` |
| 19 | Realtime hooks bypass context | 2 hook files |
