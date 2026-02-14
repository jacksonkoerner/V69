# Navigation & State Recovery Audit — FieldVoice Pro V69

**Date:** 2025-07-14  
**Auditor:** Claude (subagent v69-navigation-audit)  
**Triggered by:** Two user-reported bugs:
1. Dashboard project section / report tracking area doesn't load after returning from report creation/finishing
2. Backgrounding app during AI processing → report stuck in drafts → tapping draft loads empty/error report page

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Bug 1: Dashboard Not Refreshing on Back-Navigation](#2-bug-1-dashboard-not-refreshing-on-back-navigation)
3. [Bug 2: Backgrounding During AI Processing → Broken Draft](#3-bug-2-backgrounding-during-ai-processing--broken-draft)
4. [Additional Issues Found](#4-additional-issues-found)
5. [Proposed Fixes](#5-proposed-fixes)
6. [Fix Priority Matrix](#6-fix-priority-matrix)

---

## 1. Architecture Overview

### Page Flow
```
index.html (Dashboard)
  → quick-interview.html (Field Capture / Data Entry)
    → [AI Processing via n8n webhook]
      → report.html (Review/Edit Refined Report)
        → [Submit] → back to index.html?submitted=true
```

### Key Files Audited
| File | Purpose |
|------|---------|
| `js/index/main.js` | Dashboard init (`DOMContentLoaded`) |
| `js/index/report-cards.js` | Renders project sections & report cards |
| `js/index/cloud-recovery.js` | Syncs cloud drafts into localStorage |
| `js/index/report-creation.js` | New report creation flow |
| `js/interview/main.js` | Interview page init + lifecycle handlers |
| `js/interview/finish-processing.js` | AI processing + finish flow |
| `js/interview/persistence.js` | Draft storage, autosave, Supabase save |
| `js/interview/ui-flow.js` | Processing overlay UI |
| `js/report/main.js` | Report page init |
| `js/report/data-loading.js` | Report data loading (`loadReport()`) |
| `js/report/ai-refine.js` | Pending refine detection + retry |
| `js/report/autosave.js` | Report page autosave |
| `js/storage-keys.js` | Storage helpers (`getCurrentReport`, `saveCurrentReport`, etc.) |
| `js/report-rules.js` | Business rules, status constants |
| `js/pwa-utils.js` | PWA navigation, service worker, offline banner |

### Report Status Flow
```
draft → pending_refine → refined → ready_to_submit → submitted
```

### Storage Layers
1. **`fvp_current_reports`** (localStorage) — Map of `{reportId: reportMeta}`, used by dashboard
2. **`fvp_report_{uuid}`** (localStorage) — Full report data package (AI output, original input, edits)
3. **IndexedDB** — Durable backup of both above (survives iOS 7-day eviction)
4. **Supabase `reports`** — Server-side report row (status, project_id, etc.)
5. **Supabase `report_data`** — Server-side AI output + user edits
6. **Supabase `interview_backup`** — Server-side field capture page state

---

## 2. Bug 1: Dashboard Not Refreshing on Back-Navigation

### Root Cause: **No `pageshow` / `visibilitychange` handlers on Dashboard**

The dashboard (`index.html`) initializes **exclusively** via `DOMContentLoaded` (line 134 of `js/index/main.js`). There are **zero** `pageshow`, `visibilitychange`, or any other re-initialization handlers on the dashboard page.

#### What happens:
1. User opens dashboard → `DOMContentLoaded` fires → projects load → `renderReportCards()` renders correctly
2. User creates report → navigates to `quick-interview.html`
3. User finishes/cancels → navigates back to `index.html` (via `window.location.href = 'index.html'`)

**In most cases**, step 3 works because `window.location.href = 'index.html'` triggers a **full page load**, which fires `DOMContentLoaded` again. However, there are specific scenarios where this breaks:

### Scenario A: **bfcache (Back-Forward Cache) Restoration**
Mobile Safari and Chrome aggressively use bfcache. When the user taps the **browser back button** (not an in-app navigation), the browser may:
- Restore the page from bfcache instead of re-executing JS
- `DOMContentLoaded` does **NOT** fire on bfcache restoration
- Only `pageshow` with `event.persisted === true` fires

**Evidence:** The app uses `window.location.href` for most navigation, which should bypass bfcache. But if the user uses the browser/OS back gesture (swipe from left on iOS), bfcache kicks in.

### Scenario B: **`report.html` → Dashboard via Browser Back**
After finishing a report, the user is redirected to `report.html`. If they tap the browser back button from `report.html`, they'd go back to `quick-interview.html` (still in history), not `index.html`. If they tap back again, they might get a bfcached `index.html` with **stale data** — the report cards won't show the newly refined report.

### Scenario C: **PWA Standalone Mode + Page Lifecycle**
In PWA standalone mode (`setupPWANavigation()` in `pwa-utils.js`), internal links are intercepted and use `window.location.href` to prevent breaking out of standalone. However, the **OS-level app switcher** behavior on iOS can suspend the PWA's webview. When the user returns:
- The page may be **resumed from suspension** (not reloaded)
- `DOMContentLoaded` does NOT fire
- `visibilitychange` to `'visible'` DOES fire
- `pageshow` with `event.persisted === true` MAY fire

**This is the most likely cause of Bug 1.** When the user creates a report in the PWA, then switches to another app or goes to home screen briefly, then returns — the dashboard is "alive" but was never re-initialized. The `renderReportCards()` ran with the old data.

### Scenario D: **Race Condition with Cloud Recovery**
`recoverCloudDrafts()` (line 209 of `js/index/main.js`) is fire-and-forget. It runs asynchronously and calls `renderReportCards()` when recovery completes. If:
1. `renderReportCards()` runs first (from main init)
2. `recoverCloudDrafts()` completes later and calls `renderReportCards()` again
3. **But** if cloud recovery fails silently or returns no new data, the first render is the only render

This isn't the primary cause but could contribute to apparent "missing" data.

### What's Missing in `js/index/main.js`:
```
❌ No `pageshow` event listener
❌ No `visibilitychange` event listener
❌ No bfcache detection
❌ No re-render on return from background
```

Compare to `js/interview/main.js` (lines 297-313) and `js/report/main.js` (lines 187-199), which both have `visibilitychange` and `pagehide` handlers (but only for **saving**, not re-rendering).

---

## 3. Bug 2: Backgrounding During AI Processing → Broken Draft

### Root Cause: **THREE compounding issues**

### Issue A: `saveToLocalStorage()` hardcodes `status: 'draft'` (Critical)

**File:** `js/interview/persistence.js`, lines 100-105 and line 178

```javascript
// Line 100-105 — inside the _draft_data object:
meta: {
    createdAt: IS.report.meta?.createdAt,
    version: IS.report.meta?.version || 2,
    naMarked: IS.report.meta?.naMarked || {},
    captureMode: IS.report.meta?.captureMode,
    status: 'draft'              // ← HARDCODED! Ignores IS.report.meta.status
},

// Line 178 — top-level report entry in fvp_current_reports:
const reportData = {
    id: IS.currentReportId,
    project_id: reportProjectId,
    project_name: IS.activeProject?.projectName || '',
    reportDate: todayStr,
    status: 'draft',             // ← HARDCODED AGAIN!
    capture_mode: data.captureMode,
    ...
};
```

When the `visibilitychange → hidden` handler fires (line 298 of `js/interview/main.js`), it calls `saveToLocalStorage()`, which **overwrites** the report status to `'draft'` regardless of the actual `IS.report.meta.status`.

#### The sequence when backgrounding during AI processing:

1. User taps "Finish" → `finishReportFlow()` starts
2. Processing overlay shown, `preProcess()` runs (saves to Supabase with status `'draft'`)
3. AI webhook called (`callProcessWebhook()`) — **this is the async wait point**
4. **User backgrounds the app** (switches to another app, locks phone)
5. `visibilitychange → hidden` fires immediately
6. `saveToLocalStorage()` is called → writes `status: 'draft'` to `fvp_current_reports`
7. `flushInterviewBackup()` is called → writes `status: 'draft'` to Supabase `interview_backup` (because `buildInterviewPageState()` reads from `IS.report.meta.status` which is still `'draft'` at this point — it hasn't been set to `'refined'` yet since the webhook hasn't returned)

**Wait — actually, `IS.report.meta.status` IS still `'draft'` at this point** because:
- `handleOfflineProcessing()` (line 229) sets it to `'pending_refine'`, but that's only called on offline/error
- The main flow doesn't set `pending_refine` before the webhook call — it stays as `'draft'`
- Only AFTER the webhook succeeds does it get set to `'refined'` (line 331)

So the real problem is actually: **the fetch never completes** because:

### Issue B: iOS WebKit Suspends Fetch Requests When Backgrounded

On iOS Safari/WebKit (including PWA webviews), when the app goes to background:
- Active `fetch()` requests may be **suspended or terminated** by the OS
- The `AbortController` timeout (60s) in `callProcessWebhook()` may fire if the app stays backgrounded long enough
- If the fetch is terminated, the promise **never resolves or rejects** in some cases
- When the app returns to foreground, the fetch may or may not resume depending on iOS version and timing

If the fetch is terminated silently:
- The `.catch()` block never fires
- The processing overlay is still visible (but the page may have been killed/reloaded)
- The report stays with `status: 'draft'` in localStorage
- On Supabase `reports` table, status is still `'draft'` (set during `preProcess()`)

If the fetch timeout fires:
- The `.catch()` block fires with AbortError
- `showProcessingError()` + `showNetworkErrorModal()` are called
- But the user can't see these because the app is backgrounded
- When they return, the overlay might still be showing, OR iOS might have killed the page

### Issue C: `getReportHref()` Routes `pending_refine` to `quick-interview.html`

**File:** `js/index/report-cards.js`, lines 167-178

```javascript
function getReportHref(report) {
    const status = report.status;
    if (status === REPORT_STATUS.SUBMITTED) {
        return `archives.html?id=${report.id}`;
    } else if (status === REPORT_STATUS.READY_TO_SUBMIT) {
        return `report.html?tab=preview&date=${reportDate}&reportId=${report.id}`;
    } else if (status === REPORT_STATUS.REFINED) {
        return `report.html?date=${reportDate}&reportId=${report.id}`;
    } else {
        // ← draft AND pending_refine both fall here!
        return `quick-interview.html?reportId=${report.id}`;
    }
}
```

When the user returns to the dashboard after backgrounding during AI processing:
1. Report status is `'draft'` in `fvp_current_reports` (because `saveToLocalStorage()` hardcoded it)
2. Dashboard shows it as a "Draft" card
3. User taps the card → goes to `quick-interview.html?reportId=...`
4. Interview page loads and tries to restore the draft

**But here's where it gets worse:**

### Issue D: `handleOfflineProcessing()` Sets `pending_refine` But `saveToLocalStorage()` Immediately Overwrites It

Looking at the error flow in `finishReportFlow()`:
```javascript
} catch (error) {
    showNetworkErrorModal(
        'Submission Failed', ...,
        () => { handleOfflineProcessing(payload, true); }
    );
}
```

If the user clicks "Save to Drafts" in the error modal:
1. `handleOfflineProcessing()` sets `IS.report.meta.status = 'pending_refine'` (line 229)
2. `saveReport()` is called (line 230)
3. `saveReport()` → `saveToLocalStorage()` → hardcodes `status: 'draft'` ← **overwrites pending_refine!**
4. The `pending_refine` status is **never persisted to localStorage**

This means:
- The Supabase `reports` table might have `status: 'draft'` (from `preProcess()`)
- The localStorage `fvp_current_reports` has `status: 'draft'` (hardcoded)
- The `interview_backup.page_state.meta.status` might have `'draft'` or `'pending_refine'` depending on timing
- **Nothing is consistently `pending_refine`**

### What Happens When User Taps the "Draft" After Interrupted Processing:

1. Dashboard shows card with status `'draft'` → links to `quick-interview.html?reportId=...`
2. Interview page `DOMContentLoaded` fires
3. `checkReportState()` is called → **always returns `true`** (line 14-17 of persistence.js) — no protection
4. `getReport()` tries to load data: localStorage `_draft_data` → IndexedDB → Supabase `interview_backup`
5. Draft data is found and restored (it was saved by the `visibilitychange` handler)
6. The interview page loads with the user's original field notes ← **this actually works!**

**BUT** — if the report was actually processed successfully by the AI (the webhook returned 200 while the app was backgrounded):
- The AI processed the report server-side
- n8n saved results somewhere
- But the client never received the response
- The Supabase `reports.status` may have been updated to `'refined'` by the webhook's own logic... **or not**, because the client-side `saveReportToSupabase()` (which sets `'refined'`) never ran
- The `report_data` table was never populated with AI results (that happens client-side in `finishReportFlow`)
- The `fvp_report_{uuid}` localStorage key was never written

So the user is in a limbo state:
- **If they re-submit from interview page**: It might work (data is intact)
- **If they somehow reach `report.html`**: Empty/error because `report_data` / `fvp_report_{uuid}` was never written

### The "Empty Report Page" Scenario:

This happens when `cloud-recovery.js` runs on the dashboard and finds a report with `status: 'refined'` (if the Supabase `reports` table was updated by some other mechanism), then:
1. `recoverCloudDrafts()` updates local `fvp_current_reports[id].status` to `'refined'`
2. `renderReportCards()` re-renders, now showing the card as "Refined"
3. `getReportHref()` returns `report.html?date=...&reportId=...`
4. User taps card → `report.html` loads
5. `loadReport()` looks for `getReportData(reportId)` → **null** (was never saved locally)
6. Falls through to Supabase `report_data` table → **null** (client never saved it)
7. Falls through to "not found" → shows error toast → redirects to index.html after 2 seconds

This matches the user's description: "the report page loads with nothing — empty/error state"

---

## 4. Additional Issues Found

### 4.1 No Pre-Webhook Status Marker

The `finishReportFlow()` does not set any intermediate status before calling the AI webhook. The flow is:
```
preProcess() → [status still 'draft'] → callProcessWebhook() → [on success] status = 'refined'
```

There should be a `pending_refine` status set **before** the webhook call, both locally and on Supabase, so that:
- If the app is killed mid-processing, the report is in a recoverable `pending_refine` state
- The dashboard can show it as "Processing" instead of "Draft"
- The user can be guided to retry

### 4.2 `handleOfflineProcessing()` Is Broken

**File:** `js/interview/finish-processing.js`, lines 227-237

```javascript
function handleOfflineProcessing(payload, redirectToDrafts = false) {
    IS.report.meta.status = 'pending_refine';
    saveReport();  // ← saveReport() → saveToLocalStorage() → hardcodes 'draft'
    // ...
}
```

Setting `IS.report.meta.status = 'pending_refine'` then immediately calling `saveReport()` → `saveToLocalStorage()` which hardcodes `status: 'draft'` makes the `pending_refine` assignment **dead code**. The status never actually persists as `pending_refine`.

### 4.3 `checkReportState()` Is a No-Op

**File:** `js/interview/persistence.js`, lines 14-17

```javascript
async function checkReportState() {
    return true;  // Always allows page to load
}
```

This was intentionally simplified but means there's no guard against loading a report that's already been refined. If somehow a refined report's card links to `quick-interview.html`, the interview page will load it as an editable draft.

### 4.4 `flushInterviewBackup()` During AI Processing Saves Stale State

When `visibilitychange → hidden` fires during AI processing:
1. `flushInterviewBackup()` writes to Supabase `interview_backup` with `status: 'draft'`
2. This may overwrite a more recent state if the webhook response arrives after the visibility change

### 4.5 No Mechanism to Detect/Recover from Interrupted AI Processing

There is no:
- Server-side status tracking for "AI processing in flight"
- Client-side recovery flow for "webhook was called but response never received"
- Dashboard UI to show "processing interrupted, tap to retry"

---

## 5. Proposed Fixes

### Fix 1: Add `pageshow` + `visibilitychange` Handlers to Dashboard (Bug 1)

**File:** `js/index/main.js`  
**Where:** After the `DOMContentLoaded` block (after line 231)

```javascript
// ============ PAGE LIFECYCLE: Re-render on return ============
// bfcache restoration — browser restored page from back-forward cache
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[INDEX] bfcache restoration detected — re-rendering');
        refreshDashboard();
    }
});

// visibilitychange — app returns from background (PWA, tab switch)
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        console.log('[INDEX] Page became visible — re-rendering');
        refreshDashboard();
    }
});

/**
 * Lightweight dashboard refresh — re-reads localStorage and re-renders.
 * Does NOT re-fetch from Supabase (that's handled by cloud-recovery on full load).
 */
function refreshDashboard() {
    try {
        // Re-read projects from cache/localStorage
        var projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
        if (Object.keys(projectsMap).length > 0 || projectsCache.length > 0) {
            renderReportCards();
            updateReportStatus();
        }
        
        // If online, also do a lightweight cloud recovery
        if (navigator.onLine) {
            recoverCloudDrafts();
        }
    } catch (err) {
        console.error('[INDEX] Dashboard refresh failed:', err);
    }
}
```

**Impact:** Fixes Bug 1 for all scenarios (bfcache, PWA background/resume, tab switch).

---

### Fix 2: Fix `saveToLocalStorage()` to Use Actual Status (Bug 2, Critical)

**File:** `js/interview/persistence.js`  
**Lines:** 103 and 178

**Change 1 — line 103** (inside `_draft_data.meta`):
```javascript
// BEFORE:
status: 'draft'

// AFTER:
status: IS.report.meta?.status || 'draft'
```

**Change 2 — line 178** (top-level `reportData.status`):
```javascript
// BEFORE:
status: 'draft',

// AFTER:
status: IS.report.meta?.status || 'draft',
```

**Impact:** Ensures that when `visibilitychange` fires during AI processing, the actual status (`draft`, `pending_refine`, etc.) is preserved.

---

### Fix 3: Set `pending_refine` Before Webhook Call (Bug 2, Critical)

**File:** `js/interview/finish-processing.js`  
**Where:** Inside `finishReportFlow()`, after `await options.preProcess()` and before `callProcessWebhook()` — around line 304

```javascript
    // Mode-specific save/upload ordering (steps 1-2)
    await options.preProcess();

    setProcessingStep(3, 'active');

    // === NEW: Mark as pending_refine BEFORE webhook call ===
    // This ensures the report is in a recoverable state if the app is
    // killed/backgrounded during AI processing.
    IS.report.meta.status = 'pending_refine';
    saveToLocalStorage();  // Persist to localStorage (requires Fix 2)
    
    // Also update Supabase reports table status
    try {
        await supabaseClient
            .from('reports')
            .update({ status: 'pending_refine', updated_at: new Date().toISOString() })
            .eq('id', IS.currentReportId);
    } catch (e) {
        console.warn('[FINISH] Could not set pending_refine on Supabase:', e);
    }

    // Build payload
    const payload = buildProcessPayload();
```

**Impact:** If the app is killed during AI processing, the report will be in `pending_refine` state, not `draft`. This enables proper recovery flows.

---

### Fix 4: Handle `pending_refine` in `getReportHref()` (Bug 2)

**File:** `js/index/report-cards.js`  
**Lines:** 167-178

```javascript
// BEFORE:
function getReportHref(report) {
    const status = report.status;
    const reportDate = report.reportDate;
    if (status === REPORT_STATUS.SUBMITTED) {
        return `archives.html?id=${report.id}`;
    } else if (status === REPORT_STATUS.READY_TO_SUBMIT) {
        return `report.html?tab=preview&date=${reportDate}&reportId=${report.id}`;
    } else if (status === REPORT_STATUS.REFINED) {
        return `report.html?date=${reportDate}&reportId=${report.id}`;
    } else {
        return `quick-interview.html?reportId=${report.id}`;
    }
}

// AFTER:
function getReportHref(report) {
    const status = report.status;
    const reportDate = report.reportDate;
    if (status === REPORT_STATUS.SUBMITTED) {
        return `archives.html?id=${report.id}`;
    } else if (status === REPORT_STATUS.READY_TO_SUBMIT) {
        return `report.html?tab=preview&date=${reportDate}&reportId=${report.id}`;
    } else if (status === REPORT_STATUS.REFINED) {
        return `report.html?date=${reportDate}&reportId=${report.id}`;
    } else if (status === REPORT_STATUS.PENDING_REFINE) {
        // Interrupted AI processing — go to interview page for retry
        return `quick-interview.html?reportId=${report.id}`;
    } else {
        return `quick-interview.html?reportId=${report.id}`;
    }
}
```

Note: The href is the same for `pending_refine` and `draft`, but separating them makes the intent explicit and allows future differentiation (e.g., a dedicated retry page).

---

### Fix 5: Add `pending_refine` Recovery Flow on Interview Page Init (Bug 2)

**File:** `js/interview/main.js`  
**Where:** After `checkReportState()` (around line 165), add detection for interrupted processing

```javascript
// After: const canEdit = await checkReportState();

// Check if this is a pending_refine report that needs retry
const storedReport = getCurrentReport(urlReportId || IS.currentReportId);
if (storedReport && storedReport.status === 'pending_refine') {
    console.log('[INIT] Detected interrupted AI processing — showing retry prompt');
    // The report data is intact (saved by visibilitychange handler)
    // Show a banner or modal offering to retry AI processing
    hideLoadingOverlay();
    showInterruptedProcessingBanner();
    // Don't return — still load the page so user can edit if they want
}
```

And add a helper function in `js/interview/ui-flow.js`:
```javascript
function showInterruptedProcessingBanner() {
    const banner = document.createElement('div');
    banner.id = 'interruptedBanner';
    banner.className = 'fixed top-0 left-0 right-0 bg-dot-blue text-white text-center py-3 px-4 z-[9999]';
    banner.innerHTML = `
        <p class="text-sm font-bold mb-1">AI processing was interrupted</p>
        <p class="text-xs mb-2">Your field notes are safe. Tap below to retry.</p>
        <button onclick="retryInterruptedProcessing()" class="bg-white text-dot-blue px-4 py-1.5 text-xs font-bold uppercase">
            <i class="fas fa-redo mr-1"></i> Retry Processing
        </button>
        <button onclick="dismissInterruptedBanner()" class="ml-2 text-white/70 text-xs underline">
            Continue Editing
        </button>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
}
```

---

### Fix 6: Save AI Processing State to Enable Server-Side Recovery (Bug 2, Enhancement)

**File:** `js/interview/finish-processing.js`  
**Where:** Before the webhook call, save the payload to enable recovery

```javascript
// Before callProcessWebhook():
// Save the payload so it can be retried if processing is interrupted
try {
    localStorage.setItem(
        `fvp_pending_payload_${IS.currentReportId}`,
        JSON.stringify({ payload, timestamp: Date.now() })
    );
} catch (e) {
    console.warn('[FINISH] Could not cache pending payload:', e);
}

// After successful processing (before redirect):
// Clean up the cached payload
localStorage.removeItem(`fvp_pending_payload_${IS.currentReportId}`);
```

Then in the retry flow, the payload can be recovered without re-building it from potentially stale page state.

---

### Fix 7: Prevent `flushInterviewBackup()` from Firing During AI Processing

**File:** `js/interview/main.js`  
**Where:** Lines 297-313 (visibilitychange + pagehide handlers)

Add a guard to prevent the backup flush from running when AI processing is in-flight:

```javascript
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && IS.currentReportId) {
        console.log('[HARDENING] visibilitychange → hidden, saving...');
        saveToLocalStorage();
        // Only flush backup if we're NOT in the middle of AI processing
        // (the processing overlay being visible is the indicator)
        const processingOverlay = document.getElementById('processingOverlay');
        if (!processingOverlay || processingOverlay.classList.contains('hidden')) {
            flushInterviewBackup();
        } else {
            console.log('[HARDENING] Skipping backup flush — AI processing in flight');
        }
    }
});
```

**Impact:** Prevents overwriting Supabase `interview_backup` with stale data during AI processing.

---

### Fix 8: Add `report_data` Recovery via Supabase `ai_submissions` Table (Bug 2, Enhancement)

When the user reaches `report.html` but `report_data` is missing, there's currently no recovery path from the AI submission data. The `ai_submissions` table has the AI response saved by `saveAIResponse()`.

**File:** `js/report/data-loading.js`  
**Where:** Inside `loadReport()`, after the `report_data` Supabase fallback (around line 75), add an `ai_submissions` fallback:

```javascript
// After: if (rdResult.data && !rdResult.error) { ... }

// Sprint XX: If report_data not found, try recovering from ai_submissions
if (!reportData && navigator.onLine) {
    try {
        console.log('[LOAD] report_data miss — trying ai_submissions fallback...');
        var aiResult = await supabaseClient
            .from('ai_submissions')
            .select('ai_response, original_input')
            .eq('report_id', reportIdParam)
            .maybeSingle();

        if (aiResult.data && !aiResult.error && aiResult.data.ai_response) {
            console.log('[LOAD] Recovered from ai_submissions');
            reportData = {
                aiGenerated: aiResult.data.ai_response,
                originalInput: aiResult.data.original_input || {},
                userEdits: {},
                captureMode: aiResult.data.original_input?.captureMode || 'minimal',
                status: 'refined',
                createdAt: null,
                lastSaved: null,
                reportDate: null
            };
            
            // Get metadata from reports table
            try {
                var metaResult = await supabaseClient
                    .from('reports')
                    .select('report_date, created_at')
                    .eq('id', reportIdParam)
                    .maybeSingle();
                if (metaResult.data) {
                    reportData.reportDate = metaResult.data.report_date;
                    reportData.createdAt = metaResult.data.created_at;
                }
            } catch (metaErr) {}

            // Cache to both localStorage and Supabase report_data
            saveReportData(reportIdParam, reportData);
            showToast('Report recovered from AI processing history', 'success');
        }
    } catch (err) {
        console.error('[LOAD] ai_submissions recovery failed:', err);
    }
}
```

**Impact:** Provides a last-resort recovery path for the exact scenario where AI processing succeeded but the client never received the response.

---

## 6. Fix Priority Matrix

| Fix | Priority | Effort | Impact | Fixes Bug |
|-----|----------|--------|--------|-----------|
| **Fix 1:** Dashboard `pageshow`/`visibilitychange` | 🔴 P0 | Small | High | Bug 1 |
| **Fix 2:** `saveToLocalStorage()` use actual status | 🔴 P0 | Tiny | Critical | Bug 2 |
| **Fix 3:** Set `pending_refine` before webhook | 🔴 P0 | Small | Critical | Bug 2 |
| **Fix 4:** Handle `pending_refine` in `getReportHref()` | 🟡 P1 | Tiny | Medium | Bug 2 |
| **Fix 5:** Recovery banner on interview page | 🟡 P1 | Medium | High | Bug 2 |
| **Fix 6:** Cache pending payload for retry | 🟡 P1 | Small | Medium | Bug 2 |
| **Fix 7:** Guard backup flush during processing | 🟢 P2 | Tiny | Low | Bug 2 |
| **Fix 8:** `ai_submissions` recovery fallback | 🟢 P2 | Medium | Medium | Bug 2 |

### Recommended Implementation Order:
1. **Fix 2** (2 line changes — immediate impact)
2. **Fix 1** (add event listeners to dashboard)
3. **Fix 3** (set pending_refine before webhook)
4. **Fix 4** (explicit pending_refine handling in getReportHref)
5. **Fix 5** (recovery UI)
6. **Fix 7** (guard backup flush)
7. **Fix 6** (cache payload)
8. **Fix 8** (ai_submissions fallback)

---

## Appendix: File/Line Reference

| File | Line(s) | Issue |
|------|---------|-------|
| `js/index/main.js` | 134-231 | Only `DOMContentLoaded`, no `pageshow`/`visibilitychange` |
| `js/interview/persistence.js` | 103 | `_draft_data.meta.status` hardcoded to `'draft'` |
| `js/interview/persistence.js` | 178 | `reportData.status` hardcoded to `'draft'` |
| `js/interview/finish-processing.js` | 229-230 | `handleOfflineProcessing()` sets `pending_refine` but save overwrites it |
| `js/interview/finish-processing.js` | ~304 | No `pending_refine` set before webhook call |
| `js/interview/main.js` | 297-313 | `visibilitychange`/`pagehide` save during AI processing clobbers state |
| `js/index/report-cards.js` | 167-178 | `getReportHref()` doesn't explicitly handle `pending_refine` |
| `js/interview/persistence.js` | 14-17 | `checkReportState()` is a no-op |
| `js/report/data-loading.js` | 55-100 | No `ai_submissions` fallback for recovery |
