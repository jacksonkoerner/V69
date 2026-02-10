# Data Flow Audit Report

**Generated:** 2026-02-10
**Scope:** js/data-layer.js, js/sync-manager.js, js/indexeddb-utils.js, js/storage-keys.js, js/supabase-utils.js, js/index.js, js/quick-interview.js, js/report.js, js/lock-manager.js, js/auth.js, js/media-utils.js

---

## 1. IndexedDB Map

Database: `fieldvoice-pro`, Version: 2

| Object Store | Key Path | Indexes | Data Held | Read By | Written By |
|---|---|---|---|---|---|
| `projects` | `id` | (none) | Full project objects with nested contractors (JSONB) | data-layer.js (`getAllProjects`, `getProject`) | data-layer.js (`saveProject` via `refreshProjectsFromCloud`, `loadActiveProject`) |
| `userProfile` | `deviceId` | (none) | User profile: id, deviceId, fullName, title, company, email, phone | data-layer.js (`getUserProfile` via `loadUserSettings`) | data-layer.js (`saveUserProfile` via `loadUserSettings`, `saveUserSettings`) |
| `photos` | `id` | `reportId` (non-unique), `syncStatus` (non-unique) | Photo records: id, reportId, base64/blob, url, storagePath, caption, gps, timestamp, fileName, syncStatus | quick-interview.js (`getPhoto`, `getPhotosBySyncStatus`) | quick-interview.js (`savePhoto`) |
| `archives` | `id` | `projectId` (non-unique), `reportDate` (non-unique) | Archived report records | **NEVER READ** | **NEVER WRITTEN** |

### Notes
- The `archives` store is created in the DB schema but has no CRUD operations implemented in indexeddb-utils.js (no functions exist for it). It is completely unused.
- The `photos` store is also read/deleted by report.js (`deletePhotosByReportId` during cleanup) and index.js (`deletePhotosByReportId` during delete-and-start-fresh).
- index.js calls `clearStore('projects')` for a one-time migration (line 1351).

---

## 2. Supabase Writes

### Upserts

| File | Line | Table | Data Written | Trigger |
|---|---|---|---|---|
| quick-interview.js | 3650 | `interview_backup` | `report_id`, `page_state` (full report snapshot as JSONB), `updated_at` | 5-second debounced autosave (`flushInterviewBackup`), also on visibilitychange/pagehide |
| quick-interview.js | 3689 | `reports` | `id`, `project_id`, `user_id`, `device_id`, `report_date`, `status`, `capture_mode`, `updated_at` | Explicit call during FINISH flow (`saveReportToSupabase`) |
| quick-interview.js | 3820 | `photos` | `id`, `report_id`, `storage_path`, `photo_url`, `caption`, `photo_type`, `filename`, `location_lat`, `location_lng`, `taken_at`, `created_at` | During FINISH flow (`uploadPendingPhotos`) |
| quick-interview.js | 2233 | `ai_submissions` | `report_id`, `original_input`, `ai_response`, `model_used`, `processing_time_ms`, `submitted_at` | After AI webhook returns (`saveAIResponse`) |
| report.js | 2309-2315 | `report_backup` | `report_id`, `page_state` (full report edit state as JSONB), `updated_at` | 5-second debounced autosave (`flushReportBackup`), also on visibilitychange/pagehide |
| report.js | 2397-2399 | `reports` | `id`, `project_id`, `user_id`, `device_id`, `report_date`, `status`, `capture_mode`, `updated_at` | Called from `saveReportToSupabase()` |
| report.js | 4247-4249 | `reports` | Same as above | `ensureReportExists()` during submit flow |
| report.js | 4272-4274 | `final_reports` | `report_id`, `project_id`, `user_id`, `report_date`, `inspector_name`, `pdf_url`, `submitted_at`, `status` | `saveToFinalReports()` during submit flow |
| lock-manager.js | 109 | `active_reports` | `project_id`, `report_date`, `device_id`, `inspector_name`, `locked_at`, `last_heartbeat` | `acquireLock()` — user action (opening interview page) |
| auth.js | 121-125 | `user_profiles` | `auth_user_id`, `full_name`, `title`, `company`, `email`, `phone`, `updated_at` | `upsertAuthProfile()` — user saves profile |

### Updates

| File | Line | Table | Data Written | Trigger |
|---|---|---|---|---|
| report.js | 4284-4291 | `reports` | `status`, `submitted_at`, `updated_at` | `updateReportStatus()` during submit flow |
| lock-manager.js | 207-212 | `active_reports` | `last_heartbeat` | `updateHeartbeat()` — 2-minute interval timer |
| data-layer.js | 471-478 | `reports` | `status`, `submitted_at`, `updated_at` | `submitFinalReport()` — **DEAD CODE, never called** |

### Storage Bucket Uploads

| File | Line | Bucket | Trigger |
|---|---|---|---|
| quick-interview.js | 3728-3741 | `report-photos` | User takes/selects photo (`uploadPhotoToSupabase`) |
| report.js | 4210-4223 | `report-pdfs` | Submit flow (`uploadPDFToStorage`) |
| media-utils.js | 151-166 | `project-logos` | User uploads project logo (`uploadLogoToStorage`) |

---

## 3. Supabase Reads

| File | Line | Table | What's Read | Why |
|---|---|---|---|---|
| data-layer.js | 68-71 | `projects` | `SELECT *` ordered by `project_name` | `refreshProjectsFromCloud()` — explicit user-triggered cloud sync |
| data-layer.js | 134-138 | `projects` | `SELECT *` single by `id` | `loadActiveProject()` — fallback when not in IndexedDB |
| data-layer.js | 268-272 | `user_profiles` | `SELECT *` by `auth_user_id` | `loadUserSettings()` — fallback when not in IndexedDB |
| data-layer.js | 439-444 | `reports` | `SELECT *, projects(id, project_name)` where status='submitted' | `loadArchivedReports()` — **DEAD CODE, never called** |
| quick-interview.js | 1100 | `photos` | `SELECT id, storage_path` by `report_id` | `deleteReportFromSupabase()` — cancel report flow |
| quick-interview.js | 1140 | `final_reports` | `SELECT pdf_url` single by `report_id` | `deleteReportFromSupabase()` — cancel report flow |
| quick-interview.js | 3529 | (storage) | `report-photos` `getPublicUrl()` | `reconstructReportFromSupabase()` — fallback URL reconstruction |
| report.js | 4484 | `photos` | `SELECT id, storage_path` by `report_id` | `executeDeleteReport()` — delete flow |
| report.js | 4504-4508 | `final_reports` | `SELECT pdf_url` single by `report_id` | `executeDeleteReport()` — get PDF for storage cleanup |
| index.js | 420-423 | `photos` | `SELECT storage_path` by `report_id` | Delete-and-start-fresh flow |
| index.js | 437-441 | `final_reports` | `SELECT pdf_url` single by `report_id` | Delete-and-start-fresh flow |
| lock-manager.js | 37-42 | `active_reports` | `SELECT *` by `project_id` + `report_date` | `checkLock()` — check if another device is editing |
| auth.js | 26 | (auth) | `supabaseClient.auth.getSession()` | `requireAuth()` — check session on page load |
| auth.js | 49 | (auth) | `supabaseClient.auth.getUser()` | `getCurrentUser()` |
| auth.js | 149-153 | `user_profiles` | `SELECT *` by `auth_user_id` | `loadAuthProfile()` |

### Deprecated/Commented Reads (still in code)

| File | Line | Table | Status |
|---|---|---|---|
| index.js | 57-60 | `projects` | DEPRECATED — replaced by `window.dataLayer.loadProjects()` |
| index.js | 129-136 | `projects` | DEPRECATED — replaced by `window.dataLayer.loadActiveProject()` |
| quick-interview.js | 2533 | `projects` | DEPRECATED — inside commented-out `loadActiveProject()` |
| quick-interview.js | 2573 | `user_profiles` | DEPRECATED — inside commented-out `loadUserSettings()` |
| report.js | 799 | `projects` | DEPRECATED — inside commented-out `loadActiveProject()` |
| report.js | 835 | `user_profiles` | DEPRECATED — inside commented-out `loadUserSettings()` |

---

## 4. Supabase Deletes

### Table Row Deletes

| File | Line | Table | Filter | Trigger | Duplicate? |
|---|---|---|---|---|---|
| quick-interview.js | 1116 | `photos` | `report_id` | Cancel report (`deleteReportFromSupabase`) | Yes — see below |
| quick-interview.js | 1122 | `interview_backup` | `report_id` | Cancel report | Yes — see below |
| quick-interview.js | 1128 | `ai_submissions` | `report_id` | Cancel report | Yes — see below |
| quick-interview.js | 1134 | `report_backup` | `report_id` | Cancel report | Yes — see below |
| quick-interview.js | 1155 | `final_reports` | `report_id` | Cancel report | Yes — see below |
| quick-interview.js | 1161 | `reports` | `id` | Cancel report | Yes — see below |
| quick-interview.js | 3863 | `photos` | `id` | User deletes individual photo (`deletePhotoFromSupabase`) | No — single photo delete |
| report.js | 4498 | `interview_backup` | `report_id` | Delete report (`executeDeleteReport`) | **DUPLICATE** of quick-interview.js:1122, index.js:431 |
| report.js | 4499 | `report_backup` | `report_id` | Delete report | **DUPLICATE** of quick-interview.js:1134, index.js:432 |
| report.js | 4500 | `ai_submissions` | `report_id` | Delete report | **DUPLICATE** of quick-interview.js:1128, index.js:433 |
| report.js | 4517 | `final_reports` | `report_id` | Delete report | **DUPLICATE** of quick-interview.js:1155, index.js:450 |
| report.js | 4518 | `photos` | `report_id` | Delete report | **DUPLICATE** of quick-interview.js:1116, index.js:451 |
| report.js | 4520 | `reports` | `id` | Delete report | **DUPLICATE** of quick-interview.js:1161, index.js:453 |
| index.js | 431 | `interview_backup` | `report_id` | Delete & start fresh | **DUPLICATE** |
| index.js | 432 | `report_backup` | `report_id` | Delete & start fresh | **DUPLICATE** |
| index.js | 433 | `ai_submissions` | `report_id` | Delete & start fresh | **DUPLICATE** |
| index.js | 450 | `final_reports` | `report_id` | Delete & start fresh | **DUPLICATE** |
| index.js | 451 | `photos` | `report_id` | Delete & start fresh | **DUPLICATE** |
| index.js | 453 | `reports` | `id` | Delete & start fresh | **DUPLICATE** |
| lock-manager.js | 155-160 | `active_reports` | `project_id` + `report_date` + `device_id` | `releaseLock()` | No |

### Storage Bucket Deletes

| File | Line | Bucket | Trigger | Duplicate? |
|---|---|---|---|---|
| quick-interview.js | 1109 | `report-photos` | Cancel report — batch delete all report photos | No |
| quick-interview.js | 1148 | `report-pdfs` | Cancel report — delete submitted PDF | **DUPLICATE** across 3 files |
| quick-interview.js | 3857 | `report-photos` | User deletes single photo | No |
| report.js | 4492 | `report-photos` | Delete report — batch delete all report photos | No |
| report.js | 4512 | `report-pdfs` | Delete report — delete submitted PDF | **DUPLICATE** across 3 files |
| index.js | 427 | `report-photos` | Delete & start fresh — batch delete photos | No |
| index.js | 445 | `report-pdfs` | Delete & start fresh — delete submitted PDF | **DUPLICATE** across 3 files |
| media-utils.js | 194-196 | `project-logos` | Delete project logo | No |

### Flagged Duplications

The **entire report deletion sequence** (delete child rows → delete storage files → delete parent) is independently implemented in **3 files**:
1. `quick-interview.js:1092-1171` (`deleteReportFromSupabase`)
2. `report.js:4460-4525` (`executeDeleteReport`)
3. `index.js:410-465` (inline in `showDuplicateReportModal` click handler)

All three implement the same cascading delete pattern:
```
photos SELECT → report-photos REMOVE → interview_backup DELETE → report_backup DELETE →
ai_submissions DELETE → final_reports SELECT (pdf_url) → report-pdfs REMOVE →
final_reports DELETE → photos DELETE → reports DELETE
```

This should be a single shared utility function.

---

## 5. Autosave Inventory

| File | Mechanism | Data Saved | Destination | Trigger/Interval |
|---|---|---|---|---|
| quick-interview.js:3605 | `setTimeout` 500ms | Full report draft (all form fields) | **localStorage** (`saveCurrentReport`) | Any call to `saveReport()` — debounced |
| quick-interview.js:3620 | `setTimeout` 5000ms | `report_id`, `page_state` (full snapshot) | **Supabase** `interview_backup` table | `markInterviewBackupDirty()` — 5s quiet debounce |
| quick-interview.js:145 | `setTimeout` 500ms | Entry content edits | **localStorage** (via `saveReport()`) | Textarea input event (entry editing) |
| quick-interview.js:225 | `setTimeout` 500ms | New guided section entries | **localStorage** (via `createEntry` + `saveReport`) | Textarea input event (guided auto-save) |
| quick-interview.js:313 | `setTimeout` 500ms | Contractor work entries | **localStorage** (via `createEntry` + `saveReport`) | Textarea input event (contractor work auto-save) |
| quick-interview.js:1366 | `setTimeout` 500ms | Freeform entry content | **localStorage** (via `saveReport()`) | Textarea input event (freeform entry editing) |
| quick-interview.js:5409 | `visibilitychange` | Full draft | **localStorage** + **Supabase** `interview_backup` | Tab switch/lock phone — `saveToLocalStorage()` + `flushInterviewBackup()` |
| quick-interview.js:5418 | `pagehide` | Full draft | **localStorage** + **Supabase** `interview_backup` | Page navigation/close — `saveToLocalStorage()` + `flushInterviewBackup()` |
| report.js:2256 | `setTimeout` 500ms | Report edit state | **localStorage** (`saveReportToLocalStorage`) | `scheduleSave()` — any field input |
| report.js:2276 | `setTimeout` 5000ms | Report edit state | **Supabase** `report_backup` table | `markReportBackupDirty()` — 5s quiet debounce |
| report.js:4538-4544 | `visibilitychange` | Report edit state | **localStorage** + **Supabase** `report_backup` | Tab switch/lock phone |
| report.js:4547-4553 | `pagehide` | Report edit state | **localStorage** + **Supabase** `report_backup` | Page navigation/close |
| lock-manager.js:235 | `setInterval` 120000ms (2min) | `last_heartbeat` timestamp | **Supabase** `active_reports` table | `startHeartbeat()` after acquiring lock |

---

## 6. Data Flow Gaps

### Supabase tables written but never read from within the codebase

| Table | Written By | Read By |
|---|---|---|
| `interview_backup` | quick-interview.js (upsert) | **NEVER READ** — only deleted during cleanup |
| `report_backup` | report.js (upsert) | **NEVER READ** — only deleted during cleanup |
| `ai_submissions` | quick-interview.js (upsert) | **NEVER READ** — only deleted during cleanup |

These three tables serve as server-side crash recovery backups. They are written to continuously but there is **no code path to restore data from them** on the client side. If a user loses their localStorage/IndexedDB, this backup data exists in Supabase but cannot be retrieved by the app.

### IndexedDB stores written but never read

| Store | Written By | Read By |
|---|---|---|
| `archives` | **NEVER WRITTEN** | **NEVER READ** |

The `archives` store is defined in the schema but has zero CRUD operations. It is completely dead.

### Data that flows up to Supabase but has no path back down

| Data | Goes Up Via | Comes Back Via |
|---|---|---|
| `interview_backup.page_state` | quick-interview.js autosave | **No restore path** |
| `report_backup.page_state` | report.js autosave | **No restore path** |
| `ai_submissions` (original_input, ai_response) | quick-interview.js after AI processing | **No read path** — report.html reads from localStorage only |
| `photos` table metadata | quick-interview.js during FINISH | quick-interview.js:1100 (only for delete) — **no read-for-display path** |

The `photos` table is only ever SELECT'd to get `storage_path` values for deletion. Photo display always uses URLs stored in the in-memory `report.photos` array (populated from localStorage, not from the `photos` table).

---

## 7. Dead Code

### data-layer.js — 15 of 21 exported methods are never called externally

| Method | Called? | Called From |
|---|---|---|
| `loadProjects` | Yes | index.js |
| `loadActiveProject` | Yes | index.js, quick-interview.js, report.js |
| `refreshProjectsFromCloud` | Yes | index.js |
| `loadUserSettings` | Yes | quick-interview.js, report.js |
| `setActiveProjectId` | **NEVER** | — |
| `getActiveProjectId` | **NEVER** | — |
| `saveUserSettings` | **NEVER** | — |
| `savePhoto` | **NEVER** | — |
| `getPhotos` | **NEVER** | — |
| `deletePhoto` | **NEVER** | — |
| `cacheAIResponse` | **NEVER** | — |
| `getCachedAIResponse` | **NEVER** | — |
| `clearAIResponseCache` | **NEVER** | — |
| `loadArchivedReports` | **NEVER** | — |
| `submitFinalReport` | **NEVER** | — |
| `clearAfterSubmit` | **NEVER** | — |
| `normalizeProject` | Internal only | — |
| `normalizeContractor` | **NEVER** | — |
| `normalizeUserSettings` | Internal only | — |
| `isOnline` | **NEVER** | — |

### sync-manager.js — 7 of 10 exported methods are never called externally (or are no-ops)

| Method | Called? | Notes |
|---|---|---|
| `queueEntryBackup` | Yes | quick-interview.js (12+ calls) — but **always returns immediately** because `AUTO_SYNC_ENABLED = false` |
| `deleteEntry` | Yes | quick-interview.js (1 call) — but **always returns error** because `report_entries table removed` |
| `initSyncManager` | Yes | index.js, quick-interview.js — but **always returns immediately** because `AUTO_SYNC_ENABLED = false` |
| `backupEntry` | **NEVER** (external) | Only called internally |
| `backupAllEntries` | **NEVER** | — |
| `syncReport` | **NEVER** | — |
| `syncRawCapture` | **NEVER** | — |
| `processOfflineQueue` | **NEVER** (external) | Only in comment |
| `destroySyncManager` | **NEVER** | — |
| `getPendingSyncCount` | **NEVER** | — |

**The entire sync-manager.js is effectively dead.** `AUTO_SYNC_ENABLED = false` makes `queueEntryBackup` and `initSyncManager` no-ops, and all table-backed functions return error strings for removed tables.

### supabase-utils.js — 20 of 22 exported functions are never called

| Function | Called? | Called From |
|---|---|---|
| `fromSupabaseProject` | Yes | index.js, quick-interview.js, report.js, data-layer.js |
| `fromSupabaseEquipment` | **NEVER** | Only mentioned in a comment header |
| `toSupabaseProject` | **NEVER** | — |
| `fromSupabaseContractor` | **NEVER** | — |
| `toSupabaseContractor` | **NEVER** | — |
| `fromSupabaseCrew` | **NEVER** | — |
| `toSupabaseCrew` | **NEVER** | — |
| `fromSupabaseReport` | **NEVER** | — |
| `toSupabaseReport` | **NEVER** | — |
| `fromSupabaseEntry` | **NEVER** | — |
| `toSupabaseEntry` | **NEVER** | — |
| `fromSupabaseRawCapture` | **NEVER** | — |
| `toSupabaseRawCapture` | **NEVER** | — |
| `fromSupabaseAIResponse` | **NEVER** | — |
| `toSupabaseAIResponse` | **NEVER** | — |
| `fromSupabaseFinal` | **NEVER** | — |
| `toSupabaseFinal` | **NEVER** | — |
| `fromSupabasePhoto` | **NEVER** | — |
| `toSupabasePhoto` | **NEVER** | — |
| `fromSupabaseUserProfile` | **NEVER** | — |
| `toSupabaseUserProfile` | **NEVER** | — |
| `toSupabaseEquipment` | **NEVER** | — |

**91% dead code.** Only `fromSupabaseProject` is actively used. All `toSupabase*` converters are unused because page files build Supabase row objects inline instead of using the converters.

---

## 8. Coding Principle Violations

### "Never duplicate Supabase config, converters, or utilities"

**Violation 1: `loadActiveProject()` duplicated in 3+ files**

| File | Approach |
|---|---|
| data-layer.js:104 | IndexedDB-first, Supabase-fallback, caches result |
| quick-interview.js:2521 (deprecated comment) | Direct Supabase call |
| report.js:797 (deprecated comment) | Direct Supabase call |
| index.js:98 (deprecated) | IndexedDB + Supabase fallback |

quick-interview.js and report.js have migrated to `window.dataLayer.loadActiveProject()`.

**Violation 2: `loadUserSettings()` duplicated in 2+ files**

| File | Approach |
|---|---|
| data-layer.js:232 | IndexedDB-first, Supabase-fallback, caches result |

**Violation 3: Report deletion cascade duplicated in 3 files**

See Section 4 — the exact same cascading delete sequence appears in:
- quick-interview.js:1092-1171 (`deleteReportFromSupabase`)
- report.js:4460-4525 (`executeDeleteReport`)
- index.js:410-465 (inline handler)

### "Function needed in 2+ files? It belongs in /js/ shared module"

**Violations 4-8: RESOLVED** — `ensureReportExists()`, `saveToFinalReports()`, `updateReportStatus()`, `uploadPDFToStorage()`, `cleanupLocalStorage()` were duplicated in finalreview.js. finalreview.js has been removed; these functions now live only in report.js.

### Same Supabase call pattern in 2+ page files

| Pattern | Files |
|---|---|
| `.from('reports').delete().eq('id', ...)` | index.js:453, report.js:4520 |
| `.from('final_reports').delete().eq('report_id', ...)` | index.js:450, report.js:4517 |
| `.from('photos').delete().eq('report_id', ...)` | index.js:451, report.js:4518 |
| `.from('interview_backup').delete().eq('report_id', ...)` | index.js:431, report.js:4498 |
| `.from('report_backup').delete().eq('report_id', ...)` | index.js:432, report.js:4499 |
| `.from('ai_submissions').delete().eq('report_id', ...)` | index.js:433, report.js:4500 |
| `.storage.from('report-pdfs').remove(...)` | index.js:445, report.js:4512, quick-interview.js:1148 |
| `.from('projects').select('*').eq('id', ...).single()` | data-layer.js:134 |
| `.from('user_profiles').select('*').eq('auth_user_id', ...).maybeSingle()` | data-layer.js:268, auth.js:149 |

---

## 9. References to Removed Tables

### `active_reports`

| File | Line | Context | Status |
|---|---|---|---|
| lock-manager.js | 38 | `.from('active_reports').select('*')` in `checkLock()` | **LIVE CODE** — still makes Supabase calls |
| lock-manager.js | 109 | `.from('active_reports').upsert(...)` in `acquireLock()` | **LIVE CODE** |
| lock-manager.js | 156 | `.from('active_reports').delete()` in `releaseLock()` | **LIVE CODE** |
| lock-manager.js | 208 | `.from('active_reports').update(...)` in `updateHeartbeat()` | **LIVE CODE** |
| quick-interview.js | 1016 | Comment: "Lock manager disabled — active_reports table removed" | Comment only |

**Problem:** lock-manager.js still has 4 live Supabase calls to `active_reports`, but quick-interview.js line 1016 states the table has been removed. The lock manager will fail silently on every call. The lock acquisition flow in quick-interview.js is bypassed (line 1019-1021: `handleLockWarningForceEdit` just reloads the page), but lock-manager.js is still loaded and its `beforeunload` handler (line 299) and `visibilitychange` handler (line 310) will fire and make failing Supabase requests.

### `report_entries`

| File | Line | Context | Status |
|---|---|---|---|
| sync-manager.js | 70 | Comment: `// report_entries table removed — backup disabled` | Comment + error return |
| sync-manager.js | 72 | `return { success: false, error: 'report_entries table removed' }` | Error message |
| sync-manager.js | 94 | Comment: `// report_entries table removed — batch backup disabled` | Comment |
| sync-manager.js | 116 | Comment: `// report_entries table removed — delete disabled` | Comment + error return |
| sync-manager.js | 118 | `return { success: false, error: 'report_entries table removed' }` | Error message |

All references are in disabled code paths that return errors. No live Supabase calls remain.

### `report_raw_capture`

| File | Line | Context | Status |
|---|---|---|---|
| sync-manager.js | 162 | Comment: `// report_raw_capture table removed — sync disabled` | Comment + error return |
| sync-manager.js | 164 | `return { success: false, error: 'report_raw_capture table removed' }` | Error message |

All references are in disabled code paths that return errors. No live Supabase calls remain.

---

## Summary of Critical Findings

1. **Report deletion logic is tripled** across quick-interview.js, report.js, and index.js — must be extracted to a shared utility
2. **sync-manager.js is 100% dead** — every function is either a no-op (`AUTO_SYNC_ENABLED = false`) or returns an error for removed tables
3. **supabase-utils.js is 91% dead** — only `fromSupabaseProject` is used; all `toSupabase*` converters are bypassed
4. **data-layer.js is 71% dead** — 15 of 21 exported methods are never called
5. ~~**finalreview.js duplicates 7 functions** from report.js~~ — **RESOLVED**: finalreview.js removed, all functionality lives in report.js
6. **3 Supabase backup tables** (`interview_backup`, `report_backup`, `ai_submissions`) are written to but never read — no crash recovery path exists
7. **lock-manager.js references `active_reports`** which is removed — causing silent Supabase errors
8. **IndexedDB `archives` store** is in the schema but has zero operations
