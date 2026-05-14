-- Supabase Realtime: broadcast trigger function + triggers.
--
-- Scope of this file: only the public-schema-visible parts of the realtime
-- layer (the triggers in public, plus the private function they depend on so
-- the shadow DB built by `supabase db diff` can resolve the reference).
--
-- NOT in this file (and intentionally so):
--   * realtime.messages SELECT policy — managed in
--     supabase/migrations/20260513235951_decouple_realtime_from_declarative_schemas.sql.
--     migra cannot reliably update the cross-schema policy when its
--     referenced function changes (it leaves the old reference behind and
--     the final DROP FUNCTION fails). See supabase/cli#3974, #4314.
--   * ALTER PUBLICATION / REPLICA IDENTITY — managed in the same hand-
--     authored migration. migra silently misses publication changes per #3974.
--
-- The .github/workflows/generate-migration.yml diff is run with
-- `--schema public` so migra does NOT diff the realtime or private schemas.
-- That keeps the realtime.messages policy and the private function body out
-- of migra's view, while still letting it see the triggers (which live on
-- public tables) and treat them as known state from this file.

-- Trigger function lives in private so it is invisible to migra's
-- --schema public diff scope. SECURITY DEFINER so the inner
-- realtime.broadcast_changes INSERT into realtime.messages bypasses RLS via
-- postgres' BYPASSRLS bit. authenticated does not have BYPASSRLS, and
-- realtime.send swallows insert failures with RAISE WARNING — so a non-
-- DEFINER trigger would silently drop every event.
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

revoke execute on function private.broadcast_household_table_changes() from public, anon, authenticated, service_role;

-- Triggers on public tables. Declared here so `supabase db diff --schema public`
-- sees them as known state and does not emit phantom DROPs.
create trigger expenses_broadcast_changes
  after insert or update or delete on expenses
  for each row execute function private.broadcast_household_table_changes();

create trigger budget_allocations_broadcast_changes
  after insert or update or delete on budget_allocations
  for each row execute function private.broadcast_household_table_changes();
