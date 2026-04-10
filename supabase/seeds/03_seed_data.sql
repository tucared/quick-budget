-- ============================================================================
-- 03_seed_data.sql - Fake Budget Allocations & Expenses
-- ============================================================================
-- ~3 months of realistic data relative to the current month.
-- month0 = current month, month1 = previous month, month2 = two months ago.
-- Both users log expenses. Some categories are slightly overspent.
-- ============================================================================

DO $$
DECLARE
  hh UUID;
  u1 UUID;
  u2 UUID;
  cat_groceries UUID;
  cat_dining UUID;
  cat_transport UUID;
  cat_entertainment UUID;
  cat_shopping UUID;
  cat_bills UUID;
  cat_allow1 UUID;
  cat_allow2 UUID;
  -- First day of each month
  month0 DATE := date_trunc('month', CURRENT_DATE)::date;
  month1 DATE := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
  month2 DATE := (date_trunc('month', CURRENT_DATE) - interval '2 months')::date;
BEGIN
  SELECT id INTO hh FROM public.households WHERE name = 'Home';
  SELECT id INTO u1 FROM public.users WHERE email = 'user1@example.com';
  SELECT id INTO u2 FROM public.users WHERE email = 'user2@example.com';

  IF EXISTS (SELECT 1 FROM public.expenses WHERE household_id = hh) THEN
    RAISE NOTICE '  → Data already seeded, skipping';
    RETURN;
  END IF;

  SELECT id INTO cat_groceries FROM public.categories WHERE name = 'Groceries' AND household_id = hh;
  SELECT id INTO cat_dining FROM public.categories WHERE name = 'Dining Out' AND household_id = hh;
  SELECT id INTO cat_transport FROM public.categories WHERE name = 'Transportation' AND household_id = hh;
  SELECT id INTO cat_entertainment FROM public.categories WHERE name = 'Entertainment' AND household_id = hh;
  SELECT id INTO cat_shopping FROM public.categories WHERE name = 'Shopping' AND household_id = hh;
  SELECT id INTO cat_bills FROM public.categories WHERE name = 'Bills' AND household_id = hh;
  SELECT id INTO cat_allow1 FROM public.categories WHERE name = 'User One Allowance' AND household_id = hh;
  SELECT id INTO cat_allow2 FROM public.categories WHERE name = 'User Two Allowance' AND household_id = hh;

  -- ========================================================================
  -- Budget Allocations (3 months)
  -- ========================================================================
  INSERT INTO public.budget_allocations (household_id, category_id, budget_month, allocated_amount, currency) VALUES
    -- Two months ago
    (hh, cat_groceries,     month2, 500.00, 'EUR'),
    (hh, cat_dining,        month2, 200.00, 'EUR'),
    (hh, cat_transport,     month2, 120.00, 'EUR'),
    (hh, cat_entertainment, month2, 150.00, 'EUR'),
    (hh, cat_shopping,      month2, 100.00, 'EUR'),
    (hh, cat_bills,         month2, 300.00, 'EUR'),
    (hh, cat_allow1,        month2, 100.00, 'EUR'),
    (hh, cat_allow2,        month2, 100.00, 'EUR'),
    -- Previous month
    (hh, cat_groceries,     month1, 500.00, 'EUR'),
    (hh, cat_dining,        month1, 180.00, 'EUR'),
    (hh, cat_transport,     month1, 120.00, 'EUR'),
    (hh, cat_entertainment, month1, 150.00, 'EUR'),
    (hh, cat_shopping,      month1, 120.00, 'EUR'),
    (hh, cat_bills,         month1, 300.00, 'EUR'),
    (hh, cat_allow1,        month1, 100.00, 'EUR'),
    (hh, cat_allow2,        month1, 100.00, 'EUR'),
    -- Current month
    (hh, cat_groceries,     month0, 520.00, 'EUR'),
    (hh, cat_dining,        month0, 200.00, 'EUR'),
    (hh, cat_transport,     month0, 130.00, 'EUR'),
    (hh, cat_entertainment, month0, 150.00, 'EUR'),
    (hh, cat_shopping,      month0, 100.00, 'EUR'),
    (hh, cat_bills,         month0, 300.00, 'EUR'),
    (hh, cat_allow1,        month0, 100.00, 'EUR'),
    (hh, cat_allow2,        month0, 100.00, 'EUR');

  -- ========================================================================
  -- Expenses — Two months ago
  -- ========================================================================
  INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
    -- Groceries (total ~510, slightly over 500 budget)
    (u1, hh, cat_groceries, 85.30, 'EUR', 85.30, 'EUR', 1, month2 + 2, 'Weekly groceries'),
    (u2, hh, cat_groceries, 12.50, 'EUR', 12.50, 'EUR', 1, month2 + 4, 'Bread and milk'),
    (u1, hh, cat_groceries, 92.10, 'EUR', 92.10, 'EUR', 1, month2 + 9, 'Weekly groceries'),
    (u2, hh, cat_groceries, 45.80, 'EUR', 45.80, 'EUR', 1, month2 + 13, 'Fruits and vegetables'),
    (u1, hh, cat_groceries, 78.60, 'EUR', 78.60, 'EUR', 1, month2 + 16, 'Weekly groceries'),
    (u1, hh, cat_groceries, 110.20, 'EUR', 110.20, 'EUR', 1, month2 + 23, 'Big shop for dinner party'),
    (u2, hh, cat_groceries, 88.40, 'EUR', 88.40, 'EUR', 1, month2 + 27, 'Weekly groceries'),
    -- Dining Out (total ~185)
    (u1, hh, cat_dining, 42.00, 'EUR', 42.00, 'EUR', 1, month2 + 7, 'Pizza night'),
    (u2, hh, cat_dining, 35.50, 'EUR', 35.50, 'EUR', 1, month2 + 14, 'Lunch with friends'),
    (u1, hh, cat_dining, 68.00, 'EUR', 68.00, 'EUR', 1, month2 + 21, 'Anniversary dinner'),
    (u2, hh, cat_dining, 15.80, 'EUR', 15.80, 'EUR', 1, month2 + 25, 'Coffee and cake'),
    (u1, hh, cat_dining, 24.50, 'EUR', 24.50, 'EUR', 1, month2 + 27, 'Quick lunch'),
    -- Transportation (total ~115)
    (u1, hh, cat_transport, 50.00, 'EUR', 50.00, 'EUR', 1, month2 + 1, 'Monthly metro pass'),
    (u2, hh, cat_transport, 28.50, 'EUR', 28.50, 'EUR', 1, month2 + 11, 'Taxi to airport'),
    (u1, hh, cat_transport, 35.00, 'EUR', 35.00, 'EUR', 1, month2 + 19, 'Gas station'),
    -- Entertainment (total ~140)
    (u2, hh, cat_entertainment, 25.00, 'EUR', 25.00, 'EUR', 1, month2 + 5, 'Cinema tickets'),
    (u1, hh, cat_entertainment, 45.00, 'EUR', 45.00, 'EUR', 1, month2 + 17, 'Concert tickets'),
    (u2, hh, cat_entertainment, 14.99, 'EUR', 14.99, 'EUR', 1, month2, 'Streaming subscription'),
    (u1, hh, cat_entertainment, 55.00, 'EUR', 55.00, 'EUR', 1, month2 + 24, 'Board game night supplies'),
    -- Shopping (total ~95)
    (u2, hh, cat_shopping, 49.90, 'EUR', 49.90, 'EUR', 1, month2 + 10, 'Kitchen utensils'),
    (u1, hh, cat_shopping, 29.99, 'EUR', 29.99, 'EUR', 1, month2 + 18, 'Phone case'),
    (u2, hh, cat_shopping, 15.00, 'EUR', 15.00, 'EUR', 1, month2 + 26, 'Cleaning supplies'),
    -- Bills (total ~290)
    (u1, hh, cat_bills, 85.00, 'EUR', 85.00, 'EUR', 1, month2, 'Electricity'),
    (u1, hh, cat_bills, 45.00, 'EUR', 45.00, 'EUR', 1, month2, 'Internet'),
    (u1, hh, cat_bills, 120.00, 'EUR', 120.00, 'EUR', 1, month2 + 4, 'Health insurance'),
    (u2, hh, cat_bills, 39.99, 'EUR', 39.99, 'EUR', 1, month2 + 14, 'Phone plan'),
    -- Allowances
    (u1, hh, cat_allow1, 35.00, 'EUR', 35.00, 'EUR', 1, month2 + 8, 'Book'),
    (u1, hh, cat_allow1, 22.00, 'EUR', 22.00, 'EUR', 1, month2 + 20, 'Haircut'),
    (u2, hh, cat_allow2, 45.00, 'EUR', 45.00, 'EUR', 1, month2 + 12, 'Yoga class'),
    (u2, hh, cat_allow2, 18.50, 'EUR', 18.50, 'EUR', 1, month2 + 25, 'Magazine subscription');

  -- ========================================================================
  -- Expenses — Previous month
  -- ========================================================================
  INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
    -- Groceries (total ~480)
    (u1, hh, cat_groceries, 79.40, 'EUR', 79.40, 'EUR', 1, month1, 'Weekly groceries'),
    (u2, hh, cat_groceries, 23.10, 'EUR', 23.10, 'EUR', 1, month1 + 3, 'Snacks'),
    (u1, hh, cat_groceries, 95.80, 'EUR', 95.80, 'EUR', 1, month1 + 7, 'Weekly groceries'),
    (u2, hh, cat_groceries, 67.30, 'EUR', 67.30, 'EUR', 1, month1 + 11, 'Meat and fish'),
    (u1, hh, cat_groceries, 82.50, 'EUR', 82.50, 'EUR', 1, month1 + 14, 'Weekly groceries'),
    (u2, hh, cat_groceries, 38.90, 'EUR', 38.90, 'EUR', 1, month1 + 18, 'Dairy and eggs'),
    (u1, hh, cat_groceries, 91.20, 'EUR', 91.20, 'EUR', 1, month1 + 21, 'Weekly groceries'),
    -- Dining Out (total ~210, over 180 budget)
    (u2, hh, cat_dining, 55.00, 'EUR', 55.00, 'EUR', 1, month1 + 4, 'Birthday dinner'),
    (u1, hh, cat_dining, 38.00, 'EUR', 38.00, 'EUR', 1, month1 + 9, 'Thai restaurant'),
    (u2, hh, cat_dining, 22.50, 'EUR', 22.50, 'EUR', 1, month1 + 13, 'Lunch date'),
    (u1, hh, cat_dining, 72.00, 'EUR', 72.00, 'EUR', 1, month1 + 13, 'Special dinner'),
    (u2, hh, cat_dining, 19.80, 'EUR', 19.80, 'EUR', 1, month1 + 22, 'Brunch'),
    -- Transportation (total ~108)
    (u1, hh, cat_transport, 50.00, 'EUR', 50.00, 'EUR', 1, month1, 'Monthly metro pass'),
    (u2, hh, cat_transport, 22.00, 'EUR', 22.00, 'EUR', 1, month1 + 7, 'Uber'),
    (u1, hh, cat_transport, 36.00, 'EUR', 36.00, 'EUR', 1, month1 + 17, 'Gas station'),
    -- Entertainment (total ~125)
    (u2, hh, cat_entertainment, 14.99, 'EUR', 14.99, 'EUR', 1, month1, 'Streaming subscription'),
    (u1, hh, cat_entertainment, 60.00, 'EUR', 60.00, 'EUR', 1, month1 + 8, 'Theater tickets'),
    (u2, hh, cat_entertainment, 32.00, 'EUR', 32.00, 'EUR', 1, month1 + 19, 'Escape room'),
    (u1, hh, cat_entertainment, 18.00, 'EUR', 18.00, 'EUR', 1, month1 + 26, 'Museum entry'),
    -- Shopping (total ~135, over 120 budget)
    (u1, hh, cat_shopping, 65.00, 'EUR', 65.00, 'EUR', 1, month1 + 5, 'Winter jacket on sale'),
    (u2, hh, cat_shopping, 42.90, 'EUR', 42.90, 'EUR', 1, month1 + 15, 'Gift'),
    (u2, hh, cat_shopping, 27.00, 'EUR', 27.00, 'EUR', 1, month1 + 24, 'Household items'),
    -- Bills (total ~290)
    (u1, hh, cat_bills, 92.00, 'EUR', 92.00, 'EUR', 1, month1, 'Electricity'),
    (u1, hh, cat_bills, 45.00, 'EUR', 45.00, 'EUR', 1, month1, 'Internet'),
    (u1, hh, cat_bills, 120.00, 'EUR', 120.00, 'EUR', 1, month1 + 4, 'Health insurance'),
    (u2, hh, cat_bills, 39.99, 'EUR', 39.99, 'EUR', 1, month1 + 14, 'Phone plan'),
    -- Allowances
    (u1, hh, cat_allow1, 48.00, 'EUR', 48.00, 'EUR', 1, month1 + 6, 'Running shoes'),
    (u1, hh, cat_allow1, 15.00, 'EUR', 15.00, 'EUR', 1, month1 + 19, 'Coffee beans'),
    (u2, hh, cat_allow2, 55.00, 'EUR', 55.00, 'EUR', 1, month1 + 10, 'Art supplies'),
    (u2, hh, cat_allow2, 30.00, 'EUR', 30.00, 'EUR', 1, month1 + 23, 'Yoga workshop');

  -- ========================================================================
  -- Expenses — Current month (conditional: only insert if day has passed)
  -- ========================================================================

  -- Day 0: Bills and subscriptions (start of month)
  IF month0 + 0 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_groceries,     88.70, 'EUR',  88.70, 'EUR', 1, month0 + 0, 'Weekly groceries'),
      (u1, hh, cat_transport,     50.00, 'EUR',  50.00, 'EUR', 1, month0 + 0, 'Monthly metro pass'),
      (u2, hh, cat_entertainment, 14.99, 'EUR',  14.99, 'EUR', 1, month0 + 0, 'Streaming subscription'),
      (u1, hh, cat_bills,         88.00, 'EUR',  88.00, 'EUR', 1, month0 + 0, 'Electricity'),
      (u1, hh, cat_bills,         45.00, 'EUR',  45.00, 'EUR', 1, month0 + 0, 'Internet');
  END IF;

  -- Day 2: Weekend brunch
  IF month0 + 2 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_dining, 28.00, 'EUR', 28.00, 'EUR', 1, month0 + 2, 'Sunday brunch');
  END IF;

  -- Day 4: Health insurance
  IF month0 + 4 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_bills, 120.00, 'EUR', 120.00, 'EUR', 1, month0 + 4, 'Health insurance');
  END IF;

  -- Day 6: Grocery top-up
  IF month0 + 6 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_groceries, 31.20, 'EUR', 31.20, 'EUR', 1, month0 + 6, 'Fresh bread and cheese');
  END IF;

  -- Day 8: Weekly groceries
  IF month0 + 8 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_groceries, 102.50, 'EUR', 102.50, 'EUR', 1, month0 + 8, 'Big weekly shop');
  END IF;

  -- Day 10: Allowance spend
  IF month0 + 10 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_allow1, 28.00, 'EUR', 28.00, 'EUR', 1, month0 + 10, 'Novel');
  END IF;

  -- Day 12: Shopping
  IF month0 + 12 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_shopping, 89.00, 'EUR', 89.00, 'EUR', 1, month0 + 12, 'Spring wardrobe');
  END IF;

  -- Day 14: Phone plan
  IF month0 + 14 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_bills, 39.99, 'EUR', 39.99, 'EUR', 1, month0 + 14, 'Phone plan');
  END IF;

  -- Day 16: Brazil trip day 1
  IF month0 + 16 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_dining,    120.00, 'BRL', 19.56, 'EUR', 0.163027, month0 + 16, 'Restaurante churrasco'),
      (u1, hh, cat_transport,  45.00, 'BRL',  7.34, 'EUR', 0.163027, month0 + 16, 'Uber aeroporto');
  END IF;

  -- Day 17: Brazil trip day 2
  IF month0 + 17 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_groceries, 185.00, 'BRL', 30.16, 'EUR', 0.163027, month0 + 17, 'Supermercado'),
      (u1, hh, cat_dining,     85.00, 'BRL', 13.86, 'EUR', 0.163027, month0 + 17, 'Café da manhã'),
      (u1, hh, cat_transport,  32.00, 'BRL',  5.22, 'EUR', 0.163027, month0 + 17, 'Uber centro');
  END IF;

  -- Day 20: Allowance spend
  IF month0 + 20 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_allow2, 40.00, 'EUR', 40.00, 'EUR', 1, month0 + 20, 'Pottery class');
  END IF;

  -- Day 22: Dining out
  IF month0 + 22 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u2, hh, cat_dining, 41.50, 'EUR', 41.50, 'EUR', 1, month0 + 22, 'Sushi night');
  END IF;

  -- Day 25: Entertainment
  IF month0 + 25 <= CURRENT_DATE THEN
    INSERT INTO public.expenses (logged_by_user_id, household_id, category_id, amount, currency, converted_amount, converted_currency, exchange_rate, expense_date, description) VALUES
      (u1, hh, cat_entertainment, 35.00, 'EUR', 35.00, 'EUR', 1, month0 + 25, 'Bowling');
  END IF;

  RAISE NOTICE '  ✓ Seeded budget allocations and expenses';
END $$;
