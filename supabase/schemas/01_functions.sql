-- Utility functions used by tables, triggers, and RLS policies.
--
-- This file is part of the declarative schema. PRs that touch
-- supabase/schemas/** trigger .github/workflows/generate-migration.yml,
-- which runs `supabase db diff` and auto-commits any generated migration
-- to the PR branch. A comment-only change like this one is a no-op for
-- the diff and serves as a smoke test that the workflow runs cleanly.

-- Automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a household for this user
  INSERT INTO public.households (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Household')
  RETURNING id INTO new_household_id;

  -- Insert user profile with household_id
  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    new_household_id
  );

  RETURN NEW;
END;
$$;

-- Trigger-only function: block direct REST/RPC calls from every role. Must
-- revoke from PUBLIC *and* the explicit default API roles — Supabase auto-grants
-- EXECUTE to anon/authenticated/service_role on creation, so REVOKE FROM PUBLIC
-- alone leaves those explicit grants in place.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger-only function: block direct REST/RPC calls from every role.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;

-- Supabase Auth hook: inject household_id into every issued access token as
-- app_metadata.household_id. Lets server- and client-side code read the
-- household scope from the JWT instead of querying public.users on every
-- page load. The hook must be configured in supabase/config.toml (local)
-- and in the Supabase dashboard (Authentication → Hooks → Custom Access
-- Token) for Dev/Prod cloud projects — config.toml does not propagate.
--
-- SECURITY DEFINER so the function reads public.users with the owner's
-- privileges, sidestepping the row-level grants on authenticated.
-- supabase_auth_admin (the role that invokes the hook) only needs EXECUTE
-- on the function itself.
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
