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
  INSERT INTO public.categories (household_id, name, icon, exclude_from_budget_total, is_active) VALUES
    (shared_household_id, 'User One Allowance', '🧑‍🎨', TRUE, TRUE),
    (shared_household_id, 'User Two Allowance', '🧑‍💼', TRUE, TRUE);

  -- Illustrative caps for JTBD #8. The expense form surfaces an inline toggle
  -- when a logged amount exceeds these. Caps are EUR-denominated.
  --
  -- Guarded by a constraint-absence check because `supabase db start` runs
  -- seeds AFTER existing migrations but BEFORE `supabase db diff` generates
  -- the schema-delta migration. On a clean checkout the OLD both-or-neither
  -- CHECK still exists, so setting `cap_amount` without `overflow_category_id`
  -- would fail; this branch no-ops on the first pass and applies once the
  -- auto-generated migration drops the constraint.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'categories_cap_both_or_neither'
       AND conrelid = 'public.categories'::regclass
  ) THEN
    UPDATE public.categories SET cap_amount = 10.00
     WHERE household_id = shared_household_id AND name = 'Dining Out';

    UPDATE public.categories SET cap_amount = 15.00
     WHERE household_id = shared_household_id AND name = 'Entertainment';
  END IF;

  RAISE NOTICE '  ✓ Created categories';
END $$;
