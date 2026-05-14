CREATE INDEX idx_budget_allocations_category ON public.budget_allocations USING btree (category_id);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_expenses_and_categories(p_mode text, p_limit integer DEFAULT 30, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;


