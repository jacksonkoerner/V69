-- Add RLS policies for report-pdfs storage bucket
-- Allow anonymous uploads to report-pdfs bucket
CREATE POLICY "Allow anon uploads to report-pdfs"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'report-pdfs');

-- Allow anonymous reads from report-pdfs bucket
CREATE POLICY "Allow anon reads from report-pdfs"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'report-pdfs');

-- Allow anonymous updates to report-pdfs bucket (for upsert operations)
CREATE POLICY "Allow anon updates to report-pdfs"
ON storage.objects
FOR UPDATE
TO anon
USING (bucket_id = 'report-pdfs')
WITH CHECK (bucket_id = 'report-pdfs');

-- Allow anonymous deletes from report-pdfs bucket
CREATE POLICY "Allow anon deletes from report-pdfs"
ON storage.objects
FOR DELETE
TO anon
USING (bucket_id = 'report-pdfs');
