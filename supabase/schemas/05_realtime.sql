-- Supabase Realtime: broadcast-via-trigger for expenses + budget_allocations.
--
-- postgres_changes is broken on this project (returns
-- CHANNEL_ERROR: mismatch between server and client bindings) and Supabase's
-- own docs recommend broadcast for new applications:
-- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.
--
-- Topic naming: '<table>_household_<household_id>'. The RLS policy on
-- realtime.messages below scopes reads to the caller's household.
--
-- categories stays on postgres_changes — no client subscribes to it today.

ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER TABLE categories REPLICA IDENTITY FULL;

-- Trigger function: SECURITY DEFINER (owned by postgres) so the inner
-- INSERT into realtime.messages bypasses RLS via postgres' BYPASSRLS bit.
-- authenticated does not have BYPASSRLS, and realtime.send swallows insert
-- failures with RAISE WARNING — so a non-DEFINER trigger would silently
-- drop every event.
CREATE OR REPLACE FUNCTION public.broadcast_household_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hh UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    hh := OLD.household_id;
  ELSE
    hh := NEW.household_id;
  END IF;
  PERFORM realtime.broadcast_changes(
    TG_TABLE_NAME || '_household_' || hh::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger functions don't need to be callable from PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.broadcast_household_table_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER expenses_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();

CREATE TRIGGER budget_allocations_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();

-- realtime.messages has RLS enabled with no policies by default; without this
-- SELECT policy, authenticated clients on private channels see nothing.
CREATE POLICY "household_members_read_household_topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'expenses_household_' || public.get_my_household_id()::text
    OR realtime.topic() = 'budget_allocations_household_' || public.get_my_household_id()::text
  );
