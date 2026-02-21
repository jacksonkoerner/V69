-- Migration 014: Private Storage Buckets + Org-Scoped RLS
-- Switches all 3 buckets from public (anon CRUD) to private (authenticated + org-scoped).
-- Signed URLs still work — they bypass RLS. This protects direct object access.

-- ============================================
-- Step 1: Drop old anon/public policies
-- ============================================

-- report-photos
DROP POLICY IF EXISTS "report photos public read" ON storage.objects;
DROP POLICY IF EXISTS "report photos anon insert" ON storage.objects;
DROP POLICY IF EXISTS "report photos anon update" ON storage.objects;
DROP POLICY IF EXISTS "report photos anon delete" ON storage.objects;

-- project-logos
DROP POLICY IF EXISTS "project logos public read" ON storage.objects;
DROP POLICY IF EXISTS "project logos anon insert" ON storage.objects;
DROP POLICY IF EXISTS "project logos anon update" ON storage.objects;
DROP POLICY IF EXISTS "project logos anon delete" ON storage.objects;

-- report-pdfs
DROP POLICY IF EXISTS "report pdfs public read" ON storage.objects;
DROP POLICY IF EXISTS "report pdfs anon insert" ON storage.objects;
DROP POLICY IF EXISTS "report pdfs anon update" ON storage.objects;
DROP POLICY IF EXISTS "report pdfs anon delete" ON storage.objects;

-- ============================================
-- Step 2: Make buckets private
-- ============================================

UPDATE storage.buckets SET public = false WHERE id = 'report-photos';
UPDATE storage.buckets SET public = false WHERE id = 'project-logos';
UPDATE storage.buckets SET public = false WHERE id = 'report-pdfs';

-- ============================================
-- Step 3: Create authenticated + org-scoped policies
-- ============================================

-- For report-photos: scope by report ownership via reports table
-- Path format: {reportId}/{photoId}_{filename}
-- Extract reportId from first path segment

CREATE POLICY "Authenticated users can read org report photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can upload org report photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-photos'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can update org report photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can delete org report photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'report-photos'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

-- For report-pdfs: scope by report ownership via reports table
-- Path format: {reportId}/{filename}.pdf

CREATE POLICY "Authenticated users can read org report pdfs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-pdfs'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can upload org report pdfs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-pdfs'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can update org report pdfs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'report-pdfs'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can delete org report pdfs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'report-pdfs'
    AND (split_part(name, '/', 1))::uuid IN (
      SELECT id FROM reports WHERE org_id = get_user_org_id()
    )
  );

-- For project-logos: scope by project ownership via projects table
-- Path format: {projectId}.{ext}

CREATE POLICY "Authenticated users can read org project logos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-logos'
    AND (split_part(name, '.', 1))::uuid IN (
      SELECT id FROM projects WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can upload org project logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-logos'
    AND (split_part(name, '.', 1))::uuid IN (
      SELECT id FROM projects WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can update org project logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-logos'
    AND (split_part(name, '.', 1))::uuid IN (
      SELECT id FROM projects WHERE org_id = get_user_org_id()
    )
  );

CREATE POLICY "Authenticated users can delete org project logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-logos'
    AND (split_part(name, '.', 1))::uuid IN (
      SELECT id FROM projects WHERE org_id = get_user_org_id()
    )
  );
