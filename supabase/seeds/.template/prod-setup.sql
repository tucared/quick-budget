-- ============================================================================
-- prod-setup.sql - Production Household Setup
-- ============================================================================
-- Run ONCE after creating users via Supabase Dashboard (Authentication > Add user).
-- Merges auto-created households into a shared 'Home' household.
-- No passwords — users are created via Dashboard with email confirmation.
-- ============================================================================

DO $$
DECLARE
  user1_id UUID;
  user2_id UUID;
  household1_id UUID;
  household2_id UUID;
  shared_household_id UUID;
BEGIN
  RAISE NOTICE 'Setting up shared household for production...';

  -- Look up Dashboard-created users by email
  SELECT id INTO user1_id FROM auth.users WHERE email = 'user1@example.com';
  SELECT id INTO user2_id FROM auth.users WHERE email = 'user2@example.com';

  IF user1_id IS NULL OR user2_id IS NULL THEN
    RAISE EXCEPTION 'Both users must exist. Create them in Supabase Dashboard first.';
  END IF;

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

  RAISE NOTICE '  ✓ Merged users into shared household "Home"';
END $$;
