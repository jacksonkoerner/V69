# FieldVoice Pro Codebase Audit (Codex)

Date: 2026-02-14

## Scope
This audit covers every `.js` and `.html` file in the repository. Findings cite exact file locations using `path:line` references.

## Architecture Overview
FieldVoice Pro is an iOS-focused PWA for construction field reporting. The app has three main phases: capture in `quick-interview.html`, refinement in `report.html`, and submission back on the dashboard `index.html`. Navigation is link-based with URL params (e.g., `report.html?reportId=...`) and no client-side router.

End-to-end flow (high level):
1. User logs in at `login.html`, which authenticates via Supabase and caches user/org metadata in localStorage and IndexedDB (`js/login/main.js`, `js/auth.js`).
2. Dashboard (`index.html`) loads local reports from localStorage, hydrates from IndexedDB, refreshes projects from Supabase, and syncs weather (`js/index/main.js:307-405`).
3. New reports are created via `report-creation.js`, which writes a `reports` row in Supabase and navigates into `quick-interview.html` with `reportId` and `projectId` (`js/index/report-creation.js:22-200`).
4. `quick-interview.html` builds a draft in memory and saves it to localStorage + IndexedDB (debounced) while also writing an `interview_backup` row in Supabase (debounced) for cross-device recovery (`js/interview/persistence.js:611-691`).
5. Finish flow in `quick-interview.html` calls an n8n webhook for AI refinement and stores results in both localStorage and Supabase `report_data`, then navigates to `report.html` for review (`js/interview/finish-processing.js:317-418`).
6. `report.html` loads the refined report (localStorage first, Supabase fallback) and allows edits; autosave writes to localStorage (`fvp_report_{id}`) and updates `report_data.user_edits` in Supabase (`js/report/data-loading.js:38-170`, `js/report/autosave.js:134-173`).
7. Final submission generates a PDF, uploads it to Supabase Storage, updates the `reports` table, and updates local caches (`js/report/submit.js:16-212`).

Page-by-page summary:
- `index.html`: Dashboard with report cards, conditions/weather strip, calendar/messages panel, field tools, maps, and AI assistant. It refreshes on `pageshow`, `visibilitychange`, and `focus` to handle iOS PWA lifecycle quirks (`js/index/main.js:443-477`).
- `quick-interview.html`: Field capture with guided sections or minimal mode, photo capture + markup, and AI processing workflow (`js/interview/*.js`).
- `report.html`: Refined report editing, preview, PDF generation, submit, delete, and AI re-refine (`js/report/*.js`).
- `projects.html` + `project-config.html`: Project list and project configuration CRUD; stores data in Supabase and caches in IDB/localStorage (`js/projects/main.js`, `js/project-config/*.js`).
- `settings.html`: User profile settings synced to Supabase (`js/settings/main.js`).
- `archives.html`: Historical reports and cached archives (`js/archives/main.js`).
- `permissions.html` + `permission-debug.html`: Permission onboarding and diagnostics, including explicit iOS PWA limitations (`js/permissions/main.js`, `js/permission-debug/main.js`).
- `landing.html`: Marketing/entry point that redirects to login or index (`js/landing/main.js`).
- Service worker `sw.js`: Cache-first for static assets, network-first for navigation and JS, offline fallback (`sw.js:8-316`).

Data flow summary:
- Local draft state: `localStorage` (`fvp_current_reports`, `fvp_report_{id}`) plus IndexedDB (`currentReports`, `draftData`, `photos`). Core helpers are in `js/storage-keys.js` and `js/indexeddb-utils.js`.
- Cloud state: Supabase tables `reports`, `report_data`, `interview_backup`, `photos`, `projects`, `user_profiles`, and storage buckets `report-photos` and `report-pdfs`.
- Realtime sync: Supabase realtime channels for `reports`, `report_data`, and `projects`, with client-side guards (`js/shared/realtime-sync.js:18-179`).

## Data Layer Issues
The issues below are limited to storage, IndexedDB, and Supabase behaviors (including races and stale data risk).

1. **Submitted PDF URLs are stored as signed URLs that expire (data loss).**
`uploadPDFToStorage` creates a signed URL and `saveSubmittedReportData` stores that signed URL in the `reports` table. After 1 hour, the stored URL is invalid, so old submissions can’t be downloaded or shared. This is a critical durability defect. `js/report/submit.js:117-125`, `js/report/submit.js:159-170`.

2. **Photo URLs are often signed URLs that expire and then get cached in report state.**
Cloud photo rehydration explicitly uses signed URLs with a 1-hour expiry and then returns them for display. Those URLs are then put into report state and can be written back to localStorage, which means stale URLs break photo rendering later. `js/shared/cloud-photos.js:35-47`.

3. **Quick-interview drafts rely on a debounced localStorage save that can be dropped on pagehide (data loss).**
The quick-interview `saveReport` schedules `saveToLocalStorage()` with a 500ms debounce. iOS PWA can suspend the page immediately on back-navigation, so the timer never fires and `fvp_current_reports` is never updated. This leaves the dashboard with no reports and no IDB backup. `js/interview/main.js:304-313`, `js/interview/persistence.js:616-623`, `js/interview/persistence.js:170-185`.

4. **Draft photo data URLs are stored in localStorage, risking quota exhaustion and failed saves.**
Photo objects keep `url` as a data URL until upload completes. `saveToLocalStorage` persists `photos[].url` to localStorage. For guided and minimal capture, this can blow the ~5MB localStorage quota and cause save failures, with no UI recovery beyond console logs. `js/interview/photos.js:90-121`, `js/interview/freeform.js:433-448`, `js/interview/persistence.js:141-152`.

5. **`saveReportData` has no IndexedDB fallback and can silently fail under storage pressure.**
The report editor stores refined report data in `localStorage` (`fvp_report_{id}`) only; failures log to console but do not fall back to IndexedDB. If localStorage is evicted or full, edits are lost unless Supabase `report_data` is online and succeeds. `js/storage-keys.js:353-362`, `js/report/autosave.js:180-218`.

6. **Report editor cloud sync is partial (only `user_edits`), leaving other edits device-local.**
Autosave to Supabase `report_data` only upserts `user_edits` and status; changes to overview fields, equipment, and other sections saved in `fvp_report_{id}` are not synced. Cross-device editing yields stale data. `js/report/autosave.js:153-167`, `js/report/autosave.js:180-209`.

7. **Interview backup sync drops offline updates with no retry-on-reconnect.**
When offline, the `flushInterviewBackup` calls will fail after retries and no queue is kept. When back online, updates are not re-sent, which can produce cross-device inconsistency and data loss. `js/interview/persistence.js:628-691`.

8. **Toggle locking rules do not match stored data shape.**
`canChangeToggle` checks `report.section_toggles`, but quick-interview stores toggle state in `toggleStates`. As a result, the lock rules never apply in practice. `js/report-rules.js:414-432`, `js/interview/state-mgmt.js:183-197`, `js/interview/persistence.js:165-167`.

9. **Dashboard cache sync does not update IndexedDB after submit.**
`cleanupLocalStorage()` updates `fvp_current_reports` for submitted status but does not call `syncCurrentReportsToIDB`, so IndexedDB can become stale and later hydration can resurrect old statuses. `js/report/submit.js:203-212`, `js/storage-keys.js:429-436`.

10. **Signed URLs are used for project logos, which can go stale in PDFs and previews.**
Project logos are stored as signed URLs; PDF generation and previews pull from the URL directly, so PDF generation or preview may fail after the signed URL expires. `js/media-utils.js:194-218`, `js/report/pdf-generator.js:85-113`.

## Navigation & Lifecycle Bugs
Main bug: dashboard goes blank (no reports, weather stuck on Loading) when navigating back from `report.html` or `quick-interview.html`, especially in iOS PWA standalone.

### What happens on navigation back
1. From `quick-interview.html`, `pagehide` and `visibilitychange` call `saveReport()` without awaiting its debounced localStorage save. `saveReport()` defers `saveToLocalStorage()` by 500ms. On iOS PWA, the page is frozen immediately, so the scheduled save never runs. `js/interview/main.js:304-313`, `js/interview/persistence.js:616-623`.
2. The current reports list (`fvp_current_reports`) is updated only inside `saveToLocalStorage()` via `saveCurrentReport(...)`. If the debounce never fires, neither localStorage nor IndexedDB has the updated report list. `js/interview/persistence.js:170-191`.
3. Back on `index.html`, `refreshDashboard()` renders immediately from localStorage and then tries to hydrate from IndexedDB. If both are missing, the report list is empty. `js/index/main.js:326-345`, `js/storage-keys.js:383-401`.
4. Weather can remain stuck in the initial “Loading” state because `refreshDashboard()` may be skipped by the cooldown guard (if navigation happens quickly), leaving the DOM in its prior state. `js/index/main.js:317-319`.

### Why it is worse on iOS PWA standalone
- iOS PWA aggressively suspends backgrounded pages and does not guarantee timers complete after `pagehide`. That makes debounced saves unreliable on navigation and app switching. `js/interview/persistence.js:616-623`.
- Permission and sensor APIs behave differently in iOS PWA; geolocation may require a user gesture and can hang, leaving the weather UI unchanged. `js/ui-utils.js:320-384`, `js/index/weather.js:12-36`.

### Root causes
- Debounced save on `quick-interview.html` that is not flushed synchronously on `pagehide` (data loss leading to blank dashboard). `js/interview/persistence.js:616-623`, `js/interview/main.js:304-313`.
- `report.html` does not re-populate `fvp_current_reports` if it was evicted (edits only update `fvp_report_{id}`), so returning to the dashboard after eviction yields no cards. `js/report/autosave.js:180-218`.
- Cooldown guard can skip `refreshDashboard()` if back navigation occurs quickly, leaving weather in initial UI state. `js/index/main.js:317-319`.

## Cross-Device Sync Gaps
1. **Draft edits in quick-interview are not reliably synced across devices when offline.**
`interview_backup` is sent only when online; failed retries are dropped, and there is no queue to re-send when back online. `js/interview/persistence.js:628-691`.

2. **Report editor edits are not fully synced.**
Only `user_edits` are upserted to `report_data`; edits to overview fields, equipment rows, and other form values live only in localStorage. Cross-device viewers see stale content. `js/report/autosave.js:153-167`, `js/report/autosave.js:180-209`.

3. **Photos remain device-local until upload succeeds.**
Photos are stored in IndexedDB and marked pending; if the device stays offline, photos never reach Supabase and thus do not appear on other devices. `js/interview/photos.js:144-195`, `js/interview/finish-processing.js:475-483`.

4. **Signed URLs for photos and PDFs are cached, but expire.**
Devices that load cached signed URLs later will fail to display photos or PDFs, even though the storage objects still exist. `js/shared/cloud-photos.js:35-47`, `js/report/submit.js:117-125`.

5. **`CURRENT_REPORTS` is local-first and not authoritative cross-device.**
Realtime sync updates basic fields, but relies on `report_date` mapping and does not reconcile local draft data or full report state. `js/shared/realtime-sync.js:99-133`.

## Code Quality Findings
1. **Duplicate formatting logic for preview and PDF.**
`js/report/preview.js` and `js/report/pdf-generator.js` both implement time/date formatting, contractor sorting, equipment formatting, and text wrapping separately, increasing bug surface and drift risk. `js/report/preview.js:43-148`, `js/report/pdf-generator.js:235-305`.

2. **Two different `getContractorActivity` implementations across report vs interview.**
Similar logic exists in `js/report/form-fields.js` and `js/interview/contractors-personnel.js`, making fixes easy to miss. `js/report/form-fields.js:304-357`, `js/interview/contractors-personnel.js:8-29`.

3. **Inconsistent report data schema in local storage.**
`report-rules.js` expects `section_toggles`, while interview persists `toggleStates`. This inconsistency already breaks toggle locking. `js/report-rules.js:414-432`, `js/interview/persistence.js:165-167`.

4. **Large UI modules built with inline HTML strings and global functions.**
Most UI modules build HTML with string concatenation and expose handlers on `window`, which complicates testing and maintenance. Examples include `js/interview/guided-sections.js:35-368` and multiple tool scripts in `js/tools/*.js`.

5. **Service worker cache list is static and manual.**
`sw.js` hard-codes asset lists, increasing risk of stale caches and broken updates when files change. `sw.js:24-80`.

## Prioritized Fix List
Severity is ranked from P0 (highest) to P3 (lowest).

1. **P0 — Stop storing expiring signed PDF URLs in `reports`.**
Store the storage path or a permanent public URL instead, and generate signed URLs on demand at view time. Update `uploadPDFToStorage()` and `saveSubmittedReportData()`. `js/report/submit.js:117-170`.

2. **P0 — Make quick-interview save synchronous on pagehide.**
On `pagehide`/`visibilitychange`, flush `saveToLocalStorage()` immediately (no debounce). This prevents blank dashboards and lost drafts on iOS PWA. `js/interview/main.js:304-313`, `js/interview/persistence.js:616-623`.

3. **P1 — Prevent data URL photos from being stored in localStorage.**
Keep data URLs only in IndexedDB and use blob URLs for display. Persist `url` as a stable cloud URL or a placeholder until upload finishes. `js/interview/photos.js:90-121`, `js/interview/persistence.js:141-152`, `js/interview/freeform.js:433-448`.

4. **P1 — Sync full report edits, not just `user_edits`.**
Extend `report_data` upserts to include the full report state (overview, equipment rows, activities, etc.) or add a dedicated table for refined report edits. `js/report/autosave.js:153-209`.

5. **P1 — Add retry-on-reconnect for interview backups.**
Queue failed `interview_backup` upserts locally and retry when online. This restores cross-device consistency after offline use. `js/interview/persistence.js:628-691`.

6. **P2 — Fix toggle lock persistence.**
Either store `section_toggles` in drafts or update `report-rules.js` to read `toggleStates`. `js/report-rules.js:414-432`, `js/interview/state-mgmt.js:183-197`.

7. **P2 — Sync `CURRENT_REPORTS` to IDB after submit and delete.**
Call `syncCurrentReportsToIDB()` after `cleanupLocalStorage()` or reuse `saveCurrentReport` for updates. `js/report/submit.js:203-212`, `js/storage-keys.js:429-436`.

8. **P2 — Avoid `refreshDashboard()` cooldown skips on back nav.**
Skip cooldown for `pageshow` or when returning from `report.html`/`quick-interview.html` so weather and cards refresh reliably. `js/index/main.js:317-319`, `js/index/main.js:443-477`.

9. **P3 — Consolidate duplicate preview/PDF formatting helpers.**
Extract shared formatting utilities to reduce drift and bug surface. `js/report/preview.js:43-148`, `js/report/pdf-generator.js:235-305`.

10. **P3 — Automate service worker cache versioning.**
Generate asset lists during build or use a revisioned manifest to avoid stale caches. `sw.js:24-80`.

---

If you want, I can follow up with a concrete refactor plan, per-feature test plan, or a set of targeted patches to address the P0/P1 items.
