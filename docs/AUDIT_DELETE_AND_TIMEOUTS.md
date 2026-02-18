# Audit: Delete Flow + Timeout Issues
**Date:** 2026-02-18 ~00:40 CST
**Auditor:** George (Opus 4.6)
**Status:** Independent analysis (sub-agent audit stalled, completed manually)

---

## 1. Delete from report.html — `js/report/delete-report.js`

### Flow
```
User taps delete → confirmDeleteReport() → modal shows
User confirms → executeDeleteReport() → deleteReportFull(reportId) [fire-and-forget .then()]
                                        → window.location.href = 'index.html' [IMMEDIATE]
```

### Root Cause: Navigation kills in-flight Supabase request
- `deleteReportFull()` is called but NOT awaited
- `window.location.href = 'index.html'` fires on the very next line
- The Supabase `.update({ status: 'deleted' })` inside `deleteReportFull()` is an async network call
- Browser navigates away → pending fetch is aborted → soft-delete never reaches Supabase
- IDB cleanup in `deleteReportFull()` MAY partially complete (it's local), but Supabase won't

### Evidence
- Debug logs show zero `[DELETE]` entries from `report.html` — confirming the request gets killed
- Dashboard swipe-delete works because it does NOT navigate (stays on page)

### Proposed Fix
Change `executeDeleteReport()` to `await deleteReportFull()` before navigating:
```js
async function executeDeleteReport() {
    hideDeleteModal();
    if (!RS.currentReportId) { ... }
    var _reportId = RS.currentReportId;
    console.log('[DELETE] Deleting report:', _reportId);
    
    var result = await deleteReportFull(_reportId);  // AWAIT the soft-delete
    if (result.success) {
        console.log('[DELETE] Full delete complete');
    } else {
        console.warn('[DELETE] Delete had errors:', result.errors);
    }
    window.location.href = 'index.html';
}
```

---

## 2. Delete from quick-interview.html — `js/interview/persistence.js`

### Flow
```
User taps cancel → showCancelReportModal() → modal
User confirms → confirmCancelReport():
    1. await deleteReportFull(_reportId)  ← AWAITS (good)
    2. IS.currentReportId = null          ← clears state
    3. window.location.href = 'index.html' ← navigates
    4. deleteReportFromSupabase(_reportId)  ← AFTER navigate (dead code!)
```

### Root Cause: Double-delete + dead code after navigation
- `deleteReportFull()` IS properly awaited — soft delete should work HERE
- BUT after navigation, `deleteReportFromSupabase()` calls `deleteReportCascade()` which does HARD DELETE (`.delete()` on the reports row)
- This hard delete fires after `window.location.href` — the browser has already started navigating, so this code likely never executes
- Even if it did execute, it would hard-delete the row that was just soft-deleted, which contradicts the soft-delete strategy

### Wait — if deleteReportFull is awaited, why isn't it working?
Looking more carefully at `deleteReportFull()`:
```js
// 4. Supabase soft-delete
if (typeof supabaseClient !== 'undefined' && supabaseClient && reportId.length === 36) {
    var updateResult = await supabaseClient
        .from('reports')
        .update({ status: 'deleted' })
        .eq('id', reportId);
```

The condition `reportId.length === 36` — this is a UUID length check. Standard UUIDs are 36 chars (with hyphens). This should pass for all valid report IDs.

**Possible issue:** RLS (Row Level Security). The Supabase update uses the anon key (from the client). If the RLS policy on `reports` doesn't allow the authenticated user to UPDATE their own rows, the update silently fails. The code checks `updateResult.error` but doesn't throw — it just pushes to the errors array.

**Another possible issue:** The `await` in `confirmCancelReport` wraps `deleteReportFull` in a try/catch. If `deleteReportFull` throws, the catch shows an alert and does NOT navigate. But if it succeeds (with soft errors), it navigates fine.

### Proposed Fix
1. Remove the `deleteReportFromSupabase(_reportId)` call entirely (it's dead code + contradicts soft-delete)
2. Verify RLS allows UPDATE on reports table for authenticated users
3. Add console.log after the Supabase update to confirm it completes

---

## 3. Timeout Issue — `js/index/main.js`

### The `withTimeout` helper
Located at top of main.js. Pattern:
```js
function withTimeout(promise, ms, fallback, label) {
    return Promise.race([
        promise,
        new Promise(function(resolve) {
            setTimeout(function() {
                console.warn('[TIMEOUT] ' + label + ' timed out after ' + ms + 'ms');
                resolve(fallback);
            }, ms);
        })
    ]);
}
```

### Root Cause: Timeout promise is never cancelled
- `Promise.race` resolves with whichever settles first
- If the real data wins, `Promise.race` resolves with data ✅
- But the timeout `setTimeout` is still pending — it fires later and logs a warning
- The warning is cosmetic: data already loaded, the `resolve(fallback)` call is ignored by `Promise.race`
- But the `console.warn` still fires, polluting debug_logs

### Why this is low priority
- Data loads correctly — the timeout is just a fallback in case data is slow
- The console.warn is the only side effect
- No data corruption, no UX impact
- It does add noise to debug_logs table which costs Supabase writes

### Cleanest fix (when ready)
Use an abort flag:
```js
function withTimeout(promise, ms, fallback, label) {
    var timedOut = false;
    var timer;
    return Promise.race([
        promise.then(function(result) {
            clearTimeout(timer);
            return result;
        }),
        new Promise(function(resolve) {
            timer = setTimeout(function() {
                timedOut = true;
                console.warn('[TIMEOUT] ' + label + ' timed out after ' + ms + 'ms');
                resolve(fallback);
            }, ms);
        })
    ]);
}
```

This clears the timeout when data arrives first, preventing the spurious warning.

---

## 4. Other Delete Callers (grep results)

```
js/shared/delete-report.js     — deleteReportCascade (hard delete), deleteReportFull (soft delete)
js/report/delete-report.js     — calls deleteReportFull (fire-and-forget) ← BUG
js/interview/persistence.js    — calls deleteReportFull (awaited) + deleteReportFromSupabase (dead code) ← BUG
js/index/report-cards.js       — calls deleteReportFull (fire-and-forget, but no navigation) ← FIXED in a17defa
js/index/report-creation.js    — may have legacy delete calls (needs check)
js/shared/realtime-sync.js     — handles DELETE events from Realtime ← FIXED in a17defa
```

### `deleteReportCascade` vs `deleteReportFull`
- `deleteReportCascade` = OLD hard delete (`.delete()` rows from all tables)
- `deleteReportFull` = NEW soft delete (`.update({ status: 'deleted' })`)
- Both still exist in `js/shared/delete-report.js`
- `deleteReportCascade` is still called by `deleteReportFromSupabase` in persistence.js
- After fixing persistence.js, `deleteReportCascade` has NO callers from active code paths
- Could be kept for admin/recovery use or removed later

---

## 5. RLS Verification Needed

The soft-delete does `.update({ status: 'deleted' }).eq('id', reportId)` using the authenticated client. This requires:
- RLS policy on `reports` table allows UPDATE for `auth.uid() = user_id`
- If no UPDATE policy exists, the Supabase client returns `{ data: null, error: null, count: 0 }` — a silent no-op

**ACTION:** Check RLS policies on reports table to confirm UPDATE is allowed.

---

## Summary of Required Changes

| Priority | File | Change | Risk |
|----------|------|--------|------|
| P0 | js/report/delete-report.js | `await deleteReportFull()` before navigate | Low |
| P0 | js/interview/persistence.js | Remove `deleteReportFromSupabase()` call (dead code + contradicts soft-delete) | Low |
| P1 | Supabase RLS | Verify UPDATE policy on reports table | Medium |
| P2 | js/index/main.js | Add `clearTimeout` to `withTimeout` helper | Low |
