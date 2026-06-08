# Quick Budget — Code Quality & Dependency/DB Health Audit

**Date:** 2026-06-08
**Scope:** Code quality + dependencies + database health (security review excluded by request).
**Verdict:** The app is in good shape. Lint, typecheck, and the full unit suite are green, the
architecture is clean and well-documented, and there are **no production dependency
vulnerabilities**. Findings below are robustness/maintainability improvements, not fires —
none block shipping.

## Baseline (all green)

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ No issues |
| `npm run typecheck` | ✅ No errors |
| `npm test` | ✅ 134 tests / 8 files passing |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |

---

## Findings

Severity reflects impact at this app's real scale (a two-person household), not a generic SaaS.

### Medium

**M1 — External fetches have no timeout / abort.**
`src/lib/tricount/client.ts:65` & `:104` (Tricount's *undocumented* backend),
`src/lib/exchange-rate-api.ts:58`, and `src/lib/currency.ts:45` all call `fetch()` with no
`AbortSignal`/timeout. If an upstream hangs (the Tricount endpoint especially — it's an
unofficial app backend with no SLA), the serverless invocation stays open until the platform
timeout, and a manual "Sync" spins with no failure. *Fix:* wrap each outbound `fetch` with
`AbortSignal.timeout(~10s)` and treat the abort as the existing fallback/error path.

**M2 — `/api/tricount/sync` is not rate-limited, though a limiter already exists.**
`src/lib/rate-limit.ts` is wired into `/api/exchange-rates` (`route.ts:9,73`) but **not** into
`/api/tricount/sync` (`src/app/api/tricount/sync/route.ts`). The 10-minute throttle in
`runSyncAll` only applies to the `auto: true` on-load sync (`sync.ts:347`); a **manual** "Sync"/
"Sync all" forces a fresh pull every click and fans out to the undocumented Tricount API with
no per-user ceiling. A stuck client or impatient double-clicking could hammer that endpoint and
risk an IP block. *Fix:* apply the existing `createRateLimiter` to the sync route keyed by
`user.id` (e.g. a few requests/minute).

**M3 — Server/client data layer is duplicated by hand, not shared.**
`src/lib/server/data.ts` and `src/lib/client/data.ts` carry verbatim copies of the same logic —
the budget/allowance partition loop and, most notably, the EUR cashflow-adjustment reduce
(`getTricountCashflowAdjustment` at `data.ts:309-315` vs `fetchTricountCashflowAdjustment` at
`client/data.ts:97-101`). A header comment says they "MUST stay in sync," which is the tell: the
money math is copy-pasted and only one side (`computeTopCategoryIds`) is unit-tested. *Fix:*
extract the partition + cashflow-cents reduce into a pure helper in `src/lib/budget-utils.ts`
(already the home for tested pure logic) and call it from both sides.

**M4 — `runSync` reconciles entries strictly sequentially.**
`src/lib/tricount/sync.ts:191-302` awaits rate lookup + expense write + ledger write **per entry,
one at a time**. For a large registry that's N sequential round-trips. Correctness is fine and
it's acceptable at current scale, but a long-lived tricount will make sync feel slow. *Fix (when
it bites):* resolve all rates first (the rate cache already dedupes), then batch inserts/updates,
or process entries with a bounded concurrency.

### Low

**L1 — `expense-form.tsx` is a 780-line component.** It concentrates currency preview, the
cap/overflow split, several `useEffect`s with *documented* `exhaustive-deps`/`set-state-in-effect`
disables (`:266,:316,:351,:364`), and submit logic. The disables are individually justified, but
the file is the most fragile surface in the codebase. Consider extracting the cap/split
sub-logic into a hook. (Not a bug — a maintainability flag.)

**L2 — Auth check is inconsistent across routes.** `/api/exchange-rates`
(`route.ts:64`) calls `supabase.auth.getUser()` — a network round-trip to the auth server — while
the rest of the app deliberately uses local JWKS verification via `getServerUser()`
(`src/lib/server/data.ts:37`) to avoid exactly that round-trip. Align the exchange-rate route on
`getServerUser()` for consistency and one fewer hop.

**L3 — `DELETE /api/tricount/link` passes nulls into `.in()`.**
`route.ts:165` maps `m.expense_id` without filtering, so income rows (whose `expense_id` is null)
put `null` into the `.in("id", expenseIds)` list. Postgres ignores nulls in `IN`, so it's benign,
but `expenseIds.filter(Boolean)` makes the intent explicit.

**L4 — Date validation accepts impossible dates.** `/api/exchange-rates` validates the `date`
param with `/^\d{4}-\d{2}-\d{2}$/` (`route.ts:43`), which accepts `2024-02-30`. Downstream
Frankfurter would just miss and fall back, so impact is nil, but a real date parse would reject
it cleanly.

### Informational — dependencies

`npm audit --omit=dev` is clean. ~20 packages have **minor/patch** updates available
(`@supabase/supabase-js` 2.105→2.107, `next` 16.2.6→16.2.7, `date-fns` 4.1→4.4, `supabase` CLI
2.98→2.105, etc.) plus one **major** (`eslint` 9→10) that should be deferred until the flat-config
plugins support it. None are urgent; a routine patch-level bump is the only action.

### Informational — database (Supabase advisors, Prod)

- **Security (WARN):** *Leaked password protection disabled.* One toggle in
  Authentication → Providers (checks new passwords against HaveIBeenPwned). Low effort, worth
  enabling. ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))
- **Performance (INFO):** Two foreign keys lack a covering index —
  `tricount_entry_map.household_id` and `tricount_links.default_category_id`. Three indexes are
  reported unused (`idx_budget_allocations_category`, `idx_tricount_entry_map_link`,
  `idx_tricount_links_household`). At a two-person household these are negligible; the unused
  flags are expected from low traffic. The unindexed FKs only matter for cascade-delete
  performance — fine to leave, but if you touch that schema, add the covering indexes for free.

---

## Recommended order

1. **M1** (fetch timeouts) and **M2** (rate-limit the sync route) — both are small, both harden the
   fragile Tricount integration against the undocumented upstream.
2. **M3** (de-duplicate the money math) — removes a real drift risk in financial calculations.
3. Enable leaked-password protection (one click) and do a routine patch-level dependency bump.
4. **M4 / L1** are refactors to schedule when the relevant code is next touched, not standalone work.
