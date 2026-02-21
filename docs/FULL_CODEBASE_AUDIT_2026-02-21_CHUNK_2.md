# FULL CODEBASE AUDIT — 2026-02-21 — CHUNK 2 (Dashboard / Index Page)

Scope audited:
- `js/index/main.js`
- `js/index/report-cards.js`
- `js/index/report-creation.js`
- `js/index/cloud-recovery.js`
- `js/index/calendar.js`
- `js/index/weather.js`
- `js/index/panels.js`
- `js/index/toggle-panel.js`
- `js/index/messages.js`
- `js/index/deep-links.js`
- `js/index/field-tools.js`

## `js/index/main.js`

### 1. PURPOSE
This is the dashboard orchestrator. It controls index-page boot, permissions/onboarding banners, local-first rendering, periodic refreshes, and multi-source synchronization (IndexedDB/local cache, cloud sync, weather, and broadcast events). It also handles refresh debouncing/cooldown logic for iOS back-navigation/PWA lifecycle behavior.

### 2. LOCALSTORAGE
Reads:
- `STORAGE_KEYS.MIC_GRANTED` via `localStorage.getItem` (`main.js:77`)
- `STORAGE_KEYS.LOC_GRANTED` via `localStorage.getItem` (`main.js:78`)
- `STORAGE_KEYS.ONBOARDED` via `localStorage.getItem` (`main.js:79`)
- `STORAGE_KEYS.BANNER_DISMISSED` via `localStorage.getItem` (`main.js:80`, `main.js:97`)
- `STORAGE_KEYS.BANNER_DISMISSED_DATE` via `localStorage.getItem` (`main.js:81`)
- Dynamic `fvp_ai_response_*` cache keys via `localStorage.key()` / `localStorage.getItem()` (`main.js:226-227`, `main.js:230`)
- Migration flag `STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR` via `localStorage.getItem` (`main.js:260`)
- `STORAGE_KEYS.DELETED_REPORT_IDS` via `localStorage.getItem` (`main.js:568`)
- `STORAGE_KEYS.PROJECTS` via `getStorageItem` (`main.js:526`, `main.js:614`)

Writes:
- `STORAGE_KEYS.BANNER_DISMISSED` via `localStorage.setItem` (`main.js:126`)
- `STORAGE_KEYS.BANNER_DISMISSED_DATE` via `localStorage.setItem` (`main.js:127`)
- Migration flag `STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR` via `localStorage.setItem` (`main.js:266`, `main.js:271`)
- `STORAGE_KEYS.DELETED_REPORT_IDS` trimmed via `localStorage.setItem` (`main.js:573`)

Deletes:
- `STORAGE_KEYS.BANNER_DISMISSED` via `localStorage.removeItem` (`main.js:88`)
- `STORAGE_KEYS.BANNER_DISMISSED_DATE` via `localStorage.removeItem` (`main.js:89`)
- Dynamic `fvp_ai_response_*` cache keys via `localStorage.removeItem` (`main.js:234`, `main.js:239`)

Session storage:
- `STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` set via `sessionStorage.setItem` (`main.js:133`, `main.js:165`)
- `STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` read via `sessionStorage.getItem` (`main.js:314`)

### 3. INDEXEDDB
Uses `window.dataStore` operations:
- `getAllReports()` (`main.js:34`, `main.js:407`, `main.js:550`) — reports read/hydration
- `replaceAllReports(reports)` (`main.js:64`) — full reports map rewrite
- `init()` (`main.js:188-189`) — dataStore init
- `clearStore('projects')` (`main.js:263-264`) — explicit `projects` store migration clear
- `syncReportsFromCloud()` (`main.js:540`, `main.js:543`) — cloud reconciliation into local DB
- `reset()` (`main.js:648-649`) — IDB connection reset after bfcache return

### 4. SUPABASE
No direct `supabaseClient` table/storage calls in this file. Cloud access is indirect through:
- `window.dataLayer.refreshProjectsFromCloud()` (`main.js:508`) and
- `window.dataStore.syncReportsFromCloud()` (`main.js:543`),
which likely wrap Supabase operations in shared modules.

Auth-related call:
- `window.auth.ready` await/timeout coordination (`main.js:282-283`) — app-level auth readiness gate (not a direct `supabaseClient.auth.*` call in this file).

### 5. N8N/WEBHOOKS
None found. No n8n URLs, webhook endpoints, or API keys embedded.

### 6. ISSUES
- Stale dependency comment references `updateActiveProjectCard` in header (`main.js:8-9`), but no such usage in this file.
- LocalStorage cleanup is hardcoded to prefix `'fvp_ai_response_'` (`main.js:228`) instead of a centralized key constant; this can drift from shared key definitions.
- High complexity / broad responsibility file (init, sync, UI banners, lifecycle, cooldown state machine) increases regression risk.

### 7. DEPENDENCIES
Depends on:
- Globals from `storage-keys.js`, `report-rules.js`, `data-layer.js`, `auth.js`, `shared/data-store.js`, `shared/realtime-sync.js`, `index/report-cards.js`, `index/cloud-recovery.js`, `index/weather.js`.
- Specifically: `STORAGE_KEYS`, `getStorageItem`, `getReportsByUrgency`, `renderReportCards`, `updateReportStatus`, `recoverCloudDrafts`, `syncWeather`, `initRealtimeSync`, `window.fvpBroadcast`, `window.auth`, `window.dataLayer`, `window.dataStore`.

Depended on by:
- `index.html` inline handlers: `dismissSubmittedBanner()` (`index.html:191`), and main page init flow through script load order (`index.html:715`).
- Other index modules rely on globals exposed/managed here (`projectsCache`, `getProjects`, `window.currentReportsCache`, refresh cycle).

---

## `js/index/report-cards.js`

### 1. PURPOSE
This file renders grouped report cards by project, status badges, and dashboard sections, then wires swipe-to-delete/dismiss interactions. It also owns dashboard-level dismiss behavior for submitted reports and invokes shared full-delete cascade for non-submitted reports.

### 2. LOCALSTORAGE
Reads:
- `STORAGE_KEYS.PROJECTS` via `getStorageItem` (`report-cards.js:27`)
- `STORAGE_KEYS.USER_ID` via `getStorageItem` for cloud dismiss query scoping (`report-cards.js:614`)

No direct `localStorage.*`/`sessionStorage.*` calls in this file.

### 3. INDEXEDDB
Uses `window.dataStore` operations:
- `getReport(reportId)` (`report-cards.js:637`) — fetch existing report
- `saveReport(localReport)` (`report-cards.js:642`) — persist `dashboard_dismissed_at`

IDB usage is report-centric; no explicit store name string is passed in this file.

### 4. SUPABASE
Table references:
- `reports` table update in dismiss flow (`report-cards.js:606-611`)
- Optional user filter `.eq('user_id', userId)` (`report-cards.js:615`)

No Supabase storage bucket references and no direct auth calls.

### 5. N8N/WEBHOOKS
None found.

### 6. ISSUES
- Unused function parameter `newData` in `updateReportCardStatus(reportId, newData)` (`report-cards.js:755`) indicates stale API shape/dead arg.
- Mixed UX patterns (`showToast` in some branches, `alert` in others) (`report-cards.js:727-731`, `report-cards.js:747`) create inconsistent user feedback.
- Header comments reference `getActiveProjectFromCache` (`report-cards.js:8`) but current file does not use it (stale doc).
- This file assumes global `deleteReportFull` exists (`report-cards.js:722`); missing script order would hard-fail delete path.

### 7. DEPENDENCIES
Depends on:
- `STORAGE_KEYS`, `getStorageItem` from `storage-keys.js`
- `getTodayDateString`, `REPORT_STATUS` from `report-rules.js`
- `escapeHtml`, `formatDate` from `ui-utils.js`
- `getProjects()` + `window.currentReportsCache` from `index/main.js`
- `deleteReportFull` from `js/shared/delete-report.js`
- Optional globals: `supabaseClient`, `showToast`, `window.dataStore`

Depended on by:
- `main.js` calls `renderReportCards()` and `updateReportStatus()` repeatedly (`main.js:136-137`, `main.js:491-492`, `main.js:581-582`, `main.js:619-620`)
- `main.js` calls `window.dismissReport()` (`main.js:153`)
- `cloud-recovery.js` calls `renderReportCards()` (`cloud-recovery.js:105`)
- `shared/realtime-sync.js` calls `window.renderReportCards`/`window.updateReportStatus`.

---

## `js/index/report-creation.js`

### 1. PURPOSE
This module handles “Begin Daily Report” flow from the dashboard: project picker modal, eligibility checks, duplicate-draft handling, UUID generation, and navigation into interview flow. It also pre-creates a draft report row in Supabase to reserve report identity before navigation.

### 2. LOCALSTORAGE
Reads:
- `STORAGE_KEYS.ORG_ID` via `getStorageItem` (`report-creation.js:24`)
- `STORAGE_KEYS.USER_ID` via `getStorageItem` (`report-creation.js:28`)

Writes:
- `STORAGE_KEYS.ACTIVE_REPORT_ID` via `setStorageItem` (`report-creation.js:207`, `report-creation.js:227`, `report-creation.js:245`)

### 3. INDEXEDDB
Uses `window.dataStore.getAllReports()`:
- Populate in-memory cache in picker load (`report-creation.js:69-73`)
- Duplicate detection pass by project/date/status (`report-creation.js:187-190`)

No explicit store name string in this file.

### 4. SUPABASE
Table references:
- `reports` table upsert in `createSupabaseReportRow` (`report-creation.js:37-38`)

No Supabase storage bucket calls and no direct auth calls.

### 5. N8N/WEBHOOKS
None found.

### 6. ISSUES
- Stale file header dependencies mention `window.idb`, `activeProjectCache`, `getActiveProjectFromCache`, and `updateActiveProjectCard` (`report-creation.js:9`, `report-creation.js:12-13`) that are no longer actually used or no longer canonical.
- `activeProjectCache?.projectName` used in duplicate modal fallback (`report-creation.js:199`) is unresolved in this file and appears vestigial.
- Mixed project routes: `openProjectConfig()` in `main.js` navigates to `projects.html`, while this file uses `project-config.html` (`report-creation.js:275`), which may indicate route drift.
- Comment says “Supabase cleanup in background” (`report-creation.js:242`) but code awaits `createSupabaseReportRow` before navigation (`report-creation.js:244`), so comment is stale/inaccurate.

### 7. DEPENDENCIES
Depends on:
- `STORAGE_KEYS`, `getStorageItem`, `setStorageItem`
- `getTodayDateString`, `canStartNewReport`, `REPORT_STATUS`
- `escapeHtml`, `formatDate`
- `supabaseClient`
- `getDeviceId`
- `window.dataLayer` and `window.dataStore`
- `deleteReportFull`

Depended on by:
- `report-cards.js` `Begin Daily Report` button calls `beginDailyReport()` (`report-cards.js:281`)
- `index.html` project picker modal content is rendered by this file (`index.html:735` comment).

---

## `js/index/cloud-recovery.js`

### 1. PURPOSE
This module recovers non-submitted cloud reports into local state so dashboard cards reflect work from other devices. It merges Supabase rows with local report map using updated-at conflict logic, then optionally backfills associated `report_data`, `interview_backup`, and cloud photos.

### 2. LOCALSTORAGE
Reads:
- `STORAGE_KEYS.USER_ID` via `getStorageItem` (`cloud-recovery.js:21`)
- `STORAGE_KEYS.PROJECTS` via `getStorageItem` (`cloud-recovery.js:45`)

No direct `localStorage.*` writes/deletes here.

### 3. INDEXEDDB
Uses `window.dataStore` operations:
- `getAllReports()` (`cloud-recovery.js:26`, `cloud-recovery.js:227`)
- `replaceAllReports(localReports)` (`cloud-recovery.js:102`)
- `saveReportData(report_id, localData)` (`cloud-recovery.js:129`, `cloud-recovery.js:171`)
- `getReportData(reportId)` (`cloud-recovery.js:164`)
- `getReport(reportId)` (`cloud-recovery.js:178`)
- `saveReport(currentReport)` (`cloud-recovery.js:181`)
- `replaceAllReports(currentReports)` in backup cache path (`cloud-recovery.js:270`)

No explicit store names passed, but operations imply `reports` and `report_data` stores.

### 4. SUPABASE
Table references:
- `reports` select (`cloud-recovery.js:31-35`)
- `report_data` select (`cloud-recovery.js:112-114`)
- `interview_backup` select (`cloud-recovery.js:219-221`)

Indirect Supabase data helper:
- `fetchCloudPhotosBatch(allRecoveredIds)` (`cloud-recovery.js:151-153`) likely queries cloud photos table/storage via shared module.

No direct auth calls in this file.

### 5. N8N/WEBHOOKS
None found.

### 6. ISSUES
- Header says it uses `setStorageItem` (`cloud-recovery.js:5`) but file does not call it (stale dependency comment).
- Log text says “already in localStorage” (`cloud-recovery.js:193`) even though canonical persistence is through `window.dataStore` (IndexedDB).
- Comment “Inject photos into report_data in localStorage” (`cloud-recovery.js:156`) is stale; implementation writes through IDB APIs.
- `recoveredIds` uses `Object.keys(localReports)` (`cloud-recovery.js:109`) after merge, which includes all local reports (not only newly recovered) and can over-fetch `report_data` rows.

### 7. DEPENDENCIES
Depends on:
- `STORAGE_KEYS`, `getStorageItem`
- `supabaseClient`
- `renderReportCards`
- `getProjects()` from main
- `isDeletedReport` and `fetchCloudPhotosBatch` (shared delete/photos modules)
- `window.dataStore`, `window.fvpBroadcast`

Depended on by:
- `main.js` calls `recoverCloudDrafts()` as fallback when full cloud sync did not run (`main.js:587`).

---

## `js/index/calendar.js`

### 1. PURPOSE
This file lazily renders the current month calendar grid into the calendar panel on first expansion. It uses a `MutationObserver` on panel class changes to defer rendering until visible.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None.

### 6. ISSUES
- Dead code: `origToggle` assigned but never used (`calendar.js:5`).
- No null guards for `panel`/`grid` before observer setup and render assignment (`calendar.js:2-3`, `calendar.js:13`, `calendar.js:39`); if IDs are missing, this can throw.

### 7. DEPENDENCIES
Depends on:
- DOM nodes `#calendarPanel` and `#calendarGrid`.

Depended on by:
- `index.html` loads it (`index.html:430`) and calendar panel toggling via `togglePanel('calendarPanel', ...)` triggers observer-visible render path (`index.html:414`).

---

## `js/index/weather.js`

### 1. PURPOSE
This module fetches weather/forecast data (Open-Meteo), updates the dashboard conditions strip, and caches weather metrics for downstream panels. It also computes flight status based on gust thresholds and optional sunrise/sunset window.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None. External APIs called:
- Open-Meteo forecast (`weather.js:43`)
- Sunrise-Sunset API (`weather.js:173`)

No API keys embedded.

### 6. ISSUES
- Stale file header: says dependency is `location.js` (`weather.js:5`), but location helpers currently come from `ui-utils.js`.
- `sunriseSunsetCache` is not populated in the main `syncWeather()` path even though sunrise/sunset data is fetched from Open-Meteo; daylight gating in `updateConditionsBar()` only applies after `fetchSunriseSunset()` runs elsewhere (`weather.js:94-95`, `weather.js:159-166`, `weather.js:170-191`).
- Potential retry recursion noise: `syncWeather()` can self-trigger from cached-location drift and from retry timer (`weather.js:102-111`, `weather.js:121-126`) without central cancellation/debounce.

### 7. DEPENDENCIES
Depends on:
- `getLocationFromCache()`, `getFreshLocation()` helpers
- DOM IDs for weather strip elements

Depended on by:
- `main.js` invokes `syncWeather()` in refresh flow (`main.js:500`)
- `panels.js` consumes `weatherDataCache`, `sunriseSunsetCache`, `fetchSunriseSunset()`, and `updateConditionsBar()`.

---

## `js/index/panels.js`

### 1. PURPOSE
This file lazy-loads panel content for weather details, drone ops, and emergency tools when their panel is first opened. It stitches together weather/location data and multiple external APIs to render operational context and emergency actions.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None. External API calls:
- Open-Meteo elevation API (`panels.js:134`)
- NOAA geomagnetic declination API (`panels.js:135`)
- Windy embed iframe URL (`panels.js:94`)
- Google Maps URLs (`panels.js:235`, `panels.js:268`, `panels.js:280`)

No API keys embedded.

### 6. ISSUES
- Stale file header: references `location.js` (`panels.js:5`) but helpers are in `ui-utils.js`.
- Duplicate wait loop logic for `weatherDataCache` in two panel loaders (`panels.js:31-36`, `panels.js:111-116`), suggesting extractable shared helper.
- `Promise.allSettled` fetches parse JSON without checking `response.ok` (`panels.js:134-136`), so non-200 responses can silently surface malformed data.

### 7. DEPENDENCIES
Depends on:
- `weather.js` globals (`weatherDataCache`, `fetchSunriseSunset`, `updateConditionsBar`)
- Location helpers (`getLocationFromCache`, `getCachedLocation`, `getFreshLocation`)
- `toggle-panel.js` invoking `onPanelOpen()`

Depended on by:
- `toggle-panel.js` calls `onPanelOpen(panelId)` (`toggle-panel.js:25-26`).

---

## `js/index/toggle-panel.js`

### 1. PURPOSE
This file centralizes panel open/close behavior and chevron rotation in the dashboard. It also enforces mutual exclusion between weather and drone-op panels and triggers lazy loading via `onPanelOpen`.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None.

### 6. ISSUES
- Missing null guard: `panel` is used immediately after lookup (`toggle-panel.js:2`, `toggle-panel.js:19`); invalid `panelId` can throw.
- Trigger lookup by CSS selector substring on inline `onclick` (`toggle-panel.js:11`) is brittle and tightly coupled to markup string format.

### 7. DEPENDENCIES
Depends on:
- DOM panel IDs and inline `onclick` trigger attributes
- Optional `onPanelOpen` from `panels.js`

Depended on by:
- Multiple `index.html` sections use `togglePanel(...)` for strip/panel toggles (`index.html:227`, `index.html:254`, `index.html:414`, `index.html:434`, `index.html:533`, `index.html:649`, `index.html:869`)
- `deep-links.js` indirectly triggers it by clicking panel triggers.

---

## `js/index/messages.js`

### 1. PURPOSE
This module provides an in-dashboard mock messaging UI: thread list navigation, bubble rendering, and local send behavior for appended chat bubbles. It operates entirely client-side with static seed data.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None.

### 6. ISSUES
- Entire thread dataset is hardcoded demo content (`messages.js:2-38`), indicating placeholder/prototype behavior rather than integrated messaging.
- `sendMessageChat()` appends outgoing text only in DOM (`messages.js:69-83`) with no persistence/sync, so state is lost on close/reload.

### 7. DEPENDENCIES
Depends on:
- Message panel DOM IDs and inline event wiring.

Depended on by:
- `index.html` thread open/close/send handlers (`index.html:456`, `index.html:470`, `index.html:484`, `index.html:498`, `index.html:514`, `index.html:522`)
- Script include in dashboard (`index.html:529`).

---

## `js/index/deep-links.js`

### 1. PURPOSE
This file processes URL query params (`openTool`, `openPanel`, `mapType`) to auto-open specific tools/panels after page load, then clears query params from the URL. It acts as a lightweight navigation bridge for AI/tool-driven deep links.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None.

### 6. ISSUES
- Query cleanup drops all params by replacing URL with pathname only (`deep-links.js:10-12`), which may unintentionally remove unrelated query state.
- Tool dispatch is string-map based without validation/enum centralization (`deep-links.js:18-38`), easy to drift from available tool functions.

### 7. DEPENDENCIES
Depends on:
- Global tool functions from `js/tools/*` (`openCompass`, `openCalc`, `openMapsOverlay`, `switchMap`, etc.)
- `toggle-panel.js`/inline panel trigger structure for panel opening clicks
- `openFieldToolsModal` from `field-tools.js`

Depended on by:
- Included near end of `index.html` to execute auto-open behavior (`index.html:1116`).

---

## `js/index/field-tools.js`

### 1. PURPOSE
This module opens/closes the field tools modal and provides a wrapper (`fieldToolAction`) to close the modal before launching a selected tool. It also pauses/resumes carousel animation on touch/pointer interaction.

### 2. LOCALSTORAGE
None.

### 3. INDEXEDDB
None.

### 4. SUPABASE
None.

### 5. N8N/WEBHOOKS
None.

### 6. ISSUES
- `fieldToolAction(fn)` invokes arbitrary callback (`field-tools.js:7-9`) without type checks; bad call sites can throw.
- Carousel pause/resume logic is duplicated across touch and pointer events with no cleanup path (acceptable but could be compacted).

### 7. DEPENDENCIES
Depends on:
- Modal/carousel DOM IDs (`fieldToolsModal`, `toolsCarousel`, `toolsTrack`)
- Tool opener globals passed into `fieldToolAction` from markup.

Depended on by:
- `index.html` carousel opens modal (`index.html:299`) and tool buttons call `fieldToolAction(...)` (`index.html:792-840`)
- `deep-links.js` can call `openFieldToolsModal()` (`deep-links.js:37`).

---

## CHUNK SUMMARY

### Key findings
- Dashboard is strongly local-first with IDB hydration, then layered cloud reconciliation and UI rerendering (`main.js` + `cloud-recovery.js` + shared data store/realtime).
- Supabase table usage across this chunk is concentrated in four tables: `reports`, `report_data`, `interview_backup`, plus likely cloud photos via helper.
- No n8n/webhook/API-key leakage found in these 11 files.
- A recurring pattern of stale comments/header dependency lists indicates drift between code and docs.

### Issues by severity
CRITICAL:
- None found in this chunk.

WARNING:
- Stale dependency/comments drift across multiple files (`main.js`, `report-cards.js`, `report-creation.js`, `cloud-recovery.js`, `weather.js`, `panels.js`) can mislead maintainers and cause incorrect assumptions.
- `toggle-panel.js` lacks null guard for invalid panel IDs (`toggle-panel.js:19`), creating avoidable runtime exception risk.
- `cloud-recovery.js` over-broad `recoveredIds = Object.keys(localReports)` (`cloud-recovery.js:109`) may cause unnecessary cloud fetch volume.
- Route naming inconsistency (`projects.html` vs `project-config.html`) between creation/config paths (`main.js:24`, `report-creation.js:275`) may indicate navigation drift.

INFO:
- Dead/unused symbols: `origToggle` (`calendar.js:5`), unused `newData` arg (`report-cards.js:755`), stale `activeProjectCache` fallback (`report-creation.js:199`).
- Messages module appears prototype-only with static data and no persistence (`messages.js:2-38`, `messages.js:69-83`).
- Panels/weather rely heavily on globals + inline handlers, which increases coupling and test difficulty.

### Cross-file concerns
- Inconsistent storage terminology: comments still refer to “localStorage” even where persistence is now via `window.dataStore`/IDB (`cloud-recovery.js`).
- Global-function coupling is high (`index.html` inline onclick + globals across `main.js`, `report-cards.js`, `panels.js`, `toggle-panel.js`, tools), making script order and naming brittle.
- Weather/operations logic is split across `weather.js` and `panels.js` with duplicated wait/retry behavior and partial daylight-status cohesion.
- Multiple modules contain stale dependency headers, which suggests no enforced documentation sync step during refactors.
