-- Utility functions used by tables, triggers, and RLS policies.
--
-- This file is part of the declarative schema. PRs that touch
-- supabase/schemas/** trigger .github/workflows/generate-migration.yml,
-- which runs `supabase db diff` and auto-commits any generated migration
-- to the PR branch. A comment-only change like this one is a no-op for
-- the diff and serves as a smoke test that the workflow runs cleanly.

-- Automatically create (or join) a household on signup.
--
-- Two paths, keyed off whether the new user's email matches an unconsumed
-- household_invites row (case-insensitive):
--   - Invited member: link to that existing household, consume the invite, done.
--     No new household and no category seeding — they inherit the founder's.
--   - Founder: create a household reading name/currencies from the signup form's
--     raw_user_meta_data (falling back to the legacy defaults), seed a default
--     starter set of categories + an allowance per known member, then write an
--     invite row per partner email so the partner can self-join later.
--
-- raw_user_meta_data is the `options.data` passed to supabase.auth.signUp().
-- Everything is schema-qualified because search_path is empty.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_household_id UUID;
  invite_household_id UUID;
  founder_name TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '');
  invite_email TEXT;
BEGIN
  -- ----------------------------------------------------------------
  -- Invited member: join the household that pre-authorized this email.
  -- ----------------------------------------------------------------
  SELECT household_id INTO invite_household_id
  FROM public.household_invites
  WHERE lower(email) = lower(NEW.email) AND consumed_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF invite_household_id IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, household_id)
    VALUES (NEW.id, NEW.email, founder_name, invite_household_id);

    UPDATE public.household_invites
    SET consumed_at = NOW()
    WHERE lower(email) = lower(NEW.email) AND consumed_at IS NULL;

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- Founder: create the household with the chosen name + currencies.
  -- ----------------------------------------------------------------
  INSERT INTO public.households (name, base_currency, secondary_currency)
  VALUES (
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'household_name', ''),
      COALESCE(NULLIF(founder_name, ''), NEW.email) || '''s Household'
    ),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'base_currency', ''), 'EUR'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'secondary_currency', ''), 'BRL')
  )
  RETURNING id INTO new_household_id;

  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (NEW.id, NEW.email, founder_name, new_household_id);

  -- Default spending categories (mirrors supabase/seeds/02_seed_categories.sql)
  -- so the app is usable immediately; customization waits for the category UI.
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active) VALUES
    (new_household_id, 'Groceries', '🛒', FALSE, TRUE),
    (new_household_id, 'Dining Out', '🍽️', FALSE, TRUE),
    (new_household_id, 'Transportation', '🚌', FALSE, TRUE),
    (new_household_id, 'Entertainment', '🎭', FALSE, TRUE),
    (new_household_id, 'Shopping', '🛍️', FALSE, TRUE),
    (new_household_id, 'Bills', '📋', FALSE, TRUE);

  -- One personal allowance for the founder.
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
  VALUES (
    new_household_id,
    COALESCE(NULLIF(founder_name, ''), split_part(NEW.email, '@', 1)) || '''s Allowance',
    '🧑', TRUE, TRUE
  );

  -- Partner emails: one invite row + one allowance each (named from the email's
  -- local-part since we don't know their name yet). Skip blanks and self.
  IF jsonb_typeof(NEW.raw_user_meta_data->'invite_emails') = 'array' THEN
    FOR invite_email IN
      SELECT DISTINCT lower(btrim(value))
      FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'invite_emails') AS t(value)
      WHERE btrim(value) <> '' AND lower(btrim(value)) <> lower(NEW.email)
    LOOP
      INSERT INTO public.household_invites (household_id, email)
      VALUES (new_household_id, invite_email)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
      VALUES (new_household_id, split_part(invite_email, '@', 1) || '''s Allowance', '🧑', TRUE, TRUE);
    END LOOP;
  END IF;

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
