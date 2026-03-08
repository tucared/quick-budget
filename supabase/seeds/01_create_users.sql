-- ============================================================================
-- 01_create_users.sql - Idempotent User & Household Setup
-- ============================================================================
-- Creates two test users and merges them into a shared household.
-- Safe to re-run: skips existing users and already-merged households.
-- ============================================================================

DO $$
DECLARE
  user1_id UUID;
  user2_id UUID;
  household1_id UUID;
  household2_id UUID;
  shared_household_id UUID;
  v_user1_email TEXT := 'user1@example.com';
  v_user2_email TEXT := 'user2@example.com';
  v_user1_password TEXT := 'password1';
  v_user2_password TEXT := 'password2';
  v_user1_name TEXT := 'User One';
  v_user2_name TEXT := 'User Two';
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Idempotent user & household setup...';
  RAISE NOTICE '========================================';

  -- ----------------------------------------------------------------
  -- Step 1: Ensure users exist (create only if missing)
  -- ----------------------------------------------------------------
  SELECT id INTO user1_id FROM auth.users WHERE email = v_user1_email;
  SELECT id INTO user2_id FROM auth.users WHERE email = v_user2_email;

  IF user1_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated', 'authenticated',
      v_user1_email,
      extensions.crypt(v_user1_password, extensions.gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      format('{"full_name":"%s"}', v_user1_name)::jsonb,
      NOW(), NOW(), '', '', '', ''
    ) RETURNING id INTO user1_id;

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      user1_id, user1_id,
      format('{"sub": "%s", "email": "%s"}', user1_id, v_user1_email)::jsonb,
      'email', user1_id, NOW(), NOW(), NOW()
    );

    RAISE NOTICE '  ✓ Created user %', v_user1_email;
  ELSE
    RAISE NOTICE '  → User % already exists, skipping creation', v_user1_email;
  END IF;

  IF user2_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated', 'authenticated',
      v_user2_email,
      extensions.crypt(v_user2_password, extensions.gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      format('{"full_name":"%s"}', v_user2_name)::jsonb,
      NOW(), NOW(), '', '', '', ''
    ) RETURNING id INTO user2_id;

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      user2_id, user2_id,
      format('{"sub": "%s", "email": "%s"}', user2_id, v_user2_email)::jsonb,
      'email', user2_id, NOW(), NOW(), NOW()
    );

    RAISE NOTICE '  ✓ Created user %', v_user2_email;
  ELSE
    RAISE NOTICE '  → User % already exists, skipping creation', v_user2_email;
  END IF;

  -- ----------------------------------------------------------------
  -- Step 2: Merge households (skip if already sharing one)
  -- ----------------------------------------------------------------
  SELECT household_id INTO household1_id FROM public.users WHERE id = user1_id;
  SELECT household_id INTO household2_id FROM public.users WHERE id = user2_id;

  IF household1_id = household2_id THEN
    RAISE NOTICE '  → Users already share household, nothing to do';
  ELSE
    INSERT INTO public.households (name) VALUES ('Home')
    RETURNING id INTO shared_household_id;

    UPDATE public.users SET household_id = shared_household_id WHERE id IN (user1_id, user2_id);
    DELETE FROM public.households WHERE id IN (household1_id, household2_id);

    RAISE NOTICE '  ✓ Merged users into shared household "Home"';
  END IF;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Setup complete.';
  RAISE NOTICE '========================================';
END $$;
