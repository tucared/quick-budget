-- Schema-wide setup: default privileges for the `public` schema.
--
-- Runs first (lex-ordered before all other schema files) so any object
-- created by subsequent files inherits the no-auto-grant default.
--
-- Supabase is removing public-schema auto-grants on the Data API: new
-- projects switch on May 30, 2026; existing projects on October 30, 2026.
-- See https://github.com/orgs/supabase/discussions/45329.
--
-- The baseline migration (20260308171853_baseline.sql:963-986) configures
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ...`
-- for anon/authenticated/service_role across tables, functions and sequences.
-- The statements below reverse those auto-grants for the three API roles, so
-- any object newly created in `public` does not inherit grants implicitly.
-- Explicit GRANT statements alongside each object are the source of truth.
--
-- Forward-only: ALTER DEFAULT PRIVILEGES does not affect existing objects.
-- Pre-existing grants on the current set of objects are cleaned up by the
-- per-object REVOKE statements in 01_functions.sql, 05_rpcs.sql and
-- 06_realtime.sql. `postgres` keeps its own defaults so the role still owns
-- and can fully manage everything.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
