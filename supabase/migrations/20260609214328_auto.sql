alter table "public"."budget_allocations" drop constraint "budget_allocations_currency_check";

alter table "public"."exchange_rates" drop constraint "exchange_rates_currency_check";

alter table "public"."expenses" drop constraint "expenses_converted_currency_check";

alter table "public"."expenses" drop constraint "expenses_currency_check";

alter table "public"."expenses" drop constraint "expenses_logged_by_user_id_fkey";

alter table "public"."monthly_budget_targets" drop constraint "monthly_budget_targets_currency_check";


drop index if exists "public"."idx_categories_household_active";

drop index if exists "public"."idx_exchange_rates_currency_date";

drop index if exists "public"."idx_expenses_date";

drop index if exists "public"."idx_tricount_entry_map_link";

drop index if exists "public"."idx_tricount_links_household";

alter table "public"."expenses" alter column "category_id" set not null;

alter table "public"."expenses" alter column "logged_by_user_id" drop not null;

alter table "public"."tricount_entry_map" alter column "entry_date" drop default;

alter table "public"."budget_allocations" add constraint "budget_allocations_budget_month_check" CHECK ((budget_month = (date_trunc('month'::text, (budget_month)::timestamp with time zone))::date)) not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_budget_month_check";

alter table "public"."exchange_rates" add constraint "exchange_rates_date_not_future" CHECK ((rate_date <= (CURRENT_DATE + 1))) not valid;

alter table "public"."exchange_rates" validate constraint "exchange_rates_date_not_future";

alter table "public"."expenses" add constraint "expenses_amount_signs_match" CHECK ((sign(amount) = sign(converted_amount))) not valid;

alter table "public"."expenses" validate constraint "expenses_amount_signs_match";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_budget_month_check" CHECK ((budget_month = (date_trunc('month'::text, (budget_month)::timestamp with time zone))::date)) not valid;

alter table "public"."monthly_budget_targets" validate constraint "monthly_budget_targets_budget_month_check";

alter table "public"."budget_allocations" add constraint "budget_allocations_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."budget_allocations" validate constraint "budget_allocations_currency_check";

alter table "public"."exchange_rates" add constraint "exchange_rates_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."exchange_rates" validate constraint "exchange_rates_currency_check";

alter table "public"."expenses" add constraint "expenses_converted_currency_check" CHECK ((converted_currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."expenses" validate constraint "expenses_converted_currency_check";

alter table "public"."expenses" add constraint "expenses_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."expenses" validate constraint "expenses_currency_check";

alter table "public"."expenses" add constraint "expenses_logged_by_user_id_fkey" FOREIGN KEY (logged_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL not valid;

alter table "public"."expenses" validate constraint "expenses_logged_by_user_id_fkey";

alter table "public"."monthly_budget_targets" add constraint "monthly_budget_targets_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."monthly_budget_targets" validate constraint "monthly_budget_targets_currency_check";

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

  -- The destination category must belong to the household (the FK alone
  -- would accept another household's category id).
  IF NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = p_category_id AND c.household_id = p_household_id
  ) THEN
    RAISE EXCEPTION 'Category does not belong to household';
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

  -- Both categories must belong to the household. The FK alone would accept
  -- another household's category id (SECURITY INVOKER + RLS on categories
  -- makes foreign rows invisible, so this also rejects forged household ids).
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_source_category_id, p_dest_category_id]) AS cid
    WHERE NOT EXISTS (
      SELECT 1 FROM categories c WHERE c.id = cid AND c.household_id = p_household_id
    )
  ) THEN
    RAISE EXCEPTION 'Category does not belong to household';
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

  -- Every category being allocated to must belong to the household (the FK
  -- alone would accept another household's category id). Zeroed-out entries
  -- are exempt — they only drive the household-scoped DELETE below.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) AS elem
    WHERE (elem->>'amount')::DECIMAL > 0
      AND NOT EXISTS (
        SELECT 1 FROM categories c
        WHERE c.id = (elem->>'category_id')::UUID
          AND c.household_id = p_household_id
      )
  ) THEN
    RAISE EXCEPTION 'Category does not belong to household';
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

CREATE OR REPLACE FUNCTION public.top_up_budget(p_household_id uuid, p_budget_month date, p_category_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Top-up amount must be positive';
  END IF;

  -- The category must belong to the household (the FK alone would accept
  -- another household's category id).
  IF NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = p_category_id AND c.household_id = p_household_id
  ) THEN
    RAISE EXCEPTION 'Category does not belong to household';
  END IF;

  -- Upsert: create or increase allocation
  INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
  VALUES (p_household_id, p_category_id, p_budget_month, p_amount, 'EUR')
  ON CONFLICT (household_id, category_id, budget_month)
  DO UPDATE SET allocated_amount = budget_allocations.allocated_amount + p_amount;
END;
$function$
;


