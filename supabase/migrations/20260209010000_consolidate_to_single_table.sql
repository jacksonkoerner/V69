-- Consolidate contractors + crews into projects table as JSONB
-- This simplifies the schema: one table, one query, no joins needed

-- Drop FK constraints from report tables
ALTER TABLE report_activities DROP CONSTRAINT IF EXISTS report_activities_contractor_id_fkey;
ALTER TABLE report_operations DROP CONSTRAINT IF EXISTS report_operations_contractor_id_fkey;
ALTER TABLE report_equipment DROP CONSTRAINT IF EXISTS report_equipment_contractor_id_fkey;

-- Drop separate tables
DROP TABLE IF EXISTS crews CASCADE;
DROP TABLE IF EXISTS contractors CASCADE;

-- Add contractors JSONB column to projects
-- Column appears at the end (right side) of the table for readability
-- Clean columns first, blob last
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractors JSONB DEFAULT '[]';
