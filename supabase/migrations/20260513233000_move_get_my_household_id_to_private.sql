-- Hand-authored. `supabase db diff` (migra) can't fully generate this:
--   * it doesn't track function references inside policy expressions for
--     non-public schemas (the realtime.messages policy keeps the old
--     reference even with `--schema public,realtime`)
--   * the resulting DROP FUNCTION at the end fails on the realtime
--     dependency it didn't update.
--
-- Sequencing: create private schema/function -> ALTER every dependent
-- policy in place -> DROP old public function -> DROP unused indexes.

-- ============================================================================
-- private schema + function
-- ============================================================================
create schema if not exists private;
grant usage on schema private to authenticated;

alter default privileges for role postgres in schema private revoke execute on functions from PUBLIC, anon, authenticated, service_role;
do $$
begin
  alter default privileges for role supabase_admin in schema private revoke execute on functions from PUBLIC, anon, authenticated, service_role;
exception
  when insufficient_privilege then
    raise notice 'Skipping supabase_admin default-privilege revokes on private schema: current role lacks rights on supabase_admin (expected on the local Supabase CLI stack).';
end;
$$;

create or replace function private.get_my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from users where id = auth.uid() limit 1;
$$;

revoke execute on function private.get_my_household_id() from PUBLIC, anon, authenticated, service_role;
grant execute on function private.get_my_household_id() to authenticated;

-- ============================================================================
-- Re-bind every dependent policy via ALTER POLICY (in place; preserves the
-- policy identity, no DROP/CREATE churn).
-- ============================================================================

-- users
alter policy "Users can view household members" on public.users
  using (id = (select auth.uid()) or household_id = private.get_my_household_id());

-- households
alter policy "Users can view own household" on public.households
  using (id = private.get_my_household_id());

-- categories
alter policy "Household members can view categories" on public.categories
  using (household_id = private.get_my_household_id());
alter policy "Household members can insert categories" on public.categories
  with check (household_id = private.get_my_household_id());
alter policy "Household members can update categories" on public.categories
  using (household_id = private.get_my_household_id());
alter policy "Household members can delete categories" on public.categories
  using (household_id = private.get_my_household_id());

-- expenses
alter policy "Household members can view expenses" on public.expenses
  using (household_id = private.get_my_household_id());
alter policy "Household members can insert expenses" on public.expenses
  with check (
    household_id = private.get_my_household_id()
    and logged_by_user_id = (select auth.uid())
  );
alter policy "Household members can update expenses" on public.expenses
  using (household_id = private.get_my_household_id());
alter policy "Household members can delete expenses" on public.expenses
  using (household_id = private.get_my_household_id());

-- budget_allocations
alter policy "Household members can view budget allocations" on public.budget_allocations
  using (household_id = private.get_my_household_id());
alter policy "Household members can insert budget allocations" on public.budget_allocations
  with check (household_id = private.get_my_household_id());
alter policy "Household members can update budget allocations" on public.budget_allocations
  using (household_id = private.get_my_household_id());
alter policy "Household members can delete budget allocations" on public.budget_allocations
  using (household_id = private.get_my_household_id());

-- monthly_budget_targets
alter policy "Household members can view monthly budget targets" on public.monthly_budget_targets
  using (household_id = private.get_my_household_id());
alter policy "Household members can insert monthly budget targets" on public.monthly_budget_targets
  with check (household_id = private.get_my_household_id());
alter policy "Household members can update monthly budget targets" on public.monthly_budget_targets
  using (household_id = private.get_my_household_id());
alter policy "Household members can delete monthly budget targets" on public.monthly_budget_targets
  using (household_id = private.get_my_household_id());

-- realtime.messages (the one migra refuses to touch)
alter policy "household_members_read_household_topics" on realtime.messages
  using (
    realtime.topic() = 'expenses_household_' || private.get_my_household_id()::text
    or realtime.topic() = 'budget_allocations_household_' || private.get_my_household_id()::text
  );

-- ============================================================================
-- Drop the now-orphan public function
-- ============================================================================
drop function if exists public.get_my_household_id();

-- ============================================================================
-- Drop the two Prod-flagged unused indexes
-- ============================================================================
drop index if exists public.idx_budget_allocations_category;
drop index if exists public.idx_monthly_budget_targets_household_month;
