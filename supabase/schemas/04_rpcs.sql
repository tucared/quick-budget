-- RPC functions + grants

-- ============================================================================
-- REBALANCE BUDGET
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rebalance_budget(
  p_household_id UUID,
  p_budget_month DATE,
  p_source_category_id UUID,
  p_dest_category_id UUID,
  p_amount DECIMAL(12, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.rebalance_budget(UUID, DATE, UUID, UUID, DECIMAL) TO authenticated;

-- ============================================================================
-- SAVE BUDGET
-- ============================================================================
CREATE OR REPLACE FUNCTION public.save_budget(
  p_household_id UUID,
  p_budget_month DATE,
  p_allocations JSONB  -- array of {"category_id": uuid, "amount": decimal}
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.save_budget(UUID, DATE, JSONB) TO authenticated;

-- ============================================================================
-- TOP UP BUDGET
-- ============================================================================
CREATE OR REPLACE FUNCTION public.top_up_budget(
  p_household_id UUID,
  p_budget_month DATE,
  p_category_id UUID,
  p_amount DECIMAL(12, 2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.top_up_budget(UUID, DATE, UUID, DECIMAL) TO authenticated;
