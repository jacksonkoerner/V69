# FieldVoice Pro — Changelog

All notable changes to FieldVoice Pro. Updated with each deploy.

---

## v6.9.38 — 2026-02-21

### 🔒 n8n Webhook Security (Sprint 15 — SEC)
Audit and lockdown of all 4 n8n webhook endpoints. Previously all webhooks were wide open (auth=none on n8n side, weak static key in client JS).

#### Webhook Security Audit
- **Full audit of all 4 webhooks** — documented files, functions, payloads, responses, timeouts, and error handling for each
- **n8n-side audit** — confirmed all 4 workflow webhook nodes had `authentication: none` (X-API-Key header was sent by app but never validated by n8n)
- **Identified project-extractor had zero auth** — no X-API-Key header, no AbortController timeout
- **Audit reports:** `memory/webhook-security-audit.md`, `memory/n8n-webhook-audit.md`, `memory/frontend-webhook-audit.md`

#### Header Auth Implementation
- **n8n side:** All 4 webhook nodes updated to enforce Header Auth (`X-API-Key`) — unauthorized requests now return 403
- **config.js** — Replaced weak static key (`fvp-n8n-webhook-key-2026`) with strong 48-byte random key
- **document-import.js** — Added `X-API-Key` header to project-extractor fetch call (was completely missing)
- **document-import.js** — Added 60s AbortController timeout to project-extractor (had none)
- **All 4 webhooks tested** — wrong key → 403, correct key → 200 on all endpoints

#### Edge Function Exploration (Planning Only)
- Researched Supabase Edge Functions as proxy layer (JWT validation, file forwarding, timeout limits, secrets management)
- Evaluated 6 alternative approaches (Header Auth, Edge Functions, Cloudflare Workers, CF Zero Trust, DB triggers, direct AI calls)
- Architecture designed for future implementation: Browser → Edge Function (JWT) → n8n (server secret)
- Rollout plan: 4 sprints (refine-text → ai-chat → refine-report → project-extractor) + cleanup sprint

---

## v6.9.37 — 2026-02-20

### 🔒 Storage Bucket Privatization (Sprint 14)
Complete security overhaul of Supabase Storage — all 3 buckets switched from public (anon CRUD) to private with org-scoped RLS.

#### PDF Path Privatization (v6.9.34)
- **New `reports.pdf_path` column** — stores durable storage path (e.g., `{reportId}/{filename}.pdf`)
- **Migration 012** — adds column + backfills from existing `pdf_url` signed URLs
- **submit.js** — now persists both `pdf_path` (durable) and `pdf_url` (signed, 1h cache)
- **archives/main.js** — `viewPdf()` re-signs from `pdf_path` on click (5-min TTL); legacy fallback for old rows
- **delete-report.js** — uses `pdf_path` directly for storage deletion (no more URL string parsing)

#### Logo Path Privatization (v6.9.35)
- **New `projects.logo_path` column** — stores durable storage path (e.g., `{projectId}.png`)
- **Migration 013** — adds column + backfills from existing `logo_url` signed URLs
- **media-utils.js** — `uploadLogoToStorage()` returns `{signedUrl, storagePath}` instead of just URL
- **project-config/form.js** — stores `logoPath` on project alongside `logoUrl`; clears both on remove
- **supabase-utils.js** — maps `logo_path ↔ logoPath` in both converter directions
- **data-layer.js** — new `resignProjectLogo()` helper re-signs logos on every project load (both batch and single). Report headers, previews, and PDF generator always get fresh URLs.

#### Photo URL Hardening (v6.9.36)
- **cloud-photos.js** — new `resignPhotoUrls()` utility re-signs locally-cached photos from their durable `storagePath` (parallel, non-blocking via `Promise.allSettled`)
- **data-loading.js** — calls `resignPhotoUrls()` after loading photos from local cache, so all report tabs (form, original-notes, preview, PDF generator) get fresh signed URLs
- Photos already had `storage_path` as source of truth — this closes the stale-URL gap for locally-cached photos

#### Private Buckets + Org-Scoped RLS (v6.9.37)
- **Migration 014** — drops all 12 old anon CRUD policies, flips all 3 buckets to `public = false`, adds 12 new authenticated + org-scoped policies
- **report-photos** & **report-pdfs** — extract `reportId` from storage path → join `reports.org_id` → verify `get_user_org_id()`
- **project-logos** — extract `projectId` from filename → join `projects.org_id` → verify `get_user_org_id()`
- Old public URLs now return HTTP 400 — signed URLs are the only access method
- Only authenticated users in the same org can upload, modify, or delete storage objects

### Security Audit
- **Codex 5.3 storage privatization audit** — full lifecycle trace of all 3 buckets with file:line evidence → `docs/CODEX_STORAGE_PRIVATIZATION_AUDIT.md`

### RLS Auth Hardening (v6.9.33)
- **auth.js** — fixed race condition where pages could load before auth session resolves, causing RLS-protected queries to fail silently
- **Service worker cache bump** to clear stale cached JS

---

## v6.9.32 — 2026-02-20

### Crew Extraction & Report Editor
- **Crew sub-cards in report editor** — `renderWorkSummary()` now shows per-crew narrative textareas when a contractor has crews defined. Each crew gets its own no-work toggle and auto-saving textarea. Contractors without crews keep the existing flat card layout.
- **Crew-aware AI refine workflow** — Updated n8n "FieldVoice - Refine Report - v6.9" (`s2SuH3Xklenn04Mq`):
  - Both guided and freeform prompts now return `crewActivities[]` per contractor when crews exist
  - Guided prompt parses `work_<contractorId>_crew_<crewId>` entry keys into per-crew narratives
  - Freeform prompt attempts crew name-matching from raw notes against project crew definitions
  - Omits `crewActivities` entirely for contractors with no crews (backward-compatible)
- **maxTokens bumped to 8192** on both Claude nodes (was 4096) to handle larger reports
- **Crew mapping from PDF import** — `document-import.js` `populateFormWithExtractedData()` now maps extracted crews with proper `id`, `contractorId`, `name`, `status`, `sortOrder`. Handles both string arrays and object arrays from the Project Extractor.
- **n8n Project Extractor prompt updated** — Added rule #7 for crew extraction from Daily Work Summary, added `crews` array to contractor schema, removed broken Google Sheets logging node, set `maxTokens: 4096` on Analyze Document node (was truncating)

### Storage Audit
- Completed full 20-chunk storage audit of the entire codebase → `docs/STORAGE_AUDIT.md`
- Covers: Supabase schema + RLS, IndexedDB stores, localStorage keys, all JS modules' storage operations
- Includes ERDs, data flow diagrams, duplicate analysis, orphan detection, prioritized recommendations

### Repo Cleanup
- Removed stale `www/js/shared/sync-merge.js` (deleted from root but lingered in www/ and Xcode)

---

## v6.9.31 — 2026-02-18

### Cross-Device Sync Hardening
- **Fixed report page infinite reload loop** when opening a report on a different device than where it was created
- **Fixed interview cross-device sync** — always checks cloud freshness before loading local data
- **Fixed report load** — always checks cloud freshness (Option A pattern)
- **Prevented sync ping-pong loop** when two devices have the same report open
- **Never delete local-only reports during cloud sync** — protects unsubmitted work

### Dead Code Removal (3-batch cleanup)
- Batch 1: Archived old sync code, removed sync-merge.js, stripped realtime-sync
- Batch 2: Stripped sync from report autosave, interview persistence, and both main.js files
- Batch 3: Removed remaining dead code, bumped SW to v6.9.27

### Dashboard
- **Submitted report dismissal** — soft-hide with cross-device sync

### Auto-Save & Report Editing
- **Blur handlers** now use shared save path (local + cloud), added `saveNow()`, auto-switch tab on refined transition
- **Report cross-device sync** — update base hash after flush, expanded field map
- **Replace silent catches** with `console.warn` for debug visibility

### Photos
- **Photo pipeline fix** — preserve GPS/date/time in backups, fix accuracy, fix `_undefined` filename
- **Photo re-sign on demand**, desktop refresh button, promoted error log levels
- **Upsert photo metadata** to photos table on background upload
- **Render photos** in both guided and minimal mode on sync merge

### Infrastructure
- **Pull-to-refresh** on all main pages
- **Error log monitoring script** (`scripts/check-errors.sh`)
- **SW cache fix** — added missing files to STATIC_ASSETS (pull-to-refresh, broadcast, data-store, sync-merge, console-capture, cloud-photos, photo-measure, scan-viewer)

### Sync Engine
- **Merge engine hardening** — protected fields, tombstones, recursive item merge
- **Delete reliability** + sync hardening (8-point audit fixes)

---

## v6.9.22 and earlier

See git log for full history: `git log --oneline`
