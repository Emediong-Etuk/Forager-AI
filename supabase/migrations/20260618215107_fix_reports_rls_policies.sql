-- Drop the insecure policies
DROP POLICY IF EXISTS "select_all_reports" ON reports;
DROP POLICY IF EXISTS "insert_reports" ON reports;

-- Create secure policies
-- Allow anyone to read reports (public research data)
CREATE POLICY "select_reports" ON reports FOR SELECT
  TO authenticated, anon USING (true);

-- Only authenticated users can insert, and they can only insert their own reports
CREATE POLICY "insert_own_reports" ON reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own reports
CREATE POLICY "update_own_reports" ON reports FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reports
CREATE POLICY "delete_own_reports" ON reports FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
