-- ============================================================================
-- 00_create_users.sql - Dev User Creation
-- ============================================================================
-- Creates test users with passwords for local development
-- This file is git-ignored (copy from .template/ and customize)
-- ============================================================================

DO $$
DECLARE
  user1_id UUID;
  user2_id UUID;
  household1_id UUID;
  household2_id UUID;
  shared_household_id UUID;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Creating dev users and household...';
  RAISE NOTICE '========================================';

  -- Clean up any existing users (for local re-runs)
  DELETE FROM auth.users WHERE email IN (
    'user1@example.com',
    'user2@example.com'
  );

  -- Create User 1
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'user1@example.com',
    crypt('password1', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User One"}',
    NOW(), NOW(), '', '', '', ''
  ) RETURNING id INTO user1_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    user1_id, user1_id,
    format('{"sub": "%s", "email": "user1@example.com"}', user1_id)::jsonb,
    'email', user1_id, NOW(), NOW(), NOW()
  );

  -- Create User 2
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated', 'authenticated',
    'user2@example.com',
    crypt('password2', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User Two"}',
    NOW(), NOW(), '', '', '', ''
  ) RETURNING id INTO user2_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    user2_id, user2_id,
    format('{"sub": "%s", "email": "user2@example.com"}', user2_id)::jsonb,
    'email', user2_id, NOW(), NOW(), NOW()
  );

  -- Get auto-created household IDs (from handle_new_user trigger)
  SELECT household_id INTO household1_id FROM public.users WHERE id = user1_id;
  SELECT household_id INTO household2_id FROM public.users WHERE id = user2_id;

  -- Create shared household named 'Home'
  INSERT INTO public.households (name) VALUES ('Home')
  RETURNING id INTO shared_household_id;

  -- Consolidate users into shared household
  UPDATE public.users SET household_id = shared_household_id WHERE id IN (user1_id, user2_id);

  -- Delete auto-created households
  DELETE FROM public.households WHERE id IN (household1_id, household2_id);

  RAISE NOTICE '  ✓ Created 2 users in shared household "Home"';
  RAISE NOTICE 'Login credentials:';
  RAISE NOTICE '  user1@example.com / password1';
  RAISE NOTICE '  user2@example.com / password2';
END $$;
