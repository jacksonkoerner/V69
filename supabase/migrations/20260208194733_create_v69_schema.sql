-- ============================================
-- FieldVoice-Pro-v69 — Full Schema
-- Project: bdqfpemylkqnmeqaoere
-- Created: 2026-02-08
-- Isolated sandbox project for v6.9 development
-- ============================================

-- 1. user_profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  title TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  device_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. projects
CREATE TABLE projects (
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
  logo_thumbnail TEXT,
  logo_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. contractors
CREATE TABLE contractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  company TEXT,
  abbreviation TEXT,
  type TEXT DEFAULT 'sub',
  trades TEXT,
  status TEXT DEFAULT 'active',
  added_date DATE,
  removed_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID,
  device_id TEXT,
  report_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  capture_mode TEXT DEFAULT 'guided',
  pdf_url TEXT,
  inspector_name TEXT,
  toggle_states JSONB DEFAULT '{}',
  safety_no_incidents BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

-- 5. report_submissions
CREATE TABLE report_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES user_profiles(id),
  report_id TEXT,
  report_date DATE NOT NULL,
  capture_mode TEXT NOT NULL,
  inspector_name TEXT,
  weather JSONB,
  original_input JSONB NOT NULL,
  ai_response JSONB NOT NULL,
  extraction_confidence TEXT,
  missing_data_flags TEXT[],
  executive_summary TEXT,
  work_performed TEXT,
  inspector_notes TEXT,
  issues_delays TEXT,
  qaqc_notes TEXT,
  communications TEXT,
  visitors_deliveries TEXT,
  safety_has_incidents BOOLEAN DEFAULT false,
  safety_summary TEXT,
  human_rating INTEGER,
  human_notes TEXT,
  used_for_training BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'refined',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ai_responses
CREATE TABLE ai_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id),
  raw_response JSONB,
  generated_content JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. final_reports
CREATE TABLE final_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID UNIQUE REFERENCES reports(id),
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
  has_contractor_personnel BOOLEAN DEFAULT false,
  has_equipment BOOLEAN DEFAULT false,
  has_issues BOOLEAN DEFAULT false,
  has_communications BOOLEAN DEFAULT false,
  has_qaqc BOOLEAN DEFAULT false,
  has_safety_incidents BOOLEAN DEFAULT false,
  has_visitors_deliveries BOOLEAN DEFAULT false,
  has_photos BOOLEAN DEFAULT false,
  contractors_display TEXT,
  contractors_json JSONB,
  equipment_display TEXT,
  equipment_json JSONB,
  personnel_display TEXT,
  personnel_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

-- 8. photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id),
  photo_url TEXT,
  storage_path TEXT,
  caption TEXT,
  photo_type TEXT,
  taken_at TIMESTAMPTZ,
  location_lat NUMERIC,
  location_lng NUMERIC,
  filename TEXT,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. report_activities
CREATE TABLE report_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES report_submissions(id),
  contractor_id UUID REFERENCES contractors(id),
  contractor_name TEXT NOT NULL,
  no_work BOOLEAN DEFAULT false,
  narrative TEXT,
  equipment_used TEXT,
  crew TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. report_operations
CREATE TABLE report_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES report_submissions(id),
  contractor_id UUID REFERENCES contractors(id),
  contractor_name TEXT NOT NULL,
  superintendents INTEGER DEFAULT 0,
  foremen INTEGER DEFAULT 0,
  operators INTEGER DEFAULT 0,
  laborers INTEGER DEFAULT 0,
  surveyors INTEGER DEFAULT 0,
  others INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. report_equipment
CREATE TABLE report_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES report_submissions(id),
  contractor_id UUID REFERENCES contractors(id),
  contractor_name TEXT,
  type TEXT NOT NULL,
  qty INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Storage Buckets
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('report-photos', 'report-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('project-logos', 'project-logos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('report-pdfs', 'report-pdfs', true);

-- Storage policies (allow anon CRUD)
CREATE POLICY "report photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'report-photos');
CREATE POLICY "report photos anon insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'report-photos');
CREATE POLICY "report photos anon update" ON storage.objects FOR UPDATE USING (bucket_id = 'report-photos');
CREATE POLICY "report photos anon delete" ON storage.objects FOR DELETE USING (bucket_id = 'report-photos');

CREATE POLICY "project logos public read" ON storage.objects FOR SELECT USING (bucket_id = 'project-logos');
CREATE POLICY "project logos anon insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-logos');
CREATE POLICY "project logos anon update" ON storage.objects FOR UPDATE USING (bucket_id = 'project-logos');
CREATE POLICY "project logos anon delete" ON storage.objects FOR DELETE USING (bucket_id = 'project-logos');

CREATE POLICY "report pdfs public read" ON storage.objects FOR SELECT USING (bucket_id = 'report-pdfs');
CREATE POLICY "report pdfs anon insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'report-pdfs');
CREATE POLICY "report pdfs anon update" ON storage.objects FOR UPDATE USING (bucket_id = 'report-pdfs');
CREATE POLICY "report pdfs anon delete" ON storage.objects FOR DELETE USING (bucket_id = 'report-pdfs');
