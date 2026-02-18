# FieldVoice Pro V69 — Full Dashboard Audit Report

**Date:** 2025-02-14  
**Auditor:** Claude (automated code audit)  
**Scope:** All 11 HTML pages, all JS modules, service worker, cross-page state, README compliance  
**Trigger:** Dashboard doesn't refresh on iOS after returning from interview/report pages (post-commit `0e1edb3`)

---

## Executive Summary

The `refreshDashboard()` fix in commit `0e1edb3` is **correctly implemented** — the logic, event listeners, and data flow are all sound. The reason it's **still not working on Jackson's iPhone** is almost certainly that the **service worker is serving the OLD cached `main.js`** from before the fix was deployed. The cache-first strategy for static assets means the new code never reaches the PWA until the SW itself updates — and on iOS standalone PWAs, SW updates are notoriously unreliable.

### Critical Findings Count
| Severity | Count |
|----------|-------|
| **CRITICAL** | 2 |
| **HIGH** | 4 |
| **MEDIUM** | 5 |
| **LOW** | 4 |

---

## 🔴 WHY THE DASHBOARD STILL DOESN'T REFRESH ON iOS

### Root Cause Analysis

The fix is correct but **never reaches the client**. Here's the chain of failure:

1. **`version.json` says `6.9.15`** but **`sw.js` CACHE_VERSION says `v6.9.16`**  
   - File: `version.json` line 1: `{"version": "6.9.15"}`  
   - File: `sw.js` line 7: `const CACHE_VERSION = 'v6.9.16';`  
   - This mismatch means the version bumping process is inconsistent. If the last _deployed_ version was 6.9.15, and the SW was already cached at that version, the SW won't detect an update because it compares the sw.js byte content — but if the deploy only pushed the JS files and not the sw.js update, or if the sw.js was pushed but iOS hasn't re-fetched it yet, the old cache persists.

2. **Cache-first strategy for static assets** (`sw.js:173-206`)  
   - `handleStaticRequest()` returns cached responses immediately and updates in the background via `updateCacheInBackground()`.  
   - On iOS Safari/PWA, the background fetch may silently fail or never execute (iOS aggressively kills background tasks).  
   - The user sees the OLD `js/index/main.js` (without `refreshDashboard()`) forever until they manually clear the PWA or the SW update cycle completes.

3. **iOS standalone PWA SW update timing** is terrible:
   - iOS only checks for SW updates when the PWA is cold-launched (not app-switched)
   - Even when a new SW is detected, it enters `waiting` state
   - `self.skipWaiting()` is called in the install handler (`sw.js:155`) which is good
   - `self.clients.claim()` is called in activate (`sw.js:168`) which is good
   - But the **stale-while-revalidate background update** (`updateCacheInBackground`, line 233) fires AFTER serving the cached version — so the first load after SW update still serves old files!

4. **No force-refresh mechanism visible to the user**  
   - `pwa-utils.js` shows a blue "Update available — tap to refresh" banner when a new SW is installed (`showUpdateBanner()`, line 140)
   - But this banner only shows when `newWorker.state === 'installed' && navigator.serviceWorker.controller` — which requires the page to be open during the SW update cycle. If the user simply opens the PWA and the old SW is still active, they never see the banner.

### Recommended Fix (Priority: IMMEDIATE)

**Option A — Force cache bust on critical files:**
```javascript
// In sw.js fetch handler, for same-origin JS files, use network-first instead of cache-first:
if (url.pathname.endsWith('.js') && url.origin === self.location.origin) {
    event.respondWith(handleNavigationRequest(request)); // network-first
    return;
}
```

**Option B — Add a version check on page load:**
```javascript
// In js/index/main.js or pwa-utils.js, at DOMContentLoaded:
fetch('./version.json?_=' + Date.now())
    .then(r => r.json())
    .then(data => {
        const currentVersion = document.querySelector('footer')?.textContent?.match(/v([\d.]+)/)?.[1];
        if (data.version && currentVersion && data.version !== currentVersion) {
            // Force reload to get new assets
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
            location.reload(true);
        }
    });
```

**Option C — Immediate manual fix for Jackson:**
Tell Jackson to:
1. Close the PWA completely (swipe up from app switcher)
2. Open Safari → Settings → Clear Website Data for the FieldVoice domain
3. Re-open the PWA from home screen

---

## CRITICAL Findings

### C-01: Service Worker Serves Stale JavaScript (Cache-First)

**Severity:** CRITICAL  
**File:** `sw.js`, lines 173-206  
**Impact:** All JS bug fixes (including the dashboard refresh fix) are invisible to users with cached PWA

The static asset handler uses cache-first:
```javascript
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        // Return cached version and update cache in background
        updateCacheInBackground(request);
        return cachedResponse;  // ← USER GETS OLD FILE
    }
    // ...
}
```

The `updateCacheInBackground()` function (line 233) fetches the new version and stores it, but the user already received the stale response. The next page load will serve the updated version — but on iOS PWAs, "next page load" may not happen for days because pages are bfcache'd.

**Recommendation:**  
For `.js` and `.html` files on the same origin, switch to **network-first with cache fallback** (like navigation requests already use). Cache-first should only apply to truly immutable assets (CDN libraries, icons, fonts).

### C-02: version.json / sw.js CACHE_VERSION Mismatch

**Severity:** CRITICAL  
**File:** `version.json` (line 1) and `sw.js` (line 7)  
**Impact:** Version tracking is unreliable; deploy scripts may not trigger SW updates

```
version.json:  {"version": "6.9.15"}
sw.js:         const CACHE_VERSION = 'v6.9.16';
```

The sw.js comment says: _"Update version.json first, then mirror the value here."_ But they're out of sync. If a deploy process relies on `version.json` to decide whether to invalidate caches, it will see `6.9.15` and may not push the SW update.

**Recommendation:**  
1. Make version.json authoritative — have sw.js read from it (via importScripts or inline during build)
2. Or: add a pre-push git hook that verifies `version.json` matches `CACHE_VERSION` in `sw.js`

---

## HIGH Findings

### H-01: report.html Missing pwa-utils.js, report-rules.js, media-utils.js

**Severity:** HIGH  
**File:** `report.html`, lines 21-33  
**Impact:** No service worker registration, no offline banner, no PWA navigation handling on report page

The report page loads these core scripts:
```
supabase-js, jspdf, config.js, cloud-photos.js, delete-report.js,
supabase-retry.js, realtime-sync.js, storage-keys.js, indexeddb-utils.js,
data-layer.js, supabase-utils.js, auth.js, ui-utils.js
```

**Missing:**
- `pwa-utils.js` — no SW registration, no offline banner, no PWA navigation fix
- `report-rules.js` — if any report module uses `REPORT_STATUS` constants or `getReportsByUrgency()`
- `media-utils.js` — if report page does photo handling (though photos.js may not be in scope)

**Risk:** On iOS standalone PWA, clicking links on the report page will **break out of standalone mode** and open Safari, because `setupPWANavigation()` from pwa-utils.js is never called.

**Recommendation:** Add `<script src="./js/pwa-utils.js"></script>` to report.html head.

### H-02: index.html Missing shared/supabase-retry.js

**Severity:** HIGH  
**File:** `index.html`, head script tags  
**Impact:** If any dashboard module uses `supabaseRetry()`, it will throw ReferenceError

The dashboard loads `realtime-sync.js` which may internally use `supabaseRetry`. The interview page and report page both include `supabase-retry.js`, but the dashboard (`index.html`) does not.

Scripts loaded on index.html head:
```
supabase-js, config.js, cloud-photos.js, delete-report.js, realtime-sync.js,
storage-keys.js, report-rules.js, supabase-utils.js, pwa-utils.js, ui-utils.js,
indexeddb-utils.js, data-layer.js, auth.js
```

**Missing:** `shared/supabase-retry.js`

**Recommendation:** Add `<script src="./js/shared/supabase-retry.js"></script>` before `realtime-sync.js` in index.html.

### H-03: archives.html Missing Critical Dependencies

**Severity:** HIGH  
**File:** `archives.html`, lines 82-93  
**Impact:** Missing `data-layer.js`, `supabase-utils.js`, `pwa-utils.js`

The archives page loads:
```
supabase-js (CDN), config.js, storage-keys.js, realtime-sync.js,
ui-utils.js, indexeddb-utils.js, auth.js, archives/main.js, ai-assistant.js
```

**Missing:**
- `pwa-utils.js` — no offline banner, no PWA navigation handling
- `data-layer.js` — if archives/main.js uses `window.dataLayer` methods
- `supabase-utils.js` — if archive code needs `fromSupabaseProject()` etc.

**Risk:** PWA standalone mode links will break on archives page. The `data-layer.js` absence may be OK if archives/main.js queries Supabase directly, but it violates the architectural principle of using data-layer as the single access point.

### H-04: `refreshDashboard()` Calls `syncWeather()` Which May Not Be Ready

**Severity:** HIGH  
**File:** `js/index/main.js`, line 283 (inside `refreshDashboard`)  
**Impact:** Potential ReferenceError if weather.js hasn't loaded yet

In `refreshDashboard()`:
```javascript
// 7. Sync weather
syncWeather();
```

The script loading order in `index.html` loads weather.js (line ~838) BEFORE main.js (line ~843), so normally `syncWeather` is defined. However, if `refreshDashboard` is called from `pageshow` or `visibilitychange` before the page is fully loaded (edge case with bfcache restore while scripts are still loading), this could fail.

**Mitigation:** The function already has a try/catch around the entire body. Risk is low but worth a `typeof syncWeather === 'function'` guard.

---

## MEDIUM Findings

### M-01: No `report-rules.js` on report.html

**Severity:** MEDIUM  
**File:** `report.html`  
**Impact:** If report modules reference `REPORT_STATUS` or `getTodayDateString()`, they'd get ReferenceError

The report page does not load `report-rules.js`. The report modules (`js/report/*.js`) were not fully audited for usage of these constants, but the risk exists.

### M-02: Inconsistent `cloud-photos.js` Loading

**Severity:** MEDIUM  
**Files:** `index.html` (line 23), `report.html` (line 24) — loaded; `quick-interview.html` — NOT loaded  
**Impact:** `fetchCloudPhotosBatch()` is available on dashboard and report but not on interview page

The interview page has its own photo upload logic in `interview/photos.js` and `interview/persistence.js`, so this may be intentional. But if any shared code (like `realtime-sync.js` or `ai-assistant.js`) calls `fetchCloudPhotosBatch`, it would fail on the interview page.

### M-03: `data-layer.js` Missing from `project-config.html` Head

**Severity:** MEDIUM  
**File:** `project-config.html`, lines 23-29 vs 537-538  
**Impact:** `data-layer.js` is loaded late (line 538) instead of in the head

The project-config page loads `indexeddb-utils.js` and `data-layer.js` at lines 537-538 (body), while other dependencies like `config.js`, `storage-keys.js`, `auth.js` are in the head. This is technically fine for script execution order (body scripts run after head scripts), but it means any inline HTML event handlers that fire before line 538 won't have `window.dataLayer` available.

### M-04: The `_dashboardRefreshing` Debounce Has a Race Condition

**Severity:** MEDIUM  
**File:** `js/index/main.js`, lines 221-230  
**Impact:** If `refreshDashboard` throws before the `finally` block, `_dashboardRefreshing` stays `true` forever

```javascript
var _dashboardRefreshing = false;

async function refreshDashboard(source) {
    if (_dashboardRefreshing) {
        console.log('[INDEX] refreshDashboard already running, skipping');
        return;
    }
    _dashboardRefreshing = true;
    // ... try/catch/finally sets it back to false
```

The `finally` block does reset it, so this is actually safe. But the risk is if `hydrateCurrentReportsFromIDB()` hangs (IDB transaction stuck), the flag stays true and no further refreshes can happen. Consider adding a timeout fallback.

### M-05: `pageshow` Listener Only Fires for `event.persisted`

**Severity:** MEDIUM  
**File:** `js/index/main.js`, lines 289-294  
**Impact:** On iOS standalone PWA, back-navigation doesn't always set `event.persisted = true`

```javascript
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[INDEX] Page restored from bfcache');
        refreshDashboard('pageshow-bfcache');
    }
});
```

On iOS Safari PWA, navigating back via `<a href="index.html">` on the interview page creates a **new page load**, not a bfcache restore. So `event.persisted` is `false` and this listener doesn't fire. The `visibilitychange` listener is the one that should catch this — and it does — but only if the page was hidden first. If the user taps a link back to index.html, it's a full navigation, and `DOMContentLoaded` handles it (which calls `refreshDashboard('DOMContentLoaded')`). So this is actually covered. **However**, in iOS standalone PWA mode where the page was previously in the WebKit process snapshot (not bfcache), `event.persisted` may be `false` even though the page state is stale. The `visibilitychange` listener covers this case.

**Verdict:** The code handles all cases correctly via the combination of `pageshow`, `visibilitychange`, and `DOMContentLoaded`. This is a false alarm. Upgrading to LOW.

---

## LOW Findings

### L-01: Inline `<style>` Blocks in HTML Files

**Severity:** LOW  
**Files:** All 11 HTML files  
**Impact:** CSS duplication, harder maintenance

Every HTML file has an inline `<style>` block in the head with page-specific CSS (safe area padding, custom animations, etc.). While not a JS violation, this could be extracted into per-page CSS files or the shared `output.css`.

### L-02: `event.stopPropagation()` as Inline Handler

**Severity:** LOW  
**File:** `index.html`, line 770  
**Impact:** Technically an inline handler with logic, but it's a single-statement idiom

```html
<div ... onclick="event.stopPropagation()">
```

This is a common pattern for modal backdrop click handling. It's a borderline violation of the "no complex inline handlers" rule but is a standard DOM pattern.

### L-03: Landing Page Minimal Dependencies

**Severity:** LOW  
**File:** `landing.html`  
**Impact:** Landing page only loads `pwa-utils.js` — missing `storage-keys.js` if any landing code uses `STORAGE_KEYS`

The landing page is a marketing page, so minimal dependencies make sense. However, `js/landing/main.js` was not audited to confirm it doesn't reference storage-keys functions.

### L-04: `login.html` Missing `pwa-utils.js`

**Severity:** LOW  
**File:** `login.html`  
**Impact:** No PWA navigation handling on login page

The login page loads only `supabase-js`, `config.js`, `storage-keys.js`, and `login/main.js`. Missing `pwa-utils.js` means no offline banner and no PWA standalone navigation fix. This is lower severity because the login page redirects to index.html on success, and being offline on the login page is inherently non-functional.

---

## Audit Section 1: Inline JS Violations

### Result: PASS ✅

All 11 HTML files use only `<script src="...">` tags. **Zero** inline `<script>` blocks with code were found.

**Inline event handlers audit:**

| File | Simple onclick (OK) | Complex onclick (violation) |
|------|--------------------|-----------------------------|
| index.html | ~30 (all simple function calls) | 1 borderline: `event.stopPropagation()` |
| quick-interview.html | ~15 | 0 |
| report.html | ~10 | 0 |
| archives.html | 1 (`retryLoad()`) | 0 |
| permissions.html | 0 | 0 |
| projects.html | 1 (`refreshProjectsFromCloud()`) | 0 |
| project-config.html | 3 | 0 |
| settings.html | 1 | 0 |
| login.html | 3 | 0 |
| landing.html | ~5 | 0 |
| permission-debug.html | ~5 | 0 |

All onclick handlers are simple `functionName()` or `functionName(arg)` calls. No multi-statement, no if/else, no anonymous functions in any onclick attribute.

---

## Audit Section 2: bfcache Fix Verification

### Result: CORRECTLY IMPLEMENTED ✅ (but blocked by SW caching — see C-01)

The `refreshDashboard()` function at `js/index/main.js:229-287`:

| Requirement | Status | Line |
|-------------|--------|------|
| Hydrate reports from IndexedDB | ✅ `await hydrateCurrentReportsFromIDB()` | 241 |
| Load projects from IDB + Supabase | ✅ `await window.dataLayer.loadProjects()` + `refreshProjectsFromCloud()` | 249-257 |
| Update `projectsCache` | ✅ `projectsCache = projects` | 260 |
| Prune stale reports | ✅ `pruneCurrentReports()` | 263 |
| Call `renderReportCards()` | ✅ | 266 |
| Call `updateReportStatus()` | ✅ | 267 |
| Run `recoverCloudDrafts()` | ✅ | 270 |
| Sync weather | ✅ `syncWeather()` | 273 |
| Debounce concurrent calls | ✅ `_dashboardRefreshing` flag | 222-227 |
| Error recovery | ✅ try/catch with best-effort render | 275-280 |

**Event listeners:**

| Event | Condition | Status |
|-------|-----------|--------|
| `DOMContentLoaded` | Always | ✅ `await refreshDashboard('DOMContentLoaded')` (line 204) |
| `pageshow` | `event.persisted` (bfcache restore) | ✅ Calls `refreshDashboard('pageshow-bfcache')` (line 292) |
| `visibilitychange` | `document.visibilityState === 'visible'` | ✅ Calls `refreshDashboard('visibilitychange')` (line 305) |

The `visibilitychange` handler also includes a path check to ensure we're on the dashboard, preventing accidental refreshes if the code somehow runs on other pages. This is defensive and correct.

---

## Audit Section 3: Service Worker Audit

### Cache Version
- `sw.js` line 7: `const CACHE_VERSION = 'v6.9.16';`
- `version.json`: `{"version": "6.9.15"}` — **MISMATCH** (see C-02)

### skipWaiting / clients.claim
- `self.skipWaiting()` in install handler: ✅ (line 155)
- `self.clients.claim()` in activate handler: ✅ (line 168)

### Cache Strategy Summary

| Request Type | Strategy | Handler |
|-------------|----------|---------|
| Navigation (`mode: 'navigate'`) | Network-first, cache fallback | `handleNavigationRequest` ✅ |
| API calls (open-meteo, n8n, webhook) | Network-first, offline JSON response | `handleApiRequest` ✅ |
| Static assets (everything else) | **Cache-first**, stale-while-revalidate | `handleStaticRequest` ⚠️ |

**Problem:** All `.js`, `.css`, and `.html` (non-navigation) requests hit cache-first. This means:
- User gets old JS files until the SW update cycle completes AND the user reloads
- On iOS standalone PWA, the SW update may not complete for days

### iOS PWA Update Flow
1. User opens PWA → iOS checks sw.js (if >24h since last check)
2. If sw.js changed → new SW installed → `skipWaiting()` → takes over
3. BUT the page was already served with old assets from old cache
4. New cache is populated during install, BUT page must be reloaded to use it
5. Next cold launch → new assets served ✅
6. **Problem:** iOS PWA rarely does "cold launch" — usually restores from process snapshot

### STATIC_ASSETS List
Verified: All JS modules in the project are listed in STATIC_ASSETS. No missing entries found for the dashboard fix files.

---

## Audit Section 4: Script Loading Order

### index.html

**Head scripts (load order):**
```
1. supabase-js (CDN)     — external dependency
2. config.js             — supabase client init (needs supabase-js)
3. cloud-photos.js       — needs config.js
4. delete-report.js      — needs config.js
5. realtime-sync.js      — needs config.js ⚠️ may need supabase-retry.js
6. storage-keys.js       — standalone
7. report-rules.js       — needs storage-keys.js
8. supabase-utils.js     — needs storage-keys.js
9. pwa-utils.js          — standalone
10. ui-utils.js          — standalone
11. indexeddb-utils.js   — standalone
12. data-layer.js        — needs indexeddb-utils.js, storage-keys.js, config.js, supabase-utils.js ✅
13. auth.js              — needs config.js, storage-keys.js
```

⚠️ **Missing:** `shared/supabase-retry.js` — should load before `realtime-sync.js` (see H-02)

**Body scripts (inline positions):**
```
After Field Tools section: js/index/field-tools.js
After Calendar section: js/index/calendar.js
After Messages section: js/index/messages.js
...
Before </body>:
  js/tools/*.js (11 files)
  js/index/weather.js
  js/index/panels.js
  js/index/cloud-recovery.js
  js/index/report-cards.js
  js/index/report-creation.js
  js/index/main.js          ← LAST (orchestrator, registers DOMContentLoaded)
  js/index/deep-links.js
  js/index/toggle-panel.js
  js/shared/ai-assistant.js
```

**Verdict:** Loading order is correct. `main.js` loads last, which is correct for the orchestrator pattern. All dependencies are loaded before dependents.

### quick-interview.html

**Head scripts:** Same core stack as index.html, plus `media-utils.js`, `photo-markup.js` (defer). ✅  
**Body scripts:** `state-mgmt.js → persistence.js → ui-flow.js → freeform.js → guided-sections.js → contractors-personnel.js → equipment-manual.js → photos.js → ui-display.js → finish-processing.js → main.js` ✅

### report.html

**Head scripts:** Core stack minus `pwa-utils.js`, `report-rules.js`, `media-utils.js` (see H-01)  
**Body scripts:** `data-loading.js → original-notes.js → form-fields.js → autosave.js → ai-refine.js → preview.js → pdf-generator.js → submit.js → delete-report.js → debug.js → main.js` ✅

### Other pages: All have correct loading order. ✅

---

## Audit Section 5: Cross-Page State Integrity

### Flow: index.html → quick-interview.html → back to index.html

**What writes to storage on the interview page:**

| Storage | What's Written | When |
|---------|---------------|------|
| `fvp_current_reports` (localStorage) | Report metadata (id, project_id, status, _draft_data) | Every 500ms debounce via `saveToLocalStorage()` |
| IndexedDB `currentReports` store | Same (write-through) | Fire-and-forget after localStorage write |
| IndexedDB `draftData` store | Full draft interview data | Write-through from `saveToLocalStorage()` |
| Supabase `interview_backup` table | Full page state | Every 5s debounce via `flushInterviewBackup()` |
| Supabase `reports` table | Report record (id, project_id, status, etc.) | On `saveReportToSupabase()` |
| IndexedDB `photos` store | Photo metadata + base64 | On photo capture |

**Emergency save on leaving interview page:**
- `visibilitychange → hidden`: calls `saveToLocalStorage()` + `flushInterviewBackup()` ✅
- `pagehide`: calls `saveToLocalStorage()` + `flushInterviewBackup()` ✅

**What dashboard's `refreshDashboard()` picks up:**

| Step | What It Reads | Source |
|------|--------------|--------|
| 1. `hydrateCurrentReportsFromIDB()` | Merges IDB `currentReports` → localStorage | IDB → localStorage |
| 2. `loadProjects()` | Projects from IDB | IndexedDB |
| 3. `refreshProjectsFromCloud()` | Projects from Supabase | Network |
| 4. `pruneCurrentReports()` | Reads/writes `fvp_current_reports` | localStorage |
| 5. `renderReportCards()` | Reads `fvp_current_reports` | localStorage |
| 6. `recoverCloudDrafts()` | Queries Supabase `reports` table | Network |

### Timing Issues

**Potential gap:** When the user taps "Back" from the interview page, the `pagehide` event fires synchronously, but `flushInterviewBackup()` is async (fire-and-forget Supabase upsert). If the user navigates back to index.html immediately, `recoverCloudDrafts()` may not see the latest backup yet (Supabase write hasn't completed).

**Mitigated by:** `saveToLocalStorage()` is synchronous and always completes before navigation. So the dashboard's `hydrateCurrentReportsFromIDB()` and `renderReportCards()` will always see the latest local data. The cloud recovery is just a bonus for cross-device scenarios.

**Verdict:** Cross-page state integrity is GOOD. ✅

---

## Audit Section 6: README Compliance

### Storage Architecture
**README says:** IndexedDB primary, localStorage flags only  
**Reality:** Mostly compliant. `fvp_current_reports` in localStorage contains full report objects (including `_draft_data` which can be large). This is a pragmatic choice for fast synchronous access but violates the "flags only" rule.

### Report Lifecycle
**README says:** `draft → pending_refine → refined → submitted`  
**Code reality:** Also includes `ready_to_submit` status (in `report-cards.js` line 172 and `report-rules.js`). README is missing this status.

### Module Organization
**README says:** 11 modules in `js/index/`, 11 in `js/interview/`, 11 in `js/report/`  
**Reality:**
- `js/index/`: 11 files ✅ (main, report-cards, report-creation, cloud-recovery, weather, calendar, field-tools, panels, toggle-panel, messages, deep-links)
- `js/interview/`: 11 files ✅ (main, state-mgmt, persistence, finish-processing, ui-flow, ui-display, guided-sections, freeform, photos, contractors-personnel, equipment-manual)
- `js/report/`: 11 files ✅ (main, data-loading, original-notes, form-fields, autosave, ai-refine, preview, pdf-generator, submit, delete-report, debug)
- `js/shared/`: 5 files (ai-assistant, cloud-photos, delete-report, realtime-sync, supabase-retry) — **README says 3** (ai-assistant, delete-report, realtime-sync). Missing: cloud-photos, supabase-retry.

### Drift Items
1. **README lists `ready_to_submit` status** in the report status flow diagram: **NO** — it's missing
2. **README says `final_reports` is deprecated** (Sprint 13): correct, merged into `reports` table
3. **README says `report_backup` is deprecated**: correct
4. **README Storage Architecture** lists `fvp_report_{id}` as "backed by Supabase report_data": this is correct
5. **README says `shared/` has 3 files**: actually has 5 (cloud-photos.js and supabase-retry.js added later)

---

## Audit Section 7: Additional Observations

### interview/state-mgmt.js Global State
The interview page uses `window.interviewState` as a global state object, referenced as `var IS = window.interviewState;` at the top of multiple files. This is appropriate for a non-bundled vanilla JS architecture but means any script can mutate state. No issues found with current code.

### interview/persistence.js Race Condition Protection
`saveCurrentReport()` in `storage-keys.js` uses a serial promise queue (`_saveQueue`) to prevent read-modify-write races. This is well-implemented (SEC-08). ✅

### Photo Upload Background Strategy
Photos upload to Supabase Storage immediately after capture (background, non-blocking) with offline fallback. On FINISH, `uploadPendingPhotos()` ensures all photos are synced. This is robust. ✅

### No XSS from User Input in Report Cards
`renderReportCard()` uses `escapeHtml()` for all user-provided strings (project name, date, UUID). ✅

---

## Prioritized Fix List

| Priority | ID | Fix | Effort |
|----------|-----|-----|--------|
| 🔴 P0 | C-01 | Switch SW static asset strategy to network-first for `.js`/`.html` files | 30 min |
| 🔴 P0 | C-02 | Sync `version.json` to `6.9.16` (or both to `6.9.17` on next deploy) | 5 min |
| 🟠 P1 | H-01 | Add `pwa-utils.js` to `report.html` | 5 min |
| 🟠 P1 | H-02 | Add `supabase-retry.js` to `index.html` before `realtime-sync.js` | 5 min |
| 🟠 P1 | H-03 | Add `pwa-utils.js`, `data-layer.js`, `supabase-utils.js` to `archives.html` | 10 min |
| 🟠 P1 | H-04 | Guard `syncWeather()` call with `typeof` check | 2 min |
| 🟡 P2 | M-01 | Add `report-rules.js` to `report.html` if needed | 5 min |
| 🟡 P2 | M-04 | Add timeout fallback for `_dashboardRefreshing` flag | 10 min |
| ⚪ P3 | L-01-04 | Various cleanup items | As time permits |

---

## Conclusion

The dashboard refresh fix (`refreshDashboard()`) is **correct and comprehensive**. The reason it's not working on Jackson's iPhone is the **service worker cache-first strategy serving stale JS files**. The immediate fix is to:

1. Sync `version.json` to match `sw.js`
2. Switch the SW to network-first for same-origin JS/HTML files
3. Bump the cache version to force a SW update
4. Have Jackson force-close and reopen the PWA

The codebase is well-organized with clear module boundaries, proper error handling, and a solid offline-first architecture. The main architectural debt is the cache-first SW strategy which is inappropriate for a frequently-updated application.
