-- Migration 013: Add logo_path column to projects table
-- Stores durable storage path for logos (e.g., "{projectId}.png")
-- Replaces reliance on signed URLs in logo_url which expire after 1 hour.
-- logo_url is kept for backward compatibility during transition.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS logo_path TEXT;

-- Backfill logo_path from existing logo_url where possible
-- Extract storage path from signed URLs: everything after '/project-logos/'
-- and before '?' (query params from signed token)
UPDATE projects
SET logo_path = split_part(split_part(logo_url, '/project-logos/', 2), '?', 1)
WHERE logo_url IS NOT NULL
  AND logo_path IS NULL
  AND logo_url LIKE '%/project-logos/%';
