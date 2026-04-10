-- Drop the orphaned `rls_auto_enable` function.
--
-- History: this function existed in the baseline migration as the body of an
-- `ensure_rls` event trigger that auto-enabled RLS on any new public table.
-- Per Supabase's docs the recommended approach is explicit RLS enablement on
-- each table, and the trigger introduced cross-environment drift (managed
-- Supabase restricts CREATE EVENT TRIGGER to superuser, so dev / greenfield
-- projects could not recreate it from a migration). The trigger has been
-- manually removed from prod via the dashboard SQL editor (`DROP EVENT TRIGGER
-- ensure_rls;`); this migration drops the now-unused function.
--
-- Going forward, RLS coverage is enforced explicitly in
-- `supabase/schemas/02_rls.sql` and gated post-push by the `pg_tables`
-- check in `.github/workflows/migrate.yml`.

DROP FUNCTION IF EXISTS public.rls_auto_enable();
