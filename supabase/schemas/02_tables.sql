-- All tables with full column definitions, constraints, indexes, and triggers

-- ============================================================================
-- HOUSEHOLDS
-- ============================================================================
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT SELECT ON public.households TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO service_role;
REVOKE SELECT ON public.households FROM anon;

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

-- Auth trigger: create user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS helper: returns the caller's household_id without triggering RLS on
-- public.users. Lives in the `private` schema (set up in 00_setup.sql) so
-- PostgREST/GraphQL do not expose it as an RPC — only RLS policies that
-- reference it by `private.get_my_household_id()` can invoke it.
-- Must come after the users table is defined.
--
-- Reads household_id from the JWT custom claim populated by the
-- public.custom_access_token_hook auth hook (see 01_functions.sql). Falls
-- back to a users table lookup when the claim is absent — covers legacy
-- access tokens issued before the hook was enabled and any environment
-- where the hook isn't yet configured in the Supabase dashboard.
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
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional cap configuration (JTBD #8). When both are set, expenses logged
  -- against this category in amounts exceeding `cap_amount` (EUR-equivalent)
  -- surface an inline toggle in the expense form: ON splits into two sibling
  -- rows (cap → this category, overflow → `overflow_category_id`), OFF logs a
  -- single row at the full amount. Stored EUR-denominated regardless of the
  -- expense's input currency. Cross-row guards ("overflow target must be an
  -- allowance in the same household") are not CHECK-able and currently
  -- enforced only by the seed; admin UI is deferred.
  cap_amount DECIMAL(12, 2),
  overflow_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_cap_both_or_neither CHECK (
    (cap_amount IS NULL AND overflow_category_id IS NULL)
    OR (cap_amount IS NOT NULL AND overflow_category_id IS NOT NULL AND cap_amount > 0)
  ),
  CONSTRAINT categories_no_self_overflow CHECK (
    overflow_category_id IS NULL OR overflow_category_id <> id
  )
);

CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_categories_household_active ON categories(household_id, is_active) WHERE is_active = TRUE;

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
  logged_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  is_cash BOOLEAN NOT NULL DEFAULT FALSE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(currency) = 3),
  converted_amount DECIMAL(12, 2) NOT NULL CHECK (converted_amount <> 0),
  converted_currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(converted_currency) = 3),
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date DESC);
CREATE INDEX idx_expenses_logged_by ON expenses(logged_by_user_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
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
  currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
  rate_date DATE NOT NULL,
  rate_to_eur DECIMAL(12, 6) NOT NULL CHECK (rate_to_eur > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (currency, rate_date)
);

CREATE INDEX idx_exchange_rates_currency_date ON exchange_rates(currency, rate_date DESC);

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
  budget_month DATE NOT NULL,
  allocated_amount DECIMAL(12, 2) NOT NULL CHECK (allocated_amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(currency) = 3),
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
  budget_month DATE NOT NULL,
  target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(currency) = 3),
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
