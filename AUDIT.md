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
| 1 | **No loading state when navigating between months** | `budget/page.tsx` | Add `loading.tsx` or use `useTransition` |
| 2 | **`autoFocus` on hidden input causes keyboard flicker on iOS** | `expense-form.tsx:455` | Test on iOS Safari; consider a visible focusable element |

## Low

| # | Issue | Location | Fix | Status |
|---|-------|----------|-----|--------|
| 3 | ~~`_householdId` prop unused in expense list and burndown chart~~ | `expense-list-client.tsx`, `budget-burndown-chart-client.tsx` | Removed unused props and cleaned up callers | **Fixed** |
| 4 | `logError` is a no-op in production (no Sentry/observability) | `error-handler.ts:111` | Wire up an error reporting service | Open |
| 5 | No favicon | `layout.tsx` | Add `favicon.ico` to `src/app/` | Open |
| 6 | ~~Duplicate subscription manager pattern (~130 lines each)~~ | `use-expense-subscription.ts`, `use-budget-allocation-subscription.ts` | Extracted generic `RealtimeSubscriptionManager<T>` in `realtime-subscription-manager.ts` | **Fixed** |
| 7 | ~~Redundant `idx_exchange_rates_date` index~~ | `migrations` | Removed redundant index | **Fixed** |
| 8 | ~~npm audit: 2 dev-only vulnerabilities~~ | transitive deps | Ran `npm audit fix` — 0 vulnerabilities | **Fixed** |
| 9 | ~~`console.log` in production code for weekend date adjustment~~ | `exchange-rate-api.ts` | Removed console.log | **Fixed** |
| 10 | ~~Categories table not in realtime publication~~ | `migrations` | Added `ALTER PUBLICATION supabase_realtime ADD TABLE categories` + `REPLICA IDENTITY FULL` | **Fixed** |

---

## Build & Dependency Status

| Check | Result |
|-------|--------|
| `npm run build` | Compiles successfully, no TypeScript errors |
| `npm run lint` | Clean, no warnings or errors |
| `npm audit` | 0 vulnerabilities |

| Package | Current | Note |
|---------|---------|------|
| next | 16.1.6 | Current |
| react | 19.2.4 | Current |
| @supabase/supabase-js | 2.95.3 | Minor updates available |
| zod | 4.3.6 | Current |
| typescript | 5.x | Current |
| eslint | 9.39.2 | v10 major available (breaking changes) |
