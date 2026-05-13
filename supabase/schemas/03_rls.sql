-- Row Level Security: enable + policies for all tables.
--
-- Each public table gets an explicit `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` below. This is the only mechanism enforcing RLS — there is no
-- event-trigger safety net. Per Supabase's docs
-- (https://supabase.com/docs/guides/database/postgres/row-level-security),
-- explicit enablement is the recommended approach. The CI gate in
-- `.github/workflows/migrate.yml` runs after every prod push and fails if
-- any `public` table has `relrowsecurity = false`, so a new table missing
-- its RLS line cannot ship.

-- ============================================================================
-- USERS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household members" ON users
  FOR SELECT USING (
    id = (SELECT auth.uid()) OR household_id = public.get_my_household_id()
  );

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own profile" ON users
  FOR DELETE USING (id = (SELECT auth.uid()));

-- ============================================================================
-- HOUSEHOLDS
-- ============================================================================
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own household" ON households
  FOR SELECT USING (
    id = public.get_my_household_id()
  );

-- ============================================================================
-- CATEGORIES
-- ============================================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view categories" ON categories
  FOR SELECT USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can insert categories" ON categories
  FOR INSERT WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Household members can update categories" ON categories
  FOR UPDATE USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can delete categories" ON categories
  FOR DELETE USING (household_id = public.get_my_household_id());

-- ============================================================================
-- EXPENSES
-- ============================================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view expenses" ON expenses
  FOR SELECT USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can insert expenses" ON expenses
  FOR INSERT WITH CHECK (
    household_id = public.get_my_household_id()
    AND logged_by_user_id = (SELECT auth.uid())
  );

CREATE POLICY "Household members can update expenses" ON expenses
  FOR UPDATE USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can delete expenses" ON expenses
  FOR DELETE USING (household_id = public.get_my_household_id());

-- ============================================================================
-- EXCHANGE_RATES
-- ============================================================================
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view exchange rates" ON exchange_rates
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated users can insert exchange rates" ON exchange_rates
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "No one can update exchange rates" ON exchange_rates
  FOR UPDATE USING (FALSE);

CREATE POLICY "No one can delete exchange rates" ON exchange_rates
  FOR DELETE USING (FALSE);

-- ============================================================================
-- BUDGET_ALLOCATIONS
-- ============================================================================
ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view budget allocations" ON budget_allocations
  FOR SELECT USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can insert budget allocations" ON budget_allocations
  FOR INSERT WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Household members can update budget allocations" ON budget_allocations
  FOR UPDATE USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can delete budget allocations" ON budget_allocations
  FOR DELETE USING (household_id = public.get_my_household_id());

-- ============================================================================
-- MONTHLY_BUDGET_TARGETS
-- ============================================================================
ALTER TABLE monthly_budget_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view monthly budget targets" ON monthly_budget_targets
  FOR SELECT USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can insert monthly budget targets" ON monthly_budget_targets
  FOR INSERT WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Household members can update monthly budget targets" ON monthly_budget_targets
  FOR UPDATE USING (household_id = public.get_my_household_id());

CREATE POLICY "Household members can delete monthly budget targets" ON monthly_budget_targets
  FOR DELETE USING (household_id = public.get_my_household_id());
