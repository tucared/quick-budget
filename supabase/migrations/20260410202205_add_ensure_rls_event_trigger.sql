-- Bring local + dev in sync with prod, where this event trigger has always
-- existed but was missed by the original baseline regen from `pg_dump` (event
-- triggers live outside of `pg_dump`'s default scope).
--
-- The function `public.rls_auto_enable()` already exists in baseline; only the
-- event trigger needs to be created. Both are now declared in
-- `supabase/schemas/02_rls.sql` so future `db diff` runs will not flag drift.
--
-- Idempotent: prod already has this trigger and `migrate.yml` will run this
-- migration via `supabase db push` on merge. The DROP IF EXISTS makes the
-- recreate a no-op behaviorally on prod and a clean create on local + dev.

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
