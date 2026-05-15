-- Views

-- security_invoker = true: RLS on the underlying tables is evaluated using
-- the calling user's role. Without this, the view runs as its owner
-- (postgres, superuser), which bypasses RLS and would expose every
-- household's data to any authenticated caller. Declared via the WITH option
-- on CREATE OR REPLACE VIEW so `supabase db diff` sees DB and schema in sync
-- on the option (a separate `ALTER VIEW SET` statement is parsed independently
-- by migra and emits a perpetual no-op view-recreation diff). Side-effect
-- recreations triggered by changes to referenced tables still lose the option
-- on emission (supabase/cli#3973) — the generate-migration workflow appends an
-- idempotent ALTER VIEW SET as a safety net.
CREATE OR REPLACE VIEW budget_summary WITH (security_invoker = true) AS
WITH category_months AS (
  SELECT household_id, category_id, budget_month
  FROM budget_allocations
  UNION
  SELECT household_id, category_id, DATE_TRUNC('month', expense_date)::date AS budget_month
  FROM expenses
  WHERE category_id IS NOT NULL
)
SELECT
  ba.id,
  cm.household_id,
  cm.budget_month,
  cm.category_id,
  c.name as category_name,
  c.icon as category_icon,
  c.exclude_from_budget_total,
  COALESCE(ba.allocated_amount, 0) as allocated_amount,
  COALESCE(ba.currency, 'EUR') as currency,
  COALESCE(SUM(e.converted_amount), 0) as spent_amount,
  COALESCE(ba.allocated_amount, 0) - COALESCE(SUM(e.converted_amount), 0) as remaining_amount,
  CASE
    WHEN COALESCE(ba.allocated_amount, 0) > 0
    THEN (COALESCE(SUM(e.converted_amount), 0) / ba.allocated_amount) * 100
    ELSE 0
  END as percent_spent
FROM category_months cm
JOIN categories c ON c.id = cm.category_id
LEFT JOIN budget_allocations ba ON
  ba.household_id = cm.household_id
  AND ba.category_id = cm.category_id
  AND ba.budget_month = cm.budget_month
LEFT JOIN expenses e ON
  e.category_id = cm.category_id
  AND e.household_id = cm.household_id
  AND DATE_TRUNC('month', e.expense_date::date) = cm.budget_month
GROUP BY
  ba.id,
  cm.household_id,
  cm.budget_month,
  cm.category_id,
  c.name,
  c.icon,
  c.exclude_from_budget_total,
  ba.allocated_amount,
  ba.currency;

GRANT SELECT ON public.budget_summary TO authenticated;
GRANT SELECT ON public.budget_summary TO service_role;
REVOKE SELECT ON public.budget_summary FROM anon;
