-- All tables with full column definitions, constraints, indexes, and triggers

-- ============================================================================
-- HOUSEHOLDS
-- ============================================================================
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- The household's accounting currency: every expense's converted_amount,
  -- category cap, budget allocation, and Tricount-mirrored amount is
  -- denominated in this. The global exchange_rates table stays EUR-pivoted;
  -- conversion to base_currency is derived as a cross-rate
  -- (rate_to_eur(input) / rate_to_eur(base_currency)). Defaults to EUR so the
  -- original household is unchanged and no expense backfill is needed.
  base_currency TEXT NOT NULL DEFAULT 'EUR' CHECK (base_currency ~ '^[A-Z]{3}$'),
  -- The secondary (foreign) currency offered alongside base_currency in the
  -- expense form's currency toggle. Must differ from base_currency — they are
  -- the two options of the form's toggle, so an equal pair would render two
  -- identical buttons (see households_currencies_distinct below).
  secondary_currency TEXT NOT NULL DEFAULT 'BRL' CHECK (secondary_currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The currency toggle needs two distinct options; equal base/secondary would
  -- render duplicate buttons.
  CONSTRAINT households_currencies_distinct CHECK (base_currency <> secondary_currency)
);

CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT ON public.households TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO service_role;
REVOKE SELECT ON public.households FROM anon;

-- ============================================================================
-- HOUSEHOLD_INVITES
-- ============================================================================
-- Pre-authorizes an email to join an existing household at signup. The founder
-- lists partner email(s) when creating the household; handle_new_user() writes a
-- row here per email. When that person later self-signs-up, handle_new_user()
-- matches their email to an unconsumed invite and links them to this household
-- (instead of creating a new one), then stamps consumed_at. There is no service-
-- role key in this app, so accounts can't be admin-provisioned — invite routing
-- via the public signUp + this trigger is how a second member joins.
--
-- Only the SECURITY DEFINER trigger writes this table; authenticated callers get
-- SELECT only (future household-management UI), no INSERT/UPDATE/DELETE.
CREATE TABLE household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one outstanding (unconsumed) invite per email per household,
-- case-insensitive. Scoped to the household (not global) so two households can
-- independently invite the same address; handle_new_user() resolves a sign-up
-- to the oldest pending invite.
CREATE UNIQUE INDEX idx_household_invites_email_pending
  ON household_invites (household_id, lower(email)) WHERE consumed_at IS NULL;

CREATE INDEX idx_household_invites_household ON household_invites(household_id);

GRANT SELECT ON public.household_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_invites TO service_role;
REVOKE SELECT ON public.household_invites FROM anon;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_household ON users(household_id);

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auth triggers: materialize the household once a signup is confirmed.
-- handle_new_user() no-ops while email_confirmed_at is NULL, so the INSERT
-- trigger only acts on pre-confirmed rows (seeds, SQL-provisioned users) and
-- real signups materialize at the confirmation click via the UPDATE trigger.
-- Both live on auth.users, outside the `db diff --schema public` scope — these
-- declarations are informational; the INSERT trigger is owned by the baseline
-- migration and the UPDATE trigger by
-- supabase/migrations/20260711160000_fire_handle_new_user_on_email_confirmation.sql.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_new_user();

-- RLS helper: returns the caller's household_id without triggering RLS on
-- public.users. Lives in the `private` schema (set up in 00_setup.sql) so
-- PostgREST/GraphQL do not expose it as an RPC — only RLS policies that
-- reference it by `private.get_my_household_id()` can invoke it.
-- Must come after the users table is defined.
--
-- Reads household_id from the JWT custom claim populated by the
-- private.custom_access_token_hook auth hook (defined below). There is NO
-- users-table fallback: when the claim is absent the function returns NULL,
-- every household-scoped policy matches zero rows, and the app bounces the
-- session to /login. The hook must therefore be enabled before this schema
-- serves traffic (see the rollout notes in the drop migration).
--
-- Source of truth: the hand-authored migrations
-- supabase/migrations/20260514120000_add_household_id_to_jwt_claims.sql
-- and supabase/migrations/20260514163400_drop_users_fallback_from_get_my_household_id.sql.
-- This declaration is informational because the `private` schema is
-- excluded from `supabase db diff --schema public` (see CLAUDE.md).
CREATE OR REPLACE FUNCTION private.get_my_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata' ->> 'household_id',
    ''
  )::uuid;
$$;

GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
REVOKE SELECT ON public.users FROM anon;

-- Revoke from PUBLIC *and* the explicit default API roles — Supabase auto-grants
-- function EXECUTE to anon/authenticated/service_role on creation, so revoking
-- only from PUBLIC leaves those explicit grants in place. Then re-grant to
-- authenticated, the one role that legitimately calls this RLS helper.
REVOKE EXECUTE ON FUNCTION private.get_my_household_id() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_my_household_id() TO authenticated;

-- Supabase Auth hook: inject household_id into every issued access token as
-- app_metadata.household_id. Lets server- and client-side code read the
-- household scope from the JWT instead of querying public.users on every
-- page load. Lives in `private` so it stays off the PostgREST/RPC surface
-- and out of generated TypeScript types — only supabase_auth_admin (the
-- Supabase Auth service role) ever calls it.
--
-- The hook must be configured in supabase/config.toml (local) and in the
-- Supabase dashboard (Authentication → Hooks → Custom Access Token →
-- `private.custom_access_token_hook`) for Dev/Prod cloud projects;
-- config.toml does not propagate.
--
-- SECURITY DEFINER so the function reads public.users with the owner's
-- privileges, sidestepping the row-level grants on authenticated.
-- supabase_auth_admin only needs USAGE on the `private` schema (granted
-- in 00_setup.sql) and EXECUTE on this function.
--
-- Source of truth: hand-authored migration
-- supabase/migrations/20260514120000_add_household_id_to_jwt_claims.sql.
-- This declaration is informational because the `private` schema is
-- excluded from `supabase db diff --schema public` (see CLAUDE.md).
CREATE OR REPLACE FUNCTION private.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hid uuid;
  claims jsonb;
BEGIN
  SELECT household_id INTO hid FROM public.users WHERE id = (event->>'user_id')::uuid;
  IF hid IS NULL THEN
    RETURN event;
  END IF;
  claims := event->'claims';
  claims := jsonb_set(claims, '{app_metadata}', COALESCE(claims->'app_metadata', '{}'::jsonb));
  claims := jsonb_set(claims, '{app_metadata,household_id}', to_jsonb(hid::text));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- Realtime broadcast trigger function. Lives in `private` so migra's
-- `--schema public` diff scope cannot see it (the body below is informational
-- only — source of truth is the hand-authored migration
-- supabase/migrations/20260513235951_decouple_realtime_from_declarative_schemas.sql,
-- which also owns the realtime.messages policy, publication membership, and
-- replica identity that migra can't reliably express). SECURITY DEFINER so the
-- inner realtime.broadcast_changes INSERT bypasses RLS via postgres' BYPASSRLS;
-- authenticated lacks BYPASSRLS and realtime.send swallows insert failures, so
-- a non-DEFINER trigger would silently drop every event. The two `*_broadcast_changes`
-- triggers below (on public.expenses and public.budget_allocations) ARE inside
-- migra's diff scope and MUST be declared in this file so subsequent diffs don't
-- emit phantom DROP TRIGGER statements.
CREATE OR REPLACE FUNCTION private.broadcast_household_table_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  hh UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    hh := OLD.household_id;
  ELSE
    hh := NEW.household_id;
  END IF;
  PERFORM realtime.broadcast_changes(
    TG_TABLE_NAME || '_household_' || hh::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION private.broadcast_household_table_changes() FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- CATEGORIES
-- ============================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exclude_from_budget_total BOOLEAN NOT NULL DEFAULT FALSE,
  -- Every category carries a non-empty emoji. The expense list shows the icon
  -- as the sole category cue when a description replaces the category name as a
  -- row's title, so the icon must always be present.
  icon TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional cap configuration (JTBD #8). When set, expenses logged against
  -- this category in amounts exceeding `cap_amount` (in the household's base
  -- currency) surface an inline toggle in the expense form: ON splits into two
  -- sibling rows (cap → this category, overflow → an allowance the user picks
  -- at log time), OFF logs a single row at the full amount. Stored in the
  -- household's base currency regardless of the expense's input currency.
  cap_amount DECIMAL(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_cap_positive CHECK (
    cap_amount IS NULL OR cap_amount > 0
  ),
  CONSTRAINT categories_icon_not_empty CHECK (btrim(icon) <> '')
);

CREATE INDEX idx_categories_household ON categories(household_id);
-- idx_categories_household_active dropped: idx_categories_household already
-- serves the household-scoped lookups; the is_active filter is cheap on the
-- handful of rows a household owns.

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO service_role;
REVOKE SELECT ON public.categories FROM anon;

-- ============================================================================
-- EXPENSES
-- ============================================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Audit trail of who entered the row (DATA_MODEL.md decision #1) — it never
  -- restricts visibility, so it must never destroy data either: SET NULL on
  -- user deletion preserves the household's shared expense history (a CASCADE
  -- here would silently erase every expense the departing partner logged).
  logged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- NOT NULL: a null-category row would silently vanish from budget_summary
  -- (the view filters category_id IS NOT NULL) — spend that no budget sees.
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  is_cash BOOLEAN NOT NULL DEFAULT FALSE,
  -- Amounts may be negative (refunds) but original and converted must agree
  -- in sign — see expenses_amount_signs_match below.
  amount DECIMAL(12, 2) NOT NULL CHECK (amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  converted_amount DECIMAL(12, 2) NOT NULL CHECK (converted_amount <> 0),
  converted_currency TEXT NOT NULL DEFAULT 'EUR' CHECK (converted_currency ~ '^[A-Z]{3}$'),
  exchange_rate DECIMAL(12, 6) NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  -- App-managed correlation id for the cap-with-overflow split flow (JTBD #8):
  -- a single user-facing purchase is stored as two sibling rows sharing this id,
  -- one in the capped primary category and one in the overflow category. NULL
  -- means a normal single-row expense. Not an FK — the value is minted
  -- client-side with crypto.randomUUID() and pair invariants are enforced by
  -- the app (see src/lib/split-utils.ts).
  split_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expenses_amount_signs_match CHECK (sign(amount) = sign(converted_amount))
);

CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date DESC);
CREATE INDEX idx_expenses_logged_by ON expenses(logged_by_user_id);
-- idx_expenses_date dropped: every query path is household-scoped (RLS), so
-- idx_expenses_household_date already covers date-ordered access.
CREATE INDEX idx_expenses_category ON expenses(category_id);
-- Partial index: only the small fraction of rows that are split members are
-- indexed. Used to fetch the sibling row when editing or deleting a split.
CREATE INDEX idx_expenses_split_group ON expenses(split_group_id) WHERE split_group_id IS NOT NULL;

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Informational stub for migra (source of truth: hand-authored migration
-- 20260513235951_decouple_realtime_from_declarative_schemas.sql).
CREATE TRIGGER expenses_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_household_table_changes();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO service_role;
REVOKE SELECT ON public.expenses FROM anon;

-- ============================================================================
-- EXCHANGE_RATES
-- ============================================================================
CREATE TABLE exchange_rates (
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rate_date DATE NOT NULL,
  rate_to_eur DECIMAL(12, 6) NOT NULL CHECK (rate_to_eur > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (currency, rate_date),
  -- This table is global (not household-scoped) and INSERT is open to any
  -- authenticated user, so bound the poisoning surface: no pre-seeding rates
  -- for arbitrary future dates. +1 day of slack because a client just past
  -- midnight in a UTC+ timezone legitimately asks for its local "today".
  CONSTRAINT exchange_rates_date_not_future CHECK (rate_date <= CURRENT_DATE + 1)
);

-- idx_exchange_rates_currency_date dropped: exact duplicate of the
-- (currency, rate_date) primary key — btree scans backwards fine for DESC.

CREATE TRIGGER update_exchange_rates_updated_at BEFORE UPDATE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO service_role;
REVOKE SELECT ON public.exchange_rates FROM anon;

-- ============================================================================
-- BUDGET_ALLOCATIONS
-- ============================================================================
CREATE TABLE budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  -- Always the first of the month: budget_summary joins on
  -- date_trunc('month', expense_date) = budget_month and the UNIQUE below
  -- dedupes per month — a mid-month value would create an allocation no
  -- expense ever matches.
  budget_month DATE NOT NULL CHECK (budget_month = date_trunc('month', budget_month)::date),
  allocated_amount DECIMAL(12, 2) NOT NULL CHECK (allocated_amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, category_id, budget_month)
);

CREATE INDEX idx_budget_allocations_household_month ON budget_allocations(household_id, budget_month DESC);
-- Re-added 2026-05-14 after Supabase advisor flagged the FK as unindexed
-- on Prod. (Previously dropped on the "unused" reading; workload changed.)
CREATE INDEX idx_budget_allocations_category ON budget_allocations(category_id);

CREATE TRIGGER update_budget_allocations_updated_at BEFORE UPDATE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Informational stub for migra (source of truth: hand-authored migration
-- 20260513235951_decouple_realtime_from_declarative_schemas.sql).
CREATE TRIGGER budget_allocations_broadcast_changes
  AFTER INSERT OR UPDATE OR DELETE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION private.broadcast_household_table_changes();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_allocations TO service_role;
REVOKE SELECT ON public.budget_allocations FROM anon;

-- ============================================================================
-- MONTHLY_BUDGET_TARGETS
-- ============================================================================
-- Optional per-month total budget target for a household. Covers the sum of
-- regular categories only (categories with exclude_from_budget_total = false);
-- allowances live outside the target. When a row exists for a given month,
-- the UI exposes an "unallocated" pool (target - sum of regular allocations)
-- that can be assigned mid-month via allocate_from_unallocated.
CREATE TABLE monthly_budget_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- First-of-month invariant, same reasoning as budget_allocations.
  budget_month DATE NOT NULL CHECK (budget_month = date_trunc('month', budget_month)::date),
  target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, budget_month)
);

-- idx_monthly_budget_targets_household_month dropped: Supabase advisor flagged
-- it as unused on Prod. The UNIQUE(household_id, budget_month) constraint
-- already creates a B-tree index that covers the same access pattern.

CREATE TRIGGER update_monthly_budget_targets_updated_at BEFORE UPDATE ON monthly_budget_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_budget_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_budget_targets TO service_role;
REVOKE SELECT ON public.monthly_budget_targets FROM anon;

-- ============================================================================
-- TRICOUNT_LINKS
-- ============================================================================
-- Connects a household to a Tricount shared ledger so its expenses can be
-- synced into Quick Budget (read-only, via Tricount's app backend). A household
-- may connect several tricounts (UNIQUE on household + share token).
--
-- `public_identifier_token` is the share code from a Tricount link
-- (https://tricount.com/<token>). `members` caches the registry membership list
-- [{id, name}] (refreshed each sync) so the mapping editor can render without a
-- network call. `member_map` holds explicit membership→user decisions (Tricount
-- membership id as text → Quick Budget user id, or null to exclude); a
-- membership absent from it is "unset" and not counted (mapping is always
-- explicit — no name auto-match). `default_category_id` is the shared "Tricount"
-- category synced expenses are filed under (the tricount title is surfaced as a
-- read-only UI tag, not prefixed into the description). `is_active` lets a
-- household pause a finished tricount:
-- paused links are skipped by sync-all / auto-sync, freezing their mirrored
-- expenses as a historical record (per-link manual sync still works on resume).
-- `last_synced_at` records the most recent successful reconcile. `timezone` is
-- the IANA zone used to resolve each entry's UTC timestamp to a calendar date
-- (Tricount serves timestamps in UTC with no zone in the payload, and its app
-- displays them in the device's local zone); set per tricount on the Sync tab,
-- validated against Intl.supportedValuesOf at the API layer.
CREATE TABLE tricount_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  public_identifier_token TEXT NOT NULL,
  title TEXT,
  default_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  members JSONB NOT NULL DEFAULT '[]'::jsonb,
  member_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A household can link multiple tricounts, but not the same one twice.
  UNIQUE(household_id, public_identifier_token)
);

-- idx_tricount_links_household dropped: prefix of the
-- UNIQUE(household_id, public_identifier_token) constraint's index.
-- Covering index for the default_category_id FK (ON DELETE SET NULL) so a
-- category delete doesn't sequential-scan this table.
CREATE INDEX idx_tricount_links_default_category ON tricount_links(default_category_id);

CREATE TRIGGER update_tricount_links_updated_at BEFORE UPDATE ON tricount_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tricount_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tricount_links TO service_role;
REVOKE SELECT ON public.tricount_links FROM anon;

-- ============================================================================
-- TRICOUNT_ENTRY_MAP
-- ============================================================================
-- Idempotency ledger for the sync: maps a stable Tricount registry entry id
-- to the Quick Budget expense row it produced. Lets re-syncs detect new,
-- changed (via `content_hash`), and removed entries across all months instead
-- of re-importing duplicates. `expense_id` cascades, so deleting a synced
-- expense in Quick Budget drops its mapping and the next sync re-creates it.
--
-- This table doubles as the owe/owed reconciliation ledger. A row exists for
-- every *reconcilable* entry — ACTIVE NORMAL expenses AND ACTIVE INCOME — so the
-- household's net Tricount balance (paid vs consumed) can be totalled per month
-- and per link without re-fetching the registry. INCOME entries are NOT mirrored
-- as budget expenses (the app does not track income as spend), so their rows
-- carry `expense_id = NULL`; NORMAL expenses still point at their mirrored row.
-- Both amounts are *signed* EUR: expense spend/cash-out is positive, income
-- consumption/cash-in is negative.
--   * `paid_converted_amount`  — household cash flow for the entry (the full
--     entry amount when a household member paid; 0 when an outsider paid).
--   * `share_converted_amount` — household consumption (sum of household members'
--     allocations).
-- Net owe/owed = SUM(paid_converted_amount − share_converted_amount): positive =
-- the household is owed, negative = the household owes. `entry_date` is the
-- entry's own date (mirrors the expense's date for NORMAL rows) so the monthly
-- memo can aggregate without joining expenses.
CREATE TABLE tricount_entry_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES tricount_links(id) ON DELETE CASCADE,
  tricount_entry_id BIGINT NOT NULL,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  -- No default: the sync always writes the entry's own date. (A '1970-01-01'
  -- backfill sentinel used to live here; a default would let a future code
  -- path silently write epoch dates into owe/owed aggregation.)
  entry_date DATE NOT NULL,
  paid_converted_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  share_converted_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(link_id, tricount_entry_id)
);

-- idx_tricount_entry_map_link dropped: prefix of the
-- UNIQUE(link_id, tricount_entry_id) constraint's index.
CREATE INDEX idx_tricount_entry_map_expense ON tricount_entry_map(expense_id);
-- Covering index for the household_id FK (ON DELETE CASCADE) so a household
-- delete doesn't sequential-scan this table.
CREATE INDEX idx_tricount_entry_map_household ON tricount_entry_map(household_id);

CREATE TRIGGER update_tricount_entry_map_updated_at BEFORE UPDATE ON tricount_entry_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tricount_entry_map TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tricount_entry_map TO service_role;
REVOKE SELECT ON public.tricount_entry_map FROM anon;
