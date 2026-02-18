# AUDIT: IDB, localStorage, Delete Flow, and Supabase Sync

**Date:** 2025-07-23  
**Auditor:** Claude (automated deep code audit)  
**Scope:** FieldVoice Pro V69 — data layer, delete cascade, IDB management, Supabase sync  
**Triggered by:** User-reported bug where deleting one report from the home screen caused another active report (in AI refine) to go blank/loading

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Delete Flow Analysis](#2-delete-flow-analysis)
3. [IDB Connection Management](#3-idb-connection-management)
4. [localStorage Key Map](#4-localstorage-key-map)
5. [Report Data Flow](#5-report-data-flow)
6. [Supabase Realtime](#6-supabase-realtime)
7. [Fallback Chain](#7-fallback-chain)
8. [Deleted Blocklist](#8-deleted-blocklist)
9. [Cross-Page State Corruption](#9-cross-page-state-corruption)
10. [Bug Identification](#10-bug-identification)
11. [Risk Assessment](#11-risk-assessment)
12. [Recommended Fixes](#12-recommended-fixes)

---

## 1. Executive Summary

The FieldVoice Pro app uses a **three-tier storage model**: localStorage (fast, sync), IndexedDB (durable, async), and Supabase (cloud, source of truth). The architecture is fundamentally sound but has **critical race conditions** in how shared localStorage state is managed during cross-page operations.

### Key Findings

| Severity | Count | Summary |
|----------|-------|---------|
| 🔴 Critical | 3 | Cross-page state corruption via shared `fvp_current_reports`; realtime sync overwriting active edits; IDB timeout cascading to data loss |
| 🟠 High | 4 | No cross-tab communication; Supabase Realtime reconnection gaps; blocklist not checked on IDB hydration merge; `deleteCurrentReport()` clobbers shared map |
| 🟡 Medium | 5 | IDB `onblocked` never resolves; no TTL on deleted blocklist; stale signed photo URLs; race in `saveCurrentReport` queue; weather sync can stall |
| 🟢 Low | 3 | Orphaned localStorage keys on delete; no IDB connection pooling; `closeAllIDBConnections()` only closes module-level reference |

---

## 2. Delete Flow Analysis

### 2.1 `deleteReportFull()` (js/shared/delete-report.js, lines 97-148)

The full delete cascade executes in this order:

1. **Blocklist** (line 109): `addToDeletedBlocklist(reportId)` — adds to `fvp_deleted_report_ids` in localStorage
2. **localStorage cleanup** (lines 113-120):
   - `deleteReportData(reportId)` — removes `fvp_report_{reportId}` key
   - `deleteCurrentReport(reportId)` — removes entry from `fvp_current_reports` map
3. **IDB cleanup** (lines 123-132): `Promise.allSettled` across 4 stores:
   - `deleteCurrentReportIDB(reportId)` — `currentReports` store
   - `deletePhotosByReportId(reportId)` — `photos` store
   - `deleteDraftDataIDB(reportId)` — `draftData` store
   - `deleteReportDataIDB(reportId)` — `reportData` store
4. **Supabase cascade** (lines 135-145): `deleteReportCascade()` — cloud cleanup

### 2.2 `deleteReportCascade()` (js/shared/delete-report.js, lines 20-91)

Cloud cascade order:
1. Select photo storage paths from `photos` table
2. Remove photo files from `report-photos` bucket
3. Delete child table rows: `interview_backup`, `report_backup`, `ai_submissions`, `report_data`
4. Look up PDF URL from `reports.pdf_url` or `final_reports.pdf_url`
5. Remove PDF from `report-pdfs` bucket
6. Delete `final_reports` row (legacy)
7. Delete `photos` table rows
8. Delete `reports` row (parent — last)

### 2.3 `deleteCurrentReport()` (js/storage-keys.js, lines 249-270)

**🔴 CRITICAL BUG IDENTIFIED**: This function performs a **read-modify-write** on the shared `fvp_current_reports` map:

```javascript
function deleteCurrentReport(reportId) {
    const reports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS);  // READ
    // ...
    delete reports[reportId];                                       // MODIFY
    const ok = setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, reports); // WRITE
    // ...
}
```

**Problem**: If another page (report.html) has read `fvp_current_reports` into memory and is about to write an update (e.g., `saveCurrentReportSync` in `visibilitychange`), the delete page's write **drops the other page's pending update**, and the other page's subsequent write **resurrects the deleted report** (or loses its own updates).

This is the **root cause** of the reported bug: deleting one report while another is being edited on report.html causes the edit page's next `saveCurrentReportSync()` to read a stale copy, then write back a map that's missing the actively-edited report's latest state, causing it to appear blank/loading on next access.

### 2.4 `confirmCancelReport()` (js/interview/persistence.js, lines 47-98)

Duplicates the delete logic instead of calling `deleteReportFull()`:
- Lines 68-70: Manually calls `addToDeletedBlocklist`, `deleteCurrentReport`, `deleteReportData`
- Lines 73-76: Manual IDB cleanup
- Line 90: `deleteReportFromSupabase()` which wraps `deleteReportCascade()`

**Risk**: Two independent delete code paths that can drift. If one is fixed, the other may not be.

---

## 3. IDB Connection Management

### 3.1 `initDB()` / `ensureDB()` (js/indexeddb-utils.js, lines 15-95)

**Architecture**: Single module-level `db` variable (line 17). All operations call `ensureDB()` → `initDB()`, which:
1. If `db` exists, validates via test transaction (line 31)
2. If stale, sets `db = null` and falls through to reopen
3. Opens with 3s timeout (`IDB_OPEN_TIMEOUT_MS = 3000`, line 16)

**🔴 IDB HYDRATION TIMEOUT ROOT CAUSE** (observed in console):

The 3000ms timeout on `indexedDB.open()` (line 47) is **very tight for iOS Safari PWA** after bfcache restore. When Safari wakes from bfcache:
1. The old `db` reference is dead (iOS closes IDB during bfcache)
2. `initDB()` correctly detects stale connection (line 30-36)
3. `indexedDB.open()` fires but iOS may take >3s to respond if:
   - Multiple databases are being opened simultaneously
   - The device just resumed from background
   - iOS is doing its lazy database connection restoration

When the timeout fires (line 47), `settled = true` and `reject()` is called. But the actual `onsuccess` may fire **later**, at which point:
- `settled = true` means the success callback does nothing (line 60)
- The `db` variable stays `null` (line 62 is never reached)
- The actual database handle **leaks** — it was opened but never assigned to `db`
- All subsequent `ensureDB()` calls try to reopen, potentially hitting the same timeout

This creates a **cascade failure**: once one timeout occurs, IDB is effectively dead for the session. All operations fall through to localStorage/Supabase fallbacks.

### 3.2 `closeAllIDBConnections()` (js/indexeddb-utils.js, lines 477-483)

```javascript
function closeAllIDBConnections() {
    if (db) {
        try { db.close(); } catch (e) { /* already closed */ }
        db = null;
    }
}
```

**🟡 LIMITATION**: This only closes the module-scoped `db` reference. If `initDB()` timed out but the database handle was actually opened (leaked), that handle remains open and can **block** version upgrades on other pages.

Called from:
- `js/interview/main.js` line 294 (pagehide)
- `js/interview/finish-processing.js` line 441 (before navigation to report.html)

**Not called from**: `index.html` pagehide/beforeunload — the dashboard page never explicitly closes IDB before navigating away.

### 3.3 `onblocked` Handler (js/indexeddb-utils.js, line 73)

```javascript
request.onblocked = function() {
    console.warn('[IDB] Database open blocked by another connection');
    // Don't settle here — wait for timeout or eventual success
};
```

**🟡 ISSUE**: If blocked, the only resolution is the 3s timeout. There's no attempt to retry after the blocking connection closes. On iOS with bfcache, the blocking page may never close its connection because it's frozen, not unloaded.

### 3.4 `resetDB()` (js/indexeddb-utils.js, lines 465-471)

Called from `index/main.js` line 244 on pageshow when:
- `event.persisted === true`, OR
- More than 2s since last refresh

This correctly handles bfcache restore for the **dashboard page**, but **report.html** and **quick-interview.html** do NOT call `resetDB()` on pageshow/visibilitychange — they only call save functions.

---

## 4. localStorage Key Map

### 4.1 Complete Key Inventory

| Key Pattern | Type | Per-Report? | Used By | Risk |
|-------------|------|-------------|---------|------|
| `fvp_projects` | Map (id→obj) | No (shared) | data-layer.js, report-rules.js, cloud-recovery.js | Low |
| `fvp_active_project_id` | String | No (shared) | **Deprecated** — not used in V69 delete/load flow | None |
| `fvp_current_reports` | Map (id→obj) | **No (shared map!)** | ALL pages — dashboard, interview, report, realtime-sync | **🔴 CRITICAL** |
| `fvp_report_{reportId}` | Object | Yes | report/data-loading.js, report/autosave.js, finish-processing.js | Low |
| `fvp_device_id` | String | No (shared) | storage-keys.js, auth | None |
| `fvp_user_id` | String | No (shared) | realtime-sync.js, cloud-recovery.js, supabase saves | None |
| `fvp_auth_role` | String | No (shared) | auth.js | None |
| `fvp_user_name` | String | No (shared) | UI display | None |
| `fvp_user_email` | String | No (shared) | UI display | None |
| `fvp_auth_user_id` | String | No (shared) | auth.js, data-layer.js | None |
| `fvp_mic_granted` | Boolean | No (shared) | permissions | None |
| `fvp_mic_timestamp` | Timestamp | No (shared) | permissions | None |
| `fvp_cam_granted` | Boolean | No (shared) | permissions | None |
| `fvp_loc_granted` | Boolean | No (shared) | permissions | None |
| `fvp_loc_lat` | Number | No (shared) | location cache | None |
| `fvp_loc_lng` | Number | No (shared) | location cache | None |
| `fvp_loc_timestamp` | Timestamp | No (shared) | location cache | None |
| `fvp_speech_granted` | Boolean | No (shared) | permissions | None |
| `fvp_onboarded` | Boolean | No (shared) | permissions | None |
| `fvp_banner_dismissed` | Boolean | No (shared) | UI state | None |
| `fvp_banner_dismissed_date` | ISO date | No (shared) | UI state | None |
| `fvp_dictation_hint_dismissed` | Boolean | No (shared) | UI state | None |
| `fvp_permissions_dismissed` | Boolean | No (shared) | UI state | None |
| `fvp_org_id` | String | No (shared) | Org scoping everywhere | None |
| `fvp_deleted_report_ids` | Array<String> | No (shared) | delete-report.js, cloud-recovery.js, storage-keys.js, realtime-sync.js | Medium |
| `fvp_projects_cache_ts` | Timestamp | No (shared) | data-layer.js, report-rules.js | None |
| `fvp_settings_scratch` | Object | No (shared) | settings page | None |
| `fvp_ai_conversation_{userId}` | Object | No (shared per-user) | ai-assistant.js | None |
| `fvp_submitted_banner_dismissed` | Boolean (session) | No (sessionStorage) | index/main.js | None |
| `fvp_migration_v113_idb_clear` | ISO date | No (shared) | index/main.js migration | None |
| `fvp_markup_photo` | Object (session) | No (sessionStorage) | photo markup | None |
| `fvp_ai_response_{hash}` | Object | No (shared cache) | AI response caching, cleaned on dashboard init | Low |

### 4.2 Shared State Vulnerability

The **single most dangerous key** is `fvp_current_reports`. It's a **shared JSON map** containing ALL active reports, read and written by:

- **index.html**: `renderReportCards()`, `deleteCurrentReport()`, `pruneCurrentReports()`, `hydrateCurrentReportsFromIDB()`, `recoverCloudDrafts()`
- **quick-interview.html**: `saveToLocalStorage()` → `saveCurrentReportSync()`, `confirmCancelReport()`, finish flow → `saveCurrentReport()`
- **report.html**: `saveReportToLocalStorage()` → `saveCurrentReportSync()`, `getCurrentReport()` on load
- **realtime-sync.js**: `_handleReportChange()` on ALL pages
- **storage-keys.js**: `hydrateCurrentReportsFromIDB()`, `syncCurrentReportsToIDB()`

Every write to this key performs a **full read-modify-write cycle**: read the entire map, change one entry, write the entire map back. This is inherently vulnerable to **last-write-wins** race conditions.

### 4.3 Can Deleting One Report Clobber Shared State?

**YES.** The sequence:

1. User has report A open on report.html (AI refine page)
2. User navigates to index.html (iOS bfcache keeps report.html alive)
3. User deletes report B from index.html
4. `deleteCurrentReport('B')` reads `fvp_current_reports`, removes B, writes back
5. iOS triggers `visibilitychange → hidden` on report.html (bfcache teardown)
6. report.html's `saveReportToLocalStorage()` → `saveCurrentReportSync()` reads a **stale** copy of `fvp_current_reports` (from memory/bfcache), writes it back
7. Report B is **resurrected** in `fvp_current_reports` (stale copy had it)
8. Report A's status/updated_at may be **stale** (overwritten by old data)

Even worse: if report.html's bfcache copy was loaded before report B was created, report B won't exist in that copy at all — the write will **remove report B AND any other reports created since the bfcache copy**.

---

## 5. Report Data Flow

### 5.1 Interview → Finish Processing → Report → AI Refine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ quick-interview.html                                                         │
│                                                                              │
│ WRITES:                                                                      │
│  • fvp_current_reports[id]._draft_data  (via saveCurrentReportSync)         │
│  • IDB:draftData[reportId]              (via saveDraftDataIDB)              │
│  • Supabase:interview_backup            (via flushInterviewBackup, 5s)     │
│  • Supabase:reports                     (via saveReportToSupabase)          │
│                                                                              │
│ READS (on load):                                                             │
│  • fvp_current_reports[id]._draft_data  → IDB:draftData → Supabase:backup  │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ finishReportFlow()
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ finish-processing.js                                                         │
│                                                                              │
│ ON SUCCESS:                                                                  │
│  • saveReportData(id, package)   → fvp_report_{id}  (localStorage)         │
│  • saveReportDataIDB(id, package) → IDB:reportData                         │
│  • Supabase:report_data.upsert  (ai_generated, original_input, etc.)       │
│  • saveCurrentReport({status:'refined'}) → fvp_current_reports[id]         │
│  • closeAllIDBConnections()                                                 │
│  • Navigate to report.html?reportId={id}                                    │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ report.html (data-loading.js)                                                │
│                                                                              │
│ READS (loadReport, line 44-213):                                            │
│  1. fvp_report_{id} (localStorage) — PRIMARY                               │
│  2. IDB:reportData[id]             — FALLBACK 1                            │
│  3. Supabase:report_data           — FALLBACK 2                            │
│  4. Check fvp_current_reports for status → redirect if pending_refine      │
│                                                                              │
│ WRITES (autosave.js saveReportToLocalStorage):                              │
│  • fvp_report_{id}                  (localStorage)                          │
│  • IDB:reportData[id]               (dual-write)                           │
│  • fvp_current_reports[id]           (status/updated_at via saveSync)       │
│  • Supabase:report_data             (5s debounced flushReportBackup)       │
│  • Supabase:reports                  (via saveReportToSupabase)             │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │ AI Refine (ai-refine.js)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AI Refine (on report.html)                                                   │
│                                                                              │
│ refineTextField() / refineContractorNarrative():                            │
│  • Reads textarea value                                                     │
│  • Calls N8N webhook                                                        │
│  • Sets textarea.value = refinedText                                        │
│  • Dispatches 'input' event → triggers autosave chain                      │
│                                                                              │
│ No direct localStorage/IDB writes — all via autosave pipeline              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Key Observation

The per-report key `fvp_report_{id}` is **safe** — it's isolated per report. The shared `fvp_current_reports` map is the danger zone.

---

## 6. Supabase Realtime

### 6.1 Connection Setup (js/shared/realtime-sync.js, lines 15-82)

Two channels are subscribed:
- `reports-sync`: Listens for `postgres_changes` on `reports` table (filtered by `user_id`)
- `projects-sync`: Listens for `postgres_changes` on `projects` table (filtered by `org_id`)

Also subscribes to `report_data` changes on the same channel as reports, but **without server-side filtering** (line 49-52) because `report_data` has no `user_id` column. Client-side guard filters by known report IDs (line 157-162).

### 6.2 WebSocket Failure: "Software caused connection abort"

**Root cause analysis**: This error is an **iOS Safari / WebKit bug** that occurs when:
1. The PWA goes to background (app switch, lock screen)
2. iOS suspends the WebSocket connection
3. On resume, the old WebSocket is dead but the Supabase Realtime client doesn't immediately detect it
4. The first heartbeat or message attempt fails with "Software caused connection abort"

**Current mitigation** (lines 154-172):
- `beforeunload` → `cleanupRealtimeSync()` — removes channels
- `online` event → `initRealtimeSync()` — re-subscribes
- `offline` event → `cleanupRealtimeSync()` — tears down

**🟠 GAP**: There's no `visibilitychange` handler for Realtime. When iOS app switches:
- `offline` may not fire (network is still technically available)
- `beforeunload` doesn't fire on iOS PWA (bfcache)
- The Realtime connection is dead, but no cleanup occurs
- On visibility return, there's no re-init

**Result**: After returning from background, Realtime subscriptions are zombies. Changes from other devices are silently missed until the next full page navigation.

### 6.3 Realtime Report Change Handler (lines 99-147)

**🔴 CRITICAL**: `_handleReportChange` on INSERT/UPDATE writes directly to `fvp_current_reports`:

```javascript
var reports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};
reports[report.id] = {
    ...(reports[report.id] || {}),
    id: report.id,
    project_id: report.project_id,
    status: report.status,
    reportDate: report.report_date,
    updated_at: Date.now()
};
setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, reports);
```

This performs the same read-modify-write on the shared map. If this fires while another page is mid-save, data can be lost.

**Mitigation exists** (SYN-02, lines 110-119): Skips updates for the actively-edited report on report.html/quick-interview.html. But this only prevents the **specific report** being edited from being overwritten — the read-modify-write still overwrites the entire map.

### 6.4 DELETE Handler (lines 140-143)

```javascript
if (payload.eventType === 'DELETE') {
    if (typeof deleteCurrentReport === 'function') {
        deleteCurrentReport(payload.old.id);
    }
}
```

When Device A deletes a report, Device B receives a DELETE event and removes it locally. But:
- No blocklist check — the report could be immediately re-added by cloud recovery
- No `deleteReportData()` — the `fvp_report_{id}` key is left as an orphan
- No IDB cleanup — `currentReports`, `reportData`, `draftData`, `photos` stores retain data

---

## 7. Fallback Chain

### 7.1 Complete Fallback Map

#### Projects Loading (data-layer.js → index/main.js)
```
IDB:projects → (empty?) → refreshProjectsFromCloud(Supabase) → localStorage fallback
                              ↓ timeout after 8s
                           Use localStorage fvp_projects
```

#### Current Reports Hydration (storage-keys.js → index/main.js)
```
localStorage:fvp_current_reports 
    ↓ (empty?)
IDB:currentReports → merge into localStorage (skip deleted blocklist)
    ↓ timeout after 3s
Use whatever localStorage has
    ↓ then
recoverCloudDrafts() from Supabase:reports table (fire-and-forget)
```

#### Report Data Loading (report/data-loading.js loadReport)
```
localStorage:fvp_report_{id} 
    ↓ (miss?)
IDB:reportData[id]
    ↓ (miss?)
Supabase:report_data (if online)
    ↓ (miss?)
Check fvp_current_reports status → redirect to interview if draft
    ↓ (all miss?)
Show error, redirect to index.html after 2s
```

#### Interview Draft Loading (interview/persistence.js getReport)
```
localStorage:fvp_current_reports[id]._draft_data
    ↓ (miss?)
IDB:draftData[id]
    ↓ (miss?)
Supabase:interview_backup (if online)
    ↓ (miss?)
Create fresh report
```

### 7.2 Gaps in Fallback Chain

| Gap | Location | Impact |
|-----|----------|--------|
| **🔴 IDB timeout leaks connection** | indexeddb-utils.js:47-52 | After timeout, IDB is dead for entire session. All IDB reads return empty/fail. |
| **🟠 No IDB retry after timeout** | indexeddb-utils.js:47 | Once timed out, every `ensureDB()` call opens a new request, each may also timeout. No exponential backoff. |
| **🟠 Supabase fallback not tried if IDB returns empty** | data-layer.js loadProjects:44-55 | If IDB is available but empty (after migration clear), returns `[]`. Supabase refresh only runs later in the pipeline. |
| **🟡 localStorage fallback writes stale data** | index/main.js:238-241 | Falls back to `fvp_projects` localStorage, which may be outdated if cloud refresh just cleared and repopulated IDB. |

---

## 8. Deleted Blocklist

### 8.1 Implementation (js/storage-keys.js, lines 54-82)

- **Storage**: `fvp_deleted_report_ids` in localStorage — JSON array of UUID strings
- **Max size**: Capped at 100 entries (FIFO, line 60)
- **No TTL**: Entries persist forever until evicted by the 100-entry cap
- **No timestamp**: Cannot age-out old entries

### 8.2 Where It's Checked

| Location | File | Line | Blocks |
|----------|------|------|--------|
| `hydrateCurrentReportsFromIDB()` | storage-keys.js | ~297 | IDB → localStorage hydration |
| `recoverCloudDrafts()` | cloud-recovery.js | ~46 | Cloud draft recovery |
| `_handleReportChange()` | realtime-sync.js | ~103 | Realtime INSERT/UPDATE |

### 8.3 Where It's **NOT** Checked

| Gap | File | Risk |
|-----|------|------|
| **`hydrateCurrentReportsFromIDB()` merge path** | storage-keys.js ~306-313 | When localStorage has reports AND IDB has additional ones, the merge loop checks `isDeletedReport()` ✅ — this IS checked. |
| **`renderReportCards()`** | report-cards.js | Renders whatever is in `fvp_current_reports` without checking blocklist. If a deleted report was resurrected by a race condition, it will be displayed. |
| **`_handleReportChange()` DELETE event** | realtime-sync.js:140-143 | On DELETE, `deleteCurrentReport()` is called but the report is NOT added to the blocklist. If cloud recovery or IDB hydration runs after the DELETE event but before the Supabase row is actually deleted, the report could be resurrected. |

### 8.4 Could the Blocklist Cause Data Loss?

**Unlikely but theoretically possible**: If a user deletes a report, then the delete fails on Supabase (e.g., network error), the report is on the blocklist but still exists in the cloud. If the user later wants to recover it, the blocklist prevents it from being re-synced.

`removeFromDeletedBlocklist()` exists (line 74) but is **never called anywhere** in the codebase. There's no UI or automatic mechanism to un-blocklist a report.

The console log message **"RECOVERY skips report on deleted blocklist: 760070ae..."** confirms the blocklist is working as intended for the specified report — it was deleted and cloud recovery correctly skips it.

---

## 9. Cross-Page State Corruption

### 9.1 The Core Problem: iOS Bfcache + Shared localStorage

iOS Safari's bfcache (back-forward cache) keeps pages alive in memory when the user navigates away. These cached pages have **stale in-memory state** (JavaScript variables) but can still execute code during `visibilitychange` and `pagehide` events.

**Scenario 1: Delete on index.html corrupts report.html**

```
Time  Page              Action                              fvp_current_reports state
─────────────────────────────────────────────────────────────────────────────────────
T0    report.html       loads report A                       {A: {...}, B: {...}}
T1    report.html       user edits, autosave fires           {A: {updated}, B: {...}}
T2    [navigate]        user goes to index.html              bfcache freezes report.html
                                                             report.html's JS has {A: {updated}, B: {...}} in memory
T3    index.html        loads, reads LS                      {A: {updated}, B: {...}}
T4    index.html        user deletes report B                {A: {updated}}  ← B removed
T5    report.html       visibilitychange fires (bfcache)     
                         saveCurrentReportSync reads STALE   
                         memory: {A: {updated}, B: {...}}    
                         writes A with OLD updated_at        {A: {old_updated}, B: {...}} ← B resurrected!
```

This is **not theoretical** — it's exactly what the user reported. The `saveCurrentReportSync` in report.html's `visibilitychange` handler (report/main.js lines 220-225) writes a stale copy of `fvp_current_reports`.

**Scenario 2: Realtime sync during multi-page editing**

```
Time  Page              Action
─────────────────────────────────────────────────────────────
T0    report.html       editing report A, realtime subscribed
T1    [background]      index.html opens in new tab
T2    index.html        realtime receives UPDATE for report A from another device
T3    index.html        _handleReportChange: read fvp_current_reports, update A, write back
T4    report.html       autosave fires, reads fvp_current_reports  
                         (may or may not see T3's write — depends on JS event loop timing)
                         writes back with saveCurrentReportSync — may clobber T3's update
```

### 9.2 What Happens When index.html Deletes a Report That's Open on Another Page

If **report.html** is open with report X and **index.html** deletes report Y:

1. **`fvp_report_{Y}` is removed** — no impact on report X (different key)
2. **`fvp_current_reports` is modified** — removes Y from the map. When report.html next writes to this map (autosave), it reads the current state (without Y) and writes back with its update to X. **Report Y stays deleted.** ✅ (if timing is right)
3. **IDB stores are cleaned for Y** — no impact on report X ✅

**BUT**: if report.html's bfcache copy of `fvp_current_reports` still has Y, and it writes back during `visibilitychange`, Y is resurrected. 🔴

If the **same report** is being deleted and edited simultaneously (unlikely but possible with multi-device):
1. index.html deletes report X from `fvp_current_reports` and `fvp_report_X`
2. report.html's autosave tries to read `fvp_report_X` — returns null
3. `saveReportToLocalStorage()` (autosave.js:180) reads existing with `getReportData(RS.currentReportId)` — **returns null** now
4. The save creates a **partial** `reportToSave` object with `existingData = {}`, losing `aiGenerated`, `originalInput`, etc.
5. This partial save succeeds, writing a broken `fvp_report_X` key
6. If the user refreshes, they get a page with no AI data — **blank report**

---

## 10. Bug Identification

### BUG-01: Cross-Page `fvp_current_reports` Clobbering (🔴 CRITICAL)

**Root cause**: `saveCurrentReportSync()` does a read-modify-write on the shared map without any locking, versioning, or timestamp checking. When called from a bfcache-restored page, it writes stale data.

**Files**: 
- `js/storage-keys.js` lines 271-280 (`saveCurrentReportSync`)
- `js/report/main.js` lines 219-225 (`visibilitychange` handler)
- `js/interview/main.js` lines 280-284 (`visibilitychange` handler)

**Impact**: Deleting one report can cause another report's state to revert, appear missing, or show blank data on next load.

**Reproduction**: Open report A in report.html → navigate to index.html → delete report B → observe report A's `updated_at` may be stale, or report B may be resurrected.

### BUG-02: IDB Connection Leak on Timeout (🔴 CRITICAL)

**Root cause**: When `indexedDB.open()` times out (line 47), the timeout rejects the promise but doesn't cancel the actual open request. If `onsuccess` fires later, the database handle is opened but never assigned to `db`, leaking the connection.

**File**: `js/indexeddb-utils.js` lines 43-68

**Impact**: Leaked connections can block IDB version upgrades on other pages, causing subsequent `initDB()` calls to hit `onblocked` indefinitely. All IDB operations fail for the session.

### BUG-03: Realtime Zombie Connections After Background (🟠 HIGH)

**Root cause**: No `visibilitychange` handler for Realtime cleanup/re-init. iOS background doesn't reliably fire `offline`/`online` events.

**File**: `js/shared/realtime-sync.js` lines 154-172

**Impact**: After app switch or screen lock on iOS, Realtime subscriptions are dead. Cross-device changes are missed until next full page load.

### BUG-04: Realtime DELETE Doesn't Blocklist or Clean Up Fully (🟠 HIGH)

**Root cause**: `_handleReportChange` DELETE handler only calls `deleteCurrentReport()`, not `addToDeletedBlocklist()` or `deleteReportData()`.

**File**: `js/shared/realtime-sync.js` lines 140-143

**Impact**: After receiving a DELETE event via Realtime, cloud recovery or IDB hydration can resurrect the report. Also leaves orphaned `fvp_report_{id}` keys in localStorage.

### BUG-05: `confirmCancelReport()` Duplicates Delete Logic (🟡 MEDIUM)

**Root cause**: Interview cancel has its own delete implementation instead of calling `deleteReportFull()`.

**File**: `js/interview/persistence.js` lines 47-98

**Impact**: If `deleteReportFull()` is updated with new cleanup steps, interview cancel won't get them. Currently missing `deleteReportDataIDB()` cleanup.

### BUG-06: No Cross-Tab Communication (🟠 HIGH)

**Root cause**: The app uses no `BroadcastChannel`, `SharedWorker`, `storage` event listener, or other cross-tab communication mechanism. Tabs operate independently on the same localStorage.

**Impact**: Two tabs open to the same page both read-modify-write `fvp_current_reports` independently. The `_saveQueue` serialization in `saveCurrentReport()` only works within a single page's JS context.

### BUG-07: Deleted Blocklist Has No TTL (🟡 MEDIUM)

**Root cause**: `fvp_deleted_report_ids` stores UUIDs with no timestamps. Entries persist until the 100-entry FIFO evicts them.

**File**: `js/storage-keys.js` lines 54-62

**Impact**: Low — the 100-entry cap prevents unbounded growth. But a user who deletes and re-creates reports rapidly could evict valid blocklist entries, allowing zombie resurrection.

### BUG-08: `removeFromDeletedBlocklist()` Never Called (🟡 MEDIUM)

**Root cause**: The function exists (line 74) but has zero call sites.

**File**: `js/storage-keys.js` line 74

**Impact**: If a Supabase cascade delete fails partially, the report is blocked from recovery forever. No self-healing path exists.

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation Status |
|------|-----------|--------|-------------------|
| Delete one report → another goes blank | **HIGH** (happens on iOS with bfcache) | **CRITICAL** (data appears lost to user) | ❌ Not mitigated |
| IDB timeout → all IDB dead for session | **HIGH** (3s timeout too tight for iOS resume) | **HIGH** (falls back to localStorage everywhere, degraded but functional) | ⚠️ Partially mitigated (fallbacks exist) |
| Realtime zombie after background | **HIGH** (every iOS background) | **MEDIUM** (multi-device sync misses, eventual consistency via cloud recovery) | ⚠️ Partially mitigated (cloud recovery runs on dashboard load) |
| Concurrent tab writes clobber data | **MEDIUM** (requires two tabs) | **HIGH** (report data loss) | ❌ Not mitigated |
| Deleted report resurrected via Realtime | **LOW** (requires specific timing) | **MEDIUM** (confusing UX, deleted report reappears) | ⚠️ Partially mitigated (blocklist covers most paths) |
| IDB upgrade blocked by leaked connection | **MEDIUM** (after IDB timeout) | **HIGH** (IDB version upgrade fails, stores may be inaccessible) | ❌ Not mitigated |

---

## 12. Recommended Fixes

### Priority 1: Critical (Fix ASAP)

#### FIX-01: Isolate Report Status Writes from Shared Map

**Problem**: `saveCurrentReportSync` reads and writes the entire `fvp_current_reports` map.

**Solution**: Change the `visibilitychange`/`pagehide` handlers on report.html and quick-interview.html to **only write to per-report keys** during emergency saves. Never do a read-modify-write on `fvp_current_reports` from a bfcache context.

Specifically:
1. In `saveReportToLocalStorage()` (report/autosave.js:226-237): Replace the `getCurrentReport → saveCurrentReportSync` block with a **targeted write** that doesn't read the full map. Use a separate per-report status key like `fvp_report_status_{id}` that the dashboard reads on next load.
2. Alternatively: Add a `_lastReadTimestamp` to the report map, and in `saveCurrentReportSync`, read the current map, compare `_lastReadTimestamp` with the one you cached, and refuse to write if they differ (optimistic locking).

**Effort**: Medium  
**Risk**: Low (additive change)

#### FIX-02: Fix IDB Connection Leak on Timeout

**Problem**: After `initDB()` timeout, the actual `onsuccess` may fire and leak a database handle.

**Solution**: In the `onsuccess` handler (line 60), if `settled` is already true, **close the database immediately**:

```javascript
request.onsuccess = (event) => {
    if (settled) {
        // Timeout already fired — close this leaked connection
        try { event.target.result.close(); } catch (e) {}
        return;
    }
    settled = true;
    clearTimeout(timer);
    db = event.target.result;
    // ...
};
```

Also add the same guard to `onerror`.

**Effort**: Small  
**Risk**: Very low

#### FIX-03: Increase IDB Timeout and Add Retry

**Problem**: 3000ms is too tight for iOS Safari after bfcache restore.

**Solution**: 
- Increase `IDB_OPEN_TIMEOUT_MS` from 3000 to 5000-8000ms
- Add one automatic retry on timeout before giving up
- After final failure, set a flag that prevents retries for the rest of the page session (avoid infinite retry loops)

**Effort**: Small  
**Risk**: Low

### Priority 2: High (Fix Soon)

#### FIX-04: Add Realtime Lifecycle Management for Visibility

**Problem**: No cleanup/re-init on `visibilitychange`.

**Solution**: Add to `realtime-sync.js`:

```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        cleanupRealtimeSync();
    } else if (document.visibilityState === 'visible') {
        // Small delay to let WebSocket reconnect naturally first
        setTimeout(function() { initRealtimeSync(); }, 1000);
    }
});
```

**Effort**: Small  
**Risk**: Low

#### FIX-05: Complete the Realtime DELETE Handler

**Problem**: DELETE event doesn't blocklist, clean up `fvp_report_{id}`, or clean IDB.

**Solution**: Replace the DELETE handler with:

```javascript
if (payload.eventType === 'DELETE') {
    var deletedId = payload.old.id;
    if (typeof addToDeletedBlocklist === 'function') addToDeletedBlocklist(deletedId);
    if (typeof deleteCurrentReport === 'function') deleteCurrentReport(deletedId);
    if (typeof deleteReportData === 'function') deleteReportData(deletedId);
    // IDB cleanup (fire-and-forget)
    if (window.idb) {
        Promise.allSettled([
            window.idb.deleteCurrentReportIDB(deletedId).catch(function(){}),
            window.idb.deleteReportDataIDB(deletedId).catch(function(){}),
            window.idb.deleteDraftDataIDB(deletedId).catch(function(){}),
            window.idb.deletePhotosByReportId(deletedId).catch(function(){})
        ]);
    }
}
```

**Effort**: Small  
**Risk**: Low

#### FIX-06: Add `storage` Event Listener for Cross-Tab Coordination

**Problem**: No mechanism for tabs to know when another tab modifies localStorage.

**Solution**: Add a `storage` event listener to detect when `fvp_current_reports` changes from another tab:

```javascript
window.addEventListener('storage', function(event) {
    if (event.key === 'fvp_current_reports') {
        // Another tab modified the reports map — refresh dashboard or reload data
        if (typeof renderReportCards === 'function') renderReportCards();
    }
});
```

For report.html/interview.html: Listen for `storage` events on `fvp_current_reports` and check if the actively-edited report was deleted (removed from the new map). If so, show a "This report was deleted" message.

**Effort**: Medium  
**Risk**: Low

#### FIX-07: Refactor `confirmCancelReport()` to Use `deleteReportFull()`

**Problem**: Duplicate delete logic in interview cancel.

**Solution**: Replace the manual delete steps in `confirmCancelReport()` with a call to `deleteReportFull(reportId)`, then navigate.

**Effort**: Small  
**Risk**: Very low

### Priority 3: Medium (Improve When Possible)

#### FIX-08: Add TTL to Deleted Blocklist

Add timestamps to blocklist entries: `{id: 'uuid', deletedAt: Date.now()}`. Prune entries older than 7 days on each write. This prevents indefinite blocklisting while still covering the recovery window.

#### FIX-09: Call `closeAllIDBConnections()` from index.html Navigation

The dashboard doesn't call `closeAllIDBConnections()` before navigating, which can block IDB version upgrades. Add to `beforeunload`/`pagehide` on index.html.

#### FIX-10: Add IDB `onblocked` Resolution Strategy

When `onblocked` fires, attempt to close known stale connections (e.g., call `resetDB()` and retry after a short delay).

#### FIX-11: Wire Up `removeFromDeletedBlocklist()` on Delete Failure

If `deleteReportCascade()` returns `success: false` with critical errors (reports table delete failed), call `removeFromDeletedBlocklist(reportId)` to allow future recovery.

---

## Appendix A: IDB Object Stores (v7)

| Store | Key | Indexes | Used By |
|-------|-----|---------|---------|
| `projects` | `id` | — | data-layer.js |
| `userProfile` | `deviceId` | — | data-layer.js |
| `photos` | `id` | `reportId`, `syncStatus` | interview (upload), delete |
| `currentReports` | `id` | `project_id`, `status` | storage-keys.js hydration/sync |
| `draftData` | `reportId` | — | interview persistence |
| `cachedArchives` | `key` | — | archives page |
| `reportData` | `reportId` | — | report data-loading, finish-processing |

## Appendix B: Supabase Tables Touched by Delete

| Table | Column | Cascade Order |
|-------|--------|--------------|
| `photos` | `report_id` | 1 (select paths) → 6 (delete rows) |
| `report-photos` bucket | paths | 2 (storage remove) |
| `interview_backup` | `report_id` | 3 |
| `report_backup` | `report_id` | 3 |
| `ai_submissions` | `report_id` | 3 |
| `report_data` | `report_id` | 3 |
| `final_reports` | `report_id` | 4 (PDF lookup) → 5 (delete row) |
| `report-pdfs` bucket | path | 4 (storage remove) |
| `reports` | `id` | 7 (parent — last) |

## Appendix C: Console Log Explanation

| Log | Meaning | Severity |
|-----|---------|----------|
| `Supabase Realtime WebSocket fails: "Software caused connection abort"` | iOS killed the WebSocket during background. Realtime is dead until re-init. | 🔴 |
| `IDB hydration times out after 3000ms` | `indexedDB.open()` didn't respond in time. IDB is unavailable for this page load. Falls back to localStorage. | ⚠️ |
| `loadProjects times out after 4000ms` | `getAllProjects()` from IDB didn't complete. Dashboard uses localStorage projects cache. | ⚠️ |
| `refreshProjectsFromCloud times out after 8000ms` | Supabase query for projects timed out. Dashboard uses whatever local data exists. | ⚠️ |
| `RECOVERY skips report on "deleted blocklist"` | Cloud recovery found report `760070ae...` in Supabase but it's on the blocklist. Working correctly. | 🟡 |
| User: "deleting one report caused another to go blank/loading" | BUG-01: Cross-page `fvp_current_reports` clobbering via bfcache + `saveCurrentReportSync`. | 🔴 |
