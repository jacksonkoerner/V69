# FieldVoice Pro V69 — Data Architecture Audit

> **Generated:** 2025-07-15  
> **Scope:** Every data read/write across localStorage, IndexedDB, and Supabase  
> **Purpose:** Foundation document for major data-layer refactor

---

## Table of Contents

1. [Storage Layer Overview](#1-storage-layer-overview)
2. [localStorage Keys](#2-localstorage-keys)
3. [IndexedDB Stores](#3-indexeddb-stores)
4. [Supabase Tables](#4-supabase-tables)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Sync Points](#6-sync-points)
7. [Issues Found](#7-issues-found)
8. [Cross-Device Considerations](#8-cross-device-considerations)

---

## 1. Storage Layer Overview

### localStorage (via `getStorageItem` / `setStorageItem` / direct `localStorage.*`)

**Role:** Fast synchronous key-value store for small data and flags.

- User identity flags (`fvp_user_id`, `fvp_auth_role`, `fvp_org_id`, etc.)
- Permission flags (`fvp_mic_granted`, `fvp_loc_granted`, etc.)
- UX state flags (`fvp_onboarded`, `fvp_banner_dismissed`, etc.)
- **Active report map** (`fvp_current_reports`) — the dashboard's primary data source
- **Individual report data** (`fvp_report_{uuid}`) — AI-generated + user-edited report content
- **Projects cache** (`fvp_projects`) — denormalized map for quick eligibility checks
- Settings scratch pad (`fvp_settings_scratch`)
- Location cache (`fvp_loc_lat`, `fvp_loc_lng`, `fvp_loc_timestamp`)

**Risks:** iOS Safari evicts localStorage after 7 days of inactivity. ~5MB hard limit. No structured queries. Race conditions on concurrent read-modify-write (mitigated by `_saveQueue` in `storage-keys.js`).

### IndexedDB (via `window.idb.*` — database: `fieldvoice-pro`, version 6)

**Role:** Durable local cache with larger storage quota. Survives iOS eviction better than localStorage. Stores large binary data (photos with base64).

- `projects` store — full project objects with nested contractors
- `userProfile` store — user settings keyed by deviceId/authUserId
- `photos` store — photo blobs (base64) + metadata, indexed by reportId and syncStatus
- `currentReports` store — mirror/backup of `fvp_current_reports`
- `draftData` store — full interview draft data (backup of `_draft_data`)
- `cachedArchives` store — offline cache for archives page

**Pattern:** Write-through from localStorage. Hydrate back on page load if localStorage is empty.

### Supabase (via `supabaseClient.from().*`)

**Role:** Source of truth. Cloud persistence. Cross-device sync. PDF/photo storage.

**Tables used:**
- `reports` — report metadata (status, dates, project_id, user_id, pdf_url)
- `report_data` — AI-generated content, original input, user edits (keyed by report_id)
- `interview_backup` — live interview page state (debounced 5s writes)
- `ai_submissions` — AI processing input/output audit trail
- `photos` — photo metadata (storage paths, captions, GPS)
- `projects` — project definitions with JSONB contractors
- `user_profiles` — user identity (linked to auth_user_id)
- `user_devices` — multi-device tracking
- `organizations` — org lookup by slug
- `final_reports` — **DEPRECATED** (legacy, still cleaned up in cascades)
- `report_backup` — **DEPRECATED** (deleted in cascades but no longer written)

**Storage Buckets:**
- `report-photos` — uploaded photo files
- `report-pdfs` — generated PDF files

---

## 2. localStorage Keys

### Identity & Auth Keys

| Key | Data Type | Readers | Writers | When | Purpose |
|-----|-----------|---------|---------|------|---------|
| `fvp_device_id` | string (UUID) | `getDeviceId()` everywhere | `getDeviceId()` (once, on first call) | First page load ever | Permanent device identifier. Survives sign-out. |
| `fvp_user_id` | string (UUID) | `report-creation.js`, `cloud-recovery.js`, `realtime-sync.js`, `submit.js`, `autosave.js`, `persistence.js` | `login/main.js` (sign-in/sign-up), `settings/main.js` (after Supabase upsert), `auth.js` (upsertAuthProfile) | On sign-in, on settings save | user_profiles row `id`. Used as `user_id` in reports table. |
| `fvp_auth_user_id` | string (UUID) | `auth.js` (ensureOrgIdCached) | `login/main.js`, `auth.js` (upsertAuthProfile) | On sign-in | Supabase Auth UUID. Links to user_profiles.auth_user_id. |
| `fvp_auth_role` | string | `auth.js` (getAuthRole) | `login/main.js` (selectRole), `auth.js` (setAuthRole) | On sign-in, role selection | `'inspector'` or `'admin'` |
| `fvp_user_name` | string | `settings/main.js` (pre-populate) | `login/main.js`, `settings/main.js`, `auth.js` | Sign-in, settings save | Display name for instant UX |
| `fvp_user_email` | string | `settings/main.js` (pre-populate) | `login/main.js`, `settings/main.js`, `auth.js` | Sign-in, settings save | Display email |
| `fvp_org_id` | string (UUID) | `data-layer.js` (filter queries), `report-creation.js`, `persistence.js`, `autosave.js`, `submit.js`, `archives/main.js`, `realtime-sync.js`, `report-rules.js` | `login/main.js` (sign-in/sign-up), `auth.js` (ensureOrgIdCached) | Sign-in, page load auth check | Organization scope for all queries |

### Permission & UX Flags

| Key | Data Type | Readers | Writers | When | Purpose |
|-----|-----------|---------|---------|------|---------|
| `fvp_mic_granted` | string (`'true'`) | `index/main.js`, `interview/main.js` | `interview/main.js` (requestMicrophonePermission), `permissions/main.js` | Permission grant | Microphone permission cache |
| `fvp_mic_timestamp` | string (ISO) | (unused — defined but never read) | (unused) | — | **DEAD KEY** |
| `fvp_cam_granted` | string (`'true'`) | (defined but not actively read) | (defined but not actively written) | — | Camera permission cache |
| `fvp_loc_granted` | string (`'true'`) | `index/main.js`, `interview/main.js` | `interview/main.js` (requestLocationPermission), `permissions/main.js` | Permission grant | Location permission cache |
| `fvp_loc_lat` | string (number) | `index/weather.js` (getLocationFromCache) | `interview/main.js` (cacheLocation) | Location acquired | Cached GPS latitude |
| `fvp_loc_lng` | string (number) | `index/weather.js` (getLocationFromCache) | `interview/main.js` (cacheLocation) | Location acquired | Cached GPS longitude |
| `fvp_loc_timestamp` | string (number) | `index/weather.js` (freshness check) | `interview/main.js` (cacheLocation) | Location acquired | GPS cache age |
| `fvp_speech_granted` | string (`'true'`) | (defined, rarely read) | (set in speech permission flow) | — | Speech recognition permission |
| `fvp_onboarded` | string (`'true'`) | `index/main.js` (shouldShowOnboarding) | `permissions/main.js` | After onboarding complete | First-run onboarding flag |
| `fvp_banner_dismissed` | string (`'true'`) | `index/main.js` (shouldShowBanner) | `index/main.js` (dismissPermissionsBanner) | Banner dismiss | Permission banner suppression |
| `fvp_banner_dismissed_date` | string (ISO) | `index/main.js` (24h expiry check) | `index/main.js` (dismissPermissionsBanner) | Banner dismiss | Auto-re-show after 24h |
| `fvp_dictation_hint_dismissed` | string | `interview/main.js` | `interview/main.js` | Hint dismiss | Dictation UI hint |
| `fvp_permissions_dismissed` | string (`'true'`) | `interview/main.js` | `interview/main.js` (closePermissionsModal) | Modal dismiss | Interview permission modal |

### Data Keys

| Key | Data Type | Readers | Writers | When | Purpose |
|-----|-----------|---------|---------|------|---------|
| `fvp_current_reports` | JSON object (map: id → report) | `index/main.js`, `report-rules.js`, `report-cards.js`, `cloud-recovery.js`, `report/data-loading.js`, `report/submit.js`, `realtime-sync.js` | `storage-keys.js` (saveCurrentReport, deleteCurrentReport), `cloud-recovery.js`, `realtime-sync.js`, `report/submit.js` (cleanupLocalStorage) | Every report save, dashboard load, cloud recovery, realtime event | **Primary report tracking map.** Each entry has: `id, project_id, project_name, reportDate, status, created_at, updated_at, _draft_data` |
| `fvp_report_{uuid}` | JSON object | `report/data-loading.js` (loadReport), `cloud-recovery.js` (cache check) | `interview/finish-processing.js` (after AI), `report/autosave.js` (on edit), `cloud-recovery.js` (cache from Supabase) | After AI refinement, during report editing, on cloud recovery | Complete report content: `aiGenerated, originalInput, userEdits, captureMode, status` |
| `fvp_projects` | JSON object (map: id → project) | `index/main.js` (fallback), `report-rules.js` (eligibility), `cloud-recovery.js` (project lookup) | `data-layer.js` (loadProjects, refreshProjectsFromCloud) | On project load/refresh | Projects cache for offline eligibility checks |
| `fvp_projects_cache_ts` | number (epoch ms) | `data-layer.js`, `report-rules.js` (ensureFreshProjectsCache) | `data-layer.js` (loadProjects, refreshProjectsFromCloud) | On project load/refresh | Cache freshness timestamp (10min default) |
| `fvp_active_project_id` | string (UUID) | **LEGACY — no longer read by core flows** | Cleared on sign-out by `auth.js` | — | **DEPRECATED.** Previously used to track active project. Sprint 1/5 replaced with explicit projectId in URLs. |
| `fvp_settings_scratch` | JSON object | `settings/main.js` (loadSettings) | `settings/main.js` (saveScratchData) | On every keystroke in settings | Unsaved settings form state for crash recovery |
| `fvp_ai_response_*` | JSON (cached AI response) | `index/main.js` (cleanup) | AI response caching (24h TTL) | AI processing | Cached AI responses (auto-cleaned >24h) |
| `fvp_ai_conversation_*` | JSON | `auth.js` (sign-out cleanup) | AI assistant | During AI chat | AI conversation history |
| `fvp_migration_v113_idb_clear` | string (ISO date) | `index/main.js` (migration check) | `index/main.js` (one-time migration) | First load after v1.13.0 | Migration flag — prevents re-running IDB clear |
| `fvp_submitted_banner_dismissed` | **sessionStorage** | `index/main.js` | `index/main.js` (dismissSubmittedBanner) | Banner dismiss | Session-only submitted banner state |

---

## 3. IndexedDB Stores

Database: `fieldvoice-pro`, Version: 6

### `projects` store

| Property | Details |
|----------|---------|
| **keyPath** | `id` (UUID) |
| **Indexes** | none |
| **Data** | Full project objects in JS camelCase format (from `normalizeProject`). Includes nested `contractors` array with crews. |
| **Readers** | `data-layer.js` (`loadProjects`, `loadProjectById`), `projects/main.js` (`getAllProjects`) |
| **Writers** | `data-layer.js` (`refreshProjectsFromCloud` — clears store then writes all), `data-layer.js` (`loadProjectById` — cache miss fallback) |
| **When Read** | Dashboard load, interview init, report load, project picker |
| **When Written** | Cloud refresh, individual project fallback fetch |
| **Source of Truth** | Supabase `projects` table. IDB is a cache. |

### `userProfile` store

| Property | Details |
|----------|---------|
| **keyPath** | `deviceId` |
| **Indexes** | none |
| **Data** | `{ id, deviceId, fullName, title, company, email, phone }` |
| **Readers** | `data-layer.js` (`loadUserSettings`) |
| **Writers** | `data-layer.js` (`saveUserSettings`), `data-layer.js` (`loadUserSettings` — cache from Supabase) |
| **When Read** | Interview init, settings page load |
| **When Written** | Settings save, Supabase cache-through |
| **Source of Truth** | Supabase `user_profiles` table. IDB is a cache. |
| **⚠️ Issue** | Keyed by `deviceId` but lookups also try `auth_user_id`. If user signs in on new device, IDB may miss because `deviceId` differs. `loadUserSettings` handles this by falling back to Supabase. |

### `photos` store

| Property | Details |
|----------|---------|
| **keyPath** | `id` (UUID) |
| **Indexes** | `reportId` (non-unique), `syncStatus` (non-unique) |
| **Data** | `{ id, reportId, base64, url, storagePath, caption, gps, timestamp, fileName, syncStatus, createdAt }` |
| **Readers** | `interview/photos.js` (`backgroundUploadPhoto`, `updatePhotoCaption`), `interview/persistence.js` (`uploadPendingPhotos`), `report/submit.js` |
| **Writers** | `interview/photos.js` (`savePhotoToIndexedDB`, `backgroundUploadPhoto`), `interview/persistence.js` (`uploadPendingPhotos` — updates syncStatus) |
| **When Read** | Photo upload retry, caption update, submit flow |
| **When Written** | Photo capture, background upload completion, submit flow |
| **Source of Truth** | IDB is authoritative for **base64 data** (never stored in localStorage per OFF-01). Supabase `photos` table + storage bucket are authoritative for synced photos. |

### `currentReports` store

| Property | Details |
|----------|---------|
| **keyPath** | `id` (UUID) |
| **Indexes** | `project_id` (non-unique), `status` (non-unique) |
| **Data** | Mirror of `fvp_current_reports` entries. Each report: `{ id, project_id, project_name, reportDate, status, created_at, updated_at, _draft_data, ... }` |
| **Readers** | `storage-keys.js` (`hydrateCurrentReportsFromIDB`) |
| **Writers** | `storage-keys.js` (`saveCurrentReport` write-through, `deleteCurrentReport`, `syncCurrentReportsToIDB`, `replaceAllCurrentReports`) |
| **When Read** | Dashboard load (hydration step) |
| **When Written** | Every report save (write-through), prune operations, cloud recovery |
| **Source of Truth** | localStorage `fvp_current_reports` is primary. IDB is a **durable backup** that survives iOS 7-day eviction. Hydration merges IDB → localStorage on dashboard load. |

### `draftData` store

| Property | Details |
|----------|---------|
| **keyPath** | `reportId` |
| **Indexes** | none |
| **Data** | Full interview draft data object (same shape as `_draft_data` in `fvp_current_reports`). Includes weather, entries, freeform_entries, activities, equipment, toggleStates, etc. |
| **Readers** | `interview/persistence.js` (`loadDraftFromIDB`), `interview/persistence.js` (`getReport` — recovery chain step 2) |
| **Writers** | `interview/persistence.js` (`saveToLocalStorage` — write-through), `interview/persistence.js` (`clearLocalStorageDraft` — delete) |
| **When Read** | Interview init (if localStorage miss) |
| **When Written** | Every interview autosave (write-through), draft clear on finish |
| **Source of Truth** | localStorage `_draft_data` is primary. IDB is backup for iOS eviction recovery. |

### `cachedArchives` store

| Property | Details |
|----------|---------|
| **keyPath** | `key` (string like `'reports'`, `'projects'`) |
| **Indexes** | none |
| **Data** | `{ key, data: [...], cachedAt }` — cached archive page data |
| **Readers** | `archives/main.js` (`loadFromCache`) |
| **Writers** | `archives/main.js` (`cacheArchiveData`) |
| **When Read** | Archives page load while offline |
| **When Written** | After successful archives data fetch from Supabase |
| **Source of Truth** | Supabase. IDB is read-only offline cache. |

---

## 4. Supabase Tables

### `reports`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Report ID (generated client-side via `crypto.randomUUID()`) |
| `project_id` | UUID (FK → projects) | Associated project |
| `org_id` | UUID (FK → organizations) | Tenant isolation |
| `user_id` | UUID (FK → user_profiles.id) | Report owner |
| `device_id` | UUID | Device that created the report |
| `report_date` | date | Report date (YYYY-MM-DD) |
| `status` | text | `draft`, `pending_refine`, `refined`, `ready_to_submit`, `submitted` |
| `capture_mode` | text | `guided` or `freeform`/`minimal` |
| `pdf_url` | text | Signed URL to PDF (set on submit) |
| `inspector_name` | text | Inspector name (set on submit) |
| `submitted_at` | timestamp | When submitted |
| `created_at` | timestamp | Row creation |
| `updated_at` | timestamp | Last modification |

**Readers:** `cloud-recovery.js`, `report/data-loading.js`, `archives/main.js`, `report/submit.js`, `realtime-sync.js`  
**Writers:** `report-creation.js` (createSupabaseReportRow), `interview/persistence.js` (saveReportToSupabase), `report/autosave.js` (saveReportToSupabase), `report/submit.js` (updateReportStatus, saveSubmittedReportData, ensureReportExists), `shared/delete-report.js`  
**RLS:** Should filter by `user_id` or `org_id`. Realtime subscription filters by `user_id=eq.{userId}`.

### `report_data`

| Column | Type | Purpose |
|--------|------|---------|
| `report_id` | UUID (PK, FK → reports.id) | 1:1 with reports |
| `org_id` | UUID | Tenant isolation |
| `ai_generated` | JSONB | AI-refined report content |
| `original_input` | JSONB | Raw field capture payload |
| `user_edits` | JSONB | User modifications on report.html |
| `capture_mode` | text | Capture mode |
| `status` | text | Content status |
| `created_at` | timestamp | — |
| `updated_at` | timestamp | — |

**Readers:** `report/data-loading.js` (loadReport — Supabase fallback), `cloud-recovery.js` (pre-cache on recovery), `realtime-sync.js`  
**Writers:** `interview/finish-processing.js` (after AI), `report/autosave.js` (flushReportBackup — debounced 5s), `shared/delete-report.js`  
**Source of Truth:** This is the **authoritative cloud source** for report content. Sprint 13 deprecated `report_backup` in favor of this table.

### `interview_backup`

| Column | Type | Purpose |
|--------|------|---------|
| `report_id` | UUID (PK, FK → reports.id) | 1:1 with reports |
| `org_id` | UUID | Tenant isolation |
| `page_state` | JSONB | Full interview page state snapshot |
| `updated_at` | timestamp | Last backup time |

**Readers:** `interview/persistence.js` (getReport — recovery chain step 3), `cloud-recovery.js` (cacheInterviewBackups)  
**Writers:** `interview/persistence.js` (flushInterviewBackup — debounced 5s), `shared/delete-report.js`  
**Purpose:** Cross-device draft recovery. If a user starts on phone and opens laptop, the interview_backup provides the latest field capture state.

### `ai_submissions`

| Column | Type | Purpose |
|--------|------|---------|
| `report_id` | UUID (PK, unique) | 1:1 with reports |
| `org_id` | UUID | Tenant isolation |
| `original_input` | JSONB | Payload sent to n8n |
| `ai_response` | JSONB | Response from n8n |
| `model_used` | text | AI model identifier |
| `processing_time_ms` | int | Round-trip time |
| `submitted_at` | timestamp | When processed |

**Readers:** (audit/debugging only)  
**Writers:** `interview/finish-processing.js` (saveAIResponse — upsert on report_id)  
**Purpose:** Audit trail for AI processing. Useful for debugging and reprocessing.

### `photos`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Photo ID (generated client-side) |
| `report_id` | UUID (FK → reports.id) | Associated report |
| `org_id` | UUID | Tenant isolation |
| `storage_path` | text | Path in Supabase Storage bucket |
| `photo_url` | text | Cached URL (may be stale signed URL) |
| `caption` | text | Photo caption |
| `photo_type` | text | File type / MIME |
| `filename` | text | Original filename |
| `location_lat` | numeric | GPS latitude |
| `location_lng` | numeric | GPS longitude |
| `taken_at` | timestamp | When photo was taken |
| `created_at` | timestamp | Row creation |

**Readers:** `shared/cloud-photos.js` (fetchCloudPhotos, fetchCloudPhotosBatch), `report/data-loading.js` (loadReport — photo rehydration)  
**Writers:** `interview/persistence.js` (uploadPendingPhotos — upsert metadata), `interview/photos.js` (deletePhotoFromSupabase), `shared/delete-report.js`  
**SEC-04:** Uses signed URLs (1h expiry). Cached URLs go stale. No refresh mechanism exists.

### `projects`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Project ID |
| `org_id` | UUID | Tenant isolation |
| `user_id` | UUID | Owner |
| `project_name` | text | Display name |
| `noab_project_no` | text | Project number |
| `cno_solicitation_no` | text | Solicitation number |
| `location` | text | Project location |
| `engineer`, `prime_contractor` | text | Project details |
| `contractors` | JSONB | Array of contractor objects (with crews) |
| `logo_url`, `logo_thumbnail` | text | Project logo |
| `status` | text | `active` or `inactive` |
| Various date/time fields | text/date | Scheduling fields |

**Readers:** `data-layer.js` (refreshProjectsFromCloud, loadProjectById), `archives/main.js`, `report-creation.js`, `projects/main.js`  
**Writers:** `project-config/crud.js`, `realtime-sync.js` (triggers refresh)  
**Note:** Contractors are stored as JSONB blob in the projects table (single-table approach). No separate contractors table.

### `user_profiles`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Profile row ID |
| `auth_user_id` | UUID (unique) | Links to Supabase Auth user |
| `device_id` | UUID | Device identifier (informational) |
| `device_info` | JSONB | Device metadata |
| `org_id` | UUID | Organization |
| `full_name`, `title`, `company`, `email`, `phone` | text | Profile fields |
| `role` | text | `inspector` or `admin` |
| `updated_at` | timestamp | — |

**Readers:** `login/main.js` (sign-in), `auth.js` (loadAuthProfile, ensureOrgIdCached), `data-layer.js` (loadUserSettings), `settings/main.js` (refreshFromCloud)  
**Writers:** `login/main.js` (sign-up, sign-in device update), `auth.js` (upsertAuthProfile), `settings/main.js` (saveSettings), `login/main.js` (role update)  
**Conflict Resolution:** `onConflict: 'auth_user_id'` — one profile per auth user.

### `user_devices`

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | UUID (FK → user_profiles.id) | Profile reference |
| `device_id` | UUID | Device identifier |
| `device_info` | JSONB | Device metadata |
| `last_active` | timestamp | Last sign-in from this device |

**Writers:** `login/main.js` (sign-in, sign-up — upsert on `user_id,device_id`)  
**Purpose:** Multi-device tracking (Sprint 13). Write-only from client.

### `organizations`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID (PK) | Org ID |
| `name` | text | Organization name |
| `slug` | text (unique) | Org code for sign-up |

**Readers:** `login/main.js` (sign-up — validate org code)  
**Writers:** Admin only (not from this client)

### `final_reports` — **DEPRECATED**

**Readers:** `shared/delete-report.js` (cascade cleanup — legacy PDF lookup)  
**Writers:** None (Sprint 13 moved to `reports` table)  
**Status:** Still exists. `deleteReportCascade` still cleans up rows. No new writes.

### `report_backup` — **DEPRECATED**

**Readers:** None (Sprint 13 removed fallback)  
**Writers:** None  
**Status:** Still cleaned up in `deleteReportCascade`. Dead table.

### Supabase Storage Buckets

| Bucket | Purpose | Readers | Writers |
|--------|---------|---------|---------|
| `report-photos` | Photo file storage | `cloud-photos.js` (signed URL generation) | `interview/persistence.js` (uploadPhotoToSupabase), `interview/photos.js` (backgroundUploadPhoto) |
| `report-pdfs` | Generated PDF storage | `archives/main.js` (view PDF) | `report/submit.js` (uploadPDFToStorage) |

---

## 5. Data Flow Diagrams

### 5.1 Sign-In Flow

```
User enters email + password
    │
    ├─ supabaseClient.auth.signInWithPassword()
    │     → Supabase Auth session established
    │
    ├─ Query user_profiles WHERE auth_user_id = user.id
    │     │
    │     ├─ Profile exists with role:
    │     │     ├─ localStorage.set(AUTH_ROLE, profile.role)
    │     │     ├─ localStorage.set(USER_ID, profile.id)
    │     │     ├─ localStorage.set(USER_NAME, profile.full_name)
    │     │     ├─ localStorage.set(USER_EMAIL, profile.email)
    │     │     ├─ localStorage.set(AUTH_USER_ID, user.id)
    │     │     ├─ localStorage.set(ORG_ID, profile.org_id)  [if present]
    │     │     ├─ Supabase UPDATE user_profiles SET device_id, device_info
    │     │     ├─ Supabase UPSERT user_devices (user_id, device_id)
    │     │     └─ → redirect to index.html
    │     │
    │     └─ Profile exists without role:
    │           └─ → show role picker modal
    │                 ├─ localStorage.set(AUTH_ROLE, selectedRole)
    │                 ├─ Supabase UPDATE user_profiles SET role
    │                 └─ → redirect to index.html
    │
    └─ [Sign-Up path]:
          ├─ Validate org code against organizations table
          ├─ supabaseClient.auth.signUp()
          ├─ Supabase UPSERT user_profiles (with org_id)
          ├─ Supabase UPSERT user_devices
          ├─ localStorage.set(USER_ID, USER_NAME, USER_EMAIL, AUTH_USER_ID, ORG_ID)
          └─ → show role picker
```

### 5.2 Dashboard Load (index.html)

```
DOMContentLoaded
    │
    ├─ IMMEDIATE: _renderFromLocalStorage()
    │     ├─ Read fvp_projects from localStorage → projectsCache
    │     ├─ Read fvp_current_reports from localStorage
    │     └─ renderReportCards() + updateReportStatus()
    │
    ├─ auth.ready (await, 5s timeout)
    │     └─ auth.js checks supabaseClient.auth.getSession()
    │           ├─ No session → redirect to login.html
    │           └─ Session valid → ensureOrgIdCached(), start listeners
    │
    └─ refreshDashboard('DOMContentLoaded')
          │
          ├─ Step 0: _renderFromLocalStorage() [again, instant]
          │
          ├─ Step 1: hydrateCurrentReportsFromIDB() [3s timeout]
          │     ├─ IDB getAllCurrentReports()
          │     ├─ If localStorage empty: IDB → localStorage (full restore)
          │     └─ If localStorage has data: merge missing IDB entries
          │     → re-render
          │
          ├─ Step 2: dataLayer.loadProjects() [4s timeout]
          │     └─ IDB getAllProjects() → normalize → set fvp_projects
          │
          ├─ Step 3: dataLayer.refreshProjectsFromCloud() [8s timeout, if online]
          │     ├─ Supabase SELECT * FROM projects (filtered by org_id)
          │     ├─ IDB clearStore('projects') → saveProject() for each
          │     └─ Update fvp_projects + fvp_projects_cache_ts in localStorage
          │
          ├─ Step 4: pruneCurrentReports()
          │     ├─ Remove malformed entries (no id or project_id)
          │     ├─ Remove submitted > 7 days old
          │     └─ syncCurrentReportsToIDB() after pruning
          │
          ├─ Step 5: renderReportCards() + updateReportStatus()
          │
          ├─ Step 6: recoverCloudDrafts() [fire-and-forget]
          │     ├─ Supabase SELECT FROM reports WHERE user_id AND status IN (draft, pending_refine, refined, ready_to_submit)
          │     ├─ Compare timestamps: cloud > local → update local
          │     ├─ Update fvp_current_reports + syncCurrentReportsToIDB()
          │     ├─ Pre-cache report_data for recovered reports
          │     ├─ Pre-cache interview_backup for draft reports
          │     └─ Rehydrate photos from Supabase photos table
          │
          ├─ Step 7: syncWeather() [15s timeout]
          │
          └─ initRealtimeSync() [subscribe to reports, report_data, projects changes]
```

### 5.3 Report Creation

```
User taps "Begin Daily Report"
    │
    ├─ showProjectPickerModal()
    │     ├─ dataLayer.loadProjects() → render list
    │     └─ dataLayer.refreshProjectsFromCloud() [if online]
    │
    └─ selectProjectAndProceed(projectId)
          │
          ├─ Check fvp_current_reports for duplicate (same project + today + not submitted)
          │     ├─ Duplicate found → showDuplicateReportModal (go to existing / delete & start fresh)
          │     └─ No duplicate → proceed
          │
          ├─ Generate newReportId = crypto.randomUUID()
          │
          ├─ createSupabaseReportRow(newReportId, projectId)
          │     └─ Supabase UPSERT reports { id, project_id, user_id, device_id, report_date, status:'draft' }
          │
          └─ Navigate to quick-interview.html?reportId={uuid}&projectId={uuid}
```

### 5.4 Interview Save / Autosave

```
User types in any field
    │
    ├─ 500ms debounce → saveReport()
    │     ├─ saveToLocalStorage()
    │     │     ├─ Build _draft_data from IS.report
    │     │     ├─ saveCurrentReport({ id, project_id, ..., _draft_data })
    │     │     │     ├─ _saveQueue serialization (prevents race conditions)
    │     │     │     ├─ Read fvp_current_reports from localStorage
    │     │     │     ├─ Set report.updated_at = Date.now()
    │     │     │     ├─ Write back to fvp_current_reports
    │     │     │     └─ Fire-and-forget: idb.saveCurrentReportIDB(report)
    │     │     │
    │     │     └─ Fire-and-forget: idb.saveDraftDataIDB(reportId, data)
    │     │
    │     └─ markInterviewBackupDirty()
    │           └─ 5s debounce → flushInterviewBackup()
    │                 └─ Supabase UPSERT interview_backup { report_id, page_state, org_id }
    │                       [with supabaseRetry 3x exponential backoff]
    │
    └─ visibilitychange → hidden (page hide)
          ├─ Immediate saveToLocalStorage()
          └─ Immediate flushInterviewBackup()
```

### 5.5 Finish / AI Processing Flow

```
User taps "Finish & Process"
    │
    ├─ Validate (mode-specific: check entries, safety answer)
    │
    ├─ prepareReport() (set endTime, shift duration, etc.)
    │
    ├─ saveReportToSupabase()
    │     └─ Supabase UPSERT reports { status: 'draft' }
    │
    ├─ uploadPendingPhotos()
    │     ├─ IDB getPhotosBySyncStatus('pending')
    │     ├─ For each: upload to Supabase Storage → get signed URL
    │     ├─ Supabase UPSERT photos { metadata }
    │     └─ IDB savePhoto({ syncStatus: 'synced', base64: null })
    │
    ├─ buildProcessPayload() → POST to n8n webhook
    │     └─ Wait for AI response (60s timeout)
    │
    ├─ saveAIResponse(payload, result)
    │     └─ Supabase UPSERT ai_submissions
    │
    ├─ saveReportToSupabase() again
    │     └─ Supabase UPSERT reports { status: 'refined' }
    │
    ├─ saveReportData(reportId, { aiGenerated, originalInput, userEdits:{}, ... })
    │     └─ localStorage fvp_report_{uuid}
    │
    ├─ Supabase UPSERT report_data { ai_generated, original_input, capture_mode, status:'refined' }
    │     [with supabaseRetry 3x]
    │
    ├─ saveCurrentReport({ status: 'refined' })
    │     └─ localStorage fvp_current_reports + IDB write-through
    │
    └─ Navigate to report.html?date={date}&reportId={uuid}
```

### 5.6 Report Editing (report.html)

```
Page Load
    │
    ├─ loadReport()
    │     ├─ 1. getReportData(reportId) from localStorage (fvp_report_{uuid})
    │     ├─ 2. [miss] Supabase SELECT FROM report_data WHERE report_id
    │     │     └─ Cache to localStorage via saveReportData()
    │     ├─ 3. [miss] Check fvp_current_reports for pending_refine/draft → redirect to interview
    │     └─ 4. [miss] Error → redirect to index.html
    │
    ├─ Load project via dataLayer.loadProjectById(projectId from report)
    │
    ├─ Populate form fields (merge: userEdits > aiGenerated > report data)
    │
    └─ setupAutoSave()
          │
          ├─ On input (500ms debounce):
          │     ├─ Update RS.userEdits[path]
          │     ├─ saveReportToLocalStorage()  [to fvp_report_{uuid}]
          │     └─ markReportBackupDirty()
          │           └─ 5s debounce → flushReportBackup()
          │                 └─ Supabase UPSERT report_data { user_edits, status }
          │                       [supabaseRetry 3x]
          │
          └─ On blur:
                └─ Immediate saveReportToLocalStorage() + showSaveIndicator()
```

### 5.7 Report Submission

```
User taps "Submit Report"
    │
    ├─ Online check (fail → error)
    │
    ├─ Duplicate check: Supabase SELECT FROM reports WHERE project_id, report_date, status='submitted'
    │     └─ Existing → confirm dialog
    │
    ├─ saveReportToLocalStorage() [save current form state]
    │
    ├─ generateVectorPDF() → Blob
    │
    ├─ uploadPDFToStorage()
    │     ├─ Supabase Storage upload to report-pdfs/{reportId}/{filename}
    │     └─ Create signed URL (1h)
    │
    ├─ ensureReportExists()
    │     └─ Supabase UPSERT reports (ensure FK exists)
    │
    ├─ saveSubmittedReportData(pdfUrl)
    │     └─ Supabase UPDATE reports SET pdf_url, inspector_name, submitted_at
    │
    ├─ updateReportStatus('submitted')
    │     └─ Supabase UPDATE reports SET status='submitted', submitted_at, updated_at
    │
    └─ cleanupLocalStorage()
          ├─ deleteReportData(reportId)  [remove fvp_report_{uuid}]
          ├─ Update fvp_current_reports: set status='submitted', submitted_at
          ├─ IDB deletePhotosByReportId()
          └─ Navigate to index.html?submitted=true
```

### 5.8 Back-Navigation / App Resume

```
pageshow / visibilitychange(visible) / focus
    │
    ├─ Cooldown check (2s minimum between refreshes)
    │
    ├─ IDB resetDB() [if bfcache restore — stale connection fix]
    │
    └─ refreshDashboard(source)
          └─ [Same as Dashboard Load steps 0-7]
```

### 5.9 Sign-Out

```
signOut()
    │
    ├─ Clear session check interval
    │
    ├─ supabaseClient.auth.signOut()
    │
    ├─ localStorage: remove AUTH_ROLE, ORG_ID, USER_ID, USER_NAME, USER_EMAIL,
    │   AUTH_USER_ID, CURRENT_REPORTS, ONBOARDED, PERMISSIONS_DISMISSED,
    │   BANNER_DISMISSED, BANNER_DISMISSED_DATE, PROJECTS, fvp_projects_cache_ts,
    │   ACTIVE_PROJECT_ID
    │
    ├─ localStorage: remove all fvp_report_* and fvp_ai_conversation_* keys
    │
    ├─ IDB: clearStore(currentReports, draftData, userProfile, projects)
    │
    ├─ ⚠️ NOT cleared: fvp_device_id, permission flags, photos IDB store, cachedArchives
    │
    └─ → redirect to login.html
```

---

## 6. Sync Points

### 6.1 localStorage ↔ IndexedDB

| Direction | What | When | Mechanism |
|-----------|------|------|-----------|
| LS → IDB | Current reports | Every `saveCurrentReport()` | Write-through (fire-and-forget) |
| LS → IDB | Draft data | Every interview autosave | Write-through via `saveDraftDataIDB()` |
| LS → IDB | Bulk current reports | After prune, cloud recovery | `syncCurrentReportsToIDB()` → `replaceAllCurrentReports()` |
| IDB → LS | Current reports | Dashboard load | `hydrateCurrentReportsFromIDB()` — merge missing |
| IDB → LS | Draft data | Interview init (LS miss) | `loadDraftFromIDB()` → re-cache to LS |
| IDB → LS | Projects | `loadProjects()` | Read IDB → set `fvp_projects` in LS |

### 6.2 Local (LS/IDB) ↔ Supabase

| Direction | What | When | Mechanism |
|-----------|------|------|-----------|
| Supa → LS+IDB | Projects | Dashboard refresh, project picker | `refreshProjectsFromCloud()` |
| Supa → IDB | User settings | Settings load, interview init | `loadUserSettings()` Supabase fallback |
| Supa → LS | Cloud drafts | Dashboard load | `recoverCloudDrafts()` |
| Supa → LS | Report data | Cloud recovery, report load miss | Cache `report_data` to `fvp_report_{uuid}` |
| Supa → LS | Interview backup | Cloud recovery | `cacheInterviewBackups()` → `_draft_data` |
| Supa → LS | Photos metadata | Cloud recovery, report load | `fetchCloudPhotos()` → inject into report data |
| Local → Supa | Interview backup | Every 5s (debounced) during interview | `flushInterviewBackup()` |
| Local → Supa | Report data (user_edits) | Every 5s (debounced) during report editing | `flushReportBackup()` |
| Local → Supa | Reports row | On create, finish, submit | `saveReportToSupabase()`, `createSupabaseReportRow()` |
| Local → Supa | Photos | Background upload + submit flow | `uploadPhotoToSupabase()`, `uploadPendingPhotos()` |
| Local → Supa | User settings | Settings save | `saveSettings()` → upsert |
| Local → Supa | AI submission | After AI processing | `saveAIResponse()` |
| Supa → Local | Realtime: reports | On any reports change | `_handleReportChange()` → LS + IDB |
| Supa → Local | Realtime: report_data | On any report_data change | `_handleReportDataChange()` → LS |
| Supa → Local | Realtime: projects | On any projects change | `_handleProjectChange()` → full cloud refresh |

### 6.3 Sync Direction Summary

| Data | Authoritative Source | Sync Direction | Conflicts |
|------|---------------------|----------------|-----------|
| Projects | Supabase | One-way: Supabase → Local | Local always replaced on refresh |
| User profile | Supabase | Bidirectional (edit local → push to Supabase) | `onConflict: 'auth_user_id'` — last write wins |
| Report metadata | Supabase (for cross-device) | Bidirectional, timestamp-compared | `recoverCloudDrafts` compares `updated_at` — cloud wins if newer |
| Interview draft data | localStorage (primary) / IDB (backup) / Supabase interview_backup (cross-device) | Local → Supabase (5s debounce). Supabase → Local (on recovery only) | Local edits always take priority during active editing. SYN-02: Realtime skips actively-edited reports. |
| Report content (post-AI) | Supabase `report_data` | Bidirectional: local edits → Supabase (5s debounce), Supabase → local (on load miss) | Last write wins. Realtime overwrites local `fvp_report_{uuid}`. |
| Photos | IDB (base64) + Supabase (files) | Local → Supabase (on upload), Supabase → Local (on recovery) | base64 cleared from IDB after successful upload |
| Report status | Supabase | Bidirectional via realtime | Realtime updates LS `fvp_current_reports` except for actively-edited report |

---

## 7. Issues Found

### 7.1 Critical

#### ISSUE-01: Realtime report_data Overwrite Can Clobber In-Progress Edits
- **Location:** `realtime-sync.js` `_handleReportDataChange()`
- **Problem:** When a realtime event arrives for `report_data`, it overwrites `fvp_report_{uuid}` in localStorage with the server version. If the user is on `report.html` editing, their in-memory `RS.userEdits` are preserved, but the next `saveReportToLocalStorage()` call reads `existingData` from localStorage — which was just overwritten by realtime. The `existingData.aiGenerated` and `existingData.originalInput` fields are now from the server version, which is correct, but `userEdits` in the server version may be stale if the user hasn't flushed yet.
- **SYN-02 Mitigation:** The `_handleReportChange` handler skips actively-edited reports, but `_handleReportDataChange` has **NO such guard**. It always writes.
- **Impact:** Potential data loss on report.html if another device pushes report_data changes.
- **Recommendation:** Add the same SYN-02 guard to `_handleReportDataChange`.

#### ISSUE-02: `fvp_current_reports` Grows Without Bound in Multi-Report Scenarios
- **Location:** `index/main.js` `pruneCurrentReports()`
- **Problem:** Pruning only removes submitted reports older than 7 days and malformed entries. Draft reports that are abandoned (never submitted) accumulate forever. With multiple reports per project per day allowed, this map can grow significantly.
- **Impact:** localStorage quota exhaustion (5MB limit). The `_draft_data` field within each report entry can be very large (includes all entries, activities, equipment, etc.).
- **Recommendation:** Add aggressive pruning for drafts older than 30 days. Consider moving `_draft_data` out of `fvp_current_reports` entirely (it's already in IDB `draftData` store).

#### ISSUE-03: Photo Signed URLs Expire After 1 Hour
- **Location:** `interview/persistence.js`, `shared/cloud-photos.js`
- **Problem:** Photos stored with signed URLs (SEC-04) have 1-hour expiry. If cached in localStorage/IDB (`fvp_report_{uuid}.originalInput.photos`), the URLs go stale. No refresh mechanism exists.
- **Impact:** Photos fail to display in reports opened >1 hour after caching. Archives page may show broken images.
- **Recommendation:** Re-sign URLs on demand when rendering photos, or use longer-lived URLs for cached data.

### 7.2 High Priority

#### ISSUE-04: Race Condition in Cloud Recovery Photo Rehydration
- **Location:** `cloud-recovery.js` lines for photo rehydration
- **Problem:** Photo rehydration reads `getReportData(reportId)` and `getStorageItem(STORAGE_KEYS.CURRENT_REPORTS)` independently. Between reads, another save could modify the data. The writes back (`saveReportData`, `setStorageItem`) don't go through the serialized `_saveQueue`.
- **Impact:** Potential for stale data overwrite during concurrent operations.

#### ISSUE-05: `_draft_data` Duplication Wastes localStorage Quota
- **Location:** `storage-keys.js` `saveCurrentReport()`, `interview/persistence.js`
- **Problem:** The full draft data is stored in TWO places within localStorage: 
  1. `fvp_current_reports[reportId]._draft_data` (the entire interview state)
  2. Could also exist in IDB `draftData` store
  The `_draft_data` object can be very large for reports with many entries, activities, and photo metadata.
- **Impact:** Doubles localStorage usage for active drafts. A single complex report could use 500KB+, and with multiple drafts, this approaches the 5MB limit.
- **Recommendation:** Store `_draft_data` ONLY in IDB `draftData` store. Keep `fvp_current_reports` entries lightweight (metadata only).

#### ISSUE-06: No Conflict Resolution for Concurrent Edits Across Devices
- **Location:** System-wide
- **Problem:** If two devices edit the same report simultaneously:
  - Both write to `interview_backup` every 5s → last write wins
  - Both write to `report_data` every 5s → last write wins
  - No merge strategy, no conflict detection, no user notification
- **Impact:** Silent data loss for the "losing" device's edits.
- **Recommendation:** Add optimistic concurrency control (version counter or `updated_at` comparison before write).

#### ISSUE-07: `userProfile` IDB Store Keyed by `deviceId` — Cross-Device Lookup Fragile
- **Location:** `data-layer.js` `loadUserSettings()`
- **Problem:** The `userProfile` IDB store uses `deviceId` as keyPath. When `loadUserSettings()` looks up by `authUserId`, it falls through to Supabase because IDB doesn't have a record keyed by `authUserId`. This means a Supabase roundtrip on EVERY interview/settings load on a new device, even if the profile was already cached.
- **Recommendation:** Add a secondary index on `authUserId` or migrate keyPath to `authUserId`.

### 7.3 Medium Priority

#### ISSUE-08: `fvp_mic_timestamp` — Dead Key
- **Location:** `storage-keys.js` STORAGE_KEYS definition
- **Problem:** Defined in STORAGE_KEYS but never read or written anywhere in the codebase.
- **Impact:** None (dead code), but confusing for maintenance.

#### ISSUE-09: `fvp_active_project_id` — Deprecated but Still Cleared
- **Location:** `auth.js` sign-out, `storage-keys.js`
- **Problem:** Key is defined in STORAGE_KEYS and cleared on sign-out, but no core flow reads it anymore (Sprint 1/5 replaced with explicit `projectId` in URL params).
- **Impact:** Dead code.

#### ISSUE-10: `fvp_cam_granted` — Defined but Unused
- **Location:** `storage-keys.js`
- **Problem:** Defined in STORAGE_KEYS but no code reads or writes it.

#### ISSUE-11: Sign-Out Doesn't Clear IDB `photos` Store
- **Location:** `auth.js` `signOut()`
- **Problem:** Sign-out clears `currentReports`, `draftData`, `userProfile`, `projects` IDB stores, but **not `photos`** or `cachedArchives`.
- **Impact:** Photo base64 data from previous user persists on device. Privacy concern for shared devices.
- **Recommendation:** Add `idb.clearStore('photos')` and `idb.clearStore('cachedArchives')` to sign-out.

#### ISSUE-12: `cachedArchives` Store Never Expires
- **Location:** `archives/main.js`
- **Problem:** Cached archive data is written with a `cachedAt` timestamp but no expiry logic. Old archive data persists indefinitely.
- **Impact:** Stale data shown on offline archives page. Could show reports long since deleted.

#### ISSUE-13: Realtime `report_data` Channel Has No Server-Side Filter
- **Location:** `realtime-sync.js`
- **Problem:** The `report_data` subscription has no `filter` parameter because the table has no `user_id` column. A comment says "RLS policies on Supabase MUST enforce tenant isolation." There's a client-side guard checking `knownReports`, but this is defense-in-depth, not primary security.
- **Impact:** If RLS is misconfigured, other tenants' report_data changes could be received (though not written due to client guard).
- **Recommendation:** Add `org_id` filter to the subscription, or add `user_id` column to `report_data`.

#### ISSUE-14: Weather Data Not Persisted
- **Location:** `index/weather.js`
- **Problem:** Weather data is only stored in `weatherDataCache` (in-memory variable). If the page reloads while offline, no weather data is available.
- **Impact:** Weather section shows "Unavailable" after offline page reload.
- **Recommendation:** Cache weather data to localStorage with a 1-hour TTL.

### 7.4 Low Priority

#### ISSUE-15: `_saveQueue` Promise Chain Can Grow Unbounded
- **Location:** `storage-keys.js` `saveCurrentReport()`
- **Problem:** Each save chains onto `_saveQueue`. If saves happen rapidly (faster than they complete), the chain grows. This is mitigated by the 500ms debounce in callers, but a theoretical concern.

#### ISSUE-16: `ensureDB()` Always Delegates to `initDB()`
- **Location:** `indexeddb-utils.js`
- **Problem:** Comment says "validates existing connections and reopens if stale." The implementation does exactly this, but there's a 3-second timeout that could cause issues during slow iOS PWA restores.

#### ISSUE-17: `localStorage.setItem` vs `setStorageItem` Inconsistency
- **Location:** Multiple files
- **Problem:** Some files use `localStorage.setItem(STORAGE_KEYS.X, value)` directly (storing raw strings), while others use `setStorageItem(STORAGE_KEYS.X, value)` (which JSON.stringifies). This means:
  - `fvp_user_name` is stored as raw string (via `localStorage.setItem`)
  - `fvp_current_reports` is stored as JSON (via `setStorageItem`)
  - Reading with `getStorageItem` handles both (try JSON.parse, fall back to raw), but it's inconsistent.
- **Impact:** Works due to `getStorageItem`'s tolerance, but confusing and error-prone.

---

## 8. Cross-Device Considerations

### What Works

1. **Report creation on Device A, continue on Device B:**
   - `recoverCloudDrafts()` on dashboard load fetches active reports from Supabase `reports` table
   - `cacheInterviewBackups()` pre-caches interview state from `interview_backup` table
   - User can tap the recovered draft card and resume editing

2. **Report editing (post-AI) across devices:**
   - `report_data` table synced via 5s debounced writes + realtime subscriptions
   - `loadReport()` falls back to Supabase if `fvp_report_{uuid}` not in localStorage

3. **Project changes sync:**
   - Realtime subscription on `projects` table triggers full cloud refresh
   - All devices get updated contractor lists, project details

4. **Photo display across devices:**
   - Photos uploaded to Supabase Storage with metadata in `photos` table
   - `fetchCloudPhotos()` rehydrates photos on recovery
   - Cloud recovery batch-fetches photos for all recovered reports

5. **Settings sync:**
   - User profile stored in Supabase `user_profiles` with `auth_user_id` as conflict key
   - Settings page has explicit "Refresh from Cloud" button

### What Doesn't Work

1. **Simultaneous editing on two devices:**
   - No conflict detection or merge strategy
   - Last write wins silently (5s debounce means ~5s window for data loss)
   - Realtime SYN-02 guard prevents realtime from overwriting actively-edited report **metadata** (reports table), but NOT report_data content

2. **Photos captured offline on Device A, visible on Device B:**
   - Photos stored as base64 in IDB only until uploaded
   - If Device A is offline, photos don't reach Supabase
   - Device B sees no photos until Device A comes online and uploads

3. **Draft data granularity:**
   - `interview_backup` stores the ENTIRE page state as one JSONB blob
   - No field-level merging — one device's full state replaces the other's
   - Two devices editing different sections will lose one device's changes

4. **Signed URL expiration:**
   - Photos and PDFs use 1-hour signed URLs
   - Cross-device recovery caches these URLs in localStorage
   - After 1 hour, URLs fail with no automatic refresh

### What's Needed for Robust Multi-Device

1. **Operational Transform or CRDT for concurrent edits** — At minimum, detect conflicts and prompt user to merge
2. **Field-level sync for interview_backup** — Instead of replacing entire page_state, merge individual sections
3. **Persistent (or auto-refreshing) photo URLs** — Either use long-lived URLs, or implement a URL refresh service
4. **Draft data deduplication** — Move `_draft_data` out of `fvp_current_reports` to reduce localStorage pressure and sync payload size
5. **Offline queue for photos** — Track pending uploads explicitly and retry on reconnect (the old sync queue was removed in Sprint 15 without replacement for photos specifically — photos rely on "retry at FINISH")
6. **`report_data` realtime guard** — Match the SYN-02 pattern from `_handleReportChange` to prevent clobbering in-progress report edits
7. **Server-side last-write-wins guard** — Add `updated_at` comparison in Supabase RPC or use row-level locking for critical writes

---

## Appendix: File → Storage Mapping Quick Reference

| File | Reads From | Writes To |
|------|-----------|-----------|
| `js/config.js` | — | Creates `supabaseClient` global |
| `js/storage-keys.js` | LS: all keys (getStorageItem) | LS: all keys (setStorageItem). IDB: currentReports (write-through) |
| `js/indexeddb-utils.js` | IDB: all stores | IDB: all stores |
| `js/data-layer.js` | IDB: projects, userProfile. LS: ORG_ID, PROJECTS, projects_cache_ts. Supa: projects, user_profiles | IDB: projects, userProfile. LS: PROJECTS, projects_cache_ts |
| `js/auth.js` | Supa: auth.getSession, user_profiles. LS: AUTH_ROLE | LS: cleared on sign-out. Supa: user_profiles. IDB: cleared on sign-out |
| `js/supabase-utils.js` | LS: ORG_ID (toSupabaseProject) | — (pure converters) |
| `js/login/main.js` | Supa: auth, user_profiles, organizations | LS: AUTH_ROLE, USER_ID, USER_NAME, USER_EMAIL, AUTH_USER_ID, ORG_ID. Supa: user_profiles, user_devices |
| `js/index/main.js` | LS: CURRENT_REPORTS, PROJECTS, permission flags. IDB: currentReports (hydration) | LS: cleanup (AI caches, stale banners). IDB: resetDB |
| `js/index/cloud-recovery.js` | LS: USER_ID, CURRENT_REPORTS, PROJECTS. Supa: reports, report_data, interview_backup, photos | LS: CURRENT_REPORTS (merge). IDB: syncCurrentReportsToIDB |
| `js/index/report-creation.js` | LS: CURRENT_REPORTS, ORG_ID, USER_ID. Supa: reports | LS: — (reads only). Supa: reports (create row) |
| `js/interview/persistence.js` | LS: CURRENT_REPORTS (getCurrentReport). IDB: draftData. Supa: interview_backup | LS: CURRENT_REPORTS (saveCurrentReport). IDB: draftData, currentReports. Supa: reports, interview_backup, photos (storage), photos (table) |
| `js/interview/finish-processing.js` | LS: ORG_ID. IS.report (in-memory) | LS: fvp_report_{uuid}, CURRENT_REPORTS. Supa: reports, report_data, ai_submissions |
| `js/interview/photos.js` | IDB: photos | IDB: photos. Supa: photos (storage), photos (table) |
| `js/report/data-loading.js` | LS: fvp_report_{uuid}, CURRENT_REPORTS. Supa: report_data, reports | LS: fvp_report_{uuid} (cache on recovery) |
| `js/report/autosave.js` | LS: fvp_report_{uuid} (existing data). RS.* state | LS: fvp_report_{uuid}. Supa: report_data (debounced), reports |
| `js/report/submit.js` | LS: fvp_report_{uuid}, CURRENT_REPORTS, ORG_ID, USER_ID | LS: delete fvp_report_{uuid}, update CURRENT_REPORTS. Supa: reports (status, pdf_url), report-pdfs (storage). IDB: delete photos |
| `js/settings/main.js` | LS: USER_NAME, USER_EMAIL, SETTINGS_SCRATCH, USER_ID. IDB: userProfile. Supa: user_profiles | LS: USER_ID, USER_NAME, USER_EMAIL, SETTINGS_SCRATCH. IDB: userProfile. Supa: user_profiles |
| `js/shared/realtime-sync.js` | LS: USER_ID, ORG_ID, CURRENT_REPORTS | LS: CURRENT_REPORTS, fvp_report_{uuid}. IDB: syncCurrentReportsToIDB |
| `js/shared/cloud-photos.js` | Supa: photos, report-photos (storage) | — (read-only) |
| `js/shared/delete-report.js` | Supa: photos, reports, final_reports | Supa: DELETE from photos, report-photos, interview_backup, report_backup, ai_submissions, report_data, final_reports, reports |
| `js/archives/main.js` | Supa: reports+projects (join), IDB: cachedArchives | IDB: cachedArchives |
| `js/pwa-utils.js` | — | Service worker registration, persistent storage request |
| `js/report-rules.js` | LS: CURRENT_REPORTS, PROJECTS, projects_cache_ts | LS: projects_cache_ts (via ensureFreshProjectsCache) |
