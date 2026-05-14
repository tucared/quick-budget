-- Hand-authored. Closes a gap left by the auto-generated migration
-- 20260514172710_auto_20260514172649.sql, which created the
-- get_expenses_and_categories function but did not emit the
-- REVOKE/GRANT statements declared in supabase/schemas/05_rpcs.sql.
-- `supabase db diff` doesn't capture function-level grants (a known
-- migra limitation); without this follow-up the new function lands on
-- a fresh DB with the PostgreSQL default of EXECUTE TO PUBLIC, which
-- conflicts with the explicit "authenticated only" intent declared
-- in the schema and matched by every other RPC on Prod
-- (rebalance_budget, save_budget, allocate_from_unallocated,
-- top_up_budget).
--
-- RLS protects the data either way — anon callers would only see
-- empty arrays via private.get_my_household_id returning NULL — so
-- this is hardening, not a leak fix.

REVOKE EXECUTE ON FUNCTION public.get_expenses_and_categories(TEXT, INT, DATE) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expenses_and_categories(TEXT, INT, DATE) TO authenticated;
