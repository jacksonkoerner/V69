-- Migration: Add missing columns to report_entries for complete backup
-- Date: 2026-01-29
-- Purpose: Enable full restore from Supabase backup

-- Timestamp when the note was actually taken (not when synced)
ALTER TABLE report_entries
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ;

-- Contractor ID for work entries (nullable - not all entries have contractors)
ALTER TABLE report_entries
ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL;

-- Note: updated_at already exists in table, skipping
