-- Hand-authored. Migra (which powers `supabase db diff`) does not read view
-- options like `security_invoker` back from pg_class.reloptions
-- (supabase/cli#3973, #792). Declaring the option in supabase/schemas/04_views.sql
-- via `WITH (security_invoker = true)` made `db diff` emit a perpetual no-op
-- view-recreation on every schemas/** PR. Pinning the option here, outside the
-- declarative chain, kills the loop at the source: schemas/04_views.sql now
-- declares only the body, source and target look identical to migra, no diff.
--
-- Grants are pinned here for the same reason: Postgres drops grants on view
-- DROP, migra does not diff GRANT/REVOKE, and we no longer want a workflow
-- self-heal block patching it back. If a future PR causes a side-effect
-- recreation (column add/drop/rename on categories/budget_allocations/expenses
-- forces migra to emit `DROP VIEW + CREATE OR REPLACE` for budget_summary),
-- the recreated view will lose both the option and the grants — author a
-- follow-up migration that re-applies these four statements. Safety nets:
-- `Migrate Prod`'s security-advisors gate flags `security_definer_view` and
-- blocks the push; stripped grants surface immediately as `permission denied
-- for view budget_summary` on the next deploy.

ALTER VIEW public.budget_summary SET (security_invoker = true);

GRANT SELECT ON public.budget_summary TO authenticated;
GRANT SELECT ON public.budget_summary TO service_role;
REVOKE SELECT ON public.budget_summary FROM anon;
