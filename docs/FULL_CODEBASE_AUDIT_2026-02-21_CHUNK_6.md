# Full Codebase Audit — Chunk 6: Config & Admin Pages

Date: 2026-02-21  
Scope:
- `js/project-config/main.js`
- `js/project-config/form.js`
- `js/project-config/crud.js`
- `js/project-config/contractors.js`
- `js/project-config/document-import.js`
- `js/archives/main.js`
- `js/settings/main.js`
- `js/projects/main.js`
- `js/permissions/main.js`

---

## `js/project-config/main.js`

### 1. PURPOSE
This is the entry-point controller for `project-config.html`: it initializes page state, boots IndexedDB, and decides between “create new project” and “edit existing project” based on URL params. It also manages unsaved-change (“dirty”) tracking and beforeunload guarding. It provides shared globals (`currentProject`, `selectedFiles`, etc.) consumed by sibling project-config modules.

### 2. LOCALSTORAGE
- Reads active project ID via helper `getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID)` in `getActiveProjectId()` (`js/project-config/main.js:62`).
- No direct `localStorage.*` calls in this file.

### 3. INDEXEDDB
- Initializes IndexedDB via `window.idb.initDB()` (`js/project-config/main.js:77`).
- No direct object-store operations in this file.

### 4. SUPABASE
- No direct Supabase table/storage/auth calls.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- `getActiveProjectId()` is only a thin wrapper around storage and appears to exist primarily for `crud.js` usage; low-value indirection (`js/project-config/main.js:61-63`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on sibling modules/functions called here: `setupDropZone` (`document-import.js`), `setupLogoDropZone` (`form.js`), `loadProject`/`createNewProject` (`crud.js`) (`js/project-config/main.js:83-85`, `:92`, `:100`).
- Depends on shared utilities: `window.idb`, `getStorageItem`, `STORAGE_KEYS`, `initPWA`.
- Depended on by:
  - `project-config.html` script include (`project-config.html:544`).
  - Service worker precache list (`sw.js:89`).
  - Other project-config files rely on its globals (`currentProject`, `isDirty`, etc.).

---

## `js/project-config/form.js`

### 1. PURPOSE
This file renders/populates the project form and manages project logo UX (select, drag/drop, preview, remove). It keeps edits in `currentProject` and marks unsaved state when logo/form-affecting actions occur. Logo persistence is delegated to media utilities.

### 2. LOCALSTORAGE
- No direct localStorage reads/writes.

### 3. INDEXEDDB
- No IndexedDB operations.

### 4. SUPABASE
- Indirect Supabase Storage usage via media-utils:
  - `uploadLogoToStorage(file, currentProject.id)` (`js/project-config/form.js:76`) which uploads to bucket `project-logos` (`js/media-utils.js:151-152`).
  - `deleteLogoFromStorage(currentProject.id)` (`js/project-config/form.js:105`) which deletes from `project-logos` (`js/media-utils.js:199-200`).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Dependency header mentions `escapeHtml`, but this file does not use it (stale comment) (`js/project-config/form.js:2`).
- `removeLogo()` fires async delete without `await`; intentional “non-blocking,” but failures are silent to user (`js/project-config/form.js:104-106`).
- Persists signed URL (`logoUrl`) in project state (`js/project-config/form.js:78-79`), which can expire and become stale.
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on `currentProject` and `markDirty()` from `main.js`.
- Depends on `renderContractors()` from `contractors.js` (`js/project-config/form.js:40`).
- Depends on `compressImageToThumbnail`, `uploadLogoToStorage`, `deleteLogoFromStorage`, `showToast`, `preventDefaults`.
- Depended on by:
  - `project-config.html` script include (`project-config.html:542`).
  - `crud.js` calls `populateForm()` (`js/project-config/crud.js:57`, `:84`).
  - Service worker precache list (`sw.js:87`).

---

## `js/project-config/crud.js`

### 1. PURPOSE
This file owns project CRUD lifecycle for the project config page: create defaults, load existing, save local-first, and delete with cloud-first ordering. It coordinates between form fields, IndexedDB, local storage cache cleanup, and Supabase sync. It also contains legacy compatibility wrappers for older delete entry points.

### 2. LOCALSTORAGE
- Reads `STORAGE_KEYS.USER_ID` via helper (`js/project-config/crud.js:15`, `:124`).
- Reads `STORAGE_KEYS.PROJECTS` via helper for cleanup (`js/project-config/crud.js:243`).
- Writes `STORAGE_KEYS.PROJECTS` via helper (`js/project-config/crud.js:246`).
- Removes `STORAGE_KEYS.ACTIVE_PROJECT_ID` via helper (`js/project-config/crud.js:255`).

### 3. INDEXEDDB
- Reads project by id: `window.idb.getProject(projectId)` (`js/project-config/crud.js:67`) — projects store.
- Saves project: `window.idb.saveProject(currentProject)` (`js/project-config/crud.js:136`) — projects store.
- Deletes project: `window.idb.deleteProject(projectId)` (`js/project-config/crud.js:234`) — projects store.
- Also uses `window.dataLayer.loadProjects()` fallback (`js/project-config/crud.js:78`) for indirect IDB/cloud retrieval.

### 4. SUPABASE
- Upserts to table `projects`: `supabaseClient.from('projects').upsert(..., { onConflict: 'id' })` (`js/project-config/crud.js:20-22`).
- Deletes from table `projects`: `.from('projects').delete().eq('id', projectId)` (`js/project-config/crud.js:221-224`).
- Uses converter `toSupabaseProject(project)` before upsert (`js/project-config/crud.js:12`).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Potential data-loss window during delete path: cloud delete succeeds, local IDB delete can fail and is treated non-critical, leaving stale local copy (`js/project-config/crud.js:232-239`).
- Legacy `STORAGE_KEYS.PROJECTS` cleanup suggests mixed old/new storage patterns and likely stale cache contract (`js/project-config/crud.js:241-247`).
- `contractDayNo = parseInt(...) || ''` collapses valid `0` to empty string (`js/project-config/crud.js:121`).
- Deprecated wrapper `deleteProject(projectId)` remains for compatibility (`js/project-config/crud.js:276-286`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on `supabaseClient`, `toSupabaseProject`, storage helpers (`getStorageItem/setStorageItem/removeStorageItem`), `STORAGE_KEYS`, `window.idb`, `window.dataLayer`, UI functions (`showToast`), and globals from `main.js` (`currentProject`, `clearDirty`, `getActiveProjectId`).
- Depended on by:
  - `project-config.html` script include (`project-config.html:540`).
  - `main.js` calls `loadProject()` and `createNewProject()` (`js/project-config/main.js:92`, `:100`).
  - Service worker precache list (`sw.js:85`).

---

## `js/project-config/contractors.js`

### 1. PURPOSE
This file manages contractor and crew CRUD inside a project, including rendering cards, edit/add/delete forms, and reorder via drag-and-drop. It mutates `currentProject.contractors` and marks the project dirty after changes. It also provides a generic confirmation modal callback mechanism for deletions.

### 2. LOCALSTORAGE
- None.

### 3. INDEXEDDB
- None (in-memory edits only; persistence happens in project save flow elsewhere).

### 4. SUPABASE
- None direct.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- `crewIdx` is defined but unused in rendering callback (`js/project-config/contractors.js:29`).
- Drag reorder may conflict with render-time prime-first sorting behavior, making order semantics non-obvious (`js/project-config/contractors.js:16-21`, `:281-287`).
- Uses many inline `onclick` handlers in generated HTML, tightly coupling markup to global function names.
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on `currentProject`, `deleteCallback`, `draggedItem` globals from `main.js`.
- Depends on utilities: `escapeHtml`, `generateId`, `showToast`, `markDirty`.
- Depended on by:
  - `project-config.html` script include (`project-config.html:541`).
  - `form.js` calls `renderContractors()` (`js/project-config/form.js:40`).
  - Service worker precache list (`sw.js:86`).

---

## `js/project-config/document-import.js`

### 1. PURPOSE
This module handles drag/drop file intake for project docs and submits them to an extraction endpoint to auto-fill project fields and contractor data. It maintains `selectedFiles`, validates types, shows extraction UI state, and maps extracted payload values into the existing form/current project object. It also flags missing extracted fields for user cleanup.

### 2. LOCALSTORAGE
- No direct localStorage usage.

### 3. INDEXEDDB
- None.

### 4. SUPABASE
- Uses `SUPABASE_URL` to build Edge Function endpoint: `.../functions/v1/extract-project` (`js/project-config/document-import.js:6`).
- Calls Supabase Auth session API: `supabaseClient.auth.getSession()` (`js/project-config/document-import.js:140`).
- Uses session access token as Bearer for extraction request (`js/project-config/document-import.js:141-153`).

### 5. N8N/WEBHOOKS
- Webhook-like HTTP POST to Edge Function URL via `fetch(EDGE_EXTRACT_PROJECT_URL, ...)` (`js/project-config/document-import.js:149-156`).
- No n8n URL or API key literals found.

### 6. ISSUES
- Extension validation allows `.pdf` and `.docx` only, but icon helper still contains `.doc` branch (dead/inconsistent path) (`js/project-config/document-import.js:45`, `:76`).
- `missingFields` is collected but never used after population (`js/project-config/document-import.js:254`, `:271`).
- No explicit `response.ok` guard before `response.json()`, so non-JSON error bodies collapse into generic catch handling (`js/project-config/document-import.js:160`, `:185-188`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on globals from `main.js` (`selectedFiles`, `currentProject`) and project-config functions (`renderContractors`, `markDirty`).
- Depends on `supabaseClient`, `SUPABASE_URL`, `showToast`, `escapeHtml`, `generateId`.
- Depended on by:
  - `project-config.html` script include (`project-config.html:543`).
  - `main.js` calls `setupDropZone()` (`js/project-config/main.js:83`).
  - Service worker precache list (`sw.js:88`).

---

## `js/archives/main.js`

### 1. PURPOSE
This file powers the archives page: load project filter + submitted report list, render recent/all report cards, and open report PDFs. It is online-first (Supabase queries) with explicit IndexedDB cache fallback when offline. It also wires online/offline listeners and optional realtime sync initialization.

### 2. LOCALSTORAGE
- Reads `STORAGE_KEYS.ORG_ID` via `getStorageItem(...)` for project/report query scoping (`js/archives/main.js:63`, `:105`).
- No direct `localStorage.*` calls.

### 3. INDEXEDDB
- Writes archive cache via `window.idb.saveCachedArchive(key, data)` (`js/archives/main.js:333-334`).
  - Uses cache keys: `'projects'` (`js/archives/main.js:81`) and `'reports'` (`js/archives/main.js:155`).
- Reads cache via `window.idb.getCachedArchive('projects')` and `('reports')` (`js/archives/main.js:351-352`).
- Effective underlying store is `cachedArchives` (implemented in IDB util layer).

### 4. SUPABASE
- Table `projects` read: select `id, project_name`, filter `status='active'`, optional `org_id` (`js/archives/main.js:64-72`, `:74`).
- Table `reports` read: select submitted reports + joined project name, optional `org_id` / `project_id` (`js/archives/main.js:106-129`, `:131`).
- Storage bucket `report-pdfs`: `createSignedUrl(report.pdfPath, 300)` (`js/archives/main.js:261-264`).
- Requires global `supabaseClient` presence check (`js/archives/main.js:16-17`).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Header comment says “Online-only,” but file now implements offline cache fallback (stale comment) (`js/archives/main.js:4`, `:327-381`).
- `window.open(..., '_blank')` without `noopener` for PDF links (`js/archives/main.js:267`, `:279`) introduces tabnabbing risk.
- When no cloud reports are returned, cache is not explicitly overwritten with empty list before return, so stale cached reports may remain available offline (`js/archives/main.js:134-138`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on `supabaseClient`, `STORAGE_KEYS/getStorageItem`, `window.idb`, `initRealtimeSync`, `escapeHtml`, `formatDate`, `formatDateTime`.
- Depended on by:
  - `archives.html` script include (`archives.html:93`).
  - Service worker precache list (`sw.js:106`).

---

## `js/settings/main.js`

### 1. PURPOSE
This module manages inspector profile settings with dirty-state tracking, local scratch-pad autosave, local-first persistence, and optional cloud sync/refresh via Supabase. It also includes operational controls for PWA refresh and a nuclear local reset. It exposes handlers for page button `onclick` actions.

### 2. LOCALSTORAGE
- `STORAGE_KEYS.SETTINGS_SCRATCH` read/write/remove (`js/settings/main.js:13`, `:60`, `:84`, `:94`).
- `STORAGE_KEYS.USER_ID` read/write (`js/settings/main.js:173`, `:196`, `:237`, `:319`).
- `STORAGE_KEYS.USER_NAME` write/read (`js/settings/main.js:238`, `:320`, `:517`).
- `STORAGE_KEYS.USER_EMAIL` write/read (`js/settings/main.js:239`, `:321`, `:518`).
- Full clear via `localStorage.clear()` (`js/settings/main.js:473`).

### 3. INDEXEDDB
- Indirect via data layer:
  - `window.dataLayer.loadUserSettings()` (`js/settings/main.js:34`) (loads cached profile from IDB and/or cloud fallback).
  - `window.dataLayer.saveUserSettings(profile)` (`js/settings/main.js:188`, `:244`) (writes profile to IDB).
- Direct DB deletion: `indexedDB.deleteDatabase('fieldvoice-pro')` (`js/settings/main.js:481`).

### 4. SUPABASE
- Auth: `supabaseClient.auth.getSession()` (`js/settings/main.js:166`, `:278`, `:360`).
- Table `user_profiles`:
  - Upsert on `auth_user_id` (`js/settings/main.js:218-221`).
  - Select by `auth_user_id` in cloud refresh (`js/settings/main.js:293-296`).
  - Select for formatted signature (`js/settings/main.js:367-370`).
- Uses `toSupabaseUserProfile(profile)` converter (`js/settings/main.js:212`).

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- `localStorage.clear()` in nuclear reset is very broad and can wipe unrelated app/auth state, increasing blast radius (`js/settings/main.js:473`).
- `indexedDB.deleteDatabase('fieldvoice-pro')` is fire-and-forget; redirect happens immediately, so deletion completion is not guaranteed (`js/settings/main.js:481`, `:502`).
- Repeated session-fetch/query patterns across `saveSettings`, `refreshFromCloud`, and `getFormattedSignature` add duplicate logic (`js/settings/main.js:166`, `:278`, `:360`).
- `getFormattedSignature()` is marked compatibility and may be legacy/low-use (`js/settings/main.js:355-356`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on: `supabaseClient`, `window.dataLayer`, `window.auth`, `STORAGE_KEYS`, `getDeviceId`, `toSupabaseUserProfile`, `showToast`, `initPWA`.
- Depended on by:
  - `settings.html` script include (`settings.html:243`).
  - Service worker precache list (`sw.js:110`).

---

## `js/projects/main.js`

### 1. PURPOSE
This file renders and controls the project listing page, including active-project selection, expandable contractor preview, and cloud refresh behavior. It is designed as IDB-first through the data layer, with Supabase refresh delegated to `dataLayer`. It exposes select/edit/refresh/toggle handlers globally for UI actions.

### 2. LOCALSTORAGE
- Writes active project via helper `setStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId)` (`js/projects/main.js:93`).
- Reads active project via helper `getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID)` (`js/projects/main.js:300`).
- No direct `localStorage.*` calls.

### 3. INDEXEDDB
- Direct clear operation: `window.idb.clearStore('projects')` (`js/projects/main.js:63`).
- Indirect via data layer:
  - `window.dataLayer.loadProjects()` (`js/projects/main.js:17`, `:97`, `:79`).
  - `window.dataLayer.refreshProjectsFromCloud()` (`js/projects/main.js:34`, `:69`).
- Store explicitly named here: `projects` (`js/projects/main.js:63`).

### 4. SUPABASE
- No direct Supabase client usage.
- Indirect cloud interaction via `window.dataLayer.refreshProjectsFromCloud()` (`js/projects/main.js:34`, `:69`) which performs Supabase fetches and recaches.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Clears `projects` store before fetching cloud data; if refresh fails mid-flow, there is a temporary data-loss window and possible empty UI until fallback reload succeeds (`js/projects/main.js:61-66`, `:75-80`).
- Sorting logic duplicated in two places (`js/projects/main.js:20-24`, `:35-39`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on: `window.dataLayer`, `window.idb`, storage helpers (`getStorageItem/setStorageItem`), `STORAGE_KEYS`, `escapeHtml`, `showToast`, `initPWA`.
- Depended on by:
  - `projects.html` script include (`projects.html:113`).
  - Service worker precache list (`sw.js:109`).

---

## `js/permissions/main.js`

### 1. PURPOSE
This module drives onboarding permissions flow for microphone, camera, and location with sequential screens, manual fallback mode, and debug logging. It manages UI state transitions, requests browser APIs, stores granted-state hints, and provides reset/diagnostic helpers. It also supports manual re-request and summary rendering.

### 2. LOCALSTORAGE
Direct reads/writes:
- Removes: `MIC_GRANTED`, `MIC_TIMESTAMP`, `CAM_GRANTED`, `SPEECH_GRANTED`, `ONBOARDED` (`js/permissions/main.js:81-83`, `:86-87`).
- Sets: `MIC_GRANTED`, `MIC_TIMESTAMP` (`js/permissions/main.js:298-299`).
- Sets: `CAM_GRANTED` (`js/permissions/main.js:366`).
- Reads: `MIC_GRANTED`, `CAM_GRANTED`, `LOC_GRANTED` (`js/permissions/main.js:586`, `:590`, `:594`).
- Sets (manual mode): `MIC_GRANTED`, `CAM_GRANTED` (`js/permissions/main.js:673`, `:698`).
- Sets: `ONBOARDED` (`js/permissions/main.js:742`).
- Reads onboarding/full-state check: `ONBOARDED`, `MIC_GRANTED`, `CAM_GRANTED`, `LOC_GRANTED`, `SPEECH_GRANTED` (`js/permissions/main.js:757`, `:760-763`).

Indirect via helper calls:
- `cacheLocation(...)` writes `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `LOC_GRANTED` (`js/permissions/main.js:438`, `:729`; implementation in `js/ui-utils.js:268-271`).
- `clearCachedLocation()` removes `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `LOC_GRANTED` (`js/permissions/main.js:85`; implementation in `js/ui-utils.js:278-281`).

### 3. INDEXEDDB
- None.

### 4. SUPABASE
- None.

### 5. N8N/WEBHOOKS
- None.

### 6. ISSUES
- Inconsistent speech-permission model: flow/state heavily references `speech` and `SPEECH_GRANTED`, but there is no speech request step that sets it; onboarding “all granted” check can therefore remain permanently false (`js/permissions/main.js:93`, `:159`, `:167`, `:757-763`).
- `permissionResults` initially omits `speech`; later code writes/reads it dynamically, increasing risk of undefined access in future stepper changes (`js/permissions/main.js:5-9`, `:93`, `:177`).
- `code` parameter in `showMicError/showCamError/showLocError` is unused (`js/permissions/main.js:315`, `:382`, `:455`).
- No TODO/FIXME markers.

### 7. DEPENDENCIES
- Depends on: browser APIs (`navigator.mediaDevices`, `navigator.geolocation`, `navigator.permissions`, clipboard), `STORAGE_KEYS`, `cacheLocation`, `clearCachedLocation`, `initPWA`.
- Depended on by:
  - `permissions.html` script include (`permissions.html:742`).
  - Service worker precache list (`sw.js:107`).

---

## CHUNK SUMMARY

### Key findings
- Persistence strategy is mixed: some files use `dataLayer`, others bypass it with direct `window.idb` and direct Supabase calls.
- `document-import` now targets Supabase Edge Function, not n8n, and uses Bearer JWT from `auth.getSession()`.
- Several modules still carry legacy compatibility artifacts (deprecated wrappers, stale comments, partially removed “speech” flow).
- Offline behavior exists in multiple pages, but patterns are inconsistent (cache-first, local-first, online-first with fallback).

### Issues ranked by severity

CRITICAL
- `js/permissions/main.js`: Speech permission is checked as required in onboarding completion but never actually granted by this file’s flow, creating a potential permanent “not fully onboarded” state (`js/permissions/main.js:757-763` with no matching set path for `SPEECH_GRANTED`).

WARNING
- `js/projects/main.js`: Refresh path clears `projects` store before successful cloud fetch, creating a data-loss/empty-state window (`js/projects/main.js:61-66`, `:69-80`).
- `js/archives/main.js`: Opens PDFs in new tab without `noopener` (`js/archives/main.js:267`, `:279`).
- `js/archives/main.js`: Stale “Online-only” header comment now contradicts implemented offline cache fallback (`js/archives/main.js:4`, `:327-381`).
- `js/settings/main.js`: Nuclear reset aggressively calls `localStorage.clear()` and non-awaited `indexedDB.deleteDatabase`, broad blast radius with uncertain completion (`js/settings/main.js:473`, `:481`, `:502`).
- `js/project-config/crud.js`: Mixed legacy/local cache cleanup and non-atomic cloud/local delete flow can leave stale local state (`js/project-config/crud.js:232-239`, `:241-247`).

INFO
- `js/project-config/document-import.js`: `.doc` icon branch is unreachable under current validator and `missingFields` is unused (`js/project-config/document-import.js:45`, `:76`, `:254`).
- `js/project-config/form.js`: Stale dependency comment and silent async delete behavior (`js/project-config/form.js:2`, `:104-106`).
- `js/permissions/main.js`: Unused error-code parameters in error rendering functions (`js/permissions/main.js:315`, `:382`, `:455`).
- `js/projects/main.js`: Duplicate sorting logic (`js/projects/main.js:20-24`, `:35-39`).

### Cross-file concerns
- Duplicate logic/abstraction drift:
  - `project-config/crud.js` uses direct `window.idb` + direct Supabase, while `projects/main.js` and `settings/main.js` lean on `dataLayer` for parts of persistence.
- LocalStorage contract sprawl:
  - Profile keys (`USER_ID/USER_NAME/USER_EMAIL`) are read/written in multiple places (not only settings), increasing risk of drift and stale assumptions.
- Legacy vs current flow mismatch:
  - Permissions flow references speech state without a complete speech acquisition path.
- Storage URL lifecycle inconsistency:
  - Project logos persist signed URLs (expirable), while archives now regenerates report PDF signed URLs at open-time.

