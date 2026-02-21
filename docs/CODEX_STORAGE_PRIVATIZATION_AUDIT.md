# Storage Bucket Privatization — Pre-Implementation Audit

Date: 2026-02-21
Scope: `report-photos`, `report-pdfs`, `project-logos`
Method: Read-only code/schema trace with file:line evidence.

## Executive Summary

- **Logos (`project-logos`)**: Signed URL is generated on upload and persisted to `projects.logo_url`; no durable storage path is stored anywhere. Expiry risk is systemic for report/project logo rendering.
  - Evidence: `js/media-utils.js:145`, `js/media-utils.js:166`, `js/media-utils.js:174`, `js/supabase-utils.js:48`, `js/supabase-utils.js:92`
- **PDFs (`report-pdfs`)**: Signed URL is generated on submit and persisted to `reports.pdf_url`; archives opens that URL directly. No durable storage path column exists.
  - Evidence: `js/report/submit.js:105`, `js/report/submit.js:121`, `js/report/submit.js:169`, `js/archives/main.js:146`, `js/archives/main.js:251`
- **Photos (`report-photos`)**: Dual model already exists. Durable path is stored in `photos.storage_path` and in in-memory/IDB `photo.storagePath`; cloud rehydration re-signs from path. But many UI/report payload paths still cache signed URLs and can go stale.
  - Evidence: `js/interview/persistence.js:1177`, `js/shared/cloud-photos.js:35`, `js/shared/cloud-photos.js:42`, `js/interview/persistence.js:134`, `js/report/data-loading.js:224`

## 1. Logo URL Lifecycle (`project-logos`)

### a) Upload location and path format

- Upload happens in `uploadLogoToStorage(file, projectId)`.
- Path format is flat by project ID + extension: ``${projectId}.${ext}``.
- Existing logo files are deleted by trying known extensions (`png/jpg/jpeg/gif/svg`) for the same `projectId`.
- Evidence: `js/media-utils.js:132`, `js/media-utils.js:145`, `js/media-utils.js:148`, `js/media-utils.js:196`, `js/media-utils.js:197`

### b) Signed URL generation and returned value

- `createSignedUrl(filePath, 3600)` is called right after upload.
- Function returns `urlData.signedUrl` (not path).
- Evidence: `js/media-utils.js:165`, `js/media-utils.js:166`, `js/media-utils.js:174`

### c) Where URL is stored

- Project form assigns returned signed URL to `currentProject.logoUrl`.
- Save pipeline maps `logoUrl -> logo_url` and upserts to `projects` table.
- Evidence: `js/project-config/form.js:76`, `js/project-config/form.js:78`, `js/project-config/crud.js:145`, `js/supabase-utils.js:92`

### d) Every place reading `logoUrl` for display/use

- Project config preview image: `logoSrc = logoUrl || logoThumbnail || logo`.
  - `js/project-config/form.js:29`, `js/project-config/form.js:31`
- Report form header logo image.
  - `js/report/form-fields.js:23`, `js/report/form-fields.js:25`
- Report HTML preview logo.
  - `js/report/preview.js:159`, `js/report/preview.js:161`
- PDF generator preloads logo URL to embed in PDF.
  - `js/report/pdf-generator.js:85`, `js/report/pdf-generator.js:88`

### e) `projects` column(s) used

- Full logo reference: `projects.logo_url` <-> `project.logoUrl`.
- Local thumbnail: `projects.logo_thumbnail` <-> `project.logoThumbnail`.
- Legacy fallback: `projects.logo`.
- Evidence: `js/supabase-utils.js:47`, `js/supabase-utils.js:48`, `js/supabase-utils.js:50`, `js/supabase-utils.js:91`, `js/supabase-utils.js:92`, `docs/_ARCHIVE/supabase-migrations-old/20260208194733_create_v69_schema.sql:38`, `docs/_ARCHIVE/supabase-migrations-old/20260208194733_create_v69_schema.sql:39`

### f) Is storage path stored separately?

- **No**. No separate `logo_path` column/object property found.
- Current persisted full-logo field stores signed URL string in `logo_url`.
- Evidence: `js/supabase-utils.js:48`, `js/supabase-utils.js:92`, `js/media-utils.js:174`

## 2. PDF URL Lifecycle (`report-pdfs`)

### a) Upload location and path format

- Upload in `uploadPDFToStorage(pdf)`.
- Path format: ``${reportId}/${pdf.filename}``.
- `pdf.filename` is generated from project/date (safe chars) in PDF generator.
- Evidence: `js/report/submit.js:104`, `js/report/submit.js:105`, `js/report/submit.js:110`, `js/report/pdf-generator.js:728`, `js/report/pdf-generator.js:730`

### b) Signed URL generation

- `createSignedUrl(storagePath, 3600)` right after upload.
- Returned value is signed URL string.
- Evidence: `js/report/submit.js:120`, `js/report/submit.js:121`, `js/report/submit.js:125`

### c) Where URL is stored (`pdf_url`)

- `saveSubmittedReportData(pdfUrl)` updates `reports.pdf_url`.
- Evidence: `js/report/submit.js:162`, `js/report/submit.js:169`, `supabase/migrations/009_merge_final_reports.sql:5`

### d) Where app reads/displays `pdf_url`

- Archives query selects `pdf_url` from `reports`.
- Mapped into `allReports[].pdfUrl` and opened directly.
- Evidence: `js/archives/main.js:107`, `js/archives/main.js:114`, `js/archives/main.js:146`, `js/archives/main.js:241`, `js/archives/main.js:251`

### e) Is storage path stored separately?

- **No dedicated PDF path column**.
- Delete flow currently attempts to reconstruct path by splitting URL string at `'/report-pdfs/'`.
- Evidence: `js/shared/delete-report.js:66`, `js/shared/delete-report.js:69`, `js/shared/delete-report.js:82`

### f) `archives/main.js` behavior when opening PDFs

- `viewPdf(reportId)` finds `report.pdfUrl` and does `window.open(report.pdfUrl, '_blank')` directly.
- No re-sign operation at view time.
- Evidence: `js/archives/main.js:241`, `js/archives/main.js:245`, `js/archives/main.js:251`

## 3. Photo URL Lifecycle (`report-photos`)

### a) Upload path and naming convention

- Upload via `uploadPhotoToSupabase(file, photoId, sourceFileName)`.
- Path format: ``${reportId}/${photoId}_${originalFileName}``.
- Evidence: `js/interview/persistence.js:1105`, `js/interview/persistence.js:1112`, `js/interview/persistence.js:1116`

### b) Where signed URLs are generated

- After upload in `uploadPhotoToSupabase` via `createSignedUrl(fileName, 3600)`.
- Also in report UI error recovery (`handlePhotoError`) and cloud rehydration (`fetchCloudPhotos`, `fetchCloudPhotosBatch`).
- Evidence: `js/interview/persistence.js:1132`, `js/interview/persistence.js:1133`, `js/report/form-fields.js:1008`, `js/report/form-fields.js:1009`, `js/shared/cloud-photos.js:42`, `js/shared/cloud-photos.js:114`

### c) Where photo URLs are stored

- Supabase `photos` table stores both `storage_path` and `photo_url`.
  - `js/interview/persistence.js:1177`, `js/interview/persistence.js:1178`
  - `js/interview/photos.js:193`, `js/interview/photos.js:194`
- Interview draft/backup payload stores `photos[].storagePath` and `photos[].url`.
  - `js/interview/persistence.js:134`, `js/interview/persistence.js:136`, `js/interview/persistence.js:137`, `js/interview/persistence.js:756`, `js/interview/persistence.js:759`, `js/interview/persistence.js:760`
- IndexedDB `photos` object store stores `url` + `storagePath` (+ optional `base64`).
  - `js/interview/photos.js:327`, `js/interview/photos.js:331`, `js/interview/photos.js:332`
  - `js/shared/data-store.js:41`, `js/shared/data-store.js:452`, `js/shared/data-store.js:470`

### d) Where photos are displayed and whether re-sign occurs

- Interview guided/minimal photo grids render `img src=p.url` with fallback placeholder on error; no re-sign there.
  - `js/interview/guided-sections.js:312`, `js/interview/guided-sections.js:326`
  - `js/interview/freeform.js:332`, `js/interview/freeform.js:346`
- Report form tab renders `img src=photo.url` and has re-sign-on-error logic.
  - `js/report/form-fields.js:900`, `js/report/form-fields.js:905`, `js/report/form-fields.js:987`
- Report original notes tab renders `img src=photo.url`; no re-sign.
  - `js/report/original-notes.js:283`, `js/report/original-notes.js:286`
- Report preview tab renders `img src=photo.url`; no re-sign.
  - `js/report/preview.js:399`, `js/report/preview.js:422`
- PDF generator fetches `photo.url` to embed; no explicit re-sign fallback.
  - `js/report/pdf-generator.js:653`, `js/report/pdf-generator.js:682`, `js/report/pdf-generator.js:684`

### e) `form-fields.js` re-sign-on-error pattern (exact behavior)

- Trigger: `<img onerror="handlePhotoError(index)">`.
- Reads `RS.report.photos[index].storagePath`.
- Retries **once** only (uses `img.dataset.resignRetried === 'true'`).
- Calls `client.storage.from('report-photos').createSignedUrl(storagePath, 3600)`.
- If success: swaps `img.src` to fresh signed URL and returns.
- If fail or no path: shows static error block.
- Evidence: `js/report/form-fields.js:905`, `js/report/form-fields.js:987`, `js/report/form-fields.js:995`, `js/report/form-fields.js:996`, `js/report/form-fields.js:1003`, `js/report/form-fields.js:1008`, `js/report/form-fields.js:1012`, `js/report/form-fields.js:1024`

### f) `cloud-photos.js`: always re-sign or cache?

- Both single and batch functions **prefer `storage_path` and always call `createSignedUrl`** when path exists.
- Only falls back to stored `photo_url` when `storage_path` missing.
- No persistent cache inside module; returns fresh URL objects to caller.
- Batch implementation signs sequentially in a `for` loop (not parallel).
- Evidence: `js/shared/cloud-photos.js:35`, `js/shared/cloud-photos.js:39`, `js/shared/cloud-photos.js:42`, `js/shared/cloud-photos.js:45`, `js/shared/cloud-photos.js:108`, `js/shared/cloud-photos.js:111`, `js/shared/cloud-photos.js:114`, `js/shared/cloud-photos.js:117`, `js/shared/cloud-photos.js:104`

## 4. Migration Plan Analysis

## `project-logos`

- Current signed URL column: `projects.logo_url`.
  - `js/supabase-utils.js:48`, `js/supabase-utils.js:92`
- Existing durable path column: **none**.
- Simplest change recommendation: add `projects.logo_path` (new) and keep `logo_url` as optional backward-compat cache during transition.
  - Reason: current path extension is variable (`projectId.ext`), so deterministic reconstruction from ID alone is unreliable.
  - Path format source: `js/media-utils.js:145`
- Existing rows requiring migration: rows with `logo_url` holding signed URLs.
- Estimated files to change (minimum): **6**.
  - `js/media-utils.js` (return/store path instead of signed URL)
  - `js/project-config/form.js` (assign new path field)
  - `js/supabase-utils.js` (map new column)
  - `js/data-layer.js` (re-sign logos when loading projects)
  - `js/report/preview.js` and/or `js/report/pdf-generator.js` (ensure they consume fresh signed URL field)

## `report-pdfs`

- Current signed URL column: `reports.pdf_url`.
  - `js/report/submit.js:169`, `supabase/migrations/009_merge_final_reports.sql:5`
- Existing durable path column: **none**.
- Simplest change recommendation: add `reports.pdf_path` and stop persisting signed URL in `pdf_url`.
  - Keep `pdf_url` temporarily for backward compatibility/read fallback.
- Existing rows requiring migration: yes, existing submitted reports with signed URLs in `reports.pdf_url`.
- Estimated files to change (minimum): **3-4**.
  - `js/report/submit.js` (store path)
  - `js/archives/main.js` (re-sign on open)
  - `js/shared/delete-report.js` (delete by `pdf_path`, not URL split)
  - optional migration utility/read fallback location(s)

## `report-photos`

- Current signed URL column: `photos.photo_url` (also cached in draft/IDB payloads).
  - `js/interview/persistence.js:1178`, `js/interview/photos.js:194`
- Existing durable path storage: **already present** as `photos.storage_path` plus `photo.storagePath` in app state/IDB.
  - `js/interview/persistence.js:1177`, `docs/_ARCHIVE/supabase-migrations-old/20260208194733_create_v69_schema.sql:161`
- Simplest change recommendation: keep using `storage_path` as source of truth; treat `photo_url` as deprecated/optional.
- Existing rows requiring migration: low-risk; most already have `storage_path`. Only rows missing `storage_path` need remediation.
- Estimated files to change (minimum): **5-8** depending on strictness.
  - `js/interview/persistence.js` / `js/interview/photos.js` (stop persisting `photo_url`)
  - `js/report/data-loading.js` (if local `originalInput.photos` has stale URLs, re-sign from path)
  - `js/report/original-notes.js`, `js/report/preview.js`, `js/report/pdf-generator.js` (either re-sign before render or add error recovery)
  - `js/shared/cloud-photos.js` already aligned with path-first

## 5. Storage Policy Design (Private Buckets + Auth)

### a) Current path structures in code

- `project-logos`: flat file at root: ``{projectId}.{ext}``.
  - `js/media-utils.js:145`
- `report-pdfs`: report folder then filename: ``{reportId}/{filename}.pdf``.
  - `js/report/submit.js:105`
- `report-photos`: report folder then photo file: ``{reportId}/{photoId}_{filename}``.
  - `js/interview/persistence.js:1112`

Current paths are **not org-prefixed**.

### b) Proposed org-scoped storage policies

Given current names are not org-prefixed, enforce by joining object path prefix to app tables:

1. `report-photos`:
- Derive `report_id` from first path segment (`split_part(name, '/', 1)`).
- Allow access only when matching `photos.storage_path = storage.objects.name` and `photos.org_id = get_user_org_id()`.
- Fallback if `photos.org_id` unavailable: join `photos.report_id -> reports.org_id`.

2. `report-pdfs`:
- Derive `report_id` from first path segment.
- Allow access only when `reports.id = report_id` and `reports.org_id = get_user_org_id()`.

3. `project-logos`:
- If keeping `projectId.ext`, match by prefix `split_part(name, '.', 1) = projects.id::text` and `projects.org_id = get_user_org_id()`.
- Better long-term: migrate to org-prefixed path (`{orgId}/projects/{projectId}.{ext}`) to simplify policies.

Notes:
- `get_user_org_id()` is referenced in migration `011` but function definition is not present in this repo snapshot.
  - `supabase/migrations/011_interview_backup_org_id.sql:33`

### c) Offline implications

- Offline report/photo views currently depend on cached data in IndexedDB (`cachedArchives`, draft/photo stores).
  - `js/archives/main.js:312`, `js/shared/data-store.js:527`
- With private buckets, offline cannot fetch new signed URLs; app must rely on cached blobs/base64/local URLs or previously cached signed URL responses.
- Current SW caches successful GET responses for non-JS assets (including remote signed image/PDF URLs), which may mask expiry while cached.
  - `sw.js:225`, `sw.js:246`

### d) Signed URL expiry recommendation

- Current expiry everywhere: 3600 seconds.
  - `js/media-utils.js:166`, `js/report/submit.js:121`, `js/interview/persistence.js:1133`, `js/shared/cloud-photos.js:42`
- Suggested:
  - Interactive UI images: 1-4 hours acceptable if auto re-sign exists.
  - Archive PDF open links: 5-15 minutes generated just-in-time on click.
  - Keep short TTL for security; fix lifecycle by re-signing on demand rather than extending TTL globally.

## 6. Risk Assessment

### a) What breaks when switching to path-only

- Existing DB rows containing signed URLs in `projects.logo_url` and `reports.pdf_url` become invalid if treated as path.
- Consumers that directly use stored values as `img.src`/`window.open` will fail until fallback logic is added.
- Evidence: `js/project-config/form.js:29`, `js/report/form-fields.js:23`, `js/report/preview.js:159`, `js/archives/main.js:251`

### b) Backward-compatible transition strategy

- Safe parser pattern:
  - If value starts with `http://` or `https://`, treat as legacy URL.
  - Else treat as storage path and call `createSignedUrl` on demand.
- Can be applied per bucket while backfilling paths.
- Existing code already uses compatibility pattern for logos (multiple fields) and photo path-first logic.
  - `js/project-config/form.js:24`, `js/shared/cloud-photos.js:35`

### c) PDF generator + private logos risk

- PDF generator embeds logo by fetching `RS.activeProject.logoUrl` as image data.
- If `logoUrl` is stale/expired, logo embedding fails and fallback text is used.
- Private bucket itself is fine as long as generator receives a fresh signed URL before generation.
- Evidence: `js/report/pdf-generator.js:85`, `js/report/pdf-generator.js:88`, `js/report/pdf-generator.js:100`

### d) Service worker caching of storage URLs

- SW does not special-case Supabase storage URLs; non-JS GET responses are cache-first and cached on success.
- So signed URL responses may be cached by full URL key (including token), potentially surviving beyond token expiry while cache entry exists.
- This can create inconsistent behavior (works offline/from cache, fails after cache miss).
- Evidence: `sw.js:225`, `sw.js:231`, `sw.js:246`, `sw.js:355`, `sw.js:360`

## Concrete Recommendations (Implementation Order)

1. **PDF first (smallest blast radius)**
- Add `reports.pdf_path`, write path on submit, re-sign in archives `viewPdf`, keep URL fallback.

2. **Logo second**
- Add `projects.logo_path`, write path on upload, create a single project-load signer that hydrates transient `logoUrl` for UI/PDF.

3. **Photos hardening third**
- Stop writing `photo_url` except temporary fallback; always render from signed URLs derived from `storagePath`.
- Add centralized photo URL refresh for report/original-notes/preview/PDF render paths.

4. **Then flip buckets to private + apply storage RLS policies**
- Validate org isolation end-to-end before production cutover.

## Evidence Index (Key Files)

- Logos: `js/media-utils.js`, `js/project-config/form.js`, `js/supabase-utils.js`, `js/report/form-fields.js`, `js/report/preview.js`, `js/report/pdf-generator.js`
- PDFs: `js/report/submit.js`, `js/archives/main.js`, `js/shared/delete-report.js`, `supabase/migrations/009_merge_final_reports.sql`
- Photos: `js/interview/persistence.js`, `js/interview/photos.js`, `js/shared/cloud-photos.js`, `js/report/form-fields.js`, `js/report/data-loading.js`, `js/report/original-notes.js`, `js/report/preview.js`, `js/report/pdf-generator.js`
- Offline/SW: `js/shared/data-store.js`, `js/archives/main.js`, `sw.js`
- Schema baseline: `docs/_ARCHIVE/supabase-migrations-old/20260208194733_create_v69_schema.sql`
