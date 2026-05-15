# Declarative schemas

This directory is the **single source of truth for the desired database state**. CI diffs it against the migration chain and auto-generates a migration when they drift apart.

## Workflow

1. Edit a file in `supabase/schemas/**`
2. Open a PR — `.github/workflows/generate-migration.yml` runs `supabase db diff --schema public` and commits the generated migration to your PR branch
3. Pull the bot's commit, run `supabase db reset` locally to verify
4. Merge to `main` — `migrate.yml` pushes the migration chain to prod

Schemas are **declarative**: don't hand-write SQL in `supabase/migrations/`. `.claude/settings.json` has a permissions prompt on every write under `supabase/migrations/**` so the rule isn't bypassed by accident. The right answer is almost always to edit a file in `supabase/schemas/` instead.

See: [Declarative database schemas — Supabase docs](https://supabase.com/docs/guides/local-development/declarative-database-schemas).

## Files

| File | Purpose |
|---|---|
| `00_setup.sql` | Schema-wide setup: revokes default privileges on `public` (auto-grant cleanup), creates the `private` schema and grants USAGE on it. **Informational only** — see "Hand-author required" below. |
| `01_functions.sql` | Utility functions (`handle_new_user`, `update_updated_at_column`) used by triggers and RLS. |
| `02_tables.sql` | All tables (households, users, categories, expenses, budget_allocations, monthly_budget_targets), their indexes/triggers, and the `private` schema's RLS helper + auth hook. |
| `03_rls.sql` | All RLS policies (uses `private.get_my_household_id()`). |
| `05_rpcs.sql` | Stored procedures called via `supabase.rpc()` (`rebalance_budget`, `top_up_budget`, etc.). |

Order matters: file names are lex-sorted before `supabase db diff` reads them, so dependencies (function before trigger; table before policy) must respect that.

## Hand-author required

`supabase db diff` uses [migra](https://github.com/djrobstep/migra) under the hood and there are a handful of database concepts it can't track. From the Supabase ["Known caveats" docs](https://supabase.com/docs/guides/local-development/declarative-database-schemas#known-caveats):

- **DML** (`insert`/`update`/`delete`) — never tracked
- **Schema-level grants** (`GRANT USAGE ON SCHEMA …`) — "not tracked because each schema is diffed separately"
- **Default privileges** (`ALTER DEFAULT PRIVILEGES`) — known bug: ["grant statements are duplicated from default privileges"](https://github.com/supabase/cli/issues/1864)
- **`ALTER POLICY`** — only `CREATE` / `DROP` are tracked ([schemainspect note](https://github.com/djrobstep/schemainspect/blob/master/schemainspect/pg/obj.py#L228))
- **Column-level privileges** — [schemainspect#67](https://github.com/djrobstep/schemainspect/pull/67)
- **Views** — migra can't reliably round-trip view options (`security_invoker`, see [supabase/cli#3973](https://github.com/supabase/cli/issues/3973), [#792](https://github.com/supabase/cli/issues/792)) or grants ([migra#160](https://github.com/djrobstep/migra/issues/160)), and emits unnecessary `DROP + CREATE OR REPLACE` recreates on column adds to referenced tables. We keep `budget_summary` entirely out of `supabase/schemas/` and own the body via migrations; the workflow strips any view DDL migra emits from the auto-migration so options and grants survive column-add cycles.
- **`ALTER PUBLICATION ADD TABLE`** — [supabase/cli#883](https://github.com/supabase/cli/issues/883)
- **`REPLICA IDENTITY`** — bundled with publication caveats
- **Comments, partitions, `CREATE DOMAIN`**
- **Anything in the `private` schema** — the CI workflow uses `--schema public`, so `private` declarations are excluded from the diff regardless of migra's capabilities

For all of those, the source of truth lives in a hand-authored file under `supabase/migrations/`. The matching declaration in `supabase/schemas/**` (when present) is **informational only** — it's there so future readers see the full picture in one place, and so `supabase db diff` treats the entity as known state rather than emitting a phantom `DROP`. Inline comments tag each informational stub.

Where this PR's hand-authored migrations live, for reference:
- `20260514120000_add_household_id_to_jwt_claims.sql` — `private.custom_access_token_hook` + `private.get_my_household_id` (private schema)
- `20260513233000_move_get_my_household_id_to_private.sql` — the private schema setup and RLS policy `ALTER`s
- `20260513235951_decouple_realtime_from_declarative_schemas.sql` — realtime broadcast function/trigger, `ALTER PUBLICATION`, `REPLICA IDENTITY`, and the `realtime.messages` policy
- `20260514015245_drop_categories_from_realtime_publication.sql` — `ALTER PUBLICATION DROP TABLE`
- `20260514025710_drop_pg_graphql_extension.sql` — extension state

## What `db diff` does track (schema files ARE the SOT)

- Tables, columns, indexes, constraints
- Function bodies (with `SECURITY DEFINER`, `SET search_path`, `STABLE/IMMUTABLE`, etc.)
- Triggers
- Object-level grants on tables and functions (`GRANT EXECUTE ON FUNCTION …`, `GRANT SELECT ON public.users TO …`)
- RLS policy `CREATE` / `DROP`

These flow from `supabase/schemas/**` into auto-generated migrations on every PR.

## Sanity checks

- After schema changes, **always** run `npm run types:generate` to regenerate `src/lib/database.types.ts`. CI does this automatically on PRs, but local sync avoids spurious type errors.
- After modifying RLS policies or adding tables, check `mcp get_advisors --type security` (or the dashboard's Security Advisor) to catch missing policies.
- `supabase db reset` is the verification command — it wipes the local DB, applies all migrations from baseline, and re-runs seeds. If the result doesn't match `supabase/schemas/**`, `db diff` will flag it on the next PR.

## Useful links

- [Declarative schemas guide](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
- [Known caveats](https://supabase.com/docs/guides/local-development/declarative-database-schemas#known-caveats)
- [Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Postgres roles](https://supabase.com/docs/guides/database/postgres/roles)
- [Auth hooks overview](https://supabase.com/docs/guides/auth/auth-hooks)
- [Custom Access Token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
