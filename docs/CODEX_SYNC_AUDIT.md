# CODEX Sync Audit

## Scope
Audited files:
- `js/shared/realtime-sync.js`
- `js/report/autosave.js`
- `js/report/data-loading.js`
- `js/shared/sync-merge.js`
- `js/shared/cloud-photos.js`
- `js/interview/persistence.js`
- `js/interview/photos.js`

Also referenced UI render targets where needed for root-cause confirmation:
- `js/interview/guided-sections.js`
- `js/interview/freeform.js`
- `js/interview/ui-flow.js`
- `js/report/main.js`

## Executive Summary
1. **Bug A (report cross-device typing)** is caused by **stale three-way merge base behavior under concurrent typing** plus whole-object cloud upserts. Report merge uses local-wins conflict resolution (`js/shared/sync-merge.js:62-67`) while report sync base is only initialized once and only refreshed after remote merge (`js/report/autosave.js:29-39`, `js/report/autosave.js:95`), not after successful local cloud flush (`js/report/autosave.js:325-354`). This makes remotely changed keys frequently appear as conflicts and be dropped.
2. **Bug B (quick-interview photo visibility delay)** is caused by **mode-specific rendering mismatch**. Incoming photo merges call guided renderer only (`js/interview/persistence.js:502-504`), but minimal mode displays photos through `renderMinimalPhotos()` (`js/interview/freeform.js:318-387`). So remote photos exist in state but do not render in minimal UI until switching view/mode.
3. **Bug C (pull-to-refresh missing)** is confirmed: no pull-to-refresh implementation exists on report/interview pages.

## Findings

### A) `report.html` cross-device typing sync reports "no changes needed"

#### Root Cause A1: Local-wins conflict policy + stale base progression on report page
- Report merge path:
  - Broadcast receive/fetch: `js/shared/realtime-sync.js:168-252`
  - Report merge entry: `js/report/autosave.js:66-77`
  - Merge algorithm: `js/shared/sync-merge.js:30-73`
- Current logic keeps local value when both local and remote changed the same key (`js/shared/sync-merge.js:62-67`).
- Report base snapshot is initialized once (`js/report/autosave.js:29-39`) and refreshed only after remote merge (`js/report/autosave.js:95`), but **not** after successful local upsert to `report_data` (`js/report/autosave.js:325-354`).
- Under simultaneous edits on both devices, the same keys are frequently marked changed on both sides relative to stale base, so merge repeatedly keeps local and logs no change (`js/report/autosave.js:76-78`).

#### Root Cause A2: Whole-object `user_edits` upsert amplifies divergence
- Autosave writes full map each flush: `user_edits: RS.userEdits || {}` (`js/report/autosave.js:331-337`).
- No field-level patching/merge server-side; last write replaces row object state.
- During concurrent typing, each device can overwrite cloud with its own full local map before the other fetch/merge cycle completes.

#### Root Cause A3 (secondary UI visibility issue): incomplete DOM mapping for merged keys
- In `applyReportMerge`, `pathToFieldId` omits fields that are autosaved (examples: `overview.noabProjectNo`, `overview.cnoSolicitationNo`, `overview.location`) while those keys are produced by autosave mapping (`js/report/autosave.js:195-222`).
- Missing entries in merge DOM map (`js/report/autosave.js:108-132`) means some merged values update state but not visible inputs.

#### Proposed Fixes
1. Update report sync base after successful cloud flush using acknowledged payload:
   - After `report_data` upsert success (`js/report/autosave.js:344-350`), set `_syncBase.userEdits` to a deep clone of the flushed `RS.userEdits`.
2. Move report cloud write from whole-object replacement to field-level patch/merge semantics (or include per-key change set and merge server-side).
3. Expand `pathToFieldId` in `applyReportMerge` to include all autosaved input paths from `setupAutoSave` mapping.
4. Optional: add conflict telemetry when local-wins suppresses remote edits for report page to make this visible in logs/UI.

---

### B) `quick-interview.html` photos from Device A appear on Device B only after switching to guided sections

#### Root Cause B1: Merge render path calls guided photo renderer only
- Incoming interview merge applies sections and for `photos` only does:
  - `renderSection('photos')` (`js/interview/persistence.js:502-504`)
- `renderSection('photos')` writes `#photos-grid` (guided UI) (`js/interview/guided-sections.js:311-367`).
- Minimal mode uses a different renderer/DOM target: `renderMinimalPhotos()` writes `#minimalPhotosGrid` (`js/interview/freeform.js:318-387`).
- Capture mode switching controls which app UI is visible (`js/interview/ui-flow.js:48-56`).

Effect: in minimal mode, remote photo data merges into `IS.report.photos`, but minimal photo grid is never re-rendered by merge handler.

#### Root Cause B2 (secondary data availability risk): photos table metadata is not written during background upload
- Background upload in interview updates storage URL/path in memory + IDB (`js/interview/photos.js:170-187`) but does **not** upsert Supabase `photos` table there.
- `photos` table upsert occurs only in `uploadPendingPhotos()` (submit flow) (`js/interview/persistence.js:1263-1301`).
- This weakens cross-device rehydration pathways that depend on `photos` table (`js/shared/cloud-photos.js:20-78`).

#### Proposed Fixes
1. In `applyInterviewMerge` photos case, render based on active mode:
   - If minimal mode active: call `renderMinimalPhotos()`.
   - If guided mode active: call `renderSection('photos')`.
2. After successful background upload, upsert photo metadata to `photos` table immediately (not only on submit), then keep current interview backup/broadcast behavior.
3. Keep photo URL refresh strategy for signed URLs (see `cloud-photos.js` comments on expiry).

---

### C) No pull-to-refresh on any page

#### Root Cause
- No shared pull-to-refresh utility or page-level handlers for report/interview pages.
- Search confirms no pull-to-refresh implementation references in target page scripts.

#### Proposed Fixes
1. Add shared mobile pull-to-refresh module with:
   - top-of-page touch gesture detection,
   - visual affordance,
   - guarded refresh action (`drainPendingBackups`, `flush*Backup`, then reload/fetch-and-merge).
2. Wire to at least `report.html` and `quick-interview.html` with mode-safe behavior.

## Silent Errors / Risky Error Handling

1. Swallowed catches hide failures:
- `js/interview/persistence.js:190`
- `js/interview/persistence.js:562`
- `js/interview/persistence.js:565`
- `js/interview/persistence.js:576`
- `js/report/data-loading.js:198`
- `js/shared/realtime-sync.js:307`
- `js/shared/realtime-sync.js:365`
- `js/shared/realtime-sync.js:431`

2. `applyInterviewMerge` has no protective try/catch around render dispatch (`js/interview/persistence.js:455-537`), so one renderer exception can abort the rest of merge side effects.

3. Broadcast send is fire-and-forget (`js/shared/realtime-sync.js:277-281`) with no await/catch, so send failures are not surfaced.

## Race / Data-Flow Risks

1. `_lastMergeAt` and `_lastAppliedRevision` are global, not scoped by report/session (`js/shared/realtime-sync.js:117-121`), which can cause stale gating anomalies across reconnect/resume/report switches.
2. Revision compare assumes monotonic sequence on receiver (`js/shared/realtime-sync.js:148-153`), but revisions are local/session counters (`js/report/autosave.js:14-15`, `js/interview/persistence.js:386-387`), not globally ordered.
3. `sections_changed` hint is passed through but merge currently scans all sectionDefs regardless (`js/shared/sync-merge.js:237-271`), reducing intent of selective update and making noisy conflicts more likely.

## Data-Flow Trace (Photos: capture → cloud → remote render)

### Guided capture path
1. Capture/prepare photo object, push into `IS.report.photos`:
   - `js/interview/photos.js:90-115`
2. Save photo payload (with base64) to IDB:
   - `js/interview/photos.js:117`, `js/interview/photos.js:306-323`
3. Trigger autosave path (`saveReport`) and background upload:
   - `js/interview/photos.js:121-124`
4. Background upload updates in-memory object + IDB with `storagePath/url`:
   - `js/interview/photos.js:170-187`
5. `saveReport` marks interview backup dirty; `flushInterviewBackup` writes `page_state` to `interview_backup` and broadcasts:
   - `js/interview/persistence.js:892-917`, `js/interview/persistence.js:960-988`
6. Remote device receives broadcast, fetches `interview_backup.page_state`, runs `syncMerge`, then `applyInterviewMerge`:
   - `js/shared/realtime-sync.js:168-243`
   - `js/interview/persistence.js:436-556`
7. Render step currently uses guided renderer only for photos:
   - `js/interview/persistence.js:502-504`
   - `js/interview/guided-sections.js:311-367`

### Cloud rehydration path (report page)
1. Fetch photo metadata from `photos` table and create signed URLs:
   - `js/shared/cloud-photos.js:20-78`
2. Inject into loaded report if local photos missing:
   - `js/report/data-loading.js:183-204`

Gap: guided/background interview upload does not upsert `photos` table until submit (`js/interview/persistence.js:1263-1301`), so this rehydration path is incomplete for in-progress cross-device scenarios.

## Recommended Fix Order
1. Fix Bug B render-mode mismatch first (high user-visible win, low risk).
2. Fix Bug A base progression + server/object merge strategy for report user edits.
3. Add pull-to-refresh utility and wire to report/interview pages.
4. Remove silent catches or at least log structured warnings with reportId/context.
