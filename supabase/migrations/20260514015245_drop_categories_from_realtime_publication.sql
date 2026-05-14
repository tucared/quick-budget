-- Hand-authored. Drops `categories` from the supabase_realtime publication and
-- resets its replica identity to DEFAULT. No client subscribes to category
-- changes (only expenses_household_* and budget_allocations_household_*
-- channels are used in src/lib/hooks/), so publication membership and
-- REPLICA IDENTITY FULL cost WAL volume for zero downstream benefit.
--
-- Forward-only follow-up to
-- 20260513235951_decouple_realtime_from_declarative_schemas.sql, which adds
-- categories to the publication (guarded by pg_publication_tables). The
-- mirrored guard here means the chain stays idempotent on `supabase db reset`.
--
-- ALTER PUBLICATION and REPLICA IDENTITY are in the "hand-authored only" list
-- in CLAUDE.md because migra cannot diff them reliably.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'categories'
  ) then
    alter publication supabase_realtime drop table categories;
  end if;
end;
$$;

alter table categories replica identity default;
