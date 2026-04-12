# Simplification TODO

Remaining items from the performance & simplicity audit. Tasks 1-4 are done.

---

## ~~4. Consolidate CentsInput usage across forms~~ ✅

**Files:** `src/components/expense-form.tsx`, `src/components/edit-expense-dialog.tsx`, `src/components/ui/cents-input.tsx`

**Problem:** `formatCentsDisplay` is copy-pasted in all three files. The keydown/change handlers (`handleAmountKeyDown`, `handleAmountChange`) are also near-identical across expense-form (lines 90-112) and edit-expense-dialog (lines 108-123).

**What to do:**
- Both forms should import `formatCentsDisplay` from `@/components/ui/cents-input` (it's already exported there)
- Delete the local `formatCentsDisplay` declarations in expense-form.tsx (line 79-85) and edit-expense-dialog.tsx (line 100-106)
- The keydown handlers are almost identical — the only difference is expense-form adds Enter → focus description. Not worth extracting a shared hook for this, but the formatCentsDisplay import alone saves ~15 duplicated lines.

---

## ~~5. Consolidate ExpenseForm state~~ ✅

**File:** `src/components/expense-form.tsx`

**Problem:** 12 useState hooks, 4 useEffect. The `budgetRefreshTick` + `debouncedBudgetRefreshTick` double-debounce pattern (lines 42-44) is confusing.

**What was done:**
- Merged `loadingData` + `loadError` into a single discriminated union `loadState: { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: string }` — eliminates impossible states (e.g. loading=true + error set).
- The double-debounce pattern was left as-is — it works correctly and is only 3 lines.

---

## 6. Pass initial data to BudgetEditDialog instead of re-fetching

**Files:** `src/components/budget-edit-dialog.tsx`, `src/components/budget-page-content.tsx`

**Problem:** When the edit dialog opens, it fetches allocations + target from Supabase (lines 54-103 in budget-edit-dialog.tsx). But the parent page already has `budgets: BudgetSummary[]` and `target: MonthlyBudgetTarget | null` — which contain the allocation ID, category ID, and allocated amount.

**What to do:**
1. Add optional props to `BudgetEditDialog`:
   ```ts
   interface BudgetEditDialogProps {
     // ... existing props ...
     initialAllocations?: BudgetSummary[]  // from parent's budget + allowance state
     initialTarget?: MonthlyBudgetTarget | null
   }
   ```
2. In `loadData()`, if `initialAllocations` and `initialTarget` are provided, construct entries from them instead of fetching:
   ```ts
   // BudgetSummary has .id (which IS the allocation ID), .category_id, .allocated_amount
   const newEntries = activeCategories.map((cat) => {
     const existing = initialAllocations.find((a) => a.category_id === cat.id)
     return {
       categoryId: cat.id,
       cents: existing ? Math.round(Number(existing.allocated_amount) * 100) : 0,
       existingAllocationId: existing?.id,
     }
   })
   ```
3. In budget-page-content.tsx, pass `initialAllocations={[...budgets, ...allowances]}` and `initialTarget={target}` to the dialog.

**Saves:** 1-2 Supabase queries per dialog open.

---

## 7. Split CategoryBudgetCard into focused components

**File:** `src/components/category-budget-card.tsx`

**Verdict:** After re-reading the component (145 lines, 9 props), this is fine as-is. The two use cases (budget page with header/click and expense form with preview) share enough rendering logic that splitting would create more code than it saves. **Skip.**

---

## 8. Clarify exchange rate paths

**Files:** `src/lib/exchange-rate-api.ts`, `src/lib/currency.ts`

**Problem:** Two functions doing similar things:
- `fetchExchangeRate()` in exchange-rate-api.ts — calls Frankfurter API directly (server-side only, used in the API route)
- `fetchExchangeRateFromAPI()` in currency.ts — calls the `/api/exchange-rates` Next.js route (client-side, with DB caching + rate limiting)

**What to do:** Add a JSDoc note to each function clarifying context:
- `exchange-rate-api.ts`: add `@internal Server-side only — used by the /api/exchange-rates route. Client code should use fetchExchangeRateFromAPI() from currency.ts.`
- `currency.ts`: already has a note "This is the recommended way to get exchange rates" — could add `Client-side function that goes through the /api/exchange-rates route for caching + rate limiting.`

This is documentation, not code — lowest priority.
