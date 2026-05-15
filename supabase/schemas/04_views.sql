-- Views

-- Body only. The `security_invoker = true` option and the GRANT/REVOKE trio
-- live in supabase/migrations/20260515190000_pin_budget_summary_view_options_and_grants.sql
-- because migra does not read view options back from pg_class.reloptions
-- (supabase/cli#3973, #792) and silently drops GRANT/REVOKE diffs. Keeping
-- them out of this file is what stops `db diff` from emitting a perpetual
-- no-op view recreation on every schemas/** PR. See the schema-flow skill.
CREATE OR REPLACE VIEW budget_summary AS
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
