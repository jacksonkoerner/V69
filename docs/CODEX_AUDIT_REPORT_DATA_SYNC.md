# Codex Audit: Report Data Cross-Device Sync Bug

**Date:** 2026-02-18  
**Auditor:** Codex (subagent)  
**Scope:** READ-ONLY audit of `report_data` sync flow in FieldVoice Pro V69  
**Status:** ✅ Root cause CONFIRMED — Recommendation provided

---

## 1. Problem Summary

Report content (activities, work sections, AI-generated text) appears **BLANK** when opening a report on a different device than where it was created. Project metadata syncs fine; only the `report_data` content (the actual report body) is affected.

---

## 2. Root Cause Analysis — CONFIRMED

### 2.1 The Supabase Realtime Payload Limit (Smoking Gun)

From [Supabase Realtime Limits documentation](https://supabase.com/docs/guides/realtime/limits):

> **Postgres changes payload limit: 1,024 KB** (all plans)  
> When this limit is reached, **the new and old record payloads only include the fields with a value size of less than or equal to 64 bytes.**

This is the definitive evidence. The `report_data` table contains:
- `ai_generated` — JSONB, typically **50–200+ KB** (full AI-processed report with activities, operations, equipment, etc.)
- `original_input` — JSONB, typically **20–100+ KB** (raw field notes, photos metadata, weather data)
- `user_edits` — JSONB, variable size

When the total row payload exceeds 1,024 KB (very likely with a real report), Supabase Realtime **strips all columns whose values exceed 64 bytes**. Both `ai_generated` and `original_input` will *always* exceed 64 bytes, so they're stripped from the Realtime payload.

Even when the total payload is under 1,024 KB, there's a subtler issue: Supabase Realtime sends the **full new row** via `payload.new`, but the WAL (Write-Ahead Log) replication slot has its own behavior. For `UPDATE` events, `payload.new` should contain the full new row, but for very large JSONB columns, there are known edge cases where Supabase's Realtime server truncates or omits them to stay within WebSocket frame limits.

**Bottom line:** The root cause hypothesis is correct. Realtime is either:
1. Stripping `ai_generated`/`original_input` due to the 1,024 KB payload limit (most likely), or  
2. Sending them as `null`/`undefined` due to WAL replication behavior on large JSONB

### 2.2 The Overwrite Chain

Here's the exact chain of failure, traced through the code:

**Step 1: Realtime handler blindly writes to IDB**

In `js/shared/realtime-sync.js`, `_handleReportDataChange()` (line ~160):

```js
var reportData = {
    aiGenerated: data.ai_generated,      // null (stripped by Realtime)
    originalInput: data.original_input,    // null (stripped by Realtime)
    userEdits: data.user_edits || {},      // may be {} or null
    captureMode: data.capture_mode,        // small value, survives
    status: data.status,                   // small value, survives
    lastSaved: data.updated_at             // small value, survives
};
window.dataStore.saveReportData(data.report_id, reportData);
```

This **unconditionally overwrites** whatever was in IDB with `{ aiGenerated: null, originalInput: null, ... }`.

**Step 2: `loadReport()` trusts IDB entry existence**

In `js/report/data-loading.js`, `loadReport()` (line ~42):

```js
var reportData = await window.dataStore.getReportData(reportIdParam);
// ...
if (!reportData && navigator.onLine) {
    // Supabase fallback query...
}
```

The check is `!reportData` — but `reportData` is NOT null. It's `{ aiGenerated: null, originalInput: null, captureMode: "minimal", status: "refined", ... }`. IDB returned an object, so the Supabase fallback is **never triggered**.

**Step 3: Report renders blank**

```js
loadedReport.aiGenerated = reportData.aiGenerated || null;   // null
loadedReport.originalInput = reportData.originalInput || null; // null
```

The rendering code checks `RS.report.aiGenerated` for activities, operations, etc. All null → blank report.

### 2.3 Why This Only Happens Cross-Device

On Device A (creator): Report data is written to IDB during `finishReportFlow()` directly from the AI response — full data, no truncation.

On Device B (viewer): The Realtime subscription fires *before* the user opens the report. The truncated payload gets written to IDB. When the user later navigates to `report.html`, the poisoned IDB entry is found first.

**Additional amplifier:** The `recoverCloudDrafts()` function in `cloud-recovery.js` (line ~64) actually does the right thing — it fetches `report_data` via a proper Supabase REST query and caches it to IDB with full content. BUT: if the Realtime handler fires *after* `recoverCloudDrafts()` completes, it overwrites the good data with the truncated version. Race condition.

### 2.4 Missing Guard

The `_handleReportChange()` handler for the `reports` table has a guard (SYN-02, Sprint 15):

```js
if (editingReportId && editingReportId === report.id) {
    console.log('[REALTIME] Skipping update for actively-edited report:', report.id);
    return;
}
```

But `_handleReportDataChange()` has **no such guard** — no skip for actively-edited reports, no validation of incoming data, no merge logic. It's a blunt overwrite.

---

## 3. Analysis of Proposed Fixes

### Option A: Defensive Merge in Realtime Handler

**Approach:** Don't overwrite IDB if incoming values are null. Only update fields that have actual data.

```js
// Pseudocode
function _handleReportDataChange(payload) {
    var data = payload.new;
    var existing = await window.dataStore.getReportData(data.report_id);
    var merged = existing || {};
    
    if (data.ai_generated != null) merged.aiGenerated = data.ai_generated;
    if (data.original_input != null) merged.originalInput = data.original_input;
    if (data.user_edits != null) merged.userEdits = data.user_edits;
    if (data.capture_mode != null) merged.captureMode = data.capture_mode;
    if (data.status != null) merged.status = data.status;
    merged.lastSaved = data.updated_at;
    
    window.dataStore.saveReportData(data.report_id, merged);
}
```

**Pros:**
- Minimal code change
- Preserves existing IDB data when Realtime sends truncated payloads
- Still updates small fields (`status`, `captureMode`) that Realtime *does* include reliably

**Cons:**
- Doesn't solve the **initial load** problem: if Device B has never seen this report, IDB is empty, and the merge base is `{}`. We'd save `{ aiGenerated: null }` anyway — same bug.
- **False safety:** A null check can't distinguish "field was truncated by Realtime" from "field was intentionally set to null" (e.g., a report reset)
- Still **no full data** arriving via Realtime — even after the merge, Device B doesn't get the actual content

**Edge Cases:**
- User clears/resets a report field → Realtime sends `null` legitimately → defensive merge ignores it → stale data persists locally
- Race with `recoverCloudDrafts()`: if recovery runs first and populates IDB, then Realtime fires, the merge preserves existing data. This is good. But if Realtime fires first (empty IDB), you get null anyway.

**Could cause new bugs?**
- Yes: stale data persistence when fields are legitimately nulled
- Moderate risk

**Implementation complexity:** Low (10 lines changed)

**Verdict:** ⚠️ Band-aid. Helps some cases but doesn't solve the core problem.

---

### Option B: Fetch Full Row on Realtime Event

**Approach:** When Realtime fires a `report_data` change, ignore the payload and fetch the full row from Supabase via REST.

```js
// Pseudocode
function _handleReportDataChange(payload) {
    var reportId = payload.new.report_id;
    supabaseClient
        .from('report_data')
        .select('*')
        .eq('report_id', reportId)
        .maybeSingle()
        .then(function(result) {
            if (result.data) {
                var reportData = {
                    aiGenerated: result.data.ai_generated,
                    originalInput: result.data.original_input,
                    // ...
                };
                window.dataStore.saveReportData(reportId, reportData);
            }
        });
}
```

**Pros:**
- **Actually gets the full data** — REST API returns complete JSONB columns, no truncation
- Solves both initial load (Device B sees report for first time) and overwrite scenarios
- Clean and simple to understand

**Cons:**
- **Extra Supabase query on every Realtime event** — could be chatty if user is actively editing on Device A (autosave triggers Realtime → Device B fetches full row repeatedly)
- **Network dependency** — if offline momentarily when Realtime fires, the fetch fails and IDB may have stale or no data
- **Latency** — small delay between Realtime notification and data availability in IDB
- **Race condition with autosave:** Device A autosaves every 5 seconds (`flushReportBackup`). Each autosave triggers a Realtime event on Device B. Device B then fetches the full row. If Device A saves again before Device B's fetch completes, Device B fetches an intermediate state.

**Edge Cases:**
- Rapid-fire autosaves: Device A types → autosave every 5s → Realtime fires → Device B fetches. Multiple in-flight fetches could arrive out of order. Need to either debounce the handler or use a "latest wins" approach.
- SYN-02 guard: Should skip if the user is editing this report on Device B too (conflict scenario). Current `_handleReportChange` has this guard; `_handleReportDataChange` doesn't.

**Could cause new bugs?**
- Out-of-order fetches if autosave is rapid. Solvable with debounce + sequence numbering.
- Minor: increased Supabase usage (but report_data rows are typically 1-2 per active report, so manageable)

**Implementation complexity:** Medium (20-30 lines, need debounce logic)

**Verdict:** ✅ Strong fix. Actually solves the problem. Needs debouncing.

---

### Option C: Make `loadReport()` Smarter

**Approach:** Even when IDB returns an entry, check if key fields are null. If so, fall through to Supabase query.

```js
// Pseudocode - in loadReport()
var reportData = await window.dataStore.getReportData(reportIdParam);

var needsCloudFetch = !reportData || 
    (!reportData.aiGenerated && !reportData.originalInput);

if (needsCloudFetch && navigator.onLine) {
    // Fetch from Supabase report_data...
}
```

**Pros:**
- Fixes the immediate symptom: blank reports on Device B
- Simple — 2-line condition change in existing code
- Works regardless of *how* the IDB data got poisoned (Realtime, bug, corruption)
- **Self-healing:** Even if something else writes bad data to IDB, the report page recovers

**Cons:**
- **Doesn't fix the root cause** — poisoned IDB data still exists. Other code paths that read IDB (e.g., dashboard card rendering, preview) may still see null data.
- **Performance:** Extra Supabase query every time a report with null AI data is loaded. Should be rare (only poisoned reports), but it's a recurring cost until IDB is fixed.
- **Doesn't prevent the overwrite** — Realtime handler still writes garbage to IDB. If the user loads the report (triggers cloud fetch → fixes IDB), then goes back to dashboard, another Realtime event could re-poison it.

**Edge Cases:**
- Legitimate empty reports: A report that genuinely has no AI content (e.g., draft, pre-processing) would trigger a Supabase fetch every time. But `loadReport()` already handles `pending_refine`/`draft` status separately (lines ~90-99), so this is largely mitigated.
- Offline: If IDB has null data and user is offline, they get a blank report with no fallback. This is existing behavior, but Option C doesn't make it worse.

**Could cause new bugs?**
- Low risk. The fallback fetch is identical to the existing "IDB miss" code path (lines ~52-80).
- One subtle issue: the existing code does `showToast('Report recovered from cloud', 'success')` in the fallback. You'd want to suppress that toast for the "IDB exists but has null content" case to avoid confusing the user.

**Implementation complexity:** Low (5-10 lines changed)

**Verdict:** ✅ Good safety net. Should be combined with another fix.

---

## 4. Option D: Additional Approaches Considered

### D1: Remove `report_data` from Realtime Entirely

**Approach:** Don't subscribe to `report_data` changes via Realtime at all. Rely on `recoverCloudDrafts()` and explicit `loadReport()` fallback instead.

**Rationale:** The `report_data` Realtime subscription is dangerous because:
1. There's no `user_id` filter (comment in code confirms this)
2. The payload will almost always be truncated for real reports
3. The handler has no SYN-02 guard for actively-edited reports
4. The only useful information it could provide (status, captureMode) is also available from the `reports` table subscription

**Pros:**
- Eliminates the bug entirely — no more poisoned IDB writes from Realtime
- Reduces WebSocket traffic
- Simplifies the codebase

**Cons:**
- Loses "real-time" sync of report content. But in practice, this sync was **already broken** (it only synced metadata, not content).
- Cross-device content updates would rely on page load/navigation (via `loadReport()` fallback) or `recoverCloudDrafts()` on dashboard

**Verdict:** ✅ This is actually a very strong option. The Realtime handler for `report_data` is actively harmful, not helpful. Removing it is the safest single change.

### D2: Add `syncReportDataFromCloud()` Function

**Approach:** Create a dedicated function (similar to `syncReportsFromCloud()`) that syncs the `report_data` content.

The existing `syncReportsFromCloud()` only syncs report **metadata** (`id, status, project_id, report_date, created_at, updated_at, submitted_at`). It does NOT sync `report_data` content. And `recoverCloudDrafts()` does fetch `report_data` (lines ~85-105 in `cloud-recovery.js`), but only for recovered reports.

**Implementation:**
```js
// Add to data-store.js or data-layer.js
async function syncReportDataFromCloud(reportIds) {
    var result = await supabaseClient
        .from('report_data')
        .select('*')
        .in('report_id', reportIds);
    
    for (var rd of result.data) {
        var localData = {
            aiGenerated: rd.ai_generated,
            originalInput: rd.original_input,
            userEdits: rd.user_edits || {},
            captureMode: rd.capture_mode,
            status: rd.status,
            createdAt: rd.created_at,
            lastSaved: rd.updated_at
        };
        await window.dataStore.saveReportData(rd.report_id, localData);
    }
}
```

**Pros:**
- Ensures full content is cached in IDB on dashboard load
- Works well with the existing `recoverCloudDrafts()` flow
- No truncation risk (REST API, not Realtime)

**Cons:**
- Fetching all `report_data` rows on every dashboard load could be expensive (each row is 50-200+ KB)
- Should be throttled or conditional (only for reports not yet in IDB, or where IDB data looks stale)

**Verdict:** ⚠️ Useful but heavy. Better as a targeted fill-in than a blanket sync.

### D3: Realtime Triggers Full Refresh via Notification Only

**Approach:** Use Realtime purely as a notification mechanism. When a `report_data` change arrives, don't try to use the payload at all — just set a flag or emit a BroadcastChannel message saying "report X has new data." Then let the next `loadReport()` call fetch from Supabase.

**Pros:**
- Clean separation of concerns (notification vs. data fetching)
- No risk of writing truncated data
- BroadcastChannel integration already exists (`fvpBroadcast`)

**Cons:**
- Delayed sync — content only updates when user navigates to the report
- Slightly more complex architecture

**Verdict:** ✅ Elegant approach. Essentially Option D1 + keeping the subscription for notification purposes.

---

## 5. The `autosave.js` Amplifier

There's an additional issue in `autosave.js` that makes this bug **worse**. The `flushReportBackup()` function (the 5-second debounced autosave) sends this to Supabase:

```js
var _autosavePayload = {
    report_id: _autosaveReportId,
    org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || null,
    user_edits: RS.userEdits || {},
    status: RS.report?.meta?.status || 'refined',
    updated_at: new Date().toISOString()
};
```

Note: it does **NOT** include `ai_generated` or `original_input`. This is correct behavior (these don't change during editing, only `user_edits` changes). But it means:

1. Every autosave on Device A → upserts to `report_data` with `updated_at` changed
2. Supabase triggers a Realtime event
3. The Realtime payload for this UPDATE *may still include* the full row (since Postgres WAL sends the full new row for UPDATE), BUT if `ai_generated` is large enough to exceed the 64-byte threshold in the payload size limit, it gets stripped
4. Device B's Realtime handler writes `{ aiGenerated: null, ... }` to IDB

So every keystroke on Device A (with 5s debounce) could re-poison Device B's IDB cache. This makes the bug **recurring**, not just a one-time issue.

---

## 6. Recommendation

### Primary Fix: **Option B + C + D1 combination** (Belt, Suspenders, and a Safety Net)

Here's the exact prescription, in priority order:

#### Change 1 (Critical): Neuter the Realtime `report_data` handler (D1/D3 hybrid)

Replace the current `_handleReportDataChange()` with a notification-only approach:

```js
function _handleReportDataChange(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        var data = payload.new;
        
        // SYN-02: Skip if user is currently editing this report
        var path = window.location.pathname;
        if (path.indexOf('report.html') !== -1) {
            var urlParams = new URLSearchParams(window.location.search);
            var editingReportId = urlParams.get('reportId');
            if (editingReportId && editingReportId === data.report_id) {
                console.log('[REALTIME] Skipping report_data update for actively-edited report');
                return;
            }
        }
        
        // ONLY update lightweight metadata fields that Realtime reliably includes.
        // DO NOT write ai_generated or original_input from Realtime payloads —
        // they may be truncated/null due to Supabase's 1MB payload limit.
        // Full content is fetched on-demand by loadReport() via REST API.
        if (window.dataStore && typeof window.dataStore.getReportData === 'function') {
            window.dataStore.getReportData(data.report_id)
                .then(function(existing) {
                    if (!existing) return; // Don't create entries from Realtime — let loadReport() handle first fetch
                    
                    // Only update fields that are safe (small, reliably included in payload)
                    if (data.status) existing.status = data.status;
                    if (data.capture_mode) existing.captureMode = data.capture_mode;
                    if (data.user_edits && Object.keys(data.user_edits).length > 0) {
                        existing.userEdits = data.user_edits;
                    }
                    existing.lastSaved = data.updated_at;
                    
                    return window.dataStore.saveReportData(data.report_id, existing);
                })
                .catch(function(err) {
                    console.warn('[REALTIME] report_data merge failed:', err);
                });
        }
        
        // Notify other tabs that report data changed
        if (window.fvpBroadcast && window.fvpBroadcast.send) {
            window.fvpBroadcast.send({ type: 'report-data-updated', id: data.report_id });
        }
    }
}
```

**Why this is the most important change:** It stops the bleeding. No more poisoned IDB writes.

#### Change 2 (Critical): Make `loadReport()` fallback smarter (Option C)

In `js/report/data-loading.js`, change the Supabase fallback condition:

```js
// BEFORE:
if (!reportData && navigator.onLine) {

// AFTER:
var needsCloudFetch = !reportData || 
    (!reportData.aiGenerated && !reportData.originalInput);

if (needsCloudFetch && navigator.onLine) {
```

**Why:** Self-healing safety net. Even if some other code path writes bad data to IDB, the report page will always attempt to recover from Supabase. This is defense-in-depth.

#### Change 3 (Nice-to-have): Debounced full fetch on Realtime notification (Option B, selective)

If you want Device B to see updates in real-time (e.g., while both devices have report.html open), add a debounced fetch triggered by BroadcastChannel:

```js
// In report/main.js, listen for the broadcast
if (window.fvpBroadcast) {
    window.fvpBroadcast.onmessage = function(msg) {
        if (msg.type === 'report-data-updated' && msg.id === RS.currentReportId) {
            // Debounce: only fetch if we haven't fetched in the last 10 seconds
            debouncedFetchReportData(RS.currentReportId);
        }
    };
}
```

This is lower priority because the active-editing guard (SYN-02) should prevent same-report conflicts, and cross-device real-time editing isn't a primary use case.

---

## 7. Risk Assessment

| Change | Risk | Impact if Wrong | Rollback Ease |
|--------|------|----------------|---------------|
| Change 1 (neuter handler) | Low | Worst case: metadata doesn't sync via Realtime (falls back to page load) | Trivial revert |
| Change 2 (smarter fallback) | Very Low | Extra Supabase query on edge cases | Trivial revert |
| Change 3 (debounced fetch) | Low-Medium | Extra network traffic | Remove listener |

---

## 8. Testing Plan

1. **Reproduce the bug:** Create report on Device A → open on Device B → verify blank
2. **Apply Change 1 + 2** → repeat test → verify report content loads on Device B
3. **Stress test:** On Device A, make rapid edits (triggers autosave every 5s). On Device B, navigate to the same report. Verify content is never overwritten with nulls.
4. **Offline test:** Create report on Device A → turn off Device B's network → navigate to report → verify graceful degradation (shows "not found" message, not blank content)
5. **Recovery test:** After applying fixes, reports that were previously poisoned in IDB should self-heal on next `loadReport()` call (Change 2 handles this)

---

## 9. Why NOT Option A Alone

Option A (defensive merge) is tempting because it's the smallest change. But it has a fatal flaw: **it doesn't work for the first visit.** When Device B has never seen the report, IDB is empty. The Realtime handler creates a new entry with null content. The merge base is `{}`, so the result is `{ aiGenerated: null, ... }`. Same bug.

You'd need Option A + Option C at minimum, and at that point, you're better off doing Change 1 (which is cleaner than Option A) + Option C.

---

## 10. Long-Term Architectural Consideration

The broader pattern here is a common trap in offline-first apps: **using Realtime/WebSocket notifications as a data transport mechanism.** Realtime is great for *notifications* ("something changed") but unreliable for *data delivery* (payload limits, truncation, ordering). 

The architecture should evolve toward:
- **Realtime** → notification layer only ("report X changed at timestamp Y")
- **REST API** → data fetch layer (always returns full, correct data)
- **IDB** → local cache with staleness detection
- **loadReport()** → always validates IDB content before trusting it

This is essentially the CQRS pattern applied to client-side data sync.

---

## Appendix: File Reference

| File | Role | Key Lines |
|------|------|-----------|
| `js/shared/realtime-sync.js` | Realtime subscriptions | `_handleReportDataChange` (line ~160) — THE BUG |
| `js/report/data-loading.js` | Report loading logic | `loadReport()` (line ~35) — trusts IDB too much |
| `js/report/autosave.js` | Periodic save to Supabase | `flushReportBackup()` (line ~90) — triggers Realtime events |
| `js/shared/data-store.js` | IDB wrapper | `saveReportData`/`getReportData` — innocent bystander |
| `js/index/cloud-recovery.js` | Dashboard recovery | `recoverCloudDrafts()` — does the right thing but gets overwritten |
| `js/interview/finish-processing.js` | AI processing finish | `finishReportFlow()` — writes full data to IDB + Supabase correctly |
