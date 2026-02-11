# FieldVoice Pro v6.9 - JavaScript Modules & Storage Reference

Developer reference for the JS architecture and all data storage patterns.

## Architecture Overview

- **No build system** — vanilla JS loaded via `<script>` tags
- **Core utilities** live in `js/` root, loaded by all pages
- **Page modules** live in subfolders: `js/{page-name}/main.js`
- **Shared modules** live in `js/shared/` (loaded by multiple pages)
- **State sharing** across files via `var` globals and `window.*` exports

## Core Modules (js/ root)

These are loaded by every page and provide shared infrastructure:

| File | Exports | Purpose |
|------|---------|---------|
| `config.js` | `supabaseClient` | Supabase client initialization |
| `storage-keys.js` | `STORAGE_KEYS`, `getDeviceId()`, `getStorageItem()`, `setStorageItem()`, `removeStorageItem()`, `getCurrentReport()`, `saveCurrentReport()`, `deleteCurrentReport()`, `addToSyncQueue()`, `getReportDataKey()`, `getReportData()`, `saveReportData()`, `deleteReportData()` | localStorage constants and helpers |
| `indexeddb-utils.js` | `window.idb.*` | IndexedDB CRUD operations |
| `data-layer.js` | `window.dataLayer.*` | Unified data access (IndexedDB-first, Supabase-fallback) |
| `supabase-utils.js` | `fromSupabaseProject()`, `toSupabaseProject()`, `toSupabaseUserProfile()` | Data format converters (snake_case to camelCase) |
| `ui-utils.js` | `escapeHtml()`, `generateId()`, `showToast()`, `formatDate()`, `formatTime()`, `autoExpand()` | UI helpers |
| `pwa-utils.js` | `initPWA(options)` | Service worker registration, offline detection |
| `report-rules.js` | `REPORT_STATUS`, `CAPTURE_MODE`, `GUIDED_SECTIONS`, `canStartNewReport()`, `validateReportForAI()`, `validateReportForSubmit()` | Business logic and validation |
| `media-utils.js` | `compressImage()`, `compressImageToThumbnail()`, `uploadLogoToStorage()`, `deleteLogoFromStorage()`, `getHighAccuracyGPS()` | Photo/GPS capture and compression |
| `auth.js` | `requireAuth()`, `getCurrentUser()`, `signOut()` | Authentication flow |

## Page Modules

| Subfolder | Files | Entry Point | HTML Page |
|-----------|-------|-------------|-----------|
| `js/index/` | 11 | `main.js` | `index.html` |
| `js/interview/` | 20 | `main.js` | `quick-interview.html` |
| `js/report/` | 11 | `main.js` | `report.html` |
| `js/project-config/` | 5 | `main.js` | `project-config.html` |
| `js/tools/` | 12 | (loaded individually) | `index.html` (tools panel) |
| `js/shared/` | 2 | (loaded by multiple pages) | Various |
| `js/archives/` | 1 | `main.js` | `archives.html` |
| `js/permissions/` | 1 | `main.js` | `permissions.html` |
| `js/permission-debug/` | 1 | `main.js` | `permission-debug.html` |
| `js/projects/` | 1 | `main.js` | `projects.html` |
| `js/settings/` | 1 | `main.js` | `settings.html` |
| `js/login/` | 1 | `main.js` | `login.html` |
| `js/landing/` | 1 | `main.js` | `landing.html` |

## Import Order

Standard import order for pages:

```html
<!-- CDN Dependencies -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Core Modules (order matters) -->
<script src="./js/config.js"></script>
<script src="./js/storage-keys.js"></script>
<script src="./js/indexeddb-utils.js"></script>
<script src="./js/data-layer.js"></script>

<!-- Utility Modules -->
<script src="./js/supabase-utils.js"></script>
<script src="./js/ui-utils.js"></script>
<script src="./js/pwa-utils.js"></script>

<!-- Feature Modules (as needed) -->
<script src="./js/report-rules.js"></script>
<script src="./js/media-utils.js"></script>
<script src="./js/auth.js"></script>

<!-- Page Feature Modules (before main.js) -->
<script src="./js/{page}/feature-a.js"></script>
<script src="./js/{page}/feature-b.js"></script>

<!-- Page Entry Point (always last) -->
<script src="./js/{page}/main.js"></script>

<!-- Shared (after page init) -->
<script src="./js/shared/ai-assistant.js"></script>
```

---

## Storage Architecture (Developer Reference)

### Overview: 3-Tier Cache Hierarchy

```
1. localStorage (flags only, instant read)
   |
   v  (if empty/expired)
2. IndexedDB (full objects, fast, offline-capable)
   |
   v  (if empty AND online)
3. Supabase (source of truth, network required)
   |
   v  (on success, cache back to tiers 1+2)
```

**Pattern:** IndexedDB-first, Supabase-fallback, cache on fetch. See `data-layer.js` for implementation.

---

### Tier 1: localStorage

All keys use the `fvp_` prefix. Use `getStorageItem()`/`setStorageItem()` from `storage-keys.js` — never call `localStorage` directly.

#### Project & Report Keys

| Key | Type | Writers | Readers | Cleanup |
|-----|------|---------|---------|---------|
| `fvp_projects` | Object `{id: project}` | data-layer.js | report-rules.js | Overwritten on refresh |
| `fvp_active_project_id` | String (UUID) | interview/main.js, projects/main.js, project-config/main.js | data-layer.js, report-rules.js, many modules | Manual (switching projects) |
| `fvp_current_reports` | Object `{reportId: stub}` | interview/draft-storage.js, interview/finish.js | index/report-cards.js, report modules | `deleteCurrentReport()` on submit/delete |
| `fvp_report_{reportId}` | Object (refined report data) | interview/finish.js, report/autosave.js | report/data-loading.js, report/submit.js | `deleteReportData()` on submit/delete |
| `fvp_sync_queue` | Array | `addToSyncQueue()` (interview/ai-processing.js) | **Never read** (TODO) | `clearSyncQueueForReport()` |

#### Identity Keys

| Key | Type | Writers | Readers | Cleanup |
|-----|------|---------|---------|---------|
| `fvp_device_id` | String (UUID) | storage-keys.js (`getDeviceId()`, auto-generated) | auth.js, shared/ai-assistant.js | Never (permanent) |
| `fvp_user_id` | String (UUID) | auth.js, login/main.js | settings/main.js, project-config modules | Sign out |
| `fvp_user_name` | String | auth.js, login/main.js, settings/main.js | UI display | Sign out |
| `fvp_user_email` | String | auth.js, login/main.js, settings/main.js | UI display | Sign out |
| `fvp_auth_user_id` | String (UUID) | auth.js, login/main.js | Login flow | Sign out |
| `fvp_auth_role` | String (`inspector`/`admin`) | auth.js, login/main.js | auth.js (`getAuthRole`) | `removeStorageItem` on sign out |

#### Permission Flags

| Key | Type | Writers | Readers | Cleanup |
|-----|------|---------|---------|---------|
| `fvp_mic_granted` | String (`true`) | permissions/main.js | permissions/main.js, interview/main.js, index/main.js | Reset in permissions |
| `fvp_mic_timestamp` | String (timestamp) | permissions/main.js | permissions/main.js | Reset in permissions |
| `fvp_cam_granted` | String (`true`) | permissions/main.js | permissions/main.js, index/main.js | Reset in permissions |
| `fvp_speech_granted` | String (`true`) | permissions/main.js | permissions/main.js, index/main.js | Reset in permissions |
| `fvp_onboarded` | String (`true`) | permissions/main.js | permissions/main.js, index/main.js | Reset in permissions |
| `fvp_loc_granted` | String (`true`) | ui-utils.js, permissions/main.js | ui-utils.js, permissions/main.js | Reset in ui-utils.js |

#### Location Cache

| Key | Type | Writers | Readers | Cleanup |
|-----|------|---------|---------|---------|
| `fvp_loc_lat` | String (latitude) | ui-utils.js (`saveCachedLocation`) | ui-utils.js | `clearLocationCache()` |
| `fvp_loc_lng` | String (longitude) | ui-utils.js (`saveCachedLocation`) | ui-utils.js | `clearLocationCache()` |
| `fvp_loc_timestamp` | String (timestamp) | ui-utils.js (`saveCachedLocation`) | ui-utils.js | `clearLocationCache()` |

#### UI State Flags

| Key | Type | Writers | Readers | Cleanup |
|-----|------|---------|---------|---------|
| `fvp_banner_dismissed` | String (`true`) | index/main.js | index/main.js | Auto-reset every 30 days |
| `fvp_banner_dismissed_date` | String (ISO date) | index/main.js | index/main.js | Auto-reset every 30 days |
| `fvp_dictation_hint_dismissed` | String (`true`) | interview/guided-sections.js | interview/guided-sections.js | Manual |
| `fvp_permissions_dismissed` | String (`true`) | interview/main.js | interview/main.js | Manual |
| `fvp_ai_conversation` | Array (JSON) | shared/ai-assistant.js | shared/ai-assistant.js | Manual (user can clear) |
| `fvp_settings_scratch` | Object (JSON) | settings/main.js | settings/main.js | `clearScratchData()` |

---

### Tier 2: IndexedDB

**Database:** `fieldvoice-pro`
**Version:** 3
**Module:** `js/indexeddb-utils.js` (exports as `window.idb`)

#### Store: `projects`

| Property | Value |
|----------|-------|
| Key Path | `id` (UUID) |
| Indexes | None |
| Operations | `saveProject(p)`, `getProject(id)`, `getAllProjects()`, `deleteProject(id)` |
| Writers | data-layer.js (`refreshProjectsFromCloud`), project-config/crud.js |
| Readers | data-layer.js (`loadProjects`, `loadActiveProject`) |
| Data | Full project object with nested contractors/crews (camelCase) |

#### Store: `userProfile`

| Property | Value |
|----------|-------|
| Key Path | `deviceId` |
| Indexes | None |
| Operations | `saveUserProfile(p)`, `getUserProfile(deviceId)` |
| Writers | data-layer.js (`saveUserSettings`) |
| Readers | data-layer.js (`loadUserSettings`) |
| Data | `{id, deviceId, fullName, title, company, email, phone}` |

#### Store: `photos`

| Property | Value |
|----------|-------|
| Key Path | `id` (UUID) |
| Indexes | `reportId` (non-unique), `syncStatus` (non-unique) |
| Operations | `savePhoto(p)`, `getPhoto(id)`, `getPhotosByReportId(rid)`, `getPhotosBySyncStatus(s)`, `deletePhoto(id)`, `deletePhotosByReportId(rid)` |
| Writers | interview/photos.js |
| Readers | interview/photos.js, interview/supabase.js |
| Data | `{id, reportId, base64, caption, timestamp, gpsLat, gpsLng, syncStatus}` |

#### Version History

| Version | Change |
|---------|--------|
| 1 | Initial: `projects`, `userProfile` stores |
| 2 | Added `photos` store with `reportId` and `syncStatus` indexes |
| 3 | Removed dead `archives` store |

---

### Tier 3: Supabase

#### Active Tables

**`projects`** — Project definitions
- PK: `id` (UUID)
- Key columns: `project_name`, `location`, `engineer`, `prime_contractor`, `contractors` (JSONB with nested crews), `logo_url`, `logo_thumbnail`
- Writers: project-config/crud.js (upsert)
- Readers: data-layer.js (`refreshProjectsFromCloud`)

**`reports`** — Report metadata
- PK: `id` (UUID), FK: `project_id`
- Key columns: `report_date`, `status` (draft/pending_refine/refined/submitted), `capture_mode`, `toggle_states` (JSONB)
- Writers: interview/supabase.js (upsert on create), report/submit.js (status update)
- Readers: archives/main.js (submitted reports)

**`final_reports`** — Submitted reports archive
- PK: `id` (UUID), FK: `report_id` (unique)
- Key columns: `pdf_url`, weather fields, section text fields, `contractors_json`, `equipment_json`, `personnel_json`
- Writers: report/submit.js (upsert on submit)
- Readers: archives/main.js

**`photos`** — Photo metadata
- PK: `id` (UUID), FK: `report_id`
- Key columns: `photo_url`, `storage_path`, `caption`, `gps_lat`, `gps_lng`
- Writers: interview/supabase.js (upsert after upload)
- Readers: shared/delete-report.js (for cleanup)

**`user_profiles`** — User accounts
- PK: `id` (UUID), `auth_user_id` (unique, links to Supabase Auth)
- Key columns: `full_name`, `title`, `company`, `email`, `phone`, `device_id`, `role`
- Writers: auth.js, login/main.js (upsert on signup/login), settings/main.js
- Readers: data-layer.js, auth.js, login/main.js

**`ai_submissions`** — AI processing history
- PK: `id` (UUID), FK: `report_id` (unique)
- Key columns: `original_input` (JSONB), `ai_response` (JSONB), `model_used`, `processing_time_ms`
- Writers: interview/ai-processing.js (after webhook returns)
- Readers: None (write-only, data flows through localStorage)

#### Backup Tables (write-only)

| Table | Written By | Frequency | Restore Path |
|-------|-----------|-----------|--------------|
| `interview_backup` | interview/autosave.js | Every 5s (debounced) | **None** |
| `report_backup` | report/autosave.js | Every 5s (debounced) | **None** |

These tables store page state snapshots for potential manual recovery but have no automated restore.

#### Storage Buckets

| Bucket | File Pattern | Upload | Delete |
|--------|-------------|--------|--------|
| `report-photos` | `{reportId}/{photoId}_{filename}.jpg` | interview/supabase.js | shared/delete-report.js |
| `report-pdfs` | `{reportId}/{reportId}_{date}_{timestamp}.pdf` | report/submit.js | shared/delete-report.js |
| `project-logos` | `{projectId}_{timestamp}.png` | media-utils.js | media-utils.js |

All buckets have public read + anon write RLS policies (sandbox mode).

---

### Data Lifecycle: Report Flow

```
1. CREATE (index.html)
   -> fvp_current_reports[reportId] = {id, projectId, date, status: 'draft'}
   -> Navigate to quick-interview.html

2. CAPTURE (quick-interview.html)
   -> fvp_current_reports[reportId] updated with entries, weather, toggles
   -> photos saved to IndexedDB (base64 for offline)
   -> interview_backup upserted to Supabase every 5s

3. FINISH (quick-interview.html)
   -> Photos uploaded to report-photos bucket
   -> reports table upserted (status: 'pending_refine')
   -> photos table upserted (metadata)
   -> AI webhook called via n8n
   -> fvp_report_{reportId} = refined AI output
   -> fvp_current_reports[reportId].status = 'refined'
   -> Navigate to report.html

4. EDIT (report.html)
   -> fvp_report_{reportId} updated on every keystroke (500ms debounce)
   -> report_backup upserted to Supabase every 5s

5. SUBMIT (report.html)
   -> PDF generated client-side
   -> PDF uploaded to report-pdfs bucket
   -> final_reports table upserted
   -> reports.status = 'submitted', reports.pdf_url set
   -> DELETE fvp_report_{reportId}
   -> DELETE fvp_current_reports[reportId]
   -> DELETE IndexedDB photos for report
   -> Navigate to archives.html

6. DELETE (any page)
   -> shared/delete-report.js cascade:
   -> DELETE from report-photos bucket
   -> DELETE from report-pdfs bucket
   -> DELETE from photos table
   -> DELETE from final_reports table
   -> DELETE from reports table
   -> DELETE fvp_report_{reportId}
   -> DELETE fvp_current_reports[reportId]
   -> DELETE IndexedDB photos
```

---

## Development Guidelines

1. **Check this file first** before adding a function to an HTML file
2. **Function needed in 2+ pages?** Put it in `js/shared/` or a core module
3. **New page handler?** Create `js/{page-name}/main.js` (subfolder pattern)
4. **Large page module?** Split into focused files in the subfolder, load before `main.js`
5. **Never duplicate** Supabase config, converters, or utility functions
6. **Use `escapeHtml()`** for any user-generated content in HTML
7. **New storage key?** Declare in `STORAGE_KEYS` object in `storage-keys.js`
8. **New IndexedDB store?** Increment `DB_VERSION` in `indexeddb-utils.js`
9. **Page modules don't export** — they attach to `window.*` or use `var` globals
10. **main.js loads last** — declares shared state, contains `DOMContentLoaded` handler
