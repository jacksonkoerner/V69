# Full Codebase Audit - Chunk 4 (Report Page)
Date: 2026-02-21
Scope: `js/report/main.js`, `js/report/data-loading.js`, `js/report/form-fields.js`, `js/report/autosave.js`, `js/report/ai-refine.js`, `js/report/original-notes.js`, `js/report/preview.js`, `js/report/pdf-generator.js`, `js/report/submit.js`, `js/report/delete-report.js`, `js/report/debug.js`

## `js/report/main.js`
### 1. PURPOSE
This file is the report page bootstrap and orchestration layer. It initializes state and data sources on `DOMContentLoaded`, populates UI tabs, wires save hardening handlers (`visibilitychange`, `pagehide`), and exposes top-level tab/submit helpers to `window`. It coordinates nearly all other `js/report/*` modules via shared `window.reportState`.

### 2. LOCALSTORAGE
- No direct `localStorage` reads/writes in this file.
- Indirect save paths called here:
  - `saveReportToLocalStorage()` at `js/report/main.js:196`, `js/report/main.js:218`
  - `flushReportBackup()` at `js/report/main.js:211`, `js/report/main.js:233`

### 3. INDEXEDDB
Via `window.dataStore` abstraction:
- DB init: `window.dataStore.init()` at `js/report/main.js:22-23`
- Report-data read: `window.dataStore.getReportData(...)` at `js/report/main.js:36-37`
- Report-metadata read: `window.dataStore.getReport(...)` at `js/report/main.js:47-48`
- Report-data write: `window.dataStore.saveReportData(...)` at `js/report/main.js:198-209`, `js/report/main.js:220-231`
- DB close: `window.dataStore.closeAll()` at `js/report/main.js:235-236`

### 4. SUPABASE
- No direct Supabase table/storage/auth API calls.
- Indirect cloud dependencies through:
  - `window.dataLayer.loadUserSettings()` at `js/report/main.js:26`
  - `window.dataLayer.loadProjectById(...)` at `js/report/main.js:65`

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Stale comment: "Load report data from localStorage" at `js/report/main.js:28` is no longer accurate (current path is IDB + Supabase fallback).
- Duplicate save payload construction in both hardening handlers at `js/report/main.js:198-209` and `js/report/main.js:220-231` (maintenance drift risk).
- Repeated URL param parsing in same init flow (`js/report/main.js:58-60`, `js/report/main.js:106-107`) could be centralized.

### 7. DEPENDENCIES
Depends on:
- `js/report/data-loading.js` (`loadReport`, `getReportDateStr`)
- `js/report/form-fields.js` (`populateAllFields`, `updateContractorActivity`, `saveTextFieldEdits`)
- `js/report/original-notes.js` (`populateOriginalNotes`)
- `js/report/ai-refine.js` (`checkPendingRefineStatus`)
- `js/report/autosave.js` (`setupAutoSave`, `saveReportToLocalStorage`, `flushReportBackup`)
- `js/report/preview.js` (`renderPreview`, `scalePreviewToFit`)
- `js/report/debug.js` (`initializeDebugPanel`)
- External globals: `window.dataStore`, `window.dataLayer`, `initRealtimeSync`, `initAllAutoExpandTextareas`

Depended on by:
- HTML/global handlers using `window.switchTab`, `window.goToFinalReview`, `window.confirmSubmit`, `window.hideSubmitModal`.

---

## `js/report/data-loading.js`
### 1. PURPOSE
This file defines shared report page state (`window.reportState`) and handles report hydration. It loads report data from IDB, reconciles freshness with Supabase `report_data`, optionally backfills from cloud photos, and returns a normalized report object. It also provides shared data helpers (`getValue`, `getTextFieldValue`, `setNestedValue`) used broadly by the report modules.

### 2. LOCALSTORAGE
- Write active report key: `setStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID, reportIdParam)` at `js/report/data-loading.js:197`.

### 3. INDEXEDDB
Via `window.dataStore` abstraction:
- Report-data read: `window.dataStore.getReportData(reportIdParam)` at `js/report/data-loading.js:58-59`
- Report-data write/cache-back: `window.dataStore.saveReportData(reportIdParam, reportData)` at `js/report/data-loading.js:146-148`, `js/report/data-loading.js:252-253`
- Report-metadata read: `window.dataStore.getReport(reportIdParam)` at `js/report/data-loading.js:178-179`

### 4. SUPABASE
- Table `report_data` read (freshness check): `supabaseClient.from('report_data').select('*')...maybeSingle()` at `js/report/data-loading.js:84-89`
- Table `reports` read (`report_date`): `supabaseClient.from('reports').select('report_date')...maybeSingle()` at `js/report/data-loading.js:135-139`

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Stale comment at `js/report/data-loading.js:246`: says "Cache back to localStorage" but code writes to IDB (`window.dataStore.saveReportData`).
- `saveReportSilent()` (`js/report/data-loading.js:408-416`) appears unused in this chunk (potential dead code path).
- Cloud freshness timeout hardcoded to 2s (`js/report/data-loading.js:79-82`), which can cause frequent fallback to stale IDB on slow networks.

### 7. DEPENDENCIES
Depends on:
- Storage helpers from `storage-keys.js` (`STORAGE_KEYS`, `setStorageItem`, `getLocalDateString`)
- `ui-utils.js` (`showToast`)
- Supabase global (`supabaseClient`)
- `window.dataStore`
- Photo helpers likely from another module: `resignPhotoUrls` (`js/report/data-loading.js:229-231`), `fetchCloudPhotos` (`js/report/data-loading.js:239-241`)
- `js/report/autosave.js` (`saveReportToSupabase` called by `saveReportSilent`)

Depended on by:
- All report modules via `window.reportState`.
- `js/report/main.js` (`loadReport`, `getReportDateStr`).
- `js/report/form-fields.js`, `js/report/preview.js`, `js/report/pdf-generator.js`, `js/report/autosave.js`, `js/report/submit.js` use shared helper functions/state.

---

## `js/report/form-fields.js`
### 1. PURPOSE
This file renders and manages editable form-tab UI: project overview fields, work summaries, personnel/equipment tables, and report photos. It merges display values from `userEdits`, AI output, and report baseline, then updates `RS.report`/`RS.userEdits` on user interaction. It also exposes core interaction handlers (no-work toggles, equipment-row add, photo load/error handlers) to global scope for inline HTML handlers.

### 2. LOCALSTORAGE
- No direct `localStorage` reads/writes.

### 3. INDEXEDDB
- No direct IndexedDB API calls.
- Indirect persistence via `scheduleSave()` calls that route into autosave/IDB path (e.g., `js/report/form-fields.js:431`, `js/report/form-fields.js:523`, `js/report/form-fields.js:680`, `js/report/form-fields.js:824`, `js/report/form-fields.js:946`, `js/report/form-fields.js:954`).

### 4. SUPABASE
- Storage bucket `report-photos`: signed URL regeneration in photo error path:
  - client resolution: `js/report/form-fields.js:997-999`
  - `client.storage.from('report-photos').createSignedUrl(storagePath, 3600)` at `js/report/form-fields.js:1006-1009`

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Logic bug (operator precedence) in equipment status derivation:
  - `status: aiItem.status || aiItem.hoursUsed ? aiItem.hoursUsed + ' hrs' : 'IDLE'` at `js/report/form-fields.js:742`
  - Because `?:` binds after `||`, a truthy `aiItem.status` can still return `aiItem.hoursUsed + ' hrs'`, producing wrong status text.
- Potential runtime null deref in `toggleNoWork()` if expected elements are missing (`workFields.classList...`, `card.classList...`) at `js/report/form-fields.js:409-415`.
- Unescaped `photo.url` directly inserted into HTML `img src` at `js/report/form-fields.js:900` (URL trust assumption).

### 7. DEPENDENCIES
Depends on:
- `window.reportState` from `js/report/data-loading.js`
- Shared helpers from `js/report/data-loading.js` (`getValue`, `getTextFieldValue`, `getReportDateStr`)
- `escapeHtml` and `initAllAutoExpandTextareas` (UI utilities)
- `scheduleSave` from `js/report/autosave.js`
- AI refine globals from `js/report/ai-refine.js` via inline button handlers
- Supabase global (`supabaseClient` or `window.supabaseClient`) for photo re-sign

Depended on by:
- `js/report/main.js` (`populateAllFields`, `updateContractorActivity`, `saveTextFieldEdits`)
- `js/report/preview.js` (`getContractorActivity`, `getCrewActivity`, `getContractorOperations`, `getEquipmentData`)
- `js/report/pdf-generator.js` (same helper getters)
- HTML inline handlers (`window.toggleNoWork`, `window.toggleCrewNoWork`, etc.).

---

## `js/report/autosave.js`
### 1. PURPOSE
This file manages report autosave behavior: field listeners, debounce scheduling, IDB persistence, and cloud dirty flush to Supabase `report_data`. It centralizes local persistence (`saveReportToLocalStorage`) and provides manual flush entrypoint (`saveNow`). It also includes a secondary Supabase report upsert function for report metadata.

### 2. LOCALSTORAGE
- Reads org key via direct localStorage:
  - `localStorage.getItem(STORAGE_KEYS.ORG_ID)` at `js/report/autosave.js:176`
  - `localStorage.getItem(STORAGE_KEYS.ORG_ID)` at `js/report/autosave.js:271`
- Reads user key via storage helper:
  - `getStorageItem(STORAGE_KEYS.USER_ID)` at `js/report/autosave.js:272`
- No direct writes.

### 3. INDEXEDDB
Via `window.dataStore` abstraction:
- Read report-data row: `window.dataStore.getReportData(...)` at `js/report/autosave.js:207`
- Write report-data row: `window.dataStore.saveReportData(...)` at `js/report/autosave.js:224`
- Write report-metadata row: `window.dataStore.saveReport(...)` at `js/report/autosave.js:225-233`

### 4. SUPABASE
- Table `report_data` upsert (autosave flush): `supabaseClient.from('report_data').upsert(...)` at `js/report/autosave.js:183-185`
- Table `reports` upsert (metadata save): `supabaseClient.from('reports').upsert(...)` at `js/report/autosave.js:280-282`

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Dead code candidate: `_deferredUpdates` and `_deferFieldUpdate()` are defined but never invoked (`js/report/autosave.js:16-32`).
- Dead path candidate: `saveReportToSupabase()` (`js/report/autosave.js:249-305`) appears unused in this chunk except via `saveReportSilent` (which is also unused).
- `showSaveIndicator()` assumes `#saveIndicator` exists and dereferences without guard (`js/report/autosave.js:308-312`), possible runtime error on markup drift.
- Stale terminology in comments: references to "localStorage"/"report_backup" despite current IDB + `report_data` behavior (`js/report/autosave.js:154`, `js/report/autosave.js:161`, `js/report/autosave.js:196`).

### 7. DEPENDENCIES
Depends on:
- `window.reportState` and helper `setNestedValue`, `getReportDateStr` from `js/report/data-loading.js`
- `calculateShiftDuration` from `js/report/form-fields.js`
- Supabase globals: `supabaseClient`, `supabaseRetry`
- Storage helpers/constants: `STORAGE_KEYS`, `getStorageItem`, `getDeviceId`
- `window.dataStore`, optional `window.fvpBroadcast`

Depended on by:
- `js/report/main.js` (`setupAutoSave`, `saveReportToLocalStorage`, `flushReportBackup`)
- `js/report/submit.js` (`saveReportToLocalStorage`)
- `js/report/data-loading.js` (`saveReportSilent` calls `saveReportToSupabase`)
- `js/report/form-fields.js` via `scheduleSave()` call path.

---

## `js/report/ai-refine.js`
### 1. PURPOSE
This file provides AI refinement actions for text fields and contractor narratives on the report page. It builds a context payload and calls a Supabase Edge Function to transform user text, then writes results back into the active form field. It also surfaces a retry path for `pending_refine` reports.

### 2. LOCALSTORAGE
- No localStorage reads/writes.

### 3. INDEXEDDB
- No IndexedDB operations.

### 4. SUPABASE
- Auth session/token retrieval: `supabaseClient.auth.getSession()` at `js/report/ai-refine.js:76`, `js/report/ai-refine.js:174`
- Supabase Edge Function endpoint definition: `SUPABASE_URL + '/functions/v1/refine-text'` at `js/report/ai-refine.js:10`
- Direct HTTP call to edge function: `fetch(EDGE_REFINE_TEXT_URL, ...)` at `js/report/ai-refine.js:85-93`, `js/report/ai-refine.js:183-191`

### 5. N8N/WEBHOOKS
- No n8n URLs or API keys.
- "Webhook" wording appears in thrown error strings (`js/report/ai-refine.js:98`, `js/report/ai-refine.js:196`) even though target is Supabase Edge Function.

### 6. ISSUES
- Terminology drift: error text says "Webhook failed" for an edge-function call (`js/report/ai-refine.js:98`, `js/report/ai-refine.js:196`).
- No centralized user-visible error/telemetry handling; failures mostly logged and reflected only in button state.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- Global Supabase config/client: `SUPABASE_URL`, `supabaseClient`
- DOM fields/buttons generated by `js/report/form-fields.js`

Depended on by:
- `js/report/main.js` (`checkPendingRefineStatus`)
- Form HTML inline handlers (`window.refineTextField`, `window.refineContractorNarrative`, `window.retryRefineProcessing`).

---

## `js/report/original-notes.js`
### 1. PURPOSE
This file renders the "Original Notes" tab from captured raw input (`originalInput`) and report metadata. It conditionally renders minimal/freeform vs guided layouts, including work entries, personnel, equipment, safety, weather, and photos. It is a read-only presentation layer for source notes.

### 2. LOCALSTORAGE
- No localStorage reads/writes.

### 3. INDEXEDDB
- No IndexedDB operations.

### 4. SUPABASE
- No direct Supabase calls.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- `photo.url` is inserted directly into HTML image `src` (`js/report/original-notes.js:286`) without URL sanitation.
- Heavy string-concatenated HTML rendering pattern across functions increases maintenance cost and test difficulty.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- `escapeHtml` utility

Depended on by:
- `js/report/main.js` (`populateOriginalNotes`).

---

## `js/report/preview.js`
### 1. PURPOSE
This file builds the live multi-page HTML preview of the report and scales it to the viewport. It reads current DOM values plus report state and renders overview, work, operations, equipment, narrative sections, and photo pages. It is the pre-submit visual verification layer.

### 2. LOCALSTORAGE
- No localStorage reads/writes.

### 3. INDEXEDDB
- No direct IndexedDB operations.

### 4. SUPABASE
- No direct Supabase calls.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Duplicate logic with `js/report/pdf-generator.js` (date/time formatting, shift calc, contractor helpers, equipment note formatting), increasing drift risk.
- Potential dead vars: `o` and `ai` are assigned but never used (`js/report/preview.js:19-20`).
- Crew "no work" behavior may be misinterpreted: `crewIsNoWork = !crewNarrative.trim()` ignores explicit crew no-work flag (`js/report/preview.js:265`).
- Unescaped `photo.url` rendered directly into `img src` (`js/report/preview.js:422`).

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- Helpers from other files: `getValue`, `getContractorActivity`, `getCrewActivity`, `getContractorOperations`, `getEquipmentData`, `escapeHtml`

Depended on by:
- `js/report/main.js` (`renderPreview`, `scalePreviewToFit`)
- Global `window.renderPreview` use.

---

## `js/report/pdf-generator.js`
### 1. PURPOSE
This file generates the final vector PDF using jsPDF from live report data and form state. It draws report sections directly (tables, text blocks, safety panel, photo pages), handles pagination, and returns `{blob, filename}`. It also includes image-loading logic for logo/photo embedding.

### 2. LOCALSTORAGE
- No localStorage reads/writes.

### 3. INDEXEDDB
- No direct IndexedDB operations.

### 4. SUPABASE
- No direct Supabase table/storage/auth calls in this file.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Significant duplication with `js/report/preview.js` helper logic (formatting + contractor/equipment rendering rules), high drift risk.
- Potential dead variable: `weather` assigned but unused (`js/report/pdf-generator.js:326`).
- Crew no-work logic similarly infers from empty narrative (`js/report/pdf-generator.js:480`), not explicit no-work flag.
- Sequential `await` image loads inside photo loops (`js/report/pdf-generator.js:684`) can make large photo reports slow.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- `jsPDF` global (`jspdf.jsPDF`/`jsPDF`)
- Helpers from `js/report/form-fields.js`: `getContractorActivity`, `getCrewActivity`, `getContractorOperations`, `getEquipmentData`
- Helpers from `js/report/data-loading.js`: `getReportDateStr`, `getLocalDateString`

Depended on by:
- `js/report/submit.js` (`generateVectorPDF`).

---

## `js/report/submit.js`
### 1. PURPOSE
This file orchestrates report submission: duplicate detection, PDF generation, upload to Supabase Storage, report-row updates, and local cleanup. It provides submission status/error UI and global submit handler binding. It is the finalization path that transitions reports to `submitted`.

### 2. LOCALSTORAGE
- Read org key via direct localStorage:
  - `localStorage.getItem(STORAGE_KEYS.ORG_ID)` at `js/report/submit.js:142`
- Read user key via helper:
  - `getStorageItem(STORAGE_KEYS.USER_ID)` at `js/report/submit.js:144`
- No direct writes.

### 3. INDEXEDDB
Via `window.dataStore` abstraction:
- Report-data read: `window.dataStore.getReportData(...)` at `js/report/submit.js:134-135`
- Report-metadata read/write: `window.dataStore.getReport(...)` + `window.dataStore.saveReport(...)` at `js/report/submit.js:208-209`, `js/report/submit.js:218`, `js/report/submit.js:232-233`, `js/report/submit.js:238`
- Report-data delete: `window.dataStore.deleteReportData(...)` at `js/report/submit.js:226-227`
- Photos delete: `window.dataStore.deletePhotosByReportId(...)` at `js/report/submit.js:242-244`

### 4. SUPABASE
- Table `reports` duplicate check select: `js/report/submit.js:38-45`
- Storage bucket `report-pdfs` upload: `supabaseClient.storage.from('report-pdfs').upload(...)` at `js/report/submit.js:108-114`
- Storage bucket `report-pdfs` signed URL creation: `createSignedUrl(...)` at `js/report/submit.js:119-123`
- Table `reports` upsert ensure row: `js/report/submit.js:152-154`
- Table `reports` update submitted metadata: `js/report/submit.js:179-182`
- Table `reports` update status: `js/report/submit.js:192-199`

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Stale header comment references removed function `saveToFinalReports` (`js/report/submit.js:6`, current function is `saveSubmittedReportData`).
- Redundant writes to `submitted_at` in both `saveSubmittedReportData()` and `updateReportStatus()` (`js/report/submit.js:171`, `js/report/submit.js:196`).
- No transactional rollback strategy: if PDF upload succeeds but report update fails, storage object can be orphaned.
- `cleanupLocalStorage()` name is misleading: it cleans IDB and photo cache, not browser `localStorage`.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- `js/report/autosave.js` (`saveReportToLocalStorage`)
- `js/report/pdf-generator.js` (`generateVectorPDF`)
- `js/report/data-loading.js` (`getReportDateStr`)
- Supabase global (`supabaseClient`), storage helpers (`STORAGE_KEYS`, `getStorageItem`, `getDeviceId`), UI helper `escapeHtml`
- `window.dataStore`

Depended on by:
- HTML/global handler via `window.handleSubmit`.

---

## `js/report/delete-report.js`
### 1. PURPOSE
This file handles delete-report modal UI and invokes the full report deletion routine. It gates deletion on `RS.currentReportId`, awaits `deleteReportFull()`, and redirects to home on success. It exposes modal actions for HTML handlers.

### 2. LOCALSTORAGE
- No localStorage reads/writes in this file.

### 3. INDEXEDDB
- No direct IndexedDB calls.
- Indirect cleanup happens through `deleteReportFull(...)` at `js/report/delete-report.js:38` (implementation outside this file).

### 4. SUPABASE
- No direct Supabase calls.
- Indirect cloud delete/soft-delete expected inside `deleteReportFull(...)`.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- No `try/catch` around `await deleteReportFull(...)` (`js/report/delete-report.js:38`), so thrown exceptions can bypass UX error handling.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- External delete pipeline `deleteReportFull` (likely from delete utilities module)
- Optional `showToast`

Depended on by:
- HTML/global handlers using `window.confirmDeleteReport`, `window.hideDeleteModal`, `window.executeDeleteReport`.

---

## `js/report/debug.js`
### 1. PURPOSE
This file provides a report-page debug panel and data export utilities (JSON/Markdown). It inspects AI payload shape vs expected schema, surfaces mapping/type/empty/contractor mismatches, and shows structured state snapshots. It also manages panel/section toggle behavior and issue banner UI.

### 2. LOCALSTORAGE
- No localStorage reads/writes.

### 3. INDEXEDDB
- No IndexedDB operations.

### 4. SUPABASE
- No direct Supabase calls.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Debug schema expectations appear stale relative to current AI field naming used elsewhere:
  - expects keys like `generalIssues`, `qaqcNotes`, `visitorsRemarks` (`js/report/debug.js:32-35`)
  - other files consume newer names (`issues_delays`, `qaqc_notes`, `visitors_deliveries`, `safety.summary`) in `js/report/form-fields.js:117-124`
  - likely false-positive debug issues.
- Safety expected keys in debug (`hasIncident`, `noIncidents`) at `js/report/debug.js:66` do not align with alternate keys handled elsewhere (e.g., `has_incidents`) causing additional false positives.
- `initializeDebugPanel()` assumes all debug DOM nodes exist and dereferences without null guards (`js/report/debug.js:212`, `js/report/debug.js:220`, `js/report/debug.js:228`, `js/report/debug.js:236`, `js/report/debug.js:249`).

### 7. DEPENDENCIES
Depends on:
- `window.reportState`
- `escapeHtml`
- Debug panel DOM elements

Depended on by:
- `js/report/main.js` (`initializeDebugPanel`)
- HTML/global handlers via `window.toggleDebugPanel`, `window.toggleDebugSection`, `window.scrollToDebugPanel`, `window.dismissDebugBanner`, `window.downloadDebugJSON`, `window.downloadDebugMarkdown`.

---

## CHUNK SUMMARY
### Key findings
- The report page has a clean high-level split by concern (load/init, form, autosave, preview/PDF, submit, debug), but there is meaningful duplication and drift between modules.
- Data persistence is hybrid: IDB (`window.dataStore`) is primary local cache, Supabase `report_data`/`reports` handles cloud sync and submission metadata.
- Supabase usage is concentrated in `data-loading.js`, `autosave.js`, `submit.js`, `ai-refine.js`, and a storage re-sign path in `form-fields.js`.

### Issues Ranked by Severity
#### CRITICAL
- Equipment status precedence bug can generate incorrect values in form display and downstream preview/PDF:
  - `js/report/form-fields.js:742`

#### WARNING
- Schema drift between debug validator and active AI field names, leading to false positives and reduced trust in diagnostics:
  - `js/report/debug.js:32-35`, `js/report/debug.js:66`
  - compared with `js/report/form-fields.js:117-124`
- Large duplicated rendering/formatting logic between preview and PDF modules (behavior divergence risk):
  - `js/report/preview.js` and `js/report/pdf-generator.js`
- Unused/dead autosave code paths (`_deferFieldUpdate`, likely `saveReportToSupabase` path), increasing maintenance overhead:
  - `js/report/autosave.js:16-32`, `js/report/autosave.js:249-305`
  - `js/report/data-loading.js:408-416`
- Unhandled exception path in delete flow (`deleteReportFull` call not wrapped):
  - `js/report/delete-report.js:38`

#### INFO
- Multiple stale comments/terminology (`localStorage` wording where IDB is used; deprecated function names in comments).
- Repeated localStorage access style inconsistencies (`localStorage.getItem` vs `getStorageItem` wrapper).
- Several direct URL injections into `img src` rely on trusted data model (acceptable internally but worth documenting).

### Cross-file concerns
- Duplicate helper logic across `preview.js`, `pdf-generator.js`, and `submit.js` (`formVal` and formatting functions) increases regression risk and should be centralized.
- Mixed data-contract expectations for AI payload fields (`debug.js` vs `form-fields.js`) indicate schema versioning drift.
- Save hardening payload duplication in `main.js` mirrors logic already present in autosave pathways, suggesting consolidation opportunity.
- Comment accuracy has degraded across modules, especially around legacy `localStorage`/`report_backup` terminology.
