# Full Codebase Audit — Chunk 3 (Interview Flow)
Date: 2026-02-21
Scope:
- `js/interview/main.js`
- `js/interview/state-mgmt.js`
- `js/interview/persistence.js`
- `js/interview/finish-processing.js`
- `js/interview/ui-flow.js`
- `js/interview/ui-display.js`
- `js/interview/guided-sections.js`
- `js/interview/freeform.js`
- `js/interview/contractors-personnel.js`
- `js/interview/equipment-manual.js`
- `js/interview/photos.js`

Script load order in `quick-interview.html:953-963`:
1. `state-mgmt.js`
2. `persistence.js`
3. `ui-flow.js`
4. `freeform.js`
5. `guided-sections.js`
6. `contractors-personnel.js`
7. `equipment-manual.js`
8. `photos.js`
9. `ui-display.js`
10. `finish-processing.js`
11. `main.js`

## `js/interview/main.js`
### 1. PURPOSE
`main.js` is the page orchestrator: it bootstraps app state on `DOMContentLoaded`, initializes permissions UX, loads report/project/user context, chooses guided vs minimal mode, and wires lifecycle hardening events (`visibilitychange`, `pagehide`, `pageshow`, `online`). It is effectively the runtime coordinator that calls into nearly every other interview module. It also handles permission banner behavior and startup error handling.

### 2. LOCALSTORAGE
- Read `STORAGE_KEYS.MIC_GRANTED` via `localStorage.getItem` at `js/interview/main.js:19`
- Read `STORAGE_KEYS.LOC_GRANTED` via `localStorage.getItem` at `js/interview/main.js:20`
- Write `STORAGE_KEYS.MIC_GRANTED` via `localStorage.setItem` at `js/interview/main.js:36`
- Write `STORAGE_KEYS.PERMISSIONS_DISMISSED` via `localStorage.setItem` at `js/interview/main.js:88`
- Write `STORAGE_KEYS.ACTIVE_REPORT_ID` via `setStorageItem` at `js/interview/main.js:188`

### 3. INDEXEDDB
Uses `window.dataStore` (IDB abstraction), inferred operations:
- Initialize datastore at `js/interview/main.js:157-159`
- Read report metadata (`getReport`) at `js/interview/main.js:223-225`
- Close all DB connections at `js/interview/main.js:323-325`
- Calls `loadDraftFromIDB()` at `js/interview/main.js:200` (implemented in `persistence.js`)

### 4. SUPABASE
No direct table/storage/auth calls in this file. Indirectly triggers Supabase flows through:
- `getReport()` (`persistence.js`) at `js/interview/main.js:174`
- `drainPendingBackups()` (`persistence.js`) at `js/interview/main.js:298,332,340`
- `initRealtimeSync()` (external module) at `js/interview/main.js:295`

### 5. N8N / WEBHOOKS
No direct n8n URL, webhook URL, or API key in this file.

### 6. ISSUES
- **Bug risk:** location permission success path does not set `STORAGE_KEYS.LOC_GRANTED`, while banner logic requires it (`js/interview/main.js:20`, `js/interview/main.js:46-63`). This can keep warning state inconsistent.
- Several comments still mention “localStorage draft” while actual draft body persistence is IDB-first (`js/interview/main.js:190-205`), which can mislead maintainers.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` (`window.interviewState`)
- `persistence.js` (`checkReportState`, `getReport`, `loadDraftFromIDB`, `restoreFromLocalStorage`, `saveToLocalStorage`, `flushInterviewBackup`, `drainPendingBackups`)
- `ui-flow.js` (`shouldShowModeSelection`, `showModeSelectionScreen`, `showModeUI`, `hideProcessingOverlay`)
- `finish-processing.js` (`finishMinimalReport`, `finishReport`)
- `ui-display.js` (`fetchWeather`, `updateMinimalWeatherDisplay`)
- `guided-sections.js` (`checkDictationHintBanner`)
- `photos.js` (`handlePhotoInput`)
- Shared modules (`storage-keys`, `dataLayer`, `dataStore`, `media-utils`, `pwa`, toast utils)

Depended on by:
- `quick-interview.html` as final orchestrator script (`quick-interview.html:963`)

---

## `js/interview/state-mgmt.js`
### 1. PURPOSE
`state-mgmt.js` defines the global `window.interviewState` and core state mutation APIs for entry creation/edit/deletion, yes/no toggle locking, and N/A markers. It centralizes mutable report interactions that guided and contractor sections consume. It also handles entry edit inline UI transitions and N/A button state updates.

### 2. LOCALSTORAGE
No `localStorage` usage.

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- Redundant save call in entry edit autosave path: `updateEntry()` already calls `saveReport()`, then `startEditEntry()` calls `saveReport()` again (`js/interview/state-mgmt.js:129-131`). Causes duplicate persistence churn.
- Mixed ID generation strategy: entries use `Date.now()+Math.random()` (`js/interview/state-mgmt.js:33`), while other modules use `crypto.randomUUID()`.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `persistence.js` (`saveReport`, `initGuidedAutoSave`)
- `guided-sections.js` / `contractors-personnel.js` (`renderSection`, `renderContractorWorkCards`)
- `ui-display.js` (`updateAllPreviews`, `updateProgress`)
- UI helper functions (`showToast`, `autoExpand`, `canChangeToggle` from other loaded scripts)

Depended on by:
- `guided-sections.js`, `contractors-personnel.js`, `equipment-manual.js`, `ui-display.js`, `ui-flow.js` (entry/toggle/N/A APIs)

---

## `js/interview/persistence.js`
### 1. PURPOSE
`persistence.js` is the storage and sync backbone: local draft persistence, IDB recovery, autosave/debounce orchestration, backup stale-flag queue drain, report load reconciliation (IDB vs cloud freshness), and Supabase write/upload helpers. It defines core data-shape mappers (`restoreFromLocalStorage`, `applyDraftToReport`, canonical page-state builder) and photo upload/deletion cloud operations. It is the heaviest module and the primary source of cross-device data consistency behavior.

### 2. LOCALSTORAGE
- Dynamic stale backup flag write: `fvp_backup_stale_${reportId}` via `localStorage.setItem` at `js/interview/persistence.js:378`
- Dynamic stale backup flag remove: `fvp_backup_stale_${reportId}` via `localStorage.removeItem` at `js/interview/persistence.js:381`
- Enumerate localStorage keys via `localStorage.length` / `localStorage.key(i)` at `js/interview/persistence.js:386-387`
- Read `STORAGE_KEYS.ORG_ID` at `js/interview/persistence.js:407`, `js/interview/persistence.js:784`, `js/interview/persistence.js:1064`, `js/interview/persistence.js:1175`
- Read `STORAGE_KEYS.USER_ID` via `getStorageItem` at `js/interview/persistence.js:1065`

### 3. INDEXEDDB
Uses two abstractions: `window.dataStore` (report/draft/reportData stores) and `window.idb` (photo store).
- `window.dataStore.saveReport(...)` at `js/interview/persistence.js:177`, `js/interview/persistence.js:349`
- `window.dataStore.saveDraftData(...)` at `js/interview/persistence.js:180`, `js/interview/persistence.js:190`, `js/interview/persistence.js:903`
- `window.dataStore.getDraftData(...)` at `js/interview/persistence.js:205`, `js/interview/persistence.js:414`, `js/interview/persistence.js:830`
- `window.dataStore.deleteDraftData(...)` at `js/interview/persistence.js:335`
- `window.dataStore.getReport(...)` at `js/interview/persistence.js:347`
- `window.idb.getPhotosBySyncStatus('pending')` at `js/interview/persistence.js:1154`
- `window.idb.savePhoto(...)` at `js/interview/persistence.js:1201`

### 4. SUPABASE
Tables:
- `interview_backup` upsert/select:
  - drain queue flush at `js/interview/persistence.js:429-436`
  - autosave flush at `js/interview/persistence.js:787-794`
  - cloud freshness read at `js/interview/persistence.js:849-854`
- `reports` upsert at `js/interview/persistence.js:1073-1075`
- `photos` upsert at `js/interview/persistence.js:1187-1189`
- `photos` delete at `js/interview/persistence.js:1230-1233`

Storage bucket:
- `report-photos` upload at `js/interview/persistence.js:1114-1119`
- `report-photos` signed URL creation at `js/interview/persistence.js:1130-1132`
- `report-photos` remove at `js/interview/persistence.js:1224-1226`

Retry wrapper:
- `supabaseRetry(...)` used at `js/interview/persistence.js:786`, `js/interview/persistence.js:795`

### 5. N8N / WEBHOOKS
No n8n URL or webhook endpoint in this file.

### 6. ISSUES
- **Naming drift:** functions and comments still refer to localStorage draft persistence while real payload persistence is IDB-centered (`js/interview/persistence.js:75`, `js/interview/persistence.js:217`, `js/interview/persistence.js:326`).
- **High duplication:** overlapping mapping logic in:
  - `restoreFromLocalStorage` (`js/interview/persistence.js:219-323`)
  - `_buildCanonicalPageStateFromDraft` (`js/interview/persistence.js:450-519`)
  - `applyDraftToReport` (`js/interview/persistence.js:980-1006`)
  This raises regression risk when adding fields.
- `clearLocalStorageDraft()` only clears IDB draft (`js/interview/persistence.js:328-341`); function name is stale/misleading.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` state object
- Shared utilities: `supabaseClient`, `supabaseRetry`, `getDeviceId`, storage key helpers, toast helper
- `window.dataStore` + `window.idb` interfaces
- `fetchCloudPhotos` (external) for rehydration

Depended on by:
- `main.js` (`checkReportState`, `getReport`, draft restore, backup drain)
- `state-mgmt.js`, `ui-display.js`, `freeform.js`, `equipment-manual.js`, `contractors-personnel.js`, `photos.js`, `ui-flow.js`, `finish-processing.js` via `saveReport`, upload/delete helpers, and finish-related persistence

---

## `js/interview/finish-processing.js`
### 1. PURPOSE
`finish-processing.js` implements end-of-interview processing: payload construction, AI processing call, error modal behavior, and guided/minimal finish wrappers with mode-specific validation and pre-process ordering. It is responsible for final cloud persistence (`report_data`, `ai_submissions`, refined status) and redirecting to `report.html`. It also coordinates processing overlay step states.

### 2. LOCALSTORAGE
- Read `STORAGE_KEYS.ORG_ID` for `ai_submissions` payload at `js/interview/finish-processing.js:161`
- Read `STORAGE_KEYS.ORG_ID` for `report_data` payload at `js/interview/finish-processing.js:375`

### 3. INDEXEDDB
`window.dataStore` operations:
- Save finalized report package: `saveReportData` at `js/interview/finish-processing.js:366`
- Update report metadata: `saveReport` at `js/interview/finish-processing.js:407-416`
- Verify package exists: `getReportData` at `js/interview/finish-processing.js:423`
- Fallback re-save: `saveReportData` at `js/interview/finish-processing.js:428`
- Close all DB connections: `closeAll` at `js/interview/finish-processing.js:441-442`

### 4. SUPABASE
Auth:
- `supabaseClient.auth.getSession()` at `js/interview/finish-processing.js:84`

Edge Function/API:
- `SUPABASE_URL + '/functions/v1/process-report'` at `js/interview/finish-processing.js:9`
- HTTP `Authorization: Bearer <token>` at `js/interview/finish-processing.js:98`

Tables:
- `ai_submissions` upsert at `js/interview/finish-processing.js:170-172`
- `report_data` upsert with retry at `js/interview/finish-processing.js:391-394`

Retry wrapper:
- `supabaseRetry(...)` at `js/interview/finish-processing.js:390`

### 5. N8N / WEBHOOKS
- Webhook naming/comments are present (`callProcessWebhook`, “payload sent TO n8n”, “From n8n webhook response”) at `js/interview/finish-processing.js:83`, `js/interview/finish-processing.js:151-152`, `js/interview/finish-processing.js:349`
- Actual endpoint is Supabase Edge Function URL, not direct n8n URL (`js/interview/finish-processing.js:9`, `js/interview/finish-processing.js:94`)
- No API keys hardcoded.

### 6. ISSUES
- **Terminology drift:** comments/field labels still reference n8n while runtime uses Edge Function (`js/interview/finish-processing.js:151-152`, `js/interview/finish-processing.js:164`, `js/interview/finish-processing.js:349`).
- Offline fallback marks status `pending_refine` and saves draft only (`js/interview/finish-processing.js:233-246`); no queued automatic resubmission mechanism remains (likely intentional, but operationally important).
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `ui-flow.js` (processing overlay + confirmation APIs)
- `persistence.js` (`saveReport`, `saveReportToSupabase`, `uploadPendingPhotos`)
- `contractors-personnel.js` + `guided-sections.js` for guided validation helpers
- global Supabase client + retry helper

Depended on by:
- `main.js` retry button wiring and finish actions (`finishMinimalReport`, `finishReport`)
- `quick-interview.html` finish buttons (`quick-interview.html:363`, `quick-interview.html:437`)

---

## `js/interview/ui-flow.js`
### 1. PURPOSE
`ui-flow.js` controls UI-level flow state: capture mode selection/switching and the processing overlay interaction model. It decides whether to show mode selection based on draft content, migrates freeform notes into guided additional notes on mode switch, and blocks user input during processing. It contains reusable modal/overlay primitives used by finish flow.

### 2. LOCALSTORAGE
No localStorage usage.

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- Mode switch concatenates legacy notes into `additionalNotes` without dedupe marker protection (`js/interview/ui-flow.js:135-139`), so repeated switching can append repeated “Field Notes” blocks.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` global state
- `freeform.js` (`initMinimalModeUI`)
- `guided-sections.js` (`initGuidedModeUI`)
- `persistence.js` (`saveReport`)

Depended on by:
- `main.js` (`shouldShowModeSelection`, `showModeSelectionScreen`, `showModeUI`)
- `finish-processing.js` (`showProcessConfirmation`, `showProcessingOverlay`, step methods, error/success methods)
- `quick-interview.html` switch mode controls (`quick-interview.html:384`, `quick-interview.html:387`)

---

## `js/interview/ui-display.js`
### 1. PURPOSE
`ui-display.js` handles weather fetch/display and guided mode summary visuals: section previews, status icons, and progress percentage. It derives completion state from mixed legacy and entry/toggle structures and updates the card UI accordingly. It is a pure UI projection layer on top of report state plus weather API response.

### 2. LOCALSTORAGE
No localStorage usage.

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- Direct external API call to Open-Meteo with no retry/backoff and minimal response validation (`js/interview/ui-display.js:19-22`), making this path brittle to transient/network schema failures.
- Large amount of repeated preview logic with legacy+new model branching; likely maintenance hotspot.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- Shared location/weather helpers (`getFreshLocation`)
- `persistence.js` (`saveReport`)
- `state-mgmt.js` + contractor/equipment helpers for preview derivation
- `freeform.js` (`updateMinimalWeatherDisplay`)

Depended on by:
- `main.js` (`fetchWeather`)
- `persistence.js` and many interaction handlers that call `updateAllPreviews`/`updateProgress`
- `guided-sections.js` render completion display

---

## `js/interview/guided-sections.js`
### 1. PURPOSE
`guided-sections.js` renders and manages guided-mode section UIs (activities/personnel/equipment/issues/comms/qaqc/safety/visitors/photos), including legacy note compatibility rendering and section expand/collapse behavior. It is the primary section templating layer for guided mode. It also controls dictation hint dismissal visibility state.

### 2. LOCALSTORAGE
- Write `STORAGE_KEYS.DICTATION_HINT_DISMISSED` at `js/interview/guided-sections.js:398`
- Read `STORAGE_KEYS.DICTATION_HINT_DISMISSED` at `js/interview/guided-sections.js:404`

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- Contains `case 'operations'` in switch (`js/interview/guided-sections.js:41-44`) while active section key is `personnel`; this branch appears stale/dead.
- Contains legacy `inspections` branch (`js/interview/guided-sections.js:87-95`) though main guided section list uses `qaqc`; likely legacy/dead path.
- Significant duplicated render pattern across communications/qaqc/visitors sections.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` entry/toggle/edit helpers
- `contractors-personnel.js`, `equipment-manual.js`, `photos.js` section-specific render/update helpers
- `persistence.js` (`initAllGuidedAutoSave`)
- shared `escapeHtml`

Depended on by:
- `ui-flow.js` (`initGuidedModeUI`)
- `state-mgmt.js` (`saveEditEntry` calls `renderSection`)
- `main.js` (`checkDictationHintBanner`)
- `quick-interview.html` card toggles call `toggleSection(...)`

---

## `js/interview/freeform.js`
### 1. PURPOSE
`freeform.js` powers minimal mode: freeform entry CRUD with inline autosave, visual checklist state, minimal weather card updates, and minimal photo grid/capture/delete/caption handling. It also migrates legacy single-string notes into timestamped entries. It is the minimal-mode equivalent of guided section interactivity.

### 2. LOCALSTORAGE
No direct localStorage API calls in this file.

### 3. INDEXEDDB
Photo store operations via `window.idb`:
- Delete photo at `js/interview/freeform.js:498`

Indirect IDB writes happen through shared helpers:
- `savePhotoToIndexedDB(photoObj)` at `js/interview/freeform.js:453` (implemented in `photos.js`)
- `deletePhotoFromSupabase(...)` at `js/interview/freeform.js:504` (implemented in `persistence.js`)

### 4. SUPABASE
No direct Supabase calls in this file.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- **Display bug:** `updateMinimalWeatherDisplay` appends degree symbols to values that are already formatted like `72°F`, resulting in duplicated unit formatting (`js/interview/freeform.js:296-299` vs weather write format in `ui-display.js:24-25`).
- Caption updates in minimal mode only update report object and `saveReport` (`js/interview/freeform.js:512-516`), unlike guided mode caption updates that also sync IndexedDB record; this can create temporary inconsistency.
- Minimal photo object includes `base64` in in-memory report object (`js/interview/freeform.js:437`) unlike guided path policy comments; not persisted to localStorage payload, but still memory-heavy.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `persistence.js` (`saveReport`)
- `photos.js` helpers (`savePhotoToIndexedDB`, `backgroundUploadPhoto`)
- shared media helpers (`readFileAsDataURL`, `compressImage`, `openPhotoMarkup`, GPS helpers)
- `persistence.js` (`deletePhotoFromSupabase`)

Depended on by:
- `ui-flow.js` (`initMinimalModeUI`)
- `ui-display.js` (`updateMinimalWeatherDisplay`)
- `quick-interview.html` minimal mode controls (`addFreeformEntry`, etc.)

---

## `js/interview/contractors-personnel.js`
### 1. PURPOSE
`contractors-personnel.js` drives guided Work Summary and Personnel sections: contractor/crew cards, “no work” toggles, work-entry insertion/deletion, and personnel role counts/totals. It is the core state/UI layer for contractor-centric reporting. It also supports crew-level reporting under each contractor.

### 2. LOCALSTORAGE
No localStorage usage.

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- `getTradeAbbreviation()` appears unused in this module (`js/interview/contractors-personnel.js:432-476`), likely dead code or leftover utility.
- Large template duplication between contractor-without-crews and contractor-with-crews render branches increases maintenance cost.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` (`getEntriesForSection`, entry edit/delete helpers)
- `persistence.js` (`saveReport`, `initContractorWorkAutoSave`)
- `ui-display.js` (`updateAllPreviews`, `updateProgress`)
- `finish-processing.js` (`getTodayDateFormatted` helper)

Depended on by:
- `guided-sections.js` (`renderContractorWorkCards`, `renderPersonnelCards`)
- `ui-display.js` (activity/personnel preview computations)
- `finish-processing.js` guided validation helpers (`getContractorActivity`, work-entry functions)

---

## `js/interview/equipment-manual.js`
### 1. PURPOSE
`equipment-manual.js` renders structured equipment rows and exposes manual add/remove handlers for issues/safety/comms/qaqc/visitors text entries (with autosave-state coordination). It bridges legacy array-based note behavior and current entry-based behavior. It also updates equipment preview/progress state from row data.

### 2. LOCALSTORAGE
No localStorage usage.

### 3. INDEXEDDB
No direct IndexedDB usage.

### 4. SUPABASE
No direct Supabase usage.

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- `removeInspection` is a one-liner legacy path (`js/interview/equipment-manual.js:191`) and does not update previews/progress like other handlers, creating inconsistent UX updates.
- Repeated near-identical add-handler logic for five sections suggests easy refactor target.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `state-mgmt.js` (`createEntry`)
- `persistence.js` (`saveReport`)
- `guided-sections.js` (`renderSection`)
- `ui-display.js` (`updateAllPreviews`, `updateProgress`)

Depended on by:
- `guided-sections.js` (`renderEquipmentSection`)
- `ui-display.js` (`updateEquipmentPreview`, `hasEquipmentData`)
- `quick-interview.html` button `onclick` handlers for add/remove actions

---

## `js/interview/photos.js`
### 1. PURPOSE
`photos.js` handles guided-mode photo intake: validation, compression, optional markup, GPS attach, local-first save to IDB, background upload to Supabase storage/table metadata, caption sync, and delayed-delete with undo. It also updates upload state indicators in the UI. It is the main photo pipeline for guided mode and shared helper source for minimal mode.

### 2. LOCALSTORAGE
- Read `STORAGE_KEYS.ORG_ID` during `photos` metadata upsert at `js/interview/photos.js:192`

### 3. INDEXEDDB
Photo store operations (`window.idb`):
- `getPhoto(...)` at `js/interview/photos.js:159`, `js/interview/photos.js:177`, `js/interview/photos.js:285`
- `savePhoto(...)` at `js/interview/photos.js:183`, `js/interview/photos.js:288`, `js/interview/photos.js:341`
- `deletePhoto(...)` at `js/interview/photos.js:262`

### 4. SUPABASE
Table:
- `photos` upsert (fire-and-forget `.then`) at `js/interview/photos.js:189-201`

Storage/table indirect via helper calls:
- Calls `uploadPhotoToSupabase(...)` at `js/interview/photos.js:168` (implemented in `persistence.js`, bucket `report-photos`)
- Calls `deletePhotoFromSupabase(...)` at `js/interview/photos.js:268` (implemented in `persistence.js`)

### 5. N8N / WEBHOOKS
No webhook/n8n/api-key usage.

### 6. ISSUES
- Duplicate photo pipeline logic exists between guided (`photos.js`) and minimal (`freeform.js`) capture/delete/caption flows.
- `photos` table upsert is not awaited and has no retry path (`js/interview/photos.js:189-204`); metadata sync can silently lag while upload appears successful.
- Comment says “Supabase on Submit” for caption (`js/interview/photos.js:273`) but background upsert also occurs in this module, which can confuse expectations.
- No TODO/FIXME markers found.

### 7. DEPENDENCIES
Depends on:
- `persistence.js` (`uploadPhotoToSupabase`, `deletePhotoFromSupabase`, `saveReport`)
- `guided-sections.js` (`renderSection('photos')`)
- shared media helpers + `window.idb` + `supabaseClient`

Depended on by:
- `main.js` (`handlePhotoInput` event binding)
- `guided-sections.js` (`updatePhotoCaption`, `autoExpandCaption`, `removePhoto` via inline handlers)
- `freeform.js` uses `savePhotoToIndexedDB` and `backgroundUploadPhoto`

---

## CHUNK SUMMARY
### Key findings
- Interview flow is strongly modularized, but uses global-function coupling and shared mutable state (`window.interviewState`) across all modules.
- Persistence architecture is robust (IDB-first + cloud backup reconciliation + stale-flag drain), but field-mapping logic is duplicated in multiple places.
- Photo handling is sophisticated and mostly local-first, but split between guided/minimal implementations with divergent behavior.
- Some legacy naming/comments remain from prior architecture (localStorage-first, n8n naming), increasing cognitive load.

### Issues ranked by severity
#### CRITICAL
- None identified as immediate guaranteed data-loss/security break in this chunk.

#### WARNING
- `main.js` location permission flag inconsistency: reads `LOC_GRANTED` but does not set it on success (`js/interview/main.js:20`, `js/interview/main.js:46-63`).
- Weather display unit duplication in minimal mode (`js/interview/freeform.js:296-299` vs `js/interview/ui-display.js:24-25`).
- High duplication of persistence field-mapping logic (`js/interview/persistence.js:219-323`, `js/interview/persistence.js:450-519`, `js/interview/persistence.js:980-1006`) increases schema drift risk.
- Unawaited `photos` metadata upsert without retry in background upload flow (`js/interview/photos.js:189-204`).

#### INFO
- Stale terminology: n8n/webhook naming in `finish-processing.js` while endpoint is Supabase Edge Function (`js/interview/finish-processing.js:9`, `js/interview/finish-processing.js:151-152`).
- Stale/misleading naming in persistence (`clearLocalStorageDraft` clears IDB, not localStorage) (`js/interview/persistence.js:328-341`).
- Potential dead/stale sections in guided renderer (`operations`, `inspections`) (`js/interview/guided-sections.js:41-44`, `js/interview/guided-sections.js:87-95`).
- Repeated code blocks in contractor/equipment/manual-add/photo modules suggest refactor opportunity.

### Cross-file concerns
- Duplicate logic patterns:
  - Draft field mapping duplicated across three persistence functions.
  - Photo capture/delete/caption logic duplicated across guided (`photos.js`) and minimal (`freeform.js`) implementations.
  - Repeated “manual add” handlers in `equipment-manual.js`.
- Inconsistent data policy messaging:
  - Comments still describe localStorage-first and n8n workflows despite IDB-first and Edge Function architecture.
- Global-function dependency graph is load-order sensitive (verified by `quick-interview.html:953-963`), increasing fragility for script reordering.
