-- Hand-authored. Adds household_id to every issued JWT via a Supabase
-- custom_access_token auth hook, then updates the RLS helper to prefer
-- the JWT claim over a public.users lookup.
--
-- Why hand-authored:
--   * private.get_my_household_id() lives in the `private` schema, which
--     is intentionally excluded from `supabase db diff --schema public`
--     (see CLAUDE.md). Any change here must ship as a hand-authored
--     migration.
--   * The auth hook function is bundled here so both halves of the
--     change land atomically — the helper's JWT-first path is a no-op
--     without the hook, but it's cleaner to ship the pair together than
--     across two migrations.
--
-- Rollout note: existing access tokens issued before the hook is enabled
-- on the Supabase Cloud project (Authentication → Hooks → Custom Access
-- Token, set to public.custom_access_token_hook) won't carry the claim.
-- The helper's COALESCE fallback handles those by reading public.users —
-- so there's no broken interim state. The fallback can be removed in a
-- later migration once all tokens have rotated.

-- ============================================================================
-- Auth hook function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
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

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;

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
