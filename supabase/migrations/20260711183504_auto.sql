
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  new_household_id UUID;
  invite_household_id UUID;
  matched_invite_id UUID;
  signer_name TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), '');
  invite_email TEXT;
  base_ccy TEXT;
  secondary_ccy TEXT;
BEGIN
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
    VALUES (NEW.id, NEW.email, signer_name, invite_household_id);

    -- Consume only the invite we acted on, so any other household's pending
    -- invite for this email stays open rather than being silently burned.
    UPDATE public.household_invites
    SET consumed_at = NOW()
    WHERE id = matched_invite_id;

    -- Adopt the joiner's real name on the allowance the founder pre-seeded from
    -- this email's local-part (we only knew the address back then). No-op if the
    -- joiner gave no name or the founder renamed/removed the allowance. The
    -- founder path stored the invite email (and thus the allowance name)
    -- lowercased, so lowercase NEW.email before matching — the seed path and
    -- direct auth.users inserts can carry mixed-case emails.
    IF signer_name <> '' THEN
      UPDATE public.categories
      SET name = signer_name || '''s Allowance'
      WHERE household_id = invite_household_id
        AND exclude_from_budget_total = TRUE
        AND name = split_part(lower(NEW.email), '@', 1) || '''s Allowance';
    END IF;

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
      COALESCE(NULLIF(signer_name, ''), NEW.email) || '''s Household'
    ),
    base_ccy,
    secondary_ccy
  )
  RETURNING id INTO new_household_id;

  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (NEW.id, NEW.email, signer_name, new_household_id);

  -- Default spending categories (mirrors supabase/seeds/02_seed_categories.sql)
  -- so the app is usable immediately; customization waits for the category UI.
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active) VALUES
    (new_household_id, 'Groceries', '🛒', FALSE, TRUE),
    (new_household_id, 'Dining Out', '🍽️', FALSE, TRUE),
    (new_household_id, 'Transportation', '🚌', FALSE, TRUE),
    (new_household_id, 'Entertainment', '🎭', FALSE, TRUE),
    (new_household_id, 'Shopping', '🛍️', FALSE, TRUE),
    (new_household_id, 'Bills', '📋', FALSE, TRUE);

  -- One personal allowance for the founder. Lowercase the email fallback so it
  -- matches the invitee allowances (invite emails are stored lowercased).
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
  VALUES (
    new_household_id,
    COALESCE(NULLIF(signer_name, ''), split_part(lower(NEW.email), '@', 1)) || '''s Allowance',
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

      -- Only seed the allowance when the invite row was actually created. A
      -- duplicate pending invite for this household is a no-op, and seeding
      -- unconditionally would leave an orphan allowance behind.
      IF FOUND THEN
        INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active)
        VALUES (new_household_id, split_part(invite_email, '@', 1) || '''s Allowance', '🧑', TRUE, TRUE);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$
;


