# Codex Audit Request — Feb 18, 2026 (Afternoon)

## Your Task
You are auditing FieldVoice Pro's codebase. **Do NOT implement any changes.** Your job is to:

1. **Analyze the deletion system** — trace the full delete flow from UI button tap → soft delete → dashboard removal → cross-device propagation. Identify why deletion might fail or feel broken.
2. **Analyze the sync/data architecture** — the IDB/localStorage/Supabase layers, the new Broadcast sync system, and identify any remaining issues.
3. **Produce a numbered action plan** for what needs to be fixed/improved, with file names and line numbers.

## Context

### Recent Work (last 48 hours)
We've been fixing the data layer. Key commits (most recent first):
- `7d7195a` — merge engine hardening: protected fields, tombstones, recursive item merge
- `3484e0e` — sync merge: honor remote deletions + protect captureMode
- `e48d03f` — live sync system: Supabase Broadcast + three-way merge engine
- `c517db6` — durable outbound queue + reduce debounce 5s→2s
- `6d0bd43` — sync metadata (device_id, session_id, revision)
- `b2575b6` — baseline persistence reliability (dirty flag fix, window.dataStore standardization)
- `fe79238` — prevent Realtime from poisoning IDB with null ai_generated/original_input
- `789d085` — await deleteReportFull() before navigation + dead code cleanup
- `a17defa` — prevent deleted reports from resurrecting on dashboard
- `5cb0f0c` — soft delete + user isolation

### Architecture
- **localStorage:** Small pointers only (active report ID, UI state, deleted blocklist)
- **IndexedDB (via window.dataStore):** Local cache for reports, drafts, photos, projects
- **Supabase:** Cloud source of truth. Tables: reports, report_data, interview_backup, report_backup, photos, projects, debug_logs
- **Supabase Realtime:** Notification layer only — NEVER write content from Realtime payloads (1MB limit strips large JSONB)
- **Supabase Broadcast:** New cross-device sync for interview drafts (channel per report)

### Delete Flow (current)
1. User taps delete button
2. `deleteReportFull(reportId)` is called:
   - Adds to deleted blocklist (localStorage)
   - Clears ACTIVE_REPORT_ID if it matches
   - Cleans IDB (deleteReport, deletePhotos, deleteDraft, deleteReportData via Promise.allSettled)
   - Soft-deletes in Supabase: `reports.update({ status: 'deleted' }).eq('id', reportId)`
   - Sends BroadcastChannel message: `{ type: 'report-deleted', id: reportId }`
3. `deleteReportCascade()` also exists — does HARD delete (storage files, child tables, parent row). Currently NOT called from UI flow.

### Known Issues
- **Deletion "not working":** Jackson reported delete not working from UI. Some reports DID get `status: 'deleted'` in Supabase, so the soft delete itself works. The issue may be in the UI flow (button handler, navigation timing, dashboard not refreshing).
- **Warn log:** `[SYNC-BC] Fetch returned no data or error: null` — the Broadcast sync fetch sometimes returns null
- **Dashboard renders "Emergency localStorage" on every load** — may be masking real issues
- **The deleteReportCascade() is dead code** — never called from UI, only deleteReportFull() is used

### Debug Logs (from Supabase debug_logs table)
Only 1 warning and 0 errors in recent logs:
- WARN: `[SYNC-BC] Fetch returned no data or error: null` (quick-interview.html)
- 1 delete log: `[REALTIME] Report marked deleted in cloud, removing locally: 93675662-...` (index.html, device a8c4b150)

### Two Device IDs in Logs
- `4e0c3040-f463-4dad-b4f9-d09835e2eec0` — Jackson's iPhone (primary)
- `a8c4b150-bd51-4525-9c7b-a4be4ed81ddf` — Jackson's desktop/second device

## Key Files to Audit

### Delete System
- `js/shared/delete-report.js` — deleteReportFull() + deleteReportCascade()
- `js/index/report-cards.js` — Dashboard delete button handler
- `js/report/delete-report.js` — Report page delete handler
- `js/shared/realtime-sync.js` — Realtime handler for delete events (UPDATE with status='deleted')

### Sync System
- `js/interview/persistence.js` — Draft save/load, outbound queue, Broadcast sync
- `js/shared/data-store.js` — All IDB operations
- `js/shared/broadcast.js` — Cross-tab BroadcastChannel
- `js/interview/main.js` — Interview page init + lifecycle

### Dashboard
- `js/index/main.js` — Dashboard init
- `js/index/cloud-recovery.js` — Cross-device report recovery
- `js/data-layer.js` — Data access layer

## What We Need From You

1. **Delete flow trace:** Follow the exact code path from button tap to UI update. Identify every point where it could fail silently.
2. **Cross-device delete propagation:** When device A deletes a report, does device B reliably remove it? Trace the Realtime path.
3. **Sync architecture health check:** Is the new Broadcast sync solid? Any race conditions, echo loops, or data loss paths?
4. **Emergency localStorage render:** Why does the dashboard hit this path every time? Is it a problem?
5. **Numbered action plan:** Priority-ordered list of what to fix, with file:line references and estimated effort.

**DO NOT write any code. Audit and plan only.**
