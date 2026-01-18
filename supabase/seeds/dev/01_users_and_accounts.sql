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
  auto_household_ids UUID[];
BEGIN
  -- Clean up any existing test data (cascades to all related tables)
  DELETE FROM auth.users WHERE id IN (user1_id, user2_id);
  DELETE FROM public.households WHERE id = shared_household_id;

  -- Create our shared household FIRST
  INSERT INTO public.households (id, name, created_at, updated_at)
  VALUES (shared_household_id, 'Test Household', NOW(), NOW());

  -- Insert test users into auth.users
  -- NOTE: This triggers handle_new_user() which will:
  --   1. Create a household for each user
  --   2. Insert into public.users with that household_id
  --   3. Create a default account
  --   4. Seed default categories
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
  );

  -- Capture the auto-created household IDs before we change them
  SELECT ARRAY_AGG(household_id) INTO auto_household_ids
  FROM public.users
  WHERE id IN (user1_id, user2_id);

  -- Move both users to our shared household
  UPDATE public.users
  SET household_id = shared_household_id
  WHERE id IN (user1_id, user2_id);

  -- Move all auto-created accounts to the shared household
  UPDATE public.accounts
  SET household_id = shared_household_id
  WHERE household_id = ANY(auto_household_ids);

  -- Move all auto-created categories to the shared household (deduping by name)
  -- First, update one set of categories to point to shared household
  UPDATE public.categories
  SET household_id = shared_household_id
  WHERE household_id = auto_household_ids[1];

  -- Delete duplicate categories from the second auto-created household
  DELETE FROM public.categories
  WHERE household_id = ANY(auto_household_ids[2:]);

  -- Delete the auto-created households (now that everything is moved)
  DELETE FROM public.households
  WHERE id = ANY(auto_household_ids);

  -- Add our custom accounts (in addition to the auto-created "Primary Account")
  INSERT INTO public.accounts (household_id, owner_user_id, name, account_type, currency, is_default, is_active)
  VALUES
    (shared_household_id, user1_id, 'Credit Card', 'credit_card', 'USD', false, true),
    (shared_household_id, user1_id, 'Cash', 'cash', 'USD', false, true),
    (shared_household_id, user2_id, 'Debit Card', 'debit_card', 'USD', false, true),
    (shared_household_id, user2_id, 'Savings', 'bank_account', 'USD', false, true);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Development seed: Users and accounts loaded';
  RAISE NOTICE '  user1@test.com / password123';
  RAISE NOTICE '  user2@test.com / password123';
  RAISE NOTICE '========================================';

END $$;
