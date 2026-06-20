

  create table "public"."household_invites" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "email" text not null,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."household_invites" enable row level security;

CREATE UNIQUE INDEX household_invites_pkey ON public.household_invites USING btree (id);

CREATE UNIQUE INDEX idx_household_invites_email_pending ON public.household_invites USING btree (lower(email)) WHERE (consumed_at IS NULL);

CREATE INDEX idx_household_invites_household ON public.household_invites USING btree (household_id);

alter table "public"."household_invites" add constraint "household_invites_pkey" PRIMARY KEY using index "household_invites_pkey";

alter table "public"."household_invites" add constraint "household_invites_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."household_invites" validate constraint "household_invites_household_id_fkey";

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
$function$
;

grant select on table "public"."household_invites" to "authenticated";

grant delete on table "public"."household_invites" to "service_role";

grant insert on table "public"."household_invites" to "service_role";

grant select on table "public"."household_invites" to "service_role";

grant update on table "public"."household_invites" to "service_role";


  create policy "Household members can view invites"
  on "public"."household_invites"
  as permissive
  for select
  to public
using ((household_id = private.get_my_household_id()));



