# FieldVoice Pro v6.9.31 — Comprehensive Codebase Review

> **Created:** 2026-02-19 07:00 CST
> **Last Updated:** 2026-02-19 13:45 CST
> **Author:** George (AI Assistant) — autonomous audit
> **Status:** ✅ COMPLETE
> **Rules:** READ-ONLY AUDIT — no code, Supabase, or n8n changes
> **Version:** v6.9.31 | 36,000 lines source | 83 JS modules | 11 HTML pages

---

## Table of Contents

1. [Foundation Modules](#1-foundation-modules) — auth, config, storage, data layer ✅
2. [Dashboard (index.html)](#2-dashboard) — homepage, 11 modules ✅
3. [Interview / Field Capture (quick-interview.html)](#3-interview--field-capture) — 11 modules ✅
4. [Report Editor (report.html)](#4-report-editor) — 11 modules ✅
5. [Projects & Project Config](#5-projects--project-config) — 6 modules ✅
6. [Settings, Archives, Login, Permissions, Landing](#6-other-pages) — 6 pages ✅
7. [Field Tools](#7-field-tools) — 14 tool modules ✅
8. [Shared Modules](#8-shared-modules) — AI assistant, sync, data store, etc. ✅
9. [Service Worker & PWA](#9-service-worker--pwa) ✅
10. [Supabase Backend Audit](#10-supabase-backend-audit) ✅
11. [n8n Workflow Audit](#11-n8n-workflow-audit) ✅
12. [Cross-Cutting Analysis](#12-cross-cutting-analysis) ✅
13. [Improvement Recommendations (Prioritized)](#13-improvement-recommendations) ✅

### Writing Scale Guide
- ~1 line of documentation per 10 lines of code
- 100-line file → ~10 lines of review
- 500-line file → ~50 lines of review
- 1000+ line file → ~100+ lines of review
- Adjust up for complex/critical files, down for simple ones

### Audit Markers
- 🔴 **BUG** — Actual error or broken behavior
- 🟡 **ISSUE** — Works but problematic (tech debt, risk, bad pattern)
- 🟠 **MAYBE** — Might be an issue, needs human verification
- 🔵 **IMPROVEMENT** — Opportunity to make things better
- 🟢 **GOOD** — Notably well-done, worth keeping
- ⚫ **SOFT-DELETE** — Currently hard-deletes data, needs soft-delete policy

---

## 1. Foundation Modules

These are loaded by every page and form the backbone of the app.

---

### 1.1 `js/config.js` (11 lines)

**What it does:** Defines Supabase URL, anon key, n8n webhook API key, and initializes the Supabase client.

**Exports:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `N8N_WEBHOOK_API_KEY`, `supabaseClient` (all global constants)

🟡 **ISSUE:** `N8N_WEBHOOK_API_KEY` is a static string (`'fvp-n8n-webhook-key-2026'`) baked into client-side code. Anyone can view-source and extract it. This is security by obscurity, not real auth. The key value itself isn't a secret — it's more of a basic check.

🔵 **IMPROVEMENT:** Consider moving webhook auth to Supabase Edge Functions that proxy to n8n, so the n8n URLs and keys never reach the client.

---

### 1.2 `js/storage-keys.js` (129 lines)

**What it does:** Central registry of all `fvp_*` localStorage key names. Also provides utility functions: `getStorageItem()`, `setStorageItem()`, `removeStorageItem()`, `getDeviceId()`, `addToDeletedBlocklist()`, `isDeletedReport()`, `aiConversationKey()`.

**Exports to window:** `STORAGE_KEYS`, `getStorageItem`, `setStorageItem`, `removeStorageItem`, `getDeviceId`, `addToDeletedBlocklist`, `isDeletedReport`, `removeFromDeletedBlocklist`, `aiConversationKey`

**30+ storage keys defined** covering: user identity (6 keys), permissions (8 keys), project state (3 keys), UI state (5 keys), org/migration/misc.

🟢 **GOOD:** Clean centralization of all key names. The `fvp_` prefix prevents collisions with other apps on the same origin.

🟢 **GOOD:** `getDeviceId()` uses `crypto.randomUUID()` with lazy initialization — clean pattern.

🟡 **ISSUE:** `addToDeletedBlocklist()` caps at 100 entries with `list.slice(-100)` — if a user deletes 101+ reports over time, old IDs roll off and could reappear via realtime sync. In practice unlikely, but worth noting.

🔵 **IMPROVEMENT:** The `ensureSharedScript()` function at top dynamically injects `broadcast.js` and `data-store.js` scripts if not already loaded — this is a workaround for script loading order. A proper module bundler would eliminate this.

---

### 1.3 `js/auth.js` (400 lines)

**What it does:** Shared auth module loaded on ALL pages. On page load: checks Supabase session → if none, redirects to login. Provides sign-out with enterprise-grade cleanup. Monitors session health with periodic checks and auth state listener.

**Key functions:** `requireAuth()`, `getCurrentUser()`, `getAuthUserId()`, `signOut()`, `upsertAuthProfile()`, `loadAuthProfile()`, `ensureOrgIdCached()`

**Auth flow:**
1. `DOMContentLoaded` → `requireAuth()` checks session
2. If valid → injects sign-out button, caches org_id, starts session monitor
3. `auth.ready` promise resolves → other modules can await it before making Supabase calls
4. Periodic session check every 5 minutes
5. `onAuthStateChange` listener for TOKEN_REFRESHED and SIGNED_OUT events
6. Session expiry shows a warning toast (doesn't force-redirect — protects unsaved work)

🟢 **GOOD:** `auth.ready` promise pattern is excellent — allows other modules to safely wait for auth before querying Supabase.

🟢 **GOOD:** `navigator.storage.persist()` is called on every protected page load — addresses the data eviction risk.

🟢 **GOOD:** Sign-out cleanup is thorough — clears specific keys, wildcard AI conversations, and IndexedDB stores.

🟡 **ISSUE:** `upsertAuthProfile()` stores values with `localStorage.setItem()` directly (raw strings) while most other code uses `setStorageItem()` (JSON.stringify). This means `getStorageItem(STORAGE_KEYS.USER_NAME)` returns the raw string, but `getStorageItem(STORAGE_KEYS.PROJECTS)` returns parsed JSON. Inconsistent but works because `getStorageItem` tries `JSON.parse` and falls back to raw.

🟠 **MAYBE:** `injectSignOutButton()` only injects on `settings.html` — is there a reason the sign-out button shouldn't appear on other pages? Users on the Dashboard might expect to be able to sign out without navigating to Settings.

🟠 **MAYBE:** The `dataStore` stores being cleared on sign-out include `currentReports`, `draftData`, `reportData`, `userProfile`, `projects` — but there's no mention of clearing `cachedArchives` or `photos`. Could stale cached archives or photos persist across user switches on shared devices.

---

### 1.4 `js/indexeddb-utils.js` (939 lines)

**What it does:** Complete IndexedDB wrapper providing CRUD operations for 7 object stores. Handles database versioning (currently v7), iOS Safari bfcache issues, connection timeouts, and stale connection detection.

**7 Object Stores:**
| Store | Key | Purpose | Version Added |
|-------|-----|---------|--------------|
| `projects` | `id` | Cached project objects | v1 |
| `userProfile` | `deviceId` | Inspector profile data | v1 |
| `photos` | `id` (indexes: reportId, syncStatus) | Photo blobs with GPS | v2 |
| `currentReports` | `id` (indexes: project_id, status) | Active report stubs | v4 |
| `draftData` | `reportId` | Full draft data during interview | v5 |
| `cachedArchives` | `key` | Cached archive queries | v6 |
| `reportData` | `reportId` | Durable report data for cross-page handoff | v7 |

**Key patterns:**
- `ensureDB()` → `initDB()` with connection health check (tries a readonly transaction to verify connection is alive)
- 3-second timeout on `indexedDB.open()` to handle iOS Safari bfcache hang
- `db.onclose` listener for unexpected iOS connection closures
- `resetDB()` and `closeAllIDBConnections()` for cleanup before navigation

🟢 **GOOD:** The iOS bfcache handling is thorough — timeout, stale connection detection, `onclose` listener. This addresses real-world Safari bugs.

🟢 **GOOD:** `onupgradeneeded` handles all 7 versions incrementally — safe for users upgrading from any prior version.

🟡 **ISSUE:** The compatibility shim at the bottom (lines ~870-930) replaces `window.idb` methods with `window.dataStore` equivalents if `dataStore` exists. This creates two code paths — the original IDB functions and the dataStore wrappers. If `dataStore` loads after `indexeddb-utils.js`, the shim never fires. Load order dependency.

🟡 **ISSUE:** Every CRUD function does `ensureDB().then(function(database) { return new Promise(...) })` — lots of boilerplate. This is functional but could be DRYed into a helper like `withStore(storeName, mode, callback)`.

🟠 **MAYBE:** `deletePhotosByReportId()` uses a cursor to delete one-by-one. For a report with many photos, this could be slow. An alternative: clear the store and re-add non-matching entries, or use a single `clear()` if it's report-scoped.

🔵 **IMPROVEMENT:** The `archives` store was deleted in v3. The comment says "was never actively used." But `cachedArchives` was added in v6. Naming is confusing — are these the same concept? Could be consolidated or at least documented better.

---

### 1.5 `js/data-layer.js` (358 lines)

**What it does:** The unified data access abstraction. All pages should import from here instead of directly hitting IndexedDB or Supabase. Pattern: IndexedDB-first, Supabase-fallback, cache on fetch.

**Key functions:**
- `loadProjects()` — IDB-only, no Supabase fallback (explicit cloud refresh needed)
- `refreshProjectsFromCloud()` — Supabase fetch → clear IDB → re-cache → return
- `normalizeProject()` — Converts snake_case Supabase rows to camelCase JS objects
- `fromSupabaseProject()` / `toSupabaseProject()` — Bidirectional conversion with JSONB contractors parsing
- `loadUserProfile()` — IDB → Supabase fallback → cache
- `refreshUserProfileFromCloud()` — Supabase fetch → IDB cache
- `getCachedLocation()` — Returns cached GPS from localStorage

🟢 **GOOD:** Clean separation. `normalizeProject()` handles the snake_case/camelCase conversion that previously caused dual-check patterns throughout the app.

🟢 **GOOD:** `loadProjects()` deliberately doesn't auto-fetch from Supabase — prevents unexpected network calls when loading from cache is sufficient.

🟡 **ISSUE:** `refreshProjectsFromCloud()` does `await window.idb.clearStore('projects')` then re-caches. If the app crashes between clear and re-cache, the user loses all local project data until next cloud refresh. A safer pattern: write new data first, then clear old.

🟠 **MAYBE:** `normalizeProject()` has a `contractors` field that does `JSON.parse()` if it's a string. But if the data comes from IndexedDB (already JS objects), the parse isn't needed and could theoretically throw. The `try/catch` handles it, but it's running unnecessary work on every project load.

---

### 1.6 `js/supabase-utils.js` (146 lines)

**What it does:** Supabase query helpers. Provides `fromSupabaseProject()` and `toSupabaseProject()` conversion functions, plus `fetchProjectsWithContractors()`.

🟡 **ISSUE:** This file substantially duplicates functionality in `data-layer.js`. Both files have `fromSupabaseProject()` and both handle the snake_case → camelCase conversion. The `data-layer.js` version is more complete. This file may be vestigial — needs verification of whether any page imports it directly instead of going through data-layer.

🔵 **IMPROVEMENT:** Consolidate into `data-layer.js` and remove `supabase-utils.js` if nothing depends on it directly.

---

### 1.7 `js/ui-utils.js` (385 lines)

**What it does:** UI helper utilities used across all pages: toast notifications, date formatting, HTML escaping, and GPS caching.

**Key functions:**
- `showToast(message, type, duration)` — Creates/shows styled toast notifications
- `escapeHtml(str)` — XSS protection for user content in innerHTML
- `formatDate()`, `getLocalDateString()`, `getTodayDateString()` — Date helpers
- `getCachedLocation()` / `updateCachedLocation()` — GPS lat/lng in localStorage

🟢 **GOOD:** `escapeHtml()` is properly used as XSS protection throughout the app.

🟠 **MAYBE:** `getCachedLocation()` also exists in `data-layer.js`. Possible duplication — need to check which one is actually called by consumers.

---

### 1.8 `js/media-utils.js` (310 lines)

**What it does:** Photo/camera utilities for capturing, compressing, and managing images.

**Key functions:**
- `compressImage(file, maxWidth, quality)` — Resizes and compresses photos using Canvas API
- `capturePhoto()` — Opens camera via `<input type="file">` trick
- `getGPSFromExif()` — Extracts GPS coordinates from photo EXIF data
- `dataURLtoBlob()` — Converts base64 data URLs to Blob objects

🟢 **GOOD:** Image compression before upload saves bandwidth and storage costs.

🟠 **MAYBE:** `compressImage()` defaults to `maxWidth=1200` and `quality=0.7`. For construction photos where detail matters (cracks, measurements, material conditions), 1200px width and 70% quality might lose important visual detail. Worth reviewing if inspectors have complained about photo quality.

---

### 1.9 `js/pwa-utils.js` (164 lines)

**What it does:** Service Worker registration, install prompt handling, and update detection.

**Key functions:**
- `registerServiceWorker()` — Registers `sw.js`, handles updates
- `handleInstallPrompt()` — Captures `beforeinstallprompt` event for PWA install banner
- `checkForUpdates()` — Checks SW registration for waiting workers

🟢 **GOOD:** Handles the `controllerchange` event to auto-reload when a new SW activates.

🟠 **MAYBE:** No Capacitor detection — registers SW even in the native app. (Jackson already asked about this — SW isn't needed in Capacitor.)

---

### 1.10 `js/report-rules.js` (663 lines)

**What it does:** Business logic enforcement for report lifecycle. Validates operations and returns results but does NOT modify data or show UI — callers handle that.

**Key constants:**
- `REPORT_STATUS`: draft → pending_refine → refined → ready_to_submit → submitted
- `CAPTURE_MODE`: freeform, guided
- `GUIDED_SECTIONS`: weather, activities, personnel, equipment, issues, communications, qaqc, safety, visitors, photos

**Key functions:**
- `categorizeReport(report)` — Returns "Late Draft", "Active Draft", "Refined", "Submitted" etc.
- `canBeginNewReport(projectId, date, currentReports)` — Validates one-report-per-project-per-day rule
- `canFinishInterview(report)` — Checks minimum data requirements
- `getReportAge(report)` — Returns days since creation
- `isReportExpired(report)` — Checks if draft is from a different day (auto-expires)

🟢 **GOOD:** Clean separation of business rules from UI logic. Pure functions that return results without side effects.

🟢 **GOOD:** The one-report-per-project-per-day rule is well-enforced.

🟡 **ISSUE:** `isReportExpired()` compares report date to today's date — a draft started at 11:59 PM expires at 12:00 AM (1 minute later). There's no grace period. An inspector working late on a report could lose their draft at midnight.

🟠 **MAYBE:** `categorizeReport()` reads `STORAGE_KEYS.PROJECTS` from localStorage to get project names. If the projects cache is stale or empty, report cards on the dashboard show without project names. Not a crash, but bad UX.

---

### Foundation Summary

**Total foundation code: ~3,505 lines across 10 files**

**Key architectural patterns:**
- IIFE module pattern (no ES modules, no bundler)
- Everything exported to `window.*` globals
- IndexedDB-first, Supabase-fallback data access
- `auth.ready` promise for safe initialization ordering
- `fvp_*` prefixed localStorage keys
- `escapeHtml()` for XSS protection

**Top issues found:**
1. 🟡 `supabase-utils.js` duplicates `data-layer.js` — needs consolidation
2. 🟡 `refreshProjectsFromCloud()` clears cache before writing — data loss risk on crash
3. 🟡 Webhook API key exposed in client-side code
4. 🟡 IDB compatibility shim depends on script load order
5. 🟠 Sign-out doesn't clear `cachedArchives` or `photos` stores
6. 🟠 Report expiry at midnight — no grace period for late-night inspectors

---

## 2. Dashboard

The dashboard is `index.html` — the app homepage and primary launch point. It shows weather conditions, active report cards grouped by project, a "Begin Daily Report" flow, field tools carousel, messages, deliveries, drone ops, emergency info, calendar stub, and archives link.

**Total code: ~3,847 lines** (1,122 HTML + 2,725 JS across 11 modules)

---

### 2.1 `index.html` (1,122 lines)

**What it does:** Dashboard page shell. Loads all foundation scripts, page-specific modules, and 13 field tool scripts. Contains the full HTML for: header, conditions bar (weather + drone), report cards container, report status/CTA, field tools carousel (with duplicated items for seamless CSS animation), report archives link, calendar stub, messages card (hardcoded thread list + inline chat UI), deliveries card (hardcoded 4 delivery items), photo log map (marketing placeholder), emergency strip + panel, and 12 full-screen tool overlays (compass, measure, maps, calc, slope, level, decibel, timer, flashlight, QR, AR tape, photo measure, scan viewer).

**Script load order (41 scripts):**
- `<head>`: Supabase CDN, config, console-capture, cloud-photos, delete-report, storage-keys, broadcast, data-store, realtime-sync, report-rules, supabase-utils, pwa-utils, ui-utils, pull-to-refresh, indexeddb-utils, data-layer, auth
- `<body>` inline: field-tools, calendar, messages
- `<body>` bottom: 13 tool scripts, weather, panels, cloud-recovery, report-cards, report-creation, main, deep-links, toggle-panel, ai-assistant

🟡 **ISSUE:** The HTML file is 1,122 lines with substantial hardcoded content. The Messages section (threads with Mike Rodriguez, James Sullivan, Diana Lopez, Kevin Walsh) and Deliveries section (concrete, rebar, gravel, form lumber) are entirely **hardcoded demo data** — not connected to any backend. An end user would see fake messages and fake deliveries that never change. This is misleading unless clearly labeled as mockups.

🟡 **ISSUE:** The field tools carousel duplicates all 11 tool cards in the HTML (Set 1 + Set 2 with `aria-hidden="true"`) for CSS infinite scroll animation. That's 22 DOM elements for a visual effect. Works, but doubles the carousel DOM.

🟠 **MAYBE:** 41 synchronous `<script>` tags block rendering. On a slow mobile connection at a construction site, this could mean a several-second blank screen before the first paint. A bundler or `defer`/`async` strategy would help.

🟠 **MAYBE:** External CDN dependencies (Supabase, FontAwesome, Leaflet, jsQR) are loaded synchronously in `<head>`. If any CDN is slow or down, the entire page blocks. Consider local fallbacks or `defer`.

🔵 **IMPROVEMENT:** The 12 full-screen tool overlays (compass, measure, maps, calc, slope, level, decibel, timer, flashlight, QR, AR tape, photo measure, scan viewer) account for ~250 lines of boilerplate HTML. These could be generated dynamically by each tool's JS, reducing index.html by ~20%.

🟢 **GOOD:** Safe area inset handling (`env(safe-area-inset-*)`) is applied to body, header, and all overlay toolbars — proper iPhone notch/home-indicator support.

🟢 **GOOD:** `user-scalable=no` in viewport prevents accidental pinch-zoom during field use.

---

### 2.2 `js/index/main.js` (670 lines)

**What it does:** Dashboard orchestrator. Manages the full initialization lifecycle:
1. `DOMContentLoaded` → sync render from localStorage → wait auth → `refreshDashboard()`
2. `refreshDashboard()` → load IDB reports + projects → cloud project refresh → weather (fire-and-forget) → prune stale reports → cloud report sync → render
3. Bfcache/navigation handlers (pageshow, visibilitychange, focus) → re-trigger `refreshDashboard()`

**Key functions:**
- `refreshDashboard(source)` — Full data refresh with debounce, cooldown, concurrent-call queueing, and multi-phase loading (localStorage → IDB → cloud)
- `pruneCurrentReports()` — Removes malformed entries and submitted reports >7 days old
- `_renderFromLocalStorage()` — Instant synchronous paint from localStorage while async data loads
- `withTimeout(promise, ms, fallback, label)` — Generic promise timeout wrapper used throughout
- `loadReportsFromIDB()` — Reads all reports from dataStore into `window.currentReportsCache`
- `checkPermissionState()` / `shouldShowOnboarding()` / `shouldShowBanner()` — Permission flow logic
- `autoDismissSubmittedReportsFromToday()` — Auto-archives submitted reports 3s after returning from submit

**State management:**
- `projectsCache` (var, window-accessible) — In-memory project list
- `window.currentReportsCache` — In-memory report list (shared across modules)
- `_dashboardRefreshing` — Debounce lock
- `_lastRefreshTime` / `_REFRESH_COOLDOWN` — 2-second cooldown between refreshes
- `_pendingRefresh` / `_pendingRefreshSource` — Coalesced rerun system

🟢 **GOOD:** The 3-phase render strategy (localStorage instant → IDB local → cloud network) is excellent for perceived performance. The user never sees a blank dashboard.

🟢 **GOOD:** `refreshDashboard()` has robust debouncing — concurrent calls queue, a 2s cooldown prevents triple-fire from pageshow+visibilitychange+focus, and pending refreshes coalesce. This handles real iOS PWA quirks.

🟢 **GOOD:** `withTimeout()` utility prevents indefinite hangs from IDB or network failures. Every async operation has a timeout cap (4-15s depending on operation).

🟢 **GOOD:** Generous timeouts (6s IDB, 12s cloud, 8s auth) with fallback rendering. The dashboard always shows *something* even if everything fails.

🟡 **ISSUE:** The `submitted=true` URL param handling shows a success banner and auto-dismisses after 3s — but the 3s timer starts *before* `refreshDashboard()` finishes loading reports from IDB/cloud. If IDB is slow (iOS bfcache), `autoDismissSubmittedReportsFromToday()` might run against stale `window.currentReportsCache` and dismiss nothing.

🟡 **ISSUE:** `pruneCurrentReports()` calls `window.dataStore.replaceAllReports(reports)` with a plain object, but `replaceAllReports` might expect a Map. Depends on the dataStore implementation. If it accepts objects fine, no issue; if it expects Map, this silently fails to prune.

🟠 **MAYBE:** AI response cache cleanup iterates all localStorage keys backwards on every page load. With many keys, this is O(n) per load. Not a problem now, but could slow down if localStorage grows large.

🟠 **MAYBE:** The v1.13.0 migration that clears IDB projects runs once per device. If the flag `MIGRATION_V113_IDB_CLEAR` is set but a future version needs a similar migration, the pattern needs a new key each time. Consider a version-number-based migration tracker.

---

### 2.3 `js/index/report-cards.js` (781 lines)

**What it does:** Renders the report cards section on the dashboard. Groups reports by project, renders per-project collapsible sections with individual report cards showing status badges, timestamps, and swipe-to-delete functionality. Also handles report dismissal (soft-hide for submitted reports) and full deletion.

**Key functions:**
- `renderReportCards(reportsInput)` — Main render: filters deleted/dismissed, groups by project, renders project sections with report cards
- `renderProjectSection(project, reports, expanded)` — Renders a collapsible project header with its report cards
- `renderReportCard(report)` — Single card with status badge, timestamps, expandable details, swipe-to-delete wrapper
- `getReportHref(report)` — Routes to correct page based on status (draft→interview, refined→report editor, submitted→archives)
- `updateReportStatus()` — Always renders the "Begin Daily Report" CTA button
- `initSwipeToDelete()` — Attaches touch/mouse swipe handlers to all rendered cards
- `confirmDeleteReport(reportId)` — Shows delete confirmation modal (dismiss for submitted, delete for others)
- `dismissReport(reportId, options)` — Soft-hide: sets `dashboard_dismissed_at` in Supabase + IDB + memory cache
- `executeDeleteReport(reportId, overlay)` — Full cascade delete with card removal animation

**Swipe-to-delete implementation (lines 329-495):**
- CSS injected dynamically via `injectSwipeStyles()`
- Touch + mouse event handlers with direction lock (horizontal vs vertical scroll detection)
- 8px dead zone before deciding direction, 80px threshold to trigger swipe
- Mutual exclusion: opening one card closes others

🟢 **GOOD:** Direction lock with dead zone is proper — prevents accidental swipes during vertical scroll. This is a common mobile UX mistake that's handled correctly here.

🟢 **GOOD:** `dismissReport()` updates three layers (Supabase → IDB → in-memory cache) consistently, with graceful degradation if cloud fails.

🟢 **GOOD:** Report card routing via `getReportHref()` sends users to the correct page based on report lifecycle status — clean UX.

🟡 **ISSUE:** `renderReportCards()` does a full innerHTML replacement of the entire `reportCardsSection` every time it's called. This destroys DOM state (scroll position, swipe state, expanded details) and re-initializes all swipe handlers. Called frequently from `refreshDashboard()` (which fires on pageshow, visibilitychange, focus, and broadcasts). A diff-based or targeted update would be smoother.

🟡 **ISSUE:** The `confirmDeleteReport()` overlay click handler uses string interpolation to find the wrapper: `querySelector('.swipe-card-wrapper[data-report-id="${reportId}"]')`. If `reportId` contains quotes or special CSS selector characters, this breaks. UUIDs are safe, but defensive coding would use `CSS.escape()`.

🟠 **MAYBE:** `renderReportCard()` builds HTML with inline `onclick` handlers that reference `escapeHtml(uuid)` in template literals. The UUID is also embedded raw in `data-report-id`. If a UUID somehow contained HTML-special characters, the `data-report-id` attribute would break. Standard v4 UUIDs are hex+dashes only, so this is safe in practice.

⚫ **SOFT-DELETE:** `executeDeleteReport()` calls `deleteReportFull()` which (per the name) performs a hard delete. The cascade goes: blocklist → localStorage → IDB → Supabase. Reports should use soft-delete (`status='deleted'` + `deleted_at` timestamp) rather than actual row removal, so they can be recovered or audited.

🔵 **IMPROVEMENT:** `updateReportStatus()` always shows the same static "Begin Daily Report" CTA regardless of state. The function name suggests it should reflect actual status (e.g., "You have 3 active drafts" or "All reports submitted today"). Consider making it contextual.

---

### 2.4 `js/index/report-creation.js` (276 lines)

**What it does:** Handles the "Begin Daily Report" flow: opens project picker modal, validates eligibility per project, checks for duplicate reports (same project + same day), creates Supabase report row, and navigates to the interview page.

**Key functions:**
- `beginDailyReport()` → `showProjectPickerModal()` — Opens modal, loads projects from IDB + cloud
- `selectProjectAndProceed(projectId)` — Checks for existing report on same project+day, shows duplicate modal or creates new UUID
- `createSupabaseReportRow(reportId, projectId)` — Upserts a draft row to Supabase `reports` table
- `showDuplicateReportModal()` — "Report Already Exists" modal with Go To / Delete & Start Fresh / Cancel

🟢 **GOOD:** The duplicate check prevents the most common user error — starting two reports for the same project on the same day.

🟢 **GOOD:** `createSupabaseReportRow()` uses `upsert` with `onConflict: 'id'` — idempotent. Safe if called twice with the same UUID.

🟡 **ISSUE:** `showProjectPickerModal()` always calls `refreshProjectsFromCloud()` when online, which does a full Supabase query + IDB clear + re-cache. This happens every time the user taps "Begin Daily Report" — even if they just loaded the dashboard 2 seconds ago. Should respect a cache age.

🟡 **ISSUE:** `selectProjectAndProceed()` references `activeProjectCache` (line: `activeProjectCache?.projectName`) but `activeProjectCache` is never defined in this file or main.js. This would be `undefined`, causing the project name in the duplicate modal to fall back to "this project". Harmless but unintended.

🟠 **MAYBE:** `createSupabaseReportRow()` fires-and-forgets the Supabase insert — the `await` in `selectProjectAndProceed` waits for it, but if it fails, the user still navigates to the interview page with a report that has no cloud row. The interview page would need to handle this gracefully (creating the row later). Need to verify if it does.

---

### 2.5 `js/index/cloud-recovery.js` (276 lines)

**What it does:** Cross-device sync recovery. When a user creates a report on one device and opens the dashboard on another, this module fetches active reports from Supabase and merges them into local IDB. Also pre-caches `report_data` and `interview_backup` for recovered reports so they load instantly when tapped. Rehydrates photos from Supabase storage.

**Key functions:**
- `recoverCloudDrafts()` — Main recovery: queries Supabase for active reports, compares timestamps (cloud wins if newer), merges into local store
- `cacheInterviewBackups(reportIds, localReports)` — Fetches `interview_backup` table data and converts `page_state` to `_draft_data` format for local cache

**Recovery flow:**
1. Get all local reports from IDB
2. Query Supabase for all user's active reports (draft/pending/refined/ready)
3. For each cloud report: skip if on deleted blocklist, skip if local is same-age-or-newer
4. Merge cloud report into local store (preserve local `_draft_data` if exists)
5. Post-merge: fetch `report_data` for all recovered IDs, cache in IDB
6. For drafts: also fetch `interview_backup` and build `_draft_data` from `page_state`
7. For all recovered: fetch photos from Supabase `photos` table, inject into `report_data.originalInput.photos`
8. Broadcast `reports-recovered` to other tabs

🟢 **GOOD:** Timestamp-based conflict resolution (cloud wins if newer) is the right approach for this architecture. Combined with the deleted blocklist, it prevents both stale overwrites and zombie resurrection.

🟢 **GOOD:** Preserving local `_draft_data` when merging cloud metadata is smart — prevents clobbering unsaved edits with older cloud state.

🟢 **GOOD:** Pre-caching `interview_backup` and `report_data` means tapping a recovered report card loads instantly — no spinner, no additional network request.

🟡 **ISSUE:** `recoverCloudDrafts()` is entirely promise-chain based (no async/await at the top level). The deeply nested `.then()` callbacks are hard to follow. The `cacheInterviewBackups()` call at the end happens inside a `.then()` that's inside another `.then()` — 3+ levels deep. This should be refactored to async/await for readability.

🟡 **ISSUE:** The `recoveredIds` variable (line ~117) is set to `Object.keys(localReports)` — which is ALL local reports, not just the newly recovered ones. This means `report_data` is fetched for every local report, not just the ones that were actually recovered. Wasteful query that grows with report count.

🟠 **MAYBE:** `cacheInterviewBackups()` rebuilds `_draft_data` from `page_state` with a hardcoded field mapping (30+ fields). If the `page_state` schema changes, this mapping silently produces wrong data. There's no version check or validation.

🟠 **MAYBE:** Photo rehydration fetches photos and injects them into `originalInput.photos` only if the array is empty. But if the user has taken some photos locally and others are in the cloud, the local photos would prevent cloud photos from loading. Needs a merge strategy.

---

### 2.6 `js/index/panels.js` (286 lines)

**What it does:** Lazy-loads content for expandable detail panels: Weather Details, Drone Ops, and Emergency Info. Panels are only populated when first opened (via `onPanelOpen()` called from `togglePanel()`).

**Key functions:**
- `loadWeatherDetailsPanel()` — Wind, UV, humidity grid + sunrise/sunset + Windy.com radar iframe
- `loadDroneOpsPanel()` — FAA Part 107 flight window, wind assessment, elevation, magnetic declination, GPS coordinates
- `loadEmergencyPanel()` — GPS coordinates display, Call 911 button, share location, find nearest hospital
- `shareEmergencyLocation()` — Web Share API for emergency GPS sharing

**External APIs used:**
- `api.open-meteo.com/v1/elevation` — Elevation in meters
- `www.ngdc.noaa.gov/geomag-web` — Magnetic declination
- `api.sunrise-sunset.org` — Sunrise/sunset times
- `embed.windy.com` — Weather radar iframe

🟢 **GOOD:** Lazy loading — panels don't fetch data until opened. This saves bandwidth and API calls.

🟢 **GOOD:** Emergency panel uses `getFreshLocation()` (high-accuracy GPS) rather than cached location — correct for safety-critical use.

🟢 **GOOD:** Drone ops panel integrates Part 107 regulations (legal flight window, wind assessment) — genuine utility for construction drone operations.

🟡 **ISSUE:** `loadWeatherDetailsPanel()` and `loadDroneOpsPanel()` both have a polling loop waiting for `weatherDataCache`: `while (!weatherDataCache && attempts < 20) { await new Promise(r => setTimeout(r, 500)); attempts++; }`. This is a 10-second busy-wait. A better pattern: await a promise that resolves when weather loads, or use an event emitter.

🟠 **MAYBE:** The NOAA geomagnetic declination API (`www.ngdc.noaa.gov`) is a US government API that may not work for projects outside the US. If FieldVoice is used internationally, this would fail silently.

🟠 **MAYBE:** The Windy.com iframe loads a full interactive map (~2-5MB) inside an expandable panel. On mobile data at a construction site, this could be expensive. Consider a static image fallback with a "Load Interactive" button.

---

### 2.7 `js/index/weather.js` (191 lines)

**What it does:** Fetches weather data from Open-Meteo API, updates the conditions bar (temperature, conditions, precipitation), caches extended data for detail panels, and manages the drone flight status indicator.

**Key functions:**
- `syncWeather()` — Fetches weather, updates UI, caches extended data, triggers background GPS refinement
- `updateConditionsBar()` — Updates wind/gust/flight-status display in the conditions bar
- `fetchSunriseSunset(lat, lon)` — Fetches sunrise/sunset from sunrise-sunset.org (cached)

**Weather flow:**
1. Use cached GPS (fast) → fetch Open-Meteo forecast
2. Update conditions bar immediately
3. Cache extended hourly data (wind, UV, humidity)
4. Background: get fresh GPS → if moved >0.01° (~1km), re-fetch weather
5. On failure: single retry after 5 seconds

🟢 **GOOD:** Location strategy — use cached GPS for initial speed, then refine in background. Weather doesn't need exact coordinates; this is pragmatic.

🟢 **GOOD:** The re-fetch-on-movement threshold (0.01° ≈ 1km) is sensible — only re-fetches if the user is at a meaningfully different location.

🟢 **GOOD:** Single retry with `_weatherRetryScheduled` flag prevents infinite retry loops.

🟡 **ISSUE:** `weatherDataCache` is a module-level global (`var weatherDataCache = null`). Multiple modules read it directly. If `syncWeather()` fails, other modules get `null` and must handle that. This works but couples weather.js tightly to its consumers.

🟠 **MAYBE:** The `currentHour` index lookup in `data.hourly.time` finds the first match — but hourly data may span multiple days. If the forecast returns 168 hours (7 days), the first hour match could be from today or tomorrow depending on timezone handling. The `timezone=auto` parameter helps, but edge cases at midnight could pick the wrong day's hour.

---

### 2.8 `js/index/messages.js` (84 lines)

**What it does:** Provides the interactive chat thread UI for the Messages card. Contains 4 hardcoded conversation threads (Mike Rodriguez, James Sullivan, Diana Lopez, Kevin Walsh) with pre-written construction-related message bubbles.

**Key functions:**
- `openMessageThread(index)` — Shows chat view with bubbles for selected thread
- `closeMessageThread()` — Returns to thread list
- `sendMessageChat()` — Adds user-typed message as a bubble (local-only, no backend)

🟡 **ISSUE:** This entire module is demo/mockup data. The messages are hardcoded, the "send" function only appends to the DOM (no persistence, no API call), and the thread list in index.html is static HTML. This should either be connected to a real messaging backend or clearly labeled as "Coming Soon" like the calendar.

🟠 **MAYBE:** The module uses an IIFE pattern `(function() { ... })()` but attaches functions to `window` inside it. This is fine but inconsistent with other modules that use bare `function` declarations (which are automatically global in non-strict mode).

---

### 2.9 `js/index/deep-links.js` (59 lines)

**What it does:** Reads URL query params (`openTool`, `openPanel`, `mapType`) and auto-opens the corresponding tool overlay or panel after page load. Cleans URL params after reading. Used by the AI assistant to navigate users to specific tools.

🟢 **GOOD:** Clean URL after reading params prevents the tool from re-opening on page refresh.

🟢 **GOOD:** 600ms delay after `window.load` ensures all scripts are initialized before trying to open tools.

🟠 **MAYBE:** The `openPanel=emergencyPanel` path clicks the emergency strip element. If the strip's `onclick` attribute changes, this breaks. A direct function call would be more robust.

---

### 2.10 `js/index/toggle-panel.js` (28 lines)

**What it does:** Generic panel toggle with mutual exclusion for conditions bar panels (weather ↔ drone ops). Rotates chevron icon and triggers lazy-load via `onPanelOpen()`.

🟢 **GOOD:** Mutual exclusion is clean — opening weather auto-closes drone ops and vice versa. Prevents two heavy panels from being open simultaneously.

🟢 **GOOD:** Minimal, focused function. Does one thing well.

---

### 2.11 `js/index/field-tools.js` (33 lines)

**What it does:** Opens/closes the field tools modal grid, provides `fieldToolAction(fn)` wrapper that closes the modal before executing a tool's open function. Also manages the auto-scrolling carousel with touch-pause behavior.

🟢 **GOOD:** Carousel pauses on touch and resumes after 3 seconds — prevents fighting with the user's scroll intent.

---

### 2.12 `js/index/calendar.js` (41 lines)

**What it does:** Renders a simple monthly calendar grid when the Calendar panel is first opened. Uses MutationObserver to detect panel visibility change and renders once.

🟢 **GOOD:** Lazy render via MutationObserver — doesn't compute the calendar until the panel is opened.

🟠 **MAYBE:** Currently a static calendar with no report data overlay. The "Coming Soon" label in the HTML is accurate, but the code does generate a functional calendar. When this gets connected to reports data, the rendering logic will need significant expansion.

---

### Dashboard Summary

**Total dashboard code: ~3,847 lines (1,122 HTML + 2,725 JS)**

**Key architectural patterns:**
- 3-phase progressive rendering (localStorage → IDB → cloud) — never shows a blank screen
- Debounced/cooldown refresh system handles iOS PWA edge cases
- Lazy-loaded expandable panels reduce initial data fetching
- Swipe-to-delete with proper touch direction locking
- Cross-device sync via cloud recovery with timestamp-based conflict resolution
- Fire-and-forget weather fetch (never blocks dashboard)

**Top issues found:**
1. 🟡 Messages and Deliveries sections are hardcoded demo data — misleading to end users
2. 🟡 `renderReportCards()` does full innerHTML replacement, destroying DOM state and re-initializing swipe handlers on every refresh
3. 🟡 `showProjectPickerModal()` always hits Supabase on open — no cache-age check
4. 🟡 `recoverCloudDrafts()` deeply nested promise chains — hard to follow/maintain
5. 🟡 `recoveredIds` fetches `report_data` for ALL local reports, not just newly recovered ones
6. 🟡 10-second busy-wait loops in panels waiting for `weatherDataCache`
7. ⚫ `deleteReportFull()` performs hard deletes — needs soft-delete policy
8. 🟠 41 synchronous script tags may cause slow initial load on mobile
9. 🟠 Undefined `activeProjectCache` reference in report-creation.js
10. 🟠 Photo rehydration doesn't merge local + cloud photos

---

## 3. Interview / Field Capture

The interview page (`quick-interview.html`) is where inspectors capture field data. It supports two capture modes: **Quick Notes** (freeform entries + photos) and **Guided Sections** (structured form with 10 collapsible sections). The page handles draft persistence across devices, photo capture/upload, real-time auto-backup to Supabase, and AI processing via n8n webhook.

**Total code: ~6,477 lines** (966 HTML + 5,511 JS across 11 modules)

---

### 3.1 `quick-interview.html` (966 lines)

**What it does:** Page shell with three mutually exclusive view states: Loading Overlay → Mode Selection → Quick Notes UI *or* Guided Sections UI. Also contains modals for: switch mode confirmation, cancel report, permissions setup, network error, submit confirmation, and a full-screen processing overlay with animated 4-step progress.

**Three view states:**
1. `#loadingOverlay` — full-screen spinner during initialization
2. `#modeSelectionScreen` — "Quick Notes" vs "Guided Sections" choice
3. `#minimalModeApp` / `#app` — the actual capture UI (one hidden, one visible)

**Guided sections (10 collapsible cards):**
Weather, Work Summary (contractors), Contractor Personnel, Equipment, Issues & Delays, Communications, QA/QC Testing, Safety, Visitors/Deliveries, Progress Photos

🟢 **GOOD:** The loading overlay with progressive status text ("Connecting to database" → "Checking report state" → "Loading project data") gives users confidence the app is working, not frozen.

🟢 **GOOD:** Processing overlay is properly "click-proof" with `pointer-events: none`, `touch-action: none`, and `user-select: none` — prevents accidental double-submits during AI processing.

🟡 **ISSUE:** CSS for `.auto-expand` textareas sets `min-height: 72px` and `max-height: 400px` in the page-level `<style>` block, while the JS `autoExpand()` function (in a shared module) may use different constraints. Potential mismatch between CSS and JS height management.

🟠 **MAYBE:** The `#processingOverlay` error buttons re-enable `pointer-events: auto` to allow interaction, but the `_blockTouch` handler checks `e.target.closest('#processingError')` — if the error div restructures, clicks could be blocked on the retry button.

---

### 3.2 `js/interview/state-mgmt.js` (362 lines)

**What it does:** Core state management for entries, toggle states, and N/A marking. Provides CRUD operations for timestamped entries (used across all guided sections), Yes/No toggle buttons with locking behavior, and N/A marking for optional sections.

**Key patterns:**
- `window.interviewState` (aliased as `IS`) — shared mutable state namespace across all interview modules
- Entries: `createEntry()`, `getEntriesForSection()`, `updateEntry()`, `deleteEntryById()` — append-only log with soft-delete (`is_deleted` flag)
- Toggles: `setToggleState()`, `getToggleState()`, `isToggleLocked()` — once answered, toggles lock (prevents accidental changes)
- Inline editing: `startEditEntry()` swaps `<p>` for `<textarea>`, auto-saves on typing (500ms debounce), `saveEditEntry()` swaps back

🟢 **GOOD:** Entry soft-delete (`is_deleted: true`) — entries are never removed from the array, just filtered out. This preserves audit trail.

🟢 **GOOD:** Toggle locking after selection prevents accidental changes during field use (e.g., bumping the screen).

🟡 **ISSUE:** `IS` is re-declared with `var IS = window.interviewState` at the top of *every* interview module (11 times). This works (all point to the same object) but is redundant. A single declaration in state-mgmt.js would suffice.

🟠 **MAYBE:** `createEntry()` uses `entry_order: getNextEntryOrder(section)` which counts non-deleted entries. If entries are deleted and re-added, the order numbers can have gaps or duplicates. Sorting by `entry_order` in `getEntriesForSection()` would still work, but the numbers wouldn't be sequential.

---

### 3.3 `js/interview/persistence.js` (1,240 lines)

**What it does:** The largest and most critical interview module. Handles all data persistence: IDB draft save/restore, Supabase interview_backup (cloud backup), auto-save with debouncing, photo upload to Supabase Storage, and the full report load chain (IDB → Supabase interview_backup → fresh).

**Key systems:**
1. **Draft persistence:** `saveToLocalStorage()` → IDB (dual: `saveReport()` metadata + `saveDraftData()` full draft)
2. **Cloud backup:** `flushInterviewBackup()` → Supabase `interview_backup` table, 2-second debounce, fire-and-forget with retry
3. **Stale backup tracking:** `fvp_backup_stale_{reportId}` localStorage flags for surviving page kills
4. **Drain pending backups:** `drainPendingBackups()` — on init/pageshow/online, flushes any backups that were interrupted
5. **Report loading:** `getReport()` — IDB → Supabase interview_backup (2s timeout) → fresh, with timestamp-based conflict resolution
6. **Photo upload:** `uploadPhotoToSupabase()`, `uploadPendingPhotos()`, `deletePhotoFromSupabase()`

🟢 **GOOD:** The stale backup tracking with `fvp_backup_stale_*` localStorage flags is a clever solution for surviving iOS page kills. The drain-on-init pattern ensures no data is lost even if the page was killed mid-backup.

🟢 **GOOD:** `getReport()` does timestamp-based conflict resolution between IDB and cloud — cloud wins only if strictly newer. This prevents overwriting local unsaved edits.

🟢 **GOOD:** The 2-second timeout on Supabase interview_backup check in `getReport()` prevents slow cellular from blocking the page load. Falls back gracefully to IDB.

🟢 **GOOD:** `buildInterviewPageState()` creates a canonical schema for the backup, and `_buildCanonicalPageStateFromDraft()` handles converting various draft formats to that schema — defensive against schema drift.

🟡 **ISSUE:** `saveToLocalStorage()` saves to both `dataStore.saveReport()` and `dataStore.saveDraftData()` — two separate IDB writes on every save. These could be batched into a single transaction for atomicity and performance.

🟡 **ISSUE:** `checkReportState()` always returns `true` with a comment "v6.6.15: Simplified - always allow page to load." This function is awaited during init but does nothing. Dead code that adds unnecessary async overhead.

🟡 **ISSUE:** `uploadPendingPhotos()` iterates through all pending photos sequentially (`for...of` loop with `await`). For a report with 10+ photos, this could take 30+ seconds. Parallel upload (e.g., `Promise.allSettled` with concurrency limit of 3) would be significantly faster.

🟡 **ISSUE:** Signed URLs for photos expire after 1 hour (the code has a `SEC-04` comment acknowledging this). Photos cached in IDB or displayed in long editing sessions will show broken images after expiry. No refresh mechanism exists.

🟠 **MAYBE:** `flushInterviewBackup()` calls `supabaseRetry()` with 3 retries, but on failure it re-sets `_interviewBackupDirty = true`. If the network is persistently down, this creates an infinite retry cycle on the 2-second timer. Should have a max-retry count per session.

🟠 **MAYBE:** `getReport()` merges cloud `page_state` fields onto a fresh report with individual `if (ps.X) report.X = ps.X` assignments (25+ fields). If a new field is added to `page_state` but not to this merge block, it silently drops. A generic `Object.assign` or spread would be safer.

⚫ **SOFT-DELETE:** `confirmCancelReport()` calls `deleteReportFull()` — hard deletes the entire report. Cancelled reports should be soft-deleted for audit trail.

⚫ **SOFT-DELETE:** `deletePhotoFromSupabase()` calls `supabaseClient.from('photos').delete()` — hard deletes photo metadata rows.

---

### 3.4 `js/interview/ui-flow.js` (373 lines)

**What it does:** Manages capture mode selection (Quick Notes vs Guided Sections), mode switching with data preservation, and the processing overlay UI (show/hide/step-progress/error states).

**Key functions:**
- `shouldShowModeSelection()` — Shows mode picker if no `captureMode` set AND report is empty
- `selectCaptureMode(mode)` / `showModeUI(mode)` — Switches between minimal and guided UIs
- `confirmSwitchMode()` — Preserves data when switching modes (freeform entries → additionalNotes)
- `showProcessConfirmation()` — Promise-based confirm dialog with live online/offline status
- `showProcessingOverlay()` / `setProcessingStep()` / `showProcessingError()` — 4-step animated progress

🟢 **GOOD:** `showProcessConfirmation()` returns a Promise and updates the online status in real-time while the dialog is open. If the user goes offline while the dialog is shown, the "Process" button auto-disables.

🟢 **GOOD:** Mode switching preserves photos and weather (shared data) and migrates freeform entries to additionalNotes when going minimal→guided.

🟡 **ISSUE:** The processing overlay blocks ALL keyboard input via `_blockKeys()` which calls `e.preventDefault()` + `e.stopImmediatePropagation()` on every keydown. This is aggressive — on desktop, it prevents accessibility shortcuts (screen readers, OS-level shortcuts). Should only block during the active processing state, not the error state.

---

### 3.5 `js/interview/freeform.js` (517 lines)

**What it does:** Quick Notes (minimal/freeform) mode UI: timestamped field note entries with inline editing, a visual coverage checklist (10 DOT categories), weather display, photo capture, and photo management.

**Key patterns:**
- Freeform entries: `addFreeformEntry()` → inline edit → auto-save (500ms debounce) → save on blur
- Coverage checklist: visual-only checkboxes (Weather, Work Performed, etc.) — no validation impact
- Photo handling: `handleMinimalPhotoInput()` → GPS → compress → markup overlay → IDB save → background upload
- Migration: `migrateFreeformNotesToEntries()` — converts old single-string `freeformNotes` to entries array

🟢 **GOOD:** Photos are added to the UI immediately with a local data URL, then uploaded in the background. The upload status indicator (spinner → checkmark → cloud icon) gives real-time feedback.

🟢 **GOOD:** `deleteMinimalPhoto()` uses undo pattern — removes from UI immediately, shows "tap to undo" toast for 3 seconds, then actually deletes from IDB/Supabase. Great mobile UX.

🟡 **ISSUE:** `renderMinimalPhotos()` sets caption values via DOM (`ta.value = p.caption`) after innerHTML to prevent XSS. But photo URLs are injected directly into `src="${p.url}"`. If a malicious URL were stored (e.g., via tampered cloud data), this could be an XSS vector via `onerror` handler. The `onerror` handler is hardcoded to a safe SVG fallback, mitigating this.

🟠 **MAYBE:** `handleMinimalPhotoInput()` opens `openPhotoMarkup()` for *every* photo. On construction sites where inspectors snap 20+ photos quickly, the mandatory markup step could be a workflow bottleneck. Consider a "quick capture" mode that skips markup.

---

### 3.6 `js/interview/guided-sections.js` (409 lines)

**What it does:** Renders all 10 guided mode sections, handles the accordion expand/collapse pattern, dictation hint banner, and delegates to section-specific renderers. The main `renderSection(section)` function is a large switch statement dispatching to 10 different rendering paths.

**Key patterns:**
- Accordion: `toggleSection()` — mutual exclusion (only one section open at a time)
- Toggle-gated sections: Communications, QA/QC, Visitors have Yes/No toggles. Input areas stay in DOM (iOS Safari fix) but are hidden via CSS when toggle is "No"
- Backward compatibility: Each section renders both new entry-based notes AND legacy array-based notes
- Photos rendered with upload status indicators and inline caption editing

🟢 **GOOD:** Input areas for toggle-gated sections are always in DOM — the comment "iOS Safari fix" is accurate. iOS Safari has bugs with dynamically created textareas not receiving focus.

🟢 **GOOD:** Accordion pattern (one section at a time) reduces visual overwhelm on mobile and keeps the user focused on one task.

🟡 **ISSUE:** `renderSection()` is a 250-line switch statement that rebuilds entire section DOMs via innerHTML. Each call re-creates all entries, re-attaches implicit event handlers. For sections with many entries (10+ issues or safety notes), this causes visible flicker.

🟡 **ISSUE:** The photos section sets caption values via DOM after innerHTML (`IS.report.photos.forEach((p, i) => { const ta = document.getElementById('caption-input-' + i); if (ta) ta.value = p.caption; })`). If `renderSection('photos')` is called while a user is typing a caption, their in-progress text is lost and replaced with the last saved value.

🔵 **IMPROVEMENT:** The backward compatibility for both entry-based and legacy array-based notes (issues, safety) means dual rendering paths. Once all users are on v6+, the legacy paths can be removed to simplify the code.

---

### 3.7 `js/interview/contractors-personnel.js` (752 lines)

**What it does:** The two most complex guided sections: (1) Contractor Work Summary — per-contractor or per-crew work entry cards with "No work performed" toggles, and (2) Contractor Personnel — per-contractor personnel count inputs (superintendent, foreman, operator, laborer, surveyor, other).

**Contractor Work Cards:**
- Each project contractor gets a collapsible card
- v6.9: If contractor has crews, renders sub-cards per crew instead of one card per contractor
- "No work performed" checkbox toggles entry visibility
- Auto-save on typing for work description textareas
- Entries are timestamped and editable

**Personnel Cards:**
- Collapsible cards per contractor with 6 numeric inputs (2x3 grid)
- Auto-updates totals across all contractors
- Visual style changes based on data presence (color-coded borders/headers)

🟢 **GOOD:** The crew-level work entry system (v6.9) is well-structured — master "No work" toggle for the whole contractor, plus individual crew toggles. This maps well to real construction site structure.

🟢 **GOOD:** Personnel card style updates (`updatePersonnelCardStyle()`) give immediate visual feedback — cards go from grey/slate to colored when data is entered.

🟡 **ISSUE:** `renderContractorWorkCards()` rebuilds ALL contractor cards (including all crew sub-cards) on any change — even a single-character edit that triggers auto-save. For a project with 5 contractors × 3 crews each = 15 textarea re-renders. This destroys typing cursor position.

🟡 **ISSUE:** `toggleNoWork()` calls `renderContractorWorkCards()` which re-initializes ALL auto-save listeners via `initContractorWorkAutoSave()`. The `textarea.dataset.autoSaveInit` guard should prevent duplicates, but since innerHTML replaces the textareas entirely, the guard is reset and new listeners are attached to new elements. This is correct behavior (new DOM = new listeners) but the full re-render is overkill.

🟠 **MAYBE:** Trade abbreviation mapping in `getTradeAbbreviation()` is hardcoded for ~20 common trades. If a contractor has a trade not in the map, it gets truncated to 4 characters which may not be meaningful (e.g., "pile fabrication" → "PILE").

---

### 3.8 `js/interview/equipment-manual.js` (294 lines)

**What it does:** Equipment section with structured rows (contractor, type/model, quantity, status/hours) and manual add functions for all guided sections (Issues, Safety, Communications, QA/QC, Visitors).

**Equipment rows:**
- Dynamic add/delete with `addEquipmentRow()` / `deleteEquipmentRow()`
- Each row: contractor dropdown, type text input, qty number input, status dropdown (Idle, 1hr-10hr)
- Responsive layout: stacks vertically on mobile, grid on desktop

**Manual add functions:**
- `addIssue()`, `addSafetyNote()`, `addCommunication()`, `addQAQC()`, `addVisitor()` — all follow the same pattern: check if auto-save already created the entry, if so just clear input; otherwise create entry

🟢 **GOOD:** The auto-save integration is clean — if the user types (triggering auto-save) then clicks "+", it doesn't create a duplicate entry. The `IS.autoSaveState[section]?.saved` check handles this edge case.

🟢 **GOOD:** Equipment status uses predefined hour increments (Idle, 1hr-10hr) instead of free text — standardizes data for reporting.

🟠 **MAYBE:** Equipment hour tracking maxes at 10hr. For projects with extended shifts (12-16 hour days are common in construction), this cap may be insufficient.

---

### 3.9 `js/interview/photos.js` (346 lines)

**What it does:** Photo handling for guided mode: capture, GPS tagging, compression, annotation markup, IndexedDB storage, background upload to Supabase Storage, and caption editing.

**Photo flow:**
1. `handlePhotoInput()` → validate type/size → GPS (multi-reading high accuracy) → compress (1200px, 0.7 quality) → photo markup overlay → create metadata object → save to IDB → render → background upload

🟢 **GOOD:** Photo base64 is stored ONLY in IndexedDB, never in `IS.report.photos[]` or localStorage. This prevents localStorage quota exhaustion (marked `OFF-01` in code).

🟢 **GOOD:** Background upload with real-time status indicators (spinner → checkmark) and automatic retry at FINISH for failed uploads.

🟢 **GOOD:** Photo deletion uses undo pattern (3-second window) matching freeform mode — consistent UX.

🟡 **ISSUE:** `handlePhotoInput()` processes photos sequentially in a `for` loop with `await` for each photo's GPS + compress + markup + IDB save + background upload chain. For 5+ photos selected at once, each photo blocks on markup annotation. The user must annotate one photo at a time.

🔵 **IMPROVEMENT:** `updatePhotoCaption()` updates both `IS.report.photos[idx]` and the IDB copy via `window.idb.getPhoto()` + `window.idb.savePhoto()` — two IDB reads/writes per caption keystroke (after debounce). Could batch or skip the IDB update until blur.

---

### 3.10 `js/interview/ui-display.js` (264 lines)

**What it does:** Weather fetch for the interview page, preview text generation for all section headers, status icon management, and progress bar calculation.

**Key functions:**
- `fetchWeather()` — Open-Meteo API fetch with fresh GPS, populates `IS.report.overview.weather`
- `updateAllPreviews()` — Updates all 10 section preview texts based on current report state
- `updateStatusIcons()` — Sets green checkmark or grey chevron on each section header
- `updateProgress()` — Calculates completion percentage across 10 sections

🟢 **GOOD:** `updateProgress()` counts 10 sections with clear completion criteria for each. The progress bar gives inspectors a sense of how much is left.

🟠 **MAYBE:** `updateAllPreviews()` and `updateStatusIcons()` iterate all 10 sections and touch 20+ DOM elements. Called on every `saveReport()` (which fires on every keystroke after 500ms debounce). For a page with ~50 DOM elements to update, this could cause layout thrashing on low-end devices.

---

### 3.11 `js/interview/finish-processing.js` (612 lines)

**What it does:** The AI processing pipeline and report finishing flow. Builds the payload, calls the n8n webhook, saves the AI response, persists the refined report, and navigates to the report editor.

**Processing pipeline (4 steps):**
1. Save report data to Supabase
2. Upload pending photos
3. AI processing via n8n webhook (60s timeout)
4. Save AI response + update status to "refined" + navigate to report.html

**Key functions:**
- `buildProcessPayload()` — Assembles full report data for the n8n webhook
- `callProcessWebhook(payload)` — POST to n8n with 60s AbortController timeout
- `saveAIResponse()` — Upserts to `ai_submissions` table (input + output + processing time)
- `finishReportFlow(options)` — Shared flow accepting mode-specific callbacks (validate, prepareReport, preProcess)
- `finishMinimalReport()` / `finishReport()` — Thin wrappers with mode-specific behavior

🟢 **GOOD:** `finishReportFlow()` is well-abstracted — mode-specific behavior is injected via the options object. Both minimal and guided finish flows share the same pipeline with different validation and preparation steps.

🟢 **GOOD:** After AI processing succeeds, the code verifies the IDB save with `getReportData()` and re-saves if verification fails — defensive against IDB write failures.

🟢 **GOOD:** IDB connections are explicitly closed before navigation (`dataStore.closeAll()`) — prevents iOS Safari from blocking the next page's IDB upgrade.

🟡 **ISSUE:** The n8n webhook URL is hardcoded: `'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report'`. Combined with the API key from `config.js`, both the endpoint and auth are client-side visible. Anyone could call this webhook directly.

🟡 **ISSUE:** `buildProcessPayload()` includes full contractor details from `IS.activeProject.contractors` including crews. If contractors have sensitive info (phone numbers, licenses, etc.), this gets sent to n8n and stored in `ai_submissions.original_input`.

🟡 **ISSUE:** After AI processing, the report status transitions happen across 3 storage layers (IDB report metadata, IDB report data, Supabase report_data) — if any middle step fails, the status is inconsistent. A transaction pattern would be safer.

🟠 **MAYBE:** The 5-second timeout on `supabaseRetry()` for the `report_data` sync after processing means that on slow connections, the user navigates to report.html before the cloud has the data. The comment says "IDB fallback available" — but if the user opens report.html on a different device, the data might not be there yet.

---

### Interview / Field Capture Summary

**Total code: ~6,477 lines (966 HTML + 5,511 JS across 11 modules)**

**Key architectural patterns:**
- Dual-mode capture (Quick Notes / Guided Sections) with data preservation on mode switch
- Entry-based timestamped notes with soft-delete and inline editing
- Yes/No toggle locking for optional sections
- Multi-layered persistence: IDB → Supabase interview_backup → localStorage stale flags
- Background photo upload with real-time status indicators and undo-delete
- 4-step animated processing overlay with input blocking
- Shared `finishReportFlow()` abstraction for both modes

**Top issues found:**
1. 🟡 Sequential photo upload during FINISH — should parallelize with concurrency limit
2. 🟡 `renderContractorWorkCards()` rebuilds ALL cards on any change — destroys cursor position
3. 🟡 `renderSection('photos')` destroys in-progress caption text
4. 🟡 Signed photo URLs expire after 1 hour — no refresh mechanism
5. 🟡 n8n webhook URL + API key hardcoded in client-side code
6. 🟡 `checkReportState()` is dead code — always returns true
7. 🟡 Dual IDB writes per save (saveReport + saveDraftData) — could batch
8. ⚫ `confirmCancelReport()` hard-deletes reports — needs soft-delete
9. ⚫ `deletePhotoFromSupabase()` hard-deletes photo metadata rows
10. 🟠 Full DOM re-render on every auto-save may cause layout thrashing on low-end devices

---

## 4. Report Editor

**HTML:** `report.html` (1,421 lines)
**JS modules:** 11 files in `js/report/` (4,644 lines)
**Total: ~6,065 lines**

The report editor is the post-AI-processing view where inspectors review, edit, and submit their daily report. Three tabs: Form (editable fields), Original Notes (read-only capture data), and Preview/Submit (paginated RPR preview with PDF generation).

---

### 4.1 report.html (1,421 lines)

Three-tab layout (Form View / Original Notes / Preview & Submit) with a sticky header bar.

**Structure:**
- Top bar: back arrow, project logo, "RPR Daily Report", date badge, menu (delete/save)
- Tab bar: Form View | Original Notes | Preview & Submit
- Form View: 11 sections — Project Overview, Weather, Work Summary (contractor cards), Personnel, Equipment, Issues, QA/QC, Safety, Communications, Visitors, Photos, Signature, Debug Panel
- Original Notes tab: hidden `originalNotesView` div with guided/freeform capture data
- Preview tab: `previewContent` div with `previewScaler` for CSS-scaled pages
- Modals: Submit confirmation + Delete confirmation
- Scripts loaded: 11 report modules + `js/shared/ai-assistant.js`

🟢 Clean separation of form sections with consistent styling
🟢 Modals use explicit show/hide rather than complex state machines
🟡 Inline `onclick` handlers throughout (e.g., `onclick="toggleDebugPanel()"`) — not ideal for CSP but consistent with the rest of the codebase
🟡 Debug panel is included in production HTML — should be feature-flagged or dev-only

---

### 4.2 data-loading.js (406 lines)

Defines the shared `window.reportState` (RS) namespace and all data loading/merging logic.

**Key functions:**
- `window.reportState` — shared state object (report, currentReportId, activeProject, projectContractors, userEdits, userSettings, etc.)
- `getReportDateStr()` — reads `?date=` from URL or falls back to `getLocalDateString()`
- `loadReport()` — IDB-first load with Supabase `report_data` freshness check (2s timeout), timestamp comparison for newer-wins merge; falls back to IDB if cloud is stale/unavailable
- `createFreshReport()` — template with overview, activities, operations, equipment, photos, signature, AI fields
- `getValue()` / `getAIValue()` / `getTextFieldValue()` — priority merge: `userEdits > aiGenerated > report defaults`
- `getNestedValue()` / `setNestedValue()` — dot-path accessor helpers
- `saveReportSilent()` — saves without marking dirty (prevents sync broadcast loops)

🟢 Robust IDB-first + cloud-freshness architecture with timestamp comparison
🟢 Handles offline gracefully — 2s abort controller timeout on cloud check
🟢 Sprint 13 correctly removed deprecated `report_backup` fallback
🟡 **ISSUE:** `loadReport()` defines `var urlParams` (line ~25 of loadReport), and main.js's DOMContentLoaded also declares `var urlParams` — no collision since they're in different scopes, but easy to confuse
🟡 **ISSUE:** Cloud freshness check merges `ai_generated` from cloud with IDB fallback, but `user_edits` uses cloud-only (no merge) — if user edited on device A offline and device B submitted newer cloud data, device A edits are lost when cloud is adopted
🟠 **MAYBE:** `loadReport()` redirects to `quick-interview.html` for `pending_refine` status but uses `setTimeout(1500)` — user could navigate away before redirect fires
🔵 The cloud freshness check could extract into a reusable `syncReportFromCloud(reportId)` helper for use in other pages

---

### 4.3 form-fields.js (1,005 lines)

The largest report module. Populates all form fields and manages contractor cards, personnel table, equipment table, and photo rendering.

**Key functions:**
- `populateAllFields()` — reads from `getValue()` priority chain and sets all DOM fields; auto-calculates contract day from NTP date; renders dynamic sections
- `calculateShiftDuration()` — computes hours/minutes between start/end time (handles overnight)
- `markUserEditedFields()` — adds `user-edited` CSS class to fields with userEdits
- `pathToFieldId()` — mapping from dot-path to DOM element ID
- `renderWorkSummary()` — renders contractor cards with no-work toggle, narrative textarea, equipment/crew inputs, and per-contractor "Refine" button; simplified textarea if no contractors defined
- `getContractorActivity()` — priority merge: `userEdits > aiGenerated.activities (by ID then by name) > report.activities`
- `toggleNoWork()` — show/hide work fields, auto-focus narrative on toggle off
- `setupContractorListeners()` — input+blur event listeners on narrative, equipment, crew fields with debounced save
- `updateContractorActivity()` — reads DOM values into RS.report.activities and RS.userEdits
- `renderPersonnelTable()` — contractor × role grid (superintendents, foremen, operators, laborers, surveyors, others)
- `getContractorOperations()` — priority merge same pattern as activities, with name fallback for freeform mode
- `updatePersonnelRow()` / `updatePersonnelTotals()` — keeps row/column totals in sync
- `getEquipmentData()` — resolves equipment from report or AI, maps `equipmentId` to project config type
- `renderEquipmentTable()` — editable rows with contractor dropdown, type input, qty, status select
- `addEquipmentRow()` — appends new blank row to equipment table
- `renderPhotos()` — photo cards with loading/error states, metadata (date, time, GPS), editable captions
- `handlePhotoLoad()` — detects portrait/landscape orientation from natural dimensions
- `handlePhotoError()` — attempts re-sign from `storage_path` before showing error; retry once per image
- `saveTextFieldEdits()` — force-captures textarea values into userEdits before preview
- `getCrewActivity()` — crew-level activity lookup for contractors with multiple crews

🟢 Photo error recovery with automatic URL re-signing is excellent UX
🟢 Priority merge system (userEdits > AI > defaults) is consistent and well-implemented
🟢 Auto-expanding textareas with `auto-expand` class
🟢 Contractor name fallback matching for freeform mode is a smart compatibility layer
🟡 **ISSUE:** `renderWorkSummary()` generates HTML with inline `onclick` handlers containing contractor IDs — if a contractor ID contains special characters, this could break (unlikely with UUIDs, but fragile pattern)
🟡 **ISSUE:** `renderPhotos()` uses `debounce(1000)` for caption input but `blur` with no debounce — two saves can fire in quick succession
🟡 **ISSUE:** `addEquipmentRow()` uses `tbody.querySelectorAll('tr').length` for index — if rows are deleted, indices can collide with existing equipment data
🟡 **ISSUE:** `handlePhotoError()` uses `dataset.resignRetried` as string `'true'` — this survives re-renders, but if `renderPhotos()` re-runs, it creates new `<img>` elements without the flag, potentially causing infinite retry loops
🟠 **MAYBE:** `renderEquipmentTable()` generates `[1,2,3,...10]` hours options inline in a `.map()` — if more granularity is needed (0.5 hr increments), this is hardcoded
🔵 The repeated `input` + `blur` listener pattern (save on input debounced, save on blur immediate) appears in 3 places — could be extracted to a `setupDebouncedSave(element, callback)` helper

---

### 4.4 original-notes.js (293 lines)

Renders the "Original Notes" tab — read-only view of raw capture data from the interview.

**Key functions:**
- `populateOriginalNotes()` — detects capture mode (freeform vs guided), populates appropriate sections
- `renderOriginalWorkByContractor()` — groups work entries by contractor (and crew), renders timestamped tables
- `renderOriginalPersonnelTable()` — original personnel data in read-only table
- `renderOriginalEquipmentTable()` — original equipment data
- `renderEntriesSection()` — generic timestamped entry renderer for issues/qaqc/communications/visitors
- `renderSafetySection()` — safety entries with incident status indicator
- `populateOriginalPhotos()` — photo grid with thumbnails and captions

🟢 Good separation: original notes are purely read-only, no editing logic
🟢 Supports both freeform (Quick Notes) and guided mode display
🟢 Timestamped entries sorted chronologically
🟡 **ISSUE:** Freeform entries sorted by `timestamp || created_at` but both fallback to `0` — if neither exists, sort is unstable
🟡 **ISSUE:** `populateOriginalPhotos()` uses `photo.url` directly — if the signed URL has expired, broken images appear with no re-sign logic (unlike `handlePhotoError()` in form-fields.js)

---

### 4.5 autosave.js (332 lines)

Auto-save system with debounced local + cloud persistence.

**Key functions:**
- `setupAutoSave()` — attaches `input` + `blur` listeners to all mapped form fields; field-to-path mapping object covers all 25+ form fields
- `scheduleSave()` — 500ms debounce timer for `saveReport()`
- `saveReport()` — saves to IDB via `saveReportToLocalStorage()`, shows save indicator, marks Supabase dirty
- `markReportBackupDirty()` / `flushReportBackup()` — 5s debounced upsert to `report_data` table with `supabaseRetry(3)` and org_id
- `saveReportToLocalStorage()` — queued (`_reportSaveQueue = Promise chain`) to avoid concurrent IDB writes; saves both `reportData` and `report` metadata; broadcasts `report-updated` via BroadcastChannel
- `saveReportToSupabase()` — full report row upsert to `reports` table (called separately from autosave, used for explicit saves)
- `_deferFieldUpdate()` — deferred field sync for multi-device: buffers incoming changes and applies on blur to avoid disrupting active typing
- `saveNow()` — immediate save + flush (bypasses debounce)

🟢 Smart save queue using Promise chain prevents concurrent IDB writes
🟢 Deferred field updates (`_deferFieldUpdate`) prevent jarring mid-type overrides from realtime sync
🟢 BroadcastChannel notification for multi-tab awareness
🟢 Cloud autosave uses `supabaseRetry(3)` with proper error handling
🟡 **ISSUE:** `flushReportBackup()` only upserts `user_edits` and `status` to `report_data` — it does NOT include `ai_generated` or `original_input`. If a user opens a report on a new device that has no IDB data, the cloud `report_data` may be missing these fields from the autosave path (they'd only be present from the initial interview processing write)
🟡 **ISSUE:** `saveReportToLocalStorage()` falls back to `existingData.projectId || RS.activeProject?.id` — if `RS.activeProject` is null (load failure), this could save with `projectId: undefined`, breaking future lookups
🟡 **ISSUE:** The `_reportSaveQueue` promise chain never catches in-chain errors, only at the end — if `getReportData()` throws, the chain breaks silently until the `.catch()` fires
🟠 **MAYBE:** Safety incident radio button saves with `scheduleSave()` (500ms debounce) — for a binary toggle, immediate save might be more appropriate

---

### 4.6 ai-refine.js (274 lines)

Per-field and per-contractor AI text refinement via n8n webhook.

**Key functions:**
- `checkPendingRefineStatus()` — shows banner if report.meta.status is `pending_refine`
- `retryRefineProcessing()` — re-sends queued payload to `fieldvoice-v69-refine-report` webhook (30s timeout)
- `refineTextField(textareaId)` — sends individual text section to `fieldvoice-v69-refine-text` webhook; maps textarea IDs to section names; replaces textarea value with AI result
- `refineContractorNarrative(contractorId)` — same as above but for contractor-specific narratives; includes contractor name in context

🟢 Good UX: button shows spinner during processing, checkmark on success, error indicator on failure, all with auto-reset
🟢 AbortController with 20s/30s timeouts prevent hanging requests
🟡 **ISSUE:** `N8N_PROCESS_WEBHOOK` and `N8N_REFINE_TEXT_WEBHOOK` URLs are hardcoded in client-side JavaScript — exposes webhook endpoints to anyone inspecting the code
🟡 **ISSUE:** `retryRefineProcessing()` sends `N8N_WEBHOOK_API_KEY` in headers — this API key is exposed in the client bundle (same issue as interview module)
🟡 **ISSUE:** `refineTextField()` checks `refinedText.includes('[not provided]')` as a failure indicator — fragile string matching; if the AI response contains this phrase legitimately, it would falsely reject
🟡 **ISSUE:** After successful refine, `textarea.dispatchEvent(new Event('input'))` triggers the autosave path, but the button's "Done!" state is set via setTimeout(2000) — if the user navigates away during those 2 seconds, no issue, but the button state is cosmetic-only with no cancellation
🔵 The refine pattern (send text, get refined text, replace) is identical between `refineTextField` and `refineContractorNarrative` — could extract a shared `refineText(textarea, sectionName, extraContext)` function

---

### 4.7 preview.js (478 lines)

Generates the paginated RPR Daily Report preview (HTML pages styled to look like printed report).

**Key functions:**
- `renderPreview()` — builds 3+ pages of HTML: Page 1 (overview table + work summary), Page 2 (operations + equipment + issues + communications), Page 3 (QA/QC + safety + visitors), Page 4+ (photos, 4 per page)
- `scalePreviewToFit()` — CSS transform scaling to fit preview pages within viewport width; adjusts wrapper height to prevent dead space
- Helper functions: `formVal()`, `previewFormatDate()`, `previewFormatTime()`, `previewCalcShift()`, `previewFormatText()`, `previewFormatTradesAbbrev()`, `previewGetContractorName()`, `previewFormatEquipNotes()`

🟢 Sorted contractor display: contractors with work appear first, no-work at bottom; prime before sub
🟢 Crew-level narrative support for contractors with multiple crews
🟢 Responsive scaling with `requestAnimationFrame` and resize listener
🟢 Photo pages auto-paginate (4 photos per page) with proper page numbering
🟡 **ISSUE:** `renderPreview()` defines `formVal()` locally — this shadows the identical `formVal()` in submit.js. Not a bug since they're equivalent, but violates DRY
🟡 **ISSUE:** `previewFormatTradesAbbrev()` has a hardcoded abbreviation map — not configurable per project; new trade types fall through to `.substring(0, 6).toUpperCase()` which may be unclear
🟡 **ISSUE:** Preview HTML uses `escapeHtml()` for most values but `sigDetails` (signature) is built with raw string concatenation including the name — if a name contains HTML characters, it would render incorrectly in the signature block
🟠 **MAYBE:** Photos in preview use original `photo.url` — on mobile with many high-res photos, this could consume significant memory; thumbnails would be more appropriate for preview

---

### 4.8 pdf-generator.js (765 lines)

Generates vector PDF using jsPDF direct drawing (no HTML-to-canvas approach).

**Key functions:**
- `generateVectorPDF()` — complete PDF rendering with:
  - Letter-size pages (612×792 pt, 36pt margins)
  - Logo image embedding (pre-loaded as data URL, max 800px dimension)
  - Report header, section headers, overview table, work summary, operations/equipment tables
  - Text sections with bullet point formatting and multi-page overflow
  - Photo pages (4 per page) with caption text
  - Dynamic page break detection (`checkPageBreak()`) with header re-draw
  - Page numbering with post-generation total page count fix
- `loadImageAsDataURL(url)` — image-to-canvas-to-dataURL converter with 10s timeout and 800px max dimension
- Helper functions mirror preview.js: `pdfFormatDate`, `pdfFormatTime`, `pdfCalcShift`, `pdfFormatTradesAbbrev`, `pdfGetContractorName`, `pdfFormatEquipNotes`

🟢 Vector PDF with crisp text — far superior to HTML-to-canvas screenshot approach
🟢 Multi-page text box overflow (`drawTextBox`) handles long content gracefully with proper border continuation
🟢 Equipment table filters empty/placeholder rows before rendering — clean output
🟢 Page footer uses two-pass approach: placeholder `{{TOTAL}}` on first pass, then overwrites with actual count — clever
🟢 Photo embedding with quality control (max 800px, JPEG 85%)
🟡 **ISSUE:** `formVal()` is defined AGAIN locally (third copy, after preview.js and submit.js) — three identical functions
🟡 **ISSUE:** `drawTextBox()` returns `totalH` when content fits on one page but `0` when it spans multiple pages (because `curY` is already positioned). Callers use `curY += drawTextBox(...)` — for multi-page boxes, this adds 0 which is correct, but for single-page boxes this adds the full height. The asymmetric return value is confusing and error-prone.
🟡 **ISSUE:** `loadImageAsDataURL()` uses `crossOrigin = 'anonymous'` — Supabase signed URLs should support this, but if CORS headers change, all photo embedding silently fails (resolves `null`)
🟡 **ISSUE:** `pdfFormatTradesAbbrev()` has a DIFFERENT abbreviation map than `previewFormatTradesAbbrev()` in preview.js — preview has fewer entries. The PDF adds `concrete pavement`, `asphalt pavement`, `fencing`, `drainage`, etc. These should be unified.
🟠 **MAYBE:** Photo loading in PDF is sequential (`await loadImageAsDataURL` per photo) — for reports with many photos, this could be slow; parallel loading with `Promise.all` would be faster
🔵 The helper functions (`formVal`, `pdfFormatDate`, etc.) are near-identical copies of preview.js functions — should be extracted to a shared `report-utils.js` module

---

### 4.9 submit.js (321 lines)

Orchestrates the submit flow: duplicate check → PDF generation → upload → finalization → cleanup.

**Key functions:**
- `handleSubmit()` — main orchestrator: online check → duplicate detection (same project+date in 'submitted' status) → generate PDF → upload to Supabase storage → ensure report exists → save submitted data → update status → cleanup IDB → redirect to index
- `uploadPDFToStorage()` — uploads PDF blob to `report-pdfs` bucket; creates 1-hour signed URL for access
- `ensureReportExists()` — upserts report row in `reports` table as prerequisite for foreign key integrity
- `saveSubmittedReportData(pdfUrl)` — saves `pdf_url`, `inspector_name`, `submitted_at` to reports table
- `updateReportStatus('submitted')` — sets status + timestamp in both Supabase and IDB
- `cleanupLocalStorage()` — deletes IDB report data + photos, but KEEPS report metadata with 'submitted' status
- `showSubmitLoadingOverlay()` / `showSubmitError()` — UI feedback during submit

🟢 Robust duplicate detection with user confirmation dialog — doesn't block, just warns
🟢 Sprint 13 correctly eliminated deprecated `final_reports` table
🟢 Proper loading state with step-by-step status updates
🟢 Cleanup preserves IDB report metadata for dashboard display while removing heavy data
🟡 **ISSUE:** `uploadPDFToStorage()` creates a 1-hour signed URL — if the user views the submitted report later, the PDF link is expired. The `pdf_url` stored in the database will be invalid after 1 hour.
🔴 **BUG:** `ensureReportExists()` sets `status: 'draft'` even though we're about to submit — if `updateReportStatus()` fails after this, the report is stuck as 'draft' in Supabase but `cleanupLocalStorage()` may still have run (since the error catch is at the top level, it would skip cleanup, but the race is concerning)
🟡 **ISSUE:** `cleanupLocalStorage()` calls `deleteReportData()` which removes ALL IDB data for the report — if the Supabase upload succeeded but the status update failed, the user has no local copy and a broken cloud state
⚫ **SOFT-DELETE:** `cleanupLocalStorage()` calls `deletePhotosByReportId()` which hard-deletes all photo records from IDB — should use soft-delete or at minimum keep a grace period
🔵 The submit flow could benefit from a transaction-like pattern: record each step's completion so that a retry can resume from the last successful step rather than starting over

---

### 4.10 delete-report.js (55 lines)

Simple delete confirmation flow.

**Key functions:**
- `confirmDeleteReport()` — shows delete modal
- `hideDeleteModal()` — hides it
- `executeDeleteReport()` — calls `deleteReportFull()` (defined elsewhere, likely in shared modules) and navigates to index.html on success

🟢 Clean, minimal module — just the UI flow
🟢 Awaits `deleteReportFull()` before navigating — no premature redirect
🟡 **ISSUE:** Error handling shows `showToast` or `alert` fallback but doesn't expose the specific `result.errors` to the user for debugging
🟠 **MAYBE:** `deleteReportFull()` is called but not defined in any report module — need to verify it exists in shared modules and implements soft-delete

---

### 4.11 debug.js (463 lines)

Developer debugging tool for inspecting AI response mapping, field notes, user edits, and detecting schema/type/contractor mismatches.

**Key functions:**
- `detectFieldMismatches()` — comprehensive validator checking:
  - (a) Unexpected top-level keys in aiGenerated (vs expected schema)
  - (b) Empty AI responses when field notes had content
  - (c) Type mismatches (expected array got string)
  - (d) ContractorId mismatches (AI IDs not in project contractors)
- `initializeDebugPanel()` — populates all debug sections with current data
- `toggleDebugPanel()` / `toggleDebugSection()` — expand/collapse UI
- `downloadDebugJSON()` / `downloadDebugMarkdown()` — export debug data for reporting

🟢 Excellent diagnostic tool — detects real issues before they confuse users
🟢 Export in both JSON and Markdown formats for different use cases
🟡 **ISSUE:** Expected key lists are hardcoded (`expectedTopLevelKeys`, `expectedActivityKeys`, etc.) — if the AI response schema evolves, these lists must be manually updated
🟡 **ISSUE:** The debug tool checks for the OLD field names (`generalIssues`, `qaqcNotes`, `contractorCommunications`, `visitorsRemarks`) in `expectedTopLevelKeys`, but the rest of the codebase uses NEW names (`issues_delays`, `qaqc_notes`, `communications`, `visitors_deliveries`). This means the debug tool will flag the new-format AI responses as having "unexpected keys" — **false positives**.
🟠 **MAYBE:** Debug panel is always present in production HTML — should be gated behind a feature flag or dev mode check

---

### 4.12 main.js (252 lines)

Initialization and tab switching orchestration.

**Key functions:**
- `DOMContentLoaded` handler — init sequence: dataStore.init → load user settings → load report → resolve project ID (report data → IDB metadata → URL params, in priority order) → load project → populate fields → setup autosave → init realtime sync → init debug panel → check tab URL param
- `switchTab(tab)` — manages form/notes/preview tab switching; on preview switch, force-saves all contractor activities and text fields before rendering
- `updateHeaderDate()` — sets header date display
- `goToFinalReview()` / `hideSubmitModal()` / `confirmSubmit()` — navigation helpers
- `visibilitychange` / `pagehide` handlers — emergency save on background/close with both IDB and cloud persistence
- `window.__fvp_debug` — debug getter object for console access

🟢 Robust project ID resolution: tries report data → IDB metadata → URL params (3-layer fallback)
🟢 Emergency save on `visibilitychange` and `pagehide` — data loss prevention
🟢 Force-saves before preview render ensures preview shows current data
🟡 **ISSUE:** `visibilitychange` and `pagehide` handlers have nearly identical code (duplicate ~20 lines) — should extract to `emergencySave()` function
🟡 **ISSUE:** `confirmSubmit()` calls `goToFinalReview()` which switches to preview tab — this is misleading; the function name suggests it confirms submission but it just navigates to preview. The actual submit is `handleSubmit()` in submit.js
🟡 **ISSUE:** `pagehide` calls `window.dataStore.closeAll()` — if this closes IDB connections while `saveReportData()` is still writing (from the same handler), the write could fail silently

---

### Report Editor Summary

**Total code: ~6,065 lines (1,421 HTML + 4,644 JS across 11 modules)**

**Key architectural patterns:**
- Shared state via `window.reportState` (RS) namespace — all modules read/write the same object
- Three-layer data priority: `userEdits > aiGenerated > report defaults` for every field
- IDB-first loading with cloud freshness check (2s timeout, newer-wins)
- Debounced autosave: local (500ms) + cloud (5s) with Promise-queued IDB writes
- Multi-device sync via deferred field updates (apply on blur, not during typing)
- Vector PDF generation via jsPDF direct drawing with auto page breaks
- Per-field AI refinement via n8n webhook

**Top issues found:**
1. 🔴 `ensureReportExists()` sets `status: 'draft'` right before submit — race condition if subsequent steps fail
2. 🟡 `uploadPDFToStorage()` saves a 1-hour signed URL as `pdf_url` — expires, making submitted reports inaccessible
3. 🟡 n8n webhook URLs + API key exposed in client-side JavaScript (ai-refine.js)
4. 🟡 `formVal()` defined 3 times identically across preview.js, pdf-generator.js, submit.js
5. 🟡 `drawTextBox()` returns asymmetric values (full height for single-page, 0 for multi-page) — error-prone API
6. 🟡 Debug tool's `expectedTopLevelKeys` uses OLD field names — generates false positives with current AI schema
7. 🟡 `flushReportBackup()` omits `ai_generated` and `original_input` from cloud autosave — new devices may get incomplete data
8. 🟡 Trade abbreviation maps differ between preview.js and pdf-generator.js
9. 🟡 `visibilitychange` / `pagehide` handlers are near-identical duplicates
10. ⚫ `cleanupLocalStorage()` hard-deletes photos from IDB — needs soft-delete

---

## 5. Projects & Project Config

**HTML:** `projects.html` (122 lines) + `project-config.html` (553 lines)
**JS modules:** `js/projects/main.js` (313 lines) + 4 files in `js/project-config/` (1,193 lines)
**Total: ~2,181 lines**

The project management system: a list page for selecting/switching projects, and a configuration page for creating/editing project details, contractor rosters, crews, logos, and importing data from existing RPR reports via AI extraction.

---

### 5.1 projects.html (122 lines)

Minimal list page with header, active project banner, project list container, and "New Project" button.

🟢 Clean, lightweight HTML — all rendering delegated to JS
🟢 Refresh button for manual cloud sync

---

### 5.2 js/projects/main.js (313 lines)

Project list page logic with IDB-first loading and Supabase fallback.

**Key functions:**
- `getAllProjects()` — IDB first via `dataLayer.loadProjects()`, Supabase fallback via `dataLayer.refreshProjectsFromCloud()` when empty and online
- `refreshProjectsFromCloud()` — clears IDB projects store, re-fetches from cloud, re-renders list
- `selectProject(projectId)` — sets `ACTIVE_PROJECT_ID` in localStorage, navigates to dashboard
- `editProject(projectId)` — navigates to `project-config.html?id=<id>`
- `renderProjectList()` — renders project cards with name, number, location, status, active indicator, expandable contractor roster with crew counts
- `renderProjectRow()` — individual project card with select (left) and edit (right) buttons
- `toggleContractors()` — expand/collapse contractor list within a project card
- `updateActiveProjectBanner()` — shows currently active project at top

🟢 Clean two-button pattern: tap card body to select, edit icon on the right
🟢 Expandable contractor section with crew counts — good overview without clutter
🟢 Handles offline gracefully — shows empty state with offline indicator
🟡 **ISSUE:** `refreshProjectsFromCloud()` calls `idb.clearStore('projects')` before fetching — if the fetch fails, all local projects are gone. The error handler re-renders from `loadProjects()` but the store was just cleared. This is a data loss risk.
🟡 **ISSUE:** `renderProjectRow()` uses inline `onclick` with string-interpolated `project.id` — safe with UUIDs but fragile pattern
🟠 **MAYBE:** No search/filter capability — with many projects, finding the right one requires scrolling

---

### 5.3 project-config.html (553 lines)

Full project configuration form: logo upload, project details, contract information, contractor roster with crews, document import zone.

**Structure:**
- Unsaved changes banner (hidden by default)
- Import from Existing Report section (drag-and-drop file zone)
- Project Details section (logo, name, project numbers, location, engineer, prime contractor)
- Contract Information section (NTP date, duration, weather days, start/end times, expected completion)
- Contractor Roster section (dynamic list with add/edit/delete + crews)
- Add Contractor form (inline, hidden by default)
- Add Crew form (inline, hidden by default)
- Save/Cancel/Delete buttons
- Delete confirmation modals (contractor + project)
- Scripts: loads `indexeddb-utils.js` and `data-layer.js` AGAIN in body (already in foundation via other pages — but this page has no shared header include, so needs its own)

🟢 Comprehensive form covering all RPR project metadata
🟢 Drag-and-drop file import with visual feedback
🟢 Logo upload with drag-and-drop support
🟡 **ISSUE:** `indexeddb-utils.js` and `data-layer.js` are loaded in the `<body>` even though they're also included in the `<head>` — double-loading these scripts could cause redefinition issues if they have side effects

---

### 5.4 js/project-config/main.js (105 lines)

Entry point and shared state for the project config page.

**Key functions:**
- Shared state: `currentProject`, `deleteCallback`, `selectedFiles`, `isLoading`, `isDirty`, `draggedItem`
- `markDirty()` / `clearDirty()` / `updateDirtyBanner()` — unsaved changes tracking with visual banner
- `setupDirtyTracking()` — attaches `input`/`change` listeners to all form inputs + `beforeunload` warning
- `getActiveProjectId()` — helper for dashboard picker selection (Sprint 5 comment: used only for UI display)
- `DOMContentLoaded` — init IDB, setup drop zones (file + logo), load project by URL `?id=` or create new

🟢 Dirty state tracking with `beforeunload` prevents accidental data loss
🟢 Clean init: IDB first, then decide create vs. edit based on URL param

---

### 5.5 js/project-config/form.js (158 lines)

Form population and logo management.

**Key functions:**
- `populateForm()` — maps all `currentProject` fields to DOM inputs; shows logo preview with priority: `logoUrl > logoThumbnail > logo` (legacy)
- `handleLogoSelect()` — compresses image to thumbnail for local storage, uploads original to Supabase Storage async; handles offline gracefully (local thumbnail only)
- `removeLogo()` — deletes from Supabase Storage (async, fire-and-forget), clears all logo fields
- `setupLogoDropZone()` — drag-and-drop listeners for logo upload zone
- `handleLogoDrop()` — creates fake event to reuse `handleLogoSelect`

🟢 Dual-path logo storage: compressed thumbnail for instant local display + full-quality in Supabase
🟢 Offline-resilient: logo works locally even if Supabase upload fails
🟡 **ISSUE:** `removeLogo()` calls `deleteLogoFromStorage()` fire-and-forget — if the delete fails (e.g., network error), the Storage file is orphaned. No retry or cleanup mechanism.
🟡 **ISSUE:** `handleLogoDrop()` creates a fake event object with `{ target: { files, value: '' } }` — works, but `handleLogoSelect` later sets `event.target.value = ''` which writes to the fake object (harmless but code smell)

---

### 5.6 js/project-config/crud.js (286 lines)

Project CRUD operations: create, load, save, delete.

**Key functions:**
- `saveProjectToSupabase()` — upserts project via `toSupabaseProject()` normalization; attaches `user_id`
- `createNewProject()` — initializes `currentProject` with defaults and `generateId()` UUID
- `loadProject(projectId)` — IDB first, falls back to `dataLayer.loadProjects()` linear scan; deep copies to avoid mutation
- `saveProject()` — reads all form fields into `currentProject`; saves to IDB first (local-first), then syncs to Supabase; navigates to projects.html after 800ms delay
- `showDeleteProjectModal()` / `closeDeleteProjectModal()` / `confirmDeleteProject()` — deletion flow: online check → Supabase delete → IDB delete → localStorage cache clear → clear active project if deleted → redirect
- `deleteProject()` — legacy wrapper that calls `showDeleteProjectModal()`

🟢 Local-first save pattern: IDB succeeds immediately, Supabase syncs async with degraded-mode toast
🟢 Delete requires online — prevents orphaned cloud data
🟢 Delete cleans up all storage layers (Supabase → IDB → localStorage → active project)
⚫ **SOFT-DELETE:** `confirmDeleteProject()` uses `supabaseClient.from('projects').delete()` — hard-deletes the project row. Should use soft-delete (`status: 'deleted'` or `deleted_at` timestamp) for recoverability.
🟡 **ISSUE:** `saveProject()` doesn't await `saveProjectToSupabase()` error handling before navigating — the `setTimeout(800)` redirect fires regardless of whether the Supabase sync succeeded or failed (the toast shows, but user has already navigated)
🟡 **ISSUE:** `loadProject()` falls back to `dataLayer.loadProjects()` which loads ALL projects and scans with `.find()` — for many projects, this is wasteful; should use `dataLayer.loadProjectById()`
🟡 **ISSUE:** `contractDayNo` is parsed with `parseInt(...) || ''` — this means `0` becomes `''` (empty string) since `0` is falsy. If contract day 0 is valid, this is a bug.

---

### 5.7 js/project-config/contractors.js (310 lines)

Contractor and crew management: CRUD operations, drag-and-drop reordering, generic delete modal.

**Key functions:**
- `renderContractors()` — sorts prime first, renders cards with drag handles, crews list, edit/delete buttons per contractor, "Add Crew" button
- `showAddContractorForm()` / `hideAddContractorForm()` / `editContractor()` / `saveContractor()` — inline form for add/edit with validation (name + abbreviation required)
- `deleteContractor()` — uses generic `showDeleteModal()` pattern, filters from `currentProject.contractors` array
- `showAddCrewForm()` / `hideAddCrewForm()` / `saveCrew()` / `editCrew()` / `deleteCrew()` — crew CRUD within a contractor
- `setupContractorDragDrop()` — HTML5 drag-and-drop for contractor reordering
- `showDeleteModal()` / `closeDeleteModal()` / `confirmDelete()` — generic reusable delete confirmation

🟢 Drag-and-drop reordering is a nice UX touch
🟢 All changes are in-memory until "Save Project" — no partial saves
🟢 Generic delete modal pattern is reusable
🟡 **ISSUE:** Contractor/crew deletions are in-memory only (unsaved until Save Project) — but there's no undo. If user accidentally deletes a contractor with many crews and notes, they'd need to cancel the entire edit to recover.
🟡 **ISSUE:** Drag-and-drop doesn't work on mobile touch devices — `draggable="true"` with HTML5 DnD API isn't supported on iOS Safari. Would need a touch-based alternative (e.g., long-press + touch-move).
🟠 **MAYBE:** Contractor sort puts all primes first, but within the same type, order is arbitrary — might want alphabetical or manual sort order persistence

---

### 5.8 js/project-config/document-import.js (334 lines)

AI-powered document import: uploads PDF/DOCX files to n8n webhook, extracts project details and contractors.

**Key functions:**
- `setupDropZone()` — drag-and-drop listeners for file import zone
- `handleFiles()` — validates file types (PDF, DOCX), deduplicates by name+size
- `renderFileList()` — shows selected files with icons, sizes, remove buttons
- `extractProjectData()` — sends files as `FormData` to `EXTRACT_WEBHOOK_URL` n8n webhook; on success, populates form and clears file selection; shows extraction notes if any
- `populateFormWithExtractedData()` — maps extracted data to form fields; marks missing fields with red indicators; processes contractor array with auto-generated abbreviations
- `generateAbbreviation()` — takes first letter of each word (max 4 chars) for contractor abbreviations
- `markFieldAsMissing()` / `clearMissingFieldIndicator()` / `setupMissingFieldListeners()` — visual indicators for fields the AI couldn't extract

🟢 Excellent UX: drag-and-drop + browse, file type validation, duplicate detection, missing field indicators
🟢 Extraction notes shown in collapsible section — transparent about what the AI found/missed
🟢 Auto-abbreviation generation from contractor names is a nice touch
🟡 **ISSUE:** `EXTRACT_WEBHOOK_URL` is hardcoded — same pattern as other n8n webhook URLs exposed in client code
🟡 **ISSUE:** `extractProjectData()` sends files with no authentication header (no API key unlike the refine webhooks) — the n8n webhook is completely open to anyone who knows the URL
🟡 **ISSUE:** No file size limit validation — a user could upload a very large PDF that the n8n webhook might reject or timeout processing
🟡 **ISSUE:** No abort/cancel mechanism — once extraction starts, there's no way to cancel (no AbortController like the refine webhooks use)
🟠 **MAYBE:** `generateAbbreviation()` uses first letter of each word — "Boh Bros Construction" → "BBC" (3 chars) but single-word names get first 3 chars. "AECOM" → "AEC" which may not be the preferred abbreviation.

---

### Projects & Project Config Summary

**Total code: ~2,181 lines (675 HTML + 1,506 JS across 6 modules)**

**Key architectural patterns:**
- IDB-first loading with Supabase fallback for project data
- Local-first save: IDB immediately, Supabase async with offline degradation
- In-memory editing: all contractor/crew/form changes live in `currentProject` until explicit Save
- Dirty state tracking with visual banner and `beforeunload` warning
- AI document import via n8n webhook for automated project setup
- Dual-path logo storage (compressed thumbnail local + full-quality cloud)

**Top issues found:**
1. ⚫ `confirmDeleteProject()` hard-deletes from Supabase — needs soft-delete
2. 🟡 `refreshProjectsFromCloud()` clears IDB before fetching — if fetch fails, local projects are lost
3. 🟡 n8n extraction webhook has no authentication — open to anyone with the URL
4. 🟡 No file size limit on document import uploads
5. 🟡 Drag-and-drop contractor reorder doesn't work on mobile (HTML5 DnD not supported on iOS)
6. 🟡 `removeLogo()` fire-and-forget delete can orphan Storage files
7. 🟡 `contractDayNo` parsed with `parseInt() || ''` treats `0` as empty string

---

## 6. Other Pages

**HTML:** 6 pages (2,920 lines total)
**JS:** 6 modules (3,039 lines total)
**Total: ~5,959 lines**

Secondary pages: settings/profile, report archives, login/signup, device permissions, landing/marketing, and permission debug diagnostics.

---

### 6.1 settings.html + js/settings/main.js (307 + 586 = 893 lines)

Inspector profile management (name, title, company, email, phone), signature preview, PWA refresh, and nuclear data reset.

**Key functions:**
- `loadSettings()` — checks localStorage scratch pad for unsaved changes first, then loads from `dataLayer.loadUserSettings()` (IDB-first, Supabase-fallback)
- `saveSettings()` — saves to IDB first, then upserts to Supabase `user_profiles` table via `auth_user_id`; handles offline gracefully
- `refreshFromCloud()` — pulls latest profile from Supabase and populates form; marks dirty (requires explicit Save to commit)
- Scratch pad system: `saveScratchData()` / `getScratchData()` / `clearScratchData()` — localStorage-backed form state recovery for interrupted edits
- Dirty tracking: `checkIfDirty()` compares current values to original snapshot; visual indicators on save button
- `refreshApp()` / `executeRefresh()` — PWA refresh: deletes caches → unregisters service workers → cache-busting reload
- `resetAllData()` — nuclear reset: clears localStorage, sessionStorage, deletes IndexedDB, caches, service workers → redirects to index
- `updateSignaturePreview()` — live signature preview as user types

🟢 Scratch pad recovery for unsaved changes — great for interrupted mobile sessions
🟢 Local-first save with graceful offline degradation
🟢 PWA refresh with correct order (caches first, then service workers)
🟢 Nuclear reset is thorough: all 5 storage layers cleared
🟡 **ISSUE:** `saveSettings()` gets auth session, user_id, builds profile, saves to IDB, upserts to Supabase — if the Supabase upsert returns a different `id` than what's in IDB, IDB is updated, but if IDB save fails on the second write, state is inconsistent
🟡 **ISSUE:** `resetAllData()` uses `indexedDB.deleteDatabase('fieldvoice-pro')` synchronously (no await) — the deletion is async but the redirect fires immediately; may not complete before navigation
🟠 **MAYBE:** `getFormattedSignature()` makes a fresh Supabase query every time — could use cached profile from IDB instead

---

### 6.2 archives.html + js/archives/main.js (96 + 365 = 461 lines)

Submitted report archive viewer with project filtering and PDF access.

**Key functions:**
- `loadReports()` — queries Supabase `reports` table (status='submitted') with project join; maps to display objects; caches to IDB for offline
- `loadProjects()` — fetches active projects filtered by org_id; populates filter dropdown
- `renderReports()` — report cards with project name, date, submit time, PDF badge; recent reports section (last 24h)
- `viewPdf()` — opens PDF URL in new tab
- `loadFromCache()` — offline fallback using cached archive data from IDB
- Online/offline event listeners for automatic refresh/warning

🟢 Clean offline fallback with cached data and clear "showing cached data" indicator
🟢 Recent reports section (last 24h) for quick access to just-submitted reports
🟢 Org-scoped queries for multi-tenant support
🟡 **ISSUE:** `viewPdf()` opens `report.pdfUrl` directly — but submit.js stores a 1-hour signed URL. By the time the user views archives, the URL is expired. This is a **critical usability bug** shared with submit.js.
🟡 **ISSUE:** No pagination — loads ALL submitted reports. For active organizations with hundreds of reports, this query grows unbounded.
🟠 **MAYBE:** `cacheArchiveData()` calls `window.idb.saveCachedArchive()` which may not exist in all IDB configurations — the fire-and-forget `.catch()` handles it, but silently

---

### 6.3 login.html + js/login/main.js (229 + 367 = 596 lines)

Authentication: sign in, sign up (with org code validation), and role selection.

**Key functions:**
- `handleSignIn()` — Supabase `auth.signInWithPassword()`; checks for existing profile/role; stores user_id, org_id, device_id; upserts to `user_devices` table; redirects to dashboard or shows role picker
- `handleSignUp()` — validates org code against `organizations` table (slug lookup); creates auth account via `auth.signUp()`; creates `user_profiles` row with org_id; upserts device info; shows role picker
- `selectRole(role)` — stores role locally and updates Supabase profile; admin role shows "coming soon" modal
- Auto-session check on load: redirects to dashboard if already authenticated
- Enter key handler for both forms

🟢 Org code validation before account creation prevents orphaned users
🟢 Device info capture (user agent, platform, screen size) on sign-in/sign-up — useful for debugging
🟢 Sprint 13 `user_devices` upsert for multi-device tracking
🟡 **ISSUE:** Sign-up validation checks are sequential with early returns — password check happens after org code lookup, meaning the network request fires even if the password is invalid locally
🟡 **ISSUE:** `handleSignIn()` stores `AUTH_USER_ID` in localStorage — this is the Supabase auth UUID, a sensitive identifier. Not encrypted or obfuscated.
🟡 **ISSUE:** The role picker "Admin" option shows "Coming Soon" modal but the role string `'admin'` is never validated server-side — if someone bypasses the modal (e.g., calling `selectRole('admin')` from console), it saves to the profile
🟠 **MAYBE:** No rate limiting on sign-in attempts — brute force protection relies entirely on Supabase's built-in rate limits

---

### 6.4 permissions.html + js/permissions/main.js (751 + 791 = 1,542 lines)

Device permission onboarding flow for microphone, camera, and location (GPS).

**Key functions:**
- Sequential permission flow: mic → cam → loc → summary; each step has pre-screen, loading, success, and error states
- `requestMicPermission()` / `requestCamPermission()` / `requestLocPermission()` — calls `getUserMedia`/`getCurrentPosition` with proper error handling and interpretation
- `checkBrowserPermissionState()` — uses Permissions API to pre-check state before requesting
- Manual mode: `skipToManual()` → individual permission buttons with status cards
- Stepper UI: `updateStepper()` shows progress through 4 steps with check/fail/skip indicators
- Error code mapping: comprehensive `errorCodes` object mapping browser errors to user-friendly messages with fix instructions
- `renderSummary()` — final screen showing results with retry option for failed permissions
- `clearLocalPermissionState()` — resets all saved permission states
- Debug logging: `toggleDebug()` / `copyDebugLog()` / `clearDebugLog()`

🟢 Excellent error handling with specific fix instructions per error type (NotAllowedError, NotFoundError, NotReadableError, etc.)
🟢 Pre-checks permission state to customize loading UI ("Previously granted" vs "Tap Allow in dialog")
🟢 Both guided (sequential) and manual modes — flexible for different user preferences
🟢 iOS-specific warnings for standalone PWA mode (where getUserMedia is blocked)
🟢 Location caching via `cacheLocation()` so other pages don't re-prompt
🟡 **ISSUE:** `permissionResults` object includes `speech` references but the speech recognition step was removed from the flow (`sequence = ['mic', 'cam', 'loc', 'summary']` — no `speech`). Dead code in stepper references.
🟠 **MAYBE:** `requestLocPermission()` uses `enableHighAccuracy: true` with 15s timeout — on some devices/locations, this may timeout when `enableHighAccuracy: false` would succeed quickly

---

### 6.5 landing.html + js/landing/main.js (1,285 + 189 = 1,474 lines)

Marketing/product landing page with interactive demos.

**Key functions:**
- Voice recording demo: simulated real-time transcription with typing animation
- Weather sync demo: animated data population with GPS, temp, conditions
- Report mode toggle: quick vs full mode visualization
- FAQ accordion
- Scroll reveal animations

🟢 Good marketing demos that showcase the product's voice-first approach
🟢 Pure UI — no backend calls, no state management
🟠 **MAYBE:** Landing page loads the same foundation scripts (config.js, auth.js, etc.) as the app — heavier than needed for a static marketing page

---

### 6.6 permission-debug.html + js/permission-debug/main.js (252 + 741 = 993 lines)

Deep diagnostic tool for troubleshooting device permissions, especially on iOS.

**Key functions:**
- `detectEnvironment()` — comprehensive checks: secure context, standalone mode, mediaDevices availability, SpeechRecognition support, iOS version, browser detection
- `renderEnvironment()` — renders pass/fail grid with critical failure alerts
- `checkPermissionStates()` — queries Permissions API for current camera/mic/geolocation states
- `testMicrophone()` / `testCamera()` / `testLocation()` / `testSpeechRecognition()` — individual API tests with detailed logging, timing, and error interpretation
- `runFullDiagnostics()` — automated check of all critical requirements with overall pass/fail
- Console logging: `copyConsole()` / `clearConsole()` for sharing debug output

🟢 Exceptional diagnostic tool — the iOS standalone/PWA mode detection alone saves hours of debugging
🟢 Timed API calls reveal whether permission was pre-granted (fast) or user-prompted (slow)
🟢 Speech recognition test includes iOS-specific "service-not-allowed" error handling (Siri/Dictation disabled)
🟢 Copy console button for easy bug reporting
🟡 **ISSUE:** Standalone mode check uses `window.navigator.standalone` — this is Safari-only. Chrome/Firefox on iOS have different standalone detection. The `display-mode: standalone` media query is checked separately but not used for the critical standalone warning.

---

### Other Pages Summary

**Total code: ~5,959 lines (2,920 HTML + 3,039 JS across 6 pages)**

**Key architectural patterns:**
- Settings: scratch pad (localStorage) for form state recovery + dirty tracking
- Archives: online-first with IDB cache for offline fallback
- Login: org code validation before account creation + multi-device tracking
- Permissions: sequential guided flow with manual fallback + comprehensive error mapping
- Permission Debug: deep diagnostic tool for iOS permission issues

**Top issues found:**
1. 🟡 Archives `viewPdf()` opens expired signed URLs — same 1-hour expiry bug from submit.js
2. 🟡 Archives has no pagination — unbounded query growth for active organizations
3. 🟡 Login stores `AUTH_USER_ID` (sensitive Supabase UUID) in plain localStorage
4. 🟡 Login admin role bypass possible from browser console (no server-side validation)
5. 🟡 Settings `resetAllData()` IDB deletion may not complete before redirect fires
6. 🟡 Login sign-up fires org code lookup before checking local password validation
7. 🟡 Permissions page has dead `speech` references in stepper code

---

## 7. Field Tools

**JS modules:** 14 files in `js/tools/` (5,986 lines)
**No dedicated HTML** — all tools render as overlays on `index.html` or are called from other pages.

Construction-specific utility tools: camera-based measurement, maps, calculators, sensors, and more. All self-contained modules with their own state objects and overlay UI.

---

### 7.1 photo-markup.js (930 lines)

Post-capture photo markup overlay with drawing tools (freehand, arrow, circle, rectangle, text). Returns a composited image with burned-in metadata strip.

**Key features:**
- Promise-based API: `openPhotoMarkup(imageDataUrl, metadata)` → resolves with final image or null
- Canvas overlay positioned precisely over displayed photo using `getBoundingClientRect()`
- Touch + mouse event handlers with coordinate mapping from CSS display to canvas native resolution
- 5 drawing tools, 5 colors, 3 line widths
- Text labels with background fill for readability
- Undo (element-level, not pixel-level)
- Async GPS/heading acquisition if not provided
- Composite output: photo + markup + metadata strip burned into single JPEG

🟢 Clean Promise-based API — easy to integrate from any capture flow
🟢 Proper coordinate scaling between CSS display and native resolution
🟢 Discard confirmation dialog prevents accidental loss
🟢 Double `requestAnimationFrame` for layout stabilization before canvas init
🟡 **ISSUE:** `_compositeMarkupImage()` always outputs JPEG at 0.9 quality — original PNG photos lose their lossless quality
🟡 **ISSUE:** No pinch-to-zoom on photo — marking up small details on a large photo requires precision tapping
🟡 **ISSUE:** `_saveMarkup()` saves to `sessionStorage` as backup — for high-res photos, this can exceed the ~5MB sessionStorage limit and silently fail (caught but no fallback)
🟠 **MAYBE:** `_tryGetHeading()` silently skips iOS 13+ (where `requestPermission` exists) — heading metadata will always be null on modern iOS

---

### 7.2 scan-viewer.js (731 lines)

3D scan viewer using Three.js + GLTFLoader + OrbitControls. Loads GLTF/GLB models with measurement mode.

**Key features:**
- On-demand CDN loading of Three.js, GLTFLoader, OrbitControls
- GLTF/GLB file input with drag-and-drop
- OrbitControls for rotation, zoom, pan
- Measurement mode: click two points on model for 3D distance measurement
- Raycaster for point selection with visual markers
- Auto-centering/scaling of loaded models

🟢 CDN lazy-loading keeps initial page load fast
🟢 3D measurement is a genuinely useful construction feature
🟡 **ISSUE:** Three.js loaded from CDN without integrity hashes — supply chain risk
🟡 **ISSUE:** No file size limit on GLTF uploads — large 3D scans could crash the browser

---

### 7.3 calc.js (568 lines)

Construction calculator with 3 tabs: Feet-Inch converter, Area/Volume calculator, Unit converter.

**Key features:**
- Feet-Inch ↔ decimal conversion (bidirectional)
- Area calculation with 5 shapes: rectangle, circle, triangle, trapezoid, L-shape
- Volume calculation with 4 shapes: rectangular, cylinder, cone, wedge
- Unit converter for length (8 units), area (5 units), volume (6 units), weight (5 units)
- All calculations offline, no dependencies

🟢 Comprehensive construction-specific calculations
🟢 Fully offline — no network needed
🟡 **ISSUE:** Conversion factors are hardcoded inline — not easy to validate or maintain

---

### 7.4 maps.js (528 lines)

9-tab map viewer using Leaflet.js with various tile layers and WMS overlays.

**Key features:**
- Weather Radar (Windy.com iframe), Drone Airspace (FAA UAS iframe), Traffic (Google Maps iframe)
- Satellite (Esri World Imagery), Topo (USGS tiles), Soils (USDA WMS), Flood (FEMA WMS), Parcels, Historical (Esri Wayback)
- GPS auto-center on open via `getFreshLocation()`
- Historical imagery with date selector from Esri Wayback API

🟢 Impressive range of map layers relevant to construction
🟢 Leaflet instances properly destroyed on close to prevent memory leaks
🟡 **ISSUE:** Multiple CDN iframes (Windy, FAA, Google) embedded without sandboxing — potential security surface
🟡 **ISSUE:** USDA WMS and FEMA WMS endpoints are hardcoded — if government APIs change URLs, maps break silently

---

### 7.5 photo-measure.js (501 lines)

Photo-based measurement: capture photo → calibrate with known reference object → measure distances.

**Key features:**
- Camera capture with rear-facing preference
- Reference calibration: credit card (85.6mm), dollar bill (156mm), hard hat (250mm), custom value
- Two-point tap for calibration and measurement
- Converts pixel distance to real-world mm using calibration ratio
- Display in metric and imperial with fraction approximation

🟢 Clever calibration approach using common reference objects
🟢 Helpful for rough field measurements when no tape measure available
🟡 **ISSUE:** Calibration assumes the reference and measured objects are at the same distance from camera — parallax errors can be significant
🟠 **MAYBE:** No guidance for camera angle — oblique photos will distort measurements

---

### 7.6 ar-measure.js (507 lines)

AR measurement using WebXR hit-testing and Three.js 3D rendering.

**Key features:**
- WebXR `immersive-ar` session with `hit-test` feature
- Three.js rendering: reticle, point markers, line mesh, distance label
- Point-to-point distance in real-world meters
- Falls back to regular `openMeasure()` if WebXR not supported

🟢 Proper WebXR feature detection with graceful fallback
🟢 Visual reticle feedback for hit-test positioning
🟡 **ISSUE:** WebXR support is very limited (Chrome Android only, no iOS Safari) — most field users won't have access
🟡 **ISSUE:** Three.js loaded from CDN again (same as scan-viewer) — should share a single load

---

### 7.7 level.js (352 lines)

Bubble level / inclinometer using DeviceOrientationEvent.

**Key features:**
- Bubble level mode: visual bubble that moves with phone tilt
- Inclinometer mode: large degree readout with gauge arc + grade %
- 5-reading moving average for smoothing
- Lock reading feature
- iOS 13+ permission handling

🟢 Moving average smoothing prevents jittery readings
🟢 Lock feature useful for recording a specific measurement

---

### 7.8 timer.js (366 lines)

Stopwatch and countdown timer with lap tracking.

**Key features:**
- Stopwatch: start/stop/reset, lap recording with time display
- Timer: configurable countdown with audio alarm (Web Audio API oscillator)
- Visual flash effect on timer completion

🟢 Audio alarm using Web Audio API works even when page is in background
🟡 **ISSUE:** Timer alarm oscillator never disconnects if user closes overlay while alarm is playing — could cause audio leak

---

### 7.9 qrscanner.js (295 lines)

QR code scanner using jsQR library + getUserMedia.

**Key features:**
- Real-time camera scanning with canvas video frame extraction
- Green overlay highlight on detected QR codes
- Beep sound (Web Audio API) + haptic vibration on scan
- Scan history with copy-to-clipboard
- Torch toggle for low-light scanning

🟢 Good UX: visual highlight + audio + haptic feedback on scan
🟢 History persistence in sessionStorage
🟡 **ISSUE:** jsQR library loaded from CDN without integrity hash

---

### 7.10 decibel.js (265 lines)

Sound level meter using microphone + AudioContext + AnalyserNode.

**Key features:**
- Real-time dB SPL approximation from microphone input
- Visual bar chart with color-coded levels (green/yellow/orange/red)
- Min/max/average tracking
- Reference chart for common noise levels

🟢 Useful for documenting jobsite noise levels
🟡 **ISSUE:** dB calibration is approximate — no per-device calibration. Values should be flagged as "approximate" in the UI.

---

### 7.11 measure.js (251 lines)

GPS-based distance measurement using Leaflet.

**Key features:**
- Drop points on map, measure polyline distance
- Polygon area calculation
- Segment labels with distances
- GPS auto-center

🟢 Simple and effective for site-scale measurements

---

### 7.12 slope.js (247 lines)

Slope and grade calculator: enter any two of rise/run/slope% and auto-compute the third.

**Key features:**
- Calculates grade%, degrees, ratio
- ADA compliance check (≤8.33% for ramps)
- Drainage adequacy check (≥1% minimum)
- Visual slope angle indicator

🟢 ADA and drainage compliance checks are genuinely useful for construction inspectors

---

### 7.13 flashlight.js (246 lines)

Flashlight using camera torch API with SOS and strobe modes.

**Key features:**
- Torch control via MediaDevices API `torch` constraint
- Fallback: full-white screen at max brightness
- SOS mode (Morse code pattern)
- Strobe mode (configurable frequency)

🟢 SOS mode is a nice safety feature
🟡 **ISSUE:** Strobe mode at high frequency could potentially trigger photosensitive seizures — should include a warning

---

### 7.14 compass.js (199 lines)

Digital compass using DeviceOrientationEvent.

**Key features:**
- Heading in degrees with cardinal direction
- Rotating compass rose visualization
- iOS 13+ permission handling

🟢 Clean, minimal implementation
🟢 Proper iOS permission request handling

---

### Field Tools Summary

**Total code: ~5,986 lines across 14 modules**

**Key architectural patterns:**
- All tools use overlay pattern: `open*()` shows overlay, `close*()` hides it and cleans up resources
- Each tool has its own isolated state object (no shared global state between tools)
- Sensor tools (compass, level, decibel) properly stop streams/listeners on close
- CDN lazy-loading for heavy libraries (Three.js, Leaflet, jsQR)
- GPS acquisition shared via `getFreshLocation()` from ui-utils.js

**Top issues found:**
1. 🟡 Three.js loaded from CDN without integrity hashes in both ar-measure.js and scan-viewer.js — duplicate loads possible
2. 🟡 Photo markup always outputs JPEG 0.9 — PNG quality loss
3. 🟡 Photo markup sessionStorage backup may exceed size limits for high-res photos
4. 🟡 Flashlight strobe mode lacks photosensitivity warning
5. 🟡 Timer alarm oscillator may leak if overlay closed during playback
6. 🟡 Government WMS endpoints (USDA, FEMA) are hardcoded — no fallback if APIs change
7. 🟠 AR measure has very limited browser support (Chrome Android only)
8. 🟠 Photo measure accuracy depends on camera angle and reference placement — no user guidance

---

## 8. Shared Modules

Nine modules in `js/shared/` provide cross-cutting infrastructure: AI chat, data persistence, realtime sync, photo cloud rehydration, deletion cascade, console capture, pull-to-refresh, broadcast, and retry utility. Loaded by most pages via `<script>` tags.

**Total code: ~7,764 lines across 9 modules**

---

### 8.1 `js/shared/ai-assistant.js` (570 lines)

**What it does:** Self-injecting IIFE that adds a floating AI button (draggable, double-tap to open) and a full-screen chat overlay to every page. Persists conversation in localStorage. Routes user messages through a local command parser first, then falls back to an n8n AI webhook.

**Architecture:**
- IIFE — no module exports; exposes `window.openAIAssistant` and `window.closeAIAssistant`
- Injects all HTML/CSS via JavaScript (no separate template file)
- Conversation stored in localStorage keyed per user (`fvp_ai_conversation_<userId>`)
- Local command engine handles ~30 intent patterns (navigation, tool opening, map types) without network
- Non-local queries POST to n8n webhook with chat history + GPS + project context

**Local Command Engine (~280 lines):**
- Navigation commands: new report, edit report, archives, settings, projects, admin, home
- Field tool commands: compass, calculator, level, slope, maps (10 map types), QR, measure, AR, decibel, timer, flashlight
- Dashboard panel commands: drone ops, weather, emergency
- If on dashboard page, calls tool functions directly; otherwise redirects with `?openTool=` param
- Chat management: clear/reset, help

**AI Webhook Integration:**
- POST to `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-ai-chat`
- Payload: sanitized message, last 10 conversation turns, page context, GPS, project name/ID
- 20-second AbortController timeout
- Response expects `{ response | message | text }` JSON shape

🟢 **GOOD:** Input sanitization (`SEC-06`) strips control characters and enforces 10KB max length before sending to webhook — solid defense against injection
🟢 **GOOD:** Per-user conversation namespacing prevents cross-user leakage on shared devices
🟢 **GOOD:** Local command engine provides instant responses for common actions without network dependency — excellent for field use
🟢 **GOOD:** Draggable button with snap-to-edge is polished mobile UX

🟡 **ISSUE:** The n8n webhook URL and API key are hardcoded in client-side JS — same exposure as config.js. Anyone can call the webhook directly.
🟡 **ISSUE:** `escapeHtml()` is referenced but not defined here — relies on `ui-utils.js` being loaded first. If load order breaks, XSS via chat bubbles is possible.
🟡 **ISSUE:** `MAX_HISTORY = 50` messages in localStorage could grow large if messages contain verbose AI responses (no per-message size cap, only count cap)
🟠 **MAYBE:** Double-tap to open is a non-standard gesture — new users may not discover it. Single tap just does a brief scale animation as a hint, but there's no tooltip or onboarding.
🔵 **IMPROVEMENT:** The 570 lines of inline HTML/CSS could be extracted to a template or built with a lightweight component pattern to improve maintainability
🔵 **IMPROVEMENT:** The local command matching uses repeated `lower.includes()` chains — a command registry pattern (array of `{ patterns: [], handler: fn }`) would be cleaner and extensible

---

### 8.2 `js/shared/broadcast.js` (42 lines)

**What it does:** Thin wrapper around the BroadcastChannel API for cross-tab communication. Creates a single `fieldvoice-sync` channel and exposes `send()`, `listen()`, `close()`.

**Exports:** `window.fvpBroadcast = { send, listen, close }`

🟢 **GOOD:** Clean, minimal abstraction — no over-engineering
🟢 **GOOD:** Graceful degradation — silently no-ops if BroadcastChannel isn't supported

🟡 **ISSUE:** `listen()` sets `fvpChannel.onmessage` directly, meaning only one listener can be registered at a time. If two modules both call `listen()`, the first handler is silently overwritten. Should use `addEventListener('message', ...)` instead.
🔵 **IMPROVEMENT:** Could add a `removeListener()` method for proper cleanup

---

### 8.3 `js/shared/cloud-photos.js` (131 lines)

**What it does:** Fetches photo metadata from Supabase `photos` table and generates fresh signed URLs from Supabase Storage. Two functions: single-report fetch and batch (multi-report) fetch.

**Exports:** `fetchCloudPhotos(reportId)`, `fetchCloudPhotosBatch(reportIds)` (global functions)

**SEC-04 compliance:** Always generates fresh signed URLs from `storage_path` rather than trusting potentially stale `photo_url` column values.

🟢 **GOOD:** Signed URL approach (1-hour expiry) avoids storing permanent public URLs — good security practice
🟢 **GOOD:** Early returns for missing reportId, no client, or offline — defensive programming
🟢 **GOOD:** Both functions return consistent photo object shapes expected by `renderPhotos()`

🟡 **ISSUE:** `fetchCloudPhotosBatch` generates signed URLs sequentially with `await` inside a for-loop. For a batch of 50 reports with 5 photos each = 250 sequential `createSignedUrl` calls. Should use `Promise.all()` or batch signing.
🟠 **MAYBE:** 1-hour signed URL expiry could cause broken images if a user stays on a page for >1 hour without refresh — especially on the report editor or archives page

---

### 8.4 `js/shared/console-capture.js` (107 lines)

**What it does:** Monkey-patches `console.log/warn/error` to capture all output into a ring buffer, then periodically flushes to a Supabase `debug_logs` table. Also captures unhandled errors and promise rejections.

**Architecture:**
- Ring buffer: max 500 entries, serialized to string (max 2KB per message)
- Flush: every 3 seconds, batches of 10 rows inserted into Supabase
- Also flushes on `pagehide` and `visibilitychange` (hidden)
- Exposes `window.debugCapture = { flush, clear, getBuffer }`

🟢 **GOOD:** Ring buffer prevents unbounded memory growth
🟢 **GOOD:** `pagehide` + `visibilitychange` flush ensures logs survive tab close
🟢 **GOOD:** Failed flush puts batch back on buffer — no data loss on transient errors

🟡 **ISSUE:** Flush runs every 3 seconds even when buffer is empty — unnecessary Supabase calls. The check `if (_buffer.length === 0) return` catches this, but the interval itself keeps running.
🟡 **ISSUE:** If `supabaseClient` isn't loaded yet when the first flush runs (load order), logs silently drop. No queuing until client is available.
🟠 **MAYBE:** The `debug_logs` table could grow very large in production with many users. No mention of TTL/cleanup policy — needs a Supabase cron or retention policy to prune old rows.
🔵 **IMPROVEMENT:** Could use `navigator.sendBeacon()` for the `pagehide` flush — more reliable than async fetch during page teardown

---

### 8.5 `js/shared/data-store.js` (548 lines)

**What it does:** Central IndexedDB data access layer. Manages the `fieldvoice-pro` database (version 7) with 7 object stores: `projects`, `userProfile`, `photos`, `currentReports`, `draftData`, `cachedArchives`, `reportData`. Provides CRUD for each store plus a cloud sync function.

**Object Stores:**
| Store | Key Path | Indexes | Purpose |
|---|---|---|---|
| projects | id | — | Project metadata cache |
| userProfile | deviceId | — | Local user profile |
| photos | id | reportId, syncStatus | Photo blobs/metadata |
| currentReports | id | project_id, status | Active report headers |
| draftData | reportId | — | Unsaved draft payloads |
| cachedArchives | key | — | Submitted report cache |
| reportData | reportId | — | Full report content |

**Key patterns:**
- `_openDB()` with 8-second timeout and blocked-retry logic (if another tab has an older version open)
- `_tx()` generic transaction wrapper — all CRUD goes through this
- `_validateConnection()` tests the handle is alive before reuse
- Legacy migration: moves `fvp_current_reports` and `fvp_report_*` from localStorage to IDB on first run, then sets flag and removes old keys
- `syncReportsFromCloud()` reconciles IDB with Supabase: adds cloud-only reports, updates stale local copies, preserves offline-created reports, and fire-and-forget pushes local-only reports to Supabase

🟢 **GOOD:** `_validateConnection()` proactively detects stale/closed handles — prevents "InvalidStateError" in long-lived tabs
🟢 **GOOD:** `onversionchange` handler properly closes the handle — allows other tabs to upgrade the DB
🟢 **GOOD:** Legacy migration is clean — one-time, idempotent, removes old keys after success
🟢 **GOOD:** `syncReportsFromCloud` preserves offline-created reports and pushes them to Supabase — critical for offline-first behavior
🟢 **GOOD:** Uses `Promise.allSettled` for multi-step cleanup — one failure doesn't cascade

🟡 **ISSUE:** `syncReportsFromCloud` fire-and-forget push uses `upsert` with no retry. If the push fails (network flap), the local-only report won't be pushed again until next sync cycle.
🟡 **ISSUE:** The `deleteReport` function does IDB hard-delete with no soft-delete semantics at this layer — callers must handle soft-delete themselves
🟡 **ISSUE:** `replaceAllReports()` does `store.clear()` then re-inserts everything — if the page crashes mid-write, all reports are lost. A safer pattern would be to diff and update in-place.
🟠 **MAYBE:** DB_VERSION = 7 with upgrade logic that only creates stores if missing — if a store schema needs to change (add index), this won't handle it since the `if (!contains)` guard skips existing stores
⚫ **SOFT-DELETE:** `deleteReport()`, `deletePhotosByReportId()`, `deleteProject()` all do hard IDB deletes. While IDB is a local cache (Supabase is truth), losing IDB data offline with no sync could lose work.
🔵 **IMPROVEMENT:** The `photos` store has a `syncStatus` index that is created but never queried in this file — presumably for future upload queue tracking

---

### 8.6 `js/shared/delete-report.js` (170 lines)

**What it does:** Two functions for report deletion:
1. `deleteReportCascade(reportId)` — Supabase-only cascade: removes storage files (photos, PDFs), child table rows, and the parent report row
2. `deleteReportFull(reportId)` — Full local + cloud delete: blocklist, IDB cleanup, and Supabase **soft-delete** (sets `status='deleted'`)

**Cascade order (deleteReportCascade):**
1. Select photo `storage_path` values
2. Remove photo files from `report-photos` bucket
3. Delete child table rows: `interview_backup`, `report_backup`, `ai_submissions`, `report_data`
4. Find and remove PDF from `report-pdfs` bucket (checks both `reports.pdf_url` and legacy `final_reports.pdf_url`)
5. Delete `final_reports` row (legacy)
6. Delete `photos` rows
7. Delete `reports` row (parent — last)

**deleteReportFull flow:**
1. Blocklist first (prevents realtime resurrection)
2. Clear active report pointer if it matches
3. IDB cleanup via `Promise.allSettled`
4. Supabase soft-delete (`status='deleted'`)
5. Broadcast `report-deleted` event

🟢 **GOOD:** `deleteReportFull` does proper soft-delete — sets `status='deleted'` instead of removing the row. This allows data recovery and audit trails.
🟢 **GOOD:** Per-step try/catch in cascade prevents partial failures from blocking subsequent cleanup
🟢 **GOOD:** Blocklist-first ordering in `deleteReportFull` is correct — prevents realtime sync from resurrecting the report mid-delete
🟢 **GOOD:** PDF lookup checks both new (`reports.pdf_url`) and legacy (`final_reports.pdf_url`) locations — good backward compat

🟡 **ISSUE:** `deleteReportCascade` does HARD deletes from Supabase (removes rows entirely). It's still exposed globally but `deleteReportFull` (which does soft-delete) is the intended API. The cascade function should either be removed from the global scope or clearly marked as admin-only.
🟡 **ISSUE:** No confirmation that storage bucket removals actually succeeded — `remove()` resolves even for non-existent paths, so errors here could silently fail for real files
🟠 **MAYBE:** The `reportId.length === 36` check for UUID validation is fragile — UUIDs with/without hyphens vary in length. Better to use a regex.

---

### 8.7 `js/shared/pull-to-refresh.js` (111 lines)

**What it does:** Mobile pull-to-refresh gesture handler + desktop refresh button. Touch gesture: pull down from top → orange indicator bar → reload. Desktop: fixed refresh button (top-right corner) on hover-capable devices.

**Touch gesture:**
- Triggers only when `window.scrollY === 0` (at page top)
- 80px threshold to trigger refresh
- Flushes pending interview/report backups before reload
- Shows spinner animation during reload

**Desktop button:**
- Only injected on devices with `(hover: hover)` media query match
- Calls `window.manualRefresh()` if available, else `location.reload()`
- Flushes debug capture + pending backups before refresh

🟢 **GOOD:** Flush-before-reload pattern prevents data loss — calls `flushInterviewBackup()`, `flushReportBackup()`, and `drainPendingBackups()` before triggering reload
🟢 **GOOD:** Desktop button uses `hover` media query to avoid showing on touch-only devices — smart progressive enhancement

🟡 **ISSUE:** The pull-to-refresh gesture doesn't distinguish between intentional pull and accidental touch at page top — no minimum velocity or deliberate gesture detection
🟡 **ISSUE:** Desktop refresh button is fixed at `top:12px; right:12px` — may overlap with page-specific UI elements (header buttons, close buttons) on some pages
🟠 **MAYBE:** The `300ms` delay before reload could feel sluggish to users — purely cosmetic but could be tuned down to `100ms`

---

### 8.8 `js/shared/realtime-sync.js` (343 lines)

**What it does:** Supabase Realtime subscription manager for multi-device sync. Subscribes to `postgres_changes` on `reports` (filtered by user_id) and `projects` (filtered by org_id). Handles INSERT/UPDATE/DELETE events by updating local caches and re-rendering UI.

**Subscription lifecycle:**
- `initRealtimeSync()` — creates channels, subscribes (idempotent — cleans up first)
- `cleanupRealtimeSync()` — removes all channels
- Auto-cleanup on `beforeunload`, `offline`, `visibilitychange` (hidden)
- Auto-reinit on `online`, `visibilitychange` (visible, with 1s delay), `pageshow` (bfcache)

**Report change handling (complex, ~200 lines):**
- INSERT/UPDATE: skips deleted-blocklist reports, handles soft-delete propagation, updates in-memory cache (`window.currentReportsCache`), skips overwrites for actively-edited report (SYN-02), detects `refined` status transition and auto-navigates
- DELETE: blocklists the ID, cleans up IDB, broadcasts deletion
- Dashboard UI refresh: calls `renderReportCards()` or `updateReportCardStatus()` as appropriate
- Dismissed report handling: full re-render when `dashboard_dismissed_at` is newly set

**Refined report transition:**
- When a report transitions to `refined` status (AI processing complete), fetches latest `report_data` from Supabase, caches locally, then redirects to report editor
- Guards against double-redirect with `_refineRedirectInProgress` flag
- Shows toast notification before redirect

🟢 **GOOD:** SYN-02 protection — skips realtime overwrites for the report being edited, preventing the user's unsaved work from being clobbered by cloud data
🟢 **GOOD:** Visibility-based lifecycle management — tears down channels when tab is hidden, reconnects when visible. Prevents stale connections and wasted bandwidth.
🟢 **GOOD:** Refined-status detection is well-implemented — fetches latest content, merges into IDB, shows toast, then redirects. Smooth cross-device experience.
🟢 **GOOD:** `pageshow` bfcache handler ensures subscriptions are re-established when navigating back

🟡 **ISSUE:** `_handleProjectChange` is a stub — just calls `refreshProjectsFromCloud()` without any merge logic. If a project is renamed on another device, the local state updates but any in-progress project config form would lose edits.
🟡 **ISSUE:** The `_refineRedirectInProgress` flag is module-scoped but never reset — if the redirect fails (network error during data fetch), the flag stays `true` and blocks future refined redirects until page reload.
🟡 **ISSUE:** When visibility changes to `visible`, reinit has a 1-second delay — during that second, any realtime events are missed and not backfilled. Should do a catch-up query after resubscribing.
🟠 **MAYBE:** `previousStatus` fallback chain (`payload.old` → module state → fallback to current) is fragile. Supabase Realtime may not always include `payload.old` depending on table replication settings — if `old` is missing and module state doesn't match, the refined transition detection could misfire.
🔵 **IMPROVEMENT:** No reconnection backoff — if the Supabase Realtime connection keeps dropping (flaky network), `initRealtimeSync()` is called on every `online`/`visible` event without any cooldown

---

### 8.9 `js/shared/supabase-retry.js` (46 lines)

**What it does:** Generic exponential backoff retry wrapper for async functions. Delays: 1s → 2s → 4s (default 3 retries). Treats Supabase `{ data, error }` responses with `.error` as failures.

**Exports:** `window.supabaseRetry(fn, maxRetries?, label?)`

🟢 **GOOD:** Clean, focused utility — does one thing well
🟢 **GOOD:** Handles Supabase's non-throwing error pattern (`result.error`) — most retry libraries wouldn't catch this
🟢 **GOOD:** Configurable retries and label for logging context

🟡 **ISSUE:** No jitter on the exponential backoff — if multiple clients retry simultaneously (e.g., after a brief outage), they'll all hit Supabase at the exact same intervals, causing a thundering herd. Standard practice is `delay * (0.5 + random())`.
🔵 **IMPROVEMENT:** Could add an `isRetryable` check — some errors (auth failures, 404s) shouldn't be retried regardless of retry count

---

### Shared Modules Summary

**Total code: ~7,764 lines across 9 modules**

**Key architectural patterns:**
- All modules use IIFE or plain function patterns — no ES modules, consistent with the rest of the codebase
- Communication between modules via `window.*` globals and BroadcastChannel
- IndexedDB (data-store.js) is the local persistence layer; Supabase is cloud truth
- Realtime sync handles the cloud↔local reconciliation
- Delete operations properly implement soft-delete at the Supabase level

**Top issues found:**
1. 🟡 `broadcast.js` only supports one listener at a time (uses `onmessage` instead of `addEventListener`)
2. 🟡 `cloud-photos.js` batch signed URL generation is sequential — severe performance issue for large batches
3. 🟡 `data-store.js` `replaceAllReports()` clears-then-inserts — crash during write loses all local reports
4. 🟡 `deleteReportCascade` (hard-delete) is still exposed globally alongside `deleteReportFull` (soft-delete) — confusing API surface
5. 🟡 `realtime-sync.js` `_refineRedirectInProgress` flag is never reset on failure — blocks future redirects
6. 🟡 `realtime-sync.js` has no catch-up query after visibility-change resubscription — events during hidden period are lost
7. 🟡 `supabase-retry.js` has no jitter on backoff — thundering herd risk
8. 🟡 `ai-assistant.js` relies on `escapeHtml()` from ui-utils.js — XSS risk if load order breaks
9. 🟠 `console-capture.js` `debug_logs` table has no retention policy — could grow unbounded
10. 🟠 `data-store.js` DB upgrade logic can't modify existing stores (only creates missing ones)
11. ⚫ `data-store.js` `deleteReport()`, `deletePhotosByReportId()`, `deleteProject()` are hard IDB deletes

---

## 9. Service Worker & PWA

Three files govern the PWA experience: `sw.js` (service worker), `js/pwa-utils.js` (registration and UI), and `manifest.json` (web app manifest). Together they enable offline support, home-screen installation, and update handling.

**Total code: ~540 lines across 2 JS files + 1 JSON manifest**

---

### 9.1 `sw.js` (376 lines)

**What it does:** Service worker providing offline caching, three-tier fetch strategies, and version-gated cache invalidation.

**Cache architecture:**
- `CACHE_VERSION = 'v6.9.31'` — must be bumped on every deploy (mirrors `version.json`)
- `CACHE_NAME = 'fieldvoice-pro-v6.9.31'` — versioned cache bucket
- `STATIC_ASSETS` — 103 local files (all HTML pages, all JS modules, manifest, icons, CSS)
- `CDN_ASSETS` — 10 external resources (Font Awesome CSS + wfonts, Supabase JS, Leaflet, jsQR, html2canvas, jsPDF)
- `API_PATTERNS` — URL substrings for API detection: `api.open-meteo.com`, `n8n`, `webhook`

**Fetch strategies (four tiers):**

| Request Type | Strategy | Fallback |
|---|---|---|
| Navigation (`mode: 'navigate'`) | Network-first | Cached page → cached index.html → 503 |
| JS files (same-origin `.js`) | Network-first (`cache: 'no-cache'`) | SW cache → 503 JS comment |
| API calls (matching API_PATTERNS) | Network-only | JSON `{ offline: true }` with 503 |
| Static assets (CSS, images, fonts) | Cache-first (stale-while-revalidate) | Network → 503 text |

**Lifecycle:**
- `install`: caches all STATIC_ASSETS + CDN_ASSETS (CDN failures are tolerated), calls `skipWaiting()`
- `activate`: deletes old `fieldvoice-pro-*` caches, calls `clients.claim()`
- `message`: responds to `SKIP_WAITING` and `GET_VERSION` messages from client

🟢 **GOOD:** Network-first for JS with `cache: 'no-cache'` — fixes the stale JS problem that plagued earlier versions. Comment explains the rationale clearly.
🟢 **GOOD:** Navigation fallback chain (exact page → index.html) provides graceful offline degradation
🟢 **GOOD:** CDN assets cached individually with per-item error handling — one CDN failure doesn't break the entire install
🟢 **GOOD:** Old cache cleanup in `activate` uses prefix matching — no stale caches linger
🟢 **GOOD:** `GET_VERSION` message handler enables client-side version checking

🔴 **BUG:** `STATIC_ASSETS` includes `'./admin.html'` — wait, actually it does NOT include `admin.html`. If admin.html exists as a page, it won't be cached for offline use. (Not in the array — confirmed by inspection.)
🟡 **ISSUE:** `STATIC_ASSETS` has 103 entries that must be manually maintained. Adding a new JS module and forgetting to add it here means it won't be available offline. No build step or automation generates this list.
🟡 **ISSUE:** CDN assets are cached without subresource integrity (SRI) hashes. A CDN compromise could serve malicious code that gets cached in the service worker. The `STATIC_ASSETS` array references the same CDN URLs loaded by HTML pages.
🟡 **ISSUE:** `API_PATTERNS` matching is substring-based — `'n8n'` would match any URL containing "n8n" (including, hypothetically, a page like `n8n-docs.html`). `'webhook'` is similarly broad.
🟡 **ISSUE:** The `updateCacheInBackground()` function (stale-while-revalidate for static assets) does `fetch(request)` without `cache: 'no-cache'` — the browser's HTTP cache may serve a stale response, making the background update ineffective.
🟡 **ISSUE:** `skipWaiting()` is called unconditionally during install AND can be triggered via message — this means new service worker versions activate immediately without waiting for all tabs to close. If the new version has breaking cache changes, still-open tabs may get inconsistent behavior.
🟠 **MAYBE:** The `handleStaticRequest` fallback for navigation requests (lines 261–265) duplicates logic from `handleNavigationRequest` — but `handleStaticRequest` should never receive navigation requests since they're intercepted earlier. Dead code path.
🟠 **MAYBE:** `version.json` is mentioned in comments as the canonical version source, but `sw.js` has the version hardcoded as a string constant. If someone updates `version.json` but forgets `sw.js` (or vice versa), versions diverge.
🔵 **IMPROVEMENT:** Consider a build step that reads `version.json` and injects the version into `sw.js` — eliminates the dual-update requirement
🔵 **IMPROVEMENT:** The Supabase JS SDK (`@supabase/supabase-js@2`) is cached from CDN without a pinned version — `@2` resolves to latest, meaning different devices may cache different versions. Pin to a specific semver.

---

### 9.2 `js/pwa-utils.js` (164 lines)

**What it does:** Client-side PWA utilities: service worker registration, standalone navigation fix, offline banner management, and update notification banner.

**Functions:**
- `initPWA(options)` — main entry: sets up PWA navigation, registers SW, sets up offline banner
- `setupPWANavigation()` — prevents Safari from breaking out of standalone mode on internal links
- `registerServiceWorker()` — registers `sw.js`, requests persistent storage, listens for `updatefound`
- `setupOfflineBanner(onOnline, onOffline)` — shows/hides `#offline-banner` on network state changes
- `injectOfflineBanner(message)` — creates banner element dynamically if not in HTML
- `showUpdateBanner()` — creates a blue "tap to refresh" banner when new SW version detected

**Usage across pages:**
- 8 pages call `initPWA()`: index, interview, landing, permission-debug, permissions, project-config, projects, settings
- 3 pages have `<link rel="manifest">` but do NOT load pwa-utils.js or call `initPWA()`: **archives.html, login.html, report.html**

🟢 **GOOD:** `setupPWANavigation()` correctly detects standalone mode via both `navigator.standalone` (iOS) and `display-mode: standalone` media query (Android)
🟢 **GOOD:** Requests `navigator.storage.persist()` — critical for preventing data eviction on Android
🟢 **GOOD:** `showUpdateBanner()` deduplication check (`getElementById('update-banner')`) prevents multiple banners
🟢 **GOOD:** Graceful `typeof initPWA === 'function'` guards in all calling pages — won't crash if script fails to load

🔴 **BUG:** **archives.html, login.html, and report.html** do not load `pwa-utils.js` or call `initPWA()`. This means:
  - No service worker registration on these pages (if the user's first visit is to one of these pages, no SW gets installed)
  - No offline banner on these pages
  - No update detection banner
  - No standalone navigation fix (Safari may break out of PWA mode on link clicks)
  - **report.html is the most critical** — users spend significant time editing reports, and this page has no offline notification

🟡 **ISSUE:** `registerServiceWorker()` computes scope from `location.pathname` — if the app is deployed to different subdirectory paths, this is fine. But if `sw.js` is at the root and pages are in subdirectories, the scope calculation could register multiple workers.
🟡 **ISSUE:** The update banner says "tap to refresh" but just does `location.reload()` — it doesn't send `SKIP_WAITING` to the waiting worker first. The reload will use the OLD worker if the new one hasn't activated yet. Should send `SKIP_WAITING` message then reload on `controllerchange`.
🟡 **ISSUE:** `setupOfflineBanner()` depends on `#offline-banner` existing in the DOM, but `injectOfflineBanner()` (which creates it dynamically) is never called by `initPWA()`. Pages that don't have the banner in their HTML will silently have no offline indicator.
🔵 **IMPROVEMENT:** `initPWA()` should call `injectOfflineBanner()` as a fallback if `#offline-banner` doesn't exist in the DOM

---

### 9.3 `manifest.json` (98 lines)

**What it does:** Web app manifest defining PWA metadata for home-screen installation.

**Configuration:**
- `name`: "FieldVoice Pro" / `short_name`: "FieldVoice"
- `display`: "standalone" / `orientation`: "portrait-primary"
- `start_url`: "./index.html"
- `theme_color` + `background_color`: "#0a1628" (dark navy)
- Icons: 8 sizes (72–512px) × 2 purposes (any + maskable) = 16 icon entries
- Categories: business, productivity, utilities
- `scope`: "./"

🟢 **GOOD:** Comprehensive icon set covering all required sizes with both `any` and `maskable` variants — proper PWA compliance
🟢 **GOOD:** `prefer_related_applications: false` — ensures the PWA install prompt isn't suppressed in favor of a native app
🟢 **GOOD:** `orientation: "portrait-primary"` is appropriate for a mobile-first field tool

🟠 **MAYBE:** No `screenshots` array — modern browsers (Chrome 118+) use screenshots in the install UI. Adding 2–3 screenshots would improve install conversion.
🟠 **MAYBE:** No `shortcuts` array — could add quick actions like "New Report", "Dashboard", "Archives" that appear on long-press of the home screen icon
🔵 **IMPROVEMENT:** No `id` field — without it, the browser uses `start_url` as the PWA identity. Adding `"id": "/fieldvoice-pro"` would decouple identity from URL and prevent accidental duplicate installs if `start_url` changes.

---

### Service Worker & PWA Summary

**Total code: ~540 lines across 3 files**

**Key architectural patterns:**
- Network-first for JS (with `cache: 'no-cache'`) + cache-first for static assets — good balance of freshness and offline capability
- Version-gated cache names with old-cache cleanup on activation
- Client-side persistent storage requests for data durability
- Standalone navigation interception for iOS PWA compatibility

**Top issues found:**
1. 🔴 **archives.html, login.html, and report.html** don't load pwa-utils.js — no SW registration, no offline banner, no update detection, no standalone nav fix. **report.html is critical.**
2. 🟡 103-entry `STATIC_ASSETS` array must be manually maintained — high risk of missing new files
3. 🟡 CDN assets cached without SRI hashes — supply chain risk
4. 🟡 Supabase JS SDK cached as `@2` (unpinned) — different devices may get different versions
5. 🟡 Update banner does `reload()` without `SKIP_WAITING` — may reload with old worker
6. 🟡 `injectOfflineBanner()` is never called by `initPWA()` — pages without HTML banner get no offline indicator
7. 🟡 `updateCacheInBackground()` doesn't bypass browser HTTP cache — stale-while-revalidate may serve stale content
8. 🟠 `version.json` and `sw.js` version must be updated in sync manually — no build automation
9. 🟠 No `shortcuts` or `screenshots` in manifest — missed PWA enhancement opportunities

---

## 10. Supabase Backend Audit

Audit of the Supabase project (`bdqfpemylkqnmeqaoere`) backing FieldVoice Pro: 12 tables, 2 RPC functions, 2 storage buckets, 9 migration files. Data gathered via Supabase CLI (`inspect db`), REST API introspection, and migration file analysis.

---

### 10.1 Schema Overview

**12 tables**, listed by total size (descending):

| Table | Total Size | Est. Rows | Purpose | Status |
|---|---|---|---|---|
| interview_backup | 704 KB | 26 | Draft interview state (auto-saved every 5s) | Active |
| debug_logs | 408 KB | 430 | Console capture from all clients | Active |
| projects | 376 KB | 3 | Project configuration & metadata | Active |
| ai_submissions | 216 KB | 16 | AI processing requests & responses | Active |
| report_data | 200 KB | 17 | Refined report content (AI + user edits) | Active |
| report_backup | 112 KB | 1 | Legacy report page state | **Deprecated** (Sprint 13) |
| reports | 80 KB | 32 | Report headers (status, dates, project ref) | Active — core table |
| user_profiles | 80 KB | 6 | User identity, role, org membership | Active |
| user_devices | 64 KB | 10 | Multi-device tracking per user | Active |
| organizations | 48 KB | 1 | Org/team structure | Active |
| final_reports | 40 KB | 0 | Legacy submitted report records | **Deprecated** (Sprint 13) |
| photos | 32 KB | 12 | Photo metadata + storage paths | Active |

**2 RPC functions:** `get_user_org_id()`, `get_user_profile_id()` — used for RLS policy evaluation.

**2 storage buckets** (referenced in code):
- `report-photos` — photo uploads from field capture
- `report-pdfs` — generated PDF reports

---

### 10.2 Table-by-Table Analysis

#### `reports` — Core Table (32 rows, 80 KB)

The central table. Every report starts here as a `draft` and progresses through statuses.

**Columns:** id (PK), project_id (FK→projects), user_id, device_id, report_date (NOT NULL), status, capture_mode, created_at, updated_at, submitted_at, org_id (FK→organizations), pdf_url, inspector_name, dashboard_dismissed_at

**Status lifecycle:** `draft` → `capturing` → `processing` → `refined` → `submitted` | `deleted`

**Relationships:**
- `project_id → projects.id` (FK added in migration 010)
- `org_id → organizations.id` (FK added in migration 004)
- Referenced by: report_data, interview_backup, report_backup, ai_submissions, photos (all via report_id)

🟢 **GOOD:** Sprint 13 merged `pdf_url`, `inspector_name`, `submitted_at` from `final_reports` into `reports` — eliminates unnecessary JOIN for archives
🟢 **GOOD:** `dashboard_dismissed_at` allows submitted reports to be hidden from dashboard without deletion — nice UX pattern
🟢 **GOOD:** Soft-delete via `status = 'deleted'` (code uses `deleteReportFull` which sets this)

🔴 **BUG:** `user_id` column is type UUID but has **no foreign key constraint** to `auth.users` or `user_profiles`. This means orphaned reports can exist if a user is deleted. The `user_id` value appears to come from `user_profiles.id` (not `auth.uid()`), but there's no referential integrity enforcing this.
🟡 **ISSUE:** No index on `user_id` — the realtime sync filter `user_id=eq.{userId}` and the `syncReportsFromCloud` query both filter by user_id. Without an index, these scan the full table.
🟡 **ISSUE:** No index on `status` — `neq('status', 'deleted')` filter in cloud sync has to scan all rows
🟡 **ISSUE:** `device_id` is a plain text column with no FK to `user_devices` — no way to validate device identity
⚫ **SOFT-DELETE:** `deleteReportCascade()` still does `DELETE FROM reports WHERE id = ...` (hard delete). Only `deleteReportFull()` does soft-delete. If cascade is ever called directly, the row is gone permanently.

#### `report_data` — Report Content (17 rows, 200 KB)

Stores the actual report content: AI-generated output, original field input, and user edits.

**Columns:** report_id (PK, FK→reports ON DELETE CASCADE), ai_generated (JSONB), original_input (JSONB), user_edits (JSONB), capture_mode, status, created_at, updated_at, org_id (FK→organizations)

🟢 **GOOD:** `ON DELETE CASCADE` from reports — when a report is hard-deleted, report_data is automatically cleaned up
🟢 **GOOD:** Auto-updating `updated_at` trigger — ensures timestamp accuracy for sync comparisons
🟢 **GOOD:** JSONB columns allow flexible schema evolution for AI output format changes

🟡 **ISSUE:** RLS is **explicitly disabled** (migration 003: "Disable RLS to match existing tables"). A policy exists (`Users can manage own report data`) but is not enforced. Any authenticated user can read/modify ANY report's data.
🟡 **ISSUE:** `org_id` was added later but has no trigger to auto-populate from the parent `reports.org_id` — requires application code to keep them in sync

#### `interview_backup` — Draft State (26 rows, 704 KB)

Auto-saved interview state (every 5 seconds during field capture). The largest table by data size.

**Columns:** id (PK), report_id (NOT NULL), page_state (JSONB, NOT NULL), created_at, updated_at, org_id (FK→organizations)

🟢 **GOOD:** RLS is **enabled** with org-scoped policy (`Org members can manage interview_backup`) using `get_user_org_id()` — the only table with properly working RLS
🟢 **GOOD:** Migration 011 cleaned up conflicting policies and added the org_id column

🟡 **ISSUE:** `page_state` JSONB stores the entire interview form state every 5 seconds. At 704 KB for 26 rows, that's ~27 KB per backup. With multiple users doing multiple reports per day, this table will grow rapidly.
🟡 **ISSUE:** No cleanup mechanism — old backups accumulate indefinitely. Should have a retention policy (e.g., keep only last 24 hours of backups per report).
🟠 **MAYBE:** `report_id` has no FK constraint to `reports.id` — orphaned backups could exist

#### `photos` — Photo Metadata (12 rows, 32 KB)

Links to photo files in Supabase Storage. The `storage_path` column is the durable reference; `photo_url` may contain stale signed URLs.

**Columns:** id (PK), report_id, photo_url, storage_path, caption, photo_type, taken_at, location_lat (numeric), location_lng (numeric), filename, created_at, org_id (FK→organizations)

🟢 **GOOD:** Dual URL strategy (storage_path as truth, photo_url as convenience) with code always regenerating signed URLs from storage_path (SEC-04)

🟡 **ISSUE:** `report_id` has **no FK constraint** to `reports.id` — photos can be orphaned if a report is deleted without cascade
🟡 **ISSUE:** No RLS — any authenticated user can query all photos across all orgs
🟡 **ISSUE:** `location_lat` and `location_lng` are `numeric` type (arbitrary precision) — `double precision` or `real` would be more appropriate and faster for GPS coordinates
⚫ **SOFT-DELETE:** `deleteReportCascade` hard-deletes from `photos` table and removes files from storage. No way to recover deleted photos.

#### `projects` — Project Config (3 rows, 376 KB)

Large relative to row count (376 KB / 3 rows = ~125 KB/row) due to JSONB `contractors` field.

**Columns:** id (PK), user_id, project_name (NOT NULL), noab_project_no, cno_solicitation_no, location, engineer, prime_contractor, notice_to_proceed, contract_duration, expected_completion, default_start_time, default_end_time, weather_days, logo_thumbnail, logo_url, status, created_at, updated_at, contractors (JSONB), contractors_display, org_id (FK→organizations), report_date, contract_day_no

🟢 **GOOD:** Org-scoped via `org_id` FK — ready for multi-tenant isolation
🟢 **GOOD:** `contractors` JSONB allows flexible contractor list without a separate table
🟢 **GOOD:** Realtime enabled (migration 007) for multi-device project sync

🟡 **ISSUE:** `logo_thumbnail` stores inline data (likely base64) — contributes to the large row size. Should use storage bucket references instead.
🟡 **ISSUE:** No RLS — any authenticated user can read/modify all projects
🟡 **ISSUE:** `user_id` with no FK constraint — same issue as `reports`
🟠 **MAYBE:** `weather_days` (integer) is ambiguous — is it days lost to weather or total weather days tracked?

#### `ai_submissions` — AI Processing Log (16 rows, 216 KB)

Records each AI processing request sent to n8n webhook.

**Columns:** id (PK), report_id (NOT NULL), original_input (JSONB), ai_response (JSONB), model_used, processing_time_ms, submitted_at, org_id (FK→organizations)

🟢 **GOOD:** Captures both input and output — enables debugging AI quality issues
🟢 **GOOD:** `processing_time_ms` enables performance monitoring

🟡 **ISSUE:** No RLS — any authenticated user can read all AI submissions (including other users' report content)
🟡 **ISSUE:** `report_id` has no FK constraint — orphaned submissions possible
🟠 **MAYBE:** No retention policy — AI responses with full JSONB can be large, and this table grows with every report submission

#### `user_profiles` — User Identity (6 rows, 80 KB)

**Columns:** id (PK), full_name, title, company, email, phone, device_id, created_at, updated_at, auth_user_id (UUID), role, org_id (FK→organizations), device_info (JSONB)

🟢 **GOOD:** `auth_user_id` links to `auth.users` — the bridge between Supabase Auth and application identity
🟢 **GOOD:** 9,044 sequential scans suggest heavy usage (auth checks, profile lookups) — works due to small table size

🟡 **ISSUE:** No RLS — user profiles (including email, phone) are readable by any authenticated user
🟡 **ISSUE:** `device_id` (singular text) is a legacy field — `user_devices` table now tracks multiple devices, but this old column remains
🟡 **ISSUE:** `role` column defaults to `'inspector'` — no enum or check constraint to validate role values

#### `debug_logs` — Console Capture (430 rows, 408 KB)

**Columns:** id (PK), created_at, level (NOT NULL), message (NOT NULL), page, device_id

🟡 **ISSUE:** No RLS — debug logs from ALL users/devices are accessible to any authenticated user
🟡 **ISSUE:** No TTL/retention — 430 rows already at 408 KB. With console capture running on every page load across all users, this will grow unbounded. **Needs a scheduled cleanup job** (e.g., delete rows older than 7 days).
🟡 **ISSUE:** No index on `created_at` — querying recent logs requires full table scan
🔵 **IMPROVEMENT:** Consider partitioning by date or adding a cron job to prune old entries

#### `organizations` — Org Structure (1 row, 48 KB)

Minimal table. Single org currently.

**Columns:** id (PK), name (NOT NULL), slug (UNIQUE), created_at, updated_at

🟢 **GOOD:** `slug` with UNIQUE constraint — enables human-readable org identifiers for sharing/invites

🟠 **MAYBE:** Only 1 org exists — multi-tenant features are built but untested at scale

#### `user_devices` — Multi-Device Tracking (10 rows, 64 KB)

**Columns:** id (PK), user_id (FK→user_profiles ON DELETE CASCADE), device_id (NOT NULL), device_info (JSONB), last_active, created_at. UNIQUE(user_id, device_id).

🟢 **GOOD:** `ON DELETE CASCADE` from user_profiles — clean device cleanup on user deletion
🟢 **GOOD:** `UNIQUE(user_id, device_id)` prevents duplicate device registrations

🟡 **ISSUE:** No RLS — any authenticated user can see all devices for all users
🟡 **ISSUE:** `last_active` is never updated after initial creation (no code writes to this table after the initial device registration) — stale timestamps

#### `report_backup` — **DEPRECATED** (1 row, 112 KB)

Deprecated in Sprint 13. No longer written to or read from by application code. Still exists as "safety net." Only referenced by `deleteReportCascade` (for cleanup during deletion).

🔵 **IMPROVEMENT:** Can be safely DROPped in a future migration. The deprecation comment in migration 008 says as much.

#### `final_reports` — **DEPRECATED** (0 rows, 40 KB)

Deprecated in Sprint 13. Columns merged into `reports` table. Only referenced by `deleteReportCascade` (for legacy cleanup). No active rows.

🔵 **IMPROVEMENT:** Can be safely DROPped. Migration 009 notes this.

---

### 10.3 RLS (Row Level Security) Analysis

**Critical finding: RLS is disabled or absent on 11 of 12 tables.**

| Table | RLS Status | Policy |
|---|---|---|
| interview_backup | ✅ **ENABLED** | `Org members can manage interview_backup` (org_id scoped) |
| report_data | ❌ **DISABLED** | Policy exists but explicitly disabled in migration |
| reports | ❌ **DISABLED** | No policies defined |
| photos | ❌ **DISABLED** | No policies defined |
| projects | ❌ **DISABLED** | No policies defined |
| ai_submissions | ❌ **DISABLED** | No policies defined |
| user_profiles | ❌ **DISABLED** | No policies defined |
| user_devices | ❌ **DISABLED** | No policies defined |
| debug_logs | ❌ **DISABLED** | No policies defined |
| organizations | ❌ **DISABLED** | No policies defined |
| report_backup | ❌ **DISABLED** | No policies (deprecated) |
| final_reports | ❌ **DISABLED** | No policies (deprecated) |

🔴 **BUG:** **This is the single most critical security issue in the entire codebase.** Any authenticated user (even from a different org) can read, modify, or delete ANY data in the system using the Supabase anon key + their auth token. This includes:
- Other users' reports and report content
- Other users' personal info (email, phone, name)
- Other users' photos and GPS coordinates
- All AI processing logs
- All debug logs from all devices

The Supabase anon key is already exposed in client-side JavaScript (`config.js`). Combined with a valid auth session (any signed-up user), the entire database is effectively open.

**Recommended priority:** Enable RLS on all active tables using the `get_user_org_id()` RPC pattern already proven on `interview_backup`. Migration order should be:
1. `reports` (most sensitive — user's work product)
2. `report_data` (re-enable the already-defined policy)
3. `photos` (GPS data is PII)
4. `user_profiles` (email/phone)
5. `projects`, `ai_submissions`, `user_devices`, `debug_logs`, `organizations`

---

### 10.4 Storage Buckets

Two buckets referenced in code:

**`report-photos`** — Used by `interview/photos.js` for uploads and `cloud-photos.js` for signed URL generation. Files addressed by `storage_path` from the `photos` table.

**`report-pdfs`** — Used by `report/pdf-generator.js` (or submit flow) for storing generated PDFs. Referenced by `reports.pdf_url` and legacy `final_reports.pdf_url`.

🟡 **ISSUE:** Bucket RLS/policies could not be inspected with the anon key. If storage bucket policies mirror the permissive table approach, any authenticated user could list/download other users' photos and PDFs.
🟠 **MAYBE:** No lifecycle/expiration policies on storage objects — deleted reports may leave orphaned files in storage if the cascade delete's storage removal step fails silently

---

### 10.5 Migration Health

**9 migration files** (003–011, no 001–002 — initial schema was likely created via Supabase dashboard):

🟢 **GOOD:** Migrations are well-documented with sprint references and clear rationale
🟢 **GOOD:** `IF NOT EXISTS` / `IF EXISTS` guards make migrations idempotent
🟢 **GOOD:** Deprecated tables are kept as safety nets rather than immediately dropped — conservative approach

🟡 **ISSUE:** No migration 001/002 — initial table creation wasn't captured in migration files. The full schema can't be reconstructed from migrations alone.
🟡 **ISSUE:** Migration 003 creates an RLS policy then immediately disables RLS — confusing. The comment explains it ("match existing pattern"), but this means the policy is dead code.
🔵 **IMPROVEMENT:** Migration 008 and 009 note "DO NOT DROP TABLE" — these should have follow-up migration numbers assigned (e.g., "planned for migration 015") to track the cleanup debt

---

### 10.6 RPC Functions

**`get_user_org_id()`** — Returns the org_id for the currently authenticated user. Used in RLS policies (interview_backup). Queries `user_profiles.org_id WHERE auth_user_id = auth.uid()`.

**`get_user_profile_id()`** — Returns the user_profiles.id for the currently authenticated user. Available but not currently used in any RLS policy.

🟢 **GOOD:** These functions enable clean RLS policies without complex JOINs in policy expressions
🟠 **MAYBE:** `get_user_org_id()` is called on every row access for `interview_backup` — should be marked as `STABLE` or `IMMUTABLE` if not already, to allow Postgres query planner to cache the result within a transaction

---

### Supabase Backend Summary

**Key findings:**

1. 🔴 **CRITICAL: RLS disabled on 11 of 12 tables** — any authenticated user can access all data in the system. This is the #1 priority security fix.
2. 🔴 `reports.user_id` has no FK constraint — orphan risk and no referential integrity
3. 🟡 No retention policy on `debug_logs` or `interview_backup` — unbounded growth
4. 🟡 Multiple tables missing FK constraints: `photos.report_id`, `ai_submissions.report_id`, `interview_backup.report_id`
5. 🟡 No indexes on frequently-filtered columns (`reports.user_id`, `reports.status`)
6. 🟡 2 deprecated tables (`report_backup`, `final_reports`) still consuming space — safe to drop
7. 🟡 Storage bucket policies unknown — potentially same open-access pattern
8. ⚫ `deleteReportCascade` hard-deletes from `photos`, `ai_submissions`, `report_data`, `interview_backup`, `report_backup`, `final_reports`, and `reports` — no recovery possible
9. 🟡 `user_profiles` exposes PII (email, phone) to all authenticated users without RLS
10. 🟡 Initial schema (migrations 001-002) not captured — incomplete migration history

---

## 11. n8n Workflow Audit

Four n8n webhook endpoints are called from the FieldVoice Pro codebase. All are hosted on `advidere.app.n8n.cloud`. This audit covers the client-side integration contracts — payload shapes, auth, timeouts, error handling, and response expectations. The actual n8n workflow internals are not accessible via the available MCP tools (the n8n MCP is a node/template reference, not an instance API).

---

### 11.1 `fieldvoice-v69-refine-report` — Main AI Processing

**URL:** `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report`
**Called from:** `interview/finish-processing.js` (primary), `report/ai-refine.js` (retry on pending_refine)
**Auth:** `X-API-Key: fvp-n8n-webhook-key-2026` header
**Timeout:** 60 seconds (AbortController)
**Content-Type:** `application/json`

**Purpose:** The core AI pipeline. Takes raw field notes from the interview/capture phase and returns a structured, DOT-compliant daily report. This is the most critical webhook — it's the product's core value proposition.

**Request payload (from `buildProcessPayload()`):**
```
{
  reportId: string (UUID),
  captureMode: 'guided' | 'minimal',
  projectContext: {
    projectId, projectName, noabProjectNo, location,
    engineer, primeContractor, contractors[], equipment[]
  },
  fieldNotes: {
    // minimal mode: freeformNotes + freeform_entries[]
    // guided mode: workSummary, issues, safety
  },
  weather: { ... },
  photos: [{ id, url, storagePath, caption, timestamp, date, time, gps }],
  reportDate: string,
  inspectorName: string,
  operations: [],
  equipmentRows: [],
  activities: [],
  safety: { hasIncidents, noIncidents, notes[] },
  entries: [],
  toggleStates: {}
}
```

**Expected response:** `{ success: boolean, aiGenerated: object|string }`
- If `aiGenerated` is a string, the client attempts `JSON.parse()` with fallback
- Response is saved to `report_data` table and `ai_submissions` table
- On success, report status transitions to `refined` (triggers realtime sync to other devices)

**Error handling:**
- AbortController timeout → shows processing overlay error
- HTTP non-200 → throws with status code
- Invalid response structure → throws "Invalid response from AI processing"
- Offline → queues payload in report metadata for later retry (`handleOfflineProcessing`)

🟢 **GOOD:** Offline queue with retry capability — field workers can capture data without connectivity and process later
🟢 **GOOD:** 60-second timeout is appropriate for AI processing that may involve multiple LLM calls
🟢 **GOOD:** Response validation checks both `success` flag and `aiGenerated` presence
🟢 **GOOD:** String-to-JSON fallback for `aiGenerated` handles n8n's variable response serialization

🟡 **ISSUE:** The payload includes photo `url` fields which may contain expired signed URLs by the time the webhook processes them. The webhook should use `storagePath` to generate its own URLs.
🟡 **ISSUE:** No retry on transient failures (only offline queueing). A 502/503 from n8n during processing leaves the report stuck in `processing` status with no automatic retry.
🟠 **MAYBE:** The `entries` and `toggleStates` fields are sent but their structure is not documented — the n8n workflow must know how to interpret them

---

### 11.2 `fieldvoice-v69-refine-text` — Section-Level Refinement

**URL:** `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text`
**Called from:** `report/ai-refine.js` (per-section and per-contractor narrative refinement)
**Auth:** `X-API-Key: fvp-n8n-webhook-key-2026` header
**Timeout:** 20 seconds (AbortController)
**Content-Type:** `application/json`

**Purpose:** Refines a single text section of an already-generated report. Used when the user wants to polish a specific section (issues, inspections, safety, activities, visitors) or a contractor's narrative.

**Request payload (section refinement):**
```
{
  originalText: string,
  section: 'issues' | 'inspections' | 'safety' | 'activities' | 'visitors' | 'additionalNotes',
  reportContext: {
    projectName: string,
    reporterName: string,
    date: string
  }
}
```

**Request payload (contractor narrative):**
```
{
  originalText: string,
  section: 'contractorNarrative',
  contractorName: string,
  reportContext: { projectName, reporterName, date }
}
```

**Expected response:** `{ refinedText: string }`
- Client validates: non-empty and not containing `[not provided]`
- On success, replaces textarea content and triggers autosave via input event

🟢 **GOOD:** Focused, single-purpose API — refines one section at a time rather than regenerating the whole report
🟢 **GOOD:** Response validation catches the `[not provided]` placeholder that LLMs sometimes emit

🟡 **ISSUE:** 20-second timeout may be tight for LLM processing. If n8n is under load or uses a slower model, users will see "Failed" without understanding why.
🟡 **ISSUE:** No loading state management for concurrent refine requests — user could click "Refine" on two sections simultaneously, causing potential race conditions in the UI

---

### 11.3 `fieldvoice-v69-project-extractor` — Document Import

**URL:** `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-project-extractor`
**Called from:** `project-config/document-import.js`
**Auth:** ❌ **NONE** — no API key header sent
**Timeout:** ❌ **NONE** — no AbortController
**Content-Type:** `multipart/form-data` (FormData with file uploads)

**Purpose:** Extracts project configuration data from uploaded PDF/DOCX documents (construction contracts, specifications). Auto-populates the project config form.

**Request payload:**
- FormData with `documents` field containing one or more files
- Accepted extensions: `.pdf`, `.docx`
- No additional metadata sent (no project ID, no user context)

**Expected response:** `{ success: boolean, data: object, extractionNotes?: string[], error?: string }`
- `data` is mapped to form fields via `populateFormWithExtractedData()`
- `extractionNotes` shown as informational banners

🔴 **BUG:** **No authentication** — the `N8N_WEBHOOK_API_KEY` header is not included in this request. Unlike all other webhooks, this endpoint is called with zero auth. Anyone who knows the URL can upload files to the n8n workflow.
🔴 **BUG:** **No timeout** — if the n8n workflow hangs (e.g., processing a large PDF), the fetch call will wait indefinitely. The UI shows a loading spinner with no way to cancel.

🟡 **ISSUE:** No file size validation before upload — a user could upload a 100MB PDF, causing network issues and potential n8n timeouts
🟡 **ISSUE:** No progress indication for file upload — large files could take significant time with no feedback beyond the spinner
🔵 **IMPROVEMENT:** Add `AbortController` with 60+ second timeout (document processing is slow) and the standard `X-API-Key` header

---

### 11.4 `fieldvoice-v69-ai-chat` — AI Assistant

**URL:** `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-ai-chat`
**Called from:** `shared/ai-assistant.js`
**Auth:** `X-API-Key: fvp-n8n-webhook-key-2026` header
**Timeout:** 20 seconds (AbortController)
**Content-Type:** `application/json`

**Purpose:** General-purpose AI chat for field workers. Handles questions that can't be resolved by the local command engine (Section 8.1).

**Request payload:**
```
{
  message: string (sanitized, max 10KB),
  history: [{ role, content }] (last 10 messages, sanitized),
  context: {
    currentPage: string (pathname),
    projectName: string | null,
    projectId: string | null,
    reportDate: string (today's date),
    deviceId: string | null,
    lat: number | null,
    lng: number | null
  }
}
```

**Expected response:** `{ response | message | text: string }`
- Client tries three response fields in order: `response`, `message`, `text`
- Fallback: "I got a response but couldn't parse it."

🟢 **GOOD:** Input sanitization (SEC-06) runs before webhook call — control characters stripped, 10KB max enforced
🟢 **GOOD:** Context includes GPS, current page, and project info — enables location-aware and page-aware responses
🟢 **GOOD:** History limited to 10 messages — prevents bloated payloads

🟡 **ISSUE:** 20-second timeout may be tight if the n8n workflow does RAG or multi-step processing
🟠 **MAYBE:** Three-field response fallback (`response | message | text`) suggests the n8n workflow's response format has changed over time — should be standardized to one field

---

### n8n Integration Summary — Cross-Cutting Issues

**Webhook comparison matrix:**

| Webhook | Auth | Timeout | Content | Offline Queue | Retry |
|---|---|---|---|---|---|
| refine-report | ✅ API Key | 60s | JSON | ✅ Yes | ❌ No (manual only) |
| refine-text | ✅ API Key | 20s | JSON | ❌ No | ❌ No |
| project-extractor | ❌ **None** | ❌ **None** | FormData | ❌ No | ❌ No |
| ai-chat | ✅ API Key | 20s | JSON | ❌ No | ❌ No |

**Top issues found:**
1. 🔴 `project-extractor` has **no auth and no timeout** — open endpoint, can hang indefinitely
2. 🟡 API key (`fvp-n8n-webhook-key-2026`) is a static string in client-side JS — not real security, just a basic check. All 4 webhook URLs are equally exposed.
3. 🟡 No automatic retry on transient failures for any webhook — `refine-report` has offline queue but no retry on 5xx errors
4. 🟡 `refine-report` sends photo `url` fields with potentially expired signed URLs
5. 🟡 Timeouts vary (20s, 60s, ∞) without clear rationale — should be standardized based on expected processing time
6. 🟡 No rate limiting on the client side — a user rapidly clicking "Refine" could flood n8n with concurrent requests
7. 🟠 The n8n workflow internals could not be audited — workflow logic, AI model selection, error handling, and cost per invocation are unknown from the client side alone
8. 🔵 All webhook URLs are hardcoded — should be configurable (per-environment) or proxied through Supabase Edge Functions to hide n8n URLs entirely

---

## 12. Cross-Cutting Analysis

Analysis of codebase-wide patterns, duplications, dead code, and architectural concerns that span multiple sections.

**Codebase metrics:**
- **29,566 lines** of JavaScript across **80 files** (excluding `js/outdated/`)
- **7,104 lines** of HTML across **11 pages**
- **908 function definitions** total
- **121 `window.*` global assignments**
- **0 ES modules** — entire codebase uses IIFEs and script-tag globals
- **238 console.log statements** in production code (captured by console-capture.js)

---

### 12.1 Duplicate Functions

**17 function names are defined in multiple files**, creating shadowing risks since all scripts share the global scope:

| Function | Files | Risk |
|---|---|---|
| `saveReport()` | interview/persistence.js, report/autosave.js | 🔴 Both pages can't be loaded simultaneously (safe), but shared modules could call the wrong one |
| `saveReportToSupabase()` | interview/persistence.js, report/autosave.js | Same as above — different signatures |
| `confirmDeleteReport()` | index/report-cards.js, report/delete-report.js | Different signatures (one takes reportId, other reads from state) |
| `executeDeleteReport()` | index/report-cards.js, report/delete-report.js | Different signatures and UI behavior |
| `addEquipmentRow()` | interview/equipment-manual.js, report/form-fields.js | Duplicated logic for same UI pattern |
| `getContractorActivity()` | interview/contractors-personnel.js, report/form-fields.js | **Near-identical** data access functions |
| `getContractorOperations()` | interview/contractors-personnel.js, report/form-fields.js | **Near-identical** data access functions |
| `toggleNoWork()` | interview/contractors-personnel.js, report/form-fields.js | Duplicated toggle logic |
| `updateEquipmentRow()` | interview/equipment-manual.js, report/form-fields.js | Different signatures |
| `updatePersonnelTotals()` | interview/contractors-personnel.js, report/form-fields.js | Duplicated calculation |
| `updateReportStatus()` | index/report-cards.js, report/submit.js | Completely different purpose despite same name |
| `createFreshReport()` | interview/persistence.js, report/data-loading.js | Duplicated default report structure |
| `showToast()` | ui-utils.js, login/main.js | login.js has its own simpler version |
| `formatTime()` | ui-utils.js, tools/timer.js | Different purposes (time-of-day vs stopwatch) |
| `getProjects()` | project-config/crud.js, index/main.js | Different implementations for same data |
| `log()` | permissions/main.js, permission-debug/main.js | Both define their own debug logger |

🟡 **ISSUE:** The contractor/personnel/equipment functions are the worst offenders — `getContractorActivity`, `getContractorOperations`, `toggleNoWork`, `updatePersonnelTotals`, `addEquipmentRow`, `updateEquipmentRow` are near-identical between interview and report modules. These should be extracted to a shared module (e.g., `js/shared/contractors.js`).

🟡 **ISSUE:** `createFreshReport()` defines the default report structure in two places — if the structure changes, both must be updated or reports will have inconsistent shapes.

---

### 12.2 Dead & Unused Code

**Potentially dead functions:** Many functions appear to be defined but never referenced in JS. However, **128 function names are called from HTML `onclick`/`onchange` attributes**, making static analysis unreliable. Most "dead" functions found are actually called from HTML.

**Confirmed dead/legacy code:**
- `deleteReportCascade()` in `shared/delete-report.js` — performs hard-delete cascade, but `deleteReportFull()` (soft-delete) has replaced it. Still globally exposed and still referenced in the cascade cleanup path, but should not be called for user-facing deletions.
- `report_backup` and `final_reports` table references in `delete-report.js` — only exist for legacy cleanup of deprecated tables
- `_handleReportDataChange`, `_broadcastSyncUpdate`, `_deferFieldUpdate`, `_fetchAndMerge`, `_handleSyncBroadcast` — defined in data-layer.js sync engine but appear to be part of an unused or incomplete sync system (`window._syncBase` is set but never called from outside)
- `applyInterviewMerge`, `applyReportMerge` — conflict resolution functions that appear scaffolded but not fully wired into any UI

🟡 **ISSUE:** The `_syncBase`/`syncEngine` infrastructure in `data-layer.js` (7 assignments to `window._syncBase`) appears to be abandoned middleware — it's initialized but the actual sync is handled by `realtime-sync.js` and `data-store.js` instead. ~200-300 lines of dead code.

---

### 12.3 Global Namespace Pollution

**121 unique `window.*` globals** — the entire application communicates through the global scope. This is the natural consequence of using `<script>` tags without a module system.

**Key concerns:**
- **Name collisions:** 14 globals are assigned multiple times (e.g., `window.currentReportsCache` is set in 14 places). Most are idempotent re-assignments, but racing initialization could cause subtle bugs.
- **No encapsulation:** Any script can mutate any state. For example, `window.currentReportsCache` is directly modified by index/main.js, realtime-sync.js, and data-store.js — no single owner.
- **Testing impossible:** Without modules, unit testing individual components requires complex mocking of the global scope.

🟡 **ISSUE:** `window.currentReportsCache` is the most heavily shared mutable state — modified by 5+ modules with no coordination beyond convention. Race conditions are possible during rapid realtime updates.

---

### 12.4 Error Handling Patterns

**185 try/catch blocks** across the codebase. Generally good coverage, but:

- **15+ swallowed catch blocks** (`catch(e) {}` or `catch(e) { /* ignore */ }`) — mostly in tool modules (QR scanner, flashlight, AR) where hardware errors are expected but should still be logged
- **96 `.then()` chains without `.catch()`** — unhandled promise rejections that would only be caught by the global `unhandledrejection` handler in console-capture.js
- **No centralized error reporting** beyond console-capture.js writing to `debug_logs` — no Sentry, no error categorization, no alerting

🟡 **ISSUE:** The 96 uncaught promise chains include critical paths like Supabase upserts and storage operations. A network flap during one of these could silently lose data with no user notification.

---

### 12.5 Security Surface

**XSS risk assessment:**
- **168 `innerHTML` assignments** without `escapeHtml()` — many are safe (static HTML strings), but any that interpolate user data or Supabase query results are potential XSS vectors
- `escapeHtml()` is used consistently in **15 files** (116 total calls) — good adoption for user-visible data
- `insertAdjacentHTML` used in ai-assistant.js and timer.js — chat bubbles use `escapeHtml` but other paths may not

**Credential exposure:**
- `SUPABASE_ANON_KEY` in `config.js` — intended to be public (Supabase design), but combined with disabled RLS = full database access
- `N8N_WEBHOOK_API_KEY` in `config.js` — static string, extractable from source
- All 4 n8n webhook URLs hardcoded in client JS — directly callable by anyone

**Input validation:**
- AI assistant has `sanitizeInput()` (SEC-06) — strips control chars, enforces 10KB max
- File upload in document-import.js validates extensions but not file size
- No other systematic input validation before Supabase writes

---

### 12.6 Architectural Patterns

**What works well:**
- 🟢 **Page-scoped module organization** — `js/interview/*.js`, `js/report/*.js`, etc. — clear ownership boundaries
- 🟢 **State object pattern** — each page has a central state object (`IS` for interview, `RS` for report) — avoids scattered global variables
- 🟢 **Offline-first data flow** — IDB → Supabase with sync reconciliation
- 🟢 **Realtime sync** — Supabase Realtime + BroadcastChannel for cross-device and cross-tab updates
- 🟢 **Tool overlay pattern** — all field tools use consistent open/close lifecycle with resource cleanup

**What needs improvement:**
- 🟡 **No module system** — 80 files loaded via `<script>` tags with implicit dependency ordering
- 🟡 **No build step** — no bundling, minification, tree-shaking, or dead code elimination
- 🟡 **No type checking** — vanilla JS with no JSDoc @type annotations or TypeScript. 908 functions with no parameter type documentation.
- 🟡 **No tests** — zero test files found. No unit tests, integration tests, or E2E tests.
- 🟡 **Manual asset list** — `sw.js` STATIC_ASSETS must be hand-maintained for every new file

---

### 12.7 localStorage vs IndexedDB Migration Status

The codebase is mid-migration from localStorage to IndexedDB:

| Data | localStorage | IndexedDB | Supabase | Status |
|---|---|---|---|---|
| Report headers | ❌ Removed | ✅ `currentReports` | ✅ `reports` | Migrated |
| Report content | ❌ Removed | ✅ `reportData` | ✅ `report_data` | Migrated |
| Draft data | ❌ Removed | ✅ `draftData` | ❌ | Local only |
| Photos | ❌ Removed | ✅ `photos` | ✅ `photos` | Migrated |
| Projects | ❌ Removed | ✅ `projects` | ✅ `projects` | Migrated |
| User profile | ❌ Removed | ✅ `userProfile` | ✅ `user_profiles` | Migrated |
| UI state (30+ keys) | ✅ Active | ❌ | ❌ | **Still in localStorage** |
| AI conversations | ✅ Active | ❌ | ❌ | Still in localStorage |
| Deleted blocklist | ✅ Active | ❌ | ❌ | Still in localStorage |

🟢 **GOOD:** Core data (reports, projects, photos) successfully migrated to IDB + Supabase
🟡 **ISSUE:** 30+ `STORAGE_KEYS` still actively used in localStorage — these survive page reloads but are subject to browser eviction (mitigated by `navigator.storage.persist()`)

---

### Cross-Cutting Summary

**Top issues by severity:**

1. 🟡 **17 duplicate function names** across files — contractor/equipment helpers are the worst (6 near-identical functions duplicated between interview and report modules)
2. 🟡 **~200-300 lines of dead sync code** in data-layer.js (`_syncBase`/`syncEngine` infrastructure)
3. 🟡 **96 unhandled promise rejections** on critical Supabase operations
4. 🟡 **168 innerHTML assignments** without systematic XSS protection
5. 🟡 **No module system, build step, type checking, or tests** — significant tech debt for a 30K-line codebase
6. 🟡 **121 window globals** with no encapsulation — shared mutable state across modules
7. 🟡 **2 deprecated Supabase tables** still referenced in deletion code
8. 🟠 **15+ swallowed catch blocks** in hardware-interaction code

---

## 13. Improvement Recommendations

Prioritized by **impact × effort** — highest-value, lowest-effort items first. Grouped into tiers: P0 (security/data-loss, do immediately), P1 (high-impact, do this sprint), P2 (medium-impact, plan for next sprint), P3 (long-term, schedule when convenient).

---

### P0 — Critical (Security & Data Loss) 🚨

These items represent active security vulnerabilities or data loss risks. Address before any new feature work.

#### P0-1: Enable RLS on All Supabase Tables
**Impact:** 🔴 Critical — any authenticated user can access the entire database
**Effort:** Medium (1–2 days)
**Section:** 10.3

Currently, 11 of 12 tables have RLS disabled. Any signed-up user can read, modify, or delete all data for all users using the publicly-exposed anon key.

**Action plan:**
1. Create `get_user_org_id()` STABLE function if not already marked STABLE
2. Enable RLS + create org-scoped policies on: `reports`, `report_data`, `photos`, `projects`, `ai_submissions`, `user_profiles`, `user_devices`, `organizations`, `debug_logs`
3. Re-enable the already-defined policy on `report_data` (just remove the `DISABLE ROW LEVEL SECURITY` line)
4. Test with two different org users to verify isolation
5. Add `report_backup` and `final_reports` policies or drop the deprecated tables

#### P0-2: Fix Project Extractor Webhook — Add Auth & Timeout
**Impact:** 🔴 Open endpoint — anyone can upload files to n8n
**Effort:** Low (30 minutes)
**Section:** 11.3

`fieldvoice-v69-project-extractor` is called without `X-API-Key` header and without `AbortController`. Add both to match the other 3 webhooks.

#### P0-3: Add Missing FK Constraints
**Impact:** 🔴 Orphaned data risk — reports, photos, AI submissions can reference non-existent parents
**Effort:** Low (1 migration file, ~30 minutes)
**Section:** 10.2

Missing constraints:
- `reports.user_id → user_profiles.id`
- `photos.report_id → reports.id ON DELETE CASCADE`
- `ai_submissions.report_id → reports.id ON DELETE CASCADE`
- `interview_backup.report_id → reports.id ON DELETE CASCADE`

#### P0-4: Add PWA Utils to report.html, archives.html, login.html
**Impact:** 🔴 report.html has no offline banner, no SW registration, no update detection
**Effort:** Low (15 minutes — add `<script>` tag + `initPWA()` call)
**Section:** 9.2

---

### P1 — High Impact (This Sprint) ⚡

#### P1-1: Add Database Indexes for Performance
**Effort:** Low (1 migration, 15 minutes)
**Section:** 10.2

```sql
CREATE INDEX idx_reports_user_id ON reports(user_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_debug_logs_created_at ON debug_logs(created_at);
CREATE INDEX idx_photos_report_id ON photos(report_id);
```

#### P1-2: Add Retention Policy for debug_logs
**Effort:** Low (Supabase cron job or pg_cron, 30 minutes)
**Section:** 10.2

`debug_logs` grows unbounded (430 rows, 408 KB already). Add a daily cron: `DELETE FROM debug_logs WHERE created_at < NOW() - INTERVAL '7 days'`.

Also consider retention for `interview_backup` (keep only last 24 hours per report).

#### P1-3: Fix Update Banner — Send SKIP_WAITING Before Reload
**Effort:** Low (10 lines of code)
**Section:** 9.2

Current: `location.reload()` may reload with old SW.
Fix: Send `SKIP_WAITING` message → listen for `controllerchange` → then reload.

#### P1-4: Add .catch() to Critical Promise Chains
**Effort:** Medium (audit 96 chains, fix ~20 critical ones)
**Section:** 12.4

Focus on Supabase upsert/insert operations in:
- `interview/persistence.js` (15 try/catch, but `.then()` chains lack `.catch()`)
- `report/autosave.js`
- `shared/data-store.js` (syncReportsFromCloud fire-and-forget pushes)

#### P1-5: Extract Shared Contractor/Equipment Helpers
**Effort:** Medium (2–3 hours)
**Section:** 12.1

Create `js/shared/contractors.js` with: `getContractorActivity()`, `getContractorOperations()`, `toggleNoWork()`, `updatePersonnelTotals()`, `addEquipmentRow()`, `updateEquipmentRow()`. Remove duplicates from `interview/contractors-personnel.js` and `report/form-fields.js`.

#### P1-6: Fix broadcast.js — Use addEventListener
**Effort:** Low (5 minutes)
**Section:** 8.2

Change `fvpChannel.onmessage = handler` to `fvpChannel.addEventListener('message', handler)` to support multiple listeners.

#### P1-7: Standardize deleteReportCascade vs deleteReportFull
**Effort:** Low (1 hour)
**Section:** 8.6

Remove `deleteReportCascade` from global scope or rename to `_deleteReportCascade_ADMIN`. Ensure all user-facing deletion paths use `deleteReportFull` (soft-delete). Add `deleted_at` timestamp column to `reports` table.

---

### P2 — Medium Impact (Next Sprint) 📋

#### P2-1: Pin CDN Dependencies
**Effort:** Low (30 minutes)
**Section:** 9.1

- Pin Supabase JS SDK: `@supabase/supabase-js@2` → `@supabase/supabase-js@2.x.y`
- Add SRI hashes to CDN `<script>` tags in HTML files
- Add integrity hashes to SW CDN_ASSETS fetch calls

#### P2-2: Automate STATIC_ASSETS in sw.js
**Effort:** Medium (2 hours — build script or pre-commit hook)
**Section:** 9.1

Write a script that scans `*.html`, `js/**/*.js`, `css/`, `icons/` and regenerates the `STATIC_ASSETS` array. Run on deploy.

#### P2-3: Fix Realtime Sync Gaps
**Effort:** Medium (2–3 hours)
**Section:** 8.8

- Reset `_refineRedirectInProgress` flag on failure (add `.catch()` reset)
- Add catch-up query after visibility-change resubscription (fetch reports updated since last seen timestamp)
- Add reconnection cooldown to prevent rapid re-init on flaky networks

#### P2-4: Batch Signed URL Generation in cloud-photos.js
**Effort:** Low (1 hour)
**Section:** 8.3

Replace sequential `await createSignedUrl()` in `fetchCloudPhotosBatch` with `Promise.all()` batches (groups of 10-20). Massive performance improvement for archives page.

#### P2-5: Add Jitter to supabase-retry.js Backoff
**Effort:** Low (5 minutes)
**Section:** 8.9

Change `Math.pow(2, attempt) * 1000` to `Math.pow(2, attempt) * 1000 * (0.5 + Math.random())`.

#### P2-6: Complete Soft-Delete Strategy
**Effort:** Medium (1–2 days)
**Section:** Multiple (flagged with ⚫ throughout review)

9 locations currently hard-delete data. Implement:
1. Add `deleted_at TIMESTAMPTZ` column to `reports`, `photos`, `projects`
2. Change all Supabase `.delete()` calls to `.update({ status: 'deleted', deleted_at: new Date() })`
3. Add `status != 'deleted'` filter to all SELECT queries
4. Add Supabase cron to permanently purge `deleted_at < NOW() - INTERVAL '90 days'`

#### P2-7: Drop Deprecated Tables
**Effort:** Low (1 migration, 15 minutes)
**Section:** 10.2

```sql
DROP TABLE IF EXISTS report_backup;
DROP TABLE IF EXISTS final_reports;
```

Remove references from `deleteReportCascade()`.

#### P2-8: Clean Up Dead Sync Code in data-layer.js
**Effort:** Low (1 hour)
**Section:** 12.2

Remove `_syncBase`/`syncEngine` infrastructure (~200-300 lines). Verify no callers exist outside the file.

---

### P3 — Long-Term (Schedule When Convenient) 🗓️

#### P3-1: Introduce Module System
**Effort:** High (1–2 weeks incremental)
**Section:** 12.3, 12.6

Adopt ES modules or a lightweight bundler (esbuild/Vite). Benefits:
- Eliminates 121 window globals
- Enables tree-shaking (removes dead code automatically)
- Makes testing possible
- Prevents function name collisions

**Incremental approach:** Start by converting `js/shared/*.js` to ES modules with a build step. Leave page-specific scripts as-is initially.

#### P3-2: Add Type Checking
**Effort:** Medium (1 week incremental)
**Section:** 12.6

Add JSDoc `@type` / `@param` annotations to critical functions, then enable TypeScript `checkJs` in a `jsconfig.json`. Catches type errors without rewriting to TypeScript.

#### P3-3: Add E2E Tests for Critical Paths
**Effort:** High (ongoing)
**Section:** 12.6

Priority test scenarios:
1. Create report → interview → AI processing → refined report
2. Edit report → autosave → reload → data preserved
3. Delete report → soft-delete → verify not resurrected by realtime
4. Offline → create report → come online → syncs to Supabase
5. Multi-device: edit on phone → see update on laptop

#### P3-4: Proxy n8n Webhooks Through Supabase Edge Functions
**Effort:** Medium (1–2 days)
**Section:** 11

Move all 4 webhook URLs behind Supabase Edge Functions. Benefits:
- n8n URLs hidden from client
- Real auth (Supabase JWT validation) instead of static API key
- Rate limiting per user
- Request logging/metrics

#### P3-5: Add PWA Manifest Enhancements
**Effort:** Low (1 hour)
**Section:** 9.3

Add `shortcuts` (New Report, Dashboard, Archives), `screenshots` (2-3 app screenshots), and `id` field to manifest.json.

#### P3-6: Implement Central Error Reporting
**Effort:** Medium (1 day)
**Section:** 12.4

Add lightweight error categorization on top of existing `console-capture.js`:
- Categorize errors (network, auth, data, UI)
- Add severity levels
- Optional: Sentry integration for production monitoring
- Alert on error rate spikes

---

### Audit Statistics Summary

| Marker | Count | Description |
|---|---|---|
| 🔴 BUG | 8 | Active errors or broken behavior |
| 🟡 ISSUE | 171 | Works but problematic |
| 🟠 MAYBE | 68 | Might be an issue, needs verification |
| 🔵 IMPROVEMENT | 25 | Opportunities to improve |
| 🟢 GOOD | 141 | Notably well-done patterns |
| ⚫ SOFT-DELETE | 9 | Hard-deletes needing soft-delete |
| **Total markers** | **422** | |

**Overall assessment:** FieldVoice Pro v6.9.31 is a capable, feature-rich PWA with strong offline-first architecture and thoughtful field-worker UX. The codebase is well-organized by page/feature with consistent patterns. The critical gap is **security** — RLS must be enabled before multi-user production deployment. Secondary priorities are reliability (error handling, retry logic) and maintainability (module system, tests, type checking).

---

> **End of Comprehensive Codebase Review**
> **Completed:** 2026-02-19 13:45 CST
> **Total sections:** 13/13
> **Document size:** ~3,000 lines