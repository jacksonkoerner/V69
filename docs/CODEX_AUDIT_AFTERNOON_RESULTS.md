# FieldVoice Pro Afternoon Audit Results
Date: 2026-02-18

## 1) Traced Code Paths (with line refs)

### A. Delete flow: Dashboard card swipe/button -> `deleteReportFull()` -> soft delete -> dashboard refresh
1. UI tap path starts in dashboard card template:
- Delete affordance invokes `confirmDeleteReport(uuid)` in `js/index/report-cards.js:223`.
- Confirm modal wires OK button to `executeDeleteReport(reportId, overlay)` in `js/index/report-cards.js:562`.

2. Dashboard delete handler behavior:
- Immediate optimistic UI removal and re-render before cloud delete completes in `js/index/report-cards.js:578-594`.
- Actual delete is async and not awaited (`deleteReportFull(reportId).then(...)`) in `js/index/report-cards.js:597-613`.
- In-memory cache is filtered only inside `.then(...)` in `js/index/report-cards.js:604-607`.

3. Shared delete implementation:
- Entry point `deleteReportFull(reportId)` in `js/shared/delete-report.js:124`.
- Blocklist add first in `js/shared/delete-report.js:131-136`.
- Clears `ACTIVE_REPORT_ID` if matching in `js/shared/delete-report.js:138-145`.
- IDB deletes (report/reportData/draft/photos) via `Promise.allSettled` in `js/shared/delete-report.js:147-163`.
- Supabase soft delete `reports.update({ status: 'deleted' }).eq('id', reportId)` in `js/shared/delete-report.js:165-177`.
- Local BroadcastChannel notify `{ type: 'report-deleted' }` in `js/shared/delete-report.js:180-182`.

4. Dashboard refresh triggers:
- Broadcast listener triggers `refreshDashboard('broadcast')` in `js/index/main.js:262-268`.
- Full refresh path calls render from local state, IDB/cloud reload, and cloud reconciliation in `js/index/main.js:347-505`.

### B. Delete flow: Report page delete
- Modal confirm handler `executeDeleteReport()` awaits `deleteReportFull` in `js/report/delete-report.js:25-39`.
- Redirect to dashboard regardless of success/failure in `js/report/delete-report.js:39-46`.

### C. Realtime cross-device delete propagation
1. Device A marks report deleted (soft delete) in `js/shared/delete-report.js:168-171`.
2. Device B receives Realtime `reports` UPDATE in `js/shared/realtime-sync.js:34-44`.
3. Delete-specific branch when `status==='deleted'` in `js/shared/realtime-sync.js:275-293`:
- Adds blocklist, deletes local IDB artifacts (`deleteReport`, `deleteReportData`, `deleteDraftData`, `deletePhotosByReportId`) in `js/shared/realtime-sync.js:277-285`.
- Sends local Broadcast `report-deleted` in `js/shared/realtime-sync.js:286-288`.
- Calls `renderReportCards()` in `js/shared/realtime-sync.js:289-291`.

### D. Sync architecture: Broadcast for interview/report edits
1. Broadcast subscription setup:
- Realtime broadcast channel `sync:{reportId}` initialized in `js/shared/realtime-sync.js:83-97`.

2. Receive path:
- `_handleSyncBroadcast(payload)` in `js/shared/realtime-sync.js:120-160`.
- Self-filter via session id in `js/shared/realtime-sync.js:122-124`.
- Cross-page warning branch in `js/shared/realtime-sync.js:131-143`.
- Fetch debounce gate `_fetchMergePending` in `js/shared/realtime-sync.js:145-159`.

3. Fetch and merge:
- Interview fetch from `interview_backup` or report fetch from `report_data` in `js/shared/realtime-sync.js:170-183`.
- Null/error warning path in `js/shared/realtime-sync.js:185-188`.
- Staleness check using `_lastMergeAt` in `js/shared/realtime-sync.js:191-199`.
- Interview merge engine invocation in `js/shared/realtime-sync.js:208-224`.
- Report merge via `applyReportMerge(result.data)` in `js/shared/realtime-sync.js:225-230`.

4. Broadcast send path (interview):
- Draft save marks dirty + debounce in `js/interview/persistence.js:833-837`.
- Flush upserts `interview_backup` in `js/interview/persistence.js:891-900`.
- On success sends `broadcastSyncUpdate(..., 'quick-interview')` in `js/interview/persistence.js:905-907`.

5. Broadcast send path (report page):
- `report_data` autosave flush in `js/report/autosave.js:325-355`.
- On success sends `broadcastSyncUpdate(..., 'report')` in `js/report/autosave.js:347-350`.

### E. Dashboard emergency localStorage render path
- Immediate call in startup `DOMContentLoaded` in `js/index/main.js:210-214`.
- Called again at top of every `refreshDashboard` in `js/index/main.js:367-369`.
- Function itself always logs `Emergency localStorage render complete` in `js/index/main.js:512-523`.

## 2) Bugs / Issues Found

### P0 / High
1. Dashboard delete is non-blocking and re-renders from stale cache before delete completes, causing “delete didn’t work” behavior (flicker/reappearance).
- Evidence: `executeDeleteReport` removes card immediately and calls `renderReportCards()` before cache mutation/cloud result (`js/index/report-cards.js:578-594`), while cache update happens later in `.then(...)` (`js/index/report-cards.js:604-610`).

2. Soft-delete success is not verified against affected row count; silent no-op is possible.
- Evidence: `update(...).eq('id', reportId)` only checks `updateResult.error` (`js/shared/delete-report.js:168-174`). If 0 rows update (RLS/filter mismatch), function can still return success.

3. Report-page and interview cancel flows redirect even when delete had errors, masking failures.
- Evidence: report page always redirects after warning (`js/report/delete-report.js:39-46`); interview cancel redirects immediately after await without checking `result.success` (`js/interview/persistence.js:50-58`).

4. Realtime delete handler removes from IDB but does not update `window.currentReportsCache` before rendering, so dashboard can continue showing deleted rows until later refresh.
- Evidence: delete branch in `js/shared/realtime-sync.js:275-291` calls `renderReportCards()` but never prunes `window.currentReportsCache`.

5. `drainPendingBackups()` uploads `draftData` directly as `interview_backup.page_state`, but schema differs from `buildInterviewPageState()` and restore readers.
- Evidence: drain writes `page_state: draftData` in `js/interview/persistence.js:603-610`; draft shape from `saveToLocalStorage` is different (`js/interview/persistence.js:81-157`) vs canonical backup shape (`js/interview/persistence.js:839-877`) and restore expectations (`js/interview/persistence.js:975-995`). This can drop/mis-map fields cross-device.

### P1 / Medium
6. Broadcast merge can miss updates: `_fetchMergePending` drops subsequent broadcasts while a fetch is in-flight.
- Evidence: early return when pending (`js/shared/realtime-sync.js:145-149`) with no queued rerun for skipped events.

7. Realtime broadcast metadata `revision` is emitted but never used to order/guard merges.
- Evidence: revision is sent (`js/shared/realtime-sync.js:251`, `js/interview/persistence.js:814-815`, `js/report/autosave.js:310`) but receive path only uses timestamp `_lastMergeAt` (`js/shared/realtime-sync.js:191-199`).

8. `refreshDashboard` can drop valid delete/update events due cooldown and no “pending rerun” queue.
- Evidence: exits when already running (`js/index/main.js:349-352`) or within cooldown (`js/index/main.js:357-360`), including broadcast-triggered refreshes.

9. `syncReportsFromCloud` comment says deleted blocklist is respected, but implementation never checks blocklist.
- Evidence: comment in `js/shared/data-store.js:593`, no `isDeletedReport(...)` check in reconciliation loop (`js/shared/data-store.js:635-689`). During delete races this allows resurrection from cloud state.

10. `[SYNC-BC] Fetch returned no data or error: null` warning is expected in legitimate `maybeSingle()` no-row cases, but treated as warn and no retry path exists.
- Evidence: null/no-data path in `js/shared/realtime-sync.js:185-188`; this creates noisy diagnostics and can skip first merge after broadcast.

### P2 / Low
11. “Emergency localStorage render” runs every load by design, not only emergency.
- Evidence: called on startup and each refresh (`js/index/main.js:210-214`, `js/index/main.js:367-369`), and logs emergency wording every time (`js/index/main.js:522`).

12. Deleted blocklist trimming in dashboard uses wrong key (`fvp_deleted_reports`) and never affects actual blocklist key.
- Evidence: trim code uses literal in `js/index/main.js:477-483`; real key is `STORAGE_KEYS.DELETED_REPORT_IDS = 'fvp_deleted_report_ids'` (`js/storage-keys.js:47`).

## 3) Direct answers to requested checks

1. Delete flow failures/silent points:
- Main breakpoints are stale cache re-render before async completion (`js/index/report-cards.js:578-594`), soft-delete “success” without affected-row validation (`js/shared/delete-report.js:168-174`), and redirect-on-error paths (`js/report/delete-report.js:39-46`, `js/interview/persistence.js:50-58`).

2. Cross-device delete propagation reliability:
- Cloud propagation path exists and is mostly correct (soft delete -> Realtime UPDATE -> local IDB delete) via `js/shared/delete-report.js:168-171` and `js/shared/realtime-sync.js:275-285`.
- Immediate UI removal on receiving device is unreliable due stale in-memory cache not being pruned before render (`js/shared/realtime-sync.js:289-291`). Eventual consistency is recovered by full dashboard refresh/sync (`js/index/main.js:347-505`).

3. Broadcast sync architecture health:
- Core structure is sound (REST fetch + three-way merge + self-filter), but there are race windows and dropped-event paths (`js/shared/realtime-sync.js:145-159`, `js/shared/realtime-sync.js:191-199`) and a schema inconsistency in pending-backup drain (`js/interview/persistence.js:603-610`).

4. Why emergency localStorage render fires every time:
- Because it is explicitly invoked on every startup and refresh, and the function always prints the emergency log line (`js/index/main.js:210-214`, `js/index/main.js:367-369`, `js/index/main.js:522`). It is currently a normal render stage, not an emergency-only fallback.

## 4) Priority Action Plan (numbered)

1. Make dashboard delete deterministic: await `deleteReportFull()` before final render-state commit and reconcile `window.currentReportsCache` first.
- Files: `js/index/report-cards.js`, `js/shared/delete-report.js`.
- Effort: Medium (2-4 hours including QA on iOS + desktop).

2. Harden soft-delete result validation and error surfacing.
- Require affected-row confirmation (or return data) and show user-visible failure state instead of silent warn-only behavior.
- Files: `js/shared/delete-report.js`, `js/report/delete-report.js`, `js/interview/persistence.js`.
- Effort: Medium (2-3 hours).

3. Fix cross-device immediate UI removal on Realtime delete.
- Prune `window.currentReportsCache` in delete branch before render; trigger status section refresh too.
- File: `js/shared/realtime-sync.js`.
- Effort: Small (1 hour).

4. Fix pending-backup drain payload schema mismatch.
- Convert IDB draft shape to canonical `buildInterviewPageState()` shape before `interview_backup` upsert.
- File: `js/interview/persistence.js`.
- Effort: Medium-High (4-6 hours with migration/backward-compat test).

5. Add coalesced rerun queue for `refreshDashboard` and exempt critical delete/update sources from cooldown skip.
- File: `js/index/main.js`.
- Effort: Medium (2-4 hours).

6. Improve Broadcast merge reliability.
- Replace `_fetchMergePending` drop behavior with queued “run once more” flag; use revision ordering in receiver.
- File: `js/shared/realtime-sync.js`.
- Effort: Medium (3-5 hours).

7. Align cloud reconciliation with blocklist/race expectations and correct dead key usage.
- Implement blocklist check or remove stale comment; fix wrong trim key.
- Files: `js/shared/data-store.js`, `js/index/main.js`.
- Effort: Small (1-2 hours).

8. Reclassify “Emergency localStorage render” logs/labels.
- Keep fast first paint, but rename and reduce noise to make true failures visible.
- File: `js/index/main.js`.
- Effort: Small (30-60 minutes).
