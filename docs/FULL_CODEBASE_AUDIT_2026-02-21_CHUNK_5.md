# Full Codebase Audit — Chunk 5 (Shared Modules)
Date: 2026-02-21
Scope: `js/shared/ai-assistant.js`, `js/shared/realtime-sync.js`, `js/shared/cloud-photos.js`, `js/shared/data-store.js`, `js/shared/broadcast.js`, `js/shared/console-capture.js`, `js/shared/delete-report.js`, `js/shared/pull-to-refresh.js`, `js/shared/supabase-retry.js`

## 1) `js/shared/ai-assistant.js`
### PURPOSE
This file injects a global floating AI assistant UI (button + full-screen chat overlay) and handles command parsing/navigation/tool launching from natural language prompts. It stores chat history locally per user and routes non-local commands to a Supabase Edge Function (`/functions/v1/ai-chat`) with JWT auth. It also includes lightweight input sanitization and basic context enrichment (page, project, GPS, device ID).

### LOCALSTORAGE
- Read `STORAGE_KEYS.AUTH_USER_ID` to namespace chat key: `js/shared/ai-assistant.js:12`
- Read `STORAGE_KEYS.DEVICE_ID` for AI payload context: `js/shared/ai-assistant.js:727`
- Read `STORAGE_KEYS.ACTIVE_PROJECT_ID` (fallback `fvp_active_project_id`) in project context helper: `js/shared/ai-assistant.js:769-773`
- Read dynamic conversation key (`STORAGE_KEY`) on load: `js/shared/ai-assistant.js:789`
- Write dynamic conversation key (`STORAGE_KEY`) on save: `js/shared/ai-assistant.js:800`
- Dynamic key shape:
  - Preferred: `aiConversationKey(userId)` output: `js/shared/ai-assistant.js:13-14`
  - Fallback: `fvp_ai_conversation_{userId}` or `fvp_ai_conversation`: `js/shared/ai-assistant.js:15`

### INDEXEDDB
- None directly.

### SUPABASE
- Edge Function endpoint URL: `SUPABASE_URL + '/functions/v1/ai-chat'`: `js/shared/ai-assistant.js:10`
- Auth session/JWT fetch: `supabaseClient.auth.getSession()`: `js/shared/ai-assistant.js:733`
- Auth token used as Bearer for Edge Function request: `js/shared/ai-assistant.js:747`
- Edge Function call via `fetch(...)`: `js/shared/ai-assistant.js:743`

### N8N/WEBHOOKS
- Webhook-like call is to Supabase Edge Function only (`/functions/v1/ai-chat`): `js/shared/ai-assistant.js:10`, `js/shared/ai-assistant.js:743`
- No n8n URL or API key hardcoded in this file.

### ISSUES
- Help text advertises messaging actions, but parser has no implementation for message send/check commands; those inputs fall through to AI webhook instead of local action (behavior mismatch): help text at `js/shared/ai-assistant.js:365-369`, no command handlers beyond tool/nav branches up to `js/shared/ai-assistant.js:690`.
- Very large monolithic command parser (`handleLocalCommand`) with many hardcoded synonyms/redirects; high maintenance cost and regression risk: `js/shared/ai-assistant.js:384-690`.
- Emoji responses in command returns may render inconsistently across contexts/UIs (low severity consistency issue): multiple lines in `js/shared/ai-assistant.js:449-688`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - `SUPABASE_URL`, `supabaseClient` (config/auth globals): `js/shared/ai-assistant.js:10`, `js/shared/ai-assistant.js:733`
  - `STORAGE_KEYS`, optional `aiConversationKey`, `getStorageItem`: `js/shared/ai-assistant.js:12-15`, `js/shared/ai-assistant.js:776-777`
  - `escapeHtml` from `ui-utils.js`: `js/shared/ai-assistant.js:259`, `js/shared/ai-assistant.js:805`
  - Optional tool/page globals (`openCompass`, `openCalc`, `openMapsOverlay`, etc.): `js/shared/ai-assistant.js:443-686`
  - Optional location helper `getCachedLocation`: `js/shared/ai-assistant.js:26`
- Depended on by:
  - Loaded by pages: `index.html`, `report.html`, `quick-interview.html`, `archives.html`, `projects.html`, `project-config.html`, `settings.html`, `permissions.html`
  - Exposes `window.openAIAssistant` / `window.closeAIAssistant`: `js/shared/ai-assistant.js:816-817`

---

## 2) `js/shared/realtime-sync.js`
### PURPOSE
This file manages Supabase Realtime subscriptions for `reports` and `projects` and reconciles incoming changes into local state. It updates local IDB via `window.dataStore`, updates dashboard caches/UI, and handles lifecycle events (online/offline/visibility/pageshow) to reinitialize or tear down channels. It also contains special handling for refined-report transitions while editing.

### LOCALSTORAGE
- Reads `STORAGE_KEYS.USER_ID` via `getStorageItem(...)` fallback to `localStorage.getItem(...)`: `js/shared/realtime-sync.js:23-25`
- Reads `STORAGE_KEYS.ORG_ID` via `getStorageItem(...)` fallback to `localStorage.getItem(...)`: `js/shared/realtime-sync.js:51-53`

### INDEXEDDB
No direct IndexedDB API calls, but extensive IDB operations through `window.dataStore`:
- Save refined report data (store: `reportData` via dataStore abstraction): `js/shared/realtime-sync.js:116-127`
- Soft-delete local cleanup (stores: `currentReports`, `reportData`, `draftData`, `photos`): `js/shared/realtime-sync.js:164-170`
- Save report metadata (store: `currentReports`): `js/shared/realtime-sync.js:276-290`
- Hard-delete local cleanup (stores: `currentReports`, `reportData`, `draftData`, `photos`): `js/shared/realtime-sync.js:303-309`

### SUPABASE
- Realtime channel `reports-sync` on table `reports` with `user_id` filter: `js/shared/realtime-sync.js:35-41`
- Realtime channel `projects-sync` on table `projects` with `org_id` filter: `js/shared/realtime-sync.js:56-62`
- Query `report_data` table when report transitions to `refined`: `js/shared/realtime-sync.js:108-112`
- Channel cleanup via `supabaseClient.removeChannel(...)`: `js/shared/realtime-sync.js:80`

### N8N/WEBHOOKS
- None.

### ISSUES
- `_refineRedirectInProgress` is set true but never reset; a failed/aborted refined transition can block later transitions in the same page lifetime: declared at `js/shared/realtime-sync.js:13`, set at `js/shared/realtime-sync.js:262`.
- Fixed channel names (`reports-sync`, `projects-sync`) are global per tab/page context; not user-scoped channel names (can complicate debugging in multi-session scenarios): `js/shared/realtime-sync.js:35`, `js/shared/realtime-sync.js:56`.
- Subscription status is logged but not acted on (no reconnect backoff/health policy beyond lifecycle handlers): `js/shared/realtime-sync.js:45-47`, `js/shared/realtime-sync.js:66-68`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - `supabaseClient`: `js/shared/realtime-sync.js:21`, `js/shared/realtime-sync.js:34-68`
  - `STORAGE_KEYS`, `getStorageItem`: `js/shared/realtime-sync.js:23-25`, `js/shared/realtime-sync.js:51-53`
  - `window.dataStore`: `js/shared/realtime-sync.js:116-127`, `js/shared/realtime-sync.js:164-170`, `js/shared/realtime-sync.js:276-309`
  - `window.fvpBroadcast`: `js/shared/realtime-sync.js:172-174`, `js/shared/realtime-sync.js:291-293`, `js/shared/realtime-sync.js:311-313`
  - UI globals: `window.renderReportCards`, `window.updateReportCardStatus`, `window.updateReportStatus`, optional `showToast`: `js/shared/realtime-sync.js:180-182`, `js/shared/realtime-sync.js:318-328`, `js/shared/realtime-sync.js:264-266`
  - Optional sync utilities: `flushInterviewBackup`, `flushReportBackup`, `drainPendingBackups`: `js/shared/realtime-sync.js:352-360`, `js/shared/realtime-sync.js:383`
  - Optional project refresh layer: `window.dataLayer.refreshProjectsFromCloud`: `js/shared/realtime-sync.js:333-334`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`, `archives.html`
  - Called from `js/index/main.js:302`, `js/report/main.js:94`, `js/interview/main.js:295`, `js/archives/main.js:41`
  - Exposes `window.initRealtimeSync` / `window.cleanupRealtimeSync`: `js/shared/realtime-sync.js:388-389`

---

## 3) `js/shared/cloud-photos.js`
### PURPOSE
This file fetches cloud photo metadata from Supabase `photos` and returns report-friendly photo objects for UI rendering. It generates signed URLs from durable `storage_path` values in the `report-photos` bucket and includes both single-report and batch fetch APIs. It also provides `resignPhotoUrls(...)` to refresh expiring signed URLs for cached photo objects.

### LOCALSTORAGE
- None.

### INDEXEDDB
- None directly.

### SUPABASE
- Table `photos` select (single report): `js/shared/cloud-photos.js:26-29`
- Storage bucket `report-photos` signed URL generation (single): `js/shared/cloud-photos.js:40-42`
- Storage bucket `report-photos` signed URL refresh (resign util): `js/shared/cloud-photos.js:97-99`
- Table `photos` select with `.in(report_id, ...)` (batch): `js/shared/cloud-photos.js:125-128`
- Storage bucket `report-photos` signed URL generation (batch): `js/shared/cloud-photos.js:143-145`

### N8N/WEBHOOKS
- None.

### ISSUES
- Duplicate mapping logic between single and batch fetch paths (row -> photo object), which increases drift risk: single mapping `js/shared/cloud-photos.js:59-72`; batch mapping `js/shared/cloud-photos.js:161-174`.
- Batch function signs URLs sequentially inside loop (`await` in `for`), creating avoidable N+1 latency under large photo sets: `js/shared/cloud-photos.js:135-176` (especially `143-146`).
- Date parsing/display logic duplicated across both functions: `js/shared/cloud-photos.js:48-57`, `js/shared/cloud-photos.js:151-159`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - `supabaseClient`: `js/shared/cloud-photos.js:21`, `js/shared/cloud-photos.js:91`, `js/shared/cloud-photos.js:120`
  - Browser online state (`navigator.onLine`): `js/shared/cloud-photos.js:22`, `js/shared/cloud-photos.js:92`, `js/shared/cloud-photos.js:121`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`
  - Called from `js/report/data-loading.js:231,241`, `js/interview/persistence.js:911,944`, `js/index/cloud-recovery.js:151-152`

---

## 4) `js/shared/data-store.js`
### PURPOSE
This file is the centralized IndexedDB data layer (`window.dataStore`) for reports, drafts, report data, projects, photos, user profile, and archive cache. It manages DB open/upgrade lifecycle, migration from legacy localStorage report keys into IDB, and exposes CRUD operations per store. It also includes a cloud reconciliation routine (`syncReportsFromCloud`) that pulls from Supabase and reconciles IDB state.

### LOCALSTORAGE
- Migration completion flag read/write: key `fvp_migration_v2_idb_data`: read `js/shared/data-store.js:199`, write `js/shared/data-store.js:273`
- Legacy reports blob read/remove: key `fvp_current_reports`: read `js/shared/data-store.js:201`, remove `js/shared/data-store.js:274`
- Legacy report data key scan/read/remove: prefix `fvp_report_`: scan `js/shared/data-store.js:215-216`, read `js/shared/data-store.js:218`, remove `js/shared/data-store.js:276`
- Uses `STORAGE_KEYS.USER_ID` via `getStorageItem` in cloud sync: `js/shared/data-store.js:602-604`
- Uses `STORAGE_KEYS.ORG_ID` via `getStorageItem` in cloud sync: `js/shared/data-store.js:726-727`

### INDEXEDDB
Database:
- DB name/version: `fieldvoice-pro` v`7`: `js/shared/data-store.js:4-5`
- Open with timeout/retry and `onblocked` handling: `js/shared/data-store.js:70-151`

Stores created/managed:
- `projects`: create `js/shared/data-store.js:33-35`; CRUD `425-450`
- `userProfile`: create `js/shared/data-store.js:37-39`; CRUD `512-524`
- `photos` (+ indexes `reportId`, `syncStatus`): create `js/shared/data-store.js:41-45`; operations `453-509`
- `currentReports` (+ indexes `project_id`, `status`): create `js/shared/data-store.js:51-55`; operations `304-372`
- `draftData`: create `js/shared/data-store.js:57-59`; operations `400-422`
- `cachedArchives`: create `js/shared/data-store.js:61-63`; operations `527-542`
- `reportData`: create `js/shared/data-store.js:65-67`; operations `375-397`
- Deletes legacy `archives` store during upgrade: `js/shared/data-store.js:47-49`

Additional IDB operations:
- Generic transaction wrapper `_tx`: `js/shared/data-store.js:153-186`
- Clear arbitrary store `clearStore(name)`: `js/shared/data-store.js:544-549`
- Replace full `currentReports` store via `clear()` + `put()`: `js/shared/data-store.js:342-371`

### SUPABASE
- Pull reports from `reports` table for reconciliation: `js/shared/data-store.js:610-615`
- Push local-only reports with `upsert` into `reports`: `js/shared/data-store.js:729-732`

### N8N/WEBHOOKS
- None.

### ISSUES
- Mixed date/time typing for `updated_at` (`Date.now()` number in some paths vs ISO strings from cloud), requiring repeated coercion and creating subtle compare risks: write number at `js/shared/data-store.js:284`; compare coercion `js/shared/data-store.js:663-667`.
- `syncReportsFromCloud` includes fire-and-forget upserts inside loop with no retry/backoff wrapper, so transient failures are only logged: `js/shared/data-store.js:713-742`.
- Legacy migration scans all `localStorage` keys on init, which can be expensive on large keyspaces: `js/shared/data-store.js:213-231`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - Browser IndexedDB API: `js/shared/data-store.js:86`, `js/shared/data-store.js:95-147`
  - `localStorage`: migration + flags `js/shared/data-store.js:199-277`
  - `supabaseClient`: cloud sync `js/shared/data-store.js:597`, `js/shared/data-store.js:610-615`, `js/shared/data-store.js:729-732`
  - `STORAGE_KEYS`, `getStorageItem`, `getDeviceId`, `isDeletedReport`: `js/shared/data-store.js:602-604`, `js/shared/data-store.js:641-642`, `js/shared/data-store.js:720`, `js/shared/data-store.js:726-727`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`, `archives.html`
  - Widely consumed by `js/index/*`, `js/report/*`, `js/interview/*`, `js/shared/realtime-sync.js`, `js/shared/delete-report.js`, `js/auth.js`, and bridged via `js/indexeddb-utils.js:918-936`

---

## 5) `js/shared/broadcast.js`
### PURPOSE
This file wraps browser `BroadcastChannel` usage under a single global API (`window.fvpBroadcast`) for same-browser-tab/process signaling. It provides minimal `send`, `listen`, and `close` helpers and gracefully no-ops when unsupported. It is used for lightweight sync notifications like report updated/deleted/recovered.

### LOCALSTORAGE
- None.

### INDEXEDDB
- None.

### SUPABASE
- None.

### N8N/WEBHOOKS
- None.

### ISSUES
- `listen(handler)` assigns `onmessage` directly, so only one listener is supported at a time (later callers clobber prior listener): `js/shared/broadcast.js:25`.
- No channel reconnect/recreate logic after `close()` unless page code reloads/reinitializes script: `js/shared/broadcast.js:34-42`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - Browser `BroadcastChannel` API: `js/shared/broadcast.js:7-9`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`, `archives.html`
  - Used by `js/index/main.js:304-305` (listen)
  - Used by `js/report/autosave.js:236-237`, `js/index/cloud-recovery.js:189-190`, `js/shared/realtime-sync.js:172-174,291-293,311-313`, `js/shared/delete-report.js:191-192` (send)

---

## 6) `js/shared/console-capture.js`
### PURPOSE
This file monkey-patches `console.log/warn/error`, captures messages into an in-memory ring buffer, and periodically flushes batches to Supabase `debug_logs`. It also captures uncaught errors and unhandled promise rejections for diagnostics. A small `window.debugCapture` API is exposed for manual flush/clear/introspection.

### LOCALSTORAGE
- Read key `fvp_device_id` for log attribution: `js/shared/console-capture.js:25`

### INDEXEDDB
- None.

### SUPABASE
- Inserts buffered log batch into table `debug_logs`: `js/shared/console-capture.js:69-70`

### N8N/WEBHOOKS
- None.

### ISSUES
- Privacy/security risk: captures raw console payloads, which may include sensitive data, and ships them server-side without explicit field-level redaction: capture path `js/shared/console-capture.js:51-58`, flush `js/shared/console-capture.js:67-70`.
- Flush failure path requeues indefinitely; no max retry age/backoff state, so noisy failure loops can persist: `js/shared/console-capture.js:76-80`.
- Uses only in-memory buffer (not persisted), so logs are lost on abrupt tab close/crash before flush (design tradeoff): buffer definition `js/shared/console-capture.js:12`, flush on timer/pagehide only `js/shared/console-capture.js:107`, `js/shared/console-capture.js:110-113`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - `supabaseClient`: `js/shared/console-capture.js:65`, `js/shared/console-capture.js:68-70`
  - `localStorage` for device ID: `js/shared/console-capture.js:25`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`, `archives.html`
  - Used by `js/shared/pull-to-refresh.js:51-52` (`window.debugCapture.flush()`)

---

## 7) `js/shared/delete-report.js`
### PURPOSE
This file provides shared delete flows: a full cloud cascade (`deleteReportCascade`) and an app-standard local+soft-cloud delete (`deleteReportFull`). It centralizes blocklist update, local IDB cleanup, active-pointer cleanup, and broadcast notifications. The cascade variant handles storage cleanup and multi-table deletes in ordered steps.

### LOCALSTORAGE
- Indirect via storage wrapper helpers:
  - Reads `STORAGE_KEYS.ACTIVE_REPORT_ID` with `getStorageItem(...)`: `js/shared/delete-report.js:148`
  - Removes `STORAGE_KEYS.ACTIVE_REPORT_ID` with `removeStorageItem(...)`: `js/shared/delete-report.js:149`
- Direct `localStorage` API is not called in this file.

### INDEXEDDB
No direct IndexedDB API calls, but IDB cleanup through `window.dataStore`:
- `deleteReport` (current report metadata): `js/shared/delete-report.js:159-160`
- `deletePhotosByReportId` (photos store cleanup): `js/shared/delete-report.js:161-162`
- `deleteDraftData` (draft store cleanup): `js/shared/delete-report.js:163-164`
- `deleteReportData` (report data store cleanup): `js/shared/delete-report.js:165-166`

### SUPABASE
`deleteReportCascade(reportId)`:
- `photos` table select storage paths: `js/shared/delete-report.js:31-34`
- Storage bucket `report-photos` remove files: `js/shared/delete-report.js:45`
- Delete child tables: `interview_backup`, `report_backup`, `ai_submissions`, `report_data`: `js/shared/delete-report.js:52-55`
- `reports` table select `pdf_path,pdf_url`: `js/shared/delete-report.js:65-68`
- `final_reports` table fallback lookup: `js/shared/delete-report.js:76-79`
- Storage bucket `report-pdfs` remove file: `js/shared/delete-report.js:93`
- Delete `final_reports` row: `js/shared/delete-report.js:101`
- Delete `photos` rows: `js/shared/delete-report.js:108`
- Delete parent `reports` row: `js/shared/delete-report.js:115`

`deleteReportFull(reportId)`:
- Soft-delete `reports` by setting `status='deleted'`: `js/shared/delete-report.js:176-180`

### N8N/WEBHOOKS
- None.

### ISSUES
- Two overlapping delete strategies (`deleteReportCascade` hard delete vs `deleteReportFull` soft delete) increase misuse risk if callers choose the wrong one for current architecture: definitions at `js/shared/delete-report.js:20` and `js/shared/delete-report.js:132`.
- `deleteReportCascade` is exported but appears less aligned with current soft-delete + realtime model; can become stale path if still callable: export `js/shared/delete-report.js:198`.
- Comment numbering skips step 3 -> 4 in `deleteReportFull` (minor maintenance clarity issue): `js/shared/delete-report.js:155`, `js/shared/delete-report.js:173`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - `supabaseClient`: `js/shared/delete-report.js:22`, `js/shared/delete-report.js:174-180`
  - `addToDeletedBlocklist`, `getStorageItem`, `removeStorageItem`, `STORAGE_KEYS`: `js/shared/delete-report.js:141`, `js/shared/delete-report.js:147-149`
  - `window.dataStore`: `js/shared/delete-report.js:156-167`
  - `window.fvpBroadcast`: `js/shared/delete-report.js:191-193`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`
  - Called from `js/report/delete-report.js:38`, `js/index/report-cards.js:722`, `js/index/report-creation.js:237`, `js/interview/persistence.js:50`
  - Exposes `window.deleteReportCascade` / `window.deleteReportFull`: `js/shared/delete-report.js:198-199`

---

## 8) `js/shared/pull-to-refresh.js`
### PURPOSE
This file implements mobile pull-to-refresh and an optional desktop floating refresh button on hover-capable devices. It performs pre-reload flush hooks (`flushInterviewBackup`, `flushReportBackup`, pending queue drain, debug log flush) before reloading/manual refresh. It is a UX/control utility, not a data ownership module.

### LOCALSTORAGE
- None.

### INDEXEDDB
- None directly.
- Indirect queue interaction via `window.drainPendingBackups()`: `js/shared/pull-to-refresh.js:57-59`

### SUPABASE
- None directly.

### N8N/WEBHOOKS
- None.

### ISSUES
- Pull gesture handler uses passive touch listeners and custom indicator but does not prevent default native pull-refresh/browser overscroll behavior on all platforms; behavior can be inconsistent across mobile browsers: listeners `js/shared/pull-to-refresh.js:17-31`.
- Flush coverage differs by path (mobile trigger flushes interview+report; desktop helper flushes debug/drain/report but not interview backup), creating slight inconsistency: mobile `js/shared/pull-to-refresh.js:39-40`, desktop `js/shared/pull-to-refresh.js:49-67`.
- No cleanup for injected desktop button on SPA-like re-entry scenarios (guard only checks id existence): `js/shared/pull-to-refresh.js:79`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - Optional globals: `flushInterviewBackup`, `flushReportBackup`, `window.drainPendingBackups`, `window.debugCapture.flush`, `window.manualRefresh`: `js/shared/pull-to-refresh.js:39-40`, `js/shared/pull-to-refresh.js:51-59`, `js/shared/pull-to-refresh.js:63-64`, `js/shared/pull-to-refresh.js:71-73`
- Depended on by:
  - Loaded by `index.html`, `report.html`, `quick-interview.html`, `archives.html`

---

## 9) `js/shared/supabase-retry.js`
### PURPOSE
This file provides a small global retry wrapper (`supabaseRetry`) with exponential backoff for async Supabase operations that are fire-and-forget or transiently failure-prone. It retries thrown errors and also treats Supabase `{ error }` responses as failures. It exposes itself as `window.supabaseRetry` for reuse across page-specific modules.

### LOCALSTORAGE
- None.

### INDEXEDDB
- None.

### SUPABASE
- No direct table/storage/auth calls; generic wrapper designed for Supabase callsites.

### N8N/WEBHOOKS
- None.

### ISSUES
- Retry policy is static (1s/2s/4s) with no jitter, which can synchronize retries under widespread failure: `js/shared/supabase-retry.js:38-40`.
- No cancellation support (AbortSignal), so callers cannot stop in-flight retry loops once started.
- Logging may leak operation labels/error text to console in production contexts: `js/shared/supabase-retry.js:39`, `js/shared/supabase-retry.js:45`.
- No TODO/FIXME markers found.

### DEPENDENCIES
- Depends on:
  - None besides standard JS runtime (`Promise`, `setTimeout`, `console`).
- Depended on by:
  - Loaded by `report.html`, `quick-interview.html`
  - Called from `js/report/autosave.js:182`, `js/interview/persistence.js:786`, `js/interview/finish-processing.js:390`
  - Exposes `window.supabaseRetry`: `js/shared/supabase-retry.js:50-51`

---

## CHUNK SUMMARY
### Key findings
- Shared modules are generally cohesive and intentionally split by concern (sync, storage, delete, diagnostics, UX helpers).
- `data-store.js` is the most critical module in this chunk; it is the main IDB abstraction and reconciliation engine and is heavily depended upon.
- `realtime-sync.js` and `delete-report.js` are tightly coupled to blocklist + soft-delete behavior; this is good for consistency, but there are still stale-path risks.
- `cloud-photos.js` works functionally but has avoidable duplication/performance debt in batch URL signing.

### Issues ranked by severity
CRITICAL
- None found in this chunk’s current code paths.

WARNING
- `realtime-sync.js`: `_refineRedirectInProgress` is never reset, which can suppress future refined redirects after one failure/stall (`js/shared/realtime-sync.js:13`, `js/shared/realtime-sync.js:262`).
- `console-capture.js`: raw console payload capture to Supabase can inadvertently exfiltrate sensitive runtime data (`js/shared/console-capture.js:51-58`, `js/shared/console-capture.js:69-70`).
- `cloud-photos.js`: sequential signed URL generation in batch path can become a major latency bottleneck with many photos (`js/shared/cloud-photos.js:135-176`).

INFO
- `ai-assistant.js`: help text promises local messaging commands that are not actually implemented in `handleLocalCommand` (expectation mismatch).
- `delete-report.js`: dual exported delete paradigms (cascade hard-delete and soft-delete) can cause accidental misuse if callsites are not strictly controlled.
- `pull-to-refresh.js`: mobile and desktop pre-refresh flush logic is slightly inconsistent.
- `supabase-retry.js`: no jitter/cancel support in retry strategy.

### Cross-file concerns
- Duplicate logic pattern:
  - `cloud-photos.js` repeats row mapping/date parsing in both single and batch fetch functions.
- Mixed timestamp formats:
  - `data-store.js` mixes numeric and ISO string `updated_at`, and `realtime-sync.js` also writes time fields; this increases coercion burden and subtle compare bugs across modules.
- Global-coupling pattern:
  - Most shared modules rely on globals (`window.dataStore`, `window.fvpBroadcast`, `STORAGE_KEYS`, `supabaseClient`) rather than explicit imports, so load order remains a systemic risk.
- Soft-delete architecture consistency:
  - `delete-report.js` + `realtime-sync.js` are aligned on soft-delete + blocklist, but coexistence of `deleteReportCascade` keeps a legacy hard-delete path available.
