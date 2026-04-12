drop function if exists "public"."save_budget"(p_household_id uuid, p_budget_month date, p_allocations jsonb);


  create table "public"."monthly_budget_targets" (
    "id" uuid not null default gen_random_uuid(),
    "household_id" uuid not null,
    "budget_month" date not null,
    "target_amount" numeric(12,2) not null,
    "currency" text not null default 'EUR'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."monthly_budget_targets" enable row level security;

CREATE INDEX idx_monthly_budget_targets_household_month ON public.monthly_budget_targets USING btree (household_id, budget_month DESC);

CREATE UNIQUE INDEX monthly_budget_targets_household_id_budget_month_key ON public.monthly_budget_targets USING btree (household_id, budget_month);

CREATE UNIQUE INDEX monthly_budget_targets_pkey ON public.monthly_budget_targets USING btree (id);

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_pkey" PRIMARY KEY using index "monthly_budget_targets_pkey";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_currency_check" CHECK ((length(currency) = 3)) not valid;

alter table "public"."monthly_budget_targets" validate constraint "monthly_budget_targets_currency_check";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_household_id_budget_month_key" UNIQUE using index "monthly_budget_targets_household_id_budget_month_key";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE not valid;

alter table "public"."monthly_budget_targets" validate constraint "monthly_budget_targets_household_id_fkey";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_target_amount_check" CHECK ((target_amount > (0)::numeric)) not valid;

alter table "public"."monthly_budget_targets" validate constraint "monthly_budget_targets_target_amount_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.allocate_from_unallocated(p_household_id uuid, p_budget_month date, p_category_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target DECIMAL(12, 2);
  v_sum_regular DECIMAL(12, 2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Lock the target row to serialise concurrent allocations.
  SELECT target_amount INTO v_target
  FROM monthly_budget_targets
  WHERE household_id = p_household_id
    AND budget_month = p_budget_month
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No monthly target set for this household/month';
  END IF;

  -- Sum current regular allocations (exclude allowances).
  SELECT COALESCE(SUM(ba.allocated_amount), 0)
  INTO v_sum_regular
  FROM budget_allocations ba
  JOIN categories c ON c.id = ba.category_id
  WHERE ba.household_id = p_household_id
    AND ba.budget_month = p_budget_month
    AND c.exclude_from_budget_total = FALSE;

  IF v_sum_regular + p_amount > v_target THEN
    RAISE EXCEPTION 'Amount exceeds unallocated pool (available: %)', v_target - v_sum_regular;
  END IF;

  -- Upsert: create or increase allocation for the destination category.
  INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
  VALUES (p_household_id, p_category_id, p_budget_month, p_amount, 'EUR')
  ON CONFLICT (household_id, category_id, budget_month)
  DO UPDATE SET allocated_amount = budget_allocations.allocated_amount + p_amount;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_budget(p_household_id uuid, p_budget_month date, p_allocations jsonb, p_target_amount numeric DEFAULT NULL::numeric, p_clear_target boolean DEFAULT false)
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
  -- Validate input: allocations array must exist (may be empty when only
  -- touching the target).
  IF p_allocations IS NULL THEN
    RAISE EXCEPTION 'Allocations array must not be null';
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

  -- Monthly target: clear, upsert, or leave untouched.
  IF p_clear_target THEN
    DELETE FROM monthly_budget_targets
    WHERE household_id = p_household_id
      AND budget_month = p_budget_month;
  ELSIF p_target_amount IS NOT NULL THEN
    IF p_target_amount <= 0 THEN
      RAISE EXCEPTION 'Target amount must be positive';
    END IF;

    INSERT INTO monthly_budget_targets (household_id, budget_month, target_amount, currency)
    VALUES (p_household_id, p_budget_month, p_target_amount, 'EUR')
    ON CONFLICT (household_id, budget_month)
    DO UPDATE SET target_amount = EXCLUDED.target_amount, updated_at = NOW();
  END IF;
END;
$function$
;

grant delete on table "public"."monthly_budget_targets" to "anon";

grant insert on table "public"."monthly_budget_targets" to "anon";

grant references on table "public"."monthly_budget_targets" to "anon";

grant select on table "public"."monthly_budget_targets" to "anon";

grant trigger on table "public"."monthly_budget_targets" to "anon";

grant truncate on table "public"."monthly_budget_targets" to "anon";

grant update on table "public"."monthly_budget_targets" to "anon";

grant delete on table "public"."monthly_budget_targets" to "authenticated";

grant insert on table "public"."monthly_budget_targets" to "authenticated";

grant references on table "public"."monthly_budget_targets" to "authenticated";

grant select on table "public"."monthly_budget_targets" to "authenticated";

grant trigger on table "public"."monthly_budget_targets" to "authenticated";

grant truncate on table "public"."monthly_budget_targets" to "authenticated";

grant update on table "public"."monthly_budget_targets" to "authenticated";

grant delete on table "public"."monthly_budget_targets" to "service_role";

grant insert on table "public"."monthly_budget_targets" to "service_role";

grant references on table "public"."monthly_budget_targets" to "service_role";

grant select on table "public"."monthly_budget_targets" to "service_role";

grant trigger on table "public"."monthly_budget_targets" to "service_role";

grant truncate on table "public"."monthly_budget_targets" to "service_role";

grant update on table "public"."monthly_budget_targets" to "service_role";


  create policy "Household members can delete monthly budget targets"
  on "public"."monthly_budget_targets"
  as permissive
  for delete
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can insert monthly budget targets"
  on "public"."monthly_budget_targets"
  as permissive
  for insert
  to public
with check ((household_id = public.get_my_household_id()));



  create policy "Household members can update monthly budget targets"
  on "public"."monthly_budget_targets"
  as permissive
  for update
  to public
using ((household_id = public.get_my_household_id()));



  create policy "Household members can view monthly budget targets"
  on "public"."monthly_budget_targets"
  as permissive
  for select
  to public
using ((household_id = public.get_my_household_id()));


CREATE TRIGGER update_monthly_budget_targets_updated_at BEFORE UPDATE ON public.monthly_budget_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT EXECUTE ON FUNCTION public.save_budget(uuid, date, jsonb, numeric, boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.allocate_from_unallocated(uuid, date, uuid, numeric) TO authenticated;


