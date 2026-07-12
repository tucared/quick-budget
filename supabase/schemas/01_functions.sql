-- Utility functions used by tables, triggers, and RLS policies.
--
-- This file is part of the declarative schema. PRs that touch
-- supabase/schemas/** trigger .github/workflows/generate-migration.yml,
-- which runs `supabase db diff` and auto-commits any generated migration
-- to the PR branch. A comment-only change like this one is a no-op for
-- the diff and serves as a smoke test that the workflow runs cleanly.

-- Automatically create (or join) a household once a signup is CONFIRMED.
--
-- Two paths, keyed off whether the new user's email matches an unconsumed
-- household_invites row (case-insensitive):
--   - Invited member: link to that existing household, consume the invite, and
--     create their personal allowance (named from the allowance_name they
--     chose at signup, falling back to "<email name>'s Allowance"). No new
--     household and no spending-category seeding — they inherit the founder's.
--   - Founder: create a household reading name/currencies from the signup form's
--     raw_user_meta_data (falling back to the legacy defaults), seed the
--     spending categories chosen on the signup form (clamped and deduped, max
--     20; the classic 6-category starter set when none are usable) + the
--     founder's own allowance, then write an invite row per partner email
--     (capped at 10) so the partner can self-join later. Partner allowances are
--     NOT pre-seeded — each is created at join time under the joiner's own
--     chosen name, so there is no placeholder naming or rename-on-join to keep
--     consistent.
--
-- Fires from two triggers (see DATA_MODEL decision #1, "Timing"):
--   - on_auth_user_created (AFTER INSERT): acts only when the row is already
--     confirmed — the seed path and SQL-provisioned users. A real signUp
--     inserts unconfirmed and is a no-op here.
--   - on_auth_user_confirmed (AFTER UPDATE, hand-authored migration): fires on
--     the email_confirmed_at NULL→NOT NULL transition, i.e. when the user
--     clicks the confirmation link. This is what materializes a real signup —
--     an abandoned signup leaves only an unconfirmed auth.users row (no ghost
--     household), and an invite can only be consumed by someone who can
--     actually receive mail at the invited address.
--
-- raw_user_meta_data is the `options.data` passed to supabase.auth.signUp(),
-- read at confirmation time. Everything is schema-qualified because
-- search_path is empty.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_household_id UUID;
  invite_household_id UUID;
  matched_invite_id UUID;
  signer_name TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '');
  -- Display name shown to the partner (e.g. Tricount member mapping). The
  -- signup form no longer collects a name, so this usually resolves to the
  -- email local-part; full_name is still honored for direct/legacy callers.
  display_name TEXT;
  -- Explicit personal-allowance name from the signup form; used verbatim when
  -- present (no "'s Allowance" suffix), clamped like every metadata field.
  allowance_name TEXT;
  invite_email TEXT;
  base_ccy TEXT;
  secondary_ccy TEXT;
  seeded_category_count INTEGER := 0;
BEGIN
  display_name := COALESCE(NULLIF(signer_name, ''), split_part(lower(NEW.email), '@', 1));
  allowance_name := COALESCE(
    NULLIF(left(btrim(COALESCE(NEW.raw_user_meta_data->>'allowance_name', '')), 40), ''),
    display_name || '''s Allowance'
  );

  -- Materialize nothing until the email is confirmed. Real signups INSERT
  -- unconfirmed (no-op here) and run via the UPDATE trigger when the
  -- confirmation link is clicked; seed-path/provisioned rows INSERT
  -- pre-confirmed and run immediately.
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotence across the INSERT + UPDATE trigger pair (a pre-confirmed
  -- INSERT fires both paths' conditions over its lifetime) and across any
  -- repeated confirmation-shaped update.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- Invited member: join the household that pre-authorized this email.
  -- Invites are unique per (household, email), so the same address can be
  -- invited by more than one household; the oldest pending invite wins.
  -- ----------------------------------------------------------------
  SELECT id, household_id INTO matched_invite_id, invite_household_id
  FROM public.household_invites
  WHERE lower(email) = lower(NEW.email) AND consumed_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF invite_household_id IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, household_id)
    VALUES (NEW.id, NEW.email, display_name, invite_household_id);

    -- Consume only the invite we acted on, so any other household's pending
    -- invite for this email stays open rather than being silently burned.
    UPDATE public.household_invites
    SET consumed_at = NOW()
    WHERE id = matched_invite_id;

    -- The joiner's personal allowance, under the name they chose at signup.
    -- Created here, at join time, rather than pre-seeded by the founder — so
    -- the name comes from the person it belongs to and no fragile
    -- name-matching rename is needed.
    INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
    VALUES (invite_household_id, allowance_name, '🧑', TRUE, TRUE);

    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- Founder: create the household with the chosen name + currencies.
  -- ----------------------------------------------------------------
  -- Clamp the metadata-supplied currencies. The signup form only submits valid
  -- distinct ISO codes, but raw_user_meta_data is caller-controlled (anyone can
  -- call auth.signUp directly), and an invalid or equal pair would violate the
  -- households CHECKs and abort the whole signup with an opaque "Database error
  -- saving new user". Uppercase what we got and fall back to the defaults.
  base_ccy := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'base_currency', '')));
  IF base_ccy !~ '^[A-Z]{3}$' THEN
    base_ccy := 'EUR';
  END IF;
  secondary_ccy := upper(btrim(COALESCE(NEW.raw_user_meta_data->>'secondary_currency', '')));
  IF secondary_ccy !~ '^[A-Z]{3}$' OR secondary_ccy = base_ccy THEN
    secondary_ccy := CASE WHEN base_ccy = 'BRL' THEN 'EUR' ELSE 'BRL' END;
  END IF;

  INSERT INTO public.households (name, base_currency, secondary_currency)
  VALUES (
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'household_name', ''),
      display_name || '''s Household'
    ),
    base_ccy,
    secondary_ccy
  )
  RETURNING id INTO new_household_id;

  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (NEW.id, NEW.email, display_name, new_household_id);

  -- Spending categories chosen on the signup form. raw_user_meta_data is
  -- caller-controlled, so clamp: keep only objects with a non-empty name and
  -- icon (categories_icon_not_empty CHECK), trim + cap lengths, dedupe
  -- case-insensitively by name (first occurrence wins), preserve the form's
  -- order, and LIMIT to the form's cap (MAX_SIGNUP_CATEGORIES in
  -- src/lib/validations.ts — keep the two in sync).
  IF jsonb_typeof(NEW.raw_user_meta_data->'categories') = 'array' THEN
    INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
    SELECT new_household_id, c.name, c.icon, FALSE, TRUE
    FROM (
      SELECT DISTINCT ON (lower(left(btrim(value->>'name'), 40)))
        left(btrim(value->>'name'), 40) AS name,
        left(btrim(value->>'icon'), 16) AS icon,
        ordinality
      FROM jsonb_array_elements(NEW.raw_user_meta_data->'categories') WITH ORDINALITY AS t(value, ordinality)
      WHERE jsonb_typeof(value) = 'object'
        AND btrim(COALESCE(value->>'name', '')) <> ''
        AND btrim(COALESCE(value->>'icon', '')) <> ''
      ORDER BY lower(left(btrim(value->>'name'), 40)), ordinality
    ) c
    ORDER BY c.ordinality
    LIMIT 20;
    GET DIAGNOSTICS seeded_category_count = ROW_COUNT;
  END IF;

  -- Fallback when the metadata carried no usable categories (direct
  -- auth.signUp call, legacy client, or a crafted payload): seed the classic
  -- starter set (mirrors supabase/seeds/02_seed_categories.sql) so the
  -- household is usable immediately.
  IF seeded_category_count = 0 THEN
    INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active) VALUES
      (new_household_id, 'Groceries', '🛒', FALSE, TRUE),
      (new_household_id, 'Dining Out', '🍽️', FALSE, TRUE),
      (new_household_id, 'Transportation', '🚌', FALSE, TRUE),
      (new_household_id, 'Entertainment', '🎭', FALSE, TRUE),
      (new_household_id, 'Shopping', '🛍️', FALSE, TRUE),
      (new_household_id, 'Bills', '📋', FALSE, TRUE);
  END IF;

  -- One personal allowance for the founder, under the name they chose at
  -- signup. Partner allowances are created when each partner joins (invited
  -- path above), named by the joiner themselves.
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
  VALUES (new_household_id, allowance_name, '🧑', TRUE, TRUE);

  -- Partner emails: one invite row each. Skip blanks and self; a duplicate
  -- within this household is a clean no-op (ON CONFLICT). The LIMIT mirrors
  -- the signup form's 10-partner cap (MAX_PARTNER_EMAILS in
  -- src/lib/validations.ts) and bounds what a crafted direct auth.signUp call
  -- can write — raw_user_meta_data is caller-controlled; the ORDER BY makes
  -- which 10 survive deterministic (alphabetical) instead of plan-dependent.
  IF jsonb_typeof(NEW.raw_user_meta_data->'invite_emails') = 'array' THEN
    FOR invite_email IN
      SELECT DISTINCT lower(btrim(value))
      FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'invite_emails') AS t(value)
      WHERE btrim(value) <> '' AND lower(btrim(value)) <> lower(NEW.email)
      ORDER BY 1
      LIMIT 10
    LOOP
      INSERT INTO public.household_invites (household_id, email)
      VALUES (new_household_id, invite_email)
      ON CONFLICT DO NOTHING;
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
