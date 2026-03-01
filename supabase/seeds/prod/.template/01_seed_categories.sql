-- ============================================================================
-- 01_seed_categories.sql - Category Seeding
-- ============================================================================
-- Creates categories for the shared household.
-- Requires household 'Home' to exist (created by dev/00_create_users.sql
-- or prod-setup.sql).
-- ============================================================================

DO $$
DECLARE
  shared_household_id UUID;
BEGIN
  RAISE NOTICE 'Creating categories...';

  -- Look up the shared household
  SELECT id INTO shared_household_id FROM public.households WHERE name = 'Home';

  IF shared_household_id IS NULL THEN
    RAISE EXCEPTION 'Household "Home" not found. Run dev/00_create_users.sql first.';
  END IF;

  -- Idempotency: skip if categories already exist for this household
  IF EXISTS (SELECT 1 FROM public.categories WHERE household_id = shared_household_id) THEN
    RAISE NOTICE '  → Categories already exist, skipping';
    RETURN;
  END IF;

  -- Spending categories (customize as needed)
  INSERT INTO public.categories (household_id, name, icon, is_active) VALUES
    (shared_household_id, 'Groceries', '🛒', TRUE),
    (shared_household_id, 'Dining Out', '🍽️', TRUE),
    (shared_household_id, 'Transportation', '🚌', TRUE),
    (shared_household_id, 'Entertainment', '🎭', TRUE),
    (shared_household_id, 'Shopping', '🛍️', TRUE),
    (shared_household_id, 'Bills', '📋', TRUE);

  -- Allowance categories (excluded from budget total, customize as needed)
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, color, is_active) VALUES
    (shared_household_id, 'User One Allowance', '👤', TRUE, '#6366f1', TRUE),
    (shared_household_id, 'User Two Allowance', '👤', TRUE, '#f97316', TRUE);

  -- Legacy bookkeeping category (inactive: not shown in UI, only exists for historical import)
  INSERT INTO public.categories (household_id, name, icon, is_active) VALUES
    (shared_household_id, 'Helper', '⚖️', FALSE);

  RAISE NOTICE '  ✓ Created categories';
END $$;
