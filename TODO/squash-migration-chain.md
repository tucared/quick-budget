# Squash `supabase/migrations/` to a fresh baseline

Collapse the 23 migrations (Mar 8 → May 16, 2026) into one canonical `<ts>_baseline.sql` that represents current Prod state byte-for-byte. Delete the rest. Future migrations resume on top of the new baseline using the existing schema-flow.

Designed to be **executed fully locally** — Docker + Supabase CLI on your machine, linked to Dev and Prod via `supabase link --project-ref <ref>`. No cloud Claude env, no MCP. Pure CLI + `psql`.

## Why this isn't already done

The overflow/cap feature only just stabilized (May 16). A squash also needs a coordinated `supabase_migrations.schema_migrations` repair on both Dev and Prod — that wants a human hand on the wheel and both partners around to babysit, not an ad-hoc session. Best scheduled deliberately on a quiet day with Docker running and a clean working tree.

## Current state (what makes a squash worthwhile)

23 migrations in `supabase/migrations/`:

- **1 baseline** — `20260308171853_baseline.sql` (27.5 KB, the original bootstrap from `supabase db dump`).
- **5 intentional permanent hand-authored**:
  - `20260513233000_move_get_my_household_id_to_private.sql` — `private` schema setup + RLS policy `ALTER`s
  - `20260513235951_decouple_realtime_from_declarative_schemas.sql` — realtime broadcast function + trigger + publication + REPLICA IDENTITY + `realtime.messages` policy
  - `20260514025710_drop_pg_graphql_extension.sql` — extension state
  - `20260514120000_add_household_id_to_jwt_claims.sql` — `private.custom_access_token_hook` + `private.get_my_household_id`
  - `20260515190000_pin_budget_summary_view_options_and_grants.sql` — `budget_summary` view options + grants
- **6 legacy double-timestamp `<ts>_auto_<ts2>.sql`** from before commit `93765e1` fixed the auto-naming. Undescriptive and noisy: `20260509120816_auto_20260509120753.sql`, `20260513143914_auto_20260513143850.sql`, `20260513163909_auto_20260513163845.sql`, `20260514172710_auto_20260514172649.sql`, `20260515221813_auto_20260515221745.sql`, `20260516001611_auto_20260516001545.sql`.
- **The rest** — small drops (categories.color, top_categories_by_usage, rls_auto_enable, users-fallback), per-RPC grant fixups, the realtime publication cleanup, monthly_budget_targets add.

Schemas dir (`supabase/schemas/`) has a numbering gap: `00, 01, 02, 03, 05` — no `04`.

Heavy churn cluster: overflow/cap feature touched the chain 5+ times May 9-16 (added a column → swapped for a boolean → reverted to columns). The end state is representable as a single CREATE.

Recent fix `93765e1` (`ci(generate-migration): drop redundant timestamp from auto-migration filenames`) addressed the future pattern (`<ts>_auto.sql`) but didn't touch the 6 legacy files.

## What stays declarative vs. hand-authored

Confirmed against `.agents/skills/supabase-schema-flow/SKILL.md` — the 5 intentional permanent migrations literally **can't** move into `supabase/schemas/`:

- `db diff --schema public` doesn't see the `private` schema
- migra strips function-level GRANT/REVOKE EXECUTE
- migra mangles view options (`security_invoker`) and grants
- realtime publication state and REPLICA IDENTITY aren't tracked

So squashing isn't about moving things into declarative — it's about collapsing the 23 historical migrations into one clean file that already includes all of those concerns.

## Pre-requisites

Before starting:

- Docker Desktop running.
- `supabase` CLI on `$PATH` (`brew install supabase/tap/supabase` or use `npx supabase` from repo root — it's already in `devDependencies`).
- `supabase link --project-ref <DEV_PROJECT_REF>` and `supabase link --project-ref <PROD_PROJECT_REF>` already done at least once on this machine (re-link in step 6 when switching). Project refs live in the Supabase dashboard URL.
- `SUPABASE_DB_PASSWORD` env var set, or be ready to paste it when CLI prompts.
- `psql` available for raw `supabase_migrations.schema_migrations` inspection (optional but useful).
- A clean working tree on a fresh branch off `main`: `git checkout main && git pull && git checkout -b squash-migration-chain`.

## Shape of the work

### 1. Pre-flight: confirm local-from-chain == Prod

Prove the current 23-migration chain reproduces Prod. Otherwise the new baseline would silently encode local drift.

```bash
# Apply the full existing chain locally
supabase db reset
supabase db dump --local --schema public --schema private > /tmp/local.sql

# Dump current Prod (switch link first)
supabase link --project-ref <PROD_PROJECT_REF>
supabase db dump --linked --schema public --schema private > /tmp/prod.sql

# Diff
diff /tmp/local.sql /tmp/prod.sql                # expect: empty (modulo pg_dump ordering noise)
```

If non-empty after normalizing trivial reorder/whitespace, **stop** — investigate the drift first; squashing would lock it in.

Re-link to your default project after the diff: `supabase link --project-ref <DEV_PROJECT_REF>` (or whatever you usually work against).

### 2. Generate the baseline content

The new file must contain everything in current Prod, in dependency order. Compose from:

- `supabase db dump --local --schema public --schema private` (tables, indexes, RLS policies, RPC bodies, RLS helper, auth hook) — captured in step 1 already
- Hand-append the bits `pg_dump --schema` filters miss. Copy these blocks verbatim from the source migrations and clean up:
  - `realtime` publication membership: `ALTER PUBLICATION supabase_realtime ADD TABLE expenses, budget_allocations`
  - `REPLICA IDENTITY FULL` on those tables
  - `realtime.broadcast_changes()`-calling trigger function + triggers (source: current `20260513235951_decouple_realtime_from_declarative_schemas.sql`)
  - RLS policy on `realtime.messages` (same source migration)
  - `DROP EXTENSION IF EXISTS pg_graphql CASCADE;` (source: `20260514025710_drop_pg_graphql_extension.sql`)
  - `budget_summary` view body + `ALTER VIEW SET (security_invoker = true)` + GRANT/REVOKE trio (source: `20260515190000_pin_budget_summary_view_options_and_grants.sql`)
  - Function-level `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` for every RPC (migra strips these even when declared in schemas)
- Strip `pg_dump` boilerplate: `SET` statements, `SELECT pg_catalog.set_config(...)`, comments on extensions/schemas, ownership lines that conflict with Supabase's role model.

Filename: `<merge-day-ts>_baseline.sql` where `<merge-day-ts>` is a 14-digit UTC timestamp like `20260601090000`. Must sort > the latest existing one (`20260516001611_*`).

Use section header comments inside the file for navigability:

```sql
-- =============================================================
-- 1. Schemas and grants (was: 00_setup.sql)
-- 2. Functions (was: 01_functions.sql + private schema)
-- 3. Tables, indexes, triggers (was: 02_tables.sql)
-- 4. RLS policies (was: 03_rls.sql)
-- 5. RPCs + EXECUTE grants (was: 05_rpcs.sql)
-- 6. Auth hook (private.custom_access_token_hook)
-- 7. Realtime broadcast (function, triggers, publication, REPLICA IDENTITY, realtime.messages policy)
-- 8. budget_summary view (body, security_invoker, grants)
-- 9. Extension state (DROP pg_graphql)
-- =============================================================
```

### 3. Local verification loop

```bash
# Safety net — keep old migrations recoverable outside git
mv supabase/migrations /tmp/migrations-archive
mkdir supabase/migrations
cp /tmp/baseline.sql supabase/migrations/<merge-day-ts>_baseline.sql

# Reset against the new single-file chain
supabase db reset                                # must succeed end-to-end

# Types should be unchanged
npm run types:generate
git diff src/lib/database.types.ts               # must be empty

# Code-quality gates
npm run lint && npm run typecheck && npm test

# Declarative drift check
supabase db diff --schema public                 # must be empty
```

Then UI smoke via the dogfood skill (one viewport): `npm run dev`, log in as `user1@example.com` / `password1`, log an expense, rebalance a category, open the app in a second tab to verify realtime broadcasts. If any step fails, the baseline is missing something — fix and re-verify.

Optional but recommended: dump from this freshly-reset local DB and re-diff against the Prod dump from step 1 — should still be empty.

```bash
supabase db dump --local --schema public --schema private > /tmp/local-after-squash.sql
diff /tmp/prod.sql /tmp/local-after-squash.sql   # expect: empty
```

### 4. Update docs that reference deleted migration filenames

```bash
grep -rn '20260[0-9]\{8,\}_' --include='*.md' --include='*.sql' \
  --exclude-dir=node_modules --exclude-dir=supabase/migrations .
```

Known sites:

- `DATA_MODEL.md` sections 6, 7, 8 reference specific migration filenames (`20260513235951_decouple_realtime_from_declarative_schemas.sql`, `20260514120000_add_household_id_to_jwt_claims.sql`, `20260514025710_drop_pg_graphql_extension.sql`). Replace with "the squashed baseline `<merge-day-ts>_baseline.sql`" plus the section anchor.
- `supabase/schemas/README.md` lines 46-50 list 5 hand-authored migrations under "Where this PR's hand-authored migrations live". Replace with one-line baseline reference + note that future hand-authored work follows the existing rules.
- `.agents/skills/supabase-schema-flow/SKILL.md` lines 36, 52, 68, 75 reference specific filenames. Update similarly.
- `DEPLOYMENT.md` already documents the original bootstrap baseline. Add a note that the chain was re-squashed on `<date>`.

### 5. Fix the schemas-dir numbering wart (fold into same PR)

```bash
git mv supabase/schemas/05_rpcs.sql supabase/schemas/04_rpcs.sql
```

Update `supabase/schemas/README.md` line 24 table. Schemas files aren't tracked by `schema_migrations`, so this is purely cosmetic and risk-free.

Skip adding a stub `04_views.sql` — current README already explains why views are out, and an empty stub is more confusing than absent.

### 6. Cutover for Dev + Prod

The challenge: Dev and Prod already have `schema_migrations` rows for all 23 old filenames. After merge, `supabase db push` (run by `migrate-prod.yml`) will see a new baseline file with no matching row and try to run it — which would fail because the tables already exist.

**Mitigation: `supabase migration repair`** — built into the CLI for exactly this case. Per remote.

**Test on Dev first** (Dev resets daily anyway, so if you fat-finger something the 05:00 UTC reset cleans up — but `migration repair` itself only touches `schema_migrations`, never data):

```bash
supabase link --project-ref <DEV_PROJECT_REF>

# Mark old chain as reverted (rows stay in schema_migrations but won't trigger re-run)
supabase migration repair --status reverted \
  20260308171853 20260308182415 20260308184551 20260319211755 \
  20260410201743 20260410204922 20260411195749 20260508171742 \
  20260509120816 20260509120817 20260513143914 20260513163909 \
  20260513233000 20260513235951 20260514015245 20260514025710 \
  20260514120000 20260514163400 20260514172710 20260514175900 \
  20260515190000 20260515221813 20260516001611

# Mark new baseline as applied without running it
supabase migration repair --status applied <merge-day-ts>

# Verify
supabase migration list --linked
# Or via psql:
# psql "$DEV_DB_URL" -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
```

Expected post-repair state: exactly one row for `<merge-day-ts>`, all 23 old versions either gone or in a non-applied state. Then locally:

```bash
supabase db push --linked --dry-run            # should report 0 pending migrations
```

**Then on Prod**, same sequence:

```bash
supabase link --project-ref <PROD_PROJECT_REF>
supabase migration repair --status reverted 20260308171853 ... 20260516001611
supabase migration repair --status applied <merge-day-ts>
supabase db push --linked --dry-run            # should report 0 pending migrations
```

Read `.github/workflows/migrate-prod.yml` first to confirm `supabase db push` only runs migrations whose versions aren't in `schema_migrations`. If it does anything more aggressive (e.g. force-applies the baseline), adjust the workflow for this one merge.

**Merge-day order:**

1. PR with baseline + docs + schemas rename. Get green CI.
2. Run `migration repair` against **Prod**.
3. Verify Prod's `schema_migrations` contains exactly the new baseline row via `psql` or `supabase migration list --linked`.
4. Confirm the Dashboard auth-hook config is still enabled (Authentication → Hooks → Custom Access Token → `private.custom_access_token_hook`). Unrelated to migrations but worth eyeballing.
5. Run `migration repair` against **Dev**.
6. Merge PR. `migrate-prod.yml` runs `supabase db push`; should see no pending migrations and exit clean.
7. Trigger `reset-dev.yml` manually via GitHub Actions UI to confirm Dev rebuilds cleanly from the new baseline rather than waiting for the next daily cron.

**Rollback if Prod cutover fails:**

- All 23 old migration files are preserved in git history. `git revert <squash-commit>` brings them back.
- Then for each old version, restore the schema_migrations row:
  ```bash
  supabase migration repair --linked --status applied 20260308171853
  supabase migration repair --linked --status applied 20260308182415
  # ... and so on for all 23
  ```
- Prod data is untouched throughout — only `supabase_migrations.schema_migrations` is mutated.

## Risks

- **Drift hiding in the current chain.** Step 1's pre-flight diff catches this; do not skip.
- **`migration repair` operator error on Prod.** Test on Dev first (Dev gets nuked daily anyway). Have the rollback `git revert` SHA written down before running on Prod.
- **`pg_dump` ordering noise.** Section the baseline file by hand with comments rather than trusting raw dump order — Postgres can usually resolve dependencies, but readable order makes future code review possible.
- **Auth hook dashboard config is separate.** Both Dev and Prod must continue to point Authentication → Hooks → Custom Access Token at `private.custom_access_token_hook`. Unchanged by the squash but re-verify after cutover.
- **CI workflow changes mid-flight.** If `generate-migration.yml` or `migrate-prod.yml` evolve between now and execution, re-read them before starting — the repair flow assumes their current behavior.

## Verification

End-to-end checks before declaring done:

1. **Schema parity**: `supabase db dump --local --schema public --schema private` on freshly-reset new-baseline DB matches `supabase db dump --linked --schema public --schema private` against Prod. Empty diff.
2. **Types parity**: `npm run types:generate` produces no diff vs. main on `src/lib/database.types.ts`.
3. **CI greens**: `lint`, `typecheck`, `test` all green on the PR.
4. **Migra drift check**: `supabase db diff --schema public` after `db reset` emits zero lines (proves declarative `supabase/schemas/` agrees with the new baseline).
5. **Smoke via dogfood**: Log in, create an expense, rebalance a category, observe realtime sync between two tabs (proves realtime publication + trigger + policy survived the squash).
6. **Advisors**: Dashboard Security Advisor on Dev and Prod returns no new findings (proves RLS, grants, and security_invoker survived).
7. **Post-merge Prod check**: `psql "$PROD_DB_URL" -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version >= '20260308' ORDER BY version;"` returns exactly one row for the new baseline version and zero rows for the old 23 versions.

## Estimated impact

- 23 migrations → 1 file. Review surface for any future schema PR shrinks dramatically.
- Eliminates 6 legacy `<ts>_auto_<ts2>.sql` undescriptive filenames.
- Closes the `supabase/schemas/04` numbering gap.
- No runtime behavior change — Prod state is byte-identical pre/post-cutover. The win is cognitive load + onboarding clarity.
