# FieldVoice Pro V69 — Deep Analysis Report

**Generated:** 2025-07-15 (Overnight Analysis Wave 2)  
**Scope:** Supabase database deep dive, iOS Safari PWA concerns, code quality patterns  
**Codebase Version:** v6.9.22  

---

## Table of Contents

1. [Task 1: Supabase Deep Dive](#task-1-supabase-deep-dive)
   - [1.1 Table Inventory & Row Counts](#11-table-inventory--row-counts)
   - [1.2 Schema Details](#12-schema-details)
   - [1.3 RLS Policy Analysis](#13-rls-policy-analysis)
   - [1.4 Duplicate "Express Shuttle Connector Road"](#14-duplicate-express-shuttle-connector-road)
   - [1.5 Report Data Structure](#15-report-data-structure)
   - [1.6 Orphaned Data & Referential Integrity](#16-orphaned-data--referential-integrity)
   - [1.7 Storage Buckets](#17-storage-buckets)
2. [Task 2: iPhone/iOS Safari PWA Concerns](#task-2-iphoneios-safari-pwa-concerns)
   - [2.1 Save/Pagehide Flow (persistence.js)](#21-savepagehide-flow)
   - [2.2 BFCache Handling (index/main.js)](#22-bfcache-handling)
   - [2.3 Session Management (auth.js)](#23-session-management)
   - [2.4 Service Worker (sw.js)](#24-service-worker)
   - [2.5 PWA Utils (pwa-utils.js)](#25-pwa-utils)
   - [2.6 Realtime Sync (realtime-sync.js)](#26-realtime-sync)
   - [2.7 Audio Recording](#27-audio-recording)
   - [2.8 Overall iOS Risk Assessment](#28-overall-ios-risk-assessment)
3. [Task 3: Code Quality Patterns](#task-3-code-quality-patterns)
   - [3.1 Silent Error Swallowing](#31-silent-error-swallowing)
   - [3.2 Race Conditions](#32-race-conditions)
   - [3.3 Hardcoded Values](#33-hardcoded-values)
   - [3.4 Memory Leak Potential](#34-memory-leak-potential)
   - [3.5 Security Issues](#35-security-issues)

---

## Task 1: Supabase Deep Dive

### 1.1 Table Inventory & Row Counts

| Table | Row Count | Purpose |
|-------|-----------|---------|
| `organizations` | 1 | Multi-tenant org container |
| `user_profiles` | 6 | Inspector profiles linked to auth |
| `user_devices` | 6 | Device tracking per user |
| `projects` | 3 | Construction projects |
| `reports` | 7 | Daily inspection reports |
| `report_data` | 3 | AI-refined report content (JSONB) |
| `ai_submissions` | 2 | AI processing audit log |
| `photos` | 6 | Photo metadata linked to reports |
| `report_backup` | 1 | Report page state backup |
| `interview_backup` | 5 | Interview page state backup |
| `final_reports` | 0 | Submitted final reports (unused) |

**Total: 11 tables, 40 rows across all tables.**

**RPC Functions:** 2
- `get_user_org_id()` — Returns the org_id for the authenticated user
- `get_user_profile_id()` — Returns the profile id for the authenticated user

### 1.2 Schema Details

#### `organizations`
- **PK:** `id` (uuid, auto-generated)
- **Columns:** `name` (text, required), `slug` (text), `created_at`, `updated_at`
- **Current data:** 1 org — "George Test Org" (slug: "george-test")

#### `user_profiles`
- **PK:** `id` (uuid, auto-generated)
- **FK:** `org_id` → `organizations.id`
- **Columns:** `full_name`, `title`, `company`, `email`, `phone`, `device_id`, `auth_user_id`, `role` (default: 'inspector'), `device_info` (jsonb)
- **Current users:**
  - Jackson Koerner (jackson@advidere.co) — auth_user_id: `10a8c46a`
  - George Test (george.test@advidere.co) — auth_user_id: `751ed4e1`
  - George Test (george@test.fieldvoice.dev) — auth_user_id: `bd5635bd` ← **different auth user, same display name**
  - John bingus (cum@mebro) — test account
  - Test Inspector (testinspector@gmail.com)
  - Sim Tester (simtest@fieldvoice.dev)

#### `projects`
- **PK:** `id` (uuid, auto-generated)
- **FK:** `org_id` → `organizations.id`
- **Columns:** `user_id`, `project_name` (required), `noab_project_no`, `cno_solicitation_no`, `location`, `engineer`, `prime_contractor`, `notice_to_proceed` (date), `contract_duration` (int), `expected_completion` (date), `default_start_time`, `default_end_time`, `weather_days` (int), `logo_thumbnail`, `logo_url`, `status` (default: 'active'), `contractors` (jsonb), `contractors_display`, `report_date` (date), `contract_day_no` (int)
- ⚠️ **`report_date` and `contract_day_no` on projects table** — these are mutable per-report fields stored on the project record. This is a design concern: they represent the "last used" values rather than project constants.

#### `reports`
- **PK:** `id` (uuid, auto-generated)
- **FKs:** `project_id` → `projects.id`, `org_id` → `organizations.id`
- **Columns:** `user_id`, `device_id`, `report_date` (date, required), `status` (default: 'draft'), `capture_mode` (default: 'guided'), `submitted_at`, `pdf_url`, `inspector_name`
- **Statuses observed:** draft (3), refined (2), submitted (2)

#### `report_data`
- **PK:** `report_id` (uuid) — also FK to `reports.id`
- **FK:** `org_id` → `organizations.id`
- **Columns:** `ai_generated` (jsonb), `original_input` (jsonb), `user_edits` (jsonb), `capture_mode`, `status` (default: 'refined')
- **Structure of JSONB fields (from actual data):**
  - `ai_generated` keys: `safety`, `overview`, `equipment`, `activities`
  - `original_input` keys: `weather`, `fieldNotes`, `reportDate`
  - `user_edits` keys: `safety.notes`, `activity_*` (keyed by activity UUID)

#### `photos`
- **PK:** `id` (uuid, auto-generated)
- **FK:** `org_id` → `organizations.id`
- **Columns:** `report_id`, `photo_url`, `storage_path`, `caption`, `photo_type`, `taken_at`, `location_lat` (numeric), `location_lng` (numeric), `filename`
- ⚠️ **`report_id` is NOT a FK constraint** — it's just a uuid column. No database-level referential integrity to `reports.id`.

#### `report_backup`
- **PK:** `id` (uuid)
- **Columns:** `report_id`, `page_state` (jsonb), `created_at`, `updated_at`
- ⚠️ **Missing `org_id` column** — unlike `interview_backup`, this table has no org scoping

#### `interview_backup`
- **PK:** `id` (uuid)
- **FK:** `org_id` → `organizations.id`
- **Columns:** `report_id`, `page_state` (jsonb), `created_at`, `updated_at`

#### `ai_submissions`
- **PK:** `id` (uuid)
- **FK:** `org_id` → `organizations.id`
- **Columns:** `report_id`, `original_input` (jsonb), `ai_response` (jsonb), `model_used`, `processing_time_ms` (int), `submitted_at`

#### `user_devices`
- **PK:** `id` (uuid)
- **FK:** `user_id` → `user_profiles.id`
- **Columns:** `device_id`, `device_info` (jsonb), `last_active`

#### `final_reports`
- **PK:** `id` (uuid)
- **Required:** `report_id`, `project_id`, `user_id`, `report_date`
- **Columns:** `inspector_name`, `pdf_url`, `submitted_at`, `status` (default: 'submitted')
- **Currently empty** — appears to be a planned archival table not yet in use

### 1.3 RLS Policy Analysis

**Testing methodology:** Queried all tables with the anonymous (anon) key — no auth token.

| Table | Anon Access | Result |
|-------|------------|--------|
| `organizations` | ❌ Blocked | Returns `[]` ✅ |
| `user_profiles` | ❌ Blocked | Returns `[]` ✅ |
| `reports` | ❌ Blocked | Returns `[]` ✅ |
| `photos` | ❌ Blocked | Returns `[]` ✅ |
| `report_data` | ❌ Blocked | Returns `[]` ✅ |

**Assessment: RLS is ENABLED and functioning.** Anonymous access returns empty arrays on all tables, confirming policies are active. However:

**⚠️ Important Caveats:**
1. **Cannot inspect actual policy SQL via REST API** — would need Supabase Dashboard or `pg_policies` query to see the exact conditions. The policies could be overly permissive (e.g., allowing any authenticated user to see all orgs' data).
2. **`report_data` has no `user_id` column** — As noted in `realtime-sync.js` line 46: "report_data has no user_id column, so we can't filter server-side. RLS policies on Supabase MUST enforce tenant isolation." This means RLS must use org_id or a join to reports for tenant isolation. If the RLS policy is just `auth.uid() IS NOT NULL`, any authenticated user could see all report data.
3. **`report_backup` has no `org_id` column** — Cannot be org-scoped by RLS. Likely uses report_id to join to reports for access control, or is wide-open to authenticated users.
4. **Storage buckets are all PUBLIC** — All three buckets (`report-photos`, `project-logos`, `report-pdfs`) have `public: true`. This means anyone with the file URL can access photos, logos, and PDFs without authentication.

**🔴 CRITICAL: Public storage buckets are a security risk** if these contain sensitive construction site photos or confidential reports. Should be set to private with signed URLs (which the code already partially implements — see `persistence.js` line ~485 SEC-04 comment).

### 1.4 Duplicate "Express Shuttle Connector Road"

**Finding:** Two projects exist with identical name "Express Shuttle Connector Road":

| Field | Project 1 | Project 2 |
|-------|-----------|-----------|
| **ID** | `fe46ea9b-0f13-4f34-8188-158a1c6c6f3b` | `48ec1d60-b290-4f1f-8aa5-e574c69a88fb` |
| **Created** | 2026-02-09T21:31:42Z | 2026-02-14T02:39:45Z |
| **Created by** | `5252f131` (Jackson Koerner) | `94277094` (George Test - QA Tester) |
| **Org** | Same org (`f57ea16f`) | Same org (`f57ea16f`) |
| **Reports** | 4 reports attached | 0 reports attached |

**Root Cause:** There is **no unique constraint** on `project_name` in the database — not even per organization. Two different users (Jackson and George Test) independently created projects with the same name. The system doesn't warn about or prevent duplicate names.

**Impact:** 
- George Test's copy (`48ec1d60`) has no reports — it's empty
- Jackson's copy (`fe46ea9b`) has all 4 reports for this project
- The project-logos bucket has a logo uploaded for George's copy: `48ec1d60-b290-4f1f-8aa5-e574c69a88fb.jpeg`
- This is confusing but not data-corrupting

**Recommendation:** Add a unique constraint `UNIQUE(org_id, project_name)` or at minimum show a "project with this name already exists" warning in the UI.

### 1.5 Report Data Structure

The `report_data` table stores three JSONB columns for the AI processing pipeline:

**`original_input`** — Raw data from the field interview:
```json
{
  "weather": { ... },
  "fieldNotes": { ... },
  "reportDate": "2026-02-13"
}
```

**`ai_generated`** — AI-refined output:
```json
{
  "safety": { ... },
  "overview": { ... },
  "equipment": { ... },
  "activities": [ ... ]
}
```

**`user_edits`** — User modifications after AI processing:
```json
{
  "safety.notes": "...",
  "activity_UUID": "edited text..."
}
```

**Observation:** The `user_edits` uses dot-notation keys like `safety.notes` and `activity_UUID` — these are flat key-value pairs, not nested JSON. This is a deliberate design for tracking individual field edits.

**Of the 7 reports, only 3 have `report_data` rows.** The other 4 (all `draft` or `refined` status) store data only in `interview_backup` or local storage.

### 1.6 Orphaned Data & Referential Integrity

#### ❌ Orphaned Interview Backup
- `interview_backup` row with `report_id = 3c42ab72-8997-4b56-89d9-14485ee6e7c8`
- This report ID does NOT exist in the `reports` table
- **Cause:** Report was likely deleted but the backup row was not cleaned up
- **Impact:** Dead data consuming space; no cascade delete configured

#### ❌ Orphaned Storage Folder
- `report-photos` bucket contains folder `a1b93bf5-c610-44a1-a635-b7204b00d45a/`
- This report ID does NOT exist in the `reports` table
- Contains 1 photo file (172KB JPEG) uploaded 2026-02-10
- **Cause:** Report was deleted but storage files were not cleaned up
- **Impact:** Wasted storage, potential data leak of abandoned photos

#### ❌ Orphaned Project Logo
- `project-logos` bucket has `7912bdc6-4e60-43ac-84f3-99ff0ef03ce1.png` (7.4MB!)
- This project ID does NOT exist in the `projects` table
- **Cause:** Project was deleted but logo file remains
- **Impact:** 7.4MB of dead storage

#### ⚠️ Missing Foreign Key Constraints
Several `report_id` columns lack actual FK constraints:
- `photos.report_id` — No FK to `reports.id`
- `interview_backup.report_id` — No FK to `reports.id`  
- `report_backup.report_id` — No FK to `reports.id`
- `ai_submissions.report_id` — No FK to `reports.id`
- `final_reports.report_id` — No FK to `reports.id`

**Only `report_data.report_id` has a proper FK to `reports.id`.**

This means database-level cascade deletes are impossible for most related tables. The app relies on application-level cascade (`deleteReportCascade()` in `js/shared/delete-report.js`) which is fragile — if the delete function crashes midway, orphans are created.

#### ⚠️ Photo Filename Issues
All 6 photos have `storage_path` ending in `_undefined`:
```
760070ae.../758d1c9d..._undefined
```
This indicates the `file.name` property was `undefined` when constructing the storage path in `uploadPhotoToSupabase()`. The photos are functional but have malformed filenames.

#### ⚠️ Schema Inconsistency: report_backup vs interview_backup
- `interview_backup` has `org_id` column (FK to organizations)
- `report_backup` does NOT have `org_id`
- Both tables serve the same purpose (state backup) for different pages
- `report_backup` cannot be org-scoped in RLS policies

### 1.7 Storage Buckets

| Bucket | Files | Public | Concern |
|--------|-------|--------|---------|
| `report-photos` | 3 folders (6+ photos) | ✅ PUBLIC | 🔴 Should be private — construction photos may be sensitive |
| `project-logos` | 3 files (8.6MB total) | ✅ PUBLIC | ⚠️ Logos are less sensitive but 7.4MB orphan logo is wasteful |
| `report-pdfs` | 3 folders | ✅ PUBLIC | 🔴 Should be private — PDFs contain full inspection reports |

**No file size limits or MIME type restrictions** are configured on any bucket. This means:
- Any file type can be uploaded (potential malware vector)
- No size cap (could upload a 1GB file)

---

## Task 2: iPhone/iOS Safari PWA Concerns

### 2.1 Save/Pagehide Flow
**File:** `js/interview/persistence.js`

**What's done well:**
- Uses synchronous `saveCurrentReportSync()` for pagehide saves (line 184) — critical because async operations don't complete during pagehide on iOS
- Falls back to IndexedDB when localStorage is full (line 200-202)
- IndexedDB write-through on every save for durability (line 193-197)
- `loadDraftFromIDB()` function (line 208-237) handles iOS 7-day localStorage eviction by re-caching from IDB

**⚠️ Concerns:**

1. **`flushInterviewBackup()` is async/fire-and-forget during pagehide** (`js/interview/main.js` lines 307-311):
   ```javascript
   window.addEventListener('pagehide', (event) => {
       saveToLocalStorage();      // ✅ synchronous
       flushInterviewBackup();    // ⚠️ ASYNC — will not complete on iOS pagehide!
   });
   ```
   The `flushInterviewBackup()` makes a Supabase network request. On iOS, the page is killed before this completes. The data IS saved locally (via `saveToLocalStorage()`), but the cloud backup won't update. This is acceptable as long as local data survives — which it does via localStorage + IDB dual-write.

2. **Signed URLs expire after 1 hour** (line ~485):
   ```javascript
   .createSignedUrl(fileName, 3600); // 1 hour expiry
   ```
   Photos stored with signed URLs in localStorage/IDB will have stale URLs after 1 hour. On iOS where the PWA may be suspended and resumed hours later, photo thumbnails will break. The code acknowledges this (SEC-04 comment) but doesn't implement a refresh mechanism.

3. **`saveToLocalStorage()` could exceed quota silently** — The catch block on line 198-202 logs an error and falls back to IDB, but doesn't show the user any warning that their data storage is constrained.

### 2.2 BFCache Handling
**File:** `js/index/main.js`

**What's done well — this is actually excellent iOS handling:**
- Three-layer event coverage (lines 428-477): `pageshow` + `visibilitychange` + `focus`
- Comment explicitly explains iOS PWA doesn't reliably fire `pageshow` with `event.persisted` (line 438)
- `refreshDashboard()` has debouncing (2-second cooldown) to prevent triple-fire (line 312-318)
- IDB connection is reset on bfcache restore (line 449-453) — addresses known Safari bug
- All async operations have timeouts with `withTimeout()` helper (line 268-286)
- Emergency `_renderFromLocalStorage()` as last-resort fallback (lines 376-387)
- `resetDB()` called on bfcache restore to handle stale IDB connections (line 451)

**⚠️ Concerns:**

1. **`focus` event listener may cause unnecessary refreshes on iOS** (line 474-477). When the iOS keyboard appears/disappears, it fires focus events. This could trigger `refreshDashboard()` while the user is interacting with form fields on other pages that include this script. However, since this is only on index.html (the dashboard), this is not a real problem.

2. **Weather sync has a 15-second timeout** (line 369) — On slow iOS cellular connections, this might still hang the UI thread since it's `await`-ed.

### 2.3 Session Management
**File:** `js/auth.js`

**What's done well:**
- Uses Supabase's built-in session management (JWT + refresh tokens)
- Periodic session check every 5 minutes (line 279)
- `onAuthStateChange` listener for real-time session events (line 237)
- Graceful session expiry warning without redirect (line 225) — user won't lose unsaved work
- Requests `navigator.storage.persist()` on every page load (line 338) — prevents browser from evicting data

**⚠️ iOS-Specific Concerns:**

1. **`setInterval` for periodic session check (line 283)** — iOS Safari suspends timers when the app is backgrounded. When the app resumes, the interval fires immediately with stale context. The code handles this gracefully (just checks session and shows warning), but:
   - On iOS PWA, the interval may **never fire** if the PWA was frozen and the page was restored from bfcache. A `visibilitychange` → `visible` handler that re-checks the session would be more reliable.

2. **`localStorage` used for auth role and org_id** (line 97-116) — On iOS Safari, localStorage can be wiped after 7 days without user interaction. If the user opens the app after a week, `fvp_org_id`, `fvp_user_id`, etc. could be gone. The code handles `org_id` re-fetch (`ensureOrgIdCached` on line 310), but:
   - `USER_ID` and `USER_NAME` are NOT re-fetched — they're only set during profile upsert
   - If these are wiped, the app may malfunction silently (queries using null user_id)

3. **Sign-out clears IndexedDB** (lines 120-127) — calls `window.idb.clearStore()` for multiple stores. On iOS, if the user is on a slow connection, these promises may not complete before the redirect to `login.html` (line 129). The `await Promise.all()` should complete, but iOS may kill the page during navigation.

### 2.4 Service Worker
**File:** `sw.js`

**What's done well:**
- Comprehensive static asset caching (90+ files)
- Network-first for JS files with `cache: 'no-cache'` (line 174) — ensures updates propagate
- Network-first for navigation requests with cache fallback
- CDN assets cached separately with error tolerance

**⚠️ iOS Safari PWA Concerns:**

1. **iOS Safari has a ~50MB service worker cache limit** — The STATIC_ASSETS list includes 90+ files plus CDN assets (including large libraries like jspdf, html2canvas, leaflet). The total cache could approach or exceed this limit. When exceeded, iOS silently evicts cached items.

2. **`self.skipWaiting()` in install event** (line 131) — This is aggressive; it immediately activates the new SW. On iOS, this can cause the currently-open page to use a mix of old cached assets and new SW logic, leading to version mismatches. The `showUpdateBanner()` in `pwa-utils.js` (line 94) prompts users to refresh, but between SW activation and user refresh, there's a window of inconsistency.

3. **No strategy for partial cache failure** — Line 121: `cache.addAll(STATIC_ASSETS).catch(...)` catches the error but continues. If 3 of 90 files fail to cache, the SW installs successfully but those 3 pages will fail offline. There's no integrity check.

4. **CDN assets may fail CORS on iOS** — Line 124: CDN fetches use `mode: 'cors'`. Some CDN configurations block opaque responses, and iOS Safari handles CORS differently than Chrome. If a CDN asset fails, there's no fallback.

5. **`updateCacheInBackground()` has silent failure** (line 228) — Empty catch block means cache update failures are invisible. On iOS where network is unreliable, this could mean stale assets persist longer than expected.

### 2.5 PWA Utils
**File:** `js/pwa-utils.js`

**What's done well:**
- `setupPWANavigation()` prevents Safari from breaking out of standalone mode (line 17-25) — critical fix for iOS PWA
- Checks both `window.navigator.standalone` and `display-mode: standalone` media query
- Offline banner with smooth animations

**⚠️ Concerns:**

1. **`navigator.storage.persist()` is called twice** — Once in `pwa-utils.js` line 43 and once in `auth.js` line 338. Redundant but harmless.

2. **No PWA install prompt handling** — The code doesn't capture the `beforeinstallprompt` event. On iOS this isn't relevant (no install prompt), but Android users won't get a custom install experience.

3. **Offline detection uses `navigator.onLine`** — This is unreliable on iOS. A device can report `onLine: true` while having no actual connectivity (e.g., connected to WiFi with no internet). The `online`/`offline` events also fire inconsistently on iOS.

### 2.6 Realtime Sync
**File:** `js/shared/realtime-sync.js`

**What's done well:**
- Proper cleanup on `beforeunload` (line 184)
- Re-init on `online` event (line 187)
- Tear-down on `offline` event (line 193)
- Client-side guard against cross-tenant data (line 143-150) — belt-and-suspenders with RLS
- Skips overwrites for actively-edited reports (SYN-02, lines 82-90)

**⚠️ iOS-Specific Concerns:**

1. **`beforeunload` is unreliable on iOS Safari** — The cleanup listener (line 184) uses `beforeunload`, which iOS Safari does NOT fire in standalone PWA mode. This means WebSocket connections may leak when:
   - User swipes up to close the PWA
   - iOS kills the PWA in the background
   - User navigates away via the PWA navigation bar
   
   **Should also add `pagehide` listener for cleanup** (like `interview/main.js` does).

2. **WebSocket reconnection relies on `online` event** — iOS fires this event inconsistently. The Supabase Realtime client has its own internal reconnection logic, but the app-level `initRealtimeSync()` on `online` (line 188) may create duplicate subscriptions if the Supabase client already reconnected internally.

3. **No heartbeat/keepalive** — iOS aggressively kills background WebSocket connections (within 30 seconds of backgrounding). When the app returns to foreground, the realtime channel may be dead but the app doesn't know. The `visibilitychange → visible` pattern used by `index/main.js` should also trigger a realtime re-check.

4. **Channel subscriptions are not scoped to the page lifecycle** — The module subscribes on init and cleans up on unload. But on iOS PWA, "unload" may never happen. The subscriptions could accumulate across page navigations within the PWA if `cleanupRealtimeSync()` isn't called.

### 2.7 Audio Recording

**File:** `js/interview/main.js` (line 34), `js/permissions/main.js`, `js/media-utils.js`

**Key finding from `js/permission-debug/main.js` (line 93):**
```javascript
failMsg: 'BLOCKED! getUserMedia does NOT work in standalone PWA mode on iOS!'
```

**The codebase already knows about this issue.** `getUserMedia()` is documented as being blocked in iOS standalone PWA mode. This means:
- **Voice dictation/recording WILL NOT WORK** when the app is added to the home screen on iOS
- It only works when opened in Safari browser (not standalone)
- The permission debug page explicitly tests for this

**Workaround:** The app uses a permissions flow (`permissions.html`) that requests mic access, but this only works in Safari browser context. Once added to home screen, iOS blocks it.

### 2.8 Overall iOS Risk Assessment

| Risk | Severity | Status |
|------|----------|--------|
| `beforeunload` not firing → data loss | 🟡 Medium | **Mitigated** — uses `pagehide` + `visibilitychange` for saves |
| iOS 7-day localStorage eviction | 🟡 Medium | **Mitigated** — IDB dual-write + cloud backup recovery |
| getUserMedia blocked in standalone PWA | 🔴 High | **Known issue** — no workaround possible |
| WebSocket drops on background | 🟡 Medium | **Partially mitigated** — reconnects on `online` event |
| IDB connection stale after bfcache | 🟢 Low | **Mitigated** — `resetDB()` on pageshow |
| Service worker cache limits | 🟡 Medium | **Not mitigated** — 90+ files may exceed 50MB |
| Signed photo URLs expiring | 🟡 Medium | **Known, not mitigated** — documented as future work |
| Session timers frozen in background | 🟢 Low | **Acceptable** — session check runs on resume |
| Realtime cleanup on PWA close | 🟡 Medium | **Not mitigated** — uses `beforeunload` only |
| `navigator.onLine` unreliability | 🟡 Medium | **Not mitigated** — used throughout |

---

## Task 3: Code Quality Patterns

### 3.1 Silent Error Swallowing

#### Empty Catch Blocks (7 instances)
| File | Line | Context |
|------|------|---------|
| `js/tools/qrscanner.js` | 34 | `} catch (e) {}` — torch toggle failure |
| `js/tools/qrscanner.js` | 196 | `} catch (e) {}` — audio context creation |
| `js/tools/qrscanner.js` | 236 | `try { ... } catch (e) {}` — sessionStorage write |
| `js/tools/qrscanner.js` | 266 | `try { ... } catch (e) {}` — sessionStorage clear |
| `js/tools/timer.js` | 337 | `try { stop() } catch (e) {}` — alarm stop |
| `js/shared/ai-assistant.js` | 793 | `} catch (e) {}` — unknown context |
| `js/permission-debug/main.js` | 590 | `} catch (e) {}` — permission check |

#### Promise Catch Swallowing (fire-and-forget with no logging)
| File | Line | Context |
|------|------|---------|
| `js/tools/qrscanner.js` | 58 | `.catch(function() {})` — torch constraint |
| `js/tools/qrscanner.js` | 277 | `.catch(function() {})` — camera stop |
| `js/tools/flashlight.js` | 117 | `.catch(function() {})` — torch on |
| `js/tools/flashlight.js` | 126 | `.catch(function() {})` — torch off |
| `js/tools/timer.js` | 341 | `.catch(function() {})` — audio close |
| `js/tools/decibel.js` | 258 | `.catch(function() {})` — audio close |
| `js/tools/photo-markup.js` | 82, 90 | `.catch(function() {})` — photo operations |
| `js/storage-keys.js` | 304 | `.catch(function() {})` — IDB delete |
| `js/interview/persistence.js` | 202 | `.catch(function() {})` — IDB fallback save |
| `js/index/weather.js` | 112 | `.catch(function() { /* ignore */ })` — weather cache |

**Assessment:** Most of these are in tool utilities (torch, audio) where failure is expected and non-critical. The ones in persistence paths (`storage-keys.js:304`, `persistence.js:202`) are more concerning — failed IDB writes could mean data loss without any user notification.

### 3.2 Race Conditions

1. **Auth ready vs. page initialization** (`js/index/main.js` line 208-222):
   ```javascript
   var _authSession = await withTimeout(window.auth.ready, 5000, null, 'auth.ready');
   ```
   The auth check has a 5-second timeout. If auth times out (returns null), the page continues loading and calls `refreshDashboard()`. This could result in Supabase queries made without a valid session — they'll fail silently and fall back to localStorage. **Well handled but documented as a known edge case.**

2. **Multiple DOMContentLoaded handlers** — `auth.js` registers its own DOMContentLoaded handler (line 324) that calls `requireAuth()`. `index/main.js` has its own DOMContentLoaded handler (line 138) that waits for `auth.ready`. The comment explains the ordering: auth.js is in `<head>` so its handler fires first, but since `requireAuth()` is async, the actual auth check hasn't completed yet when main.js fires. The `auth.ready` promise solves this correctly.

3. **`flushInterviewBackup()` concurrent with `saveToLocalStorage()`** — Both are called from `saveReport()` (lines 351-362 of `persistence.js`). `saveToLocalStorage()` is synchronous but debounced (500ms). `flushInterviewBackup()` is async and debounced (5000ms). If `saveReport()` is called rapidly, the local and cloud states could temporarily diverge. This is acceptable — local is source of truth, cloud backup is eventual consistency.

4. **`refreshDashboard()` from three event sources** — `pageshow`, `visibilitychange`, and `focus` can all fire within milliseconds of each other on iOS. The cooldown mechanism (`_REFRESH_COOLDOWN = 2000ms`) prevents triple-execution but uses source-based scoping (line 318: `source === _lastRefreshSource`) which means different sources within the cooldown will still execute. **Potential double-refresh on iOS resume.**

### 3.3 Hardcoded Values

#### Config Values in Code (should be in config.js or environment)

1. **N8N Webhook API Key** — `js/config.js` line 7:
   ```javascript
   const N8N_WEBHOOK_API_KEY = 'fvp-n8n-webhook-key-2026';
   ```
   This is in config.js (centralized), but it's a hardcoded secret in a client-side JS file served via GitHub Pages. Anyone can read it.

2. **Supabase Anon Key** — `js/config.js` line 2:
   ```javascript
   const SUPABASE_ANON_KEY = 'eyJhbG...';
   ```
   This is expected for Supabase (anon keys are designed to be public), but should still be environment-variable-driven in production.

3. **Signed URL expiry** — `js/interview/persistence.js` line ~485:
   ```javascript
   .createSignedUrl(fileName, 3600); // 1 hour expiry
   ```
   Magic number. Should be `const SIGNED_URL_EXPIRY_SECONDS = 3600` in config.

4. **Debounce intervals scattered throughout:**
   - 500ms localStorage save debounce (`persistence.js` line 351)
   - 5000ms Supabase backup debounce (`persistence.js` line 354)
   - 2000ms dashboard refresh cooldown (`index/main.js` line 312)
   - 5 min session check interval (`auth.js` line 279)
   - 3000ms IDB open timeout (`indexeddb-utils.js` line 16)
   
   These should be collected into a `TIMING` config object.

5. **Tile layer URLs** — `js/tools/maps.js` has 15+ hardcoded URLs to ArcGIS, USGS, Windy.com, Google Maps, FEMA, etc. If any of these services change URLs, the code breaks.

6. **Photo storage path format** — `persistence.js` line ~483:
   ```javascript
   const fileName = `${IS.currentReportId}/${photoId}_${file.name}`;
   ```
   The `_undefined` bug in filenames comes from `file.name` being undefined. This pattern should validate inputs.

### 3.4 Memory Leak Potential

**Event listeners: 145 `addEventListener` calls vs. 26 `removeEventListener` calls.**

This is a significant imbalance. Most concerning:

1. **`initGuidedAutoSave()` adds `input` and `blur` listeners** (`persistence.js` lines 277-319) to textareas. These are created per textarea, per section. If a guided section is re-rendered (e.g., toggling yes/no), the textarea gets new listeners without removing old ones. The `textarea.dataset.autoSaveInit = 'true'` guard (line 282) prevents duplicate initialization on the same element, but if the element is destroyed and recreated with the same ID, the old listeners on the old DOM node persist.

2. **`initContractorWorkAutoSave()` same pattern** (`persistence.js` lines 328-399) — creates listeners per contractor textarea. No cleanup when contractor is removed from the form.

3. **Realtime channels** (`realtime-sync.js`) — `_realtimeChannels` array grows with each `initRealtimeSync()` call. The `cleanupRealtimeSync()` function removes channels, but if cleanup fails (line 167: catch swallows error), channels accumulate.

4. **Service Worker `updatefound` listener** (`pwa-utils.js` line 41) — Inside the registration `.then()`, a listener is added to `registration` that itself adds a `statechange` listener to `newWorker`. These are per-registration and never removed.

5. **Auto-save debounce timers** — `localSaveTimeout` and `_interviewBackupTimer` (persistence.js lines 267-268) are module-level variables. If the page is re-initialized (e.g., iOS bfcache restore calling DOMContentLoaded again), old timers aren't cleared.

**Low-risk leaks** (expected patterns):
- `DOMContentLoaded`, `pageshow`, `visibilitychange`, `focus`, `online`, `offline` listeners are page-lifecycle events — one per page load, never removed. This is standard practice.
- `click` listeners on document for PWA navigation — single listener, expected.

### 3.5 Security Issues

#### 🔴 Critical

1. **All storage buckets are PUBLIC** — `report-photos`, `project-logos`, `report-pdfs` all have `public: true`. Anyone who guesses or intercepts a file URL can access construction site photos and PDF reports. The code partially implements signed URLs (persistence.js SEC-04) but the buckets themselves allow unauthenticated access.

2. **N8N Webhook API Key in client-side JavaScript** — `js/config.js` line 7:
   ```javascript
   const N8N_WEBHOOK_API_KEY = 'fvp-n8n-webhook-key-2026';
   ```
   This key is visible to anyone who views page source. It authenticates webhook calls to n8n. An attacker could use this to call the AI processing webhook with arbitrary data.

3. **Supabase Service Role Key exposure risk** — While the service role key is NOT in the client-side code (only the anon key is), the service role key is used in this analysis and appears in project documentation. Ensure it is NEVER committed to the repository or exposed in client-side code.

#### 🟡 Medium

4. **Test user with offensive data** — User profile "John bingus" has email `cum@mebro` and phone `6969696969`. This is obviously test data but exists in a shared org. In a production environment, this would be a professionalism issue.

5. **No CSRF protection** — The Supabase client uses bearer token auth, which is not vulnerable to traditional CSRF. However, the n8n webhook calls using `N8N_WEBHOOK_API_KEY` could be replayed.

6. **localStorage stores sensitive data** — `fvp_user_email`, `fvp_user_name`, `fvp_auth_user_id`, `fvp_org_id` are stored in plain localStorage. On shared devices, the next user could access this data. The `signOut()` function clears these (auth.js line 97-127), but if the browser crashes or the user closes without signing out, data persists.

7. **Photo filenames contain "undefined"** — All stored photos have `_undefined` in their storage path. While not a direct security issue, this indicates unvalidated input being used to construct storage paths. If `file.name` could be user-controlled (e.g., via filename containing `../`), there could be path traversal issues. Supabase Storage likely sanitizes this, but the app should validate too.

#### 🟢 Low

8. **Supabase anon key in source** — This is by design (Supabase anon keys are meant to be public). RLS policies provide the actual security. But if RLS is misconfigured, the anon key gives direct database access.

9. **No Content Security Policy** — The HTML files load scripts from multiple CDNs (Supabase, jsQR, html2canvas, jspdf, Leaflet, Font Awesome). Without a CSP header, the app is vulnerable to XSS via compromised CDNs.

10. **Device ID stored in localStorage** — `getDeviceId()` generates a UUID stored in `fvp_device_id`. This is used for device tracking and is sent with every report. It's a fingerprinting mechanism that persists across sessions.

---

## Summary of Critical Findings

### Must Fix (Before Production)
1. **🔴 Make storage buckets private** — Set `public: false` on `report-photos`, `report-pdfs`. Implement signed URLs consistently.
2. **🔴 Move N8N webhook key to server-side** — Don't expose in client JS. Use a Supabase Edge Function as proxy.
3. **🔴 Add missing FK constraints** — `photos.report_id`, `interview_backup.report_id`, `ai_submissions.report_id` need FK → `reports.id` with `ON DELETE CASCADE`.
4. **🔴 Add `org_id` to `report_backup` table** — For RLS consistency with `interview_backup`.
5. **🔴 Verify RLS policies via Supabase Dashboard** — Ensure `report_data` is properly scoped (it has no `user_id` column).

### Should Fix (Before Beta)
6. **🟡 Add unique constraint** `UNIQUE(org_id, project_name)` on projects table
7. **🟡 Fix photo filename bug** — Validate `file.name` before constructing storage path
8. **🟡 Add `pagehide` listener to `realtime-sync.js`** alongside `beforeunload`
9. **🟡 Clean up orphaned data** — Delete orphan interview_backup row, orphan storage files
10. **🟡 Add file size limits and MIME restrictions** to storage buckets
11. **🟡 Centralize timing constants** into config

### Nice to Have (Quality of Life)
12. **🟢 Add logging to silent catch blocks** in persistence paths
13. **🟢 Implement signed URL refresh** for photos displayed after 1-hour expiry
14. **🟢 Add `visibilitychange → visible` handler** for session re-check (auth.js)
15. **🟢 Remove test user data** ("John bingus") before production
16. **🟢 Add CSP headers** to HTML files

---

*Analysis performed by automated codebase inspection. No code changes were made.*
