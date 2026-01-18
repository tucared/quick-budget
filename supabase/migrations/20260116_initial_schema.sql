-- Quick Budget Initial Schema Migration
-- Created: 2026-01-16
-- Purpose: MVP schema for JTBD #17 (Frictionless Expense Logging)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Users can only read and update their own profile
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING ((SELECT auth.uid()) = id);

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

  -- Create default account for the user
  INSERT INTO public.accounts (household_id, owner_user_id, name, account_type, is_default, currency)
  VALUES (new_household_id, NEW.id, 'Primary Account', 'other', TRUE, 'USD');

  -- Seed default categories for the household
  INSERT INTO public.categories (household_id, name, category_type, icon, is_active) VALUES
    (new_household_id, 'Groceries', 'monthly', '🛒', TRUE),
    (new_household_id, 'Dining Out', 'monthly', '🍽️', TRUE),
    (new_household_id, 'Transportation', 'monthly', '🚗', TRUE),
    (new_household_id, 'Bills & Utilities', 'monthly', '💡', TRUE),
    (new_household_id, 'Shopping', 'monthly', '🛍️', TRUE),
    (new_household_id, 'Entertainment', 'monthly', '🎬', TRUE),
    (new_household_id, 'Healthcare', 'monthly', '⚕️', TRUE),
    (new_household_id, 'Personal Care', 'monthly', '💇', TRUE),
    (new_household_id, 'Education', 'monthly', '📚', TRUE),
    (new_household_id, 'Other', 'monthly', '📌', TRUE),
    (new_household_id, 'Emergency Fund', 'long_term', '🏦', TRUE),
    (new_household_id, 'Holiday Fund', 'long_term', '✈️', TRUE);

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
-- Spending categories (both monthly and long-term goals)
-- Categories are household-scoped to allow customization (e.g., "Max's Allowance")
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('monthly', 'long_term')),
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
-- ACCOUNTS TABLE
-- ============================================================================
-- Payment sources (credit cards, bank accounts, cash, etc.)
-- Accounts are household-scoped; all household members can access all accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('credit_card', 'debit_card', 'bank_account', 'cash', 'other')),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(currency) = 3),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Household members can access all household accounts
CREATE POLICY "Household members can view accounts" ON accounts
  FOR SELECT USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can insert accounts" ON accounts
  FOR INSERT WITH CHECK (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can update accounts" ON accounts
  FOR UPDATE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

CREATE POLICY "Household members can delete accounts" ON accounts
  FOR DELETE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Create indexes
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_accounts_household_active ON accounts(household_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);


-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
-- Individual expense transactions
-- Expenses are household-scoped via account relationship
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  logged_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,

  -- Amount in original currency
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(currency) = 3),

  -- Converted amount (for multi-currency support - MVP stores as 1:1)
  converted_amount DECIMAL(12, 2) NOT NULL CHECK (converted_amount > 0),
  converted_currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(converted_currency) = 3),
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

-- Household members can access expenses via account relationship
CREATE POLICY "Household members can view expenses" ON expenses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = expenses.account_id
      AND a.household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Household members can insert expenses" ON expenses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = expenses.account_id
      AND a.household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Household members can update expenses" ON expenses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = expenses.account_id
      AND a.household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Household members can delete expenses" ON expenses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = expenses.account_id
      AND a.household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
    )
  );

-- Create indexes for common queries
CREATE INDEX idx_expenses_logged_by ON expenses(logged_by_user_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_account ON expenses(account_id);

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
  allocated_amount DECIMAL(12, 2) NOT NULL CHECK (allocated_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(currency) = 3),
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
-- RECURRING_EXPENSES TABLE
-- ============================================================================
-- Recurring expenses (bills, subscriptions)
-- Household-scoped: shared recurring bills for partners
CREATE TABLE recurring_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (LENGTH(currency) = 3),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  next_due_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Household members can view recurring expenses
CREATE POLICY "Household members can view recurring expenses" ON recurring_expenses
  FOR SELECT USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can insert recurring expenses
CREATE POLICY "Household members can insert recurring expenses" ON recurring_expenses
  FOR INSERT WITH CHECK (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can update recurring expenses
CREATE POLICY "Household members can update recurring expenses" ON recurring_expenses
  FOR UPDATE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Household members can delete recurring expenses
CREATE POLICY "Household members can delete recurring expenses" ON recurring_expenses
  FOR DELETE USING (
    household_id = (SELECT household_id FROM users WHERE users.id = (SELECT auth.uid()))
  );

-- Create indexes
CREATE INDEX idx_recurring_expenses_household ON recurring_expenses(household_id);
CREATE INDEX idx_recurring_expenses_household_active ON recurring_expenses(household_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_recurring_expenses_next_due ON recurring_expenses(next_due_date) WHERE is_active = TRUE;
CREATE INDEX idx_recurring_expenses_category ON recurring_expenses(category_id);
CREATE INDEX idx_recurring_expenses_account ON recurring_expenses(account_id);

-- Add recurring_expense_id to expenses table to link generated expenses
ALTER TABLE expenses ADD COLUMN recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;
CREATE INDEX idx_expenses_recurring ON expenses(recurring_expense_id);

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

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budget_allocations_updated_at BEFORE UPDATE ON budget_allocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_expenses_updated_at BEFORE UPDATE ON recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
