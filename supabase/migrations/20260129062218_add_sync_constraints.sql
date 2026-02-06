-- Migration: Add missing unique constraints for sync operations
-- Date: 2026-01-29
-- Purpose: Fix upsert failures in sync-manager.js

-- Fix report_entries upsert conflict (CRITICAL)
-- sync-manager.js uses onConflict: 'report_id,local_id' but no constraint exists
ALTER TABLE report_entries 
ADD CONSTRAINT report_entries_report_local_unique 
UNIQUE (report_id, local_id);

-- Fix report_raw_capture upsert conflict (HIGH)
-- Prevents duplicate raw captures per report
ALTER TABLE report_raw_capture 
ADD CONSTRAINT report_raw_capture_report_unique 
UNIQUE (report_id);
