-- ============================================================================
-- PRODUCTION SEED: Default Categories
-- ============================================================================
-- This file contains default categories needed in production.
-- Run this manually in Supabase Studio SQL Editor for production deployment.
--
-- For local development, this runs automatically via `supabase db reset`.
-- ============================================================================

-- Insert default spending categories
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
  ('Other', 'monthly', '📌', '#6b7280')
ON CONFLICT DO NOTHING;

-- Insert default long-term goal categories
INSERT INTO categories (name, category_type, icon, color) VALUES
  ('Holiday Fund', 'long_term', '✈️', '#f97316'),
  ('Emergency Fund', 'long_term', '🏦', '#10b981')
ON CONFLICT DO NOTHING;
