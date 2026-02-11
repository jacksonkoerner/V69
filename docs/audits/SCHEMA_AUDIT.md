# Supabase Schema Audit — FieldVoice Pro v6.9

**Date:** 2026-02-09  
**Instance:** bdqfpemylkqnmeqaoere (FieldVoice-Pro-v69)  
**Performed by:** George (autonomous session)

## Summary

✅ All tables and storage buckets now match what the app code expects.

## Tables

### Pre-existing (10 tables)
| Table | Status | Used By |
|-------|--------|---------|
| `projects` | ✅ OK | data-layer.js, project-config.js, report.js |
| `reports` | ✅ OK | data-layer.js, report.js |
| `final_reports` | ✅ OK | report.js |
| `photos` | ✅ OK | data-layer.js (IndexedDB primary, Supabase sync) |
| `user_profiles` | ✅ OK | data-layer.js, report.js |
| `ai_responses` | ✅ OK | supabase-utils.js |
| `report_activities` | ✅ OK | Additional report data |
| `report_equipment` | ✅ OK | Additional report data |
| `report_operations` | ✅ OK | Additional report data |
| `report_submissions` | ✅ OK | Report submission pipeline |

### Created (4 tables — were missing)
| Table | Status | Used By | Notes |
|-------|--------|---------|-------|
| `report_entries` | ✅ Created | (unused — sync-manager.js removed) | Real-time entry backup, upsert by (report_id, local_id) |
| `report_raw_capture` | ✅ Created | report.js | Raw capture data (JSONB: entries, contractors, equipment) |
| `final_report_sections` | ✅ Created | data-layer.js | Submit flow: upsert by (report_id, section_key) |
| `contractors` | ✅ Created | project-config.js | Per-project contractor list (also stored as JSONB in projects.contractors) |

### Notes on Dual Contractor Storage
The app uses **two approaches** for contractor data:
1. **`projects.contractors` (JSONB column):** Used by data-layer.js and most of the app. Stores contractors + crews as a JSON blob.
2. **`contractors` (separate table):** Used by project-config.js for individual CRUD operations with foreign keys.

Both are maintained — project-config.js loads from the table, while other pages read from the JSONB column.

## Storage Buckets

| Bucket | Status | Used By |
|--------|--------|---------|
| `report-photos` | ✅ OK | Photo uploads during report capture |
| `project-logos` | ✅ OK | Project logo uploads in project-config.js |
| `report-pdfs` | ✅ OK | PDF generation in report.js |

## Column Compatibility

### `projects` table
All expected columns present: `id, user_id, project_name, noab_project_no, cno_solicitation_no, location, engineer, prime_contractor, notice_to_proceed, contract_duration, expected_completion, default_start_time, default_end_time, weather_days, logo, logo_thumbnail, logo_url, contractors (JSONB), status, created_at, updated_at`

### `reports` table
All expected columns present: `id, project_id, user_id, device_id, report_date, status, capture_mode, pdf_url, toggle_states (JSONB), safety_no_incidents, inspector_name, created_at, updated_at, submitted_at`

### `user_profiles` table
All expected columns present: `id, device_id, full_name, title, company, email, phone, created_at, updated_at`

## RLS Policies
All tables have RLS enabled with permissive "allow all" policies (appropriate for v6.9 sandbox/dev environment).

## Recommendations
1. For production, restrict RLS policies to user-specific access
2. Consider consolidating the dual contractor storage into one approach
3. ~~The `active_reports` table is referenced in one file but doesn't exist~~ — **RESOLVED**: `lock-manager.js` removed
