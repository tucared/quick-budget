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
