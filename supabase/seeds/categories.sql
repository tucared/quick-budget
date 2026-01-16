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
