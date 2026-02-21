# Dashboard Sync Simplification — Plan Review

## Scope Reviewed
I reviewed the current implementation in:
- `js/index/*.js`
- `js/shared/*.js`
- `js/interview/*.js`
- `js/report/*.js`

Key files used as evidence:
- `js/index/main.js`
- `js/shared/data-store.js`
- `js/index/cloud-recovery.js`
- `js/shared/realtime-sync.js`
- `js/shared/broadcast.js`
- `js/shared/delete-report.js`
- `js/index/report-cards.js`
- `js/interview/persistence.js`
- `js/report/data-loading.js`
- `js/report/autosave.js`
- `js/storage-keys.js`
- `index.html`

## Executive Verdict
Your direction is correct: simplifying dashboard sync to a user-driven pull model and treating Supabase as online truth will remove most race conditions causing zombie report resurrection.

However, the plan is missing a few implementation details and has two important correctness gaps:
1. Stopping only the `initRealtimeSync()` call in dashboard is not enough to fully disable realtime behavior on dashboard.
2. Removing `recoverCloudDrafts()` without replacement drops cross-device draft pre-caching that currently enables some offline follow-up behavior.

## What Is Correct In Your Plan
- Removing dashboard calls to realtime + broadcast is directionally right (`js/index/main.js:302-311`).
- Removing dashboard use of `syncReportsFromCloud()` avoids the current complex reconciliation branch that preserves local-only data and depends on deleted blocklist (`js/shared/data-store.js:596-760`).
- Removing triple refresh triggers/cooldown queue in dashboard makes sense for manual-refresh architecture (`js/index/main.js:342-374`, `js/index/main.js:627-670`).
- Keeping IDB-first render is correct and already aligned with current flow (`js/index/main.js:458-493`).
- Adding explicit reconnect push for offline-created/changed/deleted reports is needed; currently there is no durable report dirty queue.

## Issues / Missing Pieces

### 1) Realtime can still reinitialize on dashboard even if you remove `initRealtimeSync()` call
- `realtime-sync.js` registers global listeners at file load time:
  - `online` re-calls `initRealtimeSync()` (`js/shared/realtime-sync.js:344-349`)
  - `visibilitychange` visible re-calls `initRealtimeSync()` (`js/shared/realtime-sync.js:370-375`)
  - `pageshow` persisted re-calls `initRealtimeSync()` (`js/shared/realtime-sync.js:379-383`)
- `index.html` always loads `./js/shared/realtime-sync.js` (`index.html:29`).

Implication: dashboard can still reconnect realtime later unless you also gate realtime by page path or stop loading that script on dashboard.

### 2) Removing `recoverCloudDrafts()` loses current draft pre-caching behavior
- `recoverCloudDrafts()` currently does more than metadata recovery:
  - caches `report_data` (`js/index/cloud-recovery.js:107-137`)
  - caches `interview_backup` into `_draft_data` (`js/index/cloud-recovery.js:138-146`, `js/index/cloud-recovery.js:209-266`)
  - rehydrates cloud photos (`js/index/cloud-recovery.js:148-188`)
- Interview page offline behavior depends on local draft availability; if offline and no IDB draft exists, it falls back to fresh report (`js/interview/persistence.js:971-974`).
- Report page similarly relies on local `reportData` when offline (`js/report/data-loading.js:57-71`, `js/report/data-loading.js:175-191`).

Implication: if dashboard only pulls report metadata, users who synced on dashboard but later go offline may not be able to continue cross-device drafts/refined reports without reopening online first.

### 3) Current delete flow has no offline replay; your pending-delete idea is necessary
- `deleteReportFull()` always attempts Supabase update, and on offline failure just returns errors (`js/shared/delete-report.js:173-189`).
- UI removes locally immediately (`js/index/report-cards.js:751-760`), so cloud can remain undeleted.

Your `_pendingDelete` (or queue) is required if you remove blocklist-based anti-resurrection.

### 4) `pullFromSupabase()` should define project scope and write behavior explicitly
- Projects are currently org-scoped by `org_id` in data layer (`js/data-layer.js:104-113`).
- If you bypass `dataLayer.refreshProjectsFromCloud()` and query directly, preserve the same org filter behavior.

### 5) Manual refresh UX currently does full page reload, not in-app pull
- `pull-to-refresh.js` desktop button calls `window.manualRefresh()` if present, otherwise `location.reload()` (`js/shared/pull-to-refresh.js:69-75`).
- `window.manualRefresh` is not currently defined in codebase.

If you want “refresh button = pullFromSupabase”, you should provide `window.manualRefresh` on dashboard.

### 6) `_dirty` design needs operation typing, not just boolean
A single `_dirty` flag is not enough to safely replay changes. You need at least:
- operation type: `upsert` vs `delete`
- dirty timestamp (for deterministic ordering)
- retry metadata (attempt count / last error optional)
- clear-on-success semantics

Without operation typing, delete-vs-update races can replay incorrectly after reconnect.

## Answers To Your Questions

### 1) Is there anything in current sync mechanisms that provides value we'd lose?
Yes:
- `recoverCloudDrafts()` pre-caches `report_data` and `interview_backup`, which currently improves cross-device continuity and some offline follow-up flows (`js/index/cloud-recovery.js:107-146`).
- Realtime currently gives instant same-session propagation across tabs/devices (`js/shared/realtime-sync.js`).

If the product accepts manual refresh + eventual sync, losing realtime is fine. The pre-cache loss is the bigger functional tradeoff.

### 2) Edge cases around offline report creation not handled?
Yes:
- Offline delete replay: must persist and replay delete intent (currently missing in code; you propose it correctly).
- Offline create/edit replay ordering: if a report is created then deleted offline, replay must send only delete (or delete-after-create order).
- App kill before reconnect: dirty state must survive reload in IDB.
- UUID validity check: current delete cloud call requires UUID length 36 (`js/shared/delete-report.js:174`); dirty replay should handle malformed IDs deterministically.

### 3) Should `pullFromSupabase()` fetch `report_data` and `interview_backup`?
For dashboard rendering: metadata-only is sufficient.

For preserving current cross-device offline continuation behavior: metadata-only is not sufficient. If you remove cloud recovery, then either:
- accept this behavior regression explicitly, or
- add targeted prefetch for likely-open reports (for example drafts/pending_refine) to cache `interview_backup` and maybe `report_data`.

### 4) Safe to stop writing deleted blocklist from dashboard delete flows while interview/report pages still read it?
Only if dashboard no longer relies on realtime/cloud-recovery paths that can resurrect local deletes.

Given your target architecture, yes in principle. But today, because realtime script still auto-reinits via global listeners (`js/shared/realtime-sync.js:344-383`), removing blocklist writes without fully isolating dashboard from realtime leaves a resurrection risk.

### 5) Concerns about `_dirty` flag approach?
Yes, but fixable:
- Use structured sync state (`_pendingSync: { op, dirtyAt, attempts }`) rather than boolean `_dirty`.
- Keep it on report records only if all writers preserve unknown fields; otherwise use a dedicated IDB store (safer if multiple modules overwrite metadata objects).
- Ensure push is idempotent and followed by authoritative pull.

## Recommended Adjustments Before Implementation
1. Fully disable realtime on dashboard page, not just startup call removal.
2. Decide explicitly whether losing dashboard-side draft content pre-cache is acceptable.
3. Define a durable sync intent schema for offline replay (`upsert`/`delete`).
4. Add `window.manualRefresh` on dashboard so refresh UI triggers pull, not reload fallback.
5. Keep `pullFromSupabase()` metadata query simple, then always overwrite IDB and re-render.

