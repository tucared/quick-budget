-- Cleanup statements that supabase db diff does not emit:
--   * publication membership drops
--   * REPLICA IDENTITY changes (FULL -> DEFAULT)
--   * function ACL revokes
--
-- Pairs with 20260509120816_auto_*.sql (the auto-generated half of the
-- broadcast-via-trigger migration). The schema in supabase/schemas/05_realtime.sql
-- describes the intended end state declaratively; this migration closes the
-- gaps that the schema-diff workflow can't generate on its own.

ALTER PUBLICATION supabase_realtime DROP TABLE public.expenses;
ALTER PUBLICATION supabase_realtime DROP TABLE public.budget_allocations;

ALTER TABLE public.expenses REPLICA IDENTITY DEFAULT;
ALTER TABLE public.budget_allocations REPLICA IDENTITY DEFAULT;

REVOKE EXECUTE ON FUNCTION public.broadcast_household_table_changes() FROM PUBLIC, anon, authenticated;
