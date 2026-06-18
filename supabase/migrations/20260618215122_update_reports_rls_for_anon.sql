-- Drop the insert policy to replace with one that supports anon users
DROP POLICY IF EXISTS "insert_own_reports" ON reports;

-- Allow anonymous inserts (user_id null) and authenticated users (user_id matches)
CREATE POLICY "insert_reports" ON reports FOR INSERT
  TO authenticated, anon 
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Allow updates by owner or if user_id is null (for migration)
CREATE POLICY "update_reports" ON reports FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow deletes by owner or if user_id is null
CREATE POLICY "delete_reports" ON reports FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);
