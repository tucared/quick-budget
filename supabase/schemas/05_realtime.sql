-- Supabase Realtime publication + replica identity

ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE budget_allocations;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;

ALTER TABLE expenses REPLICA IDENTITY FULL;
ALTER TABLE budget_allocations REPLICA IDENTITY FULL;
ALTER TABLE categories REPLICA IDENTITY FULL;
