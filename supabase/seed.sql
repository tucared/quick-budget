-- Seed file for local development
-- Creates 2 test user accounts with sample data

-- Note: This seed file is for LOCAL DEVELOPMENT ONLY
-- Password for all users: password123

-- User IDs (fixed UUIDs for consistency)
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
  -- Insert test users into auth.users
  -- Password hash for 'password123' using Supabase's auth
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role
  ) VALUES (
    user1_id,
    '00000000-0000-0000-0000-000000000000',
    'user1@test.com',
    '$2a$10$VN9pMl7hYqB9z8mVYqK3k.GHVT0LqNOhvz3lkJSR9L7.0iYg5Kvgm', -- bcrypt hash of 'password123'
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 1"}',
    'authenticated',
    'authenticated'
  ), (
    user2_id,
    '00000000-0000-0000-0000-000000000000',
    'user2@test.com',
    '$2a$10$VN9pMl7hYqB9z8mVYqK3k.GHVT0LqNOhvz3lkJSR9L7.0iYg5Kvgm', -- bcrypt hash of 'password123'
    NOW(),
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 2"}',
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into public.users (this would normally be done by trigger, but we're being explicit)
  INSERT INTO public.users (id, email, full_name, created_at, updated_at)
  VALUES
    (user1_id, 'user1@test.com', 'Test User 1', NOW(), NOW()),
    (user2_id, 'user2@test.com', 'Test User 2', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Insert accounts for User 1
  INSERT INTO public.accounts (id, user_id, name, account_type, currency, is_default, is_active)
  VALUES
    (gen_random_uuid(), user1_id, 'Credit Card', 'credit_card', 'USD', true, true),
    (gen_random_uuid(), user1_id, 'Cash', 'cash', 'USD', false, true)
  ON CONFLICT DO NOTHING;

  -- Insert accounts for User 2
  INSERT INTO public.accounts (id, user_id, name, account_type, currency, is_default, is_active)
  VALUES
    (gen_random_uuid(), user2_id, 'Debit Card', 'debit_card', 'USD', true, true),
    (gen_random_uuid(), user2_id, 'Savings', 'bank_account', 'USD', false, true)
  ON CONFLICT DO NOTHING;

  -- Get category IDs for sample expenses
  SELECT id INTO groceries_cat_id FROM public.categories WHERE name = 'Groceries' LIMIT 1;
  SELECT id INTO dining_cat_id FROM public.categories WHERE name = 'Dining Out' LIMIT 1;
  SELECT id INTO transport_cat_id FROM public.categories WHERE name = 'Transportation' LIMIT 1;

  -- Get User 1's default account
  SELECT id INTO user1_account_id FROM public.accounts WHERE user_id = user1_id AND is_default = true LIMIT 1;

  -- Get User 2's default account
  SELECT id INTO user2_account_id FROM public.accounts WHERE user_id = user2_id AND is_default = true LIMIT 1;

  -- Insert sample expenses for User 1
  IF user1_account_id IS NOT NULL AND groceries_cat_id IS NOT NULL THEN
    INSERT INTO public.expenses (
      user_id, category_id, account_id,
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
      user_id, category_id, account_id,
      amount, currency,
      converted_amount, converted_currency, exchange_rate,
      expense_date, description
    ) VALUES
      (user2_id, groceries_cat_id, user2_account_id, 52.30, 'USD', 52.30, 'USD', 1.0, CURRENT_DATE - 3, 'Grocery shopping'),
      (user2_id, dining_cat_id, user2_account_id, 28.75, 'USD', 28.75, 'USD', 1.0, CURRENT_DATE - 1, 'Lunch at cafe')
    ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- Display seed summary
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Seed data loaded successfully!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Accounts:';
  RAISE NOTICE '  User 1: user1@test.com / password123';
  RAISE NOTICE '  User 2: user2@test.com / password123';
  RAISE NOTICE '========================================';
END $$;
