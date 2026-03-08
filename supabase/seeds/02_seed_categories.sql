-- ============================================================================
-- 02_seed_categories.sql - Category Seeding
-- ============================================================================
-- Creates categories for the shared household.
-- Requires household 'Home' to exist (created by 01_create_users.sql).
-- ============================================================================

DO $$
DECLARE
  shared_household_id UUID;
BEGIN
  RAISE NOTICE 'Creating categories...';

  SELECT id INTO shared_household_id FROM public.households WHERE name = 'Home';

  IF shared_household_id IS NULL THEN
    RAISE EXCEPTION 'Household "Home" not found. Run 01_create_users.sql first.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE household_id = shared_household_id) THEN
    RAISE NOTICE '  → Categories already exist, skipping';
    RETURN;
  END IF;

  -- Spending categories
  INSERT INTO public.categories (household_id, name, icon, is_active) VALUES
    (shared_household_id, 'Groceries', '🛒', TRUE),
    (shared_household_id, 'Dining Out', '🍽️', TRUE),
    (shared_household_id, 'Transportation', '🚌', TRUE),
    (shared_household_id, 'Entertainment', '🎭', TRUE),
    (shared_household_id, 'Shopping', '🛍️', TRUE),
    (shared_household_id, 'Bills', '📋', TRUE);

  -- Allowance categories (excluded from budget total)
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, color, is_active) VALUES
    (shared_household_id, 'User One Allowance', '👤', TRUE, '#6366f1', TRUE),
    (shared_household_id, 'User Two Allowance', '👤', TRUE, '#f97316', TRUE);

  RAISE NOTICE '  ✓ Created categories';
END $$;
