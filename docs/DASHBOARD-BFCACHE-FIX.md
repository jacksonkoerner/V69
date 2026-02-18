# Dashboard bfcache / Back-Navigation Bug — Fix Proposal

**Date:** 2025-07-14  
**Severity:** High (iOS PWA users see stale/empty dashboard after creating reports)  
**Affected pages:** `index.html` (Dashboard)  
**Root files:**
- `js/index/main.js` — init + pageshow/visibilitychange handlers
- `js/index/report-cards.js` — `renderReportCards()`, `updateReportStatus()`
- `js/index/cloud-recovery.js` — `recoverCloudDrafts()`
- `js/data-layer.js` — `loadProjects()`, `refreshProjectsFromCloud()`
- `js/storage-keys.js` — `hydrateCurrentReportsFromIDB()`, storage helpers

---

## 1. Root Cause Analysis

### The Bug

When a user navigates **away** from the dashboard (e.g., to `quick-interview.html` to create a report), then navigates **back** (browser back, PWA swipe, or iOS app-switcher), the dashboard shows stale data — missing the report they just created, or showing an empty project list.

### Why It Happens

There are **three separate failure modes**, all stemming from the same root cause: the `pageshow` and `visibilitychange` handlers call rendering functions without reloading the underlying data.

#### Failure Mode 1: bfcache Restore (`pageshow` with `event.persisted === true`)

When iOS Safari restores the page from bfcache:

1. The JavaScript heap is restored exactly as it was when the page was frozen
2. `projectsCache` contains the **old** project list (from when the page was first loaded)
3. `localStorage` may or may not reflect changes made by the other page — bfcache restore does NOT re-read localStorage; the in-memory JS state just resumes
4. The `pageshow` handler calls `renderReportCards()` → which reads from `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` and `getProjects()` → but:
   - `getProjects()` returns the stale `projectsCache` array
   - `CURRENT_REPORTS` in localStorage may be stale (iOS can freeze the tab before the other page's writes propagate)
5. `hydrateCurrentReportsFromIDB()` is **never called** — it only runs in `DOMContentLoaded`

**Result:** User sees old report cards, missing the one they just created.

#### Failure Mode 2: Visibility Restore (iOS "swipe out and back")

When the user swipes away from Safari/PWA and comes back:

1. `visibilitychange` fires with `document.visibilityState === 'visible'`
2. `event.persisted` may not be set (this isn't a navigation restore)
3. Same problem: `renderReportCards()` runs with stale data
4. No IDB hydration, no project reload, no cloud refresh

**Result:** Same stale UI.

#### Failure Mode 3: Page Discard + Recreation (iOS memory pressure)

When iOS discards the page entirely and re-creates it:

1. `DOMContentLoaded` fires → full init runs → **this actually works correctly**
2. But if the page is partially re-created (some browsers do this), `projectsCache` could be `[]`

**Result:** Empty project section. This case is less common but possible.

### Data Flow Trace

#### DOMContentLoaded (correct, full pipeline):
```
hydrateCurrentReportsFromIDB()          ← IDB → localStorage
  ↓
dataLayer.loadProjects()                ← IDB → projectsCache + localStorage
  ↓
dataLayer.refreshProjectsFromCloud()    ← Supabase → IDB + localStorage
  ↓
projectsCache = projects                ← update in-memory cache
  ↓
pruneCurrentReports()                   ← clean stale entries
  ↓
renderReportCards()                     ← reads localStorage + projectsCache
updateReportStatus()                    ← renders "Begin Daily Report" button
  ↓
recoverCloudDrafts()                    ← Supabase → localStorage → re-render
```

#### pageshow (BROKEN, rendering only):
```
renderReportCards()     ← reads STALE localStorage + STALE projectsCache
updateReportStatus()   ← static UI, no data dependency
recoverCloudDrafts()   ← this helps but is async; rendering already happened with stale data
syncWeather()          ← unrelated
```

#### visibilitychange (BROKEN, even less):
```
renderReportCards()     ← reads STALE localStorage + STALE projectsCache  
updateReportStatus()   ← static UI, no data dependency
```

### What `renderReportCards()` Actually Needs

From `report-cards.js` lines 1-17:
```js
const allReports = Object.values(getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {});
const projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
const allProjects = getProjects().length > 0
    ? getProjects()
    : Object.values(projectsMap);
```

It needs:
1. **`CURRENT_REPORTS` in localStorage** — must include reports created on other pages
2. **`projectsCache` (via `getProjects()`)** — must be populated with current projects
3. **`PROJECTS` in localStorage** — fallback if projectsCache is empty

All three can be stale after bfcache/visibility restore.

---

## 2. Fix Options

### Option A: Full Data Reload (Recommended)

Re-run the complete data loading pipeline in the pageshow/visibilitychange handlers, identical to what `DOMContentLoaded` does.

**Pros:**
- Guarantees fresh data every time
- Handles all edge cases (IDB desync, cross-device updates, localStorage eviction)
- `recoverCloudDrafts()` runs after data is loaded, not before

**Cons:**
- Slightly more work on each resume (IDB read + potential Supabase call)
- Need to handle async properly to avoid double-render

### Option B: `window.location.reload()` (Nuclear Option)

Just reload the entire page when returning from bfcache.

```js
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        window.location.reload();
    }
});
```

**Pros:**
- Dead simple, one line
- Guarantees fresh state (full DOMContentLoaded runs)
- Zero chance of subtle bugs

**Cons:**
- User sees a page flash/reload — jarring UX
- Wastes bandwidth (re-downloads cached assets, re-fetches Supabase)
- Doesn't fix the `visibilitychange` case at all (only handles bfcache)
- Defeats the purpose of bfcache (which exists for performance)
- Service worker `handleStaticRequest()` uses cache-first for assets, so the reload would serve cached JS — but if the SW has stale JS cached, reload doesn't help either

**Verdict:** Not recommended as primary fix. Could be used as a fallback safety net.

### Option C: Hybrid — Reload Data, Don't Reload Page (Recommended)

Extract the data loading pipeline into a reusable function and call it from all three entry points.

---

## 3. Recommended Fix — Detailed Implementation

### 3.1 Extract Reusable Init Function

In `js/index/main.js`, extract the data loading + rendering pipeline into a standalone async function.

#### BEFORE (current code in DOMContentLoaded, lines ~173-228):

```js
document.addEventListener('DOMContentLoaded', async () => {
    // ... permissions, cleanup, date, migration ...

    // Hydrate current reports from IndexedDB if localStorage is empty/stale
    try {
        await hydrateCurrentReportsFromIDB();
    } catch (hydErr) {
        console.warn('[INDEX] IDB hydration failed:', hydErr);
    }

    try {
        // Load local projects first
        let projects = await window.dataLayer.loadProjects();

        // Always refresh from Supabase when online to get all projects
        if (navigator.onLine) {
            try {
                console.log('[INDEX] Refreshing projects from cloud...');
                projects = await window.dataLayer.refreshProjectsFromCloud();
            } catch (e) {
                console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
            }
        }

        // Cache projects for this page
        projectsCache = projects;

        // Prune stale reports before rendering
        pruneCurrentReports();

        // Update UI - reports come from localStorage now
        renderReportCards();
        updateReportStatus();

        // Fire-and-forget: recover drafts missing from localStorage
        recoverCloudDrafts();

        // Start Realtime subscriptions for multi-device sync
        if (typeof initRealtimeSync === 'function') initRealtimeSync();

        // Show submitted banner if there are submitted reports today...
        const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
        const { todaySubmitted } = getReportsByUrgency();
        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
            document.getElementById('submittedBanner').classList.remove('hidden');
        }

        // Sync weather
        syncWeather();
    } catch (err) {
        console.error('Failed to initialize:', err);
        renderReportCards();
        updateReportStatus();
        recoverCloudDrafts();
        syncWeather();
    }
});
```

#### AFTER:

```js
/**
 * Full data loading pipeline: IDB hydration → project load → cloud refresh → render.
 * Called on initial load (DOMContentLoaded) and on resume (pageshow/visibilitychange).
 * Safe to call multiple times — each call gets fresh data.
 *
 * @param {Object} [options]
 * @param {boolean} [options.isResume=false] - True when called from pageshow/visibilitychange
 */
async function refreshDashboardData(options = {}) {
    const { isResume = false } = options;
    const tag = isResume ? '[RESUME]' : '[INIT]';

    // Hydrate current reports from IndexedDB → localStorage
    try {
        await hydrateCurrentReportsFromIDB();
    } catch (hydErr) {
        console.warn(`${tag} IDB hydration failed:`, hydErr);
    }

    try {
        // Load local projects first (from IndexedDB)
        let projects = await window.dataLayer.loadProjects();

        // Refresh from Supabase when online
        if (navigator.onLine) {
            try {
                console.log(`${tag} Refreshing projects from cloud...`);
                projects = await window.dataLayer.refreshProjectsFromCloud();
            } catch (e) {
                console.warn(`${tag} Cloud refresh failed, using local projects:`, e);
            }
        }

        // Update in-memory cache
        projectsCache = projects;

        // Prune stale reports before rendering
        pruneCurrentReports();

        // Render UI
        renderReportCards();
        updateReportStatus();

        // Fire-and-forget: recover cloud drafts (may re-render when done)
        recoverCloudDrafts();

        // Only on initial load: start realtime, check submitted banner
        if (!isResume) {
            if (typeof initRealtimeSync === 'function') initRealtimeSync();

            const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
            const { todaySubmitted } = getReportsByUrgency();
            if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
                document.getElementById('submittedBanner').classList.remove('hidden');
            }
        }

        // Sync weather
        syncWeather();
    } catch (err) {
        console.error(`${tag} Failed to initialize:`, err);
        renderReportCards();
        updateReportStatus();
        recoverCloudDrafts();
        syncWeather();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // ... permissions, cleanup, date, migration (unchanged) ...

    // Initialize PWA features
    if (typeof initPWA === 'function') {
        initPWA({ onOnline: typeof updateDraftsSection === 'function' ? updateDraftsSection : function() {} });
    }

    // Check for submit success redirect param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('submitted') === 'true') {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        const banner = document.getElementById('submittedBanner');
        if (banner) {
            banner.innerHTML = `
                <div class="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
                    <i class="fas fa-check-circle"></i>
                    <p class="flex-1 text-sm font-medium">Report submitted successfully! <a href="archives.html" class="underline font-bold">View in Archives</a></p>
                    <button onclick="dismissSubmittedBanner()" class="text-white/80 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            banner.classList.remove('hidden');
        }
    }

    if (shouldShowOnboarding()) {
        window.location.href = 'permissions.html';
        return;
    }

    if (shouldShowBanner()) {
        showPermissionsBanner();
    }

    // Clean up old AI response caches
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fvp_ai_response_')) {
            try {
                const cached = JSON.parse(localStorage.getItem(key));
                const cachedAt = new Date(cached.cachedAt);
                const hoursSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSince > 24) {
                    localStorage.removeItem(key);
                    console.log(`[CLEANUP] Removed stale AI cache: ${key}`);
                }
            } catch (e) {
                localStorage.removeItem(key);
            }
        }
    }

    // Set current date
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // ONE-TIME MIGRATION: Clear stale IndexedDB projects (v1.13.0)
    const MIGRATION_KEY = 'fvp_migration_v113_idb_clear';
    if (!localStorage.getItem(MIGRATION_KEY)) {
        console.log('[MIGRATION v1.13.0] Clearing stale IndexedDB projects...');
        try {
            await window.idb.clearStore('projects');
            localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
            console.log('[MIGRATION v1.13.0] IndexedDB projects cleared successfully');
        } catch (migrationErr) {
            console.warn('[MIGRATION v1.13.0] Failed to clear IndexedDB:', migrationErr);
            localStorage.setItem(MIGRATION_KEY, 'failed-' + new Date().toISOString());
        }
    }

    // Run the full data pipeline
    await refreshDashboardData({ isResume: false });
});
```

### 3.2 Update pageshow Handler

#### BEFORE:

```js
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[INDEX] Page restored from bfcache, refreshing UI...');
        try {
            renderReportCards();
            updateReportStatus();
            recoverCloudDrafts();
            syncWeather();
        } catch (e) {
            console.error('[INDEX] bfcache refresh error:', e);
        }
    }
});
```

#### AFTER:

```js
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[INDEX] Page restored from bfcache, running full data refresh...');
        refreshDashboardData({ isResume: true }).catch(function(e) {
            console.error('[INDEX] bfcache refresh error:', e);
        });
    }
});
```

### 3.3 Update visibilitychange Handler

#### BEFORE:

```js
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && window.location.pathname.endsWith('index.html')) {
        console.log('[INDEX] Page became visible, refreshing report cards...');
        try {
            renderReportCards();
            updateReportStatus();
        } catch (e) {
            console.error('[INDEX] visibility refresh error:', e);
        }
    }
});
```

#### AFTER:

```js
// Debounce to avoid double-refresh when both pageshow and visibilitychange fire
let _lastDashboardRefresh = 0;

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // Debounce: skip if we just refreshed < 2 seconds ago (pageshow may have already fired)
        const now = Date.now();
        if (now - _lastDashboardRefresh < 2000) {
            console.log('[INDEX] Skipping visibility refresh (debounced)');
            return;
        }
        _lastDashboardRefresh = now;

        console.log('[INDEX] Page became visible, running full data refresh...');
        refreshDashboardData({ isResume: true }).catch(function(e) {
            console.error('[INDEX] visibility refresh error:', e);
        });
    }
});

// Also update _lastDashboardRefresh in the pageshow handler
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        _lastDashboardRefresh = Date.now();
        console.log('[INDEX] Page restored from bfcache, running full data refresh...');
        refreshDashboardData({ isResume: true }).catch(function(e) {
            console.error('[INDEX] bfcache refresh error:', e);
        });
    }
});
```

---

## 4. Race Condition Analysis

### The Async Rendering Race

`refreshDashboardData()` is async. If `pageshow` and `visibilitychange` fire in rapid succession (which they can on iOS), two concurrent calls could interleave:

```
Call 1: hydrateFromIDB → loadProjects → ... → renderReportCards()
Call 2: hydrateFromIDB → loadProjects → ...                        → renderReportCards()
```

This is benign because:
1. Each call reads fresh data from IDB/localStorage before rendering
2. `renderReportCards()` does a full `container.innerHTML = html` replacement (no incremental DOM)
3. The last render wins, and it will have the freshest data

The debounce mechanism (2-second window) in the proposed fix eliminates this for the common case.

### The recoverCloudDrafts() Race

`recoverCloudDrafts()` is fire-and-forget. It may complete and call `renderReportCards()` again after the initial render. This is actually **helpful** — it's a self-correcting second pass. No fix needed.

### The hydrateCurrentReportsFromIDB() Merge Race

`hydrateCurrentReportsFromIDB()` does a read-modify-write on `CURRENT_REPORTS`:
```js
const mergedReports = { ...localReports };
for (const id of idbKeys) {
    if (!mergedReports[id]) {
        mergedReports[id] = idbReports[id];
    }
}
setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, mergedReports);
```

If called concurrently, two calls could read the same localStorage state, merge independently, and the second write would overwrite the first. Since this function only **adds** missing reports (never removes), the worst case is that a report from IDB is added by one call but the other call's write doesn't include it. However, the next render will read the latest localStorage state, and the report will appear.

**Verdict:** No dangerous race conditions. The debounce is a nice-to-have for efficiency, not correctness.

---

## 5. Service Worker Considerations

### Current SW Behavior

The service worker (`sw.js`) uses:
- **Cache-first** for static assets (JS, CSS, images) via `handleStaticRequest()`
- **Network-first** for navigation requests (HTML pages) via `handleNavigationRequest()`
- **Stale-while-revalidate** background updates for cached assets

### Risk: Stale JS After Deploy

When a new version is deployed:
1. `sw.js` is updated with a new `CACHE_VERSION`
2. The new SW installs and caches all `STATIC_ASSETS` with the new version
3. On activation, old caches are deleted
4. **BUT:** `skipWaiting()` is called during install, and `clients.claim()` during activate — so the new SW takes over immediately

The risk is that between install and the user's next navigation, the old cached JS files are still in memory. This is a general concern, not specific to the bfcache fix.

### Does This Fix Interact with SW Caching?

No. The fix only changes **when** data is loaded from IDB/Supabase and **when** rendering functions are called. The JS files themselves don't need to change behavior at runtime — once the fix is deployed and the new JS is cached, it works.

### Recommendation

No changes to `sw.js` needed for this fix. The existing stale-while-revalidate pattern handles JS updates adequately. If there are concerns about users running very old JS, that's a separate issue (consider adding a version check on `visibilitychange` that prompts reload if JS version mismatches `version.json`).

---

## 6. Additional Hardening: pathname Check

The current `visibilitychange` handler checks `window.location.pathname.endsWith('index.html')`, but the dashboard can also be served at `/` or `/V69/` (without `index.html`). The `pageshow` handler has no pathname check at all.

Recommendation: Either remove the pathname check (since `main.js` only loads on the dashboard) or make it more robust:

```js
// main.js only loads on index.html, so no pathname check needed.
// But if you want one for safety:
const isDashboard = window.location.pathname.endsWith('index.html')
    || window.location.pathname.endsWith('/');
```

Since `js/index/main.js` is only included in `index.html` (verified in the HTML), the pathname check is unnecessary. Removing it simplifies the code.

---

## 7. Complete Diff

Here is the complete, copy-pasteable replacement for the bottom half of `js/index/main.js` (everything from the `refreshDashboardData` function through the end of file). The top of the file (permissions, pruning, etc.) stays unchanged.

```diff
--- a/js/index/main.js
+++ b/js/index/main.js
@@ -120,6 +120,61 @@
     renderReportCards();
     updateReportStatus();
 }
 
+// ============ REUSABLE DATA PIPELINE ============
+/**
+ * Full data loading pipeline: IDB hydration → project load → cloud refresh → render.
+ * Called on initial load (DOMContentLoaded) and on resume (pageshow/visibilitychange).
+ * Safe to call multiple times — each call fetches fresh data before rendering.
+ *
+ * @param {Object} [options]
+ * @param {boolean} [options.isResume=false] - True when called from pageshow/visibilitychange
+ */
+async function refreshDashboardData(options) {
+    var isResume = options && options.isResume;
+    var tag = isResume ? '[RESUME]' : '[INIT]';
+
+    // Step 1: Hydrate current reports from IndexedDB → localStorage
+    try {
+        await hydrateCurrentReportsFromIDB();
+    } catch (hydErr) {
+        console.warn(tag + ' IDB hydration failed:', hydErr);
+    }
+
+    try {
+        // Step 2: Load projects from IndexedDB
+        var projects = await window.dataLayer.loadProjects();
+
+        // Step 3: Refresh from Supabase when online
+        if (navigator.onLine) {
+            try {
+                console.log(tag + ' Refreshing projects from cloud...');
+                projects = await window.dataLayer.refreshProjectsFromCloud();
+            } catch (e) {
+                console.warn(tag + ' Cloud refresh failed, using local projects:', e);
+            }
+        }
+
+        // Step 4: Update in-memory cache
+        projectsCache = projects;
+
+        // Step 5: Prune stale reports
+        pruneCurrentReports();
+
+        // Step 6: Render UI with fresh data
+        renderReportCards();
+        updateReportStatus();
+
+        // Step 7: Fire-and-forget cloud draft recovery (may re-render)
+        recoverCloudDrafts();
+
+        // Only on initial load
+        if (!isResume) {
+            if (typeof initRealtimeSync === 'function') initRealtimeSync();
+
+            var bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
+            var urgency = getReportsByUrgency();
+            if (urgency.todaySubmitted.length > 0 && !bannerDismissedThisSession) {
+                document.getElementById('submittedBanner').classList.remove('hidden');
+            }
+        }
+
+        syncWeather();
+    } catch (err) {
+        console.error(tag + ' Failed to initialize:', err);
+        renderReportCards();
+        updateReportStatus();
+        recoverCloudDrafts();
+        syncWeather();
+    }
+}
+
 // ============ INIT ============
 document.addEventListener('DOMContentLoaded', async () => {
     // Initialize PWA features
@@ -166,48 +221,7 @@
     }
 
-    // Hydrate current reports from IndexedDB if localStorage is empty/stale
-    try {
-        await hydrateCurrentReportsFromIDB();
-    } catch (hydErr) {
-        console.warn('[INDEX] IDB hydration failed:', hydErr);
-    }
-
-    try {
-        let projects = await window.dataLayer.loadProjects();
-
-        if (navigator.onLine) {
-            try {
-                console.log('[INDEX] Refreshing projects from cloud...');
-                projects = await window.dataLayer.refreshProjectsFromCloud();
-            } catch (e) {
-                console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
-            }
-        }
-
-        projectsCache = projects;
-        pruneCurrentReports();
-        renderReportCards();
-        updateReportStatus();
-        recoverCloudDrafts();
-        if (typeof initRealtimeSync === 'function') initRealtimeSync();
-
-        const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
-        const { todaySubmitted } = getReportsByUrgency();
-        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
-            document.getElementById('submittedBanner').classList.remove('hidden');
-        }
-
-        syncWeather();
-    } catch (err) {
-        console.error('Failed to initialize:', err);
-        renderReportCards();
-        updateReportStatus();
-        recoverCloudDrafts();
-        syncWeather();
-    }
+    // Run the full data loading pipeline
+    await refreshDashboardData({ isResume: false });
 });
 
 // ============ BACK-NAVIGATION / BFCACHE FIX ============
-// On mobile PWA, navigating back (or returning from backgrounded app) may serve
-// the page from bfcache without firing DOMContentLoaded. This listener detects
-// that scenario and refreshes the dashboard UI.
+// Debounce timestamp to avoid double-refresh when both pageshow and
+// visibilitychange fire within the same resume event.
+var _lastDashboardRefresh = 0;
+
 window.addEventListener('pageshow', function(event) {
     if (event.persisted) {
-        // Page was restored from bfcache — re-render the dynamic sections
-        console.log('[INDEX] Page restored from bfcache, refreshing UI...');
-        try {
-            renderReportCards();
-            updateReportStatus();
-            recoverCloudDrafts();
-            syncWeather();
-        } catch (e) {
-            console.error('[INDEX] bfcache refresh error:', e);
-        }
+        _lastDashboardRefresh = Date.now();
+        console.log('[INDEX] Page restored from bfcache, running full data refresh...');
+        refreshDashboardData({ isResume: true }).catch(function(e) {
+            console.error('[INDEX] bfcache refresh error:', e);
+        });
     }
 });
 
-// Also handle visibilitychange — covers iOS "swipe out and back" where
-// pageshow.persisted may not be set but the page was frozen.
 document.addEventListener('visibilitychange', function() {
-    if (document.visibilityState === 'visible' && window.location.pathname.endsWith('index.html')) {
-        console.log('[INDEX] Page became visible, refreshing report cards...');
-        try {
-            renderReportCards();
-            updateReportStatus();
-        } catch (e) {
-            console.error('[INDEX] visibility refresh error:', e);
-        }
+    if (document.visibilityState !== 'visible') return;
+
+    var now = Date.now();
+    if (now - _lastDashboardRefresh < 2000) {
+        console.log('[INDEX] Skipping visibility refresh (debounced by pageshow)');
+        return;
     }
+    _lastDashboardRefresh = now;
+
+    console.log('[INDEX] Page became visible, running full data refresh...');
+    refreshDashboardData({ isResume: true }).catch(function(e) {
+        console.error('[INDEX] visibility refresh error:', e);
+    });
 });
```

---

## 8. Testing Plan

### 8.1 iOS Safari PWA
1. Open dashboard → note projects + reports shown
2. Tap "Begin Daily Report" → create a new report on `quick-interview.html`
3. Navigate back to dashboard (browser back button or swipe)
4. **Expected:** New report appears in the report cards section
5. **Verify console:** Should see `[RESUME] Refreshing projects from cloud...` log

### 8.2 iOS App Switcher
1. Open dashboard in PWA
2. Switch to another app (swipe up / home button)
3. Wait 30 seconds
4. Return to the PWA
5. **Expected:** Report cards refresh with current data

### 8.3 Cross-Device Sync
1. Open dashboard on Device A
2. On Device B, create a new report
3. On Device A, switch away and back
4. **Expected:** `recoverCloudDrafts()` picks up the new report from Supabase

### 8.4 Debounce Verification
1. Open dashboard, check console
2. Trigger bfcache restore (navigate away and back)
3. **Expected:** Only ONE refresh log, not two (pageshow + debounced visibilitychange)

### 8.5 Offline Resilience
1. Put device in airplane mode
2. Switch away and back to dashboard
3. **Expected:** IDB hydration still works; projects load from IDB cache; no errors

---

## 9. Summary

| Aspect | Before | After |
|--------|--------|-------|
| IDB hydration on resume | ❌ Never | ✅ Every resume |
| Project reload on resume | ❌ Stale `projectsCache` | ✅ Fresh from IDB + cloud |
| Cloud refresh on resume | ❌ Never (only `recoverCloudDrafts`) | ✅ Full `refreshProjectsFromCloud()` |
| `recoverCloudDrafts` on resume | ⚠️ Runs but renders with stale data first | ✅ Runs after fresh data load |
| Debounce pageshow+visibility | ❌ No | ✅ 2-second window |
| Code duplication | ⚠️ Pipeline duplicated in DOMContentLoaded | ✅ Single `refreshDashboardData()` function |
| Lines changed | — | ~60 added, ~45 removed |
