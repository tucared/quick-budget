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

REVOKE EXECUTE ON FUNCTION public.rebalance_budget(UUID, DATE, UUID, UUID, DECIMAL) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rebalance_budget(UUID, DATE, UUID, UUID, DECIMAL) TO authenticated;

-- ============================================================================
-- SAVE BUDGET
-- ============================================================================
-- Drop the legacy 3-arg signature so PostgREST resolves unambiguously to the
-- new extended form below.
DROP FUNCTION IF EXISTS public.save_budget(UUID, DATE, JSONB);

CREATE OR REPLACE FUNCTION public.save_budget(
  p_household_id UUID,
  p_budget_month DATE,
  p_allocations JSONB,  -- array of {"category_id": uuid, "amount": decimal}
  p_target_amount DECIMAL(12, 2) DEFAULT NULL,
  p_clear_target BOOLEAN DEFAULT FALSE
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
$$;

REVOKE EXECUTE ON FUNCTION public.save_budget(UUID, DATE, JSONB, DECIMAL, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_budget(UUID, DATE, JSONB, DECIMAL, BOOLEAN) TO authenticated;

-- ============================================================================
-- ALLOCATE FROM UNALLOCATED
-- ============================================================================
-- Moves money from the monthly unallocated pool (target - sum of regular
-- allocations) into a single category. Re-validates the constraint
-- server-side under a row lock on the target row to prevent races.
CREATE OR REPLACE FUNCTION public.allocate_from_unallocated(
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
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_from_unallocated(UUID, DATE, UUID, DECIMAL) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_from_unallocated(UUID, DATE, UUID, DECIMAL) TO authenticated;

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

REVOKE EXECUTE ON FUNCTION public.top_up_budget(UUID, DATE, UUID, DECIMAL) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.top_up_budget(UUID, DATE, UUID, DECIMAL) TO authenticated;

-- ============================================================================
-- GET EXPENSES AND CATEGORIES
-- ============================================================================
-- Combines the two parallel page-load fetches (expenses + active categories)
-- into a single round trip. Used by /expenses (p_mode = 'recent') and /budget
-- (p_mode = 'monthly'). SECURITY INVOKER so RLS scopes both tables to the
-- caller's household via private.get_my_household_id().
CREATE OR REPLACE FUNCTION public.get_expenses_and_categories(
  p_mode TEXT,
  p_limit INT DEFAULT 30,
  p_month DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_expenses JSONB;
  v_categories JSONB;
BEGIN
  IF p_mode = 'recent' THEN
    SELECT COALESCE(
      jsonb_agg(to_jsonb(e) ORDER BY e.expense_date DESC, e.created_at DESC),
      '[]'::jsonb
    )
    INTO v_expenses
    FROM (
      SELECT *
      FROM expenses
      ORDER BY expense_date DESC, created_at DESC
      LIMIT p_limit
    ) e;
  ELSIF p_mode = 'monthly' THEN
    IF p_month IS NULL THEN
      RAISE EXCEPTION 'p_month is required when p_mode = ''monthly''';
    END IF;
    SELECT COALESCE(
      jsonb_agg(to_jsonb(e) ORDER BY e.expense_date ASC),
      '[]'::jsonb
    )
    INTO v_expenses
    FROM expenses e
    WHERE e.expense_date >= p_month
      AND e.expense_date < (p_month + INTERVAL '1 month')::date;
  ELSE
    RAISE EXCEPTION 'p_mode must be ''recent'' or ''monthly''';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
  INTO v_categories
  FROM categories c
  WHERE c.is_active = TRUE;

  RETURN jsonb_build_object(
    'expenses', v_expenses,
    'categories', v_categories
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_expenses_and_categories(TEXT, INT, DATE) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_expenses_and_categories(TEXT, INT, DATE) TO authenticated;
