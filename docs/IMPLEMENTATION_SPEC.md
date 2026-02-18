# Implementation Spec: Data Layer Overhaul

## Goal
Replace the tangled localStorage/IDB/Supabase architecture with a clean 3-tier system:
- **localStorage**: Tiny pointers only (active report ID, auth tokens, UI state, device ID, blocklist)
- **IndexedDB**: Local source of truth for ALL structured data (reports, drafts, photos, projects)
- **Supabase**: Cloud source of truth with background sync

## Architecture

### New Files to Create

#### 1. `js/shared/data-store.js` — Single IDB owner

This module REPLACES `indexeddb-utils.js` as the sole interface to IndexedDB.

```
Key design decisions:
- Single connection, reused across all operations (connection pooling)
- 8000ms timeout (up from 3000ms) for iOS Safari bfcache recovery
- If onsuccess fires AFTER timeout, CLOSE the leaked handle immediately
- onblocked handler: close stale connections, retry once after 500ms delay
- resetDB() on pageshow for bfcache restore
- closeAll() on pagehide for every page (not just interview)
- All existing IDB stores preserved (projects, userProfile, photos, currentReports, draftData, cachedArchives, reportData)
- DB_VERSION stays at 7 (no schema change needed)
```

**API surface** (all return Promises):
```javascript
// Connection management
dataStore.init()           // Open/validate connection
dataStore.reset()          // Close + nullify (bfcache)
dataStore.closeAll()       // Pre-navigation cleanup

// Reports (replaces fvp_current_reports shared map)
dataStore.getReport(id)              // Single report from currentReports store
dataStore.getAllReports()             // All from currentReports store → returns Map<id, report>
dataStore.saveReport(report)         // Upsert into currentReports store
dataStore.deleteReport(id)           // Delete from currentReports store
dataStore.replaceAllReports(map)     // Bulk replace (for cloud recovery)

// Report Data (the AI-refined content package)
dataStore.getReportData(id)          // From reportData store
dataStore.saveReportData(id, data)   // Upsert into reportData store
dataStore.deleteReportData(id)       // Delete from reportData store

// Draft Data (interview state)
dataStore.getDraftData(id)           // From draftData store
dataStore.saveDraftData(id, data)    // Upsert into draftData store
dataStore.deleteDraftData(id)        // Delete from draftData store

// Projects (already IDB-first via data-layer.js — keep those, just re-export)
dataStore.getProject(id)
dataStore.getAllProjects()
dataStore.saveProject(project)
dataStore.deleteProject(id)

// Photos
dataStore.getPhotosByReportId(id)
dataStore.savePhoto(photo)
dataStore.deletePhoto(id)
dataStore.deletePhotosByReportId(id)

// User Profile
dataStore.getUserProfile(deviceId)
dataStore.saveUserProfile(profile)

// Cached Archives
dataStore.getCachedArchive(key)
dataStore.saveCachedArchive(key, data)

// General
dataStore.clearStore(name)
```

**Connection pooling implementation:**
```javascript
let _db = null;
let _dbPromise = null; // Prevents concurrent open requests

function _getDB() {
    if (_db) {
        // Validate with test transaction
        try {
            var tx = _db.transaction(['projects'], 'readonly');
            tx.abort();
            return Promise.resolve(_db);
        } catch (e) {
            _db = null;
        }
    }
    if (_dbPromise) return _dbPromise; // Return existing open attempt
    
    _dbPromise = new Promise(function(resolve, reject) {
        var settled = false;
        var timer = setTimeout(function() {
            if (!settled) {
                settled = true;
                _dbPromise = null;
                reject(new Error('IndexedDB open timed out (8000ms)'));
            }
        }, 8000);
        
        var request = indexedDB.open('fieldvoice-pro', 7);
        
        request.onsuccess = function(event) {
            clearTimeout(timer);
            if (settled) {
                // CRITICAL: Close leaked handle
                try { event.target.result.close(); } catch(e) {}
                return;
            }
            settled = true;
            _db = event.target.result;
            _db.onclose = function() { _db = null; _dbPromise = null; };
            _dbPromise = null;
            resolve(_db);
        };
        
        request.onerror = function(event) {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            _dbPromise = null;
            reject(event.target.error);
        };
        
        request.onblocked = function() {
            console.warn('[data-store] IDB open blocked — will timeout in 8s');
        };
        
        request.onupgradeneeded = function(event) {
            // Same upgrade logic as indexeddb-utils.js
            // Copy the onupgradeneeded handler from indexeddb-utils.js exactly
        };
    });
    
    return _dbPromise;
}
```

#### 2. `js/shared/sync-engine.js` — Supabase ↔ IDB sync

```
Responsibilities:
- Background sync queue: pending Supabase writes stored in IDB
- Realtime subscription management with visibilitychange lifecycle
- Conflict resolution: timestamp-based, Supabase wins on conflict
- Reconnection on visibility restore (1s delay)
- BroadcastChannel for cross-page communication

Key design:
- On visibility hidden: cleanupRealtimeSync()
- On visibility visible: setTimeout(initRealtimeSync, 1000)
- DELETE handler: blocklist + full IDB cleanup + BroadcastChannel notification
- INSERT/UPDATE handler: write to IDB via dataStore, NOT to localStorage
- BroadcastChannel('fieldvoice-sync') messages:
  { type: 'report-deleted', id: reportId }
  { type: 'report-updated', id: reportId }
  { type: 'reports-recovered', ids: [...] }
```

#### 3. `js/shared/broadcast.js` — Cross-page communication

```javascript
// Simple BroadcastChannel wrapper
var fvpChannel = null;
try {
    fvpChannel = new BroadcastChannel('fieldvoice-sync');
} catch(e) {
    console.warn('[broadcast] BroadcastChannel not supported');
}

function broadcast(message) {
    if (fvpChannel) {
        try { fvpChannel.postMessage(message); } catch(e) {}
    }
}

function onBroadcast(handler) {
    if (fvpChannel) {
        fvpChannel.onmessage = function(event) {
            handler(event.data);
        };
    }
}

window.fvpBroadcast = { send: broadcast, listen: onBroadcast };
```

### Files to Modify

#### `storage-keys.js` — Strip data storage, keep pointers only

**REMOVE these functions** (they all do R-M-W on the shared map):
- `getCurrentReport()` — replaced by `dataStore.getReport()`
- `saveCurrentReport()` / `_doSaveCurrentReport()` / `_saveQueue` — replaced by `dataStore.saveReport()`
- `saveCurrentReportSync()` — KILL THIS. The emergency sync save is the #1 bug source.
- `deleteCurrentReport()` — replaced by `dataStore.deleteReport()`
- `hydrateCurrentReportsFromIDB()` — no longer needed (IDB IS the source)
- `syncCurrentReportsToIDB()` — no longer needed (IDB IS the source)
- `getReportData()` / `saveReportData()` / `deleteReportData()` / `getReportDataKey()` — replaced by `dataStore.getReportData()`

**KEEP these** (they're pointers/flags, not data):
- `STORAGE_KEYS` constant object (but remove CURRENT_REPORTS and REPORT_DATA keys)
- `addToDeletedBlocklist()` / `isDeletedReport()` / `removeFromDeletedBlocklist()`
- `getDeviceId()`
- `getStorageItem()` / `setStorageItem()` / `removeStorageItem()`
- `aiConversationKey()`

**ADD** a new pointer key:
```javascript
ACTIVE_REPORT_ID: 'fvp_active_report_id'  // Just the UUID of the currently-open report
```

#### `report/autosave.js` — `saveReportToLocalStorage()`

Current: writes to `fvp_report_{id}` (localStorage) + IDB dual-write + `saveCurrentReportSync()` on shared map

**New behavior:**
1. Write report data to `dataStore.saveReportData(id, data)` (IDB only)
2. Update report status via `dataStore.saveReport({id, status, updated_at})` (IDB only)
3. NO localStorage writes for report content
4. NO `saveCurrentReportSync()` calls — this function should no longer exist

#### `report/main.js` — visibilitychange handler

Current: calls `saveReportToLocalStorage()` which triggers the dangerous sync write

**New behavior:**
```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && RS.currentReportId) {
        // Save report data to IDB only (async, best-effort)
        dataStore.saveReportData(RS.currentReportId, buildReportPackage());
        flushReportBackup(); // Supabase sync
    }
});

window.addEventListener('pagehide', function() {
    if (RS.currentReportId) {
        dataStore.saveReportData(RS.currentReportId, buildReportPackage());
        flushReportBackup();
    }
    dataStore.closeAll(); // CRITICAL: prevent IDB blocked on other pages
});
```

#### `report/data-loading.js` — `loadReport()`

Current fallback chain: localStorage → IDB → Supabase

**New behavior:**
1. `dataStore.getReportData(reportId)` — IDB first (source of truth)
2. If miss → Supabase `report_data` table → cache to IDB
3. NO localStorage reads for report content
4. Keep `RS.currentReportId` and URL param handling

#### `interview/persistence.js`

- `saveToLocalStorage()` → rename to `saveDraftToIDB()`, write via `dataStore.saveDraftData()` and `dataStore.saveReport()`
- `confirmCancelReport()` → replace with call to `deleteReportFull(reportId)`
- All `getCurrentReport()` calls → `dataStore.getReport()`
- All `saveCurrentReport()` / `saveCurrentReportSync()` calls → `dataStore.saveReport()`

#### `interview/main.js` — visibilitychange/pagehide

Same pattern as report/main.js — save to IDB, closeAll on pagehide.

#### `interview/finish-processing.js`

- `saveCurrentReport()` call → `dataStore.saveReport()`
- `saveReportData()` call → `dataStore.saveReportData()`
- Already calls `closeAllIDBConnections()` → change to `dataStore.closeAll()`

#### `index/main.js` — Dashboard

- `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → `await dataStore.getAllReports()`
- `pruneCurrentReports()` → read from IDB, prune, write back via `dataStore.replaceAllReports()`
- `pageshow` handler: `dataStore.reset()` (already similar)
- Listen on BroadcastChannel for report-deleted/updated messages → refresh cards

#### `index/report-cards.js`

- `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → receive reports as parameter from main.js (which reads from IDB)

#### `index/cloud-recovery.js`

- All `setStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → `dataStore.saveReport()` or `dataStore.replaceAllReports()`
- All `saveReportData()` → `dataStore.saveReportData()`
- After recovery: `fvpBroadcast.send({type: 'reports-recovered'})`

#### `shared/realtime-sync.js` — MAJOR refactor

- Move to `sync-engine.js` (or refactor in-place)
- `_handleReportChange` INSERT/UPDATE: write to IDB via `dataStore.saveReport()`, NOT localStorage
- `_handleReportChange` DELETE: `addToDeletedBlocklist()` + `dataStore.deleteReport()` + `dataStore.deleteReportData()` + `dataStore.deleteDraftData()` + `dataStore.deletePhotosByReportId()` + broadcast
- Add `visibilitychange` lifecycle handler
- Remove direct localStorage writes

#### `shared/delete-report.js`

- `deleteReportFull()`: already good structure, but change:
  - `deleteReportData(reportId)` → `dataStore.deleteReportData(reportId)`
  - `deleteCurrentReport(reportId)` → `dataStore.deleteReport(reportId)`
  - IDB cleanup section → use `dataStore.*` methods
  - Add `fvpBroadcast.send({type: 'report-deleted', id: reportId})`

#### `report/submit.js`

- `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → `dataStore.getReport()`
- `setStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → `dataStore.saveReport()`

#### `report-rules.js`

- `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` → needs async conversion or pass data from caller

#### `data-layer.js`

- Projects already IDB-first ✅ — no changes needed
- Could add report loading here later but keep it focused for now

### localStorage Keys — Final State

**KEEP (pointers + flags):**
- `fvp_device_id` — device UUID
- `fvp_user_id` — user profile ID
- `fvp_auth_role` — inspector/admin
- `fvp_user_name` — display name
- `fvp_user_email` — display email
- `fvp_auth_user_id` — Supabase auth UUID
- `fvp_org_id` — organization ID
- `fvp_active_report_id` — currently open report (just the UUID)
- `fvp_deleted_report_ids` — blocklist (small array of UUIDs)
- `fvp_projects_cache_ts` — freshness timestamp
- `fvp_projects` — projects map (kept for `report-rules.js` which is sync)
- All `fvp_mic_*`, `fvp_cam_*`, `fvp_loc_*`, `fvp_speech_*` — permission flags
- `fvp_onboarded`, `fvp_banner_dismissed*`, `fvp_dictation_hint_dismissed`, `fvp_permissions_dismissed` — UI state
- `fvp_settings_scratch` — settings page scratch
- `fvp_ai_conversation_*` — AI chat history
- `fvp_migration_v113_idb_clear` — migration flag

**REMOVE (data that belongs in IDB):**
- `fvp_current_reports` — THE KILLER. All report metadata moves to IDB `currentReports` store
- `fvp_report_{reportId}` — All report data moves to IDB `reportData` store

### Script Load Order

All HTML pages that use the new modules need:
```html
<!-- Order matters: broadcast → data-store → sync-engine → page-specific -->
<script src="js/storage-keys.js"></script>
<script src="js/shared/broadcast.js"></script>
<script src="js/shared/data-store.js"></script>
<script src="js/shared/sync-engine.js"></script>
<!-- Then page-specific scripts -->
```

### Migration Path

On first load after deploy:
1. `data-store.js` init checks if `fvp_current_reports` exists in localStorage
2. If yes → migrate all entries to IDB `currentReports` store
3. Check for any `fvp_report_{id}` keys → migrate to IDB `reportData` store
4. Set migration flag: `fvp_migration_v2_idb_data = true`
5. Remove old localStorage keys

This ensures existing users don't lose data.

## Rules for Implementation

1. **All JS files use `var` and `function` declarations** — this is a vanilla JS project, no ES modules, no import/export, no arrow functions in top-level
2. **Everything exposed via `window.*`** — `window.dataStore`, `window.fvpBroadcast`, `window.syncEngine`
3. **No breaking changes to Supabase schema** — schema stays as-is
4. **Keep `data-layer.js` for projects** — it already works correctly
5. **Preserve all IDB stores and DB_VERSION = 7** — no schema migration needed
6. **Test with simtest@fieldvoice.dev / TestSim2026!**
7. **Do NOT modify HTML files** — only JS. Script tags can be added but existing ones must not break.
8. **Commit after each logical change** — small, traceable commits
