-- Migration: Add toggle states and safety flag to reports
-- Date: 2026-01-29
-- Purpose: Store report-level flags that were missing from sync

-- Toggle states for section completion
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS toggle_states JSONB DEFAULT '{}';

-- Safety incident flag
ALTER TABLE reports
ADD COLUMN IF NOT EXISTS safety_no_incidents BOOLEAN;
