# FieldVoice Pro v6.9 — System Map

## Pages & Their Roles

### login.html
- **Purpose:** Authentication gate
- **Reads:** Nothing (entry point)
- **Writes:** Supabase Auth session (cookie/token), `user_profiles` table, `fvp_auth_role` in localStorage
- **Navigates to:** index.html (inspector) or shows "Coming Soon" (admin)
- **Auth:** NOT protected (this IS the auth page)

### index.html (Dashboard)
- **Purpose:** Home screen, report status, project selection
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
- **Purpose:** Field data capture (voice/text notes, weather, activities)
- **Reads:**
  - `reportId` from URL params
  - `fvp_active_project_id` → loads project from IndexedDB/Supabase
  - `fvp_current_reports[draft_{projectId}_{date}]` → restores draft
  - User profile from IndexedDB
- **Writes (continuously):**
  - `fvp_current_reports[draft_{projectId}_{date}]` — full draft with `_draft_data` blob
  - `fvp_current_reports[{reportId}]` — stub (id, project_id, date, status)
  - IndexedDB photos (blobs)
- **Writes (on FINISH):**
  - Supabase `reports` table (creates report row)
  - Supabase `report_entries` (individual entries)
  - Sends to n8n AI webhook for refinement
  - `fvp_report_{reportId}` — complete package (AI output + original input)
  - Updates `fvp_current_reports[{reportId}]` status to "refined"
  - DELETES `fvp_current_reports[draft_{projectId}_{date}]`
- **Navigates to:** report.html?reportId={id}&date={date}
- **⚠️ BUG:** `loadFromLocalStorage()` line 678 — compares draft date vs today, DELETES draft if mismatch

### report.html (AI Refine / Edit / Preview / Submit)
- **Purpose:** Review AI output, edit sections, preview PDF, submit
- **Reads:**
  - `reportId` from URL params
  - `fvp_report_{reportId}` (localStorage) — the full data package
  - Active project from IndexedDB/Supabase
  - User profile for inspector name/signature
- **Writes (during editing):**
  - `fvp_report_{reportId}` — updates with user edits (auto-save on changes)
  - `fvp_current_reports[{reportId}]` — status updates
- **Writes (on Submit):**
  - Supabase Storage: PDF blob → `report-pdfs/{reportId}/{filename}`
  - Supabase `reports` table: status → "submitted", pdf_url, submitted_at
  - Supabase `final_reports` table: all report sections, weather, toggles
- **Cleanup (on Submit):**
  - DELETES `fvp_report_{reportId}` from localStorage
  - DELETES `fvp_current_reports[{reportId}]` from localStorage
  - DELETES photos from IndexedDB
  - ❌ Does NOT delete `draft_{projectId}_{date}` key
  - ❌ Does NOT clean `fvp_ai_cache`
  - ❌ Does NOT clean IndexedDB report/archive cache
- **Navigates to:** archives.html (after submit), index.html (after delete)
- **Has:** Delete button with confirmation modal

### projects.html
- **Purpose:** View all projects with contractor info
- **Reads:** IndexedDB projects, Supabase projects (refresh)
- **Writes:** IndexedDB (caches projects), `fvp_projects` (localStorage cache)
- **Navigates to:** project-config.html (edit project)

### project-config.html
- **Purpose:** Create/edit project details + contractors
- **Reads:** Project from IndexedDB/Supabase, project extractor webhook
- **Writes:** Supabase `projects` table (with contractors as JSONB), IndexedDB cache, `fvp_projects` cache
- **Navigates to:** projects.html (after save)

### settings.html
- **Purpose:** Inspector profile (name, title, company, email, phone)
- **Reads:** User profile from IndexedDB → Supabase fallback, scratch pad from localStorage
- **Writes:** IndexedDB user profile, Supabase `user_profiles`, localStorage scratch pad
- **Has:** Sign out button, app refresh button

### archives.html
- **Purpose:** View submitted reports
- **Reads:** Supabase `reports` table (status=submitted), Supabase Storage for PDFs
- **Writes:** Nothing locally
- **Navigates to:** PDF viewer

### permissions.html
- **Purpose:** Camera/mic/location permission setup
- **Reads:** Permission flags from localStorage
- **Writes:** Permission flags to localStorage
- **Navigates to:** index.html

### landing.html
- **Purpose:** Marketing/info page
- **Auth:** NOT protected

---

## Data Expiration & Loss Risks

### localStorage Eviction (THE BIG RISK)
- **No `navigator.storage.persist()` call anywhere in the app**
- Without persist(), browsers can evict localStorage at ANY time under storage pressure
- iOS Safari is especially aggressive — can clear after ~7 days of no visits
- Android Chrome clears under storage pressure with no warning
- **Impact:** ALL drafts, report data, project cache — gone without warning

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
  4. The date-check bug deletes them on day mismatch
- **The "left too long" issue:** Not a timer — it's the date-check in `loadFromLocalStorage()`. If today's date ≠ draft date, the draft is deleted. So a draft from yesterday is treated as "expired" and nuked.

### IndexedDB Eviction
- Same risk as localStorage but slightly more persistent
- Without `navigator.storage.persist()`, both can be cleared together
- Photo blobs stored here are particularly at risk (large data = eviction target)

### Service Worker Cache
- SW caches app shell (HTML, CSS, JS) 
- Cache version bumped manually on deploy
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

| Key | Type | Written By | Read By | Cleaned Up? |
|-----|------|-----------|---------|-------------|
| `fvp_current_reports` | JSON map | quick-interview, report, index | index (dashboard cards), report-rules | Partially on submit (report entry only) |
| `fvp_report_{id}` | JSON | quick-interview (FINISH) | report.html | Yes on submit |
| `fvp_active_project_id` | string | index (project picker) | quick-interview, report, all pages | Never |
| `fvp_projects` | JSON map | data-layer (cache) | report-rules, data-layer | Never (overwritten on refresh) |
| `fvp_device_id` | UUID string | storage-keys (auto-gen) | everywhere | Never |
| `fvp_user_id` | UUID string | auth, settings | data-layer | Never |
| `fvp_auth_role` | string | login, auth | auth | On sign-out |
| `fvp_ai_cache` | JSON map | data-layer | data-layer | ❌ Never cleaned on submit |
| `fvp_settings_scratch` | JSON | settings (dirty form) | settings | After save |
| `fvp_onboarded` | boolean | permissions | index | Never |
| `fvp_mic/cam/loc_granted` | boolean | permissions | quick-interview | Never |
| `fvp_quick_interview_draft` | — | DEFINED but UNUSED | — | — |

---

## IndexedDB Stores

| Store | Key | Written By | Read By | Cleaned Up? |
|-------|-----|-----------|---------|-------------|
| `projects` | id (UUID) | data-layer (from Supabase) | data-layer, projects.js | Overwritten on refresh |
| `userProfile` | deviceId | data-layer, settings | data-layer, settings | Never |
| `photos` | id (UUID) | quick-interview | report.html | Yes on submit (by reportId) |
| `archives` | id (UUID) | — (store exists, not actively used) | — | — |
