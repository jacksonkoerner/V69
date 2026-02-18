# FieldVoice Pro — Live Sync Design Document

**Version:** 1.0  
**Date:** 2025-07-12  
**Status:** Blueprint (no code changes)

---

## Table of Contents
1. [Overview](#1-overview)
2. [A. Broadcast Layer](#2-a-broadcast-layer)
3. [B. Merge Engine](#3-b-merge-engine)
4. [C. Live UI Re-Rendering](#4-c-live-ui-re-rendering)
5. [D. Dashboard Live Updates](#5-d-dashboard-live-updates)
6. [E. Edge Cases](#6-e-edge-cases)
7. [F. Implementation Order](#7-f-implementation-order)

---

## 1. Overview

### Goal
Enable Google Docs-style live sync: when Device A edits a report, Device B sees changes appear within 1–3 seconds — without losing any local work in progress.

### Architecture Principle
```
Local Edit → IDB (500ms) → Supabase Table (2-5s) → Supabase Broadcast (signal)
                                                          ↓
                                              Other devices hear signal
                                                          ↓
                                              REST fetch (500-800ms delay)
                                                          ↓
                                              Three-way merge → UI update
```

**Realtime = notification only. REST = data transport.** Supabase Realtime strips JSONB >64 bytes, so we never trust Realtime payloads for content — only as "something changed" signals.

### Three Storage Layers

| Layer | Purpose | Latency |
|-------|---------|---------|
| **IDB** | Local cache, survives refresh | 500ms debounce |
| **Supabase Tables** | Cloud truth | 2s (interview) / 5s (report) |
| **Supabase Broadcast** | Cross-device signal | ~100ms |

### Session Identity

Every tab gets a unique `session_id` (already exists as `_syncSessionId` in `persistence.js`):
```
sess_{timestamp}_{random6}
```

Self-filtering uses `session_id`, NOT `device_id`. Reason: two tabs on the same device are separate editors.

---

## 2. A. Broadcast Layer

### Channel Naming

Use **Supabase Broadcast** (WebSocket rooms, no DB round-trip, ~100 msg/sec/channel):

```
Channel: `sync:{report_id}`
```

One channel per report being actively edited. Devices subscribe on page load, unsubscribe on leave.

**Why per-report, not per-user:** A user could have the same report open on multiple devices. Per-report channels mean every editor of that report hears every signal, regardless of user identity.

### Message Format

```javascript
{
  type: 'sync_update',                    // Message type
  session_id: 'sess_1720000000_abc123',   // Sender session (for self-filter)
  report_id: 'uuid-...',                  // Report being edited
  page: 'quick-interview' | 'report',     // Which page sent this
  updated_at: '2025-07-12T14:30:00Z',    // Server-compatible timestamp
  sections_changed: ['entries', 'weather', 'toggleStates'],  // Hint array
  revision: 42                            // Monotonic counter from sender
}
```

**`sections_changed` values** (interview page):
- `entries`, `activities`, `operations`, `equipment`, `equipmentRows`
- `weather`, `overview`, `safety`, `toggleStates`
- `freeform_entries`, `freeform_checklist`
- `photos`, `meta`, `reporter`
- `generalIssues`, `qaqcNotes`, `contractorCommunications`, `visitorsRemarks`, `additionalNotes`

**`sections_changed` values** (report page):
- `userEdits`, `activities`, `operations`, `equipment`, `photos`
- Field path prefixes: `overview.*`, `weather.*`, `signature.*`, `safety.*`

### Join/Leave Lifecycle

**File:** `js/shared/realtime-sync.js` — integrate into existing `initRealtimeSync()`.

```
initRealtimeSync()
  └─ existing postgres_changes subscriptions (keep as-is)
  └─ NEW: if on quick-interview.html or report.html with ?reportId=X
       → join Supabase Broadcast channel `sync:{reportId}`
       → store channel ref in _realtimeChannels[] for cleanup

cleanupRealtimeSync()
  └─ existing cleanup (keep as-is)
  └─ unsubscribes from broadcast channel too (already in _realtimeChannels[])
```

**Subscription code pattern** (to add inside `initRealtimeSync`):

```javascript
// Only join broadcast for edit pages
var reportId = new URLSearchParams(window.location.search).get('reportId');
if (reportId && (path.includes('quick-interview') || path.includes('report.html'))) {
    var syncChannel = supabaseClient
        .channel('sync:' + reportId)
        .on('broadcast', { event: 'sync_update' }, function(payload) {
            _handleSyncBroadcast(payload.payload);
        })
        .subscribe();
    _realtimeChannels.push(syncChannel);
}
```

### Outbound Broadcast

**Interview page** — add to end of `flushInterviewBackup()` in `persistence.js`, AFTER successful Supabase upsert:

```javascript
// After: _clearBackupStale(reportId);
_broadcastSyncUpdate(reportId, sectionsChanged);
```

**Report page** — add to end of `flushReportBackup()` in `report/autosave.js`, AFTER successful upsert:

```javascript
_broadcastSyncUpdate(_autosaveReportId, Object.keys(RS.userEdits));
```

**Shared broadcast helper** (add to `realtime-sync.js`):

```javascript
function _broadcastSyncUpdate(reportId, sectionsChanged) {
    var syncChannel = _realtimeChannels.find(function(ch) {
        return ch.topic === 'realtime:sync:' + reportId;
    });
    if (!syncChannel) return;
    syncChannel.send({
        type: 'broadcast',
        event: 'sync_update',
        payload: {
            type: 'sync_update',
            session_id: _getSessionId(),
            report_id: reportId,
            page: _getCurrentPage(),
            updated_at: new Date().toISOString(),
            sections_changed: sectionsChanged || [],
            revision: _getSyncRevision()
        }
    });
}
```

### Session ID Access

The `_syncSessionId` currently lives in `persistence.js` as a file-local variable. For cross-file access:

**Option:** Add `_getSessionId()` to `window.syncEngine`:
```javascript
window.syncEngine.getSessionId = function() { return _syncSessionId; };
```

For `report.html`, generate a session ID in `data-loading.js`:
```javascript
var _reportSyncSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
window.syncEngine.getSessionId = function() { return _reportSyncSessionId; };
```

---

## 3. B. Merge Engine

### Inbound Processing Flow

```
Broadcast arrives (_handleSyncBroadcast)
    │
    ├─ Filter self: if payload.session_id === own session_id → DISCARD
    │
    ├─ Wait 500-800ms (broadcast arrives before DB commit)
    │   └─ Add jitter: 500 + Math.random() * 300
    │
    ├─ REST fetch latest from Supabase
    │   ├─ Interview: interview_backup.select('page_state, updated_at').eq('report_id', X)
    │   └─ Report: report_data.select('*').eq('report_id', X)
    │
    ├─ Staleness check: if remote.updated_at <= local last_merge_at → DISCARD
    │
    ├─ Three-way merge: merge(base, local, remote) → merged
    │
    ├─ Update base snapshot to remote (for next merge cycle)
    │
    ├─ Apply merged state to in-memory state (IS.report / RS.report)
    │
    └─ Re-render changed UI sections (selective, cursor-safe)
```

**New function** `_handleSyncBroadcast(payload)` in `realtime-sync.js`:

```javascript
function _handleSyncBroadcast(payload) {
    // 1. Self-filter
    if (payload.session_id === window.syncEngine.getSessionId()) return;

    var reportId = payload.report_id;
    var path = window.location.pathname;

    // 2. Determine which page we're on and which fetcher to use
    var isInterview = path.includes('quick-interview');
    var isReport = path.includes('report.html');
    if (!isInterview && !isReport) return;

    // 3. Delayed REST fetch with jitter
    var delay = 500 + Math.floor(Math.random() * 300);
    setTimeout(function() {
        _fetchAndMerge(reportId, payload.sections_changed, isInterview);
    }, delay);
}
```

### Conflict Strategy: Section-Level Last-Write-Wins with Field-Level Precision

**Why not full-document LWW:** Stomps edits. If Device A edits weather while Device B edits safety, full-doc LWW loses one device's work.

**Why not OT/CRDT:** Massive complexity, vanilla JS, construction app users ≤ 3 concurrent editors. Not worth it.

**Chosen strategy: Three-way merge with section-level granularity.**

### Three-Way Merge: Base / Local / Remote

Store three snapshots in memory:

| Snapshot | What it is | Stored where |
|----------|-----------|--------------|
| **Base** | Last known-good state from server (snapshot at time of last merge or page load) | `window._syncBase` (in-memory) |
| **Local** | Current `IS.report` or `RS.report` | Already in memory |
| **Remote** | Freshly fetched from Supabase | Ephemeral (used during merge, then becomes new base) |

**Initialize base on page load:**

- Interview page: after `getReport()` returns and `restoreFromLocalStorage()` runs, deep-clone `IS.report` to `window._syncBase`.
- Report page: after `loadReport()` completes and `populateAllFields()` runs, deep-clone `RS.report` to `window._syncBase`.

```javascript
window._syncBase = JSON.parse(JSON.stringify(IS.report)); // interview
window._syncBase = JSON.parse(JSON.stringify(RS.report)); // report
```

### Merge Algorithm

**New file:** `js/shared/sync-merge.js`

```javascript
/**
 * Three-way section merge.
 * For each section key:
 *   - If local === base (local didn't change) → take remote
 *   - If remote === base (remote didn't change) → keep local
 *   - If both changed:
 *     - For object sections: field-level comparison
 *     - For array sections: last-write-wins by timestamp
 *     - For scalar sections: remote wins (show toast)
 * Returns: { merged: {}, sectionsUpdated: [], conflicts: [] }
 */
function syncMerge(base, local, remote, sectionsHint) { ... }
```

**Section definitions for interview page:**

```javascript
var INTERVIEW_SECTIONS = {
    // Object sections (field-level merge possible)
    'overview': { type: 'object' },
    'weather': { type: 'object', path: 'overview.weather' },
    'safety': { type: 'object' },
    'meta': { type: 'object' },
    'reporter': { type: 'object' },
    'toggleStates': { type: 'object' },
    'freeform_checklist': { type: 'object' },

    // Array sections (element-level merge by ID)
    'entries': { type: 'array', idField: 'id' },
    'activities': { type: 'array', idField: 'contractorId' },
    'operations': { type: 'array', idField: 'contractorId' },
    'equipment': { type: 'array', idField: null },  // no stable ID → LWW
    'equipmentRows': { type: 'array', idField: 'id' },
    'photos': { type: 'array', idField: 'id' },
    'freeform_entries': { type: 'array', idField: 'id' },
    'generalIssues': { type: 'array', idField: null },
    'qaqcNotes': { type: 'array', idField: null },

    // Scalar sections (last-write-wins)
    'contractorCommunications': { type: 'scalar' },
    'visitorsRemarks': { type: 'scalar' },
    'additionalNotes': { type: 'scalar' },
};
```

**Section definitions for report page:**

```javascript
var REPORT_SECTIONS = {
    'userEdits': { type: 'object' },      // Field-level merge by path key
    'activities': { type: 'array', idField: 'contractorId' },
    'operations': { type: 'array', idField: 'contractorId' },
    'equipment': { type: 'array', idField: null },
    'photos': { type: 'array', idField: 'id' },
};
```

### Array Merge Strategy (by ID)

For arrays with stable IDs (entries, activities, photos):

```
For each item in remote:
    if exists in base but not local → deleted locally → skip (keep deletion)
    if not in base → new from remote → add to merged
    if exists in both:
        if local[item] === base[item] → take remote version
        if remote[item] === base[item] → keep local version  
        if both differ → compare timestamps, newer wins
```

For arrays WITHOUT stable IDs (`equipment`, `generalIssues`, `qaqcNotes`): full array last-write-wins by section timestamp.

### What Happens When Both Devices Edit the Same Field?

**Scenario:** Device A and B both edit `overview.weather.jobSiteCondition`.

1. Both start from base value "Dry"
2. Device A sets "Wet" → flushes → broadcasts
3. Device B sets "Muddy" → hasn't flushed yet
4. Device B receives broadcast from A:
   - Base = "Dry", Local = "Muddy", Remote = "Wet"
   - Both changed from base → **conflict**
   - **Local wins** (the person actively typing keeps their work)
   - Toast: "⚡ Conflict: Weather updated on another device. Your version kept."
   - Store remote value in `_syncConflicts[]` for optional review

5. When Device B flushes, it overwrites A's value.
6. Device A then receives B's update, and since A hasn't changed it again, remote wins → A sees "Muddy".

**Net effect:** The last person to stop typing wins. Both devices converge. No data loss — just a brief moment of divergence.

---

## 4. C. Live UI Re-Rendering

### Golden Rule: Never Disrupt Active Input

```javascript
function _isFieldActive(elementOrId) {
    var el = typeof elementOrId === 'string' 
        ? document.getElementById(elementOrId) 
        : elementOrId;
    return el && document.activeElement === el;
}
```

If a field is focused (user is typing), **skip updating it**. Queue the remote value and apply on blur.

### Deferred Update Queue

```javascript
// Per-field deferred updates: apply when field loses focus
var _deferredUpdates = {};  // { fieldId: newValue }

function _deferUpdate(fieldId, value) {
    _deferredUpdates[fieldId] = value;
    var el = document.getElementById(fieldId);
    if (el && !el._syncBlurListener) {
        el.addEventListener('blur', function onBlur() {
            if (_deferredUpdates[fieldId] !== undefined) {
                el.value = _deferredUpdates[fieldId];
                delete _deferredUpdates[fieldId];
                // Subtle flash to indicate change
                el.classList.add('sync-flash');
                setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
            }
        }, { once: true });
        el._syncBlurListener = true;
    }
}
```

### CSS for Visual Feedback

```css
/* Add to main stylesheet */
.sync-flash {
    animation: syncPulse 1.5s ease-out;
}

@keyframes syncPulse {
    0% { background-color: rgba(99, 102, 241, 0.15); }
    100% { background-color: transparent; }
}
```

### Toast Notification

Use existing `showToast()`:
```javascript
showToast('📡 Updated from another device', 'info');
```

Show once per merge cycle, not per field. Rate-limit: max 1 toast per 5 seconds.

---

### 4.1 Quick Interview Page (`quick-interview.html`)

**State:** `IS.report` (window.interviewState.report)

**Merge application function:** `_applyInterviewMerge(merged, sectionsUpdated)`

| Section | DOM Target | Update Method | Active-Field Handling |
|---------|-----------|---------------|----------------------|
| `overview.weather` | `#weather-condition`, `#weather-temp`, `#weather-precip`, `#site-conditions-input` | `updateWeatherDisplay()` | Defer `#site-conditions-input` if focused |
| `entries` | Various section containers (issues, safety, comms, qaqc, visitors) | `renderSection(sectionName)` per affected section | Skip re-render if user is editing an entry textarea (`#edit-textarea-{id}`) |
| `activities` | `#activities-section` inner content | `renderContractorWorkCards()` | Skip if any `work-input-*` textarea is focused |
| `operations` | Personnel cards | `renderPersonnelCards()` | Skip if any `.personnel-count-input` is focused |
| `equipmentRows` | Equipment list | `renderSection('equipment')` | Skip if any equipment input is focused |
| `toggleStates` | Toggle button pairs | Update CSS classes on buttons + re-render affected section | Always safe (buttons, not text inputs) |
| `photos` | Photo grid | `renderSection('photos')` | Always safe (no text input in grid) |
| `safety` | `#no-incidents`, `#has-incidents` checkboxes + notes | `renderSection('safety')` | Skip if `#safety-input` is focused |
| `freeform_entries` | Freeform entries container | `renderFreeformEntries()` (existing) | Skip if any freeform textarea is focused |
| `meta` | Progress bar, status icons | `updateProgress(); updateStatusIcons()` | Always safe |

**Re-render flow:**

```javascript
function _applyInterviewMerge(merged, sectionsUpdated) {
    // 1. Update IS.report with merged data
    Object.assign(IS.report, merged);

    // 2. Update base snapshot
    window._syncBase = JSON.parse(JSON.stringify(IS.report));

    // 3. Selective UI update based on sectionsUpdated
    var needsPreviewUpdate = false;
    var needsProgressUpdate = false;

    sectionsUpdated.forEach(function(section) {
        switch (section) {
            case 'weather':
            case 'overview':
                if (!_isFieldActive('site-conditions-input')) {
                    updateWeatherDisplay();
                } else {
                    _deferUpdate('site-conditions-input', IS.report.overview.weather.jobSiteCondition);
                }
                needsPreviewUpdate = true;
                break;

            case 'entries':
                // Determine which entry sections changed
                var affectedSections = _getAffectedEntrySections(merged.entries);
                affectedSections.forEach(function(s) {
                    if (!_isSectionInputFocused(s)) {
                        renderSection(s);
                    }
                });
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            case 'activities':
                if (!_isAnyContractorWorkInputFocused()) {
                    renderContractorWorkCards();
                }
                needsPreviewUpdate = true;
                break;

            case 'toggleStates':
                // Re-render all sections that have toggles
                ['communications', 'qaqc', 'visitors', 'personnel'].forEach(function(s) {
                    renderSection(s);
                });
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            case 'photos':
                renderSection('photos');
                needsPreviewUpdate = true;
                needsProgressUpdate = true;
                break;

            // ... etc for each section
        }
    });

    if (needsPreviewUpdate) updateAllPreviews();
    if (needsProgressUpdate) updateProgress();

    // 4. Save merged state to IDB (don't re-trigger cloud backup)
    saveToLocalStorage();  // IDB only, no broadcast
}
```

**Page-specific challenges:**

1. **Dynamic entry lists:** Entries are rendered as cards with delete/edit buttons. A remote add/delete of an entry can shift DOM positions. Solution: use `data-entry-id` attributes for stable targeting; only re-render the specific section container, not the whole page.

2. **Contractor work textareas:** Each contractor has a `work-input-{contractorId}` textarea with autosave. If user is typing in one contractor's textarea, remote updates to OTHER contractors still render immediately.

3. **Toggle state locks:** Toggles lock after selection. If remote sends a toggle change, check `isToggleLocked()` — if already locked locally, skip (local wins since they were first from user's perspective). If not locked locally, apply remote toggle.

4. **Photo grid:** Photos are append-only during drafting. Remote photo additions simply call `renderSection('photos')`. No conflict possible (photos have unique IDs).

**Helper to detect focused inputs in a section:**

```javascript
function _isAnyContractorWorkInputFocused() {
    return !!document.querySelector('textarea[id^="work-input-"]:focus');
}

function _isSectionInputFocused(sectionName) {
    var input = document.getElementById(sectionName + '-input');
    return input && document.activeElement === input;
}
```

---

### 4.2 Report Page (`report.html`)

**State:** `RS.report` + `RS.userEdits`

**Merge application function:** `_applyReportMerge(remoteData, sectionsHint)`

The report page is simpler because most fields are flat input/textarea elements with known DOM IDs.

| DOM ID | Data Path | Update Method | Active-Field Handling |
|--------|-----------|---------------|----------------------|
| `projectName` | `overview.projectName` | Set `.value` | Defer if focused |
| `reportDate` | `overview.date` | Set `.value` | Defer if focused |
| `weatherHigh` | `overview.weather.highTemp` | Set `.value` | Defer if focused |
| `weatherLow` | `overview.weather.lowTemp` | Set `.value` | Defer if focused |
| `weatherPrecip` | `overview.weather.precipitation` | Set `.value` | Defer if focused |
| `weatherCondition` | `overview.weather.generalCondition` | Set `.value` | Defer if focused |
| `weatherJobSite` | `overview.weather.jobSiteCondition` | Set `.value` | Defer if focused |
| `weatherAdverse` | `overview.weather.adverseConditions` | Set `.value` | Defer if focused |
| `issuesText` | `issues` | Set `.value` | Defer if focused |
| `qaqcText` | `qaqc` | Set `.value` | Defer if focused |
| `safetyText` | `safety.notes` | Set `.value` | Defer if focused |
| `communicationsText` | `communications` | Set `.value` | Defer if focused |
| `visitorsText` | `visitors` | Set `.value` | Defer if focused |
| `signatureName` | `signature.name` | Set `.value` | Defer if focused |
| `signatureTitle` | `signature.title` | Set `.value` | Defer if focused |
| `signatureCompany` | `signature.company` | Set `.value` | Defer if focused |
| `startTime` | `overview.startTime` | Set `.value` | Defer if focused |
| `endTime` | `overview.endTime` | Set `.value` + `calculateShiftDuration()` | Defer if focused |
| `completedBy` | `overview.completedBy` | Set `.value` | Defer if focused |

**Dynamic sections:**

| Section | DOM Target | Update Method |
|---------|-----------|---------------|
| Contractor work cards | `#workSummaryContainer` | `renderWorkSummary()` — skip if any `.contractor-narrative:focus` |
| Personnel table | `#personnelTableBody` | `renderPersonnelTable()` — skip if any `.personnel-input:focus` |
| Equipment table | `#equipmentTableBody` | `renderEquipmentTable()` — skip if any equipment input focused |
| Photos | `#photosContainer` | `renderPhotos()` — always safe |

**Re-render flow:**

```javascript
function _applyReportMerge(remoteData, sectionsHint) {
    // 1. Merge userEdits: field-level merge
    //    For each key in remote.userEdits:
    //      if key not in local userEdits (or local === base) → take remote
    //      if key in local and differs from base → keep local
    var mergedEdits = _mergeUserEdits(
        window._syncBase?.userEdits || {},
        RS.userEdits,
        remoteData.user_edits || {}
    );

    // 2. Update RS state
    RS.userEdits = mergedEdits;
    RS.report.userEdits = mergedEdits;
    if (remoteData.ai_generated) RS.report.aiGenerated = remoteData.ai_generated;

    // 3. Update base
    window._syncBase = JSON.parse(JSON.stringify(RS.report));

    // 4. Update DOM fields that aren't focused
    var fieldMappings = pathToFieldId;  // from form-fields.js
    Object.keys(mergedEdits).forEach(function(path) {
        var fieldId = pathToFieldId(path);
        var el = document.getElementById(fieldId);
        if (!el) return;

        if (_isFieldActive(el)) {
            _deferUpdate(fieldId, mergedEdits[path]);
        } else {
            el.value = mergedEdits[path];
            el.classList.add('sync-flash');
            setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
        }
    });

    // 5. Re-render dynamic sections if needed
    if (sectionsHint.some(function(s) { return s.startsWith('activity_'); })) {
        if (!document.querySelector('.contractor-narrative:focus')) {
            renderWorkSummary();
        }
    }
    if (sectionsHint.some(function(s) { return s.startsWith('operations_'); })) {
        if (!document.querySelector('.personnel-input:focus')) {
            renderPersonnelTable();
        }
    }

    // 6. IDB save (silent, no re-broadcast)
    saveReportToLocalStorage();

    // 7. Mark user-edited fields
    markUserEditedFields();
}
```

**Page-specific challenges:**

1. **userEdits is the merge-critical object.** On `report.html`, `RS.userEdits` is the single source of user modifications over AI-generated content. The merge must operate at the key level within `userEdits` — e.g., if Device A edits `issues` and Device B edits `safety.notes`, both edits survive.

2. **AI-generated content is read-only after creation.** Only one device runs AI refinement. If a remote merge includes new `aiGenerated` data (rare — only happens if someone re-refines), take the remote `aiGenerated` wholesale. `userEdits` always overlays on top.

3. **Contractor work narrative fields** have Refine buttons that trigger AI. During an active refine (spinner visible), skip remote merge for that contractor's activity to avoid overwriting the about-to-arrive AI result.

---

### 4.3 Freeform Mode (Interview Page Variant)

When `IS.report.meta.captureMode === 'freeform'`:

- `freeform_entries` array: timestamped voice transcription blocks. Each has `{ id, content, timestamp }`.
- Merge by ID — new remote entries appear at the end, existing entries merge by timestamp.
- Re-render: `renderFreeformEntries()` (in `freeform.js`).
- Active-field check: skip if any `.freeform-entry-textarea:focus`.

---

## 5. D. Dashboard Live Updates (`index.html`)

### Current State
`renderReportCards()` already re-renders on `postgres_changes` events via `_handleReportChange()`. But it does a full re-render and only triggers on DB changes (2-5s lag).

### Enhancements

**1. Broadcast listener for instant status updates:**

On `index.html`, subscribe to a **user-scoped broadcast channel**:

```
Channel: `dashboard:{user_id}`
```

When any edit page flushes to Supabase, also broadcast to this channel:
```javascript
{
    type: 'report_status_change',
    report_id: 'uuid',
    status: 'draft' | 'refined' | 'submitted',
    updated_at: '...',
    sections_changed: ['activities']  // hint for partial update
}
```

**2. Targeted card update (not full re-render):**

```javascript
function _updateReportCard(reportId, newStatus) {
    var card = document.querySelector('[data-report-id="' + reportId + '"]');
    if (!card) {
        // New report — full re-render
        renderReportCards();
        return;
    }
    // Update status badge
    var badge = card.querySelector('.report-status-badge');
    if (badge) {
        badge.textContent = newStatus;
        badge.className = 'report-status-badge status-' + newStatus;
    }
    // Update timestamp
    var timeEl = card.querySelector('.report-updated-time');
    if (timeEl) timeEl.textContent = 'Just now';
}
```

**3. What updates in real-time:**
- Report status changes (draft → refined → submitted)
- New reports appearing (from another device creating one)
- Report deletions (card removal)
- Updated timestamps on cards

**4. New reports appearing automatically:**
- `_handleReportChange` with `INSERT` event already calls `renderReportCards()`.
- Add broadcast signal so same-user other tabs see it instantly too.

---

## 6. E. Edge Cases

### 6.1 Two Users Editing Simultaneously

Supported but with caveats:
- Each user gets their own `session_id`
- Merge engine treats them identically to two devices for one user
- **Key constraint:** Both users must have Supabase RLS access to the report
- Field-level merge prevents most data loss
- Same-field edits: last writer wins with toast notification

### 6.2 iOS Suspend/Resume

**Problem:** iOS kills WebSocket connections silently when app is backgrounded. No `close` event, no `error` event — just silence.

**Solution (already partially in place):**

```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // 1. Unconditional REST fetch (Codex review item #5)
        //    Don't wait for broadcast — iOS may have missed signals
        setTimeout(function() {
            var reportId = new URLSearchParams(window.location.search).get('reportId');
            if (reportId) {
                _fetchAndMerge(reportId, [], _isInterviewPage());
            }
        }, 500);

        // 2. Re-subscribe to broadcast channels (existing behavior)
        initRealtimeSync();

        // 3. Drain any pending backups that were queued while suspended
        if (typeof drainPendingBackups === 'function') drainPendingBackups();
    } else {
        // Going to background — flush immediately before iOS kills us
        if (_isInterviewPage() && typeof flushInterviewBackup === 'function') {
            flushInterviewBackup();
        }
        if (_isReportPage() && typeof flushReportBackup === 'function') {
            flushReportBackup();
        }
    }
});
```

### 6.3 Offline → Online

```javascript
window.addEventListener('online', function() {
    // 1. Drain pending backups (already exists in persistence.js)
    drainPendingBackups();

    // 2. Flush current state immediately
    if (_isInterviewPage()) flushInterviewBackup();
    if (_isReportPage()) flushReportBackup();

    // 3. Fetch remote state and merge (may have missed changes while offline)
    var reportId = new URLSearchParams(window.location.search).get('reportId');
    if (reportId) {
        setTimeout(function() {
            _fetchAndMerge(reportId, [], _isInterviewPage());
        }, 1000);
    }

    // 4. Re-init realtime subscriptions (already exists)
    initRealtimeSync();
});
```

### 6.4 Browser Back Button / bfcache

```javascript
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        // Page restored from bfcache — WebSocket is dead, state may be stale
        console.log('[SYNC] Restored from bfcache — re-syncing');
        initRealtimeSync();
        var reportId = new URLSearchParams(window.location.search).get('reportId');
        if (reportId) {
            _fetchAndMerge(reportId, [], _isInterviewPage());
        }
        drainPendingBackups();
    }
});
```

### 6.5 One Device on Interview, Other on Report (Same Report)

This is a **cross-page scenario** and the most complex edge case.

**Flow:**
1. Device A is on `quick-interview.html?reportId=X` (drafting)
2. Device B is on `report.html?reportId=X` (editing refined version)
3. These are fundamentally different data models:
   - Interview writes to `interview_backup` table
   - Report writes to `report_data` table

**Decision: Do NOT cross-merge between interview and report pages.**

**Rationale:**
- Interview page state (`IS.report`) has a completely different schema from report page state (`RS.report + aiGenerated + userEdits`).
- The interview→report transition involves AI processing (refinement) that transforms the data structure.
- Attempting to merge across these models would require a bidirectional schema transformer — enormous complexity with minimal real-world benefit.

**What we DO instead:**
- The interview page broadcasts with `page: 'quick-interview'`
- The report page's `_handleSyncBroadcast` checks `payload.page`:
  - If `page === 'quick-interview'` → show toast: "⚠️ Draft is being edited on another device. Changes will appear after refinement."
  - Do NOT merge.
- Vice versa: if report page sends update and interview page receives it, show toast: "⚠️ Refined report is being edited on another device."

### 6.6 Photo Uploads During Sync

**Problem:** Photo upload is async (minutes on slow connections). Mid-upload, a sync merge could duplicate or lose photo entries.

**Solution:**
- Photos have stable UUIDs (already: `p.id`)
- Photo merge uses ID-based dedup: union of local and remote photos by ID
- Upload-in-progress photos have `uploadStatus: 'uploading'` — never overwrite these with remote data
- Once upload completes, the photo's `storagePath` and `url` are set locally → next backup cycle pushes to cloud → remote devices pick up the new photo with URL

```javascript
function _mergePhotos(basePhotos, localPhotos, remotePhotos) {
    var merged = {};
    // Start with local (preserves upload-in-progress state)
    localPhotos.forEach(function(p) { merged[p.id] = p; });
    // Add remote photos that don't exist locally
    remotePhotos.forEach(function(p) {
        if (!merged[p.id]) {
            merged[p.id] = p;
        } else if (merged[p.id].uploadStatus === 'uploading') {
            // Don't overwrite in-progress upload
        } else if (p.url && !merged[p.id].url) {
            // Remote has URL (uploaded on other device), local doesn't
            merged[p.id].url = p.url;
            merged[p.id].storagePath = p.storagePath;
        }
    });
    return Object.values(merged);
}
```

### 6.7 Race Condition: Broadcast Arrives Before DB Commit

Already addressed by the 500-800ms delay with jitter (Section B). Additional safety:

```javascript
async function _fetchAndMerge(reportId, sectionsHint, isInterview) {
    var result;
    if (isInterview) {
        result = await supabaseClient
            .from('interview_backup')
            .select('page_state, updated_at')
            .eq('report_id', reportId)
            .maybeSingle();
    } else {
        result = await supabaseClient
            .from('report_data')
            .select('*')
            .eq('report_id', reportId)
            .maybeSingle();
    }

    if (!result.data || result.error) return;

    // Staleness check
    var remoteUpdatedAt = result.data.updated_at;
    if (window._lastMergeAt && remoteUpdatedAt <= window._lastMergeAt) {
        console.log('[SYNC] Remote data not newer than last merge, skipping');
        return;
    }
    window._lastMergeAt = remoteUpdatedAt;

    // Perform merge
    if (isInterview) {
        var remote = result.data.page_state;
        var mergeResult = syncMerge(window._syncBase, IS.report, remote, sectionsHint);
        _applyInterviewMerge(mergeResult.merged, mergeResult.sectionsUpdated);
    } else {
        _applyReportMerge(result.data, sectionsHint);
    }

    // Show toast if anything changed
    if (mergeResult && mergeResult.sectionsUpdated.length > 0) {
        _showSyncToast(mergeResult.sectionsUpdated, mergeResult.conflicts);
    }
}
```

### 6.8 Thundering Herd (3+ Devices)

Jitter already in place (500 + random 300ms). For 3+ devices, extend:
```javascript
var delay = 500 + Math.floor(Math.random() * 500);  // 500-1000ms spread
```

### 6.9 _syncRevision Reset Bug

**Current bug:** `_syncRevision` resets to 0 on reload because it's a file-local `let`.

**Fix:** Use `updated_at` timestamps from Supabase rows as the staleness signal instead of revision counters. The `_lastMergeAt` timestamp comparison (Section 6.7) replaces revision-based staleness entirely.

**Optionally persist revision to sessionStorage:**
```javascript
var _syncRevision = parseInt(sessionStorage.getItem('fvp_sync_rev_' + reportId) || '0');
function _incrementRevision() {
    _syncRevision++;
    sessionStorage.setItem('fvp_sync_rev_' + reportId, _syncRevision);
    return _syncRevision;
}
```

---

## 7. F. Implementation Order

### Phase 1: Broadcast Plumbing (1-2 days) — Max Visible Impact
**Files:** `js/shared/realtime-sync.js`, `js/interview/persistence.js`, `js/report/autosave.js`

1. Add Supabase Broadcast channel join/leave in `initRealtimeSync()`
2. Add `_broadcastSyncUpdate()` helper
3. Wire outbound broadcast into `flushInterviewBackup()` and `flushReportBackup()`
4. Add `_handleSyncBroadcast()` with self-filter and delayed REST fetch
5. Add `visibilitychange` unconditional fetch (iOS fix)
6. Add `pageshow` bfcache handler

**Complexity:** Low. Mostly wiring existing infrastructure.  
**Visible impact:** Devices start hearing each other.

### Phase 2: Dashboard Live Updates (0.5 days)
**Files:** `js/shared/realtime-sync.js`, `js/index/report-cards.js`

1. Add dashboard broadcast channel subscription
2. Add `_updateReportCard()` targeted DOM update
3. Wire broadcast into existing flush functions

**Complexity:** Low.  
**Visible impact:** Dashboard shows report changes instantly.

### Phase 3: Merge Engine (2-3 days) — Core Logic
**Files:** NEW `js/shared/sync-merge.js`

1. Implement `syncMerge(base, local, remote, sectionsHint)`
2. Object-section merge (field-level comparison)
3. Array-section merge (ID-based union with timestamp tiebreak)
4. Scalar-section merge (LWW with conflict tracking)
5. Photo merge (upload-aware dedup)
6. Unit tests (can run in Node.js since pure functions)

**Complexity:** Medium-high. Core algorithm, but well-defined inputs/outputs.  
**Visible impact:** None yet — needs UI layer.

### Phase 4: Interview Page UI Integration (2-3 days) — THE HARD PART
**Files:** `js/interview/persistence.js`, `js/interview/guided-sections.js`, `js/interview/ui-display.js`

1. Initialize `window._syncBase` after page load restore
2. Implement `_applyInterviewMerge()`
3. Add `_isFieldActive()` checks for every section renderer
4. Add `_deferUpdate()` queue with blur listeners
5. Add sync-flash CSS animation
6. Wire `_fetchAndMerge()` → merge → apply pipeline
7. Add cross-page detection (interview↔report toast)
8. Test with two devices on same interview

**Complexity:** High. Many section renderers, dynamic DOM, active-field detection.  
**Visible impact:** The Google Docs experience on the interview page.

### Phase 5: Report Page UI Integration (1-2 days)
**Files:** `js/report/data-loading.js`, `js/report/form-fields.js`, `js/report/autosave.js`

1. Initialize `window._syncBase` after `loadReport()`
2. Implement `_applyReportMerge()`
3. Iterate `pathToFieldId` mapping for per-field updates
4. Add deferred updates for focused fields
5. Handle contractor work card re-renders
6. Test with two devices on same report

**Complexity:** Medium. Flat field mappings are easier than interview's dynamic lists.  
**Visible impact:** The Google Docs experience on the report page.

### Phase 6: Polish & Edge Cases (1-2 days)
**Files:** Various

1. Conflict toasts with details
2. Rate-limit toasts (max 1 per 5s)
3. Extended jitter for 3+ devices
4. sessionStorage revision persistence
5. Offline→online full sync cycle testing
6. iOS Safari background/foreground cycle testing
7. bfcache testing

**Complexity:** Low-medium.  
**Visible impact:** Reliability.

### Deferrable

- **Cross-page interview↔report merge:** Enormous complexity, minimal real use case. Toast notification sufficient.
- **Conflict resolution UI:** "Show me what the other device had." Nice-to-have, not MVP.
- **Operational Transform / CRDTs:** Only needed if character-level concurrent typing matters (it doesn't for construction reports).
- **Presence indicators:** "Jackson is also editing this report" — nice but orthogonal to sync.

---

### Total Estimated Effort

| Phase | Effort | Cumulative |
|-------|--------|------------|
| Phase 1: Broadcast plumbing | 1-2 days | 1-2 days |
| Phase 2: Dashboard | 0.5 days | 1.5-2.5 days |
| Phase 3: Merge engine | 2-3 days | 3.5-5.5 days |
| Phase 4: Interview UI | 2-3 days | 5.5-8.5 days |
| Phase 5: Report UI | 1-2 days | 6.5-10.5 days |
| Phase 6: Polish | 1-2 days | 7.5-12.5 days |

**Realistic total: ~2 weeks** for a solo developer, with the core value (Phases 1-4) achievable in ~1 week.

---

### File Summary

| File | Changes |
|------|---------|
| `js/shared/realtime-sync.js` | Broadcast channel join/leave, `_handleSyncBroadcast`, `_broadcastSyncUpdate`, `_fetchAndMerge`, `visibilitychange` fetch, `pageshow` handler |
| `js/shared/sync-merge.js` | **NEW.** `syncMerge()`, `_mergeUserEdits()`, `_mergePhotos()`, section definitions |
| `js/interview/persistence.js` | Outbound broadcast call in `flushInterviewBackup()`, `_syncBase` initialization, `_applyInterviewMerge()`, session ID export |
| `js/interview/guided-sections.js` | Active-field guards in `renderSection()` |
| `js/interview/ui-display.js` | Sync-flash on weather updates |
| `js/report/autosave.js` | Outbound broadcast call in `flushReportBackup()`, session ID generation |
| `js/report/data-loading.js` | `_syncBase` initialization after `loadReport()` |
| `js/report/form-fields.js` | `_applyReportMerge()`, deferred update integration |
| `js/index/report-cards.js` | `_updateReportCard()` targeted update |
| `css/` or inline styles | `.sync-flash` animation |
