-- FieldVoice Pro V6.5 - Complete Database Schema
-- Created: 2026-01-27

-- TABLE 1: projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  project_name TEXT NOT NULL,
  noab_project_no TEXT,
  cno_solicitation_no TEXT,
  location TEXT,
  engineer TEXT,
  prime_contractor TEXT,
  notice_to_proceed DATE,
  contract_duration INTEGER,
  expected_completion DATE,
  default_start_time TEXT,
  default_end_time TEXT,
  weather_days INTEGER,
  logo TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 2: contractors
CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  abbreviation TEXT,
  type TEXT DEFAULT 'sub',
  trades TEXT,
  status TEXT DEFAULT 'active',
  added_date DATE,
  removed_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 3: equipment
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 4: reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  device_id TEXT,
  report_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  capture_mode TEXT DEFAULT 'guided',
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

-- TABLE 5: report_entries
CREATE TABLE IF NOT EXISTS report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  local_id TEXT,
  section TEXT NOT NULL,
  content TEXT,
  entry_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- TABLE 6: report_raw_capture
CREATE TABLE IF NOT EXISTS report_raw_capture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  capture_mode TEXT DEFAULT 'guided',
  raw_data JSONB,
  weather JSONB,
  location JSONB,
  site_conditions TEXT,
  qaqc_notes TEXT,
  communications TEXT,
  visitors_remarks TEXT,
  safety_has_incident BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 7: ai_responses
CREATE TABLE IF NOT EXISTS ai_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  raw_response JSONB,
  generated_content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 8: final_reports
CREATE TABLE IF NOT EXISTS final_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  pdf_url TEXT,
  weather_high_temp NUMERIC,
  weather_low_temp NUMERIC,
  weather_precipitation TEXT,
  weather_general_condition TEXT,
  weather_job_site_condition TEXT,
  weather_adverse_conditions TEXT,
  executive_summary TEXT,
  work_performed TEXT,
  safety_observations TEXT,
  delays_issues TEXT,
  materials_used TEXT,
  qaqc_notes TEXT,
  communications_notes TEXT,
  visitors_deliveries_notes TEXT,
  inspector_notes TEXT,
  has_contractor_personnel BOOLEAN DEFAULT FALSE,
  has_equipment BOOLEAN DEFAULT FALSE,
  has_issues BOOLEAN DEFAULT FALSE,
  has_communications BOOLEAN DEFAULT FALSE,
  has_qaqc BOOLEAN DEFAULT FALSE,
  has_safety_incidents BOOLEAN DEFAULT FALSE,
  has_visitors_deliveries BOOLEAN DEFAULT FALSE,
  has_photos BOOLEAN DEFAULT FALSE,
  contractors_display TEXT,
  contractors_json JSONB,
  equipment_display TEXT,
  equipment_json JSONB,
  personnel_display TEXT,
  personnel_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

-- TABLE 9: photos
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  photo_url TEXT,
  storage_path TEXT,
  caption TEXT,
  photo_type TEXT,
  taken_at TIMESTAMPTZ,
  location_lat NUMERIC,
  location_lng NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contractors_project_id ON contractors(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_project_id ON equipment(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_project_id ON reports(project_id);
CREATE INDEX IF NOT EXISTS idx_reports_report_date ON reports(report_date);
CREATE INDEX IF NOT EXISTS idx_report_entries_report_id ON report_entries(report_id);
CREATE INDEX IF NOT EXISTS idx_photos_report_id ON photos(report_id);

-- Enable RLS on all tables (policies can be added later)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_raw_capture ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for anon access (for initial development)
-- These should be tightened for production with user-based policies

CREATE POLICY "Allow all access to projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to contractors" ON contractors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to equipment" ON equipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reports" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to report_entries" ON report_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to report_raw_capture" ON report_raw_capture FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ai_responses" ON ai_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to final_reports" ON final_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to photos" ON photos FOR ALL USING (true) WITH CHECK (true);

-- TABLE 10: user_profiles (Inspector/User settings)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  title TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);
