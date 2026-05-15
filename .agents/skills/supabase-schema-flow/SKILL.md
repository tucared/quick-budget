---
name: supabase-schema-flow
description: How to make database schema changes in this Quick Budget repo — when to edit declarative schemas in `supabase/schemas/` vs hand-author migrations in `supabase/migrations/`, the `apply-to-dev` label flow, the security_invoker view-options pin, RLS helpers in the `private` schema, the auth-hook JWT claim, GRANT/REVOKE quirks, and the generate-migration / migrate-prod / reset-dev workflow loop. Use whenever the user mentions migrations, schemas, RLS, declarative database, supabase db diff, hand-authored migrations, security_invoker, apply-to-dev, or edits any file under `supabase/`.
---

# Supabase schema flow

## Default: edit `supabase/schemas/`

The `Generate Migration` workflow runs `supabase db diff --schema public` on every PR touching `supabase/schemas/**`, applies the diff against a local Postgres, runs lint/typecheck/test, and auto-commits both the generated migration and the regenerated `src/lib/database.types.ts` back to your PR branch.

Local loop:

1. Edit a file under `supabase/schemas/`.
2. `supabase db reset` to regenerate from migrations + seeds and verify your starting point. Your unstaged schema edits won't apply yet — the workflow generates the migration.
3. Push your branch and open a PR.
4. Pull the bot's commit before continuing.
5. After schema changes, always regenerate types: `npm run types:generate` (or let the workflow do it).

A `permissions.ask` rule in `.claude/settings.json` prompts on every Write/Edit under `supabase/migrations/**` so the schema-driven flow can't be bypassed by accident. Approve only for the hand-authored cases listed below.

## When you need a hand-authored migration

Migra (which powers `db diff`) can't reliably track these. Edit `supabase/migrations/` directly:

### Cross-schema or non-public objects

- `realtime.messages` policies and any cross-schema policy reference
- Storage schema policies
- Anything in the `private` schema (the workflow's `--schema public` scope intentionally doesn't diff it; declarations in `supabase/schemas/` for `private` are informational stubs only)

### Cluster-level / GRANT-shaped objects migra ignores

- `ALTER PUBLICATION` and `REPLICA IDENTITY` statements
- Schema-level grants (`GRANT USAGE ON SCHEMA <custom>`)
- **Function-level `REVOKE EXECUTE` / `GRANT EXECUTE`** — `db diff` silently strips these, so declaring grants only in `supabase/schemas/05_rpcs.sql` lands a fresh DB with PostgreSQL's default of `EXECUTE TO PUBLIC`. Every new RPC needs a small hand-authored migration alongside the auto-generated one. Pattern: `supabase/migrations/20260514175900_grant_get_expenses_and_categories_to_authenticated.sql`.

### Data migrations

- Custom DML that can't be expressed declaratively (backfills, one-shot data corrections, seed corrections that need to survive `db reset`).

### View options on `security_invoker` views

Migra does not read view options back from `pg_class.reloptions` ([supabase/cli#3973](https://github.com/supabase/cli/issues/3973), [#792](https://github.com/supabase/cli/issues/792)). If the option is declared in `supabase/schemas/`, `db diff` thinks it's missing from the source DB on every run and emits a perpetual no-op `DROP VIEW + CREATE OR REPLACE VIEW` to "re-apply" it. Without `security_invoker = true`, the view runs as its owner (postgres → BYPASSRLS) and exposes every household's rows.

Pattern: declare only the view body in `supabase/schemas/04_views.sql` (no `WITH (...)` clause), and put the `ALTER VIEW SET (security_invoker = true)` plus the `GRANT/REVOKE` trio in a hand-authored migration. Canonical example: `supabase/migrations/20260515190000_pin_budget_summary_view_options_and_grants.sql`. Stripping the option from the declarative target was originally intended to kill the loop at the source, but empirically migra still emits a body-only `DROP VIEW + CREATE OR REPLACE` on every run — it always re-emits view DDL when reloptions are set on the source, regardless of target shape. The `generate-migration.yml` workflow detects view-only no-op recreates (body byte-equal to `pg_get_viewdef`) and drops the file before committing, so the chain stays clean.

Side-effect recreation gotcha: if a future PR adds/drops/renames a column on a table the view references (`categories`, `budget_allocations`, `expenses` for `budget_summary`), migra emits a `DROP VIEW + CREATE OR REPLACE` to update the column dependency. Postgres drops the option and grants with the view, and migra emits neither back. Hand-author a follow-up migration mirroring the four statements in the pinning migration above. Timestamp the follow-up immediately after the auto-generated migration it patches (e.g. `20260515201040` for an auto-migration at `20260515201039`) — not "later today" or a clean round number. Reason: any subsequent push to the PR re-runs `db diff`, which writes a new auto-migration with the current UTC timestamp; if your follow-up is timestamped further in the future than that, `supabase migration up` refuses to apply the new file (version older than head already applied) and the workflow fails. Safety nets: stripped grants surface immediately as `permission denied for view budget_summary` on the next deploy; stripped `security_invoker` is blocked by `Migrate Prod`'s security-advisors gate (`security_definer_view` lint) before reaching Prod.

## Dogfooding on Dev

Add the `apply-to-dev` label to your PR if you want the workflow to also push the resulting migration chain to the Dev Supabase project. Without the label, schema PRs only generate the migration; Dev stays at `main`'s state until merge or the daily 05:00 UTC `Reset Dev` cron.

The label fires the workflow even with no new commits, so adding it later on an existing PR triggers the Dev push immediately.

Multiple labeled PRs open at once will share Dev — the daily reset cleans up.

## RLS helper and JWT claim

The `get_my_household_id()` helper used by every household-scoped RLS policy lives in the `private` schema (so PostgREST does not expose it as an RPC). It reads `household_id` from the JWT custom claim `app_metadata.household_id` populated by the `private.custom_access_token_hook` auth hook, with a fallback to a `public.users` lookup when the claim is absent. Both live in hand-authored migrations:

- `supabase/migrations/20260514120000_add_household_id_to_jwt_claims.sql` — the function + hook pair
- `supabase/schemas/02_tables.sql` — the **informational** `private.get_my_household_id` declaration (for self-documentation, `--schema public` doesn't actually diff it)

The auth hook must be enabled in the Supabase dashboard (Authentication → Hooks → Custom Access Token → `private.custom_access_token_hook`) on Dev and Prod; `supabase/config.toml` only covers local dev.

## Realtime triggers

The `expenses` and `budget_allocations` tables publish changes via a `SECURITY DEFINER` trigger that calls `realtime.broadcast_changes()` on a household-scoped topic. Source of truth is hand-authored: `supabase/migrations/20260513235951_decouple_realtime_from_declarative_schemas.sql` (function body, trigger creation, publication membership, replica identity, `realtime.messages` policy).

The matching `CREATE FUNCTION` and `CREATE TRIGGER` declarations in `supabase/schemas/02_tables.sql` are informational stubs that exist only so `supabase db diff --schema public` treats the triggers as known state and does not emit phantom `DROP TRIGGER` statements.

## CI map

| Workflow | When | What |
|---|---|---|
| `Generate Migration` | PR touching `supabase/schemas/**` (or `apply-to-dev` label) | `db diff` → commit migration + types; `db push --linked` if labeled |
| `Migrate Prod` | Push to main touching `supabase/migrations/**` | `supabase db push` to Prod + security advisors gate |
| `Reset Dev` | Daily 05:00 UTC + push to main touching `supabase/**` | Wipes Dev and reapplies main's migration chain |
| `Backup Prod` | Daily 03:00 UTC | `pg_dump` of Prod |

## Supabase CLI version

Pinned in `package.json` (`devDependencies.supabase`). `supabase/setup-cli@v2` auto-detects from `package-lock.json` in every workflow. Bump via `npm install supabase@<version> --save-dev` and commit; no workflow edits needed.

## Local credentials

`user1@example.com` / `password1` (see `supabase/seeds/01_create_users.sql`).
