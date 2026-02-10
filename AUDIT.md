# Codebase Audit (Feb 2026)

## High Priority

### [x] 1. `/budget` route is unprotected in middleware

**File:** `src/middleware.ts` (~line 62)

The middleware config matcher includes `/budget` but the conditional logic only checks for `/expenses`:

```typescript
if (!user && request.nextUrl.pathname.startsWith("/expenses"))
```

The `/budget` route is inside the `(app)` route group which assumes authentication, but the middleware doesn't enforce it. An unauthenticated user navigating directly to `/budget` will hit the page and see errors from failed Supabase queries instead of being redirected to login.

**Fix:** Guard all `(app)` routes. Either check for both paths explicitly or match any path that isn't `/` or `/login`.

---

### [x] 2. Missing `household_id` in Expense type

**File:** `src/lib/types.ts` (~lines 46-61)

The `Expense` interface doesn't include `household_id`, but the DB schema (`supabase/migrations/20260116_initial_schema.sql`) defines it as `NOT NULL` on the `expenses` table. Multiple components query and use `household_id` from expense rows (e.g. `expense-list.tsx`, `expense-form.tsx`), meaning the field is accessed without type safety.

**Fix:** Add `household_id: string` to the `Expense` interface. Audit all other interfaces in `types.ts` against the migration file to catch any other drift.

---

### [x] 3. localStorage not namespaced by user/household

**File:** `src/components/expense-form.tsx` (~lines 62-79, 342-353)

The form persists last-used category, account, and currency to localStorage under fixed keys (`lastCategoryId`, `lastAccountId`, `lastCurrency`). If a user logs out and another user logs in on the same device, or if a user switches households, the stored IDs belong to the wrong context and will silently select invalid options or cause failed lookups.

**Fix:** Namespace localStorage keys with the user or household ID, e.g. `qb:{household_id}:lastCategoryId`. Clear on logout.

---

### 4. Zero test coverage

No test files exist anywhere in the project. For a financial app handling budget calculations and money, this is risky.

**Priority areas to test first:**
- `src/lib/currency.ts` — formatting logic with European number conventions
- `src/lib/error-handler.ts` — error classification and user-facing messages
- `src/lib/date-utils.ts` — date boundary logic
- `src/lib/validations.ts` — Zod schema edge cases (negative amounts, zero, large numbers)
- Budget calculation logic (allocated vs spent vs remaining)

**Setup:** The project uses Next.js 14. Vitest is a good fit (fast, ESM-native, works with React Testing Library).

---

## Medium Priority

### [x] 5. Household ID fetched redundantly across components

**Files:**
- `src/components/expense-form.tsx` (~lines 112-149 and ~296-312) — fetches household_id twice within the same component
- `src/components/expense-list.tsx` (~lines 50-72) — fetches it again independently
- `src/hooks/use-user.ts` — a `useUser()` hook exists but isn't used consistently

Each component independently queries `users` to get `household_id` for the current auth user. This creates ~4 redundant Supabase calls per page load.

**Fix:** Create a `UserProvider` context that wraps the `(app)` layout. It should fetch user + household data once and expose it via `useUser()`. Remove all inline household fetching from components.

---

### [x] 6. Budget status color logic duplicated in 3 places

**Files:**
- `src/components/budget-summary-card.tsx` (~lines 16-26)
- `src/components/budget-category-card.tsx` (~lines 16-26)
- `src/components/category-budget-status.tsx` (~lines 41-46)

All three compute a color from `percent_spent` thresholds (green/yellow/red). The thresholds and color values are hardcoded independently in each file.

**Fix:** Extract to a shared utility, e.g. `src/lib/budget-utils.ts`:
```typescript
export function getBudgetStatusColor(percentSpent: number): string
export function getBudgetStatusLabel(percentSpent: number): string // see issue #17
```

---

### [x] 7. No React error boundaries

**File:** `src/app/(app)/layout.tsx`

If any component in the `(app)` route group throws during render, the entire app crashes with no recovery UI. Next.js provides `error.tsx` conventions for this, but none exist.

**Fix:** Add `src/app/(app)/error.tsx` (client component) that catches render errors and shows a "Something went wrong" UI with a retry button. Optionally add `src/app/global-error.tsx` for root layout errors.

---

### [x] 8. Duplicate real-time subscriptions to the same table

**Files:**
- `src/components/expense-list.tsx` (~line 123) — subscribes to `expenses` table changes
- `src/app/(app)/budget/page.tsx` — subscribes to `expenses` table changes

When the user navigates between tabs, both subscriptions may be active simultaneously, causing duplicate Postgres change events and redundant state updates.

**Fix:** Either centralize subscriptions in a shared context/provider, or ensure components unsubscribe reliably on unmount (verify cleanup functions). A shared `useExpenseSubscription()` hook that ref-counts subscribers would be ideal.

---

### [x] 9. `any` type on Supabase joined query response

**File:** `src/components/expense-form.tsx` (~line 185)

A Supabase query with `.select('*, categories(*)')` or similar join returns a complex type that's cast to `any` to avoid dealing with Supabase's generated types. This means any field access on the budget data is unchecked.

**Fix:** Use generated Supabase types (see issue #12) and properly type the query response. The Supabase JS client supports generic type parameters on `.from<T>()`.

---

### [x] 10. No debouncing on amount input budget recalculation

**File:** `src/components/expense-form.tsx` (~line 59, ~483)

`watch("amount")` from react-hook-form triggers a re-render on every keystroke. The budget impact preview recalculates on each change. For fast typists this means multiple unnecessary renders per second.

**Fix:** Use `useDebouncedValue` or `useWatch` with a debounce wrapper (~300ms) for the budget preview calculation only. Keep the form input itself responsive.

---

## Low Priority

### [x] 11. Dead login redirect page

**File:** `src/app/login/page.tsx`

This 5-line server component just redirects to `/`. The middleware already handles redirecting `/login` to `/` for authenticated users, and unauthenticated users see the login form at `/`. This file serves no purpose.

**Fix:** Delete `src/app/login/page.tsx` and the `src/app/login/` directory.

---

### [x] 12. Types manually maintained instead of generated

**File:** `src/lib/types.ts`

All TypeScript interfaces are hand-written and can drift from the actual database schema (issue #2 is an example of this drift). Supabase CLI can auto-generate types from the running database.

**Fix:** Add a script: `supabase gen types typescript --local > src/lib/database.types.ts`. Use the generated types as the source of truth and derive application types from them. Add to `package.json` scripts so it runs after migrations.

---

### [x] 13. DOM manipulation instead of React refs

**File:** `src/components/expense-form.tsx` (~line 370-374)

Uses `document.getElementById("amount-input")?.focus()` to refocus the amount field after submission. This bypasses React's rendering model and can break if the DOM structure changes.

**Fix:** Use `useRef<HTMLInputElement>()` and pass it to the input's `ref` prop.

---

### 14. Uncleaned setTimeout on unmount

**File:** `src/components/expense-form.tsx` (~line 357)

A `setTimeout` is used (likely for the success feedback animation) without storing the timer ID and clearing it in a cleanup function. If the component unmounts before the timer fires, it will try to update state on an unmounted component.

**Fix:** Store the timer ID in a ref and clear it in the useEffect cleanup or component unmount.

---

### 15. Inconsistent currency formatting

**Files:**
- `src/lib/currency.ts` — has a proper `formatCurrency()` with European conventions (space separator, comma decimal)
- Various components use `.toFixed(2)` instead

**Fix:** Grep for `.toFixed` and replace with `formatCurrency()` calls. The utility already handles the locale-specific formatting.

---

### 16. No skeleton loading states

**Files:**
- `src/components/expense-form.tsx` (~lines 388-394) — shows "Loading form..." text
- `src/app/(app)/budget/page.tsx` — shows "Loading..." text

Plain text loading indicators cause layout shift when content appears and feel unpolished.

**Fix:** Use shadcn/ui's `Skeleton` component to match the shape of the actual content. The component is already available in `src/components/ui/`.

---

### 17. Color-only budget status indicators

**Files:** Same as issue #6 — `budget-summary-card.tsx`, `budget-category-card.tsx`, `category-budget-status.tsx`

Budget status uses only color (green/yellow/red) to indicate spending level. ~8% of men have some form of color vision deficiency.

**Fix:** Add text labels ("On track", "Warning", "Over budget") or icons alongside colors. Can be addressed together with issue #6 when extracting the shared utility.
