-- Schema-wide setup: default privileges for the `public` schema.
--
-- Runs first (lex-ordered before all other schema files) so any object
-- created by subsequent files inherits the no-auto-grant default.
--
-- Supabase is removing public-schema auto-grants on the Data API: new
-- projects switch on May 30, 2026; existing projects on October 30, 2026.
-- See https://github.com/orgs/supabase/discussions/45329.
--
-- pg_default_acl on this project shows TWO granters configuring auto-grants
-- on `public`: `postgres` (from 20260308171853_baseline.sql:963-986) and
-- `supabase_admin` (platform-managed). Both must be revoked, otherwise new
-- objects created by the `supabase_admin` ancestor role still inherit grants.
-- `postgres` and `supabase_admin` keep their own defaults so the roles still
-- own and can fully manage everything.
--
-- The supabase_admin block is wrapped in DO/EXCEPTION because the local
-- Supabase CLI applies migrations as `postgres`, which does not have admin
-- rights on `supabase_admin`. On managed Supabase environments the executing
-- role has the necessary membership, so the statements apply for real.
--
-- Forward-only: ALTER DEFAULT PRIVILEGES does not affect existing objects.
-- Pre-existing grants on the current set of objects are cleaned up by the
-- per-object REVOKE statements in 01_functions.sql, 05_rpcs.sql and
-- 06_realtime.sql, plus the hand-authored statements appended to the
-- accompanying migration (supabase db diff / migra ignores pg_default_acl
-- and function ACLs, so these can't be auto-generated).

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated, service_role;

DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated, service_role;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping supabase_admin default-privilege revokes: current role lacks rights on supabase_admin (expected on the local Supabase CLI stack).';
END;
$$;

-- `private` schema: holds RLS helper functions that authenticated must be
-- able to invoke (e.g. get_my_household_id) but that should NOT be reachable
-- from PostgREST/RPC. PostgREST's exposed-schema list lives in
-- supabase/config.toml `db.schemas` and intentionally excludes `private`,
-- so functions here are invisible to REST/GraphQL clients while RLS
-- policies can still call them via schema-qualified references.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping supabase_admin default-privilege revokes on private schema: current role lacks rights on supabase_admin (expected on the local Supabase CLI stack).';
END;
$$;
