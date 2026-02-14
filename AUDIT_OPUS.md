# FieldVoice Pro v6.9 — Full Codebase Audit Report

**Auditor:** Claude (Opus)  
**Date:** 2025-07-14  
**Scope:** Every JS module, HTML page, and service worker in the project  
**Codebase:** ~75 JS files, ~12 HTML pages, 1 service worker  

---

## CRITICAL (must fix before production)

### C1. Supabase Anon Key Exposed in Client Code — No RLS Verification
**File:** `js/config.js:4-5`  
**Impact:** The Supabase anon key is hardcoded in client JS. This is expected for client-side Supabase, BUT the audit brief mentions org_id-based multi-tenancy. There is **no evidence of Row-Level Security (RLS) policies** being enforced in the codebase or referenced anywhere. If RLS is not enabled on Supabase tables (reports, projects, photos, user_profiles, etc.), **any authenticated user can read/write any organization's data** using the anon key + a valid JWT.  
**Fix:** Verify RLS policies exist on ALL tables: `reports`, `projects`, `photos`, `user_profiles`, `report_data`, `ai_submissions`, `interview_backup`, `organizations`, `final_reports`, `user_devices`. Every table should have policies filtering by `auth.uid()` and/or `org_id`.

### C2. org_id Filtering is Client-Side Only
**Files:** `js/data-layer.js:27-30`, `js/data-layer.js:68-72`, `js/index/report-creation.js:13`  
**Impact:** Organization isolation depends entirely on client-side `org_id` filtering in `loadProjects()` and `refreshProjectsFromCloud()`. The `org_id` is read from `localStorage` which users can manipulate via DevTools. Without server-side RLS, changing `localStorage.fvp_org_id` would expose another org's data.  
**Fix:** RLS policies on Supabase must enforce `org_id = (SELECT org_id FROM user_profiles WHERE auth_user_id = auth.uid())` on SELECT/INSERT/UPDATE/DELETE.

### C3. Realtime Sync Filtered by user_id, Not org_id — Cross-Org Data Leak Risk
**File:** `js/shared/realtime-sync.js:29-38`  
**Impact:** The reports channel filters by `user_id=eq.{userId}`, but the `report_data` subscription has **no filter at all** — it subscribes to ALL changes on the `report_data` table. This means every user receives Realtime events for every report_data change across all organizations.  
**Fix:** Add a filter to the report_data subscription: `.filter: 'report_id=in.(SELECT id FROM reports WHERE user_id=eq.{userId})'` or rely on RLS (Supabase Realtime respects RLS policies if enabled).

### C4. No Auth Guard on login.html — Stored Credentials Leakage Path
**File:** `js/login/main.js:1-227`, `js/auth.js:136-139`  
**Impact:** The auth module skips `requireAuth()` on `login.html` and `landing.html` (correct), but there's no cleanup of sensitive localStorage keys (`fvp_user_id`, `fvp_org_id`, `fvp_auth_role`) during `signOut()`. Only `AUTH_ROLE` and `ORG_ID` are cleared at `js/auth.js:67-68`. **`USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`, and `DEVICE_ID` persist after logout**, which means a second user on the same device could inherit the first user's identity for local operations.  
**Fix:** In `signOut()`, clear ALL `STORAGE_KEYS` values (or at minimum: `USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`). Also clear IndexedDB stores and `fvp_current_reports`.

---

## HIGH (should fix soon)

### H1. Service Worker Caches Non-Existent Files (404 Errors on Install)
**File:** `sw.js:47-82`  
**Impact:** The `STATIC_ASSETS` array references **~20 files that don't exist** after Sprint 11 consolidation:
- `./js/interview/entries.js` → consolidated into `state-mgmt.js`
- `./js/interview/toggles.js` → consolidated into `state-mgmt.js`
- `./js/interview/draft-storage.js` → consolidated into `persistence.js`
- `./js/interview/autosave.js` → consolidated into `persistence.js`
- `./js/interview/capture-mode.js` → consolidated into `ui-flow.js`
- `./js/interview/contractors.js` → consolidated into `contractors-personnel.js`
- `./js/interview/personnel.js` → consolidated into `contractors-personnel.js`
- `./js/interview/equipment.js` → consolidated into `equipment-manual.js`
- `./js/interview/manual-adds.js` → consolidated into `equipment-manual.js`
- `./js/interview/supabase.js` → consolidated into `persistence.js`
- `./js/interview/weather.js` → consolidated into `ui-display.js`
- `./js/interview/previews.js` → consolidated into `ui-display.js`
- `./js/interview/na-marking.js` → consolidated into `state-mgmt.js`
- `./js/interview/ai-processing.js` → consolidated into `finish-processing.js`
- `./js/interview/processing-overlay.js` → consolidated into `ui-flow.js`
- `./js/interview/finish.js` → consolidated into `finish-processing.js`
- Missing: `./js/interview/state-mgmt.js`, `./js/interview/ui-flow.js`, `./js/interview/ui-display.js`, `./js/interview/contractors-personnel.js`, `./js/interview/equipment-manual.js`, `./js/interview/finish-processing.js`

The `cache.addAll()` call will partially fail (it uses `catch` to swallow errors), but many interview JS files won't be cached. **Offline mode for the interview page is completely broken.**  
**Fix:** Update `STATIC_ASSETS` to match the actual file names after consolidation.

### H2. Sync Queue is Written To But Never Consumed
**File:** `js/storage-keys.js:176-196` (TODO comment at line 176)  
**Impact:** `addToSyncQueue()` is called in `js/interview/finish-processing.js:159` when offline processing occurs, but there is **no background worker or sync mechanism** that ever reads this queue. Reports saved while offline via `handleOfflineProcessing()` are added to the queue but will never be automatically processed when connectivity returns.  
**Fix:** Either implement a sync worker that processes the queue on `online` events, or remove the queue entirely and rely on the interview_backup + manual retry pattern already in place.

### H3. Race Condition: Multiple Concurrent `saveCurrentReport()` Calls
**Files:** `js/storage-keys.js:161-181`, `js/interview/persistence.js:75-120`  
**Impact:** `saveCurrentReport()` reads the entire `fvp_current_reports` object from localStorage, modifies one key, then writes it all back. With the 500ms debounce in `saveReport()` and the 5s debounce for `flushInterviewBackup()`, plus the `visibilitychange`/`pagehide` emergency saves, multiple concurrent read-modify-write cycles can occur. Since localStorage is synchronous but JS is single-threaded, this is mostly safe, EXCEPT when `pagehide` fires during an already-running debounced save — the emergency save could overwrite data that the debounced save was about to write.  
**Fix:** Use a write-lock flag or merge strategy in `saveCurrentReport()`.

### H4. `getReport()` Has Broken `loadFromLocalStorage()` Call
**File:** `js/interview/persistence.js:241-250`  
**Impact:** In `getReport()`, there's this code:
```js
var localDraft = loadFromLocalStorage.call({ currentReportId: urlReportId }, urlReportId);
// loadFromLocalStorage reads IS.currentReportId — temporarily set it
var prevId = IS.currentReportId;
IS.currentReportId = urlReportId;
localDraft = loadFromLocalStorage();
IS.currentReportId = prevId;
```
The first `.call()` invocation passes a context object but `loadFromLocalStorage` reads from the global `IS.currentReportId`, not `this.currentReportId`. The result of this first call is immediately overwritten. This is dead code that should be cleaned up to avoid confusion.  
**Fix:** Remove the dead `.call()` line.

### H5. Webhook URLs Hardcoded — No Environment Configuration
**Files:** `js/interview/finish-processing.js:7`, `js/report/ai-refine.js:5-6`, `js/shared/ai-assistant.js:5`  
**Impact:** Three different n8n webhook URLs are hardcoded. If these webhooks are rotated or a staging environment is needed, every file must be manually edited. More importantly, these URLs are **publicly visible in client code** — anyone can call them.  
**Fix:** Move webhook URLs to `js/config.js` alongside Supabase credentials. Consider adding request signing or API key authentication to the webhooks.

### H6. Photo Base64 Stored in localStorage — Quota Exhaustion Risk
**Files:** `js/interview/photos.js:47-65`, `js/interview/persistence.js:67-120`  
**Impact:** When a photo upload fails (offline or error), the full base64 data URL remains in the photo object (`photoObj.base64`). This object is saved via `saveReport()` → `saveToLocalStorage()` → `saveCurrentReport()` into `fvp_current_reports` in localStorage. At 1200px width and 0.7 quality JPEG, each photo is ~200-400KB base64. With 5-10 failed uploads, this can exhaust the ~5MB localStorage quota, causing ALL subsequent saves to fail silently (the `setStorageItem` catch returns `false` but callers don't check it).  
**Fix:** Never store base64 in localStorage. Store only in IndexedDB (which has effectively unlimited storage). The localStorage entries should reference photos by ID only, with the actual data in IDB.

### H7. `deleteReportCascade` Missing `report_data` Table Deletion
**File:** `js/shared/delete-report.js:47-50`  
**Impact:** The delete cascade deletes from `interview_backup`, `report_backup`, `ai_submissions`, `photos`, `final_reports`, and `reports`, but does NOT delete from `report_data`. Orphaned rows in `report_data` will accumulate over time.  
**Fix:** Add `'report_data'` to the `childTables` array at line 47.

---

## MEDIUM (improvement opportunities)

### M1. `innerHTML` Used with User Content in Multiple Places
**Files:** `js/interview/guided-sections.js:37`, `js/interview/freeform.js:89-115`, `js/index/report-cards.js:166-210`  
**Impact:** While `escapeHtml()` is used correctly in most places, there are patterns like `displayContent = escapedContent || '<span class="text-slate-400 italic">Empty entry</span>'` where the fallback is safe but the pattern is fragile. In `renderReportCard()`, the UUID is inserted into `onclick` handlers via template literals — if the UUID contained quotes, it could break the handler (UUIDs are hex+dashes so this is theoretical).  
**Fix:** Use `data-*` attributes and event delegation instead of inline `onclick` with interpolated values.

### M2. No Token Refresh Handling — Session Expiry Mid-Operation
**File:** `js/auth.js:14-30`  
**Impact:** `requireAuth()` calls `getSession()` once on page load. If the user stays on the interview page for hours (common for field inspectors), the Supabase JWT can expire. All subsequent Supabase calls will fail silently (returning 401 errors that are logged but not displayed to the user). The interview backup, photo uploads, and report saves will all fail without the user knowing.  
**Fix:** Implement `supabaseClient.auth.onAuthStateChange()` listener to handle token refresh and session expiry. Show a re-authentication prompt if the session expires.

### M3. `report/delete-report.js` Bypasses `saveCurrentReport`/`deleteCurrentReport`
**File:** `js/report/delete-report.js:29-31`  
**Impact:** This file directly manipulates `localStorage.getItem('fvp_current_reports')` and `localStorage.setItem()` instead of using the `deleteCurrentReport()` helper from `storage-keys.js`. This bypasses the IndexedDB write-through and means deleted reports persist in IDB.  
**Fix:** Replace lines 29-31 with `deleteCurrentReport(RS.currentReportId)`.

### M4. `confirmDeleteReport` Name Collision Between report-cards.js and delete-report.js
**Files:** `js/index/report-cards.js:368`, `js/report/delete-report.js:7`  
**Impact:** Both files define `confirmDeleteReport` on `window`. On `report.html`, the report-specific version loads last and wins. But if the load order ever changes or both are included on the same page, one will silently override the other.  
**Fix:** Namespace the functions: `window.dashboardDeleteReport()` vs `window.reportPageDeleteReport()`.

### M5. AI Assistant Uses Wrong localStorage Key for Active Project
**File:** `js/shared/ai-assistant.js:349-361`  
**Impact:** `getProjectContext()` reads `fvp_active_project` (wrong key) instead of `fvp_active_project_id` (correct `STORAGE_KEYS.ACTIVE_PROJECT_ID`). The AI assistant will never find the active project, so all AI queries lack project context.  
**Fix:** Change `localStorage.getItem('fvp_active_project')` to `localStorage.getItem('fvp_active_project_id')` and then look up the project from the `STORAGE_KEYS.PROJECTS` map.

### M6. Persistent Storage Requested Twice Per Page Load
**Files:** `js/auth.js:130-134`, `js/pwa-utils.js:29-32`  
**Impact:** Both `auth.js` (on DOMContentLoaded) and `initPWA()` call `navigator.storage.persist()`. While idempotent, it's unnecessary duplication and adds noise to logs.  
**Fix:** Remove from one location (keep in `auth.js` since it runs on every protected page).

### M7. `archives.html` Missing `data-layer.js` and `indexeddb-utils.js` in Script Load
**File:** `archives.html:83-90`  
**Impact:** Archives page loads `config.js`, `storage-keys.js`, `realtime-sync.js`, `ui-utils.js`, `indexeddb-utils.js`, `auth.js`, and `archives/main.js`. It does NOT load `data-layer.js`. While this may work if archives only use direct Supabase queries, the `realtime-sync.js` calls `window.dataLayer.refreshProjectsFromCloud()` in `_handleProjectChange()` which would fail.  
**Fix:** Add `data-layer.js` to the script list if realtime-sync is loaded.

### M8. No Input Validation on Number Fields in Personnel Section
**File:** `js/interview/contractors-personnel.js:367-410`  
**Impact:** Personnel number inputs have `min="0" max="99"` but no JS validation. Users can type negative numbers or numbers > 99 (browser enforcement of `min`/`max` is inconsistent on mobile). The values are parsed with `parseInt()` which can return `NaN`.  
**Fix:** Clamp values in `updateOperations()`: `Math.max(0, Math.min(99, parseInt(input.value) || 0))`.

### M9. Weather API Called Without Rate Limiting
**File:** `js/interview/ui-display.js:3-32`  
**Impact:** `fetchWeather()` calls the Open-Meteo API on every page load where weather is "Syncing..." or "--". If a user refreshes repeatedly or if the GPS keeps failing and weather stays at default, this could generate excessive API calls. Open-Meteo is free but has rate limits.  
**Fix:** Add a timestamp check — don't re-fetch if weather was fetched within the last 10 minutes.

### M10. `fvp_projects_cache_ts` Uses Raw String Key Instead of STORAGE_KEYS
**Files:** `js/data-layer.js:38`, `js/report-rules.js:297`  
**Impact:** These files use the string `'fvp_projects_cache_ts'` directly instead of adding it to `STORAGE_KEYS`. This breaks the single-source-of-truth pattern for storage keys.  
**Fix:** Add `PROJECTS_CACHE_TS: 'fvp_projects_cache_ts'` to `STORAGE_KEYS`.

### M11. `fvp_ai_conversation` in AI Assistant Not Namespaced per User
**File:** `js/shared/ai-assistant.js:6`  
**Impact:** The AI conversation is stored at a single key `fvp_ai_conversation`. If two users share a device (common with shared tablets on job sites), they see each other's AI conversation history.  
**Fix:** Namespace by `fvp_ai_conversation_{authUserId}` or clear on sign-out.

---

## LOW (nice to have)

### L1. `var` Declarations in Module-Pattern Files
**Files:** Multiple files use `var IS = window.interviewState;` at top level.  
**Impact:** Each interview file re-declares `var IS` at the global scope. Since they all point to the same `window.interviewState`, this works but is redundant.  
**Fix:** Consider a single namespace assignment in `state-mgmt.js` and access via `window.interviewState` directly in other files.

### L2. Date Parsing Inconsistency
**File:** `js/ui-utils.js:39`  
**Impact:** `formatDate()` adds `T12:00:00` to date-only strings to avoid timezone issues, which is correct. But in other files, dates are parsed without this fix (e.g., `js/report/form-fields.js:145` uses `new Date(dateStr + 'T12:00:00')` locally). The approach is correct but should be centralized.  
**Fix:** Use `getLocalDateString()` consistently for all date formatting.

### L3. `crypto.randomUUID()` Not Available in Older Browsers
**Files:** `js/ui-utils.js:11`, `js/storage-keys.js:121`  
**Impact:** `crypto.randomUUID()` requires a secure context (HTTPS) and is not available in some older mobile browsers. The app is a PWA on HTTPS so this is likely fine, but there's no fallback.  
**Fix:** Add a polyfill or `uuid()` fallback function.

### L4. `cleanupLocalStorage()` in Submit Flow Bypasses Helper Functions
**File:** `js/report/submit.js:106-120`  
**Impact:** `cleanupLocalStorage()` directly calls `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` and `setStorageItem()` to update report status after submit. This bypasses `saveCurrentReport()` which includes the IndexedDB write-through.  
**Fix:** Use `saveCurrentReport()` for the status update, then call `syncCurrentReportsToIDB()`.

### L5. Debug Panel Exposed in Production
**File:** `js/report/debug.js` (loaded on `report.html`)  
**Impact:** A debug panel with full report state inspection is available to all users. While it requires clicking a hidden button, it exposes internal state.  
**Fix:** Gate behind a `?debug=true` URL param or remove for production.

### L6. `confirm()` Dialogs Used for Destructive Actions
**Files:** `js/interview/freeform.js:166`, `js/interview/freeform.js:278`  
**Impact:** Native `confirm()` dialogs block the main thread and look different across browsers. They also can't be styled.  
**Fix:** Replace with custom modal dialogs (the pattern already exists elsewhere in the codebase).

### L7. Three.js Loaded on Dashboard for AR Feature
**File:** `index.html:38`  
**Impact:** Three.js (~600KB) is loaded via CDN on the dashboard even though AR measurement is a rarely-used tool. This adds significant weight to initial page load.  
**Fix:** Lazy-load Three.js only when the AR tool is opened.

---

## ARCHITECTURE NOTES

### A1. Solid Local-First Architecture
The IndexedDB + localStorage + Supabase tiering is well-designed. The IDB hydration on startup (`hydrateCurrentReportsFromIDB`) handles iOS 7-day storage eviction nicely. The dual-write pattern (localStorage for speed, IDB for durability) is appropriate for the use case.

### A2. Script Load Order is Correct but Fragile
The dependency chain (`config.js` → `storage-keys.js` → `indexeddb-utils.js` → `data-layer.js` → `auth.js`) is correct across all HTML pages. However, there's no validation that dependencies are loaded. A single missing `<script>` tag would cause silent failures. Consider adding a lightweight dependency check or migrating to ES modules.

### A3. State Management is Reasonable for No-Framework
The `window.interviewState` and `window.reportState` patterns work well for the no-framework constraint. The clear separation between interview state (`IS`) and report state (`RS`) prevents cross-contamination.

### A4. Emergency Save Pattern is Excellent
The `visibilitychange` + `pagehide` handlers for emergency saves (`js/interview/main.js:170-182`, `js/report/main.js:95-106`) handle iOS Safari's aggressive tab eviction well. This is a common source of data loss in PWAs and it's handled correctly here.

### A5. Photo Upload Architecture is Well-Designed
The background upload pattern (show photo immediately → upload in background → update status indicator) provides excellent UX. The fallback to upload-on-submit for offline scenarios is robust. The only concern is base64 in localStorage (see H6).

### A6. Multi-Device Sync is Functional but Has Gaps
The combination of `interview_backup` (Supabase) + `report_data` (Supabase) + Realtime subscriptions provides a reasonable multi-device experience. However, there's no conflict resolution — the last write wins. If two devices edit the same draft, one device's changes will be silently lost.

### A7. Dead Code / Legacy Patterns
- `SYNC_QUEUE` is written to but never consumed (H2)
- `loadActiveProject()` is deprecated but still exists (data-layer.js:60)
- `final_reports` table references exist in delete cascade but the table is deprecated
- The `report_backup` table is referenced in delete cascade (line 47 of shared/delete-report.js) but is described as deprecated

### A8. Missing Error Boundaries
Many async operations use fire-and-forget patterns (`.catch(function(e) { console.warn(...) })`) which is appropriate for non-critical operations like IDB write-through. However, critical operations like `saveReportToSupabase()` and `callProcessWebhook()` should surface errors more prominently — a failed webhook call during the finish flow shows a toast but the user might miss it on mobile.

### A9. No Automated Testing
There are no test files in the project. Given the complexity of the data flow (localStorage ↔ IndexedDB ↔ Supabase), the report status state machine, and the multi-device sync, even basic integration tests would prevent regressions.

### A10. PWA Manifest and Icons
Not audited in detail, but the manifest is referenced correctly and icons are present. The SW scope fix from Sprint 14 (using `location.pathname` to set scope) is correct.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| CRITICAL | 4 | RLS/auth gaps, org isolation, data leakage |
| HIGH | 7 | SW cache broken, sync queue dead, localStorage quota, missing cascade |
| MEDIUM | 11 | XSS patterns, token refresh, key collisions, API rate limiting |
| LOW | 7 | Code style, dead code, perf optimizations |
| ARCH | 10 | Solid foundation, needs RLS, testing, and conflict resolution |

**Top 3 Actions:**
1. **Verify Supabase RLS policies** — this is the single most important security requirement
2. **Fix service worker cache list** — offline mode is broken for interview pages
3. **Add token refresh handling** — field workers on long sessions will lose data
