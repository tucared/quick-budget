# Squash `supabase/migrations/` to a fresh baseline

Collapse the 23 migrations (Mar 8 → May 16, 2026) into one canonical `<ts>_baseline.sql` that represents current Prod state byte-for-byte. Delete the rest. Future migrations resume on top of the new baseline using the existing schema-flow.

## Why this isn't already done

The overflow/cap feature only just stabilized (May 16). Doing this needs Docker for local verification (`supabase db reset` against the new baseline), which the cloud Claude env doesn't have. It also needs a coordinated `supabase_migrations.schema_migrations` repair on Dev + Prod that wants a human hand on the wheel, not an ad-hoc session. Best scheduled deliberately on a quiet day with both partners around.

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

## Shape of the work

### Environment split

- 🌥️ **Cloud Claude env can do**: drafting baseline content, doc rewrites, schemas/ rename, MCP-based Prod/Dev diffs, `supabase migration repair --linked` orchestration, post-merge verification. The Supabase CLI is already installed via `devDependencies` (run as `npx supabase`).
- 💻 **Your local machine must do**: `supabase db reset` against the new baseline, `supabase db diff --schema public` for zero-drift confirmation, dogfood smoke. These need Docker for the local Postgres stack.

Do **not** add Docker to the cloud env — it's heavy and the verification step is exactly where a human pause is valuable.

### 1. Pre-flight: confirm local-from-chain == Prod  💻 + 🌥️

Before touching anything, prove the current 23-migration chain reproduces Prod. Otherwise the new baseline would silently encode local drift.

💻 On your machine (Docker running):
```bash
supabase db reset                                # apply all 23 migrations + seeds
supabase db dump --local --schema public --schema private > /tmp/local.sql
```

🌥️ Either env (no Docker needed):
```bash
npx supabase db dump --linked --schema public --schema private > /tmp/prod.sql
# Requires SUPABASE_ACCESS_TOKEN + linked project ref.
# Alternative: build /tmp/prod.sql via MCP execute_sql against pg_catalog if --linked is awkward.
```

Then:
```bash
diff /tmp/local.sql /tmp/prod.sql                # expect: empty (modulo pg_dump ordering noise)
```

If non-empty after normalizing, **stop** — investigate the drift first; squashing would lock it in.

### 2. Generate the baseline content  🌥️ (drafting) + 💻 (final dump for fidelity)

The new file must contain everything in current Prod, in dependency order. Compose from:

- `supabase db dump --local --schema public --schema private` (tables, indexes, RLS policies, RPC bodies, RLS helper, auth hook)
- Hand-append the bits `pg_dump --schema` filters miss:
  - `realtime` publication membership: `ALTER PUBLICATION supabase_realtime ADD TABLE expenses, budget_allocations`
  - `REPLICA IDENTITY FULL` on those tables
  - `realtime.broadcast_changes()`-calling trigger function + triggers (source: current `20260513235951_decouple_realtime_from_declarative_schemas.sql`)
  - RLS policy on `realtime.messages` (same source migration)
  - `DROP EXTENSION IF EXISTS pg_graphql CASCADE;` (source: `20260514025710_drop_pg_graphql_extension.sql`)
  - `budget_summary` view body + `ALTER VIEW SET (security_invoker = true)` + GRANT/REVOKE trio (source: `20260515190000_pin_budget_summary_view_options_and_grants.sql`)
  - Function-level `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` for every RPC (migra strips these even when declared in schemas)
- Strip `pg_dump` boilerplate: `SET` statements, `SELECT pg_catalog.set_config(...)`, comments on extensions/schemas, ownership lines that conflict with Supabase's role model.

Filename: `<merge-day-ts>_baseline.sql`. Must sort > the latest existing one (`20260516001611_*`).

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

### 3. Local verification loop  💻

**Requires Docker** — cloud env can't do it. Do it on your machine on the same branch:

```bash
mv supabase/migrations /tmp/migrations-archive   # not committed; safety net
mkdir supabase/migrations
cp /tmp/baseline.sql supabase/migrations/<merge-day-ts>_baseline.sql
supabase db reset                                # must succeed end-to-end
npm run types:generate
git diff src/lib/database.types.ts               # must be empty
npm run lint && npm run typecheck && npm test
supabase db diff --schema public                 # must be empty (no drift)
```

Then UI-smoke via the dogfood skill (one viewport): log in as `user1@example.com`, log an expense, rebalance a category, verify realtime broadcasts. If any step fails, the baseline is missing something — fix and re-verify.

Once green locally, push the branch; cloud Claude takes over for docs + cutover.

### 4. Update docs that reference deleted migration filenames  🌥️

Grep first (`grep -rn '20260[0-9]\+_' .` excluding `supabase/migrations/` and `node_modules/`). Known sites:

- `DATA_MODEL.md` sections 6, 7, 8 reference specific migration filenames (`20260513235951_decouple_realtime_from_declarative_schemas.sql`, `20260514120000_add_household_id_to_jwt_claims.sql`, `20260514025710_drop_pg_graphql_extension.sql`). Replace with "the squashed baseline `<merge-day-ts>_baseline.sql`" plus the section anchor.
- `supabase/schemas/README.md` lines 46-50 list 5 hand-authored migrations under "Where this PR's hand-authored migrations live". Replace with one-line baseline reference + note that future hand-authored work follows the existing rules.
- `.agents/skills/supabase-schema-flow/SKILL.md` lines 36, 52, 68, 75 reference specific filenames. Update similarly.
- `DEPLOYMENT.md` already documents the original bootstrap baseline. Add a note that the chain was re-squashed on `<date>`.

### 5. Fix the schemas-dir numbering wart  🌥️ (fold into same PR)

```bash
git mv supabase/schemas/05_rpcs.sql supabase/schemas/04_rpcs.sql
```

Update `supabase/schemas/README.md` line 24 table. Schemas files aren't tracked by `schema_migrations`, so this is purely cosmetic and risk-free.

Skip adding a stub `04_views.sql` — current README explains why views are out, and an empty stub is more confusing than absent.

### 6. Cutover plan for Dev + Prod  🌥️ (all from cloud env)

The challenge: Dev and Prod already have `schema_migrations` rows for all 23 old filenames. After merge, `supabase db push` (run by `migrate-prod.yml`) will see a new baseline file with no matching row and try to run it — which would fail because the tables already exist.

**Mitigation: `supabase migration repair`** — built into the CLI for exactly this case. Per remote, before merging:

```bash
# Mark old chain as reverted (rows stay in schema_migrations but won't trigger re-run)
npx supabase migration repair --linked --status reverted \
  20260308171853 20260308182415 20260308184551 20260319211755 \
  20260410201743 20260410204922 20260411195749 20260508171742 \
  20260509120816 20260509120817 20260513143914 20260513163909 \
  20260513233000 20260513235951 20260514015245 20260514025710 \
  20260514120000 20260514163400 20260514172710 20260514175900 \
  20260515190000 20260515221813 20260516001611

# Mark new baseline as applied without running it
npx supabase migration repair --linked --status applied <merge-day-ts>
```

Run against Prod first (or right before merging the PR). Run against Dev too — Dev's daily 05:00 UTC reset would rebuild from scratch fine, but the immediate post-merge state needs the repair to avoid `migrate-prod.yml` flapping.

Read `.github/workflows/migrate-prod.yml` first to confirm `supabase db push` only runs migrations whose versions aren't in `schema_migrations`. If it does anything more aggressive, adjust the workflow for this one merge.

**Order on merge day:**

1. Prep PR with baseline + docs + schemas rename. Get green CI.
2. Run `migration repair` against **Prod** (mark old reverted, new applied).
3. Verify Prod's `schema_migrations` contains exactly the new baseline row (use MCP `execute_sql` to `SELECT * FROM supabase_migrations.schema_migrations`). The Dashboard auth-hook config (Authentication → Hooks → Custom Access Token → `private.custom_access_token_hook`) is unrelated to migrations and stays as-is — re-verify it's still enabled.
4. Run `migration repair` against **Dev** (or wait for the 05:00 UTC daily reset; Dev rebuilds from scratch).
5. Merge PR. `migrate-prod.yml` runs `db push`; should see no pending migrations and exit clean.
6. Trigger `reset-dev.yml` manually via GitHub Actions to confirm Dev rebuilds cleanly from the new baseline rather than waiting 24h.

**Rollback if Prod cutover fails:**

- All 23 old migration files are preserved in git history. `git revert <squash-commit>` brings the files back.
- Then `npx supabase migration repair --linked --status applied <each old version>` restores the schema_migrations rows for the chain.
- Prod data is untouched throughout — only `supabase_migrations.schema_migrations` is mutated.

## Risks

- **Drift hiding in the current chain.** Step 1's pre-flight diff catches this; do not skip.
- **`migration repair` operator error on Prod.** Test the exact `repair` sequence on Dev first (Dev gets nuked daily anyway). Have the rollback `git revert` SHA written down before running on Prod.
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
6. **Advisors**: MCP `get_advisors --type security` on Dev and Prod returns no new findings (proves RLS, grants, and security_invoker survived).
7. **Post-merge Prod check**: MCP `execute_sql` confirms `supabase_migrations.schema_migrations` contains exactly one row for the new baseline version and zero rows for the old 23 versions.

## Estimated impact

- 23 migrations → 1 file. Review surface for any future schema PR shrinks dramatically.
- Eliminates 6 legacy `<ts>_auto_<ts2>.sql` undescriptive filenames.
- Closes the `supabase/schemas/04` numbering gap.
- No runtime behavior change — Prod state is byte-identical pre/post-cutover. The win is cognitive load + onboarding clarity.
