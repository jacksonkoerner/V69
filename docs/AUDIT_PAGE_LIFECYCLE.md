# AUDIT: Page Lifecycle & Navigation — FieldVoice Pro V69

> Generated: 2025-07-14  
> Scope: Complete page lifecycle, auth flow, navigation graph, service worker, iOS PWA behavior

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Shared Module Behavior](#2-shared-module-behavior)
3. [Page-by-Page Lifecycle](#3-page-by-page-lifecycle)
4. [Complete Auth Lifecycle](#4-complete-auth-lifecycle)
5. [Service Worker Behavior](#5-service-worker-behavior)
6. [PWA / Standalone Mode](#6-pwa--standalone-mode)
7. [Navigation Graph](#7-navigation-graph)
8. [iOS PWA Specifics & Known Quirks](#8-ios-pwa-specifics--known-quirks)
9. [Event Listener Inventory](#9-event-listener-inventory)

---

## 1. Architecture Overview

FieldVoice Pro is a multi-page application (MPA) — each HTML file is a standalone document that loads its own scripts. There is **no client-side router**. Navigation happens via:

- `window.location.href = 'page.html'` (most common)
- `<a href="page.html">` links
- `history.back()` (not used — all back buttons use explicit `href="index.html"`)
- `history.replaceState()` (only for cleaning URL params, never for navigation)

### Storage Layers (in order of reliability)

| Layer | Purpose | Durability |
|-------|---------|-----------|
| **Supabase (cloud)** | Source of truth for reports, projects, user profiles | Permanent |
| **IndexedDB** | Local cache for offline/cross-page data | Survives 7-day iOS eviction sometimes |
| **localStorage** | Fast sync reads, session state, feature flags | Subject to iOS 7-day eviction |
| **sessionStorage** | Per-tab ephemeral state (submitted banner dismiss) | Tab lifetime only |

### Script Loading Convention

Every protected page follows this pattern in `<head>`:
```
supabase-js CDN → config.js → storage-keys.js → [page-specific deps] → auth.js
```

Then at end of `<body>`:
```
[page module scripts] → main.js (entry point with DOMContentLoaded handler)
```

The **critical ordering** is:
1. `supabase-js` must load first (provides `supabase` global)
2. `config.js` creates `supabaseClient` using the CDN library
3. `storage-keys.js` defines `STORAGE_KEYS`, `getStorageItem`, `setStorageItem`, etc.
4. `auth.js` registers its DOMContentLoaded handler immediately on load
5. Page's `main.js` registers its DOMContentLoaded handler **after** auth.js

Since `auth.js` is in `<head>` and `main.js` is at end of `<body>`, auth.js's DOMContentLoaded handler fires **before** main.js's handler (both registered before DOMContentLoaded fires, but in script parse order).

---

## 2. Shared Module Behavior

### 2.1 `js/auth.js` — Auth Gate

**Self-executing IIFE** that runs on every page load.

**On load (synchronous):**
1. Creates `_authReadyPromise` (a Promise with externally accessible resolve)
2. Determines `currentPage` from `window.location.pathname`
3. If page is NOT `login.html` or `landing.html`:
   - Registers a `DOMContentLoaded` handler that:
     1. Calls `requireAuth()` → `supabaseClient.auth.getSession()`
     2. If no session → `window.location.href = 'login.html'` (hard redirect)
     3. If session exists → resolves `_authReadyPromise` with session
     4. Injects sign-out button (only on `settings.html`)
     5. Calls `ensureOrgIdCached(session.user.id)` — fetches org_id from user_profiles if not in localStorage
     6. Starts `startAuthStateListener()` — Supabase onAuthStateChange
     7. Starts `startPeriodicSessionCheck()` — 5-minute interval check
     8. Requests `navigator.storage.persist()`
4. If page IS `login.html` or `landing.html`: resolves `_authReadyPromise` immediately with `null`

**Exposed API:** `window.auth` object with:
- `auth.ready` — Promise<session|null> — THE coordination point for all pages
- `auth.requireAuth()`, `auth.getCurrentUser()`, `auth.getAuthUserId()`
- `auth.getAuthRole()`, `auth.setAuthRole(role)`
- `auth.signOut()` — clears ALL localStorage keys, IDB stores, redirects to login
- `auth.upsertAuthProfile()`, `auth.loadAuthProfile()`

**Session monitoring:**
- `onAuthStateChange`: TOKEN_REFRESHED → log; SIGNED_OUT → full signOut(); other + no session → toast warning
- `setInterval` every 5 min: calls `getSession()`, warns if expired (does NOT redirect — user may have unsaved work)

### 2.2 `js/ui-utils.js` — Shared Utilities

**Not an IIFE** — plain function declarations at global scope.

Provides: `escapeHtml`, `generateId`, `showToast`, `formatDate`, `formatDateTime`, `formatTime`, `autoExpand`, `initAutoExpand`, `initAllAutoExpandTextareas`, `getLocalDateString`, location caching (`getCachedLocation`, `cacheLocation`, `clearCachedLocation`, `isLocationStale`, `getLocationFromCache`, `getFreshLocation`).

**Key behavior — `getFreshLocation()`:**
1. Checks browser Permissions API first (authoritative)
2. If `granted` → always attempts live GPS read
3. If `denied` → clears stale localStorage, returns null
4. If `prompt` and localStorage says granted → tries GPS
5. Caches result in localStorage (`LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `LOC_GRANTED`)
6. On failure with permission denied → clears cache; on timeout → falls back to cache

### 2.3 `js/pwa-utils.js` — PWA Setup

Provides: `initPWA(options)`, `setupPWANavigation()`, `registerServiceWorker()`, `setupOfflineBanner()`, `showUpdateBanner()`

**`setupPWANavigation()`** — CRITICAL for iOS standalone:
- Detects standalone mode via `navigator.standalone === true` or `matchMedia('(display-mode: standalone)')`
- Adds a click handler on `document` (capture phase) that intercepts all `<a>` tags with same-origin `href`
- Calls `e.preventDefault()` then `window.location.href = link.href`
- This prevents iOS Safari from breaking out of standalone mode

**`registerServiceWorker()`:**
- Runs on `window.load` event
- Registers `sw.js` with scope = current directory
- Listens for `updatefound` → shows blue "Update available" banner

**`setupOfflineBanner()`:**
- `window.addEventListener('online', ...)` / `window.addEventListener('offline', ...)`
- Shows/hides `#offline-banner` element
- Calls optional `onOnline`/`onOffline` callbacks

### 2.4 `js/shared/realtime-sync.js` — Supabase Realtime

**Global `var` declarations** (not IIFE).

**`initRealtimeSync()`:**
1. Guards: needs supabaseClient, network, userId
2. Cleans up existing channels (idempotent)
3. Subscribes to `reports` table changes filtered by user_id
4. Subscribes to `report_data` table changes (unfiltered server-side, client-side guarded by known report IDs)
5. Subscribes to `projects` table changes filtered by org_id
6. **SYN-02 skip:** If on `quick-interview.html` or `report.html` AND the changed report matches the URL's `reportId`, skips the update (prevents overwriting mid-edit)

**Lifecycle listeners (always active when script is loaded):**
- `beforeunload` → `cleanupRealtimeSync()`
- `online` → `initRealtimeSync()`
- `offline` → `cleanupRealtimeSync()`

**Loaded on:** index.html, quick-interview.html, report.html, archives.html

### 2.5 `js/shared/ai-assistant.js` — AI Chat Widget

**Self-executing IIFE.**

**On load:**
- If `document.readyState === 'loading'` → DOMContentLoaded handler
- Otherwise → immediate execution
- Injects floating button (#aiAssistantBtn) and full-screen overlay (#aiAssistantOverlay)
- Sets up draggable button with double-tap to open
- Loads GPS silently for context
- Loads conversation history from localStorage

**Navigation commands:** Can navigate to any page via `setTimeout(() => window.location.href = '...', 500)` in response to user chat commands. This is a **hidden navigation vector**.

**Loaded on:** Pages that include this script in `<head>` (index.html does NOT load it in the head scripts shown, but the sw.js caches it)

### 2.6 `sw.js` — Service Worker

See [Section 5](#5-service-worker-behavior) for full details.

---

## 3. Page-by-Page Lifecycle

### 3.1 `login.html`

**Purpose:** Authentication entry point (sign in, sign up, role selection).

**Script loading order (all in `<head>`):**
1. `supabase-js` (CDN)
2. `config.js`
3. `storage-keys.js`

**End of `<body>`:**
4. `js/login/main.js`

**NOTE:** `auth.js` is NOT loaded on this page. The page handles its own auth checks.

**DOMContentLoaded:** None registered explicitly. Instead:

**Immediate execution (IIFE at bottom of main.js):**
```js
(async function checkExistingSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.href = 'index.html'; // Already logged in → redirect
    }
})();
```

**Also immediately:** `document.addEventListener('keydown', ...)` for Enter key to submit forms.

**Auth flow:**
- `handleSignIn()` → `supabaseClient.auth.signInWithPassword()`
- On success: checks for existing user_profiles row with role
  - If role exists → stores in localStorage → `window.location.href = 'index.html'`
  - If no role → shows role picker view
- `handleSignUp()` → validates org code → `supabaseClient.auth.signUp()` → creates user_profiles row → shows role picker
- `selectRole('inspector')` → stores role → `window.location.href = 'index.html'`
- `selectRole('admin')` → shows "Coming Soon" modal

**Navigation OUT:**
- `window.location.href = 'index.html'` (after successful login/signup/role selection)

**Navigation IN:**
- Direct URL
- Redirected from auth.js on any protected page when no session
- Redirected from `auth.signOut()`

**Event listeners:**
- `keydown` on document (Enter key)

---

### 3.2 `index.html` (Dashboard)

**Purpose:** Main dashboard showing reports, weather, tools, calendar, messages.

**Script loading order (`<head>`):**
1. `supabase-js` CDN
2. `config.js`
3. `shared/cloud-photos.js`
4. `shared/delete-report.js`
5. `shared/realtime-sync.js`
6. `storage-keys.js`
7. `report-rules.js`
8. `supabase-utils.js`
9. `pwa-utils.js`
10. `ui-utils.js`
11. `indexeddb-utils.js`
12. `data-layer.js`
13. `auth.js`
14. CSS files + Leaflet CSS/JS + jsQR

**Inline `<script>` in `<body>` (order matters):**
15. `js/index/field-tools.js` (after tools carousel HTML)
16. `js/index/calendar.js` (after calendar HTML)
17. `js/index/messages.js` (after messages HTML)

**End of `<body>`:**
18. 11× tool scripts (`js/tools/maps.js`, `compass.js`, `measure.js`, etc.)
19. `js/index/weather.js`
20. `js/index/panels.js`
21. `js/index/cloud-recovery.js`
22. `js/index/report-cards.js`
23. `js/index/report-creation.js`
24. `js/index/main.js` (entry point — **must load last**)

**Also loaded but not in HTML (auto-injects):**
- `js/index/deep-links.js` — IIFE that reads `?openTool=` and `?openPanel=` URL params
- `js/index/toggle-panel.js` — defines `togglePanel()` global function

**DOMContentLoaded handler (main.js) — exact sequence:**

1. Log timestamp
2. `initPWA({ onOnline: updateDraftsSection })`
3. Check `?submitted=true` URL param → show success banner, clean URL with `replaceState`
4. Check `shouldShowOnboarding()` → if true, redirect to `permissions.html` and **return** (stop init)
5. Check `shouldShowBanner()` → show permissions banner
6. Clean up stale AI response caches (>24h) from localStorage
7. Set `#currentDate` text immediately
8. **`_renderFromLocalStorage()`** — synchronous render from localStorage (instant, no blanking)
9. One-time migration: clear stale IDB projects (v1.13.0 migration flag)
10. **`await withTimeout(auth.ready, 5000, null, 'auth.ready')`** — wait for auth, 5s timeout
11. If no session: warn but continue (let auth.js handle redirect)
12. **`await refreshDashboard('DOMContentLoaded')`** — the main data loading flow
13. `initRealtimeSync()` — start Realtime subscriptions
14. Check for submitted reports today → show submitted banner

**`refreshDashboard(source)` — the core refresh cycle:**
1. Debounce check (skip if already running)
2. Cooldown check (skip if <2s since last refresh, unless source is 'DOMContentLoaded')
3. `_renderFromLocalStorage()` — immediate synchronous render
4. `await withTimeout(hydrateCurrentReportsFromIDB(), 3000)` — IDB → localStorage hydration
5. `renderReportCards()` + `updateReportStatus()` — re-render with hydrated data
6. `await withTimeout(dataLayer.loadProjects(), 4000)` — load projects from IDB
7. If online: `await withTimeout(dataLayer.refreshProjectsFromCloud(), 8000)` — cloud sync
8. Update `projectsCache`; fallback to localStorage if empty
9. `pruneCurrentReports()` — remove submitted >7 days, malformed entries
10. `renderReportCards()` + `updateReportStatus()` — final render
11. `recoverCloudDrafts()` — fire-and-forget cloud sync
12. `await withTimeout(syncWeather(), 15000)` — weather fetch

**Event listeners:**
- `pageshow` → `refreshDashboard('pageshow')` — **not gated on `event.persisted`** (iOS fix). Also resets IDB connection if bfcache restore detected.
- `visibilitychange` → if visible, `refreshDashboard('visibilitychange')`
- `focus` → `refreshDashboard('focus')` — final fallback for iOS PWA resume
- `online`/`offline` — via `initPWA()` and `realtime-sync.js`
- `beforeunload` — via `realtime-sync.js` (cleanup channels)

**Navigation OUT:**
- `window.location.href = 'projects.html'` (openProjectConfig)
- `window.location.href = 'settings.html'` (openSettings)
- `window.location.href = 'quick-interview.html?reportId=...&projectId=...'` (new report via selectProjectAndProceed)
- `window.location.href = 'project-config.html'` (goToProjectSetup)
- `window.location.href = 'permissions.html'` (onboarding redirect)
- `<a href="archives.html">` (Report Archives link)
- Report card links → various pages based on status (see `getReportHref`)
- AI assistant commands → any page

**Navigation IN:**
- `login.html` after successful auth
- `quick-interview.html` → back button (link to index.html)
- `report.html` → back button
- `settings.html` → back button
- Any page with back navigation
- bfcache restore (iOS app switch)
- `?submitted=true` from report submit
- `?openTool=...` / `?openPanel=...` from AI assistant redirects

**Deep link handling (deep-links.js):**
- Reads `openTool` and `openPanel` from URL on page load
- Cleans URL with `replaceState`
- After `window.load` + 600ms delay, opens the requested tool/panel

---

### 3.3 `quick-interview.html` (Field Capture)

**Purpose:** Interview/data capture page — two modes: "Quick Notes" (minimal) and "Guided Sections".

**Script loading order (`<head>`):**
1. CSS first
2. `supabase-js` CDN
3. `config.js`
4. `shared/delete-report.js`
5. `shared/supabase-retry.js`
6. `shared/realtime-sync.js`
7. `storage-keys.js`
8. `indexeddb-utils.js`
9. `data-layer.js`
10. `report-rules.js`
11. `supabase-utils.js`
12. `pwa-utils.js`
13. `auth.js`
14. `ui-utils.js`
15. `media-utils.js`
16. `tools/photo-markup.js` (defer)

**End of `<body>` (after all HTML):**
17. `js/interview/state-mgmt.js` — **MUST load first** (creates `window.interviewState`)
18. `js/interview/persistence.js`
19. `js/interview/ui-display.js`
20. `js/interview/ui-flow.js`
21. `js/interview/freeform.js`
22. `js/interview/guided-sections.js`
23. `js/interview/contractors-personnel.js`
24. `js/interview/equipment-manual.js`
25. `js/interview/photos.js`
26. `js/interview/finish-processing.js`
27. `js/interview/main.js` — **MUST load last** (orchestrator)

**state-mgmt.js initialization (immediate, on parse):**
- Creates `window.interviewState` (IS) with all state fields
- Defines entry CRUD, toggle state, N/A marking functions

**DOMContentLoaded handler (main.js) — exact sequence:**

1. `initPWA()`
2. Wire up processing overlay error buttons
3. **State Protection:** `await checkReportState()` — currently always returns true (simplified in v6.6.15)
4. `IS.userSettings = await dataLayer.loadUserSettings()`
5. `IS.report = await getReport()` — tries localStorage → IDB → Supabase interview_backup → fresh
6. Read `reportId` from URL, set `IS.currentReportId`
7. If no reportId, generate fallback UUID (shouldn't happen)
8. Try `loadFromLocalStorage()` → if miss, try `loadDraftFromIDB()`
9. If found, `restoreFromLocalStorage(draft)` — merges into IS.report
10. Resolve `reportProjectId` from: URL `?projectId=` → `fvp_current_reports[id].project_id` → null
11. Load project: `IS.activeProject = await dataLayer.loadProjectById(reportProjectId)`
12. Set `IS.projectContractors`
13. Auto-populate project info and reporter name from settings
14. `hideLoadingOverlay()` — removes the full-screen loading spinner
15. Decide mode: `shouldShowModeSelection()` → show mode picker OR show mode UI
16. If weather data is stale, `fetchWeather()`
17. `checkAndShowWarningBanner()` — permissions warning
18. `checkDictationHintBanner()`
19. `initRealtimeSync()`

**Saving/persistence:**
- `saveReport()` → updates previews → debounced `saveToLocalStorage()` (500ms) + marks backup dirty (5s debounce for Supabase)
- `saveToLocalStorage()` → writes to `fvp_current_reports` via `saveCurrentReport()` + write-through to IDB
- `flushInterviewBackup()` → upserts to `interview_backup` table in Supabase (with retry)

**Event listeners:**
- `visibilitychange` → if hidden, `saveToLocalStorage()` + `flushInterviewBackup()`
- `pagehide` → same emergency save
- `site-conditions-input` change → saves weather condition
- `no-incidents` / `has-incidents` checkbox changes
- `photoInput` change → photo handling
- Various inline onclick handlers in HTML

**Navigation OUT:**
- `<a href="index.html">` (back button — standard link, NOT history.back)
- `window.location.href = 'index.html'` (cancel report)
- `window.location.href = 'report.html?date=...&reportId=...'` (after AI processing finishes)
- `window.location.href = 'permissions.html'` (enable permissions link)

**Navigation IN:**
- `index.html` via `selectProjectAndProceed()` → `?reportId=...&projectId=...`
- Report card click from dashboard (for draft/pending_refine status)
- bfcache restore

**Finish flow (finish-processing.js):**
1. `finishReport()` or `finishMinimalReport()` called
2. Shows processing overlay (full-screen, blocks all interaction)
3. `saveReportToSupabase()` → upserts report row
4. `uploadPendingPhotos()` → uploads photos to Supabase Storage
5. `flushInterviewBackup()` — ensures latest data is backed up
6. Calls n8n webhook to refine report via AI
7. On success: saves AI result to `report_data`, `fvp_report_{id}` localStorage
8. Updates report status to `refined`
9. Navigates to `report.html?date=...&reportId=...`
10. On failure: shows error overlay with Retry and Save Draft buttons

---

### 3.4 `report.html` (Report Editor)

**Purpose:** View/edit AI-refined report, preview, and submit.

**Script loading order (`<head>`):**
1. `supabase-js` CDN
2. `jspdf` CDN
3. `config.js`
4. `shared/cloud-photos.js`
5. `shared/delete-report.js`
6. `shared/supabase-retry.js`
7. `shared/realtime-sync.js`
8. `storage-keys.js`
9. `indexeddb-utils.js`
10. `data-layer.js`
11. `supabase-utils.js`
12. `auth.js`
13. `ui-utils.js`

**End of `<body>`:**
14. `js/report/data-loading.js` — **creates `window.reportState`** (must load first)
15. `js/report/original-notes.js`
16. `js/report/form-fields.js`
17. `js/report/autosave.js`
18. `js/report/ai-refine.js`
19. `js/report/preview.js`
20. `js/report/pdf-generator.js`
21. `js/report/submit.js`
22. `js/report/delete-report.js`
23. `js/report/debug.js`
24. `js/report/main.js` — **entry point, loads last**

**DOMContentLoaded handler (main.js):**

1. `RS.userSettings = await dataLayer.loadUserSettings()`
2. `RS.report = await loadReport()` — loads from localStorage `fvp_report_{reportId}`, falls back to Supabase `report_data`
3. Resolve project_id from: report data → fvp_current_reports → URL param
4. Load project: `RS.activeProject = await dataLayer.loadProjectById(reportProjectId)`
5. Initialize `RS.userEdits`
6. Mark report as viewed
7. `populateAllFields()` — fills all form fields from RS.report
8. `populateOriginalNotes()` — fills original notes tab
9. `checkPendingRefineStatus()` — if status is pending_refine, polls for completion
10. `setupAutoSave()` — attaches input listeners to all editable fields
11. `initRealtimeSync()`
12. `initAllAutoExpandTextareas()`
13. `updateHeaderDate()`
14. `initializeDebugPanel()`
15. Check `?tab=preview` URL param → switch to preview tab

**Auto-save (autosave.js):**
- Every form field input → 500ms debounce → `saveReportToLocalStorage()`
- Also marks Supabase backup dirty (5s debounce for `flushReportBackup()`)
- `flushReportBackup()` → upserts to `report_data` table

**Event listeners:**
- `visibilitychange` → if hidden, save + flush backup
- `pagehide` → save + flush backup
- `window.resize` → re-scale preview

**Navigation OUT:**
- `<a href="index.html">` (back button)
- `window.location.href = 'index.html?submitted=true'` (after successful submit)
- `window.location.href = 'index.html'` (after delete)

**Navigation IN:**
- `quick-interview.html` after AI processing → `?date=...&reportId=...`
- Report card click from dashboard (for refined/ready_to_submit status)
- `?tab=preview` to jump directly to preview

**Submit flow (submit.js):**
1. Online check
2. Duplicate detection (warns if same project+date already submitted)
3. Shows loading overlay
4. `saveReportToLocalStorage()`
5. `generateVectorPDF()` → creates PDF blob
6. `uploadPDFToStorage(pdf)` → uploads to Supabase Storage, returns URL
7. `ensureReportExists()` → upserts report row
8. `saveSubmittedReportData(pdfUrl)` → upserts report_data with PDF URL
9. `updateReportStatus('submitted')` → updates report row status
10. `cleanupLocalStorage()` → removes draft data
11. `window.location.href = 'index.html?submitted=true'`

---

### 3.5 `settings.html`

**Purpose:** Inspector profile management, PWA refresh, nuclear reset.

**Script loading (`<head>`):**
1. `supabase-js` CDN → `config.js` → `supabase-utils.js` → `pwa-utils.js` → `ui-utils.js` → `storage-keys.js` → `indexeddb-utils.js` → `data-layer.js` → `auth.js`

**End of `<body>`:**
2. `js/settings/main.js`

**DOMContentLoaded handler:**
1. `initPWA()`
2. Pre-populate name/email from localStorage (instant)
3. Attach `input` listeners to all form fields for dirty detection + scratch pad save
4. `beforeunload` listener — warns if `isDirty`
5. `await auth.ready` — wait for auth
6. `await loadSettings()` — checks scratch pad first, then IDB/Supabase via dataLayer

**Saving:** `saveSettings()` → IDB first (local-first) → Supabase upsert

**Navigation OUT:**
- `<a href="index.html">` (back button)
- `window.location.href = './index.html'` (after nuclear reset)
- `window.location.href = '...' + '?refresh=' + Date.now()` (PWA refresh)

**Navigation IN:**
- Dashboard settings button
- Direct URL

**Event listeners:**
- `beforeunload` (unsaved changes warning)
- `input` on all form fields (dirty tracking + scratch save)

---

### 3.6 `projects.html`

**Purpose:** List all projects, select active project, navigate to edit.

**Script loading (`<head>`):**
`supabase-js` → `config.js` → `pwa-utils.js` → `ui-utils.js` → `storage-keys.js` → `indexeddb-utils.js` → `supabase-utils.js` → `data-layer.js` → `auth.js`

**End of `<body>`:**
`js/projects/main.js`

**DOMContentLoaded handler:**
1. `initPWA()`
2. Get `ACTIVE_PROJECT_ID` from localStorage
3. `await renderProjectList()` — loads all projects from IDB → Supabase fallback

**Navigation OUT:**
- `window.location.href = 'index.html'` (after selecting a project, 500ms delay)
- `window.location.href = 'project-config.html?id=...'` (edit project)
- `<a href="index.html">` (back button)
- `<a href="project-config.html">` (create new)

**Navigation IN:**
- Dashboard "Manage Projects" link
- Project picker modal "Manage Projects" link
- Dashboard openProjectConfig button

---

### 3.7 `project-config.html`

**Purpose:** Create/edit a single project (name, contractors, equipment, documents).

**Script loading (`<head>`):**
`supabase-js` → `config.js` → `storage-keys.js` → `supabase-utils.js` → `pwa-utils.js` → `auth.js` → `ui-utils.js`

**NOTE:** Does NOT load `indexeddb-utils.js` or `data-layer.js` in head — loads them through other means or uses direct Supabase calls.

**End of `<body>`:**
`js/project-config/crud.js` → `contractors.js` → `form.js` → `document-import.js` → `main.js`

**DOMContentLoaded handler:**
1. `initPWA()`
2. `await idb.initDB()` — ensure IndexedDB ready
3. `setupDropZone()` and `setupLogoDropZone()`
4. Check URL `?id=` param → load project for editing, or create new
5. `setupDirtyTracking()` — form change listeners + beforeunload warning

**Navigation OUT:**
- `window.location.href = 'projects.html'` (cancel / after save)
- Back button links

**Navigation IN:**
- `projects.html` edit button → `?id=...`
- Dashboard project picker "Create Project" → no param (new)
- AI assistant "project config" command

**Event listeners:**
- `beforeunload` (unsaved changes warning)
- `input`/`change` on form fields (dirty tracking)

---

### 3.8 `archives.html`

**Purpose:** View submitted reports and their PDFs.

**Script loading (`<head>`):**
`supabase-js` CDN + CSS + FontAwesome

**NOTE:** Minimal head — does NOT load `auth.js`, `storage-keys.js`, `pwa-utils.js` etc. in `<head>`. These are loaded via other script tags in body or are not needed.

**Actually loaded (checking HTML source):**
- `supabase-js` CDN in head
- `config.js`, `storage-keys.js`, `ui-utils.js`, `indexeddb-utils.js` likely loaded — the JS references `getStorageItem`, `STORAGE_KEYS`, `formatDate`, `escapeHtml`, `idb`

**End of `<body>`:**
`js/archives/main.js`

**DOMContentLoaded handler:**
- `init()` function:
  1. Check supabaseClient exists
  2. Attach event listeners (once): projectFilter change, online/offline
  3. If offline → try `loadFromCache()` (IDB), else show offline warning
  4. If online → `loadProjects()` + `loadReports()` from Supabase
  5. `initRealtimeSync()`

**Navigation OUT:**
- `<a href="index.html">` (back button / Dashboard link)
- `window.open(pdfUrl, '_blank')` (PDF viewing)

**Navigation IN:**
- Dashboard "Report Archives" link
- Report card click for submitted reports
- Dashboard success banner "View in Archives" link

**Event listeners:**
- `projectFilter` change → filter reports
- `online` → reinitialize
- `offline` → show warning

---

### 3.9 `permissions.html`

**Purpose:** First-time device permission setup (microphone, camera, location).

**Script loading (`<head>`):**
`pwa-utils.js` → `storage-keys.js` → `ui-utils.js`

**NOTE:** Does NOT load `auth.js` — this is an unprotected page (but auth.js excludes it from auth gate since it's not login.html or landing.html... Actually, checking auth.js: it gates ALL pages except `login.html` and `landing.html`. So `permissions.html` IS auth-gated.)

Wait — re-checking: auth.js gates `currentPage !== 'login.html' && currentPage !== 'landing.html'`. So `permissions.html` IS gated. But permissions.html doesn't load `supabase-js`, `config.js`, or `auth.js` in its head! This means if a user navigates directly to permissions.html without being logged in, auth.js won't redirect them (because it's not loaded). But they also can't do anything harmful since it's just a permissions setup page.

**End of `<body>`:**
`js/permissions/main.js`

**DOMContentLoaded handler (`init()`):**
1. `initPWA()`
2. Log device info
3. Check if already onboarded with all permissions → could redirect

**Flow:**
- Welcome screen → sequential permission flow (mic → cam → loc) → summary
- OR skip to manual setup
- `finishSetup()` → sets `ONBOARDED = true` → `window.location.href = 'index.html'`

**Navigation OUT:**
- `window.location.href = 'index.html'` (after finishSetup)

**Navigation IN:**
- Dashboard auto-redirect (when `shouldShowOnboarding()` is true)
- Dashboard permissions banner "ENABLE" link
- Interview page permissions banner "Enable" link

---

### 3.10 `landing.html`

**Purpose:** Marketing/landing page for the app. Public-facing, no auth required.

**Script loading (`<head>`):**
`pwa-utils.js` + CSS + FontAwesome + Google Fonts

**End of `<body>`:**
`js/landing/main.js`

**auth.js behavior:** `landing.html` is explicitly excluded from auth gate (alongside `login.html`).

**DOMContentLoaded:** Not explicitly registered. `js/landing/main.js` runs immediately.

**Content:** Demo interactions (voice recording simulation, weather sync simulation, FAQ toggles, scroll animations). No real data operations.

**Navigation OUT:**
- Links to `login.html` ("Get Started" / "Start Free Trial" buttons)
- Anchor links (in-page scroll)

**Navigation IN:**
- Direct URL (marketing campaigns, etc.)

---

## 4. Complete Auth Lifecycle

### Login → Session Establishment

```
User opens login.html
  ├─ checkExistingSession() runs immediately
  │   └─ If session exists → redirect to index.html
  │
  ├─ User submits credentials
  │   └─ handleSignIn() → supabaseClient.auth.signInWithPassword()
  │       ├─ Checks user_profiles for existing role
  │       │   ├─ Role exists → store in localStorage → redirect to index.html
  │       │   └─ No role → show role picker
  │       │       └─ selectRole('inspector') → store role → redirect to index.html
  │       └─ On error → show error message
  │
  └─ User signs up
      └─ handleSignUp() → validates org code → supabaseClient.auth.signUp()
          └─ Creates user_profiles row → show role picker → index.html
```

### Session Validation on Protected Pages

```
Page loads (any page except login.html, landing.html)
  └─ auth.js DOMContentLoaded fires
      └─ requireAuth() → supabaseClient.auth.getSession()
          ├─ No session → redirect to login.html
          └─ Session exists → resolve auth.ready
              ├─ injectSignOutButton() (settings.html only)
              ├─ ensureOrgIdCached() (fetches from user_profiles if needed)
              ├─ startAuthStateListener() (Supabase real-time auth events)
              └─ startPeriodicSessionCheck() (5-min interval)
```

### Session Monitoring (Ongoing)

```
Every 5 minutes:
  └─ getSession()
      ├─ Valid → clear warning flag
      └─ Invalid → showSessionExpiredWarning() (toast, NO redirect)

Supabase auth state changes:
  ├─ TOKEN_REFRESHED → log, clear warning
  ├─ SIGNED_OUT → signOut() (full cleanup + redirect)
  └─ Other + no session → showSessionExpiredWarning()
```

### Sign Out

```
auth.signOut()
  ├─ Clear session check interval
  ├─ supabaseClient.auth.signOut()
  ├─ Remove 15+ localStorage keys (auth, user, projects, org, reports, banners)
  ├─ Remove all fvp_report_* and fvp_ai_conversation_* keys
  ├─ Clear IndexedDB stores: currentReports, draftData, userProfile, projects
  └─ window.location.href = 'login.html'
```

### Key localStorage Keys Used for Auth/Identity

| Key | Content |
|-----|---------|
| `fvp_auth_role` | 'inspector' or 'admin' |
| `fvp_org_id` | Organization UUID |
| `fvp_user_id` | user_profiles row ID |
| `fvp_user_name` | Full name |
| `fvp_user_email` | Email |
| `fvp_auth_user_id` | Supabase auth UUID |

---

## 5. Service Worker Behavior

### Cache Strategy by Resource Type

| Resource Type | Strategy | Details |
|--------------|----------|---------|
| **Navigation requests** | Network-first, cache fallback | Caches successful responses; offline falls back to exact URL cache → index.html as last resort |
| **JavaScript files** (same-origin) | Network-first with `cache: 'no-cache'` | Bypasses browser HTTP cache; updates SW cache on success; offline falls back to SW cache |
| **Static assets** (CSS, images, fonts) | Cache-first with stale-while-revalidate | Returns cached version immediately; updates cache in background |
| **API calls** (open-meteo, n8n, webhooks) | Network-only with offline JSON response | Returns `{ error: true, offline: true }` when offline |
| **CDN assets** | Cached on install | Font Awesome, Supabase JS, Leaflet, jsQR, html2canvas, jsPDF |

### Cache Versioning

```
CACHE_VERSION = 'v6.9.21'
CACHE_NAME = 'fieldvoice-pro-v6.9.21'
```

**Install:** Pre-caches ~100 static assets + CDN assets. Uses `self.skipWaiting()`.  
**Activate:** Deletes all caches starting with `fieldvoice-pro-` that don't match current version. Uses `self.clients.claim()`.

### Key JS Caching Behavior

JavaScript files use **network-first** with `cache: 'no-cache'` fetch option. This is critical because:
1. It bypasses the browser's HTTP disk cache (which was causing stale JS delivery)
2. Always gets fresh code from the server when online
3. Only falls back to SW cache when offline

This means **code updates are delivered immediately** on the next page load when online — no waiting for SW update cycle.

### Update Flow

1. Browser checks for SW updates periodically (or on navigation)
2. If new SW detected → `updatefound` event → new worker installs
3. When installed with existing controller → `showUpdateBanner()` shows blue "Update available — tap to refresh" banner
4. User clicks → `location.reload()`
5. New SW activates (old caches deleted), page loads fresh

### Manual PWA Refresh (Settings page)

`executeRefresh()`:
1. Delete all caches via `caches.keys()` + `caches.delete()`
2. Unregister all service workers
3. Redirect with cache-buster: `window.location.href = pathname + '?refresh=' + Date.now()`

---

## 6. PWA / Standalone Mode

### Detection

```js
// iOS standalone
window.navigator.standalone === true

// Android/desktop standalone
window.matchMedia('(display-mode: standalone)').matches
```

### What Changes in Standalone Mode

1. **Link interception** (`setupPWANavigation`): All same-origin `<a>` clicks are intercepted, `preventDefault()` called, then `window.location.href = link.href`. Without this, iOS Safari opens links in a new Safari tab outside the PWA.

2. **Safe area insets**: All pages set CSS `env(safe-area-inset-*)` padding for notch/dynamic island.

3. **No browser chrome**: No URL bar, no back/forward buttons. All navigation must be UI-provided.

### Manifest Configuration

```json
{
  "display": "standalone",
  "start_url": "./index.html",
  "scope": "./"
}
```

### iOS Add-to-Home-Screen Meta Tags (on all pages)

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="FieldVoice">
```

---

## 7. Navigation Graph

### Page-to-Page Links

```
landing.html ──────────────────────> login.html
                                        │
                                        ▼
                                    index.html (Dashboard)
                                   /  │  │  \  \
                                  /   │  │   \  \
                                 ▼    ▼  ▼    ▼  ▼
                          settings  projects  archives  permissions
                          .html     .html     .html     .html
                                    │
                                    ▼
                              project-config.html
                              (create/edit)

index.html ──(Begin Daily Report)──> quick-interview.html
                                         │
                                         ▼ (Finish & Process)
                                    report.html
                                         │
                                         ▼ (Submit)
                                    index.html?submitted=true
```

### Complete Navigation Matrix

| From → To | Mechanism | Condition |
|-----------|-----------|-----------|
| login → index | `location.href` | After successful auth |
| index → quick-interview | `location.href` | Begin Daily Report (with reportId + projectId) |
| index → projects | `location.href` | Manage Projects button |
| index → settings | `location.href` | Settings button |
| index → archives | `<a href>` | Report Archives link |
| index → project-config | `location.href` | Create Project (from picker modal) |
| index → permissions | `location.href` | Auto-redirect if not onboarded |
| quick-interview → index | `<a href>` | Back button |
| quick-interview → index | `location.href` | Cancel report |
| quick-interview → report | `location.href` | After AI processing |
| report → index | `<a href>` | Back button |
| report → index | `location.href` | After submit (`?submitted=true`) |
| report → index | `location.href` | After delete |
| settings → index | `<a href>` | Back button |
| projects → index | `location.href` | Select project (500ms delay) |
| projects → project-config | `location.href` | Edit button |
| project-config → projects | `location.href` | Cancel / after save |
| archives → index | `<a href>` | Back/Dashboard link |
| permissions → index | `location.href` | After finishSetup |
| landing → login | `<a href>` | CTA buttons |
| ANY → login | `location.href` | auth.js redirect (no session) |
| ANY → login | `location.href` | auth.signOut() |
| ANY (via AI) → ANY | `location.href` | AI assistant chat commands |

### Report Lifecycle Navigation (by status)

| Report Status | Card Click Destination |
|--------------|----------------------|
| `draft` | `quick-interview.html?reportId=...` |
| `pending_refine` | `quick-interview.html?reportId=...` |
| `refined` | `report.html?date=...&reportId=...` |
| `ready_to_submit` | `report.html?tab=preview&date=...&reportId=...` |
| `submitted` | `archives.html?id=...` |

---

## 8. iOS PWA Specifics & Known Quirks

### bfcache Behavior

iOS Safari PWA aggressively uses bfcache. When user presses back or switches apps:
- Page may be restored from bfcache (frozen state)
- `pageshow` fires but `event.persisted` is **unreliably set** on iOS
- IndexedDB connections from before freeze may be dead/stale

**Mitigations in index.html (main.js):**
1. `pageshow` handler is NOT gated on `event.persisted` — always refreshes
2. `visibilitychange` → visible triggers refresh (covers app switch)
3. `focus` event triggers refresh (final fallback)
4. All three use same `refreshDashboard()` with 2s cooldown to prevent triple-fire
5. IDB connection is reset (`idb.resetDB()`) on bfcache restore detection

**Mitigations in quick-interview.html:**
1. `visibilitychange` → hidden saves to localStorage + flushes backup
2. `pagehide` → same emergency save (more reliable on iOS than `beforeunload`)

**Mitigations in report.html:**
1. `visibilitychange` → hidden saves to localStorage + flushes backup
2. `pagehide` → same emergency save

### iOS 7-Day localStorage Eviction

Safari on iOS can evict localStorage after 7 days of non-use. Mitigations:
1. IndexedDB used as durable backup (also subject to eviction but less aggressively)
2. `navigator.storage.persist()` requested on every page load (auth.js + pwa-utils.js)
3. Supabase `interview_backup` table used as cloud backup for draft data
4. Recovery chain: localStorage → IndexedDB → Supabase interview_backup → fresh

### Standalone Mode Navigation Trap

Without `setupPWANavigation()`, tapping an `<a>` link in iOS standalone mode opens Safari app instead of navigating within the PWA. The fix intercepts all same-origin `<a>` clicks and uses `location.href` instead.

**Potential issue:** This only handles `<a>` tags. Navigation via `window.location.href = ...` (which is most navigation in this app) works fine in standalone mode without interception.

### beforeunload Unreliability

`beforeunload` is unreliable on iOS Safari. The app uses `pagehide` and `visibilitychange` as alternatives for emergency saves.

---

## 9. Event Listener Inventory

### Global Listeners (from shared modules loaded on most pages)

| Event | Source | Handler |
|-------|--------|---------|
| `DOMContentLoaded` | `auth.js` | Auth gate check |
| `DOMContentLoaded` | `ai-assistant.js` | Inject UI + GPS |
| `load` | `pwa-utils.js` | Register service worker |
| `online` | `pwa-utils.js` | Hide offline banner + callback |
| `offline` | `pwa-utils.js` | Show offline banner + callback |
| `online` | `realtime-sync.js` | Re-init subscriptions |
| `offline` | `realtime-sync.js` | Cleanup subscriptions |
| `beforeunload` | `realtime-sync.js` | Cleanup subscriptions |
| `click` (capture) | `pwa-utils.js` | Standalone mode link interception |

### index.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | Full dashboard init sequence |
| `pageshow` | `refreshDashboard('pageshow')` — NOT gated on persisted |
| `visibilitychange` | If visible → `refreshDashboard('visibilitychange')` |
| `focus` | `refreshDashboard('focus')` |

### quick-interview.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | Full interview init sequence |
| `visibilitychange` | If hidden → emergency save |
| `pagehide` | Emergency save |
| Various `input`/`change`/`blur` | Auto-save on form fields |

### report.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | Full report init sequence |
| `visibilitychange` | If hidden → emergency save |
| `pagehide` | Emergency save |
| `resize` | Re-scale preview |
| Various `input` | Auto-save on editable fields |

### settings.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | Init + load settings |
| `beforeunload` | Warn if dirty |
| `input` on form fields | Dirty detection + scratch save |

### project-config.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | Init + load/create project |
| `beforeunload` | Warn if dirty |
| `input`/`change` on form fields | Dirty tracking |

### archives.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | `init()` |
| `change` on projectFilter | Reload reports |
| `online` | Reinitialize |
| `offline` | Show warning |

### permissions.html-Specific Listeners

| Event | Handler |
|-------|---------|
| `DOMContentLoaded` | `init()` |

---

*End of audit. This document should be updated whenever navigation patterns, auth flow, or event listener behavior changes.*
