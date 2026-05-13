-- Hand-edited. `supabase db diff` only captured the anon REVOKEs because
-- the local Supabase stack auto-grants public-schema tables to
-- authenticated/service_role by default, producing no diff for the GRANTs
-- added in supabase/schemas/**. Supabase is removing this auto-grant
-- behavior (May 30 / Oct 30, see https://github.com/orgs/supabase/discussions/45329);
-- after that, fresh environments restored from this migration chain alone
-- need these grants applied explicitly.
--
-- Function REVOKEs target PUBLIC *and* anon/authenticated/service_role: the
-- local stack auto-grants function EXECUTE to those roles on creation (same
-- pattern as tables), so REVOKE FROM PUBLIC alone is a no-op.

-- Tables
revoke select on table "public"."budget_allocations" from "anon";
grant select, insert, update, delete on table "public"."budget_allocations" to "authenticated";
grant select, insert, update, delete on table "public"."budget_allocations" to "service_role";

revoke select on table "public"."categories" from "anon";
grant select, insert, update, delete on table "public"."categories" to "authenticated";
grant select, insert, update, delete on table "public"."categories" to "service_role";

revoke select on table "public"."exchange_rates" from "anon";
grant select on table "public"."exchange_rates" to "authenticated";
grant select, insert, update, delete on table "public"."exchange_rates" to "service_role";

revoke select on table "public"."expenses" from "anon";
grant select, insert, update, delete on table "public"."expenses" to "authenticated";
grant select, insert, update, delete on table "public"."expenses" to "service_role";

revoke select on table "public"."households" from "anon";
grant select on table "public"."households" to "authenticated";
grant select, insert, update, delete on table "public"."households" to "service_role";

revoke select on table "public"."monthly_budget_targets" from "anon";
grant select, insert, update, delete on table "public"."monthly_budget_targets" to "authenticated";
grant select, insert, update, delete on table "public"."monthly_budget_targets" to "service_role";

revoke select on table "public"."users" from "anon";
grant select, insert, update on table "public"."users" to "authenticated";
grant select, insert, update, delete on table "public"."users" to "service_role";

-- View
revoke select on table "public"."budget_summary" from "anon";
grant select on table "public"."budget_summary" to "authenticated";
grant select on table "public"."budget_summary" to "service_role";

-- Functions: revoke from PUBLIC and the auto-granted default API roles, then
-- re-grant to authenticated where intended.
revoke execute on function public.handle_new_user() from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.get_my_household_id() from PUBLIC, anon, authenticated, service_role;
grant execute on function public.get_my_household_id() to authenticated;
