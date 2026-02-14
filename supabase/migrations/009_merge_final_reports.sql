-- Sprint 13: Merge final_reports columns into reports table
-- pdf_url, inspector_name, submitted_at now live on reports directly.
-- JS code no longer writes to or reads from final_reports.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS inspector_name TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Migrate existing data from final_reports into reports
UPDATE reports r SET
  pdf_url = fr.pdf_url,
  inspector_name = fr.inspector_name,
  submitted_at = fr.submitted_at
FROM final_reports fr WHERE r.id = fr.report_id;

-- DO NOT DROP TABLE final_reports; -- future migration
