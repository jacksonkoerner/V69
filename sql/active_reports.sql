-- FieldVoice Pro: Active Reports Lock Table
-- Run this SQL in Supabase to create the active_reports table

-- Create the active_reports table for tracking which device is editing which report
CREATE TABLE IF NOT EXISTS active_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    device_id TEXT NOT NULL,
    inspector_name TEXT,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Only one active session per project/date combination
    UNIQUE(project_id, report_date)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_active_reports_project_date
    ON active_reports(project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_active_reports_device
    ON active_reports(device_id);
CREATE INDEX IF NOT EXISTS idx_active_reports_heartbeat
    ON active_reports(last_heartbeat);

-- Enable Row Level Security
ALTER TABLE active_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active reports (to see who has a lock)
CREATE POLICY "Allow read access to active_reports" ON active_reports
    FOR SELECT USING (true);

-- Policy: Anyone can insert/update/delete (simple lock mechanism)
CREATE POLICY "Allow write access to active_reports" ON active_reports
    FOR ALL USING (true);

-- Optional: Function to clean up stale locks (locks older than 30 minutes without heartbeat)
CREATE OR REPLACE FUNCTION cleanup_stale_locks()
RETURNS void AS $$
BEGIN
    DELETE FROM active_reports
    WHERE last_heartbeat < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- Optional: Scheduled job to clean up stale locks (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-stale-locks', '*/15 * * * *', 'SELECT cleanup_stale_locks()');

COMMENT ON TABLE active_reports IS 'Tracks which device is actively editing a report to prevent conflicts';
COMMENT ON COLUMN active_reports.device_id IS 'Unique device identifier from localStorage';
COMMENT ON COLUMN active_reports.locked_at IS 'When the lock was first acquired';
COMMENT ON COLUMN active_reports.last_heartbeat IS 'Last time this device updated the lock (for stale detection)';
