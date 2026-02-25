# Codebase Audit

Last updated: 2026-02-24

## Critical

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| ~~1~~ | ~~**No auth middleware** — routes are only protected by server components, so unauthenticated requests still hit the full render pipeline~~ | ~~Missing `src/middleware.ts`~~ | ~~Fixed: created `src/middleware.ts` that refreshes sessions and redirects unauthenticated users at the edge~~ |

## High — Security & Data Integrity

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| ~~2~~ | ~~**Exchange rate API is unauthenticated** — anyone can flood it~~ | ~~`api/exchange-rates/route.ts`~~ | ~~Fixed: added `getUser()` session check returning 401 for unauthenticated requests~~ |
| ~~3~~ | ~~**Rebalance is non-atomic** — if destination update fails after source update, money disappears~~ | ~~`rebalance-dialog.tsx:115`~~ | ~~Fixed: created `rebalance_budget` RPC that performs both updates in a single transaction with row locking~~ |
| 4 | **Budget save is non-atomic** — upsert + delete are separate calls | `budget-edit-dialog.tsx:154` | Same fix: wrap in a database transaction via RPC |
| 5 | **No server-side validation for budget mutations** — only client-side checks on transfer amounts, no guard against negative allocations | `rebalance-dialog.tsx`, `budget-edit-dialog.tsx` | Add Zod validation in an RPC or Server Action |
| 6 | **Login exposes raw Supabase error messages** | `login/page.tsx:38` | Map all auth errors to generic "Invalid email or password" |

## High — Performance

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 7 | **`useUser` makes 2 sequential DB calls on every client mount** (on top of server-side fetch) | `use-user.ts:26` | Seed `UserProvider` with server-fetched data as initial props |
| 8 | **Expense form fetches all 30-day expenses for category ranking** | `expense-form.tsx:175` | Use `GROUP BY category_id ORDER BY count DESC LIMIT 5` in the query |
| 9 | **`reloadBudgets` runs 2 queries sequentially** | `budget-page-content.tsx:59` | Use `Promise.all()` to parallelize |

## High — UX

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 10 | **No loading state when navigating between months** | `budget/page.tsx` | Add `loading.tsx` or use `useTransition` |
| 11 | **`autoFocus` on hidden input causes keyboard flicker on iOS** | `expense-form.tsx:473` | Test on iOS Safari; consider a visible focusable element |

## Medium

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 12 | Budget preview uses hardcoded exchange rate (`0.17` for BRL) instead of fetched rate | `expense-form.tsx:533` | Pass fetched rate to the preview calculation |
| 13 | `getCategories` fetches inactive categories server-side (filtered again in JS) | `server/data.ts:219` | Add `.eq("is_active", true)` to the query |
| 14 | Date parsing UTC vs local inconsistency — `new Date("2026-01-15")` is UTC, but month boundaries are local time | `category-expense-dialog.tsx:67` | Use `new Date(date + "T00:00:00")` for local parsing (already done elsewhere) |
| 15 | `activeCategories` computed inline breaks `useCallback` memoization | `budget-edit-dialog.tsx:50` | Wrap in `useMemo` |
| 16 | Inconsistent decimal precision in category expense dialog (0 vs 2 decimals) | `category-expense-dialog.tsx:98` | Use same precision for allocated/spent/remaining |
| 17 | No `aria-live` region for form success feedback | `expense-form.tsx:596` | Add `aria-live="polite"` to success message |
| 18 | Duplicate `PGRST116` code check — second branch unreachable | `error-handler.ts:64,73` | Fix the second code to match the intended PostgREST error |

## Low

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 19 | `_householdId` prop unused in expense list and burndown chart | `expense-list-client.tsx:18`, `budget-burndown-chart-client.tsx:49` | Remove unused props |
| 20 | `logError` is a no-op in production (no Sentry/observability) | `error-handler.ts:111` | Wire up an error reporting service |
| 21 | `recharts` not lazy-loaded — adds to initial bundle | `budget-burndown-chart-client.tsx` | Use `next/dynamic({ ssr: false })` |
| 22 | No favicon | `layout.tsx` | Add `favicon.ico` to `src/app/` |
| 23 | Duplicate subscription manager pattern (~130 lines each) | `use-expense-subscription.ts`, `use-budget-allocation-subscription.ts` | Extract generic `RealtimeSubscriptionManager<T>` |
