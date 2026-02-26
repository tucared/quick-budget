# Codebase Audit

Last updated: 2026-02-26

## Overall Assessment

**Security: 8/10** — Strong RLS, proper auth, no injection vectors. Main gaps: missing RLS policies on households table, RPC functions don't validate household ownership, no security headers.

**Code Quality: 8/10** — Clean TypeScript with strict mode, consistent patterns, good error handling. Minor React hook dependency issues, some code duplication in subscription managers.

**Architecture: 9/10** — Well-structured server/client component split, proper realtime subscriptions with singleton managers, atomic RPCs for budget mutations, good separation of concerns.

---

## High — UX

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 11 | **No loading state when navigating between months** | `budget/page.tsx` | Add `loading.tsx` or use `useTransition` |
| 12 | **`autoFocus` on hidden input causes keyboard flicker on iOS** | `expense-form.tsx:455` | Test on iOS Safari; consider a visible focusable element |

## Medium

| # | Issue | Location | Fix |
|---|-------|----------|-----|
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
| P1 | No auth middleware — routes only protected by server components | Fixed: `src/proxy.ts` (Next.js 16 convention) |
| P2 | Exchange rate API unauthenticated | Fixed: `getUser()` session check returning 401 |
| P3 | Rebalance is non-atomic | Fixed: `rebalance_budget` RPC with row locking |
| P4 | Budget save is non-atomic | Fixed: `save_budget` RPC in single transaction |
| P5 | No server-side validation for budget mutations | Fixed: guards in RPCs |
| P6 | Login exposes raw Supabase error messages | Fixed: generic error messages |
| P7 | `useUser` makes 2 sequential DB calls on every client mount | Fixed: `initialUser` from server |
| P8 | Expense form fetches all 30-day expenses for ranking | Fixed: `top_categories_by_usage` RPC |
| P9 | Missing `logged_by_user_id` guard on expenses INSERT policy | Fixed: `AND logged_by_user_id = (SELECT auth.uid())` added to WITH CHECK clause |
| P10 | Missing INSERT/UPDATE/DELETE policies on `households` table | Fixed: added restrictive policies |
| P11 | Missing household ownership validation in RPCs | Fixed: added `get_my_household_id()` ownership check at start of each RPC |
| P12 | No security headers configured | Fixed: added `headers()` with CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS |
| P13 | No rate limiting on exchange-rate API | Fixed: in-memory sliding-window rate limiter (20 req/user/min) with 429 + Retry-After |
| P14 | Missing UPDATE/DELETE policies on `exchange_rates` | Fixed: `FOR UPDATE USING (FALSE)` and `FOR DELETE USING (FALSE)` policies |
| P15 | Missing DELETE policy on `users` table | Fixed: `FOR DELETE USING (id = auth.uid())` policy |
| P16 | Missing composite index on `expenses(household_id, expense_date)` | Fixed: added `idx_expenses_household_date` composite index |
| P17 | `reloadBudgets` runs 2 queries sequentially | Fixed: parallelized with `Promise.all()` |
| P18 | `recharts` not lazy-loaded | Fixed: lazy-loaded with `next/dynamic({ ssr: false })` |
| P19 | Budget preview uses deprecated `convertToEUR()` with hardcoded rate | Fixed: preview now uses exchange rate fetched from API |
| P20 | `getCategories` fetches inactive categories server-side | Fixed: added `.eq("is_active", true)` filter |
| P21 | Date parsing UTC vs local inconsistency | Fixed: local date parsing with `"T00:00:00"` suffix |
| P22 | `activeCategories` computed inline breaks memoization | Fixed: wrapped in `useMemo` |
| P23 | Inconsistent decimal precision in category expense dialog | Fixed: consistent 2-decimal formatting |
| P24 | Duplicate `PGRST116` code check — unreachable branch | Fixed: consolidated with message disambiguation |
| P25 | No `aria-live` region for form success feedback | Fixed: added sr-only `aria-live="polite"` region |

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
