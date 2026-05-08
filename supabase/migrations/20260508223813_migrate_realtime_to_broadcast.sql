-- Migrate realtime from postgres_changes to broadcast-via-trigger.
--
-- postgres_changes is broken on this project (CHANNEL_ERROR: mismatch
-- between server and client bindings) and Supabase's docs recommend
-- broadcast for new applications. categories stays on postgres_changes;
-- no client currently subscribes to it.

ALTER PUBLICATION supabase_realtime DROP TABLE public.expenses;
ALTER PUBLICATION supabase_realtime DROP TABLE public.budget_allocations;
ALTER TABLE public.expenses REPLICA IDENTITY DEFAULT;
ALTER TABLE public.budget_allocations REPLICA IDENTITY DEFAULT;

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

-- Trigger functions don't need to be callable from PostgREST RPC. Revoke
-- public/anon/authenticated EXECUTE so it can't be invoked via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.broadcast_household_table_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER expenses_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();

CREATE TRIGGER budget_allocations_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.budget_allocations
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();

CREATE POLICY "household_members_read_household_topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'expenses_household_' || public.get_my_household_id()::text
    OR realtime.topic() = 'budget_allocations_household_' || public.get_my_household_id()::text
  );
