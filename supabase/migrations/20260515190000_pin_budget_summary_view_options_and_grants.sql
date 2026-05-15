-- Hand-authored. Pins the steady-state options and grants for budget_summary
-- once at chain apply. Two migra bugs make declarative ownership of these
-- impractical:
--
-- 1. Migra does not read view options like `security_invoker` back from
--    pg_class.reloptions (supabase/cli#3973, #792), so it always thinks the
--    option needs to be re-applied and emits a `DROP VIEW + CREATE OR
--    REPLACE VIEW` on every db diff. The recreated view loses the option
--    on emission, so even if you declare WITH (security_invoker = true) in
--    a schema file, the auto-migration that lands strips it.
-- 2. Migra does not diff GRANT/REVOKE, and Postgres drops a view's grants
--    when the view is dropped — so any recreate leaves the view with only
--    the owner's grants.
--
-- budget_summary is therefore not declared in supabase/schemas/ at all. The
-- view body lives in the migration chain (baseline + future hand-authored
-- migrations for body changes). The generate-migration workflow strips any
-- budget_summary view DDL migra still emits from auto-migrations, which
-- means side-effect recreates (column adds on referenced tables) preserve
-- the view's existing options and grants instead of stripping them.
--
-- This migration is the one place options and grants get re-asserted, and
-- it's idempotent — safe to leave in the chain forever.

ALTER VIEW public.budget_summary SET (security_invoker = true);

GRANT SELECT ON public.budget_summary TO authenticated;
GRANT SELECT ON public.budget_summary TO service_role;
REVOKE SELECT ON public.budget_summary FROM anon;
