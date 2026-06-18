CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name TEXT NOT NULL,
  report_content TEXT NOT NULL,
  search_context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID,
  report_key TEXT UNIQUE NOT NULL
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_reports" ON reports FOR SELECT
  TO authenticated, anon USING (true);

CREATE POLICY "insert_reports" ON reports FOR INSERT
  TO authenticated, anon WITH CHECK (true);

CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_project_name ON reports(project_name);
CREATE INDEX idx_reports_report_key ON reports(report_key);