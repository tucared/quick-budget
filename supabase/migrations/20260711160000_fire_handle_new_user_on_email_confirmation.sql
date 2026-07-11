-- Fire handle_new_user() at email confirmation, not just at signup.
--
-- handle_new_user() now returns early while auth.users.email_confirmed_at is
-- NULL (see supabase/schemas/01_functions.sql — the body change itself flows
-- through the normal Generate Migration diff). This trigger provides the
-- second firing point: the NULL→NOT NULL transition that GoTrue performs when
-- the user clicks the signup confirmation link. Net effect:
--
--   - a real signUp (unconfirmed INSERT) materializes its household / invite
--     consumption only once the email is confirmed — abandoned signups leave
--     a single unconfirmed auth.users row instead of a ghost household;
--   - an invite can only be consumed by someone who can read mail at the
--     invited address, closing the invite-squatting timing vector;
--   - the seed path and SQL-provisioned users (INSERTed with
--     email_confirmed_at already set) keep working through the existing
--     on_auth_user_created INSERT trigger.
--
-- Hand-authored because triggers on auth.users sit outside the
-- `supabase db diff --schema public` scope (same reason the baseline owns
-- on_auth_user_created). The matching declaration in
-- supabase/schemas/02_tables.sql is informational.
CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();
