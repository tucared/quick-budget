-- Hand-authored. Drops the public.users fallback from
-- private.get_my_household_id() now that the custom access token hook is
-- live on Dev *and* Prod (Authentication → Hooks → Custom Access Token →
-- private.custom_access_token_hook). Every newly-issued JWT carries
-- app_metadata.household_id, so the COALESCE fallback is no longer
-- needed for RLS evaluation.
--
-- Why hand-authored:
--   The function lives in the `private` schema, which is intentionally
--   excluded from `supabase db diff --schema public` (see CLAUDE.md).
--
-- Rollout note: access tokens minted before the hook was enabled won't
-- carry the claim. With this migration applied, RLS for such tokens
-- returns zero rows — the user sees an empty UI and is bounced through
-- /login by the page-level redirect that fires when getServerUser
-- returns null. On the next /token POST the refreshed token carries the
-- claim and the user is back to normal. The default Supabase access
-- token TTL is one hour, so the at-risk population shrinks within
-- minutes of deploy.
--
-- private.custom_access_token_hook is unchanged: it's the one path
-- that legitimately reads public.users (it's how household_id ends up
-- in the JWT in the first place).

CREATE OR REPLACE FUNCTION private.get_my_household_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'household_id',
    ''
  )::uuid;
$$;

REVOKE EXECUTE ON FUNCTION private.get_my_household_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_my_household_id() TO authenticated;
