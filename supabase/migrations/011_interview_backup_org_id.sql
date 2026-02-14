-- Sprint 14: Fix interview_backup RLS
--
-- Problem: RLS was enabled on interview_backup with org-based policies,
-- but the table had no org_id column. All autosave backups got 403 errors.
--
-- Fix (Belt + Suspenders — both Option A and B):
-- A) Simplified policy uses org_id directly (no JOIN needed)
-- B) Added org_id column for direct org scoping
--
-- The old per-operation policies ({public} role) conflicted with
-- authenticated-only policies. Replaced with single FOR ALL policy.

-- Step 1: Add org_id column
ALTER TABLE interview_backup ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Step 2: Backfill from reports table
UPDATE interview_backup ib
SET org_id = r.org_id
FROM reports r
WHERE ib.report_id = r.id AND ib.org_id IS NULL;

-- Step 3: Drop old conflicting policies
DROP POLICY IF EXISTS "Users can delete interview_backup for their org's reports" ON interview_backup;
DROP POLICY IF EXISTS "Users can insert interview_backup for their org's reports" ON interview_backup;
DROP POLICY IF EXISTS "Users can update interview_backup for their org's reports" ON interview_backup;
DROP POLICY IF EXISTS "Users can view interview_backup for their org's reports" ON interview_backup;
DROP POLICY IF EXISTS "Users can insert interview_backup for their org" ON interview_backup;
DROP POLICY IF EXISTS "Users can update interview_backup for their org" ON interview_backup;

-- Step 4: Single comprehensive policy for authenticated users
CREATE POLICY "Org members can manage interview_backup"
  ON interview_backup FOR ALL TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
