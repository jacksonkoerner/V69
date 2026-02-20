# FieldVoice Pro — Storage Audit

**Generated:** 2026-02-19
**Status:** In Progress
**Author:** George (AI Audit)

> ⚠️ THIS IS A READ-ONLY AUDIT. No code, Supabase, or n8n changes were made.

---

## Table of Contents

1. [Supabase Schema — All Tables](#1-supabase-schema--all-tables)
2. [Supabase RLS, Storage Buckets & RPCs](#2-supabase-rls-storage-buckets--rpcs)
3. [Storage Keys + Config + Supabase Utils](#3-storage-keys--config--supabase-utils)
4. [IndexedDB Layer](#4-indexeddb-layer)
5. [Data Layer](#5-data-layer)
6. [Data Store](#6-data-store)
7. [Interview: persistence.js](#7-interview-persistencejs)
8. [Interview: photos.js + finish-processing.js](#8-interview-photosjs--finish-processingjs)
9. [Interview: freeform + guided-sections + state-mgmt + main](#9-interview-freeform--guided-sections--state-mgmt--main)
10. [Interview: contractors-personnel + equipment-manual + ui-flow + ui-display](#10-interview-contractors-personnel--equipment-manual--ui-flow--ui-display)
11. [Report: data-loading + autosave + submit + main + delete-report](#11-report-data-loading--autosave--submit--main--delete-report)
12. [Report: form-fields + ai-refine + original-notes](#12-report-form-fields--ai-refine--original-notes)
13. [Report: pdf-generator + preview + debug](#13-report-pdf-generator--preview--debug)
14. [Dashboard: index modules](#14-dashboard-index-modules)
15. [Projects + Project Config](#15-projects--project-config)
16. [Shared Modules](#16-shared-modules)
17. [Auth + Settings + Login + Permissions](#17-auth--settings--login--permissions)
18. [Archives + UI Utils + PWA Utils + Media Utils](#18-archives--ui-utils--pwa-utils--media-utils)
19. [ERDs + Data Flow Maps + Table↔Frontend Matrix](#19-erds--data-flow-maps--tablefrontend-matrix)
20. [Duplicate Code + Misplaced Storage + Orphaned Tables + Recommendations](#20-duplicate-code--misplaced-storage--orphaned-tables--recommendations)

---

## 1. Supabase Schema — All Tables
*Status: ✅ Complete*

**Project:** FieldVoice-Pro-v69 (ref: `bdqfpemylkqnmeqaoere`)
**Total Tables:** 12 (plus 2 RPC functions)
**Frontend References:** 11 of 12 tables referenced in `js/` code

### Table Inventory

#### 1.1 `reports` — Core Report Registry
The central table for all daily reports. Every report starts here.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `project_id` | uuid | — | FK → `projects.id`, nullable | |
| `user_id` | uuid | — | nullable | Auth user reference (not FK to user_profiles) |
| `device_id` | text | — | nullable | Legacy device identification |
| `report_date` | date | — | required | The calendar date of the report |
| `status` | text | `'draft'` | nullable | Values: draft, submitted, etc. |
| `capture_mode` | text | `'guided'` | nullable | Values: guided, freeform |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |
| `submitted_at` | timestamptz | — | nullable | Set when report is finalized |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | Multi-tenancy |
| `pdf_url` | text | — | nullable | URL to generated PDF in storage |
| `inspector_name` | text | — | nullable | Denormalized from user profile |
| `dashboard_dismissed_at` | timestamptz | — | nullable | Hides from dashboard without deleting |

**Frontend usage:** Referenced in 10+ files across report/, index/, interview/, shared/ modules.

#### 1.2 `report_data` — Report Content (AI + User Edits)
Stores the actual report content — AI-generated text, original voice input, and user edits. One row per report (1:1 relationship via report_id PK).

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `report_id` | uuid | — | **PK**, FK → `reports.id`, required | 1:1 with reports |
| `ai_generated` | jsonb | — | nullable | AI-refined report fields |
| `original_input` | jsonb | — | nullable | Raw voice transcription / input |
| `user_edits` | jsonb | — | nullable | Manual edits by user |
| `capture_mode` | text | — | nullable | 🔁 DUPLICATE — also on `reports` |
| `status` | text | `'refined'` | nullable | 🔁 DUPLICATE — also on `reports` |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | 🔁 DUPLICATE — also on `reports` |

🔁 **DUPLICATE:** `capture_mode`, `status`, and `org_id` exist on BOTH `reports` and `report_data`. Risk of desync.

#### 1.3 `projects` — Project Configuration
Stores project setup data — DOT project info, contractor lists, scheduling.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `user_id` | uuid | — | nullable | Owner |
| `project_name` | text | — | required | |
| `noab_project_no` | text | — | nullable | NOAB project number |
| `cno_solicitation_no` | text | — | nullable | CNO solicitation number |
| `location` | text | — | nullable | |
| `engineer` | text | — | nullable | |
| `prime_contractor` | text | — | nullable | |
| `notice_to_proceed` | date | — | nullable | |
| `contract_duration` | integer | — | nullable | In days |
| `expected_completion` | date | — | nullable | |
| `default_start_time` | text | — | nullable | HH:MM format |
| `default_end_time` | text | — | nullable | HH:MM format |
| `weather_days` | integer | — | nullable | |
| `logo_thumbnail` | text | — | nullable | Base64 thumbnail |
| `logo_url` | text | — | nullable | Storage URL for full logo |
| `status` | text | `'active'` | nullable | |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |
| `contractors` | jsonb | — | nullable | Full contractor/crew config blob |
| `contractors_display` | text | — | nullable | 🟠 MAYBE orphaned — display-only text? |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | |
| `report_date` | date | — | nullable | 🟡 ISSUE — project-level report_date seems odd |
| `contract_day_no` | integer | — | nullable | Current contract day counter |

🟡 **ISSUE:** `report_date` and `contract_day_no` on the project table is unusual — these seem like they should auto-increment per report, not be stored on the project. Might be used as "last used" values.
🟠 **MAYBE:** `contractors_display` — not found in `supabase-utils.js` converter. May be orphaned or only used server-side.

#### 1.4 `photos` — Report Photos Metadata
Photo records linked to reports. Actual files stored in `report-photos` storage bucket.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `report_id` | uuid | — | nullable | FK to reports (not enforced?) |
| `photo_url` | text | — | nullable | Public URL |
| `storage_path` | text | — | nullable | Path in storage bucket |
| `caption` | text | — | nullable | |
| `photo_type` | text | — | nullable | Category of photo |
| `taken_at` | timestamptz | — | nullable | |
| `location_lat` | numeric | — | nullable | GPS lat |
| `location_lng` | numeric | — | nullable | GPS lng |
| `filename` | text | — | nullable | Original filename |
| `created_at` | timestamptz | `now()` | nullable | |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | |

🟡 **ISSUE:** `report_id` is nullable with no visible FK constraint in schema. Could have orphaned photos.

#### 1.5 `interview_backup` — Voice Interview State Backup
Cloud backup of interview page state (voice capture in-progress data).

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `report_id` | uuid | — | required | |
| `page_state` | jsonb | — | required | Full interview state blob |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | |

🟢 **GOOD:** Used actively for interview persistence/recovery.

#### 1.6 `report_backup` — ⚫ DEPRECATED
Legacy report content backup. Code comments confirm it's deprecated as of Sprint 13.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `report_id` | uuid | — | required | |
| `page_state` | jsonb | — | required | |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |

⚫ **ORPHAN:** Sprint 13 comments in `report/autosave.js` and `report/data-loading.js` explicitly state: *"report_backup table is deprecated"* and *"report_data is now authoritative."* Table still exists in Supabase. Only reference in frontend is `shared/delete-report.js` which still deletes from it during report cleanup (cleanup code, not read/write).
🔵 **IMPROVEMENT:** Consider dropping this table or at minimum adding a migration note. No data is written to it anymore.

#### 1.7 `final_reports` — Submitted Report Records
Created when a report is finalized/submitted. Stores the submission metadata.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `report_id` | uuid | — | required | |
| `project_id` | uuid | — | required | 🔁 DUPLICATE — available via reports.project_id |
| `user_id` | uuid | — | required | 🔁 DUPLICATE — available via reports.user_id |
| `report_date` | date | — | required | 🔁 DUPLICATE — available via reports.report_date |
| `inspector_name` | text | — | nullable | 🔁 DUPLICATE — available via reports.inspector_name |
| `pdf_url` | text | — | nullable | 🔁 DUPLICATE — available via reports.pdf_url |
| `submitted_at` | timestamptz | `now()` | nullable | 🔁 DUPLICATE — available via reports.submitted_at |
| `status` | text | `'submitted'` | nullable | |

🔁 **DUPLICATE:** Nearly every column duplicates data from `reports`. This table appears to be a denormalized "submission receipt." 6 of 8 non-PK columns are redundant with data already on `reports`.
🔵 **IMPROVEMENT:** Could potentially be replaced by a view or just querying `reports WHERE status = 'submitted'`.

#### 1.8 `ai_submissions` — AI Processing Logs
Records each AI refinement request and response.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `report_id` | uuid | — | required | |
| `original_input` | jsonb | — | nullable | What was sent to AI |
| `ai_response` | jsonb | — | nullable | What AI returned |
| `model_used` | text | — | nullable | |
| `processing_time_ms` | integer | — | nullable | |
| `submitted_at` | timestamptz | `now()` | nullable | |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | |

🟢 **GOOD:** Useful audit trail for AI processing.

#### 1.9 `organizations` — Multi-Tenancy
Org/tenant records for multi-user support.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `name` | text | — | required | |
| `slug` | text | — | nullable | |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |

🟢 **GOOD:** Clean, minimal table. FK'd by most other tables via `org_id`.

#### 1.10 `user_profiles` — User Information
Profile data for app users.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `full_name` | text | — | nullable | |
| `title` | text | — | nullable | |
| `company` | text | — | nullable | |
| `email` | text | — | nullable | |
| `phone` | text | — | nullable | |
| `device_id` | text | — | nullable | Legacy device-based auth |
| `created_at` | timestamptz | `now()` | nullable | |
| `updated_at` | timestamptz | `now()` | nullable | |
| `auth_user_id` | uuid | — | nullable | Links to Supabase Auth |
| `role` | text | `'inspector'` | nullable | |
| `org_id` | uuid | — | FK → `organizations.id`, nullable | |
| `device_info` | jsonb | — | nullable | |

🟡 **ISSUE:** Both `device_id` (text) and `device_info` (jsonb) exist here AND on `user_devices`. Dual-path identity system — device-based (legacy) + auth-based (new).

#### 1.11 `user_devices` — Device Registry
Maps physical devices to user profiles.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `user_id` | uuid | — | FK → `user_profiles.id`, nullable | |
| `device_id` | text | — | required | |
| `device_info` | jsonb | — | nullable | 🔁 DUPLICATE — also on `user_profiles` |
| `last_active` | timestamptz | `now()` | nullable | |
| `created_at` | timestamptz | `now()` | nullable | |

🔁 **DUPLICATE:** `device_info` exists on both `user_devices` and `user_profiles`.

#### 1.12 `debug_logs` — Remote Debug Logging
Client-side logs sent to Supabase for remote debugging.

| Column | Type | Default | Constraints | Notes |
|--------|------|---------|-------------|-------|
| `id` | uuid | `gen_random_uuid()` | PK, required | |
| `created_at` | timestamptz | `now()` | nullable | |
| `level` | text | `'log'` | required | log/warn/error |
| `message` | text | — | required | |
| `page` | text | — | nullable | Which page generated the log |
| `device_id` | text | — | nullable | |

🟢 **GOOD:** Clean debug table. No org_id though — logs are device-scoped, not org-scoped.

### RPC Functions

| Function | Purpose |
|----------|---------|
| `get_user_org_id` | Returns the org_id for the current authenticated user |
| `get_user_profile_id` | Returns the user_profiles.id for the current authenticated user |

### Frontend Reference Cross-Check

| Supabase Table | Referenced in Frontend `.from()` | Status |
|----------------|----------------------------------|--------|
| `reports` | ✅ Yes | Active |
| `report_data` | ✅ Yes | Active |
| `projects` | ✅ Yes | Active |
| `photos` | ✅ Yes | Active |
| `interview_backup` | ✅ Yes | Active |
| `report_backup` | ✅ Only in delete cleanup | ⚫ DEPRECATED |
| `final_reports` | ✅ Yes | Active |
| `ai_submissions` | ✅ Yes | Active |
| `organizations` | ✅ Yes | Active |
| `user_profiles` | ✅ Yes | Active |
| `user_devices` | ✅ Yes | Active |
| `debug_logs` | ✅ Yes | Active |

**Storage bucket references (via `.storage.from()`):**
- `report-photos` — photo file uploads
- `report-pdfs` — generated PDF storage
- `project-logos` — project logo uploads

### Summary Findings

- 🔁 **Significant duplication** between `reports` ↔ `final_reports` (6 redundant columns)
- 🔁 **Duplication** of `capture_mode`, `status`, `org_id` between `reports` ↔ `report_data`
- 🔁 **Duplication** of `device_info` between `user_profiles` ↔ `user_devices`
- ⚫ **`report_backup` is deprecated** but still exists as a table
- 🟡 **Dual identity system** — device_id (legacy) and auth_user_id (new) coexist
- 🟡 **`report_date` and `contract_day_no` on `projects`** — seems misplaced
- 🟠 **`contractors_display`** on projects — may be orphaned

---

## 2. Supabase RLS, Storage Buckets & RPCs
*Status: ✅ Complete*

### 2.1 Row Level Security (RLS) Status

**Critical finding:** RLS is effectively **disabled** on almost all tables. The frontend uses the **anon key** (not service role), but RLS being off means the anon key has unrestricted access to all rows.

| Table | RLS Enabled? | Policies | Notes |
|-------|-------------|----------|-------|
| `reports` | 🔴 NO | None in migrations | No RLS at all |
| `report_data` | 🔴 NO | Policy created then **disabled** | Migration 003 creates a policy then immediately runs `DISABLE ROW LEVEL SECURITY` |
| `projects` | 🔴 NO | None in migrations | No RLS at all |
| `photos` | 🔴 NO | None in migrations | No RLS at all |
| `interview_backup` | ✅ YES | `"Org members can manage interview_backup"` | Migration 011 — only table with active RLS |
| `report_backup` | 🔴 NO | None | Deprecated table, no RLS |
| `final_reports` | 🔴 NO | None in migrations | No RLS at all |
| `ai_submissions` | 🔴 NO | None in migrations | No RLS at all |
| `organizations` | 🔴 NO | None in migrations | No RLS at all |
| `user_profiles` | 🔴 NO | None in migrations | No RLS at all |
| `user_devices` | 🔴 NO | None in migrations | No RLS at all |
| `debug_logs` | 🔴 NO | None in migrations | No RLS at all |

🔴 **BUG (Security):** Only 1 of 12 tables (`interview_backup`) has active RLS policies. All other tables are wide open to any client with the anon key. This means:
- Any user can read/write ANY user's reports, projects, photos, profile data
- The anon key is embedded in the frontend JavaScript (visible to anyone)
- Client-side org_id filtering in JS is the only access control (easily bypassed)

🟡 **ISSUE:** Migration 003 (`report_data`) creates an RLS policy then *immediately disables RLS*, with a comment: "Disable RLS to match existing tables — re-enable when all tables migrate to proper RLS." This migration is from Sprint 4 — it was never re-enabled.

#### The One Working Policy

```sql
-- On interview_backup (Migration 011):
CREATE POLICY "Org members can manage interview_backup"
  ON interview_backup FOR ALL TO authenticated
  USING (org_id = get_user_org_id())
  WITH CHECK (org_id = get_user_org_id());
```

This uses the `get_user_org_id()` RPC function to scope access by org. This is the correct pattern — it just hasn't been applied to other tables.

### 2.2 Client-Side Access Patterns

**Authentication:** Frontend uses the **anon key** via `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` in `js/config.js`.

**Org-scoped filtering (client-side only):**
- `js/archives/main.js` — `.eq('org_id', orgId)` on reports and final_reports queries
- `js/data-layer.js` — `.eq('org_id', orgId)` on projects query; also client-side filter `p.orgId === orgId`
- `js/shared/realtime-sync.js` — `filter: 'org_id=eq.' + orgId` on projects realtime channel
- `js/shared/data-store.js` — Sets `org_id` when writing rows

🔵 **IMPROVEMENT:** Org filtering is done at the application level (JavaScript), not database level (RLS). This is security by convention, not enforcement. Any motivated user could use the anon key to query data from other orgs.

### 2.3 Storage Buckets

| Bucket | Public | Size Limit | MIME Filter | Used By |
|--------|--------|-----------|-------------|---------|
| `report-photos` | ✅ Public | None | None | `interview/persistence.js`, `shared/cloud-photos.js`, `shared/delete-report.js`, `report/form-fields.js` |
| `report-pdfs` | ✅ Public | None | None | `report/submit.js`, `shared/delete-report.js` |
| `project-logos` | ✅ Public | None | None | `media-utils.js` |

🟡 **ISSUE:** All 3 buckets are **public** with **no file size limits** and **no MIME type restrictions**.
- No size limit = potential for abuse (upload arbitrarily large files)
- No MIME filter = any file type can be uploaded to any bucket
- Public = files accessible without authentication via direct URL

🔵 **IMPROVEMENT:** Consider:
- Setting `file_size_limit` (e.g., 10MB for photos, 50MB for PDFs, 2MB for logos)
- Setting `allowed_mime_types` (e.g., `['image/jpeg', 'image/png', 'image/webp']` for photos)
- Making buckets private if public URLs aren't needed (use signed URLs instead)

#### Storage Path Patterns

**report-photos:** `{orgId}/{reportId}/{filename}` (based on code in `interview/persistence.js`)
**report-pdfs:** `{orgId}/{reportId}/{filename}.pdf` (based on code in `report/submit.js`)
**project-logos:** `{projectId}/{filename}` (based on code in `media-utils.js`)

### 2.4 RPC Functions

| Function | Exists in Supabase | Called from Frontend | Notes |
|----------|-------------------|---------------------|-------|
| `get_user_org_id()` | ✅ Yes | ❌ No JS calls found | Only used in RLS policy for `interview_backup` |
| `get_user_profile_id()` | ✅ Yes | ❌ No JS calls found | Not referenced anywhere in frontend code |

🟠 **MAYBE:** `get_user_profile_id()` may be completely unused — neither in RLS policies (from migrations) nor in frontend code. Could be orphaned.

🟢 **GOOD:** `get_user_org_id()` is the correct mechanism for RLS policies. It's used in the one working policy on `interview_backup`.

### 2.5 Supabase Realtime

Enabled on 3 tables (Migration 007):
- `reports` — Frontend subscribes via `reports-sync` channel
- `report_data` — Added to publication but subscription not visible in realtime-sync.js
- `projects` — Frontend subscribes via `projects-sync` channel (org-filtered)

🟡 **ISSUE:** `report_data` is added to the realtime publication but `js/shared/realtime-sync.js` only subscribes to `reports` and `projects` channels. Either the `report_data` subscription is handled elsewhere, or it's configured but not consumed.

### 2.6 Migration History Summary

| Migration | Sprint | Purpose |
|-----------|--------|---------|
| 003 | 4 | Create `report_data` table (replaces localStorage) |
| 004 | — | Create `organizations` table + add `org_id` to profiles/projects/reports |
| 005 | 10 | Add `device_info` JSONB to `user_profiles` |
| 006 | 10 | Add `report_date` + `contract_day_no` to `projects` |
| 007 | 13 | Create `user_devices` table + enable Realtime on reports/report_data/projects |
| 008 | 13 | Deprecate `report_backup` (no-op, just a comment) |
| 009 | 13 | Merge `final_reports` columns into `reports` (add pdf_url, inspector_name, submitted_at) |
| 010 | — | Add FK constraint `reports.project_id → projects.id` |
| 011 | 14 | Add `org_id` to `interview_backup` + create RLS policy |

**Missing migrations 001-002:** The base tables (`reports`, `projects`, `photos`, `user_profiles`, `report_backup`, `interview_backup`, `final_reports`, `ai_submissions`, `debug_logs`) were created outside the migration system (likely via Supabase Dashboard). No SQL record of their original schema.

🔵 **IMPROVEMENT:** Consider creating a baseline migration (001) that captures the full current schema for reproducibility.

### 2.7 Summary Findings

- 🔴 **CRITICAL:** 11 of 12 tables have NO RLS — all data is accessible to anyone with the anon key
- 🟡 **3 public storage buckets** with no size/MIME restrictions
- 🟠 **`get_user_profile_id()` RPC** may be orphaned
- 🟡 **`report_data` realtime** is published but possibly not subscribed to
- 🔵 **No baseline migration** — original table creation not tracked
- 🟢 **`interview_backup` RLS** is the gold standard pattern — should be replicated to all tables

---

## 3. Storage Keys + Config + Supabase Utils
*Status: ✅ Complete*

### 3.1 `js/config.js` (11 lines) — Supabase Client Setup

**Purpose:** Single source of truth for Supabase credentials. Initializes the global `supabaseClient`.

**Constants defined:**
| Constant | Value | Scope |
|----------|-------|-------|
| `SUPABASE_URL` | `https://bdqfpemylkqnmeqaoere.supabase.co` | Global (const) |
| `SUPABASE_ANON_KEY` | JWT anon key | Global (const) |
| `N8N_WEBHOOK_API_KEY` | `fvp-n8n-webhook-key-2026` | Global (const) |
| `supabaseClient` | `supabase.createClient(...)` | Global (const) |

🟡 **ISSUE:** `N8N_WEBHOOK_API_KEY` is hardcoded in client-side JavaScript — visible to anyone inspecting the source. Tagged `SEC-01` in comments, but the key is still plainly exposed.

🟢 **GOOD:** Single client instance — all code shares one `supabaseClient`. No duplicate initialization.

### 3.2 `js/storage-keys.js` (129 lines) — localStorage Key Registry

**Purpose:** Central registry of all localStorage keys used by the app, plus helper functions for common localStorage operations.

#### Complete localStorage Key Inventory

| Key Constant | localStorage Key | Purpose | Category |
|-------------|-----------------|---------|----------|
| `PROJECTS` | `fvp_projects` | Cached projects list | Data Cache |
| `ACTIVE_PROJECT_ID` | `fvp_active_project_id` | Currently selected project | Session State |
| `ACTIVE_REPORT_ID` | `fvp_active_report_id` | Currently active report | Session State |
| `DEVICE_ID` | `fvp_device_id` | Unique device identifier (auto-generated UUID) | Identity |
| `USER_ID` | `fvp_user_id` | User profile ID (from Supabase) | Identity |
| `AUTH_ROLE` | `fvp_auth_role` | User role (e.g., 'inspector') | Identity |
| `USER_NAME` | `fvp_user_name` | Cached user full name | Identity |
| `USER_EMAIL` | `fvp_user_email` | Cached user email | Identity |
| `AUTH_USER_ID` | `fvp_auth_user_id` | Supabase Auth UUID | Identity |
| `MIC_GRANTED` | `fvp_mic_granted` | Microphone permission granted | Permissions |
| `MIC_TIMESTAMP` | `fvp_mic_timestamp` | When mic permission was last checked | Permissions |
| `CAM_GRANTED` | `fvp_cam_granted` | Camera permission granted | Permissions |
| `LOC_GRANTED` | `fvp_loc_granted` | Location permission granted | Permissions |
| `LOC_LAT` | `fvp_loc_lat` | Last known latitude | Location |
| `LOC_LNG` | `fvp_loc_lng` | Last known longitude | Location |
| `LOC_TIMESTAMP` | `fvp_loc_timestamp` | When location was last captured | Location |
| `SPEECH_GRANTED` | `fvp_speech_granted` | Speech recognition permission | Permissions |
| `ONBOARDED` | `fvp_onboarded` | Has user completed onboarding | UX State |
| `BANNER_DISMISSED` | `fvp_banner_dismissed` | Install banner dismissed | UX State |
| `BANNER_DISMISSED_DATE` | `fvp_banner_dismissed_date` | When banner was dismissed | UX State |
| `DICTATION_HINT_DISMISSED` | `fvp_dictation_hint_dismissed` | Dictation hint dismissed | UX State |
| `PERMISSIONS_DISMISSED` | `fvp_permissions_dismissed` | Permissions prompt dismissed | UX State |
| `ORG_ID` | `fvp_org_id` | Organization ID | Identity |
| `DELETED_REPORT_IDS` | `fvp_deleted_report_ids` | Blocklist of deleted report IDs (JSON array, max 100) | Sync Control |
| `PROJECTS_CACHE_TS` | `fvp_projects_cache_ts` | Timestamp of last projects cache | Cache Control |
| `SETTINGS_SCRATCH` | `fvp_settings_scratch` | Unsaved settings form data | Form State |
| `AI_CONVERSATION` | `fvp_ai_conversation` | AI assistant conversation history | Feature Data |
| `SUBMITTED_BANNER_DISMISSED` | `fvp_submitted_banner_dismissed` | Submitted report banner dismissed | UX State |
| `MIGRATION_V113_IDB_CLEAR` | `fvp_migration_v113_idb_clear` | One-time migration flag for IDB cleanup | Migration |
| `MARKUP_PHOTO` | `fvp_markup_photo` | Photo data being marked up | Feature Data |

**Total: 30 registered keys**

#### Key Categories Summary
| Category | Count | Keys |
|----------|-------|------|
| Identity | 6 | DEVICE_ID, USER_ID, AUTH_ROLE, USER_NAME, USER_EMAIL, AUTH_USER_ID, ORG_ID |
| Permissions | 4 | MIC_GRANTED, MIC_TIMESTAMP, CAM_GRANTED, LOC_GRANTED, SPEECH_GRANTED |
| Location | 3 | LOC_LAT, LOC_LNG, LOC_TIMESTAMP |
| UX State | 5 | ONBOARDED, BANNER_DISMISSED, BANNER_DISMISSED_DATE, DICTATION_HINT_DISMISSED, PERMISSIONS_DISMISSED, SUBMITTED_BANNER_DISMISSED |
| Session State | 2 | ACTIVE_PROJECT_ID, ACTIVE_REPORT_ID |
| Data Cache | 1 | PROJECTS |
| Cache Control | 1 | PROJECTS_CACHE_TS |
| Sync Control | 1 | DELETED_REPORT_IDS |
| Form State | 1 | SETTINGS_SCRATCH |
| Feature Data | 2 | AI_CONVERSATION, MARKUP_PHOTO |
| Migration | 1 | MIGRATION_V113_IDB_CLEAR |

#### Helper Functions Exported

| Function | Purpose | Notes |
|----------|---------|-------|
| `getDeviceId()` | Get or create device UUID | Auto-generates via `crypto.randomUUID()` on first call |
| `getStorageItem(key)` | Read + auto-parse JSON | Returns raw string if JSON parse fails |
| `setStorageItem(key, value)` | JSON.stringify + write | Returns boolean success/failure |
| `removeStorageItem(key)` | Delete key | Simple wrapper |
| `addToDeletedBlocklist(id)` | Add report ID to deleted list | Max 100 entries (FIFO) |
| `isDeletedReport(id)` | Check if report was deleted | Used to suppress realtime-synced deleted reports |
| `removeFromDeletedBlocklist(id)` | Remove from deleted list | |
| `aiConversationKey(userId)` | Generate per-user AI chat key | Appends `_userId` to base key |

🟢 **GOOD:** Centralized key registry prevents key string typos across files. All keys use `fvp_` prefix for namespacing.

🟡 **ISSUE:** The `PROJECTS` key (`fvp_projects`) stores the entire projects list in localStorage. If a user has many projects with large contractor JSONB blobs, this could hit the ~5MB localStorage limit.

🔵 **IMPROVEMENT:** The deleted report blocklist caps at 100 entries — good. But the `AI_CONVERSATION` and `MARKUP_PHOTO` keys could potentially store large data (conversation history, base64 photo data) in localStorage with no size guard.

#### Dynamic Keys (Not in STORAGE_KEYS)

The code also uses some **dynamically constructed** localStorage keys NOT listed in the `STORAGE_KEYS` object. Found in other files (will document in later chunks):
- `fvp_report_{id}` — per-report data (referenced in `data-store.js`)
- `fvp_current_reports` — report list cache
- `fvp_backup_stale_{id}` — stale backup flags

🟡 **ISSUE:** These dynamic keys bypass the central registry, making it harder to track all localStorage usage.

### 3.3 `js/supabase-utils.js` (146 lines) — Schema Converters

**Purpose:** Converts between Supabase snake_case DB rows and camelCase JS objects. Three converter functions.

#### `fromSupabaseProject(row)` — DB → JS

Maps all 22 project columns to camelCase equivalents. Handles:
- JSONB `contractors` field — parses if string, passes through if already object, catches malformed JSON
- Legacy `logo` field — preserved for backwards compatibility alongside new `logoThumbnail` + `logoUrl`
- Defaults empty strings for text fields, null for dates/numbers

🟡 **ISSUE:** The docstring lists DB columns but does NOT include `contractors`, `contractors_display`, `org_id`, `report_date`, or `contract_day_no` — those were added in later migrations. The actual code DOES map `report_date` and `contract_day_no`, but `contractors_display` and `org_id` are NOT mapped in the `fromSupabaseProject()` output.

🟠 **MAYBE:** `contractors_display` column exists in Supabase but is never read by `fromSupabaseProject()` — possibly orphaned at the DB level.

#### `toSupabaseProject(project)` — JS → DB

Maps camelCase back to snake_case for upserts. Notable:
- `contractors` is `JSON.stringify()`'d before sending (JSONB column)
- `org_id` is pulled from the project object OR falls back to `localStorage.getItem(STORAGE_KEYS.ORG_ID)` — direct localStorage access inside a "utils" file
- `id` is only included if it exists (allows inserts without specifying UUID)
- Does NOT include `user_id` — this is presumably set server-side or via RLS

🟡 **ISSUE:** `toSupabaseProject()` reads from `localStorage` directly (for `org_id` fallback). This couples a "pure converter" function to browser storage. Should probably receive `orgId` as a parameter.

🔁 **DUPLICATE:** The `org_id` fallback pattern (`project.orgId || project.org_id || localStorage.getItem(...)`) appears in multiple files. This is the first instance — will track others.

#### `toSupabaseUserProfile(profile)` — JS → DB (User Profile)

Maps 7 fields: `deviceId`, `fullName`, `title`, `company`, `email`, `phone`, plus auto-sets `updated_at`.

🟡 **ISSUE:** No `fromSupabaseUserProfile()` function exists — there's a `toSupabase` converter but no reverse. Profile data is presumably read and mapped ad-hoc in consumer files.

🟡 **ISSUE:** Does NOT include `auth_user_id`, `role`, `org_id`, or `device_info` — all columns that exist on the `user_profiles` table. Incomplete mapping.

### 3.4 Module Loading Pattern

`storage-keys.js` uses an IIFE (Immediately Invoked Function Expression) with `window.*` exports. It also **dynamically loads** other scripts:
- If `window.fvpBroadcast` is missing → injects `js/shared/broadcast.js`
- If `window.dataStore` is missing → injects `js/shared/data-store.js`

🟡 **ISSUE:** This creates an implicit load-order dependency. `storage-keys.js` must load before other modules, AND it tries to load `broadcast.js` and `data-store.js` if they haven't loaded yet. This is fragile — race conditions possible if scripts load async.

### 3.5 Summary Findings

- 🟢 **30 localStorage keys centrally registered** with `fvp_` prefix — good namespacing
- 🟡 **Dynamic keys exist outside the registry** (`fvp_report_{id}`, `fvp_current_reports`, `fvp_backup_stale_{id}`)
- 🟡 **Incomplete supabase-utils converters** — no `fromSupabaseUserProfile()`, missing columns in project converter
- 🟡 **localStorage coupling** in converter function (`toSupabaseProject` reads `ORG_ID` from localStorage)
- 🟡 **N8N webhook key exposed** in client-side config
- 🔁 **org_id fallback pattern** appears here first — will track duplicates
- 🟠 **`contractors_display`** column not mapped by any converter — possible orphan

---

## 4. IndexedDB Layer
*Status: ✅ Complete*

**File:** `js/indexeddb-utils.js` (939 lines)
**Database:** `fieldvoice-pro`
**Current Version:** 7
**Global export:** `window.idb`

### 4.1 Schema Version History

| Version | Store Added/Modified | Purpose |
|---------|---------------------|---------|
| 1 | `projects`, `userProfile` | Base stores |
| 2 | `photos` | Photo blob storage with indexes |
| 3 | Deleted `archives` | Removed dead store |
| 4 | `currentReports` | Report metadata cache with indexes |
| 5 | `draftData` | Interview draft data |
| 6 | `cachedArchives` | Archive page cache |
| 7 | `reportData` | Cross-page report data handoff |

### 4.2 Object Store Schemas

#### `projects` (v1) — Key: `id`
Local cache of project objects. Mirrors Supabase `projects` table.

| Property | Type | Notes |
|----------|------|-------|
| `id` | string (UUID) | keyPath — matches Supabase project.id |
| *(all project fields)* | mixed | Full project object as-is from `fromSupabaseProject()` |

**CRUD:** `saveProject(project)`, `getProject(id)`, `getAllProjects()`, `deleteProject(id)`
**No indexes.** All access is by primary key or full scan.

#### `userProfile` (v1) — Key: `deviceId`
Local user profile cache. One record per device.

| Property | Type | Notes |
|----------|------|-------|
| `deviceId` | string (UUID) | keyPath — device identifier |
| *(all profile fields)* | mixed | Full profile object |

**CRUD:** `saveUserProfile(profile)`, `getUserProfile(deviceId)`
**No delete function exposed.** 🟡 ISSUE — profiles can be saved but never cleaned up from IDB.

#### `photos` (v2) — Key: `id`
Photo blobs + metadata. Stores actual image data locally for offline/sync.

| Property | Type | Notes |
|----------|------|-------|
| `id` | string (UUID) | keyPath |
| `reportId` | string (UUID) | Indexed — which report the photo belongs to |
| `syncStatus` | string | Indexed — 'pending', 'synced', 'failed' |
| *(photo data)* | Blob/base64 | Actual image data |

**Indexes:**
- `reportId` — non-unique, enables `getPhotosByReportId()`
- `syncStatus` — non-unique, enables `getPhotosBySyncStatus()`

**CRUD:** `savePhoto(photo)`, `getPhoto(id)`, `getPhotosByReportId(reportId)`, `getPhotosBySyncStatus(status)`, `deletePhoto(id)`, `deletePhotosByReportId(reportId)`

🟢 **GOOD:** Most complete CRUD of any store. Uses cursor-based deletion for batch deletes by reportId. `syncStatus` index supports offline-first photo upload queue.

🟡 **ISSUE:** Photo blobs in IndexedDB can get very large. No cleanup/eviction strategy visible. If a user takes many photos across reports, IDB storage can grow unbounded.

#### `currentReports` (v4) — Key: `id`
Active/draft report metadata cache. Mirrors the Supabase `reports` table for non-archived reports.

| Property | Type | Notes |
|----------|------|-------|
| `id` | string (UUID) | keyPath — matches Supabase report.id |
| `project_id` | string (UUID) | Indexed — filter by project |
| `status` | string | Indexed — filter by status |
| *(all report fields)* | mixed | Full report object |

**Indexes:**
- `project_id` — non-unique
- `status` — non-unique

**CRUD:** `getAllCurrentReports()`, `saveCurrentReportIDB(report)`, `deleteCurrentReportIDB(reportId)`, `replaceAllCurrentReports(reportsMap)`

🟢 **GOOD:** `replaceAllCurrentReports()` does an atomic clear + bulk put in one transaction — ensures consistency during cloud sync.

**Note:** `getAllCurrentReports()` returns a **map** (`{id: report}`) not an array — different pattern from `getAllProjects()` which returns an array.

#### `draftData` (v5) — Key: `reportId`
Interview draft/in-progress data. Stores voice capture state for recovery.

| Property | Type | Notes |
|----------|------|-------|
| `reportId` | string (UUID) | keyPath |
| `_idbSavedAt` | string (ISO date) | Auto-added on save |
| *(draft fields)* | mixed | Interview state blob |

**CRUD:** `saveDraftDataIDB(reportId, data)`, `getDraftDataIDB(reportId)`, `deleteDraftDataIDB(reportId)`

🟠 **MAYBE:** Both `draftData` and the Supabase `interview_backup` table store interview state. The relationship between them (which is primary, sync direction) will be clarified in Chunk 7 (persistence.js).

#### `cachedArchives` (v6) — Key: `key`
Generic key-value cache for the archives page.

| Property | Type | Notes |
|----------|------|-------|
| `key` | string | keyPath — cache key (e.g., 'reports', 'projects') |
| `data` | any | Cached payload |
| `cachedAt` | string (ISO date) | When cached |

**CRUD:** `saveCachedArchive(key, data)`, `getCachedArchive(key)`
**No delete/clear function exposed for individual keys.** Only `clearStore('cachedArchives')` can wipe it.

#### `reportData` (v7) — Key: `reportId`
Durable report data for cross-page navigation (interview → report page handoff).

| Property | Type | Notes |
|----------|------|-------|
| `reportId` | string (UUID) | keyPath |
| `_idbSavedAt` | string (ISO date) | Auto-added on save |
| *(report data fields)* | mixed | AI-generated, user edits, original input |

**CRUD:** `saveReportDataIDB(reportId, data)`, `getReportDataIDB(reportId)`, `deleteReportDataIDB(reportId)`

🔁 **DUPLICATE:** This store mirrors the Supabase `report_data` table AND overlaps with the `draftData` store. Three places storing similar report content data:
1. `draftData` IDB store — interview drafts
2. `reportData` IDB store — cross-page handoff
3. `report_data` Supabase table — cloud persistence

### 4.3 Connection Management

**Pattern:** Lazy singleton — `initDB()` opens the connection once, caches in module-level `db` variable.

**iOS Safari Hardening:**
- 🟢 **GOOD:** `IDB_OPEN_TIMEOUT_MS` (3 seconds) — prevents indefinite hangs on iOS bfcache restore
- 🟢 **GOOD:** Connection health check — on each `ensureDB()`, attempts a dummy transaction. If it throws (stale connection), reopens.
- 🟢 **GOOD:** `db.onclose` handler — detects unexpected connection closure and nulls the cache.
- 🟢 **GOOD:** `onblocked` handler — logs warning when upgrade is blocked by another tab.
- 🟢 **GOOD:** `closeAllIDBConnections()` — explicitly closes before navigation to prevent upgrade blocking.
- 🟢 **GOOD:** `resetDB()` — allows external callers to force reconnection.

### 4.4 DataStore Compatibility Shim

**Critical pattern (lines 885-938):** At the bottom of the file, if `window.dataStore` exists, the `window.idb` methods for `currentReports`, `draftData`, `reportData`, `resetDB`, and `closeAllIDBConnections` are **overridden** to delegate to `window.dataStore` instead.

This means:
- `idb.saveCurrentReportIDB()` → actually calls `dataStore.saveReport()`
- `idb.getDraftDataIDB()` → actually calls `dataStore.getDraftData()`
- `idb.saveReportDataIDB()` → actually calls `dataStore.saveReportData()`
- etc.

🟡 **ISSUE:** This creates a confusing indirection. Code calling `window.idb.saveCurrentReportIDB()` may think it's writing to IndexedDB, but if `dataStore` loaded first, it's going through a different code path. The behavior depends on **script load order**.

🔁 **DUPLICATE:** The `idb` and `dataStore` modules both implement the same operations for reports, drafts, and report data. The shim tries to bridge them, but it means two parallel implementations exist.

### 4.5 Exported API Summary

All functions exported as `window.idb.*`:

| Category | Functions | Count |
|----------|-----------|-------|
| Setup | `initDB`, `resetDB`, `closeAllIDBConnections` | 3 |
| Projects | `saveProject`, `getProject`, `getAllProjects`, `deleteProject` | 4 |
| User Profile | `saveUserProfile`, `getUserProfile` | 2 |
| Photos | `savePhoto`, `getPhoto`, `getPhotosByReportId`, `getPhotosBySyncStatus`, `deletePhoto`, `deletePhotosByReportId` | 6 |
| Current Reports | `getAllCurrentReports`, `saveCurrentReportIDB`, `deleteCurrentReportIDB`, `replaceAllCurrentReports` | 4 |
| Draft Data | `saveDraftDataIDB`, `getDraftDataIDB`, `deleteDraftDataIDB` | 3 |
| Cached Archives | `saveCachedArchive`, `getCachedArchive` | 2 |
| Report Data | `saveReportDataIDB`, `getReportDataIDB`, `deleteReportDataIDB` | 3 |
| General | `clearStore` | 1 |
| **Total** | | **28** |

### 4.6 Summary Findings

- 🟢 **Robust iOS Safari handling** — timeout, health checks, connection reset, blocked detection
- 🔁 **Triple storage for report content** — `draftData` IDB + `reportData` IDB + `report_data` Supabase
- 🔁 **DataStore shim creates dual implementations** — `idb` functions secretly delegate to `dataStore` when available
- 🟡 **No photo eviction** — photo blobs in IDB can grow unbounded
- 🟡 **No `deleteUserProfile()` function** — profiles saved but never cleaned from IDB
- 🟡 **Inconsistent return types** — `getAllCurrentReports()` returns map, `getAllProjects()` returns array
- 🟠 **Script load order dependency** — `dataStore` shim behavior depends on which script loads first

---

## 5. Data Layer
*Status: ✅ Complete*

**File:** `js/data-layer.js` (358 lines)
**Global export:** `window.dataLayer`
**Purpose:** Unified data access — IndexedDB-first, Supabase-fallback, cache-on-fetch. Only covers **projects** and **user settings** (not reports or photos).

### 5.1 Storage Strategy (as documented in file)

| Storage Layer | What Goes There |
|--------------|-----------------|
| localStorage | Small flags only (active_project_id, device_id, user_id, permissions) |
| IndexedDB | All cached data (projects, reports, photos, userProfile) |
| Supabase | Source of truth, sync target |

**Pattern:** Read from IDB → if empty/failed, fetch from Supabase → cache result to IDB.

### 5.2 Exported Functions

| Function | Reads From | Writes To | Supabase Table |
|----------|-----------|----------|----------------|
| `loadProjects()` | IDB `projects` only | localStorage `fvp_projects` + `fvp_projects_cache_ts` | None (IDB only) |
| `refreshProjectsFromCloud()` | Supabase `projects` | IDB `projects` (clear + refill) + localStorage `fvp_projects` + `fvp_projects_cache_ts` | `projects` SELECT |
| `loadProjectById(id)` | IDB `projects` → Supabase fallback | IDB `projects` (cache on miss) | `projects` SELECT |
| `loadUserSettings()` | IDB `userProfile` → Supabase fallback | IDB `userProfile` (cache on miss) | `user_profiles` SELECT |
| `saveUserSettings(settings)` | — | IDB `userProfile` only | None (IDB only!) |

### 5.3 Data Flow: Projects

```
refreshProjectsFromCloud()
  │
  ├─ Supabase: SELECT * FROM projects WHERE org_id = ? ORDER BY project_name
  │
  ├─ Convert: fromSupabaseProject() (snake_case → camelCase)
  │
  ├─ IDB: clearStore('projects') → saveProject() for each
  │
  └─ localStorage: PROJECTS (map {id: project}), PROJECTS_CACHE_TS (timestamp)

loadProjects()
  │
  ├─ IDB: getAllProjects()
  │
  ├─ Normalize: normalizeProject() (handles mixed formats)
  │
  ├─ Filter: by orgId if set
  │
  └─ localStorage: PROJECTS (map), PROJECTS_CACHE_TS (if not set)
```

🟢 **GOOD:** `refreshProjectsFromCloud()` does a clear-then-refill on IDB, preventing stale project accumulation.

🟡 **ISSUE:** `loadProjects()` reads from IDB but ALSO writes to localStorage (`fvp_projects`). This means projects are stored in **both** IDB and localStorage simultaneously. The localStorage copy is specifically for `report-rules.js` (noted in comment). This is a bridge pattern — localStorage is the legacy path, IDB is the new path.

🔁 **DUPLICATE:** Projects exist in 3 places:
1. Supabase `projects` table (source of truth)
2. IDB `projects` store (offline cache)
3. localStorage `fvp_projects` (legacy compatibility for report-rules.js)

### 5.4 Data Flow: User Settings

```
loadUserSettings()
  │
  ├─ Get auth_user_id from Supabase session
  │
  ├─ IDB: getUserProfile(authUserId || deviceId)
  │    └─ If found: return normalized
  │
  ├─ If offline or no auth: return null
  │
  ├─ Supabase: SELECT * FROM user_profiles WHERE auth_user_id = ?
  │
  └─ IDB: saveUserProfile(normalized) — cache for next time
```

🟡 **ISSUE:** `loadUserSettings()` uses `authUserId` as the IDB lookup key when available, but the `userProfile` store's keyPath is `deviceId`. If a profile was saved with `deviceId` as key, then a later lookup by `authUserId` will miss it (different key). The `normalizeUserSettings()` function maps `device_id` → `deviceId`, so the IDB key would be the device UUID, not the auth UUID. The `cacheKey` logic falls back to deviceId, so it *might* work — but it depends on the stored profile having the right key.

🟡 **ISSUE:** `saveUserSettings()` only writes to IDB — it does NOT sync back to Supabase. User settings edited locally won't persist to the cloud unless another code path handles the Supabase upsert. This creates a one-way sync: cloud → local works, local → cloud does not (from this module).

### 5.5 Normalizer Functions

#### `normalizeProject(p)`
Handles mixed snake_case/camelCase input — maps 20 fields with dual-path lookups:
```js
projectName: p.projectName || p.name || p.project_name || ''
```

🟢 **GOOD:** Defensive normalization handles data from Supabase (snake), IDB (might be either), or in-memory (camel). Prevents format mismatches.

🟡 **ISSUE:** `normalizeProject()` does NOT preserve `createdAt`/`updatedAt` fields — they're not in the normalizer output. Timestamps are lost during normalization.

🟠 **MAYBE:** The normalizer sets `weatherDays` default to `0` (not `null`), while the Supabase column is nullable. This could cause `0` to be saved where `null` was intended.

#### `normalizeUserSettings(s)`
Maps 7 fields: `id`, `deviceId`, `fullName`, `title`, `company`, `email`, `phone`.

🟡 **ISSUE:** Strips `auth_user_id`, `role`, `org_id`, `device_info`, `created_at`, `updated_at` — all fields that exist on the `user_profiles` table. Normalized settings lose most of the profile data. Similar incomplete mapping as `supabase-utils.js` `toSupabaseUserProfile()`.

### 5.6 Scope Limitations

This module only covers **projects** and **user settings**. It does NOT handle:
- Reports (loading, saving, syncing)
- Photos (upload, sync, deletion)
- Interview data (drafts, backups)
- Report data (AI content, user edits)
- Archives

These are handled by `data-store.js` (Chunk 6) and individual page modules.

### 5.7 Summary Findings

- 🟢 **Clean IDB-first, Supabase-fallback pattern** for projects and user settings
- 🟢 **Atomic project refresh** — clears IDB before refilling
- 🔁 **Projects stored in 3 places** — Supabase + IDB + localStorage (legacy bridge)
- 🟡 **One-way user settings sync** — cloud→local only, no local→cloud from this module
- 🟡 **Normalizers drop fields** — timestamps, auth_user_id, role, org_id stripped during normalization
- 🟡 **IDB key mismatch risk** — userProfile keyed by deviceId but lookup uses authUserId sometimes
- 🟡 **Limited scope** — only projects + user settings, not a true "data layer" for all data

---

## 6. Data Store
*Status: ✅ Complete*

**File:** `js/shared/data-store.js` (762 lines)
**Global export:** `window.dataStore`
**Purpose:** Replacement/parallel implementation of `indexeddb-utils.js`. Provides the same IDB operations with a cleaner internal pattern (`_tx` helper), plus a legacy localStorage→IDB migration and cloud sync for reports.

### 6.1 Relationship to `indexeddb-utils.js`

🔁 **DUPLICATE:** This file is a **near-complete reimplementation** of `indexeddb-utils.js`:
- Same DB name (`fieldvoice-pro`), same version (7), same stores, same schemas
- Same upgrade logic in `_onUpgradeNeeded()` — identical store creation
- Both open the same IDB database and maintain their own connection handles (`_db` vs `db`)
- `indexeddb-utils.js` shims its exports to delegate to `dataStore` when available (see Chunk 4 §4.4)

**The two files coexist.** If `data-store.js` loads first, `indexeddb-utils.js` detects `window.dataStore` and redirects its functions to it. If `indexeddb-utils.js` loads first, it uses its own connection until `data-store.js` loads.

🔴 **BUG RISK:** Both files maintain separate IDB connection handles. If both load, there can be **two simultaneous connections** to the same database. This is generally safe for reads, but concurrent writes from different connection handles could cause transaction conflicts or unexpected `onblocked` events.

### 6.2 Internal Architecture

**Key difference from `indexeddb-utils.js`:** Uses a generic `_tx(storeName, mode, operation)` helper that handles all the boilerplate (open DB → create transaction → execute → resolve/reject). This is much DRYer than `indexeddb-utils.js` which repeats the full pattern in every function.

**Connection management differences from `indexeddb-utils.js`:**

| Feature | indexeddb-utils.js | data-store.js |
|---------|-------------------|---------------|
| Open timeout | 3,000ms | 8,000ms |
| Blocked retry | No | Yes (one retry after 500ms) |
| `onversionchange` handler | No | Yes (closes connection) |
| Leaked handle cleanup | No | Yes (closes if success fires after settlement) |
| Connection caching | Module-level `db` | Module-level `_db` + `_dbPromise` dedup |

🟢 **GOOD:** `data-store.js` has more robust connection handling — longer timeout, blocked retry, version change handling, leaked handle cleanup. It's the more mature implementation.

### 6.3 Legacy Migration (`_ensureLegacyMigration`)

On first run, migrates data from localStorage to IDB:

**What it migrates:**
1. `fvp_current_reports` (localStorage JSON) → `currentReports` IDB store
2. `fvp_report_{id}` keys (localStorage JSON) → `reportData` IDB store

**Migration guard:** `fvp_migration_v2_idb_data` localStorage flag — set to `'true'` after migration.

**Post-migration cleanup:** Removes the migrated localStorage keys.

🟢 **GOOD:** One-time migration with a guard flag. Cleans up after itself. Handles parse errors gracefully.

🟡 **ISSUE:** The migration flag key `fvp_migration_v2_idb_data` is NOT in the `STORAGE_KEYS` registry (Chunk 3). It's a "hidden" key.

🟡 **ISSUE:** During migration, `_normalizeReportDate()` is called on each report to ensure both `reportDate` and `report_date` exist — a compatibility hack for mixed naming conventions. This suggests consumer code uses both formats inconsistently.

### 6.4 Exported Functions

| Category | Function | Notes |
|----------|----------|-------|
| **Init** | `init()` | Opens DB + runs legacy migration |
| **Reset** | `reset()`, `closeAll()` | Closes connection, nulls handles |
| **Reports** | `getReport(id)`, `getAllReports()`, `saveReport(report)`, `deleteReport(id)`, `replaceAllReports(map)` | Returns Map from `getAllReports`, handles both Map and Object in `replaceAllReports` |
| **Report Data** | `getReportData(id)`, `saveReportData(id, data)`, `deleteReportData(id)` | Stores as `{reportId, data}` wrapper |
| **Draft Data** | `getDraftData(id)`, `saveDraftData(id, data)`, `deleteDraftData(id)` | Same wrapper pattern |
| **Projects** | `getProject(id)`, `getAllProjects()`, `saveProject(project)`, `deleteProject(id)` | |
| **Photos** | `getPhotosByReportId(id)`, `savePhoto(photo)`, `deletePhoto(id)`, `deletePhotosByReportId(id)` | Index-based queries for photos |
| **User Profile** | `getUserProfile(deviceId)`, `saveUserProfile(profile)` | |
| **Archives Cache** | `getCachedArchive(key)`, `saveCachedArchive(key, data)` | |
| **General** | `clearStore(name)` | |
| **Cloud Sync** | `syncReportsFromCloud()` | **The big one** — see §6.5 |

**Total: 26 functions** (vs 28 in `indexeddb-utils.js`)

### 6.5 `syncReportsFromCloud()` — Cloud ↔ Local Reconciliation

This is the **most complex function** in the storage layer. It reconciles Supabase reports with local IDB.

**Algorithm:**
1. Query Supabase: `SELECT id,status,project_id,report_date,created_at,updated_at,submitted_at,dashboard_dismissed_at FROM reports WHERE user_id = ? AND status != 'deleted'`
2. Build cloud map: `{id: report}`
3. Get local IDB reports via `getAllReports()`
4. Reconcile:
   - **Cloud has, local doesn't** → add to final set (unless in deleted blocklist)
   - **Both have, cloud newer** → merge cloud fields into local (preserves local-only fields)
   - **Both have, local newer** → keep local as-is
   - **Local has, cloud doesn't** → **KEEP** (assume offline-created, not yet pushed)
   - **In deleted blocklist** → remove
5. Write reconciled set via `replaceAllReports()`
6. **Fire-and-forget push** — local-only reports are upserted to Supabase in the background

**Data flow:**
```
Supabase reports (user_id filter)
        ↓
  ┌─────────────┐
  │  Reconciler  │← IDB currentReports
  └─────┬───────┘
        ↓
  IDB replaceAllReports (atomic clear + refill)
        │
        └─→ Fire-and-forget upsert of local-only reports → Supabase
```

🟢 **GOOD:** Preserves offline-created reports — doesn't delete them just because cloud doesn't have them yet.

🟢 **GOOD:** Fire-and-forget push of local-only reports — self-healing when device comes back online.

🟡 **ISSUE:** The query filters by `user_id` (from localStorage `STORAGE_KEYS.USER_ID`), NOT by `org_id`. If a user has reports across orgs, they'll all sync. This differs from `data-layer.js` which filters projects by `org_id`.

🟡 **ISSUE:** The sync only fetches **metadata columns** (id, status, project_id, report_date, timestamps). It does NOT sync report content (AI-generated, user edits). That's handled separately by `report_data` table access in other modules. This means the `currentReports` IDB store only has metadata — the actual content lives in `reportData` IDB store and `report_data` Supabase table.

🟡 **ISSUE:** The fire-and-forget push constructs a raw Supabase row manually (lines ~700-720) — it builds `{id, project_id, user_id, device_id, report_date, status, ...}` inline rather than using any converter function. This is a **third place** where report row construction happens (also in report creation and submission code).

🔁 **DUPLICATE:** The `org_id` fallback pattern appears again: `getStorageItem(STORAGE_KEYS.ORG_ID)` — same pattern as `supabase-utils.js`.

### 6.6 Key Differences in Data Wrapping

`data-store.js` wraps report data and draft data differently than `indexeddb-utils.js`:

| Store | indexeddb-utils.js storage | data-store.js storage |
|-------|--------------------------|----------------------|
| `reportData` | `{reportId, ...data, _idbSavedAt}` (flat merge) | `{reportId, data: {…}}` (nested wrapper) |
| `draftData` | `{reportId, ...data, _idbSavedAt}` (flat merge) | `{reportId, data: {…}}` (nested wrapper) |

🔴 **BUG:** The two modules store data in **different formats** for the same IDB stores. If `indexeddb-utils.js` writes a record with flat structure, then `data-store.js` reads it expecting `row.data`, it will get `undefined` and return the whole row as fallback (`row.data || row`). The fallback handles it, but writing back would re-wrap it. This format inconsistency could cause data nesting issues over time.

### 6.7 `_normalizeReportDate()` Helper

A small but important function that ensures both `reportDate` and `report_date` exist on a report object:
```js
if (!report.reportDate && report.report_date) report.reportDate = report.report_date;
if (!report.report_date && report.reportDate) report.report_date = report.reportDate;
```

Called on every report read/write. This is a **mutation** (modifies the object in-place) rather than a pure transform.

🟡 **ISSUE:** This dual-naming workaround suggests consumer code uses both `reportDate` and `report_date` inconsistently. Rather than normalizing at read time, the root cause is inconsistent naming conventions across modules.

### 6.8 Summary Findings

- 🔁 **Near-complete reimplementation** of `indexeddb-utils.js` — two parallel IDB access layers
- 🔴 **Data format mismatch** — `indexeddb-utils` uses flat merge, `data-store` uses nested `{reportId, data}` wrapper for reportData/draftData stores
- 🔴 **Dual connection handles** — both modules maintain separate `_db`/`db` refs to the same database
- 🟢 **Better connection handling** — longer timeout, blocked retry, version change handler
- 🟢 **Legacy migration** — one-time localStorage→IDB migration with cleanup
- 🟢 **Cloud sync** — smart reconciliation preserving offline-created reports
- 🟡 **Report sync is metadata-only** — actual content synced separately via `report_data`
- 🟡 **Hidden migration flag** — `fvp_migration_v2_idb_data` not in STORAGE_KEYS registry
- 🟡 **Manual row construction** in fire-and-forget push — no converter function used
- 🔁 **`org_id` fallback pattern** appears again (3rd occurrence)

---

## 7. Interview: persistence.js
*Status: ✅ Complete*

**File:** `js/interview/persistence.js` (1240 lines)
**Purpose:** Draft storage, autosave, cloud backup, and Supabase CRUD for the voice interview (field capture) page. This is the **most storage-intensive file** in the codebase.

### 7.1 Storage Operations Summary

| Operation | Storage Target | Function(s) |
|-----------|---------------|-------------|
| Save draft | IDB `currentReports` + IDB `draftData` | `saveToLocalStorage()` |
| Load draft | IDB `draftData` → Supabase `interview_backup` (freshness check) | `getReport()`, `loadDraftFromIDB()` |
| Clear draft | IDB `draftData` | `clearLocalStorageDraft()` |
| Update status | IDB `currentReports` | `updateLocalReportToRefined()` |
| Cloud backup | Supabase `interview_backup` | `flushInterviewBackup()` |
| Drain pending | localStorage stale flags → IDB → Supabase `interview_backup` | `drainPendingBackups()` |
| Save report | Supabase `reports` | `saveReportToSupabase()` |
| Upload photos | Supabase Storage `report-photos` + Supabase `photos` + IDB `photos` | `uploadPhotoToSupabase()`, `uploadPendingPhotos()` |
| Delete photos | Supabase Storage `report-photos` + Supabase `photos` | `deletePhotoFromSupabase()` |
| Cancel report | Calls `deleteReportFull()` (from shared/delete-report.js) | `confirmCancelReport()` |

### 7.2 Draft Save Flow (`saveToLocalStorage`)

Despite its name, this function **does NOT write to localStorage anymore** — it writes to IDB. The name is legacy.

```
saveToLocalStorage()
  │
  ├─ Build data blob from IS.report (in-memory interview state)
  │   └─ ~30 fields: meta, weather, freeform, guided sections, activities, operations,
  │      equipment, photos (metadata only), reporter, overview, entries, toggleStates
  │
  ├─ IDB currentReports: saveReport({id, project_id, project_name, reportDate, status, 
  │                                   capture_mode, created_at, _draft_data: data})
  │
  ├─ IDB draftData: saveDraftData(reportId, data)
  │
  └─ localStorage: set fvp_backup_stale_{reportId} = timestamp
```

🔁 **DUPLICATE:** Draft data is saved to **both** `currentReports` (as `_draft_data` nested field) AND `draftData` (as standalone record). Two IDB writes of the same data.

🟡 **ISSUE:** Function name `saveToLocalStorage` is misleading — writes to IDB, not localStorage. The only localStorage write is the stale backup flag.

### 7.3 Draft Load Flow (`getReport`)

Complex multi-source loading with freshness comparison:

```
getReport()
  │
  ├─ 1. IDB draftData: getDraftData(reportId)
  │
  ├─ 2. Supabase interview_backup: SELECT page_state, updated_at WHERE report_id = ?
  │     └─ 2s timeout with AbortController (don't block on slow networks)
  │
  ├─ 3. Compare timestamps: IDB lastSaved vs cloud updated_at
  │     ├─ Cloud newer → use cloud, cache back to IDB
  │     └─ IDB newer/same → use IDB
  │
  ├─ 4. Rehydrate photos from cloud (fetchCloudPhotos) — signed URLs
  │
  └─ 5. If nothing found → createFreshReport()
```

🟢 **GOOD:** Smart freshness comparison — picks the newer source between local IDB and cloud `interview_backup`. Handles timeout gracefully for slow networks.

🟢 **GOOD:** Caches cloud data back to IDB after fetch — ensures next offline load has fresh data.

🟢 **GOOD:** Photo rehydration — fetches fresh signed URLs from cloud even when using IDB data (signed URLs expire after 1 hour).

### 7.4 Autosave / Cloud Backup Pipeline

```
User types → saveReport() [debounce 500ms] → saveToLocalStorage() → IDB
                                                    ↓
                                            _markBackupStale(reportId) → localStorage flag
                                                    ↓
                                            markInterviewBackupDirty() [debounce 2s]
                                                    ↓
                                            flushInterviewBackup() → Supabase interview_backup
                                                    ↓
                                            _clearBackupStale(reportId) → remove localStorage flag
```

**Two-tier save:**
1. **Fast tier (500ms):** Save to IDB for crash recovery
2. **Slow tier (2s):** Sync to Supabase `interview_backup` for cross-device sync

**Stale backup mechanism:** localStorage flags (`fvp_backup_stale_{reportId}`) track when local is ahead of cloud. On page reload/online event, `drainPendingBackups()` scans for these flags and flushes any that survived a page kill.

🟢 **GOOD:** Belt-and-suspenders approach — IDB for local durability, Supabase for cross-device, stale flags for interrupted flushes.

🟡 **ISSUE:** The stale backup flag keys (`fvp_backup_stale_{reportId}`) are dynamic and NOT in the `STORAGE_KEYS` registry. They're created/destroyed dynamically per active report.

### 7.5 Supabase Tables Touched

| Table | Operations | Notes |
|-------|-----------|-------|
| `reports` | UPSERT (via `saveReportToSupabase`) | Creates/updates the main report record |
| `interview_backup` | UPSERT (via `flushInterviewBackup`, `drainPendingBackups`) | Full page state blob |
| `photos` | UPSERT, DELETE | Photo metadata records |
| `report-photos` (storage) | UPLOAD, REMOVE | Actual photo files |

### 7.6 `saveReportToSupabase()` — Manual Row Construction

Builds a raw Supabase row inline:
```js
{
    id: reportId,
    project_id: IS.activeProject.id,
    org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || IS.activeProject.orgId || null,
    user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
    device_id: getDeviceId(),
    report_date: todayStr,
    status: IS.report.meta?.status || 'draft',
    capture_mode: IS.report.meta?.captureMode || 'guided',
    updated_at: new Date().toISOString()
}
```

🔁 **DUPLICATE:** This is **manual row construction** — no converter function used. Same pattern seen in `data-store.js` `syncReportsFromCloud`. At least 3 places in the codebase construct report rows manually.

🔁 **DUPLICATE:** `org_id` fallback chain: `localStorage.getItem(STORAGE_KEYS.ORG_ID) || IS.activeProject.orgId` — 4th occurrence of the org_id fallback pattern.

### 7.7 Photo Upload Pipeline

```
uploadPhotoToSupabase(file, photoId)
  │
  ├─ Storage: upload to report-photos/{reportId}/{photoId}_{filename}
  │
  └─ Get signed URL (1hr expiry) — NOT public URL

uploadPendingPhotos()  [called on Submit]
  │
  ├─ IDB photos: getPhotosBySyncStatus('pending')
  │
  ├─ Filter to current report
  │
  ├─ For each: convert base64 → blob → upload → get signed URL
  │
  ├─ Supabase photos: UPSERT metadata (id, report_id, org_id, storage_path, etc.)
  │
  ├─ IDB photos: update syncStatus='synced', clear base64
  │
  └─ Update IS.report.photos[] in-memory with new URLs
```

🟡 **ISSUE:** Signed URLs have 1-hour expiry, but photo metadata (with signed URL) is saved to IDB `photos` store. After 1 hour, the cached URL is stale. The code has a comment acknowledging this: *"Future consideration: implement a URL refresh mechanism."*

🟢 **GOOD:** Clears `base64` from IDB after upload — prevents bloat. The IDB `photos` store only keeps metadata + storage path after sync.

### 7.8 `_buildCanonicalPageStateFromDraft` — Format Bridge

Converts draft data (from IDB `draftData` format) to the `interview_backup.page_state` schema. This is needed because the two stores use slightly different field layouts:
- Draft data uses flat field names (`safetyNoIncidents`, `issuesNotes`, `communications`)
- Page state uses nested objects (`safety.noIncidents`, `generalIssues`, `contractorCommunications`)

🔁 **DUPLICATE:** The field mapping in this function duplicates the mapping in `applyDraftToReport()` and `restoreFromLocalStorage()`. Three functions that all map the same fields with slight format differences.

### 7.9 Auto-Save for Textareas

`initGuidedAutoSave()` and `initContractorWorkAutoSave()` attach input listeners to textareas with:
- 500ms debounce on typing
- Creates entry object on first keystroke
- Updates entry on subsequent keystrokes
- Safety-net save on blur

These create `IS.report.entries[]` items which then flow through `saveReport()` → `saveToLocalStorage()` → IDB.

### 7.10 Summary Findings

- 🔁 **Draft saved to 2 IDB stores simultaneously** — `currentReports` (with `_draft_data`) and `draftData`
- 🔁 **3 functions with duplicate field mapping** — `_buildCanonicalPageStateFromDraft`, `applyDraftToReport`, `restoreFromLocalStorage`
- 🔁 **Manual Supabase row construction** — no converter used, 4th org_id fallback occurrence
- 🟢 **Excellent crash recovery** — two-tier save (IDB 500ms + Supabase 2s) with stale flag drain
- 🟢 **Smart freshness comparison** — compares IDB vs cloud timestamps, picks newer
- 🟢 **Photo base64 cleanup** — clears blobs from IDB after cloud upload
- 🟡 **Misleading function name** — `saveToLocalStorage` writes to IDB
- 🟡 **Signed URLs expire** — cached in IDB with 1hr TTL, no refresh mechanism
- 🟡 **Dynamic localStorage keys** — `fvp_backup_stale_{id}` not in STORAGE_KEYS registry

---

## 8. Interview: photos.js + finish-processing.js
*Status: ✅ Complete*

### File: `js/interview/photos.js` (~346 lines)

#### Storage Operations

**IndexedDB — Photos store (via `window.idb`)**
- `savePhotoToIndexedDB(photo, base64Data)` — Saves photo record with fields: `id`, `reportId`, `base64`, `url`, `storagePath`, `caption`, `gps`, `timestamp`, `fileName`, `syncStatus`, `createdAt`
- `window.idb.getPhoto(photoId)` — Read photo by ID (used during upload and caption updates)
- `window.idb.savePhoto(record)` — Update photo record (caption changes, upload status, clear base64 after upload)
- `window.idb.deletePhoto(photoId)` — Delete photo from IDB (on remove, after 3.5s undo window)

**Supabase Storage — Photo file upload**
- `uploadPhotoToSupabase(blob, photoId, fileName)` — Upload compressed blob to Supabase Storage bucket
- `deletePhotoFromSupabase(photoId, storagePath)` — Delete from Supabase Storage on photo removal

**Supabase Table — `photos`**
- `backgroundUploadPhoto()` upserts to `photos` table with fields: `id`, `report_id`, `org_id`, `storage_path`, `photo_url`, `caption`, `filename`, `location_lat`, `location_lng`, `taken_at`, `created_at` (onConflict: `id`)

**In-memory state — `IS.report.photos[]`**
- Metadata-only objects (NO base64) with fields: `id`, `url`, `storagePath`, `uploadStatus`, `caption`, `timestamp`, `date`, `time`, `gps`, `fileName`, `fileSize`, `fileType`
- 🟢 **GOOD** — base64 stored ONLY in IndexedDB, never in `IS.report.photos[]` or localStorage (OFF-01 pattern)

**localStorage (indirect)**
- `saveReport()` called after photo add/remove/caption — persists `IS.report` (including `photos[]` metadata) to localStorage
- `localStorage.getItem(STORAGE_KEYS.ORG_ID)` — read org_id for Supabase upserts

#### Photo Lifecycle
1. Capture → compress → optional markup → metadata to `IS.report.photos[]`, base64 to IDB only
2. Background upload to Supabase Storage (non-blocking)
3. On success: update `storagePath`/`url` in both `IS.report` and IDB, clear IDB `base64`, upsert `photos` table
4. On failure: `uploadStatus = 'failed'`, base64 preserved in IDB for retry at FINISH
5. Remove: splice from `IS.report.photos[]`, 3.5s undo window, then delete from IDB + Supabase Storage

#### Markers
- 🟢 **GOOD** — Clean separation: base64 in IDB only, metadata in memory/localStorage (OFF-01)
- 🟢 **GOOD** — Background upload is non-blocking, doesn't freeze UI
- 🟢 **GOOD** — Undo pattern on photo removal (3.5s window before permanent delete)
- 🟡 **ISSUE** — `backgroundUploadPhoto` upserts to `photos` table but does NOT check for errors before marking upload complete. If table upsert fails but Storage upload succeeded, metadata is lost in cloud
- 🟡 **ISSUE** — `deletePhotoFromSupabase` called on remove but no cleanup of `photos` table row — orphan metadata remains in Supabase

---

### File: `js/interview/finish-processing.js` (~612 lines)

#### Storage Operations

**localStorage reads**
- `localStorage.getItem(STORAGE_KEYS.ORG_ID)` — org_id for Supabase writes (used in `saveAIResponse` and finish flow)

**Supabase Table — `ai_submissions`**
- `saveAIResponse(originalPayload, response, processingTimeMs)` — Upserts to `ai_submissions` with fields: `report_id`, `org_id`, `original_input`, `ai_response`, `model_used` (hardcoded `'n8n-fieldvoice-refine'`), `processing_time_ms`, `submitted_at` (onConflict: `report_id`)

**Supabase Table — `report_data`**
- Finish flow upserts `report_data` with fields: `report_id`, `org_id`, `ai_generated`, `original_input`, `user_edits` (empty `{}`), `capture_mode`, `status` (onConflict: `report_id`)
- Uses `supabaseRetry()` with 3 retries and 5s timeout via `Promise.race`

**Supabase Table — `reports` (indirect)**
- `saveReportToSupabase()` called during preProcess steps (defined elsewhere)

**IndexedDB — via `window.dataStore`**
- `window.dataStore.saveReportData(reportId, reportDataPackage)` — Saves complete report package (AI response + original input + metadata) to IDB `reportData` store
- `window.dataStore.getReportData(reportId)` — Verification read after save to ensure data persists
- `window.dataStore.saveReport(metadata)` — Updates report metadata in IDB `currentReports` store with `status: 'refined'`
- `window.dataStore.closeAll()` — Closes IDB connections before navigation to prevent iOS Safari upgrade blocking (bfcache issue)

**In-memory state**
- `IS.report.aiGenerated` — Set from webhook response
- `IS.report.meta.status` — Set to `'refined'` on success, `'pending_refine'` on offline
- `IS.report.meta.interviewCompleted` — Set to `true`
- `IS.report.overview.endTime` — Set to current time
- `IS.report.guidedNotes` — Compiled from structured data for AI processing
- `IS.report.safety.notes` — Default added if empty

**External — n8n webhook**
- `N8N_PROCESS_WEBHOOK` = `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report`
- `buildProcessPayload()` aggregates from: `IS.report` (meta, overview, photos, freeform_entries, guidedNotes, operations, equipmentRows, activities, safety, entries, toggleStates) + `IS.activeProject` (project config)
- 60s timeout via AbortController

#### Finish Flow (both modes)
1. Confirmation dialog → offline check
2. Mode-specific validation (minimal: ≥1 entry; guided: contractor work + safety answered)
3. Mode-specific prep (set endTime, guided notes compilation)
4. Mode-specific preProcess:
   - **Minimal:** Save to Supabase → upload pending photos
   - **Guided:** Upload pending photos → save to Supabase
5. Build payload → call n8n webhook
6. Save AI submission to `ai_submissions` table
7. Save AI response to `IS.report.aiGenerated`
8. Build `reportDataPackage` → save to IDB `reportData` store
9. Upsert `report_data` table (with retry + timeout)
10. Update IDB `currentReports` metadata (status: refined)
11. Verify IDB save → redirect to `report.html`

#### Offline Handling (Sprint 15)
- `handleOfflineProcessing()` — Sets `IS.report.meta.status = 'pending_refine'`, calls `saveReport()` (localStorage), redirects to index
- 🟢 **GOOD** — Dead sync queue removed (Sprint 15 OFF-02), clean manual-retry pattern

#### Markers
- 🟢 **GOOD** — Dual-write to both IDB and Supabase `report_data` with verification
- 🟢 **GOOD** — `supabaseRetry` with bounded timeout prevents indefinite hangs
- 🟢 **GOOD** — IDB connections closed before navigation (iOS Safari bfcache fix)
- 🟡 **ISSUE** — `reportDataPackage` saved to IDB but also implicitly in localStorage via earlier `saveReport()` calls — the localStorage copy includes `IS.report.aiGenerated` (potentially large AI response) which could bloat localStorage
- 🟡 **ISSUE** — Guided mode `preProcess` order (photos first, then Supabase save) means if photo upload succeeds but Supabase save fails, photo URLs in Supabase Storage have no matching report record
- 🟠 **MAYBE** — `buildProcessPayload()` sends `IS.report.photos[].url` to n8n — if photos haven't uploaded yet (status: pending/failed), these are base64 data URLs being sent to the webhook, potentially very large payloads
- 🔵 **IMPROVEMENT** — `saveAIResponse` and the `report_data` upsert in finishReportFlow are redundant writes — both store `ai_generated` and `original_input` to separate tables (`ai_submissions` vs `report_data`)

---

## 9. Interview: freeform + guided-sections + state-mgmt + main (George)
*Status: ✅ Complete*

### File: `js/interview/freeform.js` (~517 lines)

#### Storage Operations

**In-memory state — `IS.report`**
- `IS.report.freeform_entries[]` — Array of entry objects: `id` (UUID), `content`, `created_at`, `updated_at`, `synced`
- `IS.report.freeform_checklist{}` — Map of checklist items → boolean (visual only, no validation impact)
- `IS.report.fieldNotes.freeformNotes` — Legacy single-string field (migrated to entries array)
- `IS.report.photos[]` — Photo metadata (same pattern as photos.js)

**localStorage (indirect via `saveReport()`)**
- Called after: add entry, edit entry (debounced 500ms + blur), delete entry, checklist toggle, photo add/remove/caption
- `migrateFreeformNotesToEntries()` — One-time migration from `IS.report.fieldNotes.freeformNotes` string → `freeform_entries[]` array, then clears old field

**IndexedDB — via `window.idb`**
- `savePhotoToIndexedDB(photoObj)` — Photo saved to IDB (same as photos.js)
- `window.idb.deletePhoto(removedPhoto.id)` — Photo deleted from IDB on remove

**Supabase Storage**
- `backgroundUploadPhoto(photoObj, finalDataUrl)` — Background upload (same pattern as photos.js)
- `deletePhotoFromSupabase(photoId, storagePath)` — Delete on photo removal

#### Markers
- 🟢 **GOOD** — Migration pattern from legacy string to entries array is clean and one-time
- 🟢 **GOOD** — Auto-save with 500ms debounce + blur safety net prevents data loss
- 🟡 **ISSUE** — `handleMinimalPhotoInput` sets `photoObj.base64 = finalDataUrl` directly on the metadata object (line ~430), unlike `handlePhotoInput` in photos.js which keeps base64 OUT of the metadata. This means minimal-mode photos have base64 in `IS.report.photos[]` → saved to localStorage via `saveReport()`, risking quota exhaustion
- 🔁 **DUPLICATE** — `handleMinimalPhotoInput` is nearly identical to `handlePhotoInput` in photos.js but with the base64 leak bug. Also `deleteMinimalPhoto` duplicates `removePhoto` logic
- 🔁 **DUPLICATE** — `renderMinimalPhotos` and `renderSection('photos')` in guided-sections.js are independent photo renderers with duplicated upload indicator logic

---

### File: `js/interview/guided-sections.js` (~409 lines)

#### Storage Operations

**In-memory state reads**
- `IS.report.photos[]` — Renders photo grid (guided mode)
- `IS.report.generalIssues[]` — Legacy issues array (backward compat)
- `IS.report.qaqcNotes[]` — QA/QC notes array
- `IS.report.safety` — Safety state (hasIncidents, noIncidents, notes)
- `IS.report.entries[]` — v6 entry-based notes (via `getEntriesForSection()`)
- `IS.report.toggleStates` — Toggle states for sections
- `IS.report.overview.weather` — Weather data display

**localStorage reads**
- `STORAGE_KEYS.DICTATION_HINT_DISMISSED` — Read/write to track if hint banner was dismissed

**localStorage writes (indirect)**
- `saveReport()` called after section toggles, entry edits, photo operations

#### Section Rendering Map
| Section | Data Source | Entry-based? | Legacy compat? |
|---------|-----------|-------------|----------------|
| activities | `renderContractorWorkCards()` | N/A (contractor-specific) | No |
| personnel/operations | `renderPersonnelCards()` | N/A | No |
| equipment | `renderEquipmentSection()` | N/A | No |
| issues | `IS.report.entries[]` + `IS.report.generalIssues[]` | ✅ | ✅ |
| communications | `IS.report.entries[]` | ✅ | No |
| qaqc | `IS.report.entries[]` + `IS.report.qaqcNotes[]` | ✅ | ✅ |
| safety | `IS.report.entries[]` + `IS.report.safety.notes[]` | ✅ | ✅ |
| visitors | `IS.report.entries[]` | ✅ | No |
| photos | `IS.report.photos[]` | No | No |

#### Markers
- 🟢 **GOOD** — Sections with toggles (communications, qaqc, visitors) use N/A pattern with locked toggles
- 🟢 **GOOD** — iOS Safari fix: textareas always in DOM, toggle controls visibility only (prevents keyboard issues)
- 🟡 **ISSUE** — Three sections (issues, qaqc, safety) render BOTH entry-based and legacy arrays side by side. If both exist, user sees duplicates but with different edit/delete APIs
- 🔵 **IMPROVEMENT** — `renderSection` is a 400-line switch statement that could be refactored into per-section render functions

---

### File: `js/interview/state-mgmt.js` (~362 lines)

#### Storage Operations

**In-memory state — `window.interviewState` (IS)**
- Defines the global state object with fields: `currentSection`, `report`, `currentReportId`, `permissionsChecked`, `activeProject`, `projectContractors`, `userSettings`, `autoSaveState`, device detection flags
- `IS.report.entries[]` — Entry CRUD operations (create, read, update, soft-delete)
- `IS.report.toggleStates{}` — Toggle state management (Yes/No/null per section)
- `IS.report.meta.naMarked{}` — N/A marking per section

**Entry Schema**
```
{
  id: "entry_{timestamp}_{random}",
  section: string,
  content: string,
  timestamp: ISO string,
  entry_order: number,
  is_deleted: boolean (soft delete)
}
```

**localStorage writes (indirect)**
- `saveReport()` called after: createEntry, updateEntry, deleteEntryById, setToggleState, markNA, clearNA

**localStorage reads/writes (direct)**
- `markNA` / `clearNA` — Modifies `IS.report.meta.naMarked` then `saveReport()`

#### Markers
- 🟢 **GOOD** — Soft delete pattern (`is_deleted: true`) preserves data for sync/audit
- 🟢 **GOOD** — Toggle locking prevents accidental changes after commitment
- 🟡 **ISSUE** — Entry IDs use `Date.now()` + random string, not UUIDs. Different from photo IDs (`crypto.randomUUID()`). Inconsistent ID strategy across the app
- 🟡 **ISSUE** — `getEntriesForSection` filters `is_deleted` entries on every render call but they're never actually removed from the array — grows unbounded over time
- 🔵 **IMPROVEMENT** — `startEditEntry` auto-save debounce (500ms) + `saveEditEntry` both call `saveReport()`. The save-on-blur from the textarea and the explicit save button can double-save

---

### File: `js/interview/main.js` (~342 lines)

#### Storage Operations

**localStorage reads**
- `STORAGE_KEYS.MIC_GRANTED` — Microphone permission status
- `STORAGE_KEYS.LOC_GRANTED` — Location permission status
- `STORAGE_KEYS.PERMISSIONS_DISMISSED` — Permissions modal dismissed flag
- `STORAGE_KEYS.ACTIVE_REPORT_ID` — Written after report ID established

**localStorage writes**
- `STORAGE_KEYS.MIC_GRANTED` = `'true'` — After successful mic test
- `STORAGE_KEYS.ACTIVE_REPORT_ID` — Set to `IS.currentReportId`
- `saveToLocalStorage()` — Emergency save on visibilitychange/pagehide

**IndexedDB — via `window.dataStore`**
- `window.dataStore.init()` — Initialize IDB on DOMContentLoaded
- `window.dataStore.getReport(reportId)` — Read report metadata for project_id lookup
- `window.dataStore.closeAll()` — Close IDB on pagehide (iOS Safari bfcache fix)
- `loadDraftFromIDB()` — Recover draft from IDB if localStorage miss

**Supabase reads (via `window.dataLayer`)**
- `window.dataLayer.loadUserSettings()` — Load user settings
- `window.dataLayer.loadProjectById(projectId)` — Load project config

**URL parameters**
- `?reportId=` — Report ID passed from index.js
- `?projectId=` — Project ID passed from report-creation.js

**Other**
- `cacheLocation(lat, lng)` — Cache GPS coords after permission grant
- `fetchWeather()` — Fetch weather data (stores in `IS.report.overview.weather`)
- `flushInterviewBackup()` — Emergency backup on page hide
- `drainPendingBackups()` — Drain pending backups on pageshow/online events
- `initRealtimeSync()` — Start Supabase Realtime subscriptions
- `checkReportState()` — Blocks editing of refined/submitted reports (redirects away)

#### Init Flow (DOMContentLoaded)
1. `window.dataStore.init()` → Initialize IDB
2. `checkReportState()` → Redirect if refined/submitted
3. `window.dataLayer.loadUserSettings()` → Supabase user settings
4. `getReport()` → Load report (localStorage → IDB → Supabase → fresh)
5. Read `?reportId` from URL → set `IS.currentReportId`
6. `loadDraftFromIDB()` → Recovery fallback
7. Load project by ID (URL param → IDB metadata → null)
8. Auto-populate project info + reporter name
9. Show mode selection or jump to saved mode
10. `fetchWeather()` → Background weather fetch
11. `initRealtimeSync()` → Start real-time subscriptions
12. `drainPendingBackups()` → Flush any pending IDB backups

#### Hardening Event Handlers
| Event | Action |
|-------|--------|
| `visibilitychange → hidden` | `saveToLocalStorage()` + `flushInterviewBackup()` |
| `pagehide` | `saveToLocalStorage()` + `flushInterviewBackup()` + `dataStore.closeAll()` |
| `pageshow` (bfcache) | `drainPendingBackups()` |
| `online` | `drainPendingBackups()` |

#### Markers
- 🟢 **GOOD** — Comprehensive lifecycle handling (visibilitychange, pagehide, pageshow, online)
- 🟢 **GOOD** — State protection blocks editing of already-refined reports
- 🟢 **GOOD** — Multi-source draft recovery chain (localStorage → IDB → Supabase)
- 🟡 **ISSUE** — `IS.currentReportId` is set in multiple places: `getReport()`, URL param override, and fallback `generateId()`. Order-dependent logic that could produce mismatched IDs if `getReport()` created a report with one ID but URL provides a different one
- 🟡 **ISSUE** — `STORAGE_KEYS.ACTIVE_REPORT_ID` written via `setStorageItem` but the comment says "index.js always passes ?reportId" — redundant key that other pages might read stale values from
- 🟠 **MAYBE** — Permission flags (`MIC_GRANTED`, `LOC_GRANTED`) stored in localStorage survive across reports. If user revokes permission in OS settings, the app still shows "Verified Working"

---

## 10. Interview: contractors-personnel + equipment-manual + ui-flow + ui-display (George)
*Status: ✅ Complete*

### File: `js/interview/contractors-personnel.js` (~752 lines)

#### Storage Operations

**In-memory state — `IS.report`**
- `IS.report.activities[]` — Contractor activity entries: `{ contractorId, noWork, [crewId] }`. Initialized per contractor/crew on render.
- `IS.report.operations[]` — Personnel counts per contractor: `{ contractorId, superintendents, foremen, operators, laborers, surveyors, others }`
- `IS.report.entries[]` — Work entries stored via `createEntry()` with section keys:
  - `work_{contractorId}` — Contractor-level work entries (no crews)
  - `work_{contractorId}_crew_{crewId}` — Crew-level work entries
- `IS.autoSaveState[stateKey]` — Tracks auto-save state to prevent duplicate entries when user clicks "+" after auto-save

**localStorage (indirect via `saveReport()`)**
- Called after: toggleNoWork, toggleCrewNoWork, addContractorWorkEntry, deleteContractorWorkEntry, updateOperations

**Auto-save integration**
- `initContractorWorkAutoSave(contractorId, crewId?)` — Called per contractor/crew textarea after render
- `IS.autoSaveState[key].saved` flag prevents duplicate entry creation when both auto-save and manual "+" trigger

#### Data Flow: Contractors
1. `IS.projectContractors[]` loaded from `IS.activeProject.contractors` (project config)
2. `initializeContractorActivities()` ensures each contractor has an activity entry
3. Work entries use section-based entry system (`createEntry('work_{id}', text)`)
4. Crews: each crew gets separate activity tracking AND separate entry section

#### Data Flow: Personnel
1. `initializeOperations()` ensures each contractor has an operations entry
2. Input fields (6 roles × N contractors) → `updateOperations()` → `saveReport()`
3. `updatePersonnelTotals()` sums across all contractors for display

#### Markers
- 🟢 **GOOD** — Clean crew support: each crew gets independent work entries and noWork tracking
- 🟢 **GOOD** — Auto-save state tracking prevents duplicate entries
- 🟡 **ISSUE** — `initializeContractorActivities()` always sets `noWork: true` for new contractors. If a contractor is added to the project mid-day, they show as "no work" by default — could be confusing
- 🟡 **ISSUE** — Personnel operations data uses `null` for empty fields, but equipment uses `''` — inconsistent empty-value representation
- 🔁 **DUPLICATE** — `addIssue()`, `addSafetyNote()`, `addCommunication()`, `addQAQC()`, `addVisitor()` in equipment-manual.js are nearly identical functions with only the section name and input ID differing

---

### File: `js/interview/equipment-manual.js` (~294 lines)

#### Storage Operations

**In-memory state — `IS.report`**
- `IS.report.equipmentRows[]` — Equipment entries: `{ id, contractorId, type, qty, status, timestamp }`
  - IDs use `eq_{Date.now()}_{random}` format (not UUID)

**localStorage (indirect via `saveReport()`)**
- Called after: addEquipmentRow, updateEquipmentRow, deleteEquipmentRow

**Legacy arrays (backward compat, in manual-adds section)**
- `IS.report.generalIssues[]` — Legacy issues array, `removeIssue()` splices directly
- `IS.report.qaqcNotes[]` — Legacy QA/QC array, `removeInspection()` splices directly
- `IS.report.safety.notes[]` — Legacy safety notes, `removeSafetyNote()` splices directly

#### Markers
- 🟢 **GOOD** — Equipment row CRUD is clean with immediate re-render
- 🟡 **ISSUE** — Equipment row IDs (`eq_{timestamp}_{random}`) don't match entry IDs (`entry_{timestamp}_{random}`) or photo IDs (UUID) — three different ID strategies
- 🔁 **DUPLICATE** — Five nearly identical `add*()` functions (addIssue, addSafetyNote, addCommunication, addQAQC, addVisitor) that all follow the same pattern: check auto-save state → create entry → render → clear input. Could be a single `addEntryForSection(section, inputId)` function

---

### File: `js/interview/ui-flow.js` (~373 lines)

#### Storage Operations

**In-memory state reads**
- `IS.report.meta.captureMode` — Determines which UI to show (minimal vs guided)
- `IS.report.photos`, `IS.report.activities`, `IS.report.generalIssues`, `IS.report.additionalNotes`, `IS.report.fieldNotes`, `IS.report.freeform_entries`, `IS.report.reporter` — Checked in `shouldShowModeSelection()` to detect if report has data

**localStorage (indirect via `saveReport()`)**
- Called after: `selectCaptureMode()`, `confirmSwitchMode()`

**Mode switch data preservation**
- Minimal → Guided: Combines `freeform_entries[]` + legacy `fieldNotes.freeformNotes` into `IS.report.additionalNotes`
- Photos and weather are preserved across mode switches (shared state)

**No direct storage operations in processing overlay section** — purely UI display logic

#### Markers
- 🟢 **GOOD** — Data preservation on mode switch prevents loss
- 🟢 **GOOD** — Processing overlay blocks ALL input (keyboard, touch, click, back button) during AI processing
- 🟡 **ISSUE** — `confirmSwitchMode()` only handles minimal→guided data migration. Guided→minimal doesn't migrate structured entries (activities, contractors) back to freeform — potential data loss if user switches back

---

### File: `js/interview/ui-display.js` (~264 lines)

#### Storage Operations

**External API**
- `fetchWeather()` — Calls Open-Meteo API with GPS coords, writes to `IS.report.overview.weather`
  - Fields: `highTemp`, `lowTemp`, `precipitation`, `generalCondition`, `jobSiteCondition`, `adverseConditions`
  - `saveReport()` called after weather fetch
  - `getFreshLocation()` — Gets GPS coords (from `media-utils.js`)

**In-memory state reads (all preview/progress functions)**
- `IS.report.overview.weather` — Weather display
- `IS.report.meta.naMarked{}` — N/A markers per section
- `IS.report.activities[]` — Contractor activities
- `IS.report.operations[]` — Personnel operations
- `IS.report.equipmentRows[]` — Equipment data
- `IS.report.generalIssues[]` — Legacy issues
- `IS.report.safety` — Safety state
- `IS.report.photos[]` — Photo count
- `IS.report.toggleStates` — Section toggle states
- `IS.report.entries[]` — Entry-based notes (via `getEntriesForSection()`)
- `IS.projectContractors[]` — Contractor list for work summary checks

**No direct localStorage/IDB/Supabase writes** (except `saveReport()` after weather fetch)

#### Progress Tracking
- 10 sections total in guided mode
- Each section: weather, activities, personnel, equipment, issues, communications, qaqc, safety, visitors, photos
- Completion checks vary: some use toggles, some use entry counts, some use legacy arrays + N/A marks

#### Markers
- 🟢 **GOOD** — Weather fetched from Open-Meteo (free, no API key needed)
- 🟢 **GOOD** — `updateAllPreviews()` and `updateProgress()` are centralized — single source of truth for UI state
- 🟡 **ISSUE** — `updateStatusIcons()` directly accesses `IS.report.generalIssues` without null check — would throw if undefined
- 🔵 **IMPROVEMENT** — Preview logic duplicates completion checks that also exist in `updateProgress()` — could be unified

---

## 11. Report: data-loading + autosave + submit + main + delete-report (George)
*Status: ✅ Complete*

### File: `js/report/data-loading.js` (~406 lines)

#### Storage Operations

**Shared state — `window.reportState` (RS)**
- Defines the global state object: `report`, `currentReportId`, `activeProject`, `projectContractors`, `userEdits`, `userSettings`, `saveTimeout`, `isSaving`, `isReadonly`, `currentTab`

**IndexedDB — via `window.dataStore`**
- `window.dataStore.getReportData(reportId)` — Primary load source (IDB-first)
- `window.dataStore.saveReportData(reportId, data)` — Cache cloud data back to IDB after freshness check

**Supabase Table — `report_data`**
- Freshness check: `SELECT * FROM report_data WHERE report_id = ?` (with 2s abort timeout)
- Compares `updated_at` (cloud) vs `lastSaved` (IDB) timestamps
- If cloud is newer: merges `ai_generated`, `original_input`, `user_edits`, `capture_mode`, `status` into reportData
- If cloud has missing fields (ai_generated, original_input), falls back to IDB values (defensive merge)

**Supabase Table — `reports`**
- `SELECT report_date FROM reports WHERE id = ?` — Fetches report date for display

**Supabase — `fetchCloudPhotos(reportId)`**
- Sprint 15: Cross-device photo rehydration from `photos` table when local photos are empty
- Caches rehydrated photos back to IDB `originalInput.photos`

**localStorage reads**
- `STORAGE_KEYS.ACTIVE_REPORT_ID` — Written after report ID established

**URL parameters**
- `?reportId=` — Required, redirects to index.html if missing
- `?date=` — Report date (fallback to `getLocalDateString()`)

#### Load Flow
1. Read `?reportId` from URL → if missing, redirect to index.html
2. `dataStore.getReportData(reportId)` → IDB-first load
3. If online: freshness check against `report_data` table (2s timeout)
4. If cloud is newer → merge + cache to IDB; else keep IDB
5. If no data anywhere → check IDB metadata for `pending_refine`/`draft` status → redirect to interview
6. If still nothing → show error, redirect to index.html
7. Assemble `loadedReport` from `createFreshReport()` + loaded data
8. Rehydrate photos from cloud if local photos empty

#### Data Merge Helpers
- `getValue(path, default)` — Priority: userEdits → aiGenerated → report fields → default
- `getAIValue(path, default)` — AI-only value lookup
- `getTextFieldValue(reportPath, aiPath, default, legacyAiPath)` — Priority: userEdits → AI (with legacy path fallback) → report → default
- `setNestedValue(obj, path, value)` — Dot-path setter for nested objects

#### Markers
- 🟢 **GOOD** — IDB-first with cloud freshness check is the right pattern for offline-capable apps
- 🟢 **GOOD** — 2s abort timeout on cloud check prevents hanging on slow networks
- 🟢 **GOOD** — Defensive merge: if cloud `ai_generated` is null but IDB has it, keeps IDB version
- 🟡 **ISSUE** — `report_backup` table removed (Sprint 13) but the fallback comment references it as deprecated — dead code path cleanup needed
- 🟡 **ISSUE** — `setStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID, reportIdParam)` still written in loadReport — this localStorage key is read by other pages and could be stale if multiple reports are opened
- 🟠 **MAYBE** — Photo rehydration caches back to IDB `originalInput.photos` but doesn't update the in-memory `reportData` object used for form display — could cause stale photos on first load

---

### File: `js/report/autosave.js` (~332 lines)

#### Storage Operations

**IndexedDB — via `window.dataStore`**
- `window.dataStore.getReportData(reportId)` — Read existing data before merge-save
- `window.dataStore.saveReportData(reportId, data)` — Primary save target for report edits
- `window.dataStore.saveReport(metadata)` — Update report metadata (id, project_id, status, etc.)

**Supabase Table — `report_data`**
- `flushReportBackup()` — Upserts `user_edits` + `status` to `report_data` (5s debounce)
- Uses `supabaseRetry()` with 3 retries
- Fields written: `report_id`, `org_id`, `user_edits`, `status`, `updated_at`

**Supabase Table — `reports`**
- `saveReportToSupabase()` — Upserts full report record: `id`, `project_id`, `org_id`, `user_id`, `device_id`, `report_date`, `status`, `capture_mode`, `updated_at`

**localStorage reads**
- `STORAGE_KEYS.ORG_ID` — org_id for Supabase writes
- `STORAGE_KEYS.USER_ID` — user_id for Supabase writes

**BroadcastChannel**
- `window.fvpBroadcast.send({ type: 'report-updated', id })` — Notifies other tabs that report was updated

**In-memory state**
- `RS.userEdits[path]` — Tracks all user field edits (keyed by dot-path)
- `RS.report.userEdits` — Copy of userEdits on the report object
- `_reportBackupDirty` / `_reportBackupTimer` — Debounce state for Supabase sync
- `_reportSaveQueue` — Promise chain serializing IDB writes
- `_deferredUpdates` — Field update queue for sync (applied on blur, not during typing)

#### Auto-save Architecture
```
User types → input event → update RS.userEdits + RS.report → scheduleSave() (500ms debounce)
                                                                    ↓
                                                              saveReport()
                                                              ↙         ↘
                                                saveReportToLocalStorage()   markReportBackupDirty()
                                                   (IDB immediate)           (5s debounce → Supabase)
```

#### Field Mappings (26 fields auto-saved)
- Overview: projectName, noabProjectNo, cnoSolicitationNo, projectLocation, reportDate, contractDay, weatherDaysCount, engineer, contractor, startTime, endTime, completedBy
- Weather: weatherHigh, weatherLow, weatherPrecip, weatherCondition, weatherJobSite, weatherAdverse
- Content: issuesText, qaqcText, safetyText, communicationsText, visitorsText
- Signature: signatureName, signatureTitle, signatureCompany

#### Markers
- 🟢 **GOOD** — Two-tier save: fast IDB + debounced Supabase is the right offline-first pattern
- 🟢 **GOOD** — Promise queue (`_reportSaveQueue`) serializes IDB writes preventing race conditions
- 🟢 **GOOD** — `_deferFieldUpdate` defers sync updates to blur, preventing typing disruption
- 🟢 **GOOD** — `saveReportToSupabase` has `silent` option to prevent sync broadcast loops
- 🟡 **ISSUE** — `saveReportToLocalStorage()` name is misleading — it actually saves to IndexedDB, not localStorage
- 🟡 **ISSUE** — `flushReportBackup()` only writes `user_edits` and `status` to `report_data` — does NOT write `ai_generated` or `original_input`, so if IDB is lost, those fields are not recoverable from autosave alone
- 🔵 **IMPROVEMENT** — BroadcastChannel notification (`report-updated`) sent on IDB save but no handler found in autosave.js — likely consumed elsewhere

---

### File: `js/report/submit.js` (~321 lines)

#### Storage Operations

**Supabase Table — `reports`**
- Duplicate check: `SELECT id FROM reports WHERE project_id = ? AND report_date = ? AND status = 'submitted' AND id != ?`
- `ensureReportExists()` — Upserts full report row (id, project_id, org_id, device_id, user_id, report_date, status, capture_mode, created_at, updated_at)
- `saveSubmittedReportData(pdfUrl)` — Updates `pdf_url`, `inspector_name`, `submitted_at`
- `updateReportStatus('submitted')` — Sets `status`, `submitted_at`, `updated_at`

**Supabase Storage — `report-pdfs` bucket**
- `uploadPDFToStorage(pdf)` — Uploads PDF blob to `{reportId}/{filename}` path, upsert mode
- Creates signed URL (1hr expiry) for the uploaded PDF (SEC-03)

**IndexedDB — via `window.dataStore`**
- `window.dataStore.getReportData(reportId)` — Read for captureMode/createdAt in `ensureReportExists`
- `window.dataStore.deleteReportData(reportId)` — Cleanup: delete report data from IDB after submit
- `window.dataStore.getReport(reportId)` + `saveReport()` — Update IDB metadata to `submitted` status
- `window.dataStore.deletePhotosByReportId(reportId)` — Cleanup: delete photos from IDB after submit

**localStorage reads**
- `STORAGE_KEYS.ORG_ID` — org_id for Supabase
- `STORAGE_KEYS.USER_ID` — user_id for Supabase

#### Submit Flow
1. Online check
2. Duplicate detection (same project + date with `submitted` status)
3. `saveReportToLocalStorage()` — Final save of form data
4. `generateVectorPDF()` — Generate PDF
5. `uploadPDFToStorage(pdf)` → Supabase Storage → signed URL
6. `ensureReportExists()` → Upsert reports table
7. `saveSubmittedReportData(pdfUrl)` → Set pdf_url + inspector_name
8. `updateReportStatus('submitted')` → Set status
9. `cleanupLocalStorage()` → Delete IDB report data + photos, update metadata status
10. Redirect to `index.html?submitted=true`

#### Markers
- 🟢 **GOOD** — SEC-03: Signed URLs for PDF access instead of public bucket
- 🟢 **GOOD** — Duplicate detection before submit prevents accidental double-submission
- 🟢 **GOOD** — Full cleanup of IDB data + photos after successful submit
- 🟡 **ISSUE** — `cleanupLocalStorage()` deletes IDB report data but the `report_data` row in Supabase is NOT deleted — stale data remains in cloud
- 🟡 **ISSUE** — If submit fails mid-flow (e.g., after PDF upload but before status update), the PDF is orphaned in Storage with no recovery mechanism
- 🟡 **ISSUE** — `updateReportStatus` updates IDB metadata but `saveSubmittedReportData` does not — split update could leave inconsistent state if one fails

---

### File: `js/report/main.js` (~252 lines)

#### Storage Operations

**IndexedDB — via `window.dataStore`**
- `window.dataStore.init()` — Initialize IDB on DOMContentLoaded
- `window.dataStore.getReportData(reportId)` — Read for project_id lookup
- `window.dataStore.getReport(reportId)` — Read IDB metadata for project_id
- `window.dataStore.saveReportData(reportId, data)` — Emergency save on visibilitychange/pagehide
- `window.dataStore.closeAll()` — Close IDB on pagehide (iOS Safari bfcache fix)

**Supabase reads (via `window.dataLayer`)**
- `window.dataLayer.loadUserSettings()` — Load user settings
- `window.dataLayer.loadProjectById(projectId)` — Load project by ID

**URL parameters**
- `?reportId` — Used in data-loading.js
- `?tab=preview` — Auto-switch to preview tab on load
- `?projectId` — Fallback project ID source

#### Init Flow (DOMContentLoaded)
1. `dataStore.init()` → Initialize IDB
2. `loadUserSettings()` → Supabase user settings
3. `loadReport()` → IDB-first with cloud freshness (from data-loading.js)
4. Project lookup: reportData.projectId → IDB metadata → URL param
5. `populateAllFields()` + `populateOriginalNotes()` → Fill UI
6. `setupAutoSave()` → Attach input/blur listeners
7. `initRealtimeSync()` → Start Realtime subscriptions
8. Tab routing from URL param

#### Hardening (same pattern as interview/main.js)
| Event | Action |
|-------|--------|
| `visibilitychange → hidden` | `saveReportToLocalStorage()` + full `dataStore.saveReportData()` + `flushReportBackup()` |
| `pagehide` | Same as above + `dataStore.closeAll()` |

#### Markers
- 🟢 **GOOD** — Emergency save on visibilitychange/pagehide matches interview pattern
- 🟢 **GOOD** — Debug access via `window.__fvp_debug` for development
- 🟡 **ISSUE** — Emergency save in visibilitychange/pagehide builds a full reportData object inline (duplicating the structure from `saveReportToLocalStorage`). If the schema changes, two places need updating
- 🔁 **DUPLICATE** — Emergency save object construction duplicated between visibilitychange and pagehide handlers (identical code blocks)

---

### File: `js/report/delete-report.js` (~55 lines)

#### Storage Operations

**Delegates to `deleteReportFull(reportId)`** (defined in `shared/delete-report.js`)
- Handles: blocklist, IDB cleanup, Supabase soft-delete
- Returns `{ success, errors }` object

**No direct storage operations** — purely modal UI + delegation to shared delete function

#### Markers
- 🟢 **GOOD** — Clean delegation to shared `deleteReportFull()` — no duplicate delete logic
- 🟢 **GOOD** — Awaits full cleanup before navigation (prevents orphaned data)

---

## 12. Report: form-fields + ai-refine + original-notes (George)
*Status: ✅ Complete*

### File: `js/report/form-fields.js` (~1005 lines)

#### Storage Operations

**In-memory state — `RS` (window.reportState)**
- `RS.report.activities[]` — Contractor activity objects: `{ contractorId, noWork, narrative, equipmentUsed, crew }`
- `RS.report.operations[]` — Personnel counts per contractor (same schema as interview)
- `RS.report.equipment[]` — Equipment rows: `{ contractorId, type, qty, status }`
- `RS.report.photos[]` — Photo metadata (captions editable via textarea)
- `RS.userEdits[path]` — Tracks all user field edits, including:
  - `activity_{contractorId}` — Full contractor activity object
  - `operations_{contractorId}` — Full operations object
  - Standard dot-paths for text fields
- `RS.report.userEdits` — Mirror of `RS.userEdits`

**localStorage (indirect via `scheduleSave()` → `saveReport()`)**
- Called after: every field input/blur, contractor narrative/equipment/crew changes, personnel input changes, equipment row changes, photo caption changes

**Data Priority (getValue/getTextFieldValue/getContractorActivity/getContractorOperations)**
1. `RS.userEdits[path]` — User manually edited
2. `RS.report.aiGenerated` — AI-generated content (with name-matching fallback for freeform mode)
3. `RS.report` fields — Original report data
4. Default value

**Photo error recovery**
- `handlePhotoError()` — On image load failure, attempts re-sign from Supabase Storage (`report-photos` bucket, 1hr signed URL)
- Single retry (`resignRetried` flag prevents infinite loops)

**Supabase Storage reads**
- `supabaseClient.storage.from('report-photos').createSignedUrl(storagePath, 3600)` — Re-sign expired photo URLs

#### Populated Fields (populateAllFields)
- Project overview: 12 fields from project config + userEdits
- Weather: 6 fields
- Text sections: 5 fields (issues, qaqc, safety, communications, visitors) with AI/legacy fallback paths
- Safety incident toggle
- Signature: 3 fields (defaults from userSettings)
- Dynamic: work summary (contractor cards), personnel table, equipment table, photos

#### Contractor Activity Resolution (form tab)
- `getContractorActivity(contractorId)` — Priority: userEdits → aiGenerated (by ID, then by name for freeform) → report.activities
- `getContractorOperations(contractorId)` — Same priority chain
- `getEquipmentData()` — Priority: report.equipment (user edited) → aiGenerated.equipment (with name→ID resolution)
- `getCrewActivity(contractorId, crewId)` — Priority: userEdits → aiGenerated.crewActivities → report.activities.crewActivities

#### Markers
- 🟢 **GOOD** — Three-tier data priority (userEdits → AI → original) is clean and well-implemented
- 🟢 **GOOD** — Freeform mode name-matching fallback for contractor activities/operations when IDs are null
- 🟢 **GOOD** — Photo error recovery with signed URL re-sign is robust
- 🟡 **ISSUE** — `renderWorkSummary()` in form-fields.js creates completely different contractor card UI from `renderContractorWorkCards()` in interview — report shows narrative/equipment/crew fields, interview shows timestamped entries. The data structures don't map 1:1
- 🟡 **ISSUE** — `getEquipmentData()` maps AI equipment `hoursUsed` to `status` as string (`"3 hrs"`) but interview stores `status` as enum (`"3hr"`) — inconsistent format
- 🔁 **DUPLICATE** — `updatePersonnelTotals()` exists in both form-fields.js (report) and contractors-personnel.js (interview) with different implementations
- 🔁 **DUPLICATE** — `toggleNoWork()` exists in both files with different behavior (report version manages narrative/equipment/crew; interview version manages entry-based work)

---

### File: `js/report/ai-refine.js` (~274 lines)

#### Storage Operations

**External — n8n webhooks**
- `N8N_PROCESS_WEBHOOK` = `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report` — Full report re-processing (retry for pending_refine)
- `N8N_REFINE_TEXT_WEBHOOK` = `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text` — Single field refinement (20s timeout)
- Both use `N8N_WEBHOOK_API_KEY` header and AbortController timeouts

**In-memory state writes**
- `retryRefineProcessing()`:
  - Sets `RS.report.aiGenerated` from webhook response
  - Sets `RS.report.originalInput` from webhook response
  - Sets `RS.report.meta.status = 'refined'`
  - Clears `offlineQueue` entry
  - Calls `saveReport()` → triggers IDB + Supabase sync
- `refineTextField()` / `refineContractorNarrative()`:
  - Sets textarea value from webhook response
  - Dispatches `input` event to trigger auto-save chain

**localStorage reads (indirect)**
- `RS.report.meta.offlineQueue[]` — Reads queued refine payload for retry
- `RS.report.meta.status` — Checks for `pending_refine` status

#### Section Mapping
| Textarea ID | n8n Section |
|------------|-------------|
| issuesText | issues |
| qaqcText | inspections |
| safetyText | safety |
| communicationsText | activities |
| visitorsText | visitors |

#### Markers
- 🟢 **GOOD** — Separate webhook for single-field refinement vs full re-processing
- 🟢 **GOOD** — AbortController with timeouts prevents hanging requests
- 🟡 **ISSUE** — `retryRefineProcessing` reads from `RS.report.meta.offlineQueue` but this queue was removed in Sprint 15 (OFF-02). The `checkPendingRefineStatus` still shows the banner, but the retry mechanism has no payload to send
- 🟡 **ISSUE** — `refineContractorNarrative` sends `section: 'activities'` for ALL contractors — the webhook has no way to distinguish which contractor's narrative is being refined
- 🟠 **MAYBE** — `SECTION_MAP` maps `communicationsText` to `'activities'` which seems wrong — should probably be `'communications'`

---

### File: `js/report/original-notes.js` (~293 lines)

#### Storage Operations

**In-memory state reads (read-only display)**
- `RS.report.originalInput` — Primary source for original field notes:
  - `originalInput.fieldNotes.freeform_entries[]` — Freeform mode entries
  - `originalInput.fieldNotes.freeformNotes` — Legacy freeform string
  - `originalInput.entries[]` — Guided mode entries (filtered by section + `is_deleted`)
  - `originalInput.operations[]` — Personnel data
  - `originalInput.equipmentRows[]` — Equipment data
  - `originalInput.weather` — Weather data
  - `originalInput.safety` — Safety state
  - `originalInput.projectContext.contractors[]` — Contractor names for display
- `RS.report.photos[]` — Photo display
- `RS.report.aiCaptureMode` / `RS.report.meta.captureMode` — Determines minimal vs guided view
- `RS.report.fieldNotes` — Fallback for freeform notes
- `RS.report.overview.weather` — Fallback for weather

**No writes** — purely read-only display of original captured data

#### Display Sections (Guided Mode)
- Work by contractor (grouped entries with crew support)
- Personnel table
- Equipment table
- Issues, QA/QC, Communications, Safety, Visitors (entry-based)
- Weather
- Photos

#### Markers
- 🟢 **GOOD** — Purely read-only, no mutation risk
- 🟢 **GOOD** — Handles both freeform and guided modes with appropriate fallbacks
- 🟢 **GOOD** — Crew-level work entries properly grouped under parent contractor
- 🟡 **ISSUE** — Photo URLs displayed without signed URL refresh — if original URLs are expired signed URLs, photos will show as broken (no re-sign logic like form-fields.js has)

---

## 13. Report: pdf-generator + preview + debug (George)
*Status: ✅ Complete*

### File: `js/report/pdf-generator.js` (~765 lines)

#### Storage Operations

**In-memory state reads (all read-only for PDF generation)**
- `RS.report.overview.weather` — Weather data
- `RS.report.photos[]` — Photo metadata + URLs
- `RS.report.userEdits` — User field overrides
- `RS.activeProject` — Project config (logo, name, contractors, config fields)
- `RS.projectContractors` — Contractor list
- `RS.userSettings` — User name/title/company for signature

**DOM reads (form field values)**
- `formVal(id, fallback)` — IIFE-scoped helper reads current DOM values for all 26+ form fields
- This means PDF reflects the current form state, not saved state

**External library**
- `jsPDF` — Vector PDF generation (loaded via CDN/bundle)
- `loadImageAsDataURL(url)` — Converts image URL → canvas → data URL for embedding
  - 10s timeout per image, max 800px dimension, JPEG 0.85 quality
  - Used for: project logo, report photos

**Data resolution (same priority as form-fields.js)**
- `getContractorActivity(contractorId)` — userEdits → AI → report.activities
- `getContractorOperations(contractorId)` — userEdits → AI → report.operations
- `getEquipmentData()` — report.equipment → AI equipment
- `getCrewActivity(contractorId, crewId)` — Crew-level activity data

**No writes** — purely generates a Blob + filename, returned to submit.js

#### PDF Structure
| Section | Data Source |
|---------|-----------|
| Header | Project logo (data URL), title |
| Project Overview | 8 rows × 4 cols from form fields + project config |
| Weather + Signature | Form fields + userSettings |
| Daily Work Summary | Contractor activities (sorted: work first, no-work last, primes before subs) |
| Daily Operations | Personnel table from operations data |
| Equipment | Equipment rows from getEquipmentData() |
| Issues/Communications/QA-QC/Safety/Visitors | Text sections from form fields |
| Photos | Up to 4 per page, embedded as data URLs |

#### Markers
- 🟢 **GOOD** — Vector PDF with jsPDF produces crisp text (not HTML-to-canvas)
- 🟢 **GOOD** — Multi-page support with proper page breaks and footer pagination
- 🟢 **GOOD** — Photos embedded as data URLs (works offline)
- 🟡 **ISSUE** — `loadImageAsDataURL` uses canvas with `crossOrigin: 'anonymous'` — will fail on Supabase signed URLs that don't include proper CORS headers
- 🟡 **ISSUE** — PDF reads form DOM values directly (`formVal`), not saved state. If autosave hasn't flushed, PDF could contain data not yet persisted
- 🔁 **DUPLICATE** — `formVal()` defined independently in pdf-generator.js, preview.js, and submit.js (3 copies of the same function)
- 🔁 **DUPLICATE** — `pdfFormatDate`, `pdfFormatTime`, `pdfCalcShift`, `pdfFormatTradesAbbrev`, `pdfGetContractorName`, `pdfFormatEquipNotes` are near-identical copies of the same functions in preview.js (prefixed `preview*` there)

---

### File: `js/report/preview.js` (~478 lines)

#### Storage Operations

**In-memory state reads (all read-only for preview rendering)**
- Same data sources as pdf-generator.js: `RS.report`, `RS.activeProject`, `RS.projectContractors`, `RS.userEdits`, `RS.userSettings`
- `RS.report.photos[]` — Photo display (URLs used directly, no data URL conversion)

**DOM reads**
- `formVal(id, fallback)` — Own IIFE-scoped copy, reads current form values

**No writes** — purely generates HTML for the preview pane

#### Preview Structure
- **Page 1:** Header + Project Overview table + Weather/Signature + Daily Work Summary (contractor activities with crew support)
- **Page 2:** Daily Operations table + Equipment table + Issues + Communications
- **Page 3:** QA/QC + Safety (with incident checkboxes) + Visitors
- **Page 4+:** Photo pages (4 per page)
- CSS scaling via `scalePreviewToFit()` — renders at 816px (8.5") then scales down

**Data resolution** — same helpers as form-fields.js: `getContractorActivity`, `getContractorOperations`, `getEquipmentData`, `getCrewActivity`

#### Markers
- 🟢 **GOOD** — Live preview reflects current form state (reads DOM directly)
- 🟢 **GOOD** — Responsive scaling to viewport width
- 🟡 **ISSUE** — Preview photo URLs are raw (no re-sign on error), unlike form-fields.js which has `handlePhotoError` retry logic
- 🟡 **ISSUE** — Operations table shows `'N/A'` for empty personnel values, but PDF shows `'0'` — inconsistent display between preview and actual PDF
- 🔁 **DUPLICATE** — Nearly every helper function is duplicated from pdf-generator.js: `previewFormatDate` ≈ `pdfFormatDate`, `previewFormatTime` ≈ `pdfFormatTime`, etc. (~100 lines of duplicated utility code)

---

### File: `js/report/debug.js` (~463 lines)

#### Storage Operations

**In-memory state reads (all read-only for diagnostics)**
- `RS.report.aiGenerated` — AI response data for schema validation
- `RS.report.fieldNotes` — Original field notes
- `RS.report.guidedNotes` — Guided mode notes
- `RS.report.userEdits` — User edit tracking
- `RS.report.activities`, `RS.report.operations`, `RS.report.equipment` — Current state
- `RS.report.overview` — Report date
- `RS.activeProject` — Project name, contractor list
- `RS.projectContractors` — Valid contractor IDs for mismatch detection

**No reads from localStorage/IDB/Supabase** — purely operates on in-memory RS state

**Browser downloads (export only)**
- `downloadDebugJSON()` — Creates Blob → object URL → programmatic download of JSON export
- `downloadDebugMarkdown()` — Same pattern for Markdown export

#### Debug Checks (detectFieldMismatches)
| Check Type | What It Detects |
|-----------|----------------|
| `schema` | Unexpected top-level keys in aiGenerated (not in expected list) |
| `empty` | AI returned empty but guidedNotes had content (issues, safety, activities) |
| `type` | Expected array but got string (generalIssues, qaqcNotes, etc.) |
| `contractor` | AI contractorId doesn't match any project contractor ID |

#### Markers
- 🟢 **GOOD** — Comprehensive AI response validation catches schema drift early
- 🟢 **GOOD** — Export to JSON + Markdown for debugging outside the app
- 🟡 **ISSUE** — Expected key lists are hardcoded — if AI response schema evolves (e.g., new `issues_delays` key from v6.6), debug tool flags it as unexpected. The expected keys (`generalIssues`, `qaqcNotes`, `contractorCommunications`, `visitorsRemarks`) appear to be legacy names, while form-fields.js maps to newer names (`issues_delays`, `qaqc_notes`, `communications`, `visitors_deliveries`)
- 🟠 **MAYBE** — Debug panel initializes on every page load (`initializeDebugPanel()` in main.js) — could add overhead for non-developer users. Consider lazy init on panel toggle

---

## 14. Dashboard: index modules
*Status: ✅ Complete*

### Files Analyzed
- `js/index/main.js` (~580 lines)
- `js/index/report-cards.js` (~690 lines)
- `js/index/report-creation.js` (~280 lines)
- `js/index/cloud-recovery.js` (~290 lines)
- `js/index/messages.js` (~75 lines)
- `js/index/calendar.js` (~45 lines)
- `js/index/deep-links.js` (~60 lines)
- `js/index/field-tools.js` (~30 lines)
- `js/index/panels.js` (~310 lines)
- `js/index/toggle-panel.js` (~25 lines)
- `js/index/weather.js` (~200 lines)

**Total: ~2,585 lines across 11 files**

---

### 14.1 main.js — Dashboard Initialization & Refresh

#### localStorage Reads
| Key | Purpose | Notes |
|-----|---------|-------|
| `STORAGE_KEYS.MIC_GRANTED` | Check microphone permission state | Read-only |
| `STORAGE_KEYS.LOC_GRANTED` | Check location permission state | Read-only |
| `STORAGE_KEYS.ONBOARDED` | Check if user completed onboarding | Read-only |
| `STORAGE_KEYS.BANNER_DISMISSED` | Permission banner dismissed state | Read + write |
| `STORAGE_KEYS.BANNER_DISMISSED_DATE` | When banner was dismissed (24h expiry) | Read + write |
| `STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` | **sessionStorage** — submitted banner dismissed this session | sessionStorage read + write |
| `STORAGE_KEYS.PROJECTS` | Fallback project list from localStorage | Read-only fallback |
| `STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR` | One-time migration flag for v1.13.0 IDB clear | Read + write |
| `STORAGE_KEYS.DELETED_REPORT_IDS` | Blocklist of recently deleted report IDs | Read + trimmed write |
| `fvp_ai_response_*` | AI response cache keys (wildcard prefix scan) | Cleanup: removed if >24h old |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.BANNER_DISMISSED` | `'true'` | User dismisses permission banner |
| `STORAGE_KEYS.BANNER_DISMISSED_DATE` | ISO date string | User dismisses permission banner |
| `STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` | `'true'` (sessionStorage) | User dismisses submitted banner |
| `STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR` | ISO date string or `'failed-...'` | One-time migration on first load |
| `STORAGE_KEYS.DELETED_REPORT_IDS` | Trimmed JSON array (last 20) | Cleanup during refresh |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Init data store | `window.dataStore.init()` | DOMContentLoaded |
| Get all reports | `window.dataStore.getAllReports()` | `loadReportsFromIDB()`, `pruneCurrentReports()` |
| Replace all reports | `window.dataStore.replaceAllReports(reports)` | After pruning stale reports |
| Sync from cloud | `window.dataStore.syncReportsFromCloud()` | During `refreshDashboard()` |
| Clear store | `window.dataStore.clearStore('projects')` | One-time v1.13.0 migration |
| Reset connection | `window.dataStore.reset()` | On bfcache restore (pageshow) |

#### Supabase Operations (via dataLayer)
| Operation | Method | Context |
|-----------|--------|---------|
| Load projects | `window.dataLayer.loadProjects()` | Phase 1 of `refreshDashboard()` |
| Refresh from cloud | `window.dataLayer.refreshProjectsFromCloud()` | Phase 2 of `refreshDashboard()` (online only) |

#### In-Memory Caches
| Variable | Type | Scope |
|----------|------|-------|
| `projectsCache` | `Array` | Module-level `var`, accessible via `window.projectsCache` |
| `window.currentReportsCache` | `Array` | Global, shared across files |
| `_autoDismissSubmittedTimer` | Timer ID | Module-level |
| `_dashboardRefreshing` | Boolean | Debounce flag |
| `_lastRefreshTime` | Timestamp | Cooldown tracking |

#### 🟢 GOOD — Refresh Architecture
The `refreshDashboard()` function is well-designed:
- Debounce prevents concurrent runs
- 2s cooldown prevents triple-fire from pageshow/visibilitychange/focus
- Timeout wrappers (`withTimeout()`) prevent indefinite IDB/network hangs
- Three-layer event coverage for iOS PWA (pageshow + visibilitychange + focus)
- `_renderFromLocalStorage()` gives instant paint before async data loads

#### 🟡 ISSUE — AI Cache Cleanup Uses Raw Key Iteration
Lines ~195-210: Iterates all `localStorage` keys to find `fvp_ai_response_*` prefix. This works but bypasses `STORAGE_KEYS` constants. If the prefix ever changes in one place but not the other, cleanup breaks silently.

#### 🟡 ISSUE — sessionStorage Used for Submitted Banner
`STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED` is stored in `sessionStorage`, not `localStorage`. This is intentional (per-session dismiss) but inconsistent with the permission banner which uses `localStorage` with a 24h expiry. Both achieve "temporary dismiss" differently.

#### 🔵 IMPROVEMENT — pruneCurrentReports Hard-Codes 7-Day Window
The 7-day stale report threshold is hardcoded (`const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000`). Could be a config constant.

---

### 14.2 report-cards.js — Report Card Rendering & Swipe-to-Delete

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.PROJECTS` | Fallback project map when `projectsCache` is empty |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Get report | `window.dataStore.getReport(reportId)` | `dismissReport()` — get existing before update |
| Save report | `window.dataStore.saveReport(localReport)` | `dismissReport()` — save with `dashboard_dismissed_at` |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Update report | `reports` | `dismissReport()` — sets `dashboard_dismissed_at` + `updated_at` |

#### In-Memory Cache Mutations
| Variable | Mutation | Context |
|----------|----------|---------|
| `window.currentReportsCache` | Filter out deleted report | `executeDeleteReport()` |
| `window.currentReportsCache` | Map to add `dashboard_dismissed_at` | `dismissReport()` |

#### 🟢 GOOD — Dismiss vs Delete Separation
Clean separation: submitted reports get "dismissed" (soft-hide with `dashboard_dismissed_at`), while drafts get hard-deleted via `deleteReportFull()`. UI reflects this with different modal text/icons.

#### 🟡 ISSUE — dismissReport Accesses supabaseClient Directly
`dismissReport()` (line ~380) directly queries `supabaseClient.from('reports').update(...)` instead of going through `dataStore` or `dataLayer`. This bypasses any abstraction layer and directly couples the UI to Supabase.

#### 🔁 DUPLICATE — dismissReport Has Its Own Cloud + IDB + Cache Update Logic
The `dismissReport()` function manually updates Supabase, then IDB, then in-memory cache, then re-renders. This three-tier update pattern is repeated across many files (report submit, delete, etc.) without a shared utility.

---

### 14.3 report-creation.js — New Report Flow

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.ORG_ID` | Included in new report row |
| `STORAGE_KEYS.USER_ID` | Included in new report row |
| `STORAGE_KEYS.ACTIVE_REPORT_ID` | Set when navigating to interview |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.ACTIVE_REPORT_ID` | New UUID or existing report ID | `selectProjectAndProceed()` |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Get all reports | `window.dataStore.getAllReports()` | Duplicate report check in `selectProjectAndProceed()` |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Upsert report row | `reports` | `createSupabaseReportRow()` — creates draft row on report start |

#### Other Storage
| Source | Method | Context |
|--------|--------|---------|
| `getDeviceId()` | device-id.js | Included in new report row |
| `crypto.randomUUID()` | Browser API | Generate new report ID |

#### 🟢 GOOD — Duplicate Report Detection
`selectProjectAndProceed()` checks for existing same-project + same-date + non-submitted reports before creating a new one. Prevents accidental duplicates.

#### 🟡 ISSUE — createSupabaseReportRow Bypasses dataStore
Creates a Supabase row directly (`supabaseClient.from('reports').upsert(...)`) without also creating a local IDB entry. The IDB entry is presumably created later when the interview page loads, but there's a window where cloud has a record that local doesn't.

---

### 14.4 cloud-recovery.js — Cross-Device Draft Sync

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.USER_ID` | Filter cloud drafts by user |
| `STORAGE_KEYS.PROJECTS` | Look up project names for recovered drafts |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Get all reports | `window.dataStore.getAllReports()` | Load current local reports for comparison |
| Replace all reports | `window.dataStore.replaceAllReports(localReports)` | After recovering cloud drafts |
| Save report data | `window.dataStore.saveReportData(reportId, data)` | Cache `report_data` for recovered reports |
| Get report data | `window.dataStore.getReportData(reportId)` | Check existing report data for photo rehydration |
| Save report | `window.dataStore.saveReport(report)` | Update `_draft_data.photos` after photo rehydration |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Select active drafts | `reports` | Query drafts/refined reports for current user |
| Select report data | `report_data` | Pre-cache report content for recovered drafts |
| Select interview backups | `interview_backup` | Pre-cache field capture state for draft reports |

#### External Function Calls
| Function | Source | Context |
|----------|--------|---------|
| `isDeletedReport(id)` | Likely shared/delete-report.js | Skip reports on the deleted blocklist |
| `fetchCloudPhotosBatch(ids)` | Likely shared/cloud-photos.js | Rehydrate photos from Supabase photos table |
| `window.fvpBroadcast.send()` | BroadcastChannel API | Notify other tabs about recovered reports |

#### 🟢 GOOD — SYN-01 Timestamp Comparison
Cloud vs local `updated_at` comparison ensures cloud wins only if newer. Handles both epoch-ms and ISO string formats for `updated_at`.

#### 🟢 GOOD — Comprehensive Recovery Pipeline
Recovery covers: reports → report_data → interview_backup → photos. Each step has its own error handling and doesn't block others.

#### 🟡 ISSUE — Heavy Supabase Round-Trips
Recovery performs 4 sequential/parallel Supabase queries: reports, report_data, interview_backup, photos. For a user with many projects, this could be slow on mobile. Could be consolidated with a Supabase RPC function.

#### 🟡 ISSUE — _draft_data Built From page_state in cacheInterviewBackups
The `cacheInterviewBackups()` function reconstructs `_draft_data` from `page_state` with a large field-by-field mapping (lines ~200-230). This mapping must stay in sync with the interview page's `saveToLocalStorage()` format. If fields are added to interview persistence, this reconstruction could miss them.

#### 🔁 DUPLICATE — _draft_data Reconstruction
The `_draft_data` format is constructed in at least 3 places: `cacheInterviewBackups()` here, `saveToLocalStorage()` in interview/persistence.js, and `restoreFromLocalStorage()`. Any schema change must update all three.

---

### 14.5 messages.js — Mock Message Threads

#### Storage Operations: **NONE**

🟢 GOOD — This is a pure UI component with hardcoded demo data. No storage reads or writes. Messages are ephemeral (DOM-only).

#### ⚫ ORPHAN — Likely Demo/Placeholder
The messages feature uses hardcoded conversation threads (Mike Rodriguez, James Sullivan, Diana Lopez, Kevin Walsh). No integration with any backend or storage. Likely a demo feature that may need real implementation or removal.

---

### 14.6 calendar.js — Simple Calendar Widget

#### Storage Operations: **NONE**

🟢 GOOD — Pure UI component. Renders a month grid based on `Date()`. No storage dependencies.

---

### 14.7 deep-links.js — URL Parameter Deep Linking

#### Storage Operations: **NONE**

🟢 GOOD — Reads URL params (`openTool`, `openPanel`, `mapType`) and dispatches to UI functions. Cleans URL via `history.replaceState()`. No storage interaction.

---

### 14.8 field-tools.js — Field Tools Modal & Carousel

#### Storage Operations: **NONE**

🟢 GOOD — Pure UI: modal open/close and carousel pause/resume on touch. No storage.

---

### 14.9 panels.js — Lazy-Loaded Detail Panels

#### Storage Operations: **NONE** (direct)

Panels read data from in-memory caches (`weatherDataCache`, `sunriseSunsetCache`) and location functions (`getLocationFromCache()`, `getCachedLocation()`, `getFreshLocation()`). No direct localStorage/IndexedDB/Supabase calls.

#### External Data Fetches (Network APIs)
| API | Panel | Purpose |
|-----|-------|---------|
| `api.open-meteo.com/v1/elevation` | Drone Ops | Site elevation |
| `www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination` | Drone Ops | Magnetic declination |
| `api.sunrise-sunset.org` | Weather Details + Drone Ops (via `fetchSunriseSunset()`) | Sunrise/sunset times |

#### 🟢 GOOD — Lazy Loading
Panels only fetch data on first open (`panelLoaded` flag prevents re-fetching). Good for reducing initial load time.

#### 🔵 IMPROVEMENT — Emergency Panel GPS
`loadEmergencyPanel()` calls `getFreshLocation()` for accuracy, which is correct for emergencies. But `shareEmergencyLocation()` also calls `getFreshLocation()` again — could reuse the panel's result.

---

### 14.10 toggle-panel.js — Panel Toggle Logic

#### Storage Operations: **NONE**

Pure DOM manipulation for panel show/hide with mutual exclusion between weather and drone panels.

---

### 14.11 weather.js — Weather Data Sync

#### Storage Operations: **NONE** (direct)

Weather data is cached in module-level variables (`weatherDataCache`, `sunriseSunsetCache`), NOT in localStorage or IndexedDB. Data is fetched fresh on each dashboard load.

#### External Data Fetches
| API | Purpose |
|-----|---------|
| `api.open-meteo.com/v1/forecast` | Current weather, hourly wind/UV/humidity, daily high/low/precip/sunrise/sunset |
| `api.sunrise-sunset.org` | Precise sunrise/sunset times |

#### In-Memory Caches
| Variable | Type | Persistence |
|----------|------|-------------|
| `weatherDataCache` | Object | Session-only (lost on page reload) |
| `sunriseSunsetCache` | Object | Session-only |
| `_weatherRetryScheduled` | Boolean | Retry debounce flag |

#### 🟢 GOOD — Smart Location Strategy
Uses cached location first for speed, then fires off fresh GPS in background. Re-fetches weather only if location changed >0.01° (~1km).

#### 🔵 IMPROVEMENT — Weather Data Not Persisted
Weather data could be cached in localStorage with a TTL (e.g., 15 min). Would allow instant weather display on page reload instead of showing "--" while the API call completes.

---

### 14.12 Summary of Dashboard Storage Patterns

#### Storage Layer Usage Across Dashboard Modules

| File | localStorage | sessionStorage | IndexedDB | Supabase Direct | In-Memory |
|------|:---:|:---:|:---:|:---:|:---:|
| main.js | ✅ Heavy | ✅ | ✅ Heavy | ❌ (via dataLayer) | ✅ |
| report-cards.js | ✅ Read | ❌ | ✅ | ✅ Direct | ✅ |
| report-creation.js | ✅ Read+Write | ❌ | ✅ | ✅ Direct | ❌ |
| cloud-recovery.js | ✅ Read | ❌ | ✅ Heavy | ✅ Heavy (3 tables) | ✅ |
| messages.js | ❌ | ❌ | ❌ | ❌ | Hardcoded |
| calendar.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| deep-links.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| field-tools.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| panels.js | ❌ | ❌ | ❌ | ❌ | ✅ (weather cache) |
| toggle-panel.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| weather.js | ❌ | ❌ | ❌ | ❌ | ✅ |

#### Key Findings

1. **🟡 ISSUE — Mixed Supabase Access Patterns**: `main.js` properly uses `dataLayer` abstraction, but `report-cards.js`, `report-creation.js`, and `cloud-recovery.js` bypass it and call `supabaseClient` directly. This creates inconsistent data flow.

2. **🔁 DUPLICATE — Three-Tier Update Pattern**: The "update Supabase → update IDB → update in-memory cache → re-render" pattern is manually implemented in `dismissReport()`, `executeDeleteReport()`, and `cloud-recovery.js`. Should be a shared utility.

3. **⚫ ORPHAN — messages.js**: Hardcoded demo conversations with no backend integration. Should be flagged for real implementation or removal.

4. **🟢 GOOD — 6 of 11 files have zero storage operations**: Clean separation — most dashboard UI files are pure presentation with no storage coupling.

5. **🔵 IMPROVEMENT — Weather could use localStorage cache**: Currently re-fetches on every load. A 15-min TTL cache would improve perceived performance.

---

## 15. Projects + Project Config
*Status: ✅ Complete*

### Files Analyzed
- `js/projects/main.js` (~290 lines)
- `js/project-config/main.js` (~90 lines)
- `js/project-config/crud.js` (~240 lines)
- `js/project-config/form.js` (~160 lines)
- `js/project-config/contractors.js` (~310 lines)
- `js/project-config/document-import.js` (~275 lines)

**Total: ~1,365 lines across 6 files**

---

### 15.1 projects/main.js — Project Listing Page

#### localStorage Reads
| Key | Purpose | Notes |
|-----|---------|-------|
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | Highlight currently active project | Read on DOMContentLoaded |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | Selected project ID | `selectProject()` |

#### IndexedDB Operations (via dataLayer + idb)
| Operation | Method | Context |
|-----------|--------|---------|
| Load projects | `window.dataLayer.loadProjects()` | `getAllProjects()` — IDB first |
| Refresh from cloud | `window.dataLayer.refreshProjectsFromCloud()` | `refreshProjectsFromCloud()` + fallback in `getAllProjects()` |
| Clear projects store | `window.idb.clearStore('projects')` | Before cloud refresh to get clean state |

#### 🟢 GOOD — Clean Data Layer Usage
Exclusively uses `window.dataLayer` for project loading. Does NOT directly call `supabaseClient`. This is the correct abstraction pattern.

#### 🟡 ISSUE — Clears IDB Before Cloud Refresh
`refreshProjectsFromCloud()` calls `window.idb.clearStore('projects')` before fetching from Supabase. If the cloud fetch fails after the clear, the user loses all local project data until next successful fetch. The `catch` block tries `window.dataLayer.loadProjects()` but IDB is already empty at that point.

---

### 15.2 project-config/main.js — Config Page Entry Point

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | `getActiveProjectId()` helper |

#### IndexedDB Operations (Direct)
| Operation | Method | Context |
|-----------|--------|---------|
| Init DB | `window.idb.initDB()` | DOMContentLoaded — explicit IDB init |

#### 🟡 ISSUE — Explicit idb.initDB() Call
This is the only file that explicitly calls `window.idb.initDB()` on page load. Other pages rely on lazy initialization. Inconsistent pattern — either all pages should explicitly init or none should.

---

### 15.3 project-config/crud.js — Project CRUD Operations

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.USER_ID` | Attached to project rows for Supabase RLS |
| `STORAGE_KEYS.PROJECTS` | Fallback cache for localStorage projects |
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | Check if deleted project was active |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.PROJECTS` | Updated projects map (minus deleted) | `confirmDeleteProject()` — cleanup |

#### localStorage Removals
| Key | Trigger |
|-----|---------|
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | `confirmDeleteProject()` — if deleted project was active |

#### IndexedDB Operations (Direct)
| Operation | Method | Context |
|-----------|--------|---------|
| Get project | `window.idb.getProject(projectId)` | `loadProject()` — IDB first |
| Save project | `window.idb.saveProject(project)` | `saveProject()` — local-first save |
| Delete project | `window.idb.deleteProject(projectId)` | `confirmDeleteProject()` — after Supabase delete |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Upsert project | `projects` | `saveProjectToSupabase()` — via `toSupabaseProject()` normalizer |
| Delete project | `projects` | `confirmDeleteProject()` — hard delete |

#### Data Flow — Save
1. Read form fields → update `currentProject` in-memory
2. Save to IndexedDB (`window.idb.saveProject()`)
3. Sync to Supabase (`saveProjectToSupabase()`)
4. Navigate to projects.html

#### Data Flow — Delete
1. Check online (block if offline)
2. Delete from Supabase (`supabaseClient.from('projects').delete()`)
3. Delete from IndexedDB (`window.idb.deleteProject()`)
4. Clean up localStorage cache (`STORAGE_KEYS.PROJECTS`)
5. Clear active project ID if it was deleted
6. Navigate to projects.html

#### 🟢 GOOD — Local-First Save Pattern
Save writes to IDB first, then syncs to Supabase. If Supabase fails (offline), local save still succeeds. User gets a warning toast but data is preserved.

#### 🟡 ISSUE — Delete Requires Online
Delete is blocked when offline (`!navigator.onLine`). This prevents data loss from desync but means users can't delete projects without internet. Could queue the delete for later sync.

#### 🟡 ISSUE — Direct IDB Access Instead of dataStore
Uses `window.idb.getProject()`, `window.idb.saveProject()`, `window.idb.deleteProject()` directly instead of going through `dataStore` or `dataLayer`. This bypasses any caching or synchronization logic in the abstraction layer.

#### 🔁 DUPLICATE — localStorage Projects Cache Cleanup
`confirmDeleteProject()` manually reads `STORAGE_KEYS.PROJECTS`, deletes the entry, and writes it back. This same "update localStorage project cache" pattern exists in `dataLayer` too. The localStorage projects cache is maintained in multiple places.

---

### 15.4 project-config/form.js — Form Population & Logo Management

#### Storage Operations: **Indirect only**

This file reads/writes through `currentProject` in-memory object and delegates actual storage to `crud.js` (`saveProject()`). No direct storage calls.

#### Supabase Storage Operations (via media-utils.js)
| Operation | Function | Context |
|-----------|----------|---------|
| Upload logo | `uploadLogoToStorage(file, projectId)` | `handleLogoSelect()` — uploads to Supabase Storage bucket |
| Delete logo | `deleteLogoFromStorage(projectId)` | `removeLogo()` — removes from Supabase Storage bucket |
| Compress thumbnail | `compressImageToThumbnail(file)` | `handleLogoSelect()` — generates base64 thumbnail |

#### Logo Storage Strategy
| Field | Purpose | Storage |
|-------|---------|---------|
| `currentProject.logoThumbnail` | Compressed base64 image | Saved to IDB + Supabase `projects` row (JSONB) |
| `currentProject.logoUrl` | Full-quality Supabase Storage URL | Saved to IDB + Supabase `projects` row |
| `currentProject.logo` | **Legacy field** — cleaned up on logo operations | Deleted when new logo set |

#### 🟢 GOOD — Dual Logo Strategy
Thumbnail stored inline (works offline), full-quality URL stored in Supabase Storage (renders in PDFs). Graceful degradation when offline.

#### 🟡 ISSUE — Logo Thumbnail in Project Row
`logoThumbnail` is a base64 string stored in the project JSONB. If the thumbnail is large (even compressed), it bloats the projects table row and every IDB read of the project. Could be stored in a separate IDB store or Supabase Storage only.

---

### 15.5 project-config/contractors.js — Contractor & Crew Management

#### Storage Operations: **NONE (direct)**

All contractor/crew operations mutate `currentProject.contractors` in-memory. The `markDirty()` flag tracks unsaved changes. Actual persistence happens only when `saveProject()` is called (in crud.js).

#### In-Memory Data Structure
```
currentProject.contractors = [
  {
    id: string,
    name: string,
    abbreviation: string,
    type: 'prime' | 'subcontractor',
    trades: string,
    crews: [
      { id, contractorId, name, status, sortOrder }
    ]
  }
]
```

#### 🟢 GOOD — Clean Separation
All contractor/crew CRUD is pure in-memory manipulation with deferred save. The `markDirty()` pattern with `beforeunload` warning prevents accidental data loss.

---

### 15.6 project-config/document-import.js — AI Document Extraction

#### Storage Operations: **NONE (direct)**

No localStorage, IndexedDB, or Supabase calls. The extraction result is populated into the form via `populateFormWithExtractedData()` which updates `currentProject` in-memory and calls `markDirty()`.

#### External API Calls
| API | URL | Purpose |
|-----|-----|---------|
| n8n webhook | `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-project-extractor` | Sends PDF/DOCX files, receives extracted project data |

#### Data Flow
1. User drops/selects PDF/DOCX files
2. Files sent to n8n webhook as FormData
3. Response JSON has project fields + contractors
4. `populateFormWithExtractedData()` fills the form + `currentProject`
5. `markDirty()` ensures user must explicitly save

#### 🟢 GOOD — Extraction Doesn't Auto-Save
Extracted data only populates the form — user must explicitly click Save. This prevents bad AI extractions from corrupting project data.

#### 🟢 GOOD — Missing Field Indicators
Fields the AI couldn't extract are visually marked with `missing-field` class and a "Missing - please fill in" indicator. Cleared when user types.

---

### 15.7 Summary — Projects & Project Config Storage Patterns

#### Storage Layer Usage

| File | localStorage | IndexedDB | Supabase | Supabase Storage | External API |
|------|:---:|:---:|:---:|:---:|:---:|
| projects/main.js | ✅ R/W | ✅ via dataLayer | ❌ (via dataLayer) | ❌ | ❌ |
| project-config/main.js | ✅ Read | ✅ Direct init | ❌ | ❌ | ❌ |
| project-config/crud.js | ✅ R/W/Delete | ✅ Direct CRUD | ✅ Direct | ❌ | ❌ |
| project-config/form.js | ❌ | ❌ | ❌ | ✅ (logo upload/delete) | ❌ |
| project-config/contractors.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| project-config/document-import.js | ❌ | ❌ | ❌ | ❌ | ✅ n8n webhook |

#### Key Findings

1. **🟡 ISSUE — Inconsistent Abstraction Levels**: `projects/main.js` correctly uses `dataLayer` for all operations, but `project-config/crud.js` bypasses it and talks directly to `window.idb` and `supabaseClient`. This means the data layer's caching/normalization logic is skipped during project saves.

2. **🟢 GOOD — Local-First Architecture**: Project saves write to IDB first, then sync to Supabase. Offline saves succeed with a warning. This is the right pattern.

3. **🟢 GOOD — 3 of 6 files have zero storage operations**: `contractors.js`, `form.js` (storage via delegation), and `document-import.js` are clean — they only mutate in-memory state and defer persistence.

4. **🟡 ISSUE — Destructive Cloud Refresh**: Clearing IDB before cloud fetch in `projects/main.js` creates a data loss window if the fetch fails.

5. **🔵 IMPROVEMENT — Project Delete Could Be Queued**: Blocking delete when offline is safe but could frustrate users. A "pending delete" queue (like the report blocklist pattern) would be more robust.

---

## 16. Shared Modules
*Status: ✅ Complete*

### Files Analyzed
- `js/shared/realtime-sync.js` (~380 lines)
- `js/shared/cloud-photos.js` (~140 lines)
- `js/shared/ai-assistant.js` (~815 lines)
- `js/shared/delete-report.js` (~165 lines)
- `js/shared/broadcast.js` (~45 lines)
- `js/shared/console-capture.js` (~110 lines)
- `js/shared/pull-to-refresh.js` (~130 lines)
- `js/shared/supabase-retry.js` (~50 lines)
- `js/shared/data-store.js` — **Already audited in Chunk 6**, not re-documented here

**Total: ~1,835 lines across 8 files (excluding data-store.js)**

---

### 16.1 realtime-sync.js — Supabase Realtime Multi-Device Sync

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.USER_ID` | Filter realtime reports subscription by user |
| `STORAGE_KEYS.ORG_ID` | Filter realtime projects subscription by org |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Get report | `window.dataStore.getReport(id)` | Merge cloud update with existing local report |
| Save report | `window.dataStore.saveReport(merged)` | Persist realtime report update |
| Get report data | `window.dataStore.getReportData(id)` | Fetch before merging refined report_data |
| Save report data | `window.dataStore.saveReportData(id, merged)` | Cache refined report_data from cloud |
| Delete report | `window.dataStore.deleteReport(id)` | Cascade on cloud delete or soft-delete |
| Delete report data | `window.dataStore.deleteReportData(id)` | Cascade on cloud delete |
| Delete draft data | `window.dataStore.deleteDraftData(id)` | Cascade on cloud delete |
| Delete photos | `window.dataStore.deletePhotosByReportId(id)` | Cascade on cloud delete |

#### Supabase Operations
| Operation | Table/Channel | Context |
|-----------|---------------|---------|
| Realtime subscription | `reports` (postgres_changes) | INSERT/UPDATE/DELETE for user_id |
| Realtime subscription | `projects` (postgres_changes) | All events for org_id |
| Select report_data | `report_data` | Fetch refined content before redirect |

#### In-Memory Cache Mutations
| Variable | Mutation | Context |
|----------|----------|---------|
| `window.currentReportsCache` | Map/push/filter | Update, insert, or remove report on realtime event |

#### External Function Calls
| Function | Purpose |
|----------|---------|
| `addToDeletedBlocklist(id)` | Prevent resurrection of deleted reports |
| `isDeletedReport(id)` | Skip updates for reports on blocklist |
| `window.fvpBroadcast.send()` | Notify other tabs of changes |
| `flushInterviewBackup()` | Flush pending saves when coming back online |
| `flushReportBackup()` | Flush pending saves when coming back online |
| `drainPendingBackups()` | Drain IDB backup queue on reconnect |
| `window.dataLayer.refreshProjectsFromCloud()` | Full project refresh on any project change |

#### Lifecycle Events
| Event | Action |
|-------|--------|
| `beforeunload` | Cleanup realtime channels |
| `online` | Re-init subscriptions + flush pending saves + drain backup queue |
| `offline` | Cleanup realtime channels |
| `visibilitychange → hidden` | Cleanup realtime channels |
| `visibilitychange → visible` | Re-init subscriptions (1s delay) |
| `pageshow (persisted)` | Re-init subscriptions + drain backups |

#### 🟢 GOOD — SYN-02: Active Edit Protection
When the user is on `quick-interview.html` or `report.html` editing a specific report, realtime updates for *that* report are skipped to prevent clobbering unsaved edits. Exception: `draft→refined` transition triggers a redirect to the refined view.

#### 🟢 GOOD — Soft-Delete Handling
When cloud status transitions to `'deleted'`, the handler performs a full local cascade (IDB delete of report, report_data, draft_data, photos) and adds to blocklist. Same treatment for Postgres DELETE events.

#### 🟡 ISSUE — Project Change Handler Is Heavy
`_handleProjectChange()` calls `window.dataLayer.refreshProjectsFromCloud()` on *every* project change event. This is a full Supabase query + IDB rewrite. For orgs with frequent project updates, this could be excessive. Could debounce or handle incrementally.

#### 🔵 IMPROVEMENT — Visibility Cleanup Could Be Smarter
Cleaning up all realtime channels on `visibilitychange → hidden` means every tab switch tears down and rebuilds subscriptions. This adds latency when returning to the tab. Supabase SDK handles reconnection internally — could keep channels alive across short visibility changes.

---

### 16.2 cloud-photos.js — Photo Rehydration from Supabase

#### Storage Operations: **Supabase only (no local storage)**

#### Supabase Operations
| Operation | Table/Bucket | Context |
|-----------|-------------|---------|
| Select photos | `photos` table | Fetch metadata by report_id (single or batch) |
| Create signed URL | `report-photos` storage bucket | Generate 1-hour signed URLs from `storage_path` |

#### Exported Functions
| Function | Purpose |
|----------|---------|
| `fetchCloudPhotos(reportId)` | Single report photo fetch |
| `fetchCloudPhotosBatch(reportIds)` | Batch photo fetch → returns `{ reportId: [photos] }` map |

#### 🟢 GOOD — SEC-04: Always Generates Fresh Signed URLs
Never trusts the stored `photo_url` column — always generates a fresh signed URL from `storage_path`. This prevents stale/expired URL display.

#### 🟡 ISSUE — Batch Signed URL Generation Is Sequential
`fetchCloudPhotosBatch()` generates signed URLs in a sequential `for` loop with `await` on each. For reports with many photos across multiple reports, this could be slow. Could use `Promise.all()` with batching.

#### 🔁 DUPLICATE — Photo Object Construction
The photo object mapping (`{ id, url, storagePath, caption, date, time, gps, ... }`) is nearly identical in `fetchCloudPhotos()` and `fetchCloudPhotosBatch()`. Could extract to a shared helper.

---

### 16.3 ai-assistant.js — Global AI Chat Assistant

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.AUTH_USER_ID` | Namespace conversation key per user |
| `STORAGE_KEYS.ACTIVE_PROJECT_ID` | Build project context for AI webhook |
| `STORAGE_KEYS.PROJECTS` | Look up active project details |
| `STORAGE_KEYS.DEVICE_ID` | Include device ID in AI webhook payload |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `fvp_ai_conversation` or `fvp_ai_conversation_{userId}` | JSON array of messages (max 50) | Every `sendMessage()` and `showHelp()` |

#### External API Calls
| API | URL | Purpose |
|-----|-----|---------|
| n8n webhook | `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-ai-chat` | Send user message + context, receive AI response |

#### 🟢 GOOD — Per-User Conversation Namespacing
Conversation key includes user ID (`fvp_ai_conversation_{userId}`), preventing cross-user conversation leakage on shared devices.

#### 🟢 GOOD — SEC-06: Input Sanitization
`sanitizeInput()` strips control characters and enforces 10,000 char max before sending to webhook.

#### 🟢 GOOD — Local Command Handling
Many commands (navigation, tool opening) are handled entirely client-side without hitting the AI webhook. This provides instant response for common actions.

#### 🟡 ISSUE — Conversation Stored in localStorage
AI conversation history (up to 50 messages) is stored in localStorage as a single JSON blob. On devices with limited localStorage, this could compete with other storage needs. Could use IndexedDB instead.

#### 🟡 ISSUE — Dynamic localStorage Key
The conversation key `fvp_ai_conversation_{userId}` is not defined in `STORAGE_KEYS`. It's dynamically constructed, making it invisible to centralized key management. Cleanup code in main.js wouldn't know about it.

---

### 16.4 delete-report.js — Shared Delete Cascade

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.ACTIVE_REPORT_ID` | Check if deleted report is the active one |

#### localStorage Writes/Removals
| Key | Action | Trigger |
|-----|--------|---------|
| `STORAGE_KEYS.ACTIVE_REPORT_ID` | Remove | If deleted report was active |

#### IndexedDB Operations (via dataStore)
| Operation | Method | Context |
|-----------|--------|---------|
| Delete report | `window.dataStore.deleteReport(id)` | `deleteReportFull()` |
| Delete photos | `window.dataStore.deletePhotosByReportId(id)` | `deleteReportFull()` |
| Delete draft data | `window.dataStore.deleteDraftData(id)` | `deleteReportFull()` |
| Delete report data | `window.dataStore.deleteReportData(id)` | `deleteReportFull()` |

#### Supabase Operations (Direct)
| Operation | Table/Bucket | Context |
|-----------|-------------|---------|
| Select photo paths | `photos` | Get storage_path list for photo cleanup |
| Remove photo files | `report-photos` storage | Delete actual photo files |
| Delete child rows | `interview_backup`, `report_backup`, `ai_submissions`, `report_data` | Cascade delete |
| Select PDF URL | `reports` + `final_reports` | Get pdf_url for storage cleanup |
| Remove PDF file | `report-pdfs` storage | Delete PDF from storage |
| Delete final_reports | `final_reports` | Legacy table cleanup |
| Delete photos rows | `photos` | Delete photo metadata |
| Delete report row | `reports` | Parent row (must be last) |
| Soft-delete report | `reports` | `deleteReportFull()` sets `status='deleted'` |

#### Two Delete Functions

| Function | Scope | Strategy |
|----------|-------|----------|
| `deleteReportCascade(id)` | **Full hard delete** — removes all Supabase data (photos, child tables, storage files, parent row) | Hard delete cascade |
| `deleteReportFull(id)` | **Soft delete** — blocklist + IDB cleanup + Supabase `status='deleted'` | Soft delete + local cleanup |

#### 🟢 GOOD — Single-Source Cascade
This is THE shared delete implementation. Other files (`index/report-cards.js`, `report/delete-report.js`) call `deleteReportFull()` instead of reimplementing delete logic.

#### 🟢 GOOD — Per-Step Error Isolation
Each step in `deleteReportCascade()` has its own try/catch. A failure in photo deletion doesn't prevent child table cleanup, etc. Errors are collected and returned.

#### 🟡 ISSUE — deleteReportFull Does Soft Delete, deleteReportCascade Does Hard Delete
The naming is confusing. `deleteReportFull()` sounds like it should be more thorough than `deleteReportCascade()`, but it actually does *less* — it only soft-deletes in Supabase while `deleteReportCascade()` hard-deletes everything. `deleteReportCascade()` doesn't appear to be called anywhere in normal flow (may be admin-only or unused).

#### 🟠 MAYBE — deleteReportCascade May Be Orphaned
`deleteReportCascade()` is exported to `window` but I don't see it called from the files audited so far. The normal delete flow uses `deleteReportFull()`. Need to verify in synthesis whether `deleteReportCascade` is called anywhere.

---

### 16.5 broadcast.js — BroadcastChannel Wrapper

#### Storage Operations: **NONE**

Pure cross-tab messaging via `BroadcastChannel('fieldvoice-sync')`. Provides `send()`, `listen()`, `close()` via `window.fvpBroadcast`.

#### 🟢 GOOD — Clean abstraction with graceful fallback when BroadcastChannel isn't supported.

---

### 16.6 console-capture.js — Remote Debug Logging

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `fvp_device_id` | Tag log entries with device (reads raw key, not via STORAGE_KEYS) |

#### Supabase Operations
| Operation | Table | Context |
|-----------|-------|---------|
| Insert log batch | `debug_logs` | Flush buffer every 3s (batch of 10) |

#### In-Memory State
| Variable | Purpose |
|----------|---------|
| `_buffer` | Ring buffer of last 500 log entries |

#### 🟢 GOOD — Ring Buffer with Batched Flushes
Prevents memory unbounded growth (500 max). Flushes in batches of 10 every 3 seconds. Also flushes on `pagehide` and `visibilitychange → hidden`.

#### 🟡 ISSUE — Uses Raw localStorage Key
Reads `fvp_device_id` directly from `localStorage.getItem()` instead of using `STORAGE_KEYS.DEVICE_ID`. Technically works but bypasses the constants.

---

### 16.7 pull-to-refresh.js — Mobile Pull-to-Refresh & Desktop Refresh Button

#### Storage Operations: **NONE (direct)**

Calls `flushInterviewBackup()`, `flushReportBackup()`, `drainPendingBackups()`, and `debugCapture.flush()` before triggering a page reload. These flush pending storage operations but pull-to-refresh itself doesn't read/write storage.

#### 🟢 GOOD — Flushes Before Reload
Ensures pending IDB/Supabase saves complete before the page reload destroys in-memory state.

---

### 16.8 supabase-retry.js — Exponential Backoff Utility

#### Storage Operations: **NONE**

Pure utility function. Retries an async function up to N times with exponential backoff (1s, 2s, 4s). Understands Supabase `{ data, error }` response format — treats `.error` as failure.

#### 🟢 GOOD — Clean, reusable, no side effects.

---

### 16.9 Summary — Shared Modules Storage Patterns

#### Storage Layer Usage

| File | localStorage | IndexedDB | Supabase | Supabase Storage | External API |
|------|:---:|:---:|:---:|:---:|:---:|
| realtime-sync.js | ✅ Read | ✅ Heavy (via dataStore) | ✅ Realtime + select | ❌ | ❌ |
| cloud-photos.js | ❌ | ❌ | ✅ Select + signed URLs | ✅ Signed URLs | ❌ |
| ai-assistant.js | ✅ R/W | ❌ | ❌ | ❌ | ✅ n8n webhook |
| delete-report.js | ✅ R/Delete | ✅ (via dataStore) | ✅ Heavy cascade | ✅ Photo + PDF delete | ❌ |
| broadcast.js | ❌ | ❌ | ❌ | ❌ | ❌ |
| console-capture.js | ✅ Read (raw) | ❌ | ✅ Insert (debug_logs) | ❌ | ❌ |
| pull-to-refresh.js | ❌ | ❌ (triggers flushes) | ❌ | ❌ | ❌ |
| supabase-retry.js | ❌ | ❌ | ❌ | ❌ | ❌ |

#### Key Findings

1. **🟢 GOOD — Strong shared infrastructure**: `delete-report.js` is the single-source delete cascade, `supabase-retry.js` provides reusable retry, `broadcast.js` handles cross-tab sync, and `console-capture.js` gives remote debugging. These are well-factored shared utilities.

2. **🟡 ISSUE — AI assistant conversation key outside STORAGE_KEYS**: The dynamic `fvp_ai_conversation_{userId}` key isn't tracked in the central key registry. Same for `console-capture.js` using raw `fvp_device_id`.

3. **🟡 ISSUE — Realtime tears down on every tab switch**: `visibilitychange → hidden` removes all Supabase channels, adding reconnection latency when returning to the tab.

4. **🟠 MAYBE — deleteReportCascade may be unused**: The hard-delete version exists but the normal flow uses `deleteReportFull()` (soft-delete). Need to verify in synthesis.

5. **🔁 DUPLICATE — Photo object mapping repeated**: `fetchCloudPhotos()` and `fetchCloudPhotosBatch()` have nearly identical row→object transformation code.

---

## 17. Auth + Settings + Login + Permissions
*Status: ✅ Complete*

### Files Analyzed
- `js/auth.js` (~320 lines)
- `js/settings/main.js` (~470 lines)
- `js/login/main.js` (~330 lines)
- `js/permissions/main.js` (~790 lines)

**Total: ~1,910 lines across 4 files**

---

### 17.1 auth.js — Shared Authentication Module

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.AUTH_ROLE` | Get stored role (inspector/admin) |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.AUTH_ROLE` | `'inspector'` or `'admin'` | `setAuthRole()` |
| `STORAGE_KEYS.USER_ID` | Profile UUID from `user_profiles.id` | `upsertAuthProfile()` |
| `STORAGE_KEYS.USER_NAME` | Full name | `upsertAuthProfile()` |
| `STORAGE_KEYS.USER_EMAIL` | Email | `upsertAuthProfile()` |
| `STORAGE_KEYS.AUTH_USER_ID` | Supabase Auth UUID | `upsertAuthProfile()` |
| `STORAGE_KEYS.ORG_ID` | Organization UUID | `ensureOrgIdCached()` |

#### localStorage Removals (signOut)
Removes ALL of these on sign-out:
- `AUTH_ROLE`, `ORG_ID`, `USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`
- `ACTIVE_REPORT_ID`, `ONBOARDED`, `PERMISSIONS_DISMISSED`
- `BANNER_DISMISSED`, `BANNER_DISMISSED_DATE`
- `PROJECTS`, `PROJECTS_CACHE_TS`, `ACTIVE_PROJECT_ID`
- All keys starting with `STORAGE_KEYS.AI_CONVERSATION` (wildcard cleanup)

#### IndexedDB Operations (via dataStore — signOut only)
| Operation | Stores Cleared | Context |
|-----------|---------------|---------|
| Clear stores | `currentReports`, `draftData`, `reportData`, `userProfile`, `projects` | `signOut()` — wipe all user data |

#### Supabase Operations
| Operation | Table/Service | Context |
|-----------|--------------|---------|
| Get session | `auth.getSession()` | `requireAuth()` — page-load gate |
| Get user | `auth.getUser()` | `getCurrentUser()` |
| Sign out | `auth.signOut()` | `signOut()` |
| Auth state listener | `auth.onAuthStateChange()` | `startAuthStateListener()` — TOKEN_REFRESHED, SIGNED_OUT |
| Periodic session check | `auth.getSession()` | Every 5 minutes via `startPeriodicSessionCheck()` |
| Upsert profile | `user_profiles` | `upsertAuthProfile()` |
| Select profile | `user_profiles` | `loadAuthProfile()`, `ensureOrgIdCached()` |

#### Browser API
| API | Purpose |
|-----|---------|
| `navigator.storage.persist()` | Request persistent storage to prevent browser eviction of localStorage/IDB |

#### Auth Architecture
- **`auth.ready`** — A Promise that other modules (e.g., `main.js`) can `await` to ensure auth session is established before making Supabase queries
- **Page-load gate**: Auto-runs `requireAuth()` on all pages except `login.html` and `landing.html`
- **Session monitoring**: Auth state listener + 5-minute periodic check. On expiry, shows a non-blocking warning (doesn't redirect — user may have unsaved work)
- **CQ-07**: Cleans up `_sessionCheckInterval` on sign-out to prevent leaked timers

#### 🟢 GOOD — Comprehensive Sign-Out Cleanup
`signOut()` clears 14+ localStorage keys, all AI conversation keys (wildcard), and 5 IndexedDB stores. This is enterprise-grade cleanup for shared-device scenarios.

#### 🟢 GOOD — Non-Blocking Session Expiry
When session expires, shows a toast warning instead of force-redirecting. This prevents data loss if the user is mid-edit.

#### 🟢 GOOD — Persistent Storage Request
`navigator.storage.persist()` on every page load prevents browsers from evicting localStorage/IDB under storage pressure. Idempotent and harmless.

#### 🟡 ISSUE — ensureOrgIdCached Runs on Every Page Load
`ensureOrgIdCached()` fires on every protected page's DOMContentLoaded if `ORG_ID` is not in localStorage. If the first page load fails (offline), every subsequent page will retry the Supabase query. Could use a "tried and failed" flag.

---

### 17.2 settings/main.js — Inspector Profile Settings

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.USER_NAME` | Pre-populate name field instantly before async load |
| `STORAGE_KEYS.USER_EMAIL` | Pre-populate email field instantly |
| `STORAGE_KEYS.USER_ID` | Get current profile ID for updates |
| `STORAGE_KEYS.SETTINGS_SCRATCH` | Restore unsaved form state (scratch pad) |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.SETTINGS_SCRATCH` | JSON object with all form fields + `hasUnsavedChanges` flag | Every keystroke when dirty |
| `STORAGE_KEYS.USER_ID` | Profile UUID from Supabase | After successful save |
| `STORAGE_KEYS.USER_NAME` | Full name | After Supabase save or cloud refresh |
| `STORAGE_KEYS.USER_EMAIL` | Email | After Supabase save or cloud refresh |

#### localStorage Removals
| Key | Trigger |
|-----|---------|
| `STORAGE_KEYS.SETTINGS_SCRATCH` | After successful save (via `clearScratchData()`) |

#### IndexedDB Operations (via dataLayer)
| Operation | Method | Context |
|-----------|--------|---------|
| Load profile | `window.dataLayer.loadUserSettings()` | `loadSettings()` — IDB first, Supabase fallback |
| Save profile | `window.dataLayer.saveUserSettings(profile)` | `saveSettings()` — local-first save |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Get session | `auth.getSession()` | `saveSettings()` — get auth_user_id |
| Upsert profile | `user_profiles` | `saveSettings()` — cloud backup after IDB save |
| Select profile | `user_profiles` | `refreshFromCloud()` — pull latest from cloud |

#### Nuclear Reset (`resetAllData()`)
1. `localStorage.clear()` — clears ALL localStorage
2. `sessionStorage.clear()` — clears ALL sessionStorage
3. `indexedDB.deleteDatabase('fieldvoice-pro')` — destroys entire IDB database
4. `caches.keys()` → `caches.delete()` — clears all service worker caches
5. Service worker unregistration
6. Redirect to `index.html`

#### PWA Refresh (`executeRefresh()`)
1. Delete all caches (order matters: caches before SW unregister)
2. Unregister all service workers
3. Cache-busting redirect (`?refresh=<timestamp>`)
4. **Note**: localStorage is preserved — user data is safe

#### 🟢 GOOD — Scratch Pad Pattern
Unsaved form changes are persisted to localStorage on every keystroke via `SETTINGS_SCRATCH`. If the user navigates away accidentally, changes are restored on next visit. Cleared after successful save.

#### 🟢 GOOD — Instant Pre-Population
Form fields are pre-populated from `localStorage` immediately (synchronous), then overwritten with full data from IDB/Supabase (async). This eliminates the "empty form flicker."

#### 🟡 ISSUE — Scratch Pad Writes on Every Keystroke
`saveScratchData()` calls `localStorage.setItem()` with a JSON-stringified object on every `input` event. On fast typists, this could cause micro-jank. Could debounce to 500ms.

#### 🔵 IMPROVEMENT — refreshFromCloud Marks Dirty but Doesn't Auto-Save
After pulling cloud data, the form is marked dirty and the user must click Save. This is intentional (prevents overwrites) but could confuse users expecting "refresh = sync."

---

### 17.3 login/main.js — Sign In / Sign Up / Role Selection

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.AUTH_ROLE` | `'inspector'` or `'admin'` | `handleSignIn()` (existing role) or `selectRole()` |
| `STORAGE_KEYS.USER_ID` | Profile UUID | `handleSignIn()` or `handleSignUp()` |
| `STORAGE_KEYS.USER_NAME` | Full name | `handleSignIn()` or `handleSignUp()` |
| `STORAGE_KEYS.USER_EMAIL` | Email | `handleSignIn()` or `handleSignUp()` |
| `STORAGE_KEYS.AUTH_USER_ID` | Supabase Auth UUID | `handleSignIn()` or `handleSignUp()` |
| `STORAGE_KEYS.ORG_ID` | Organization UUID | `handleSignIn()` (if profile has org) or `handleSignUp()` |

#### Supabase Operations
| Operation | Table/Service | Context |
|-----------|--------------|---------|
| Sign in | `auth.signInWithPassword()` | `handleSignIn()` |
| Sign up | `auth.signUp()` | `handleSignUp()` |
| Select profile | `user_profiles` | `handleSignIn()` — check for existing role |
| Select org | `organizations` | `handleSignUp()` — validate org code/slug |
| Upsert profile | `user_profiles` | `handleSignUp()` — create profile with org_id |
| Update profile | `user_profiles` | `handleSignIn()` — update device_id + device_info |
| Update role | `user_profiles` | `selectRole()` — set role after role picker |
| Upsert device | `user_devices` | `handleSignIn()` + `handleSignUp()` — Sprint 13 multi-device tracking |
| Get session | `auth.getSession()` | `checkExistingSession()` — redirect if already logged in |

#### 🟢 GOOD — Organization Validation Before Signup
`handleSignUp()` validates the org code against `organizations.slug` **before** creating the auth account. This prevents orphaned auth users with no org.

#### 🟢 GOOD — Device Tracking on Login
Updates both `user_profiles.device_id/device_info` and `user_devices` table on every sign-in. Captures user agent, platform, screen size, and timestamp.

#### 🟡 ISSUE — Duplicate localStorage Writes
Both `handleSignIn()` and `handleSignUp()` write the same set of localStorage keys (`USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`, `ORG_ID`). This is also done in `auth.js`'s `upsertAuthProfile()`. The same data is written in 3 different places — could extract to a shared `cacheUserProfile()` helper.

#### 🔁 DUPLICATE — Profile Caching Logic
The "store profile fields to localStorage" pattern (`USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`) exists in:
- `auth.js` → `upsertAuthProfile()`
- `login/main.js` → `handleSignIn()` and `handleSignUp()`
- `settings/main.js` → `saveSettings()` and `refreshFromCloud()`

All 4 locations write the same keys with slightly different source data. A single `cacheUserLocally(profile)` function would eliminate this duplication.

---

### 17.4 permissions/main.js — Device Permission Onboarding

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.MIC_GRANTED` | Check if microphone already granted |
| `STORAGE_KEYS.CAM_GRANTED` | Check if camera already granted |
| `STORAGE_KEYS.LOC_GRANTED` | Check if location already granted |
| `STORAGE_KEYS.SPEECH_GRANTED` | Check if speech recognition already granted |
| `STORAGE_KEYS.ONBOARDED` | Check if already completed onboarding |

#### localStorage Writes
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.MIC_GRANTED` | `'true'` | Microphone permission granted (sequential or manual) |
| `STORAGE_KEYS.MIC_TIMESTAMP` | `Date.now().toString()` | Microphone permission granted |
| `STORAGE_KEYS.CAM_GRANTED` | `'true'` | Camera permission granted |
| `STORAGE_KEYS.ONBOARDED` | `'true'` | `finishSetup()` — user completes onboarding |

#### localStorage Removals (clearLocalPermissionState)
Removes: `MIC_GRANTED`, `MIC_TIMESTAMP`, `CAM_GRANTED`, `SPEECH_GRANTED`, `ONBOARDED`
Also calls `clearCachedLocation()` (location.js) for GPS cache.

#### Location Storage (via location.js)
| Function | Purpose |
|----------|---------|
| `cacheLocation(lat, lng)` | Cache GPS coordinates after successful location permission |
| `clearCachedLocation()` | Clear cached location when resetting permissions |

#### Browser APIs Used
| API | Purpose |
|-----|---------|
| `navigator.permissions.query()` | Check current permission state before requesting |
| `navigator.mediaDevices.getUserMedia()` | Request mic and camera |
| `navigator.geolocation.getCurrentPosition()` | Request location |
| `navigator.clipboard.writeText()` | Copy debug log |

#### Flow Architecture
1. **Welcome screen** → choice: sequential flow or manual setup
2. **Sequential**: mic → cam → loc → summary (auto-advances on grant/skip)
3. **Manual**: all 3 permissions as independent cards with Retry buttons
4. **Summary**: shows granted/denied/skipped count → finish redirects to dashboard

#### 🟢 GOOD — Comprehensive Permission UX
Two paths (sequential guided flow + manual mode), device-specific messaging (iOS/Safari warnings), debug console with copy-to-clipboard, and error code mapping for troubleshooting. Very polished.

#### 🟢 GOOD — Permission State Pre-Check
Uses `navigator.permissions.query()` to check current state before requesting. Adjusts UI messaging ("Previously granted — checking..." vs "Tap Allow in the dialog"). Gracefully handles browsers that don't support the Permissions API.

#### 🟡 ISSUE — LOC_GRANTED Not Set Directly
Unlike `MIC_GRANTED` and `CAM_GRANTED` which are set in this file, `LOC_GRANTED` is set indirectly via `cacheLocation()` in `location.js`. The check in `checkExistingPermissions()` reads `LOC_GRANTED` from localStorage, but the write happens in a different file. This split makes the flow harder to trace.

#### 🟡 ISSUE — SPEECH_GRANTED Referenced But Speech Flow Removed
`STORAGE_KEYS.SPEECH_GRANTED` is checked in `init()` and cleared in `clearLocalPermissionState()`, but the speech permission flow was apparently removed from the sequential flow (sequence is mic → cam → loc → summary, no speech step). The key and `permissionResults.speech` are vestigial.

---

### 17.5 Summary — Auth & Settings Storage Patterns

#### Storage Layer Usage

| File | localStorage | sessionStorage | IndexedDB | Supabase |
|------|:---:|:---:|:---:|:---:|
| auth.js | ✅ Heavy R/W/Delete | ❌ | ✅ Clear on signout | ✅ Auth + user_profiles |
| settings/main.js | ✅ Heavy R/W (scratch) | ❌ | ✅ via dataLayer | ✅ user_profiles |
| login/main.js | ✅ Heavy Write | ❌ | ❌ | ✅ Heavy (auth + profiles + orgs + devices) |
| permissions/main.js | ✅ Heavy R/W | ❌ | ❌ | ❌ |

#### Key Findings

1. **🔁 DUPLICATE — Profile Caching in 4 Places**: The `USER_ID` / `USER_NAME` / `USER_EMAIL` / `AUTH_USER_ID` localStorage writes are repeated in `auth.js`, `login/main.js` (×2), and `settings/main.js` (×2). Should be a single `cacheUserLocally()` helper.

2. **🟢 GOOD — Enterprise-Grade Sign-Out**: `signOut()` clears 14+ localStorage keys, wildcard AI conversation keys, and 5 IDB stores. Prevents identity leakage on shared devices.

3. **🟢 GOOD — Scratch Pad for Settings**: Unsaved form changes survive accidental navigation. Cleaned up after save.

4. **🟡 ISSUE — Vestigial SPEECH_GRANTED**: Referenced but speech permission flow was removed. Dead code.

5. **🔵 IMPROVEMENT — Scratch Pad Could Be Debounced**: Writing JSON to localStorage on every keystroke could cause micro-jank. 500ms debounce would be better.

---

## 18. Archives + UI Utils + PWA Utils + Media Utils
*Status: ✅ Complete*

### Files Analyzed
- `js/archives/main.js` (~310 lines)
- `js/ui-utils.js` (~340 lines)
- `js/pwa-utils.js` (~155 lines)
- `js/media-utils.js` (~290 lines)

**Total: ~1,095 lines across 4 files**

---

### 18.1 archives/main.js — Submitted Report Archives

#### localStorage Reads
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.ORG_ID` | Filter projects and reports by organization |

#### IndexedDB Operations (via idb — custom cache)
| Operation | Method | Context |
|-----------|--------|---------|
| Save cached archive | `window.idb.saveCachedArchive(key, data)` | Cache projects + reports after cloud fetch |
| Get cached archive | `window.idb.getCachedArchive(key)` | Offline fallback — load cached data |

#### Supabase Operations (Direct)
| Operation | Table | Context |
|-----------|-------|---------|
| Select projects | `projects` | `loadProjects()` — active projects filtered by org_id |
| Select reports | `reports` (+ join `projects`) | `loadReports()` — submitted reports with project names and pdf_url |

#### Architecture
- **Online-first**: Fetches directly from Supabase on every load
- **Offline fallback**: Caches fetched data to IDB via `saveCachedArchive()`, restores from `getCachedArchive()` when offline
- **Sprint 13**: `pdf_url` now lives on `reports` table directly (no more `final_reports` join)

#### 🟢 GOOD — Offline Caching Strategy
Archives caches fetched data to IndexedDB for offline viewing. When offline, renders cached data with a subtle warning banner. Clean separation between online and offline paths.

#### 🟡 ISSUE — Uses Custom IDB Cache Methods
`saveCachedArchive()` and `getCachedArchive()` are separate from the `dataStore` abstraction. This appears to be a simple key-value cache store in IDB, but it's not documented in the main IDB schema (Chunk 4). May use a separate object store.

#### 🟡 ISSUE — Bypasses dataLayer for Projects
Archives calls `supabaseClient.from('projects').select(...)` directly instead of using `window.dataLayer.loadProjects()`. This means it doesn't benefit from the dataLayer's IDB caching or normalization.

#### 🔵 IMPROVEMENT — No Pagination
`loadReports()` fetches ALL submitted reports in one query. For active organizations with many reports, this could become slow. Could add pagination or date-range filtering.

---

### 18.2 ui-utils.js — Shared UI Utilities

#### localStorage Reads (Location Functions)
| Key | Purpose |
|-----|---------|
| `STORAGE_KEYS.LOC_GRANTED` | Check if location permission granted |
| `STORAGE_KEYS.LOC_LAT` | Cached latitude |
| `STORAGE_KEYS.LOC_LNG` | Cached longitude |
| `STORAGE_KEYS.LOC_TIMESTAMP` | When location was cached (for staleness check) |

#### localStorage Writes (Location Functions)
| Key | Value | Trigger |
|-----|-------|---------|
| `STORAGE_KEYS.LOC_LAT` | Latitude string | `cacheLocation()` |
| `STORAGE_KEYS.LOC_LNG` | Longitude string | `cacheLocation()` |
| `STORAGE_KEYS.LOC_TIMESTAMP` | `Date.now().toString()` | `cacheLocation()` |
| `STORAGE_KEYS.LOC_GRANTED` | `'true'` | `cacheLocation()` |

#### localStorage Removals
| Keys | Trigger |
|------|---------|
| `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `LOC_GRANTED` | `clearCachedLocation()` |

#### Exported Functions — Pure Utilities (No Storage)
| Function | Purpose |
|----------|---------|
| `escapeHtml(str)` | XSS prevention |
| `generateId()` | UUID generation via `crypto.randomUUID()` |
| `showToast(message, type, durationMs, onClick)` | Toast notifications |
| `formatDate(dateStr, format)` | Date formatting (short/long/numeric) |
| `formatDateTime(isoStr)` | Date+time formatting |
| `formatTime(timeStr)` | Time formatting (24h → 12h) |
| `autoExpand(textarea)` | Auto-expand textareas |
| `initAutoExpand(textarea)` | Initialize auto-expand behavior |
| `initAllAutoExpandTextareas()` | Batch initialize |
| `getLocalDateString(date)` | Timezone-safe YYYY-MM-DD |

#### Exported Functions — Location (With Storage)
| Function | Purpose | Storage |
|----------|---------|---------|
| `getCachedLocation()` | Get cached GPS from localStorage | Read |
| `cacheLocation(lat, lng)` | Save GPS to localStorage | Write |
| `clearCachedLocation()` | Clear cached GPS | Remove |
| `isLocationStale(maxAgeMs)` | Check if cached location is older than threshold | Read |
| `getLocationFromCache(maxAgeMs)` | Get cached location if fresh enough | Read |
| `getFreshLocation()` | Get live GPS, fall back to cache | Read/Write |

#### 🟢 GOOD — Browser Permission as Authority for Location
`getFreshLocation()` checks `navigator.permissions.query({ name: 'geolocation' })` FIRST, not localStorage. If the browser says 'granted', it gets GPS regardless of localStorage state. This handles the case where localStorage was cleared but browser permission persists.

#### 🟢 GOOD — formatDate Timezone Fix
`formatDate()` adds `'T12:00:00'` to date-only strings before parsing, preventing UTC-offset timezone issues (e.g., "2026-01-15" being displayed as Jan 14 in CST).

#### 🟡 ISSUE — Location Functions Mixed into UI Utils
Location caching (localStorage read/write) is embedded in `ui-utils.js` alongside pure formatting functions. These are conceptually different — location is a data concern, not a UI concern. Could be in its own `location.js` module.

---

### 18.3 pwa-utils.js — PWA Service Worker & Offline Detection

#### Storage Operations: **NONE (direct)**

This file manages service worker lifecycle and offline UI — no localStorage, IndexedDB, or Supabase calls.

#### Browser APIs
| API | Purpose |
|-----|---------|
| `navigator.serviceWorker.register()` | Register `sw.js` service worker |
| `navigator.storage.persist()` | Request persistent storage (prevent eviction) |

#### Exported Functions
| Function | Purpose |
|----------|---------|
| `initPWA(options)` | Entry point — sets up navigation, SW, and offline banner |
| `setupPWANavigation()` | Prevent standalone PWA from breaking out on link clicks |
| `registerServiceWorker()` | Register SW with update detection |
| `setupOfflineBanner(onOnline, onOffline)` | Show/hide offline indicator |
| `injectOfflineBanner(message)` | Dynamically create offline banner HTML |
| `showUpdateBanner()` | Show "Update available — tap to refresh" banner |

#### 🟢 GOOD — Standalone PWA Link Handling
`setupPWANavigation()` intercepts internal link clicks in standalone mode (`window.navigator.standalone`) to prevent Safari from opening them in a new browser window.

#### 🟢 GOOD — Update Detection
Detects new service worker installations and shows an update banner. Simple and effective.

#### 🔁 DUPLICATE — navigator.storage.persist() Called in Two Places
`registerServiceWorker()` in pwa-utils.js calls `navigator.storage.persist()`, and so does `auth.js` on every page load. Both are idempotent, but it's unnecessary duplication.

---

### 18.4 media-utils.js — Photo Compression, GPS, & Logo Storage

#### localStorage Operations (via location functions from ui-utils.js)
| Function | Storage Effect |
|----------|---------------|
| `cacheLocation()` | Writes `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `LOC_GRANTED` (called from `getHighAccuracyGPS()`) |
| `clearCachedLocation()` | Removes location keys (called when GPS permission denied) |
| `getCachedLocation()` | Reads location keys (fallback when GPS fails) |

#### Supabase Storage Operations
| Operation | Bucket | Context |
|-----------|--------|---------|
| Upload logo | `project-logos` | `uploadLogoToStorage()` |
| Delete logo files | `project-logos` | `deleteLogoFromStorage()` — tries 5 extensions |
| Create signed URL | `project-logos` | `uploadLogoToStorage()` — SEC-03/04: signed URL instead of public |

#### Exported Functions — Pure Utilities (No Storage)
| Function | Purpose |
|----------|---------|
| `readFileAsDataURL(file)` | FileReader wrapper |
| `dataURLtoBlob(dataURL)` | Data URL → Blob conversion |
| `compressImage(dataUrl, maxWidth, quality)` | Compress image for general use (1200px, 0.7 JPEG) |
| `compressImageToThumbnail(file, maxWidth, quality)` | Compress for local storage (400px, 0.7 JPEG) |

#### Exported Functions — With Storage
| Function | Purpose | Storage |
|----------|---------|---------|
| `uploadLogoToStorage(file, projectId)` | Upload logo to Supabase Storage, return signed URL | Supabase Storage |
| `deleteLogoFromStorage(projectId)` | Remove logo files from Supabase Storage | Supabase Storage |
| `getHighAccuracyGPS(showWeakSignalWarning)` | Multi-reading GPS with accuracy selection | localStorage (via cacheLocation) |

#### GPS Multi-Reading Strategy
1. Takes 3 GPS readings at 0s, 1.5s, and 3s
2. Selects the reading with the lowest accuracy value (most precise)
3. Caches the best result via `cacheLocation()`
4. Falls back to cached location if all readings fail
5. Warns if accuracy > 100m

#### 🟢 GOOD — SEC-03/04: Signed URLs for Logos
`uploadLogoToStorage()` generates a signed URL (1-hour expiry) instead of a public URL. This prevents unauthorized access to logos in the storage bucket.

#### 🟢 GOOD — Multi-Reading GPS Strategy
`getHighAccuracyGPS()` takes multiple readings and picks the best one. Handles permission denial, timeout, and weak signal gracefully with appropriate fallbacks.

#### 🟡 ISSUE — Logo Delete Tries 5 Extensions Blindly
`deleteLogoFromStorage()` tries to delete `{projectId}.png`, `.jpg`, `.jpeg`, `.gif`, `.svg` — it doesn't know which extension was used. This is a workaround for not storing the extension, but it generates up to 5 failed storage API calls per delete.

#### 🔵 IMPROVEMENT — Logo Signed URL Expires in 1 Hour
The signed URL from `uploadLogoToStorage()` is stored in `currentProject.logoUrl` and saved to the project row. After 1 hour, this URL is expired. When the project loads later, the logo won't display unless re-signed. Should generate fresh signed URLs on load, or use a longer expiry.

---

### 18.5 Summary — Archives + Utilities Storage Patterns

#### Storage Layer Usage

| File | localStorage | IndexedDB | Supabase | Supabase Storage | Browser APIs |
|------|:---:|:---:|:---:|:---:|:---:|
| archives/main.js | ✅ Read | ✅ Custom cache | ✅ Direct queries | ❌ | ❌ |
| ui-utils.js | ✅ R/W/Delete (location) | ❌ | ❌ | ❌ | ✅ Geolocation + Permissions |
| pwa-utils.js | ❌ | ❌ | ❌ | ❌ | ✅ ServiceWorker + Persistent Storage |
| media-utils.js | ✅ (via location funcs) | ❌ | ❌ | ✅ Logo upload/delete | ✅ Geolocation |

#### Key Findings

1. **🟡 ISSUE — Location Logic in ui-utils.js**: 6 location-related functions with localStorage read/write are embedded in what should be a pure UI utility file. Should be extracted to a dedicated `location.js`.

2. **🟡 ISSUE — Archives Bypasses dataLayer**: Directly queries Supabase for projects instead of using the shared data layer, missing out on caching and normalization.

3. **🔵 IMPROVEMENT — Logo URL Expiry**: Signed URLs (1 hour) are stored persistently. After expiry, logos won't display until the URL is regenerated. Should either use longer expiry or regenerate on load.

4. **🔁 DUPLICATE — navigator.storage.persist()**: Called in both `pwa-utils.js` and `auth.js`. Harmless but redundant.

5. **🟢 GOOD — GPS Multi-Reading**: `getHighAccuracyGPS()` takes 3 readings and picks the most accurate one. Smart approach for construction sites where GPS signal varies.

---

## 19. ERDs + Data Flow Maps + Table↔Frontend Matrix
*Status: ✅ Complete*

### 19.1 Entity Relationship Diagram — Supabase Tables

```mermaid
erDiagram
    organizations ||--o{ projects : "org_id"
    organizations ||--o{ reports : "org_id"
    organizations ||--o{ report_data : "org_id"
    organizations ||--o{ photos : "org_id"
    organizations ||--o{ interview_backup : "org_id"
    organizations ||--o{ ai_submissions : "org_id"
    organizations ||--o{ user_profiles : "org_id"

    user_profiles ||--o{ user_devices : "user_id"

    projects ||--o{ reports : "project_id"

    reports ||--|| report_data : "report_id (PK)"
    reports ||--o{ photos : "report_id"
    reports ||--o| interview_backup : "report_id"
    reports ||--o| report_backup : "report_id (DEPRECATED)"
    reports ||--o{ ai_submissions : "report_id"
    reports ||--o| final_reports : "report_id (LEGACY)"

    organizations {
        uuid id PK
        text name
        text slug
    }

    projects {
        uuid id PK
        uuid org_id FK
        uuid user_id
        text project_name
        jsonb contractors
        text status
    }

    reports {
        uuid id PK
        uuid project_id FK
        uuid org_id FK
        uuid user_id
        date report_date
        text status
        text pdf_url
        timestamptz submitted_at
        timestamptz dashboard_dismissed_at
    }

    report_data {
        uuid report_id PK-FK
        jsonb ai_generated
        jsonb original_input
        jsonb user_edits
        text capture_mode
    }

    photos {
        uuid id PK
        uuid report_id
        text storage_path
        text caption
        numeric location_lat
        numeric location_lng
    }

    interview_backup {
        uuid id PK
        uuid report_id
        jsonb page_state
        uuid org_id FK
    }

    user_profiles {
        uuid id PK
        uuid auth_user_id
        text full_name
        text role
        uuid org_id FK
    }

    user_devices {
        uuid id PK
        uuid user_id FK
        text device_id
        jsonb device_info
    }

    final_reports {
        uuid id PK
        uuid report_id
        text pdf_url
        text status
    }

    ai_submissions {
        uuid id PK
        uuid report_id
        jsonb original_input
        jsonb ai_response
    }

    debug_logs {
        uuid id PK
        text level
        text message
        text page
    }

    report_backup {
        uuid id PK
        uuid report_id
        jsonb page_state
    }
```

### 19.2 Data Flow Diagram — Report Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        REPORT LIFECYCLE                              │
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌───────────┐ │
│  │ DASHBOARD │───→│  INTERVIEW   │───→│  REPORT  │───→│  SUBMIT   │ │
│  │ (create)  │    │ (field data) │    │ (review) │    │ (finalize)│ │
│  └────┬─────┘    └──────┬───────┘    └────┬─────┘    └─────┬─────┘ │
│       │                  │                 │                 │       │
│  ┌────▼─────┐    ┌──────▼───────┐    ┌────▼─────┐    ┌─────▼─────┐ │
│  │Supabase  │    │ localStorage │    │ IDB      │    │ Supabase  │ │
│  │reports   │    │ (fallback)   │    │reportData│    │ reports   │ │
│  │(draft)   │    │              │    │(refined) │    │(submitted)│ │
│  └──────────┘    │ IDB          │    │          │    │           │ │
│                  │ draftData    │    │ Supabase │    │ Storage   │ │
│                  │              │    │report_data│    │report-pdfs│ │
│                  │ Supabase     │    └──────────┘    └───────────┘ │
│                  │ interview_   │                                   │
│                  │ backup       │                                   │
│                  └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘

SYNC LAYER (runs on all pages):
  ┌──────────────────────────────────────────────────┐
  │ realtime-sync.js — Supabase Realtime channels    │
  │ broadcast.js — BroadcastChannel cross-tab sync   │
  │ cloud-recovery.js — Cross-device draft recovery  │
  │ data-store.js — syncReportsFromCloud()           │
  └──────────────────────────────────────────────────┘
```

### 19.3 Three-Tier Storage Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    BROWSER (Client)                           │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐│
│  │ localStorage  │   │  IndexedDB   │   │  sessionStorage  ││
│  │ (30 keys)     │   │ (7 stores)   │   │ (1 key)          ││
│  │               │   │              │   │                   ││
│  │ • Identity    │   │ • projects   │   │ • SUBMITTED_     ││
│  │ • Permissions │   │ • userProfile│   │   BANNER_        ││
│  │ • UX State    │   │ • photos     │   │   DISMISSED      ││
│  │ • Location    │   │ • current-   │   └──────────────────┘│
│  │ • Projects    │   │   Reports    │                        │
│  │   (cache)     │   │ • draftData  │                        │
│  │ • Sync ctrl   │   │ • cached-    │                        │
│  │ • Form state  │   │   Archives   │                        │
│  └───────┬───────┘   │ • reportData │                        │
│          │            └──────┬───────┘                        │
│          │                   │                                │
│  ┌───────▼───────────────────▼───────┐                       │
│  │       DATA ABSTRACTION LAYER       │                       │
│  │                                    │                       │
│  │  data-layer.js (projects, profile) │                       │
│  │  data-store.js (reports, drafts,   │                       │
│  │    photos, cloud sync)             │                       │
│  └───────────────┬───────────────────┘                       │
└──────────────────┼───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    SUPABASE (Cloud)                           │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐│
│  │  Tables   │  │ Storage  │  │ Realtime │  │    Auth      ││
│  │ (12)      │  │ (3)      │  │ (2 ch)   │  │             ││
│  │           │  │          │  │          │  │             ││
│  │ reports   │  │ report-  │  │ reports  │  │ signIn/Up   ││
│  │ report_   │  │  photos  │  │ projects │  │ getSession  ││
│  │  data     │  │ report-  │  │          │  │ onAuthState ││
│  │ projects  │  │  pdfs    │  │          │  │  Change     ││
│  │ photos    │  │ project- │  └──────────┘  └─────────────┘│
│  │ interview │  │  logos   │                                │
│  │  _backup  │  └──────────┘                                │
│  │ user_     │                                              │
│  │  profiles │                                              │
│  │ ...       │                                              │
│  └──────────┘                                               │
└──────────────────────────────────────────────────────────────┘
```

### 19.4 Supabase Table ↔ Frontend File Matrix

Shows which JS files access which Supabase tables (direct `.from()` calls only, not via abstraction layer).

| Supabase Table | Direct Frontend Callers |
|----------------|------------------------|
| `reports` | report-creation.js, report-cards.js, submit.js, data-loading.js, autosave.js, delete-report.js (shared), realtime-sync.js, cloud-recovery.js, archives/main.js, data-store.js |
| `report_data` | data-loading.js, autosave.js, ai-refine.js, submit.js, realtime-sync.js, cloud-recovery.js, data-store.js |
| `projects` | crud.js (project-config), archives/main.js, data-layer.js |
| `photos` | persistence.js (interview), cloud-photos.js, delete-report.js (shared) |
| `interview_backup` | persistence.js (interview), cloud-recovery.js |
| `report_backup` | delete-report.js (shared) — **delete only** |
| `final_reports` | delete-report.js (shared) — **read pdf_url + delete only** |
| `ai_submissions` | ai-refine.js, delete-report.js (shared) |
| `organizations` | login/main.js |
| `user_profiles` | auth.js, login/main.js, settings/main.js |
| `user_devices` | login/main.js |
| `debug_logs` | console-capture.js |

### 19.5 IndexedDB Store ↔ Frontend File Matrix

| IDB Store | Accessed By (via `window.idb.*` or `window.dataStore.*`) |
|-----------|----------------------------------------------------------|
| `projects` | data-layer.js, data-store.js, projects/main.js, project-config/crud.js, project-config/main.js, index/main.js |
| `userProfile` | data-layer.js |
| `photos` | data-store.js, persistence.js (interview) |
| `currentReports` | data-store.js, index/main.js |
| `draftData` | data-store.js, persistence.js (interview) |
| `cachedArchives` | archives/main.js |
| `reportData` | data-store.js, data-loading.js (report) |

### 19.6 Complete localStorage Key Inventory

**30 registered keys** (in `STORAGE_KEYS`) + **5 unregistered patterns**:

#### Registered Keys by Lifecycle

| Phase | Keys | Written By | Read By |
|-------|------|-----------|---------|
| **Login** | `USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`, `AUTH_ROLE`, `ORG_ID` | auth.js, login/main.js, settings/main.js | Nearly all files |
| **Onboarding** | `ONBOARDED`, `MIC_GRANTED`, `MIC_TIMESTAMP`, `CAM_GRANTED`, `LOC_GRANTED`, `SPEECH_GRANTED` | permissions/main.js | index/main.js, permissions/main.js |
| **Location** | `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP` | ui-utils.js (cacheLocation) | ui-utils.js, weather.js, panels.js |
| **Dashboard** | `ACTIVE_PROJECT_ID`, `ACTIVE_REPORT_ID`, `PROJECTS`, `PROJECTS_CACHE_TS` | projects/main.js, report-creation.js, data-layer.js | index/main.js, report-cards.js, cloud-recovery.js |
| **UX** | `BANNER_DISMISSED`, `BANNER_DISMISSED_DATE`, `DICTATION_HINT_DISMISSED`, `PERMISSIONS_DISMISSED`, `SUBMITTED_BANNER_DISMISSED` | index/main.js, interview modules | index/main.js |
| **Sync** | `DELETED_REPORT_IDS`, `MIGRATION_V113_IDB_CLEAR` | storage-keys.js, index/main.js | realtime-sync.js, cloud-recovery.js |
| **Features** | `AI_CONVERSATION`, `MARKUP_PHOTO`, `SETTINGS_SCRATCH` | ai-assistant.js, photos.js, settings/main.js | Same files |
| **Device** | `DEVICE_ID` | storage-keys.js (auto-generated) | Many files |

#### Unregistered / Dynamic Keys

| Key Pattern | Source | Purpose |
|-------------|--------|---------|
| `fvp_ai_response_{hash}` | ai-refine.js | AI response cache (24h TTL, cleaned up by index/main.js) |
| `fvp_ai_conversation_{userId}` | ai-assistant.js | Per-user conversation (dynamic suffix) |
| `fvp_backup_stale_{reportId}` | persistence.js (interview) | Stale backup detection flag |
| `fvp_device_id` | console-capture.js | **Raw key access** (should use `STORAGE_KEYS.DEVICE_ID`) |
| `sb-*` | Supabase SDK | Auth tokens (managed by Supabase, not app code) |

### 19.7 IndexedDB ↔ Supabase Sync Map

| IDB Store | Supabase Table | Sync Direction | Sync Mechanism | Primary Authority |
|-----------|---------------|----------------|----------------|-------------------|
| `projects` | `projects` | Cloud → IDB | `dataLayer.refreshProjectsFromCloud()` | **Cloud** (IDB is cache) |
| `userProfile` | `user_profiles` | Bidirectional | `dataLayer.loadUserSettings()` / `saveUserSettings()` | **Cloud** (IDB is local-first cache) |
| `photos` | `photos` + `report-photos` bucket | IDB → Cloud | `uploadPhotoToSupabase()` in persistence.js | **IDB** (source of truth during capture, synced to cloud) |
| `currentReports` | `reports` | Bidirectional | `dataStore.syncReportsFromCloud()`, Realtime subscriptions | **Cloud** (IDB reconciled via timestamp comparison) |
| `draftData` | `interview_backup` | IDB → Cloud | `backupToSupabase()` in persistence.js, fire-and-forget | **IDB** (cloud is backup, recovered cross-device) |
| `reportData` | `report_data` | Bidirectional | `dataStore.loadReportData()` / autosave.js | **Cloud** (IDB is cache for offline/cross-page) |
| `cachedArchives` | `reports` (submitted) | Cloud → IDB | `cacheArchiveData()` in archives/main.js | **Cloud** (IDB is offline cache only) |

#### Sync Conflict Resolution

| Scenario | Resolution Strategy |
|----------|-------------------|
| Report modified on two devices | Cloud wins — `syncReportsFromCloud()` uses `updated_at` timestamp comparison |
| Interview draft on two devices | Last write wins — `interview_backup` has no conflict detection |
| Project modified on two devices | Cloud wins — full replace from `refreshProjectsFromCloud()` |
| Report deleted on one device | Blocklist pattern — `DELETED_REPORT_IDS` prevents resurrection via Realtime |
| Report transitions to 'refined' | Realtime triggers redirect + report_data cache refresh |

### 19.8 Data Access Pattern Summary

| Access Pattern | Used By | Files |
|---------------|---------|-------|
| **Via dataLayer** (correct) | Projects load/refresh, profile load/save | data-layer.js → consumers |
| **Via dataStore** (correct) | Reports, drafts, photos, report data, cloud sync | data-store.js → consumers |
| **Direct IDB** (bypasses abstractions) | Project CRUD, IDB init | project-config/crud.js, project-config/main.js |
| **Direct Supabase** (bypasses abstractions) | Report creation, dismiss, archive load, AI refine, photo upload, auth, login | 15+ files |
| **Direct localStorage** (bypasses STORAGE_KEYS) | AI cache cleanup, device_id in console-capture, AI conversation key | 3 files |

---

## 20. Duplicate Code + Misplaced Storage + Orphaned Tables + Recommendations
*Status: ✅ Complete*

---

### 20.1 Duplicate Code Analysis

#### DUP-01: Profile Caching to localStorage (4 locations)
**Severity:** 🟡 Medium — maintenance burden, divergence risk

The pattern of writing `USER_ID`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID` to localStorage is repeated in:

| File | Function | Trigger |
|------|----------|---------|
| `auth.js` | `upsertAuthProfile()` | Profile create/update |
| `login/main.js` | `handleSignIn()` | After successful sign-in |
| `login/main.js` | `handleSignUp()` | After successful sign-up |
| `settings/main.js` | `saveSettings()` | After saving profile |
| `settings/main.js` | `refreshFromCloud()` | After pulling cloud profile |

**Fix:** Extract a single `cacheUserLocally(profile)` function in `auth.js` and call it from all 5 locations.

---

#### DUP-02: Three-Tier Update Pattern (Cloud → IDB → Cache → Render)
**Severity:** 🟡 Medium — each implementation is slightly different

The "update Supabase → update IDB → update in-memory cache → re-render UI" pattern is manually implemented in:

| File | Function | Context |
|------|----------|---------|
| `report-cards.js` | `dismissReport()` | Dismiss submitted report |
| `report-cards.js` | `executeDeleteReport()` | Delete report |
| `realtime-sync.js` | `_handleReportChange()` | Realtime INSERT/UPDATE/DELETE |
| `cloud-recovery.js` | `recoverCloudDrafts()` | Cross-device recovery |
| `data-store.js` | `syncReportsFromCloud()` | Cloud reconciliation |

**Fix:** Create a shared `updateReportLocally(reportId, changes)` that handles IDB + in-memory cache + optional re-render in one call.

---

#### DUP-03: _draft_data Reconstruction from page_state (3 locations)
**Severity:** 🟡 Medium — any schema change must update all three

The `_draft_data` object format is constructed from interview `page_state` in:

| File | Function | Context |
|------|----------|---------|
| `interview/persistence.js` | `saveToLocalStorage()` | Build _draft_data during interview |
| `interview/persistence.js` | `restoreFromLocalStorage()` | Reconstruct from saved state |
| `cloud-recovery.js` | `cacheInterviewBackups()` | Reconstruct from cloud backup |

**Fix:** Extract a `buildDraftDataFromPageState(pageState)` helper shared by all three.

---

#### DUP-04: org_id Fallback Pattern (5+ locations)
**Severity:** 🟢 Low — works but messy

The pattern `item.orgId || item.org_id || localStorage.getItem(STORAGE_KEYS.ORG_ID)` appears in:
- `supabase-utils.js` → `toSupabaseProject()`
- `data-store.js` → multiple methods
- `interview/persistence.js` → backup functions
- `report/submit.js` → submission flow
- `report/autosave.js` → autosave

**Fix:** Create `getOrgId(contextObject)` helper that encapsulates the fallback chain.

---

#### DUP-05: Photo Object Mapping (2 locations)
**Severity:** 🟢 Low — identical code in same file

`fetchCloudPhotos()` and `fetchCloudPhotosBatch()` in `cloud-photos.js` have nearly identical row→object transformation.

**Fix:** Extract a `mapPhotoRow(row)` helper.

---

#### DUP-06: Supabase Column Duplication (Database Level)
**Severity:** 🟡 Medium — data divergence risk

| Column | Tables Where Duplicated | Risk |
|--------|------------------------|------|
| `capture_mode` | `reports`, `report_data` | Could disagree |
| `status` | `reports`, `report_data` | Could disagree |
| `org_id` | `reports`, `report_data`, `photos`, `interview_backup`, `ai_submissions` | Write in multiple places |
| `pdf_url` | `reports`, `final_reports` | Sprint 13 migrated to reports, but final_reports still has it |
| `inspector_name` | `reports`, `final_reports` | Same as above |
| `submitted_at` | `reports`, `final_reports` | Same as above |
| `project_id` | `reports`, `final_reports` | Redundant — available via reports join |
| `user_id` | `reports`, `final_reports` | Redundant |
| `report_date` | `reports`, `final_reports` | Redundant |
| `device_info` | `user_profiles`, `user_devices` | Written in both on login |

---

#### DUP-07: navigator.storage.persist() (2 locations)
**Severity:** 🟢 Trivial — both are idempotent

Called in `pwa-utils.js` (`registerServiceWorker()`) and `auth.js` (page load). Harmless but redundant.

---

### 20.2 Misplaced Storage Code

#### MIS-01: Location Functions in ui-utils.js
**Severity:** 🟡 Medium — violates single-responsibility

6 location-related functions (`getCachedLocation`, `cacheLocation`, `clearCachedLocation`, `isLocationStale`, `getLocationFromCache`, `getFreshLocation`, `_readGPS`) with localStorage read/write are embedded in `ui-utils.js` alongside pure formatting functions (`escapeHtml`, `formatDate`, `showToast`).

**Fix:** Move to a dedicated `location.js` module.

---

#### MIS-02: localStorage Access in supabase-utils.js
**Severity:** 🟢 Low — couples a "pure converter" to browser storage

`toSupabaseProject()` reads `localStorage.getItem(STORAGE_KEYS.ORG_ID)` as a fallback for `org_id`. A converter should be a pure function.

**Fix:** Pass `orgId` as a parameter instead of reading from localStorage.

---

#### MIS-03: Direct Supabase Calls in UI Files
**Severity:** 🟡 Medium — bypasses abstraction layer

Files that directly call `supabaseClient.from(...)` instead of going through `dataStore` or `dataLayer`:

| File | Tables Accessed Directly | Should Use |
|------|--------------------------|-----------|
| `report-cards.js` | `reports` (dismiss) | `dataStore` |
| `report-creation.js` | `reports` (create draft row) | `dataStore` |
| `archives/main.js` | `reports`, `projects` | `dataStore`, `dataLayer` |
| `ai-refine.js` | `report_data`, `ai_submissions` | `dataStore` |
| `autosave.js` | `reports`, `report_data` | `dataStore` |
| `submit.js` | `reports`, `report_data`, `final_reports` | `dataStore` |
| `project-config/crud.js` | `projects` (via `toSupabaseProject`) | `dataLayer` |

---

#### MIS-04: Direct IDB Access Bypassing dataStore
**Severity:** 🟢 Low — works but inconsistent

| File | IDB Methods Used Directly | Should Use |
|------|---------------------------|-----------|
| `project-config/crud.js` | `window.idb.getProject()`, `saveProject()`, `deleteProject()` | `dataLayer` or `dataStore` |
| `project-config/main.js` | `window.idb.initDB()` | Lazy init in `dataStore` |
| `projects/main.js` | `window.idb.clearStore('projects')` | `dataStore.clearStore()` |

---

### 20.3 Orphaned Tables, Keys & Stores

#### ⚫ ORPHAN-01: `report_backup` Table (Supabase)
**Status:** DEPRECATED — confirmed in Sprint 13 code comments
**Evidence:** Only reference is `delete-report.js` which deletes rows during cleanup. No reads or writes.
**Recommendation:** Drop table after confirming no data worth preserving.

#### ⚫ ORPHAN-02: `final_reports` Table (Supabase)
**Status:** LEGACY — Sprint 13 migrated columns to `reports` table
**Evidence:** `pdf_url`, `inspector_name`, `submitted_at` now live on `reports`. `final_reports` is only read in delete cascade (to find old pdf_url) and written to in `submit.js`.
**Recommendation:** Stop writing to `final_reports` in submit.js. Keep read in delete cascade for cleanup of historical data. Eventually drop.

#### ⚫ ORPHAN-03: `contractors_display` Column (Supabase `projects`)
**Status:** Not mapped by any converter (`fromSupabaseProject` / `toSupabaseProject`)
**Evidence:** Not read or written by any frontend code found in audit.
**Recommendation:** Verify no server-side usage, then drop column.

#### ⚫ ORPHAN-04: `get_user_profile_id()` RPC Function
**Status:** Not called from frontend or used in any RLS policy
**Evidence:** `get_user_org_id()` is used in the `interview_backup` RLS policy, but `get_user_profile_id()` is unused.
**Recommendation:** Drop if no server-side usage.

#### ⚫ ORPHAN-05: `SPEECH_GRANTED` localStorage Key
**Status:** Referenced in permissions/main.js but speech permission flow was removed
**Evidence:** Checked in `init()`, cleared in `clearLocalPermissionState()`, but no speech permission step exists in the sequential flow (mic → cam → loc → summary).
**Recommendation:** Remove references or re-add speech permission step if needed.

#### ⚫ ORPHAN-06: `messages.js` (index module)
**Status:** Demo/placeholder with hardcoded conversations
**Evidence:** No backend integration, no storage operations. Four hardcoded message threads.
**Recommendation:** Either implement real messaging or remove from dashboard.

#### ⚫ ORPHAN-07: `deleteReportCascade()` (shared/delete-report.js)
**Status:** MAYBE orphaned — hard delete function
**Evidence:** Exported to `window` but normal delete flow uses `deleteReportFull()` (soft delete). No calls to `deleteReportCascade` found in audited frontend code.
**Recommendation:** Verify if used in admin tools or n8n workflows. If not, remove.

#### ⚫ ORPHAN-08: `report_data` Realtime Publication
**Status:** Added to Supabase Realtime publication (Migration 007) but no frontend subscription
**Evidence:** `realtime-sync.js` only subscribes to `reports` and `projects` channels, not `report_data`.
**Recommendation:** Either subscribe to it or remove from publication.

---

### 20.4 Security Issues Summary

| ID | Severity | Issue | Location |
|----|----------|-------|----------|
| SEC-01 | 🔴 Critical | RLS disabled on 11/12 tables — anon key has unrestricted access | All Supabase tables except `interview_backup` |
| SEC-02 | 🟡 Medium | 3 storage buckets are public with no size/MIME restrictions | `report-photos`, `report-pdfs`, `project-logos` |
| SEC-03 | 🟡 Medium | N8N webhook API key hardcoded in client JS | `config.js` |
| SEC-04 | 🟢 Good | Signed URLs used for photos (SEC-04 comments) | `cloud-photos.js`, `media-utils.js` |
| SEC-05 | 🟢 Good | Per-user AI conversation namespacing | `ai-assistant.js` |
| SEC-06 | 🟢 Good | Input sanitization before AI webhook | `ai-assistant.js` |

---

### 20.5 Prioritized Recommendations

#### 🔴 P0 — Critical (Do First)

**1. Enable RLS on all tables**
- Apply the `interview_backup` pattern (org-scoped via `get_user_org_id()`) to all 11 unprotected tables
- Estimated effort: 2-3 hours (write policies + test)
- Risk of NOT doing: Any user can access any org's data via browser dev tools

**2. Restrict storage buckets**
- Set `file_size_limit` (10MB photos, 50MB PDFs, 2MB logos)
- Set `allowed_mime_types` per bucket
- Consider making buckets private (use signed URLs, which are already implemented)
- Estimated effort: 30 minutes via Supabase Dashboard

#### 🟡 P1 — Important (Next Sprint)

**3. Extract shared helpers to reduce duplication**
- `cacheUserLocally(profile)` — consolidates DUP-01 (4 locations)
- `updateReportLocally(id, changes)` — consolidates DUP-02 (5 locations)
- `buildDraftDataFromPageState(state)` — consolidates DUP-03 (3 locations)
- `getOrgId(context)` — consolidates DUP-04 (5+ locations)
- Estimated effort: 4-6 hours

**4. Move location functions out of ui-utils.js**
- Create `location.js` with the 7 location functions
- Update all script tags
- Estimated effort: 1 hour

**5. Route all Supabase calls through dataStore/dataLayer**
- 7 files make direct `.from()` calls that should go through the abstraction layer
- Estimated effort: 4-6 hours (need to add missing methods to dataStore)

**6. Fix logo signed URL expiry**
- Logo URLs expire after 1 hour but are stored persistently
- Either use longer expiry (30 days) or regenerate on project load
- Estimated effort: 1-2 hours

#### 🔵 P2 — Improvement (Backlog)

**7. Drop deprecated tables**
- `report_backup` — deprecated since Sprint 13
- `final_reports` — redundant with `reports` since Sprint 13
- First: stop writing to `final_reports` in `submit.js`
- Then: data migration to ensure no orphaned pdf_urls
- Estimated effort: 2-3 hours

**8. Clean up orphaned code**
- Remove `SPEECH_GRANTED` references
- Remove or implement `messages.js`
- Remove or use `deleteReportCascade()`
- Drop `contractors_display` column
- Drop `get_user_profile_id()` RPC
- Estimated effort: 1-2 hours

**9. Add pagination to archives**
- Currently loads ALL submitted reports in one query
- Add date-range filtering or cursor pagination
- Estimated effort: 2-3 hours

**10. Debounce settings scratch pad writes**
- Currently writes JSON to localStorage on every keystroke
- Add 500ms debounce
- Estimated effort: 15 minutes

**11. Consider caching weather data**
- Weather re-fetches on every dashboard load
- A 15-minute localStorage TTL cache would improve perceived performance
- Estimated effort: 30 minutes

**12. IDB photo eviction strategy**
- Photo blobs in IDB can grow unbounded
- Add cleanup for synced photos older than N days
- Estimated effort: 2-3 hours

---

### 20.6 Executive Summary

#### What We Audited
- **56 JavaScript files** across 11 directories
- **~18,000+ lines of code** analyzed
- **12 Supabase tables**, 3 storage buckets, 2 RPC functions
- **7 IndexedDB object stores**
- **30+ localStorage keys**

#### Architecture Assessment

**Strengths:**
- 🟢 **Local-first design** — the app works offline and syncs when online. IDB is used as a durable local cache, with Supabase as cloud truth.
- 🟢 **Good abstraction layers exist** — `data-layer.js` and `data-store.js` provide clean APIs for project/report/profile storage. When used, they handle IDB ↔ Supabase synchronization transparently.
- 🟢 **Smart sync patterns** — Realtime subscriptions, BroadcastChannel for cross-tab sync, deleted report blocklist to prevent resurrection, timestamp-based conflict resolution.
- 🟢 **Defensive error handling** — timeouts on all IDB/network calls, `Promise.allSettled` for multi-step operations, graceful degradation when offline.
- 🟢 **Strong sign-out cleanup** — comprehensive localStorage + IDB wipe prevents data leakage on shared devices.

**Weaknesses:**
- 🔴 **No RLS on 11/12 tables** — the single most critical security gap. All data is accessible to anyone with the anon key.
- 🟡 **Abstraction layer bypassed frequently** — 15+ files call Supabase or IDB directly, skipping the data layer's caching and normalization.
- 🟡 **Significant code duplication** — profile caching (4 places), three-tier update pattern (5 places), _draft_data construction (3 places).
- 🟡 **3 orphaned/deprecated tables** still in the schema consuming space.
- 🟡 **Misplaced concerns** — location logic in UI utils, localStorage access in converter functions.

#### By the Numbers

| Metric | Count |
|--------|-------|
| Total audit markers | 95+ |
| 🔴 BUG (broken) | 1 (RLS) |
| 🟡 ISSUE (problematic) | 28 |
| 🟠 MAYBE (needs investigation) | 8 |
| 🔵 IMPROVEMENT (could be better) | 15 |
| 🟢 GOOD (solid pattern) | 35 |
| ⚫ ORPHAN (unused) | 8 |
| 🔁 DUPLICATE (repeated logic) | 7 |

#### Bottom Line
The storage architecture is **fundamentally sound** — the local-first design with IDB + Supabase sync is the right approach for a mobile-first PWA used on construction sites. The main risks are **security (RLS)** and **maintainability (duplication + abstraction bypasses)**. Fixing the P0 items (RLS + bucket restrictions) should be the immediate priority, followed by the P1 refactoring to reduce technical debt.

---

*End of Storage Audit*
