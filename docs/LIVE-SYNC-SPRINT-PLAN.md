# FieldVoice Pro — Live Sync Implementation Plan

**Generated:** 2025-07-13  
**Based on:** LIVE-SYNC-DESIGN.md + full codebase audit  
**Status:** Ready for execution

---

## Table of Contents
- [Deliverable 1: Sprint Breakdown](#deliverable-1-sprint-breakdown)
- [Deliverable 2: Risk Assessment](#deliverable-2-risk-assessment)
- [Deliverable 3: Dependency Graph](#deliverable-3-dependency-graph)

---

# Deliverable 1: Sprint Breakdown

---

## Sprint 1: Session ID Export & Sync Revision Plumbing

**What it achieves:** Exposes `_syncSessionId` from both interview and report pages onto `window.syncEngine` so that the broadcast layer can self-filter. Also persists revision to sessionStorage to fix the reset-on-reload bug.

### Files to modify
1. `js/interview/persistence.js`
2. `js/report/autosave.js`
3. `js/shared/realtime-sync.js`

### Exact changes

**`js/interview/persistence.js`:**
- After the existing `_syncSessionId` declaration (line ~`const _syncSessionId = 'sess_' + ...`), add an export to `window.syncEngine`:
```javascript
// After _syncSessionId declaration:
if (!window.syncEngine) window.syncEngine = {};
window.syncEngine.getSessionId = function() { return _syncSessionId; };
window.syncEngine.getRevision = function() { return _syncRevision; };
```
- Modify `_syncRevision` initialization to read from sessionStorage:
```javascript
// REPLACE: let _syncRevision = 0;
// WITH:
var _reportIdForRev = new URLSearchParams(window.location.search).get('reportId') || 'unknown';
let _syncRevision = parseInt(sessionStorage.getItem('fvp_sync_rev_' + _reportIdForRev) || '0');
```
- In the existing `saveReport()` function, after `_syncRevision++`, add:
```javascript
sessionStorage.setItem('fvp_sync_rev_' + _reportIdForRev, _syncRevision);
```

**`js/report/autosave.js`:**
- Add at top of file (after `var RS = window.reportState;`):
```javascript
var _reportSyncSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
var _reportSyncRevision = 0;
if (!window.syncEngine) window.syncEngine = {};
window.syncEngine.getSessionId = function() { return _reportSyncSessionId; };
window.syncEngine.getRevision = function() { return _reportSyncRevision; };
```
- In existing `saveReport()` function, after `showSaveIndicator();`, add:
```javascript
_reportSyncRevision++;
```

**`js/shared/realtime-sync.js`:**
- Change the `window.syncEngine` declaration at the bottom from:
```javascript
window.syncEngine = {
    initRealtimeSync: initRealtimeSync,
    cleanupRealtimeSync: cleanupRealtimeSync
};
```
to:
```javascript
window.syncEngine = Object.assign(window.syncEngine || {}, {
    initRealtimeSync: initRealtimeSync,
    cleanupRealtimeSync: cleanupRealtimeSync
});
```
This prevents overwriting the `getSessionId`/`getRevision` that persistence.js or autosave.js already attached. NOTE: `realtime-sync.js` loads BEFORE `persistence.js` and `autosave.js` (confirmed in HTML), so `realtime-sync.js` must use `Object.assign` to not clobber later attachments, and the page-specific files must use `if (!window.syncEngine) window.syncEngine = {};` before attaching their functions.

### Dependencies
None — this is the foundation.

### Verification
1. Open `quick-interview.html?reportId=<any>` in Chrome DevTools
2. Run: `window.syncEngine.getSessionId()` → should return `"sess_..."` string
3. Run: `window.syncEngine.getRevision()` → should return a number ≥ 0
4. Type in any field, then re-run `getRevision()` → should be higher
5. Repeat on `report.html?reportId=<any>` — same results

### Risk: LOW
- Only adds new properties to an existing object. The `Object.assign` pattern is additive.
- **Watch for:** If any other file also sets `window.syncEngine = {...}` without assign, it'll clobber these. Grep confirmed only `realtime-sync.js` does this.

---

## Sprint 2: Broadcast Channel Join/Leave

**What it achieves:** On edit pages (quick-interview.html, report.html), joins a Supabase Broadcast channel `sync:{reportId}`. Logs received broadcasts. Unsubscribes on leave.

### Files to modify
1. `js/shared/realtime-sync.js`

### Exact changes

**`js/shared/realtime-sync.js`:**

Add a new file-level variable after `var _realtimeChannels = [];`:
```javascript
var _syncBroadcastChannel = null;  // Supabase Broadcast channel for live sync
```

Inside `initRealtimeSync()`, AFTER the existing `projects-sync` channel subscription block, add:
```javascript
// --- Sync Broadcast channel (edit pages only) ---
var reportId = new URLSearchParams(window.location.search).get('reportId');
var path = window.location.pathname;
if (reportId && (path.indexOf('quick-interview') !== -1 || path.indexOf('report.html') !== -1)) {
    _syncBroadcastChannel = supabaseClient
        .channel('sync:' + reportId)
        .on('broadcast', { event: 'sync_update' }, function(payload) {
            console.log('[SYNC-BC] Received broadcast:', payload);
            _handleSyncBroadcast(payload.payload);
        })
        .subscribe(function(status) {
            console.log('[SYNC-BC] sync:' + reportId + ' status:', status);
        });
    _realtimeChannels.push(_syncBroadcastChannel);
}
```

Add a stub handler function (before the lifecycle section):
```javascript
function _handleSyncBroadcast(payload) {
    // Self-filter
    if (!payload || !window.syncEngine || !window.syncEngine.getSessionId) return;
    if (payload.session_id === window.syncEngine.getSessionId()) {
        console.log('[SYNC-BC] Ignoring own broadcast');
        return;
    }
    console.log('[SYNC-BC] Remote update from session:', payload.session_id, 'sections:', payload.sections_changed);
    // TODO: Sprint 5 will wire this to _fetchAndMerge()
}
```

In `cleanupRealtimeSync()`, add after the existing forEach loop:
```javascript
_syncBroadcastChannel = null;
```

### Dependencies
- Sprint 1 (needs `window.syncEngine.getSessionId()` for self-filter)

### Verification
1. Open `quick-interview.html?reportId=<any>` — console should show `[SYNC-BC] sync:<reportId> status: SUBSCRIBED`
2. Open the same URL in a second tab/browser — also shows SUBSCRIBED
3. Open `index.html` — should NOT see any `[SYNC-BC]` log (dashboard doesn't join)
4. Navigate away from the edit page — `cleanupRealtimeSync` fires, no leaked channels

### Risk: LOW
- Adds one more Supabase channel per edit page. Supabase free tier allows 200 concurrent connections; this adds 1 per open tab. Safe unless user opens 100+ tabs.
- `_realtimeChannels.push()` ensures existing cleanup logic handles it.

---

## Sprint 3: Outbound Broadcast (Interview Page)

**What it achieves:** After every successful `flushInterviewBackup()` to Supabase, broadcasts a lightweight signal to the `sync:{reportId}` channel so other devices know to fetch.

### Files to modify
1. `js/shared/realtime-sync.js` (add `_broadcastSyncUpdate` helper)
2. `js/interview/persistence.js` (wire broadcast into flush)

### Exact changes

**`js/shared/realtime-sync.js`:**

Add helper function (after `_handleSyncBroadcast`):
```javascript
/**
 * Send a sync_update broadcast to the sync:{reportId} channel.
 * Called after a successful Supabase upsert (never before — broadcast is a signal, not data).
 */
function _broadcastSyncUpdate(reportId, sectionsChanged, page) {
    if (!_syncBroadcastChannel) return;
    // Verify channel matches this reportId
    if (_syncBroadcastChannel.topic !== 'realtime:sync:' + reportId) return;

    var payload = {
        type: 'sync_update',
        session_id: window.syncEngine.getSessionId ? window.syncEngine.getSessionId() : 'unknown',
        report_id: reportId,
        page: page || 'unknown',
        updated_at: new Date().toISOString(),
        sections_changed: sectionsChanged || [],
        revision: window.syncEngine.getRevision ? window.syncEngine.getRevision() : 0
    };

    _syncBroadcastChannel.send({
        type: 'broadcast',
        event: 'sync_update',
        payload: payload
    }).then(function() {
        console.log('[SYNC-BC] Broadcast sent:', payload.sections_changed);
    }).catch(function(err) {
        console.warn('[SYNC-BC] Broadcast send failed:', err);
    });
}

// Expose for use by persistence.js and autosave.js
window.syncEngine.broadcastSyncUpdate = function(reportId, sectionsChanged, page) {
    _broadcastSyncUpdate(reportId, sectionsChanged, page);
};
```

**IMPORTANT**: The `window.syncEngine.broadcastSyncUpdate` assignment must happen inside `initRealtimeSync()` OR be added after the `Object.assign` block at the bottom. Best approach: add it right after the `Object.assign` block:
```javascript
window.syncEngine.broadcastSyncUpdate = function(reportId, sectionsChanged, page) {
    _broadcastSyncUpdate(reportId, sectionsChanged, page);
};
```

**`js/interview/persistence.js`:**

In `flushInterviewBackup()`, inside the `.then(function() {` success handler, AFTER `_clearBackupStale(reportId);`, add:
```javascript
    // Live sync: notify other devices
    if (window.syncEngine && window.syncEngine.broadcastSyncUpdate) {
        window.syncEngine.broadcastSyncUpdate(reportId, ['entries', 'activities', 'operations', 'weather', 'photos', 'toggleStates'], 'quick-interview');
    }
```

Note: For Sprint 3 we broadcast ALL section names as a coarse hint. Sprint 9 (polish) can add granular section tracking.

### Dependencies
- Sprint 1 (session ID)
- Sprint 2 (broadcast channel exists)

### Verification
1. Open `quick-interview.html?reportId=X` in Tab A
2. Open the same URL in Tab B (different browser or incognito)
3. In Tab A, type something → wait 2s for `flushInterviewBackup` to fire
4. Tab A console: `[SYNC-BC] Broadcast sent: ['entries', ...]`
5. Tab B console: `[SYNC-BC] Remote update from session: sess_...`
6. Tab A should NOT log "Remote update" for its own broadcast (self-filter works)

### Risk: LOW
- Broadcast is fire-and-forget after a successful upsert. If it fails, nothing breaks — the existing postgres_changes subscription is still a fallback.
- The broadcast payload is tiny (~200 bytes). No data content, just a signal.

---

## Sprint 4: Outbound Broadcast (Report Page)

**What it achieves:** Same as Sprint 3 but for `report.html`. After every successful `flushReportBackup()`, broadcasts a signal.

### Files to modify
1. `js/report/autosave.js`

### Exact changes

**`js/report/autosave.js`:**

In `flushReportBackup()`, inside the `.then(function() {` success handler (after `console.log('[AUTOSAVE] report_data synced');`), add:
```javascript
    // Live sync: notify other devices
    if (window.syncEngine && window.syncEngine.broadcastSyncUpdate) {
        var changedSections = Object.keys(RS.userEdits).length > 0 ? ['userEdits'] : [];
        window.syncEngine.broadcastSyncUpdate(_autosaveReportId, changedSections, 'report');
    }
```

### Dependencies
- Sprint 1, Sprint 2, Sprint 3 (needs the broadcastSyncUpdate function exposed)

### Verification
1. Open `report.html?reportId=X` in Tab A
2. Open `quick-interview.html?reportId=X` (or `report.html`) in Tab B
3. In Tab A, edit a field → wait 5s for `flushReportBackup`
4. Tab A console: `[SYNC-BC] Broadcast sent: ['userEdits']`
5. Tab B console: `[SYNC-BC] Remote update from session: sess_...`

### Risk: LOW
- Same pattern as Sprint 3. No changes to save logic, only appends a notification after success.

---

## Sprint 5: Inbound Fetch-on-Broadcast (Interview Page)

**What it achieves:** When a broadcast arrives from another session, waits 500-800ms (jitter), then REST-fetches the latest `interview_backup` from Supabase. Stores the remote data for merging (Sprint 7). For now, just logs it.

### Files to modify
1. `js/shared/realtime-sync.js`

### Exact changes

**`js/shared/realtime-sync.js`:**

Replace the `_handleSyncBroadcast` stub with the full implementation:
```javascript
var _lastMergeAt = null;  // Timestamp of last successful merge (staleness guard)
var _fetchMergePending = false;  // Prevents overlapping fetches

function _handleSyncBroadcast(payload) {
    // 1. Self-filter
    if (!payload || !window.syncEngine || !window.syncEngine.getSessionId) return;
    if (payload.session_id === window.syncEngine.getSessionId()) return;

    var reportId = payload.report_id;
    var path = window.location.pathname;
    var isInterview = path.indexOf('quick-interview') !== -1;
    var isReport = path.indexOf('report.html') !== -1;
    if (!isInterview && !isReport) return;

    // 2. Cross-page detection (interview sees report broadcast or vice versa)
    if (isInterview && payload.page === 'report') {
        if (typeof showToast === 'function') {
            showToast('⚠️ Refined report is being edited on another device', 'warning');
        }
        return;
    }
    if (isReport && payload.page === 'quick-interview') {
        if (typeof showToast === 'function') {
            showToast('⚠️ Draft is being edited on another device. Changes appear after refinement.', 'warning');
        }
        return;
    }

    // 3. Prevent overlapping fetches
    if (_fetchMergePending) {
        console.log('[SYNC-BC] Fetch already pending, skipping');
        return;
    }
    _fetchMergePending = true;

    // 4. Delayed REST fetch with jitter (broadcast arrives before DB commit)
    var delay = 500 + Math.floor(Math.random() * 300);
    console.log('[SYNC-BC] Scheduling fetch in', delay, 'ms for', reportId);

    setTimeout(function() {
        _fetchAndMerge(reportId, payload.sections_changed, isInterview)
            .finally(function() { _fetchMergePending = false; });
    }, delay);
}

/**
 * Fetch latest data from Supabase and invoke merge.
 * For now (Sprint 5), logs the fetched data. Sprint 7+ will wire the merge engine.
 */
function _fetchAndMerge(reportId, sectionsHint, isInterview) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) {
        return Promise.resolve();
    }

    var fetchPromise;
    if (isInterview) {
        fetchPromise = supabaseClient
            .from('interview_backup')
            .select('page_state, updated_at')
            .eq('report_id', reportId)
            .maybeSingle();
    } else {
        fetchPromise = supabaseClient
            .from('report_data')
            .select('*')
            .eq('report_id', reportId)
            .maybeSingle();
    }

    return fetchPromise.then(function(result) {
        if (!result.data || result.error) {
            console.warn('[SYNC-BC] Fetch returned no data or error:', result.error);
            return;
        }

        // Staleness check
        var remoteUpdatedAt = result.data.updated_at;
        if (_lastMergeAt && remoteUpdatedAt <= _lastMergeAt) {
            console.log('[SYNC-BC] Remote data not newer than last merge, skipping');
            return;
        }
        _lastMergeAt = remoteUpdatedAt;

        console.log('[SYNC-BC] Fetched remote data, updated_at:', remoteUpdatedAt);

        // TODO: Wire to merge engine in Sprint 8/9
        // For now, dispatch a custom event so we can verify the pipeline works
        window.dispatchEvent(new CustomEvent('sync-remote-fetched', {
            detail: { reportId: reportId, data: result.data, sectionsHint: sectionsHint, isInterview: isInterview }
        }));
    }).catch(function(err) {
        console.warn('[SYNC-BC] Fetch failed:', err);
    });
}
```

### Dependencies
- Sprint 2 (handler is called from broadcast listener)

### Verification
1. Open two browser windows on `quick-interview.html?reportId=X`
2. Edit in Window A → wait for flush → Window B should log:
   - `[SYNC-BC] Scheduling fetch in Nms for <reportId>`
   - `[SYNC-BC] Fetched remote data, updated_at: <timestamp>`
3. Verify self-filter: Window A should NOT log "Scheduling fetch"
4. Test cross-page: Open `report.html?reportId=X` in Window B → edit in Window A → Window B shows toast "Draft is being edited..."

### Risk: LOW-MEDIUM
- Adds a REST fetch (1 extra DB query per broadcast). With 2s debounce, this is max 1 extra query per 2s per device. Well within Supabase limits.
- **Watch for:** The `_fetchMergePending` flag prevents pileup, but if a broadcast arrives exactly when a fetch completes, we could miss one signal. Acceptable — the next edit cycle will catch it.

---

## Sprint 6: SYN-02 Guard Update & Visibility/Lifecycle Handlers

**What it achieves:** Updates the SYN-02 guard in `realtime-sync.js` to allow broadcast-based updates (currently it skips ALL updates for the active report). Adds unconditional REST fetch on `visibilitychange→visible` (iOS resume fix). Adds `pageshow` bfcache handler.

### Files to modify
1. `js/shared/realtime-sync.js`
2. `js/interview/main.js`  
3. `js/report/main.js`

### Exact changes

**`js/shared/realtime-sync.js`:**

The SYN-02 guard in `_handleReportChange` and `_handleReportDataChange` currently does:
```javascript
if (editingReportId && editingReportId === report.id) {
    console.log('[REALTIME] Skipping update for actively-edited report:', report.id);
    return;
}
```

This guard is **correct and must stay**. The `postgres_changes` handler should NOT overwrite local state for the report being edited. The NEW broadcast channel (`_handleSyncBroadcast`) is a completely separate code path that does its own fetching and merging — it is NOT blocked by SYN-02. **No change needed to SYN-02.**

**Add visibility-based fetch to `realtime-sync.js`:**

Modify the existing `visibilitychange` handler from:
```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        cleanupRealtimeSync();
    } else if (document.visibilityState === 'visible') {
        setTimeout(function() { initRealtimeSync(); }, 1000);
    }
});
```
to:
```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        cleanupRealtimeSync();
    } else if (document.visibilityState === 'visible') {
        setTimeout(function() { initRealtimeSync(); }, 1000);

        // Unconditional REST fetch on resume (iOS may have missed broadcasts)
        var reportId = new URLSearchParams(window.location.search).get('reportId');
        var path = window.location.pathname;
        if (reportId) {
            var isInterview = path.indexOf('quick-interview') !== -1;
            var isReport = path.indexOf('report.html') !== -1;
            if (isInterview || isReport) {
                setTimeout(function() {
                    _fetchAndMerge(reportId, [], isInterview);
                }, 1500);  // 1.5s delay: let initRealtimeSync re-establish WS first
            }
        }
    }
});
```

**Add `pageshow` bfcache handler (same file):**

Add after the `visibilitychange` handler:
```javascript
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[SYNC] Restored from bfcache — re-syncing');
        initRealtimeSync();
        var reportId = new URLSearchParams(window.location.search).get('reportId');
        var path = window.location.pathname;
        if (reportId) {
            var isInterview = path.indexOf('quick-interview') !== -1;
            var isReport = path.indexOf('report.html') !== -1;
            if (isInterview || isReport) {
                _fetchAndMerge(reportId, [], isInterview);
            }
        }
        if (typeof drainPendingBackups === 'function') drainPendingBackups();
    }
});
```

**`js/interview/main.js` — no changes needed.** The existing `visibilitychange` handler in `main.js` handles SAVING on hidden. The new handler in `realtime-sync.js` handles FETCHING on visible. They complement each other.

**`js/report/main.js` — no changes needed.** Same reasoning.

### Dependencies
- Sprint 5 (needs `_fetchAndMerge` function)

### Verification
1. Open `quick-interview.html?reportId=X` on two devices
2. On Device A, edit and flush
3. On Device B, switch to another app (tab goes hidden)
4. Wait 5s, switch back to Device B
5. Console should show: `[SYNC] Restored...` or `[SYNC-BC] Fetched remote data...`
6. Test bfcache: Navigate away with back button, then hit forward → should re-sync

### Risk: MEDIUM
- **Critical watch:** The `visibilitychange` handler in `realtime-sync.js` calls `cleanupRealtimeSync()` on hidden, which tears down ALL channels including the broadcast channel. When visible again, `initRealtimeSync()` re-creates them. This is the **existing behavior** and is correct — iOS kills websockets on background anyway. The 1.5s delay before `_fetchAndMerge` ensures the new channel is ready.
- **Watch for:** Multiple `visibilitychange` events firing rapidly (e.g., iOS multitasking gestures). The `_fetchMergePending` flag from Sprint 5 prevents pileup.

---

## Sprint 7: Merge Engine — Core Algorithm

**What it achieves:** Creates `js/shared/sync-merge.js` with the pure-function `syncMerge(base, local, remote, sectionsHint)` algorithm. No UI wiring — just the merge logic.

### Files to create
1. `js/shared/sync-merge.js` (NEW)

### Files to modify
2. `quick-interview.html` — add `<script>` tag
3. `report.html` — add `<script>` tag

### Exact changes

**`js/shared/sync-merge.js` (new file, ~120-150 lines):**

```javascript
/**
 * sync-merge.js — Three-way merge engine for live sync
 * Pure functions — no DOM, no global state, no side effects.
 */
(function() {
    'use strict';

    /**
     * Deep-equal comparison (JSON-based, sufficient for our data types).
     */
    function deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return a == b;
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * Deep clone via JSON round-trip.
     */
    function deepClone(obj) {
        if (obj == null) return obj;
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Three-way merge for object sections (field-level).
     * For each key: if local unchanged from base, take remote. If remote unchanged, keep local.
     * If both changed, local wins (active editor keeps their work).
     */
    function mergeObjects(base, local, remote) {
        base = base || {};
        local = local || {};
        remote = remote || {};
        var merged = deepClone(local);
        var conflicts = [];

        // Union of all keys across all three
        var allKeys = {};
        Object.keys(base).forEach(function(k) { allKeys[k] = true; });
        Object.keys(local).forEach(function(k) { allKeys[k] = true; });
        Object.keys(remote).forEach(function(k) { allKeys[k] = true; });

        Object.keys(allKeys).forEach(function(key) {
            var bVal = base[key];
            var lVal = local[key];
            var rVal = remote[key];
            var localChanged = !deepEqual(bVal, lVal);
            var remoteChanged = !deepEqual(bVal, rVal);

            if (!localChanged && remoteChanged) {
                merged[key] = deepClone(rVal);
            } else if (localChanged && !remoteChanged) {
                // Keep local (already in merged)
            } else if (localChanged && remoteChanged) {
                // Both changed — local wins, record conflict
                if (!deepEqual(lVal, rVal)) {
                    conflicts.push({ key: key, local: lVal, remote: rVal });
                }
            }
            // Neither changed — keep local (same as base and remote)
        });

        return { merged: merged, conflicts: conflicts };
    }

    /**
     * Three-way merge for arrays with stable IDs.
     * Uses ID-based matching. Items added/removed are tracked.
     */
    function mergeArraysById(base, local, remote, idField) {
        base = base || [];
        local = local || [];
        remote = remote || [];

        var baseMap = {};
        base.forEach(function(item) { if (item[idField]) baseMap[item[idField]] = item; });
        var localMap = {};
        local.forEach(function(item) { if (item[idField]) localMap[item[idField]] = item; });
        var remoteMap = {};
        remote.forEach(function(item) { if (item[idField]) remoteMap[item[idField]] = item; });

        var merged = [];
        var seen = {};
        var conflicts = [];

        // Start with local items (preserves local ordering)
        local.forEach(function(lItem) {
            var id = lItem[idField];
            if (!id) { merged.push(lItem); return; }
            seen[id] = true;

            var bItem = baseMap[id];
            var rItem = remoteMap[id];

            if (!rItem) {
                // Not in remote
                if (bItem) {
                    // Was in base, gone from remote → remote deleted it
                    // But local still has it → keep local (local wins deletion conflict)
                    merged.push(lItem);
                } else {
                    // New in local, not in remote → keep
                    merged.push(lItem);
                }
            } else {
                // In both local and remote
                var localChanged = !deepEqual(bItem, lItem);
                var remoteChanged = !deepEqual(bItem, rItem);

                if (!localChanged && remoteChanged) {
                    merged.push(deepClone(rItem));
                } else if (localChanged && !remoteChanged) {
                    merged.push(lItem);
                } else if (localChanged && remoteChanged) {
                    // Both changed same item — local wins
                    if (!deepEqual(lItem, rItem)) {
                        conflicts.push({ id: id, local: lItem, remote: rItem });
                    }
                    merged.push(lItem);
                } else {
                    merged.push(lItem);
                }
            }
        });

        // Add remote-only items (new from other device)
        remote.forEach(function(rItem) {
            var id = rItem[idField];
            if (!id || seen[id]) return;
            // Not in local — was it deleted locally?
            if (baseMap[id]) {
                // Was in base, in remote, not in local → local deleted it → skip
            } else {
                // New from remote → add
                merged.push(deepClone(rItem));
            }
        });

        return { merged: merged, conflicts: conflicts };
    }

    /**
     * Photo-aware merge: union by ID, never overwrite uploading items.
     */
    function mergePhotos(base, local, remote) {
        var mergedMap = {};

        // Start with all local photos (preserves upload-in-progress)
        (local || []).forEach(function(p) { mergedMap[p.id] = p; });

        // Add/update from remote
        (remote || []).forEach(function(p) {
            if (!mergedMap[p.id]) {
                // New from remote
                mergedMap[p.id] = deepClone(p);
            } else if (mergedMap[p.id].uploadStatus === 'uploading') {
                // Don't overwrite in-progress upload
            } else if (p.url && !mergedMap[p.id].url) {
                // Remote has URL, local doesn't — take the URL
                mergedMap[p.id] = Object.assign({}, mergedMap[p.id], {
                    url: p.url,
                    storagePath: p.storagePath
                });
            }
        });

        return Object.values(mergedMap);
    }

    /**
     * Main entry point: three-way section merge.
     * @param {Object} base - Last known-good state (snapshot from last merge or page load)
     * @param {Object} local - Current in-memory state (IS.report or RS.report)
     * @param {Object} remote - Freshly fetched from Supabase
     * @param {string[]} sectionsHint - Which sections the sender changed (optimization hint)
     * @param {Object} sectionDefs - Section definitions { name: { type, idField? } }
     * @returns {{ merged: Object, sectionsUpdated: string[], conflicts: Array }}
     */
    function syncMerge(base, local, remote, sectionsHint, sectionDefs) {
        base = base || {};
        local = local || {};
        remote = remote || {};
        sectionDefs = sectionDefs || {};

        var merged = deepClone(local);
        var sectionsUpdated = [];
        var allConflicts = [];

        Object.keys(sectionDefs).forEach(function(sectionKey) {
            var def = sectionDefs[sectionKey];
            var bVal = getNestedProp(base, sectionKey);
            var lVal = getNestedProp(local, sectionKey);
            var rVal = getNestedProp(remote, sectionKey);

            // Quick skip: if remote section equals local, nothing to do
            if (deepEqual(lVal, rVal)) return;

            var result;
            if (def.type === 'object') {
                result = mergeObjects(bVal, lVal, rVal);
            } else if (def.type === 'array' && def.idField) {
                result = mergeArraysById(bVal, lVal, rVal, def.idField);
            } else if (def.type === 'photos') {
                result = { merged: mergePhotos(bVal, lVal, rVal), conflicts: [] };
            } else {
                // Scalar or array without ID — last-write-wins (remote wins if local unchanged)
                var localChanged = !deepEqual(bVal, lVal);
                if (!localChanged) {
                    result = { merged: deepClone(rVal), conflicts: [] };
                } else {
                    // Local changed — keep local
                    result = { merged: lVal, conflicts: deepEqual(lVal, rVal) ? [] : [{ key: sectionKey, local: lVal, remote: rVal }] };
                }
            }

            if (!deepEqual(lVal, result.merged)) {
                setNestedProp(merged, sectionKey, result.merged);
                sectionsUpdated.push(sectionKey);
            }
            if (result.conflicts && result.conflicts.length > 0) {
                result.conflicts.forEach(function(c) { c.section = sectionKey; });
                allConflicts = allConflicts.concat(result.conflicts);
            }
        });

        return { merged: merged, sectionsUpdated: sectionsUpdated, conflicts: allConflicts };
    }

    // Helpers for nested property access
    function getNestedProp(obj, path) {
        return path.split('.').reduce(function(o, k) { return (o || {})[k]; }, obj);
    }

    function setNestedProp(obj, path, value) {
        var keys = path.split('.');
        var last = keys.pop();
        var target = keys.reduce(function(o, k) {
            if (!o[k] || typeof o[k] !== 'object') o[k] = {};
            return o[k];
        }, obj);
        target[last] = value;
    }

    // Expose
    window.syncMerge = syncMerge;
    window.syncMergeUtils = {
        mergeObjects: mergeObjects,
        mergeArraysById: mergeArraysById,
        mergePhotos: mergePhotos,
        deepEqual: deepEqual,
        deepClone: deepClone
    };
})();
```

**`quick-interview.html`:**
Add `<script src="./js/shared/sync-merge.js"></script>` AFTER the `realtime-sync.js` script tag (line ~30) and BEFORE the interview-specific scripts.

**`report.html`:**
Add `<script src="./js/shared/sync-merge.js"></script>` AFTER the `realtime-sync.js` script tag (line ~31) and BEFORE the report-specific scripts.

### Dependencies
- None (pure functions, no runtime dependencies)

### Verification
1. Open any page with the script loaded, then in DevTools console:
```javascript
var base   = { weather: { temp: 70 }, entries: [{ id: 'a', content: 'hello' }] };
var local  = { weather: { temp: 70 }, entries: [{ id: 'a', content: 'hello' }, { id: 'b', content: 'new local' }] };
var remote = { weather: { temp: 85 }, entries: [{ id: 'a', content: 'updated' }] };
var defs = {
    weather: { type: 'object' },
    entries: { type: 'array', idField: 'id' }
};
var result = syncMerge(base, local, remote, [], defs);
console.log(result.sectionsUpdated);  // Should include 'weather' and 'entries'
console.log(result.merged.weather.temp);  // 85 (remote wins, local unchanged)
console.log(result.merged.entries.length);  // 2 (local's 'b' kept, 'a' takes remote)
console.log(result.merged.entries.find(e => e.id === 'a').content);  // 'updated'
```
2. Test conflict: both change same field:
```javascript
var base2   = { notes: 'original' };
var local2  = { notes: 'local edit' };
var remote2 = { notes: 'remote edit' };
var defs2 = { notes: { type: 'scalar' } };
var r2 = syncMerge(base2, local2, remote2, [], defs2);
console.log(r2.merged.notes);  // 'local edit' (local wins)
console.log(r2.conflicts.length);  // 1
```

### Risk: LOW
- New file, no existing code modified except adding two `<script>` tags. Pure functions with no side effects.

---

## Sprint 8: Base Snapshot + Interview Page Merge Wiring

**What it achieves:** Initializes `window._syncBase` on interview page load. Wires `_fetchAndMerge` to actually call `syncMerge` and apply the result to `IS.report`. Updates IDB (no re-broadcast). Shows toast.

### Files to modify
1. `js/interview/persistence.js` (init _syncBase, add _applyInterviewMerge)
2. `js/shared/realtime-sync.js` (wire _fetchAndMerge to call merge + apply)

### Exact changes

**`js/interview/persistence.js`:**

Add after the `_syncSessionId` declaration block:
```javascript
// Section definitions for interview page merge engine
var INTERVIEW_SECTIONS = {
    'overview': { type: 'object' },
    'safety': { type: 'object' },
    'toggleStates': { type: 'object' },
    'freeform_checklist': { type: 'object' },
    'meta': { type: 'object' },
    'reporter': { type: 'object' },
    'entries': { type: 'array', idField: 'id' },
    'activities': { type: 'array', idField: 'contractorId' },
    'operations': { type: 'array', idField: 'contractorId' },
    'equipmentRows': { type: 'array', idField: 'id' },
    'freeform_entries': { type: 'array', idField: 'id' },
    'photos': { type: 'photos' },
    'generalIssues': { type: 'scalar' },
    'qaqcNotes': { type: 'scalar' },
    'contractorCommunications': { type: 'scalar' },
    'visitorsRemarks': { type: 'scalar' },
    'additionalNotes': { type: 'scalar' },
    'equipment': { type: 'scalar' }
};

window.syncEngine.INTERVIEW_SECTIONS = INTERVIEW_SECTIONS;
```

Add a new function `initSyncBase()`:
```javascript
/**
 * Initialize the base snapshot for three-way merge.
 * Call AFTER IS.report is fully populated (getReport + restoreFromLocalStorage).
 */
function initSyncBase() {
    try {
        window._syncBase = JSON.parse(JSON.stringify(IS.report));
        console.log('[SYNC] Base snapshot initialized');
    } catch (e) {
        console.warn('[SYNC] Failed to init base snapshot:', e);
        window._syncBase = {};
    }
}
window.initSyncBase = initSyncBase;
```

Add `_applyInterviewMerge`:
```javascript
/**
 * Apply merge results to IS.report, update IDB, and selectively re-render.
 * Called from _fetchAndMerge in realtime-sync.js.
 */
function applyInterviewMerge(mergeResult) {
    if (!mergeResult || !mergeResult.sectionsUpdated || mergeResult.sectionsUpdated.length === 0) return;

    // 1. Apply merged data to IS.report
    var merged = mergeResult.merged;
    Object.keys(INTERVIEW_SECTIONS).forEach(function(key) {
        if (merged[key] !== undefined) {
            IS.report[key] = merged[key];
        }
    });

    // 2. Update base snapshot
    window._syncBase = JSON.parse(JSON.stringify(IS.report));

    // 3. Save to IDB (silent, no re-broadcast)
    // Temporarily disable backup dirty flag to prevent re-broadcasting our merge
    var wasDirty = _interviewBackupDirty;
    saveToLocalStorage();
    _interviewBackupDirty = wasDirty;  // Restore — don't mark dirty from a merge

    // 4. Toast
    if (typeof showToast === 'function') {
        showToast('📡 Updated from another device', 'info');
    }

    console.log('[SYNC] Interview merge applied, sections:', mergeResult.sectionsUpdated);
    console.log('[SYNC] Conflicts:', mergeResult.conflicts.length);
}
window.applyInterviewMerge = applyInterviewMerge;
```

**`js/interview/main.js`:**

In the `DOMContentLoaded` handler, AFTER the block that restores from localStorage/IDB (after `restoreFromLocalStorage(localDraft);`), add:
```javascript
// Initialize sync base snapshot for three-way merge (must be after all restore)
if (typeof initSyncBase === 'function') initSyncBase();
```

Best location: right before `updateLoadingStatus('Loading project data...');` (approximately after the local draft restoration block).

**`js/shared/realtime-sync.js`:**

In `_fetchAndMerge`, replace the `window.dispatchEvent(new CustomEvent(...))` block with actual merge logic:
```javascript
// Inside _fetchAndMerge, in the .then() handler, replace the CustomEvent dispatch with:

if (isInterview) {
    var remotePageState = result.data.page_state;
    if (!remotePageState || typeof remotePageState !== 'object') return;

    // Get current IS.report (interview state)
    var IS = window.interviewState;
    if (!IS || !IS.report) return;

    if (typeof syncMerge === 'function' && window.syncEngine.INTERVIEW_SECTIONS) {
        var mergeResult = syncMerge(
            window._syncBase || {},
            IS.report,
            remotePageState,
            sectionsHint,
            window.syncEngine.INTERVIEW_SECTIONS
        );
        if (mergeResult.sectionsUpdated.length > 0) {
            console.log('[SYNC-BC] Merge found updates in:', mergeResult.sectionsUpdated);
            if (typeof window.applyInterviewMerge === 'function') {
                window.applyInterviewMerge(mergeResult);
            }
        } else {
            console.log('[SYNC-BC] Merge: no changes needed');
        }
    }
} else {
    // Report page merge — wired in Sprint 9
    console.log('[SYNC-BC] Report merge not yet implemented');
}
```

### Dependencies
- Sprint 5 (`_fetchAndMerge` exists)
- Sprint 7 (`syncMerge` function exists)

### Verification
1. Open `quick-interview.html?reportId=X` on Device A and Device B
2. On Device A, add an entry to any section (e.g., type an issue) → wait 2s for flush
3. On Device B, console should show:
   - `[SYNC-BC] Merge found updates in: ['entries']` (or similar)
   - `[SYNC] Interview merge applied, sections: ['entries']`
   - Toast: "📡 Updated from another device"
4. Verify IS.report on Device B now contains the entry from Device A
5. **Critical test:** Type something on Device B WHILE Device A pushes → Device B should keep its own typing (local wins)

### Risk: MEDIUM
- This is the first sprint that actually MODIFIES `IS.report` from a remote source.
- **Watch for:** The `saveToLocalStorage()` call inside `applyInterviewMerge` will trigger `_markBackupStale()` which starts the backup-dirty cycle. The code temporarily preserves the dirty flag to prevent re-broadcasting, but if `saveReport()` is called separately (e.g., from a timer), it could re-flush. This is acceptable — the data is already converged, so a re-flush just confirms the merged state.
- **Watch for:** If IS.report structure has nested references that `JSON.parse(JSON.stringify())` can't handle (functions, undefined values), the base snapshot could lose them. Audit confirms IS.report is pure data — safe.

---

## Sprint 9: Report Page Merge Wiring

**What it achieves:** Same as Sprint 8 but for the report page. Initializes `_syncBase`, defines `REPORT_SECTIONS`, implements `applyReportMerge`, and wires it into `_fetchAndMerge`.

### Files to modify
1. `js/report/data-loading.js` (init _syncBase after loadReport)
2. `js/report/autosave.js` (add REPORT_SECTIONS, applyReportMerge)
3. `js/shared/realtime-sync.js` (wire report branch in _fetchAndMerge)
4. `js/report/main.js` (call initSyncBase)

### Exact changes

**`js/report/autosave.js`:**

Add after the existing variable declarations at the top:
```javascript
// Section definitions for report page merge engine
var REPORT_SECTIONS = {
    'userEdits': { type: 'object' }
    // Note: activities, operations, equipment are embedded in userEdits as 'activity_<id>' keys
    // Photos are in originalInput, which we don't merge (read-only after AI processing)
};
window.syncEngine.REPORT_SECTIONS = REPORT_SECTIONS;
```

Add `initReportSyncBase` function:
```javascript
function initReportSyncBase() {
    try {
        window._syncBase = {
            userEdits: JSON.parse(JSON.stringify(RS.userEdits || {}))
        };
        console.log('[SYNC] Report base snapshot initialized');
    } catch (e) {
        console.warn('[SYNC] Failed to init report base snapshot:', e);
        window._syncBase = { userEdits: {} };
    }
}
window.initReportSyncBase = initReportSyncBase;
```

Add `applyReportMerge`:
```javascript
function applyReportMerge(remoteData) {
    if (!remoteData) return;

    var remoteUserEdits = remoteData.user_edits || {};
    var baseEdits = (window._syncBase && window._syncBase.userEdits) || {};

    // Field-level merge of userEdits
    var mergeResult = window.syncMergeUtils
        ? window.syncMergeUtils.mergeObjects(baseEdits, RS.userEdits, remoteUserEdits)
        : { merged: RS.userEdits, conflicts: [] };

    if (window.syncMergeUtils && window.syncMergeUtils.deepEqual(RS.userEdits, mergeResult.merged)) {
        console.log('[SYNC] Report merge: no changes needed');
        return;
    }

    // Apply merged userEdits
    RS.userEdits = mergeResult.merged;
    RS.report.userEdits = RS.userEdits;

    // Update base snapshot
    window._syncBase = { userEdits: JSON.parse(JSON.stringify(RS.userEdits)) };

    // Update AI-generated content if remote has newer (rare — only on re-refine)
    if (remoteData.ai_generated && !window.syncMergeUtils.deepEqual(RS.report.aiGenerated, remoteData.ai_generated)) {
        RS.report.aiGenerated = remoteData.ai_generated;
    }

    // Re-populate form fields
    if (typeof populateAllFields === 'function') {
        populateAllFields();
    }

    // Save to IDB silently (don't re-trigger cloud backup)
    var wasDirty = _reportBackupDirty;
    saveReportToLocalStorage();
    _reportBackupDirty = wasDirty;

    // Toast
    if (typeof showToast === 'function') {
        showToast('📡 Updated from another device', 'info');
    }

    console.log('[SYNC] Report merge applied, conflicts:', mergeResult.conflicts.length);
}
window.applyReportMerge = applyReportMerge;
```

**`js/report/main.js`:**

In the `DOMContentLoaded` handler, after `setupAutoSave();`, add:
```javascript
// Initialize sync base snapshot for three-way merge
if (typeof initReportSyncBase === 'function') initReportSyncBase();
```

**`js/shared/realtime-sync.js`:**

In `_fetchAndMerge`, replace the `else` branch (`// Report page merge — wired in Sprint 9`) with:
```javascript
} else {
    // Report page merge
    if (typeof window.applyReportMerge === 'function') {
        window.applyReportMerge(result.data);
    }
}
```

### Dependencies
- Sprint 5, Sprint 7, Sprint 8

### Verification
1. Open `report.html?reportId=X` on two devices
2. On Device A, edit the issues text field → wait 5s for flush
3. Device B should show toast and the issues field should update
4. Edit DIFFERENT fields on both devices simultaneously → both edits should survive
5. Edit the SAME field → the person who typed last keeps their version

### Risk: MEDIUM
- `populateAllFields()` is a heavy re-render (rebuilds all form fields, contractor cards, etc.). This could cause a flash if the user is on the report page.
- **Future improvement (Sprint 11):** Selective field update instead of full `populateAllFields()`. For now, this is the simplest correct approach and the report page has fewer concurrent editors than the interview page.

---

## Sprint 10: Interview Page Selective UI Re-rendering

**What it achieves:** Enhances `applyInterviewMerge` to selectively re-render only changed sections, respecting focused fields (don't disrupt active input).

### Files to modify
1. `js/interview/persistence.js` (enhance applyInterviewMerge)
2. CSS (add sync-flash animation — inline in quick-interview.html OR a shared CSS file)

### Exact changes

**`js/interview/persistence.js`:**

Replace the existing `applyInterviewMerge` function with an enhanced version:
```javascript
function applyInterviewMerge(mergeResult) {
    if (!mergeResult || !mergeResult.sectionsUpdated || mergeResult.sectionsUpdated.length === 0) return;

    var merged = mergeResult.merged;

    // 1. Apply merged data to IS.report
    Object.keys(INTERVIEW_SECTIONS).forEach(function(key) {
        if (merged[key] !== undefined) {
            IS.report[key] = merged[key];
        }
    });

    // 2. Update base snapshot
    window._syncBase = JSON.parse(JSON.stringify(IS.report));

    // 3. Selective UI re-render
    var needsPreviewUpdate = false;
    var needsProgressUpdate = false;

    mergeResult.sectionsUpdated.forEach(function(section) {
        switch (section) {
            case 'overview':
                // Update weather display if site-conditions input not focused
                var siteInput = document.getElementById('site-conditions-input');
                if (!siteInput || document.activeElement !== siteInput) {
                    if (typeof updateWeatherDisplay === 'function') updateWeatherDisplay();
                }
                needsPreviewUpdate = true;
                break;

            case 'entries':
                // Re-render sections that aren't actively being edited
                if (typeof renderSection === 'function') {
                    ['issues', 'safety', 'communications', 'qaqc', 'visitors'].forEach(function(s) {
                        var input = document.getElementById(s + '-input');
                        if (!input || document.activeElement !== input) {
                            renderSection(s);
                        }
                    });
                    renderSection('activities');
                }
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            case 'activities':
                if (typeof renderSection === 'function') {
                    if (!document.querySelector('textarea[id^="work-input-"]:focus')) {
                        renderSection('activities');
                    }
                }
                needsPreviewUpdate = true;
                break;

            case 'operations':
                if (typeof renderSection === 'function') {
                    if (!document.querySelector('.personnel-count-input:focus')) {
                        renderSection('personnel');
                    }
                }
                needsPreviewUpdate = true;
                break;

            case 'toggleStates':
                if (typeof renderSection === 'function') {
                    ['communications', 'qaqc', 'visitors', 'personnel'].forEach(function(s) {
                        renderSection(s);
                    });
                }
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            case 'photos':
                if (typeof renderSection === 'function') renderSection('photos');
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            case 'safety':
                if (typeof renderSection === 'function') {
                    var safetyInput = document.getElementById('safety-input');
                    if (!safetyInput || document.activeElement !== safetyInput) {
                        renderSection('safety');
                    }
                }
                needsPreviewUpdate = true;
                break;

            case 'equipmentRows':
            case 'equipment':
                if (typeof renderSection === 'function') renderSection('equipment');
                needsPreviewUpdate = true;
                break;

            case 'freeform_entries':
                if (typeof renderFreeformEntries === 'function') {
                    if (!document.querySelector('.freeform-entry-textarea:focus')) {
                        renderFreeformEntries();
                    }
                }
                needsPreviewUpdate = true;
                break;

            case 'meta':
                needsProgressUpdate = true;
                break;
        }
    });

    if (needsPreviewUpdate && typeof updateAllPreviews === 'function') updateAllPreviews();
    if (needsProgressUpdate && typeof updateProgress === 'function') updateProgress();

    // 4. Save to IDB (silent, no re-broadcast)
    var wasDirty = _interviewBackupDirty;
    saveToLocalStorage();
    _interviewBackupDirty = wasDirty;

    // 5. Toast (rate-limited)
    _showSyncToast(mergeResult);

    console.log('[SYNC] Interview merge applied, sections:', mergeResult.sectionsUpdated);
}
window.applyInterviewMerge = applyInterviewMerge;
```

Add rate-limited toast helper:
```javascript
var _lastSyncToastAt = 0;
function _showSyncToast(mergeResult) {
    var now = Date.now();
    if (now - _lastSyncToastAt < 5000) return;  // Max 1 toast per 5s
    _lastSyncToastAt = now;

    var msg = '📡 Updated from another device';
    if (mergeResult.conflicts && mergeResult.conflicts.length > 0) {
        msg = '⚡ Sync conflict — your edits kept';
    }
    if (typeof showToast === 'function') showToast(msg, 'info');
}
```

**CSS (add to `quick-interview.html` `<style>` block, or a shared CSS file):**
```css
.sync-flash {
    animation: syncPulse 1.5s ease-out;
}
@keyframes syncPulse {
    0% { background-color: rgba(99, 102, 241, 0.15); }
    100% { background-color: transparent; }
}
```

### Dependencies
- Sprint 8 (applyInterviewMerge exists and is wired)

### Verification
1. Two devices on `quick-interview.html?reportId=X`
2. Device A adds a safety note → Device B's safety section updates without page reload
3. Device B is typing in the issues textarea → Device A adds a safety note → Device B's issues textarea is NOT disrupted, but safety section updates
4. Toast appears on Device B, but NOT if another toast appeared <5s ago
5. Both devices editing different contractors → both changes survive

### Risk: MEDIUM
- Calls to `renderSection()` are already used throughout the app, so they're battle-tested.
- **Watch for:** `renderSection('activities')` calls `renderContractorWorkCards()` which re-initializes auto-save listeners. After a remote merge, the input listeners for contractor work textareas will be re-attached. The `textarea.dataset.autoSaveInit` guard prevents double-init, but verify this works correctly.
- **Watch for:** `initAllGuidedAutoSave()` is NOT called during re-render — only `renderSection`. This is correct because auto-save init happens once and uses event delegation.

---

## Sprint 11: Report Page Selective Field Updates

**What it achieves:** Enhances `applyReportMerge` to update individual DOM fields instead of calling `populateAllFields()`. Respects focused fields with deferred updates on blur.

### Files to modify
1. `js/report/autosave.js` (enhance applyReportMerge)
2. CSS (add sync-flash to report.html)

### Exact changes

**`js/report/autosave.js`:**

Add deferred update mechanism:
```javascript
var _deferredUpdates = {};  // { fieldId: newValue }

function _deferFieldUpdate(fieldId, value) {
    _deferredUpdates[fieldId] = value;
    var el = document.getElementById(fieldId);
    if (el && !el._syncBlurListener) {
        el.addEventListener('blur', function onBlur() {
            if (_deferredUpdates[fieldId] !== undefined) {
                el.value = _deferredUpdates[fieldId];
                delete _deferredUpdates[fieldId];
                el.classList.add('sync-flash');
                setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
            }
            el._syncBlurListener = false;
        }, { once: true });
        el._syncBlurListener = true;
    }
}
```

Replace `applyReportMerge` with enhanced version:
```javascript
function applyReportMerge(remoteData) {
    if (!remoteData) return;

    var remoteUserEdits = remoteData.user_edits || {};
    var baseEdits = (window._syncBase && window._syncBase.userEdits) || {};

    var mergeResult = window.syncMergeUtils
        ? window.syncMergeUtils.mergeObjects(baseEdits, RS.userEdits, remoteUserEdits)
        : { merged: RS.userEdits, conflicts: [] };

    if (window.syncMergeUtils && window.syncMergeUtils.deepEqual(RS.userEdits, mergeResult.merged)) {
        console.log('[SYNC] Report merge: no changes needed');
        return;
    }

    // Determine which keys actually changed
    var changedKeys = [];
    var newEdits = mergeResult.merged;
    Object.keys(newEdits).forEach(function(key) {
        if (!window.syncMergeUtils.deepEqual(RS.userEdits[key], newEdits[key])) {
            changedKeys.push(key);
        }
    });

    // Apply merged userEdits
    RS.userEdits = mergeResult.merged;
    RS.report.userEdits = RS.userEdits;

    // Update base snapshot
    window._syncBase = { userEdits: JSON.parse(JSON.stringify(RS.userEdits)) };

    // Update AI-generated content if remote has newer
    if (remoteData.ai_generated && !window.syncMergeUtils.deepEqual(RS.report.aiGenerated, remoteData.ai_generated)) {
        RS.report.aiGenerated = remoteData.ai_generated;
    }

    // Selectively update DOM fields
    var hasContractorChanges = false;
    var hasPersonnelChanges = false;

    changedKeys.forEach(function(key) {
        if (key.indexOf('activity_') === 0) {
            hasContractorChanges = true;
            return;
        }
        if (key.indexOf('operations_') === 0) {
            hasPersonnelChanges = true;
            return;
        }

        // Standard field mapping
        var fieldId = typeof pathToFieldId === 'function' ? pathToFieldId(key) : key;
        var el = document.getElementById(fieldId);
        if (!el) return;

        if (document.activeElement === el) {
            _deferFieldUpdate(fieldId, newEdits[key]);
        } else {
            el.value = newEdits[key];
            el.classList.add('sync-flash');
            setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
        }
    });

    // Re-render dynamic sections if needed
    if (hasContractorChanges && typeof renderWorkSummary === 'function') {
        if (!document.querySelector('.contractor-narrative:focus')) {
            renderWorkSummary();
        }
    }
    if (hasPersonnelChanges && typeof renderPersonnelTable === 'function') {
        if (!document.querySelector('.personnel-input:focus')) {
            renderPersonnelTable();
        }
    }

    // Mark user-edited fields
    if (typeof markUserEditedFields === 'function') markUserEditedFields();

    // Save to IDB silently
    var wasDirty = _reportBackupDirty;
    saveReportToLocalStorage();
    _reportBackupDirty = wasDirty;

    // Toast (rate-limited)
    var now = Date.now();
    if (!window._lastReportSyncToast || now - window._lastReportSyncToast > 5000) {
        window._lastReportSyncToast = now;
        if (typeof showToast === 'function') showToast('📡 Updated from another device', 'info');
    }

    console.log('[SYNC] Report merge applied, changed keys:', changedKeys);
}
window.applyReportMerge = applyReportMerge;
```

**CSS (add to `report.html` `<style>` block):**
```css
.sync-flash {
    animation: syncPulse 1.5s ease-out;
}
@keyframes syncPulse {
    0% { background-color: rgba(99, 102, 241, 0.15); }
    100% { background-color: transparent; }
}
```

### Dependencies
- Sprint 9 (report merge exists and is wired)

### Verification
1. Two devices on `report.html?reportId=X`
2. Device A edits `issuesText` → Device B sees the field update with a purple flash
3. Device B is typing in `weatherJobSite` → Device A edits `issuesText` → B's weather field is NOT disrupted, but issues updates
4. Device B finishes typing and blurs the weather field → deferred update applies with flash
5. Both devices edit different contractor narratives → both survive

### Risk: MEDIUM
- **Watch for:** `renderWorkSummary()` reinitializes contractor event listeners via `setupContractorListeners()`. After re-render, any in-progress typing state in contractor textareas is lost. The guard `!document.querySelector('.contractor-narrative:focus')` prevents this during active typing.
- **Watch for:** `pathToFieldId()` only maps known paths. If a userEdit key doesn't match (e.g., custom contractor keys like `activity_<id>`), it falls through to the dynamic section handling.

---

## Sprint 12: Dashboard Live Updates

**What it achieves:** On `index.html`, listens for broadcast signals (via existing `postgres_changes`) and performs targeted card updates instead of full re-renders. Optional: adds a dashboard-specific broadcast channel.

### Files to modify
1. `js/index/report-cards.js`
2. `js/shared/realtime-sync.js`

### Exact changes

**`js/shared/realtime-sync.js`:**

In `initRealtimeSync()`, add a dashboard broadcast channel subscription:
```javascript
// --- Dashboard broadcast channel ---
var path = window.location.pathname;
if (path.indexOf('index.html') !== -1 || path === '/' || path.endsWith('/')) {
    var dashboardUserId = userId;
    var dashboardChannel = supabaseClient
        .channel('dashboard:' + dashboardUserId)
        .on('broadcast', { event: 'report_status_change' }, function(payload) {
            console.log('[DASH-BC] Status change:', payload);
            if (typeof window._handleDashboardBroadcast === 'function') {
                window._handleDashboardBroadcast(payload.payload);
            }
        })
        .subscribe(function(status) {
            console.log('[DASH-BC] dashboard:' + dashboardUserId + ' status:', status);
        });
    _realtimeChannels.push(dashboardChannel);
}
```

**Also**: In the outbound broadcast helpers (Sprint 3/4's code in `persistence.js` and `autosave.js`), add a dashboard broadcast. Add to the end of `_broadcastSyncUpdate`:
```javascript
// Also notify dashboard channel
var dashUserId = typeof getStorageItem === 'function' ? getStorageItem(STORAGE_KEYS.USER_ID) : null;
if (dashUserId) {
    var dashChannel = _realtimeChannels.find(function(ch) {
        return ch.topic === 'realtime:dashboard:' + dashUserId;
    });
    // Dashboard channel may not exist on edit pages; that's fine — other tabs on index.html will hear it
    // Instead, broadcast to a channel we create transiently
    try {
        supabaseClient.channel('dashboard:' + dashUserId).send({
            type: 'broadcast',
            event: 'report_status_change',
            payload: {
                type: 'report_status_change',
                report_id: reportId,
                updated_at: new Date().toISOString()
            }
        });
    } catch (e) { /* ignore */ }
}
```

**Actually, simpler approach:** The existing `postgres_changes` subscription on `reports` table already triggers `_handleReportChange` → `renderReportCards()`. The dashboard already gets live updates. The improvement is to make the re-render faster (targeted card update). Let's focus on that instead of adding another broadcast channel.

**Revised approach — `js/index/report-cards.js`:**

Add a targeted card update function:
```javascript
/**
 * Update a single report card's status without full re-render.
 * Falls back to full re-render if card not found.
 */
function updateReportCardStatus(reportId, newData) {
    var wrapper = document.querySelector('.swipe-card-wrapper[data-report-id="' + reportId + '"]');
    if (!wrapper) {
        // Card not found — might be a new report, do full re-render
        renderReportCards();
        return;
    }

    // Update the "Edited" timestamp
    var timeEls = wrapper.querySelectorAll('.fa-pencil');
    if (timeEls.length > 0) {
        var timeSpan = timeEls[0].closest('span');
        if (timeSpan) timeSpan.innerHTML = '<i class="fas fa-pencil text-[9px] mr-1"></i>Edited Just now';
    }

    // Flash the card to indicate update
    var content = wrapper.querySelector('.swipe-card-content');
    if (content) {
        content.classList.add('sync-flash');
        setTimeout(function() { content.classList.remove('sync-flash'); }, 1500);
    }
}
window.updateReportCardStatus = updateReportCardStatus;
```

**`js/shared/realtime-sync.js`:**

In `_handleReportChange`, add a targeted update call BEFORE the full `renderReportCards()`:
Find the line `if (typeof window.renderReportCards === 'function') { window.renderReportCards(); }` at the end of `_handleReportChange` and replace with:
```javascript
if (typeof window.updateReportCardStatus === 'function' && payload.new) {
    window.updateReportCardStatus(payload.new.id, payload.new);
} else if (typeof window.renderReportCards === 'function') {
    window.renderReportCards();
}
```

### Dependencies
- Sprint 2 (broadcast infrastructure in place)

### Verification
1. Open `index.html` in one tab, `quick-interview.html?reportId=X` in another
2. Edit in the interview tab → after 2s flush, the dashboard card for that report should flash and update its "Edited" timestamp
3. No full page re-render visible (smooth update)

### Risk: LOW
- The fallback is full `renderReportCards()` which is the current behavior. We're only adding an optimization layer on top.

---

## Sprint 13: Offline→Online Full Sync Cycle

**What it achieves:** Ensures the full offline→online recovery path works: drain pending backups, flush current state, fetch remote state, merge.

### Files to modify
1. `js/shared/realtime-sync.js` (add `online` handler enhancement)

### Exact changes

**`js/shared/realtime-sync.js`:**

Replace the existing `online` event handler:
```javascript
window.addEventListener('online', function() {
    console.log('[REALTIME] Back online — re-subscribing');
    initRealtimeSync();
});
```
with:
```javascript
window.addEventListener('online', function() {
    console.log('[REALTIME] Back online — full sync cycle');

    // 1. Re-init realtime subscriptions
    initRealtimeSync();

    // 2. Flush current state immediately (interview or report)
    var path = window.location.pathname;
    if (path.indexOf('quick-interview') !== -1 && typeof flushInterviewBackup === 'function') {
        flushInterviewBackup();
    }
    if (path.indexOf('report.html') !== -1 && typeof flushReportBackup === 'function') {
        flushReportBackup();
    }

    // 3. Drain any pending backups from IDB queue
    if (typeof drainPendingBackups === 'function') drainPendingBackups();

    // 4. Fetch remote state and merge (may have missed changes while offline)
    var reportId = new URLSearchParams(window.location.search).get('reportId');
    if (reportId) {
        var isInterview = path.indexOf('quick-interview') !== -1;
        var isReport = path.indexOf('report.html') !== -1;
        if (isInterview || isReport) {
            setTimeout(function() {
                _fetchAndMerge(reportId, [], isInterview);
            }, 2000);  // 2s delay: let flush complete first
        }
    }
});
```

Also remove the duplicate `offline` handler if there's one that conflicts:
The existing `offline` handler is:
```javascript
window.addEventListener('offline', function() {
    console.log('[REALTIME] Went offline — cleaning up');
    cleanupRealtimeSync();
});
```
This is correct and stays.

### Dependencies
- Sprint 5 (`_fetchAndMerge` exists)

### Verification
1. Open `quick-interview.html?reportId=X` on Device A and Device B
2. Put Device B in airplane mode
3. Make edits on both devices
4. Turn off airplane mode on Device B
5. Console should show full sync cycle: flush → drain → fetch → merge
6. Both devices should converge to the merged state

### Risk: LOW
- Enhancement of existing handler. The `flushInterviewBackup` / `flushReportBackup` calls are already safe to call multiple times (dirty-flag guards).

---

# Deliverable 2: Risk Assessment

## R1: SYN-02 Guard — Does it need updating?

**No.** The SYN-02 guard in `_handleReportChange` and `_handleReportDataChange` blocks `postgres_changes` from overwriting the actively-edited report. This is correct behavior — `postgres_changes` sends lightweight metadata updates (status, dates) that could clobber local state.

The new broadcast channel (`_handleSyncBroadcast`) is a **completely separate code path**. It does its own REST fetch and three-way merge, which is safe for the active report. SYN-02 does not and should not block broadcast-based updates.

## R2: Existing BroadcastChannel (`broadcast.js`) — Will it conflict?

**No.** `broadcast.js` uses the **browser BroadcastChannel API** (`new BroadcastChannel('fieldvoice-sync')`), which is a same-origin, same-device, tab-to-tab messaging system. It works ONLY within one browser on one device.

The new Supabase Broadcast channel (`supabaseClient.channel('sync:...')`) uses **WebSocket-based messaging** through Supabase's infrastructure, which works cross-device.

- They use different underlying technologies (BroadcastChannel API vs WebSocket)
- They use different naming (`fieldvoice-sync` vs `sync:{reportId}`)
- They serve different purposes (same-device tab sync vs cross-device sync)
- **Zero chance of interference.**

The existing `window.fvpBroadcast.send()` calls throughout the codebase will continue to work for same-device tab communication (e.g., dashboard tab refreshing when another tab saves). The new Supabase Broadcast adds the cross-device layer on top.

## R3: Supabase Connection Limits

**Supabase Realtime** uses WebSocket multiplexing — one WebSocket per client, multiple channels on that connection.

Current channels per page:
- `reports-sync` (postgres_changes on `reports` + `report_data`)
- `projects-sync` (postgres_changes on `projects`)
- **New:** `sync:{reportId}` (broadcast, only on edit pages)

Total: 3 channels per tab. Supabase free tier supports 200 concurrent connections, pro tier 500. Each browser tab uses 1 WebSocket connection with 2-3 channels. **Safe up to ~60 concurrent tabs across all users.**

**Dashboard broadcast channel (Sprint 12):** If we add `dashboard:{userId}`, that's 1 more channel on `index.html`. Still safe.

## R4: Lifecycle Handler Conflicts

### Existing handlers and new additions:

| Event | `realtime-sync.js` (existing) | `interview/main.js` (existing) | `report/main.js` (existing) | New additions |
|-------|------|------|------|------|
| `visibilitychange→hidden` | `cleanupRealtimeSync()` | `saveToLocalStorage(); flushInterviewBackup()` | `saveReportToLocalStorage(); flushReportBackup()` | None |
| `visibilitychange→visible` | `initRealtimeSync()` | (none) | (none) | `_fetchAndMerge()` with 1.5s delay |
| `pagehide` | (none — uses `beforeunload`) | `saveToLocalStorage(); flushInterviewBackup()` | `saveReportToLocalStorage(); flushReportBackup()` | None |
| `pageshow (persisted)` | (none) | `drainPendingBackups()` | (none) | `initRealtimeSync(); _fetchAndMerge(); drainPendingBackups()` |
| `online` | `initRealtimeSync()` | `drainPendingBackups()` | (none) | `flush; drain; _fetchAndMerge()` |
| `offline` | `cleanupRealtimeSync()` | (none) | (none) | None |
| `beforeunload` | `cleanupRealtimeSync()` | (none) | (none) | None |

**Coordination concerns:**
1. **`visibilitychange→visible`:** `realtime-sync.js` calls `initRealtimeSync()` after 1s, then `_fetchAndMerge()` after 1.5s. This ensures the broadcast channel is re-established before the fetch. ✅
2. **`visibilitychange→hidden` + page saves:** Both `main.js` files save on hidden. `realtime-sync.js` tears down channels. No conflict — saves are synchronous/fire-and-forget, channel teardown is separate. ✅
3. **`pageshow` duplication:** Interview `main.js` already calls `drainPendingBackups()` on `pageshow`. The new handler in `realtime-sync.js` also calls it. `drainPendingBackups()` is safe to call multiple times — it checks the stale flag before doing work. ✅
4. **`online` duplication:** Interview `main.js` calls `drainPendingBackups()` on online. The enhanced handler in `realtime-sync.js` also calls it, plus adds flush + fetch. Safe — duplicate drain calls are no-ops. ✅

## R5: Race Conditions Between Save Cycles and Broadcast

**Scenario:** `saveReport()` triggers local IDB save (500ms debounce) → triggers `flushInterviewBackup()` (2s debounce) → triggers broadcast. Meanwhile, a broadcast arrives from another device.

**Timeline analysis:**
```
T+0ms:     User types
T+500ms:   saveToLocalStorage() runs → IDB write
T+2000ms:  flushInterviewBackup() runs → Supabase upsert
T+2100ms:  Broadcast sent to other devices
T+2600ms:  Other device receives broadcast → waits 500-800ms
T+3200ms:  Other device fetches from Supabase → gets the data from T+2000ms ✅
```

**Race risk:** If Device A starts a flush at T+2000 and Device B's broadcast-triggered fetch arrives at T+2500 (before A's upsert completes), B will get stale data. **Mitigation:** The 500-800ms jitter delay gives the upsert time to complete. If B still gets stale data, the staleness check (`_lastMergeAt`) will reject it, and the next broadcast will pick it up. **Acceptable.**

**Merge-save-broadcast loop prevention:** When `applyInterviewMerge` saves to IDB via `saveToLocalStorage()`, it calls `_markBackupStale()` which starts the backup dirty cycle. However, the code preserves the `_interviewBackupDirty` flag to prevent re-flushing from a merge. If the user ALSO makes a local edit during a merge, the dirty flag will be set independently and the next flush will include both local edits and merged remote data — this is correct behavior.

## R6: Global State That Could Be Clobbered

| Global | Risk | Mitigation |
|--------|------|-----------|
| `window._syncBase` | Could be clobbered if two merges run simultaneously | `_fetchMergePending` flag prevents concurrent fetches |
| `window._lastMergeAt` | Could be stale if clock skew between devices | Uses Supabase server timestamps (`updated_at`), not local clocks |
| `IS.report` | Direct mutation during merge | Merge is atomic — all sections applied together, then one IDB save |
| `RS.userEdits` | Direct mutation during merge | Same — atomic merge + single IDB save |
| `window.syncEngine` | Multiple files attach properties | `Object.assign` pattern preserves existing properties |
| `_interviewBackupDirty` | Merge could trigger unwanted re-flush | Preserved/restored during merge apply |
| `_reportBackupDirty` | Same | Preserved/restored during merge apply |

## R7: Additional Risks

1. **Supabase Broadcast 1MB payload limit:** Our broadcast payload is ~200 bytes (signal only, no content). **No risk.**

2. **Supabase Realtime reconnection:** When `initRealtimeSync()` is called after visibility change, it calls `cleanupRealtimeSync()` first, which removes all channels. New channels are created. There's a brief window (1-2s) where no channels are active. Broadcasts during this window are missed. **Mitigation:** The unconditional REST fetch on visibility change catches missed broadcasts.

3. **JSON deep-clone limitations:** `JSON.parse(JSON.stringify())` strips `undefined` values, functions, and special types. `IS.report` and `RS.report` are confirmed to be pure JSON-serializable data. **No risk.**

4. **IDB write failures during merge:** If `saveToLocalStorage()` fails inside `applyInterviewMerge()`, the in-memory state has been updated but IDB hasn't. On next page load, data from the last successful IDB write will be loaded, losing the merge. **Low risk** — IDB writes almost never fail, and the next broadcast cycle would re-merge.

---

# Deliverable 3: Dependency Graph

```
Sprint 1: Session ID Export
    │
    ├──→ Sprint 2: Broadcast Channel Join/Leave
    │       │
    │       ├──→ Sprint 3: Outbound Broadcast (Interview)
    │       │       │
    │       │       └──→ Sprint 4: Outbound Broadcast (Report)
    │       │
    │       ├──→ Sprint 5: Inbound Fetch-on-Broadcast
    │       │       │
    │       │       ├──→ Sprint 6: Visibility/Lifecycle Handlers
    │       │       │
    │       │       └──→ Sprint 8: Interview Merge Wiring ←── Sprint 7
    │       │               │
    │       │               ├──→ Sprint 9: Report Merge Wiring
    │       │               │       │
    │       │               │       └──→ Sprint 11: Report Selective UI
    │       │               │
    │       │               └──→ Sprint 10: Interview Selective UI
    │       │
    │       └──→ Sprint 12: Dashboard Live Updates (independent)
    │
    └──→ Sprint 13: Offline→Online Sync ←── Sprint 5

Sprint 7: Merge Engine (pure functions, no deps)
    │
    └──→ Sprint 8 (above)
```

### Critical Path
```
1 → 2 → 3 → 5 → 8 → 10
              ↗         ↗
         7 ──┘    ────┘
```

**Minimum to "hear each other":** Sprints 1-5 (5 sprints)  
**Minimum to "sync state":** Sprints 1-5 + 7-8 (7 sprints)  
**Full experience:** All 13 sprints  

### Parallelization Opportunities
- **Sprint 7** (merge engine) can be done in parallel with Sprints 2-5 (broadcast plumbing) since it has no dependencies
- **Sprint 12** (dashboard) can be done in parallel with Sprints 8-11 (merge wiring)
- **Sprint 6** (lifecycle) and **Sprint 13** (offline) can be done in parallel with Sprints 8-11
- **Sprint 10** and **Sprint 11** can be done in parallel (interview UI vs report UI)

### Suggested Execution Order (Serial)
```
Phase A (Plumbing):     1 → 2 → 3 → 4 → 5 → 6
Phase B (Merge):        7 → 8 → 9
Phase C (UI):           10 → 11
Phase D (Polish):       12 → 13
```
