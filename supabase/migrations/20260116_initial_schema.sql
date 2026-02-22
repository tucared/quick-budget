-- Quick Budget Initial Schema Migration
-- Created: 2026-01-16
-- Purpose: MVP schema for JTBD #17 (Frictionless Expense Logging)

-- Suppress informational notices during migration
SET client_min_messages = warning;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restore normal message level
RESET client_min_messages;

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Extends Supabase auth.users with profile information
-- Note: household_id is added after households table is created below
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Automatically create user profile on signup
-- NOTE: This function references households table which is defined below
-- The function is created here but the trigger is created after households table exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- Create a household for this user
  INSERT INTO public.households (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Household')
  RETURNING id INTO new_household_id;

  -- Insert user profile with household_id
  INSERT INTO public.users (id, email, full_name, household_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    new_household_id
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- HOUSEHOLDS TABLE
-- ============================================================================
-- Represents a household that shares financial data
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (policy created after household_id is added to users)
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Now add household_id to users table (after households table exists)
ALTER TABLE users ADD COLUMN household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE;
CREATE INDEX idx_users_household ON users(household_id);

-- Create a SECURITY DEFINER function to get household_id without triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_household_id() TO authenticated;

-- Now create RLS policies for users (after household_id exists)
-- Users can view members of their household
CREATE POLICY "Users can view household members" ON users
  FOR SELECT USING (
    id = (SELECT auth.uid()) OR household_id = public.get_my_household_id()
  );

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = (SELECT auth.uid()));

-- Now create RLS policy for households (after household_id exists on users)
CREATE POLICY "Users can view own household" ON households
  FOR SELECT USING (
    id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Now create the trigger for handle_new_user (function was defined earlier)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================
-- Spending categories and personal allowances
-- Categories are household-scoped to allow customization (e.g., "Max's Allowance")
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exclude_from_budget_total BOOLEAN NOT NULL DEFAULT FALSE,
  icon TEXT, -- emoji or icon identifier
  color TEXT, -- hex color for UI
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Household members can view their household's categories
CREATE POLICY "Household members can view categories" ON categories
  FOR SELECT USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can insert categories
CREATE POLICY "Household members can insert categories" ON categories
  FOR INSERT WITH CHECK (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can update categories
CREATE POLICY "Household members can update categories" ON categories
  FOR UPDATE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can delete categories
CREATE POLICY "Household members can delete categories" ON categories
  FOR DELETE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Create indexes for active categories query
CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_categories_household_active ON categories(household_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
-- Individual expense transactions
-- Expenses are household-scoped via account relationship
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  logged_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  is_cash BOOLEAN NOT NULL DEFAULT FALSE,

  -- Amount in original currency (negative for credit/refund transactions)
  amount DECIMAL(12, 2) NOT NULL CHECK (amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(currency) = 3),

  -- Converted amount (for multi-currency support - MVP stores as 1:1)
  converted_amount DECIMAL(12, 2) NOT NULL CHECK (converted_amount <> 0),
  converted_currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(converted_currency) = 3),
  exchange_rate DECIMAL(12, 6) NOT NULL DEFAULT 1.0 CHECK (exchange_rate > 0),

  -- Transaction details
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  notes TEXT,

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Household members can access expenses via household_id
CREATE POLICY "Household members can view expenses" ON expenses
  FOR SELECT USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can insert expenses" ON expenses
  FOR INSERT WITH CHECK (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can update expenses" ON expenses
  FOR UPDATE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can delete expenses" ON expenses
  FOR DELETE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Create indexes for common queries
CREATE INDEX idx_expenses_household ON expenses(household_id);
CREATE INDEX idx_expenses_logged_by ON expenses(logged_by_user_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category_id);

-- ============================================================================
-- EXCHANGE_RATES TABLE
-- ============================================================================
-- Daily exchange rates for currency conversion
-- Not household-scoped: exchange rates are universal
CREATE TABLE exchange_rates (
  currency TEXT NOT NULL CHECK (LENGTH(currency) = 3),
  rate_date DATE NOT NULL,
  rate_to_eur DECIMAL(12, 6) NOT NULL CHECK (rate_to_eur > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (currency, rate_date)
);

-- Enable RLS
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view exchange rates (rates are public data)
CREATE POLICY "Authenticated users can view exchange rates" ON exchange_rates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only authenticated users can insert rates (for API route to cache rates)
CREATE POLICY "Authenticated users can insert exchange rates" ON exchange_rates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX idx_exchange_rates_currency_date ON exchange_rates(currency, rate_date DESC);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(rate_date DESC);

-- ============================================================================
-- BUDGET_ALLOCATIONS TABLE
-- ============================================================================
-- Monthly budget allocations for categories
-- Household-scoped: shared budget planning for partners
CREATE TABLE budget_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  budget_month DATE NOT NULL, -- First day of the month (e.g., 2026-01-01)
  -- Negative allowed for historical balancing entries (e.g. "Helper" category from old app)
  allocated_amount DECIMAL(12, 2) NOT NULL CHECK (allocated_amount <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (LENGTH(currency) = 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, category_id, budget_month)
);

-- Enable RLS
ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;

-- Household members can view budget allocations
CREATE POLICY "Household members can view budget allocations" ON budget_allocations
  FOR SELECT USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can insert budget allocations
CREATE POLICY "Household members can insert budget allocations" ON budget_allocations
  FOR INSERT WITH CHECK (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can update budget allocations
CREATE POLICY "Household members can update budget allocations" ON budget_allocations
  FOR UPDATE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can delete budget allocations
CREATE POLICY "Household members can delete budget allocations" ON budget_allocations
  FOR DELETE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Create indexes
CREATE INDEX idx_budget_allocations_household ON budget_allocations(household_id);
CREATE INDEX idx_budget_allocations_household_month ON budget_allocations(household_id, budget_month DESC);
CREATE INDEX idx_budget_allocations_category ON budget_allocations(category_id);

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================================================
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_households_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exchange_rates_updated_at BEFORE UPDATE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budget_allocations_updated_at BEFORE UPDATE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BUDGET_SUMMARY VIEW
-- ============================================================================
-- Efficient view for budget tracking combining allocations with actual spending
-- Used for JTBD #10: Check shared discretionary budget
CREATE OR REPLACE VIEW budget_summary AS
SELECT
  ba.id,
  ba.household_id,
  ba.budget_month,
  ba.category_id,
  c.name as category_name,
  c.icon as category_icon,
  c.color as category_color,
  c.exclude_from_budget_total,
  ba.allocated_amount,
  ba.currency,
  COALESCE(SUM(e.converted_amount), 0) as spent_amount,
  ba.allocated_amount - COALESCE(SUM(e.converted_amount), 0) as remaining_amount,
  CASE
    WHEN ba.allocated_amount > 0
    THEN (COALESCE(SUM(e.converted_amount), 0) / ba.allocated_amount) * 100
    ELSE 0
  END as percent_spent
FROM budget_allocations ba
JOIN categories c ON c.id = ba.category_id
LEFT JOIN expenses e ON
  e.category_id = ba.category_id
  AND DATE_TRUNC('month', e.expense_date::date) = ba.budget_month
GROUP BY
  ba.id,
  ba.household_id,
  ba.budget_month,
  ba.category_id,
  c.name,
  c.icon,
  c.color,
  c.exclude_from_budget_total,
  ba.allocated_amount,
  ba.currency;

-- Views don't support RLS directly, but security_invoker ensures
-- RLS policies from underlying tables (budget_allocations, categories, expenses) are applied
ALTER VIEW budget_summary SET (security_invoker = true);

-- ============================================================================
-- REALTIME PUBLICATION
-- ============================================================================
-- Enable Supabase Realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE budget_allocations;

-- Set REPLICA IDENTITY FULL so DELETE events include all columns (needed for household_id filter)
ALTER TABLE expenses REPLICA IDENTITY FULL;
ALTER TABLE budget_allocations REPLICA IDENTITY FULL;
