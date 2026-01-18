-- ============================================================================
-- DEVELOPMENT SEED: Users, Household, Accounts, and Categories
-- ============================================================================
-- Creates 2 test users with shared household, accounts, and default categories.
-- Runs automatically via `supabase db reset` in local development.
-- ============================================================================

DO $$
DECLARE
  user1_id UUID := '00000000-0000-0000-0000-000000000001';
  user2_id UUID := '00000000-0000-0000-0000-000000000002';
  shared_household_id UUID := '00000000-0000-0000-0000-000000000100';
BEGIN
  -- Insert test users into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_current,
    email_change_token_new,
    email_change,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    aud,
    role
  ) VALUES (
    user1_id,
    '00000000-0000-0000-0000-000000000000',
    'user1@test.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 1"}',
    false,
    false,
    'authenticated',
    'authenticated'
  ), (
    user2_id,
    '00000000-0000-0000-0000-000000000000',
    'user2@test.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '',
    '',
    '',
    '',
    '',
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 2"}',
    false,
    false,
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create shared household
  INSERT INTO public.households (id, name, created_at, updated_at)
  VALUES (shared_household_id, 'Test Household', NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Insert into public.users with household_id
  INSERT INTO public.users (id, email, full_name, household_id, created_at, updated_at)
  VALUES
    (user1_id, 'user1@test.com', 'Test User 1', shared_household_id, NOW(), NOW()),
    (user2_id, 'user2@test.com', 'Test User 2', shared_household_id, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Insert accounts for User 1
  INSERT INTO public.accounts (id, household_id, owner_user_id, name, account_type, currency, is_default, is_active)
  VALUES
    (gen_random_uuid(), shared_household_id, user1_id, 'Credit Card', 'credit_card', 'USD', true, true),
    (gen_random_uuid(), shared_household_id, user1_id, 'Cash', 'cash', 'USD', false, true)
  ON CONFLICT DO NOTHING;

  -- Insert accounts for User 2
  INSERT INTO public.accounts (id, household_id, owner_user_id, name, account_type, currency, is_default, is_active)
  VALUES
    (gen_random_uuid(), shared_household_id, user2_id, 'Debit Card', 'debit_card', 'USD', true, true),
    (gen_random_uuid(), shared_household_id, user2_id, 'Savings', 'bank_account', 'USD', false, true)
  ON CONFLICT DO NOTHING;

  -- Seed default categories for the test household
  INSERT INTO public.categories (household_id, name, category_type, icon, is_active) VALUES
    (shared_household_id, 'Groceries', 'monthly', '🛒', TRUE),
    (shared_household_id, 'Dining Out', 'monthly', '🍽️', TRUE),
    (shared_household_id, 'Transportation', 'monthly', '🚗', TRUE),
    (shared_household_id, 'Bills & Utilities', 'monthly', '💡', TRUE),
    (shared_household_id, 'Shopping', 'monthly', '🛍️', TRUE),
    (shared_household_id, 'Entertainment', 'monthly', '🎬', TRUE),
    (shared_household_id, 'Healthcare', 'monthly', '⚕️', TRUE),
    (shared_household_id, 'Personal Care', 'monthly', '💇', TRUE),
    (shared_household_id, 'Education', 'monthly', '📚', TRUE),
    (shared_household_id, 'Other', 'monthly', '📌', TRUE),
    (shared_household_id, 'Emergency Fund', 'long_term', '🏦', TRUE),
    (shared_household_id, 'Holiday Fund', 'long_term', '✈️', TRUE)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Development seed: Users and accounts loaded';
  RAISE NOTICE '  user1@test.com / password123';
  RAISE NOTICE '  user2@test.com / password123';
  RAISE NOTICE '========================================';

END $$;
