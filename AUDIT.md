# Codebase Audit Report

**Date:** 2026-02-10
**Scope:** Full codebase review - architecture, security, code quality, data model, dependencies

---

## Executive Summary

Quick Budget is a well-structured Next.js 14 + Supabase application for household expense tracking. The codebase is clean, follows consistent patterns, and has solid security fundamentals. This audit identified **1 TypeScript error**, **4 high-severity dependency vulnerabilities**, and several code quality issues and architectural gaps worth addressing.

**Overall Assessment: Good foundation with specific areas needing attention.**

---

## 1. Security

### 1.1 Authentication & Authorization - PASS

- **Middleware** (`src/middleware.ts`): Correctly protects all routes except `/` and `/login`. Session refresh via cookie management follows the official Supabase SSR pattern.
- **RLS Policies** (migration): All 6 tables have RLS enabled with household-scoped policies. The `get_my_household_id()` SECURITY DEFINER function avoids RLS recursion correctly.
- **Auth trigger** (`handle_new_user()`): Uses `SECURITY DEFINER` with `SET search_path = ''` to prevent search_path attacks.

### 1.2 Input Validation - PASS

- **Zod schemas** (`src/lib/validations.ts`): Expense form validates amount (positive, max 9.9B), UUIDs for category/account, date format regex, and description length (max 500).
- **Form validation**: Uses `zodResolver` with React Hook Form for client-side validation.
- **Database constraints**: Server-side CHECK constraints on amounts (`> 0`), currency length (`= 3`), and account_type enum.

### 1.3 XSS / Injection - PASS

- No `dangerouslySetInnerHTML`, `eval()`, or `Function()` usage found.
- All database operations use the Supabase SDK (parameterized queries).
- Text content rendered safely via React's built-in escaping.

### 1.4 Secrets Management - PASS

- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in client code (safe to expose).
- `.env*.local` and `.env` are in `.gitignore`.
- Seed credentials are for local development only (`user1@example.com / password1`).

### 1.5 Security Concerns

| ID | Severity | Finding |
|----|----------|---------|
| S1 | **Medium** | `minimum_password_length = 6` in `supabase/config.toml:172` is weak. Recommend 8+. `password_requirements` is empty (no complexity rules). |
| S2 | **Low** | `enable_signup = true` in auth config means anyone can create accounts. Fine for local dev, but verify this is intentional for production. |
| S3 | **Low** | The `budget_summary` view uses `security_invoker = true` which is correct, but the view joins 3 tables. If RLS policies diverge (e.g., a category becomes inaccessible), the view may silently omit data rather than error. |
| S4 | **Info** | Error handler at `src/lib/error-handler.ts:91-96` falls through to returning the raw Supabase `err.message` to the user. While these are typically safe, a defense-in-depth approach would sanitize all messages. |

---

## 2. TypeScript & Build

### 2.1 TypeScript Errors - FAIL (1 error)

```
src/components/expense-form.tsx:451 - error TS2540: Cannot assign to 'current'
because it is a read-only property.
```

**Root cause:** Line 451 assigns to `amountInputRef.current` inside a callback ref, but `useRef<HTMLInputElement>(null)` creates a `RefObject` with a readonly `.current` in React 18's strict types.

**Fix:** Change `useRef<HTMLInputElement>(null)` to `useRef<HTMLInputElement | null>(null)` to get a `MutableRefObject`.

### 2.2 ESLint - NOT CONFIGURED

ESLint is listed as a dependency but `.eslintrc.json` is missing. Running `npm run lint` prompts for initial setup. The lint step is effectively non-functional.

### 2.3 Build

Build fails in this environment due to Google Fonts network dependency (`next/font/google` for Inter). This is expected in offline environments. For CI resilience, consider a `next/font/local` fallback or self-hosting the font.

---

## 3. Dependencies

### 3.1 Vulnerability Audit - 4 HIGH

| Package | Severity | Issue |
|---------|----------|-------|
| `next` 14.2.x | **High** | [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) - DoS via Image Optimizer |
| `next` 14.2.x | **High** | [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) - HTTP request deserialization DoS |
| `glob` 10.x (via eslint-config-next) | **High** | [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) - Command injection via CLI |
| `eslint-config-next` 14.x | **High** | Transitive via glob |

**Recommendation:** Upgrade `next` to `>=15.5.10` and `eslint-config-next` to `>=15.0.1`. This is a breaking change (Next.js 14 -> 15) but critical for production.

### 3.2 Dependency Observations

- `date-fns` is imported but date utilities (`src/lib/date-utils.ts`) re-implement basic date formatting manually. The `date-fns` import is only used in `expense-list.tsx:4` and `budget-burndown-chart.tsx:5`. Consider standardizing on one approach.
- `csv-parse` and `csv-stringify` are in `devDependencies` which is correct (used only by seed transform scripts).

---

## 4. Architecture & Code Quality

### 4.1 Type System - Dual Type Definitions

The codebase maintains **two parallel type systems**:
- **Generated types** in `src/lib/database.types.ts` (from `supabase gen types`)
- **Manual types** in `src/lib/types.ts`

The manual types are used everywhere in the app, but they aren't derived from the generated types. If the schema changes and someone forgets to update `types.ts`, the two will silently diverge.

**Recommendation:** Derive application types from `database.types.ts`:
```ts
import type { Database } from './database.types'
type Tables = Database['public']['Tables']
export type Category = Tables['categories']['Row']
export type Expense = Tables['expenses']['Row']
```

### 4.2 Client-Side Data Fetching Pattern

All data fetching is done client-side via `useEffect` + Supabase browser client. This means:
- No server-side rendering of any data
- Every page load makes multiple sequential API calls
- No caching layer (each mount re-fetches everything)

This is acceptable for an MVP but creates noticeable loading states. For the budget page, there are at least 3 sequential queries (user -> budget_summary -> expenses for chart).

### 4.3 Supabase Client Instantiation

`createClient()` is called inside components on every render cycle in several places:
- `expense-list.tsx:50` - inside useEffect
- `budget-burndown-chart.tsx:57` - inside useEffect
- `budget/page.tsx:23` - inside useEffect
- `expense-form.tsx:137,241,290` - inside event handlers and effects

While `createBrowserClient` is internally memoized by `@supabase/ssr`, calling it inside effects creates unnecessary function calls. A module-level singleton would be cleaner.

### 4.4 Real-time Subscription Scope

The `ExpenseSubscriptionManager` (`src/lib/hooks/use-expense-subscription.ts:18-79`) subscribes to **all expenses in the public schema** with no household filter:
```ts
.on("postgres_changes", {
  event: "*",
  schema: "public",
  table: "expenses",
}, ...)
```

RLS ensures users only receive their household's data, but this means the subscription channel is shared across all households at the Supabase level. For a small-scale app this is fine, but at scale you'd want channel-per-household filtering.

### 4.5 Expense List - Missing Household Filter on Realtime

When a real-time INSERT event arrives (`expense-list.tsx:103-105`), the new expense is added directly to the list without verifying it belongs to the current household:
```ts
setExpenses((prev) => [event.new as ExpenseWithDetails, ...prev.slice(0, 19)])
```

While RLS prevents receiving other households' data, defensive coding would check `event.new.household_id === user.householdId`.

### 4.6 Unused Variable

`budget-burndown-chart.tsx:221` declares `latestActualPoint` but never uses it:
```ts
const latestActualPoint = chartData.data.find(...)  // unused
```

### 4.7 Error Handling Inconsistency

- `expense-form.tsx`: Uses `getErrorMessage()` from error-handler.ts (good).
- `expense-list.tsx:39`: Uses raw `console.error` for delete errors - user sees no feedback on failed delete.
- `budget/page.tsx:38`: Uses `console.error` - user sees no error state for failed budget load.
- `budget-burndown-chart.tsx:77`: Uses `console.error` - chart silently fails.

### 4.8 Login Page Is Root Page

The root page (`src/app/page.tsx`) is the login form, but it's also accessible at `/login` (implied by middleware redirect). The middleware (`middleware.ts:63`) treats both `/` and `/login` as public. The login component only exists at `page.tsx` (root), meaning navigating to `/login` would render the default Next.js 404 unless there's a redirect. The middleware redirects unauthenticated users to `/login` which doesn't exist as a page.

**Impact:** Unauthenticated users visiting `/expenses` get redirected to `/login`, which returns a 404. Additionally, authenticated users visiting `/` still see the login form (the middleware only redirects from `/login`, not `/`).

**Fix:** Either create `src/app/login/page.tsx` or change the middleware redirect target to `/`. Also add a redirect from `/` to `/expenses` for authenticated users.

### 4.9 Currency Hardcoding

`src/lib/currency.ts:5-8` hardcodes exchange rates for only EUR and BRL:
```ts
const EXCHANGE_RATES_TO_EUR = { EUR: 1.0, BRL: 0.17 }
```

The Zod schema allows any 3-character currency, but `convertToEUR()` falls back silently to `1.0` for unknown currencies. This creates data integrity issues if users enter USD, GBP, etc. - amounts would be stored with incorrect conversions.

### 4.10 `budget_summary` View Precision

The view computes `percent_spent` as `(spent / allocated) * 100` in SQL, but `budget-category-card.tsx:11` converts it again with `Number(budget.percent_spent)`. Since `allocated_amount` and `spent_amount` come from SQL as `DECIMAL(12,2)`, the Supabase JS client returns them as strings. Multiple places use `Number()` conversion (e.g., `budget-summary-card.tsx:11-12`), which is correct but repetitive and could be centralized.

---

## 5. Database Schema

### 5.1 Schema Design - GOOD

- Proper normalization (2NF-3NF)
- Foreign keys with appropriate CASCADE/RESTRICT actions
- Indexes on all common query patterns
- `updated_at` triggers on all tables

### 5.2 Schema Observations

| ID | Finding |
|----|---------|
| D1 | `categories.icon` and `categories.color` have no validation constraints. Any string is accepted. |
| D2 | `expenses.category_id` and `expenses.account_id` are nullable (`REFERENCES ... ON DELETE RESTRICT`). An expense can exist without a category or account. If this is intentional, the UI should handle it (it does show "Uncategorized"). |
| D3 | `budget_allocations.allocated_amount` has no positivity constraint, unlike `expenses.amount`. Negative allocations are possible. |
| D4 | The `handle_new_user()` trigger creates a household per user. The seed script then merges households manually. There's no built-in "invite to household" flow yet. |
| D5 | No `ON DELETE` handling for category deletion: `expenses.category_id REFERENCES categories(id) ON DELETE RESTRICT` means a category with any expenses can never be deleted. The `is_active` soft-delete pattern is appropriate but the RESTRICT constraint adds an extra guard. |

---

## 6. Documentation Accuracy

| File | Status |
|------|--------|
| `README.md` | References `config.local.js` for default credentials, but the actual credentials are in `.template/01_seed_all.sql`. Minor mismatch. |
| `PROGRESS.md` | Accurately reflects current state. JTBD #2, #4, #7, #11 marked complete; rest pending. |
| `DATA_MODEL.md` | Accurate to current schema. |
| `CLAUDE.md` | Accurate and useful. |

---

## 7. Summary of Findings

### Must Fix (blocking issues)

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | TypeScript error: readonly ref assignment | `src/components/expense-form.tsx:451` | ✅ FIXED |
| 2 | Missing `/login` page (middleware redirects to non-existent route) | `src/middleware.ts:65`, `src/app/login/` missing | ✅ FIXED |
| 3 | 4 high-severity dependency vulnerabilities (Next.js DoS, glob injection) | `package.json` | ✅ FIXED |

### Should Fix (quality/correctness issues)

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 4 | ESLint not configured (`.eslintrc.json` missing) | Project root | ✅ FIXED |
| 5 | Manual types not derived from generated database types (drift risk) | `src/lib/types.ts` vs `src/lib/database.types.ts` | ✅ FIXED |
| 6 | Silent error swallowing on expense delete, budget load, chart load | `expense-list.tsx:39`, `budget/page.tsx:38`, `budget-burndown-chart.tsx:77` | ✅ FIXED |
| 7 | Unused variable `latestActualPoint` | `src/components/budget-burndown-chart.tsx:221` | ✅ FIXED |
| 8 | `budget_allocations.allocated_amount` allows negative values | `20260116_initial_schema.sql` | ✅ FIXED |
| 9 | Error handler passes raw Supabase messages to UI as fallback | `src/lib/error-handler.ts:91-96` | ✅ FIXED |
| 10 | Weak password policy (min 6, no complexity) | `supabase/config.toml:172-175` |

### Consider (improvements, not bugs)

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 11 | Currency conversion hardcoded for only EUR/BRL | `src/lib/currency.ts:5-8` | ✅ FIXED |
| 12 | No server-side rendering; all data fetched client-side | All pages | ✅ FIXED |
| 13 | `date-fns` imported alongside manual date utils | `src/lib/date-utils.ts` vs imports in components | ✅ FIXED |
| 14 | Real-time subscription has no household-level filter | `src/lib/hooks/use-expense-subscription.ts:48-52` | ✅ FIXED |
| 15 | `formatCurrency()` hardcodes EUR symbol regardless of currency | `src/lib/currency.ts:53-55` |
