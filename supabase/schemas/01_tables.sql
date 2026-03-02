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

-- Get household_id without triggering RLS (SQL function — must be after users table)
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_household_id() TO authenticated;

-- ============================================================================
-- CATEGORIES
-- ============================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exclude_from_budget_total BOOLEAN NOT NULL DEFAULT FALSE,
  icon TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_categories_household_active ON categories(household_id, is_active) WHERE is_active = TRUE;

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_household ON expenses(household_id);
CREATE INDEX idx_expenses_household_date ON expenses(household_id, expense_date DESC);
CREATE INDEX idx_expenses_logged_by ON expenses(logged_by_user_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category_id);

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

CREATE INDEX idx_budget_allocations_household ON budget_allocations(household_id);
CREATE INDEX idx_budget_allocations_household_month ON budget_allocations(household_id, budget_month DESC);
CREATE INDEX idx_budget_allocations_category ON budget_allocations(category_id);

CREATE TRIGGER update_budget_allocations_updated_at BEFORE UPDATE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
