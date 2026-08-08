
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_pending_invite(check_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM household_invites
    WHERE lower(email) = lower(check_email) AND consumed_at IS NULL
  );
$function$
;


