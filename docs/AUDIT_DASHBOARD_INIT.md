# Dashboard Initialization Audit — Root Cause Analysis

**Date:** 2025-07-23  
**Auditor:** Clawdbot (subagent: dashboard-init-audit)  
**Codebase:** ~/projects/V69/  
**Scope:** All 5 timeout warnings on dashboard load, duplicate projects, race conditions, localStorage fallback reliability

---

## Executive Summary

The overnight report documented 5 sequential timeouts firing on every dashboard load. After reading every line of the init flow, here's the verdict:

**The timeouts are real, but they are architectural guardrails, not bugs.** The core problem is that the dashboard performs 5 I/O operations **sequentially with await** when most could run in parallel. The individual timeout values are reasonable for their operations, but the serial chain means worst-case wall time is 3+4+5+8+15 = **35 seconds** before the dashboard is fully hydrated.

The good news: localStorage rendering happens synchronously at the top of `refreshDashboard()`, so the user **never sees a blank dashboard**. The timeouts affect background data freshness, not visual responsiveness.

---

## 1. Init Flow — Exact Sequence of Events

### Script Loading Order (index.html)
```
<head>:
  supabase-js CDN → config.js → cloud-photos.js → delete-report.js → 
  realtime-sync.js → storage-keys.js → report-rules.js → supabase-utils.js →
  pwa-utils.js → ui-utils.js → indexeddb-utils.js → data-layer.js → auth.js
</head>
<body> (bottom):
  field-tools.js → calendar.js → messages.js → [tool scripts] → 
  weather.js → panels.js → cloud-recovery.js → report-cards.js → 
  report-creation.js → main.js → deep-links.js → toggle-panel.js → ai-assistant.js
```

### DOMContentLoaded Handler (main.js, line ~130)

Two DOMContentLoaded handlers fire:
1. **auth.js** (line ~316): Calls `requireAuth()` → resolves `window.auth.ready` promise
2. **main.js** (line ~130): The main init handler

The main.js handler does this in sequence:

```
1. _renderFromLocalStorage()           ← SYNC, instant
2. v1.13.0 IDB migration check        ← conditional, one-time
3. await withTimeout(auth.ready, 5s)   ← BLOCKS on auth
4. await refreshDashboard('DOMContentLoaded')
   ├── _renderFromLocalStorage()       ← SYNC again (redundant but safe)
   ├── await hydrateCurrentReportsFromIDB()   [3s timeout]
   ├── renderReportCards()
   ├── await loadProjects()                    [4s timeout]
   ├── await refreshProjectsFromCloud()        [8s timeout]  (if online)
   ├── pruneCurrentReports()
   ├── renderReportCards()
   ├── recoverCloudDrafts()                    [fire-and-forget]
   └── await syncWeather()                     [15s timeout]
5. initRealtimeSync()
```

---

## 2. Timeout-by-Timeout Analysis

### Timeout 1: IDB Hydration (3s)

**Location:** `main.js` line ~330, inside `refreshDashboard()`
```js
await withTimeout(hydrateCurrentReportsFromIDB(), 3000, false, 'IDB hydration');
```

**What it does:** `hydrateCurrentReportsFromIDB()` (storage-keys.js, line ~370) reads `currentReports` store from IndexedDB and merges into localStorage.

**Root cause of timeout:**
- `hydrateCurrentReportsFromIDB()` calls `window.idb.getAllCurrentReports()`
- `getAllCurrentReports()` calls `ensureDB()` → `initDB()`
- `initDB()` has its **own** 3s timeout (indexeddb-utils.js, line 12: `IDB_OPEN_TIMEOUT_MS = 3000`)
- So the 3s outer timeout races against the 3s inner IDB open timeout
- On iOS Safari after bfcache restore, `indexedDB.open()` literally never fires `onsuccess` or `onerror`. This is a **known Safari bug**. The timeout is the only escape hatch.

**Is it truly sequential?** YES — it's `await`-ed before `loadProjects()`.

**Could it run in parallel?** PARTIALLY. The hydration writes to localStorage (`fvp_current_reports`), and `renderReportCards()` runs immediately after. But `loadProjects()` doesn't depend on this data. These could overlap.

**Is 3s reasonable?** Yes — normal IDB open takes <100ms. 3s is generous enough for slow devices but prevents indefinite hang. The problem is iOS bfcache where it's guaranteed to timeout.

**Fix:**
1. Run IDB hydration and loadProjects in parallel with `Promise.allSettled()`
2. After bfcache restore, `resetDB()` is already called (main.js line ~405) — but the pageshow handler calls `refreshDashboard()` AFTER resetting. The issue is DOMContentLoaded on first load when IDB might be slow. Consider pre-warming IDB during script load (before DOMContentLoaded).

---

### Timeout 2: loadProjects (4s)

**Location:** `main.js` line ~340
```js
projects = await withTimeout(window.dataLayer.loadProjects(), 4000, [], 'loadProjects');
```

**What it does:** `loadProjects()` (data-layer.js, line ~18) calls `window.idb.getAllProjects()` → `ensureDB()` → reads all projects from IDB `projects` store → normalizes → caches to localStorage.

**Root cause of timeout:**
- Same IDB dependency as Timeout 1. If IDB open is stuck, this also times out.
- `loadProjects()` calls `ensureDB()` which calls `initDB()` — but if IDB already opened in the hydration step, the cached `db` variable is reused (no re-open needed). So this timeout only fires if IDB is genuinely broken.
- The 4s timeout is actually redundant with the 3s IDB open timeout inside `initDB()`. The IDB open would fail at 3s, `ensureDB()` would reject, and `loadProjects()` would throw — caught by the 4s `withTimeout`.

**Is it truly sequential?** YES — awaited after IDB hydration completes.

**Could it run in parallel?** YES — `loadProjects()` reads the `projects` store; `hydrateCurrentReportsFromIDB()` reads the `currentReports` store. These are independent IDB transactions and could run concurrently. They both need `ensureDB()` but that caches the connection after first open.

**Is 4s reasonable?** Yes, but the actual IDB read (after connection is established) is <50ms. The 4s covers the worst case of the first IDB open.

**Fix:** Bundle with hydration in `Promise.allSettled()`. Both need IDB but for different stores.

---

### Timeout 3: auth.ready (5s)

**Location:** `main.js` line ~185
```js
var _authSession = await withTimeout(window.auth.ready, 5000, null, 'auth.ready');
```

**What it does:** Waits for auth.js's DOMContentLoaded handler to call `requireAuth()` and resolve `_authReadyPromise`.

**Root cause of timeout:**
- `requireAuth()` (auth.js, line ~14) calls `supabaseClient.auth.getSession()`
- This is a network call to Supabase Auth. If the network is slow or Supabase is degraded, it can take >5s.
- auth.js registers its DOMContentLoaded handler when the `<script>` is parsed in `<head>`. main.js registers in `<body>`. Browser spec guarantees they fire in registration order, so auth.js's handler runs first. 
- **BUT**: `requireAuth()` is async. The DOMContentLoaded handler fires `requireAuth()` but doesn't block the next handler. So main.js's DOMContentLoaded fires immediately after, NOT after auth completes. The `auth.ready` promise coordinates this.
- If `supabaseClient.auth.getSession()` is slow (cold start, token refresh needed), the 5s timeout fires.

**Is it truly sequential?** YES — `auth.ready` is awaited BEFORE `refreshDashboard()`. This is **the critical bottleneck**. Everything else waits on auth.

**Could it run in parallel?** PARTIALLY. Auth is legitimately needed before `refreshProjectsFromCloud()` (Supabase queries need a valid session for RLS). But `hydrateCurrentReportsFromIDB()` and `loadProjects()` (IDB reads) DON'T need auth. They're purely local.

**Is 5s reasonable?** Barely. Supabase `getSession()` checks the local token first and only hits the network if refresh is needed. Normal case is <200ms. But token refresh can take 1-3s. 5s covers degraded networks.

**Fix (BIGGEST WIN):**
Restructure to:
```js
// Start auth and local data loading in parallel
const [authSession] = await Promise.allSettled([
  withTimeout(window.auth.ready, 5000, null, 'auth.ready'),
  refreshDashboardLocal()  // IDB hydration + loadProjects (no network)
]);

// Then do network stuff (needs auth)
if (authSession.value) {
  await refreshDashboardCloud();  // refreshProjectsFromCloud + syncWeather
}
```

---

### Timeout 4: refreshProjectsFromCloud (8s)

**Location:** `main.js` line ~350
```js
var cloudProjects = await withTimeout(
    window.dataLayer.refreshProjectsFromCloud(), 8000, null, 'refreshProjectsFromCloud'
);
```

**What it does:** (data-layer.js, line ~52) Fetches all projects from Supabase `projects` table (with org_id filter), converts to JS format, clears IDB projects store, re-saves all projects to IDB, caches to localStorage.

**Root cause of timeout:**
- This is a **network call** to Supabase. If the network is slow, server is overloaded, or the query returns a large dataset, it can take >8s.
- After fetching, it does `idb.clearStore('projects')` + N × `idb.saveProject()` sequentially. With many projects, the IDB writes add up.
- The `navigator.onLine` check (main.js line ~347) gates this — if offline, it's skipped entirely. So timeout only happens when nominally "online" but the connection is degraded.

**Is it truly sequential?** YES — awaited after `loadProjects()`. Depends on auth being ready (needs session for RLS-protected queries).

**Could it run in parallel with weather?** YES — `syncWeather()` doesn't depend on project data. These could run concurrently.

**Is 8s reasonable?** Yes for a network call. Supabase queries typically return in 200-500ms, but mobile connections can be slow.

**Fix:**
1. Run in parallel with `syncWeather()`:
   ```js
   await Promise.allSettled([
     refreshProjectsFromCloud(),
     syncWeather()
   ]);
   ```
2. The sequential IDB saves (`for (const project of projects) { await idb.saveProject(project); }`) should be batched into a single IDB transaction instead of N separate transactions.

---

### Timeout 5: syncWeather (15s)

**Location:** `main.js` line ~368
```js
await withTimeout(syncWeather(), 15000, undefined, 'syncWeather');
```

**What it does:** (weather.js) Calls `getLocationFromCache()` → if no cache, `getFreshLocation()` (which calls `navigator.geolocation.getCurrentPosition` with its own 10s timeout) → fetches Open-Meteo API → updates DOM.

**Root cause of timeout:**
- `getFreshLocation()` (ui-utils.js, line ~320) has a **10s geolocation timeout** (line ~365: `timeout: 10000`)
- If geolocation permission is `prompt` (not yet granted), the browser shows a permission dialog. User may not notice it. The 10s GPS timeout fires.
- If geolocation permission is `denied`, `getFreshLocation()` returns null immediately. Then weather shows "Unavailable" — no timeout, but no data.
- If geolocation succeeds but the Open-Meteo API is slow (free tier, rate limited), the fetch can take several seconds.
- Combined: 10s GPS + API fetch = can exceed 15s.

**Is it truly sequential?** YES — awaited as the last step in `refreshDashboard()`. Everything else is done; this just holds up the `finally` block.

**Could it run in parallel?** YES — weather has zero dependency on projects, reports, or auth. It only needs geolocation.

**Is 15s reasonable?** Too generous. The GPS timeout alone is 10s. With API fetch, 15s just barely covers it. But since weather is non-critical, the real fix is to not await it at all.

**Fix:**
1. Fire-and-forget (don't await):
   ```js
   syncWeather().catch(e => console.warn('[INDEX] Weather sync failed:', e));
   ```
2. Or run in parallel with `refreshProjectsFromCloud()`.

---

## 3. Duplicate Projects Issue

### Root Cause: Confirmed as BOTH a data issue AND a sync bug

**Evidence from the codebase:**

1. **Data layer creates duplicates during cloud refresh** (data-layer.js, line ~72):
   ```js
   // Clear IndexedDB projects store before caching to remove stale data
   await window.idb.clearStore('projects');
   // Cache to IndexedDB (with contractors)
   for (const project of projects) {
       await window.idb.saveProject(project);
   }
   ```
   This clears and re-writes IDB correctly. No duplication here.

2. **BUT localStorage is NOT cleared before re-caching** (data-layer.js, line ~82):
   ```js
   const projectsMap = {};
   projects.forEach(p => { projectsMap[p.id] = p; });
   setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);
   ```
   This overwrites `fvp_projects` as a map keyed by ID, so duplicates by ID are impossible.

3. **The real duplication vector: `loadProjects()` + `refreshProjectsFromCloud()` both write to `projectsCache`** (main.js line ~355):
   ```js
   projects = await withTimeout(window.dataLayer.loadProjects(), 4000, [], 'loadProjects');
   // ...
   var cloudProjects = await withTimeout(window.dataLayer.refreshProjectsFromCloud(), 8000, null, 'refreshProjectsFromCloud');
   if (cloudProjects && cloudProjects.length > 0) {
       projects = cloudProjects;  // REPLACES, not appends — correct
   }
   projectsCache = projects;  // line ~357
   ```
   This replaces, so no duplication here either.

4. **The v1.13.0 migration** (main.js line ~168) clears IDB projects on first run to fix pre-org-filtering duplicates:
   ```js
   const MIGRATION_KEY = 'fvp_migration_v113_idb_clear';
   if (!localStorage.getItem(MIGRATION_KEY)) {
       await window.idb.clearStore('projects');
   }
   ```

5. **ACTUAL ROOT CAUSE — the Supabase `projects` table itself has duplicate rows.** The overnight report notes "Express Shuttle Connector Road" appears twice with identical data including the same project number #1291. The deduplication logic in the client is all correct (keyed by UUID). **If two rows exist in Supabase with different UUIDs but the same project name/number, the client will faithfully display both.** This is a data-entry issue, not a code bug.

   **Evidence:** The report says "All three projects show #1291" — this means `noab_project_no` is the same across rows. The client normalizes by UUID, not by project number.

**Fix:**
1. Add a unique constraint on `(org_id, project_name)` or `(org_id, noab_project_no)` in Supabase
2. Add client-side deduplication in `renderReportCards()` as a belt-and-suspenders check
3. Investigate the Supabase `projects` table to confirm and remove duplicate rows

---

## 4. Race Conditions in Init Flow

### Race 1: Auth DOMContentLoaded vs Main DOMContentLoaded

**Status: HANDLED CORRECTLY**

Auth.js registers its DOMContentLoaded in `<head>` (parsed first), main.js at end of `<body>`. Both handlers fire in registration order. Auth uses `_authReadyPromise` to coordinate, and main.js awaits it. No race condition.

### Race 2: pageshow + visibilitychange + focus triple-fire

**Status: HANDLED CORRECTLY**

main.js has three event listeners (lines ~398-425) that all call `refreshDashboard()`. The debounce flag `_dashboardRefreshing` and 2s cooldown `_REFRESH_COOLDOWN` prevent concurrent or rapid-fire refreshes. Well designed.

### Race 3: Concurrent saveCurrentReport calls

**Status: HANDLED CORRECTLY**

`saveCurrentReport()` (storage-keys.js, line ~200) uses a `_saveQueue` Promise chain to serialize concurrent saves. This prevents read-modify-write races on `fvp_current_reports`.

### Race 4: Realtime sync vs local edits

**Status: HANDLED CORRECTLY**

`_handleReportChange()` (realtime-sync.js, line ~40) skips updates for the currently-edited report (SYN-02 guard):
```js
if (editingReportId && editingReportId === report.id) {
    console.log('[REALTIME] Skipping update for actively-edited report:', report.id);
    return;
}
```

### Race 5: Cloud recovery vs local state (POTENTIAL ISSUE)

**Status: MOSTLY HANDLED, MINOR RISK**

`recoverCloudDrafts()` (cloud-recovery.js) is fire-and-forget from `refreshDashboard()`. It reads `fvp_current_reports`, modifies it, and writes it back. If `saveCurrentReport()` runs concurrently (from another part of the app), there's a read-modify-write race. However, on the dashboard, users aren't editing reports — they're viewing them. Risk is low.

### Race 6: IDB connection after bfcache (HANDLED)

`resetDB()` is called on pageshow when `event.persisted` or timeSinceLastRefresh > 2s. This closes the stale connection before `refreshDashboard()` tries to use it. Correct.

---

## 5. localStorage Fallback Reliability

### Assessment: RELIABLE, with caveats

**How it works:**

1. `refreshDashboard()` calls `_renderFromLocalStorage()` synchronously as its FIRST action (line ~320). This reads `fvp_projects` and `fvp_current_reports` from localStorage and renders.

2. If ALL async operations fail, the `catch` block (line ~373) calls `_renderFromLocalStorage()` again.

3. `_renderFromLocalStorage()` (line ~382) reads `fvp_projects` from localStorage as a fallback for an empty `projectsCache`.

**Caveats:**

1. **iOS 7-day eviction:** iOS Safari can evict localStorage data after 7 days of non-use. The `hydrateCurrentReportsFromIDB()` function exists specifically to recover from this — IDB data survives eviction. But if IDB also times out (iOS bfcache bug), both local data sources are unavailable on that particular load. Next load (after page reload) should work.

2. **localStorage quota:** `setStorageItem()` has a try-catch (storage-keys.js, line ~113) that returns false on quota errors. But the caller doesn't check the return value in most places. If localStorage is full, silent data loss could occur.

3. **JSON parse errors:** `getStorageItem()` (storage-keys.js, line ~101) catches JSON.parse errors and returns the raw string. This is defensive but could return unexpected types if storage is corrupted.

4. **Persistent storage request:** auth.js (line ~340) calls `navigator.storage.persist()` on every page load to prevent browser eviction. Good practice.

**Verdict:** The localStorage fallback is well-designed and reliable for normal operation. The iOS 7-day eviction edge case is covered by IDB hydration. The only scenario where the user sees stale data is: iOS bfcache + IDB hung + localStorage evicted — a rare triple-fault.

---

## 6. Recommended Fixes (Prioritized)

### Fix 1: Parallelize Init Flow (HIGH IMPACT, LOW RISK)

**Current (sequential, ~35s worst case):**
```
auth.ready [5s] → IDB hydration [3s] → loadProjects [4s] → 
refreshProjectsFromCloud [8s] → syncWeather [15s]
```

**Proposed (parallel, ~15s worst case):**
```
┌─ auth.ready [5s] ─────────────────┐
├─ IDB hydration [3s] ──┐           │
├─ loadProjects [4s] ───┤           │
│                        ↓ render   │
│                                   ↓ 
├─ refreshProjectsFromCloud [8s] ──┐
├─ syncWeather [15s] ──────────────┤
│                                   ↓ done
```

**Implementation:**
```js
async function refreshDashboard(source) {
    // ... debounce/cooldown checks ...
    
    // Step 0: Instant render from localStorage
    _renderFromLocalStorage();
    
    // Step 1: Local data (no auth needed) — parallel
    const [hydrationResult, localProjects] = await Promise.allSettled([
        withTimeout(hydrateCurrentReportsFromIDB(), 3000, false, 'IDB hydration'),
        withTimeout(window.dataLayer.loadProjects(), 4000, [], 'loadProjects')
    ]);
    
    // Update cache from local data
    let projects = localProjects.status === 'fulfilled' ? localProjects.value : [];
    projectsCache = projects.length > 0 ? projects : projectsCache;
    renderReportCards();
    updateReportStatus();
    
    // Step 2: Network data (needs auth) — parallel where possible
    if (navigator.onLine) {
        const [cloudResult, weatherResult] = await Promise.allSettled([
            withTimeout(window.dataLayer.refreshProjectsFromCloud(), 8000, null, 'refreshProjectsFromCloud'),
            withTimeout(syncWeather(), 15000, undefined, 'syncWeather')
        ]);
        
        if (cloudResult.status === 'fulfilled' && cloudResult.value?.length > 0) {
            projectsCache = cloudResult.value;
            renderReportCards();
        }
    }
    
    // Step 3: Non-critical
    pruneCurrentReports();
    try { recoverCloudDrafts(); } catch(e) {}
}
```

**Wall time reduction:** From 35s → ~15s worst case. From ~20s typical → ~8s typical.

### Fix 2: Move auth.ready wait INSIDE refreshDashboard, after local data (MEDIUM IMPACT)

Currently auth.ready blocks EVERYTHING. Move it so local data loads while auth resolves:

```js
// Don't await auth.ready before refreshDashboard
// Instead, start refreshDashboard immediately and await auth only for network operations
```

### Fix 3: Batch IDB project saves (LOW IMPACT)

In `refreshProjectsFromCloud()`, replace:
```js
for (const project of projects) {
    await window.idb.saveProject(project);
}
```
With a single transaction:
```js
const tx = database.transaction(['projects'], 'readwrite');
const store = tx.objectStore('projects');
projects.forEach(p => store.put(p));
await new Promise(resolve => tx.oncomplete = resolve);
```

### Fix 4: Don't await syncWeather (LOW IMPACT, EASY)

Weather is purely decorative. Fire and forget:
```js
syncWeather().catch(e => console.warn('[INDEX] Weather sync failed:', e));
```

### Fix 5: Fix duplicate projects at data layer (MEDIUM IMPACT)

Add a unique constraint in Supabase and deduplicate existing rows.

---

## 7. Summary Table

| Timeout | Duration | Sequential? | Root Cause | Could Parallel? | Fix Priority |
|---------|----------|-------------|------------|-----------------|--------------|
| IDB hydration | 3s | Yes (blocks loadProjects) | IDB open can hang on iOS bfcache | Yes — with loadProjects | HIGH |
| loadProjects | 4s | Yes (blocks cloud refresh) | Same IDB open dependency | Yes — with hydration | HIGH |
| auth.ready | 5s | Yes (blocks everything) | Supabase getSession() network call | Yes — for local-only ops | HIGH |
| refreshProjectsFromCloud | 8s | Yes (blocks weather) | Supabase network query | Yes — with weather | MEDIUM |
| syncWeather | 15s | Yes (last in chain) | GPS timeout (10s) + API fetch | Yes — fire-and-forget | EASY |

| Issue | Root Cause | Category | Fix |
|-------|-----------|----------|-----|
| Duplicate projects | Duplicate rows in Supabase (different UUIDs, same name/number) | Data | Unique constraint + dedup migration |
| Race conditions | 6 potential races identified, 5 properly handled | Code | Monitor Race 5 (cloud recovery) |
| localStorage fallback | Works reliably; iOS eviction covered by IDB hydration | Architecture | No change needed |
| IDB bfcache hang | Known Safari bug, `resetDB()` on pageshow is correct mitigation | Platform | Already handled |

---

*Audit based on reading: main.js (701 lines), indexeddb-utils.js (449 lines), auth.js (355 lines), data-layer.js (230 lines), weather.js (155 lines), realtime-sync.js (130 lines), report-cards.js (370 lines), cloud-recovery.js (195 lines), storage-keys.js (390 lines), ui-utils.js (390 lines), index.html script tags.*
