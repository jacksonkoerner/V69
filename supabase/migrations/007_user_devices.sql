-- Sprint 13: Multi-device support
-- Create user_devices table to track multiple devices per user
-- Replaces the single device_id on user_profiles as the authoritative device list

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_info JSONB,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

-- Enable Realtime on key tables for multi-device sync
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
ALTER PUBLICATION supabase_realtime ADD TABLE report_data;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
