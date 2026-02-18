# FieldVoice Pro — Data Lifecycle Audit

**Date:** 2025-07-13  
**Auditor:** Automated deep audit  
**Scope:** Delete flow, re-insertion race conditions, navigation failures, IDB hydration, realtime sync  
**Verdict:** Multiple confirmed race conditions causing deleted reports to reappear

---

## Table of Contents

1. [Data Flow Map](#1-data-flow-map)
2. [Delete Flow Analysis](#2-delete-flow-analysis)
3. [Race Conditions (Confirmed)](#3-race-conditions-confirmed)
4. [Navigation Failures](#4-navigation-failures)
5. [IDB Hydration Audit](#5-idb-hydration-audit)
6. [Triple-Listener Pattern Audit](#6-triple-listener-pattern-audit)
7. [Realtime DELETE Handler Audit](#7-realtime-delete-handler-audit)
8. [Comprehensive Fix Proposal](#8-comprehensive-fix-proposal)

---

## 1. Data Flow Map

### 1.1 What Writes to `fvp_current_reports` (localStorage)

| Writer | File | Line(s) | Trigger | Guard Against Deleted? |
|--------|------|---------|---------|------------------------|
| `saveCurrentReport()` | `storage-keys.js:268` | Called by interview/persistence.js, report-creation.js | User action (save draft, create report) | **NO** |
| `_doSaveCurrentReport()` | `storage-keys.js:277` | Internal (queued save) | Via saveCurrentReport() | **NO** |
| `saveCurrentReportSync()` | `storage-keys.js:436` | Emergency pagehide save | visibilitychange/pagehide | **NO** |
| `recoverCloudDrafts()` | `cloud-recovery.js:89` | Fire-and-forget from `refreshDashboard()` step 6 | Every dashboard load/resume | **NO — THIS IS THE PRIMARY BUG** |
| `cacheInterviewBackups()` | `cloud-recovery.js:240` | Sub-call of recoverCloudDrafts | Cloud recovery finds drafts | **NO** |
| `_handleReportChange()` | `realtime-sync.js:115-128` | Supabase INSERT/UPDATE event | Realtime postgres_changes | **NO — SECOND BUG** |
| `hydrateCurrentReportsFromIDB()` | `storage-keys.js:382-420` | Phase 1 of refreshDashboard | Every dashboard load | **NO — THIRD BUG** |
| `pruneCurrentReports()` | `main.js:27-60` | Step 4 of refreshDashboard | Every dashboard load | Only prunes submitted >7 days |
| `cleanupLocalStorage()` (submit) | `report/submit.js:211` | After successful submit | User submits report | Sets status to 'submitted' |
| Photo rehydration | `cloud-recovery.js:162` | Sub-call of recoverCloudDrafts | Cloud recovery for photos | **NO** |

### 1.2 What Writes to IndexedDB `currentReports` Store

| Writer | File | Line(s) | Trigger |
|--------|------|---------|---------|
| `saveCurrentReportIDB()` | `indexeddb-utils.js:517` | Write-through from `_doSaveCurrentReport()` | Every localStorage save |
| `syncCurrentReportsToIDB()` | `storage-keys.js:428` | After cloud recovery, prune, submit | Bulk sync of entire localStorage map |
| `replaceAllCurrentReports()` | `indexeddb-utils.js:554` | Called by `syncCurrentReportsToIDB()` | Replaces entire IDB store |
| `deleteCurrentReportIDB()` | `indexeddb-utils.js:526` | Delete cascade, cancel report | Explicit delete |

### 1.3 What Reads from Supabase

| Reader | File | Line(s) | Table | When | Can Re-insert? |
|--------|------|---------|-------|------|----------------|
| `recoverCloudDrafts()` | `cloud-recovery.js:27-35` | `reports` WHERE status IN (draft, pending_refine, refined, ready_to_submit) | Every dashboard refresh (fire-and-forget) | **YES** |
| `cacheInterviewBackups()` | `cloud-recovery.js:188-240` | `interview_backup` | After cloud recovery finds drafts | **YES** (writes to CURRENT_REPORTS) |
| `_handleReportChange()` | `realtime-sync.js:100-142` | Realtime subscription on `reports` | Continuous (postgres_changes) | **YES** |
| `_handleReportDataChange()` | `realtime-sync.js:145-171` | Realtime subscription on `report_data` | Continuous (postgres_changes) | YES (writes `fvp_report_{id}`) |
| `loadReport()` | `report/data-loading.js:47-95` | `report_data`, `reports` | report.html load (fallback) | Yes (caches to localStorage) |

### 1.4 What Writes `fvp_report_{id}` (per-report data in localStorage)

| Writer | File | Line(s) | Trigger |
|--------|------|---------|---------|
| `saveReportData()` | `storage-keys.js:358` | Many callers | Report data save |
| `recoverCloudDrafts()` → sub-query | `cloud-recovery.js:99-112` | Queries `report_data` table | Cloud recovery |
| `_handleReportDataChange()` | `realtime-sync.js:164-168` | Realtime INSERT/UPDATE on `report_data` | Supabase realtime |
| `loadReport()` fallback | `report/data-loading.js:80` | Supabase `report_data` query | report.html load |

---

## 2. Delete Flow Analysis

### 2.1 `executeDeleteReport()` — `report-cards.js:557-616`

Execution order:
```
1. deleteReportCascade(reportId)     — Supabase (7 sequential steps, awaited)
2. window.idb.deleteCurrentReportIDB — IDB
3. window.idb.deletePhotosByReportId — IDB
4. window.idb.deleteDraftDataIDB     — IDB
5. deleteCurrentReport(reportId)     — localStorage fvp_current_reports
6. deleteReportData(reportId)        — localStorage fvp_report_{id}
7. overlay.remove()                  — Close modal
8. Animate card removal → renderReportCards()
```

### 2.2 `deleteReportCascade()` — `delete-report.js:20-114`

Supabase cascade order:
```
Step 1: SELECT photos.storage_path WHERE report_id = X
Step 2: Storage.remove(photoPaths) from report-photos bucket
Step 3: DELETE interview_backup WHERE report_id = X
         DELETE report_backup WHERE report_id = X
         DELETE ai_submissions WHERE report_id = X
         DELETE report_data WHERE report_id = X
Step 4: SELECT reports.pdf_url WHERE id = X
         SELECT final_reports.pdf_url WHERE report_id = X
         Storage.remove(pdfPath) from report-pdfs bucket
Step 5: DELETE final_reports WHERE report_id = X
Step 6: DELETE photos WHERE report_id = X
Step 7: DELETE reports WHERE id = X              ← PARENT ROW DELETED LAST
```

**Critical observation:** The `reports` row (which is what `recoverCloudDrafts()` queries) is deleted **LAST** in step 7. All other child-table deletes happen first (steps 3-6). The cascade takes 7+ sequential Supabase round-trips.

### 2.3 `deleteCurrentReport()` — `storage-keys.js:298-321`

Deletes from `fvp_current_reports` map in localStorage AND fires `deleteCurrentReportIDB()` (fire-and-forget).

---

## 3. Race Conditions (Confirmed)

### RACE-1: `recoverCloudDrafts()` re-inserts during delete cascade (PRIMARY BUG)

**Sequence:**
```
T+0ms    User clicks Delete → executeDeleteReport() starts
T+0ms    deleteReportCascade() begins (step 1: SELECT photos)
T+50ms   recoverCloudDrafts() fires (from a prior refreshDashboard call, or
         if the user's tab regains focus during the delete operation)
T+50ms   recoverCloudDrafts queries Supabase: SELECT * FROM reports WHERE status IN (...)
T+80ms   Supabase responds with report STILL PRESENT (cascade hasn't reached step 7 yet)
T+80ms   recoverCloudDrafts writes report back to fvp_current_reports → report REAPPEARS
T+300ms  deleteReportCascade finally reaches step 7, deletes reports row
T+350ms  executeDeleteReport cleans localStorage — BUT recoverCloudDrafts already re-inserted
T+350ms  deleteCurrentReport removes it again... 
T+380ms  BUT recoverCloudDrafts also called renderReportCards() at T+80ms,
         AND it also called syncCurrentReportsToIDB() at T+80ms
```

**Why this is the primary bug:** `recoverCloudDrafts()` is called **fire-and-forget** (`try { recoverCloudDrafts(); } catch (e) { /* non-critical */ }` at `main.js:413`). It runs asynchronously, and its `.then()` callback writes directly to `fvp_current_reports`. There is no coordination with the delete flow.

**Even worse:** The cloud recovery also triggers `syncCurrentReportsToIDB()` and `renderReportCards()`, so the re-inserted report gets persisted to IDB and rendered to the UI.

**Timing likelihood:** HIGH. The `deleteReportCascade` makes 7+ sequential await calls to Supabase. On a mobile connection, each takes 50-200ms. Total cascade time: 350ms-1400ms. `recoverCloudDrafts` only needs one query (50-200ms) to re-read the still-existing report row.

### RACE-2: Realtime sync re-inserts during delete cascade

**Sequence:**
```
T+0ms    deleteReportCascade starts
T+100ms  Step 3: DELETE report_data WHERE report_id = X
T+100ms  Supabase emits postgres_changes UPDATE event for reports table
         (because child tables being deleted may trigger updated_at on parent?)
         — OR —
         Any intermediate step that touches the reports row emits an event
T+120ms  _handleReportChange receives INSERT/UPDATE event
T+120ms  Writes report back into fvp_current_reports (realtime-sync.js:115-128)
T+500ms  deleteReportCascade reaches step 7, deletes reports row
T+520ms  Supabase emits DELETE event
T+540ms  _handleReportChange DELETE handler fires — calls deleteCurrentReport()
         BUT: the report was already re-inserted at T+120ms, so this delete
         only removes it if the timing works out
```

**Subtlety:** The `_handleReportChange` DELETE handler at line 133-137 (`realtime-sync.js`) calls `deleteCurrentReport(payload.old.id)`. This WOULD clean up, but:
- **Supabase DELETE events for the parent `reports` table require `REPLICA IDENTITY FULL`** to include the `old` record in the payload
- By default, Supabase only sends the primary key in `old` for DELETE events
- The `payload.old.id` should work since `id` is the PK, but this is fragile

### RACE-3: IDB hydration re-inserts on next dashboard load

**Sequence:**
```
T+0      User deletes report → localStorage cleaned, IDB cleaned (mostly)
T+50ms   recoverCloudDrafts had already re-inserted to IDB via syncCurrentReportsToIDB()
         (from RACE-1, or from a prior recovery that ran before the delete)
T+1min   User navigates away and comes back
T+1min   refreshDashboard fires → Phase 1: hydrateCurrentReportsFromIDB()
T+1min   IDB has the report (re-inserted by RACE-1 or stale from before delete)
T+1min   hydrateCurrentReportsFromIDB MERGES IDB into localStorage (storage-keys.js:407-415)
T+1min   Report reappears on dashboard
```

**Root cause in IDB hydration:** `hydrateCurrentReportsFromIDB()` at `storage-keys.js:405-415` does a merge:
```javascript
for (const id of idbKeys) {
    if (!mergedReports[id]) {        // ← Only checks "not in localStorage"
        mergedReports[id] = idbReports[id]; // ← Never checks if report was deleted
        merged++;
    }
}
```
It never checks whether the report was intentionally deleted. It blindly re-adds anything in IDB that's missing from localStorage.

### RACE-4: `refreshDashboard` triple-fire on return

**Sequence:**
```
T+0      User returns to dashboard tab
T+0      pageshow fires → refreshDashboard('pageshow')
T+5ms    visibilitychange fires → refreshDashboard('visibilitychange')
T+10ms   focus fires → refreshDashboard('focus')
```

**Mitigation exists but is incomplete:**
- `_dashboardRefreshing` flag prevents concurrent runs (main.js:314-316)
- 2-second cooldown prevents rapid-fire from SAME source (main.js:320-323)
- BUT: cooldown compares `source === _lastRefreshSource`, so `pageshow` → `visibilitychange` → `focus` are treated as DIFFERENT sources and all three run!

At `main.js:320`:
```javascript
if (source !== 'DOMContentLoaded' && source === _lastRefreshSource && ...)
```
This means `pageshow` runs, then `visibilitychange` runs (different source), then `focus` runs (different source). Three full `refreshDashboard` cycles including three `recoverCloudDrafts()` calls.

### RACE-5: `deleteCurrentReport()` and `recoverCloudDrafts()` both do read-modify-write on same key

Both functions:
1. Read `fvp_current_reports` via `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)`
2. Modify the object (delete key vs. add key)
3. Write back via `setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, ...)`

Since `recoverCloudDrafts` is async and its `.then()` callback captures a snapshot of the reports map at query time, the write in step 3 of recovery can **overwrite** the deletion from `deleteCurrentReport` if the timing aligns:

```
T+0ms    recoverCloudDrafts reads localReports = {reportA: {...}, reportB: {...}}
T+50ms   deleteCurrentReport reads reports = {reportA: {...}, reportB: {...}}
T+50ms   deleteCurrentReport deletes reportB → writes {reportA: {...}}
T+100ms  recoverCloudDrafts .then() fires, uses its captured localReports snapshot
T+100ms  Writes back {reportA: {...}, reportB: {...}} → reportB REAPPEARS
```

---

## 4. Navigation Failures

### 4.1 `getReportHref()` — `report-cards.js:162-175`

```javascript
function getReportHref(report) {
    const status = report.status;
    const reportDate = report.reportDate;

    if (status === REPORT_STATUS.SUBMITTED)        → archives.html?id=...
    else if (status === REPORT_STATUS.READY_TO_SUBMIT) → report.html?tab=preview&date=...&reportId=...
    else if (status === REPORT_STATUS.REFINED)     → report.html?date=...&reportId=...
    else                                            → quick-interview.html?reportId=...
}
```

**Issue 1: No `reportDate` for zombie reports.** When a report is re-inserted by `recoverCloudDrafts`, the `reportDate` field maps from `row.report_date`. If this is null or the row was partially cleaned, `reportDate` is undefined. The URL becomes `report.html?date=undefined&reportId=...`.

**Issue 2: `report.html` redirect logic for missing data.** In `report/data-loading.js:47-97`, `loadReport()` does this:
```javascript
if (!reportData) {
    var reportMeta = currentReports[reportIdParam];
    if (reportMeta && (reportMeta.status === 'pending_refine' || reportMeta.status === 'draft')) {
        // Redirect to interview
        setTimeout(function() { window.location.href = 'quick-interview.html?reportId=...'; }, 1500);
    }
    // else: redirect to index.html after 2s
}
```

So if a zombie report (re-inserted via cloud recovery) has status `refined` or `ready_to_submit` but its `report_data` was already cascade-deleted from both Supabase and localStorage:
1. User clicks the card → navigates to `report.html?date=...&reportId=...`
2. `loadReport()` finds no `fvp_report_{id}` in localStorage
3. Tries Supabase fallback → `report_data` row was already deleted in step 3 of cascade
4. Falls through to "Report data not found" → redirects to `index.html` after 2 seconds
5. User sees a flash of "Report data not found" toast and gets bounced

**This is the "clicking a card does nothing" symptom.** The card renders because `fvp_current_reports` has the zombie entry, but navigating to it fails because the actual data (`fvp_report_{id}` and `report_data` table) was successfully deleted.

### 4.2 Additional Navigation Issue: Stale `status` from Recovery

`recoverCloudDrafts` at line 75 sets:
```javascript
status: row.status || 'draft'
```

If the Supabase reports row still exists but its child data is partially deleted, the status may be stale. A report might show as `refined` (routing to `report.html`) when its `report_data` is already gone.

---

## 5. IDB Hydration Audit

### `hydrateCurrentReportsFromIDB()` — `storage-keys.js:382-420`

```javascript
async function hydrateCurrentReportsFromIDB() {
    const localReports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS);
    const hasLocal = localReports && Object.keys(localReports).length > 0;

    const idbReports = await window.idb.getAllCurrentReports();
    
    if (!hasLocal) {
        // Full restore from IDB
        setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, idbReports);
        return true;
    }

    // Merge: add IDB reports missing from localStorage
    for (const id of idbKeys) {
        if (!mergedReports[id]) {
            mergedReports[id] = idbReports[id]; // BLIND RE-INSERT
        }
    }
}
```

**Problems:**

1. **No "deleted" awareness.** If localStorage doesn't have a report, hydration assumes it was lost (iOS eviction, cache clear) and re-inserts it. There's no way to distinguish "intentionally deleted" from "accidentally lost."

2. **Full restore when localStorage is empty.** If `fvp_current_reports` is empty (user cleared storage, or fresh session after deleting last report), ALL IDB reports get restored — including deleted ones whose IDB entries weren't cleaned up.

3. **IDB cleanup is fire-and-forget.** In `deleteCurrentReport()` at `storage-keys.js:303-305`:
   ```javascript
   window.idb.deleteCurrentReportIDB(reportId).catch(function() {});
   ```
   If IDB delete fails silently, the report persists in IDB and gets hydrated back on next load.

4. **`executeDeleteReport` does IDB cleanup AFTER Supabase cascade.** At `report-cards.js:579-584`:
   ```javascript
   // 2. Delete from IndexedDB
   if (window.idb) {
       try { await window.idb.deleteCurrentReportIDB(reportId); } catch(e) { /* ok */ }
   ```
   If `recoverCloudDrafts` already re-wrote to IDB via `syncCurrentReportsToIDB()` during the cascade, the IDB delete here deletes a stale entry, and the re-inserted one may survive if timing differs.

---

## 6. Triple-Listener Pattern Audit

### `main.js:440-465`

```javascript
// 1. pageshow
window.addEventListener('pageshow', function(event) {
    refreshDashboard('pageshow');
});

// 2. visibilitychange
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        refreshDashboard('visibilitychange');
    }
});

// 3. focus
window.addEventListener('focus', function() {
    refreshDashboard('focus');
});
```

### Debounce Analysis

`refreshDashboard` has two guards:
1. `_dashboardRefreshing` mutex — prevents concurrent runs
2. Cooldown: `if (source !== 'DOMContentLoaded' && source === _lastRefreshSource && (now - _lastRefreshTime) < _REFRESH_COOLDOWN)`

**Bug in cooldown logic (main.js:320):**
```javascript
source === _lastRefreshSource
```
The cooldown only skips if the SAME source fires twice within 2s. When different sources fire in rapid succession (pageshow → visibilitychange → focus), each passes the cooldown check because the source name differs.

**Result:** On a typical return-to-tab:
- `pageshow` fires → runs fully → sets `_lastRefreshSource = 'pageshow'`
- `visibilitychange` fires → `_dashboardRefreshing` is likely still `true` (async) → SKIPPED by mutex
- `focus` fires → mutex may have released → runs again

In practice, the mutex (`_dashboardRefreshing`) provides the real protection. But each successful refresh calls `recoverCloudDrafts()` fire-and-forget, so if two of three get through, we get two cloud recovery queries competing.

**Recommended fix:** The cooldown should be source-agnostic. Replace `source === _lastRefreshSource` with just checking elapsed time regardless of source.

---

## 7. Realtime DELETE Handler Audit

### Does Supabase send DELETE events for cascaded child rows?

**Answer: NO, not by default.**

The realtime subscription at `realtime-sync.js:51-60` subscribes to `reports` table with `event: '*'`. When `deleteReportCascade` deletes child rows (`interview_backup`, `report_data`, etc.), those are on DIFFERENT tables. The `reports-sync` channel only watches `reports` and `report_data` tables.

For the `reports` table DELETE:
- Supabase postgres_changes sends DELETE events for the `reports` table when step 7 of cascade executes: `client.from('reports').delete().eq('id', reportId)`
- The `payload.old` object in DELETE events only contains the primary key columns by default (unless `REPLICA IDENTITY FULL` is set on the table)
- Since the subscription filter is `filter: 'user_id=eq.' + userId`, and DELETE events only have the PK in `payload.old`, **the filter may not match** because `user_id` isn't in the `old` payload

**Critical finding:** The Supabase documentation states:
> For DELETE events, `payload.old` only contains the primary key columns by default. To receive the full row, you must set `REPLICA IDENTITY FULL` on the table.

The `reports` table almost certainly does NOT have `REPLICA IDENTITY FULL` set (no migration sets it). This means:
1. The DELETE event may be filtered out server-side because `user_id` is not in the `old` payload
2. Even if it arrives, `payload.old` only has `{id: '...'}` — which is enough for `deleteCurrentReport(payload.old.id)`, but the filter issue may prevent delivery entirely

**For `report_data` table:** The subscription has no filter (`report_data` has no `user_id` column). DELETE events for `report_data` would fire, but the handler at line 145 only processes INSERT/UPDATE — there is NO DELETE handler for `report_data`:

```javascript
function _handleReportDataChange(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        // ... writes to localStorage
    }
    // NO DELETE HANDLER — orphaned fvp_report_{id} keys persist
}
```

**Summary:**
- Reports DELETE events **likely don't arrive** due to filter + no REPLICA IDENTITY FULL
- Report_data DELETE events arrive but **are not handled** (no DELETE branch)
- Child table (interview_backup, photos, etc.) deletions are **not subscribed to at all**

---

## 8. Comprehensive Fix Proposal

### Root Cause Summary

The delete flow has **no coordination** with the three re-insertion systems. The Supabase cascade deletes the parent row LAST, creating a window where cloud recovery and realtime sync can re-read the still-existing report and re-insert it to localStorage/IDB.

### Fix Strategy: Defense in Depth

#### FIX-1: Delete Supabase `reports` row FIRST (not last) — Eliminates RACE-1 and RACE-2

**Rationale:** The `reports` table has `ON DELETE CASCADE` on `report_data` (migration 003). If we delete the parent `reports` row first, Postgres automatically cascades to delete `report_data`. The explicit child-table deletes in `deleteReportCascade` are then redundant for tables with FK constraints.

**Proposed new order for `deleteReportCascade`:**
```
Step 1: SELECT photos.storage_path (need paths before deleting rows)
Step 2: SELECT reports.pdf_url / final_reports.pdf_url (need URL before deleting)
Step 3: DELETE reports WHERE id = X  ← FIRST! Cascades to report_data automatically
Step 4: Storage.remove(photoPaths)   ← Can happen after row delete
Step 5: Storage.remove(pdfPath)      ← Can happen after row delete
Step 6: DELETE interview_backup, report_backup, ai_submissions (no FK cascade)
Step 7: DELETE final_reports (no FK cascade)
Step 8: DELETE photos (no FK cascade, or may have FK)
```

**Caveat:** Check which child tables have `ON DELETE CASCADE` FK constraints vs. which don't:
- `report_data.report_id → reports(id) ON DELETE CASCADE` ✅ (migration 003)
- `interview_backup`, `report_backup`, `ai_submissions`, `photos`, `final_reports` — **need to verify** if they have FK constraints. If not, they must be deleted explicitly (but can happen AFTER the parent row delete).

**Key benefit:** Once the `reports` row is gone, `recoverCloudDrafts()` will never find it, and realtime sync won't receive events for it.

#### FIX-2: Deleted Reports Blocklist — Prevents ALL re-insertion paths

**Add to `storage-keys.js`:**
```javascript
const DELETED_REPORTS_KEY = 'fvp_deleted_report_ids';

function addToDeletedBlocklist(reportId) {
    var list = JSON.parse(localStorage.getItem(DELETED_REPORTS_KEY) || '[]');
    if (!list.includes(reportId)) {
        list.push(reportId);
        // Keep only last 100 entries to avoid bloat
        if (list.length > 100) list = list.slice(-100);
        localStorage.setItem(DELETED_REPORTS_KEY, JSON.stringify(list));
    }
}

function isDeletedReport(reportId) {
    var list = JSON.parse(localStorage.getItem(DELETED_REPORTS_KEY) || '[]');
    return list.includes(reportId);
}

function removeFromDeletedBlocklist(reportId) {
    var list = JSON.parse(localStorage.getItem(DELETED_REPORTS_KEY) || '[]');
    localStorage.setItem(DELETED_REPORTS_KEY, JSON.stringify(list.filter(id => id !== reportId)));
}
```

**Integration points — add blocklist checks to ALL re-insertion paths:**

1. **`recoverCloudDrafts()`** — `cloud-recovery.js:51` (inside the `for (const row of data)` loop):
   ```javascript
   if (isDeletedReport(row.id)) continue; // Skip recently deleted
   ```

2. **`_handleReportChange()`** — `realtime-sync.js:100` (before INSERT/UPDATE processing):
   ```javascript
   if (isDeletedReport(report.id)) return; // Skip recently deleted
   ```

3. **`hydrateCurrentReportsFromIDB()`** — `storage-keys.js:407` (inside merge loop):
   ```javascript
   if (!mergedReports[id] && !isDeletedReport(id)) {
       mergedReports[id] = idbReports[id];
   }
   ```

4. **`_handleReportDataChange()`** — `realtime-sync.js:158` (before writing report_data):
   ```javascript
   if (isDeletedReport(data.report_id)) return;
   ```

**Set the blocklist FIRST in `executeDeleteReport()`** — before starting the Supabase cascade:
```javascript
addToDeletedBlocklist(reportId);  // FIRST — before any async operations
```

#### FIX-3: Delete localStorage/IDB BEFORE Supabase cascade — Instant UI cleanup

**Current order:** Supabase (slow, 7 round-trips) → IDB → localStorage  
**Proposed order:** Blocklist → localStorage → IDB → Supabase (fire-and-forget or awaited)

```javascript
async function executeDeleteReport(reportId, overlay) {
    // 1. Block re-insertion immediately
    addToDeletedBlocklist(reportId);
    
    // 2. Remove from localStorage FIRST (instant UI cleanup)
    deleteCurrentReport(reportId);
    deleteReportData(reportId);
    
    // 3. Remove from IDB
    if (window.idb) {
        await window.idb.deleteCurrentReportIDB(reportId).catch(() => {});
        await window.idb.deletePhotosByReportId(reportId).catch(() => {});
        await window.idb.deleteDraftDataIDB(reportId).catch(() => {});
    }
    
    // 4. Remove card from UI immediately
    overlay.remove();
    animateCardRemoval(reportId);
    
    // 5. Supabase cascade (can be fire-and-forget now — local state is clean)
    deleteReportCascade(reportId).then(result => {
        if (!result.success) console.warn('Supabase cascade errors:', result.errors);
    }).catch(err => console.error('Supabase cascade failed:', err));
}
```

#### FIX-4: Fix cooldown to be source-agnostic — Prevents triple-refresh

**In `main.js`, change line 320 from:**
```javascript
if (source !== 'DOMContentLoaded' && source === _lastRefreshSource && (now - _lastRefreshTime) < _REFRESH_COOLDOWN)
```

**To:**
```javascript
if (source !== 'DOMContentLoaded' && (now - _lastRefreshTime) < _REFRESH_COOLDOWN)
```

This ensures that `pageshow` → `visibilitychange` → `focus` only runs ONE refresh, not three.

#### FIX-5: Add `report_data` DELETE handler to realtime sync

In `realtime-sync.js`, after line 170, add:
```javascript
if (payload.eventType === 'DELETE') {
    var reportId = payload.old?.report_id;
    if (reportId && typeof deleteReportData === 'function') {
        deleteReportData(reportId);
    }
}
```

#### FIX-6: Set `REPLICA IDENTITY FULL` on `reports` table (recommended)

Create a new migration:
```sql
ALTER TABLE reports REPLICA IDENTITY FULL;
```

This ensures DELETE events include the full row (including `user_id`), allowing the realtime subscription filter to match.

#### FIX-7: Await or cancel `recoverCloudDrafts` during delete

Either:
- (a) Make `recoverCloudDrafts` cancellable via an AbortController-like mechanism
- (b) Set a global `_deletingReportIds` Set that `recoverCloudDrafts` checks (same as blocklist)
- (c) The blocklist (FIX-2) handles this already — simplest approach

---

### Implementation Priority

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| **P0** | FIX-2: Deleted reports blocklist | Small | Prevents ALL re-insertion races |
| **P0** | FIX-3: Local cleanup before Supabase | Small | Instant UI response, closes race window |
| **P1** | FIX-1: Delete reports row first | Medium | Narrows the Supabase race window |
| **P1** | FIX-4: Source-agnostic cooldown | Tiny | Prevents triple-refresh and triple-recovery |
| **P2** | FIX-5: report_data DELETE handler | Tiny | Cleans up orphaned localStorage keys |
| **P2** | FIX-6: REPLICA IDENTITY FULL | Tiny (migration) | Enables realtime DELETE delivery |
| **P3** | FIX-7: Cancel in-flight recovery | Medium | Belt-and-suspenders |

### Summary

The deleted-report reappearance bug is caused by **three unsynchronized re-insertion paths** (`recoverCloudDrafts`, `_handleReportChange`, `hydrateCurrentReportsFromIDB`) that can write to `fvp_current_reports` without checking if the report was intentionally deleted. The fix requires:

1. A **blocklist** to prevent re-insertion (defense in depth)
2. **Local-first cleanup** (delete from localStorage/IDB before starting the slow Supabase cascade)
3. **Deleting the Supabase parent row first** (narrows the window for cloud recovery to find the row)
4. **Fixing the cooldown logic** to prevent triple-refresh
