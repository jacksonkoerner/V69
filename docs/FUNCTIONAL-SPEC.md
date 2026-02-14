# FieldVoice Pro V69 — Functional Spec

> Page-by-page mapping of how the app **should** work, which JS files are responsible, and what needs fixing.
> Built collaboratively by Jackson + George, Feb 2026.

## Naming Convention

| File | Official Name | Short Name |
|------|--------------|------------|
| `login.html` | **Login** | Login |
| `projects.html` | **Project List** | Projects |
| `project-config.html` | **Project Setup** | Setup |
| `index.html` | **Dashboard** | Dashboard |
| `quick-interview.html` | **Field Capture** | Capture |
| `report.html` | **Report Editor** | Editor |
| `archives.html` | **Report Archives** | Archives |
| `settings.html` | **Settings** | Settings |
| `landing.html` | **Landing Page** | Landing |
| `permissions.html` | **Permission Setup** | Permissions |
| `permission-debug.html` | **Permission Debug** | Debug |

## Core Flow

```
Login → Dashboard → (Project List ↔ Project Setup) → Field Capture → Report Editor → Report Archives
```

## Cross-Platform Principle

The app must work seamlessly across devices. A user should be able to start a report on their phone in the field and review/edit it on their computer. This means:
- All data tied to `project_id` + `report_id` (not device-specific)
- Data synced to Supabase (not stuck in localStorage/IndexedDB on one device)
- Multiple simultaneous sessions supported (phone + laptop)

## Organizations

- **Orgs are created outside the app** (manually by admin for now; self-serve via Landing Page later)
- **Sign up requires an org ID** — user pastes it during account creation, system validates it exists
- **User belongs to one org** — all projects in that org are visible to all org members
- **Projects belong to an org** — scoped by `org_id`
- **Reports belong to a project** — scoped by `project_id`

### Data hierarchy:
```
Organization
  └── Users (members)
  └── Projects
        └── Reports
              └── Field data, photos, PDF, etc.
```

---

## Page 1: Login

**File:** `login.html`
**JS:** `js/login/main.js`
**Status:** ✅ Working as expected

### How It Works
1. User sees **Sign In** view (email + password)
2. Can switch to **Sign Up** view (name, title, company, email, phone, password)
3. Supabase email/password auth
4. On sign in: checks `user_profiles` table for existing profile + role
   - If profile has role → store user info → redirect to **Dashboard**
   - If no role → show **Role Picker** (Inspector vs Admin)
5. Admin role is blocked ("coming soon") — Inspector is the only active role
6. On sign up: creates `user_profiles` row in Supabase, then shows Role Picker
7. If already has active Supabase session on page load → auto-redirect to **Dashboard**

### Sign Up Fields
| Field | Form ID | Supabase Column | localStorage Key |
|-------|---------|-----------------|-----------------|
| Full Name | `signUpName` | `full_name` | `fvp_user_name` |
| Title | `signUpTitle` | `title` | ❌ |
| Company | `signUpCompany` | `company` | ❌ |
| Email | `signUpEmail` | `email` | `fvp_user_email` |
| Phone | `signUpPhone` | `phone` | ❌ |
| Password | `signUpPassword` | _(Supabase Auth)_ | ❌ |

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Auth session | ❌ | ❌ | Supabase Auth (managed automatically) |
| User role | `fvp_auth_role` | ❌ | `user_profiles.role` |
| User profile ID | `fvp_user_id` | ❌ | `user_profiles.id` |
| User name | `fvp_user_name` | ❌ | `user_profiles.full_name` |
| User email | `fvp_user_email` | ❌ | `user_profiles.email` |
| Auth UUID | `fvp_auth_user_id` | ❌ | `user_profiles.auth_user_id` |
| Device ID | `fvp_device_id` | ❌ | `user_profiles.device_id` |

### ⚠️ Login uses HARDCODED localStorage keys
`login/main.js` does NOT use `STORAGE_KEYS` constants — it writes directly:
- `localStorage.setItem('fvp_auth_role', ...)` 
- `localStorage.setItem('fvp_user_id', ...)`
- `localStorage.setItem('fvp_user_name', ...)`
- `localStorage.setItem('fvp_user_email', ...)`
- `localStorage.setItem('fvp_auth_user_id', ...)`

These need to be migrated to `setStorageItem(STORAGE_KEYS.*)`. Note: `STORAGE_KEYS` doesn't even define keys for `auth_role`, `user_name`, `user_email`, or `auth_user_id` — they're only in `login/main.js` and `auth.js`.

### Naming Inconsistency Audit
| What | Login writes (raw) | STORAGE_KEYS defines | auth.js uses |
|------|-------------------|---------------------|-------------|
| Role | `fvp_auth_role` | ❌ not defined | `fvp_auth_role` (hardcoded) |
| User ID | `fvp_user_id` | `STORAGE_KEYS.USER_ID` ✅ | `fvp_user_id` (hardcoded) |
| User Name | `fvp_user_name` | ❌ not defined | `fvp_user_name` (hardcoded) |
| User Email | `fvp_user_email` | ❌ not defined | `fvp_user_email` (hardcoded) |
| Auth UUID | `fvp_auth_user_id` | ❌ not defined | `fvp_auth_user_id` (hardcoded) |
| Device ID | `fvp_device_id` | `STORAGE_KEYS.DEVICE_ID` ✅ | via `getDeviceId()` ✅ |

**Only 2 of 6 user-related keys are in STORAGE_KEYS.** The rest are hardcoded strings scattered across `login/main.js` and `auth.js`.

### Confirmed Decisions
- After login → always redirect to **Dashboard** (no conditional routing)
- Admin role stays blocked for now
- Both phone + computer sessions should stay active simultaneously (needs work)

### Needs Adding
- [x] Add missing keys to `STORAGE_KEYS`: `AUTH_ROLE`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`
- [x] Migrate `login/main.js` hardcoded localStorage calls to use `STORAGE_KEYS` constants
- [x] Migrate `auth.js` hardcoded `fvp_auth_role` to use `STORAGE_KEYS.AUTH_ROLE`
- [ ] Capture device metadata on login (device type, OS, browser) alongside `device_id`
- [ ] Support multiple active sessions per user (don't overwrite device_id — store per-device instead)
- [ ] Add `org_id` field to Sign Up flow — user pastes org ID, system validates it exists before creating account
- [ ] Associate user with org in `user_profiles` table

---

## Page 2: Project List

**File:** `projects.html`
**JS:** `js/projects/main.js`  
**Also loaded:** `config.js`, `pwa-utils.js`, `ui-utils.js`, `storage-keys.js`, `indexeddb-utils.js`, `supabase-utils.js`, `data-layer.js`, `auth.js`
**Status:** ✅ Working but needs changes

### How It Works
1. `auth.js` auto-checks session → redirects to Login if not authenticated
2. On load, reads `STORAGE_KEYS.ACTIVE_PROJECT_ID` from localStorage
3. Loads projects from **IndexedDB first** (via `getAllProjects()`)
4. If IndexedDB empty + online → fetches from **Supabase** `projects` table (`SELECT *`) → caches to IndexedDB
5. Renders project cards: name, project #, location, status badge, expandable contractor list
6. **Tap a project** → `selectProject()` → sets `STORAGE_KEYS.ACTIVE_PROJECT_ID` → redirects to **Dashboard**
7. **Edit button** → navigates to **Project Setup** (`project-config.html?id=<projectId>`)
8. **Refresh button** → `refreshFromCloud()` → fetches from Supabase → clears IndexedDB projects store → re-caches → re-renders
9. Active project banner shown at top if one is set

### How It SHOULD Work
- **No "active project" concept** — user picks the project when starting a new report on Dashboard
- Tapping a project should navigate to Dashboard (or just view project details) without setting an "active" state
- Projects should be scoped to the user's **organization** (`org_id`)
- All org members see all org projects

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Active project ID | `fvp_active_project_id` | ❌ | ❌ (localStorage only — breaks cross-platform) |
| Project list | `fvp_projects` (map cache) | `projects` store (full objects) | `projects` table |
| Contractors | ❌ | Inside project object | `projects.contractors` (JSONB column) |

### Data Flow
```
Page Load:
  auth.js → check session → redirect to Login if none
  main.js DOMContentLoaded:
    1. Read ACTIVE_PROJECT_ID from localStorage
    2. getAllProjects():
       IndexedDB.projects.getAll() → if empty → Supabase SELECT * → cache to IDB
    3. renderProjectList() → show cards

Select Project:
  1. setStorageItem(ACTIVE_PROJECT_ID, projectId)
  2. redirect to index.html

Refresh:
  1. Supabase SELECT * FROM projects ORDER BY project_name
  2. Clear IndexedDB projects store
  3. Re-cache all projects to IndexedDB
  4. Re-render
```

### Naming Inconsistency Audit
This page's `renderProjectRow()` checks BOTH naming conventions everywhere:
| Usage | Code checks | Should be |
|-------|------------|-----------|
| Project name | `project.projectName \|\| project.project_name` | `project.projectName` (after normalization) |
| Project # | `project.noab_project_no \|\| project.noabProjectNo` | `project.noabProjectNo` |

The `data-layer.js` normalizer converts snake_case → camelCase, so if all data goes through the normalizer, only camelCase should be needed. But `projects/main.js` has its OWN `fetchProjectsFromSupabase()` that bypasses the data layer and only does a basic contractors JSON parse — **no normalization**.

### Known Issues
- [x] `projects/main.js` has its own `fetchProjectsFromSupabase()` + `saveProjectsToIndexedDB()` that **bypass** `data-layer.js` — duplicate logic, no normalization
- [x] `refreshFromCloud` name collision — also exported by `settings/main.js` (both on `window`)
- [x] `ACTIVE_PROJECT_ID` concept needs removal — project is selected per-report, not globally *(Sprint 5: removed from interview/report pages; kept only for dashboard picker UI)*
- [ ] Projects not filtered by org — `SELECT *` loads ALL projects from Supabase
- [ ] Active project stored only in localStorage — breaks cross-platform
- [ ] Dual field name checks (`projectName || project_name`) throughout render code — fragile

### Confirmed Decisions
- No active project concept — pick project per report
- Projects visible to all org members
- Page works today but will need changes after org + naming cleanup

### Needs Adding
- [x] Remove `ACTIVE_PROJECT_ID` usage from this page *(Sprint 5: removed — projects page still sets it for picker display, but interview/report don't read it)*
- [x] Refactor to use `data-layer.js` instead of duplicating Supabase fetch logic
- [ ] Filter projects by `org_id` once organizations are implemented
- [ ] Decide what tapping a project does (go to Dashboard? show project detail view?)
- [x] Remove duplicate field name checks after normalization is guaranteed

---

## Page 3: Project Setup

**File:** `project-config.html`
**JS:** `js/project-config/main.js`, `js/project-config/crud.js`, `js/project-config/contractors.js`, `js/project-config/form.js`, `js/project-config/document-import.js`
**Status:** ✅ Working, needs changes

### How It Works
1. **Create mode** (no `?id=`): generates blank project with `generateId()`
2. **Edit mode** (`?id=<projectId>`): loads from IndexedDB → Supabase fallback
3. Fill out project form fields (see below)
4. Add/edit/delete **contractors** (name, abbreviation, prime/sub, trades)
5. Each contractor can have **crews** (name only) — ⚠️ CREWS MAY BE REMOVED (flagged)
6. Drag-and-drop reorder contractors
7. **Save** → IndexedDB first → Supabase sync → redirect to **Project List**
8. **Delete** → requires online → Supabase first → IndexedDB cleanup
9. Document import (PDF/DOCX extraction to auto-fill fields) — working
10. Logo upload with thumbnail compression + Supabase Storage

### Project Fields
| Field | Form ID | Supabase Column | JS Key (camelCase) |
|-------|---------|-----------------|-------------------|
| Project Name | `projectName` | `project_name` | `projectName` |
| NOAB Project # | `noabProjectNo` | `noab_project_no` | `noabProjectNo` |
| CNO Solicitation # | `cnoSolicitationNo` | `cno_solicitation_no` | `cnoSolicitationNo` |
| Location | `location` | `location` | `location` |
| Engineer | `engineer` | `engineer` | `engineer` |
| Prime Contractor | `primeContractor` | `prime_contractor` | `primeContractor` |
| Notice to Proceed | `noticeToProceed` | `notice_to_proceed` | `noticeToProceed` |
| Report Date | `reportDate` | _(not in Supabase?)_ | `reportDate` |
| Contract Duration | `contractDuration` | `contract_duration` | `contractDuration` |
| Expected Completion | `expectedCompletion` | `expected_completion` | `expectedCompletion` |
| Default Start Time | `defaultStartTime` | `default_start_time` | `defaultStartTime` |
| Default End Time | `defaultEndTime` | `default_end_time` | `defaultEndTime` |
| Weather Days | `weatherDays` | `weather_days` | `weatherDays` |
| Contract Day # | `contractDayNo` | _(not in Supabase?)_ | `contractDayNo` |
| Logo Thumbnail | — | `logo_thumbnail` | `logoThumbnail` |
| Logo URL | — | `logo_url` | `logoUrl` |
| Contractors (JSONB) | — | `contractors` | `contractors` |

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Project fields | `fvp_projects` (map cache for report-rules) | `projects` store (full project) | `projects` table |
| Active project ID | `fvp_active_project` | ❌ | ❌ |
| Contractors + crews | ❌ | Inside project object | `contractors` JSONB column on `projects` table |
| Logo file | ❌ | ❌ | Supabase Storage |
| Logo thumbnail | ❌ | Inside project object | `logo_thumbnail` column |

### Naming Inconsistency Audit
The normalizer in `data-layer.js` handles both formats, but this is tech debt:
- Supabase uses **snake_case** (`project_name`, `prime_contractor`)
- JS/IndexedDB uses **camelCase** (`projectName`, `primeContractor`)
- Some code checks BOTH (`p.projectName || p.project_name`) — fragile
- `supabase-utils.js` has the canonical converter functions (`fromSupabaseProject` / `toSupabaseProject`)

### Confirmed Decisions
- Keep all project fields (DOT/RPR fields are needed)
- ⚠️ Crews are flagged — may be removed in future. Don't build new features on crews.
- Remove "Set as Active Project" button (no active project concept)
- Add `org_id` to project (in addition to `user_id`) — projects belong to an org
- Document import is working, keep as-is

### Needs Adding
- [ ] Remove "Set as Active Project" button and related code (`getActiveProjectId`, `setActiveProjectId`, `updateActiveProjectBadge`)
- [ ] Add `org_id` field to project data model (Supabase column + JS normalizer)
- [ ] Verify `reportDate` and `contractDayNo` — in form but not in `toSupabaseProject()` converter (may not be saving to Supabase)

---

## Page 4: Dashboard

**File:** `index.html`
**JS (core):** `js/index/main.js`, `js/index/report-cards.js`, `js/index/report-creation.js`, `js/index/cloud-recovery.js`
**JS (features):** `js/index/weather.js`, `js/index/panels.js`, `js/index/calendar.js`, `js/index/messages.js`, `js/index/field-tools.js`, `js/index/deep-links.js`, `js/index/toggle-panel.js`
**JS (shared):** `config.js`, `storage-keys.js`, `report-rules.js`, `supabase-utils.js`, `pwa-utils.js`, `ui-utils.js`, `indexeddb-utils.js`, `data-layer.js`, `auth.js`, `api-keys.js`, `shared/delete-report.js`, `shared/ai-assistant.js`
**JS (tools):** `js/tools/maps.js`, `compass.js`, `measure.js`, `calc.js`, `slope.js`, `level.js`, `decibel.js`, `timer.js`, `flashlight.js`, `qrscanner.js`, `ar-measure.js`
**Status:** ✅ Working but has core data flow issues

### How It Works — Core Report Flow
1. `auth.js` checks session → redirects to Login if none
2. On load:
   a. Checks if mobile + permissions not granted → redirects to **Permission Setup**
   b. Loads projects: IndexedDB first via `dataLayer.loadProjects()`, then refreshes from Supabase if online
   c. Loads "active project" from localStorage via `dataLayer.loadActiveProject()`
   d. Prunes stale reports from `fvp_current_reports` (submitted > 24hrs, malformed)
   e. Renders: Active Project card, Report Cards (grouped by project), "Begin Daily Report" button
   f. Fire-and-forget: `recoverCloudDrafts()` — checks Supabase for drafts missing locally
   g. Syncs weather via GPS + Open-Meteo API

3. **"Begin Daily Report" button** → opens **Project Picker Modal**:
   - Shows all projects with eligibility status (from `report-rules.js`)
   - Blocked: "Has Late Report" (unfinished from previous day) or disabled states
   - Available: tap to select
   - "In Progress": existing draft for today — shows duplicate check modal

4. **Select project in picker** → `selectProjectAndProceed()`:
   a. Sets `ACTIVE_PROJECT_ID` in localStorage
   b. Checks for existing report for this project + today's date
   c. If duplicate found → shows "Go to existing OR Delete & Start Fresh" modal
   d. If no duplicate → generates new UUID → creates draft row in Supabase `reports` table → navigates to **Field Capture**

5. **Report Cards** show all reports from `fvp_current_reports`, grouped by project:
   - Clicking a card navigates based on status:
     - `draft` / `pending_refine` → **Field Capture** (`quick-interview.html?reportId=...`)
     - `refined` → **Report Editor** (`report.html?date=...&reportId=...`)
     - `ready_to_submit` → **Report Editor** preview tab
     - `submitted` → **Archives** (`archives.html?id=...`)

### Report Status Flow
```
draft → pending_refine → refined → ready_to_submit → submitted
  │          │              │              │              │
  │          │              │              │              └── Archives
  │          │              │              └── Report Editor (preview tab)
  │          │              └── Report Editor (form view)
  │          └── (AI processing in progress)
  └── Field Capture (data entry)
```

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Active project ID | `fvp_active_project_id` | ❌ | ❌ |
| Projects cache | `fvp_projects` (map for report-rules) | `projects` store | `projects` table |
| Current reports (drafts) | `fvp_current_reports` (map by report ID) | ❌ | `reports` table (draft row created on begin) |
| Report detail data | `fvp_report_{reportId}` (per-report blob) | ❌ | _(synced later during capture/submit)_ |
| Weather | ❌ (in-memory cache only) | ❌ | ❌ |
| Permission flags | `fvp_mic_granted`, `fvp_loc_granted`, etc. | ❌ | ❌ |
| Submitted banner | `sessionStorage` (per-session) | ❌ | ❌ |
| Device ID | `fvp_device_id` | ❌ | `reports.device_id` (on draft creation) |
| User ID | `fvp_user_id` | ❌ | `reports.user_id` (on draft creation) |

### Cloud Draft Recovery (`cloud-recovery.js`)
- Runs after initial render (fire-and-forget)
- Queries Supabase: `SELECT * FROM reports WHERE user_id = X AND status != 'submitted'`
- For each cloud draft NOT in local `fvp_current_reports` → adds it
- Re-renders report cards if any recovered
- **This is the cross-platform bridge** — if you start a report on phone, laptop recovers it here
- ⚠️ Only recovers report metadata (id, project_id, date, status) — NOT the full report data

### Report Rules (`report-rules.js`)
Business logic enforced on Dashboard:
- **Can't start new report** if project has unfinished report from a previous day (late reports block)
- **Can start new report** even if one already submitted today (multiple reports per day allowed)
- **Duplicate check**: if in-progress report exists for today's project → asks user to continue or delete
- Status transitions enforced: one-way flow, can't skip steps, can't go backwards

### Features (non-core)
| Feature | JS File | What It Does |
|---------|---------|-------------|
| Weather widget | `weather.js` | GPS → Open-Meteo API → temp, conditions, wind, precip |
| Weather details panel | `panels.js` | Wind, gusts, UV, humidity, sunrise/sunset, Windy.com radar |
| Drone ops panel | `panels.js` | Flight window (Part 107), wind assessment, elevation, mag declination |
| Emergency panel | `panels.js` | GPS coords, Call 911, share location, find nearest hospital |
| Field tools carousel | `field-tools.js` | Compass, calculator, level, slope, maps, QR scanner, etc. |
| Calendar | `calendar.js` | _(not read — likely date picker or schedule view)_ |
| Messages | `messages.js` | _(not read — likely project communications)_ |
| Deep links | `deep-links.js` | URL params to open specific tools/panels (`?openTool=compass`) |
| AI Assistant | `ai-assistant.js` | Floating AI chat widget |

### ⚠️ Critical Issue: Reports Live in localStorage
The entire report tracking system (`fvp_current_reports`) is in **localStorage only**. This means:
- **iOS Safari can evict localStorage after 7 days** of no visits
- **Switching devices loses all draft tracking** (cloud recovery only gets metadata, not full data)
- **`fvp_report_{id}` blobs** (the actual report content) are also localStorage-only
- The Supabase `reports` table gets a draft row created, but the actual field data isn't synced until later

### Naming Inconsistency Audit
- Report cards check `report.project_name` (snake_case) — set during creation
- Report cards also check `project.projectName || project.project_name` for display
- `report.report_date || report.reportDate || report.date` — three different field names for the same thing
- `fvp_current_reports` uses `project_id`, `project_name`, `capture_mode` (all snake_case)
- But `fvp_report_{id}` data uses mixed formats depending on which page wrote it

### 🐛 Confirmed Bug: project_id Swap
**Symptom:** Start a report for Project A → edit it → return to Dashboard → report now shows under Project B.
**Root cause:** Unknown — likely something in Field Capture or Report Editor is overwriting `project_id` from the wrong source (possibly from `ACTIVE_PROJECT_ID` localStorage instead of from the report's own `project_id`).
**Priority:** High — this is actively breaking user experience.
**Action:** Trace `project_id` writes across Field Capture and Report Editor JS to find the overwrite.

### Report Card States (Confirmed)
| State | Visual | Status Values | Click Goes To |
|-------|--------|--------------|---------------|
| 🔴 LATE | Red banner/border | Any non-submitted from previous day | Depends on status |
| 🟡 IN PROGRESS | Yellow/draft style | `draft`, `pending_refine` | **Field Capture** |
| 🟠 IN REVIEW | Orange style | `refined`, `ready_to_submit` | **Report Editor** |
| 🟢 SUBMITTED | Green, shows until midnight | `submitted` | **Archives** |

Reports grouped under their project. Clicking takes you to the right page based on status.

### Cross-Platform Report Cards (Target Architecture)
Current: `fvp_current_reports` localStorage = device-only, breaks on other devices.

**Target:**
```
Any device creates/updates report → Supabase `reports` table is source of truth
Any device opens Dashboard:
  1. Query Supabase `reports` WHERE org_id = X (or user_id for now)
  2. Cache results in IndexedDB for offline
  3. Render report cards from IndexedDB/Supabase data
  4. fvp_current_reports localStorage is ELIMINATED
```
Same pattern as projects: Supabase = truth, IndexedDB = offline cache, localStorage = tiny flags only.

### Known Issues
- [ ] **🐛 project_id swap bug** — reports change project after editing (HIGH PRIORITY)
- [ ] **Reports in localStorage only** — breaks cross-platform, vulnerable to iOS 7-day eviction
- [x] `cloud-recovery.js` recovers metadata but NOT full report data — *(Sprint 4: now also caches report_data for recovered reports)*
- [x] `ACTIVE_PROJECT_ID` still used here (project picker sets it) — should be removed *(Sprint 5: picker still writes it for UI display, but interview/report pages never read it)*
- [ ] `report-rules.js` reads from `STORAGE_KEYS.PROJECTS` localStorage cache — if cache is stale, eligibility checks are wrong
- [ ] `report-rules.js` reads from `STORAGE_KEYS.CURRENT_REPORTS` — all report state is localStorage
- [x] `projects/main.js` bypass: Dashboard uses `dataLayer` properly, but Project List doesn't — inconsistent caching
- [ ] Report date field uses 3 different names across the codebase (`report_date`, `reportDate`, `date`)
- [ ] `pruneCurrentReports()` deletes submitted reports after 24h from localStorage — should rely on Supabase/Archives instead
- [ ] Inline `<script>` for `initPWA()` in HTML — should be in main.js

### Confirmed Decisions
- **Project picker flow is good** — tap Begin → pick project → check duplicates → go to Field Capture
- **No blocking on reports** — users can start as many reports as they want, no `UNFINISHED_PREVIOUS` restriction
- **Backend flags duplicates** — if two reports for same project + same day are submitted, backend flags it (doesn't prevent)
- Report status flow: `draft → pending_refine → refined → ready_to_submit → submitted`
- **Keep all features** (weather, drone ops, emergency, field tools, calendar, messages) — they're all valuable
- **Clean separation required** — feature JS must not mix with report management JS. No JS in HTML files.
- **Remove Active Project banner** — replace with empty state ("No projects yet, go create one") if no projects exist
- **Org isolation for Supabase** — TBD approach (RLS vs schemas vs separate projects). Logged for later decision.

### Needs Adding
- [x] Remove `ACTIVE_PROJECT_ID` — project picker should work without setting a global active project *(Sprint 5: removed from interview/report. Picker still writes it for dashboard UI — rename to SELECTED_PICKER_PROJECT_ID in future cleanup)*
- [ ] Remove `UNFINISHED_PREVIOUS` blocking logic from `report-rules.js`
- [ ] Add backend duplicate detection (flag when same project + same day has multiple submitted reports)
- [ ] Move report tracking from localStorage (`fvp_current_reports`) to IndexedDB + Supabase sync
- [x] Cloud recovery should pull full report data, not just metadata (via report_data table + loadReport() fallback)
- [ ] Standardize report date field to one name across all code
- [ ] Add `org_id` filtering to project loading
- [ ] Report creation should include `org_id` on the Supabase draft row
- [ ] Remove Active Project card/banner — add "no projects" empty state
- [ ] Move inline `initPWA()` script into main.js
- [ ] Ensure all feature JS stays isolated from report management JS

---

## Page 5: Field Capture

**File:** `quick-interview.html`
**JS (core):** `js/interview/main.js`, `js/interview/entries.js`, `js/interview/draft-storage.js`, `js/interview/autosave.js`, `js/interview/supabase.js`, `js/interview/finish.js`
**JS (sections):** `js/interview/capture-mode.js`, `js/interview/freeform.js`, `js/interview/guided-sections.js`, `js/interview/contractors.js`, `js/interview/personnel.js`, `js/interview/equipment.js`, `js/interview/manual-adds.js`, `js/interview/photos.js`, `js/interview/weather.js`, `js/interview/toggles.js`, `js/interview/previews.js`, `js/interview/na-marking.js`
**JS (processing):** `js/interview/ai-processing.js`, `js/interview/processing-overlay.js`
**JS (shared):** `config.js`, `storage-keys.js`, `report-rules.js`, `supabase-utils.js`, `pwa-utils.js`, `ui-utils.js`, `indexeddb-utils.js`, `data-layer.js`, `auth.js`, `media-utils.js`, `tools/photo-markup.js`, `shared/delete-report.js`, `shared/ai-assistant.js`
**Total: 34 script tags — heaviest page in the app**
**Status:** ✅ Working but has the project_id swap bug + storage issues

### How It Works
1. Arrives via `quick-interview.html?reportId=<uuid>` from Dashboard
2. `auth.js` checks session
3. Init sequence (`main.js`):
   a. Loads user settings via `dataLayer.loadUserSettings()`
   b. Loads "active project" via `dataLayer.loadActiveProject()` → gets contractors from it
   c. Creates fresh report object via `getReport()` → `createFreshReport()`
   d. Reads `reportId` from URL params → sets `IS.currentReportId`
   e. Checks localStorage for existing draft → restores if found
   f. Auto-populates project name + reporter name from loaded data
4. Shows **Mode Selection**: Quick Notes (freeform) or Guided Sections
5. User enters field data (see capture modes below)
6. **Auto-save**: every keystroke → 500ms debounce → localStorage. Every 5s → Supabase `interview_backup` table
7. **Emergency save**: on `visibilitychange` (tab switch) and `pagehide` (app swipe away)
8. **FINISH button** → validates → saves to Supabase → uploads photos → calls n8n AI webhook → saves AI response → updates status to `refined` → navigates to **Report Editor**

### Capture Modes

**Quick Notes (Freeform):**
- Timestamped free-text entries
- Visual checklist
- Minimal structure — user just talks/types

**Guided Sections:**
- Weather (auto-fetched via GPS)
- Activities (contractor work cards — per contractor, per crew)
- Personnel/Operations
- Equipment
- Issues
- Communications
- QA/QC
- Safety (required: no incidents / has incidents)
- Visitors
- Photos

### 🐛 ROOT CAUSE: project_id Swap Bug

**Found it.** `draft-storage.js` → `saveToLocalStorage()` (line 87):
```js
const activeProjectId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
// ...
project_id: activeProjectId,
```

The draft saves `project_id` from `ACTIVE_PROJECT_ID` in localStorage — NOT from the report's own project. So:
1. Start report for Project A → `ACTIVE_PROJECT_ID` = A → saved correctly
2. Go back to Dashboard, pick Project B in the picker → `ACTIVE_PROJECT_ID` = B
3. Re-open the Project A report → auto-save fires → reads `ACTIVE_PROJECT_ID` (now B) → **overwrites project_id to B**

`supabase.js` → `saveReportToSupabase()` also uses `IS.activeProject.id` which comes from `dataLayer.loadActiveProject()` → reads `ACTIVE_PROJECT_ID`. Same problem.

**The fix:** Save `project_id` from the report's own data (set at creation time), never from `ACTIVE_PROJECT_ID`.

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Draft report (full data) | `fvp_current_reports[id]._draft_data` | ❌ | ❌ |
| Report metadata | `fvp_current_reports[id]` (id, project_id, date, status) | ❌ | `reports` table |
| Interview backup (autosave) | ❌ | ❌ | `interview_backup` table (page_state JSONB) |
| Photos (binary) | ❌ | `photos` store (base64 + metadata) | Supabase Storage (`report-photos` bucket) |
| Photo metadata | ❌ | `photos` store | `photos` table |
| AI response | `fvp_report_{id}` (reportDataPackage) | ❌ | `ai_submissions` table |
| Report row | ❌ | ❌ | `reports` table (id, project_id, status, dates) |

### Data Flow
```
User types → 500ms → saveToLocalStorage() → fvp_current_reports[id]._draft_data
         → 5s   → flushInterviewBackup() → Supabase interview_backup table
         → visibilitychange/pagehide → both fire immediately

FINISH button:
  1. saveReportToSupabase() → upsert reports row
  2. uploadPendingPhotos() → IndexedDB photos → Supabase Storage + photos table
  3. buildProcessPayload() → callProcessWebhook() → n8n AI processing
  4. saveAIResponse() → ai_submissions table
  5. saveReportData(id, package) → fvp_report_{id} in localStorage
  6. saveCurrentReport() → update fvp_current_reports[id] to status: refined
  7. Navigate to report.html?date=X&reportId=Y
```

### Shared State (`window.interviewState`)
All 20+ JS files share state via `window.interviewState` (alias `IS`):
- `IS.currentReportId` — UUID for this report
- `IS.report` — the full report object (in-memory)
- `IS.activeProject` — loaded from `dataLayer.loadProjectById()` using report's own project_id ✅ (Sprint 5)
- `IS.projectContractors` — from `IS.activeProject.contractors`
- `IS.userSettings` — from `dataLayer.loadUserSettings()`
- `IS.autoSaveState` — tracks which textareas have auto-saved entries

### Contractor Work Tracking
- Contractors loaded from `IS.activeProject.contractors` (set at init from report's own project_id) ✅ (Sprint 5)
- Each contractor gets a card with "No work performed" toggle
- If contractor has crews → crew sub-cards appear
- Work entries stored as `entries` with section = `work_{contractorId}` or `work_{contractorId}_crew_{crewId}`
- Activities array tracks `noWork` flag per contractor and per crew

### Known Issues
- [x] **🐛 project_id swap bug** — `saveToLocalStorage()` and `saveReportToSupabase()` read project from `ACTIVE_PROJECT_ID` instead of from the report's own data *(Sprint 1+5: fixed — uses IS.activeProject.id loaded from report's project_id)*
- [x] **🐛 Contractor loading bug** — `IS.activeProject` loaded from `ACTIVE_PROJECT_ID`, so if you open a report for Project A but ACTIVE_PROJECT_ID is Project B, you get Project B's contractors *(Sprint 1+5: fixed — loadProjectById() from report data)*
- [ ] **Draft data in localStorage only** — `_draft_data` blob not synced to Supabase (only `interview_backup` page_state is)
- [ ] `getReport()` calls `createFreshReport()` every time — ignores existing report data. Relies on localStorage restore to recover drafts.
- [ ] `interview_backup` exists in Supabase but is never read back — it's write-only backup, not used for cross-device recovery
- [x] AI response saved to `fvp_report_{id}` in localStorage — *(Sprint 4: also synced to Supabase report_data table on finish)*
- [ ] `finishMinimalReport()` and `finishReport()` are near-duplicate functions (~200 lines each) — comment says "keep in sync"
- [ ] 34 script tags on one page — largest in the app

### Confirmed Decisions
- Two capture modes (freeform + guided) — both stay
- Auto-save on keystroke is good behavior — keep it
- Emergency save on visibility change / pagehide — keep it
- FINISH → AI processing → refined status → Report Editor flow is correct
- Contractor work cards per-contractor and per-crew is correct structure

### Needs Fixing (High Priority)
- [x] **Fix project_id source**: `saveToLocalStorage()` must use the report's `project_id` (set at creation), NOT `ACTIVE_PROJECT_ID` *(Sprint 1+5)*
- [x] **Fix contractor loading**: Page must load contractors from the report's project, not from `ACTIVE_PROJECT_ID` *(Sprint 1+5)*
- [x] **Fix `saveReportToSupabase()`**: Must use report's own project_id *(Sprint 1+5)*

### Needs Adding
- [ ] Read `interview_backup` from Supabase on page load (enables cross-device draft recovery) — write-back capability needs development
- [ ] Move draft data from localStorage to IndexedDB for larger storage + persistence
- [x] Move AI response (`fvp_report_{id}`) to Supabase for cross-device access
- [ ] Refactor `finishMinimalReport()` and `finishReport()` into shared function
- [ ] Add `org_id` to report data
- [ ] **Real-time photo upload** — photos should upload to Supabase Storage as they're taken, not batch at FINISH (must not be laggy)
- [ ] Processing overlay JS is clean (in `processing-overlay.js`, not inline) ✅

---

## Page 6: Report Editor

**File:** `report.html`
**JS (core):** `js/report/main.js`, `js/report/data-loading.js`, `js/report/autosave.js`, `js/report/submit.js`
**JS (views):** `js/report/form-fields.js`, `js/report/original-notes.js`, `js/report/preview.js`, `js/report/ai-refine.js`, `js/report/pdf-generator.js`
**JS (other):** `js/report/delete-report.js`, `js/report/debug.js`
**JS (shared):** `config.js`, `storage-keys.js`, `indexeddb-utils.js`, `data-layer.js`, `supabase-utils.js`, `auth.js`, `ui-utils.js`, `shared/delete-report.js`, `shared/ai-assistant.js`
**CDN:** jsPDF (PDF generation)
**Status:** ✅ Working but has same project_id bug + localStorage dependency

### How It Works
1. Arrives via `report.html?date=YYYY-MM-DD&reportId=<uuid>` (or `?tab=preview`)
2. `auth.js` checks session
3. Init sequence (`main.js`):
   a. Loads project from report's own project_id + user settings via `dataLayer` ✅ (Sprint 1+5)
   b. Loads report from `fvp_report_{reportId}` in localStorage
   c. If no data found → shows error, redirects to Dashboard
   d. Initializes userEdits tracking
   e. Populates form fields, original notes, debug panel
   f. Sets up auto-save listeners
4. Three tabs: **Form View** (edit AI output), **Original Notes** (raw field input), **Preview & Submit**

### Three Tabs
**Form View** — Editable fields pre-populated from AI-generated data:
- Project overview (name, #, location, engineer, contractor, dates, weather)
- Contractor work narratives (per-contractor text areas)
- Personnel/operations tables
- Equipment
- Issues, QA/QC, Safety, Communications, Visitors
- Signature block

**Original Notes** — Read-only view of raw input from Field Capture (what user actually said/typed)

**Preview & Submit** — DOT RPR-style formatted preview + Submit button

### Data Merge Strategy (`getValue` / `getTextFieldValue`)
Priority order for each field:
1. **User edits** (`RS.userEdits[path]`) — highest priority (user changed it on this page)
2. **AI generated** (`RS.report.aiGenerated`) — from n8n webhook response
3. **Report data** (`RS.report`) — fallback to raw data
4. **Default value** — empty string

This means the AI fills everything first, then user can override any field.

### 🐛 Same project_id Bug Here
`report/autosave.js` → `saveReportToSupabase()` (line ~158):
```js
project_id: RS.activeProject.id,
```
`RS.activeProject` is loaded from `dataLayer.loadProjectById()` using the report's own project_id ✅ (Sprint 1+5).

`report/submit.js` → `ensureReportExists()` and `saveToFinalReports()`:
```js
project_id: RS.activeProject?.id || null,
```
✅ This now uses the correct project because `RS.activeProject` is loaded from the report's own `project_id`, not from `ACTIVE_PROJECT_ID`.

### Where Data Is Stored

| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Report package (AI + edits) | `fvp_report_{reportId}` | ❌ | `report_data` table *(Sprint 4)* |
| Report metadata | `fvp_current_reports[id]` | ❌ | `reports` table |
| Report backup (autosave) | ❌ | ❌ | `report_backup` table (page_state JSONB) |
| User edits | Inside `fvp_report_{reportId}.userEdits` | ❌ | ❌ |
| Generated PDF | ❌ | ❌ | Supabase Storage (`report-pdfs` bucket) |
| Final report metadata | ❌ | ❌ | `final_reports` table |
| Photos | ❌ | `photos` store (cleaned after submit) | Supabase Storage + `photos` table |

### Submit Flow
```
1. saveReportToLocalStorage() — save current form state
2. generateVectorPDF() — create PDF via jsPDF
3. uploadPDFToStorage() → Supabase Storage (report-pdfs bucket)
4. ensureReportExists() → upsert reports table row
5. saveToFinalReports() → upsert final_reports table row (report_id, pdf_url, submitted_at)
6. updateReportStatus('submitted') → update reports.status
7. cleanupLocalStorage():
   - Delete fvp_report_{id}
   - Update fvp_current_reports[id].status = 'submitted'
   - Delete photos from IndexedDB
8. Navigate to archives.html?submitted=true
```

### ⚠️ Critical: Report Data is localStorage-Only
`fvp_report_{reportId}` is THE source of truth for this page. It contains:
- `aiGenerated` — the AI-processed report content
- `originalInput` — raw field notes from capture
- `userEdits` — every field the user modified
- `captureMode`, `status`, dates, etc.

This data is **never synced to Supabase** (only `report_backup` page_state is). If localStorage is cleared or you switch devices, **this data is gone**.

### `cleanupLocalStorage()` Uses Hardcoded Keys
```js
var currentReports = JSON.parse(localStorage.getItem('fvp_current_reports') || '{}');
localStorage.setItem('fvp_current_reports', JSON.stringify(currentReports));
```
Bypasses `STORAGE_KEYS` and `getStorageItem/setStorageItem` helpers — direct localStorage access.

### Known Issues
- [x] **🐛 project_id bug** — `saveReportToSupabase()`, `ensureReportExists()`, `saveToFinalReports()` all use `RS.activeProject.id` from ACTIVE_PROJECT_ID *(Sprint 1+5: RS.activeProject now loaded from report's own project_id via loadProjectById())*
- [x] **Report data in localStorage only** — *(Sprint 4: report_data table syncs AI output + user edits to Supabase)*
- [ ] `report_backup` table written to but never read back (write-only, like `interview_backup`)
- [ ] `cleanupLocalStorage()` uses hardcoded `fvp_current_reports` string instead of `STORAGE_KEYS`
- [x] `loadReport()` only reads localStorage — *(Sprint 4: falls back to Supabase report_data table when localStorage misses)*
- [x] If report data missing from localStorage — *(Sprint 4: tries Supabase report_data before showing error)*

### Supabase Backup Tables (Current State)
| Table | Written By | Contains | Read Back? |
|-------|-----------|----------|------------|
| `interview_backup` | Field Capture (`interview/autosave.js`) | page_state JSONB (form data during capture) | ❌ Never |
| `report_backup` | Report Editor (`report/autosave.js`) | page_state JSONB (form data during editing) | ❌ Never |

Both are write-only safety nets. Neither enables cross-device recovery.

### Target: New `report_data` Table
Replace `fvp_report_{id}` localStorage with a Supabase table:
```
report_data:
  - report_id (PK, FK → reports.id)
  - ai_generated (JSONB)     -- AI-processed report content
  - original_input (JSONB)   -- raw field notes from capture
  - user_edits (JSONB)       -- every field user modified on report.html
  - capture_mode (text)      -- freeform or guided
  - status (text)            -- refined, ready_to_submit, etc.
  - created_at (timestamp)
  - updated_at (timestamp)
```
- Report Editor writes here on every save (replaces localStorage)
- Report Editor reads on load (with localStorage as fast cache)
- Cross-device works because data is in Supabase
- `report_backup` table becomes redundant and can be removed

### Consider: Merge `final_reports` into `reports`
`final_reports` duplicates most of `reports` (report_id, project_id, user_id, status, dates) — just adds `pdf_url` and `inspector_name`. Consider adding `pdf_url` and `submitted_at` columns to `reports` table instead and eliminating `final_reports`.

### Confirmed Decisions
- Three-tab layout (Form View / Original Notes / Preview) is correct
- Data merge priority (user edits > AI generated > raw data) is correct
- PDF generation + upload on submit is correct
- After submit → redirect to **Dashboard** with success banner (not archives)
- Clicking success banner → goes to **Archives** for that project
- PDF quality is good for now

### Needs Fixing (High Priority)
- [ ] **Fix project_id source**: all Supabase writes must use the report's own project_id, not `RS.activeProject.id`
- [ ] **Fix refined status not showing on Dashboard** — part of the project_id bug chain (status writes to wrong report entry in fvp_current_reports)
- [ ] **Fix `cleanupLocalStorage()`**: use `STORAGE_KEYS` constants
- [ ] **Fix submit redirect**: go to Dashboard with success banner, not archives.html

### Needs Adding
- [x] **Create `report_data` table** in Supabase — stores AI generated + original input + user edits (replaces `fvp_report_{id}` localStorage)
- [x] `loadReport()` reads from `report_data` table (with localStorage as cache), not localStorage-only
- [x] Report Editor saves to `report_data` table on every auto-save
- [ ] Remove `report_backup` table once `report_data` covers its function
- [ ] Consider merging `final_reports` into `reports` table (add pdf_url column)
- [ ] Add `org_id` to report data

---

## Page 8: Settings

**File:** `settings.html`
**JS:** `js/settings/main.js`
**JS (shared):** `config.js`, `supabase-utils.js`, `pwa-utils.js`, `ui-utils.js`, `storage-keys.js`, `indexeddb-utils.js`, `data-layer.js`, `auth.js`
**Status:** ✅ Working — well-structured, no major issues

### How It Works
1. `auth.js` checks session
2. On load: checks for unsaved "scratch pad" in localStorage → restores if found
3. Otherwise loads profile from IndexedDB via `dataLayer.loadUserSettings()` → Supabase fallback
4. User edits profile fields (name, title, company, email, phone)
5. Dirty tracking: every keystroke checks if values differ from original → saves to scratch pad
6. **Save** → IndexedDB first → then Supabase upsert (via `auth_user_id`)
7. On save: updates `fvp_user_id`, `fvp_user_name`, `fvp_user_email` in localStorage
8. **Refresh from Cloud** → pulls latest from Supabase → populates form → marks dirty (must Save to commit)
9. **Refresh App** → deletes caches → unregisters service workers → reloads (localStorage preserved)
10. **Nuclear Reset** → clears localStorage, sessionStorage, IndexedDB, caches, service workers → redirects to index

### Profile Fields
| Field | Form ID | Supabase Column | IndexedDB Key | localStorage |
|-------|---------|-----------------|---------------|-------------|
| Full Name | `inspectorName` | `full_name` | `fullName` | `fvp_user_name` |
| Title | `title` | `title` | `title` | ❌ |
| Company | `company` | `company` | `company` | ❌ |
| Email | `email` | `email` | `email` | `fvp_user_email` |
| Phone | `phone` | `phone` | `phone` | ❌ |

### Where Data Is Stored
| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Profile fields | `fvp_user_id`, `fvp_user_name`, `fvp_user_email` | `userProfile` store (keyed by deviceId) | `user_profiles` table |
| Scratch pad (unsaved edits) | `fvp_settings_scratch` | ❌ | ❌ |
| Auth user ID | `fvp_auth_user_id` | ❌ | `user_profiles.auth_user_id` |

### What's Good About This Page
- **Clean save flow**: IndexedDB first → Supabase sync → localStorage update
- **Scratch pad pattern**: saves unsaved changes to localStorage so they survive page closes
- **Dirty tracking**: only enables Save button when values actually changed
- **Graceful offline**: saves locally and warns about cloud sync
- **Uses `dataLayer.loadUserSettings()`** properly (IndexedDB-first, Supabase-fallback)
- **Uses `toSupabaseUserProfile()`** from supabase-utils.js (proper converter)

### ⚠️ Hardcoded localStorage Writes
`saveSettings()` and `refreshFromCloud()` write directly to localStorage:
```js
localStorage.setItem('fvp_user_id', data.id);
localStorage.setItem('fvp_user_name', data.full_name || '');
localStorage.setItem('fvp_user_email', data.email || '');
```
Same issue as Login — bypasses `STORAGE_KEYS` constants for `user_name` and `user_email` (which aren't even defined in STORAGE_KEYS).

### `refreshFromCloud` Name Collision
This page exports `window.refreshFromCloud` — **same name** as `projects/main.js`. If both scripts were ever loaded on the same page, one would overwrite the other. Currently safe because they're on different pages, but it's a landmine.

### Known Issues
- [x] Hardcoded localStorage writes for `fvp_user_name`, `fvp_user_email` — should use STORAGE_KEYS
- [x] `refreshFromCloud` name collision with `projects/main.js`
- [ ] `fvp_user_id` read with `localStorage.getItem()` (raw) but written with `localStorage.setItem()` (raw) — inconsistent with `getStorageItem`/`setStorageItem` pattern on other pages
- [ ] No `org_id` on profile — will need it when organizations are added

### Confirmed Decisions
- Scratch pad pattern for unsaved changes is good — keep it
- IndexedDB-first save with Supabase sync is the right pattern
- PWA refresh and nuclear reset features are useful — keep them
- Signature preview is nice UX

### Needs Adding
- [x] Migrate hardcoded localStorage writes to `STORAGE_KEYS` constants
- [ ] Add `org_id` to user profile
- [ ] Add device metadata (device type, OS, browser) — per Login decisions

---

## Page 7: Report Archives

**File:** `archives.html`
**JS:** `js/archives/main.js`
**JS (shared):** `config.js`, `storage-keys.js`, `auth.js`, `shared/ai-assistant.js`
**Status:** ✅ Working — cleanest page in the app

### How It Works
1. `auth.js` checks session
2. **Online-only** — shows offline warning if no internet
3. Loads projects from Supabase (`projects` table) → populates project filter dropdown
4. Loads submitted reports from Supabase:
   - Queries `reports` table WHERE `status = 'submitted'`, joined with `projects` for name
   - Queries `final_reports` table for PDF URLs
   - Merges data into display objects
5. **Recent section** — reports submitted in last 24 hours (top 5)
6. **Main list** — all submitted reports, newest first
7. **Project filter** dropdown — filter by project
8. Click report → opens PDF in new tab (`window.open(pdfUrl)`)

### Where Data Is Stored
| Data | localStorage | IndexedDB | Supabase |
|------|-------------|-----------|----------|
| Submitted reports | ❌ | ❌ | `reports` table (status='submitted') |
| PDF URLs | ❌ | ❌ | `final_reports` table (`pdf_url`) |
| PDF files | ❌ | ❌ | Supabase Storage (`report-pdfs` bucket) |
| Project names | ❌ | ❌ | `projects` table (joined) |

### What's Good About This Page
- **Supabase-first** — no localStorage dependency, no IndexedDB. Queries Supabase directly.
- **Already cross-platform** — since it reads from Supabase, it works on any device.
- **Clean separation** — single JS file, no shared state issues.
- **Has its own `escapeHtml` and `formatDate`** — doesn't rely on `ui-utils.js` (though this means duplicate functions)

### Naming Notes
- Uses `project_name` (snake_case) from Supabase join — correct since it's raw DB data
- Uses its own `escapeHtml()` — duplicates the one in `ui-utils.js`
- Uses its own `formatDate()` — different implementation from `ui-utils.js`
- Missing Font Awesome CSS (flagged in code map) — icons may not render

### Known Issues
- [ ] Duplicates `escapeHtml()` and `formatDate()` — should use shared `ui-utils.js`
- [ ] Missing Font Awesome CSS include (only page without it)
- [ ] Path inconsistency: uses `css/output.css` and `js/config.js` (no `./` prefix) unlike all other pages
- [ ] No offline support — shows warning and stops. Could cache last-viewed reports in IndexedDB.
- [ ] Reports not filtered by org — queries ALL submitted reports
- [ ] PDF viewer originally had an iframe modal (`pdfModal`) but `viewPdf()` now just opens in new tab — dead modal HTML may still be in the page

### Confirmed Decisions
- Online-only is acceptable for now (archives are view-only)
- PDF opens in new tab (not iframe modal)
- Project filter dropdown is correct UX
- This is the model for how other pages should work (Supabase-first, no localStorage)

### Needs Adding
- [ ] Filter reports by `org_id` once organizations are implemented
- [ ] Add `./` prefix to CSS/JS paths for consistency
- [ ] Include Font Awesome CSS
- [ ] Remove dead `pdfModal` HTML if it exists
- [ ] Consider offline caching (IndexedDB) for previously viewed reports
- [ ] Use shared `ui-utils.js` functions instead of local duplicates
