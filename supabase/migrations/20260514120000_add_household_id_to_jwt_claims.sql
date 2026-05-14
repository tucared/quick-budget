-- Hand-authored. Adds household_id to every issued JWT via a Supabase
-- custom_access_token auth hook, then updates the RLS helper to prefer
-- the JWT claim over a public.users lookup.
--
-- Why hand-authored:
--   * Both functions live in the `private` schema, which is intentionally
--     excluded from `supabase db diff --schema public` (see CLAUDE.md).
--     Any change here must ship as a hand-authored migration.
--
-- Schema choice: `private` keeps the hook off the PostgREST/RPC surface
-- (it never appears in generated TypeScript types) and signals that only
-- supabase_auth_admin should ever call it. The schema is set up in
-- supabase/schemas/00_setup.sql with USAGE granted to authenticated
-- (for the RLS helper) and supabase_auth_admin (for the auth hook).
--
-- Rollout note: existing access tokens issued before the hook is enabled
-- on the Supabase Cloud project (Authentication → Hooks → Custom Access
-- Token, set to `private.custom_access_token_hook`) won't carry the
-- claim. The helper's COALESCE fallback handles those by reading
-- public.users — so there's no broken interim state. The fallback can be
-- removed in a later migration once all tokens have rotated.

-- ============================================================================
-- Schema grant for supabase_auth_admin (idempotent with 00_setup.sql)
-- ============================================================================
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;

-- ============================================================================
-- Auth hook function (lives in `private`, invoked by supabase_auth_admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION private.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hid uuid;
  claims jsonb;
BEGIN
  SELECT household_id INTO hid FROM public.users WHERE id = (event->>'user_id')::uuid;
  IF hid IS NULL THEN
    RETURN event;
  END IF;
  claims := event->'claims';
  claims := jsonb_set(claims, '{app_metadata}', COALESCE(claims->'app_metadata', '{}'::jsonb));
  claims := jsonb_set(claims, '{app_metadata,household_id}', to_jsonb(hid::text));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ============================================================================
-- RLS helper: prefer JWT claim, fall back to users SELECT for legacy tokens
-- ============================================================================
CREATE OR REPLACE FUNCTION private.get_my_household_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'household_id', '')::uuid,
    (SELECT household_id FROM users WHERE id = auth.uid() LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION private.get_my_household_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_my_household_id() TO authenticated;
