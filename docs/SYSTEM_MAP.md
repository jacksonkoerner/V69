# FieldVoice Pro v6.9 — System Map

## Pages & Their Roles

### login.html
- **Purpose:** Authentication gate
- **JS:** `js/login/main.js`
- **Reads:** Nothing (entry point)
- **Writes:** Supabase Auth session (cookie/token), `user_profiles` table, `fvp_auth_role` in localStorage
- **Navigates to:** index.html (inspector) or shows "Coming Soon" (admin)
- **Auth:** NOT protected (this IS the auth page)

### index.html (Dashboard)
- **Purpose:** Home screen, report status, project selection, field tools
- **JS:** `js/index/` (11 modules)
- **Reads:**
  - `fvp_current_reports` (localStorage) — shows report cards
  - `fvp_active_project_id` (localStorage) — highlights active project
  - `fvp_projects` (localStorage) — project list for picker
  - IndexedDB projects (via data-layer) — fallback
  - Supabase projects (via data-layer) — cloud refresh
- **Writes:**
  - `fvp_active_project_id` when user picks a project
  - `fvp_projects` cache after Supabase refresh
- **Navigates to:** quick-interview.html (new report), report.html (resume refined), project-config.html, settings.html, archives.html
- **Key logic:** `report-rules.js` categorizes reports as Late/Draft/Refined/Submitted by reading `fvp_current_reports` ONLY (not Supabase)

### quick-interview.html
- **Purpose:** Field data capture (voice/text notes, weather, activities, photos)
- **JS:** `js/interview/` (20 modules)
- **Reads:**
  - `reportId` from URL params
  - `fvp_active_project_id` → loads project from IndexedDB/Supabase
  - `fvp_current_reports[draft_{projectId}_{date}]` → restores draft
  - User profile from IndexedDB
- **Writes (continuously):**
  - `fvp_current_reports[draft_{projectId}_{date}]` — full draft with `_draft_data` blob
  - `fvp_current_reports[{reportId}]` — stub (id, project_id, date, status)
  - IndexedDB photos (base64 blobs)
  - Supabase `interview_backup` (every 5s, debounced)
- **Writes (on FINISH):**
  - Supabase `reports` table (creates report row)
  - Photos uploaded to `report-photos` storage bucket
  - Supabase `photos` table (metadata)
  - Sends to n8n AI webhook for refinement
  - `fvp_report_{reportId}` — complete package (AI output + original input)
  - Updates `fvp_current_reports[{reportId}]` status to "refined"
  - DELETES `fvp_current_reports[draft_{projectId}_{date}]`
- **Navigates to:** report.html?reportId={id}&date={date}

### report.html (AI Refine / Edit / Preview / Submit)
- **Purpose:** Review AI output, edit sections, preview PDF, submit
- **JS:** `js/report/` (11 modules)
- **Reads:**
  - `reportId` from URL params
  - `fvp_report_{reportId}` (localStorage) — the full data package
  - Active project from IndexedDB/Supabase
  - User profile for inspector name/signature
- **Writes (during editing):**
  - `fvp_report_{reportId}` — updates with user edits (500ms debounce)
  - `fvp_current_reports[{reportId}]` — status updates
  - Supabase `report_backup` (every 5s, debounced)
- **Writes (on Submit):**
  - Supabase Storage: PDF blob → `report-pdfs/{reportId}/{filename}`
  - Supabase `reports` table: status → "submitted", pdf_url, submitted_at
  - Supabase `final_reports` table: all report sections, weather, toggles
- **Cleanup (on Submit):**
  - DELETES `fvp_report_{reportId}` from localStorage
  - DELETES `fvp_current_reports[{reportId}]` from localStorage
  - DELETES photos from IndexedDB
- **Navigates to:** archives.html (after submit), index.html (after delete)
- **Has:** Delete button with confirmation modal (uses `js/shared/delete-report.js`)

### projects.html
- **Purpose:** View all projects with contractor info
- **JS:** `js/projects/main.js`
- **Reads:** IndexedDB projects, Supabase projects (refresh)
- **Writes:** IndexedDB (caches projects), `fvp_projects` (localStorage cache)
- **Navigates to:** project-config.html (edit project)

### project-config.html
- **Purpose:** Create/edit project details + contractors/crews, document import
- **JS:** `js/project-config/` (5 modules: crud.js, contractors.js, form.js, document-import.js, main.js)
- **Reads:** Project from IndexedDB/Supabase, project extractor webhook response
- **Writes:** Supabase `projects` table (with contractors as JSONB), IndexedDB cache, `fvp_projects` cache, `project-logos` storage bucket
- **Navigates to:** projects.html (after save)

### settings.html
- **Purpose:** Inspector profile (name, title, company, email, phone)
- **JS:** `js/settings/main.js`
- **Reads:** User profile from IndexedDB → Supabase fallback, scratch pad from localStorage
- **Writes:** IndexedDB user profile, Supabase `user_profiles`, localStorage scratch pad
- **Has:** Sign out button, app refresh button

### archives.html
- **Purpose:** View submitted reports with project filter, inline PDF viewer
- **JS:** `js/archives/main.js`
- **Reads:** Supabase `reports` table (status=submitted), `final_reports` table, Supabase Storage for PDFs
- **Writes:** Nothing locally
- **Has:** Delete button (uses `js/shared/delete-report.js` cascade)

### permissions.html
- **Purpose:** Camera/mic/location/speech permission setup (onboarding)
- **JS:** `js/permissions/main.js`
- **Reads:** Permission flags from localStorage
- **Writes:** Permission flags to localStorage (`fvp_mic_granted`, `fvp_cam_granted`, `fvp_speech_granted`, `fvp_loc_granted`, `fvp_onboarded`)
- **Navigates to:** index.html

### landing.html
- **Purpose:** Marketing/info page
- **JS:** `js/landing/main.js`
- **Auth:** NOT protected

### permission-debug.html
- **Purpose:** Permission debugging and troubleshooting
- **JS:** `js/permission-debug/main.js`
- **Auth:** NOT protected (debug utility)

---

## Shared Modules

| Module | Loaded By | Purpose |
|--------|-----------|---------|
| `js/shared/ai-assistant.js` | index, interview, report, archives, projects, project-config, settings, permissions | Context-aware AI chat assistant |
| `js/shared/delete-report.js` | report, archives, index | Cascade delete (Supabase tables + storage buckets + localStorage + IndexedDB) |

---

## Data Expiration & Loss Risks

### localStorage Eviction (THE BIG RISK)
- **No `navigator.storage.persist()` call anywhere in the app**
- Without persist(), browsers can evict localStorage at ANY time under storage pressure
- iOS Safari is especially aggressive — can clear after ~7 days of no visits
- Android Chrome clears under storage pressure with no warning
- **Impact:** ALL drafts, report data, project cache — gone without warning
- **Mitigation:** Supabase backup tables (interview_backup, report_backup) write every 5s but have no automated restore path

### Supabase Auth Session Expiration
- Supabase JWT tokens expire after **1 hour** by default
- `supabaseClient` auto-refreshes using a refresh token stored in localStorage
- Refresh token expires after **1 week** (Supabase default) — then user must re-login
- **If localStorage gets cleared:** Both access AND refresh tokens gone → forced re-login
- **auth.js** only calls `getSession()` — does NOT listen for `onAuthStateChange` events
- No handling for mid-session token expiry (API calls could silently fail)

### Draft Timeout / Stale Data
- **No explicit TTL on drafts** — they live in localStorage forever until:
  1. User clicks FINISH (moves to refined)
  2. User submits (cleanup deletes them)
  3. Browser evicts localStorage
  4. The date-check in `loadFromLocalStorage()` deletes them on day mismatch
- **The "left too long" issue:** Not a timer — it's the date-check. If today's date != draft date, the draft is deleted. So a draft from yesterday is treated as "expired" and nuked.

### IndexedDB Eviction
- Same risk as localStorage but slightly more persistent
- Without `navigator.storage.persist()`, both can be cleared together
- Photo blobs stored here are particularly at risk (large data = eviction target)

### Service Worker Cache
- SW caches app shell (HTML, CSS, JS)
- Cache version bumped manually on deploy (currently v6.9.9)
- Old caches deleted on SW activation
- **Risk:** If SW serves cached HTML but localStorage is cleared, the app loads fine but has no data

---

## Page Navigation Map

```
login.html ──→ index.html (dashboard)
                  │
                  ├──→ quick-interview.html?reportId={uuid}
                  │         │
                  │         └──(FINISH)──→ report.html?reportId={uuid}
                  │                           │
                  │                           ├──(Submit)──→ archives.html
                  │                           └──(Delete)──→ index.html
                  │
                  ├──→ projects.html ──→ project-config.html
                  ├──→ settings.html
                  ├──→ archives.html
                  └──→ permissions.html
```

---

## localStorage Keys Summary

See `js/README.md` for the comprehensive storage reference with all keys, types, writers, readers, and cleanup behavior.

## IndexedDB Stores

| Store | Key | Written By | Read By | Cleaned Up? |
|-------|-----|-----------|---------|-------------|
| `projects` | id (UUID) | data-layer.js (from Supabase) | data-layer.js | Overwritten on refresh |
| `userProfile` | deviceId | data-layer.js, settings/main.js | data-layer.js, settings/main.js | Never |
| `photos` | id (UUID) | interview/photos.js | interview/photos.js, interview/supabase.js | Yes on submit (by reportId) |

**Note:** The `archives` store was removed in IndexedDB v3 (was never actively used).

---

## Cleanup Log (v6.9)

Dead code removed during v6.9 reorganization:
- `STORAGE_KEYS.USER_PROFILE` — defined but never read/written
- `STORAGE_KEYS.LAST_SYNC` — defined but never read/written
- `getActiveProject()` in storage-keys.js — never called (project-config has its own)
- `getSyncQueue()` in storage-keys.js — never called externally
- `clearSyncQueue()` in storage-keys.js — never called (`clearSyncQueueForReport()` handles cleanup)
- `normalizeContractor()` in data-layer.js — internal function, never called

**Known TODO:** `addToSyncQueue()` writes to `fvp_sync_queue` but no background worker processes it.
