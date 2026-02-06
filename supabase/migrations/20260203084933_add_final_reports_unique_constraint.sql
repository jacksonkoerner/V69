-- Add unique constraint on report_id for upsert support
ALTER TABLE final_reports ADD CONSTRAINT final_reports_report_id_key UNIQUE (report_id);
