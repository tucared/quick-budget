
  create table "public"."budget_allocations" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "category_id" uuid not null,
    "budget_month" date not null,
    "allocated_amount" numeric(12,2) not null,
    "currency" text not null default 'EUR'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."budget_allocations" enable row level security;


  create table "public"."categories" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "name" text not null,
    "exclude_from_budget_total" boolean not null default false,
    "icon" text,
    "color" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."categories" enable row level security;


  create table "public"."exchange_rates" (
    "currency" text not null,
    "rate_date" date not null,
    "rate_to_eur" numeric(12,6) not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."exchange_rates" enable row level security;


  create table "public"."expenses" (
    "id" uuid not null default gen_random_uuid(),
    "logged_by_user_id" uuid not null,
    "household_id" uuid not null,
    "category_id" uuid,
    "is_cash" boolean not null default false,
    "amount" numeric(12,2) not null,
    "currency" text not null default 'EUR'::text,
    "converted_amount" numeric(12,2) not null,
    "converted_currency" text not null default 'EUR'::text,
    "exchange_rate" numeric(12,6) not null default 1.0,
    "expense_date" date not null default CURRENT_DATE,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."expenses" enable row level security;


  create table "public"."households" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."households" enable row level security;


  create table "public"."users" (
    "id" uuid not null,
    "email" text not null,
    "full_name" text,
    "household_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."users" enable row level security;

CREATE UNIQUE INDEX budget_allocations_household_id_category_id_budget_month_key ON public.budget_allocations USING btree (household_id, category_id, budget_month);

CREATE UNIQUE INDEX budget_allocations_pkey ON public.budget_allocations USING btree (id);

CREATE UNIQUE INDEX categories_pkey ON public.categories USING btree (id);

CREATE UNIQUE INDEX exchange_rates_pkey ON public.exchange_rates USING btree (currency, rate_date);

CREATE UNIQUE INDEX expenses_pkey ON public.expenses USING btree (id);

CREATE UNIQUE INDEX households_pkey ON public.households USING btree (id);

CREATE INDEX idx_budget_allocations_category ON public.budget_allocations USING btree (category_id);

CREATE INDEX idx_budget_allocations_household ON public.budget_allocations USING btree (household_id);

CREATE INDEX idx_budget_allocations_household_month ON public.budget_allocations USING btree (household_id, budget_month DESC);

CREATE INDEX idx_categories_household ON public.categories USING btree (household_id);

CREATE INDEX idx_categories_household_active ON public.categories USING btree (household_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_exchange_rates_currency_date ON public.exchange_rates USING btree (currency, rate_date DESC);

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category_id);

CREATE INDEX idx_expenses_date ON public.expenses USING btree (expense_date DESC);

CREATE INDEX idx_expenses_household ON public.expenses USING btree (household_id);

CREATE INDEX idx_expenses_household_date ON public.expenses USING btree (household_id, expense_date DESC);

CREATE INDEX idx_expenses_logged_by ON public.expenses USING btree (logged_by_user_id);

CREATE INDEX idx_users_household ON public.users USING btree (household_id);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table "public"."budget_allocations" add constraint "budget_allocations_pkey" PRIMARY KEY using index "budget_allocations_pkey";

alter table "public"."categories" add constraint "categories_pkey" PRIMARY KEY using index "categories_pkey";

alter table "public"."exchange_rates" add constraint "exchange_rates_pkey" PRIMARY KEY using index "exchange_rates_pkey";

alter table "public"."expenses" add constraint "expenses_pkey" PRIMARY KEY using index "expenses_pkey";

alter table "public"."households" add constraint "households_pkey" PRIMARY KEY using index "households_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."budget_allocations" add constraint "budget_allocations_allocated_amount_check" CHECK ((allocated_amount <> (0)::numeric)) not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_allocated_amount_check";

alter table "public"."budget_allocations" add constraint "budget_allocations_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_category_id_fkey";

alter table "public"."budget_allocations" add constraint "budget_allocations_currency_check" CHECK ((length(currency) = 3)) not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_currency_check";

alter table "public"."budget_allocations" add constraint "budget_allocations_household_id_category_id_budget_month_key" UNIQUE using index "budget_allocations_household_id_category_id_budget_month_key";

alter table "public"."budget_allocations" add constraint "budget_allocations_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_household_id_fkey";

alter table "public"."categories" add constraint "categories_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."categories" validate constraint "categories_household_id_fkey";

alter table "public"."exchange_rates" add constraint "exchange_rates_currency_check" CHECK ((length(currency) = 3)) not valid;

alter table "public"."exchange_rates" validate constraint "exchange_rates_currency_check";

alter table "public"."exchange_rates" add constraint "exchange_rates_rate_to_eur_check" CHECK ((rate_to_eur > (0)::numeric)) not valid;

alter table "public"."exchange_rates" validate constraint "exchange_rates_rate_to_eur_check";

alter table "public"."expenses" add constraint "expenses_amount_check" CHECK ((amount <> (0)::numeric)) not valid;

alter table "public"."expenses" validate constraint "expenses_amount_check";

alter table "public"."expenses" add constraint "expenses_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT not valid;

alter table "public"."expenses" validate constraint "expenses_category_id_fkey";

alter table "public"."expenses" add constraint "expenses_converted_amount_check" CHECK ((converted_amount <> (0)::numeric)) not valid;

alter table "public"."expenses" validate constraint "expenses_converted_amount_check";

alter table "public"."expenses" add constraint "expenses_converted_currency_check" CHECK ((length(converted_currency) = 3)) not valid;

alter table "public"."expenses" validate constraint "expenses_converted_currency_check";

alter table "public"."expenses" add constraint "expenses_currency_check" CHECK ((length(currency) = 3)) not valid;

alter table "public"."expenses" validate constraint "expenses_currency_check";

alter table "public"."expenses" add constraint "expenses_exchange_rate_check" CHECK ((exchange_rate > (0)::numeric)) not valid;

alter table "public"."expenses" validate constraint "expenses_exchange_rate_check";

alter table "public"."expenses" add constraint "expenses_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."expenses" validate constraint "expenses_household_id_fkey";

alter table "public"."expenses" add constraint "expenses_logged_by_user_id_fkey" FOREIGN KEY (logged_by_user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."expenses" validate constraint "expenses_logged_by_user_id_fkey";

alter table "public"."users" add constraint "users_email_key" UNIQUE using index "users_email_key";

alter table "public"."users" add constraint "users_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_household_id_fkey";

alter table "public"."users" add constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."users" validate constraint "users_id_fkey";

set check_function_bodies = off;

create or replace view "public"."budget_summary" as  WITH category_months AS (
         SELECT budget_allocations.household_id,
            budget_allocations.category_id,
            budget_allocations.budget_month
           FROM public.budget_allocations
        UNION
         SELECT expenses.household_id,
            expenses.category_id,
            (date_trunc('month'::text, (expenses.expense_date)::timestamp with time zone))::date AS budget_month
           FROM public.expenses
          WHERE (expenses.category_id IS NOT NULL)
        )
 SELECT ba.id,
    cm.household_id,
    cm.budget_month,
    cm.category_id,
    c.name AS category_name,
    c.icon AS category_icon,
    c.color AS category_color,
    c.exclude_from_budget_total,
    COALESCE(ba.allocated_amount, (0)::numeric) AS allocated_amount,
    COALESCE(ba.currency, 'EUR'::text) AS currency,
    COALESCE(sum(e.converted_amount), (0)::numeric) AS spent_amount,
    (COALESCE(ba.allocated_amount, (0)::numeric) - COALESCE(sum(e.converted_amount), (0)::numeric)) AS remaining_amount,
        CASE
            WHEN (COALESCE(ba.allocated_amount, (0)::numeric) > (0)::numeric) THEN ((COALESCE(sum(e.converted_amount), (0)::numeric) / ba.allocated_amount) * (100)::numeric)
            ELSE (0)::numeric
        END AS percent_spent
   FROM (((category_months cm
     JOIN public.categories c ON ((c.id = cm.category_id)))
     LEFT JOIN public.budget_allocations ba ON (((ba.household_id = cm.household_id) AND (ba.category_id = cm.category_id) AND (ba.budget_month = cm.budget_month))))
     LEFT JOIN public.expenses e ON (((e.category_id = cm.category_id) AND (e.household_id = cm.household_id) AND (date_trunc('month'::text, (e.expense_date)::timestamp with time zone) = cm.budget_month))))
  GROUP BY ba.id, cm.household_id, cm.budget_month, cm.category_id, c.name, c.icon, c.color, c.exclude_from_budget_total, ba.allocated_amount, ba.currency;


CREATE OR REPLACE FUNCTION public.get_my_household_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT household_id FROM users WHERE id = auth.uid() LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.rebalance_budget(p_household_id uuid, p_budget_month date, p_source_category_id uuid, p_dest_category_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source_allocated DECIMAL(12, 2);
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive';
  END IF;

  IF p_source_category_id = p_dest_category_id THEN
    RAISE EXCEPTION 'Source and destination must be different';
  END IF;

  -- Get current source allocation and lock the row
  SELECT allocated_amount INTO v_source_allocated
  FROM budget_allocations
  WHERE household_id = p_household_id
    AND category_id = p_source_category_id
    AND budget_month = p_budget_month
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source budget allocation not found';
  END IF;

  -- Guard against negative resulting allocation
  IF v_source_allocated - p_amount < 0 THEN
    RAISE EXCEPTION 'Transfer would result in negative source allocation';
  END IF;

  -- Update or delete source depending on remaining amount
  IF v_source_allocated - p_amount = 0 THEN
    DELETE FROM budget_allocations
    WHERE household_id = p_household_id
      AND category_id = p_source_category_id
      AND budget_month = p_budget_month;
  ELSE
    UPDATE budget_allocations
    SET allocated_amount = allocated_amount - p_amount
    WHERE household_id = p_household_id
      AND category_id = p_source_category_id
      AND budget_month = p_budget_month;
  END IF;

  -- Upsert destination (add)
  INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
  VALUES (p_household_id, p_dest_category_id, p_budget_month, p_amount, 'EUR')
  ON CONFLICT (household_id, category_id, budget_month)
  DO UPDATE SET allocated_amount = budget_allocations.allocated_amount + p_amount;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_budget(p_household_id uuid, p_budget_month date, p_allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc JSONB;
  v_category_id UUID;
  v_amount DECIMAL(12, 2);
  v_upserted_category_ids UUID[] := '{}';
BEGIN
  -- Validate input
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocations array must not be empty';
  END IF;

  -- Lock existing rows for this household/month to prevent concurrent edits
  PERFORM 1 FROM budget_allocations
  WHERE household_id = p_household_id AND budget_month = p_budget_month
  FOR UPDATE;

  -- Validate no negative amounts
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) AS elem
    WHERE (elem->>'amount')::DECIMAL < 0
  ) THEN
    RAISE EXCEPTION 'Allocation amounts must not be negative';
  END IF;

  -- Process each allocation
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_category_id := (v_alloc->>'category_id')::UUID;
    v_amount := (v_alloc->>'amount')::DECIMAL(12, 2);

    IF v_amount > 0 THEN
      INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
      VALUES (p_household_id, v_category_id, p_budget_month, v_amount, 'EUR')
      ON CONFLICT (household_id, category_id, budget_month)
      DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount;

      v_upserted_category_ids := v_upserted_category_ids || v_category_id;
    END IF;
  END LOOP;

  -- Delete allocations for categories that were zeroed out (sent with amount=0 or not in upserted list)
  DELETE FROM budget_allocations
  WHERE household_id = p_household_id
    AND budget_month = p_budget_month
    AND category_id = ANY(
      SELECT (elem->>'category_id')::UUID
      FROM jsonb_array_elements(p_allocations) AS elem
      WHERE (elem->>'amount')::DECIMAL <= 0
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.top_categories_by_usage(p_household_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(category_id uuid, expense_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT e.category_id, COUNT(*) AS expense_count
  FROM expenses e
  JOIN categories c ON c.id = e.category_id AND c.is_active = TRUE
  WHERE e.household_id = p_household_id
    AND e.category_id IS NOT NULL
    AND e.expense_date >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY e.category_id
  ORDER BY expense_count DESC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."budget_allocations" to "anon";

grant insert on table "public"."budget_allocations" to "anon";

grant references on table "public"."budget_allocations" to "anon";

grant select on table "public"."budget_allocations" to "anon";

grant trigger on table "public"."budget_allocations" to "anon";

grant truncate on table "public"."budget_allocations" to "anon";

grant update on table "public"."budget_allocations" to "anon";

grant delete on table "public"."budget_allocations" to "authenticated";

grant insert on table "public"."budget_allocations" to "authenticated";

grant references on table "public"."budget_allocations" to "authenticated";

grant select on table "public"."budget_allocations" to "authenticated";

grant trigger on table "public"."budget_allocations" to "authenticated";

grant truncate on table "public"."budget_allocations" to "authenticated";

grant update on table "public"."budget_allocations" to "authenticated";

grant delete on table "public"."budget_allocations" to "service_role";

grant insert on table "public"."budget_allocations" to "service_role";

grant references on table "public"."budget_allocations" to "service_role";

grant select on table "public"."budget_allocations" to "service_role";

grant trigger on table "public"."budget_allocations" to "service_role";

grant truncate on table "public"."budget_allocations" to "service_role";

grant update on table "public"."budget_allocations" to "service_role";

grant delete on table "public"."categories" to "anon";

grant insert on table "public"."categories" to "anon";

grant references on table "public"."categories" to "anon";

grant select on table "public"."categories" to "anon";

grant trigger on table "public"."categories" to "anon";

grant truncate on table "public"."categories" to "anon";

grant update on table "public"."categories" to "anon";

grant delete on table "public"."categories" to "authenticated";

grant insert on table "public"."categories" to "authenticated";

grant references on table "public"."categories" to "authenticated";

grant select on table "public"."categories" to "authenticated";

grant trigger on table "public"."categories" to "authenticated";

grant truncate on table "public"."categories" to "authenticated";

grant update on table "public"."categories" to "authenticated";

grant delete on table "public"."categories" to "service_role";

grant insert on table "public"."categories" to "service_role";

grant references on table "public"."categories" to "service_role";

grant select on table "public"."categories" to "service_role";

grant trigger on table "public"."categories" to "service_role";

grant truncate on table "public"."categories" to "service_role";

grant update on table "public"."categories" to "service_role";

grant delete on table "public"."exchange_rates" to "anon";

grant insert on table "public"."exchange_rates" to "anon";

grant references on table "public"."exchange_rates" to "anon";

grant select on table "public"."exchange_rates" to "anon";

grant trigger on table "public"."exchange_rates" to "anon";

grant truncate on table "public"."exchange_rates" to "anon";

grant update on table "public"."exchange_rates" to "anon";

grant delete on table "public"."exchange_rates" to "authenticated";

grant insert on table "public"."exchange_rates" to "authenticated";

grant references on table "public"."exchange_rates" to "authenticated";

grant select on table "public"."exchange_rates" to "authenticated";

grant trigger on table "public"."exchange_rates" to "authenticated";

grant truncate on table "public"."exchange_rates" to "authenticated";

grant update on table "public"."exchange_rates" to "authenticated";

grant delete on table "public"."exchange_rates" to "service_role";

grant insert on table "public"."exchange_rates" to "service_role";

grant references on table "public"."exchange_rates" to "service_role";

grant select on table "public"."exchange_rates" to "service_role";

grant trigger on table "public"."exchange_rates" to "service_role";

grant truncate on table "public"."exchange_rates" to "service_role";

grant update on table "public"."exchange_rates" to "service_role";

grant delete on table "public"."expenses" to "anon";

grant insert on table "public"."expenses" to "anon";

grant references on table "public"."expenses" to "anon";

grant select on table "public"."expenses" to "anon";

grant trigger on table "public"."expenses" to "anon";

grant truncate on table "public"."expenses" to "anon";

grant update on table "public"."expenses" to "anon";

grant delete on table "public"."expenses" to "authenticated";

grant insert on table "public"."expenses" to "authenticated";

grant references on table "public"."expenses" to "authenticated";

grant select on table "public"."expenses" to "authenticated";

grant trigger on table "public"."expenses" to "authenticated";

grant truncate on table "public"."expenses" to "authenticated";

grant update on table "public"."expenses" to "authenticated";

grant delete on table "public"."expenses" to "service_role";

grant insert on table "public"."expenses" to "service_role";

grant references on table "public"."expenses" to "service_role";

grant select on table "public"."expenses" to "service_role";

grant trigger on table "public"."expenses" to "service_role";

grant truncate on table "public"."expenses" to "service_role";

grant update on table "public"."expenses" to "service_role";

grant delete on table "public"."households" to "anon";

grant insert on table "public"."households" to "anon";

grant references on table "public"."households" to "anon";

grant select on table "public"."households" to "anon";

grant trigger on table "public"."households" to "anon";

grant truncate on table "public"."households" to "anon";

grant update on table "public"."households" to "anon";

grant delete on table "public"."households" to "authenticated";

grant insert on table "public"."households" to "authenticated";

grant references on table "public"."households" to "authenticated";

grant select on table "public"."households" to "authenticated";

grant trigger on table "public"."households" to "authenticated";

grant truncate on table "public"."households" to "authenticated";

grant update on table "public"."households" to "authenticated";

grant delete on table "public"."households" to "service_role";

grant insert on table "public"."households" to "service_role";

grant references on table "public"."households" to "service_role";

grant select on table "public"."households" to "service_role";

grant trigger on table "public"."households" to "service_role";

grant truncate on table "public"."households" to "service_role";

grant update on table "public"."households" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "Household members can delete budget allocations"
  on "public"."budget_allocations"
  as permissive
  for delete
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can insert budget allocations"
  on "public"."budget_allocations"
  as permissive
  for insert
  to public
with check ((household_id = public.get_my_household_id()));



  create policy "Household members can update budget allocations"
  on "public"."budget_allocations"
  as permissive
  for update
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can view budget allocations"
  on "public"."budget_allocations"
  as permissive
  for select
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can delete categories"
  on "public"."categories"
  as permissive
  for delete
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can insert categories"
  on "public"."categories"
  as permissive
  for insert
  to public
with check ((household_id = public.get_my_household_id()));



  create policy "Household members can update categories"
  on "public"."categories"
  as permissive
  for update
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can view categories"
  on "public"."categories"
  as permissive
  for select
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Authenticated users can insert exchange rates"
  on "public"."exchange_rates"
  as permissive
  for insert
  to public
with check ((auth.uid() IS NOT NULL));



  create policy "Authenticated users can view exchange rates"
  on "public"."exchange_rates"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "No one can delete exchange rates"
  on "public"."exchange_rates"
  as permissive
  for delete
  to public
using (false);



  create policy "No one can update exchange rates"
  on "public"."exchange_rates"
  as permissive
  for update
  to public
using (false);



  create policy "Household members can delete expenses"
  on "public"."expenses"
  as permissive
  for delete
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can insert expenses"
  on "public"."expenses"
  as permissive
  for insert
  to public
with check (((household_id = public.get_my_household_id()) AND (logged_by_user_id = ( SELECT auth.uid() AS uid))));



  create policy "Household members can update expenses"
  on "public"."expenses"
  as permissive
  for update
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can view expenses"
  on "public"."expenses"
  as permissive
  for select
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Users can view own household"
  on "public"."households"
  as permissive
  for select
  to public
using ((id = public.get_my_household_id()));



  create policy "Users can delete own profile"
  on "public"."users"
  as permissive
  for delete
  to public
using ((id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update own profile"
  on "public"."users"
  as permissive
  for update
  to public
using ((id = ( SELECT auth.uid() AS uid)));



  create policy "Users can view household members"
  on "public"."users"
  as permissive
  for select
  to public
using (((id = ( SELECT auth.uid() AS uid)) OR (household_id = public.get_my_household_id())));


CREATE TRIGGER update_budget_allocations_updated_at BEFORE UPDATE ON public.budget_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exchange_rates_updated_at BEFORE UPDATE ON public.exchange_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON public.households FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


