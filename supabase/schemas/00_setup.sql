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
-- Forward-only: ALTER DEFAULT PRIVILEGES does not affect existing objects.
-- Pre-existing grants on the current set of objects are cleaned up by the
-- per-object REVOKE statements in 01_functions.sql, 05_rpcs.sql and
-- 06_realtime.sql, plus the hand-authored statements appended to the
-- accompanying migration (supabase db diff / migra ignores pg_default_acl
-- and function ACLs, so these can't be auto-generated).

ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated, service_role;
