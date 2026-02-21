# FieldVoice Pro — Changelog

All notable changes to FieldVoice Pro. Updated with each deploy.

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
