-- Hand-authored. `supabase db diff` doesn't capture function-level grants (a
-- known migra limitation — see .agents/skills/supabase-schema-flow/SKILL.md),
-- so the REVOKE/GRANT declared alongside public.check_pending_invite in
-- supabase/schemas/05_rpcs.sql needs this follow-up. Without it the function
-- lands on a fresh DB revoked from everyone by the 00_setup.sql default
-- privileges, and the /signup live invite check (which calls it as anon,
-- pre-auth) would fail closed.
REVOKE EXECUTE ON FUNCTION public.check_pending_invite(TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_pending_invite(TEXT) TO anon, authenticated;
