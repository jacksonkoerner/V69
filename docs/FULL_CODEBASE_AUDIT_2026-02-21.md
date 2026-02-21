# FULL CODEBASE AUDIT — FINAL SYNTHESIS (2026-02-21)

## 1. EXECUTIVE SUMMARY
The codebase is functional and reasonably modular, but it has several cross-cutting reliability/security risks caused by legacy overlap (old vs new persistence/sync paths), mixed storage abstractions, and drift between comments/contracts and runtime behavior. The most important risks are correctness bugs in report/user-state handling, a service-worker API routing mismatch for modern Edge Function traffic, and auth hardening gaps in Edge Functions. Overall health is **moderate**: architecture is workable, but consistency and safety need focused cleanup.

- Total files/audit targets reviewed across all 8 chunks: **77** (including one directory-level special audit for `js/outdated/`)
- Issue totals (from chunk severity summaries):
  - **Critical: 4**
  - **Warning: 31**
  - **Info: 28**

## 2. CRITICAL ISSUES (must fix)

1. **User settings cache key mismatch causes offline inconsistency**
- References: `js/data-layer.js:214`, `js/indexeddb-utils.js:103`, `js/data-layer.js:258`
- Impact: `userProfile` is keyed by `deviceId`, but lookup path first uses `authUserId`; this causes cache misses and unreliable offline/profile hydration.
- Recommended fix: standardize one canonical key (prefer `authUserId` for account-scoped settings or `deviceId` for device-scoped settings), migrate old rows once, and enforce keying at one abstraction boundary (`dataLayer` or `dataStore`, not both).

2. **Equipment status precedence bug can generate wrong report output**
- Reference: `js/report/form-fields.js:742`
- Impact: incorrect equipment status in form/preview/PDF can propagate into final submissions.
- Recommended fix: patch precedence logic, then add regression tests for status combinations and parity checks between form state, preview, and PDF output.

3. **Permissions onboarding can become permanently incomplete (speech flag path)**
- References: `js/permissions/main.js:757-763`
- Impact: speech permission is required in completion checks but has no matching grant path in this flow, potentially blocking onboarding completion indefinitely.
- Recommended fix: either implement full `SPEECH_GRANTED` acquisition/set flow or remove it from required completion criteria.

4. **Service worker API routing likely misclassifies Edge Function requests**
- References: `sw.js:139-140`, `sw.js:210`, `sw.js:225-247`
- Impact: `/functions/v1/*` API requests (including POST) can fall into static/cache logic, breaking AI/report processing under SW control.
- Recommended fix: switch API detection to explicit Supabase Edge Function patterns (`/functions/v1/`), bypass cache for non-GET API calls, and add integration tests with SW enabled.

## 3. WARNING ISSUES (should fix)

### Security & Auth
- Hardcoded Supabase URL/anon key in client source (`js/config.js:4-5`).
- `verify_jwt = false` for all functions creates a larger blast radius if `validateAuth` is omitted (`supabase/config.toml:3`, `:9`, `:15`, `:21`).
- `validateAuth` lacks explicit claim hardening before trusting identity forwarding (`supabase/functions/_shared/auth.ts:60-64`).
- Wildcard CORS for authenticated APIs is broader than needed (`supabase/functions/_shared/auth.ts:9`).
- Backend upload validation hardening missing for extract-project (`supabase/functions/extract-project/index.ts:25-37`).
- Raw console payload upload can leak sensitive runtime data (`js/shared/console-capture.js:51-58`, `:69-70`).

### Data Integrity & Storage
- Mixed persistence backends (`window.idb` + partial `window.dataStore` shim) risk divergence (`js/indexeddb-utils.js:917-936`).
- Dynamic shared-script injection without readiness guarantee can race consumers (`js/storage-keys.js:9-16`).
- Duplicate sign-out cycle risk from listener + explicit signOut loop (`js/auth.js:92`, `js/auth.js:269-272`).
- Sign-out IDB cleanup depends on `window.dataStore` presence only (`js/auth.js:123-131`).
- `toSupabaseProject` contractor serialization mismatch vs JSONB expectation (`js/supabase-utils.js:97`).
- Local cache duplicated across IDB and localStorage for projects (`js/data-layer.js:57`, `:72`, `:135`, `:144`).
- Projects refresh clears local store before successful cloud fetch (`js/projects/main.js:61-66`, `:69-80`).
- `project-config` delete flow is non-atomic and can leave stale local data (`js/project-config/crud.js:232-239`, `:241-247`).
- Unawaited photos metadata upsert in background flow (`js/interview/photos.js:189-204`).

### Reliability & Runtime Behavior
- `toggle-panel.js` missing null guard on invalid panel IDs (`js/index/toggle-panel.js:19`).
- `cloud-recovery` over-broad recovered ID list can over-fetch cloud data (`js/index/cloud-recovery.js:109`).
- Location permission flag inconsistency (`LOC_GRANTED` read but not set in that success path) (`js/interview/main.js:20`, `:46-63`).
- Weather unit double-formatting bug in minimal mode (`js/interview/freeform.js:296-299`, `js/interview/ui-display.js:24-25`).
- Unhandled delete exception path in report page (`js/report/delete-report.js:38`).
- `_refineRedirectInProgress` never reset can suppress future redirects (`js/shared/realtime-sync.js:13`, `:262`).
- PWA update flow reloads without `SKIP_WAITING` despite SW support (`js/pwa-utils.js:159-161`, `sw.js:369-370`).

### Performance
- Sequential signed URL generation in cloud photo batch path (`js/shared/cloud-photos.js:135-176`).

### UX/Navigation/Policy Drift
- Route naming inconsistency (`projects.html` vs `project-config.html`) (`js/index/main.js:24`, `js/index/report-creation.js:275`).
- `archives` opens PDFs in new tab without `noopener` (`js/archives/main.js:267`, `:279`).
- `settings` nuclear reset uses broad `localStorage.clear()` and non-awaited DB delete (`js/settings/main.js:473`, `:481`, `:502`).

### Maintainability / Drift
- Stale dependency/header comments across dashboard modules (`js/index/main.js`, `js/index/report-cards.js`, `js/index/report-creation.js`, `js/index/cloud-recovery.js`, `js/index/weather.js`, `js/index/panels.js`).
- High duplication in interview persistence mapping paths (`js/interview/persistence.js:219-323`, `:450-519`, `:980-1006`).
- Debug schema drift from active AI field names (`js/report/debug.js:32-35`, `:66`, vs `js/report/form-fields.js:117-124`).
- Large duplicated preview/PDF rendering logic (`js/report/preview.js`, `js/report/pdf-generator.js`).
- Unused/dead autosave paths (`js/report/autosave.js:16-32`, `:249-305`; `js/report/data-loading.js:408-416`).
- `js/outdated/` duplicates active modules and raises reintroduction risk.
- `report-rules` dependency header stale (`js/report-rules.js:11-12`, use at `js/report-rules.js:247`).

## 4. STORAGE MAP

### A) localStorage / sessionStorage key inventory

#### Active canonical keys (`STORAGE_KEYS.*`)
- `ACTIVE_PROJECT_ID`
  - Read/write/remove: `js/auth.js`, `js/shared/ai-assistant.js`, `js/project-config/main.js`, `js/project-config/crud.js`, `js/projects/main.js`
  - Dead/orphan: **No**
- `ACTIVE_REPORT_ID`
  - Read/write/remove: `js/auth.js`, `js/index/report-creation.js`, `js/interview/main.js`, `js/report/data-loading.js`, `js/shared/delete-report.js`
  - Dead/orphan: **No**
- `AI_CONVERSATION` (prefix + per-user dynamic keys)
  - Read/write/remove: `js/auth.js`, `js/shared/ai-assistant.js`, helper in `js/storage-keys.js`
  - Dead/orphan: **No**
- `AUTH_ROLE`
  - Read/write/remove: `js/auth.js`
  - Dead/orphan: **No**
- `AUTH_USER_ID`
  - Read/write/remove: `js/auth.js`, `js/shared/ai-assistant.js`
  - Dead/orphan: **No**
- `BANNER_DISMISSED`, `BANNER_DISMISSED_DATE`
  - Read/write/remove: `js/auth.js`, `js/index/main.js`
  - Dead/orphan: **No**
- `DELETED_REPORT_IDS`
  - Read/write: `js/storage-keys.js`, `js/index/main.js`
  - Dead/orphan: **No**
- `DEVICE_ID`
  - Read/write: `js/storage-keys.js`; read usage: `js/data-layer.js`, `js/shared/ai-assistant.js`, `js/shared/console-capture.js` (legacy literal `fvp_device_id`)
  - Dead/orphan: **No**
- `DICTATION_HINT_DISMISSED`
  - Read/write: `js/interview/guided-sections.js`
  - Dead/orphan: **No**
- `MIC_GRANTED`, `MIC_TIMESTAMP`, `CAM_GRANTED`, `LOC_GRANTED`, `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `SPEECH_GRANTED`, `ONBOARDED`, `PERMISSIONS_DISMISSED`
  - Read/write/remove across: `js/index/main.js`, `js/interview/main.js`, `js/permissions/main.js`, `js/ui-utils.js`, `js/auth.js`
  - Dead/orphan:
    - `SPEECH_GRANTED`: **flow appears orphaned/incomplete** in current permissions flow (`js/permissions/main.js:757-763`)
    - others: **No**
- `MIGRATION_V113_IDB_CLEAR`
  - Read/write: `js/index/main.js`
  - Dead/orphan: **No** (migration flag)
- `ORG_ID`
  - Read/write/remove across many modules: `js/auth.js`, `js/supabase-utils.js`, `js/data-layer.js`, `js/index/report-creation.js`, `js/interview/*`, `js/report/*`, `js/shared/*`, `js/archives/main.js`
  - Dead/orphan: **No**
- `PROJECTS`, `PROJECTS_CACHE_TS`
  - Read/write/remove: `js/auth.js`, `js/data-layer.js`, `js/index/*`, `js/project-config/crud.js`, `js/report-rules.js`
  - Dead/orphan: **No**, but **legacy overlap risk** with IDB-backed project cache
- `SETTINGS_SCRATCH`
  - Read/write/remove: `js/settings/main.js`
  - Dead/orphan: **No**
- `SUBMITTED_BANNER_DISMISSED` (sessionStorage)
  - Read/write: `js/index/main.js`
  - Dead/orphan: **No**
- `USER_ID`, `USER_NAME`, `USER_EMAIL`
  - Read/write/remove across auth/settings/index/interview/report/shared/project-config/archives
  - Dead/orphan: **No**

#### Dynamic and legacy literal keys
- `fvp_ai_response_*` (dashboard cache cleanup): `js/index/main.js` — active dynamic pattern
- `fvp_backup_stale_${reportId}`: `js/interview/persistence.js` — active stale-backup marker
- `fvp_migration_v2_idb_data`, `fvp_current_reports`, `fvp_report_*`: `js/shared/data-store.js` — legacy migration keys (cleanup path)
- `fvp_sync_rev_{reportId}`: `js/outdated/persistence.js` — **dead (outdated only)**
- `fvp_org_id`, `fvp_user_id` literal fallback usage: present in `js/outdated/*` — **dead (outdated only)**

#### Potential orphan/unclear constants (from reports)
- `MARKUP_PHOTO` appears in constants inventory (`js/storage-keys.js:23-54`) but was not surfaced as active in chunk-level flow analysis.

### B) IndexedDB store inventory

- `projects`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/data-layer.js`, `js/projects/main.js`, `js/project-config/crud.js`, `js/auth.js`
  - Dead/orphan: **No**
- `userProfile`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/data-layer.js`, `js/auth.js`
  - Dead/orphan: **No**, but key-model mismatch is critical
- `photos`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/interview/photos.js`, `js/interview/persistence.js`, `js/interview/freeform.js`, cleanup paths in `js/shared/realtime-sync.js`
  - Dead/orphan: **No**
- `currentReports`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/index/main.js`, `js/shared/realtime-sync.js`, `js/report/*`, `js/auth.js`
  - Dead/orphan: **No**
- `draftData`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/interview/persistence.js`, cleanup in `js/shared/realtime-sync.js`, `js/auth.js`
  - Dead/orphan: **No**
- `reportData`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/report/*`, `js/interview/finish-processing.js`, `js/index/cloud-recovery.js`, cleanup in shared modules
  - Dead/orphan: **No**
- `cachedArchives`
  - Active users: `js/indexeddb-utils.js`, `js/shared/data-store.js`, `js/archives/main.js`
  - Dead/orphan: **No**
- `archives` (legacy store)
  - Explicitly removed in upgrade: `js/indexeddb-utils.js:116-118`, `js/shared/data-store.js:47-49`
  - Dead/orphan: **Yes (legacy removed store)**

### C) Supabase tables/buckets inventory

#### Tables
- `user_profiles`
  - Referenced by: `js/auth.js`, `js/data-layer.js`, `js/settings/main.js`, `js/supabase-utils.js`
  - Orphan: **No**
- `projects`
  - Referenced by: `js/data-layer.js`, `js/project-config/crud.js`, `js/archives/main.js`, `js/shared/realtime-sync.js`, `js/supabase-utils.js`
  - Orphan: **No**
- `reports`
  - Referenced by: `js/index/report-cards.js`, `js/index/report-creation.js`, `js/index/cloud-recovery.js`, `js/interview/persistence.js`, `js/report/autosave.js`, `js/report/data-loading.js`, `js/report/submit.js`, `js/shared/data-store.js`, `js/shared/realtime-sync.js`, `js/shared/delete-report.js`
  - Orphan: **No**
- `report_data`
  - Referenced by: `js/index/cloud-recovery.js`, `js/interview/finish-processing.js`, `js/report/autosave.js`, `js/report/data-loading.js`, `js/shared/realtime-sync.js`, `js/shared/delete-report.js`
  - Orphan: **No**
- `interview_backup`
  - Referenced by: `js/index/cloud-recovery.js`, `js/interview/persistence.js`, `js/shared/delete-report.js`
  - Orphan: **No**
- `photos`
  - Referenced by: `js/interview/persistence.js`, `js/interview/photos.js`, `js/shared/cloud-photos.js`, `js/shared/delete-report.js`
  - Orphan: **No**
- `ai_submissions`
  - Referenced by: `js/interview/finish-processing.js`, `js/shared/delete-report.js`
  - Orphan: **No**
- `debug_logs`
  - Referenced by: `js/shared/console-capture.js`
  - Orphan: **No**
- `report_backup`
  - Referenced by: `js/shared/delete-report.js` (cascade hard-delete path)
  - Orphan/stale risk: **Potentially stale (only seen in legacy-style cascade path)**
- `final_reports`
  - Referenced by: `js/shared/delete-report.js` (fallback cleanup path)
  - Orphan/stale risk: **Potentially stale (single fallback reference only)**

#### Buckets
- `project-logos`
  - Referenced by: `js/data-layer.js`, `js/media-utils.js`, `js/project-config/form.js`
  - Orphan: **No**
- `report-photos`
  - Referenced by: `js/interview/persistence.js`, `js/shared/cloud-photos.js`, `js/shared/delete-report.js`, `js/report/form-fields.js`
  - Orphan: **No**
- `report-pdfs`
  - Referenced by: `js/report/submit.js`, `js/archives/main.js`, `js/shared/delete-report.js`
  - Orphan: **No**

## 5. N8N & WEBHOOK REFERENCES

### Remaining n8n/webhook/API key patterns

- **Edge function internal n8n bridge**
  - `supabase/functions/_shared/auth.ts:87` builds `${N8N_BASE_URL}/webhook/${webhookPath}`
  - `supabase/functions/_shared/auth.ts:91` injects `X-API-Key: ${N8N_WEBHOOK_SECRET}`
  - Webhook paths:
    - `fieldvoice-v69-refine-text` (`supabase/functions/refine-text/index.ts:32`)
    - `fieldvoice-v69-ai-chat` (`supabase/functions/ai-chat/index.ts:32`)
    - `fieldvoice-v69-refine-report` (`supabase/functions/process-report/index.ts:33`)
    - `fieldvoice-v69-project-extractor` (`supabase/functions/extract-project/index.ts:41`)

- **Frontend endpoint references (Supabase Edge Functions, not direct n8n URLs)**
  - `/functions/v1/process-report` (`js/interview/finish-processing.js:9`)
  - `/functions/v1/refine-text` (`js/report/ai-refine.js:10`)
  - `/functions/v1/ai-chat` (`js/shared/ai-assistant.js:10`)
  - `/functions/v1/extract-project` (`js/project-config/document-import.js:6`)

- **Stale/cleanup candidates**
  - `sw.js` API pattern literals `'n8n'` / `'webhook'` (`sw.js:139-140`) are legacy and mismatch current Edge Function API shape.
  - Legacy wording/comments in `js/interview/finish-processing.js` and `js/report/ai-refine.js` still say “webhook/n8n” while traffic goes to Supabase Edge Functions.

- **API key pattern in client code**
  - Supabase anon key literal in `js/config.js:5` (expected client-side key type, but rotation/env hygiene warning remains).

## 6. DEAD CODE INVENTORY

### Dead/unused symbols and paths identified
- `js/index/calendar.js`: `origToggle` unused (`js/index/calendar.js:5`)
- `js/index/report-cards.js`: `newData` arg unused (`js/index/report-cards.js:755`)
- `js/index/report-creation.js`: stale `activeProjectCache` fallback (`js/index/report-creation.js:199`)
- `js/project-config/document-import.js`: `.doc` icon branch unreachable + `missingFields` unused (`js/project-config/document-import.js:45`, `:76`, `:254`)
- `js/permissions/main.js`: unused `code` params in error functions (`js/permissions/main.js:315`, `:382`, `:455`)
- `js/report/data-loading.js`: `saveReportSilent()` appears unused (`js/report/data-loading.js:408-416`)
- `js/report/autosave.js`: `_deferFieldUpdate` and likely `saveReportToSupabase()` dead path (`js/report/autosave.js:16-32`, `:249-305`)
- `js/report/preview.js`: unused vars `o`, `ai` (`js/report/preview.js:19-20`)
- `js/report/pdf-generator.js`: unused `weather` var (`js/report/pdf-generator.js:326`)
- `js/interview/guided-sections.js`: likely stale/dead `operations`/`inspections` branches (`js/interview/guided-sections.js:41-44`, `:87-95`)
- `js/interview/contractors-personnel.js`: `getTradeAbbreviation()` appears unused (`js/interview/contractors-personnel.js:432-476`)

### `js/outdated/` directory
- Files:
  - `js/outdated/autosave.js`
  - `js/outdated/persistence.js`
  - `js/outdated/realtime-sync.js`
  - `js/outdated/sync-merge.js`
- Findings:
  - No active runtime references found in HTML/JS includes.
  - Duplicates active modules (`js/report/autosave.js`, `js/interview/persistence.js`, `js/shared/realtime-sync.js`).
  - `js/outdated/sync-merge.js` is effectively dead standalone legacy logic.
- **Conclusion:** can be safely deleted from runtime perspective; clean docs/changelog references if removal is done.

### Unused `STORAGE_KEYS` constants
- Explicitly confirmed as flow-broken/likely orphaned in active onboarding logic: `SPEECH_GRANTED` (`js/permissions/main.js:757-763`).
- Additional constant-level orphan candidates were not explicitly confirmed by chunk reports beyond above; keep under targeted verification before deletion.

### Unreachable code paths
- `.doc` icon branch in `document-import` (validator excludes `.doc`) (`js/project-config/document-import.js:45`, `:76`)
- Legacy `archives` IDB store removal path indicates old store is unreachable in current schema (`js/indexeddb-utils.js:116-118`, `js/shared/data-store.js:47-49`)
- `js/outdated/*` code paths unreachable in active runtime unless manually reintroduced

## 7. DUPLICATE CODE

- Project normalization duplicated between `js/supabase-utils.js` and `js/data-layer.js`.
- IndexedDB abstractions duplicated (`js/indexeddb-utils.js` and `js/shared/data-store.js`) with partial shim overlay.
- Interview persistence field mapping duplicated across three large blocks in `js/interview/persistence.js` (`:219-323`, `:450-519`, `:980-1006`).
- Photo handling logic duplicated across guided and minimal interview flows (`js/interview/photos.js`, `js/interview/freeform.js`).
- Report render/format helpers duplicated across preview/PDF (and partially submit) (`js/report/preview.js`, `js/report/pdf-generator.js`, `js/report/submit.js`).
- Edge function handlers have repeated boilerplate around auth/parse/response patterns (`supabase/functions/*/index.ts`).

### Consolidation recommendations
- Create a single source-of-truth storage access layer and phase out direct `window.idb` calls from feature modules.
- Extract shared field-mapping and render-format modules for interview/report domains.
- Add a thin Edge Function handler factory (auth + input validation + error mapping + webhook proxy wrapper).
- Remove/retire archived duplicates to reduce accidental drift.

## 8. RECOMMENDED SPRINT PLAN

### Sprint 1 (Security hardening, 1-2h)
- Tighten Edge Function auth/CORS:
  - Add claim checks in `validateAuth`.
  - Replace wildcard CORS with allowlist.
  - Add payload guards in `refine-text`, `ai-chat`, `process-report`, `extract-project`.
- Add checklist/lint guard so every function explicitly calls auth gate.

### Sprint 2 (Critical runtime correctness, 1-2h)
- Fix `data-layer` user-profile key mismatch and run a one-time migration.
- Fix `form-fields` equipment status precedence bug with regression tests.
- Fix permissions completion logic around `SPEECH_GRANTED`.

### Sprint 3 (Service worker + API reliability, 1-2h)
- Update SW API pattern detection for `/functions/v1/*`, bypass non-GET API caching.
- Align PWA update flow with `SKIP_WAITING`.
- Validate with end-to-end flows (AI refine/chat/process report, project extract) under active SW.

### Sprint 4 (Data consistency + delete/reset safety, 1-2h)
- Make project refresh atomic (`projects/main.js`) to avoid clear-before-fetch data loss window.
- Harden delete/reset flows (`project-config/crud.js`, `settings/main.js`) with transactional ordering and awaited destructive operations.
- Add error handling for `deleteReportFull` call sites.

### Sprint 5 (Dead code + duplication cleanup, 1-2h)
- Remove `js/outdated/*` and clean references.
- Remove confirmed dead symbols/paths and stale comments.
- Consolidate duplicate interview mapping + report preview/PDF formatter helpers.

### Sprint 6 (Storage contract cleanup, 1-2h)
- Audit remaining localStorage keys for lifecycle ownership and deprecate unused/legacy keys.
- Normalize read/write conventions (`getStorageItem`/`setStorageItem`) and document key ownership per domain.
- Decide fate of legacy table cleanup references (`report_backup`, `final_reports`) in delete cascade path.
