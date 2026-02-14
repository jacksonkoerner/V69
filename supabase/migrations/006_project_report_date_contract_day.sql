-- Migration 006: Add report_date and contract_day_no columns to projects table
-- These fields exist in the project form but were not being saved to Supabase
-- Executed against project ref: bdqfpemylkqnmeqaoere (Sprint 10)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_day_no INTEGER;
