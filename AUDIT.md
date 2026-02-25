# Codebase Audit

Last updated: 2026-02-25

## Overall Assessment

**Security: 8/10** — Strong RLS, proper auth, no injection vectors. Main gaps: missing RLS policies on households table, RPC functions don't validate household ownership, no security headers.

**Code Quality: 8/10** — Clean TypeScript with strict mode, consistent patterns, good error handling. Minor React hook dependency issues, some code duplication in subscription managers.

**Architecture: 9/10** — Well-structured server/client component split, proper realtime subscriptions with singleton managers, atomic RPCs for budget mutations, good separation of concerns.

---

## Critical — Database Security

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | **Missing INSERT/UPDATE/DELETE policies on `households` table** — any authenticated user can create/modify/delete households | `migrations:103-106` | Add restrictive policies (e.g. deny all mutations, or restrict UPDATE to household members) |
| 2 | **Missing household ownership validation in RPCs** — `rebalance_budget()` and `save_budget()` accept arbitrary `p_household_id` without verifying the caller belongs to that household. RLS on underlying tables provides partial protection but the RPCs execute multiple statements | `migrations:385,455` | Add `IF p_household_id != get_my_household_id() THEN RAISE EXCEPTION; END IF;` at start of each RPC |
| 3 | **Missing `logged_by_user_id` guard on expenses INSERT policy** — only validates `household_id`, allowing a user to impersonate another household member when logging expenses | `migrations:201-204` | Add `AND logged_by_user_id = (SELECT auth.uid())` to WITH CHECK clause |

## High — Security & Data Integrity

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 4 | **No security headers configured** — missing CSP, X-Frame-Options, X-Content-Type-Options, HSTS | `next.config.js` | Add `headers()` configuration |
| 5 | **No rate limiting on exchange-rate API** — authenticated but no throttling; repeated non-cached requests stress Frankfurter API | `api/exchange-rates/route.ts` | Add rate-limiting middleware or use Vercel's built-in |
| 6 | **Missing UPDATE/DELETE policies on `exchange_rates`** — any authenticated user can modify/delete cached rate history | `migrations:240-245` | Add `FOR UPDATE USING (FALSE)` and `FOR DELETE USING (FALSE)` policies |
| 7 | **Missing DELETE policy on `users` table** — relies on default-deny; an explicit policy is safer | `migrations:100` | Add `CREATE POLICY ... FOR DELETE USING (id = auth.uid())` |

## High — Performance

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 8 | **Missing composite index on `expenses(household_id, expense_date)`** — monthly queries filter both columns but only have separate indexes | `migrations:217-220` | Add `CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date DESC)` |
| 9 | **`reloadBudgets` runs 2 queries sequentially** | `budget-page-content.tsx:59` | Use `Promise.all()` to parallelize |
| 10 | **`recharts` not lazy-loaded** — adds ~200KB to initial bundle | `budget-burndown-chart-client.tsx` | Use `next/dynamic({ ssr: false })` |

## High — UX

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 11 | **No loading state when navigating between months** | `budget/page.tsx` | Add `loading.tsx` or use `useTransition` |
| 12 | **`autoFocus` on hidden input causes keyboard flicker on iOS** | `expense-form.tsx:455` | Test on iOS Safari; consider a visible focusable element |

## Medium

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 13 | Budget preview uses deprecated `convertToEUR()` with hardcoded rate instead of fetched rate | `expense-form.tsx:516` | Pass fetched rate to the preview calculation |
| 14 | `getCategories` fetches inactive categories server-side (filtered again in JS) | `server/data.ts:222-225` | Add `.eq("is_active", true)` to the query |
| 15 | Date parsing UTC vs local inconsistency — `new Date("2026-01-15")` is UTC, but month boundaries are local | `category-expense-dialog.tsx:67` | Use `new Date(date + "T00:00:00")` for local parsing |
| 16 | `activeCategories` computed inline breaks `useCallback` memoization | `budget-edit-dialog.tsx:50,101` | Wrap in `useMemo` |
| 17 | Inconsistent decimal precision in category expense dialog (0 vs 2 decimals) | `category-expense-dialog.tsx:99-110` | Use same precision for allocated/spent/remaining |
| 18 | Duplicate `PGRST116` code check — second branch unreachable | `error-handler.ts:64,73` | Fix the second code to match the intended PostgREST error (e.g. `PGRST200` for multiple rows) |
| 19 | No `aria-live` region for form success feedback | `expense-form.tsx:580-583` | Add `aria-live="polite"` to success message |
| 20 | Inconsistent RLS policy pattern — some tables use inline subquery, others use `get_my_household_id()` helper | `migrations` (categories, expenses, budget_allocations) | Refactor to use helper consistently |

## Low

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 21 | `_householdId` prop unused in expense list and burndown chart | `expense-list-client.tsx:18`, `budget-burndown-chart-client.tsx:49` | Remove unused props |
| 22 | `logError` is a no-op in production (no Sentry/observability) | `error-handler.ts:111` | Wire up an error reporting service |
| 23 | No favicon | `layout.tsx` | Add `favicon.ico` to `src/app/` |
| 24 | Duplicate subscription manager pattern (~130 lines each) | `use-expense-subscription.ts`, `use-budget-allocation-subscription.ts` | Extract generic `RealtimeSubscriptionManager<T>` |
| 25 | Redundant `idx_exchange_rates_date` index — covered by `idx_exchange_rates_currency_date` | `migrations:249` | Remove redundant index |
| 26 | npm audit: 2 dev-only vulnerabilities — `minimatch` (high, ReDoS) and `ajv` (moderate, ReDoS) | transitive deps | Run `npm audit fix` |
| 27 | `console.log` in production code for weekend date adjustment | `exchange-rate-api.ts:54` | Remove or gate behind debug flag |
| 28 | Categories table not in realtime publication — renames/additions won't push to other clients | `migrations:550-556` | Add `ALTER PUBLICATION supabase_realtime ADD TABLE categories` |

---

## Previously Fixed

| # | Issue | Status |
|---|-------|--------|
| ~~P1~~ | ~~No auth middleware — routes only protected by server components~~ | Fixed: `src/proxy.ts` (Next.js 16 convention) |
| ~~P2~~ | ~~Exchange rate API unauthenticated~~ | Fixed: `getUser()` session check returning 401 |
| ~~P3~~ | ~~Rebalance is non-atomic~~ | Fixed: `rebalance_budget` RPC with row locking |
| ~~P4~~ | ~~Budget save is non-atomic~~ | Fixed: `save_budget` RPC in single transaction |
| ~~P5~~ | ~~No server-side validation for budget mutations~~ | Fixed: guards in RPCs |
| ~~P6~~ | ~~Login exposes raw Supabase error messages~~ | Fixed: generic error messages |
| ~~P7~~ | ~~`useUser` makes 2 sequential DB calls on every client mount~~ | Fixed: `initialUser` from server |
| ~~P8~~ | ~~Expense form fetches all 30-day expenses for ranking~~ | Fixed: `top_categories_by_usage` RPC |

---

## Build & Dependency Status

| Check | Result |
|-------|--------|
| `npm run build` | Compiles successfully, no TypeScript errors |
| `npm run lint` | Clean, no warnings or errors |
| `npm audit` | 2 dev-only vulnerabilities (fixable via `npm audit fix`) |

| Package | Current | Note |
|---------|---------|------|
| next | 16.1.6 | Current |
| react | 19.2.4 | Current |
| @supabase/supabase-js | 2.95.3 | Minor updates available |
| zod | 4.3.6 | Current |
| typescript | 5.x | Current |
| eslint | 9.39.2 | v10 major available (breaking changes) |
