# File Structure & Naming Audit — FieldVoice Pro V69

**Date:** 2025-02-14  
**Scope:** Every file in the project, what it does, dependencies, naming problems, and a proposed restructure.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Overview](#current-architecture-overview)
3. [File-by-File Audit](#file-by-file-audit)
   - [HTML Pages](#html-pages)
   - [Core JS Modules (js/ root)](#core-js-modules)
   - [Dashboard Page (js/index/)](#dashboard-page-jsindex)
   - [Field Capture Page (js/interview/)](#field-capture-page-jsinterview)
   - [Report Editor Page (js/report/)](#report-editor-page-jsreport)
   - [Project Config Page (js/project-config/)](#project-config-page-jsproject-config)
   - [Single-File Pages](#single-file-pages)
   - [Shared Modules (js/shared/)](#shared-modules-jsshared)
   - [Field Tools (js/tools/)](#field-tools-jstools)
   - [Config/Build Files](#configbuild-files)
   - [CSS & Assets](#css--assets)
   - [Supabase Migrations](#supabase-migrations)
   - [Documentation](#documentation)
4. [Naming Problems Found](#naming-problems-found)
5. [Proposed Restructure](#proposed-restructure)
6. [Rename Impact Matrix](#rename-impact-matrix)
7. [Recommended Naming Convention](#recommended-naming-convention)

---

## Executive Summary

The codebase is well-organized for a no-build vanilla JS PWA. The folder-per-page pattern is clean and the `js/shared/` concept is correct. However, there are several naming issues:

1. **"index" folder** — confusingly named because `index.html` is the dashboard, not a generic index page. The folder `js/index/` looks like it could be a barrel-export pattern.
2. **"interview" terminology** — the voice capture flow is called "interview" in code but "Quick Interview" in the UI and "Field Capture" in the spec. This is the biggest source of confusion for new developers.
3. **Generic "main.js" everywhere** — 10 different `main.js` files that each do wildly different things.
4. **`storage-keys.js` scope creep** — defines storage keys (appropriate) AND contains ~300 lines of report CRUD logic, type definitions, and IDB hydration. It's really "storage-keys + report-storage-manager."
5. **`ui-utils.js` scope creep** — contains UI helpers (appropriate) AND GPS/location logic (~120 lines). Location has nothing to do with UI.
6. **Duplicate `delete-report.js`** — exists in both `js/shared/` and `js/report/`. The shared one is the Supabase cascade; the report one is the UI confirmation + local cleanup. Names clash.
7. **Inconsistent naming** — mostly kebab-case (good) but type definitions use PascalCase JSDoc, some files use camelCase concepts in kebab-case names.

**Key recommendation:** Rename folders for clarity, give every `main.js` a descriptive name, and split overstuffed utility files. No file moves are strictly required for functionality — this is purely a DX improvement.

---

## Current Architecture Overview

```
No build system — vanilla JS via <script> tags
State sharing: window.* globals and var declarations
Load order: CDNs → core modules → page feature files → main.js (last)
Shared modules: js/shared/ (loaded by 2+ pages)
Page modules: js/{page-name}/*.js (loaded only by that page's HTML)
```

**Total JS files:** 58  
**Total HTML pages:** 11  
**Total lines of JS:** ~15,100 (excluding duplicates from wc)

---

## File-by-File Audit

### HTML Pages

| File | Purpose | Script Count | Size |
|------|---------|-------------|------|
| `index.html` | **Dashboard** — report cards, weather, field tools, project overview | 30 scripts | Large (~1050 lines) |
| `quick-interview.html` | **Field Capture** — voice recording, guided/freeform data entry | 16 scripts | Large (~950 lines) |
| `report.html` | **Report Editor** — AI-refined report review, PDF generation, submit | 17 scripts | Very Large (~1400 lines) |
| `archives.html` | **Archives** — view submitted reports with PDF viewer | 7 scripts | Medium |
| `landing.html` | **Marketing Landing** — public-facing product page | 2 scripts | Large (marketing content) |
| `login.html` | **Auth** — sign in, sign up, role selection | 3 scripts | Medium |
| `permissions.html` | **Onboarding** — mic/camera/location permission flow | 4 scripts | Large (~750 lines) |
| `permission-debug.html` | **Debug** — permission state inspector (dev tool) | 2 scripts | Medium |
| `project-config.html` | **Project Setup** — create/edit project, contractors, doc import | 12 scripts | Large (~540 lines) |
| `projects.html` | **Project List** — browse/select projects | 8 scripts | Small |
| `settings.html` | **Settings** — user profile, app settings | 9 scripts | Medium |

### Core JS Modules

These live at `js/` root and are loaded by most/all pages.

#### `js/config.js` (11 lines — Small)
- **Purpose:** Supabase client initialization, API key constants
- **Exports:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `N8N_WEBHOOK_API_KEY`, `supabaseClient`
- **Dependencies:** Supabase CDN (must load first)
- **Loaded by:** All pages except landing.html, permission-debug.html
- **Problems:** Contains hardcoded API key — should reference env or example file pattern. Name is fine.

#### `js/storage-keys.js` (455 lines — Large)
- **Purpose:** localStorage key constants, storage helpers, report CRUD, IDB hydration, JSDoc type definitions
- **Exports:** `STORAGE_KEYS`, `getDeviceId()`, `getStorageItem()`, `setStorageItem()`, `removeStorageItem()`, `getCurrentReport()`, `saveCurrentReport()`, `deleteCurrentReport()`, `getReportDataKey()`, `getReportData()`, `saveReportData()`, `deleteReportData()`, `hydrateCurrentReportsFromIDB()`, `syncCurrentReportsToIDB()`
- **Dependencies:** None (first to load after config)
- **Loaded by:** All pages except landing.html
- **Problems:** ⚠️ **Severely overloaded.** Name says "storage keys" but it's really 3 files in 1:
  1. Storage key constants + basic get/set helpers (~60 lines)
  2. Report storage manager with serialized save queue, IDB write-through (~200 lines)
  3. JSDoc type definitions for Report, Project, Photo, etc. (~120 lines)
  
  Should be split into `storage-keys.js` (constants only), `report-storage.js` (report CRUD), and optionally `types.js` (JSDoc typedefs).

#### `js/auth.js` (399 lines — Large)
- **Purpose:** Supabase Auth wrapper — session check, sign out, profile upsert, session monitoring
- **Exports:** `window.auth` = `{requireAuth, getCurrentUser, getAuthUserId, getAuthRole, setAuthRole, signOut, upsertAuthProfile, loadAuthProfile, ready}`
- **Dependencies:** `supabaseClient` (config.js), `STORAGE_KEYS` (storage-keys.js), `showToast` (ui-utils.js), `window.idb` (indexeddb-utils.js)
- **Loaded by:** All pages except landing.html, permission-debug.html (auto-redirects unauthenticated users)
- **Problems:** Name is fine. Well-structured IIFE.

#### `js/indexeddb-utils.js` (807 lines — Large)
- **Purpose:** IndexedDB database management — init, CRUD for 6 object stores (projects, userProfile, photos, currentReports, draftData, cachedArchives)
- **Exports:** `window.idb.*` (30+ methods)
- **Dependencies:** None
- **Loaded by:** All pages that use data persistence
- **Problems:** Name is fine but verbose. Could be `idb.js` since it exports as `window.idb`.

#### `js/data-layer.js` (358 lines — Medium)
- **Purpose:** Unified data access — IndexedDB-first, Supabase-fallback pattern for projects and user settings
- **Exports:** `window.dataLayer.*` = `{loadProjects, loadProjectById, refreshProjectsFromCloud, loadUserSettings, saveUserSettings}`
- **Dependencies:** `supabaseClient`, `STORAGE_KEYS`, `getStorageItem`, `setStorageItem`, `fromSupabaseProject`, `window.idb`
- **Loaded by:** index, quick-interview, report, project-config, projects, settings
- **Problems:** Name is fine. Well-structured.

#### `js/supabase-utils.js` (146 lines — Small)
- **Purpose:** Data format converters — snake_case DB rows ↔ camelCase JS objects
- **Exports:** `fromSupabaseProject()`, `toSupabaseProject()`, `toSupabaseUserProfile()`
- **Dependencies:** `STORAGE_KEYS`
- **Loaded by:** index, project-config, projects, settings
- **Problems:** Name is slightly misleading — "utils" suggests general Supabase helpers, but it's specifically data converters/mappers. Better name: `supabase-mappers.js` or `db-converters.js`.

#### `js/ui-utils.js` (385 lines — Medium)
- **Purpose:** UI helpers (escapeHtml, showToast, formatDate/Time, autoExpand textareas) AND GPS location caching/fetching
- **Exports:** `escapeHtml()`, `generateId()`, `showToast()`, `formatDate()`, `formatDateTime()`, `formatTime()`, `autoExpand()`, `initAutoExpand()`, `initAllAutoExpandTextareas()`, `getLocalDateString()`, `getCachedLocation()`, `cacheLocation()`, `clearCachedLocation()`, `isLocationStale()`, `getLocationFromCache()`, `getFreshLocation()`
- **Dependencies:** `STORAGE_KEYS`
- **Loaded by:** All pages except login.html (some only use subset)
- **Problems:** ⚠️ **GPS location code doesn't belong here.** ~120 lines of geolocation caching is not a "UI utility." Should be split into `ui-utils.js` (UI only) and `location.js` (GPS/geolocation).

#### `js/pwa-utils.js` (164 lines — Small)
- **Purpose:** Service worker registration, offline banner, PWA navigation fix, update detection
- **Exports:** `initPWA()`, `setupPWANavigation()`, `registerServiceWorker()`, `setupOfflineBanner()`, `injectOfflineBanner()`, `showUpdateBanner()`
- **Dependencies:** None
- **Loaded by:** index, landing, permission-debug, permissions, project-config, projects, settings
- **Problems:** Name is fine.

#### `js/media-utils.js` (335 lines — Medium)
- **Purpose:** Photo capture/compression, logo upload/delete to Supabase Storage, high-accuracy GPS
- **Exports:** `readFileAsDataURL()`, `dataURLtoBlob()`, `compressImage()`, `compressImageToThumbnail()`, `uploadLogoToStorage()`, `deleteLogoFromStorage()`, `getHighAccuracyGPS()`
- **Dependencies:** `supabaseClient`, `getCachedLocation()`, `cacheLocation()`, `clearCachedLocation()` (from ui-utils.js)
- **Loaded by:** quick-interview, project-config
- **Problems:** Mixes photo utilities with GPS utilities and logo-specific Supabase storage operations. The GPS function here overlaps conceptually with the location code in ui-utils.js.

#### `js/report-rules.js` (648 lines — Large)
- **Purpose:** Business logic — report status flow, project eligibility, validation, toggle rules, cache freshness
- **Exports:** `REPORT_STATUS`, `CAPTURE_MODE`, `GUIDED_SECTIONS`, `TOGGLE_SECTIONS`, `getTodayDateString()`, `isReportFromToday()`, `isReportLate()`, `canStartNewReport()`, `getProjectsEligibleForNewReport()`, `getReportsByUrgency()`, `canTransitionStatus()`, `getNextValidStatus()`, `isReportEditable()`, `canReturnToNotes()`, `canChangeToggle()`, `getSectionToggleState()`, `canSwitchCaptureMode()`, `validateReportForAI()`, `validateReportForSubmit()`, `ensureFreshProjectsCache()`
- **Dependencies:** `STORAGE_KEYS`, `getStorageItem`, `getCurrentReport`, `window.dataLayer`
- **Loaded by:** index, quick-interview
- **Problems:** Name is fine. Well-structured, single-responsibility.

#### `js/api-keys.example.js` (6 lines — Tiny)
- **Purpose:** Template for API keys file
- **Problems:** None. Standard pattern.

### Dashboard Page (js/index/)

**HTML:** `index.html`  
**Folder issue:** ⚠️ `js/index/` is confusing — "index" typically means barrel exports or module indexes. Should be `js/dashboard/`.

#### `js/index/main.js` (477 lines — Large)
- **Purpose:** Dashboard orchestrator — DOMContentLoaded init, project loading, active project switching, refresh, bfcache handling, notification banners
- **Dependencies:** storage-keys, report-rules, data-layer, report-cards, cloud-recovery, weather
- **Problems:** Generic name `main.js`. Better: `dashboard-init.js` or `dashboard.js`

#### `js/index/report-cards.js` (622 lines — Large)
- **Purpose:** Renders report card UI on dashboard — draft/late/submitted cards, status badges, action buttons
- **Dependencies:** storage-keys, report-rules, ui-utils, main.js (projectsCache)
- **Problems:** Name is fine.

#### `js/index/report-creation.js` (283 lines — Medium)
- **Purpose:** New report creation — project picker modal, Supabase draft row creation, navigation to field capture
- **Dependencies:** storage-keys, report-rules, ui-utils, config, data-layer, main.js
- **Problems:** Name is fine.

#### `js/index/cloud-recovery.js` (245 lines — Medium)
- **Purpose:** Cross-device sync — recovers draft reports from Supabase into local storage
- **Dependencies:** storage-keys, config, report-cards, main.js
- **Problems:** Name is fine.

#### `js/index/weather.js` (191 lines — Medium)
- **Purpose:** Weather fetching from Open-Meteo API, conditions bar rendering, sunrise/sunset
- **Dependencies:** ui-utils (getFreshLocation, getLocationFromCache)
- **Problems:** Name is fine.

#### `js/index/panels.js` (286 lines — Medium)
- **Purpose:** Lazy-loaded expandable panels (weather details, drone ops, emergency contacts)
- **Dependencies:** weather.js caches, location functions
- **Problems:** Name is fine.

#### `js/index/messages.js` (84 lines — Small)
- **Purpose:** Demo message threads (static mock data — not real messaging)
- **Dependencies:** None
- **Problems:** Name is misleading — these are demo/mock messages, not a real messaging feature. Better: `mock-messages.js` or `demo-threads.js`.

#### `js/index/calendar.js` (41 lines — Small)
- **Purpose:** Simple calendar grid rendering for the calendar panel
- **Dependencies:** toggle-panel.js
- **Problems:** Name is fine.

#### `js/index/field-tools.js` (33 lines — Small)
- **Purpose:** Field tools modal open/close + carousel animation control
- **Dependencies:** DOM elements
- **Problems:** Name is fine.

#### `js/index/deep-links.js` (59 lines — Small)
- **Purpose:** Handles URL query params to open specific tools/panels on page load
- **Dependencies:** Tool opener functions
- **Problems:** Name is fine.

#### `js/index/toggle-panel.js` (28 lines — Small)
- **Purpose:** Generic panel toggle with mutual exclusion for conditions bar
- **Dependencies:** DOM elements
- **Problems:** Name is fine.

### Field Capture Page (js/interview/)

**HTML:** `quick-interview.html`  
**Folder issue:** ⚠️ `js/interview/` should be `js/field-capture/` or `js/capture/` to match the actual feature name ("Field Capture" in the spec, "Voice Interview" in the UI).

#### `js/interview/main.js` (313 lines — Medium)
- **Purpose:** Field capture orchestrator — init, permission checks, lifecycle, page unload
- **Dependencies:** All other interview/* files, media-utils, storage-keys, auth
- **Problems:** Generic `main.js`. Better: `capture-init.js`

#### `js/interview/state-mgmt.js` (362 lines — Medium)
- **Purpose:** Shared state namespace (`window.interviewState`), entry management, toggle logic, N/A marking
- **Dependencies:** storage-keys, report-rules
- **Problems:** Name is fine.

#### `js/interview/persistence.js` (1068 lines — Very Large)
- **Purpose:** Draft storage, autosave (Supabase + localStorage), cancel/delete report, Supabase upserts for entries/reports
- **Dependencies:** storage-keys, config, data-layer, supabase-retry, shared/delete-report
- **Problems:** ⚠️ **Largest file in the project.** Does too many things — autosave, Supabase sync, cancel flow, state protection. Should be split into `autosave.js`, `supabase-sync.js`, and `cancel-flow.js`.

#### `js/interview/ui-flow.js` (373 lines — Medium)
- **Purpose:** Capture mode selection (guided vs freeform), processing overlay, mode switching UI
- **Dependencies:** state-mgmt, persistence
- **Problems:** Name is fine.

#### `js/interview/freeform.js` (517 lines — Large)
- **Purpose:** Freeform/minimal mode — voice dictation, text entry, checklist
- **Dependencies:** state-mgmt, persistence
- **Problems:** Name is fine.

#### `js/interview/guided-sections.js` (409 lines — Medium)
- **Purpose:** Guided mode section rendering — section cards, toggles, progress
- **Dependencies:** state-mgmt
- **Problems:** Name is fine.

#### `js/interview/contractors-personnel.js` (752 lines — Large)
- **Purpose:** Contractor selection, personnel counts, crew management during field capture
- **Dependencies:** state-mgmt
- **Problems:** Name is fine.

#### `js/interview/equipment-manual.js` (294 lines — Medium)
- **Purpose:** Equipment tracking + manual entry of additional items
- **Dependencies:** state-mgmt
- **Problems:** Name is fine.

#### `js/interview/photos.js` (327 lines — Medium)
- **Purpose:** Photo capture, compression, GPS tagging, IndexedDB storage
- **Dependencies:** state-mgmt, media-utils, indexeddb-utils
- **Problems:** Name is fine.

#### `js/interview/ui-display.js` (264 lines — Medium)
- **Purpose:** Weather fetch, section previews, progress bar
- **Dependencies:** state-mgmt, ui-utils (getFreshLocation)
- **Problems:** Vague name. Better: `weather-preview.js` or `section-previews.js`.

#### `js/interview/finish-processing.js` (590 lines — Large)
- **Purpose:** AI processing webhook call, finish flow, navigation to report editor
- **Dependencies:** state-mgmt, persistence, config, report-rules
- **Problems:** Name is fine.

### Report Editor Page (js/report/)

**HTML:** `report.html`  
**Folder:** `js/report/` — name is fine.

#### `js/report/main.js` (215 lines — Medium)
- **Purpose:** Report editor orchestrator — DOMContentLoaded, tab switching, final review flow, visibility handlers
- **Dependencies:** All other report/* files, data-loading (reportState)
- **Problems:** Generic `main.js`. Better: `editor-init.js`

#### `js/report/data-loading.js` (325 lines — Medium)
- **Purpose:** Defines `window.reportState` shared state namespace, loads report data from localStorage/IDB/Supabase
- **Dependencies:** storage-keys, ui-utils, data-layer, config
- **Problems:** Name is fine. Also creates shared state — could note that.

#### `js/report/form-fields.js` (981 lines — Very Large)
- **Purpose:** Populates all form fields, contractor tables, personnel tables, equipment tables, photo rendering
- **Dependencies:** reportState, ui-utils, media-utils
- **Problems:** ⚠️ **Second largest file.** Does form population AND table rendering AND photo display. Could split into `form-populate.js`, `contractor-tables.js`, `photo-display.js`.

#### `js/report/ai-refine.js` (274 lines — Medium)
- **Purpose:** AI refinement — calls n8n webhook to refine individual text sections, status polling
- **Dependencies:** reportState, config
- **Problems:** Name is fine.

#### `js/report/autosave.js` (285 lines — Medium)
- **Purpose:** Auto-save to localStorage and Supabase report_data table
- **Dependencies:** reportState, storage-keys, config
- **Problems:** Name is fine.

#### `js/report/preview.js` (478 lines — Large)
- **Purpose:** Renders the RPR Daily Report preview from form data
- **Dependencies:** reportState, ui-utils
- **Problems:** Name is fine.

#### `js/report/pdf-generator.js` (765 lines — Large)
- **Purpose:** Client-side PDF generation using jsPDF
- **Dependencies:** reportState, jsPDF CDN
- **Problems:** Name is fine.

#### `js/report/submit.js` (301 lines — Medium)
- **Purpose:** Submit flow — PDF upload, Supabase finalization, local cleanup
- **Dependencies:** reportState, storage-keys, config, pdf-generator
- **Problems:** Name is fine.

#### `js/report/delete-report.js` (76 lines — Small)
- **Purpose:** Delete confirmation UI + local storage cleanup (delegates Supabase cascade to shared/delete-report.js)
- **Dependencies:** reportState, storage-keys, shared/delete-report.js
- **Problems:** ⚠️ **Name collision** with `js/shared/delete-report.js`. Confusing. Better: `delete-confirm.js` or `delete-ui.js`.

#### `js/report/original-notes.js` (293 lines — Medium)
- **Purpose:** Renders the "Original Notes" tab showing raw capture data
- **Dependencies:** reportState, ui-utils
- **Problems:** Name is fine.

#### `js/report/debug.js` (463 lines — Large)
- **Purpose:** Debug panel — field mismatch detection, JSON/markdown export
- **Dependencies:** reportState
- **Problems:** Name is fine for a dev tool.

### Project Config Page (js/project-config/)

**HTML:** `project-config.html`  
**Folder:** Name is fine.

#### `js/project-config/main.js` (105 lines — Small)
- **Purpose:** Entry point — shared state vars, dirty state management, DOMContentLoaded
- **Dependencies:** crud, contractors, form, document-import
- **Problems:** Generic `main.js`. Better: `config-init.js`

#### `js/project-config/crud.js` (306 lines — Medium)
- **Purpose:** Supabase CRUD for projects — save, delete, load
- **Dependencies:** config, storage-keys, supabase-utils, data-layer, ui-utils
- **Problems:** Name is fine.

#### `js/project-config/contractors.js` (310 lines — Medium)
- **Purpose:** Contractor list rendering, add/edit/delete, drag-to-reorder
- **Dependencies:** ui-utils, main.js state
- **Problems:** Name is fine.

#### `js/project-config/form.js` (158 lines — Small)
- **Purpose:** Form population and logo management
- **Dependencies:** ui-utils, media-utils, main.js state
- **Problems:** Name is fine.

#### `js/project-config/document-import.js` (334 lines — Medium)
- **Purpose:** Document upload + AI extraction via n8n webhook
- **Dependencies:** ui-utils, main.js state
- **Problems:** Name is fine.

### Single-File Pages

#### `js/archives/main.js` (365 lines — Medium)
- **Purpose:** Archives page — loads submitted reports from Supabase, project filtering, inline PDF viewer
- **Dependencies:** config, storage-keys, ui-utils, indexeddb-utils, auth
- **Problems:** Generic `main.js`. Better: `archives.js`

#### `js/projects/main.js` (313 lines — Medium)
- **Purpose:** Project list — load, render, select active project, cloud sync
- **Dependencies:** config, storage-keys, data-layer, ui-utils, indexeddb-utils, auth
- **Problems:** Generic `main.js`. Better: `project-list.js`

#### `js/settings/main.js` (586 lines — Large)
- **Purpose:** Settings page — user profile form, Supabase sync, scratch pad, data export, cache clear
- **Dependencies:** config, storage-keys, data-layer, ui-utils, auth, pwa-utils
- **Problems:** Generic `main.js`. Better: `settings.js`

#### `js/login/main.js` (367 lines — Medium)
- **Purpose:** Auth UI — sign in, sign up, role picker, device registration
- **Dependencies:** config, storage-keys
- **Problems:** Generic `main.js`. Better: `login.js`

#### `js/landing/main.js` (189 lines — Small)
- **Purpose:** Landing page animations — voice recording demo, scroll effects, CTA
- **Dependencies:** pwa-utils
- **Problems:** Generic `main.js`. Better: `landing.js`

#### `js/permissions/main.js` (791 lines — Large)
- **Purpose:** Permission onboarding flow — mic, camera, location requests with iOS-specific handling
- **Dependencies:** pwa-utils, storage-keys, ui-utils
- **Problems:** Generic `main.js`. Better: `permissions.js`

#### `js/permission-debug/main.js` (741 lines — Large)
- **Purpose:** Developer debug tool — tests all device APIs, shows permission states
- **Dependencies:** pwa-utils
- **Problems:** Generic `main.js`. Better: `permission-debug.js`

### Shared Modules (js/shared/)

#### `js/shared/ai-assistant.js` (811 lines — Large)
- **Purpose:** Floating AI chat button + overlay — persisted conversation, n8n webhook integration
- **Dependencies:** STORAGE_KEYS, getCachedLocation (optional)
- **Loaded by:** All pages except login, landing, permission-debug (via `<script>` at bottom)
- **Problems:** Name is fine.

#### `js/shared/cloud-photos.js` (148 lines — Small)
- **Purpose:** Fetches photo metadata from Supabase `photos` table, generates signed URLs
- **Dependencies:** config (supabaseClient)
- **Loaded by:** index.html, report.html
- **Problems:** Name is fine.

#### `js/shared/delete-report.js` (115 lines — Small)
- **Purpose:** Full Supabase cascade delete — photos storage → child tables → PDF storage → parent row
- **Dependencies:** config (supabaseClient)
- **Loaded by:** index.html, quick-interview.html, report.html
- **Problems:** ⚠️ **Name collision** with `js/report/delete-report.js`. Better: `cascade-delete.js` or `supabase-delete-cascade.js`.

#### `js/shared/realtime-sync.js` (200 lines — Medium)
- **Purpose:** Supabase Realtime subscriptions — multi-device sync for reports/projects
- **Dependencies:** config (supabaseClient), STORAGE_KEYS
- **Loaded by:** index.html, report.html, quick-interview.html, archives.html
- **Problems:** Name is fine.

#### `js/shared/supabase-retry.js` (52 lines — Small)
- **Purpose:** Exponential backoff retry wrapper for Supabase operations
- **Dependencies:** None
- **Loaded by:** quick-interview.html, report.html
- **Problems:** Name is fine.

### Field Tools (js/tools/)

All tools are self-contained modules loaded only by `index.html`. They open as modal overlays on the dashboard.

| File | Lines | Purpose | External Deps |
|------|-------|---------|---------------|
| `ar-measure.js` | 485 | AR measurement using WebXR | WebXR API |
| `calc.js` | 568 | Construction calculator (feet-inch, area/volume, converter) | None |
| `compass.js` | 199 | Digital compass using DeviceOrientation | DeviceOrientation API |
| `decibel.js` | 265 | Sound level meter using AudioContext | getUserMedia |
| `flashlight.js` | 246 | Torch control via camera API | getUserMedia |
| `level.js` | 352 | Bubble level / inclinometer | DeviceOrientation API |
| `maps.js` | 528 | Leaflet map overlay with satellite/topo | Leaflet CDN |
| `measure.js` | 251 | GPS distance measurement | Geolocation API |
| `photo-markup.js` | 930 | Post-capture photo markup (drawing tools) | Canvas API |
| `qrscanner.js` | 295 | QR code scanner | jsQR CDN, getUserMedia |
| `slope.js` | 247 | Slope & grade calculator | None |
| `timer.js` | 366 | Stopwatch + countdown timer | None |

**Problems:** None. Well-named, self-contained. The `js/tools/` convention is clean.

### Config/Build Files

| File | Purpose | Notes |
|------|---------|-------|
| `sw.js` (368 lines) | Service worker — offline caching, cache versioning | Must be updated when files are renamed |
| `manifest.json` (113 lines) | PWA manifest — app name, icons, display mode | Standard |
| `package.json` (17 lines) | Build scripts (Tailwind CSS, Capacitor) | Minimal |
| `tailwind.config.js` (31 lines) | Tailwind CSS configuration | Standard |
| `version.json` (1 line) | App version `{"version": "6.9.21"}` | Mirrors sw.js cache version |
| `.gitignore` | Git ignore patterns | Standard |

### CSS & Assets

| File/Dir | Purpose |
|----------|---------|
| `css/output.css` | Tailwind-generated CSS (minified, ~50KB) |
| `src/input.css` | Tailwind input (3 lines — just directives) |
| `assets/` | Favicons and app icons (6 files) |
| `icons/` | PWA icons in multiple sizes + maskable variants (17 files) |

### Supabase Migrations

| File | Purpose |
|------|---------|
| `003_report_data.sql` | report_data table for cross-platform sync |
| `004_organizations.sql` | Organizations/teams table |
| `005_device_metadata.sql` | device_info JSONB on user_profiles |
| `006_project_report_date_contract_day.sql` | report_date + contract_day_no on projects |
| `007_user_devices.sql` | Multi-device tracking table |
| `008_deprecate_report_backup.sql` | Deprecate report_backup |
| `009_merge_final_reports.sql` | Merge final_reports columns into reports |
| `010_reports_fk.sql` | FK constraint on reports.project_id |
| `011_interview_backup_org_id.sql` | Fix interview_backup RLS |

### Documentation

| File | Purpose |
|------|---------|
| `docs/ARCHITECTURE.md` | System architecture overview |
| `docs/FUNCTIONAL-SPEC.md` | Functional specification |
| `docs/SYSTEM_MAP.md` | System map |
| `docs/AUDIT-REPORT.md` | Previous audit report |
| `docs/FULL-DASHBOARD-AUDIT.md` | Dashboard-specific audit |
| `docs/DASHBOARD-BFCACHE-FIX.md` | iOS bfcache fix documentation |
| `docs/NAVIGATION-AUDIT.md` | Navigation flow audit |
| `docs/TESTING-PLAN.md` | Testing plan |
| `docs/_ARCHIVE/` | Archived docs, old migrations, reference files |
| `js/README.md` | JS module reference + storage architecture (comprehensive) |

---

## Naming Problems Found

### Critical (causes developer confusion)

| # | Problem | Files Affected | Impact |
|---|---------|---------------|--------|
| 1 | **`js/index/` folder** named after HTML file, not feature | 11 files | Developers think "index" = barrel exports or homepage framework |
| 2 | **`js/interview/` folder** uses internal terminology | 11 files | "Interview" doesn't match UI ("Quick Interview") or spec ("Field Capture") |
| 3 | **10 generic `main.js` files** | 10 files | `main.js` tells you nothing — you have to look at the parent folder |
| 4 | **Two `delete-report.js` files** | 2 files | `js/shared/delete-report.js` (cascade) vs `js/report/delete-report.js` (UI) — name collision |

### Moderate (DX improvement)

| # | Problem | Files Affected |
|---|---------|---------------|
| 5 | `storage-keys.js` is 3 files in 1 | 1 file |
| 6 | `ui-utils.js` contains GPS logic | 1 file |
| 7 | `supabase-utils.js` name suggests general utils, is really converters | 1 file |
| 8 | `js/interview/ui-display.js` vague name | 1 file |
| 9 | `js/index/messages.js` suggests real messaging feature | 1 file |

### Minor (nice-to-have)

| # | Problem |
|---|---------|
| 10 | `quick-interview.html` could be `capture.html` |
| 11 | `indexeddb-utils.js` verbose — exports as `window.idb` |
| 12 | `js/interview/persistence.js` too large (1068 lines) |

---

## Proposed Restructure

### Phase 1: Folder Renames (Highest Impact, Low Risk)

| Old Path | New Path | Rationale |
|----------|----------|-----------|
| `js/index/` | `js/dashboard/` | Matches feature name, avoids "index" ambiguity |
| `js/interview/` | `js/capture/` | Matches the feature ("field capture") — shorter than "field-capture" |

### Phase 2: main.js → Descriptive Names

| Old Path | New Path | Rationale |
|----------|----------|-----------|
| `js/index/main.js` | `js/dashboard/init.js` | Dashboard orchestrator/init |
| `js/interview/main.js` | `js/capture/init.js` | Field capture orchestrator/init |
| `js/report/main.js` | `js/report/init.js` | Report editor orchestrator/init |
| `js/project-config/main.js` | `js/project-config/init.js` | Project config orchestrator/init |
| `js/archives/main.js` | `js/archives/archives.js` | Single file — name matches folder |
| `js/projects/main.js` | `js/projects/project-list.js` | Describes what it renders |
| `js/settings/main.js` | `js/settings/settings.js` | Single file — name matches folder |
| `js/login/main.js` | `js/login/login.js` | Single file — name matches folder |
| `js/landing/main.js` | `js/landing/landing.js` | Single file — name matches folder |
| `js/permissions/main.js` | `js/permissions/permissions.js` | Single file — name matches folder |
| `js/permission-debug/main.js` | `js/permission-debug/permission-debug.js` | Single file — name matches folder |

### Phase 3: Disambiguate Collisions

| Old Path | New Path | Rationale |
|----------|----------|-----------|
| `js/shared/delete-report.js` | `js/shared/cascade-delete.js` | Distinguishes from report/delete UI |
| `js/report/delete-report.js` | `js/report/delete-confirm.js` | Distinguishes from shared cascade |

### Phase 4: Rename Misleading Files

| Old Path | New Path | Rationale |
|----------|----------|-----------|
| `js/supabase-utils.js` | `js/supabase-mappers.js` | It maps DB rows ↔ JS objects, not general utils |
| `js/interview/ui-display.js` | `js/capture/weather-previews.js` | Describes actual content |
| `js/index/messages.js` | `js/dashboard/mock-messages.js` | Not real messaging — demo data |

### Phase 5: Split Overloaded Files (Optional, Higher Risk)

| Current File | Split Into | Rationale |
|-------------|-----------|-----------|
| `js/storage-keys.js` (455 lines) | `js/storage-keys.js` (~60 lines, constants only) + `js/report-storage.js` (~300 lines, report CRUD + IDB hydration) | Separation of concerns |
| `js/ui-utils.js` (385 lines) | `js/ui-utils.js` (~265 lines, UI only) + `js/location.js` (~120 lines, GPS/geo) | Location is not UI |
| `js/interview/persistence.js` (1068 lines) | `js/capture/autosave.js` + `js/capture/supabase-sync.js` + `js/capture/cancel-flow.js` | Largest file, 3 distinct concerns |

### HTML Rename (Optional)

| Old | New | Rationale |
|-----|-----|-----------|
| `quick-interview.html` | `capture.html` | Matches folder rename, shorter |

---

## Rename Impact Matrix

Every rename requires updates in these locations:

### For folder renames (`js/index/` → `js/dashboard/`, `js/interview/` → `js/capture/`):

| Update Location | What to Change |
|----------------|----------------|
| **HTML files** | All `<script src="./js/index/...">` → `<script src="./js/dashboard/...">` in `index.html` |
| | All `<script src="./js/interview/...">` → `<script src="./js/capture/...">` in `quick-interview.html` |
| **`sw.js`** | Update STATIC_ASSETS list with new paths |
| **`js/README.md`** | Update module reference table |
| **Cross-file references** | `js/index/` files reference each other via comments — update comments |

### Script tag updates per HTML file:

**`index.html`** (for js/index/ → js/dashboard/):
```
./js/index/field-tools.js    → ./js/dashboard/field-tools.js
./js/index/calendar.js       → ./js/dashboard/calendar.js
./js/index/messages.js        → ./js/dashboard/mock-messages.js
./js/index/weather.js         → ./js/dashboard/weather.js
./js/index/panels.js          → ./js/dashboard/panels.js
./js/index/cloud-recovery.js  → ./js/dashboard/cloud-recovery.js
./js/index/report-cards.js    → ./js/dashboard/report-cards.js
./js/index/report-creation.js → ./js/dashboard/report-creation.js
./js/index/main.js            → ./js/dashboard/init.js
./js/index/deep-links.js      → ./js/dashboard/deep-links.js
./js/index/toggle-panel.js    → ./js/dashboard/toggle-panel.js
```

**`quick-interview.html`** (for js/interview/ → js/capture/):
```
./js/interview/state-mgmt.js           → ./js/capture/state-mgmt.js
./js/interview/persistence.js          → ./js/capture/persistence.js
./js/interview/ui-flow.js              → ./js/capture/ui-flow.js
./js/interview/freeform.js             → ./js/capture/freeform.js
./js/interview/guided-sections.js      → ./js/capture/guided-sections.js
./js/interview/contractors-personnel.js → ./js/capture/contractors-personnel.js
./js/interview/equipment-manual.js     → ./js/capture/equipment-manual.js
./js/interview/photos.js               → ./js/capture/photos.js
./js/interview/ui-display.js           → ./js/capture/weather-previews.js
./js/interview/finish-processing.js    → ./js/capture/finish-processing.js
./js/interview/main.js                 → ./js/capture/init.js
```

**`report.html`** (for delete-report.js rename):
```
./js/report/delete-report.js → ./js/report/delete-confirm.js
```

**All pages loading `js/shared/delete-report.js`** (index, quick-interview, report):
```
./js/shared/delete-report.js → ./js/shared/cascade-delete.js
```

**All pages loading `js/supabase-utils.js`** (index, project-config, projects, settings):
```
./js/supabase-utils.js → ./js/supabase-mappers.js
```

### No code logic changes needed

All renames are pure file/path changes. No function signatures, variable names, or exports change. The `window.*` namespace references remain identical.

---

## Recommended Naming Convention

### Files
- **kebab-case** for all file names: `report-cards.js`, `cascade-delete.js`
- **Never** use `main.js` — use `init.js` for orchestrators or the feature name for single-file pages
- **Suffix conventions:**
  - `-init.js` — orchestrator/entry point (DOMContentLoaded handler)
  - `-utils.js` — stateless helper functions
  - `-mappers.js` — data format converters
  - No suffix — feature modules (default)

### Folders
- **kebab-case** matching the feature name, not the HTML filename
- `js/dashboard/` not `js/index/`
- `js/capture/` not `js/interview/`
- `js/shared/` for cross-page modules (keep as-is)
- `js/tools/` for field tools (keep as-is)

### HTML Pages
- **kebab-case**, named for the feature
- Prefer short names: `capture.html` over `quick-interview.html`

---

## Final Proposed Structure

```
./capture.html              (renamed from quick-interview.html)
./index.html                (dashboard — keep name, it's the PWA entry point)
./report.html
./archives.html
./landing.html
./login.html
./permissions.html
./permission-debug.html
./project-config.html
./projects.html
./settings.html

./js/config.js
./js/storage-keys.js        (slimmed to constants + get/set helpers)
./js/report-storage.js      (split from storage-keys — report CRUD + IDB hydration)
./js/auth.js
./js/data-layer.js
./js/indexeddb-utils.js
./js/supabase-mappers.js    (renamed from supabase-utils.js)
./js/ui-utils.js            (slimmed — UI only)
./js/location.js            (split from ui-utils — GPS/geolocation)
./js/media-utils.js
./js/pwa-utils.js
./js/report-rules.js
./js/api-keys.example.js

./js/dashboard/             (renamed from js/index/)
    init.js                 (renamed from main.js)
    calendar.js
    cloud-recovery.js
    deep-links.js
    field-tools.js
    mock-messages.js         (renamed from messages.js)
    panels.js
    report-cards.js
    report-creation.js
    toggle-panel.js
    weather.js

./js/capture/               (renamed from js/interview/)
    init.js                 (renamed from main.js)
    state-mgmt.js
    persistence.js
    ui-flow.js
    freeform.js
    guided-sections.js
    contractors-personnel.js
    equipment-manual.js
    photos.js
    weather-previews.js      (renamed from ui-display.js)
    finish-processing.js

./js/report/
    init.js                 (renamed from main.js)
    ai-refine.js
    autosave.js
    data-loading.js
    debug.js
    delete-confirm.js        (renamed from delete-report.js)
    form-fields.js
    original-notes.js
    pdf-generator.js
    preview.js
    submit.js

./js/project-config/
    init.js                 (renamed from main.js)
    crud.js
    contractors.js
    form.js
    document-import.js

./js/archives/archives.js    (renamed from main.js)
./js/projects/project-list.js (renamed from main.js)
./js/settings/settings.js    (renamed from main.js)
./js/login/login.js          (renamed from main.js)
./js/landing/landing.js      (renamed from main.js)
./js/permissions/permissions.js (renamed from main.js)
./js/permission-debug/permission-debug.js (renamed from main.js)

./js/shared/
    ai-assistant.js
    cascade-delete.js        (renamed from delete-report.js)
    cloud-photos.js
    realtime-sync.js
    supabase-retry.js

./js/tools/                  (unchanged)
    ar-measure.js
    calc.js
    compass.js
    decibel.js
    flashlight.js
    level.js
    maps.js
    measure.js
    photo-markup.js
    qrscanner.js
    slope.js
    timer.js
```
