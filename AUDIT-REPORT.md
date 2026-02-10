# FieldVoice Pro v6.9 — Complete System Audit for UUID Migration

**Audit Date:** June 2025  
**Database:** bdqfpemylkqnmeqaoere (FieldVoice-Pro-v6.9 sandbox)  
**Purpose:** Document every data flow, storage key, schema, and identity reference to enable clean UUID-only migration.

---

## Table of Contents

1. [Report Key Tracing — Every Reference](#1-report-key-tracing)
2. [Exact Code Paths — End-to-End Flows](#2-exact-code-paths)
3. [Supabase Schema — Queried from Database](#3-supabase-schema)
4. [localStorage Keys — Complete Inventory](#4-localstorage-keys)
5. [IndexedDB — Complete Inventory](#5-indexeddb)
6. [Page-by-Page Data Flow](#6-page-by-page-data-flow)
7. [JS Module Dependency Map](#7-js-module-dependency-map)
8. [n8n AI Processing Flow](#8-n8n-ai-processing-flow)
9. [Bugs, Orphans, and Dead Code](#9-bugs-orphans-dead-code)
10. [Impact Analysis for UUID Migration](#10-uuid-migration-impact)

---

## 1. Report Key Tracing

### 1.1 Every Place `draft_{projectId}_{date}` Is Constructed

| File | Line | Code | Context |
|------|------|------|---------|
| `quick-interview.js` | 641 | `id: currentReportId \|\| \`draft_${activeProjectId}_${todayStr}\`` | `saveToLocalStorage()` — constructs the key used as `id` in `fvp_current_reports` when `currentReportId` is null |
| `quick-interview.js` | 668 | `const draftId = currentReportId \|\| \`draft_${activeProjectId}_${today}\`` | `loadFromLocalStorage()` — lookup key for draft retrieval |
| `quick-interview.js` | 812 | `const draftId = currentReportId \|\| \`draft_${activeProjectId}_${todayStr}\`` | `clearLocalStorageDraft()` — key for deletion after Finish |
| `quick-interview.js` | 826 | `const draftKey = \`draft_${activeProject?.id}_${todayStr}\`` | `updateLocalReportToRefined()` — always constructed (not conditional) for draft-to-UUID migration |
| `quick-interview.js` | 1130 | `const draftId = currentReportId \|\| \`draft_${activeProjectId}_${todayStr}\`` | `confirmCancelReport()` — key for deletion on cancel |
| `quick-interview.js` | 2531 (finishMinimalReport) | `const draftKey = \`draft_${activeProject?.id}_${todayStr}\`` | Post-AI cleanup: delete old draft key |
| `quick-interview.js` | 5320 (finishReport) | `const draftKey = \`draft_${activeProject?.id}_${todayStr}\`` | Post-AI cleanup: delete old draft key (guided mode) |
| `data-layer.js` | 379 | `const key = \`draft_${projectId}_${date}\`` | `getCurrentDraft()` — draft lookup |
| `data-layer.js` | 389 | `const key = \`draft_${projectId}_${date}\`` | `saveDraft()` — draft write |
| `data-layer.js` | 400 | `const key = \`draft_${projectId}_${date}\`` | `deleteDraft()` — draft deletion |

### 1.2 Every Place `draft_{projectId}_{date}` Is Read

| File | Line | Function | How Used |
|------|------|----------|----------|
| `quick-interview.js` | 668 | `loadFromLocalStorage()` | `getCurrentReport(draftId)` — lookup in `fvp_current_reports` |
| `quick-interview.js` | 826 | `updateLocalReportToRefined()` | `getCurrentReport(draftKey)` — read existing draft data before migrating to UUID |
| `data-layer.js` | 379 | `getCurrentDraft()` | Direct key lookup in `fvp_current_reports` map |

### 1.3 Every Place `draft_{projectId}_{date}` Is Written

| File | Line | Function | What's Written |
|------|------|----------|---------------|
| `quick-interview.js` | 641 | `saveToLocalStorage()` | Full report entry with `_draft_data` nested blob |
| `data-layer.js` | 389 | `saveDraft()` | Simplified draft data with `updatedAt` |

### 1.4 Every Place `draft_{projectId}_{date}` Is Deleted

| File | Line | Function | Trigger |
|------|------|----------|---------|
| `quick-interview.js` | 678 | `loadFromLocalStorage()` | **BUG: Silent deletion when `reportDate !== today`** |
| `quick-interview.js` | 812 | `clearLocalStorageDraft()` | After successful AI processing |
| `quick-interview.js` | 840 | `updateLocalReportToRefined()` | Migrates draft→UUID, then deletes old draft key |
| `quick-interview.js` | 1130 | `confirmCancelReport()` | User cancels report |
| `quick-interview.js` | 2531 | `finishMinimalReport()` | Post-AI cleanup |
| `quick-interview.js` | 5320 | `finishReport()` | Post-AI cleanup (guided) |
| `data-layer.js` | 400 | `deleteDraft()` | Called by `clearAfterSubmit()` |

### 1.5 Every Place a UUID/reportId Is Constructed

| File | Line | Code | Context |
|------|------|------|---------|
| `index.js` | 218 | `const newReportId = crypto.randomUUID()` | `continueDailyReport()` — new report from dashboard |
| `index.js` | 308 | `const newReportId = crypto.randomUUID()` | `selectProjectAndProceed()` — new report from project picker |
| `quick-interview.js` | 3696 | `const reportId = currentReportId \|\| getReportIdFromUrl() \|\| generateId()` | `saveReportToSupabase()` — fallback UUID generation |
| `quick-interview.js` | 5443 | `currentReportId = generateId()` | DOMContentLoaded init — if URL has no reportId |
| `ui-utils.js` | 21 | `return crypto.randomUUID()` | `generateId()` — shared UUID generator |

### 1.6 Every Place a UUID/reportId Is Read

| File | Line | Function | Source |
|------|------|----------|--------|
| `quick-interview.js` | 8 | `getReportIdFromUrl()` | `?reportId` URL param |
| `quick-interview.js` | 5438 | DOMContentLoaded | `getReportIdFromUrl()` → `currentReportId` |
| `report.js` | 887 | `loadReport()` | `params.get('reportId')` URL param |
| `report.js` | 893 | `loadReport()` | `getReportData(reportIdParam)` from `fvp_report_{uuid}` |
| `index.js` | 350+ | `renderReportCard()` | `report.id` from `fvp_current_reports` entries |

### 1.7 Every Place a UUID/reportId Is Written

| File | Line | What | Where |
|------|------|------|-------|
| `quick-interview.js` | 2495+ | `finishMinimalReport()` | `fvp_report_{uuid}` via `saveReportData()`, `fvp_current_reports[uuid]` directly, Supabase `reports`, `report_raw_capture`, `ai_responses` |
| `quick-interview.js` | 5280+ | `finishReport()` | Same as above (guided mode) |
| `quick-interview.js` | 3696 | `saveReportToSupabase()` | Supabase `reports` table, `report_raw_capture` table |
| `report.js` | 2278 | `saveReportToLocalStorage()` | `fvp_report_{uuid}` via `saveReportData()` |
| `report.js` | 4282 | `saveToFinalReports()` | Supabase `final_reports` table |
| `report.js` | 4359 | `cleanupLocalStorage()` | `fvp_current_reports` (deletes entry) |

### 1.8 Every Place a UUID/reportId Is Deleted

| File | Line | Function | What's Deleted |
|------|------|----------|---------------|
| `report.js` | 4359 | `cleanupLocalStorage()` | `fvp_report_{uuid}` + entry from `fvp_current_reports` + IDB photos |
| `report.js` | 4511 | `executeDeleteReport()` | `fvp_report_{uuid}` + `fvp_current_reports` + IDB + ALL Supabase child tables + storage |
| `quick-interview.js` | 1130 | `confirmCancelReport()` | `fvp_current_reports` entry + Supabase cascade delete (if UUID, 36 chars) |

### 1.9 Legacy `fieldvoice_report_{projectId}_{date}` Key

| File | Line | Code | Status |
|------|------|------|--------|
| `quick-interview.js` | 3558 | `function getReportKey(projectId, dateStr)` | **Function definition** — returns `fieldvoice_report_${projectId}_${date}` |
| `quick-interview.js` | 3564 | `function getTodayKey()` | Calls `getReportKey()` — convenience wrapper |
| `quick-interview.js` | 2127 | `const reportKey = getReportKey(activeProject?.id, todayStr)` | `buildProcessPayload()` — **only usage**: sent to n8n as `payload.reportId` |

**Status:** DEAD as a storage key. Only used as a label in the n8n webhook payload. Not used for any localStorage/IndexedDB/Supabase operations.

### 1.10 Every Place Report Identity Is Derived from `projectId + date` (Not UUID)

| File | Line | Context |
|------|------|---------|
| `quick-interview.js` | 641 | `saveToLocalStorage()` — draft key fallback |
| `quick-interview.js` | 668 | `loadFromLocalStorage()` — draft lookup fallback |
| `quick-interview.js` | 678 | `loadFromLocalStorage()` — date comparison for stale draft deletion |
| `quick-interview.js` | 812 | `clearLocalStorageDraft()` — draft key fallback |
| `quick-interview.js` | 826 | `updateLocalReportToRefined()` — always constructs draft key for migration |
| `quick-interview.js` | 1130 | `confirmCancelReport()` — draft key fallback |
| `quick-interview.js` | 2127 | `buildProcessPayload()` — legacy key sent to n8n |
| `data-layer.js` | 379,389,400 | `getCurrentDraft/saveDraft/deleteDraft` — all use `draft_{projectId}_{date}` |
| `report-rules.js` | 175 | `canStartNewReport()` — filters by `project_id` + compares `date` to today |

---

## 2. Exact Code Paths — End-to-End Flows

### 2.1 "New Report" Tap → UUID Generation → First localStorage Write

```
USER: Taps "Begin Daily Report" on index.html

1. index.js:beginDailyReport()
   → showProjectPickerModal()
   → User selects project

2. index.js:selectProjectAndProceed(projectId)  [line 297]
   a. setStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId)
   b. const newReportId = crypto.randomUUID()        ← UUID BORN
   c. window.location.href = `quick-interview.html?reportId=${newReportId}`

3. quick-interview.html loads scripts in order:
   config.js → storage-keys.js → indexeddb-utils.js → data-layer.js →
   report-rules.js → supabase-utils.js → sync-manager.js →
   pwa-utils.js → auth.js → ui-utils.js → media-utils.js → photo-markup.js →
   quick-interview.js

4. quick-interview.js DOMContentLoaded [line 5395]
   a. checkReportState() → returns true (always allows)
   b. loadUserSettings() → from IDB/Supabase
   c. initSyncManager()
   d. loadActiveProject() → from IDB/Supabase
   e. (lock check removed — lock-manager.js deleted)
   f. report = await getReport()
      → getReport() [line 3575]: sets currentReportId = null, returns createFreshReport()
   g. currentReportId = getReportIdFromUrl()  [line 5438]
      → reads ?reportId from URL → now set to UUID from step 2b
   h. If still no reportId: currentReportId = generateId()  [line 5443]
   i. loadFromLocalStorage()  [line 5449]
      → draftId = currentReportId (UUID) || draft_{projectId}_{today}
      → getCurrentReport(UUID) → null (first visit)
      → returns null → no restoration
   j. shouldShowModeSelection() → true (fresh report)
   k. showModeSelectionScreen()
   l. Fetch weather in background

5. USER: Selects "Guided" or "Minimal" mode
   → selectCaptureMode(mode)
   → report.meta.captureMode = mode
   → saveReport() [line 3654]
     → debounced 500ms → saveToLocalStorage() [line 606]

6. FIRST LOCALSTORAGE WRITE — saveToLocalStorage() [line 606]
   a. activeProjectId = getStorageItem(ACTIVE_PROJECT_ID)
   b. todayStr = getTodayDateString()
   c. Builds data blob with all report fields
   d. Constructs reportData:
      {
        id: currentReportId || `draft_${activeProjectId}_${todayStr}`,
        // ↑ currentReportId IS set (from URL), so UUID is used
        project_id: activeProjectId,
        project_name: activeProject?.projectName,
        date: todayStr,
        status: 'draft',
        capture_mode: data.captureMode,
        created_at: ...,
        _draft_data: data  // Full nested blob
      }
   e. saveCurrentReport(reportData)
      → reads fvp_current_reports map
      → sets reports[UUID] = reportData (with updated_at)
      → writes back to localStorage
```

**KEY FINDING:** Because `currentReportId` is set from the URL param before the first save, the first write **already uses the UUID** — not the draft key. The draft key fallback in `saveToLocalStorage()` line 641 is only triggered if `currentReportId` is somehow null.

### 2.2 "Finish" → AI Processing → report.html Handoff

```
USER: Taps "Finish" button in guided mode

1. quick-interview.js:finishReport() [line 5157]
   a. showProcessConfirmation() → user confirms
   b. Validate: contractor work, safety answered
   c. showProcessingOverlay()
   d. Set report.meta.interviewCompleted = true, endTime

2. Upload phase:
   a. uploadPendingPhotos() → sync IDB photos to Supabase storage
   b. saveReportToSupabase() [line 3693]
      i. reportId = currentReportId || getReportIdFromUrl() || generateId()
      ii. Upserts to `reports` table (id, project_id, user_id, device_id, report_date, status, toggle_states, safety_no_incidents)
      iii. Upserts to `report_raw_capture` table (report_id, capture_mode, raw_data JSONB with contractor_work, personnel, equipment_usage)
      iv. Sets currentReportId = reportId

3. AI Processing:
   a. payload = buildProcessPayload()
      → payload.reportId = getReportKey() → "fieldvoice_report_{projectId}_{date}" (LEGACY label)
      → payload contains: captureMode, projectContext, fieldNotes, weather, photos, entries, toggleStates, operations, equipmentRows, activities, safety
   b. result = await callProcessWebhook(payload)
      → POST to https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report
      → 30s timeout
      → Returns: { success, aiGenerated, captureMode, originalInput }

4. Post-AI save:
   a. saveAIResponse(result.aiGenerated, processingTime)
      → Upserts to `ai_responses` table
   b. report.meta.status = 'refined'
   c. saveReportToSupabase() again (status update)

5. localStorage save [lines 5295-5327]:
   a. Build reportDataPackage:
      {
        reportId: currentReportId,
        projectId: activeProject?.id,
        reportDate: todayStr,
        status: 'refined',
        aiGenerated: result.aiGenerated || {},
        captureMode: ...,
        originalInput: result.originalInput || payload,
        userEdits: {},
        createdAt: ...,
        lastSaved: ...
      }
   b. saveReportData(currentReportId, reportDataPackage)
      → localStorage key: fvp_report_{UUID}

   c. Update fvp_current_reports:
      currentReports[currentReportId] = {
        id: currentReportId,
        project_id: activeProject?.id,
        project_name: ...,
        date: todayStr,
        report_date: todayStr,
        status: 'refined',
        created_at: ...,
        lastSaved: ...
      }
      → Written directly via localStorage.setItem (bypasses saveCurrentReport helper!)

   d. Clean up old draft key:
      deleteCurrentReport(`draft_${activeProject?.id}_${todayStr}`)

6. Lock release + navigate:
   (lock release removed — lock-manager.js deleted)
   window.location.href = `report.html?date=${todayStr}&reportId=${currentReportId}`
```

### 2.3 "Submit" in report.html → Supabase Upload → Cleanup

```
USER: Clicks "Submit Report" on report.html preview tab

1. report.js:handleSubmit() [line 4189]

2. saveReportToLocalStorage() — save current form state

3. generateVectorPDF() — creates PDF blob

4. uploadPDFToStorage(pdf) [line 4224]
   → Uploads to Supabase storage bucket 'report-pdfs'
   → Path: {currentReportId}/{filename}
   → Returns public URL

5. ensureReportExists() [line 4252]
   → Upserts to `reports` table with id = currentReportId
   → Sets status = 'draft' (will be updated next)

6. saveToFinalReports(pdfUrl) [line 4282]
   → Upserts to `final_reports` table
   → report_id = currentReportId (FK to reports.id)
   → Includes: weather, executive_summary, work_performed, safety, all section data, pdf_url

7. updateReportStatus('submitted', pdfUrl) [line 4341]
   → Updates `reports` table: status = 'submitted', submitted_at, pdf_url

8. cleanupLocalStorage() [line 4359]
   a. deleteReportData(currentReportId)
      → Removes localStorage key fvp_report_{uuid}
   b. Parse fvp_current_reports, delete currentReportId entry, write back
   c. idb.deletePhotosByReportId(currentReportId) — clear IndexedDB photos

9. Navigate: window.location.href = 'archives.html?submitted=true'
```

### 2.4 "Delete" in report.html → Cleanup

```
USER: Clicks delete button on report.html

1. report.js:confirmDeleteReport() → shows modal

2. report.js:executeDeleteReport() [line 4502]

3. Local cleanup:
   a. deleteReportData(currentReportId)
      → Removes fvp_report_{uuid}
   b. Parse fvp_current_reports, delete entry, write back
   c. idb.deleteReport(currentReportId) — if function exists
   d. idb.deletePhotosByReportId(currentReportId)

4. Supabase cleanup (cascading delete):
   a. report_entries WHERE report_id = currentReportId
   b. report_raw_capture WHERE report_id = currentReportId
   c. ai_responses WHERE report_id = currentReportId
   d. final_report_sections WHERE report_id = currentReportId
   e. final_reports WHERE report_id = currentReportId
   f. photos WHERE report_id = currentReportId
   g. reports WHERE id = currentReportId (PARENT — deleted last)

5. Navigate: window.location.href = 'index.html'
```

---

## 3. Supabase Schema — Queried from Database

**Source:** PostgREST OpenAPI spec from `bdqfpemylkqnmeqaoere.supabase.co/rest/v1/`

### 3.1 Table: `reports` (Parent)

| Column | Type | Default | Required | FK | Notes |
|--------|------|---------|----------|-----|-------|
| `id` | uuid | `gen_random_uuid()` | **PK** | — | Report UUID |
| `project_id` | uuid | — | — | `projects.id` | Links to project |
| `user_id` | uuid | — | — | — | Auth user (no FK in schema) |
| `device_id` | text | — | — | — | Device identifier |
| `report_date` | date | — | **Yes** | — | YYYY-MM-DD |
| `inspector_name` | text | — | — | — | Denormalized name |
| `status` | text | `'draft'` | — | — | draft/refined/submitted |
| `capture_mode` | text | `'guided'` | — | — | guided/minimal |
| `toggle_states` | jsonb | — | — | — | Section toggle values |
| `safety_no_incidents` | boolean | — | — | — | Safety checkbox |
| `pdf_url` | text | — | — | — | Submitted PDF URL |
| `submitted_at` | timestamptz | — | — | — | Submission timestamp |
| `created_at` | timestamptz | `now()` | — | — | — |
| `updated_at` | timestamptz | `now()` | — | — | — |

### 3.2 Table: `final_reports`

| Column | Type | Default | FK | Notes |
|--------|------|---------|-----|-------|
| `id` | uuid | `gen_random_uuid()` | **PK** | — |
| `report_id` | uuid | — | `reports.id` | **Report UUID** |
| `pdf_url` | text | — | — | — |
| `submitted_at` | timestamptz | — | — | — |
| `executive_summary` | text | — | — | — |
| `work_performed` | text | — | — | — |
| `safety_observations` | text | — | — | — |
| `delays_issues` | text | — | — | — |
| `qaqc_notes` | text | — | — | — |
| `communications_notes` | text | — | — | — |
| `visitors_deliveries_notes` | text | — | — | — |
| `inspector_notes` | text | — | — | — |
| `materials_used` | text | — | — | — |
| `weather_*` | various | — | — | 6 weather columns |
| `contractors_json` | jsonb | — | — | — |
| `personnel_json` | jsonb | — | — | — |
| `equipment_json` | jsonb | — | — | — |
| `contractors_display` | text | — | — | — |
| `personnel_display` | text | — | — | — |
| `equipment_display` | text | — | — | — |
| `has_*` | boolean | `false` | — | 8 has_ flags |
| `created_at` | timestamptz | `now()` | — | — |

### 3.3 Table: `report_raw_capture`

| Column | Type | FK | Notes |
|--------|------|-----|-------|
| `id` | uuid | **PK** | — |
| `report_id` | uuid | `reports.id` | **Report UUID** |
| `capture_mode` | text | — | 'guided' or 'minimal' |
| `raw_data` | jsonb | — | Contains contractor_work, personnel, equipment arrays |
| `weather` | jsonb | — | Weather snapshot |
| `location` | jsonb | — | GPS coordinates |
| `created_at` | timestamptz | — | — |

### 3.4 Table: `ai_responses`

| Column | Type | FK | Notes |
|--------|------|-----|-------|
| `id` | uuid | **PK** | — |
| `report_id` | uuid | `reports.id` | **Report UUID** (unique constraint for upsert) |
| `raw_response` | jsonb | — | — |
| `generated_content` | jsonb | — | — |
| `created_at` | timestamptz | — | — |

### 3.5 Table: `report_entries`

| Column | Type | FK | Notes |
|--------|------|-----|-------|
| `id` | uuid | **PK** | — |
| `report_id` | uuid | `reports.id` | **Report UUID** |
| `local_id` | text | — | Client-side entry ID for upsert |
| `section` | text | — | 'minimal', 'issues', 'safety', etc. |
| `content` | text | — | Entry text |
| `contractor_id` | uuid | — | For work entries |
| `entry_order` | integer | 0 | — |
| `is_deleted` | boolean | `false` | Soft delete |
| `timestamp` | timestamptz | — | — |
| `created_at` | timestamptz | — | — |
| `updated_at` | timestamptz | — | — |

### 3.6 Table: `photos`

| Column | Type | FK | Notes |
|--------|------|-----|-------|
| `id` | uuid | **PK** | — |
| `report_id` | uuid | `reports.id` | **Report UUID** |
| `storage_path` | text | — | Path in 'report-photos' bucket |
| `photo_url` | text | — | Public URL |
| `caption` | text | — | — |
| `photo_type` | text | — | File type |
| `location_lat` | numeric | — | — |
| `location_lng` | numeric | — | — |
| `gps_lat` | float8 | — | Duplicate GPS columns (legacy?) |
| `gps_lng` | float8 | — | — |
| `filename` | text | — | — |
| `taken_at` | timestamptz | — | — |
| `created_at` | timestamptz | — | — |

### 3.7 Table: `report_submissions` (Legacy/Parallel)

| Column | Type | FK | Notes |
|--------|------|-----|-------|
| `id` | uuid | **PK** | — |
| `report_id` | **text** (not UUID!) | — | **⚠️ TEXT format — could hold legacy keys** |
| `project_id` | uuid | `projects.id` | — |
| `user_id` | uuid | `user_profiles.id` | — |
| `report_date` | date | — | — |
| `capture_mode` | text | — | — |
| `status` | text | `'refined'` | — |
| `ai_response` | jsonb | — | Required |
| `original_input` | jsonb | — | Required |
| `executive_summary` | text | — | — |
| `work_performed` | text | — | — |
| (many more section columns...) | | | |
| `extraction_confidence` | text | — | — |
| `missing_data_flags` | text[] | — | — |
| `used_for_training` | boolean | `false` | — |

**⚠️ CRITICAL:** `report_submissions.report_id` is type `text`, NOT UUID. This table appears to be a legacy/training-data table NOT used by the current app code.

### 3.8 Tables: `report_activities`, `report_operations`, `report_equipment`

All three have `report_id` FK to `report_submissions.id` (NOT `reports.id`). These appear to be legacy child tables of the `report_submissions` system. **The current app stores activities/operations/equipment in `report_raw_capture.raw_data` JSONB instead.**

### 3.9 Table: `projects`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | **PK** |
| `project_name` | text | Required |
| `user_id` | uuid | Owner |
| `noab_project_no` | text | Project number |
| `cno_solicitation_no` | text | — |
| `location` | text | — |
| `prime_contractor` | text | — |
| `engineer` | text | — |
| `contractors` | jsonb | Array of contractor objects with crews |
| `logo_url` | text | — |
| `logo_thumbnail` | text | — |
| `logo` | text | — |
| `status` | text | Default 'active' |
| `notice_to_proceed` | date | — |
| `contract_duration` | integer | — |
| `expected_completion` | date | — |
| `default_start_time` | text | — |
| `default_end_time` | text | — |
| `weather_days` | integer | — |
| `contractors_display` | text | — |
| `created_at` / `updated_at` | timestamptz | — |

### 3.10 Table: `user_profiles`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | **PK** |
| `auth_user_id` | uuid | Supabase Auth UUID |
| `device_id` | text | Links to fvp_device_id |
| `full_name` | text | — |
| `title` | text | — |
| `company` | text | — |
| `email` | text | — |
| `phone` | text | — |
| `role` | text | Default 'inspector' |
| `created_at` / `updated_at` | timestamptz | — |

### 3.11 Table: `messages`

Simple messaging table. Not related to reports.

### 3.12 Table: `final_report_sections`

| Column | Type | FK |
|--------|------|-----|
| `id` | uuid | **PK** |
| `report_id` | uuid | `reports.id` |
| `section_key` | text | Required |
| `section_title` | text | — |
| `content` | text | — |
| `order` | integer | Default 0 |
| `created_at` | timestamptz | — |

### 3.13 Missing Table: `active_reports`

**RESOLVED:** `lock-manager.js` has been removed. The `active_reports` table is no longer referenced by any code.

### 3.14 RLS Policies

Could not query RLS policies directly (no `supabase inspect db policies` command in v2.72.7). The PostgREST API works with the anon key, so either:
- Tables have permissive RLS policies, OR
- RLS is disabled on these tables

### 3.15 Storage Buckets

| Bucket | Used By | Path Pattern |
|--------|---------|-------------|
| `report-photos` | quick-interview.js | `{reportId}/{photoId}_{filename}` |
| `report-pdfs` | report.js | `{reportId}/{filename}` |

---

## 4. localStorage Keys — Complete Inventory

### 4.1 Application Keys (defined in STORAGE_KEYS)

| Key | Writers | Readers | Deleters | Value Shape |
|-----|---------|---------|----------|-------------|
| `fvp_user_profile` | — | — | — | Defined but **UNUSED** by any JS file |
| `fvp_projects` | data-layer.js (loadProjects, refreshProjectsFromCloud) | report-rules.js (canStartNewReport via getStorageItem) | **NEVER** | `{ [projectId]: { id, projectName, ... } }` |
| `fvp_active_project_id` | index.js (selectProjectAndProceed), data-layer.js | ALL pages via getStorageItem | **NEVER** | `"uuid-string"` |
| `fvp_current_reports` | quick-interview.js (saveToLocalStorage, updateLocalReportToRefined, finishMinimalReport, finishReport), storage-keys.js (saveCurrentReport, deleteCurrentReport), report.js (cleanupLocalStorage, executeDeleteReport) | report-rules.js (getReportsByUrgency, canStartNewReport), quick-interview.js (loadFromLocalStorage), index.js (via report-rules.js) | Entries deleted on submit/cancel/delete. Map itself is **NEVER** fully deleted. | `{ [draftKey_or_uuid]: { id, project_id, project_name, date, status, capture_mode, created_at, updated_at, _draft_data?, lastSaved? } }` |
| `fvp_report_{uuid}` | quick-interview.js (finishMinimalReport, finishReport), report.js (saveReportToLocalStorage) | report.js (loadReport) | report.js (cleanupLocalStorage, executeDeleteReport) | `{ reportId, projectId, reportDate, status, aiGenerated, captureMode, originalInput, userEdits, createdAt, lastSaved }` |
| `fvp_ai_reports` | — | — | — | Defined but **UNUSED** |
| `fvp_drafts` | — | — | — | Defined but **UNUSED** |
| `fvp_sync_queue` | quick-interview.js (handleOfflineProcessing via addToSyncQueue) | sync-manager.js | quick-interview.js (clearSyncQueueForReport) | `[ { type, action, data, timestamp, reportId? } ]` |
| `fvp_last_sync` | sync-manager.js | sync-manager.js | **NEVER** | Timestamp string |
| `fvp_device_id` | storage-keys.js (getDeviceId, auto-generated) | ALL pages | **NEVER** | `"uuid-string"` |
| `fvp_user_id` | settings.js | quick-interview.js, sync-manager.js, report.js, data-layer.js | **NEVER** | `"uuid-string"` |
| `fvp_offline_queue` | — | — | — | Defined but **UNUSED** |
| `fvp_mic_granted` | quick-interview.js, permissions.js | index.js, quick-interview.js | **NEVER** | `"true"` or absent |
| `fvp_mic_timestamp` | — | — | — | Defined but **UNUSED** |
| `fvp_cam_granted` | — | — | — | Defined but **UNUSED** |
| `fvp_loc_granted` | permissions.js (via localStorage directly) | index.js | **NEVER** | `"true"` or absent |
| `fvp_loc_lat` | media-utils.js (cacheLocation) | media-utils.js (getCachedLocation) | **NEVER** | Number string |
| `fvp_loc_lng` | media-utils.js (cacheLocation) | media-utils.js (getCachedLocation) | **NEVER** | Number string |
| `fvp_loc_timestamp` | media-utils.js | media-utils.js | **NEVER** | ISO timestamp |
| `fvp_speech_granted` | — | — | — | Defined but **UNUSED** |
| `fvp_onboarded` | permissions.js | index.js | **NEVER** | `"true"` or absent |
| `fvp_banner_dismissed` | index.js | index.js | index.js (after 24h) | `"true"` or absent |
| `fvp_banner_dismissed_date` | index.js | index.js | index.js (after 24h) | ISO date string |
| `fvp_dictation_hint_dismissed` | quick-interview.js | quick-interview.js | **NEVER** | `"true"` or absent |
| `fvp_quick_interview_draft` | — | — | — | Defined but **UNUSED** |
| `fvp_permissions_dismissed` | quick-interview.js | quick-interview.js? | **NEVER** | `"true"` or absent |

### 4.2 Non-STORAGE_KEYS localStorage Keys

| Key Pattern | Writers | Readers | Deleters |
|-------------|---------|---------|----------|
| `fvp_ai_response_*` | Unknown (possibly older code) | index.js (cleanup on load) | index.js (after 24h) |
| `fvp_ai_cache` | data-layer.js (cacheAIResponse) | data-layer.js (getCachedAIResponse) | data-layer.js (clearAIResponseCache) |
| `fvp_migration_v113_idb_clear` | index.js | index.js | **NEVER** |

### 4.3 sessionStorage Keys

| Key | Writers | Readers |
|-----|---------|---------|
| `fvp_submitted_banner_dismissed` | index.js (dismissSubmittedBanner) | index.js (DOMContentLoaded) |

---

## 5. IndexedDB — Complete Inventory

**Database:** `fieldvoice-pro` (from indexeddb-utils.js)

### 5.1 Store: `projects`

| Property | Value |
|----------|-------|
| **Key Path** | `id` (project UUID) |
| **Indexes** | None |
| **Writers** | data-layer.js (`loadProjects`, `refreshProjectsFromCloud`, `loadActiveProject`) |
| **Readers** | data-layer.js (`loadProjects`, `loadActiveProject`) |
| **Deleters** | index.js (migration `clearStore('projects')`) |
| **Record Shape** | Full project object (camelCase or snake_case depending on source) |
| **Report ID?** | No |

### 5.2 Store: `userProfile`

| Property | Value |
|----------|-------|
| **Key Path** | `deviceId` |
| **Indexes** | None |
| **Writers** | data-layer.js (`loadUserSettings`, `saveUserSettings`) |
| **Readers** | data-layer.js (`loadUserSettings`) |
| **Deleters** | **NEVER** |
| **Record Shape** | `{ deviceId, id, fullName, title, company, email, phone }` |
| **Report ID?** | No |

### 5.3 Store: `photos`

| Property | Value |
|----------|-------|
| **Key Path** | `id` (photo UUID) |
| **Indexes** | `reportId`, `syncStatus` |
| **Writers** | quick-interview.js (`savePhotoToIndexedDB`), quick-interview.js (`uploadPendingPhotos` — updates syncStatus) |
| **Readers** | quick-interview.js (`uploadPendingPhotos` via `getPhotosBySyncStatus`) |
| **Deleters** | quick-interview.js (`deleteMinimalPhoto`, `removePhoto`), report.js (`cleanupLocalStorage`, `executeDeleteReport`) |
| **Record Shape** | `{ id, reportId, base64, url, storagePath, caption, gps, timestamp, fileName, syncStatus, createdAt }` |
| **Report ID?** | **YES — `reportId` field. Can be UUID or `'pending'`** |

### 5.4 Store: `archives`

| Property | Value |
|----------|-------|
| **Key Path** | `id` |
| **Indexes** | `projectId` |
| **Writers** | **NONE** — store exists but is never written to by the app |
| **Readers** | **NONE** |
| **Deleters** | **NONE** |
| **Report ID?** | Presumably, but never populated |

---

## 6. Page-by-Page Data Flow

### 6.1 `login.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config.js, storage-keys.js, inline JS |
| **Expects on load** | Nothing — entry point |
| **Reads** | `fvp_device_id` (auto-generates if absent) |
| **Writes** | Supabase auth session (handled by Supabase JS SDK) |
| **Passes to next** | Redirects to `index.html` on successful login |
| **Cleanup** | None |
| **Touches report data?** | No |

### 6.2 `landing.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | pwa-utils.js |
| **Expects** | Nothing |
| **Purpose** | Marketing/info page, PWA install prompt |
| **Touches report data?** | No |

### 6.3 `permissions.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | pwa-utils.js, storage-keys.js, ui-utils.js, permissions.js |
| **Expects** | First-time mobile user |
| **Writes** | `fvp_mic_granted`, `fvp_loc_granted`, `fvp_onboarded`, `fvp_loc_lat/lng/timestamp` |
| **Passes to next** | Redirects to `index.html` |
| **Touches report data?** | No |

### 6.4 `index.html` (Dashboard)

| Aspect | Details |
|--------|---------|
| **Scripts** | config, storage-keys, report-rules, supabase-utils, sync-manager, pwa-utils, ui-utils, indexeddb-utils, data-layer, auth, api-keys, maps, compass, + inline JS |
| **Expects** | Authenticated user |
| **Reads** | `fvp_current_reports` (via getReportsByUrgency), `fvp_active_project_id`, `fvp_projects`, `fvp_sync_queue`, IDB projects, Supabase projects |
| **Writes** | `fvp_active_project_id` (on project select), `fvp_projects` (on load), IDB projects (refresh). Cleans up `fvp_ai_response_*` keys older than 24h. |
| **Passes to next** | `?reportId={uuid}` to quick-interview.html (new report), `?date={}&reportId={}` to report.html (refined), `?id={}` to archives.html (submitted) |
| **Cleanup** | Stale AI response cache cleanup. Migration: clears IDB projects store (one-time). |

### 6.5 `quick-interview.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, storage-keys, indexeddb-utils, data-layer, report-rules, supabase-utils, sync-manager, pwa-utils, auth, ui-utils, media-utils, photo-markup, quick-interview |
| **Expects** | `?reportId={uuid}` URL param, `fvp_active_project_id` set |
| **Reads** | URL `reportId`, `fvp_active_project_id`, `fvp_current_reports[draftId]`, IDB projects, IDB photos, Supabase user_profiles |
| **Writes** | `fvp_current_reports` (draft saves, refined update), `fvp_report_{uuid}` (on Finish), `fvp_sync_queue` (offline), IDB photos, Supabase reports, report_raw_capture, ai_responses, photos, report-photos storage |
| **Passes to next** | `report.html?date={}&reportId={uuid}` on Finish success, `index.html` on cancel |
| **Cleanup** | Deletes `draft_{projectId}_{date}` key after migration to UUID. Deletes from Supabase on cancel. |

### 6.6 `report.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, storage-keys, indexeddb-utils, data-layer, supabase-utils, auth, ui-utils, jspdf, report |
| **Expects** | `?reportId={uuid}` (required), `?date={}` (optional), `?tab=preview` (optional) |
| **Reads** | `fvp_report_{uuid}` (source of truth), `fvp_active_project_id`, IDB projects, Supabase projects |
| **Writes** | `fvp_report_{uuid}` (user edits), `fvp_current_reports` (status updates), Supabase reports, final_reports, final_report_sections, report-pdfs storage |
| **Passes to next** | `archives.html?submitted=true` on submit, `index.html` on delete |
| **Cleanup** | On submit: deletes `fvp_report_{uuid}`, entry from `fvp_current_reports`, IDB photos. On delete: same + Supabase cascade. |

### 6.8 `projects.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, pwa-utils, ui-utils, storage-keys, indexeddb-utils, supabase-utils, data-layer, auth, projects |
| **Expects** | Authenticated user |
| **Reads** | IDB projects, Supabase projects, `fvp_active_project_id` |
| **Writes** | `fvp_active_project_id` (on project select), `fvp_projects`, IDB projects |
| **Passes to next** | `project-config.html?id={projectId}` for editing, `index.html` on back |
| **Touches report data?** | No |

### 6.9 `project-config.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, storage-keys, supabase-utils, pwa-utils, auth, ui-utils, indexeddb-utils, data-layer, media-utils, project-config |
| **Expects** | `?id={projectId}` for editing existing, nothing for new |
| **Reads/Writes** | Supabase projects, IDB projects, project logo storage |
| **Touches report data?** | No |

### 6.10 `settings.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, supabase-utils, pwa-utils, ui-utils, storage-keys, indexeddb-utils, data-layer, auth, settings |
| **Reads** | `fvp_device_id`, Supabase user_profiles, IDB userProfile |
| **Writes** | `fvp_user_id`, Supabase user_profiles, IDB userProfile |
| **Touches report data?** | No |

### 6.11 `archives.html`

| Aspect | Details |
|--------|---------|
| **Scripts** | config, storage-keys, auth, archives, ai-assistant |
| **Expects** | `?id={uuid}` for viewing specific report, `?submitted=true` for success banner |
| **Reads** | Supabase reports (with projects join), final_reports (for PDF URL), photos |
| **Writes** | Nothing to localStorage/IDB |
| **Touches report data?** | Read-only from Supabase |

---

## 7. JS Module Dependency Map

| File | Lines | Exports/Globals | Dependencies | Touches Report Data? |
|------|-------|----------------|-------------|---------------------|
| `config.js` | 8 | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `supabaseClient` | supabase-js CDN | No |
| `storage-keys.js` | 402 | `window.STORAGE_KEYS`, `getStorageItem`, `setStorageItem`, `removeStorageItem`, `getCurrentReport`, `saveCurrentReport`, `deleteCurrentReport`, `getActiveProject`, `addToSyncQueue`, `getSyncQueue`, `clearSyncQueue`, `getReportDataKey`, `getReportData`, `saveReportData`, `deleteReportData`, `getDeviceId` | None | **Yes — defines all report storage operations** |
| `report-rules.js` | 610 | `REPORT_STATUS`, `CAPTURE_MODE`, `GUIDED_SECTIONS`, `getTodayDateString`, `canStartNewReport`, `getReportsByUrgency`, `canTransitionStatus`, `isReportEditable`, `canChangeToggle`, + more | storage-keys.js | **Yes — reads `fvp_current_reports`** |
| `ui-utils.js` | 327 | `generateId`, `escapeHtml`, `formatDate`, `getLocalDateString`, `autoExpand`, `showToast`, + more | None | No |
| `supabase-utils.js` | 762 | `fromSupabaseProject`, `toSupabaseProject`, + converters | None | No (pure converters) |
| `indexeddb-utils.js` | 584 | `window.idb.*` (saveProject, getProject, getAllProjects, savePhoto, getPhoto, deletePhoto, getPhotosByReportId, deletePhotosByReportId, saveUserProfile, getUserProfile, clearStore, + more) | None | **Yes — IDB operations for photos** |
| `data-layer.js` | 612 | `window.dataLayer.*` (loadProjects, loadActiveProject, refreshProjectsFromCloud, loadUserSettings, getCurrentDraft, saveDraft, deleteDraft, + more) | storage-keys.js, indexeddb-utils.js, supabase-utils.js, config.js | **Yes — draft CRUD uses `draft_{projectId}_{date}`** |
| `sync-manager.js` | 435 | `initSyncManager`, `queueEntryBackup`, `deleteEntry` | storage-keys.js, config.js | **Yes — queues entry sync operations** |
| `auth.js` | 212 | `window.auth.*` (requireAuth, signOut) | config.js, storage-keys.js | No |
| `quick-interview.js` | 5520 | Many via inline `<script>` context (not module exports) | ALL of the above | **YES — EPICENTER of dual-key logic** |
| `report.js` | 4563 | Functions exposed via `window.*` | config, storage-keys, indexeddb-utils, data-layer, supabase-utils, auth, ui-utils | **Yes — UUID-only** |
| `index.js` | 1116 | Functions exposed via `window.*` | config, storage-keys, report-rules, supabase-utils, sync-manager, ui-utils, indexeddb-utils, data-layer, auth | **Yes — reads fvp_current_reports, generates UUIDs** |
| `archives.js` | 349 | Inline functions | config, storage-keys, auth | **Yes — reads from Supabase only** |
| `projects.js` | 384 | Inline functions | config, storage-keys, data-layer, supabase-utils | No |
| `project-config.js` | 1316 | Inline functions | config, storage-keys, supabase-utils, data-layer, media-utils, ui-utils | No |
| `settings.js` | 534 | Inline functions | config, storage-keys, data-layer, supabase-utils, auth | No |
| `media-utils.js` | 330 | `readFileAsDataURL`, `dataURLtoBlob`, `compressImage`, `getHighAccuracyGPS`, `getFreshLocation`, `getCachedLocation`, `cacheLocation` | storage-keys.js | No |
| `photo-markup.js` | 930 | `openPhotoMarkup` | None | No |
| `pwa-utils.js` | 155 | `initPWA` | None | No |
| `sw.js` | 233 | Service worker (separate context) | None | No |
| `ai-assistant.js` | 772 | AI chat overlay | config.js | No |

---

## 8. n8n AI Processing Flow

### 8.1 What Gets Sent to n8n on "Finish"

**Webhook URL:** `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report`  
**Method:** POST  
**Timeout:** 30 seconds  
**Built by:** `buildProcessPayload()` at quick-interview.js line 2120

### 8.2 Request Payload Format

```json
{
  "reportId": "fieldvoice_report_{projectId}_{YYYY-MM-DD}",  // ⚠️ LEGACY format!
  "captureMode": "guided" | "minimal",
  
  "projectContext": {
    "projectId": "uuid",
    "projectName": "string",
    "noabProjectNo": "string",
    "location": "string",
    "engineer": "string",
    "primeContractor": "string",
    "contractors": [ { "id", "name", "type", "crews": [...] } ],
    "equipment": []
  },
  
  "fieldNotes": {
    // If minimal:
    "freeformNotes": "combined entries string",
    "freeform_entries": [ { "id", "content", "created_at" } ]
    // If guided:
    "workSummary": "string",
    "issues": "string", 
    "safety": "string"
  },
  
  "weather": { "highTemp", "lowTemp", "precipitation", "generalCondition", "jobSiteCondition", "adverseConditions" },
  
  "photos": [ { "id", "url", "storagePath", "caption", "timestamp", "date", "time", "gps" } ],
  
  "reportDate": "locale date string",
  "inspectorName": "string",
  
  "operations": [ { "contractorId", "superintendents", "foremen", ... } ],
  "equipmentRows": [ { "id", "contractorId", "type", "qty", "status" } ],
  "activities": [ { "contractorId", "noWork", "narrative", ... } ],
  "safety": { "hasIncidents", "noIncidents", "notes": [] },
  
  "entries": [ { "id", "section", "content", "timestamp", "entry_order", "is_deleted" } ],
  "toggleStates": { "communications_made": true, "qaqc_performed": false, ... }
}
```

### 8.3 What n8n Returns

```json
{
  "success": true,
  "aiGenerated": {
    "executive_summary": "string",
    "work_performed": "string",
    "activities": [ { "contractor_name", "narrative", ... } ],
    "operations": [ { "contractor_name", "personnel counts", ... } ],
    "equipment": [ { ... } ],
    "generalIssues": [ "string" ],
    "qaqcNotes": [ "string" ],
    "safety": { "hasIncidents", "noIncidents", "notes": "string" },
    "inspector_notes": "string",
    ...
  },
  "captureMode": "guided" | "minimal",
  "originalInput": { /* copy of request payload */ }
}
```

### 8.4 Where Response Is Stored

1. **Supabase `ai_responses` table:** `{ report_id: UUID, response_payload: jsonb, model_used: 'n8n-fieldvoice-refine', processing_time_ms, received_at }` — upserted on conflict `report_id`
2. **localStorage `fvp_report_{uuid}`:** Full package with `aiGenerated`, `originalInput`, `userEdits`, metadata
3. **localStorage `fvp_current_reports[uuid]`:** Updated entry with `status: 'refined'`

### 8.5 Does n8n Reference Report IDs?

**In the request:** `payload.reportId` uses the LEGACY format `fieldvoice_report_{projectId}_{date}`. n8n may store or reference this, but it's not used by the app for any lookup after the webhook returns.

**In the response:** n8n echoes back `originalInput` which contains the legacy `reportId`. The app ignores it — it uses `currentReportId` (UUID) for all storage.

### 8.6 Other Hardcoded Webhook URLs

| URL | File | Purpose |
|-----|------|---------|
| `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report` | quick-interview.js:2119 | AI refinement |
| `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report` | report.js:~25 | `N8N_PROCESS_WEBHOOK` (retry refine) |
| `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text` | report.js:~26 | `N8N_REFINE_TEXT_WEBHOOK` (per-field text refinement) |

---

## 9. Bugs, Orphans, and Dead Code

### 9.1 The Line 678 Date-Check Deletion Bug

**File:** `quick-interview.js`, lines 673-681  
**Function:** `loadFromLocalStorage()`

```javascript
// Verify it's for the same project and date
if (data.projectId !== activeProjectId || data.reportDate !== today) {
    // Different project or date - clear old draft
    console.log('[LOCAL] Draft is for different project/date, clearing');
    deleteCurrentReport(draftId);
    return null;
}
```

**Conditions for data loss:**
1. User starts a report on Day 1 (e.g., 2025-06-09)
2. Draft is saved with `reportDate: '2025-06-09'`
3. User doesn't finish. App stays in background or is closed.
4. On Day 2 (2025-06-10), user navigates to `quick-interview.html?reportId={uuid}`
5. `loadFromLocalStorage()` runs:
   - `today` = `'2025-06-10'`
   - `data.reportDate` = `'2025-06-09'`
   - Comparison fails → **draft is DELETED**
6. User sees empty form. No warning. Data is gone.

**Risk Level:** HIGH — Affects any report started but not finished before midnight.

**Note:** The dashboard shows late reports and links to `quick-interview.html?reportId={id}`. So users are actively directed to this page for late reports, where they get their data silently deleted.

### 9.2 `active_reports` Table Missing

**RESOLVED:** `lock-manager.js` has been removed. The `active_reports` table and all lock operations are no longer part of the codebase.

### 9.3 Orphaned `fvp_report_{uuid}` Keys on Cancel

**Flow:** User starts report → reaches AI refinement → `fvp_report_{uuid}` is created → user navigates back or cancels from report.html

`confirmCancelReport()` in quick-interview.js deletes from `fvp_current_reports` and Supabase, but does NOT delete `fvp_report_{uuid}` from localStorage. These keys accumulate forever.

**Fix:** Add `deleteReportData(currentReportId)` to `confirmCancelReport()`.

### 9.4 Photo `reportId: 'pending'`

**File:** quick-interview.js line 3860

```javascript
const photoRecord = {
    id: photo.id,
    reportId: currentReportId || 'pending',
    ...
};
```

If a photo is captured before `currentReportId` is set (theoretically shouldn't happen after the init flow fix in v6.6.20, but could happen in edge cases), the photo gets `reportId: 'pending'`.

`uploadPendingPhotos()` does handle this:
```javascript
const reportPhotos = pendingPhotos.filter(p => p.reportId === currentReportId || p.reportId === 'pending');
```
But photos with `'pending'` are never cleaned up if the report is deleted.

### 9.5 Duplicate Entry Risk in `fvp_current_reports`

If `updateLocalReportToRefined()` at line 826 fails (e.g., localStorage is full), both the `draft_{projectId}_{date}` entry AND the new UUID entry will exist in `fvp_current_reports`. The dashboard will show two cards for the same report.

The finishMinimalReport/finishReport functions have their own cleanup (deleting the draft key), but this runs after the UUID entry is created. If the page crashes between creating the UUID entry and deleting the draft key, duplicates persist.

### 9.6 `fvp_current_reports` Never Cleaned Up for Old Entries

Entries from previous days with status 'submitted' remain in `fvp_current_reports` until the page reloads (they're displayed in "Submitted Today" section). But entries from 2+ days ago that were submitted are never cleaned up. The map grows over time.

### 9.7 Dead/Unused STORAGE_KEYS

| Key | Defined | Used Anywhere? |
|-----|---------|---------------|
| `fvp_user_profile` | Yes | **No** |
| `fvp_ai_reports` | Yes | **No** |
| `fvp_drafts` | Yes | **No** |
| `fvp_offline_queue` | Yes | **No** |
| `fvp_mic_timestamp` | Yes | **No** |
| `fvp_cam_granted` | Yes | **No** |
| `fvp_speech_granted` | Yes | **No** |
| `fvp_quick_interview_draft` | Yes | **No** |

### 9.8 Unused data-layer.js Draft Functions

`getCurrentDraft()`, `saveDraft()`, `deleteDraft()`, `getAllDrafts()` in data-layer.js all use the `draft_{projectId}_{date}` format. These are **not called by any page** — quick-interview.js has its own `saveToLocalStorage()`/`loadFromLocalStorage()` that bypass data-layer.js entirely.

### 9.9 `report_submissions` Schema Mismatch

The `report_submissions` table has `report_id` as `text` type (not UUID) and FK relationships to `report_activities`, `report_operations`, `report_equipment`. None of these tables or relationships are used by the current v6.9 app code. They appear to be a legacy schema from an earlier version that stored all data in normalized tables instead of the current JSONB approach.

### 9.10 No `pagehide` Event Listener

~~`lock-manager.js` uses `beforeunload` for lock release~~ — **RESOLVED**: lock-manager.js removed.

### 9.11 No `navigator.storage.persist()` Call

The app does not request persistent storage. On mobile browsers, especially Safari, the OS can evict localStorage and IndexedDB data without warning. This could destroy draft reports.

### 9.12 Direct `localStorage.getItem/setItem` Bypasses

Both `finishMinimalReport()` and `finishReport()` directly manipulate `fvp_current_reports` via `JSON.parse(localStorage.getItem('fvp_current_reports'))` instead of using the `saveCurrentReport()` helper. This bypasses any future centralized validation or logging.

---

## 10. Impact Analysis for UUID Migration

### 10.1 Files That Need Changes

| Priority | File | What Changes | Lines Affected |
|----------|------|-------------|---------------|
| 🔴 P0 | `quick-interview.js` | Remove all `draft_` fallbacks, ensure UUID before first save, fix stale draft deletion | ~641, ~668, ~678, ~812, ~826, ~1130, ~2127, ~2531, ~3558, ~3564, ~5320, ~5443 |
| 🟡 P1 | `data-layer.js` | Remove `getCurrentDraft/saveDraft/deleteDraft/getAllDrafts` (unused) or migrate to UUID | ~379-410 |
| 🟡 P1 | `quick-interview.js` | Update `buildProcessPayload()` to send UUID as `reportId` | ~2127 |
| 🟢 P2 | `storage-keys.js` | Remove unused STORAGE_KEYS constants | STORAGE_KEYS definition block |
| 🟢 P2 | `quick-interview.js` | Remove `getReportKey()` and `getTodayKey()` dead functions | ~3558-3564 |
| 🟢 P2 | `report.js` | Add `fvp_report_{uuid}` cleanup to cancel flow | executeDeleteReport already handles this |
| 🟢 P2 | `quick-interview.js` | Add `deleteReportData(currentReportId)` to `confirmCancelReport()` | ~1130 |
| ~~⚪ P3~~ | ~~`lock-manager.js`~~ | ~~Create `active_reports` table~~ — **RESOLVED**: lock-manager.js removed | N/A |
| ⚪ P3 | `index.js` / all pages | Add `navigator.storage.persist()` call | DOMContentLoaded |

### 10.2 Order of Changes (Dependencies)

1. **Ensure UUID is always available before first save** — In DOMContentLoaded, `currentReportId` must be set from URL param or `generateId()` BEFORE any `saveReport()` call. This is already happening as of v6.6.20 (lines 5438-5443), but verify it can't be null.

2. **Remove `draft_` fallbacks from `saveToLocalStorage()`** — Line 641: change from `currentReportId || \`draft_...\`` to just `currentReportId`. Add assertion/guard.

3. **Remove date check in `loadFromLocalStorage()`** — Line 678: Remove the `reportDate !== today` deletion. Late reports should load their data, not destroy it.

4. **Remove `draft_` fallback from other functions** — Lines 668, 812, 826, 1130: all `draftId` constructions should use `currentReportId` only.

5. **Remove `updateLocalReportToRefined()` draft-to-UUID migration** — This entire function exists to handle the transition from draft keys to UUID keys. Once draft keys are never created, this simplifies to just updating the status.

6. **Update `buildProcessPayload()`** — Send `currentReportId` (UUID) instead of `getReportKey()` legacy format.

7. **Clean up dead code** — Remove `getReportKey()`, `getTodayKey()`, unused STORAGE_KEYS, unused data-layer.js draft functions.

8. **Add orphan cleanup** — `confirmCancelReport()` should call `deleteReportData(currentReportId)`.

### 10.3 Supabase Schema Changes

| Change | Table | SQL |
|--------|-------|-----|
| ~~Create lock table~~ | ~~`active_reports`~~ | **RESOLVED**: lock-manager.js removed, no table needed |
| Drop legacy tables (optional) | `report_submissions`, `report_activities`, `report_operations`, `report_equipment` | `DROP TABLE ...` |

No schema changes needed for the UUID migration itself — the `reports` table already uses UUID as its primary key. The migration is purely client-side.

### 10.4 Data Migration for Existing Users

Users who have active reports stored under `draft_{projectId}_{date}` keys in `fvp_current_reports` need a one-time migration:

```javascript
// Migration: Run once on app load
function migrateDraftKeysToUUID() {
  const reports = JSON.parse(localStorage.getItem('fvp_current_reports') || '{}');
  let changed = false;
  
  for (const [key, entry] of Object.entries(reports)) {
    if (key.startsWith('draft_')) {
      // Generate UUID for this draft
      const uuid = crypto.randomUUID();
      entry.id = uuid;
      reports[uuid] = entry;
      delete reports[key];
      changed = true;
      console.log(`[MIGRATION] ${key} → ${uuid}`);
    }
  }
  
  if (changed) {
    localStorage.setItem('fvp_current_reports', JSON.stringify(reports));
  }
}
```

### 10.5 Breaking Changes

1. **n8n webhook `reportId` field changes format** — If n8n workflows reference `reportId` (e.g., for logging, deduplication), they'll now receive UUIDs instead of `fieldvoice_report_{projectId}_{date}`. Check n8n workflows.

2. **Late report links will navigate with UUID** — Dashboard cards for late reports will use `quick-interview.html?reportId={uuid}`. Since the stale draft deletion bug is being fixed simultaneously, this should work correctly.

3. **No backwards compatibility** — Once the migration runs and converts `draft_` keys to UUIDs, the old code (if reverted) wouldn't find them.

### 10.6 Risks and Edge Cases

1. **Concurrent browser tabs** — Two tabs with the same `?reportId` will overwrite each other's `fvp_current_reports` entries. The lock manager is supposed to prevent this but the table is missing.

2. **Migration timing** — If migration runs mid-save (unlikely but possible), data could be lost. Migration should run early in DOMContentLoaded before any save operations.

3. **`fvp_report_{uuid}` accumulation** — Without the cancel-cleanup fix, these keys grow unbounded. Need to add periodic cleanup (e.g., delete entries older than 7 days).

4. **Safari ITP** — Safari may partition or delete localStorage for sites not visited regularly. Combined with no `navigator.storage.persist()`, this is a data loss risk independent of the migration.

---

## Appendix: `fvp_current_reports` Entry Shapes

### Draft (before AI processing)
```json
{
  "id": "uuid-from-url-param",
  "project_id": "project-uuid",
  "project_name": "Airport Terminal B",
  "date": "2025-06-10",
  "status": "draft",
  "capture_mode": "guided",
  "created_at": 1718000000000,
  "updated_at": 1718000500000,
  "_draft_data": {
    "projectId": "project-uuid",
    "reportDate": "2025-06-10",
    "captureMode": "guided",
    "lastSaved": "2025-06-10T10:30:00.000Z",
    "meta": { "createdAt": "...", "version": 2, "captureMode": "guided", "status": "draft" },
    "weather": { "highTemp": "85°F", ... },
    "entries": [ { "id": "entry_...", "section": "issues", "content": "...", ... } ],
    "toggleStates": { "communications_made": true, ... },
    "activities": [ { "contractorId": "uuid", "noWork": false } ],
    "operations": [ { "contractorId": "uuid", "superintendents": 2, ... } ],
    "equipmentRows": [],
    "photos": [ { "id": "uuid", "url": "...", "caption": "", ... } ],
    "freeform_entries": [],
    "freeform_checklist": {},
    "reporter": { "name": "John Doe" },
    "overview": { "date": "...", "startTime": "8:00 AM", ... }
  }
}
```

### Refined (after AI processing)
```json
{
  "id": "uuid",
  "project_id": "project-uuid",
  "project_name": "Airport Terminal B",
  "date": "2025-06-10",
  "report_date": "2025-06-10",
  "status": "refined",
  "created_at": 1718000000000,
  "lastSaved": "2025-06-10T15:30:00.000Z"
}
```
Note: `_draft_data` may or may not be preserved depending on the code path. `updateLocalReportToRefined()` preserves it; the direct `localStorage.setItem` in `finishMinimalReport()`/`finishReport()` does NOT include it.

### `fvp_report_{uuid}` Shape
```json
{
  "reportId": "uuid",
  "projectId": "project-uuid",
  "reportDate": "2025-06-10",
  "status": "refined",
  "aiGenerated": {
    "executive_summary": "...",
    "work_performed": "...",
    "activities": [...],
    "operations": [...],
    "equipment": [...],
    "generalIssues": [...],
    "qaqcNotes": [...],
    "safety": { ... }
  },
  "captureMode": "guided",
  "originalInput": { /* copy of n8n request payload */ },
  "userEdits": { "executiveSummary": "edited text", ... },
  "createdAt": "2025-06-10T08:00:00.000Z",
  "lastSaved": "2025-06-10T15:30:00.000Z"
}
```
