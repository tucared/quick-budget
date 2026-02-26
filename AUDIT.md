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

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 3 | `_householdId` prop unused in expense list and burndown chart | `expense-list-client.tsx:18`, `budget-burndown-chart-client.tsx:49` | Remove unused props |
| 4 | `logError` is a no-op in production (no Sentry/observability) | `error-handler.ts:111` | Wire up an error reporting service |
| 5 | No favicon | `layout.tsx` | Add `favicon.ico` to `src/app/` |
| 6 | Duplicate subscription manager pattern (~130 lines each) | `use-expense-subscription.ts`, `use-budget-allocation-subscription.ts` | Extract generic `RealtimeSubscriptionManager<T>` |
| 7 | Redundant `idx_exchange_rates_date` index — covered by `idx_exchange_rates_currency_date` | `migrations:249` | Remove redundant index |
| 8 | npm audit: 2 dev-only vulnerabilities — `minimatch` (high, ReDoS) and `ajv` (moderate, ReDoS) | transitive deps | Run `npm audit fix` |
| 9 | `console.log` in production code for weekend date adjustment | `exchange-rate-api.ts:54` | Remove or gate behind debug flag |
| 10 | Categories table not in realtime publication — renames/additions won't push to other clients | `migrations:550-556` | Add `ALTER PUBLICATION supabase_realtime ADD TABLE categories` |

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
