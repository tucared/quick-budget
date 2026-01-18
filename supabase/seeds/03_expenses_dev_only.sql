-- ============================================================================
-- DEVELOPMENT ONLY: Sample Expenses for Testing
-- ============================================================================
-- This file contains sample expense data for local development and testing.
-- DO NOT run this in production - expenses will be logged via the app.
--
-- This runs automatically in local dev via `supabase db reset`.
-- ============================================================================

DO $$
DECLARE
  user1_id UUID := '00000000-0000-0000-0000-000000000001';
  user2_id UUID := '00000000-0000-0000-0000-000000000002';
  user1_account_id UUID;
  user2_account_id UUID;
  groceries_cat_id UUID;
  dining_cat_id UUID;
  transport_cat_id UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO groceries_cat_id FROM public.categories WHERE name = 'Groceries' LIMIT 1;
  SELECT id INTO dining_cat_id FROM public.categories WHERE name = 'Dining Out' LIMIT 1;
  SELECT id INTO transport_cat_id FROM public.categories WHERE name = 'Transportation' LIMIT 1;

  -- Get User 1's default account
  SELECT id INTO user1_account_id FROM public.accounts WHERE owner_user_id = user1_id AND is_default = true LIMIT 1;

  -- Get User 2's default account
  SELECT id INTO user2_account_id FROM public.accounts WHERE owner_user_id = user2_id AND is_default = true LIMIT 1;

  -- Insert sample expenses for User 1
  IF user1_account_id IS NOT NULL AND groceries_cat_id IS NOT NULL THEN
    INSERT INTO public.expenses (
      logged_by_user_id, category_id, account_id,
      amount, currency,
      converted_amount, converted_currency, exchange_rate,
      expense_date, description
    ) VALUES
      (user1_id, groceries_cat_id, user1_account_id, 85.50, 'USD', 85.50, 'USD', 1.0, CURRENT_DATE - 2, 'Weekly groceries'),
      (user1_id, dining_cat_id, user1_account_id, 45.00, 'USD', 45.00, 'USD', 1.0, CURRENT_DATE - 1, 'Dinner at Italian restaurant'),
      (user1_id, transport_cat_id, user1_account_id, 35.00, 'USD', 35.00, 'USD', 1.0, CURRENT_DATE, 'Gas station fill-up')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insert sample expenses for User 2
  IF user2_account_id IS NOT NULL AND groceries_cat_id IS NOT NULL THEN
    INSERT INTO public.expenses (
      logged_by_user_id, category_id, account_id,
      amount, currency,
      converted_amount, converted_currency, exchange_rate,
      expense_date, description
    ) VALUES
      (user2_id, groceries_cat_id, user2_account_id, 52.30, 'USD', 52.30, 'USD', 1.0, CURRENT_DATE - 3, 'Grocery shopping'),
      (user2_id, dining_cat_id, user2_account_id, 28.75, 'USD', 28.75, 'USD', 1.0, CURRENT_DATE - 1, 'Lunch at cafe')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- Display seed summary for local development
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Development seed data loaded!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Accounts:';
  RAISE NOTICE '  User 1: user1@test.com / password123';
  RAISE NOTICE '  User 2: user2@test.com / password123';
  RAISE NOTICE '========================================';
END $$;
