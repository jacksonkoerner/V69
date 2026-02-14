-- Migration 003: Create report_data table for cross-platform report data sync
-- Stores AI-generated content, original input, and user edits (replaces localStorage-only fvp_report_{id})
-- Executed against project ref: bdqfpemylkqnmeqaoere (Sprint 4)

CREATE TABLE IF NOT EXISTS report_data (
  report_id UUID PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  ai_generated JSONB,
  original_input JSONB,
  user_edits JSONB DEFAULT '{}'::jsonb,
  capture_mode TEXT,
  status TEXT DEFAULT 'refined',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policy defined but DISABLED to match existing pattern
-- (report_backup, interview_backup, reports all have RLS disabled)
ALTER TABLE report_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own report data" ON report_data FOR ALL
  USING (report_id IN (SELECT id FROM reports WHERE user_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())));

-- Disable RLS to match existing tables — re-enable when all tables migrate to proper RLS
ALTER TABLE report_data DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_report_data_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_data_updated_at BEFORE UPDATE ON report_data
  FOR EACH ROW EXECUTE FUNCTION update_report_data_timestamp();
