# Thomas — FieldVoice Pro Test Map

> **Created:** 2026-02-20
> **Purpose:** Testing-focused audit of the entire V69 codebase
> **Method:** Chunk-by-chunk code scan → testable flows, assertions, storage expectations
> **Status:** IN PROGRESS

---

## Table of Contents

1. [Foundation Modules](#1-foundation-modules) — ✅ Complete
2. [Dashboard (index.html)](#2-dashboard) — ✅ Complete
3. [Interview / Field Capture](#3-interview--field-capture) — ⏳ Pending
4. [Report Editor](#4-report-editor) — ⏳ Pending
5. [Projects & Config](#5-projects--config) — ⏳ Pending
6. [Other Pages](#6-other-pages) — ⏳ Pending
7. [Field Tools](#7-field-tools) — ⏳ Pending
8. [Shared Modules](#8-shared-modules) — ⏳ Pending
9. [Service Worker & PWA](#9-service-worker--pwa) — ⏳ Pending
10. [Prioritized Test Plan](#10-prioritized-test-plan) — ⏳ Final synthesis

---

## 1. Foundation Modules

> **Files:** config.js (11), storage-keys.js (129), auth.js (400), indexeddb-utils.js (939), data-layer.js (358), ui-utils.js (385), media-utils.js (310), pwa-utils.js (164), supabase-utils.js (146), report-rules.js (663)
> **Total:** 3,505 lines across 10 files
> **Role:** Loaded by every page — auth gate, storage, data access, utilities, business rules

---

### 1.1 Auth Flow (auth.js)

**User Flow: Page Load Auth Gate**
1. Any protected page loads → `DOMContentLoaded` fires
2. `requireAuth()` calls `supabaseClient.auth.getSession()`
3. If no session → redirect to `login.html`
4. If session → inject sign-out button (settings.html only), cache `org_id`, start session monitor, request `navigator.storage.persist()`
5. `auth.ready` promise resolves → other modules can proceed

**Testable Assertions:**
- [ ] Visiting any protected page without auth → redirected to `login.html`
- [ ] Visiting `login.html` or `landing.html` → no auth check, no redirect
- [ ] After valid login → `auth.ready` resolves with session object
- [ ] `localStorage` has: `fvp_user_id`, `fvp_user_name`, `fvp_user_email`, `fvp_auth_user_id`, `fvp_org_id`
- [ ] Sign-out button appears ONLY on `settings.html`
- [ ] `navigator.storage.persist()` is called on every protected page load

**User Flow: Sign Out**
1. User clicks sign-out on settings page
2. `signOut()` clears session check interval
3. Calls `supabaseClient.auth.signOut()`
4. Removes 14+ specific localStorage keys
5. Clears all `fvp_ai_conversation_*` keys (wildcard)
6. Clears 5 IndexedDB stores: `currentReports`, `draftData`, `reportData`, `userProfile`, `projects`
7. Redirects to `login.html`

**Testable Assertions:**
- [ ] After sign-out: all `fvp_*` keys removed from localStorage (except `fvp_device_id`)
- [ ] After sign-out: IndexedDB stores `currentReports`, `draftData`, `reportData`, `userProfile`, `projects` are empty
- [ ] After sign-out: redirected to `login.html`
- [ ] `fvp_device_id` persists across sign-out (not in removal list)

**User Flow: Session Monitoring**
1. `startPeriodicSessionCheck()` runs every 5 minutes
2. Calls `getSession()` — if invalid, shows warning toast (no redirect)
3. `onAuthStateChange` listens for `TOKEN_REFRESHED` and `SIGNED_OUT`

**Testable Assertions:**
- [ ] Expired session → toast "Your session has expired..." appears (no redirect)
- [ ] Warning shows only once until token refreshes (`_sessionWarningShown` flag)
- [ ] `SIGNED_OUT` event triggers full `signOut()` flow

**Error Scenarios:**
- Supabase unreachable during `requireAuth()` → catch redirects to login
- `getSession()` returns error → redirects to login
- IndexedDB clear fails during sign-out → logged as warning, sign-out continues

**Storage Expectations:**
| Key | Set By | Cleared By |
|---|---|---|
| `fvp_user_id` | `upsertAuthProfile()` | `signOut()` |
| `fvp_user_name` | `upsertAuthProfile()` | `signOut()` |
| `fvp_user_email` | `upsertAuthProfile()` | `signOut()` |
| `fvp_auth_user_id` | `upsertAuthProfile()` | `signOut()` |
| `fvp_org_id` | `ensureOrgIdCached()` | `signOut()` |
| `fvp_auth_role` | `setAuthRole()` | `signOut()` |
| `fvp_device_id` | `getDeviceId()` (lazy) | **NEVER** (persists) |

---

### 1.2 Storage Keys & Blocklist (storage-keys.js)

**Testable Assertions:**
- [ ] All 30+ `STORAGE_KEYS` constants use `fvp_` prefix
- [ ] `getDeviceId()` generates UUID on first call, returns same UUID on subsequent calls
- [ ] `getStorageItem()` parses JSON strings; returns raw string if parse fails
- [ ] `setStorageItem()` JSON-stringifies values before storing
- [ ] `addToDeletedBlocklist()` caps list at 100 entries (oldest dropped via `slice(-100)`)
- [ ] `isDeletedReport(reportId)` returns `true` for blocklisted IDs
- [ ] `removeFromDeletedBlocklist()` removes specific ID from list

**Known Bug to Verify (George's review):**
- [ ] Blocklist cap at 100: if user deletes 101+ reports, old IDs roll off → could reappear via realtime sync

---

### 1.3 IndexedDB (indexeddb-utils.js)

**Database:** `fieldvoice-pro`, version 7

**7 Object Stores:**
| Store | Key | Indexes | Purpose |
|---|---|---|---|
| `projects` | `id` | — | Cached project objects |
| `userProfile` | `deviceId` | — | Inspector profile |
| `photos` | `id` | `reportId`, `syncStatus` | Photo blobs + metadata |
| `currentReports` | `id` | `project_id`, `status` | Active report headers |
| `draftData` | `reportId` | — | Unsaved draft payloads |
| `cachedArchives` | `key` | — | Offline archive cache |
| `reportData` | `reportId` | — | Full report content |

**Testable Assertions:**
- [ ] `initDB()` opens database successfully with version 7
- [ ] Stale connection detection: if transaction throws, reopens connection
- [ ] 3-second timeout on `indexedDB.open()` — rejects on timeout (iOS bfcache scenario)
- [ ] `onupgradeneeded` creates all 7 stores incrementally (safe for any prior version)
- [ ] All CRUD operations work: `saveProject`/`getProject`/`getAllProjects`/`deleteProject`
- [ ] `getPhotosByReportId(reportId)` returns only photos for that report
- [ ] `deletePhotosByReportId(reportId)` removes all photos via cursor
- [ ] `replaceAllCurrentReports(map)` clears store then inserts all values
- [ ] `clearStore(storeName)` empties specified store
- [ ] Compatibility shim: if `window.dataStore` exists, `window.idb` methods delegate to it

**Error Scenarios:**
- `indexedDB.open()` times out (3s) → rejects with "IndexedDB open timed out"
- `onblocked` event (another tab) → waits for timeout or eventual success
- iOS bfcache `db.onclose` → sets `db = null`, next call reopens

---

### 1.4 Data Layer (data-layer.js)

**User Flow: Load Projects**
1. `loadProjects()` → reads from IndexedDB only (no Supabase)
2. Normalizes to camelCase via `normalizeProject()`
3. Filters by `org_id` if available
4. Caches to localStorage (`fvp_projects`) for `report-rules.js`

**User Flow: Refresh Projects from Cloud**
1. `refreshProjectsFromCloud()` → queries Supabase `projects` table (filtered by org_id)
2. Converts via `fromSupabaseProject()` 
3. Clears IndexedDB `projects` store
4. Re-caches each project to IndexedDB
5. Updates localStorage `fvp_projects` and `fvp_projects_cache_ts`

**Testable Assertions:**
- [ ] `loadProjects()` returns empty array when IndexedDB is empty (no network call)
- [ ] `refreshProjectsFromCloud()` populates IndexedDB with Supabase data
- [ ] After `refreshProjectsFromCloud()`: `localStorage.fvp_projects` has project map, `fvp_projects_cache_ts` is updated
- [ ] `loadProjectById(id)` → IDB first, Supabase fallback, caches on fetch
- [ ] `loadUserSettings()` → IDB first (keyed by `auth_user_id`), Supabase fallback, caches on fetch
- [ ] Offline: `refreshProjectsFromCloud()` returns empty array, no error thrown

**Known Bug to Verify:**
- [ ] `refreshProjectsFromCloud()` clears IDB before fetching — if fetch fails after clear, local projects are lost

---

### 1.5 UI Utilities (ui-utils.js)

**Testable Assertions:**
- [ ] `escapeHtml('<script>')` returns `&lt;script&gt;` (XSS protection)
- [ ] `generateId()` returns valid UUID format
- [ ] `showToast('msg', 'success')` creates toast element, auto-removes after 3s default
- [ ] `showToast` with `onClick` callback makes toast clickable, uses innerHTML (allows HTML)
- [ ] `showToast` without `onClick` uses `escapeHtml()` on message
- [ ] `formatDate('2026-02-20', 'short')` returns "Thu, Feb 20, 2026" format
- [ ] `getLocalDateString()` returns `YYYY-MM-DD` in local timezone (not UTC)
- [ ] `getCachedLocation()` returns `{lat, lng, timestamp}` or `null`
- [ ] `getFreshLocation()` checks browser permission first, then attempts GPS, falls back to cache
- [ ] `getFreshLocation()` with denied permission → clears cached location, returns `null`
- [ ] `autoExpand(textarea)` grows height to `scrollHeight`, caps at 400px default

---

### 1.6 Media Utilities (media-utils.js)

**User Flow: Photo Capture + Compression**
1. Photo captured via file input
2. `compressImage(dataUrl, 1200, 0.7)` → Canvas resize → JPEG at 70% quality
3. `getHighAccuracyGPS()` → takes up to 3 readings over 5s, picks most accurate

**Testable Assertions:**
- [ ] `compressImage()` reduces file size (output < input for large photos)
- [ ] `compressImage()` output is JPEG regardless of input format
- [ ] `compressImage()` maintains aspect ratio when width > maxWidth
- [ ] `compressImageToThumbnail()` defaults to 400px maxWidth (for logos)
- [ ] `getHighAccuracyGPS()` returns `{lat, lng, accuracy}` or `null`
- [ ] `getHighAccuracyGPS()` with accuracy > 100m → shows weak signal toast
- [ ] `getHighAccuracyGPS()` failure → falls back to `getCachedLocation()`
- [ ] `uploadLogoToStorage()` uploads to `project-logos` bucket, returns signed URL
- [ ] `deleteLogoFromStorage()` tries 5 extensions (png, jpg, jpeg, gif, svg)

---

### 1.7 Report Rules (report-rules.js)

**Business Rules — Testable Assertions:**
- [ ] `REPORT_STATUS` flow: `draft → pending_refine → refined → ready_to_submit → submitted`
- [ ] `canStartNewReport(projectId)`: returns `{allowed: true}` when no existing report today
- [ ] `canStartNewReport(projectId)`: returns `CONTINUE_EXISTING` when draft exists for same project + today
- [ ] Users CAN create multiple reports per project per day (v6.6.17 change)
- [ ] Late reports don't block new ones (v6.9.1 change)
- [ ] `canTransitionStatus()`: cannot go backwards (draft → submitted OK, submitted → draft BLOCKED)
- [ ] `canTransitionStatus()`: cannot skip steps (draft → refined BLOCKED, must go through pending_refine)
- [ ] `isReportEditable()`: true only for `draft` or `refined` status
- [ ] `canReturnToNotes()`: true only for `draft` status
- [ ] `validateReportForAI()`: requires at least one entry; guided mode requires weather data
- [ ] `validateReportForSubmit()`: requires project_id, reportDate, at least one entry
- [ ] `getReportsByUrgency()`: late reports sorted oldest-first, today's sorted newest-first
- [ ] `isReportLate()`: true when `reportDate < today` AND status ≠ `submitted`
- [ ] `getTodayDateString()` returns `YYYY-MM-DD` in local timezone

**Known Bug to Verify:**
- [ ] Report started at 11:59 PM → `isReportFromToday()` returns false at 12:00 AM (no grace period)

---

### 1.8 PWA Utilities (pwa-utils.js)

**Testable Assertions:**
- [ ] `initPWA()` registers service worker, sets up offline banner, handles PWA navigation
- [ ] `setupPWANavigation()` intercepts internal links in standalone mode (prevents Safari breakout)
- [ ] `registerServiceWorker()` requests `navigator.storage.persist()`
- [ ] Update banner appears when new SW version detected
- [ ] Offline banner shows when `navigator.onLine` is false, hides when true

**Known Bug to Verify (George's review):**
- [ ] `archives.html`, `login.html`, `report.html` do NOT load pwa-utils.js → no offline banner, no SW registration on those pages

---

### 1.9 Supabase Utils (supabase-utils.js)

**Testable Assertions:**
- [ ] `fromSupabaseProject()` converts snake_case to camelCase correctly
- [ ] `fromSupabaseProject()` parses `contractors` JSONB (string or object)
- [ ] `toSupabaseProject()` converts camelCase to snake_case, JSON-stringifies contractors
- [ ] `toSupabaseProject()` includes `org_id` from project or localStorage fallback
- [ ] Malformed contractors JSON → returns empty array, logs warning

---

### 1.10 Cross-File Integration Tests

**Auth → IndexedDB → Data Layer Chain:**
- [ ] Login → auth sets localStorage keys → data-layer can query using those keys
- [ ] Sign-out → clears IDB stores → `loadProjects()` returns empty array
- [ ] `auth.ready` promise → data-layer waits for it before Supabase queries

**Storage Consistency:**
- [ ] After login: `fvp_user_id` in localStorage matches `user_profiles.id` in Supabase
- [ ] After project refresh: projects in IDB match projects in Supabase (filtered by org_id)
- [ ] `fvp_device_id` is generated once, persists across sessions and sign-outs

**Offline Behavior:**
- [ ] `refreshProjectsFromCloud()` when offline → returns empty, no error
- [ ] `loadProjects()` when offline → returns IDB cache
- [ ] `loadUserSettings()` when offline → returns IDB cache or null
- [ ] `getFreshLocation()` when GPS denied → returns cached location or null

---

## 2. Dashboard (index.html)

> **Files:** index.html (1,123), js/index/main.js (470), js/index/report-cards.js (570), js/index/report-creation.js (235), js/index/weather.js (170), js/index/cloud-recovery.js (225), js/index/panels.js (280), js/index/field-tools.js (30), js/index/calendar.js (40), js/index/messages.js (75), js/index/deep-links.js (55), js/index/toggle-panel.js (35)
> **Total:** ~3,308 lines across 12 files
> **Role:** Main landing page — report management, weather, tools, navigation hub

---

### 2.1 Dashboard Init & Data Loading (main.js)

**User Flow: Dashboard Page Load**
1. `DOMContentLoaded` fires → `initPWA()` → `dataStore.init()`
2. Check for `?submitted=true` URL param → show success banner if present
3. Check permissions → redirect to `permissions.html` if first mobile visit (not onboarded)
4. Show permissions banner if onboarded but mic/location not granted
5. Clean up stale `fvp_ai_response_*` caches (>24 hours old)
6. Set current date header immediately
7. **Instant render** from `localStorage` (`_renderFromLocalStorage()`) — no IDB, no network
8. Run one-time migration (v1.13.0): clear stale IDB projects if flag not set
9. `await auth.ready` (8s timeout) — no redirect if timeout, continue with localStorage
10. `refreshDashboard('DOMContentLoaded')`:
    - **Phase 1 (local):** Load reports from IDB + load projects from IDB (parallel, 6s timeout each)
    - Re-render after Phase 1
    - **Phase 2 (network):** Weather sync (fire-and-forget, 15s timeout) + cloud project refresh (12s timeout)
    - Update `projectsCache`; fall back to localStorage if empty
    - Prune stale reports (submitted >7 days, malformed)
    - Cloud report sync via `dataStore.syncReportsFromCloud()` (10s timeout)
    - Trim deleted blocklist to 20 entries
    - Final render
    - Cloud draft recovery (if cloud sync didn't run)
11. Start Realtime subscriptions
12. Listen for BroadcastChannel messages (report-deleted, report-updated, reports-recovered)
13. Show submitted banner if today's submitted reports exist (not dismissed this session)
14. Auto-dismiss submitted reports after 3s if redirected from submit flow

**Testable Assertions:**
- [ ] Dashboard renders immediately from localStorage (no blank flash)
- [ ] Current date header shows correctly formatted date (e.g., "Thursday, February 20, 2026")
- [ ] `?submitted=true` param shows green success banner with Archives link
- [ ] Success banner auto-dismisses submitted reports after 3 seconds
- [ ] URL param is cleaned after reading (no `?submitted=true` on refresh)
- [ ] AI response caches older than 24h are purged from localStorage
- [ ] Migration v1.13.0 flag (`fvp_migration_v113_idb_clear`) set after first run
- [ ] `auth.ready` timeout (8s) → dashboard still renders from localStorage

**Refresh Debouncing:**
- [ ] `refreshDashboard()` concurrent calls are debounced — only one runs at a time
- [ ] Pending refresh is queued and runs after current completes
- [ ] 2-second cooldown between refreshes (prevents triple-fire from pageshow+visibility+focus)
- [ ] Broadcast/delete events bypass the cooldown
- [ ] `DOMContentLoaded` bypasses the cooldown

**Back-Navigation / bfcache:**
- [ ] `pageshow` event → resets IDB connection + triggers refresh
- [ ] `visibilitychange` → visible → triggers refresh
- [ ] `window.focus` → triggers refresh (iOS PWA fallback)
- [ ] All three events fire in rapid succession → only one refresh actually runs (cooldown)

**Report Pruning:**
- [ ] Submitted reports older than 7 days are removed from local map
- [ ] Malformed reports (no `id` or no `project_id`) are pruned
- [ ] Prune count logged to console

---

### 2.2 Report Cards (report-cards.js)

**User Flow: View Reports on Dashboard**
1. `renderReportCards()` receives array of reports
2. Filters out soft-deleted (`status === 'deleted'`) and dashboard-dismissed reports
3. Groups reports by `project_id`
4. Projects with active reports shown first (expanded), without reports shown collapsed
5. Reports within each project sorted: newest date first, then by `updated_at`
6. Orphan reports (unknown `project_id`) grouped under "Unknown Project"

**Testable Assertions:**
- [ ] No projects + no reports → shows "No projects yet" empty state with "Create Project" link
- [ ] Project with reports → section expanded by default, chevron points down
- [ ] Project without reports → section collapsed, shows "No active reports" text
- [ ] Clicking project header toggles visibility (chevron animates)
- [ ] Report count badge shows correct number per project
- [ ] Reports with `dashboard_dismissed_at` are hidden from dashboard
- [ ] Reports with `status === 'deleted'` are hidden from dashboard

**Report Card Rendering:**
- [ ] Draft report → links to `quick-interview.html?reportId=...`
- [ ] Pending/refined report → links to `report.html?date=...&reportId=...`
- [ ] Ready-to-submit report → links to `report.html?tab=preview&date=...&reportId=...`
- [ ] Submitted report → links to `archives.html?id=...`
- [ ] Late report (date < today, not submitted) → red border, red background, warning icon
- [ ] Status badges: Draft (gray), Processing (blue/spinner), Refined (orange), Ready (green), Submitted (green/archive)
- [ ] Created/edited timestamps show correctly formatted date-time
- [ ] Details expandable section shows UUID, capture mode, project name
- [ ] UUID copy button copies to clipboard

**Swipe-to-Delete:**
- [ ] Swipe left on report card → reveals red "Delete" action (100px)
- [ ] Swipe must be >80px left to trigger open
- [ ] Swipe right >40px on opened card → closes it
- [ ] Vertical scroll during swipe → aborts horizontal swipe (doesn't interfere with scrolling)
- [ ] Opening one card closes any other swiped card
- [ ] Delete button shows confirmation modal
- [ ] For submitted reports: modal says "Dismiss" (soft-hide), not "Delete"
- [ ] Dismiss updates `dashboard_dismissed_at` in Supabase + IDB
- [ ] Delete cascades: blocklist + localStorage + IDB + Supabase via `deleteReportFull()`
- [ ] Card animates out (max-height transition) before removal
- [ ] After delete: `currentReportsCache` pruned, cards re-rendered

**`updateReportStatus()`:**
- [ ] Always shows "Begin Daily Report" button (v6.6.17 — no status-based gating)

---

### 2.3 Report Creation Flow (report-creation.js)

**User Flow: Create New Report**
1. User clicks "Begin Daily Report"
2. `showProjectPickerModal()` opens modal, shows loading spinner
3. Loads local projects → refreshes from Supabase if online
4. For each project, checks `canStartNewReport(projectId)` from report-rules.js
5. Eligible projects shown as clickable buttons
6. Blocked projects shown disabled with reason badge (Late Report, Submitted Today, etc.)
7. "In Progress" badge on projects with `CONTINUE_EXISTING` status

**Testable Assertions:**
- [ ] No projects → shows "No Projects Configured" with "Create Project" button
- [ ] Project picker loads projects from local first, then refreshes from cloud
- [ ] Clicking eligible project → `selectProjectAndProceed(projectId)`
- [ ] Blocked projects are not clickable (disabled styling + `cursor-not-allowed`)
- [ ] "Manage Projects" link at bottom navigates to `projects.html`

**User Flow: Duplicate Report Check**
1. `selectProjectAndProceed()` checks for existing non-submitted report for same project + today
2. If duplicate found → shows `duplicateReportModal` with three options:
   - "Go to Report" → navigates to existing report
   - "Delete & Start Fresh" → deletes old report, creates new UUID, navigates
   - "Cancel" → closes modal
3. If no duplicate → generates `crypto.randomUUID()`, creates Supabase row, navigates

**Testable Assertions:**
- [ ] Duplicate check queries IDB for matching `project_id + reportDate + !submitted`
- [ ] Duplicate found → modal shows project name and formatted date
- [ ] "Go to Report" → navigates to `quick-interview.html?reportId=<existing>&projectId=<pid>`
- [ ] "Delete & Start Fresh" → calls `deleteReportFull()`, creates new UUID, navigates
- [ ] Delete button shows spinner during operation, re-enables on error
- [ ] No duplicate → new UUID created, Supabase row upserted, navigates to interview

**Supabase Report Row Creation:**
- [ ] `createSupabaseReportRow()` upserts with: id, project_id, user_id, device_id, report_date, status='draft', org_id
- [ ] Offline → silently skips Supabase row creation (resolves immediately)
- [ ] Error → logged but doesn't block navigation

---

### 2.4 Weather (weather.js)

**User Flow: Weather Display**
1. `syncWeather()` runs during `refreshDashboard()` (fire-and-forget, 15s timeout)
2. Checks online status → "Offline" if offline
3. Gets location: cached first (speed), fresh GPS in background
4. Calls Open-Meteo API with lat/lng → current weather + hourly + daily
5. Updates conditions bar: temp, icon, low temp, precipitation
6. Caches extended data: wind speed, gusts, UV, humidity, sunrise/sunset
7. Updates drone ops bar: wind, gusts, flight status
8. If cached location was used and fresh GPS differs by >0.01°, re-fetches weather

**Testable Assertions:**
- [ ] Offline → shows "Offline" text, WiFi-slash icon
- [ ] No location → shows "Unavailable", temp "--°"
- [ ] Valid weather → temperature displayed (e.g., "72°"), correct icon for weather code
- [ ] Low temp and precipitation shown (e.g., "L: 58°", "0.12\"")
- [ ] Drone status: gusts <20 → "FLY" (green), 20-25 → "CAUTION" (orange), >25 → "NO FLY" (red)
- [ ] Outside daylight hours → "NO FLY" regardless of wind
- [ ] API error → retries once after 5 seconds
- [ ] No double-retry (flag `_weatherRetryScheduled`)

---

### 2.5 Cloud Draft Recovery (cloud-recovery.js)

**User Flow: Cross-Device Sync**
1. `recoverCloudDrafts()` runs at end of dashboard refresh (if cloud sync didn't already run)
2. Queries Supabase `reports` where user_id matches and status in (draft, pending_refine, refined, ready_to_submit)
3. For each cloud report:
   - Skip if on deleted blocklist
   - Compare `updated_at` timestamps — cloud wins only if newer
   - Preserve local `_draft_data` (unsaved edits)
4. Save recovered reports to IDB, re-render cards
5. Pre-cache `report_data` for recovered reports (Supabase → IDB)
6. Pre-cache `interview_backup` for draft/pending_refine reports → populates `_draft_data`
7. Rehydrate photos from Supabase `photos` table
8. Broadcast `reports-recovered` via BroadcastChannel

**Testable Assertions:**
- [ ] Offline → skips entirely (no error)
- [ ] No user_id → skips (no Supabase query)
- [ ] Recovered report appears as new card on dashboard
- [ ] Local newer version is NOT overwritten by cloud
- [ ] Cloud newer version DOES overwrite local
- [ ] Deleted blocklist prevents zombie report resurrection
- [ ] Local `_draft_data` preserved during recovery (not clobbered)
- [ ] Photos rehydrated into `originalInput.photos` in report data
- [ ] BroadcastChannel message sent after recovery

---

### 2.6 Expandable Panels (panels.js + toggle-panel.js)

**User Flow: Toggle Panels**
1. User taps panel header → `togglePanel(panelId, trigger)` called
2. Panel visibility toggles (hidden ↔ visible)
3. Chevron rotates 180° when open
4. Weather and Drone panels are mutually exclusive — opening one closes the other
5. First open triggers lazy loading via `onPanelOpen()`

**Testable Assertions:**
- [ ] Weather panel tap → panel visible, chevron rotated
- [ ] Weather panel open + Drone tap → weather closes, drone opens
- [ ] Panel content lazy-loaded on first open only (`panelLoaded` flag)
- [ ] Calendar panel renders month grid on first open via MutationObserver
- [ ] Today's date highlighted in orange on calendar

**Weather Details Panel:**
- [ ] Shows wind speed, gusts, UV index, humidity in 2x2 grid
- [ ] Sunrise/sunset times displayed
- [ ] Windy.com radar iframe embedded with user's coordinates
- [ ] Offline → shows "Offline — data unavailable"
- [ ] No location → shows "Location unavailable"

**Drone Ops Panel:**
- [ ] Part 107 flight window: sunrise–sunset with ACTIVE/CLOSED badge
- [ ] Elevation fetched from Open-Meteo elevation API
- [ ] Magnetic declination from NOAA API
- [ ] GPS coordinates displayed in panel
- [ ] Wind assessment: FLY/CAUTION/NO FLY badges

**Emergency Panel:**
- [ ] Uses fresh GPS (not cached) — accuracy matters for emergencies
- [ ] Shows large GPS coordinates (read to 911 dispatcher)
- [ ] "Call 911" button links to `tel:911`
- [ ] "Share My Location" uses `navigator.share` API
- [ ] "Find Nearest Hospital" opens Google Maps hospital search

---

### 2.7 Field Tools Carousel (field-tools.js)

**Testable Assertions:**
- [ ] Auto-scrolling CSS animation (35s loop) scrolls tool icons
- [ ] Touch/pointer pauses carousel
- [ ] Touch/pointer end resumes after 3 seconds
- [ ] Tapping carousel opens Field Tools modal grid
- [ ] 11 functional tools + 3 "Coming Soon" tools in modal
- [ ] "Coming Soon" tools show toast "This tool is in development"
- [ ] Each tool button calls `fieldToolAction()` which closes modal then opens tool overlay

---

### 2.8 Messages (messages.js)

**Note:** Messages are currently **hardcoded demo data** — not connected to any backend.

**Testable Assertions:**
- [ ] 4 demo threads shown (Mike Rodriguez, James Sullivan, Diana Lopez, Kevin Walsh)
- [ ] 3 unread indicators (blue dots) on first three threads
- [ ] Badge count shows "3" on Messages header
- [ ] Clicking thread → thread list hidden, chat view shown
- [ ] Chat bubbles: "them" = gray left-aligned, "you" = blue right-aligned
- [ ] Typing in input + send → appends blue bubble (ephemeral, not saved)
- [ ] Back arrow → returns to thread list

---

### 2.9 Deep Links (deep-links.js)

**User Flow: AI-Triggered Navigation**
1. AI assistant navigates to `index.html?openTool=compass` (or `openPanel=...`)
2. URL params read on load, then cleaned from URL
3. After 600ms delay, specified tool/panel opens

**Testable Assertions:**
- [ ] `?openTool=compass` → compass overlay opens
- [ ] `?openTool=maps&mapType=satellite` → maps overlay opens on satellite tab
- [ ] `?openPanel=emergencyPanel` → emergency strip clicked (opens panel)
- [ ] URL params cleaned after reading (no residual query string)
- [ ] Unknown tool/panel → no action, no error

---

### 2.10 Dashboard Integration Tests

**Full Page Load Sequence:**
- [ ] Cold load (no cache): auth redirect check → permissions check → date render → empty state → cloud refresh → cards appear
- [ ] Warm load (cached): instant render from localStorage → IDB hydration updates → cloud refresh may add more
- [ ] bfcache restore: IDB connection reset → full refresh → updated cards

**Cross-Device Scenario:**
- [ ] Create report on Device A → open dashboard on Device B → report appears via cloud recovery
- [ ] Delete report on Device A → Device B dashboard refresh → report disappears (blocklist + cloud sync)
- [ ] Submit report on Device A → Device B shows submitted banner

**Offline Scenarios:**
- [ ] Offline load → projects from IDB/localStorage, weather shows "Offline", cloud sync skipped
- [ ] Go offline mid-use → offline banner appears, "Begin Daily Report" still works (creates local report)
- [ ] Come back online → offline banner hides, next refresh syncs with cloud

**Performance:**
- [ ] No render-blocking operations — localStorage pre-render happens synchronously before any async
- [ ] IDB + project load have 6s timeouts each
- [ ] Weather sync has 15s timeout, cloud project refresh has 12s timeout
- [ ] All timeouts use `withTimeout()` helper with fallback values

---

## 3. Interview / Field Capture (Part 1 of 2)

> **Files (this part):** quick-interview.html (966), js/interview/main.js (342), js/interview/state-mgmt.js (362), js/interview/persistence.js (1,240), js/interview/ui-flow.js (373), js/interview/ui-display.js (264)
> **Total (this part):** ~3,547 lines across 6 files
> **Role:** Field data capture page — mode selection, state management, draft persistence, auto-save, cloud backup, weather, progress tracking, processing overlay
> **Part 2 (next heartbeat):** freeform.js, guided-sections.js, contractors-personnel.js, equipment-manual.js, photos.js, finish-processing.js

---

### 3.1 Page Structure & HTML (quick-interview.html)

**Three Mutually Exclusive View States:**
1. **Loading Overlay** (`#loadingOverlay`) — shown during init, hidden after data loads
2. **Mode Selection Screen** (`#modeSelectionScreen`) — "Quick Notes" vs "Guided Sections"
3. **Quick Notes UI** (`#minimalModeApp`) OR **Guided Sections UI** (`#app`) — never both visible

**Guided Sections (10 collapsible cards in `#app`):**
1. Weather & Site Conditions
2. Work Summary (contractor-based)
3. Contractor Personnel
4. Equipment Used
5. Issues & Delays
6. Communications
7. QA/QC Testing
8. Safety
9. Visitors / Deliveries
10. Progress Photos

**Modals (5):**
- Switch Mode confirmation (`#switchModeModal`)
- Cancel Report confirmation (`#cancelReportModal`)
- Permissions setup (`#permissionsModal`) — mic + location
- Network error (`#network-error-modal`) — retry or save to drafts
- Submit confirmation (`#submitConfirmDialog`) — online/offline status check

**Processing Overlay (`#processingOverlay`):**
- Full-screen, z-index 99999, blocks ALL interaction
- 4 progress steps with animated icons
- Error state re-enables buttons via `#processingError` div
- `pointer-events: none` on everything except error buttons

**Testable Assertions:**
- [ ] Page loads with loading overlay visible, all other views hidden
- [ ] Loading overlay shows spinner + "Loading Report..." + status text
- [ ] Loading overlay fades out (opacity transition 300ms) after init completes
- [ ] Only ONE view state visible at any time (loading, mode selection, minimal, or guided)
- [ ] Mode selection shows project name and formatted date in header
- [ ] "Quick Notes" card and "Guided Sections" card are both visible in mode selection
- [ ] Guided mode header shows "Guided Sections" label (green) + progress bar
- [ ] Minimal mode header shows "Quick Notes" label (blue) + date
- [ ] Both modes have back arrow (→ index.html), cancel button (red X), and switch mode button
- [ ] Dictation hint banner visible on guided mode (dismissable, persisted via localStorage)
- [ ] Permissions warning banner shows on mobile if mic/location not granted

---

### 3.2 Init & Lifecycle (main.js)

**User Flow: Page Load (DOMContentLoaded)**
1. `initPWA()` → `dataStore.init()`
2. Wire processing overlay error buttons (retry + save draft)
3. `checkReportState()` — always returns true (simplified in v6.6.15)
4. Load user settings from Supabase via `dataLayer.loadUserSettings()`
5. `getReport()` — full recovery chain (IDB → Supabase interview_backup → fresh)
6. Read `reportId` from URL params → set `IS.currentReportId`
7. If no reportId, generate fallback UUID (shouldn't happen — index.js always passes it)
8. Store active report ID in localStorage (`STORAGE_KEYS.ACTIVE_REPORT_ID`)
9. Attempt local draft recovery from IDB as safety net
10. Load project: URL `projectId` param → IDB report metadata → fallback null
11. Auto-populate project info + reporter name from user settings
12. Determine view: `shouldShowModeSelection()` → mode selection OR `showModeUI(mode)`
13. Fetch weather in background if not already loaded
14. `checkAndShowWarningBanner()` + `checkDictationHintBanner()`
15. Start Realtime subscriptions + drain pending backups

**Testable Assertions:**
- [ ] Page with `?reportId=abc&projectId=xyz` → `IS.currentReportId = 'abc'`, project loaded by `xyz`
- [ ] Page with `?reportId=abc` (no projectId) → project loaded from IDB report metadata
- [ ] Page with no URL params → fallback UUID generated, warning logged
- [ ] `IS.currentReportId` stored in `localStorage[STORAGE_KEYS.ACTIVE_REPORT_ID]`
- [ ] User settings auto-populate `reporter.name` and `overview.completedBy`
- [ ] Active project auto-populates `project.projectName` and `overview.projectName`
- [ ] Fresh report (no prior data, no captureMode) → mode selection screen shown
- [ ] Returning to draft with captureMode set → jumps straight to that mode's UI
- [ ] Draft with `interviewCompleted: true` + `status: draft` → resets `interviewCompleted` to false
- [ ] Init failure → loading overlay hidden, error toast "Failed to load data. Please refresh."

**Permissions:**
- [ ] `requestMicrophonePermission()` → `getUserMedia({audio:true})` → stops tracks → sets `STORAGE_KEYS.MIC_GRANTED`
- [ ] Mic permission denied → status shows "Blocked - check settings", button disabled, red styling
- [ ] `requestLocationPermission()` → `getCurrentPosition()` → caches location → triggers `fetchWeather()`
- [ ] Location denied → permission UI shows denied state (code 1)
- [ ] `closePermissionsModal()` sets `STORAGE_KEYS.PERMISSIONS_DISMISSED` → won't show again

**Emergency Save / Hardening:**
- [ ] `visibilitychange` → hidden → `saveToLocalStorage()` + `flushInterviewBackup()`
- [ ] `pagehide` → `saveToLocalStorage()` + `flushInterviewBackup()` + `dataStore.closeAll()`
- [ ] `pageshow` (bfcache restore) → `drainPendingBackups()`
- [ ] `online` event → `drainPendingBackups()`

**Event Listeners:**
- [ ] `site-conditions-input` change → updates `IS.report.overview.weather.jobSiteCondition` → `saveReport()`
- [ ] `no-incidents` checkbox → sets `safety.noIncidents = true`, unchecks `has-incidents`
- [ ] `has-incidents` checkbox → sets `safety.hasIncidents = true`, unchecks `no-incidents`
- [ ] `photoInput` change → triggers `handlePhotoInput()`

---

### 3.3 State Management (state-mgmt.js)

**Global State:** `window.interviewState` (aliased as `IS`)
- Properties: `currentSection`, `report`, `currentReportId`, `permissionsChecked`, `activeProject`, `projectContractors`, `userSettings`, `autoSaveState`, device detection flags (`isIOS`, `isSafari`, `isIOSSafari`, `isMobile`)

**Entry CRUD:**
- [ ] `createEntry('issues', 'text')` → creates entry with unique ID (`entry_{timestamp}_{random}`), section, content, timestamp, entry_order
- [ ] `createEntry()` → auto-increments `entry_order` within section
- [ ] `getEntriesForSection('issues')` → returns non-deleted entries sorted by `entry_order`
- [ ] `updateEntry(entryId, 'new text')` → updates content, calls `saveReport()`
- [ ] `deleteEntryById(entryId)` → soft delete (`is_deleted: true`), calls `saveReport()`
- [ ] Deleted entries excluded from `getEntriesForSection()` results

**Inline Editing:**
- [ ] `startEditEntry(entryId, sectionType)` → swaps `<p>` for `<textarea>`, auto-saves on typing (500ms debounce)
- [ ] Edit textarea auto-expands, focuses at end of text
- [ ] Edit button changes from pencil icon to checkmark
- [ ] `saveEditEntry()` → updates entry, re-renders section, shows "Entry updated" toast
- [ ] For contractor-work section type → calls `renderContractorWorkCards()` instead of `renderSection()`

**Toggle State Management:**
- [ ] `setToggleState('communications_made', true)` → stores in `IS.report.toggleStates`
- [ ] Toggle locks after first selection (`isToggleLocked()` returns true)
- [ ] Locked toggle shows lock icon, buttons disabled
- [ ] Attempting to change locked toggle → toast "Toggle locked: already set"
- [ ] `getToggleState(section)` returns `true`, `false`, or `null` (not set)
- [ ] `handleToggle()` on Yes → re-renders section, initializes auto-save for that section's textarea
- [ ] Toggle section name mapping: `communications_made → communications`, `qaqc_performed → qaqc`, etc.

**N/A Marking:**
- [ ] `markNA('issues')` → stores in `IS.report.meta.naMarked`, button turns green with checkmark
- [ ] `markNA('photos')` → hides photo upload label
- [ ] `clearNA('issues')` → removes from `naMarked`, button returns to default style
- [ ] `clearNA('photos')` → shows photo upload label again
- [ ] `updateNAButtons()` restores N/A visual state on page load (from saved `naMarked`)

**Known Bug (George's review):**
- [ ] Toggle `IS` re-declared with `var IS = window.interviewState` in every interview module (11 times) — works but redundant

---

### 3.4 Persistence & Auto-Save (persistence.js)

**Draft Save Chain (`saveReport()` → `saveToLocalStorage()`):**
1. `saveReport()` → updates previews + progress, debounces `saveToLocalStorage()` (500ms)
2. `saveToLocalStorage()` → builds comprehensive data object from `IS.report`
3. Saves to IDB via dual write: `dataStore.saveReport()` (metadata) + `dataStore.saveDraftData()` (full draft)
4. Marks backup stale via `_markBackupStale(reportId)` localStorage flag
5. Also triggers `markInterviewBackupDirty()` → 2s debounce → `flushInterviewBackup()`

**Testable Assertions (Local Save):**
- [ ] Every edit triggers `saveReport()` → debounced 500ms → IDB write
- [ ] `saveToLocalStorage()` captures ALL report fields: meta, weather, freeform entries, guided sections, activities, operations, equipment, equipmentRows, photos (metadata only), entries, toggleStates
- [ ] Photos saved without base64 data (only id, storagePath, url, caption, timestamp, gps, fileName)
- [ ] No `currentReportId` → throws error "Cannot save: no report ID"
- [ ] IDB write failure → warning logged, draft still marked stale for retry

**Cloud Backup (`flushInterviewBackup()`):**
- [ ] Triggered 2 seconds after any edit (debounced separately from local save)
- [ ] Upserts to Supabase `interview_backup` table with `report_id`, `page_state`, `org_id`, `updated_at`
- [ ] `page_state` built by `buildInterviewPageState()` — canonical schema with all report data
- [ ] Uses `supabaseRetry()` with 3 retries
- [ ] On success → clears `fvp_backup_stale_{reportId}` from localStorage
- [ ] On failure → re-sets `_interviewBackupDirty = true` for next cycle
- [ ] `visibilitychange` → hidden → immediate flush (no debounce)

**Known Bug (George's review):**
- [ ] Persistent network failure creates infinite retry loop on 2s timer — no max-retry cap per session

**Stale Backup Drain (`drainPendingBackups()`):**
- [ ] Runs on: page init, pageshow (bfcache), online event
- [ ] Scans localStorage for `fvp_backup_stale_*` keys
- [ ] For each stale ID: loads IDB draft → builds canonical page_state → upserts to Supabase
- [ ] Orphaned stale flag (no IDB draft) → cleaned up
- [ ] Offline → skips entirely
- [ ] Successful drain → clears stale flag

**Report Loading (`getReport()`):**
1. Read `reportId` from URL
2. Try IDB draft (`dataStore.getDraftData(reportId)`)
3. If online: check Supabase `interview_backup` with 2s timeout
4. Compare timestamps: cloud newer → use cloud data + cache back to IDB
5. IDB newer or cloud timeout → use IDB data
6. Neither found → `createFreshReport()` with defaults
7. In all online paths: attempt photo rehydration from `fetchCloudPhotos()`

**Testable Assertions (Report Loading):**
- [ ] Report with IDB data + newer cloud data → cloud wins, IDB updated
- [ ] Report with IDB data + older cloud data → IDB wins
- [ ] Report with IDB data + cloud timeout (>2s) → IDB used, warning logged
- [ ] Report with no local data + cloud data → cloud used
- [ ] Report with no local + no cloud → fresh report created
- [ ] Cloud photos merged: new cloud photos added, existing photos get fresh signed URLs
- [ ] `createFreshReport()` → status 'draft', weather "Syncing...", all arrays empty

**Cancel Report Flow:**
- [ ] "Cancel Report" button → shows confirmation modal
- [ ] "Delete Report" in modal → `deleteReportFull()` → resets state → navigates to index.html
- [ ] Delete failure → alert "Error deleting report. Please try again.", button re-enabled
- [ ] "Keep Working" → hides modal, no action

**Supabase Save (`saveReportToSupabase()`):**
- [ ] Upserts to `reports` table: id, project_id, org_id, user_id, device_id, report_date, status, capture_mode, updated_at
- [ ] No `currentReportId` → throws error
- [ ] No `activeProject` → returns early (no save)
- [ ] `isSaving` flag prevents concurrent saves
- [ ] After upsert: triggers `flushInterviewBackup()` for immediate cloud backup

**Photo Upload:**
- [ ] `uploadPhotoToSupabase()` → uploads to `report-photos` bucket as `{reportId}/{photoId}_{fileName}`
- [ ] Returns signed URL (1-hour expiry) — NOT public URL (SEC-04)
- [ ] `uploadPendingPhotos()` → iterates pending photos, uploads base64 → blob → storage
- [ ] After upload: saves metadata to Supabase `photos` table (id, report_id, org_id, storage_path, caption, location, timestamp)
- [ ] After upload: clears base64 from IDB (saves space), sets `syncStatus: 'synced'`
- [ ] Updates `IS.report.photos[]` in-memory with new storagePath + url (PHO-02 fix)

**Known Bug (George's review):**
- [ ] Dual IDB write on every save (`saveReport` + `saveDraftData`) — could be batched for atomicity
- [ ] Signed photo URLs expire after 1 hour — stale URLs in IDB may fail to display

---

### 3.5 Capture Mode & Processing Overlay (ui-flow.js)

**Mode Selection Logic:**
- [ ] `shouldShowModeSelection()` returns true only when: no `captureMode` set AND report is empty
- [ ] "Empty" = no photos, no activities, no issues, no notes, no freeform entries, no reporter name
- [ ] Report with ANY data → skips mode selection, shows appropriate mode UI
- [ ] `selectCaptureMode('minimal')` → sets `IS.report.meta.captureMode`, saves, shows minimal UI
- [ ] `selectCaptureMode('guided')` → sets captureMode, saves, shows guided UI

**Mode Switching:**
- [ ] Switch button in header opens confirmation modal
- [ ] Modal shows target mode name ("Switch to Guided Sections" or "Switch to Quick Notes")
- [ ] Switching minimal → guided: freeform entries merged into `additionalNotes` with "--- Field Notes ---" separator
- [ ] Switching guided → minimal: no data migration warning
- [ ] Photos and weather preserved across mode switches
- [ ] After switch: `saveReport()` called, new mode UI initialized

**Processing Overlay:**
- [ ] `showProcessingOverlay()` → overlay visible, all steps reset, progress bar at 0%
- [ ] Blocks: `beforeunload`, all keyboard (`_blockKeys`), all touch/click/mousedown/contextmenu
- [ ] `setProcessingStep(2, 'active')` → step 2 pulses blue, step 1 marked green complete
- [ ] `setProcessingStep(2, 'complete')` → step 2 turns green, progress bar advances
- [ ] `showProcessingSuccess()` → title "Report Ready!", status "Opening your report...", bar 100%, all steps green
- [ ] `showProcessingError('msg')` → title "Processing Failed", error message displayed, retry + save draft buttons enabled
- [ ] Error state: clicks on `#processingError` buttons are NOT blocked (explicit check in `_blockTouch`)
- [ ] `hideProcessingOverlay()` → removes ALL event listeners (beforeunload, keydown, touch handlers)
- [ ] Processing overlay retry button → calls `finishMinimalReport()` or `finishReport()` based on visible mode
- [ ] Save draft button → hides overlay, navigates to index.html

**Known Bug (George's review):**
- [ ] `_blockKeys()` blocks ALL keyboard during processing AND error state — prevents accessibility shortcuts on desktop

---

### 3.6 Weather & Previews (ui-display.js)

**Weather Fetch (Interview Page):**
- [ ] `fetchWeather()` gets fresh GPS → calls Open-Meteo API → updates `IS.report.overview.weather`
- [ ] Weather codes mapped: 0=Clear, 1=Mostly Clear, 2=Partly Cloudy, 3=Overcast, 45/48=Fog, 51-55=Drizzle, 61-65=Rain, 80=Showers, 95=Thunderstorm
- [ ] Auto-sets `jobSiteCondition` to "Wet" if precip > 0.1", "Dry" otherwise (only if not already set)
- [ ] Auto-sets `adverseConditions` to "Rain impact possible" if precip > 0.25"
- [ ] Updates both guided weather display AND minimal weather display
- [ ] API failure → logged, no user-visible error (weather section shows "Syncing...")

**Preview Text (Guided Mode):**
- [ ] Weather preview: shows `jobSiteCondition` if set, otherwise `generalCondition, highTemp`
- [ ] Activities preview: updates via `updateActivitiesPreview()` (contractor-based)
- [ ] Personnel preview: toggle=No → "N/A - No contractors"; toggle=Yes → "X personnel"; null → "Tap to add"
- [ ] Equipment preview: via `updateEquipmentPreview()`
- [ ] Issues preview: combines entry-based + legacy counts → "X issue(s)" or "None reported" or "N/A - No issues"
- [ ] Communications preview: toggle=No → "N/A - None"; Yes + entries → "X logged"; Yes + 0 → "Tap to add"; null → "None recorded"
- [ ] QA/QC preview: same pattern as communications
- [ ] Visitors preview: same pattern as communications
- [ ] Safety preview: incidents → "INCIDENT REPORTED"; no incidents → "No incidents (confirmed)"; notes → "Notes added"; else → "Tap to confirm"
- [ ] Photos preview: N/A → "N/A - No photos"; X photos → "X photos"; else → "No photos"

**Status Icons:**
- [ ] Section with data (collapsed) → green checkmark in status badge
- [ ] Section without data (collapsed) → gray chevron-down
- [ ] Section expanded → icon unchanged (doesn't re-render status while open)

**Progress Bar (Guided Mode):**
- [ ] 10 sections total → each filled section adds 10%
- [ ] Weather filled when `jobSiteCondition` has text
- [ ] Activities filled when any contractor has work entries or marked no-work
- [ ] Personnel filled when toggle answered or has operations data
- [ ] Equipment filled when `equipmentRows` has entries
- [ ] Issues filled when entries exist, legacy issues exist, or marked N/A
- [ ] Communications filled when toggle answered or entries exist
- [ ] QA/QC filled when toggle answered or entries exist
- [ ] Safety filled when any checkbox checked or entries/notes exist
- [ ] Visitors filled when toggle answered or entries exist
- [ ] Photos filled when photos exist or marked N/A
- [ ] Progress bar width + text update immediately on data changes

---

### 3.7 Interview Integration Tests (Part 1)

**Full Page Load (Cold Start):**
- [ ] New report: loading overlay → mode selection → user picks mode → UI loads with weather syncing
- [ ] Returning to draft: loading overlay → IDB draft restored → mode UI shown → weather refreshed
- [ ] Cross-device return: loading overlay → cloud backup newer → cloud data used → mode UI shown

**Persistence Round-Trip:**
- [ ] Enter text in Work Summary → wait 500ms → IDB has draft data → wait 2s → Supabase interview_backup has data
- [ ] Close page mid-edit → reopen → all entered data restored from IDB/cloud
- [ ] Kill page during `flushInterviewBackup()` → stale flag survives → drain on next load → data recovered

**Mode Switching:**
- [ ] Pick Quick Notes → add 3 entries + 2 photos → switch to Guided → entries in additionalNotes, photos visible
- [ ] Pick Guided → fill weather + issues → switch to Quick Notes → weather preserved, switch back → all data intact

**Offline Behavior:**
- [ ] Offline: mode selection works, data entry works, saves to IDB only
- [ ] Offline: weather shows "Syncing..." (no API call)
- [ ] Come online → `drainPendingBackups()` flushes to Supabase
- [ ] Offline: "Finish & Process" → submit confirmation shows red "No internet" + disabled button

**Storage Expectations:**
| Storage | Key/Table | Written By | Content |
|---|---|---|---|
| IDB `draftData` | `{reportId}` | `saveToLocalStorage()` | Full draft object |
| IDB `currentReports` | `{reportId}` | `saveToLocalStorage()` | Report metadata |
| Supabase `interview_backup` | `report_id` | `flushInterviewBackup()` | Canonical page_state |
| Supabase `reports` | `id` | `saveReportToSupabase()` | Report row metadata |
| Supabase `report-photos` bucket | `{reportId}/{photoId}_{name}` | `uploadPhotoToSupabase()` | Photo file |
| Supabase `photos` table | `id` | `uploadPendingPhotos()` | Photo metadata |
| localStorage | `fvp_backup_stale_{id}` | `_markBackupStale()` | Timestamp |
| localStorage | `ACTIVE_REPORT_ID` | `main.js init` | Current report UUID |

---

## 3. Interview / Field Capture (Part 2 of 2)

> **Files (this part):** js/interview/freeform.js (517), js/interview/guided-sections.js (409), js/interview/contractors-personnel.js (752), js/interview/equipment-manual.js (294), js/interview/photos.js (346), js/interview/finish-processing.js (612)
> **Total (this part):** ~2,930 lines across 6 files
> **Role:** Freeform entry UI, guided section rendering, contractor work cards, personnel counts, equipment rows, photo capture/upload, AI processing finish flow

---

### 3.8 Freeform / Quick Notes Mode (freeform.js)

**Coverage Checklist (Visual Only):**
10 items: Weather, Work Performed, Contractors, Equipment, Issues, Communications, QA/QC, Safety, Visitors, Photos

**Testable Assertions:**
- [ ] `initMinimalModeUI()` sets date, migrates old notes, renders entries + checklist + photos
- [ ] Migration: old `fieldNotes.freeformNotes` string → `freeform_entries[]` array (one-time, clears old field)
- [ ] Migration only runs if `freeform_entries` is empty and `freeformNotes` has content
- [ ] "Add Entry" → creates entry with `crypto.randomUUID()`, `created_at`, empty content → starts inline edit
- [ ] Entries rendered chronologically (oldest first) with timestamp
- [ ] Entry content uses `escapeHtml()` for XSS protection
- [ ] Empty entry shows italic "Empty entry" placeholder
- [ ] Inline edit: pencil button → textarea appears, auto-expands, focuses at end
- [ ] Inline edit auto-saves on typing (500ms debounce), updates `entry.content` + `entry.updated_at`
- [ ] Also saves on blur (safety net)
- [ ] Save button (checkmark) → `saveFreeformEdit()` → re-renders entries, shows "Entry saved" toast
- [ ] Delete entry → `confirm()` dialog → hard delete from `freeform_entries[]` (not soft delete)
- [ ] Checklist items toggle independently, stored in `IS.report.freeform_checklist` map
- [ ] Checked items get green background styling
- [ ] Checklist is visual only — does NOT affect validation or submission

**Minimal Weather Display:**
- [ ] Shows condition text, high/low temp, precipitation
- [ ] Weather icon changes by condition: rain→cloud-rain, clear→sun, storm→bolt, snow→snowflake, etc.
- [ ] Defaults to `fa-cloud-sun` for unrecognized conditions

**Minimal Photos:**
- [ ] Photo input triggers `handleMinimalPhotoInput()` (separate from guided mode handler)
- [ ] Photo capture: GPS (multi-reading) → compress (1200px, 0.7 quality) → photo markup overlay → save
- [ ] Markup overlay discarded (null return) → photo skipped entirely
- [ ] Photo saved to IDB with base64 + pushed to `IS.report.photos[]` without base64 (OFF-01)
- [ ] Background upload fires immediately (non-blocking)
- [ ] Photo card shows: image, upload status badge, delete button, timestamp, GPS coords, caption textarea
- [ ] Upload status: pending (yellow cloud), uploading (blue spinner), uploaded (green check)
- [ ] Delete photo → immediate UI removal → "tap to undo" toast (3s) → actual delete from IDB + Supabase after 3.5s
- [ ] Undo within 3s → photo restored to array + UI
- [ ] Caption updates via `updateMinimalPhotoCaption()` → saves to `IS.report.photos[idx].caption`
- [ ] Caption values set via DOM (not innerHTML) to prevent XSS
- [ ] Photo input reset after processing (same file selectable again)

---

### 3.9 Guided Sections Rendering (guided-sections.js)

**Init (`initGuidedModeUI()`):**
- [ ] Sets formatted date header
- [ ] Ensures `entries[]` and `toggleStates{}` exist on report
- [ ] Calls `renderAllSections()` → renders all 9 data sections + weather
- [ ] Restores safety checkboxes from report state
- [ ] Initializes auto-expand for all textareas
- [ ] Initializes auto-save for all guided sections

**Section Accordion:**
- [ ] `toggleSection(sectionId)` → expands clicked section, collapses all others (exclusive accordion)
- [ ] Expanded: chevron rotates up (blue), card gets `expanded` class
- [ ] Collapsed: chevron points down (gray)

**Section Rendering (entry-based + legacy compatibility):**

*Issues section:*
- [ ] Renders entry-based issues (with edit/delete buttons, timestamps) THEN legacy `generalIssues[]` items
- [ ] Entry edit button → `startEditEntry(id, 'issues')`
- [ ] Entry delete → `deleteEntryById()` + re-render + update previews/progress
- [ ] Legacy issues use `removeIssue(index)` for deletion

*Safety section:*
- [ ] Renders entry-based safety notes THEN legacy `safety.notes[]`
- [ ] Syncs `no-incidents` and `has-incidents` checkboxes with report state
- [ ] Entry-based notes have edit/delete; legacy notes only have delete

*Communications / QA/QC / Visitors sections (toggle-gated):*
- [ ] Each renders toggle buttons via `renderToggleButtons()`
- [ ] Toggle = No → N/A message shown, input area hidden
- [ ] Toggle = Yes or null → N/A message hidden, input area visible
- [ ] Existing entries always rendered regardless of toggle state
- [ ] iOS Safari fix: textareas always in DOM (hidden via class, not removed)
- [ ] Each entry has edit + delete buttons with timestamps

*Personnel section:*
- [ ] Renders `personnel_onsite` toggle
- [ ] Toggle = true → `renderPersonnelCards()` with personnel inputs
- [ ] Toggle = false → "Marked as N/A" message, hides warning + totals
- [ ] Toggle = null → shows personnel cards for input (same as Yes)

*Photos section:*
- [ ] Photos rendered in 2-column grid with: image, upload indicator, delete button, GPS overlay, caption textarea
- [ ] Upload indicator: uploading (blue spinner), uploaded (green check), pending (yellow cloud)
- [ ] Image error → fallback SVG placeholder
- [ ] Caption set via DOM (XSS protection), max 500 chars
- [ ] Character counter appears at 400+ chars (yellow warning), turns red at 480+

**Dictation Hint:**
- [ ] `checkDictationHintBanner()` → hides if `STORAGE_KEYS.DICTATION_HINT_DISMISSED` is true
- [ ] `dismissDictationHint()` → sets localStorage flag, hides banner

---

### 3.10 Contractor Work & Personnel (contractors-personnel.js)

**Contractor Work Cards:**
- [ ] No project / no contractors → warning shown, footer hidden, container empty
- [ ] Each contractor gets a collapsible card with: name, type badge (PRIME/SUB), trades, work count
- [ ] Prime contractors: green border/bg; Sub contractors: blue border/bg
- [ ] "No work performed" checkbox (default: checked) → hides/shows work input fields
- [ ] Unchecking "no work" → work fields visible, input textarea focused (100ms delay)

**Crew-Level Work (v6.9):**
- [ ] Contractors with `crews[]` array → render sub-cards per crew inside master card
- [ ] Master "No work" checkbox → hides ALL crew sub-cards
- [ ] Each crew has its own "No work" checkbox (independent)
- [ ] Crew entries stored as `work_{contractorId}_crew_{crewId}` section
- [ ] Total entry count shown across all crews in master card subtitle

**Work Entries:**
- [ ] "+" button: if auto-save already created entry (`IS.autoSaveState[key].saved`), clears input + re-renders
- [ ] "+" button: if no auto-save entry, creates new entry via `createEntry()`
- [ ] Delete entry → `deleteEntryById()` + re-render
- [ ] Auto-save initialized for each contractor/crew textarea via `initContractorWorkAutoSave()`

**Activities Preview:**
- [ ] Counts contractors with work vs no-work → "X with work, Y no work"
- [ ] No contractors configured → "No contractors configured"
- [ ] No work logged anywhere → "Tap to add"

**Personnel Cards:**
- [ ] Each contractor gets expandable personnel card with: abbreviation, type, trades, summary
- [ ] 6 role inputs per contractor: Superintendent, Foreman, Operator, Laborer, Surveyor, Other
- [ ] All inputs: `type=number`, min 0, max 99, `onchange` triggers `updateOperations()`
- [ ] `updateOperations()` reads all 6 inputs, updates `IS.report.operations[]`, calls `saveReport()`
- [ ] Card style updates live: with data → colored border/header; without → gray
- [ ] Total personnel count displayed at top of section
- [ ] `hasOperationsData()` returns true if any contractor has any personnel > 0
- [ ] `getTotalPersonnelCount()` sums all roles across all contractors

**Trade Abbreviations:**
- [ ] Known trades mapped: "pile driving"→PLE, "concrete"→CONC, "asphalt"→ASP, etc.
- [ ] Unknown trades → first 4 chars uppercase
- [ ] Multiple trades (semicolon-separated) → each abbreviated independently

---

### 3.11 Equipment (equipment-manual.js)

**Equipment Rows:**
- [ ] No rows → "No equipment added yet" message
- [ ] "Add Equipment" button → creates row with: unique ID, empty contractor, empty type, qty=1, status="Idle"
- [ ] Each row has: contractor dropdown, type/model input, quantity input, status dropdown, delete button
- [ ] Status options: Idle, 1hr–10hr
- [ ] Contractor dropdown populated from `IS.projectContractors`
- [ ] `updateEquipmentRow(rowId, field, value)` → updates field, calls `saveReport()`
- [ ] `deleteEquipmentRow(rowId)` → removes from array, re-renders, updates preview + progress
- [ ] Equipment preview: "X equipment logged" or "Tap to add"

**Manual Add Functions:**
- [ ] `addIssue()`: reads `#issue-input`, checks auto-save state, creates entry or clears if auto-saved
- [ ] `addSafetyNote()`: same pattern for `#safety-input`
- [ ] `addCommunication()`: same pattern for `#communications-input`
- [ ] `addQAQC()`: same pattern for `#qaqc-input`
- [ ] `addVisitor()`: same pattern for `#visitors-input`
- [ ] All add functions: clear input after add, re-render section, update previews + progress
- [ ] Legacy remove functions (`removeIssue`, `removeSafetyNote`) → splice from legacy arrays

---

### 3.12 Photo Handling (photos.js)

**Guided Mode Photo Capture (`handlePhotoInput()`):**
- [ ] Validates file type (must start with `image/`) → invalid → error toast, skip
- [ ] Validates file size (max 20MB) → too large → error toast, skip
- [ ] GPS: multi-reading high accuracy → logs coordinates or continues without
- [ ] Compression: `readFileAsDataURL()` → `compressImage(1200px, 0.7)` → data URL
- [ ] Photo markup: `openPhotoMarkup()` → annotated image or null (discarded)
- [ ] Photo object created with metadata only in `IS.report.photos[]` — NO base64 (OFF-01)
- [ ] base64 stored ONLY in IndexedDB via `savePhotoToIndexedDB()`
- [ ] IDB record includes: id, reportId, base64, url, storagePath, caption, gps, timestamp, fileName, syncStatus='pending'

**Background Upload (`backgroundUploadPhoto()`):**
- [ ] Offline → sets `uploadStatus: 'failed'`, updates indicator to yellow cloud
- [ ] Online → sets `uploadStatus: 'uploading'`, shows blue spinner
- [ ] Upload: `dataURLtoBlob()` → `uploadPhotoToSupabase()` → signed URL returned
- [ ] Success: updates metadata (storagePath, url, uploadStatus='uploaded'), clears base64 from IDB, upserts to `photos` table
- [ ] Failure: `uploadStatus: 'failed'`, base64 preserved in IDB for retry at FINISH
- [ ] Upload indicator updates in real-time via `updatePhotoUploadIndicator()`

**Photo Deletion (`removePhoto()`):**
- [ ] Immediate removal from `IS.report.photos[]` + UI re-render
- [ ] "Photo removed — tap to undo" toast with 3s window
- [ ] Undo → re-inserts at original index, re-renders
- [ ] After 3.5s (if not undone): deletes from IDB + Supabase storage + Supabase photos table

**Caption:**
- [ ] `updatePhotoCaption(index, value)` → caps at 500 chars, updates report + IDB
- [ ] Character counter visible at 400+ chars → warning (yellow) at ≤480, limit (red) at >480
- [ ] `autoExpandCaption()` uses shared `autoExpand()` with 40px min, 128px max

---

### 3.13 Finish & AI Processing (finish-processing.js)

**Shared Flow (`finishReportFlow()`):**
1. Show confirmation dialog (`showProcessConfirmation()`)
2. Offline check → network error modal with retry/drafts options
3. Mode-specific validation
4. Show processing overlay, set step 1 active
5. Mode-specific `prepareReport()` (set endTime, guided notes, etc.)
6. Mode-specific `preProcess()` (save + upload in correct order, steps 1-2)
7. Build payload via `buildProcessPayload()`
8. Re-check online (may have gone offline during save)
9. Call n8n webhook (60s timeout)
10. Save AI response to Supabase `ai_submissions` table
11. Save report data package to IDB `reportData` store
12. Sync report data to Supabase `report_data` table (5s timeout, 3 retries)
13. Update IDB `currentReports` with `status: 'refined'`
14. Verify IDB data saved (re-save if verification fails)
15. Show success overlay → close IDB → redirect to `report.html`

**Testable Assertions (Finish Flow):**
- [ ] Confirmation dialog shows online status (green connected / red no internet)
- [ ] Online status updates in real-time while dialog is open
- [ ] Offline → "Yes, Process Report" button disabled (grayed out)
- [ ] Cancel → resolves false, no processing
- [ ] Confirm → processing overlay appears, blocks all interaction

**Minimal Mode Finish:**
- [ ] Validates: at least one freeform entry with content → error toast if empty
- [ ] Sets `endTime`, `interviewCompleted: true`
- [ ] Order: save to Supabase → upload photos (steps 1→2)

**Guided Mode Finish:**
- [ ] Validates: all contractors accounted for (work entries OR "no work") → error toast + auto-opens activities section if not
- [ ] Validates: safety checkbox answered (no-incidents OR has-incidents) → error toast + auto-opens safety section if not
- [ ] Sets `endTime`, `interviewCompleted: true`, calculates `shiftDuration`
- [ ] Adds "No safety incidents reported." to `safety.notes` if empty
- [ ] Stores compiled guided notes for AI: issues as joined string, safety summary
- [ ] Order: upload photos → save to Supabase (steps 1→2) — NOTE: reverse order from minimal mode

**AI Webhook:**
- [ ] POST to `N8N_PROCESS_WEBHOOK` with API key header, JSON payload, 60s timeout
- [ ] Payload includes: reportId, captureMode, projectContext (with contractors + crews), fieldNotes (mode-specific), weather, photos, operations, equipmentRows, activities, safety, entries, toggleStates
- [ ] Minimal fieldNotes: all freeform entries joined with `\n\n` + raw entries array
- [ ] Guided fieldNotes: workSummary, issues, safety summary strings
- [ ] Response validation: must have `success` or `aiGenerated` property
- [ ] `aiGenerated` as string → auto-parsed via `JSON.parse()`
- [ ] AI response arrays default to `[]` if missing (activities, operations, equipment, etc.)

**Post-Processing Save:**
- [ ] `saveAIResponse()` → upserts to `ai_submissions` table (report_id, original_input, ai_response, processing_time_ms)
- [ ] Report data package saved to IDB `reportData` store with: reportId, aiGenerated, captureMode, originalInput, userEdits (empty)
- [ ] Same package synced to Supabase `report_data` table with 5s timeout + 3 retries
- [ ] IDB `currentReports` updated with `status: 'refined'`
- [ ] Verification: reads back from IDB → re-saves if null

**Error Handling:**
- [ ] Webhook failure → processing overlay shows error state with retry + save draft buttons
- [ ] Network error modal (behind overlay) with same options
- [ ] Retry → hides overlay, calls mode-specific finish function again
- [ ] Save to drafts → `handleOfflineProcessing()` → sets status `pending_refine` → redirect to index.html

**Offline Processing:**
- [ ] Sets `IS.report.meta.status = 'pending_refine'`
- [ ] Saves locally via `saveReport()`
- [ ] Shows warning toast "Report saved to drafts. Please retry when back online."
- [ ] No sync queue (removed in Sprint 15 OFF-02) — manual retry only

---

### 3.14 Interview Integration Tests (Part 2)

**Full Guided Mode Flow:**
- [ ] Pick Guided → fill weather conditions → log work for 2 contractors → add 3 photos → check "No incidents" → Finish → overlay appears → AI processes → redirect to report.html
- [ ] All contractors must be accounted for (work or no-work) before Finish succeeds
- [ ] Safety must be answered before Finish succeeds

**Full Minimal Mode Flow:**
- [ ] Pick Quick Notes → add 3 entries → add 2 photos → check 5 checklist items → Finish → overlay → AI → redirect
- [ ] At least one entry with content required before Finish succeeds

**Cross-Mode Data Preservation:**
- [ ] Minimal: add 2 entries + 1 photo → switch to Guided → entries appear in additionalNotes, photo appears in photos section
- [ ] Guided: fill issues + weather → switch to Minimal → weather preserved, switch back → issues preserved

**Photo Upload Lifecycle:**
- [ ] Capture photo → pending (yellow) → uploading (blue) → uploaded (green)
- [ ] Offline capture → pending stays → come online → still pending (waits for FINISH)
- [ ] Photo deleted before upload → IDB cleared, no Supabase call
- [ ] Photo deleted after upload → IDB cleared + Supabase storage + photos table deleted

**Contractor + Crew Work Flow:**
- [ ] Contractor with no crews → single textarea, "no work" checkbox, entries as `work_{contractorId}`
- [ ] Contractor with 3 crews → master card with 3 crew sub-cards, each with own textarea and "no work" checkbox
- [ ] Master "no work" → hides all crew sub-cards
- [ ] Individual crew "no work" → only hides that crew's fields

**Auto-Save Integration:**
- [ ] Type in contractor work textarea → 500ms → entry auto-created in `IS.report.entries`
- [ ] Click "+" after auto-save → no duplicate entry, just clears input
- [ ] Click "+" before auto-save → manual entry created, no duplicate on next keystroke

**Error Recovery:**
- [ ] AI webhook timeout (60s) → error overlay → retry succeeds → normal flow continues
- [ ] AI webhook fails → error overlay → "Save as Draft" → status set to `pending_refine` → redirect to index
- [ ] Network drops during photo upload → photo stays as pending → uploaded on FINISH retry

---

## 4. Report Editor (Part 1 of 2)

> **Files (this part):** report.html (1,421), js/report/main.js (252), js/report/data-loading.js (406), js/report/form-fields.js (1,005), js/report/autosave.js (332)
> **Total (this part):** ~3,416 lines across 5 files
> **Role:** Post-AI review/edit page — 3-tab interface (Form View, Original Notes, Preview & Submit), data loading with cloud freshness, field population from AI + user edits, auto-save with cloud backup
> **Part 2 (next heartbeat):** ai-refine.js, original-notes.js, preview.js, pdf-generator.js, submit.js, delete-report.js, debug.js

---

### 4.1 Page Structure (report.html)

**Three-Tab Interface:**
1. **Form View** (`#formViewContent`) — editable DOT RPR form with all sections
2. **Original Notes** (`#originalNotesView`) — read-only view of raw field capture data
3. **Preview & Submit** (`#previewContent`) — paper-width preview + submit button

**Form Sections (11):**
1. Project Overview (2-column grid: name, NOAB#, CNO#, NTP, duration, completion, contract day, weather days, date, location, engineer, contractor, start/end time, shift duration, completed by + weather block)
2. Daily Work Summary (contractor cards with narrative, equipment, crew fields)
3. Personnel / Operations (table: contractor × 6 roles + totals)
4. Equipment Status (table: contractor, type, qty, status + add row)
5. Issues, Delays & RFIs (textarea + Refine button)
6. QA/QC Testing & Inspections (textarea + Refine button)
7. Safety & Incidents (radio toggle + textarea + Refine button)
8. Communications with Contractor (textarea + Refine button)
9. Visitors, Deliveries & Remarks (textarea + Refine button)
10. Progress Photos (single-column photo cards with caption)
11. Certification & Signature (name, title, company + signature line)

**Additional UI:**
- Debug Tool panel (collapsible, shows AI response, field notes, user edits, issues)
- Pending Refine banner (for interrupted AI processing)
- Save indicator (fixed bottom, fades in/out)
- Submit confirmation modal + delete confirmation modal

**Testable Assertions (HTML Structure):**
- [ ] Page loads with Form View tab active (orange border), other tabs gray
- [ ] Only Form View content visible on load; Original Notes and Preview hidden
- [ ] Header shows "Daily Report" title, date, delete button, and Preview button
- [ ] All text sections have "Refine" buttons (AI re-processing for individual fields)
- [ ] Safety section has radio toggle: "No Incidents" vs "Incident Occurred"
- [ ] Photo section shows photo count badge in header
- [ ] Signature section shows certification text + name/title/company fields
- [ ] User-edited fields get yellow background (`user-edited` class)
- [ ] Project config fields (NTP, duration, completion) are readonly

---

### 4.2 Init & Tab Switching (main.js)

**User Flow: Page Load**
1. `dataStore.init()`
2. Load user settings from Supabase
3. `loadReport()` → full recovery chain (IDB → Supabase report_data → redirect)
4. Load project by ID (from report data → IDB metadata → URL params)
5. Initialize `userEdits` tracking
6. `populateAllFields()` → fills all form fields
7. `populateOriginalNotes()` → fills Original Notes tab
8. `checkPendingRefineStatus()` → shows banner if pending
9. `setupAutoSave()` → wires all field listeners
10. Start Realtime subscriptions
11. Check URL `?tab=preview` → auto-switch to preview if present

**Testable Assertions:**
- [ ] `report.html?reportId=abc&date=2026-02-20` → loads report `abc`, sets date
- [ ] `report.html?tab=preview` → auto-opens Preview tab after load
- [ ] No `reportId` param → error toast "Report not found", redirect to index.html after 2s
- [ ] Project loaded by priority: report data projectId → IDB metadata → URL param
- [ ] `window.__fvp_debug` exposed for development access (report, activeProject, currentReportId, userEdits)

**Tab Switching (`switchTab()`):**
- [ ] `switchTab('form')` → Form View visible, others hidden, tab highlighted
- [ ] `switchTab('notes')` → Original Notes visible, others hidden
- [ ] `switchTab('preview')` → Preview visible + bottom bar visible, force-saves all contractor activities + text fields, calls `renderPreview()`
- [ ] Tab switching resets all tab borders (removes orange, adds gray)
- [ ] Preview bottom bar shows "Edit Report" (back to form) and "Submit Report" buttons
- [ ] `goToFinalReview()` → switches to preview tab + scrolls to top

**Emergency Save / Hardening:**
- [ ] `visibilitychange` → hidden → `saveReportToLocalStorage()` + full IDB save + `flushReportBackup()`
- [ ] `pagehide` → same save + `dataStore.closeAll()`
- [ ] IDB save includes: reportId, projectId, reportDate, status, aiGenerated, captureMode, originalInput, userEdits

---

### 4.3 Data Loading (data-loading.js)

**Shared State:** `window.reportState` (RS) — report, currentReportId, activeProject, projectContractors, userEdits, userSettings, saveTimeout, isSaving, isReadonly, currentTab

**Report Loading Chain (`loadReport()`):**
1. Read `reportId` from URL (required)
2. Try IDB `getReportData(reportId)`
3. If online: check Supabase `report_data` table (2s timeout)
4. Compare timestamps → cloud newer: merge (prefer cloud `ai_generated` + `user_edits`, fill gaps from IDB) → cache back to IDB
5. IDB newer: keep local
6. No data found + status `pending_refine` or `draft` → redirect to interview page for re-processing
7. No data at all → error toast, redirect to index.html
8. Assemble report object: meta, overview, aiGenerated, originalInput, userEdits
9. Photo rehydration from Supabase `photos` table if none loaded locally

**Testable Assertions:**
- [ ] Report with IDB data + newer cloud data → cloud merged, IDB updated
- [ ] Report with IDB data + older cloud data → IDB kept
- [ ] Cloud timeout (>2s) → IDB used, warning logged
- [ ] Report with `pending_refine` status + no data → redirect to `quick-interview.html?reportId=...`
- [ ] Report with `draft` status + no data → redirect to interview
- [ ] No report data at all → error toast, redirect to index.html after 2s
- [ ] Cloud merge preserves IDB `aiGenerated` if cloud has none (and vice versa)
- [ ] Photos: if none locally, fetches from cloud `photos` table, caches back to IDB
- [ ] `createFreshReport()` has version 4, defaults from project config (start/end time, location, etc.)

**Data Merging (`getValue()`, `getTextFieldValue()`):**
- [ ] Priority: `userEdits[path]` → `aiGenerated[path]` → `report[path]` → default
- [ ] `getValue('overview.projectName', 'fallback')` → checks all three sources
- [ ] `getTextFieldValue('issues', 'issues_delays', '', 'generalIssues')` → checks userEdits → AI primary path → AI legacy path → report path
- [ ] Array values auto-joined with `\n` (e.g., `['item1','item2']` → `"item1\nitem2"`)
- [ ] `setNestedValue(obj, 'overview.weather.highTemp', '85°F')` → creates intermediate objects if needed

---

### 4.4 Form Fields (form-fields.js)

**Field Population (`populateAllFields()`):**
- [ ] Project logo: tries `logoUrl` → `logoThumbnail` → `logo` (legacy) → hides container if none
- [ ] Project name, NOAB#, CNO#, location, engineer, contractor → from `getValue()` with project config fallback
- [ ] NTP, duration, completion → readonly, populated from project config
- [ ] Contract Day auto-calculated: `(reportDate - NTP) + 1` → "Day X of Y"
- [ ] Date field uses `getLocalDateString()` to avoid timezone issues (noon anchor)
- [ ] Start/End time → from project config defaults, editable
- [ ] Shift duration auto-calculated from start/end time (handles overnight shifts)
- [ ] Weather fields: high, low, precip, condition, job site (dropdown), adverse conditions
- [ ] Text sections (issues, qaqc, safety, communications, visitors) → `getTextFieldValue()` with AI v6.6 field names (`issues_delays`, `qaqc_notes`, `safety.summary`, `visitors_deliveries`)
- [ ] Safety incident toggle: checks old (`hasIncident`/`hasIncidents`) AND new (`has_incidents`) AI fields
- [ ] Signature defaults to user settings (fullName, title, company)
- [ ] `markUserEditedFields()` → adds `user-edited` class (yellow bg) to all fields in `userEdits`

**Work Summary (Contractor Cards):**
- [ ] No contractors → simplified single textarea for general work summary
- [ ] With contractors → one card per contractor: type badge (PRIME/SUB), name, trades
- [ ] Each card: "No work performed today" checkbox + work narrative textarea + equipment input + crew input
- [ ] `getContractorActivity()` priority: userEdits → AI activities (by ID, then by name fallback for freeform) → report.activities
- [ ] "No work" checked → hides work fields, card gets `no-work` style
- [ ] Unchecking "no work" → shows fields, focuses narrative, card gets `has-content` style
- [ ] Contractor listeners: input (debounced) + blur (immediate) → `updateContractorActivity()` → `scheduleSave()`
- [ ] `updateContractorActivity()` reads DOM values, updates `RS.report.activities[]` + `RS.userEdits['activity_{id}']`
- [ ] Each contractor card has "Refine" button for AI re-polishing of narrative

**Personnel Table:**
- [ ] One row per contractor: abbreviation, trade, 6 role inputs (superintendent through others), row total
- [ ] Footer totals row sums all contractors per role + grand total
- [ ] `getContractorOperations()` priority: userEdits → AI operations (by ID, then name fallback) → report.operations
- [ ] Input change → `updatePersonnelRow()` → `updatePersonnelTotals()` → `scheduleSave()`
- [ ] Edited inputs get `user-edited` class
- [ ] Empty cells show "-" in totals

**Equipment Table:**
- [ ] Rows from `getEquipmentData()`: user-edited → AI-generated (with equipment ID resolution + contractor name resolution for freeform) → empty
- [ ] Each row: contractor dropdown, type/model input, quantity, status dropdown (IDLE, 1-10 hrs)
- [ ] "Add Equipment" button → appends new blank row, focuses type input
- [ ] Row change → `updateEquipmentRow()` → `scheduleSave()`

**Photos:**
- [ ] Single-column layout (DOT compliance, `page-break-inside: avoid`)
- [ ] Each photo card: header ("Photo X of Y"), image with loading spinner, metadata (date, time, GPS), caption textarea
- [ ] Photo load → detects portrait/landscape orientation, applies appropriate CSS class
- [ ] Photo error → attempts re-sign from `storagePath` via Supabase (one retry) → shows error placeholder if still fails
- [ ] Caption: blur saves immediately, input saves with 1s debounce
- [ ] `saveTextFieldEdits()` force-captures all text field values before preview render

---

### 4.5 Auto-Save (autosave.js)

**Field Mappings (26 fields):**
All form fields mapped to report paths (e.g., `'projectName' → 'overview.projectName'`, `'issuesText' → 'issues'`)

**Testable Assertions:**
- [ ] Every field `input` event → updates `RS.report` + `RS.userEdits` immediately → debounced `scheduleSave()` (500ms)
- [ ] Every field `blur` → cancels pending debounce → immediate `scheduleSave()`
- [ ] `scheduleSave()` → 500ms timeout → `saveReport()`
- [ ] `saveReport()` → `saveReportToLocalStorage()` + `showSaveIndicator()` + `markReportBackupDirty()`
- [ ] Save indicator: green "Saved" badge fades in for 2 seconds at bottom of screen
- [ ] Start/End time change → also triggers `calculateShiftDuration()`
- [ ] Safety radio change → updates `RS.report.safety.hasIncident` + `RS.userEdits`

**Cloud Backup (`flushReportBackup()`):**
- [ ] 5-second debounce (separate from local save)
- [ ] Upserts to Supabase `report_data` table: `report_id`, `org_id`, `user_edits`, `status`, `updated_at`
- [ ] Uses `supabaseRetry()` with 3 retries
- [ ] Silent saves (initial load) skip `markReportBackupDirty()` → prevents cross-device sync loops

**Local Save (`saveReportToLocalStorage()`):**
- [ ] Queued via `_reportSaveQueue` promise chain → prevents concurrent IDB writes
- [ ] Reads existing IDB data first → merges (preserves `aiGenerated`, `originalInput` if not in current state)
- [ ] Dual write: `dataStore.saveReportData()` + `dataStore.saveReport()` (metadata)
- [ ] After save: broadcasts `report-updated` via BroadcastChannel

**Deferred Field Updates (`_deferFieldUpdate()`):**
- [ ] Queues value update for a field → applies on blur (not during typing)
- [ ] Used for realtime sync: avoids overwriting while user is actively typing
- [ ] Applied value triggers `sync-flash` CSS animation (1.5s pulse)

---

### 4.6 Report Editor Integration Tests (Part 1)

**Full Page Load:**
- [ ] Navigate from interview FINISH → report.html loads with AI-generated data in all fields
- [ ] All text sections populated from AI response (issues_delays, qaqc_notes, etc.)
- [ ] Contractor work narratives populated from AI activities
- [ ] Personnel table populated from AI operations
- [ ] Equipment table populated from AI equipment
- [ ] Photos displayed with signed URLs from Supabase

**Edit Round-Trip:**
- [ ] Edit project name → yellow highlight → 500ms → IDB saved → 5s → Supabase synced
- [ ] Edit contractor narrative → user-edited class → save triggers → preview reflects change
- [ ] Add personnel count → row total updates → footer totals update → save triggers

**Cross-Device Sync:**
- [ ] Edit on Device A → 5s → Supabase report_data updated → Device B refresh → sees edits
- [ ] Both devices editing → deferred updates prevent overwrite during typing → blur applies remote changes

**Data Priority:**
- [ ] AI says "Clear skies" for condition → user edits to "Partly cloudy" → user edit wins everywhere
- [ ] User edit persists across page reloads (stored in IDB + Supabase)
- [ ] Clearing a user edit → falls back to AI value on next load

---

## 4b. Report Editor (Part 2 of 2)

> **Files (this part):** ai-refine.js (274), original-notes.js (293), preview.js (478), pdf-generator.js (765), submit.js (321), delete-report.js (55), debug.js (463)
> **Total (this part):** ~2,649 lines across 7 files
> **Role:** AI text refinement, original field notes display, paginated RPR preview rendering, vector PDF generation with jsPDF, submit pipeline (PDF upload + Supabase finalization), report deletion, and debug tooling

---

### 4.7 AI Refine (ai-refine.js)

**Webhook Endpoints:**
- Full report refine: `fieldvoice-v69-refine-report` (30s timeout)
- Single text field refine: `fieldvoice-v69-refine-text` (20s timeout)

**User Flow: Pending Refine Banner**
1. Page loads → `checkPendingRefineStatus()` checks `RS.report.meta.status`
2. If `pending_refine` → shows `#pendingRefineBanner` with retry button
3. User clicks "Retry" → `retryRefineProcessing()`
4. Reads queued refine payload from `RS.report.meta.offlineQueue`
5. POST to process webhook with API key
6. On success: stores `refinedReport` into `RS.report.aiGenerated`, sets status to `refined`, removes from queue, reloads page
7. On failure/offline: re-enables button, shows alert

**Testable Assertions:**
- [ ] Report with status `pending_refine` → banner visible with retry button
- [ ] Report with any other status → banner hidden
- [ ] Offline + click retry → alert "Still offline…" immediately, no fetch attempt
- [ ] No pending queue item → alert "No pending processing found"
- [ ] Successful retry → status changes to `refined`, page reloads
- [ ] Failed retry (timeout/error) → button re-enabled, error alert shown
- [ ] Retry button disabled during processing, shows spinner
- [ ] 30-second AbortController timeout on process webhook

**User Flow: Refine Text Field (Section)**
1. User clicks "Refine" button next to a text section (issues, qaqc, safety, communications, visitors)
2. `refineTextField(textareaId)` reads current textarea value
3. Empty textarea → alert "Nothing to refine", no fetch
4. Maps textarea ID to section via `SECTION_MAP` (e.g., `issuesText` → `issues`)
5. POST to refine-text webhook with `{ originalText, section, reportContext }`
6. On success: replaces textarea value with refined text, adds `user-edited` class, dispatches `input` event (triggers autosave)
7. Button shows "Done!" green for 2s, then resets

**Testable Assertions:**
- [ ] Clicking "Refine" on empty textarea → alert, no network call
- [ ] Clicking "Refine" with content → button disabled, shows "Refining..." spinner
- [ ] Successful refine → textarea updated with refined text, yellow `user-edited` class applied
- [ ] Successful refine → `input` event dispatched (triggers autosave pipeline)
- [ ] Button shows green "Done!" for 2s then resets to original state
- [ ] Failed refine → button shows red "Failed" for 2s then resets
- [ ] 20-second AbortController timeout on refine webhook
- [ ] AI response containing `[not provided]` → treated as failure (**🟡 Known Issue:** fragile string matching — legitimate text containing this phrase falsely rejected)
- [ ] **🟡 Known Issue:** n8n webhook URLs + API key exposed in client-side JS

**User Flow: Refine Contractor Narrative**
1. User clicks "Refine" on a contractor work summary card
2. `refineContractorNarrative(contractorId)` reads from `#narrative_{contractorId}`
3. Same flow as text field refine but section = `activities`, includes `contractorName` in context
4. Same success/failure UI behavior

**Testable Assertions:**
- [ ] Refine button targets correct contractor narrative textarea by ID
- [ ] Report context includes contractor name for AI context
- [ ] Successful refine updates contractor narrative + triggers autosave
- [ ] All refine buttons independently operable (one refining doesn't block others)

---

### 4.8 Original Notes Tab (original-notes.js)

**User Flow: View Original Notes**
1. User switches to "Original Notes" tab
2. `populateOriginalNotes()` reads `RS.report.originalInput` and `aiCaptureMode`
3. If mode is `minimal` or `freeform` → shows `#minimalNotesSection` (chronological freeform entries)
4. If mode is `guided` → shows `#guidedNotesSection` (structured tables)

**Freeform/Minimal Mode:**
- [ ] Freeform entries sorted by timestamp ascending
- [ ] Each entry shows `[time] content` format
- [ ] Fallback chain: `freeform_entries[]` → `fieldNotes.freeformNotes` → `report.fieldNotes.freeformNotes`
- [ ] No entries → shows "None"
- [ ] Capture mode badge shows "Quick Notes" for minimal/freeform

**Guided Mode:**
- [ ] Capture mode badge shows "Guided"
- [ ] Work entries grouped by contractor → rendered as table rows with timestamps
- [ ] Crew entries shown under contractor with crew name sub-headers
- [ ] Entries within `work_{contractorId}` and `work_{contractorId}_crew_{crewId}` sections parsed correctly
- [ ] Personnel table: one row per contractor with 6 role columns (supt, fore, oper, labor, surv, other)
- [ ] Personnel rows with all-zero counts → skipped
- [ ] Equipment table: contractor, type, qty, hours per row
- [ ] Section entries (issues, qaqc, communications, visitors) → timestamped tables
- [ ] Safety section: shows "No Incidents" green or "Incident Reported" red badge
- [ ] Safety with no entries and no flags → shows "None"

**Weather (Both Modes):**
- [ ] Weather block shows high/low temp, general condition, job site condition
- [ ] Missing weather → shows italicized "None"

**Photos (Both Modes):**
- [ ] Photos rendered in 2-column grid with aspect-square images
- [ ] Each photo shows date, time, caption
- [ ] No photos → "No photos captured" centered message
- [ ] Photo captions are HTML-escaped

---

### 4.9 Preview Rendering (preview.js)

**User Flow: Open Preview Tab**
1. User clicks Preview tab (or `switchTab('preview')`)
2. `saveTextFieldEdits()` → captures all text field values before render
3. `renderPreview()` called
4. Reads all current form field values from DOM (live preview)
5. Generates paginated HTML matching DOT RPR layout
6. `scalePreviewToFit()` CSS-scales pages to viewport width

**Page Layout:**
- **Page 1:** Project Overview table (8 rows × 4 cols) + Weather/Signature + Daily Work Summary
- **Page 2:** Daily Operations table + Equipment table + Issues + Communications
- **Page 3:** QA/QC + Safety (with Yes/No checkboxes) + Visitors
- **Page 4+:** Photos (4 per page, paginated)

**Testable Assertions (Preview Content):**
- [ ] Preview reads live DOM values (not stored data) — editing a field then clicking preview shows the edit
- [ ] `formVal()` helper reads input value, select value, or textContent as fallback
- [ ] Select elements use `.value` not `.textContent` (avoids including all option texts)
- [ ] Project overview table: 8 data rows + 5 weather rows + signature block
- [ ] NTP, duration, completion from project config (not editable)
- [ ] Contract Day shows "Day X of Y" format
- [ ] Shift duration auto-calculated from start/end time (handles overnight)
- [ ] Weather values cleaned: `--`, `Syncing...`, `N/A`, empty → default fallback

**Work Summary in Preview:**
- [ ] Contractors sorted: those with work first, no-work at bottom; primes before subs within each group
- [ ] No contractors → falls back to general `workSummary` text
- [ ] Contractor with crews → crew-level work summaries with colored left border (green=prime, blue=sub)
- [ ] "No work performed" shown in italic for no-work contractors/crews
- [ ] Narrative lines converted to bulleted `<ul>` list; existing `•` or `-` prefixes preserved
- [ ] Equipment and crew info shown below narrative in small uppercase text

**Tables in Preview:**
- [ ] Operations table: contractor abbreviation, trade abbreviation, 6 personnel columns
- [ ] Trade abbreviation map (e.g., "construction management" → "CM", "pile driving" → "PLE")
- [ ] Equipment table: contractor name (abbreviated), type, qty, notes (IDLE or "X HRS UTILIZED")
- [ ] Empty equipment → "No equipment mobilized" row
- [ ] User-edited equipment values override AI values

**Text Sections in Preview:**
- [ ] Empty text → `<ul><li>N/A.</li></ul>` styled
- [ ] Non-empty text → each line as bulleted `<li>` item
- [ ] Safety section: Yes/No checkboxes with X marks matching form radio state

**Photos in Preview:**
- [ ] 4 photos per page, paginated
- [ ] Photo page shows project name and number header
- [ ] Each photo: image, date, caption
- [ ] Page numbers: "Page 4", "Page 5", etc.

**Preview Scaling:**
- [ ] Preview renders at 816px width (8.5" at 96dpi)
- [ ] `scalePreviewToFit()` scales to fit viewport, centered
- [ ] Wrapper height adjusted to scaled content height (no dead space)
- [ ] Scale capped at 1.0 (never zooms in beyond natural size)

**Known Issues:**
- [ ] **🟡** `formVal()` defined locally — shadows identical function in submit.js (DRY violation, not a bug)
- [ ] **🟡** `sigDetails` built with raw string concatenation — names with HTML chars render incorrectly in signature
- [ ] **🟡** `previewFormatTradesAbbrev()` has different abbreviation map than PDF version — potential inconsistency
- [ ] **🟠** Photos use original `photo.url` — high-res images could consume significant mobile memory

---

### 4.10 PDF Generation (pdf-generator.js)

**User Flow: PDF Generated During Submit**
1. `handleSubmit()` calls `generateVectorPDF()`
2. Uses jsPDF library for crisp vector text rendering
3. Letter-size pages (612×792pt), 36pt margins
4. Same data sources as preview (reads from DOM form fields)
5. Returns `{ blob, filename }` — blob for upload, filename for storage

**PDF Structure:**
- Page constants: PW=612, PH=792, ML/MR=36, MT=30
- Green (#4A7C34) section headers, gray (#F5F5F5) label cells
- Fonts: Helvetica normal/bold/italic at various sizes (6pt–18pt)
- Dynamic page breaks with `checkPageBreak(neededHeight)`
- Page footer: "X of Y" (total pages filled in at end)

**Testable Assertions (PDF Content):**
- [ ] PDF filename format: `{ProjectName}_{YYYY-MM-DD}.pdf`
- [ ] Project name sanitized: non-alphanumeric → `_`, truncated to 30 chars
- [ ] Logo: tries to embed project logo as JPEG → fallback to "LOUIS ARMSTRONG NEW ORLEANS INTERNATIONAL AIRPORT" text
- [ ] `loadImageAsDataURL()` converts image URL to canvas data URL (max 800px, JPEG 0.85 quality)
- [ ] Logo loading has 10s timeout → resolves null on failure
- [ ] Overview table: 8 data rows + weather rows + signature in same layout as preview
- [ ] Signature: italic blue name centered + "Digitally signed by" detail text
- [ ] Work summary: contractors sorted same as preview (work-first, prime-before-sub)
- [ ] Crews render with indented crew names and narratives
- [ ] Page breaks handled mid-work-summary: box borders closed on old page, reopened on new page

**Tables in PDF:**
- [ ] Operations table: header row with gray background, one row per contractor
- [ ] Personnel values show "0" (not "N/A") when no data — indicates "no work" not "missing"
- [ ] Equipment table: filters out empty/placeholder rows (no type AND no contractor)
- [ ] User-edited equipment values override AI values (same logic as preview)

**Text Sections in PDF:**
- [ ] `drawTextBox()` handles single-page and multi-page content
- [ ] Multi-page text boxes: close borders on page break, reopen on new page with top border
- [ ] Bullet points added to non-empty text, "N/A." for empty
- [ ] **🟡 Known Issue:** `drawTextBox()` returns `totalH` for single-page but `0` for multi-page — asymmetric return value confusing but works because `curY` is already positioned

**Photos in PDF:**
- [ ] 4 photos per page (2×2 grid), 165pt cell height
- [ ] Photos loaded sequentially via `loadImageAsDataURL()` (**🟠** slow for many photos — parallel would be faster)
- [ ] Failed photo → "Photo unavailable" italic text
- [ ] Photo cells: border, date label, italic caption
- [ ] Photo page header: project name + project number

**PDF Finalization:**
- [ ] Total page count fixed at end: iterates all pages, overwrites footer with actual "X of Y"
- [ ] Output as Blob with `compress: true`
- [ ] Console logs blob size in bytes

**Known Issues:**
- [ ] **🟡** `formVal()` defined again locally (third copy across preview/pdf/submit)
- [ ] **🟡** `pdfFormatTradesAbbrev()` has MORE trade abbreviations than preview version — maps should be unified
- [ ] **🟡** `loadImageAsDataURL()` uses `crossOrigin = 'anonymous'` — CORS changes on Supabase would silently fail all photos
- [ ] **🟠** Sequential photo loading — could be parallelized with `Promise.all`

---

### 4.11 Submit Flow (submit.js)

**User Flow: Submit Report**
1. User clicks "Submit Report" on preview tab
2. Confirmation modal appears (from HTML)
3. User confirms → `handleSubmit()`
4. **Guard checks:** must be online, must have report data, must have reportId
5. **Duplicate detection:** queries Supabase `reports` table for same project + date + status=submitted + different ID
6. If duplicate found → confirm dialog "A report already exists. Submit anyway?"
7. User cancels → abort. User confirms → continue.
8. Show loading overlay with progress status updates
9. **Step 1:** `saveReportToLocalStorage()` — save current form to IDB
10. **Step 2:** `generateVectorPDF()` — produce PDF blob
11. **Step 3:** `uploadPDFToStorage()` — upload to Supabase Storage `report-pdfs` bucket
12. **Step 4:** `ensureReportExists()` — upsert report row (foreign key)
13. **Step 5:** `saveSubmittedReportData()` — write `pdf_url`, `inspector_name`, `submitted_at`
14. **Step 6:** `updateReportStatus('submitted')` — set status in Supabase + local IDB
15. **Step 7:** `cleanupLocalStorage()` — delete IDB report data + photos
16. Redirect to `index.html?submitted=true`

**Testable Assertions:**
- [ ] Offline → error "Cannot submit offline", no further processing
- [ ] No report data → error "No report data found"
- [ ] No report ID → error "No report ID found"
- [ ] Duplicate exists + user cancels → submission aborted, no state changes
- [ ] Duplicate check failure (network/query error) → non-blocking, submit proceeds
- [ ] Loading overlay shows progressive status: "Generating PDF…" → "Uploading PDF…" → "Saving report…" → "Cleaning up…"
- [ ] Submit button disabled during processing, shows spinner
- [ ] Any step failure → overlay hidden, submit button re-enabled, error toast shown for 8s

**PDF Upload (`uploadPDFToStorage()`):**
- [ ] Storage path: `{reportId}/{filename}`
- [ ] Upsert to `report-pdfs` bucket with `contentType: application/pdf`
- [ ] **🟡 Known Issue:** Creates 1-hour signed URL — stored as `pdf_url` in database, expires after 1 hour, making all historical report PDF links invalid
- [ ] Upload failure → throws with error message

**Report Finalization (`ensureReportExists()` + `saveSubmittedReportData()`):**
- [ ] Upserts report row with: id, project_id, org_id, device_id, user_id, report_date, status, capture_mode, timestamps
- [ ] Updates report with: pdf_url, inspector_name, submitted_at
- [ ] Inspector name: `completedBy` field → user settings `fullName` fallback
- [ ] Status update writes to both Supabase `reports` table AND local IDB

**Cleanup (`cleanupLocalStorage()`):**
- [ ] Deletes IDB report data (`deleteReportData`)
- [ ] Updates IDB report metadata to status=submitted
- [ ] Deletes IDB photos for report (`deletePhotosByReportId`)
- [ ] Cleanup errors are caught + warned (non-blocking)

**Post-Submit:**
- [ ] Redirect to `index.html?submitted=true` triggers success banner on dashboard
- [ ] Dashboard auto-dismisses submitted report card after 3s

---

### 4.12 Delete Report (delete-report.js)

**User Flow: Delete Report**
1. User clicks delete button in report header
2. `confirmDeleteReport()` shows `#deleteModal` (modal from HTML)
3. User confirms → `executeDeleteReport()`
4. Hides modal
5. Calls `deleteReportFull(reportId)` (defined in data-layer.js) — cascade: blocklist + IDB + Supabase soft-delete
6. On success → redirect to `index.html`
7. On failure → toast/alert "Delete failed. Please try again."

**Testable Assertions:**
- [ ] Delete button click → modal visible with confirm/cancel options
- [ ] Cancel → modal hidden, no deletion
- [ ] Confirm → modal hidden, `deleteReportFull()` called with current report ID
- [ ] No current report ID → warn + redirect to index.html
- [ ] Successful delete → redirect to `index.html` (no `?submitted=true`)
- [ ] Failed delete → error shown via `showToast('error')` or `alert()` fallback
- [ ] Delete does NOT use `rm` — it's a soft-delete through the data layer

---

### 4.13 Debug Tool (debug.js)

**User Flow: Open Debug Panel**
1. Debug panel exists as collapsible section at bottom of Form View
2. User clicks debug header → `toggleDebugPanel()` expands/collapses
3. On expand: shows 5 sections (AI Response, Field Notes, User Edits, Current State, Issues)
4. Each section independently collapsible via `toggleDebugSection(sectionName)`

**Debug Initialization (`initializeDebugPanel()`):**
- [ ] Runs `detectFieldMismatches()` → populates `fieldMappingIssues[]`
- [ ] AI Response section: JSON.stringify of `RS.report.aiGenerated` or "No AI response data"
- [ ] Field Notes section: JSON of `fieldNotes` + `guidedNotes`
- [ ] User Edits section: JSON of `RS.report.userEdits` or "No user edits"
- [ ] Current State section: JSON of current activities, operations, equipment
- [ ] Issues with count > 0 → yellow issue banner shown (dismissible)
- [ ] Issues count = 0 → green "No issues detected" badge

**Field Mismatch Detection (`detectFieldMismatches()`):**
- [ ] **Schema checks:** flags unexpected top-level keys in `aiGenerated` (expected: activities, generalIssues, qaqcNotes, safety, contractorCommunications, visitorsRemarks, operations, equipment)
- [ ] **Schema checks:** flags unexpected keys in `activities[]` items (expected: contractorId, narrative, noWork, equipmentUsed, crew)
- [ ] **Schema checks:** flags unexpected keys in `safety` object (expected: notes, hasIncident, noIncidents)
- [ ] **Schema checks:** flags unexpected keys in `operations[]` items (expected: contractorId + 6 role fields)
- [ ] **Empty response checks:** AI generalIssues empty but guidedNotes.issues has content → issue
- [ ] **Empty response checks:** AI safety.notes empty but guidedNotes.safety has content → issue
- [ ] **Empty response checks:** AI activities empty but guidedNotes.workSummary has content → issue
- [ ] **Type checks:** expected array fields containing strings → flagged (generalIssues, qaqcNotes, activities, operations, equipment)
- [ ] **Type checks:** safety.notes can be array OR string (both acceptable)
- [ ] **Contractor ID checks:** activity/operation/equipment contractorId not in `RS.projectContractors` → flagged
- [ ] No AI data → returns empty issues array (no false positives)

**Debug Downloads:**
- [ ] "Download JSON" → creates `fieldvoice-debug-{timestamp}.json` with all debug data + issues
- [ ] "Download Markdown" → creates `fieldvoice-debug-{timestamp}.md` with formatted sections + code blocks
- [ ] Both use Blob download via temporary `<a>` element + `URL.createObjectURL`
- [ ] Timestamp format: `YYYY-MM-DD-HHmmss`

**Debug Banner:**
- [ ] Banner appears when issues detected, with count badge
- [ ] Clicking banner → scrolls to debug panel + expands it
- [ ] Dismiss button → hides banner permanently (session-level `debugBannerDismissed` flag)
- [ ] Dismiss click uses `event.stopPropagation()` to prevent scroll-to-panel

**Debug Panel UI:**
- [ ] Collapsed → chevron down; Expanded → chevron up
- [ ] Issue count badge: yellow when issues > 0, green when 0
- [ ] Each issue shows type badge (schema/empty/type/contractor), field path, and message

---

### 4.14 Report Editor Integration Tests (Part 2)

**AI Refine Round-Trip:**
- [ ] Open report → edit issues text → click "Refine" → text replaced with AI-polished version → yellow highlight → auto-saved
- [ ] Refine contractor narrative → updated text saved to `userEdits['activity_{id}']` → persists across reload
- [ ] Refine while offline → fetch fails → error shown → original text preserved

**Original Notes Fidelity:**
- [ ] Complete guided interview → open report → switch to Original Notes → all captured data visible in structured format
- [ ] Complete freeform interview → open report → switch to Original Notes → chronological entries displayed
- [ ] Original Notes tab is read-only — no edit controls visible

**Preview ↔ Form Sync:**
- [ ] Edit contractor narrative in Form → switch to Preview → narrative reflects edit immediately
- [ ] Edit personnel count in Form → switch to Preview → operations table updated
- [ ] All text sections (issues, qaqc, safety, comms, visitors) reflect current form values in preview
- [ ] Safety radio toggle → preview shows correct Yes/No checkboxes

**PDF ↔ Preview Consistency:**
- [ ] Preview page 1 content matches PDF page 1 content (overview + work summary)
- [ ] Preview page 2 content matches PDF page 2 content (ops + equipment + issues + comms)
- [ ] Preview page 3 content matches PDF page 3 content (qaqc + safety + visitors)
- [ ] Photo pages match (same count, same captions, same pagination)
- [ ] **🟡 Verify:** Trade abbreviation maps differ between preview.js and pdf-generator.js — check for visible mismatches

**Full Submit Pipeline (E2E):**
- [ ] Complete report → preview → submit → loading overlay → redirect to dashboard with success banner
- [ ] Dashboard shows report as "Submitted" status
- [ ] Supabase `reports` row has: status=submitted, pdf_url set, inspector_name set, submitted_at set
- [ ] IDB report data cleaned up (no stale draft data)
- [ ] IDB photos cleaned up
- [ ] PDF downloadable from Supabase Storage (within 1-hour signed URL window)

**Delete Pipeline (E2E):**
- [ ] Open report → click delete → confirm → redirect to dashboard
- [ ] Dashboard no longer shows deleted report
- [ ] Report ID added to deleted blocklist (won't reappear via sync)
- [ ] Supabase report soft-deleted

**Debug Tool Validation:**
- [ ] Report with known AI schema issue → debug panel shows non-zero issue count + yellow banner
- [ ] Download JSON → file contains all debug data, parseable JSON
- [ ] Download Markdown → file contains formatted debug report with code blocks
- [ ] Report with clean AI response → debug panel shows green "No issues" badge

---

## 5. Projects & Config

> **Files:** projects.html (122), js/projects/main.js (313), project-config.html (553), js/project-config/main.js (105), js/project-config/contractors.js (310), js/project-config/crud.js (286), js/project-config/document-import.js (334), js/project-config/form.js (158)
> **Total:** 2,181 lines across 8 files
> **Role:** Project listing/selection, project creation/editing, contractor & crew management, logo upload, AI-powered document import for auto-filling project data

---

### 5.1 Project List Page (projects.html + js/projects/main.js)

**User Flow: View Projects**
1. Navigate to `projects.html`
2. `DOMContentLoaded` → `initPWA()`, read `ACTIVE_PROJECT_ID` from localStorage
3. `renderProjectList()` → shows loading spinner → `getAllProjects()`
4. `getAllProjects()`: IDB first via `dataLayer.loadProjects()` → if empty + online → Supabase via `dataLayer.refreshProjectsFromCloud()`
5. Projects sorted alphabetically by name
6. Render project cards with name, number, location, status badge, active indicator
7. Update active project banner if one is selected

**Testable Assertions (Project List):**
- [ ] Page loads → loading spinner shown while projects fetch
- [ ] Projects from IDB → rendered immediately without network call
- [ ] No IDB projects + online → fetches from Supabase, renders results
- [ ] No IDB projects + offline → empty state with "You are offline" message
- [ ] Projects sorted alphabetically by `projectName` (case-insensitive)
- [ ] Error loading projects → error state with retry button
- [ ] Retry button → full page reload

**Active Project Banner:**
- [ ] Active project set → green banner at top shows project name
- [ ] No active project → banner hidden
- [ ] Active project card has green left border + check icon

**Project Card Rendering:**
- [ ] Each card shows: project name, NOAB number (if present), location (if present), status badge
- [ ] Active status → green "Active" badge; other → gray "Inactive" badge
- [ ] Card body (left) clickable → selects project
- [ ] Edit button (right, blue) → navigates to `project-config.html?id={projectId}`
- [ ] Contractor section expandable: shows count badge, click to expand
- [ ] Expanded: each contractor shows name, PRIME/Sub type, trades, crew count badge
- [ ] Chevron rotates 90° when expanded, back when collapsed
- [ ] `toggleContractors()` uses `event.stopPropagation()` to prevent card selection

**User Flow: Select Project**
1. Tap project card body
2. `selectProject(projectId)` → stores `ACTIVE_PROJECT_ID` in localStorage
3. Shows toast "{projectName} selected"
4. 500ms delay → navigate to `index.html`

**Testable Assertions (Selection):**
- [ ] Tap project → `ACTIVE_PROJECT_ID` stored in localStorage
- [ ] Toast shows project name
- [ ] Redirects to `index.html` after ~500ms

**User Flow: Refresh from Cloud**
1. Tap refresh button in header
2. Must be online (offline → warning toast, no action)
3. Clears IDB projects store
4. Fetches from Supabase via `dataLayer.refreshProjectsFromCloud()`
5. Re-renders list
6. **🟡 Known Issue:** IDB cleared before fetch — if fetch fails, local projects are lost. Error handler tries to re-render from `loadProjects()` but IDB was just cleared.

**Testable Assertions (Refresh):**
- [ ] Offline → "You are offline" warning toast, button not disabled
- [ ] During refresh → button disabled, spinner icon animates
- [ ] Successful refresh → "Projects refreshed" success toast
- [ ] Failed refresh → "Failed to refresh" error toast, re-renders from local (but IDB was cleared)
- [ ] Double-tap prevention: `isRefreshing` flag blocks concurrent refreshes
- [ ] After refresh → button re-enabled, icon stops spinning

**Navigation:**
- [ ] "New Project" button → navigates to `project-config.html` (no `?id=`)
- [ ] Home button → navigates to `index.html`

---

### 5.2 Project Config — Page Init & State (project-config.html + main.js)

**Page Structure:**
- Unsaved changes banner (orange, hidden by default)
- Import from Existing Report section (drag-and-drop zone)
- Project Details section (logo, name, numbers, location, engineer, contractor)
- Contract Information section (NTP, duration, dates, times, weather days)
- Contractor Roster section (dynamic list)
- Add Contractor form (inline, hidden)
- Add Crew form (inline, hidden)
- Save / Cancel / Delete buttons
- Delete modals (contractor + project)

**User Flow: Create New Project**
1. Navigate to `project-config.html` (no `?id=` param)
2. `createNewProject()` → initializes `currentProject` with defaults + `generateId()` UUID
3. Form fields empty (except CNO defaults to "N/A", start time "06:00", end time "16:00")
4. Delete button hidden (new project)

**User Flow: Edit Existing Project**
1. Navigate to `project-config.html?id={projectId}`
2. `loadProject(projectId)` → IDB first → fallback to `dataLayer.loadProjects()` linear scan
3. Deep copies project (prevents mutation of source data)
4. `populateForm()` fills all fields from `currentProject`
5. Delete button visible (existing project)

**Testable Assertions (Init):**
- [ ] No `?id=` param → new project mode, all fields default/empty, delete button hidden
- [ ] `?id=abc` → edit mode, project loaded from IDB, fields populated, delete button visible
- [ ] Project not found in IDB → falls back to `dataLayer.loadProjects()` full scan
- [ ] Project not found anywhere → "Failed to load project" error toast

**Dirty State Tracking:**
- [ ] Any form input `input` or `change` event → `markDirty()` → orange banner appears
- [ ] `beforeunload` fires with unsaved changes → browser confirmation dialog
- [ ] After successful save → `clearDirty()` → banner hidden
- [ ] Banner text: "You have unsaved changes — click Save before leaving"

---

### 5.3 Project Config — Form & Logo (form.js)

**Form Population (`populateForm()`):**
- [ ] All 14+ form fields mapped from `currentProject` to DOM inputs
- [ ] Logo priority: `logoUrl` (full quality) → `logoThumbnail` (compressed) → `logo` (legacy)
- [ ] Logo present → upload zone hidden, preview shown with remove button
- [ ] No logo → upload zone visible, preview hidden
- [ ] Contractor list rendered from `currentProject.contractors`

**User Flow: Upload Logo**
1. Click logo drop zone or drag image onto it
2. `handleLogoSelect()` validates file type (PNG, JPG, SVG, GIF)
3. Invalid type → error toast, file input cleared
4. `compressImageToThumbnail()` → base64 thumbnail for instant local display
5. Show preview immediately with thumbnail
6. `uploadLogoToStorage()` → upload original to Supabase Storage (async)
7. Success → store `logoUrl`, show "Logo uploaded" toast
8. Upload fails (offline) → store `logoThumbnail` only, "Logo saved locally" warning toast
9. Old `logo` field cleaned up (`delete currentProject.logo`)
10. `markDirty()`

**Testable Assertions (Logo):**
- [ ] Click drop zone → file picker opens (image types only)
- [ ] Drag image onto zone → zone highlights with `drag-active` class
- [ ] Valid image selected → thumbnail preview shown instantly
- [ ] Supabase upload succeeds → "Logo uploaded" toast
- [ ] Supabase upload fails/offline → "Logo saved locally" warning, thumbnail still visible
- [ ] Invalid file type → "Please select a valid image file" error toast
- [ ] File input cleared after selection (allows re-selecting same file)

**User Flow: Remove Logo**
1. Click red X button on logo preview
2. `removeLogo()` → fires `deleteLogoFromStorage()` (async, fire-and-forget)
3. Clears `logoThumbnail`, `logoUrl`, `logo` fields
4. Upload zone shown, preview hidden
5. `markDirty()`
6. **🟡 Known Issue:** `deleteLogoFromStorage()` is fire-and-forget — orphans Storage file on failure

**Testable Assertions (Logo Remove):**
- [ ] Click remove → preview hidden, upload zone shown
- [ ] "Logo removed" toast
- [ ] `currentProject.logoThumbnail` and `logoUrl` both null after remove

**Logo Drag-and-Drop:**
- [ ] `setupLogoDropZone()` wires drag events
- [ ] Drop image file → triggers `handleLogoSelect()` via fake event
- [ ] Drag enter/over → `drag-active` class added
- [ ] Drag leave/drop → `drag-active` class removed

---

### 5.4 Project Config — CRUD (crud.js)

**User Flow: Save Project**
1. Click "Save Project"
2. Validate: project name required (empty → error toast + focus field)
3. Read all form fields into `currentProject` (15 fields)
4. Ensure `user_id` and `created_at` set
5. Save to IDB first (`idb.saveProject()`)
6. Then sync to Supabase (`saveProjectToSupabase()` → upserts with `toSupabaseProject()` normalization)
7. Supabase success → "Project saved successfully" toast, `clearDirty()`
8. Supabase fail → "Project saved locally (offline)" warning toast, `clearDirty()`
9. 800ms delay → navigate to `projects.html`

**Testable Assertions (Save):**
- [ ] Empty project name → "Project name is required" error toast, field focused, no save
- [ ] Valid project → IDB save first (local-first pattern)
- [ ] IDB save fails → continues to attempt Supabase save anyway
- [ ] Supabase success → success toast
- [ ] Supabase fail (offline) → warning toast, local save preserved
- [ ] `clearDirty()` called on any save outcome → dirty banner hidden, `beforeunload` warning removed
- [ ] Redirect to `projects.html` after 800ms regardless of Supabase sync result
- [ ] `contractDuration` parsed as int → `null` if empty
- [ ] **🟡 Known Issue:** `contractDayNo` parsed with `parseInt() || ''` — treats `0` as empty string (falsy)
- [ ] `cnoSolicitationNo` defaults to "N/A" if empty
- [ ] Default start time "06:00", end time "16:00" preserved
- [ ] `weatherDays` defaults to `0` if empty

**Supabase Save (`saveProjectToSupabase()`):**
- [ ] Uses `toSupabaseProject()` for snake_case normalization
- [ ] Attaches `user_id` from localStorage
- [ ] Upserts with `onConflict: 'id'`

**User Flow: Delete Project**
1. Click "Delete Project" (only visible in edit mode)
2. `showDeleteProjectModal()` → modal shows project name in quotes
3. **Offline guard:** if offline → "Cannot delete project while offline" error toast, modal closes
4. Confirm → `confirmDeleteProject()`:
   a. Show loading spinner on button
   b. Hard-delete from Supabase (`supabaseClient.from('projects').delete()`)
   c. Delete from IDB
   d. Clear from localStorage cache
   e. If deleted project was active → clear `ACTIVE_PROJECT_ID`
   f. "Project deleted successfully" toast
   g. Navigate to `projects.html` after 800ms
5. Cancel → modal closes, no action

**Testable Assertions (Delete):**
- [ ] Delete button only visible when editing existing project (not new)
- [ ] Modal shows correct project name in red
- [ ] Offline → error toast, modal closes, no deletion
- [ ] Confirm → button disabled, spinner shown, "Deleting..." text
- [ ] Supabase delete succeeds → IDB delete → localStorage cleanup → redirect
- [ ] Supabase delete fails → error toast, no IDB/localStorage cleanup
- [ ] Deleted project was active → `ACTIVE_PROJECT_ID` removed from localStorage
- [ ] Deleted project was not active → `ACTIVE_PROJECT_ID` unchanged
- [ ] **⚫ Known Issue:** Uses hard-delete on Supabase — no soft-delete/recovery
- [ ] Cancel → modal closes, no state changes

**Cancel Edit:**
- [ ] Click "Cancel" → navigate to `projects.html`, `currentProject` cleared

---

### 5.5 Contractor & Crew Management (contractors.js)

**Contractor Rendering:**
- [ ] No contractors → placeholder with hard-hat icon and "No contractors added"
- [ ] Contractors sorted: primes first, then subcontractors
- [ ] Each card shows: drag handle, name, abbreviation (monospace), type badge (green PRIME / gray Subcontractor), trades
- [ ] Crews listed under contractor (if any): crew name, edit/delete buttons
- [ ] "Add Crew" button under each contractor
- [ ] Edit (blue) and Delete (red) buttons per contractor

**User Flow: Add Contractor**
1. Click "Add Contractor" → inline form appears, scrolls into view
2. Fill: name (required), abbreviation (required, auto-uppercased, max 10 chars), type dropdown (prime/subcontractor), trades (semicolon-separated)
3. Save → pushes to `currentProject.contractors[]` with generated ID + empty crews
4. Form hidden, contractor list re-rendered, `markDirty()`, "Contractor added" toast
5. Cancel → form hidden, no changes

**User Flow: Edit Contractor**
1. Click edit button → form appears pre-filled with contractor data
2. Title changes to "Edit Contractor"
3. Hidden `editContractorId` field set
4. Save → updates existing contractor in `currentProject.contractors[]`
5. "Contractor updated" toast

**Testable Assertions (Contractor CRUD):**
- [ ] Add with empty name or abbreviation → "Name and abbreviation are required" error toast
- [ ] Add valid → contractor appears in list, form hidden
- [ ] Edit → form pre-filled with correct data, title "Edit Contractor"
- [ ] Save edit → contractor data updated in-memory, list re-rendered
- [ ] All contractor changes are in-memory only until "Save Project" is clicked
- [ ] Abbreviation auto-uppercased via `toUpperCase()` + CSS `uppercase` class
- [ ] Default type for new contractor: "subcontractor"

**User Flow: Delete Contractor**
1. Click delete button → generic delete modal "Delete this contractor?"
2. Confirm → contractor filtered out of `currentProject.contractors[]`
3. List re-rendered, `markDirty()`, "Contractor deleted" toast
4. **🟡 Known Issue:** No undo — contractor with many crews is lost until page cancel

**User Flow: Add Crew**
1. Click "Add Crew" under a contractor → crew form appears with `contractorId` in dataset
2. Fill crew name (required)
3. Save → pushes to contractor's `crews[]` with generated ID, `sortOrder`, `status: 'active'`
4. Form hidden, contractors re-rendered, `markDirty()`, "Crew added" toast

**User Flow: Edit Crew**
1. Click edit icon on crew → form appears pre-filled with crew name
2. `editCrewId` stored in form dataset
3. Save → updates crew name in-memory

**User Flow: Delete Crew**
1. Click delete icon → delete modal "Delete this crew?"
2. Confirm → crew filtered out of contractor's `crews[]`

**Testable Assertions (Crew CRUD):**
- [ ] Empty crew name → "Crew name is required" error toast
- [ ] Add crew → appears under correct contractor
- [ ] Edit crew → form shows current name, title "Edit Crew"
- [ ] Delete crew → removed from list, `markDirty()`
- [ ] Crew form focuses name input on show

**Drag-and-Drop Reordering:**
- [ ] Drag handle visible on each contractor card
- [ ] Drag start → card gets `dragging` class (opacity 0.5)
- [ ] Drag over another card → target gets `drag-over` class (green top border)
- [ ] Drop → contractors reordered in `currentProject.contractors[]`, `markDirty()`
- [ ] Drag end → classes cleaned up
- [ ] **🟡 Known Issue:** HTML5 DnD doesn't work on iOS Safari — no touch alternative

**Generic Delete Modal:**
- [ ] `showDeleteModal(message, callback)` → shows modal with custom message
- [ ] Confirm → executes callback, closes modal
- [ ] Cancel → closes modal, no callback

---

### 5.6 Document Import (document-import.js)

**Webhook:** `fieldvoice-v69-project-extractor` (n8n, **🟡 no authentication**)

**User Flow: Select Files**
1. Click drop zone or "Browse Files" button → file picker opens (PDF, DOCX)
2. Or drag files onto drop zone
3. File validation: only `.pdf` and `.docx` accepted (others → error toast)
4. Duplicate detection: same name + size → "File already added" warning toast
5. Valid files added to `selectedFiles[]`
6. File list rendered with icons (red PDF / blue DOCX), file name, size, remove button
7. "Extract Project Data" button appears

**Testable Assertions (File Selection):**
- [ ] Invalid file type → error toast, file not added
- [ ] Duplicate file (same name + size) → warning toast, not added
- [ ] Valid PDF → red file-pdf icon, name, formatted size
- [ ] Valid DOCX → blue file-word icon
- [ ] Remove button → file removed from list
- [ ] All files removed → file list and extract button hidden
- [ ] Drop zone highlight: `drag-active` class on dragenter/dragover, removed on leave/drop
- [ ] **🟡 Known Issue:** No file size limit — large files could timeout webhook

**User Flow: Extract Project Data**
1. Click "Extract Project Data"
2. No files → "Please select at least one file" error toast
3. Previous banners hidden
4. Button disabled, icon spins, text "Extracting..."
5. Build `FormData` with all files as `documents`
6. POST to n8n webhook (no auth headers)
7. Parse JSON response

**On Success (`result.success && result.data`):**
1. `populateFormWithExtractedData(result.data)` — fill form fields
2. Show green success banner: "Project data extracted!"
3. If `result.extractionNotes` → show collapsible yellow notes section
4. Clear selected files
5. Scroll to top of form

**On Failure:**
1. Show red error banner with error message
2. Network error → "Network error. Please check your connection."

**Testable Assertions (Extraction):**
- [ ] Extract with no files → error toast, no fetch
- [ ] During extraction → button disabled + spinner
- [ ] Success → green banner, form populated, files cleared
- [ ] Success with notes → yellow collapsible notes section visible
- [ ] Toggle notes → content expands/collapses, chevron rotates
- [ ] API returns `success: false` → red error banner with message
- [ ] Network error → red banner "Network error..."
- [ ] After success or failure → button re-enabled, icon reset
- [ ] **🟡 Known Issue:** No AbortController — extraction cannot be cancelled
- [ ] **🟡 Known Issue:** No auth header on webhook — open to anyone with URL

**Form Population from Extracted Data (`populateFormWithExtractedData()`):**
- [ ] 14 field mappings: projectName, noabProjectNo, cnoSolicitationNo, location, engineer, primeContractor, noticeToProceed, reportDate, contractDuration, expectedCompletion, defaultStartTime, defaultEndTime, weatherDays, contractDayNo
- [ ] Missing fields (null/undefined/empty) → red border + "Missing — please fill in" indicator
- [ ] Present fields → input value set + `currentProject` updated
- [ ] Typing into missing field → red indicator clears automatically
- [ ] Contractors extracted → each gets generated ID, abbreviation (auto-generated if missing), type (default "subcontractor"), empty crews array

**Auto-Abbreviation (`generateAbbreviation()`):**
- [ ] Multi-word name: first letter of each word, max 4 chars (e.g., "Boh Bros Construction" → "BBC")
- [ ] Single-word name: first 3 chars uppercased (e.g., "AECOM" → "AEC")
- [ ] Empty name → empty string
- [ ] `markDirty()` called after extraction populates form

---

### 5.7 Projects Integration Tests

**Create Project (E2E):**
- [ ] Navigate to projects.html → click "New Project" → project-config.html loads
- [ ] Fill project name, add 2 contractors (1 prime, 1 sub), add crew to prime
- [ ] Click Save → redirect to projects.html → new project visible in list
- [ ] Select new project → redirect to dashboard → active project banner shows name
- [ ] Return to projects.html → active project highlighted with green border + check

**Edit Project (E2E):**
- [ ] From project list → click edit → config page loads with all fields populated
- [ ] Change project name → dirty banner appears
- [ ] Navigate away (beforeunload) → browser shows confirmation dialog
- [ ] Save → updated name visible in project list

**Delete Project (E2E):**
- [ ] Edit existing project → click Delete → modal with project name
- [ ] Confirm → redirect to projects.html → project no longer in list
- [ ] If deleted project was active → dashboard has no active project

**Document Import (E2E):**
- [ ] New project page → drag PDF onto import zone → file appears in list
- [ ] Click "Extract" → loading → form populated with extracted data
- [ ] Missing fields highlighted in red → type into field → red clears
- [ ] Add additional contractors manually → save → full project created

**Logo Upload (E2E):**
- [ ] Upload PNG logo → thumbnail preview appears instantly
- [ ] Save project → re-open → logo still visible (loaded from IDB/Supabase)
- [ ] Remove logo → save → re-open → upload zone shown, no logo

**Contractor Reorder (Desktop):**
- [ ] 3 contractors added → drag third to first position → re-rendered in new order → `isDirty`
- [ ] Save → reopen → order persists

**Offline Scenarios:**
- [ ] Offline + save project → "Project saved locally" warning, IDB has data
- [ ] Back online + refresh projects → project syncs to Supabase
- [ ] Offline + delete project → "Cannot delete while offline" error, project preserved
- [ ] Offline + extract from document → network error banner

---

## 6. Other Pages (Settings, Archives, Login, Permissions, Landing)

> **Files:** settings.html (307) + js/settings/main.js (586), archives.html (96) + js/archives/main.js (365), login.html (229) + js/login/main.js (367), permissions.html (751) + js/permissions/main.js (791), permission-debug.html (252) + js/permission-debug/main.js (741), landing.html (1,285) + js/landing/main.js (189)
> **Total:** 5,959 lines across 12 files
> **Role:** Inspector profile/settings, submitted report archives, authentication (sign in/up + role picker), device permission setup (mic/cam/GPS), permission diagnostics, and marketing landing page

---

### 6.1 Settings / Inspector Profile (settings.html + js/settings/main.js)

**Page Sections:**
1. Personal Information (name*, title*, company*, email, phone)
2. Report Signature Preview (live updating)
3. Manage Projects link → `projects.html`
4. Setup & Permissions link → `permissions.html`
5. Troubleshooting → Refresh App (cache clear + SW unregister)
6. Account → email display + Sign Out
7. Admin → Reset All Data (nuclear option)
8. Footer: Save Profile + Refresh from Cloud

**User Flow: Load Settings**
1. `DOMContentLoaded` → pre-populate name/email from localStorage (instant UX)
2. Setup input listeners → every keystroke updates signature preview + checks dirty + saves to scratch pad
3. Wait for `auth.ready`
4. `loadSettings()` → check scratch pad for unsaved changes → if found, restore + set dirty
5. Otherwise load from `dataLayer.loadUserSettings()` (IDB-first, Supabase fallback)
6. Store original values for dirty comparison
7. Display authenticated email

**Testable Assertions (Settings Load):**
- [ ] Page loads → name/email pre-populated from localStorage immediately (before async)
- [ ] Full profile loads from IDB after auth → all 5 fields populated
- [ ] Scratch pad has unsaved changes → form restored from scratch, dirty badge shown
- [ ] No scratch pad → form loaded from IDB/Supabase, not dirty

**Signature Preview:**
- [ ] Empty name → shows "--"
- [ ] Name only → shows "Name"
- [ ] Name + title → shows "Name, Title"
- [ ] Name + title + company → shows "Name, Title (Company)"
- [ ] Updates live on every keystroke

**Dirty State Tracking:**
- [ ] Edit any field → dirty badge appears (orange border on save button + orange indicator)
- [ ] Change back to original value → dirty clears
- [ ] Dirty + navigate away → `beforeunload` confirmation dialog
- [ ] Every keystroke while dirty → scratch pad saved to localStorage

**User Flow: Save Settings**
1. Click "Save Profile"
2. Get `auth_user_id` from session
3. Build profile object from form fields
4. Save to IDB first via `dataLayer.saveUserSettings()` (local-first)
5. IDB save fails → error toast, abort
6. Try Supabase upsert on `user_profiles` (conflict on `auth_user_id`)
7. Supabase success → store returned `id`/`name`/`email` in localStorage, update IDB with Supabase ID
8. Supabase fail → "Saved locally. Sync to cloud when online." warning
9. Clear scratch pad, store new original values, clear dirty

**Testable Assertions (Save):**
- [ ] Save with valid data → "Profile saved" success toast
- [ ] IDB save fails → "Failed to save locally" error, no Supabase attempt
- [ ] No auth session → "Saved locally. Sign in to sync to cloud." warning
- [ ] Supabase success → localStorage updated with Supabase-returned user ID
- [ ] Supabase fail (offline) → warning toast, local save preserved
- [ ] After save → dirty cleared, scratch pad cleared, original values updated

**User Flow: Refresh from Cloud**
1. Click "Refresh from Cloud"
2. Offline → warning toast, abort
3. No auth → error toast, abort
4. Query `user_profiles` by `auth_user_id`
5. No profile found → warning toast
6. Profile found → populate form, store user info in localStorage
7. Set dirty = true (user must click Save to commit to IDB)

**Testable Assertions (Cloud Refresh):**
- [ ] Offline → "You are offline" warning
- [ ] Not signed in → "Not signed in" error
- [ ] Success → form populated, dirty set (must save to keep)
- [ ] "Refreshed from cloud. Press Save to keep changes." success toast

**PWA Refresh (`refreshApp()` / `executeRefresh()`):**
- [ ] Click Refresh App → modal with instructions (3 steps)
- [ ] Confirm → delete all caches → unregister service workers → redirect with cache-busting `?refresh=timestamp`
- [ ] Cancel → modal closes
- [ ] Error during refresh → error toast with fallback suggestion
- [ ] Order matters: caches deleted BEFORE SW unregistration

**Nuclear Reset (`resetAllData()`):**
- [ ] Click Reset → `confirm()` dialog with warning
- [ ] Cancel → no action
- [ ] Confirm → clear localStorage → clear sessionStorage → delete IDB `fieldvoice-pro` → delete all caches → unregister SWs → redirect to `index.html`
- [ ] Button shows "Resetting..." spinner during operation
- [ ] Even if some steps fail → still redirects

---

### 6.2 Report Archives (archives.html + js/archives/main.js)

**User Flow: View Archives**
1. Page loads → check online status
2. Offline → try `loadFromCache()` (IDB cached archives) → if no cache, show offline warning
3. Online → `loadProjects()` from Supabase (filtered by `org_id`) → populate project filter dropdown
4. `loadReports()` from Supabase `reports` table (status=submitted, ordered by date desc)
5. Map reports with project name join
6. Render report cards + recent section (last 24 hours)
7. Cache projects + reports to IDB for offline use

**Testable Assertions (Archives Load):**
- [ ] Loading state → spinner shown
- [ ] Online + reports found → cards rendered, loading hidden
- [ ] Online + no reports → "No submitted reports found" empty state
- [ ] Online + query error → error state with "Try Again" button
- [ ] Offline + cached data → cards rendered + "Showing cached data" warning
- [ ] Offline + no cache → offline warning, no cards
- [ ] Going online after offline → `init()` re-triggers, fresh data loaded
- [ ] **🔴 Known Issue:** archives.html does not load `pwa-utils.js` — no SW registration, no offline banner, no update detection

**Project Filter:**
- [ ] Dropdown populated with active projects from Supabase
- [ ] "All Projects" selected by default
- [ ] Select specific project → `loadReports(projectId)` re-queries with filter
- [ ] Filtered view shows only that project's reports

**Recent Reports Section:**
- [ ] Reports submitted in last 24 hours → shown in green-bordered "Recently Submitted" section
- [ ] Max 5 recent reports, sorted by submittedAt descending
- [ ] No recent reports → section hidden

**Report Cards:**
- [ ] Each card shows: project name, report date (long format with weekday), submitted datetime
- [ ] PDF available → green "PDF Ready" badge
- [ ] No PDF → gray "No PDF" badge
- [ ] Click card → `viewPdf(reportId)`

**PDF Viewing:**
- [ ] Report with PDF URL → opens in new tab (`window.open`)
- [ ] Report without PDF → alert "PDF not available"
- [ ] **🟡 Known Issue:** PDF URL is a 1-hour signed URL from submit — expires, making all historical links broken

**Offline Caching:**
- [ ] `cacheArchiveData()` saves to IDB via `idb.saveCachedArchive()` (fire-and-forget)
- [ ] `loadFromCache()` restores projects + reports from IDB
- [ ] Cache failure silently caught

**Known Issues:**
- [ ] **🟡** No pagination — loads ALL submitted reports unbounded
- [ ] **🟡** PDF signed URLs expire after 1 hour
- [ ] **🔴** No `pwa-utils.js` loaded — missing offline banner, SW, update detection

---

### 6.3 Login / Authentication (login.html + js/login/main.js)

**Three Views:**
1. **Sign In** — email + password
2. **Sign Up** — name*, title, company, email*, phone, org code*, password*, confirm*
3. **Role Picker** — Inspector (active) or Admin (coming soon)

**Auto-Redirect:**
- [ ] Already authenticated (existing session) → immediate redirect to `index.html`
- [ ] Enter key in sign-in view → triggers `handleSignIn()`
- [ ] Enter key in sign-up view → triggers `handleSignUp()`

**User Flow: Sign In**
1. Enter email + password → click "Sign In"
2. Empty fields → error "Please enter both email and password"
3. Button disabled + spinner during auth
4. `supabaseClient.auth.signInWithPassword()`
5. Auth error → error message shown (e.g., "Invalid login credentials")
6. Auth success → check `user_profiles` for existing role

**Sign In — Existing User (Has Role):**
- [ ] Profile with role → store role, user_id, name, email, auth_user_id, org_id in localStorage
- [ ] Update `device_id` + `device_info` on `user_profiles` (fire-and-forget)
- [ ] Upsert to `user_devices` table (Sprint 13 multi-device)
- [ ] Redirect to `index.html`

**Sign In — New User (No Role):**
- [ ] No role in profile → show role picker view
- [ ] Welcome message shows display name

**User Flow: Sign Up**
1. Fill all required fields → click "Create Account"
2. Validation chain:
   - Name required
   - Email required
   - Org code required
   - Password ≥ 6 chars
   - Passwords must match

**Testable Assertions (Sign Up Validation):**
- [ ] Missing name → "Full name is required"
- [ ] Missing email → "Email is required"
- [ ] Missing org code → "Organization code is required"
- [ ] Short password → "Password must be at least 6 characters"
- [ ] Passwords don't match → "Passwords do not match"

**Sign Up — Organization Validation:**
- [ ] Query `organizations` table by `slug` (lowercased org code)
- [ ] Org not found → "Organization not found. Check your code and try again."
- [ ] Org lookup error → "Could not verify organization"
- [ ] Org valid → proceed with `supabaseClient.auth.signUp()`

**Sign Up — Account Creation:**
- [ ] Supabase auth signUp with `options.data` metadata (name, title, company)
- [ ] Create `user_profiles` row with org_id, device_id, device_info
- [ ] Profile creation failure → non-blocking (auth succeeded)
- [ ] Store user_id, name, email, auth_user_id, org_id in localStorage
- [ ] Upsert to `user_devices` table
- [ ] Show role picker

**User Flow: Role Selection**
- [ ] Click "Inspector" → store role in localStorage + update `user_profiles.role` → redirect to `index.html`
- [ ] Click "Admin" → "Coming Soon" modal, no navigation
- [ ] "Got It" button closes admin modal
- [ ] Supabase role update failure → non-blocking warning

**Known Issues:**
- [ ] **🔴** login.html does not load `pwa-utils.js` — no SW registration, no offline banner

---

### 6.4 Permissions Setup (permissions.html + js/permissions/main.js)

**Two Modes:**
1. **Sequential Flow** — Welcome → Mic → Cam → GPS → Summary (with stepper)
2. **Manual Mode** — All three permissions as individual cards

**Device Detection:**
- `isIOS`, `isSafari`, `isIOSSafari`, `isChrome`, `isFirefox`, `isMobile`, `isAndroid`
- `isSecureContext`, `hasMediaDevices`

**Sequential Permission Flow:**
1. Welcome screen → "Begin Setup" or "Skip to Manual"
2. Each permission screen: Pre-prompt info → Request button → Loading → Success/Error
3. Auto-proceeds to next after 1.5s on success
4. Stepper UI shows progress (completed/active/pending/failed/skipped)

**Testable Assertions (Microphone):**
- [ ] Click "Enable Microphone" → checks Permissions API state → requests `getUserMedia({ audio: true })`
- [ ] Not HTTPS → error "HTTPS required"
- [ ] No MediaDevices API → error "MediaDevices API not supported"
- [ ] Permission granted → stores `MIC_GRANTED=true` + timestamp in localStorage → green success → auto-proceeds
- [ ] Permission denied → error with fix instructions (browser-specific)
- [ ] Stream tracks stopped immediately after grant (cleanup)
- [ ] Loading text adapts: "Waiting for permission" (prompt), "Verifying" (already granted), "Checking" (already denied)

**Testable Assertions (Camera):**
- [ ] Requests `getUserMedia({ video: { facingMode: 'environment' } })` — rear camera preferred
- [ ] Permission granted → stores `CAM_GRANTED=true` → success → auto-proceeds
- [ ] Permission denied → error with fix instructions

**Testable Assertions (Location):**
- [ ] Requests `getCurrentPosition()` with high accuracy, 15s timeout
- [ ] Permission granted → shows coordinates, caches location → success → auto-proceeds
- [ ] PERMISSION_DENIED → GEO_001 error
- [ ] POSITION_UNAVAILABLE → GEO_002 error
- [ ] TIMEOUT → GEO_003 error

**Skip Behavior:**
- [ ] "Skip" button on any permission → marks as `skipped`, proceeds to next
- [ ] Skipped permissions shown with forward icon in stepper

**Summary Screen:**
- [ ] All 3 granted → "All Systems Ready!" + green header
- [ ] 2 granted → "Partial Setup Complete" + warning header
- [ ] 0–1 granted → "Limited Functionality" + warning triangle
- [ ] Denied permissions → "Retry Failed" button visible
- [ ] Retry → restarts from first failed permission

**Manual Mode:**
- [ ] 3 permission cards (mic/cam/loc) with Enable button + status
- [ ] Checks existing localStorage permissions on entry
- [ ] Enable → same request flow → card updates (green border = granted, red = denied)
- [ ] Summary bar updates live: "All Systems Ready" / "X/3 Permissions" / "Setup Required"

**Finish Setup:**
- [ ] Click "Go to Dashboard" → stores `ONBOARDED=true` in localStorage → redirect to `index.html`

**Reset Helpers:**
- [ ] "Clear saved states" → removes all permission localStorage keys → resets in-memory state
- [ ] Alert explaining need to also reset browser permissions

**Debug Panel:**
- [ ] Expandable debug console at bottom
- [ ] Logs all permission actions with timestamps
- [ ] Copy log → clipboard
- [ ] Clear log

**Error Code Mapping (7 media errors + 3 geo errors):**
- [ ] `NotAllowedError` → ERR_001
- [ ] `NotFoundError` → ERR_002
- [ ] `NotReadableError` → ERR_003 (device in use)
- [ ] `OverconstrainedError` → ERR_004
- [ ] `AbortError` → ERR_005
- [ ] `SecurityError` → ERR_006
- [ ] `TypeError` → ERR_007
- [ ] Geo code 1 → GEO_001 (denied)
- [ ] Geo code 2 → GEO_002 (unavailable)
- [ ] Geo code 3 → GEO_003 (timeout)

---

### 6.5 Permission Debug (permission-debug.html + js/permission-debug/main.js)

**Purpose:** Diagnostic page for troubleshooting permission issues on various devices/browsers.

**Environment Detection (`detectEnvironment()`):**
- [ ] Detects: secure context, standalone/PWA mode, display mode, MediaDevices API, geolocation, SpeechRecognition, Permissions API
- [ ] iOS version extraction from user agent
- [ ] Chrome/Safari/Firefox/Edge detection
- [ ] Critical checks: HTTPS required, standalone PWA mode blocks getUserMedia on iOS

**Diagnostic Checks:**
- [ ] Secure context check → CRITICAL if false
- [ ] Standalone mode → CRITICAL if true on iOS (getUserMedia blocked in PWA)
- [ ] Browser + platform detection displayed
- [ ] API availability matrix (MediaDevices, Geolocation, SpeechRecognition, Permissions API)

**Raw Console:**
- [ ] All diagnostic actions logged with timestamps
- [ ] Copy console → clipboard
- [ ] Clear console

---

### 6.6 Landing Page (landing.html + js/landing/main.js)

**Purpose:** Marketing/demo page for FieldVoice Pro — no auth required.

**Interactive Demos:**
- [ ] Voice recording simulation: click mic → typing animation of sample field report text → stop
- [ ] Weather sync demo: click "Sync Weather Data" → animated weather data items appear sequentially (GPS, temp, condition, wind, humidity) → timestamp shown
- [ ] Report mode toggle: Quick Notes vs Full Mode — toggles section opacity/badges

**Page Interactions:**
- [ ] FAQ accordion: click question → expands answer, closes others
- [ ] Scroll reveal animations: elements fade in as user scrolls past 150px threshold
- [ ] Smooth scrolling for anchor links (`#section-id`)

**Testable Assertions (Demos):**
- [ ] Mic button click → `recording` class added, icon changes to stop, wave animation shown, text types out at ~40ms/char
- [ ] Mic click again (or text completes) → recording stops, icon resets
- [ ] Weather sync → button disabled during animation, re-enabled after 2.5s
- [ ] Quick mode → "Full Mode" sections get opacity-50 + lock icon
- [ ] Full mode → sections restored + voice input badges

---

### 6.7 Other Pages Integration Tests

**Settings → Report Round-Trip:**
- [ ] Set inspector name/title/company in settings → save → create report → signature shows saved values

**Auth Flow (E2E):**
- [ ] Fresh device → login.html → sign up with org code → role picker → Inspector → dashboard
- [ ] Sign out from settings → redirected to login.html → sign back in → skips role picker (role saved)
- [ ] Sign up with invalid org code → error, no account created

**Permissions → Interview:**
- [ ] Complete permissions setup → go to interview → mic/cam/GPS all functional
- [ ] Skip mic permission → interview → voice recording unavailable
- [ ] Skip GPS → interview → weather auto-sync may fail (no cached location)

**Archives PDF Lifecycle:**
- [ ] Submit report → immediately open archives → PDF link works (within 1-hour window)
- [ ] Wait >1 hour → PDF link broken (signed URL expired) — **🟡 known critical UX issue**

**Nuclear Reset:**
- [ ] Reset all data → page reloads → login required → no projects, no drafts, no settings
- [ ] After reset: IDB deleted, localStorage cleared, caches deleted, SWs unregistered

---

## 7. Field Tools (Part 1 of 2)

> **Files (this part):** ar-measure.js (507), calc.js (568), compass.js (199), decibel.js (265), flashlight.js (246), level.js (352), maps.js (528)
> **Total (this part):** ~2,665 lines across 7 files
> **Part 2 (next heartbeat):** measure.js, photo-markup.js, photo-measure.js, qrscanner.js, scan-viewer.js, slope.js, timer.js
> **Role:** Standalone field utility tools accessible from the dashboard tool panel — AR measurement, construction calculator, compass, decibel meter, flashlight, bubble level/inclinometer, and 9-tab map overlay

---

### 7.1 AR Measure (ar-measure.js)

**Technology:** WebXR (immersive-ar + hit-test) + Three.js (lazy-loaded CDN) + native Capacitor ARKit plugin fallback

**User Flow: Open AR Measure**
1. `openARMeasure()` → show overlay, hide emergency strip
2. Try native Capacitor ARKit plugin first (iOS native app)
3. If Capacitor available → `ARMeasure.startMeasurement()` → result with distance + unit → auto-log
4. If not native → lazy-load Three.js from CDN if not already loaded
5. Load saved measurement log from sessionStorage
6. `startARSession()` → request WebXR `immersive-ar` with `hit-test` feature
7. If AR fails → `renderARFallback()` with "Use Map Measure Instead" button

**Testable Assertions (AR Session):**
- [ ] Capacitor native platform → uses ARKit plugin, no Three.js loaded
- [ ] Three.js not loaded → dynamically loads from CDN, then proceeds
- [ ] Three.js CDN load fails → toast "AR unavailable — library load failed"
- [ ] WebXR not supported (iOS Safari) → fallback screen with map measure button
- [ ] WebXR supported → canvas rendered, reticle appears on detected surfaces
- [ ] AR overlay hides emergency strip/panel when open

**AR Measurement Flow:**
- [ ] Tap with reticle visible → places orange dot at hit-test position
- [ ] First point placed → instruction "Tap to place second point"
- [ ] Second point → orange line drawn, distance calculated in meters
- [ ] Distance displayed as ft/in + meters (floating label + bottom bar)
- [ ] Third tap → clears previous points, starts fresh
- [ ] `metersToFeetInches()` correctly converts (12in = 1ft rollover handled)

**Measurement Log:**
- [ ] "Add to Log" button visible after measurement
- [ ] Click → prompt for description → entry added with timestamp
- [ ] Log persisted to sessionStorage (survives within session, not across)
- [ ] Log UI: collapsible section with count badge, reverse chronological
- [ ] "New Measurement" button → clears points, hides labels

**Cleanup:**
- [ ] `closeARMeasure()` → ends XR session, disposes Three.js objects (geometries, materials), restores emergency strip
- [ ] All Three.js objects properly disposed (no memory leaks)

---

### 7.2 Construction Calculator (calc.js)

**Three Tabs:** Feet-Inch | Area/Volume | Converter

**Feet-Inch Tab:**
- [ ] Two modes: "Feet-Inches → Decimal" and "Decimal Feet → Feet-Inches"
- [ ] Mode toggle via styled buttons (blue highlight on active)
- [ ] Ft-In → Decimal: inputs for feet, inches, fraction (1/16 increments dropdown)
- [ ] Result shows decimal feet (4 decimal places) + secondary: decimal inches, meters, centimeters
- [ ] Decimal → Ft-In: single input → result shows feet-inches with nearest fraction (to 1/16")
- [ ] `parseFraction("3/8")` → 0.375
- [ ] `toNearestFraction(0.5)` → "1/2" (reduces 8/16)
- [ ] All-zero input → shows "--" placeholder
- [ ] Clear button resets all inputs and results

**Area/Volume Tab:**
- [ ] Two modes: Area (L×W) and Volume (L×W×D)
- [ ] Dimension inputs: feet + inches per dimension
- [ ] `getDimValue('avLength')` combines feet + inches/12
- [ ] Area result: sq ft + sq yd + acres + sq meters
- [ ] Volume result: cu ft + cu yd + cu meters
- [ ] Concrete Calculator (volume mode only): L×W × depth(inches) → cubic yards
- [ ] 10% waste factor checkbox (checked by default)
- [ ] Order quantity rounded to nearest ½ yard
- [ ] `numberFmt()`: <10 → 2dp, <1000 → 1dp, ≥1000 → comma-separated integer

**Converter Tab:**
- [ ] 8 conversion pairs as 2×4 grid buttons: ft↔m, in↔mm, sq ft↔sq m, cu yd↔cu m, lb↔kg, PSI↔MPa, gal↔L, °F↔°C
- [ ] No pair selected → "Tap a conversion above" prompt
- [ ] Select pair → input card appears with swap button
- [ ] Swap button reverses direction, preserves input value
- [ ] Temperature: °F→°C = (F-32)×5/9, °C→°F = C×9/5+32
- [ ] `formatConvResult()`: very small → exponential, <1 → 4dp, <100 → 3dp, <10000 → 2dp, ≥10000 → localized integer
- [ ] Clear button resets input + result

**General:**
- [ ] All calculations offline, no network required
- [ ] `openCalc()` / `closeCalc()` toggle overlay visibility
- [ ] Tab switching re-renders full content

---

### 7.3 Compass (compass.js)

**Technology:** DeviceOrientationEvent (iOS `webkitCompassHeading` / Android `alpha`)

**User Flow:**
1. `openCompass()` → show overlay
2. iOS 13+ → show permission prompt for DeviceOrientationEvent
3. Permission granted → `startCompass()` → build compass UI → attach listener
4. Permission denied → error with Settings instructions

**Testable Assertions:**
- [ ] iOS 13+ with `requestPermission` → permission prompt shown before compass starts
- [ ] Permission granted → compass rose renders (280×280px)
- [ ] No sensor data after 5s → "Orientation sensor not available" fallback
- [ ] Heading updates → rose rotates by `-heading` degrees (CSS transform)
- [ ] Cardinal labels counter-rotate to stay upright (N/S use translateX, E/W use translateY)
- [ ] `getCardinalDirection(45)` → "NE", `getCardinalDirection(0)` → "N", `getCardinalDirection(180)` → "S"
- [ ] 16-point cardinal directions (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW)
- [ ] Heading readout: large degree display + cardinal text below
- [ ] Close → removes event listener, clears sensor timeout

---

### 7.4 Decibel Meter (decibel.js)

**Technology:** getUserMedia (audio) + AudioContext + AnalyserNode + Float32Array RMS

**User Flow:**
1. `openDecibel()` → show overlay → render UI
2. Click "Start Monitoring" → `getUserMedia({ audio: true })`
3. Mic denied → error screen with "Try Again" button
4. Mic granted → create AudioContext, AnalyserNode (fftSize=2048, smoothing=0.3)
5. `monitorDecibel()` loop via requestAnimationFrame (throttled to ~20fps)
6. RMS calculation → approximate dB SPL: `20 * log10(rms) + 94`
7. Clamped to 30–130 dB range

**Testable Assertions:**
- [ ] Start → button changes to "Stop Monitoring"
- [ ] Stop → button changes back to "Start Monitoring"
- [ ] Mic denied → error screen with microphone-slash icon
- [ ] iOS AudioContext suspended → `.resume()` called
- [ ] dB < 70 → green "Safe" + green bar
- [ ] dB 70–84 → yellow "Moderate"
- [ ] dB 85–99 → orange "Loud"
- [ ] dB ≥ 100 → red "Dangerous — Hearing Protection Required"
- [ ] OSHA reference line at 85dB (65.4% of bar width)
- [ ] Stats tracked: min, max, avg (running)
- [ ] Reset button → stats cleared to "--"
- [ ] `stopDecibel()` → disconnects source, closes AudioContext, stops stream tracks
- [ ] Disclaimer: "Measurements are approximate — uncalibrated mic"

---

### 7.5 Flashlight (flashlight.js)

**Technology:** MediaDevices torch constraint (rear camera flash) + screen-white fallback

**Modes:** Steady | SOS | Strobe

**Testable Assertions (Steady):**
- [ ] Tap power button → `initTorch()` → `getUserMedia({ video: { facingMode: 'environment' } })`
- [ ] Camera grants torch capability → `track.applyConstraints({ advanced: [{ torch: true }] })`
- [ ] No torch capability → screen turns white (fallback)
- [ ] Status shows "Torch ON" or "Screen Light ON"
- [ ] Power button: off=gray, on=yellow with shadow
- [ ] Tap again → torch off, visual reset

**Testable Assertions (SOS):**
- [ ] SOS pattern: 3 short (200ms), 3 long (600ms), 3 short (200ms) + pause (1400ms) → loops
- [ ] SOS button turns red when active
- [ ] Tap SOS again → stops all modes

**Testable Assertions (Strobe):**
- [ ] Strobe toggles torch on/off at configurable speed
- [ ] Speed slider: 50ms (fast) to 500ms (slow)
- [ ] Changing slider speed → restarts strobe interval
- [ ] Seizure warning shown for 4s on strobe activation (fades out)
- [ ] Strobe button turns yellow when active

**Cleanup:**
- [ ] `closeFlashlight()` → stops all modes, turns off torch, stops stream tracks
- [ ] `stopAllFlashModes()` → clears both SOS timeout and strobe interval

---

### 7.6 Level / Inclinometer (level.js)

**Technology:** DeviceOrientationEvent (beta/gamma) with 5-reading moving average

**Two Modes:** Bubble Level | Inclinometer

**Bubble Level:**
- [ ] 260×260px circular area with crosshairs and center circle
- [ ] Green bubble (40×40px) moves based on device tilt
- [ ] Tilt clamped to ±15° → mapped to ±100px offset
- [ ] `abs(gamma) < 1 && abs(beta) < 1` → green "LEVEL"
- [ ] Otherwise → blue bubble, yellow "TILTED" status
- [ ] X-axis (gamma) and Y-axis (beta) readouts in degrees

**Inclinometer:**
- [ ] SVG semicircular gauge (0–45°) with tick marks at 0, 5, 10, 15, 20, 30, 45°
- [ ] Needle sweeps from left proportional to angle
- [ ] Grade percentage: `tan(angle) * 100`
- [ ] Color coding: ≤2° green, ≤5° yellow, ≤15° orange, >15° red
- [ ] Lock button → freezes reading at current angle
- [ ] Locked → button shows "Locked — Tap to Unlock" (orange)
- [ ] Unlock → resumes live updates

**General:**
- [ ] iOS permission required (same pattern as compass)
- [ ] Permission denied → error with Settings instructions
- [ ] Moving average buffer (5 readings) smooths jitter
- [ ] Mode toggle switches views without re-creating DOM (visibility toggle)
- [ ] Close → removes listener, stops updates

---

### 7.7 Maps Overlay (maps.js)

**Technology:** Leaflet.js (CDN) + various tile/WMS providers + iframe embeds

**9 Map Types:**
1. Weather Radar (Windy.com iframe)
2. Drone Airspace (FAA ArcGIS iframe, CSS dark-mode filter)
3. Satellite (Leaflet + Esri World Imagery tiles)
4. Topographic (Leaflet + USGS National Map tiles)
5. Soils (Leaflet + Esri base + USDA WMS overlay)
6. Flood Zones (Leaflet + CARTO base + FEMA NFHL REST export)
7. Parcels (Leaflet + Esri base + external viewer link)
8. Historical (Leaflet + Esri Wayback imagery with date pills)
9. Traffic (Google Maps iframe, CSS dark-mode filter)

**Testable Assertions (General):**
- [ ] `openMapsOverlay()` → overlay shown, defaults to weather radar tab
- [ ] Tab pills in scrollable row, active tab highlighted white
- [ ] Switching tabs → destroys previous Leaflet map, creates new one
- [ ] GPS position fetched fresh via `getFreshLocation()` for each map
- [ ] No GPS → defaults to center of US (39.8283, -98.5795)
- [ ] Loading spinner shown until map/iframe loads
- [ ] Blue user marker placed on all Leaflet maps
- [ ] `closeMapsOverlay()` → destroys map, clears container, restores emergency strip

**Iframe Maps (Weather, Airspace, Traffic):**
- [ ] Weather: Windy.com embed with radar overlay, centered on GPS
- [ ] Airspace: FAA iframe with dark-mode CSS filter + 15s timeout fallback → OpenSky/Aloft links
- [ ] Traffic: Google Maps iframe with traffic layer + 10s timeout fallback

**Leaflet Maps (Satellite, Topo, Soils, Flood, Parcels, Historical):**
- [ ] Satellite: Esri World Imagery, zoom 15
- [ ] Topo: USGS topo tiles, zoom 14 + tile error fallback (>5 errors → "View in USGS TopoView" button)
- [ ] Soils: Esri base + USDA WMS overlay (0.6 opacity) + error fallback (>3 → "View Soils in Browser")
- [ ] Flood: CARTO base + FEMA REST export tiles (custom `getTileUrl`) + error fallback (>5 → FEMA portal link)
- [ ] Parcels: Esri base + floating "Open Parcel Viewer" button → Google Maps
- [ ] Historical: Esri current imagery + Wayback config from S3 → date pills for each year → select year → swaps tile URL

**Historical Wayback:**
- [ ] Config fetched from S3 JSON → unique years extracted → pills rendered (newest first)
- [ ] "Current" pill (white, active by default)
- [ ] Click year pill → tile layer URL swapped to Wayback URL for that year
- [ ] Active pill styling: white bg, dark text, bold
- [ ] Config fetch fails → fallback button to Wayback viewer

**Tile Error Fallback Pattern:**
- [ ] `setupTileErrorFallback()` counts errors → >5 → removes tile layer, shows fallback button
- [ ] Fallback button opens external viewer in new tab

---

## 8. Field Tools (Part 2 of 2)

> **Files (this part):** measure.js (201), photo-markup.js (590), photo-measure.js (392), qrscanner.js (289), scan-viewer.js (526), slope.js (244), timer.js (318)
> **Total (this part):** ~2,560 lines across 7 files
> **Role:** Map distance/area measurement, photo markup with metadata, photo-based measurement with calibration, QR scanner, 3D scan viewer with measurement, slope/grade calculator, and stopwatch/countdown timer

---

### 8.1 Distance Measure (measure.js)

**Technology:** Leaflet.js + GPS (getFreshLocation) + Esri satellite tiles

**User Flow:**
1. `openMeasure()` → show overlay, get fresh GPS
2. Leaflet map created at zoom 17 on Esri satellite imagery
3. Blue user location marker placed
4. Tap map → `addMeasurePoint()` adds numbered orange pin
5. 2+ points → dashed orange polyline drawn between all points
6. 3+ points → semi-transparent orange polygon fill added
7. Segment distances shown as floating labels at midpoints

**Testable Assertions:**
- [ ] First tap → pin "1" placed, no line yet, status "Tap map to place pins"
- [ ] Second tap → pin "2" placed, dashed polyline connecting 1→2, distance label at midpoint
- [ ] Distance label: <1000ft → "X ft", ≥1000ft → "X.XX mi"
- [ ] Total distance shown: sum of all segments in ft (or mi if ≥5280ft) + meters
- [ ] Third tap → polygon fill appears (0.15 opacity)
- [ ] Area calculation: Shoelace formula via equirectangular projection → sq ft or acres (≥43560 sq ft → acres)
- [ ] `calculatePolygonArea()` uses reference latitude cosine correction
- [ ] Clear button → removes all markers, polyline, polygon, labels; resets state
- [ ] Close → `map.remove()`, full state reset, emergency strip restored
- [ ] No GPS → map centers on US center (39.8283, -98.5795)

---

### 8.2 Photo Markup (photo-markup.js)

**Technology:** Canvas 2D overlay on captured photo image, touch + mouse events, Promise-based API

**Entry Point:** `openPhotoMarkup(imageDataUrl, metadata)` → returns `Promise<string|null>`

**User Flow:**
1. Called with base64 image + optional metadata (lat, lon, timestamp, heading)
2. If metadata missing → attempts async fetch: GPS via `getHighAccuracyGPS()` or `getFreshLocation()` or `navigator.geolocation`, heading via `DeviceOrientationEvent`
3. Full-screen overlay created with: top bar (X/Done), photo with canvas overlay, metadata strip, toolbar
4. Draw on photo with tools → Done → composited image returned
5. Discard → confirmation popup → resolve(null)

**Drawing Tools:**
- [ ] 5 tools: Freehand, Arrow, Circle, Rect, Text + Undo button
- [ ] Active tool highlighted (bg-white/20)
- [ ] Freehand: tracks touch/mouse points, draws path with lineCap/lineJoin round
- [ ] Arrow: line + filled triangular arrowhead (headLen = max(15, width*4))
- [ ] Circle: ellipse from drag start→end (center = midpoint, radii = half extents)
- [ ] Rect: rectangle from drag start→end (strokeStyle only, no fill)
- [ ] Text: tap → popup with text input → confirm → text label with black bg overlay
- [ ] Undo: pops last element from `_markupState.elements`, redraws all
- [ ] Shape preview while dragging (globalAlpha 0.7)
- [ ] Min drag distance for shapes: >5px (prevents accidental tiny shapes)

**Color & Width:**
- [ ] 5 colors: red (#ef4444), orange (#f97316), yellow (#eab308), white (#ffffff), blue (#3b82f6)
- [ ] Active color has ring-2 ring-white ring-offset
- [ ] White color button has border for visibility
- [ ] 3 widths: Thin (3), Med (6), Thick (10)
- [ ] Width scales to canvas native resolution via `_getScaledWidth()`

**Canvas Positioning:**
- [ ] Canvas positioned exactly over displayed image (getBoundingClientRect)
- [ ] Internal resolution = image naturalWidth × naturalHeight (high-res)
- [ ] Coordinate mapping: screen coords → canvas coords via scale factors
- [ ] Repositions on window resize

**Metadata Strip:**
- [ ] GPS formatted as "XX.XXXX°N, XX.XXXX°W"
- [ ] Timestamp formatted as "Mon DD, YYYY — H:MM AM/PM"
- [ ] Heading formatted as "Facing: XXX° NNE" (16-point cardinal)
- [ ] Missing GPS → "No GPS" (dimmed), updates if async fetch succeeds

**Composite Image (Save):**
- [ ] Creates temp canvas at full photo resolution
- [ ] Layers: photo → markup canvas → metadata strip (bottom, black/60% bg)
- [ ] Metadata strip height: max(50px, 5.5% of image height)
- [ ] Text centered in strip, monospace font
- [ ] Output as JPEG quality 0.9
- [ ] Saved to sessionStorage under `STORAGE_KEYS.MARKUP_PHOTO`
- [ ] Promise resolves with composite data URL

**Discard Flow:**
- [ ] X button → confirmation popup ("Discard markup?")
- [ ] Cancel → popup removed, continue editing
- [ ] Confirm Discard → overlay removed, Promise resolves with null

**Cleanup:**
- [ ] `_closeMarkupOverlay()` removes all event listeners (touch, mouse, resize)
- [ ] Removes overlay + any popup DOMs from body
- [ ] Resets all state properties

---

### 8.3 Photo Measure (photo-measure.js)

**Technology:** getUserMedia camera + Canvas 2D + reference-based calibration

**Workflow:**
1. Open → camera starts (environment-facing)
2. Select reference object type (credit card, dollar bill, hard hat, traffic cone, custom mm)
3. Snap photo → photo displayed on canvas
4. Tap two endpoints of reference object → calibrates pixels-per-mm
5. Tap any two points → measures real-world distance

**Reference Objects:**
- [ ] Credit Card: 85.6mm
- [ ] Dollar Bill: 156mm
- [ ] Hard Hat: 250mm
- [ ] Traffic Cone: 460mm
- [ ] Custom: user-entered mm value

**Testable Assertions (Camera):**
- [ ] Camera opens with `facingMode: { ideal: 'environment' }`
- [ ] Camera denied → toast "Camera access denied"
- [ ] Camera not ready (no videoWidth) → toast "Camera not ready yet"
- [ ] Snap → captures video frame to canvas as JPEG (0.92 quality)
- [ ] After snap → camera stream stopped, "Retake" button appears
- [ ] Retake → resets state, restarts camera

**Testable Assertions (Calibration):**
- [ ] Instruction updates through workflow: "Snap a photo first" → "Tap two ends of reference" → "Tap any two points to measure"
- [ ] First calibration tap → orange dot placed
- [ ] Second calibration tap → orange line + orange dots, pixelsPerMm calculated
- [ ] Calibration points too close (<8px apart) → toast "too close", points cleared
- [ ] Changing reference object after calibration → clears calibration, toast "Calibrate again"
- [ ] Custom value change after calibration → clears calibration

**Testable Assertions (Measurement):**
- [ ] First measure tap → blue dot placed
- [ ] Second measure tap → blue line + distance label at midpoint
- [ ] Distance format: `X ft Y.YY in (Z.ZZZ m)` via `formatPhotoMeasureResult(mm)`
- [ ] Result shown in bottom bar + toast
- [ ] Third tap → clears previous measurement, starts new pair
- [ ] Clear/Start Over → full reset + camera restart

---

### 8.4 QR Scanner (qrscanner.js)

**Technology:** getUserMedia (video) + jsQR library (CDN) + requestAnimationFrame scanning loop

**User Flow:**
1. `openQR()` → show overlay, load scan history from sessionStorage
2. Camera starts (environment facing)
3. `scanQRFrame()` loop: draw video to canvas → `jsQR()` on imageData
4. Code detected → green overlay, beep (1000Hz, 100ms), vibrate, show result

**Testable Assertions:**
- [ ] Camera denied → error screen with camera-slash icon + "Try Again" button
- [ ] Viewfinder overlay: 220×220px white-bordered rounded rect
- [ ] "Scanning..." status indicator at top
- [ ] QR detected → green polygon overlay on code corners
- [ ] Detection → AudioContext beep (1000Hz, 0.2 gain, 100ms) + vibrate(100)
- [ ] Status changes to "Code Found!" (green) for 3s, then resets
- [ ] Same code not re-triggered until 3s cooldown (lastResult reset)
- [ ] Result bar appears: shows data text + type (URL or Text)
- [ ] URL result → "Open Link" button (opens in new tab)
- [ ] Text result → "Copy" button → clipboard write → "Copied!" feedback
- [ ] Scan history stored in sessionStorage (`qrScanHistory`), max 50 entries
- [ ] History UI: collapsible list, shows up to 20 most recent, toggle chevron rotates
- [ ] Clear history → removes from sessionStorage + empties list
- [ ] Torch toggle: checks track capabilities for torch → toggle on/off, button color changes
- [ ] Close → stops scanning (cancelAnimationFrame), stops stream, turns off torch

---

### 8.5 3D Scan Viewer (scan-viewer.js)

**Technology:** Three.js + GLTFLoader + OrbitControls (all lazy-loaded from CDN) + Raycaster for measurement

**User Flow:**
1. Open → file input card shown ("Import a .glb or .gltf file")
2. Select file → lazy-load Three.js suite → setup scene → load GLTF model
3. Model displayed with orbit controls (rotate/zoom/pan)
4. Toggle measure mode → tap two points on model surface → 3D distance shown

**Testable Assertions (Loading):**
- [ ] Only .glb/.gltf accepted (filename check)
- [ ] Non-matching file → toast "Please choose a .glb or .gltf file"
- [ ] Three.js lazy-loaded: three.min.js → then GLTFLoader.js + OrbitControls.js
- [ ] Script dedup: checks existing `<script>` tags before adding new ones
- [ ] CDN load failure → "Could not load 3D model" toast
- [ ] Loading state: instruction text "Loading model..."
- [ ] Successful load → import card hidden, measure button enabled

**Testable Assertions (Scene Setup):**
- [ ] Scene background: dark slate (#0f172a)
- [ ] Camera: PerspectiveCamera (60° FOV), initial position (0, 1.2, 3.2)
- [ ] Lighting: HemisphereLight (intensity 1.15) + DirectionalLight (intensity 0.9)
- [ ] OrbitControls: damping 0.08, screen-space panning
- [ ] Renderer: WebGLRenderer with antialias, SRGBColorSpace output
- [ ] `fitScanViewerCameraToModel()`: auto-frames model based on bounding box + FOV
- [ ] Camera near/far planes adjusted to model size

**Testable Assertions (Measurement):**
- [ ] Measure button: toggles between "Measure" (slate) and "Measuring" (orange)
- [ ] Measure mode on → pointer up fires raycaster against all model meshes
- [ ] Small drag (>6px movement) → ignored (prevents accidental measurement during orbit)
- [ ] First tap hit → orange sphere marker (r=0.015) placed at intersection point
- [ ] Second tap hit → second marker + orange line + text sprite label at midpoint
- [ ] Distance format: ≥5280ft → mi, ≥1ft → ft (2dp), <1ft → mm (1dp)
- [ ] Text sprite: 256×96 canvas → CanvasTexture → SpriteMaterial
- [ ] Multiple measurements accumulate (counter in bottom info)
- [ ] "Clear" → removes all markers, lines, labels from scene + disposes geometry/materials
- [ ] Exiting measure mode → removes pending first-point marker

**Cleanup / Memory:**
- [ ] `scanViewerTeardownThree()`: cancels animation frame, removes event listeners, disposes controls, renderer, all meshes/materials/textures
- [ ] `scanViewerDisposeObject()` traverses model tree, disposes geometry + all map types (map, normalMap, roughnessMap, etc.)
- [ ] `URL.revokeObjectURL()` called for import blob URL
- [ ] `threeReady` flag persists across open/close (avoids re-downloading CDN)

---

### 8.6 Slope & Grade Calculator (slope.js)

**Technology:** Pure math — trigonometry (atan2, tan) + SVG diagram

**User Flow:**
1. Open → three input fields: Rise (ft), Run (ft), Slope (%)
2. Enter any two → third auto-calculates
3. Results panel + visual SVG triangle diagram update

**Testable Assertions (Calculation):**
- [ ] Rise=1, Run=12 → Grade = 8.33%, Degrees = 4.76°, Ratio = 1:12.0
- [ ] Grade=100%, Run=10 → Rise = 10ft, Degrees = 45°
- [ ] Rise=0, Run=10 → Grade = 0%, Degrees = 0°
- [ ] `calcSlopeFrom(source)` tracks which field user edited to avoid overwriting it
- [ ] Edit rise+run → auto-fills grade; edit rise+grade → auto-fills run; edit run+grade → auto-fills rise
- [ ] Division by zero protection: run=0 with grade → Infinity ratio displayed as "1:∞"

**Testable Assertions (Results):**
- [ ] ADA Compliant: ≤8.33% → green "Yes", >8.33% → red "No"
- [ ] Drainage Adequate: ≥1% → green "Yes", 0<grade<1% → yellow "Low", 0% → red "No"
- [ ] Rise per 100ft = grade% value
- [ ] Quick reference table: ADA max ramp (8.33%), typical sidewalk (2%), min drainage (1-2%), road crown (2%), max driveway (12-15%)

**SVG Diagram:**
- [ ] Triangle with grid lines, right-angle indicator, angle arc
- [ ] Hypotenuse colored orange (#ea580c)
- [ ] Degree label next to angle arc
- [ ] Rise/Run labels show actual input values with "ft" suffix
- [ ] Angle clamped to max 45° for visual
- [ ] Updates dynamically as inputs change

---

### 8.7 Timer / Stopwatch (timer.js)

**Two Modes:** Stopwatch (count up) | Countdown Timer

**Stopwatch:**
- [ ] Start → records `Date.now()`, interval updates display every 50ms
- [ ] Display format: HH:MM:SS.CC (centiseconds)
- [ ] Stop → accumulated elapsed stored, interval cleared
- [ ] Resume after stop → continues from accumulated time
- [ ] Lap → records (lap time, total time), prepends row to lap list
- [ ] Lap list: columns = Lap #, Lap Time, Total Time
- [ ] Lap rows inserted via `insertAdjacentHTML` (no full re-render while running)
- [ ] Reset → elapsed=0, laps=[], interval cleared
- [ ] Running: shows Stop + Lap buttons; Stopped: shows Start + Reset buttons

**Countdown Timer:**
- [ ] Input: Hours (0-23), Minutes (0-59), Seconds (0-59)
- [ ] Quick presets: 5m, 10m, 15m, 30m, 1h (fills input fields)
- [ ] Start with 0 total → does nothing (guard: `total <= 0`)
- [ ] Running → interval every 100ms, `tmRemaining = max(0, duration - elapsed)`
- [ ] Display format: HH:MM:SS (no centiseconds)
- [ ] Pause → stores remaining, clears interval
- [ ] Resume → treats remaining as new duration, restarts interval
- [ ] Cancel → stops + resets to input screen

**Timer Alarm (countdown reaches 0):**
- [ ] Audio: 500Hz square wave oscillator, gain 0.3, for 2 seconds
- [ ] Screen flash: alternates red/white every 300ms for 4 seconds
- [ ] Display text alternates red/white color
- [ ] Vibration: pattern [200, 100, 200, 100, 200]
- [ ] `stopTimerAlarm()` → stops oscillator, closes AudioContext, clears flash interval

**General:**
- [ ] `formatTime(ms, showMs)`: returns "HH:MM:SS" or "HH:MM:SS.CC"
- [ ] `pad2(n)`: single digit → "0X"
- [ ] Close → clears both stopwatch and timer intervals, stops any alarm
- [ ] Tab switching between modes preserves running state (intervals continue)

---

## 9. Shared Modules

> **Files:** ai-assistant.js (885), broadcast.js (35), cloud-photos.js (152), console-capture.js (105), data-store.js (785), delete-report.js (188), pull-to-refresh.js (128), realtime-sync.js (412), supabase-retry.js (52)
> **Total:** ~2,742 lines across 9 files
> **Role:** Cross-cutting infrastructure shared across all pages — AI chat assistant, cross-tab broadcast, cloud photo rehydration, console capture to Supabase, IndexedDB data store with cloud sync, cascading report deletion, pull-to-refresh gesture, Supabase Realtime subscriptions, and retry utility

---

### 9.1 AI Assistant (ai-assistant.js)

**Technology:** IIFE, n8n webhook, localStorage persistence, draggable floating button

**User Flow:**
1. Auto-injects floating button (bottom-right, z-index 90) on page load
2. Double-tap (touch) or double-click (desktop) → full-screen chat overlay
3. Type message → local command check → if not local, POST to n8n webhook
4. Response bubble rendered, conversation persisted to localStorage

**Testable Assertions (UI):**
- [ ] Floating button renders on DOM ready (56×56px navy circle with wand icon)
- [ ] Single tap → brief scale animation (1.15x), does NOT open overlay
- [ ] Double-tap within 350ms → opens overlay
- [ ] Desktop: double-click opens overlay
- [ ] Overlay: top bar (close/help), scrollable chat area, input bar with send button
- [ ] Close button → overlay hidden, floating button restored, emergency strip restored
- [ ] Enter key sends message (no shift+enter)
- [ ] Input focused 300ms after open

**Testable Assertions (Draggable Button):**
- [ ] Touch drag → button follows finger
- [ ] Drag >8px → registers as drag (not tap)
- [ ] Release after drag → snaps to nearest horizontal edge (left or right, 12px margin)
- [ ] Vertical clamped: top ≥12px, bottom ≥80px from viewport bottom
- [ ] Snap animation: 0.25s ease on left/top

**Testable Assertions (Local Commands — no API call):**
- [ ] "new chat" / "clear conversation" → conversation cleared, welcome rendered
- [ ] "help" / "what can you do" → full feature list bubble added
- [ ] "new report" / "start report" → redirect to quick-interview.html after 500ms
- [ ] "open settings" → redirect to settings.html
- [ ] "open archives" → redirect to archives.html
- [ ] "home" / "dashboard" → redirect to index.html
- [ ] Tool commands on dashboard: "open compass" → `closeAssistant()` then `openCompass()`
- [ ] Tool commands off dashboard: "open compass" → redirect to `index.html?openTool=compass`
- [ ] Map subcommands: "weather radar" → opens maps + switches to weather tab
- [ ] "send message to admin: running late" → handled (no local response → goes to webhook)
- [ ] Local commands return string (shown as assistant bubble) or empty string (handled internally)

**Testable Assertions (Webhook):**
- [ ] Input sanitized: control chars stripped, max 10,000 chars, trimmed
- [ ] Empty after sanitization → error thrown (no API call)
- [ ] Payload: { message, history (last 10), context: { currentPage, projectName, projectId, reportDate, deviceId, lat, lng } }
- [ ] 20s timeout via AbortController → "Request timed out" error
- [ ] Success → response extracted from `data.response || data.message || data.text`
- [ ] Error → "Sorry, I had trouble..." + online/offline hint
- [ ] API key sent in `X-API-Key` header

**Testable Assertions (Persistence):**
- [ ] Conversation stored in localStorage, keyed per user ID: `fvp_ai_conversation_{userId}`
- [ ] No user ID → key is `fvp_ai_conversation`
- [ ] Max 50 messages retained (oldest trimmed)
- [ ] Existing conversation rendered on overlay open

**GPS:**
- [ ] Cached GPS from `getCachedLocation()` or `navigator.geolocation`
- [ ] Low accuracy, 10s timeout, 5min max age
- [ ] GPS failure → nulls sent in context (non-blocking)

---

### 9.2 BroadcastChannel (broadcast.js)

**Technology:** BroadcastChannel API, channel name "fieldvoice-sync"

**Testable Assertions:**
- [ ] `fvpBroadcast.send(message)` → posts to "fieldvoice-sync" channel
- [ ] `fvpBroadcast.listen(handler)` → sets onmessage callback
- [ ] `fvpBroadcast.close()` → closes channel, nulls reference
- [ ] BroadcastChannel not supported → warns, all methods are no-ops
- [ ] Send/listen errors → caught and warned (no throw)
- [ ] Cross-tab: Tab A sends `{ type: 'report-deleted', id: 'xxx' }` → Tab B handler receives it

---

### 9.3 Cloud Photos (cloud-photos.js)

**Technology:** Supabase `photos` table + Storage signed URLs

**Testable Assertions:**
- [ ] `fetchCloudPhotos(reportId)` → queries photos table filtered by report_id, ordered by created_at
- [ ] SEC-04: Always generates fresh signed URL from `storage_path` (1hr expiry), ignores stale `photo_url`
- [ ] No `storage_path` → falls back to `photo_url` field
- [ ] Offline → returns empty array immediately
- [ ] No supabaseClient → returns empty array
- [ ] Photo object shape: { id, url, storagePath, caption, date, time, gps, timestamp, fileName, fileType }
- [ ] `taken_at` parsed to localized date/time strings, parse failure → "--"
- [ ] GPS: both lat+lng present → `{ lat, lng }`, otherwise null

**Batch:**
- [ ] `fetchCloudPhotosBatch(reportIds)` → `.in('report_id', reportIds)` query
- [ ] Returns `{ reportId: [photos] }` map
- [ ] Empty input → returns `{}`
- [ ] Each photo still gets fresh signed URL (same SEC-04 logic)

---

### 9.4 Console Capture (console-capture.js)

**Technology:** Overrides console.log/warn/error, ring buffer, Supabase `debug_logs` table

**Testable Assertions:**
- [ ] `console.log(...)` → original console.log still called + entry captured
- [ ] `console.warn(...)` → original console.warn still called + entry captured
- [ ] `console.error(...)` → original console.error still called + entry captured
- [ ] Capture format: `{ level, message, page, device_id, created_at }`
- [ ] `page` derived from `window.location.pathname` last segment
- [ ] `_serialize()`: strings joined by space, objects JSON.stringified, truncated to 2000 chars
- [ ] Ring buffer max 500 entries (oldest sliced off)
- [ ] Flush every 3s: inserts batch of 10 to Supabase `debug_logs`
- [ ] Flush on `pagehide` and `visibilitychange → hidden`
- [ ] Supabase unavailable → no flush (no error)
- [ ] Insert failure → batch put back on buffer (with 500 cap)
- [ ] `window.error` event → captured as `[UNCAUGHT] message at file:line`
- [ ] `unhandledrejection` → captured as `[UNHANDLED_PROMISE] reason`
- [ ] `debugCapture.flush()` → manual flush
- [ ] `debugCapture.clear()` → empties buffer
- [ ] `debugCapture.getBuffer()` → returns copy of current buffer

---

### 9.5 Data Store (data-store.js)

**Technology:** IndexedDB wrapper, DB name "fieldvoice-pro", version 7

**Object Stores (7):**
1. `projects` (keyPath: id)
2. `userProfile` (keyPath: deviceId)
3. `photos` (keyPath: id, indexes: reportId, syncStatus)
4. `currentReports` (keyPath: id, indexes: project_id, status)
5. `draftData` (keyPath: reportId)
6. `cachedArchives` (keyPath: key)
7. `reportData` (keyPath: reportId)

**Testable Assertions (Open/Init):**
- [ ] `dataStore.init()` → opens IDB + runs legacy migration
- [ ] Open timeout: 8000ms → rejects with "timed out" error
- [ ] Blocked event → closes existing handle, retries once after 500ms
- [ ] `_validateConnection()` → tries readonly transaction on projects, false if dead
- [ ] `onversionchange` → closes handle to allow other tab upgrades
- [ ] `onsuccess` after timeout already settled → closes leaked handle (critical safety)

**Testable Assertions (Legacy Migration):**
- [ ] Reads `fvp_current_reports` from localStorage → parses → writes to currentReports store
- [ ] Reads all `fvp_report_*` keys → writes to reportData store
- [ ] Sets `fvp_migration_v2_idb_data = 'true'` flag when done
- [ ] Cleans up old localStorage keys after migration
- [ ] Already migrated (flag = true) → skips entirely
- [ ] Migration failure → warns, doesn't block app

**Testable Assertions (CRUD):**
- [ ] `getReport(id)` → returns report with normalized date (report_date ↔ reportDate)
- [ ] `getAllReports()` → returns Map of id → report
- [ ] `saveReport(report)` → IDB put, returns true
- [ ] `deleteReport(id)` → IDB delete
- [ ] `replaceAllReports(map)` → clears store, puts all from map/object
- [ ] `getReportData(id)` → returns `row.data` (unwraps container)
- [ ] `saveReportData(id, data)` → wraps as `{ reportId, data }`
- [ ] Photos: `getPhotosByReportId(id)` uses reportId index
- [ ] `deletePhotosByReportId(id)` → cursor-based delete on index
- [ ] `getUserProfile(deviceId)` / `saveUserProfile(profile)`
- [ ] `getCachedArchive(key)` / `saveCachedArchive(key, data)` adds `savedAt` timestamp
- [ ] `clearStore(name)` → clears named store
- [ ] `reset()` / `closeAll()` → closes DB handle, nulls references

**Testable Assertions (Cloud Sync):**
- [ ] `syncReportsFromCloud()` → queries Supabase for user's non-deleted reports
- [ ] Cloud report not in local → added to IDB
- [ ] Both have report, cloud newer (by updated_at) → cloud fields merged into local
- [ ] Both have report, local same/newer → local kept
- [ ] Local-only report (not in cloud) → PRESERVED (offline-created) + fire-and-forget upsert to Supabase
- [ ] Deleted blocklist report → skipped (not added)
- [ ] `replaceAllReports()` called with reconciled set
- [ ] Returns `{ added, updated, removed, total }` counts
- [ ] No supabaseClient or no userId → returns zeros immediately

---

### 9.6 Delete Report (delete-report.js)

**Technology:** Supabase cascade deletion + IDB cleanup

**`deleteReportCascade(reportId)` — Full Supabase Cascade:**
- [ ] Step 1: Select photo storage_paths from photos table
- [ ] Step 2: Remove photo files from `report-photos` storage bucket
- [ ] Step 3: Delete child table rows: interview_backup, report_backup, ai_submissions, report_data
- [ ] Step 4: Look up PDF URL from reports.pdf_url, fallback to final_reports.pdf_url → remove from `report-pdfs` bucket
- [ ] Step 5: Delete final_reports row (legacy table)
- [ ] Step 6: Delete photos rows
- [ ] Step 7: Delete reports row (parent — LAST)
- [ ] Each step in try/catch → partial failures don't block remaining steps
- [ ] Returns `{ success: boolean, errors: string[] }`
- [ ] Uses `.maybeSingle()` on final_reports lookup (avoids 406 when no row)

**`deleteReportFull(reportId)` — Local + Cloud Delete:**
- [ ] Step 1: `addToDeletedBlocklist(reportId)` — FIRST to prevent resurrection
- [ ] Step 2: Clear active report pointer if matches
- [ ] Step 3: IDB cleanup via `Promise.allSettled` (non-blocking): deleteReport, deletePhotosByReportId, deleteDraftData, deleteReportData
- [ ] Step 4: Supabase soft-delete: `update({ status: 'deleted' })` on reports table
- [ ] Validates UUID length (36 chars) before Supabase call
- [ ] Broadcasts `{ type: 'report-deleted', id }` via fvpBroadcast
- [ ] Returns `{ success, errors }`

---

### 9.7 Pull-to-Refresh (pull-to-refresh.js)

**Technology:** Touch events for mobile, desktop refresh button for hover-capable devices

**Mobile (Touch):**
- [ ] `touchstart` at `scrollY === 0` → records startY, enables pulling
- [ ] `touchmove` pulling down → orange indicator bar grows (max THRESHOLD=80px)
- [ ] `touchend` with indicator ≥ 64px (80%) → spinner shown, flushes pending backups, reloads after 300ms
- [ ] `touchend` below threshold → indicator collapses
- [ ] Flushes: `flushInterviewBackup()`, `flushReportBackup()` before reload

**Desktop (hover-capable):**
- [ ] `matchMedia('(hover: hover)')` → injects fixed refresh button (top-right, 40×40px)
- [ ] Button click → flushes backups (debugCapture, drainPendingBackups, flushReportBackup) → `manualRefresh()` or `location.reload()`
- [ ] Hover animation: scale 1.1
- [ ] Button not duplicated if already exists

---

### 9.8 Realtime Sync (realtime-sync.js)

**Technology:** Supabase Realtime (postgres_changes) on reports + projects tables

**Initialization:**
- [ ] `initRealtimeSync()` → subscribes to `reports-sync` channel filtered by `user_id`
- [ ] Subscribes to `projects-sync` channel filtered by `org_id` (if orgId exists)
- [ ] Idempotent: removes existing channels before subscribing
- [ ] Guards: no supabase client, offline, no userId → returns immediately

**Report Change Handler (`_handleReportChange`):**
- [ ] INSERT/UPDATE: skip if report on deleted blocklist → log and return
- [ ] Cloud status='deleted' → local cleanup: blocklist + IDB delete (report, reportData, draftData, photos) + broadcast
- [ ] In-memory cache (`currentReportsCache`) updated immediately for dashboard accuracy
- [ ] SYN-02: Skip overwrites for actively-edited report (interview/report page with matching reportId URL param)
- [ ] Exception: status transition to 'refined' → fetch latest report_data from cloud → merge to IDB → redirect to report.html (interview) or reload (report)
- [ ] Refine redirect guarded by `_refineRedirectInProgress` flag (prevents double redirect)
- [ ] Dashboard dismissed → full re-render via `renderReportCards()`
- [ ] Normal update → `updateReportCardStatus()` or fallback `renderReportCards()`
- [ ] DELETE → blocklist + IDB cleanup + broadcast

**Project Change Handler:**
- [ ] Projects change → calls `dataLayer.refreshProjectsFromCloud()` if available

**Lifecycle:**
- [ ] `beforeunload` → `cleanupRealtimeSync()` (removes all channels)
- [ ] `online` → re-init subscriptions + flush pending backups + drain queue
- [ ] `offline` → cleanup (channels will error anyway)
- [ ] `visibilitychange → hidden` → cleanup; `→ visible` → re-init after 1s delay
- [ ] `pageshow` with `event.persisted` (bfcache) → re-init + drain

---

### 9.9 Supabase Retry (supabase-retry.js)

**Technology:** Async retry with exponential backoff

**Testable Assertions:**
- [ ] `supabaseRetry(fn, maxRetries=3, label)` → calls fn, returns result on success
- [ ] Supabase `{ data, error }` pattern: if `result.error` → throws (treated as failure)
- [ ] Retry delays: 1s, 2s, 4s (2^attempt × 1000ms)
- [ ] Total attempts: maxRetries + 1 (initial + retries)
- [ ] All fail → throws last error
- [ ] Success on retry → returns result, no further attempts
- [ ] Logging: warns on each retry attempt with delay and error message
- [ ] Final failure: console.error with total attempt count
- [ ] Exposed as `window.supabaseRetry`

---

## 10. Service Worker + PWA

> **Files:** sw.js (293), js/pwa-utils.js (140), manifest.json (118)
> **Total:** ~551 lines across 3 files
> **Role:** Offline support via service worker caching, PWA installation/update management, offline detection UI, and web app manifest for installability

---

### 10.1 Service Worker (sw.js)

**Cache:** `fieldvoice-pro-v6.9.31` (versioned, bumped on deploy)

**Static Assets Cached (STATIC_ASSETS):**
- [ ] 11 HTML pages (index, quick-interview, report, permissions, permission-debug, settings, landing, login, archives, project-config, projects)
- [ ] 9 core JS modules (config, storage-keys, indexeddb-utils, data-layer, supabase-utils, ui-utils, pwa-utils, report-rules, media-utils, auth)
- [ ] 9 shared modules (delete-report, ai-assistant, realtime-sync, broadcast, cloud-photos, console-capture, data-store, pull-to-refresh, supabase-retry)
- [ ] 11 dashboard modules (index/)
- [ ] 11 interview modules (interview/)
- [ ] 11 report modules (report/)
- [ ] 5 project-config modules
- [ ] 14 tool modules (tools/)
- [ ] 7 page modules (archives, permissions, etc.)
- [ ] 5 assets (manifest.json, 4 icons, output.css)

**CDN Assets Cached (CDN_ASSETS):**
- [ ] Font Awesome CSS + 3 woff2 font files
- [ ] Supabase JS SDK
- [ ] Leaflet CSS + JS
- [ ] jsQR
- [ ] html2canvas
- [ ] jsPDF

**Install Event:**
- [ ] `caches.open(CACHE_NAME)` → `cache.addAll(STATIC_ASSETS)` — failure warns but doesn't block
- [ ] CDN assets fetched individually with CORS mode — failure per-asset (non-blocking)
- [ ] `self.skipWaiting()` → activates immediately

**Activate Event:**
- [ ] Deletes all caches matching `fieldvoice-pro-*` except current `CACHE_NAME`
- [ ] `self.clients.claim()` → takes control of open tabs immediately

**Fetch Strategies (4 patterns):**

1. **Navigation requests** (`request.mode === 'navigate'`): Network-first
   - [ ] Success → cache response + return
   - [ ] Offline → try exact URL from cache → fallback to cached `./index.html` → 503 plain text

2. **JS files** (same-origin `.js`): Network-first with `cache: 'no-cache'`
   - [ ] Bypasses browser HTTP cache to ensure fresh code after deploy
   - [ ] Success → cache response + return
   - [ ] Offline → serve from SW cache → 503 as `application/javascript` comment

3. **API calls** (URL contains `api.open-meteo.com`, `n8n`, or `webhook`): Network-first
   - [ ] Success → pass through
   - [ ] Offline → JSON response: `{ error: true, offline: true, message: "...", timestamp }` with `X-Offline-Response: true` header

4. **Static assets** (CSS, images, fonts): Cache-first (stale-while-revalidate)
   - [ ] Cached → return immediately + update cache in background
   - [ ] Not cached → fetch from network → cache if ok → return
   - [ ] Both fail → 503 plain text

**Message Handler:**
- [ ] `{ type: 'SKIP_WAITING' }` → `self.skipWaiting()` (supports manual update trigger)
- [ ] `{ type: 'GET_VERSION' }` → responds with `{ version: CACHE_VERSION }` via MessageChannel

---

### 10.2 PWA Utilities (pwa-utils.js)

**`initPWA(options)`** — Main entry point:
- [ ] Calls `setupPWANavigation()`
- [ ] Calls `registerServiceWorker()` unless `options.skipServiceWorker`
- [ ] Calls `setupOfflineBanner(onOnline, onOffline)`

**PWA Navigation Fix:**
- [ ] Detects standalone mode via `navigator.standalone` (iOS) or `matchMedia('(display-mode: standalone)')` (Android/Chrome)
- [ ] In standalone → captures click events on internal `<a>` links
- [ ] Prevents default + uses `location.href` (prevents Safari breaking out of standalone)
- [ ] External links not intercepted

**Service Worker Registration:**
- [ ] Registered on `window.load` event
- [ ] Scope derived from current pathname directory (handles subdirectory deployments)
- [ ] Requests `navigator.storage.persist()` after registration (prevents Android data eviction)
- [ ] `updatefound` listener → watches installing worker state → if `installed` with existing controller → `showUpdateBanner()`

**Offline Banner:**
- [ ] `setupOfflineBanner()` → listens for online/offline events
- [ ] Offline → banner slides down (translateY 0), calls `onOffline` callback
- [ ] Online → banner slides up (translateY -100%), calls `onOnline` callback
- [ ] Initial check: if `!navigator.onLine` → show immediately
- [ ] `injectOfflineBanner(message)` → creates banner DOM if not exists (yellow, z-9999)
- [ ] Default message: "You are offline - Some features may be unavailable"
- [ ] No duplicate injection (checks for existing `#offline-banner`)

**Update Banner:**
- [ ] `showUpdateBanner()` → creates blue banner at top: "Update available — tap to refresh"
- [ ] Click → `location.reload()`
- [ ] No duplicate (checks for existing `#update-banner`)

---

### 10.3 Manifest (manifest.json)

**Testable Assertions:**
- [ ] `name`: "FieldVoice Pro", `short_name`: "FieldVoice"
- [ ] `display`: "standalone" (full-screen PWA experience)
- [ ] `orientation`: "portrait-primary"
- [ ] `start_url`: "./index.html"
- [ ] `background_color` + `theme_color`: "#0a1628" (dark navy)
- [ ] Icons: 8 sizes (72, 96, 128, 144, 152, 192, 384, 512) × 2 purposes (any + maskable) = 16 icon entries
- [ ] All icons relative paths (`./icons/...`)
- [ ] `categories`: business, productivity, utilities
- [ ] `prefer_related_applications`: false (prefer web app over native store)
- [ ] `scope`: "./" (same directory)
- [ ] `lang`: "en-US", `dir`: "ltr"

---
---

## 11. Prioritized Test Plan — Final Synthesis

> **Total assertions in this document:** 1,695
> **Sections audited:** 88 subsections across 10 chunks
> **Source files covered:** ~36,000 lines across 83 JS modules + 11 HTML pages + manifest
> **Cross-referenced with:** George's CODEBASE_REVIEW.md (8 🔴 BUGs, 40+ 🟡 ISSUEs, 30+ 🟠 MAYBEs)

---

### P0 — Critical Path Tests (Must Pass Before Any Release)

These tests cover the core revenue-generating workflow: Login → Create Report → Interview → AI Refine → Edit → Submit PDF. Failure here = app is broken.

| # | Test Name | Steps | Expected Result | Tool | Map Section |
|---|-----------|-------|-----------------|------|-------------|
| P0-01 | **Auth: Login → Dashboard** | 1. Open login.html 2. Enter valid Supabase credentials 3. Submit | Session stored, redirects to index.html, sign-out button appears on settings.html | Playwright | §1.3, §6.4 |
| P0-02 | **Auth: Session Persistence** | 1. Login 2. Close browser 3. Reopen index.html | Session restored from Supabase, no re-login required, `auth.ready` resolves | Playwright | §1.3 |
| P0-03 | **Auth: Expired Session** | 1. Login 2. Invalidate session (clear tokens) 3. Navigate | Warning toast shown (not forced redirect — protects unsaved work), session refresh attempted | Playwright | §1.3 |
| P0-04 | **Report Creation: Project Select → Interview** | 1. Dashboard → "Begin Daily Report" 2. Select project 3. Proceed | Report created in IDB + Supabase, navigates to quick-interview.html with reportId param, duplicate guard prevents second report for same project+date | Playwright | §2.3, §3.1 |
| P0-05 | **Interview: Freeform Voice Capture** | 1. On interview page, tap record 2. Speak 3. Stop | Audio recorded via MediaRecorder, transcribed via speech-to-text, text appears in freeform area, autosave fires within 2s | Maestro (mobile) | §3.4 |
| P0-06 | **Interview: Guided Section Entry** | 1. Switch to guided mode 2. Add entries to Weather, Work Performed, Issues 3. Add contractor work | Entries created with UUIDs, displayed in UI, persisted to IDB draftData + Supabase interview_backup | Playwright | §3.5, §3.6 |
| P0-07 | **Interview: Photo Capture + Markup** | 1. Tap photo capture 2. Take photo 3. Annotate with markup tools 4. Save | Photo compressed, GPS/timestamp stamped, markup composited, saved to IDB photos store, background upload to Supabase Storage | Maestro | §3.8, §8.2 |
| P0-08 | **Interview: Submit for AI Processing** | 1. Complete interview 2. Tap "Done — Generate Report" 3. Wait for processing | Processing overlay shown, payload sent to n8n webhook with supabaseRetry, status transitions draft→pending_refine→refined, navigates to report.html | Playwright | §3.9 |
| P0-09 | **Report Editor: Load Refined Content** | 1. Navigate to report.html?reportId=X 2. Wait for load | AI-generated content loaded from IDB (or cloud fallback), all 10 sections populated, user edits overlay preserved, status icons reflect completeness | Playwright | §4.1 |
| P0-10 | **Report Editor: Edit + Autosave** | 1. Edit any section field 2. Wait 500ms | Debounced autosave fires, data persisted to IDB reportData + Supabase report_data, "Saved" indicator updates, user edits tracked in `userEdits` object | Playwright | §4.4 |
| P0-11 | **Report Editor: AI Re-Refine** | 1. On report page, tap "AI Refine" 2. Wait | New n8n payload sent with user edits context, processing overlay shown, refined content merged back preserving user edits marked as `pinned` | Playwright | §4.5 |
| P0-12 | **Report: PDF Preview** | 1. Switch to Preview tab 2. Review generated content | All sections render in DOT-compliant format, weather data included, contractor work summary formatted, photos with captions displayed | Playwright | §4.6 |
| P0-13 | **Report: PDF Generate + Submit** | 1. On preview tab, tap Submit 2. Confirm | PDF generated via jsPDF, uploaded to Supabase Storage `report-pdfs`, `pdf_url` written to reports table, status→submitted, report_data synced, local cleanup, redirects to dashboard with success banner | Playwright | §4.7, §4.8 |
| P0-14 | **Report Deletion: Full Cascade** | 1. Swipe report card → Delete 2. Confirm | Blocklist set FIRST, IDB cleanup (report+photos+draft+reportData), Supabase soft-delete (status='deleted'), broadcast sent, card removed from dashboard | Playwright | §2.2, §9.6 |
| P0-15 | **Data Store: IDB Init + Migration** | 1. Fresh install (no IDB) 2. Open app | IDB v7 created with all 7 stores, legacy localStorage migrated if present, migration flag set | Playwright | §9.5 |
| P0-16 | **Offline → Online: Report Survives** | 1. Start interview offline 2. Fill some data 3. Go online | Local data persisted in IDB, cloud sync fires on reconnect, pending backups drained, report visible on dashboard | Playwright | §9.5, §9.8, §10.1 |

---

### P1 — High-Value Regression Tests (Should Pass for Stable Release)

These cover multi-device sync, data integrity, and key UX flows that affect daily use.

| # | Test Name | Steps | Expected Result | Tool | Map Section | George Bug Ref |
|---|-----------|-------|-----------------|------|-------------|----------------|
| P1-01 | **Realtime Sync: Cross-Device Report Update** | 1. Device A creates report 2. Device B observes dashboard | Report appears on Device B via Supabase Realtime INSERT, in-memory cache updated, card rendered | Playwright (2 contexts) | §9.8 |  |
| P1-02 | **Realtime Sync: Refined Status Redirect** | 1. Device A submits interview for refine 2. Device B has interview open for same report | Device B detects status→refined, fetches latest report_data, redirects to report.html with toast "Refined version is ready" | Playwright | §9.8 | SYN-02 |
| P1-03 | **Realtime Sync: Delete Propagation** | 1. Device A deletes report 2. Device B dashboard | Device B: blocklist set, IDB cleaned, card removed, broadcast sent — report does NOT reappear | Playwright | §9.8, §9.6 |  |
| P1-04 | **Cloud Sync: Offline-Created Reports Preserved** | 1. Create report offline 2. Go online 3. `syncReportsFromCloud()` runs | Local-only report NOT deleted, fire-and-forget upsert to Supabase, appears in reconciled set | Playwright | §9.5 |  |
| P1-05 | **Project CRUD: Create → Edit → Delete** | 1. Create project with contractors 2. Edit name + add contractor 3. Delete project | Supabase rows created/updated/deleted, IDB cache refreshed, contractor JSONB parsed correctly, cascading delete removes dependent data | Playwright | §5.1, §5.2 |  |
| P1-06 | **Archives: Search + Filter + Cloud Photos** | 1. Open archives 2. Search by keyword 3. Filter by project 4. Expand report with photos | Reports loaded from Supabase, search filters title/content, photos fetched with fresh signed URLs (SEC-04), photo viewer modal works | Playwright | §6.1 | 🔴 archives.html missing pwa-utils.js |
| P1-07 | **Settings: Profile Save + Display Name** | 1. Open settings 2. Edit display name 3. Save | Supabase user_profiles upserted, IDB userProfile cached, name reflected in header greeting on dashboard | Playwright | §6.2 |  |
| P1-08 | **Dashboard: Report Card Swipe Actions** | 1. Swipe left on report card 2. Tap Continue (goes to report.html) 3. Swipe again, tap Delete | Swipe reveals action buttons (threshold 80px), Continue navigates with reportId, Delete shows confirmation then cascades | Maestro | §2.2 | 🟡 Full innerHTML re-render on every update |
| P1-09 | **Interview: Persistence Across Reload** | 1. Fill interview halfway 2. Reload page | Data restored from IDB draftData, all entries present, photos restored, scroll position approximate | Playwright | §3.3, §3.2 |  |
| P1-10 | **Cloud Photo Rehydration** | 1. Take photos on Device A 2. Open report on Device B | Photos fetched from Supabase photos table, signed URLs generated from storage_path (not stale photo_url), displayed in report editor | Playwright | §9.3 | 🟡 Signed URLs expire after 1hr |
| P1-11 | **BroadcastChannel: Cross-Tab Updates** | 1. Open app in Tab A and Tab B 2. Delete report in Tab A | Tab B receives `report-deleted` broadcast, removes card from dashboard without requiring reload | Playwright (2 tabs) | §9.2 |  |
| P1-12 | **Supabase Retry: Network Flap Recovery** | 1. Start autosave 2. Simulate network failure for 5s 3. Restore | supabaseRetry retries with exponential backoff (1s, 2s, 4s), succeeds after network restores, no data loss | Playwright (network throttle) | §9.9 |  |
| P1-13 | **Service Worker: Offline Navigation** | 1. Install app (SW registered) 2. Go offline 3. Navigate between pages | Cached HTML pages served, JS files served from SW cache, API calls return offline JSON response, offline banner appears | Playwright | §10.1, §10.2 |  |
| P1-14 | **Service Worker: Update Flow** | 1. Deploy new version (bump CACHE_VERSION) 2. User loads app | New SW installs, "Update available" blue banner shown, tap reloads with new version, old caches deleted on activate | Playwright | §10.1, §10.2 |  |
| P1-15 | **PWA: Standalone Navigation** | 1. Install as PWA 2. Tap internal links | Links intercepted via `location.href` (no Safari breakout), external links open in browser | Maestro (installed PWA) | §10.2 |  |
| P1-16 | **Report Expiry Guard** | 1. Create draft at 11:58 PM 2. Wait past midnight | Draft marked expired, cannot continue — verify midnight cutoff behavior (George 🟡: no grace period) | Playwright (mock clock) | §2.2 | 🟡 No midnight grace period |
| P1-17 | **Console Capture: Debug Logs** | 1. Trigger console.log/warn/error from app 2. Wait 3s flush interval | Entries captured in buffer (max 500), flushed to Supabase debug_logs in batches of 10, page hide flushes immediately | Playwright | §9.4 |  |

---

### P2 — Edge Case & Tool Tests (Nice to Have for Full Coverage)

These test individual field tools, error recovery, and edge cases. Lower priority but important for polish.

| # | Test Name | Steps | Expected Result | Tool | Map Section |
|---|-----------|-------|-----------------|------|-------------|
| P2-01 | **Calculator: Ft-In ↔ Decimal** | Enter 5ft 3-3/8in | Decimal: 5.2813ft, reverse: 5'-3 3/8" | Playwright | §7.2 |
| P2-02 | **Calculator: Concrete Volume** | L=20ft W=10ft D=4in, waste=10% | Cu yd calculated, order qty rounded to nearest ½ yd | Playwright | §7.2 |
| P2-03 | **Compass: iOS Permission Flow** | Open compass on iOS | Permission prompt → granted → rose renders with heading | Maestro | §7.3 |
| P2-04 | **Level: Bubble + Inclinometer** | Open level, tilt device | Bubble moves with tilt (±15° → ±100px), inclinometer shows degree/grade/color coding | Maestro | §7.6 |
| P2-05 | **Flashlight: SOS Pattern** | Open flashlight → SOS mode | Pattern: 3 short (200ms), 3 long (600ms), 3 short, loops. Button turns red. | Maestro | §7.5 |
| P2-06 | **Maps: Tab Switching** | Open maps → switch through all 9 tabs | Each tab loads correct provider, previous Leaflet map destroyed, GPS-centered, spinner shown until loaded | Maestro | §7.7 |
| P2-07 | **Maps: Tile Error Fallback** | Trigger >5 tile errors on Topo map | Tile layer removed, "View in USGS TopoView" fallback button appears | Playwright (mock) | §7.7 |
| P2-08 | **Distance Measure: Area Calculation** | Place 4 pins on map forming a rectangle | Polygon drawn, area calculated via Shoelace formula, displayed as sq ft or acres | Playwright | §8.1 |
| P2-09 | **Photo Measure: Calibrate + Measure** | Snap photo of credit card → calibrate → measure nearby object | Calibration: 2 taps on card ends → pixelsPerMm set. Measurement: 2 taps → distance in ft/in/m | Maestro | §8.3 |
| P2-10 | **QR Scanner: Detect + History** | Scan QR code → check history | Green overlay on code, beep+vibrate, result bar shows data, history saved to sessionStorage (max 50) | Maestro | §8.4 |
| P2-11 | **3D Scan Viewer: Load + Measure** | Import .glb file → enable measure → tap 2 points | Model rendered with orbit controls, 2 markers + line + distance label placed, distance in ft/mm | Playwright | §8.5 |
| P2-12 | **Slope Calculator: ADA Compliance** | Enter Rise=1, Run=12 | Grade=8.33%, ADA=Yes (≤8.33%), Drainage=Yes (≥1%), SVG diagram updates | Playwright | §8.6 |
| P2-13 | **Timer: Countdown Alarm** | Set 5s countdown → start → wait | Countdown reaches 0, alarm: 500Hz square wave 2s + screen flash (red/white 300ms) + vibrate [200,100,200,100,200] | Maestro | §8.7 |
| P2-14 | **Photo Markup: All Drawing Tools** | Open markup → draw with each tool + undo | Freehand path, arrow with head, circle, rect, text with bg — each renders. Undo removes last. Composite image includes metadata strip. | Playwright | §8.2 |
| P2-15 | **AI Assistant: Local Command Routing** | Type "open compass" on dashboard | Assistant closes, compass opens directly (no API call). Off dashboard: redirects to index.html?openTool=compass | Playwright | §9.1 |
| P2-16 | **AI Assistant: Webhook Chat** | Type "what work was done yesterday?" | Loading bubble, n8n webhook called with sanitized input + context (project, GPS, last 10 messages), response rendered | Playwright (mock webhook) | §9.1 |
| P2-17 | **Pull-to-Refresh: Mobile Gesture** | Pull down from scrollY=0 past 80px threshold | Orange indicator grows, spinner on release, pending backups flushed, page reloads | Maestro | §9.7 |
| P2-18 | **Decibel Meter: Levels + OSHA** | Open decibel → speak at various volumes | dB reading updates at ~20fps, color changes at 70/85/100 thresholds, OSHA line at 85dB, min/max/avg tracked | Maestro | §7.4 |
| P2-19 | **AR Measure: WebXR Fallback** | Open AR measure on device without WebXR | Three.js CDN lazy-loaded, WebXR fails → fallback screen with "Use Map Measure Instead" button | Playwright | §7.1 |
| P2-20 | **Interview: Contractor Personnel + Equipment** | Add contractor → add crew member → add equipment hours | Crew card rendered with name/count/trade, equipment table with dropdown hours (1-10), autosave persists | Playwright | §3.6, §3.7 |
| P2-21 | **Report: Original Notes Toggle** | On report page, tap "Show Original Notes" | Original interview input displayed in read-only panel below AI content, toggle collapses/expands | Playwright | §4.2 |
| P2-22 | **Document Import: PDF Parse** | On project-config, upload a PDF | Processing indicator shown, n8n webhook called, extracted text populates project fields (verify: George 🔴 no auth on extractor endpoint) | Playwright | §5.3 |
| P2-23 | **Permissions: Full Capability Check** | Open permissions page → check all APIs | Location, Camera, Microphone, Notifications, DeviceOrientation status displayed with grant/deny buttons, iOS-specific permission handling | Maestro | §6.3 |
| P2-24 | **Data Store: IDB Connection Recovery** | Open app → simulate IDB blocked event | Handle closed, retry after 500ms, connection re-established, operations resume | Playwright | §9.5 |

---

### Known Bugs to Verify (from George's CODEBASE_REVIEW.md)

| # | Severity | Description | Where | Test To Write |
|---|----------|-------------|-------|---------------|
| KB-01 | 🔴 CRITICAL | **RLS disabled on 11/12 Supabase tables** — any authenticated user can access all data | Supabase backend | Security audit: authenticated user A queries user B's reports → should be blocked |
| KB-02 | 🔴 HIGH | **report.html, archives.html, login.html missing pwa-utils.js** — no SW registration, no offline banner, no standalone nav fix on critical pages | HTML `<script>` tags | Verify these pages: no offline banner shown when offline, no SW update detection |
| KB-03 | 🔴 HIGH | **project-extractor webhook: no auth, no timeout** — open endpoint, anyone can upload files | js/project-config/document-import.js | Call webhook without API key → should reject (currently accepts) |
| KB-04 | 🔴 MEDIUM | **`ensureReportExists()` sets status='draft' right before submit** — race condition if subsequent steps fail | js/report/submit.js | Simulate network failure during submit after ensureReportExists → verify report not stuck as draft |
| KB-05 | 🔴 MEDIUM | **reports.user_id has no FK constraint** — orphaned data risk | Supabase schema | Delete user → verify reports remain (orphaned) — needs FK constraint |
| KB-06 | 🟡 HIGH | **Signed photo URLs expire after 1 hour** — long editing sessions show broken images | js/interview/photos.js, js/shared/cloud-photos.js | Open report editor, wait 61 minutes → photos should still display (currently break) |
| KB-07 | 🟡 HIGH | **Full innerHTML re-render on dashboard report cards** — destroys scroll/swipe state | js/index/report-cards.js | Trigger renderReportCards() while swiping → swipe state lost, scroll jumps |
| KB-08 | 🟡 MEDIUM | **Sequential photo upload** — 10+ photos take 30+ seconds | js/interview/photos.js | Upload 10 photos simultaneously → should be parallel (currently sequential) |
| KB-09 | 🟡 MEDIUM | **Midnight report expiry — no grace period** — draft at 11:59 PM expires at 12:00 AM | js/report-rules.js | Create draft at 23:59, check at 00:01 → expired (1 minute of work) |
| KB-10 | 🟡 MEDIUM | **refreshProjectsFromCloud() clears IDB before re-caching** — crash between clear and write loses all project data | js/data-layer.js | Simulate crash after clearStore but before put → projects lost until next cloud refresh |
| KB-11 | 🟡 LOW | **Messages module is entirely hardcoded demo data** — fake threads with Mike Rodriguez etc. | js/index/messages.js | Verify: send message → only appends to DOM, no persistence, no API call |
| KB-12 | 🟡 LOW | **Deleted blocklist caps at 100** — old deleted IDs can reappear via realtime sync | js/storage-keys.js | Delete 101 reports → verify first deleted report doesn't reappear on cloud sync |

---

### Test Infrastructure Recommendations

| Tool | Use For | Setup |
|------|---------|-------|
| **Playwright** | P0/P1 browser tests, multi-tab sync, network simulation, DOM assertions | `npx playwright test` with Chromium + WebKit targets |
| **Maestro** | Mobile-specific: camera, microphone, device orientation, swipe gestures, PWA installed mode | Maestro flows on iOS/Android simulators |
| **Supabase Local** | Isolated test database with RLS policies, seeded test data | `supabase start` with migration scripts |
| **MSW (Mock Service Worker)** | Mock n8n webhooks, weather API, FEMA/USGS tile errors for deterministic tests | `msw` handlers for API patterns |

### Coverage Priority Order

1. **P0-01 through P0-16** → blocks release (core workflow)
2. **KB-01 through KB-05** → security/data integrity bugs
3. **P1-01 through P1-17** → multi-device and sync reliability
4. **KB-06 through KB-12** → known quality issues
5. **P2-01 through P2-24** → tools and edge cases

