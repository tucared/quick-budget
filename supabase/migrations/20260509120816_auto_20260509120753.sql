set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.broadcast_household_table_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE TRIGGER budget_allocations_broadcast_changes AFTER INSERT OR DELETE OR UPDATE ON public.budget_allocations FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();

CREATE TRIGGER expenses_broadcast_changes AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.broadcast_household_table_changes();


  create policy "household_members_read_household_topics"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (((realtime.topic() = ('expenses_household_'::text || (public.get_my_household_id())::text)) OR (realtime.topic() = ('budget_allocations_household_'::text || (public.get_my_household_id())::text))));



