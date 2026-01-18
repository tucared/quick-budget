-- ============================================================================
-- PRODUCTION SEED: Users and Accounts
-- ============================================================================
-- This file creates 2 user accounts with their associated accounts.
-- Run this manually in Supabase Studio SQL Editor for production deployment.
--
-- For local development, this runs automatically via `supabase db reset`.
--
-- IMPORTANT FOR PRODUCTION:
-- - Change the email addresses to real production emails
-- - Change the encrypted_password to secure passwords (or use signup flow instead)
-- - Update user metadata (full_name) as needed
-- ============================================================================

DO $$
DECLARE
  user1_id UUID := '00000000-0000-0000-0000-000000000001';
  user2_id UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  -- Insert users into auth.users
  -- Password hash below is for 'password123' - CHANGE THIS IN PRODUCTION!
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
    'user1@test.com',  -- CHANGE THIS IN PRODUCTION
    crypt('password123', gen_salt('bf')),  -- Use crypt() for proper bcrypt hashing
    NOW(),
    '',  -- confirmation_token
    '',  -- recovery_token
    '',  -- email_change_token_current
    '',  -- email_change_token_new
    '',  -- email_change
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 1"}',  -- CHANGE THIS IN PRODUCTION
    false,  -- is_sso_user
    false,  -- is_anonymous
    'authenticated',
    'authenticated'
  ), (
    user2_id,
    '00000000-0000-0000-0000-000000000000',
    'user2@test.com',  -- CHANGE THIS IN PRODUCTION
    crypt('password123', gen_salt('bf')),  -- Use crypt() for proper bcrypt hashing
    NOW(),
    '',  -- confirmation_token
    '',  -- recovery_token
    '',  -- email_change_token_current
    '',  -- email_change_token_new
    '',  -- email_change
    NOW(),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Test User 2"}',  -- CHANGE THIS IN PRODUCTION
    false,  -- is_sso_user
    false,  -- is_anonymous
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into public.users
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

END $$;
