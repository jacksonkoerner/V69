-- Migration 005: Add device_info JSONB column to user_profiles
-- Stores device metadata (userAgent, platform, screen dimensions) captured on login
-- Executed against project ref: bdqfpemylkqnmeqaoere (Sprint 10)

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS device_info JSONB;
