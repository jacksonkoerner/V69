-- Add FK constraint: reports.project_id → projects.id
-- Fixes Archives page PostgREST join: reports?select=...projects(project_name)
ALTER TABLE reports
  ADD CONSTRAINT fk_reports_project
  FOREIGN KEY (project_id) REFERENCES projects(id);

-- Reload PostgREST schema cache so the new FK is visible immediately
NOTIFY pgrst, 'reload schema';
