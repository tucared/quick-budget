revoke delete on table "public"."budget_allocations" from "anon";

revoke insert on table "public"."budget_allocations" from "anon";

revoke references on table "public"."budget_allocations" from "anon";

revoke trigger on table "public"."budget_allocations" from "anon";

revoke truncate on table "public"."budget_allocations" from "anon";

revoke update on table "public"."budget_allocations" from "anon";

revoke references on table "public"."budget_allocations" from "authenticated";

revoke trigger on table "public"."budget_allocations" from "authenticated";

revoke truncate on table "public"."budget_allocations" from "authenticated";

revoke references on table "public"."budget_allocations" from "service_role";

revoke trigger on table "public"."budget_allocations" from "service_role";

revoke truncate on table "public"."budget_allocations" from "service_role";

revoke delete on table "public"."categories" from "anon";

revoke insert on table "public"."categories" from "anon";

revoke references on table "public"."categories" from "anon";

revoke trigger on table "public"."categories" from "anon";

revoke truncate on table "public"."categories" from "anon";

revoke update on table "public"."categories" from "anon";

revoke references on table "public"."categories" from "authenticated";

revoke trigger on table "public"."categories" from "authenticated";

revoke truncate on table "public"."categories" from "authenticated";

revoke references on table "public"."categories" from "service_role";

revoke trigger on table "public"."categories" from "service_role";

revoke truncate on table "public"."categories" from "service_role";

revoke delete on table "public"."exchange_rates" from "anon";

revoke insert on table "public"."exchange_rates" from "anon";

revoke references on table "public"."exchange_rates" from "anon";

revoke trigger on table "public"."exchange_rates" from "anon";

revoke truncate on table "public"."exchange_rates" from "anon";

revoke update on table "public"."exchange_rates" from "anon";

revoke delete on table "public"."exchange_rates" from "authenticated";

revoke insert on table "public"."exchange_rates" from "authenticated";

revoke references on table "public"."exchange_rates" from "authenticated";

revoke trigger on table "public"."exchange_rates" from "authenticated";

revoke truncate on table "public"."exchange_rates" from "authenticated";

revoke update on table "public"."exchange_rates" from "authenticated";

revoke references on table "public"."exchange_rates" from "service_role";

revoke trigger on table "public"."exchange_rates" from "service_role";

revoke truncate on table "public"."exchange_rates" from "service_role";

revoke delete on table "public"."expenses" from "anon";

revoke insert on table "public"."expenses" from "anon";

revoke references on table "public"."expenses" from "anon";

revoke trigger on table "public"."expenses" from "anon";

revoke truncate on table "public"."expenses" from "anon";

revoke update on table "public"."expenses" from "anon";

revoke references on table "public"."expenses" from "authenticated";

revoke trigger on table "public"."expenses" from "authenticated";

revoke truncate on table "public"."expenses" from "authenticated";

revoke references on table "public"."expenses" from "service_role";

revoke trigger on table "public"."expenses" from "service_role";

revoke truncate on table "public"."expenses" from "service_role";

revoke delete on table "public"."households" from "anon";

revoke insert on table "public"."households" from "anon";

revoke references on table "public"."households" from "anon";

revoke trigger on table "public"."households" from "anon";

revoke truncate on table "public"."households" from "anon";

revoke update on table "public"."households" from "anon";

revoke delete on table "public"."households" from "authenticated";

revoke insert on table "public"."households" from "authenticated";

revoke references on table "public"."households" from "authenticated";

revoke trigger on table "public"."households" from "authenticated";

revoke truncate on table "public"."households" from "authenticated";

revoke update on table "public"."households" from "authenticated";

revoke references on table "public"."households" from "service_role";

revoke trigger on table "public"."households" from "service_role";

revoke truncate on table "public"."households" from "service_role";

revoke delete on table "public"."monthly_budget_targets" from "anon";

revoke insert on table "public"."monthly_budget_targets" from "anon";

revoke references on table "public"."monthly_budget_targets" from "anon";

revoke trigger on table "public"."monthly_budget_targets" from "anon";

revoke truncate on table "public"."monthly_budget_targets" from "anon";

revoke update on table "public"."monthly_budget_targets" from "anon";

revoke references on table "public"."monthly_budget_targets" from "authenticated";

revoke trigger on table "public"."monthly_budget_targets" from "authenticated";

revoke truncate on table "public"."monthly_budget_targets" from "authenticated";

revoke references on table "public"."monthly_budget_targets" from "service_role";

revoke trigger on table "public"."monthly_budget_targets" from "service_role";

revoke truncate on table "public"."monthly_budget_targets" from "service_role";

revoke delete on table "public"."users" from "anon";

revoke insert on table "public"."users" from "anon";

revoke references on table "public"."users" from "anon";

revoke trigger on table "public"."users" from "anon";

revoke truncate on table "public"."users" from "anon";

revoke update on table "public"."users" from "anon";

revoke delete on table "public"."users" from "authenticated";

revoke references on table "public"."users" from "authenticated";

revoke trigger on table "public"."users" from "authenticated";

revoke truncate on table "public"."users" from "authenticated";

revoke references on table "public"."users" from "service_role";

revoke trigger on table "public"."users" from "service_role";

revoke truncate on table "public"."users" from "service_role";


-- ============================================================================
-- Hand-authored addendum (supabase db diff / migra cannot generate these):
-- - pg_default_acl is not tracked by the diff tool
-- - function ACLs (pg_proc.proacl) are not tracked either
-- See supabase/discussions/45329 and the matching schema files
-- (00_setup.sql, 01_functions.sql, 05_rpcs.sql, 06_realtime.sql).
-- ============================================================================

-- Default privileges: revoke auto-grants under both configured granters
-- (pg_default_acl shows postgres + supabase_admin both granting on public).
alter default privileges for role postgres       in schema public revoke all     on tables    from anon, authenticated, service_role;
alter default privileges for role postgres       in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres       in schema public revoke all     on sequences from anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public revoke all     on tables    from anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public revoke all     on sequences from anon, authenticated, service_role;

-- Function REVOKEs: clean up lingering pre-opt-in auto-grants
revoke execute on function public.update_updated_at_column() from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.rebalance_budget(uuid, date, uuid, uuid, numeric) from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.save_budget(uuid, date, jsonb, numeric, boolean) from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.allocate_from_unallocated(uuid, date, uuid, numeric) from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.top_up_budget(uuid, date, uuid, numeric) from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.broadcast_household_table_changes() from service_role;

-- Re-grant EXECUTE on the RPCs to authenticated (matches the explicit GRANT in 05_rpcs.sql)
grant execute on function public.rebalance_budget(uuid, date, uuid, uuid, numeric) to authenticated;
grant execute on function public.save_budget(uuid, date, jsonb, numeric, boolean) to authenticated;
grant execute on function public.allocate_from_unallocated(uuid, date, uuid, numeric) to authenticated;
grant execute on function public.top_up_budget(uuid, date, uuid, numeric) to authenticated;
