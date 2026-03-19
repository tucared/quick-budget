set check_function_bodies = off;

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

  -- Upsert: create or increase allocation
  INSERT INTO budget_allocations (household_id, category_id, budget_month, allocated_amount, currency)
  VALUES (p_household_id, p_category_id, p_budget_month, p_amount, 'EUR')
  ON CONFLICT (household_id, category_id, budget_month)
  DO UPDATE SET allocated_amount = budget_allocations.allocated_amount + p_amount;
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.top_up_budget(UUID, DATE, UUID, DECIMAL) TO authenticated;
