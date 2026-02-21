-- Migration 012: Add pdf_path column to reports table
-- Stores durable storage path for PDFs (e.g., "{reportId}/{filename}.pdf")
-- Replaces reliance on signed URLs in pdf_url which expire after 1 hour.
-- pdf_url is kept for backward compatibility during transition.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- Backfill pdf_path from existing pdf_url where possible
-- Extracts the storage path portion after '/report-pdfs/' from signed URLs
UPDATE reports
SET pdf_path = split_part(pdf_url, '/report-pdfs/', 2)
WHERE pdf_url IS NOT NULL
  AND pdf_path IS NULL
  AND pdf_url LIKE '%/report-pdfs/%';

-- Note: backfilled paths may contain query params from signed URLs.
-- A cleanup pass should strip everything after '?' if present:
UPDATE reports
SET pdf_path = split_part(pdf_path, '?', 1)
WHERE pdf_path IS NOT NULL
  AND pdf_path LIKE '%?%';
