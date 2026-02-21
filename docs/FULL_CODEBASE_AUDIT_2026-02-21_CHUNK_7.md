# FULL CODEBASE AUDIT — 2026-02-21 — Chunk 7

Scope:
- `js/ui-utils.js`
- `js/pwa-utils.js`
- `js/media-utils.js`
- `js/report-rules.js`
- `sw.js`
- `js/outdated/autosave.js`
- `js/outdated/persistence.js`
- `js/outdated/realtime-sync.js`
- `js/outdated/sync-merge.js`

---

## 1) `js/ui-utils.js`

### 1. PURPOSE
`ui-utils.js` is a shared helper module for UI-safe rendering (`escapeHtml`), toast notifications, date/time formatting, textarea auto-expand behavior, and location cache helpers. It centralizes small cross-page utility functions and exposes them globally. It also contains geolocation caching logic (read/write/clear + fresh GPS fallback), which is data-oriented rather than purely UI-oriented.

### 2. LOCALSTORAGE
- `STORAGE_KEYS.LOC_GRANTED` (`fvp_loc_granted`):
  - Read: `js/ui-utils.js:245`, `js/ui-utils.js:334`
  - Write: `js/ui-utils.js:271`
  - Remove: `js/ui-utils.js:281`
- `STORAGE_KEYS.LOC_LAT` (`fvp_loc_lat`):
  - Read: `js/ui-utils.js:248`
  - Write: `js/ui-utils.js:268`
  - Remove: `js/ui-utils.js:278`
- `STORAGE_KEYS.LOC_LNG` (`fvp_loc_lng`):
  - Read: `js/ui-utils.js:249`
  - Write: `js/ui-utils.js:269`
  - Remove: `js/ui-utils.js:279`
- `STORAGE_KEYS.LOC_TIMESTAMP` (`fvp_loc_timestamp`):
  - Read: `js/ui-utils.js:250`
  - Write: `js/ui-utils.js:270`
  - Remove: `js/ui-utils.js:280`

### 3. INDEXEDDB
- None directly.

### 4. SUPABASE
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Mixed responsibility: location persistence and permission heuristics are embedded in a UI utility file (`js/ui-utils.js:238-385`), which increases coupling.
- `showToast()` permits raw HTML when `onClick` is provided (`js/ui-utils.js:56-60`); safe when caller controls content, but this is a latent XSS footgun if untrusted text is passed.
- `FIX` marker present in comments (`js/ui-utils.js:315-317`) but no TODO/FIXME blockers.

### 7. DEPENDENCIES
Depends on:
- `STORAGE_KEYS` global (`js/storage-keys.js`) for location keys.
- Browser APIs: `navigator.geolocation`, `navigator.permissions`, DOM APIs.

Depended on by:
- Script-included in pages: `index.html:33`, `quick-interview.html:38`, `report.html:36`, `archives.html:89`, `projects.html:24`, `project-config.html:29`, `permissions.html:24`, `settings.html:26`.
- Location helpers used by: `js/index/weather.js:28`, `js/index/panels.js:232`, `js/tools/maps.js:113`, `js/tools/measure.js:29`, `js/interview/ui-display.js:11`, `js/tools/photo-markup.js:84`, etc.
- `escapeHtml/showToast` used across index/interview/report/tools/project-config modules.

---

## 2) `js/pwa-utils.js`

### 1. PURPOSE
`pwa-utils.js` initializes PWA behaviors: standalone navigation handling, service worker registration, offline banner UI, and update banner UI. It is intended as a single initialization entrypoint (`initPWA`) for pages that need offline/PWA support.

### 2. LOCALSTORAGE
- None.

### 3. INDEXEDDB
- None.

### 4. SUPABASE
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Update UX gap: `showUpdateBanner()` reloads page (`js/pwa-utils.js:159-161`) but does not message SW with `SKIP_WAITING`; `sw.js` listens for `SKIP_WAITING` (`sw.js:369-370`) but this file never sends it.
- Service worker registration path is relative to current directory (`js/pwa-utils.js:49-50`), which is intentional but can complicate scope expectations if future pages move directories.

### 7. DEPENDENCIES
Depends on:
- `sw.js` existing at computed `pathDir + 'sw.js'` (`js/pwa-utils.js:50`).
- DOM structure for optional `#offline-banner` element.

Depended on by:
- Script-included in: `index.html:32`, `quick-interview.html:36`, `permissions.html:22`, `settings.html:25`, `project-config.html:27`, `projects.html:23`, `permission-debug.html:22`, `landing.html:23`.
- Invoked from page entry scripts: `js/index/main.js:185`, `js/interview/main.js:137`, `js/permissions/main.js:750`, `js/projects/main.js:297`, `js/project-config/main.js:73`, `js/settings/main.js:514`, `js/landing/main.js:2`, `js/permission-debug/main.js:731`.

---

## 3) `js/media-utils.js`

### 1. PURPOSE
`media-utils.js` handles media/file helpers (base64 conversion, compression), logo upload/delete to Supabase Storage, and high-accuracy GPS sampling for photos. It supports both local processing (canvas compression) and cloud storage integration for project logos.

### 2. LOCALSTORAGE
- None directly in this file.
- It calls location cache helpers from `ui-utils.js` (`getCachedLocation`, `cacheLocation`) at `js/media-utils.js:274`, `js/media-utils.js:293`.

### 3. INDEXEDDB
- None directly.

### 4. SUPABASE
- Storage bucket `project-logos`:
  - Upload: `js/media-utils.js:151-153`
  - Signed URL: `js/media-utils.js:164-167`
  - Delete/remove: `js/media-utils.js:199-201`
- Supabase client dependency checks:
  - `js/media-utils.js:135`, `js/media-utils.js:190`

Auth calls:
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- No retry wrapper around logo storage calls; transient network errors return `null` directly (`js/media-utils.js:158-177`, `js/media-utils.js:199-213`).
- Signed URL TTL is 1 hour (`js/media-utils.js:166`); caller code must refresh URLs or risk stale image links.

### 7. DEPENDENCIES
Depends on:
- `supabaseClient` global from `js/config.js`/`js/supabase-utils.js`.
- `getCachedLocation`, `cacheLocation`, `clearCachedLocation` (from `ui-utils.js`) in GPS flow.
- Optional `showToast` for weak GPS warning (`js/media-utils.js:298-300`).

Depended on by:
- Script-included in `quick-interview.html:40`, `project-config.html:539`.
- Logo flow consumers: `js/project-config/form.js:63`, `js/project-config/form.js:76`, `js/project-config/form.js:105`.
- GPS consumers: `js/interview/photos.js:49`, `js/interview/freeform.js:404`, `js/tools/photo-markup.js:76`.

---

## 4) `js/report-rules.js`

### 1. PURPOSE
`report-rules.js` contains business rule validation/state rules for report lifecycle, status transitions, mode switching, and submit/refine preconditions. It exposes constants and helper methods to global `window` for non-module pages. It also includes project cache freshness logic via storage timestamp + data-layer refresh.

### 2. LOCALSTORAGE
(through storage helper wrappers)
- `STORAGE_KEYS.PROJECTS` (`fvp_projects`): read via `getStorageItem` at `js/report-rules.js:200`
- `STORAGE_KEYS.PROJECTS_CACHE_TS` (`fvp_projects_cache_ts`):
  - Read: `js/report-rules.js:225`
  - Write: `js/report-rules.js:247`

### 3. INDEXEDDB
- No direct IDB calls.
- Indirect via `window.dataLayer.loadProjects()` (`js/report-rules.js:235`) and `window.dataLayer.refreshProjectsFromCloud()` (`js/report-rules.js:238-240`), which route through the data layer.

### 4. SUPABASE
- No direct Supabase calls.
- Indirect cloud refresh through `window.dataLayer.refreshProjectsFromCloud()` (`js/report-rules.js:238-240`).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Header dependency comment is stale/incomplete: says globals `STORAGE_KEYS, getStorageItem` (`js/report-rules.js:11-12`) but file also uses `setStorageItem` (`js/report-rules.js:247`).
- `ensureFreshProjectsCache()` loads projects (`js/report-rules.js:235`) but does not use returned value locally except timestamp update; intent appears to be side-effect refresh.

### 7. DEPENDENCIES
Depends on:
- `STORAGE_KEYS`, `getStorageItem`, `setStorageItem` globals from `js/storage-keys.js`.
- `window.dataLayer` methods for refresh behavior.
- Optional `window.currentReportsCache` fallback (`js/report-rules.js:89`).

Depended on by:
- Script-included in `index.html:30`, `quick-interview.html:33`.
- Used by dashboard/report flows: `js/index/report-creation.js:107`, `js/index/main.js:141`, `js/index/main.js:315`, `js/index/report-cards.js:175-209`, interview state logic comments/use patterns.

---

## 5) `sw.js`

### 1. PURPOSE
Service worker handles offline caching and request strategy selection for the PWA. It pre-caches static assets/CDN assets on install, clears old versioned caches on activate, and handles fetches using network-first for navigation/JS/API-like requests and cache-first for other static assets.

### 2. LOCALSTORAGE
- None.

### 3. INDEXEDDB
- None.

### 4. SUPABASE
- No direct Supabase client usage.
- Caches Supabase JS CDN URL as a static CDN asset (`sw.js:128`).

### 5. N8N/WEBHOOKS
- API pattern strings:
  - `'n8n'` (`sw.js:139`)
  - `'webhook'` (`sw.js:140`)
- Pattern matching logic in fetch handler:
  - `isApiCall = API_PATTERNS.some(pattern => url.href.includes(pattern));` (`sw.js:210`)

### 6. ISSUES
- **CRITICAL:** Edge Function URLs are not in `API_PATTERNS` (`sw.js:137-141`), while app calls Supabase Edge endpoints (`/functions/v1/...`). Those requests currently fall through to `handleStaticRequest` (`sw.js:225-246`), which attempts `cache.put(request, ...)` without method gating. For non-GET API requests this can throw and return 503 path.
- `API_PATTERNS` matching is broad substring logic (`sw.js:210`), which can cause false positives/negatives.
- Update path mismatch with app UI: SW listens for `SKIP_WAITING` (`sw.js:369-370`), but current PWA banner flow does not send it.

### 7. DEPENDENCIES
Depends on:
- Cache API/service worker APIs.
- Asset list staying aligned with repo.

Depended on by:
- Registered via `js/pwa-utils.js:50`.

### STATIC_ASSETS review
- `STATIC_ASSETS` entries are all present on disk at audit time.
  - Checked count: 96
  - Missing files: 0
- JS files in repo not listed in `STATIC_ASSETS`:
  - `js/api-keys.example.js`
  - `js/outdated/autosave.js`
  - `js/outdated/persistence.js`
  - `js/outdated/realtime-sync.js`
  - `js/outdated/sync-merge.js`
- No active (non-outdated) runtime JS file appears missing from `STATIC_ASSETS` based on current root HTML script references.

### Edge Function pattern check (requested lines 139-140, 210)
- Yes, this should be updated.
- Current `n8n/webhook` patterns are legacy-oriented and do not explicitly catch `SUPABASE_URL + '/functions/v1/...'` traffic.
- Recommended direction: include an explicit `'/functions/v1/'` or project-specific Supabase function domain pattern and guard caching logic by request method.

---

## 6) `js/outdated/autosave.js`

### 1. PURPOSE
Legacy report autosave/sync module for report page. It manages form auto-save, IDB persistence (`dataStore`), debounced cloud backup (`report_data`), and contained legacy live-sync merge helpers (`applyReportMerge`, sync revision/session fields).

### 2. LOCALSTORAGE
- `STORAGE_KEYS.ORG_ID` (`fvp_org_id`): read at `js/outdated/autosave.js:336`, `js/outdated/autosave.js:436`
- `STORAGE_KEYS.USER_ID` (`fvp_user_id`): read via helper `getStorageItem` at `js/outdated/autosave.js:437`

### 3. INDEXEDDB
(via `window.dataStore` abstraction)
- `window.dataStore.getReportData(...)` at `js/outdated/autosave.js:373` (reads `reportData` store)
- `window.dataStore.saveReportData(...)` at `js/outdated/autosave.js:390` (writes `reportData` store)
- `window.dataStore.saveReport(...)` at `js/outdated/autosave.js:391` (writes `currentReports` store)

### 4. SUPABASE
- Table `report_data`: upsert at `js/outdated/autosave.js:344-345`
- Table `reports`: upsert at `js/outdated/autosave.js:446-447`
- Uses `supabaseRetry(...)` wrapper for report_data sync at `js/outdated/autosave.js:342-346`

Auth/storage bucket calls:
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Outdated/duplicate with active `js/report/autosave.js`.
- Contains removed live-sync/broadcast logic that is not in active version (e.g., `initReportSyncBase`, `applyReportMerge`, revision/session plumbing).
- Header comment references old extraction origin (`js/outdated/autosave.js:3-8`) and is now archival only.

### 7. DEPENDENCIES
Depends on:
- `window.reportState`, `window.dataStore`, `supabaseClient`, `supabaseRetry`, `STORAGE_KEYS`, `getStorageItem`, UI globals.

Depended on by:
- No active HTML script includes or JS imports found.
- Runtime path uses `js/report/autosave.js` (`report.html:1411`).

---

## 7) `js/outdated/persistence.js`

### 1. PURPOSE
Legacy interview persistence/autosave module containing draft save/restore, backup draining, Supabase backup/report/photo upload, and older cross-device sync merge plumbing. It appears to be an archived predecessor to `js/interview/persistence.js`.

### 2. LOCALSTORAGE
- `fvp_sync_rev_{reportId}` (sessionStorage):
  - Read: `js/outdated/persistence.js:386`
  - Write: `js/outdated/persistence.js:899`
- `fvp_backup_stale_{reportId}`:
  - Write: `js/outdated/persistence.js:563`
  - Remove: `js/outdated/persistence.js:566`
  - Enumerated/read by prefix scan: `js/outdated/persistence.js:571-575`
- `STORAGE_KEYS.ORG_ID` (`fvp_org_id`): read at `js/outdated/persistence.js:592`, `js/outdated/persistence.js:983`, `js/outdated/persistence.js:1191`, `js/outdated/persistence.js:1302`
- `STORAGE_KEYS.USER_ID` (`fvp_user_id`): read via helper at `js/outdated/persistence.js:1192`

### 3. INDEXEDDB
(via `window.dataStore` and legacy `window.idb`)
- `window.dataStore.saveReport(...)`: `js/outdated/persistence.js:177`, `js/outdated/persistence.js:359`
- `window.dataStore.saveDraftData(...)`: `js/outdated/persistence.js:180`, `js/outdated/persistence.js:190`
- `window.dataStore.getDraftData(...)`: `js/outdated/persistence.js:214`, `js/outdated/persistence.js:599`, `js/outdated/persistence.js:1044`
- `window.dataStore.deleteDraftData(...)`: `js/outdated/persistence.js:345`
- `window.dataStore.getReport(...)`: `js/outdated/persistence.js:357`
- `window.idb.getPhotosBySyncStatus(...)`: `js/outdated/persistence.js:1281` (photos store)
- `window.idb.savePhoto(...)`: `js/outdated/persistence.js:1328` (photos store)

### 4. SUPABASE
Tables:
- `interview_backup`:
  - Upsert: `js/outdated/persistence.js:615-621`, `js/outdated/persistence.js:987-993`
  - Select: `js/outdated/persistence.js:1060-1063`
- `reports`: upsert at `js/outdated/persistence.js:1201-1202`
- `photos`: upsert at `js/outdated/persistence.js:1315-1316`; delete at `js/outdated/persistence.js:1358-1360`

Storage buckets:
- `report-photos`: upload `js/outdated/persistence.js:1242-1243`; signed URL `js/outdated/persistence.js:1258-1259`; remove `js/outdated/persistence.js:1352-1353`

Auth calls:
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Outdated/duplicate with active `js/interview/persistence.js`.
- Contains removed sync revision/session logic and merge application hooks no longer used in active runtime.
- Comment drift: multiple comments still say “localStorage” for operations that now route primarily through IDB/dataStore.

### 7. DEPENDENCIES
Depends on:
- `window.interviewState`, `window.dataStore`, `window.idb`, `supabaseClient`, `supabaseRetry`, `STORAGE_KEYS`, `getStorageItem`, plus many UI/page globals.

Depended on by:
- No active HTML script includes/imports found.
- Runtime path uses `js/interview/persistence.js` (`quick-interview.html:954`).

---

## 8) `js/outdated/realtime-sync.js`

### 1. PURPOSE
Legacy realtime sync engine for Supabase Realtime subscriptions (reports/report_data/projects) plus broadcast-channel merge logic for interview/report pages. It includes lifecycle re-init/cleanup and local cache synchronization into IDB/dataStore.

### 2. LOCALSTORAGE
- `STORAGE_KEYS.USER_ID` (`fvp_user_id`): read via helper fallback at `js/outdated/realtime-sync.js:24-25`
- `STORAGE_KEYS.ORG_ID` (`fvp_org_id`): read via helper fallback at `js/outdated/realtime-sync.js:63-64`

### 3. INDEXEDDB
(via `window.dataStore`)
- `getReportData/saveReportData`: `js/outdated/realtime-sync.js:321-331`, `js/outdated/realtime-sync.js:524-537`
- `deleteReport/deleteReportData/deleteDraftData/deletePhotosByReportId`: `js/outdated/realtime-sync.js:365-368`, `js/outdated/realtime-sync.js:476-479`
- `getReport/saveReport`: `js/outdated/realtime-sync.js:448-460`
- `deleteReportData`: `js/outdated/realtime-sync.js:552-553`

### 4. SUPABASE
Realtime channels:
- `reports-sync` channel on table `reports`: `js/outdated/realtime-sync.js:35-41`
- `reports-sync` additional table `report_data`: `js/outdated/realtime-sync.js:45-49`
- `projects-sync` channel on table `projects`: `js/outdated/realtime-sync.js:67-73`
- Broadcast channel `sync:{reportId}`: `js/outdated/realtime-sync.js:88-95`

REST/table operations:
- `interview_backup` select: `js/outdated/realtime-sync.js:201-204`
- `report_data` select: `js/outdated/realtime-sync.js:207-210`, `js/outdated/realtime-sync.js:314-317`

Auth calls:
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Outdated/duplicate with active `js/shared/realtime-sync.js`.
- Includes broadcast merge system and report_data subscription paths that were removed/changed in active file; if accidentally loaded with active code, globals would conflict (`window.initRealtimeSync`, `window.syncEngine` exports).
- Header claims loaded on pages including this file (`js/outdated/realtime-sync.js:9`) but that is no longer true for runtime.

### 7. DEPENDENCIES
Depends on:
- `supabaseClient`, `STORAGE_KEYS`, `getStorageItem`, `window.dataStore`, sync-related globals (`syncMerge`, `applyInterviewMerge`, `applyReportMerge`, etc.).

Depended on by:
- No active HTML script includes/imports found.
- Runtime uses `js/shared/realtime-sync.js` (`index.html:29`, `report.html:31`, `quick-interview.html:31`, `archives.html:88`).

---

## 9) `js/outdated/sync-merge.js`

### 1. PURPOSE
Legacy pure-function three-way merge engine for live sync conflict resolution (objects, arrays by ID, photo-aware merge, tombstone tracking). It exposes `window.syncMerge` and `window.syncMergeUtils`.

### 2. LOCALSTORAGE
- None.

### 3. INDEXEDDB
- None.

### 4. SUPABASE
- None directly (works on already-fetched objects only).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Entire file is effectively dead in current runtime (no active includes/imports found).
- No active `js/shared/sync-merge.js` file currently present; this archived version cannot contribute unless explicitly loaded.

### 7. DEPENDENCIES
Depends on:
- Browser global `window` for export.

Depended on by:
- No active runtime references found.

---

## Special Attention — `js/outdated/` Directory

### Are any outdated files still referenced by active HTML/JS?
- Searched for `js/outdated/autosave.js`, `js/outdated/persistence.js`, `js/outdated/realtime-sync.js`, `js/outdated/sync-merge.js` path references across HTML/JS.
- Result: **no active runtime references found**.

### Are functions duplicated in active codebase?
- Yes, heavily:
  - `js/outdated/autosave.js` duplicates core autosave functions in `js/report/autosave.js` (`setupAutoSave`, `scheduleSave`, `saveReport`, `flushReportBackup`, etc.).
  - `js/outdated/persistence.js` duplicates the large majority of interview persistence functions in `js/interview/persistence.js`.
  - `js/outdated/realtime-sync.js` duplicates realtime function names from `js/shared/realtime-sync.js` (`initRealtimeSync`, `cleanupRealtimeSync`, `_handleReportChange`, etc.).
- `js/outdated/sync-merge.js` is standalone legacy logic with no active include.

### Can `js/outdated/` be safely deleted?
- **Runtime safety:** Yes, based on current code paths, it can be deleted without affecting active page loads.
- **Caveat:** docs/changelog/historical references to these files will become stale and should be cleaned if deletion is performed.

---

## CHUNK SUMMARY

### Key findings
- `sw.js` asset list is internally consistent (no broken asset paths) and appears complete for active runtime JS.
- `sw.js` API pattern logic is stale for current Supabase Edge Function traffic.
- `js/outdated/` contains non-runtime duplicate code and is removable from runtime perspective.
- `ui-utils.js` still mixes UI and location data concerns.

### Issues by severity

#### CRITICAL
- `sw.js` API routing likely mishandles Supabase Edge Function requests:
  - Legacy patterns: `sw.js:139-140`
  - Match logic: `sw.js:210`
  - Falls into static handler/caching logic: `sw.js:225-247`
  - This is incompatible with modern `/functions/v1/...` API usage patterns and POST semantics.

#### WARNING
- `pwa-utils.js` update banner reloads without invoking `SKIP_WAITING` despite SW support (`js/pwa-utils.js:159-161`, `sw.js:369-370`).
- `js/outdated/` duplicates active modules and increases maintenance risk if accidentally reintroduced.
- `report-rules.js` dependency header is stale (`js/report-rules.js:11-12` vs actual `setStorageItem` use at `js/report-rules.js:247`).

#### INFO
- `STATIC_ASSETS` in `sw.js` currently has no nonexistent file entries.
- JS files excluded from `STATIC_ASSETS` are only `js/api-keys.example.js` and archived `js/outdated/*` files.
- No n8n/webhook/API key strings found in this chunk except SW pattern strings (`sw.js:139-140`).

### Cross-file concerns
- Duplicate logic in archived vs active modules (`outdated/*` vs `js/report/autosave.js`, `js/interview/persistence.js`, `js/shared/realtime-sync.js`) increases confusion and audit overhead.
- Service worker API detection (`sw.js`) is not aligned with current backend integration style (Edge Functions), creating cross-cutting runtime risk for report/interview AI flows.
- Utility boundary drift: `ui-utils.js` includes data/state behavior (location cache) while also serving pure UI concerns.

