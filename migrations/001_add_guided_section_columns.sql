-- Migration: Add missing columns to report_raw_capture for guided sections
-- Date: 2026-01-24
-- Purpose: Schema alignment for robust data flow refactor
--
-- IMPORTANT: Run this migration in Supabase SQL Editor before testing the refactored code

-- Add missing columns for guided sections
-- These columns support the guided mode interview data

ALTER TABLE report_raw_capture
ADD COLUMN IF NOT EXISTS site_conditions TEXT;

ALTER TABLE report_raw_capture
ADD COLUMN IF NOT EXISTS qaqc_notes TEXT;

ALTER TABLE report_raw_capture
ADD COLUMN IF NOT EXISTS communications TEXT;

ALTER TABLE report_raw_capture
ADD COLUMN IF NOT EXISTS visitors_remarks TEXT;

ALTER TABLE report_raw_capture
ADD COLUMN IF NOT EXISTS safety_has_incident BOOLEAN DEFAULT FALSE;

-- Add comment to document the columns
COMMENT ON COLUMN report_raw_capture.site_conditions IS 'Site conditions description from guided mode';
COMMENT ON COLUMN report_raw_capture.qaqc_notes IS 'QA/QC notes from guided mode';
COMMENT ON COLUMN report_raw_capture.communications IS 'Contractor communications notes';
COMMENT ON COLUMN report_raw_capture.visitors_remarks IS 'Visitor remarks and observations';
COMMENT ON COLUMN report_raw_capture.safety_has_incident IS 'Flag indicating if safety incident occurred';

-- Verify the columns were added
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'report_raw_capture'
-- ORDER BY ordinal_position;
