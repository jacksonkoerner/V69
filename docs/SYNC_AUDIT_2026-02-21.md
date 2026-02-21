# FieldVoice Pro Sync Architecture Audit

Date: 2026-02-21  
Scope audited: `index.html`, `quick-interview.html`, `report.html`, all files in `js/index/`, `js/interview/`, `js/report/`, `js/shared/`

## Dashboard (`index.html` + `js/index/*` + loaded `js/shared/*`)

### A. Data Flow Map
1. **Script/runtime boot order**
- Shared sync/data scripts load in `<head>`: `console-capture.js`, `cloud-photos.js`, `delete-report.js`, `broadcast.js`, `data-store.js`, `realtime-sync.js`, `pull-to-refresh.js`.
- Dashboard scripts then run; orchestrator is `js/index/main.js` (`DOMContentLoaded` handler).

2. **Page-load read order (`js/index/main.js` -> `refreshDashboard`)**
- `_renderFromLocalStorage()` immediate pre-render (uses `STORAGE_KEYS.PROJECTS`, `window.currentReportsCache`).
- `dataStore.init()`.
- `refreshDashboard('DOMContentLoaded')`:
  - local phase parallel:
    - `loadReportsFromIDB()` -> `dataStore.getAllReports()`
    - `window.dataLayer.loadProjects()`
  - render from IDB state
  - network phase (if online):
    - `window.dataLayer.refreshProjectsFromCloud()`
    - `syncWeather()` (non-blocking)
  - `pruneCurrentReports()` against IDB map
  - `dataStore.syncReportsFromCloud()` (cloud->IDB reconcile)
  - final render
  - fallback recovery path: `recoverCloudDrafts()` only when `syncReportsFromCloud` did not run

3. **Writes and destinations**
- **IndexedDB (`dataStore`)**
  - `replaceAllReports()` in prune and cloud-recovery.
  - `saveReport`/`saveReportData` via dismissal/delete/recovery flows.
- **localStorage/sessionStorage**
  - permission/banner/session flags in `main.js`.
  - deleted blocklist trim (`STORAGE_KEYS.DELETED_REPORT_IDS`).
  - migration flags, AI cache cleanup (`fvp_ai_response_*`).
- **Supabase**
  - report row create (`report-creation.js`: `reports.upsert`).
  - dismissal (`report-cards.js`: `reports.update(dashboard_dismissed_at, updated_at)`).
  - cloud-recovery reads (`reports`, `report_data`, `interview_backup`).
  - shared realtime subscriptions and shared delete/update flows.

### B. Sync Mechanisms
- **Supabase Realtime**: yes (`initRealtimeSync` in `main.js`) from `js/shared/realtime-sync.js`.
  - Channels:
    - `reports-sync` (`reports` table, `user_id` filter).
    - `projects-sync` (`projects` table, `org_id` filter).
  - Handlers: `_handleReportChange`, `_handleProjectChange`, `_refreshCurrentReportAfterRefined`.
- **BroadcastChannel**: yes (`fieldvoice-sync` via `js/shared/broadcast.js`).
  - Dashboard listens in `main.js`; refreshes on `report-deleted`, `report-updated`, `reports-recovered`.
- **`cloud-recovery.js` / `syncReportsFromCloud`**: both used.
  - Primary reconciliation: `dataStore.syncReportsFromCloud()`.
  - Fallback recovery: `recoverCloudDrafts()`.
- **Deleted blocklist**: yes.
  - Read by `syncReportsFromCloud`, `realtime-sync`, `cloud-recovery` (`isDeletedReport`).
  - Written by delete flows / realtime (`addToDeletedBlocklist`).
  - Trimmed in `main.js` to latest 20 entries.
- **Visibility/online/offline handlers**:
  - Dashboard page: `pageshow`, `visibilitychange(visible)`, `focus` -> `refreshDashboard`.
  - Shared realtime: `beforeunload`, `online`, `offline`, `visibilitychange`, `pageshow`.
- **Auto-save/periodic timers**:
  - Refresh cooldown queue timers (`_pendingRefreshTimer`, cooldown logic).
  - auto-dismiss submitted timer (`_autoDismissSubmittedTimer`, 3s).
  - shared console flush interval (`console-capture.js`: every 3s).

### C. Supabase Interactions
Tables read/write for Dashboard flows:
- `reports`
  - Read: `cloud-recovery.js` (`select id, project_id, report_date, status, created_at, updated_at, dashboard_dismissed_at`).
  - Write: `report-creation.js` (`upsert`), `report-cards.js` (`update dashboard_dismissed_at`), shared soft-delete (`delete-report.js` -> `status='deleted'`).
  - Read/write via shared sync: `data-store.js::syncReportsFromCloud` (`select`, `upsert local-only`).
- `report_data`
  - Read: `cloud-recovery.js` (`select * for recovered IDs`).
  - Read via shared realtime transition: `realtime-sync.js` (`select * where report_id`).
- `interview_backup`
  - Read: `cloud-recovery.js` (cache-back interview backups).
- `photos`
  - Read/sign URL via shared `cloud-photos.js` (used by recovery for photo rehydrate).
- `projects`
  - Realtime subscription target in shared `realtime-sync.js`.
- `debug_logs`
  - Insert via shared `console-capture.js`.
- Legacy/auxiliary in loaded shared delete cascade implementation (`deleteReportCascade`, not dashboard’s default delete path): `report_backup`, `ai_submissions`, `final_reports`.

Storage buckets used:
- `report-photos` (via shared `cloud-photos.js`, delete cascade helper).
- `report-pdfs` (delete cascade helper).

Direct vs shared:
- Direct in index scripts: `reports` (`upsert`/`update`), recovery reads.
- Shared wrappers/functions: realtime, dataStore cloud sync, cloud-photo signing, delete helpers, debug log flush.

### D. Local Caching
- **localStorage/sessionStorage keys used**
  - `STORAGE_KEYS.MIC_GRANTED`, `STORAGE_KEYS.LOC_GRANTED`, `STORAGE_KEYS.ONBOARDED`
  - `STORAGE_KEYS.BANNER_DISMISSED`, `STORAGE_KEYS.BANNER_DISMISSED_DATE`
  - `STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` (sessionStorage)
  - `STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR`
  - `STORAGE_KEYS.PROJECTS`
  - `STORAGE_KEYS.DELETED_REPORT_IDS`
  - `STORAGE_KEYS.USER_ID`, `STORAGE_KEYS.ORG_ID`, `STORAGE_KEYS.ACTIVE_REPORT_ID`
  - Legacy/internal: `fvp_current_reports`, `fvp_report_<id>`, `fvp_migration_v2_idb_data`, `fvp_device_id`, `fvp_ai_response_*`
- **IndexedDB stores (`fieldvoice-pro`)**
  - `currentReports`, `reportData`, `draftData`, `photos`, `projects`, `userProfile`, `cachedArchives`.
- **Local vs cloud winner logic**
  - `syncReportsFromCloud`: cloud row wins if `cloud.updated_at > local.updated_at`; local preserved if same/newer.
  - Local-only report rows are preserved and upserted to cloud in background.
  - `recoverCloudDrafts` uses timestamp compare (`updated_at`) and only recovers cloud-newer missing/stale local drafts.
  - Deleted blocklist overrides cloud presence to prevent resurrection.

### E. Delete Flow
- Dashboard card delete (`confirmDeleteReport` -> `executeDeleteReport`) calls shared `deleteReportFull(reportId)`.
- `deleteReportFull` behavior:
  - add deleted blocklist first;
  - clear active report pointer;
  - remove local IDB report/photos/draft/reportData;
  - soft-delete cloud row: `reports.status='deleted'`;
  - broadcast `report-deleted`.
- Soft-delete vs hard-delete:
  - **Actual dashboard delete path is soft-delete**.
  - Hard cascade helper `deleteReportCascade` exists but is not primary path in dashboard files.
- Resurrection prevention:
  - Blocklist checks in `syncReportsFromCloud`, `realtime-sync`, `cloud-recovery`.
  - Cloud queries exclude `status='deleted'` where applicable.

---

## Quick Interview (`quick-interview.html` + `js/interview/*` + loaded `js/shared/*`)

### A. Data Flow Map
1. **Script/runtime boot order**
- Shared scripts first (same sync set as dashboard).
- Interview modules; orchestrator `js/interview/main.js` (`DOMContentLoaded`).

2. **Page-load read order**
- `dataStore.init()`.
- `checkReportState()` (currently always true).
- load user settings (`window.dataLayer.loadUserSettings()`).
- `IS.report = await getReport()` from `persistence.js`:
  - parse URL `reportId`.
  - read IDB draft (`dataStore.getDraftData`).
  - if online, read cloud `interview_backup` with 2s timeout.
  - compare timestamps (IDB `lastSaved|savedAt` vs cloud `updated_at|savedAt`), choose newer.
  - if cloud chosen: map `page_state` into fresh report object and cache back to IDB.
  - if using IDB: hydrate report from draft.
  - photo rehydration/merge from cloud `photos` via `fetchCloudPhotos`.
  - fallback to `createFreshReport()` when nothing found.
- Resolve `currentReportId`, set `STORAGE_KEYS.ACTIVE_REPORT_ID`, resolve active project (URL `projectId` -> IDB report metadata).
- initialize mode/UI autosave handlers, realtime sync, and `drainPendingBackups()`.

3. **Writes and destinations**
- **IndexedDB / local-first**
  - `saveToLocalStorage()` writes report metadata (`saveReport`) + draft payload (`saveDraftData`).
  - photo blobs/metadata via `window.idb.savePhoto`, updates, deletes.
- **Cloud backup writes**
  - debounced `flushInterviewBackup()` -> `interview_backup.upsert`.
  - `drainPendingBackups()` flushes stale local flags from IDB to `interview_backup`.
- **Supabase report/photos writes**
  - `saveReportToSupabase()` -> `reports.upsert`.
  - photo upload/sign/delete -> storage `report-photos` and `photos` table upsert/delete.
- **Finish processing writes** (`finish-processing.js`)
  - edge call (`process-report`) then upserts:
    - `ai_submissions`
    - `report_data`
    - report metadata/status in `reports`
  - caches final package locally (`dataStore.saveReportData`, `saveReport`).

### B. Sync Mechanisms
- **Supabase Realtime**: yes (`initRealtimeSync` in `main.js`, shared handlers).
- **BroadcastChannel**: yes indirectly via shared modules; delete/update messages propagate.
- **`cloud-recovery.js` / `syncReportsFromCloud`**:
  - Not directly invoked by interview page scripts.
  - shared realtime/data-store still active.
- **Deleted blocklist**: yes via shared delete + realtime guards.
- **Visibility/online/offline handlers**:
  - `main.js`: `visibilitychange(hidden)` save+flush, `pagehide` save+flush+close DB, `pageshow(persisted)` drain backups, `online` drain backups.
  - `ui-flow.js`: temporary `online/offline` listeners for processing modal state.
  - shared realtime listeners also active.
- **Auto-save / periodic sync timers**
  - `saveReport()` local debounce 500ms.
  - `markInterviewBackupDirty()` -> `flushInterviewBackup` after 2s.
  - guided/freeform edit debounces (500ms).
  - cloud freshness timeout in `getReport()` (2s abort).
  - finish flow timeout guards (edge call timeout, report_data sync timeout wrapper).
  - shared console flush interval 3s.

### C. Supabase Interactions
Tables read/write for Quick Interview:
- `interview_backup`
  - Read: `getReport()` (`select page_state, updated_at`).
  - Write: `flushInterviewBackup`, `drainPendingBackups` (`upsert on report_id`).
- `reports`
  - Write: `saveReportToSupabase` (`upsert`), finish flow status/meta updates.
  - Realtime subscription target in shared module.
- `photos`
  - Write: `photos.upsert` in photo sync paths (`photos.js`, `persistence.js`).
  - Delete: `deletePhotoFromSupabase`.
  - Read: shared `fetchCloudPhotos` for rehydration.
- `ai_submissions`
  - Write: finish flow `upsert` (`onConflict: report_id`).
- `report_data`
  - Write: finish flow `upsert` after AI process.
  - Read indirectly via shared realtime refine transition (`_refreshCurrentReportAfterRefined`).
- `projects`
  - Realtime subscription target in shared module.
- `debug_logs`
  - Insert via shared console capture.
- Legacy/helper tables in shared delete cascade helper: `report_backup`, `final_reports`.

Storage buckets used:
- `report-photos` (upload, sign URL, remove).
- `report-pdfs` only through shared delete cascade helper (not interview core submit path).

Direct vs shared:
- Direct interview modules: `interview_backup`, `reports`, `photos`, `ai_submissions`, `report_data`, `report-photos`.
- Shared modules: realtime subscriptions/handlers, delete helpers, cloud photo fetch/sign, debug log flush.

### D. Local Caching
- **localStorage/session keys**
  - `STORAGE_KEYS.MIC_GRANTED`, `STORAGE_KEYS.LOC_GRANTED`, `STORAGE_KEYS.PERMISSIONS_DISMISSED`
  - `STORAGE_KEYS.ACTIVE_REPORT_ID`, `STORAGE_KEYS.DICTATION_HINT_DISMISSED`
  - `STORAGE_KEYS.ORG_ID`, `STORAGE_KEYS.USER_ID`
  - stale backup flags: `fvp_backup_stale_<reportId>`
  - shared: `fvp_device_id`, legacy migration keys as part of `dataStore`
- **IndexedDB stores and wrappers**
  - `dataStore` stores: `draftData`, `currentReports`, `reportData`, `photos`, etc.
  - `window.idb` photo APIs: `getPhoto`, `savePhoto`, `deletePhoto`, `getPhotosBySyncStatus`.
- **Local vs cloud winner logic**
  - `getReport()` chooses newer source by timestamps (cloud `updated_at` vs local `lastSaved/savedAt`).
  - IDB remains authoritative when cloud older/unavailable/timed out.
  - cloud-chosen state is cached back into IDB.
  - photos merged (preserve unsynced local photos; add missing cloud photos; refresh signed URLs).

### E. Delete Flow
- Interview cancel (`confirmCancelReport`) calls `deleteReportFull`.
- Resulting behavior:
  - blocklist add first;
  - local IDB cleanup;
  - cloud soft-delete `reports.status='deleted'`;
  - broadcast delete event;
  - redirect to dashboard.
- Soft vs hard:
  - **soft-delete path in interview UI**.
  - Hard cascade helper exists but not the default cancel path.
- Resurrection prevention:
  - blocklist checks + realtime cleanup + cloud sync filters.

---

## Report Editor (`report.html` + `js/report/*` + loaded `js/shared/*`)

### A. Data Flow Map
1. **Script/runtime boot order**
- Shared sync/data scripts first.
- Report modules; orchestrator `js/report/main.js` (`DOMContentLoaded`).

2. **Page-load read order**
- `dataStore.init()`.
- user settings via `window.dataLayer.loadUserSettings()`.
- `loadReport()` in `data-loading.js`:
  - read URL `reportId` (required).
  - read local IDB `dataStore.getReportData(reportId)`.
  - if online, cloud freshness check from `report_data` with 2s timeout.
  - compare timestamps (`idb.lastSaved` vs cloud `updated_at`); cloud wins only if newer or no local.
  - if cloud chosen, query `reports.report_date` and cache merged payload to IDB.
  - assemble runtime `RS.report` from `aiGenerated`, `originalInput`, `userEdits`.
  - re-sign existing photo URLs (`resignPhotoUrls`) and rehydrate missing photos from `photos` table (`fetchCloudPhotos`).
  - if missing data but report meta indicates draft/pending_refine, redirect to interview for re-processing.
- Resolve active project from reportData -> report metadata -> URL param.
- initialize field rendering, autosave, realtime subscriptions.

3. **Writes and destinations**
- **IndexedDB**
  - autosave writes `reportData` + `currentReports` metadata (`saveReportToLocalStorage`).
  - explicit hardening saves on `visibilitychange/pagehide`.
- **Cloud periodic writes**
  - `flushReportBackup()` -> `report_data.upsert` (debounced 5s).
  - optional metadata upsert `saveReportToSupabase` -> `reports.upsert`.
- **Submit path (`submit.js`)**
  - duplicate check in `reports`.
  - generate PDF -> upload storage `report-pdfs` -> signed URL.
  - `reports.upsert` ensure row exists.
  - `reports.update` with `pdf_url`, `pdf_path`, `inspector_name`, `submitted_at`, status.
  - local cleanup: delete IDB `reportData` and photos, keep submitted metadata row.
- **Delete path**
  - report page delete modal -> shared `deleteReportFull` soft-delete.

### B. Sync Mechanisms
- **Supabase Realtime**: yes (`initRealtimeSync` called in `main.js`).
- **BroadcastChannel**: yes via autosave (`report-updated`) and shared delete events.
- **`cloud-recovery.js` / `syncReportsFromCloud`**:
  - Not directly called in report page scripts.
- **Deleted blocklist**: yes through shared delete and realtime filters.
- **Visibility/online/offline handlers**
  - `main.js`: `visibilitychange(hidden)` and `pagehide` force local save + backup flush.
  - shared realtime lifecycle listeners active.
- **Auto-save / periodic sync timers**
  - field debounce 500ms (`scheduleSave`).
  - cloud backup debounce 5s (`markReportBackupDirty`).
  - load freshness timeout 2s.
  - save indicator timer 2s.
  - shared console flush interval 3s.

### C. Supabase Interactions
Tables read/write for Report Editor:
- `report_data`
  - Read: `data-loading.js` (`select * by report_id`).
  - Write: `autosave.js` (`upsert user_edits/status/updated_at`).
- `reports`
  - Read: `data-loading.js` (`select report_date`), `submit.js` duplicate check (`select id`).
  - Write: `submit.js` (`upsert` ensure row, `update` status/pdf metadata), `autosave.js::saveReportToSupabase` (`upsert metadata`).
  - Soft-delete: shared `delete-report.js` helper.
- `photos`
  - Read through shared `fetchCloudPhotos` for rehydration.
- `projects`
  - Realtime subscription target in shared module.
- `debug_logs`
  - Insert via shared console capture.
- Legacy/helper tables in shared delete cascade helper: `interview_backup`, `report_backup`, `ai_submissions`, `final_reports`.

Storage buckets used:
- `report-pdfs` (upload and signed URL on submit).
- `report-photos` (signed URL refresh via `form-fields.js` and shared photo helpers; delete helper may remove on cascade utility).

Direct vs shared:
- Direct report modules: `report_data`, `reports`, `report-pdfs`.
- Shared modules provide realtime syncing, delete logic, cloud-photo helpers, debug-log persistence.

### D. Local Caching
- **localStorage keys**
  - `STORAGE_KEYS.ACTIVE_REPORT_ID`
  - `STORAGE_KEYS.ORG_ID`, `STORAGE_KEYS.USER_ID`
  - shared keys from loaded modules (`fvp_device_id`, migration/legacy keys in data-store, deleted blocklist through shared flows).
- **IndexedDB stores**
  - `reportData`, `currentReports`, `photos` (plus global stores in data-store).
- **Local vs cloud winner logic**
  - `loadReport()` is IDB-first but always checks cloud freshness online; cloud replaces local only if newer timestamp.
  - cloud-selected data writes back to IDB.
  - photo URLs are refreshed with signed URLs; missing photo arrays are rehydrated from cloud.

### E. Delete Flow
- Report page delete button (`js/report/delete-report.js`) calls `deleteReportFull`.
- Behavior matches shared soft-delete flow:
  - blocklist add;
  - IDB cleanup;
  - `reports.status='deleted'` update;
  - delete broadcast.
- Soft vs hard:
  - **soft-delete used by report editor flow**.
  - hard cascade helper exists but is not the main path.
- Resurrection prevention:
  - blocklist checks and shared realtime/local cleanup on delete payloads.

---

## Summary (Cross-Page Mechanisms, Overlap, Conflict)

### Mechanisms present across all three pages
- Shared IndexedDB persistence via `js/shared/data-store.js` (`fieldvoice-pro` DB).
- Shared Supabase realtime subscriptions via `js/shared/realtime-sync.js`.
- Shared BroadcastChannel (`fieldvoice-sync`) via `js/shared/broadcast.js`.
- Shared delete helper (`js/shared/delete-report.js`) with soft-delete default flow.
- Shared photo cloud fetch/sign helper (`js/shared/cloud-photos.js`).
- Shared diagnostic persistence (`js/shared/console-capture.js` -> `debug_logs`).

### Overlaps
- Realtime + Broadcast + explicit refresh calls all trigger UI refresh/update propagation.
- IDB-first + cloud freshness checks are used in both interview (`interview_backup`) and report editor (`report_data`) with similar timestamp arbitration.
- Delete handling is centralized but consumed by page-specific UI wrappers.

### Conflicts / risk points observed
1. Multiple sync triggers can cause redundant refresh churn:
- Dashboard listens to `pageshow`, `visibilitychange`, `focus`, realtime broadcasts, and channel events; cooldown logic mitigates but does not eliminate repeated runs.

2. Mixed timestamp formats:
- Some local `updated_at` values are numeric (`Date.now()`), some ISO strings; compare logic handles this in most places, but mixed writes increase edge-case risk.

3. Soft-delete + blocklist coupling:
- Resurrection protection depends on both cloud `status='deleted'` and local blocklist checks; if cloud soft-delete fails, local-only cleanup may be temporary on other devices.

4. Expiring signed URLs:
- Photo/PDF signed URLs expire (typically 1 hour). Re-sign logic exists for photos, but stale cached URLs can still surface between refresh points.

5. Dual authority paths on dashboard:
- `syncReportsFromCloud()` and `recoverCloudDrafts()` overlap in purpose; code avoids double-run by gating recovery when sync already ran, but architectural complexity remains.

---

## Appendix A: Function Inventory (from scoped folders)

```text
INDEX_FUNCTIONS
calendar.js:15:    function renderCalendarGrid() {
cloud-recovery.js:17:function recoverCloudDrafts() {
cloud-recovery.js:209:function cacheInterviewBackups(reportIds, localReports) {
field-tools.js:1:function openFieldToolsModal() {
field-tools.js:4:function closeFieldToolsModal() {
field-tools.js:7:function fieldToolAction(fn) {
field-tools.js:17:    function pauseCarousel() {
field-tools.js:22:    function scheduleResume() {
panels.js:12:function onPanelOpen(panelId) {
panels.js:20:async function loadWeatherDetailsPanel() {
panels.js:100:async function loadDroneOpsPanel() {
panels.js:227:async function loadEmergencyPanel() {
panels.js:276:async function shareEmergencyLocation() {
main.js:19:function getProjects() {
main.js:23:function openProjectConfig() {
main.js:27:function openSettings() {
main.js:32:async function pruneCurrentReports() {
main.js:76:function checkPermissionState() {
main.js:102:function shouldShowOnboarding() {
main.js:110:function shouldShowBanner() {
main.js:118:function showPermissionsBanner() {
main.js:123:function dismissPermissionsBanner() {
main.js:130:async function dismissSubmittedBanner() {
main.js:140:async function autoDismissSubmittedReportsFromToday() {
main.js:351:function _isBypassRefreshSource(source) {
main.js:356:function _queuePendingRefresh(source, bypassCooldown) {
main.js:385:function withTimeout(promise, ms, fallback, label) {
main.js:401:async function loadReportsFromIDB() {
main.js:429:async function refreshDashboard(source) {
main.js:611:function _renderFromLocalStorage() {
toggle-panel.js:1:function togglePanel(panelId, trigger) {
weather.js:12:async function syncWeather() {
weather.js:132:function updateConditionsBar() {
weather.js:170:async function fetchSunriseSunset(lat, lon) {
report-cards.js:11:function renderReportCards(reportsInput) {
report-cards.js:123:function renderProjectSection(project, reports, expanded) {
report-cards.js:157:function toggleProjectSection(sectionId) {
report-cards.js:171:function getReportHref(report) {
report-cards.js:186:function getStatusBadge(status) {
report-cards.js:198:function formatTimestamp(ts) {
report-cards.js:205:function renderReportCard(report) {
report-cards.js:265:function updateReportStatus() {
report-cards.js:298:function injectSwipeStyles() {
report-cards.js:375:function initSwipeToDelete() {
report-cards.js:390:        function onStart(x, y) {
report-cards.js:404:        function onMove(x, y) {
report-cards.js:439:        function onEnd() {
report-cards.js:503:            const onMouseMove = (e2) => {
report-cards.js:510:            const onMouseUp = () => {
report-cards.js:526:function confirmDeleteReport(reportId) {
report-cards.js:612:async function dismissReport(reportId, options) {
report-cards.js:688:async function executeDismissReport(reportId, overlay) {
report-cards.js:714:async function executeDeleteReport(reportId, overlay) {
report-cards.js:772:function updateReportCardStatus(reportId, newData) {
report-creation.js:21:function createSupabaseReportRow(reportId, projectId) {
report-creation.js:46:function beginDailyReport() {
report-creation.js:54:async function showProjectPickerModal() {
report-creation.js:176:function closeProjectPickerModal() {
report-creation.js:180:async function selectProjectAndProceed(projectId) {
report-creation.js:213:function showDuplicateReportModal(projectName, date, existingReportId, projectId) {
report-creation.js:263:function closeDuplicateReportModal() {
report-creation.js:273:function goToProjectSetup() {

INTERVIEW_FUNCTIONS
ui-display.js:8:async function fetchWeather() {
ui-display.js:39:function updateWeatherDisplay() {
ui-display.js:58:function updateAllPreviews() {
ui-display.js:150:function updateStatusIcons() {
ui-display.js:202:function updateProgress() {
ui-flow.js:12:function shouldShowModeSelection() {
ui-flow.js:32:function selectCaptureMode(mode) {
ui-flow.js:41:function showModeUI(mode) {
ui-flow.js:62:function showModeSelectionScreen() {
ui-flow.js:83:function showSwitchModeConfirm() {
ui-flow.js:111:function closeSwitchModeModal() {
ui-flow.js:118:function confirmSwitchMode() {
ui-flow.js:160:function showProcessConfirmation() {
ui-flow.js:172:function updateOnlineStatus() {
ui-flow.js:193:const onlineHandler = () => updateOnlineStatus();
ui-flow.js:194:const offlineHandler = () => updateOnlineStatus();
ui-flow.js:198:function cleanup() {
ui-flow.js:206:function onConfirm() {
ui-flow.js:211:function onCancel() {
ui-flow.js:227:function showProcessingOverlay() {
ui-flow.js:265:function setProcessingStep(stepNum, state) {
ui-flow.js:295:function showProcessingSuccess() {
ui-flow.js:314:function showProcessingError(message) {
ui-flow.js:333:function hideProcessingOverlay() {
ui-flow.js:350:function _blockUnload(e) {
ui-flow.js:356:function _blockKeys(e) {
ui-flow.js:364:function _blockTouch(e) {
state-mgmt.js:31:function createEntry(section, content) {
state-mgmt.js:53:function getNextEntryOrder(section) {
state-mgmt.js:64:function getEntriesForSection(section) {
state-mgmt.js:77:function updateEntry(entryId, newContent) {
state-mgmt.js:91:function deleteEntryById(entryId) {
state-mgmt.js:105:function startEditEntry(entryId, sectionType) {
state-mgmt.js:153:function saveEditEntry(entryId, sectionType) {
state-mgmt.js:183:function setToggleState(section, value) {
state-mgmt.js:205:function getToggleState(section) {
state-mgmt.js:214:function isToggleLocked(section) {
state-mgmt.js:224:function renderToggleButtons(section, label) {
state-mgmt.js:262:function handleToggle(section, value) {
state-mgmt.js:307:function markNA(section) {
state-mgmt.js:326:function clearNA(section) {
state-mgmt.js:345:function updateNAButtons() {
main.js:8:function getReportIdFromUrl() {
main.js:16:function dismissWarningBanner() { document.getElementById('permissionsWarningBanner').classList.add('hidden'); }
main.js:18:function checkAndShowWarningBanner() {
main.js:27:async function requestMicrophonePermission() {
main.js:46:async function requestLocationPermission() {
main.js:65:function updatePermissionUI(type, state) {
main.js:86:function closePermissionsModal() {
main.js:119:function updateLoadingStatus(message) {
main.js:124:function hideLoadingOverlay() {
photos.js:12:async function handlePhotoInput(e) {
photos.js:144:async function backgroundUploadPhoto(photoObj, dataUrl) {
photos.js:221:function updatePhotoUploadIndicator(photoId, status) {
photos.js:238:async function removePhoto(index) {
photos.js:274:async function updatePhotoCaption(index, value) {
photos.js:313:function autoExpandCaption(textarea) {
photos.js:325:async function savePhotoToIndexedDB(photo, base64Data) {
persistence.js:14:async function checkReportState() {
persistence.js:24:function showCancelReportModal() {
persistence.js:31:function hideCancelReportModal() {
persistence.js:38:async function confirmCancelReport() {
persistence.js:78:function saveToLocalStorage() {
persistence.js:200:async function loadDraftFromIDB() {
persistence.js:219:function restoreFromLocalStorage(localData) {
persistence.js:328:function clearLocalStorageDraft() {
persistence.js:344:function updateLocalReportToRefined() {
persistence.js:377:function _markBackupStale(reportId) {
persistence.js:380:function _clearBackupStale(reportId) {
persistence.js:383:function _getStaleBackupReportIds() {
persistence.js:401:async function drainPendingBackups() {
persistence.js:450:function _buildCanonicalPageStateFromDraft(draftData, reportId) {
persistence.js:527:function initGuidedAutoSave(textareaId, section) {
persistence.js:602:function initContractorWorkAutoSave(contractorId, crewId) {
persistence.js:687:function initAllGuidedAutoSave() {
persistence.js:704:function saveReport() {
persistence.js:721:function markInterviewBackupDirty() {
persistence.js:727:function buildInterviewPageState() {
persistence.js:775:function flushInterviewBackup() {
persistence.js:820:async function getReport() {
persistence.js:862:                    function _parseTs(ts) {
persistence.js:980:function applyDraftToReport(report, data) {
persistence.js:1008:function createFreshReport() {
persistence.js:1049:async function saveReportToSupabase() {
persistence.js:1104:async function uploadPhotoToSupabase(file, photoId, sourceFileName) {
persistence.js:1151:async function uploadPendingPhotos() {
persistence.js:1220:async function deletePhotoFromSupabase(photoId, storagePath) {
equipment-manual.js:11:function renderEquipmentSection() {
equipment-manual.js:95:function addEquipmentRow() {
equipment-manual.js:115:function updateEquipmentRow(rowId, field, value) {
equipment-manual.js:126:function deleteEquipmentRow(rowId) {
equipment-manual.js:138:function updateEquipmentPreview() {
equipment-manual.js:148:function hasEquipmentData() {
equipment-manual.js:157:function addIssue() {
equipment-manual.js:180:function removeIssue(index) {
equipment-manual.js:181:// Legacy function for backward compatibility with old array-based issues
equipment-manual.js:191:function removeInspection(index) { IS.report.qaqcNotes.splice(index, 1); saveReport(); renderSection('inspections'); }
equipment-manual.js:193:function addSafetyNote() {
equipment-manual.js:216:function removeSafetyNote(index) {
equipment-manual.js:217:// Legacy function for backward compatibility with old array-based notes
equipment-manual.js:227:function addCommunication() {
equipment-manual.js:250:function addQAQC() {
equipment-manual.js:273:function addVisitor() {
guided-sections.js:7:function initGuidedModeUI() {
guided-sections.js:35:function renderSection(section) {
guided-sections.js:371:function renderAllSections() {
guided-sections.js:378:function toggleSection(sectionId) {
guided-sections.js:397:function dismissDictationHint() {
guided-sections.js:403:function checkDictationHintBanner() {
finish-processing.js:14:function buildProcessPayload() {
finish-processing.js:83:async function callProcessWebhook(payload) {
finish-processing.js:155:async function saveAIResponse(originalPayload, response, processingTimeMs) {
finish-processing.js:190:function showNetworkErrorModal(title, message, onRetry, onDrafts) {
finish-processing.js:223:function hideNetworkErrorModal() {
finish-processing.js:233:function handleOfflineProcessing(_payload, redirectToDrafts = false) {
finish-processing.js:266:async function finishReportFlow(options) {
finish-processing.js:479:async function finishMinimalReport() {
finish-processing.js:519:async function finishReport() {
finish-processing.js:616:function getTodayDateFormatted() {
contractors-personnel.js:8:function getContractorActivity(contractorId) {
contractors-personnel.js:16:function initializeContractorActivities() {
contractors-personnel.js:34:function buildEntriesHtml(entries) {
contractors-personnel.js:69:function renderContractorWorkCards() {
contractors-personnel.js:239:function toggleContractorCard(contractorId) {
contractors-personnel.js:255:function toggleNoWork(contractorId, isNoWork) {
contractors-personnel.js:280:function toggleCrewNoWork(contractorId, crewId, isNoWork) {
contractors-personnel.js:311:function getContractorWorkEntries(contractorId) {
contractors-personnel.js:321:function getCrewWorkEntries(contractorId, crewId) {
contractors-personnel.js:331:function addContractorWorkEntry(contractorId, crewId) {
contractors-personnel.js:363:function deleteContractorWorkEntry(entryId) {
contractors-personnel.js:374:function updateActivitiesPreview() {
contractors-personnel.js:432:function getTradeAbbreviation(trades) {
contractors-personnel.js:478:function getContractorOperations(contractorId) {
contractors-personnel.js:483:function initializeOperations() {
contractors-personnel.js:503:function renderPersonnelCards() {
contractors-personnel.js:623:function togglePersonnelCard(contractorId) {
contractors-personnel.js:630:function updateOperations(contractorId) {
contractors-personnel.js:634:const getValue = (id) => {
contractors-personnel.js:654:function updatePersonnelCardStyle(contractorId) {
contractors-personnel.js:696:function updatePersonnelTotals() {
contractors-personnel.js:727:function hasOperationsData() {
contractors-personnel.js:743:function getTotalPersonnelCount() {
freeform.js:15:function initMinimalModeUI() {
freeform.js:42:function migrateFreeformNotesToEntries() {
freeform.js:64:function initFreeformEntries() {
freeform.js:79:function addFreeformEntry() {
freeform.js:98:function renderFreeformEntries() {
freeform.js:150:function startFreeformEdit(entryId) {
freeform.js:220:function saveFreeformEdit(entryId) {
freeform.js:242:function deleteFreeformEntry(entryId) {
freeform.js:254:function renderFreeformChecklist() {
freeform.js:275:function toggleFreeformChecklistItem(item, checked) {
freeform.js:285:function updateMinimalWeatherDisplay() {
freeform.js:318:function renderMinimalPhotos() {
freeform.js:393:async function handleMinimalPhotoInput(e) {
freeform.js:475:async function deleteMinimalPhoto(idx) {
freeform.js:512:function updateMinimalPhotoCaption(idx, caption) {

REPORT_FUNCTIONS
debug.js:23:function detectFieldMismatches() {
debug.js:207:function initializeDebugPanel() {
debug.js:256:function updateDebugIssues() {
debug.js:282:function toggleDebugPanel() {
debug.js:301:function toggleDebugSection(sectionName) {
debug.js:319:function scrollToDebugPanel() {
debug.js:334:function dismissDebugBanner(event) {
debug.js:343:function formatDebugTimestamp() {
debug.js:357:function downloadDebugJSON() {
debug.js:390:function downloadDebugMarkdown() {
original-notes.js:9:function populateOriginalNotes() {
original-notes.js:73:function renderOriginalWorkByContractor(original, contractorMap) {
original-notes.js:147:function renderOriginalPersonnelTable(original, contractorMap) {
original-notes.js:193:function renderOriginalEquipmentTable(original, contractorMap) {
original-notes.js:222:function renderEntriesSection(original, sectionName, elementId) {
original-notes.js:245:function renderSafetySection(original) {
original-notes.js:276:function populateOriginalPhotos(photos) {
pdf-generator.js:14:async function generateVectorPDF() {
pdf-generator.js:49:    function setFont(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
pdf-generator.js:50:    function setTextColor(r, g, b) { doc.setTextColor(r, g, b); }
pdf-generator.js:51:    function setDrawColor(r, g, b) { doc.setDrawColor(r, g, b); }
pdf-generator.js:52:    function setFillColor(r, g, b) { doc.setFillColor(r, g, b); }
pdf-generator.js:54:    function wrapText(text, maxWidth, fontSize, fontStyle) {
pdf-generator.js:61:    function checkPageBreak(neededHeight) {
pdf-generator.js:73:    function drawPageFooter() {
pdf-generator.js:94:    function drawReportHeader() {
pdf-generator.js:124:    function drawSectionHeader(title) {
pdf-generator.js:138:    function drawCell(x, y, w, h, text, options) {
pdf-generator.js:152:    function drawTextBox(text, x, y, w, options) {
pdf-generator.js:225:    function formVal(id, fallback) {
pdf-generator.js:235:    function pdfFormatDate(dateStr) {
pdf-generator.js:248:    function pdfFormatTime(timeStr) {
pdf-generator.js:258:    function pdfCalcShift(start, end) {
pdf-generator.js:268:    function pdfFormatTradesAbbrev(trades) {
pdf-generator.js:291:    function pdfGetContractorName(contractorId, fallbackName) {
pdf-generator.js:298:    function pdfFormatEquipNotes(status, hoursUsed) {
pdf-generator.js:343:    function drawOverviewRow(l1, v1, l2, v2, opts) {
pdf-generator.js:743:async function loadImageAsDataURL(url) {
delete-report.js:9:function confirmDeleteReport() {
delete-report.js:17:function hideDeleteModal() {
delete-report.js:25:async function executeDeleteReport() {
main.js:121:function switchTab(tab) {
main.js:170:function updateHeaderDate() {
main.js:179:function goToFinalReview() {
main.js:184:function hideSubmitModal() {
main.js:188:function confirmSubmit() {
ai-refine.js:20:function checkPendingRefineStatus() {
ai-refine.js:33:function retryRefineProcessing() {
ai-refine.js:42:async function refineTextField(textareaId) {
ai-refine.js:139:async function refineContractorNarrative(contractorId) {
data-loading.js:31:function getReportDateStr() {
data-loading.js:41:async function loadReport() {
data-loading.js:96:                function _parseTimeOrNull(ts) {
data-loading.js:264:function createFreshReport() {
data-loading.js:319:function getValue(path, defaultValue) {
data-loading.js:348:function getNestedValue(obj, path) {
data-loading.js:352:function getAIValue(path, defaultValue) {
data-loading.js:361:function getTextFieldValue(reportPath, aiPath, defaultValue, legacyAiPath) {
data-loading.js:397:function setNestedValue(obj, path, value) {
data-loading.js:408:async function saveReportSilent() {
preview.js:15:function renderPreview() {
preview.js:24:    function cleanW(value, defaultVal) {
preview.js:32:    function formVal(id, fallback) {
preview.js:44:    function previewFormatDate(dateStr) {
preview.js:58:    function previewFormatTime(timeStr) {
preview.js:71:    function previewCalcShift(start, end) {
preview.js:84:    function previewFormatText(text) {
preview.js:91:    function previewFormatTradesAbbrev(trades) {
preview.js:105:    function previewGetContractorName(contractorId, fallbackName) {
preview.js:112:    function previewFormatEquipNotes(status, hoursUsed) {
preview.js:165:    function pageHeader() {
preview.js:455:function scalePreviewToFit() {
submit.js:16:async function handleSubmit() {
submit.js:105:async function uploadPDFToStorage(pdf) {
submit.js:132:async function ensureReportExists() {
submit.js:164:async function saveSubmittedReportData(pdfUrl, pdfPath) {
submit.js:190:async function updateReportStatus(status) {
submit.js:225:async function cleanupLocalStorage() {
submit.js:256:function formVal(id, fallback) {
submit.js:269:function showSubmitLoadingOverlay(show, statusText) {
submit.js:308:function showSubmitError(message) {
autosave.js:17:function _deferFieldUpdate(fieldId, value) {
autosave.js:21:        el.addEventListener('blur', function onBlur() {
autosave.js:40:function setupAutoSave() {
autosave.js:146:function scheduleSave() {
autosave.js:153:async function saveReport() {
autosave.js:162:function markReportBackupDirty() {
autosave.js:168:function flushReportBackup() {
autosave.js:199:function saveReportToLocalStorage() {
autosave.js:249:async function saveReportToSupabase(options) {
autosave.js:307:function showSaveIndicator() {
autosave.js:316:function saveNow() {
form-fields.js:18:function populateAllFields() {
form-fields.js:151:function calculateShiftDuration() {
form-fields.js:179:function markUserEditedFields() {
form-fields.js:189:function pathToFieldId(path) {
form-fields.js:222:function renderWorkSummary() {
form-fields.js:364:function getContractorActivity(contractorId) {
form-fields.js:404:function toggleNoWork(contractorId, isNoWork) {
form-fields.js:424:function setupContractorListeners() {
form-fields.js:494:function updateContractorActivity(contractorId) {
form-fields.js:527:function toggleCrewNoWork(contractorId, crewId, isNoWork) {
form-fields.js:546:function updateCrewActivity(contractorId, crewId) {
form-fields.js:569:function renderPersonnelTable() {
form-fields.js:612:function getContractorOperations(contractorId) {
form-fields.js:654:function updatePersonnelRow(contractorId) {
form-fields.js:683:function updatePersonnelTotals() {
form-fields.js:708:function getEquipmentData() {
form-fields.js:750:function renderEquipmentTable() {
form-fields.js:799:function setupEquipmentListeners() {
form-fields.js:807:function updateEquipmentRow(row) {
form-fields.js:827:function addEquipmentRow() {
form-fields.js:861:function renderPhotos() {
form-fields.js:965:function handlePhotoLoad(index) {
form-fields.js:987:async function handlePhotoError(index) {
form-fields.js:1035:function debounce(func, wait) {
form-fields.js:1053:function saveTextFieldEdits() {
form-fields.js:1078:function getCrewActivity(contractorId, crewId) {
```

## Appendix B: Event Listener Inventory (from scoped folders)

```text
INDEX_EVENTS
 - js/shared/console-capture.js:98:    window.addEventListener('error', function(event) {
 - js/shared/console-capture.js:102:    window.addEventListener('unhandledrejection', function(event) {
 - js/shared/console-capture.js:110:    window.addEventListener('pagehide', function() { _flush(); });
 - js/shared/console-capture.js:111:    document.addEventListener('visibilitychange', function() {
 - js/index/main.js:179:document.addEventListener('DOMContentLoaded', async () => {
 - js/index/main.js:639:window.addEventListener('pageshow', function(event) {
 - js/index/main.js:658:document.addEventListener('visibilitychange', function() {
 - js/index/main.js:667:window.addEventListener('focus', function() {
 - js/shared/realtime-sync.js:341:window.addEventListener('beforeunload', cleanupRealtimeSync);
 - js/shared/realtime-sync.js:344:window.addEventListener('online', function() {
 - js/shared/realtime-sync.js:365:window.addEventListener('offline', function() {
 - js/shared/realtime-sync.js:370:document.addEventListener('visibilitychange', function() {
 - js/shared/realtime-sync.js:379:window.addEventListener('pageshow', function(event) {
 - js/shared/ai-assistant.js:99:        document.getElementById('aiCloseBtn').addEventListener('click', closeAssistant);
 - js/shared/ai-assistant.js:100:        document.getElementById('aiHelpBtn').addEventListener('click', showHelp);
 - js/shared/ai-assistant.js:101:        document.getElementById('aiSendBtn').addEventListener('click', sendMessage);
 - js/shared/ai-assistant.js:102:        document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
 - js/shared/ai-assistant.js:144:        btn.addEventListener('touchstart', function (e) {
 - js/shared/ai-assistant.js:156:        btn.addEventListener('touchmove', function (e) {
 - js/shared/ai-assistant.js:170:        btn.addEventListener('touchend', function () {
 - js/shared/ai-assistant.js:193:        btn.addEventListener('dblclick', function (e) {
 - js/shared/ai-assistant.js:809:        document.addEventListener('DOMContentLoaded', () => { injectUI(); initGPS(); });
 - js/index/deep-links.js:15:    window.addEventListener('load', function() {
 - js/index/report-cards.js:463:        content.addEventListener('touchstart', (e) => {
 - js/index/report-cards.js:468:        content.addEventListener('touchmove', (e) => {
 - js/index/report-cards.js:480:        content.addEventListener('touchend', onEnd);
 - js/index/report-cards.js:481:        content.addEventListener('touchcancel', onEnd);
 - js/index/report-cards.js:487:        content.addEventListener('click', (e) => {
 - js/index/report-cards.js:496:        content.addEventListener('mousedown', (e) => {
 - js/index/report-cards.js:516:            document.addEventListener('mousemove', onMouseMove);
 - js/index/report-cards.js:517:            document.addEventListener('mouseup', onMouseUp);
 - js/index/field-tools.js:29:    carousel.addEventListener('touchstart', pauseCarousel, { passive: true });
 - js/index/field-tools.js:30:    carousel.addEventListener('pointerdown', pauseCarousel);
 - js/index/field-tools.js:31:    carousel.addEventListener('touchend', scheduleResume, { passive: true });
 - js/index/field-tools.js:32:    carousel.addEventListener('pointerup', scheduleResume);
 - js/shared/pull-to-refresh.js:17:    document.addEventListener('touchstart', function(e) {
 - js/shared/pull-to-refresh.js:24:    document.addEventListener('touchmove', function(e) {
 - js/shared/pull-to-refresh.js:33:    document.addEventListener('touchend', function() {
 - js/shared/pull-to-refresh.js:105:            btn.addEventListener('mouseenter', function() {
 - js/shared/pull-to-refresh.js:109:            btn.addEventListener('mouseleave', function() {
 - js/shared/pull-to-refresh.js:113:            btn.addEventListener('click', runManualRefresh);
 - js/shared/pull-to-refresh.js:119:            document.addEventListener('DOMContentLoaded', injectDesktopRefreshButton);

INTERVIEW_EVENTS
 - js/interview/ui-flow.js:195:window.addEventListener('online', onlineHandler);
 - js/interview/ui-flow.js:196:window.addEventListener('offline', offlineHandler);
 - js/interview/ui-flow.js:216:goBtn.addEventListener('click', onConfirm);
 - js/interview/ui-flow.js:217:cancelBtn.addEventListener('click', onCancel);
 - js/interview/ui-flow.js:246:window.addEventListener('beforeunload', _blockUnload);
 - js/interview/ui-flow.js:249:document.addEventListener('keydown', _blockKeys, true);
 - js/interview/ui-flow.js:252:overlay.addEventListener('touchstart', _blockTouch, { passive: false, capture: true });
 - js/interview/ui-flow.js:253:overlay.addEventListener('touchmove', _blockTouch, { passive: false, capture: true });
 - js/interview/ui-flow.js:254:overlay.addEventListener('touchend', _blockTouch, { passive: false, capture: true });
 - js/interview/ui-flow.js:255:overlay.addEventListener('click', _blockTouch, true);
 - js/interview/ui-flow.js:256:overlay.addEventListener('mousedown', _blockTouch, true);
 - js/interview/ui-flow.js:257:overlay.addEventListener('contextmenu', _blockTouch, true);
 - js/shared/console-capture.js:98:    window.addEventListener('error', function(event) {
 - js/shared/console-capture.js:102:    window.addEventListener('unhandledrejection', function(event) {
 - js/shared/console-capture.js:110:    window.addEventListener('pagehide', function() { _flush(); });
 - js/shared/console-capture.js:111:    document.addEventListener('visibilitychange', function() {
 - js/interview/state-mgmt.js:123:        textarea.addEventListener('input', () => {
 - js/shared/ai-assistant.js:99:        document.getElementById('aiCloseBtn').addEventListener('click', closeAssistant);
 - js/shared/ai-assistant.js:100:        document.getElementById('aiHelpBtn').addEventListener('click', showHelp);
 - js/shared/ai-assistant.js:101:        document.getElementById('aiSendBtn').addEventListener('click', sendMessage);
 - js/shared/ai-assistant.js:102:        document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
 - js/shared/ai-assistant.js:144:        btn.addEventListener('touchstart', function (e) {
 - js/shared/ai-assistant.js:156:        btn.addEventListener('touchmove', function (e) {
 - js/shared/ai-assistant.js:170:        btn.addEventListener('touchend', function () {
 - js/shared/ai-assistant.js:193:        btn.addEventListener('dblclick', function (e) {
 - js/shared/ai-assistant.js:809:        document.addEventListener('DOMContentLoaded', () => { injectUI(); initGPS(); });
 - js/interview/main.js:93:document.getElementById('site-conditions-input').addEventListener('change', (e) => {
 - js/interview/main.js:99:document.getElementById('no-incidents').addEventListener('change', (e) => {
 - js/interview/main.js:107:document.getElementById('has-incidents').addEventListener('change', (e) => {
 - js/interview/main.js:116:document.getElementById('photoInput').addEventListener('change', handlePhotoInput);
 - js/interview/main.js:135:document.addEventListener('DOMContentLoaded', async () => {
 - js/interview/main.js:140:document.getElementById('processingRetryBtn')?.addEventListener('click', () => {
 - js/interview/main.js:151:document.getElementById('processingSaveDraftBtn')?.addEventListener('click', () => {
 - js/interview/main.js:308:document.addEventListener('visibilitychange', () => {
 - js/interview/main.js:317:window.addEventListener('pagehide', (event) => {
 - js/interview/main.js:329:window.addEventListener('pageshow', (event) => {
 - js/interview/main.js:337:window.addEventListener('online', () => {
 - js/shared/pull-to-refresh.js:17:    document.addEventListener('touchstart', function(e) {
 - js/shared/pull-to-refresh.js:24:    document.addEventListener('touchmove', function(e) {
 - js/shared/pull-to-refresh.js:33:    document.addEventListener('touchend', function() {
 - js/shared/pull-to-refresh.js:105:            btn.addEventListener('mouseenter', function() {
 - js/shared/pull-to-refresh.js:109:            btn.addEventListener('mouseleave', function() {
 - js/shared/pull-to-refresh.js:113:            btn.addEventListener('click', runManualRefresh);
 - js/shared/pull-to-refresh.js:119:            document.addEventListener('DOMContentLoaded', injectDesktopRefreshButton);
 - js/interview/persistence.js:538:textarea.addEventListener('input', () => {
 - js/interview/persistence.js:579:textarea.addEventListener('blur', () => {
 - js/interview/persistence.js:616:textarea.addEventListener('input', () => {
 - js/interview/persistence.js:657:textarea.addEventListener('blur', () => {
 - js/shared/realtime-sync.js:341:window.addEventListener('beforeunload', cleanupRealtimeSync);
 - js/shared/realtime-sync.js:344:window.addEventListener('online', function() {
 - js/shared/realtime-sync.js:365:window.addEventListener('offline', function() {
 - js/shared/realtime-sync.js:370:document.addEventListener('visibilitychange', function() {
 - js/shared/realtime-sync.js:379:window.addEventListener('pageshow', function(event) {
 - js/interview/finish-processing.js:207:    newRetryBtn.addEventListener('click', () => {
 - js/interview/finish-processing.js:212:    newDraftsBtn.addEventListener('click', () => {
 - js/interview/freeform.js:35:photoInput.addEventListener('change', handleMinimalPhotoInput);
 - js/interview/freeform.js:171:textarea.addEventListener('input', () => {
 - js/interview/freeform.js:186:textarea.addEventListener('blur', () => {

REPORT_EVENTS
 - js/shared/console-capture.js:98:    window.addEventListener('error', function(event) {
 - js/shared/console-capture.js:102:    window.addEventListener('unhandledrejection', function(event) {
 - js/shared/console-capture.js:110:    window.addEventListener('pagehide', function() { _flush(); });
 - js/shared/console-capture.js:111:    document.addEventListener('visibilitychange', function() {
 - js/report/main.js:20:document.addEventListener('DOMContentLoaded', async function() {
 - js/report/main.js:113:        window.addEventListener('resize', function() { scalePreviewToFit(); });
 - js/report/main.js:193:document.addEventListener('visibilitychange', function() {
 - js/report/main.js:215:window.addEventListener('pagehide', function(event) {
 - js/shared/ai-assistant.js:99:        document.getElementById('aiCloseBtn').addEventListener('click', closeAssistant);
 - js/shared/ai-assistant.js:100:        document.getElementById('aiHelpBtn').addEventListener('click', showHelp);
 - js/shared/ai-assistant.js:101:        document.getElementById('aiSendBtn').addEventListener('click', sendMessage);
 - js/shared/ai-assistant.js:102:        document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
 - js/shared/ai-assistant.js:144:        btn.addEventListener('touchstart', function (e) {
 - js/shared/ai-assistant.js:156:        btn.addEventListener('touchmove', function (e) {
 - js/shared/ai-assistant.js:170:        btn.addEventListener('touchend', function () {
 - js/shared/ai-assistant.js:193:        btn.addEventListener('dblclick', function (e) {
 - js/shared/ai-assistant.js:809:        document.addEventListener('DOMContentLoaded', () => { injectUI(); initGPS(); });
 - js/shared/pull-to-refresh.js:17:    document.addEventListener('touchstart', function(e) {
 - js/shared/pull-to-refresh.js:24:    document.addEventListener('touchmove', function(e) {
 - js/shared/pull-to-refresh.js:33:    document.addEventListener('touchend', function() {
 - js/shared/pull-to-refresh.js:105:            btn.addEventListener('mouseenter', function() {
 - js/shared/pull-to-refresh.js:109:            btn.addEventListener('mouseleave', function() {
 - js/shared/pull-to-refresh.js:113:            btn.addEventListener('click', runManualRefresh);
 - js/shared/pull-to-refresh.js:119:            document.addEventListener('DOMContentLoaded', injectDesktopRefreshButton);
 - js/shared/realtime-sync.js:341:window.addEventListener('beforeunload', cleanupRealtimeSync);
 - js/shared/realtime-sync.js:344:window.addEventListener('online', function() {
 - js/shared/realtime-sync.js:365:window.addEventListener('offline', function() {
 - js/shared/realtime-sync.js:370:document.addEventListener('visibilitychange', function() {
 - js/shared/realtime-sync.js:379:window.addEventListener('pageshow', function(event) {
 - js/report/autosave.js:21:        el.addEventListener('blur', function onBlur() {
 - js/report/autosave.js:78:        field.addEventListener('input', function() {
 - js/report/autosave.js:91:        field.addEventListener('blur', function() {
 - js/report/autosave.js:104:            field.addEventListener('change', calculateShiftDuration);
 - js/report/autosave.js:110:        radio.addEventListener('change', function() {
 - js/report/autosave.js:126:        generalSummary.addEventListener('input', function() {
 - js/report/autosave.js:136:        generalSummary.addEventListener('blur', function() {
 - js/report/form-fields.js:428:        el.addEventListener('input', function() {
 - js/report/form-fields.js:434:        el.addEventListener('blur', function() {
 - js/report/form-fields.js:446:        el.addEventListener('input', function() {
 - js/report/form-fields.js:450:        el.addEventListener('blur', function() {
 - js/report/form-fields.js:462:        el.addEventListener('input', function() {
 - js/report/form-fields.js:466:        el.addEventListener('blur', function() {
 - js/report/form-fields.js:478:        el.addEventListener('input', function() {
 - js/report/form-fields.js:483:        el.addEventListener('blur', function() {
 - js/report/form-fields.js:599:        input.addEventListener('change', function() {
 - js/report/form-fields.js:802:            input.addEventListener('change', function() { updateEquipmentRow(row); });
 - js/report/form-fields.js:853:        input.addEventListener('change', function() { updateEquipmentRow(newRow); });
 - js/report/form-fields.js:942:        textarea.addEventListener('blur', function() {
 - js/report/form-fields.js:950:        textarea.addEventListener('input', debounce(function() {
```

## Appendix C: Supabase Call Inventory (from scoped folders)

```text
SUPABASE_CALLS_ALL
 - js/shared/data-store.js:597:            if (typeof supabaseClient === 'undefined' || !supabaseClient) {
 - js/shared/data-store.js:598:                console.warn('[data-store] syncReportsFromCloud: no supabaseClient');
 - js/shared/data-store.js:610:            return supabaseClient
 - js/shared/data-store.js:611:                .from('reports')
 - js/shared/data-store.js:729:                                    supabaseClient
 - js/shared/data-store.js:730:                                        .from('reports')
 - js/shared/delete-report.js:22:    var client = supabaseClient;
 - js/shared/delete-report.js:25:        return { success: false, errors: ['Missing reportId or supabaseClient'] };
 - js/shared/delete-report.js:32:            .from('photos')
 - js/shared/delete-report.js:45:            await client.storage.from('report-photos').remove(photoPaths);
 - js/shared/delete-report.js:55:            await client.from(childTables[i]).delete().eq('report_id', reportId);
 - js/shared/delete-report.js:65:            .from('reports')
 - js/shared/delete-report.js:76:                .from('final_reports')
 - js/shared/delete-report.js:93:            await client.storage.from('report-pdfs').remove([storagePath]);
 - js/shared/delete-report.js:101:        await client.from('final_reports').delete().eq('report_id', reportId);
 - js/shared/delete-report.js:108:        await client.from('photos').delete().eq('report_id', reportId);
 - js/shared/delete-report.js:115:        await client.from('reports').delete().eq('id', reportId);
 - js/shared/delete-report.js:174:    if (typeof supabaseClient !== 'undefined' && supabaseClient && reportId.length === 36) {
 - js/shared/delete-report.js:176:            var updateResult = await supabaseClient
 - js/shared/delete-report.js:177:                .from('reports')
 - js/index/cloud-recovery.js:6:// - config.js: supabaseClient
 - js/index/cloud-recovery.js:18:    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
 - js/index/cloud-recovery.js:30:    supabaseClient
 - js/index/cloud-recovery.js:31:        .from('reports')
 - js/index/cloud-recovery.js:111:                    supabaseClient
 - js/index/cloud-recovery.js:112:                        .from('report_data')
 - js/index/cloud-recovery.js:218:    supabaseClient
 - js/index/cloud-recovery.js:219:        .from('interview_backup')
 - js/interview/photos.js:189:            supabaseClient.from('photos').upsert({
 - js/shared/console-capture.js:65:        if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
 - js/shared/console-capture.js:68:        supabaseClient
 - js/shared/console-capture.js:69:            .from('debug_logs')
 - js/shared/realtime-sync.js:21:    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) return;
 - js/shared/realtime-sync.js:34:    var reportsChannel = supabaseClient
 - js/shared/realtime-sync.js:35:        .channel('reports-sync')
 - js/shared/realtime-sync.js:55:        var projectsChannel = supabaseClient
 - js/shared/realtime-sync.js:56:            .channel('projects-sync')
 - js/shared/realtime-sync.js:80:            supabaseClient.removeChannel(ch);
 - js/shared/realtime-sync.js:103:    if (!navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
 - js/shared/realtime-sync.js:108:    supabaseClient
 - js/shared/realtime-sync.js:109:        .from('report_data')
 - js/shared/ai-assistant.js:733:        const sessionResult = await supabaseClient.auth.getSession();
 - js/report/submit.js:38:            var dupResult = await supabaseClient
 - js/report/submit.js:39:                .from('reports')
 - js/report/submit.js:108:    var result = await supabaseClient
 - js/report/submit.js:110:        .from('report-pdfs')
 - js/report/submit.js:119:    var urlResult = await supabaseClient
 - js/report/submit.js:121:        .from('report-pdfs')
 - js/report/submit.js:152:    var result = await supabaseClient
 - js/report/submit.js:153:        .from('reports')
 - js/report/submit.js:179:    var result = await supabaseClient
 - js/report/submit.js:180:        .from('reports')
 - js/report/submit.js:192:    var result = await supabaseClient
 - js/report/submit.js:193:        .from('reports')
 - js/shared/cloud-photos.js:9:// - config.js: supabaseClient
 - js/shared/cloud-photos.js:21:    if (!reportId || typeof supabaseClient === 'undefined' || !supabaseClient) return [];
 - js/shared/cloud-photos.js:25:        var result = await supabaseClient
 - js/shared/cloud-photos.js:26:            .from('photos')
 - js/shared/cloud-photos.js:40:                var urlResult = await supabaseClient.storage
 - js/shared/cloud-photos.js:41:                    .from('report-photos')
 - js/shared/cloud-photos.js:91:    if (typeof supabaseClient === 'undefined' || !supabaseClient) return photos;
 - js/shared/cloud-photos.js:97:            var result = await supabaseClient.storage
 - js/shared/cloud-photos.js:98:                .from('report-photos')
 - js/shared/cloud-photos.js:120:    if (typeof supabaseClient === 'undefined' || !supabaseClient) return {};
 - js/shared/cloud-photos.js:124:        var result = await supabaseClient
 - js/shared/cloud-photos.js:125:            .from('photos')
 - js/shared/cloud-photos.js:143:                var urlResult = await supabaseClient.storage
 - js/shared/cloud-photos.js:144:                    .from('report-photos')
 - js/report/ai-refine.js:76:        var sessionResult = await supabaseClient.auth.getSession();
 - js/report/ai-refine.js:174:        var sessionResult = await supabaseClient.auth.getSession();
 - js/index/report-cards.js:620:    if (!options.skipCloud && navigator.onLine && typeof supabaseClient !== 'undefined' && supabaseClient) {
 - js/index/report-cards.js:622:            var query = supabaseClient
 - js/index/report-cards.js:623:                .from('reports')
 - js/report/autosave.js:183:        return supabaseClient
 - js/report/autosave.js:184:            .from('report_data')
 - js/report/autosave.js:280:        var result = await supabaseClient
 - js/report/autosave.js:281:            .from('reports')
 - js/interview/finish-processing.js:84:    const sessionResult = await supabaseClient.auth.getSession();
 - js/interview/finish-processing.js:170:        const { error } = await supabaseClient
 - js/interview/finish-processing.js:171:            .from('ai_submissions')
 - js/interview/finish-processing.js:391:                    return supabaseClient
 - js/interview/finish-processing.js:392:                        .from('report_data')
 - js/index/report-creation.js:8:// - config.js: supabaseClient
 - js/index/report-creation.js:22:    if (typeof supabaseClient === 'undefined' || !supabaseClient) return Promise.resolve();
 - js/index/report-creation.js:36:    return supabaseClient
 - js/index/report-creation.js:37:        .from('reports')
 - js/report/data-loading.js:84:            var rdResult = await supabaseClient
 - js/report/data-loading.js:85:                .from('report_data')
 - js/report/data-loading.js:135:                        var metaResult = await supabaseClient
 - js/report/data-loading.js:136:                            .from('reports')
 - js/report/form-fields.js:997:    var client = (typeof supabaseClient !== 'undefined' && supabaseClient)
 - js/report/form-fields.js:998:        ? supabaseClient
 - js/report/form-fields.js:999:        : (typeof window !== 'undefined' ? window.supabaseClient : null);
 - js/report/form-fields.js:1008:                .from('report-photos')
 - js/interview/persistence.js:402:    if (!navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) return;
 - js/interview/persistence.js:429:            var result = await supabaseClient
 - js/interview/persistence.js:430:                .from('interview_backup')
 - js/interview/persistence.js:787:    return supabaseClient
 - js/interview/persistence.js:788:        .from('interview_backup')
 - js/interview/persistence.js:849:                var result = await supabaseClient
 - js/interview/persistence.js:850:                    .from('interview_backup')
 - js/interview/persistence.js:1073:        const { error: reportError } = await supabaseClient
 - js/interview/persistence.js:1074:            .from('reports')
 - js/interview/persistence.js:1114:        const { data, error } = await supabaseClient.storage
 - js/interview/persistence.js:1115:            .from('report-photos')
 - js/interview/persistence.js:1130:        const { data: urlData, error: urlError } = await supabaseClient.storage
 - js/interview/persistence.js:1131:            .from('report-photos')
 - js/interview/persistence.js:1187:                const { error } = await supabaseClient
 - js/interview/persistence.js:1188:                    .from('photos')
 - js/interview/persistence.js:1224:            await supabaseClient.storage
 - js/interview/persistence.js:1225:                .from('report-photos')
 - js/interview/persistence.js:1230:        await supabaseClient
 - js/interview/persistence.js:1231:            .from('photos')
```
