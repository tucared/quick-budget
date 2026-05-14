-- Hand-authored. Manages the Supabase Realtime broadcast layer:
--   * publication membership for categories (postgres_changes path)
--   * SECURITY DEFINER trigger function (in private schema, so migra's
--     `--schema public` diff scope cannot see it)
--   * triggers on expenses + budget_allocations
--   * RLS SELECT policy on realtime.messages scoped to the caller's household
--
-- Why hand-authored: `supabase db diff` (migra) cannot reliably express the
-- cross-schema dependency between functions and the `realtime.messages`
-- policy USING clause. See supabase/cli#3974, #4314, #3483, #3416 and the
-- Supabase declarative-schemas docs disclaimer:
-- https://supabase.com/docs/guides/local-development/declarative-database-schemas
--
-- Replaces supabase/schemas/06_realtime.sql (deleted in the same change).
-- Idempotent so `supabase db reset` against an existing DB stays safe.

-- ============================================================================
-- Publication + replica identity
-- ALTER PUBLICATION ... ADD TABLE does not support IF NOT EXISTS, and a
-- prior migration (20260509120817) already added categories to the
-- publication. Guard with a pg_publication_tables check so this re-runs
-- safely on existing DBs and from a fresh `supabase db reset`.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table categories;
  end if;
end;
$$;
alter table categories replica identity full;

-- ============================================================================
-- Trigger function in private schema. SECURITY DEFINER so the inner
-- realtime.broadcast_changes INSERT into realtime.messages bypasses RLS via
-- postgres' BYPASSRLS bit. authenticated does not have BYPASSRLS, and
-- realtime.send swallows insert failures with RAISE WARNING — so a
-- non-DEFINER trigger would silently drop every event.
-- ============================================================================
create or replace function private.broadcast_household_table_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hh uuid;
begin
  if tg_op = 'DELETE' then
    hh := old.household_id;
  else
    hh := new.household_id;
  end if;
  perform realtime.broadcast_changes(
    tg_table_name || '_household_' || hh::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return coalesce(new, old);
end;
$$;

-- Defense in depth: private schema's default ACL already revokes EXECUTE from
-- all client roles, but be explicit (this function should never be RPC'd).
revoke execute on function private.broadcast_household_table_changes() from public, anon, authenticated, service_role;

-- ============================================================================
-- Triggers (drop/recreate to swap public.* -> private.* and stay idempotent).
-- ============================================================================
drop trigger if exists expenses_broadcast_changes on expenses;
create trigger expenses_broadcast_changes
  after insert or update or delete on expenses
  for each row execute function private.broadcast_household_table_changes();

drop trigger if exists budget_allocations_broadcast_changes on budget_allocations;
create trigger budget_allocations_broadcast_changes
  after insert or update or delete on budget_allocations
  for each row execute function private.broadcast_household_table_changes();

-- ============================================================================
-- The old public function has no dependents now and can go away.
-- ============================================================================
drop function if exists public.broadcast_household_table_changes();

-- ============================================================================
-- realtime.messages SELECT policy (drop/recreate to stay idempotent).
-- realtime.messages has RLS enabled with no policies by default; without this
-- policy, authenticated clients on private channels see nothing.
-- ============================================================================
drop policy if exists "household_members_read_household_topics" on realtime.messages;
create policy "household_members_read_household_topics"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() = 'expenses_household_' || private.get_my_household_id()::text
    or realtime.topic() = 'budget_allocations_household_' || private.get_my_household_id()::text
  );
