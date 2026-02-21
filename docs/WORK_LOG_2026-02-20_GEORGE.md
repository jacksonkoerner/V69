# Work Log — February 20, 2026
**Author:** George (AI Dev Partner)

---

## Storage Bucket Privatization (Sprint 14)

Complete security overhaul of all 3 Supabase Storage buckets — from public anonymous access to private org-scoped authentication.

### Sprint 1: PDF Path Privatization (v6.9.34)
- Created migration 012: added `reports.pdf_path` column
- Backfilled all existing submitted reports from their `pdf_url` signed URLs
- Updated `js/report/submit.js` — now persists both durable path and signed URL on submit
- Updated `js/archives/main.js` — `viewPdf()` generates a fresh signed URL on click (5-min TTL) instead of using stored expired URLs
- Updated `js/shared/delete-report.js` — deletes from storage using `pdf_path` directly instead of parsing URL strings

### Sprint 2: Logo Path Privatization (v6.9.35)
- Created migration 013: added `projects.logo_path` column
- Backfilled all existing projects from their `logo_url` signed URLs
- Updated `js/media-utils.js` — `uploadLogoToStorage()` returns `{signedUrl, storagePath}`
- Updated `js/project-config/form.js` — stores `logoPath` on project alongside `logoUrl`
- Updated `js/supabase-utils.js` — mapped `logo_path ↔ logoPath` in both converter directions
- Updated `js/data-layer.js` — added `resignProjectLogo()` helper that re-signs logos on every project load (batch and single)

### Sprint 3: Photo URL Hardening (v6.9.36)
- Updated `js/shared/cloud-photos.js` — added `resignPhotoUrls()` utility that re-signs locally-cached photos from their durable `storagePath` (parallel, non-blocking)
- Updated `js/report/data-loading.js` — calls `resignPhotoUrls()` after loading photos from local cache so all report tabs get fresh signed URLs
- Photos already had `storage_path` as source of truth — this closed the gap where locally-cached photos had stale URLs

### Sprint 4: Private Buckets + Org-Scoped RLS (v6.9.37)
- Created migration 014: dropped all 12 old anonymous CRUD policies, set all 3 buckets to `public = false`, added 12 new authenticated + org-scoped policies
- `report-photos` & `report-pdfs` — policies extract reportId from storage path → join `reports.org_id` → verify `get_user_org_id()`
- `project-logos` — policies extract projectId from filename → join `projects.org_id` → verify `get_user_org_id()`
- Verified: public URLs return HTTP 400, signed URL generation works

### Other
- Ran Codex 5.3 storage privatization audit → `docs/CODEX_STORAGE_PRIVATIZATION_AUDIT.md`
- Updated `CHANGELOG.md` with all Sprint 14 changes
- Cleaned up `HEARTBEAT.md` (removed completed storage audit task)

---

## Commits (5 total, all on main, all pushed)

| Hash | Description |
|------|-------------|
| `31d9414` | Sprint 14: PDF path privatization |
| `c73de99` | Sprint 14: Logo path privatization |
| `e556437` | Sprint 14: Photo URL hardening |
| `3a6b2bd` | Sprint 14: Private storage buckets + org-scoped RLS |
| `6bb59bb` | docs: update CHANGELOG.md with Sprint 14 |

---

## Files Changed

### Migrations
- `supabase/migrations/012_reports_pdf_path.sql`
- `supabase/migrations/013_projects_logo_path.sql`
- `supabase/migrations/014_private_storage_buckets.sql`

### JavaScript
- `js/report/submit.js`
- `js/archives/main.js`
- `js/shared/delete-report.js`
- `js/media-utils.js`
- `js/project-config/form.js`
- `js/supabase-utils.js`
- `js/data-layer.js`
- `js/shared/cloud-photos.js`
- `js/report/data-loading.js`

### Docs & Config
- `CHANGELOG.md`
- `docs/CODEX_STORAGE_PRIVATIZATION_AUDIT.md`
- `sw.js` (cache version bumps)
- `version.json`
