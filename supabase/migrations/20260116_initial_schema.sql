-- Quick Budget Initial Schema Migration
-- Created: 2026-01-16
-- Purpose: MVP schema for JTBD #17 (Frictionless Expense Logging)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Extends Supabase auth.users with profile information
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
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================
-- Spending categories (both monthly and long-term goals)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('monthly', 'long_term')),
  icon TEXT, -- emoji or icon identifier
  color TEXT, -- hex color for UI
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (categories are global, read-only for all users)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are viewable by all authenticated users" ON categories
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create index for active categories query
CREATE INDEX idx_categories_active ON categories(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- ACCOUNTS TABLE
-- ============================================================================
-- Payment sources (credit cards, bank accounts, cash, etc.)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Users can only access their own accounts
CREATE POLICY "Users can view own accounts" ON accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts" ON accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts" ON accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_accounts_user_active ON accounts(user_id, is_active) WHERE is_active = TRUE;

-- Automatically create default account for new users
CREATE OR REPLACE FUNCTION public.create_default_account()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (user_id, name, account_type, is_default, currency)
  VALUES (NEW.id, 'Primary Account', 'other', TRUE, 'USD');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_created_default_account
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_account();

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================
-- Individual expense transactions
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Users can only access their own expenses
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for common queries
CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_account ON expenses(account_id);

-- ============================================================================
-- SEED DATA: DEFAULT CATEGORIES
-- ============================================================================
-- Insert 10 default spending categories for all users
INSERT INTO categories (name, category_type, icon, color) VALUES
  ('Groceries', 'monthly', '🛒', '#22c55e'),
  ('Dining Out', 'monthly', '🍽️', '#f59e0b'),
  ('Transportation', 'monthly', '🚗', '#3b82f6'),
  ('Entertainment', 'monthly', '🎬', '#a855f7'),
  ('Shopping', 'monthly', '🛍️', '#ec4899'),
  ('Bills & Utilities', 'monthly', '💡', '#ef4444'),
  ('Healthcare', 'monthly', '⚕️', '#14b8a6'),
  ('Personal Care', 'monthly', '💇', '#8b5cf6'),
  ('Education', 'monthly', '📚', '#06b6d4'),
  ('Other', 'monthly', '📌', '#6b7280');

-- Add a couple of long-term goal categories as examples
INSERT INTO categories (name, category_type, icon, color) VALUES
  ('Holiday Fund', 'long_term', '✈️', '#f97316'),
  ('Emergency Fund', 'long_term', '🏦', '#10b981');

-- ============================================================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================================================
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
