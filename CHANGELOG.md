# FieldVoice Pro — Changelog

All notable changes to FieldVoice Pro. Updated with each deploy.

---

## v6.9.47 — 2026-02-21

### 🔄 Dashboard Sync Simplification
Replaced 6 overlapping sync mechanisms on the dashboard with a clean manual-pull + offline-queue architecture. Fixes deleted reports resurrecting on other tabs/devices.

#### Problem
Deleting reports on one browser tab didn't reflect on another tab. Root cause: conflicting sync mechanisms (Realtime, BroadcastChannel, cloud recovery, blocklist, triple-fire refresh listeners) would race and resurrect deleted reports as "local-only drafts."

#### New Architecture
- **Supabase is truth when online** — `pullFromSupabase()` queries cloud, overwrites local IDB
- **IDB is cache for offline** — dashboard renders from IDB immediately, works offline
- **Manual refresh** — user controls sync via refresh button (no background magic)
- **Offline queue** — deletes/changes while offline are queued with `_pendingSync` and pushed on reconnect

#### Removed
- Supabase Realtime subscriptions on dashboard (gated by page path — still active on interview/report pages)
- BroadcastChannel listener on dashboard
- `syncReportsFromCloud()` reconciler calls
- `recoverCloudDrafts()` fallback recovery calls
- Triple-fire refresh (pageshow + visibilitychange + focus event listeners)
- Cooldown/debounce queue infrastructure (~100 lines)

#### Added
- `js/index/sync.js` — `pullFromSupabase()`, `pushLocalChanges()`, `markReportDirty()`
- `window.manualRefresh` — wired to refresh button and pull-to-refresh gesture
- `online` event listener → `pushLocalChanges()` for offline replay
- Offline delete queuing via `_pendingSync: { op, dirtyAt, attempts }`

#### Files Changed
- `js/index/sync.js` (new)
- `js/index/main.js` (simplified)
- `js/shared/realtime-sync.js` (dashboard gate)
- `js/shared/delete-report.js` (offline queue)
- `js/shared/pull-to-refresh.js` (manualRefresh integration)
- `index.html` (sync.js script tag)

#### Not Touched
- Interview page (quick-interview.html) — unchanged
- Report editor (report.html) — unchanged
- Both still have Realtime subscriptions active

---

## v6.9.46 — 2026-02-21

### 🖱️ Desktop Swipe-to-Delete Fix
Fixed report cards not being swipeable on desktop/mouse — swipe-to-delete now works with click-and-drag on computers.

#### Root Cause
- `mousedown` handler (line 486) had `if (e.target.closest('button, a')) return;` which blocked swipe initiation because the entire card content is wrapped in an `<a>` tag
- Touch events (mobile) didn't have this guard, so phones worked fine

#### Fix (2 parts, mouse-only — zero touch changes)
- **Relaxed mousedown guard** — now only skips actual interactive controls (`button, input, select, textarea`), not the `<a>` card wrapper
- **Added click suppression** — after a real horizontal drag (>10px), prevents the `<a>` from navigating so swipe-left doesn't accidentally open the report. Uses capture-phase click listener with a `didSwipe` flag, reset on each mousedown.

#### What's NOT changed
- Touch event handlers (`touchstart`, `touchmove`, `touchend`) — completely untouched
- Mobile swipe behavior — identical to before
- Swipe threshold remains `-80px` (no change)

---

## v6.9.45 — 2026-02-21

### 🔒 Edge Function Auth Overhaul + Sprint 5 Testing
Fixed critical JWT verification bug — `verify_jwt=true` in gateway was incompatible with ES256 JWT Signing Keys, blocking all authenticated Edge Function calls.

#### Auth Architecture (comprehensive fix)
- **Created** `supabase/functions/_shared/auth.ts` — shared auth middleware using `getClaims()` for local JWT verification (no Auth API round-trip, ES256-compatible)
- **Updated** all 4 Edge Functions to use shared `validateAuth()` instead of inline `createClient` + `getUser()`
- **Set** `verify_jwt = false` in `supabase/config.toml` — auth is now handled in-function per Supabase's current best practices
- **Redeployed** all 4 Edge Functions

#### Security Hardening
- **405 method guard** on all 4 functions — only POST and OPTIONS allowed, everything else rejected
- **n8n fetch timeout** (120s) via shared `fetchN8n()` helper with AbortController — prevents hanging on unresponsive n8n
- **User identity forwarding** — all functions now send `X-User-Id` header to n8n for per-user traceability

#### Sprint 5 Test Results: 24/24 passed
- **Security tests (20/20):** No auth, anon key, garbage JWT, service role key → 401 on all 4 functions. GET method → 405 on all 4.
- **Functional tests (4/4):** refine-text, ai-chat, process-report, extract-project — all return 200 with valid JWT and correct payloads

---

## v6.9.44 — 2026-02-21

### 🧹 Sprint 6 Part 2: Dead offline retry cleanup
- **Replaced** broken `retryRefineProcessing()` — was reading from dead `offlineQueue` (always showed "No pending processing found")
- **New behavior:** "Open Draft to Retry" button redirects to `quick-interview.html?reportId=...` where processing actually works
- **Removed** unused `EDGE_PROCESS_REPORT_URL` from `js/report/ai-refine.js` (was only used by old queue-based retry)
- **Fixed** unused `payload` param in `handleOfflineProcessing()` (`_payload`)
- **Removed** stale comment in `persistence.js` referencing offline queue removal
- Net: -74 lines, +17 lines

---

## v6.9.43 — 2026-02-21

### 🔒 Sprint 6: Remove exposed credentials & dead webhook constants
- **Removed** `N8N_WEBHOOK_API_KEY` from `js/config.js` — API key no longer exposed in client-side JavaScript
- **Removed** 5 dead n8n URL constants (replaced by Edge Function proxies in Sprints 1-4):
  - `N8N_PROCESS_WEBHOOK` from `finish-processing.js` and `ai-refine.js`
  - `N8N_REFINE_TEXT_WEBHOOK` from `ai-refine.js`
  - `AI_WEBHOOK` from `ai-assistant.js`
  - `EXTRACT_WEBHOOK_URL` from `document-import.js`
- **Updated** stale comments: "webhook" → "Edge Function proxy"
- **Codex audit** confirmed zero remaining references to all removed constants

---

## v6.9.42 — 2026-02-21

### 🔒 Edge Function Proxy — Sprint 4: extract-project (file uploads)
- **Deployed** `supabase/functions/extract-project/index.ts` — JWT auth + FormData proxy to n8n
- **Frontend** `js/project-config/document-import.js` — `extractProjectData()` now routes through Edge Function with Bearer JWT
- Handles `multipart/form-data` file forwarding (PDF/DOCX) through Deno runtime
- Edge Function parses incoming FormData, validates documents field, re-sends to n8n

### All 4 webhooks now proxied through Edge Functions
| Webhook | Edge Function | Sprint |
|---------|--------------|--------|
| refine-text | ✅ `refine-text` | 1 |
| ai-chat | ✅ `ai-chat` | 2 |
| refine-report | ✅ `process-report` | 3 |
| project-extractor | ✅ `extract-project` | 4 |

---

## v6.9.41 — 2026-02-21

### 🔒 Edge Function Proxy — Sprint 3: process-report (critical path)
- **Deployed** `supabase/functions/process-report/index.ts` — JWT auth + n8n proxy
- **Frontend** `js/interview/finish-processing.js` — `callProcessWebhook()` now routes through Edge Function
- **Frontend** `js/report/ai-refine.js` — `retryRefineProcessing()` now routes through Edge Function
- Client 60s timeout well within Edge Function 150s idle limit
- Same pattern: validates user session, forwards full payload to n8n with server-side X-API-Key

---

## v6.9.40 — 2026-02-21

### 🔒 Edge Function Proxy — Sprint 2: ai-chat
- **Deployed** `supabase/functions/ai-chat/index.ts` — JWT auth + n8n proxy
- **Frontend** `js/shared/ai-assistant.js` — `callAIWebhook()` now routes through Edge Function with Bearer JWT
- Same pattern as Sprint 1: validates user session, forwards to n8n with server-side X-API-Key

### 🐛 Bug Fix: "Leave site?" dialog after report processing
- **Root cause:** realtime-sync.js detected its own `status='refined'` Supabase write and tried to navigate while the processing overlay's beforeunload guard was still active
- **Fix:** Added processing overlay visibility check in `realtime-sync.js` before refined redirect — if processing is active, skip (finish-processing.js handles its own redirect)
- Reverted prior failed flag fix in `ui-flow.js`

---

## v6.9.39 — 2026-02-21

### 🔒 Edge Function Proxy — Sprint 1: refine-text
First Supabase Edge Function deployed. The `refine-text` webhook now routes through a server-side proxy instead of calling n8n directly from the browser.

#### Edge Function: `refine-text`
- **Deployed** `supabase/functions/refine-text/index.ts` to project `bdqfpemylkqnmeqaoere`
- **Auth:** Validates Supabase JWT (user must be signed in) — rejects with 401 if missing/expired
- **Proxy:** Forwards JSON payload to `N8N_BASE_URL/webhook/fieldvoice-v69-refine-text` with server-side `X-API-Key`
- **CORS:** Handles preflight `OPTIONS` requests for browser compatibility
- **Secrets:** `N8N_BASE_URL` and `N8N_WEBHOOK_SECRET` set via `supabase secrets set`

#### Frontend Changes (`js/report/ai-refine.js`)
- `refineTextField()` — now calls Edge Function URL instead of n8n directly, sends `Authorization: Bearer <JWT>` instead of `X-API-Key`
- `refineContractorNarrative()` — same change, same Edge Function
- Added `EDGE_REFINE_TEXT_URL` constant (derived from `SUPABASE_URL`)
- Both functions now fetch the session token via `supabaseClient.auth.getSession()` before each call

#### What's NOT changed yet (at time of this sprint — resolved in Sprints 2-4)
- ~~`retryRefineProcessing()` still calls n8n directly~~ → migrated in Sprint 3 (v6.9.41)
- `N8N_WEBHOOK_API_KEY` still in config.js (cleanup sprint pending)
- ~~Other 3 webhooks unchanged~~ → all migrated by Sprint 4 (v6.9.42)

---

## v6.9.38 — 2026-02-21

### 🔒 n8n Webhook Security (Sprint 15 — SEC)
Audit and lockdown of all 4 n8n webhook endpoints. Previously all webhooks were wide open (auth=none on n8n side, weak static key in client JS).

#### Webhook Security Audit
- **Full audit of all 4 webhooks** — documented files, functions, payloads, responses, timeouts, and error handling for each
- **n8n-side audit** — confirmed all 4 workflow webhook nodes had `authentication: none` (X-API-Key header was sent by app but never validated by n8n)
- **Identified project-extractor had zero auth** — no X-API-Key header, no AbortController timeout
- **Audit reports:** `memory/webhook-security-audit.md`, `memory/n8n-webhook-audit.md`, `memory/frontend-webhook-audit.md`

#### Header Auth Implementation
- **n8n side:** All 4 webhook nodes updated to enforce Header Auth (`X-API-Key`) — unauthorized requests now return 403
- **config.js** — Replaced weak static key (`fvp-n8n-webhook-key-2026`) with strong 48-byte random key
- **document-import.js** — Added `X-API-Key` header to project-extractor fetch call (was completely missing)
- **document-import.js** — Added 60s AbortController timeout to project-extractor (had none)
- **All 4 webhooks tested** — wrong key → 403, correct key → 200 on all endpoints

#### Edge Function Exploration (Planning Only)
- Researched Supabase Edge Functions as proxy layer (JWT validation, file forwarding, timeout limits, secrets management)
- Evaluated 6 alternative approaches (Header Auth, Edge Functions, Cloudflare Workers, CF Zero Trust, DB triggers, direct AI calls)
- Architecture designed for future implementation: Browser → Edge Function (JWT) → n8n (server secret)
- Rollout plan: 4 sprints (refine-text → ai-chat → refine-report → project-extractor) + cleanup sprint

---

## v6.9.37 — 2026-02-20

### 🔒 Storage Bucket Privatization (Sprint 14)
Complete security overhaul of Supabase Storage — all 3 buckets switched from public (anon CRUD) to private with org-scoped RLS.

#### PDF Path Privatization (v6.9.34)
- **New `reports.pdf_path` column** — stores durable storage path (e.g., `{reportId}/{filename}.pdf`)
- **Migration 012** — adds column + backfills from existing `pdf_url` signed URLs
- **submit.js** — now persists both `pdf_path` (durable) and `pdf_url` (signed, 1h cache)
- **archives/main.js** — `viewPdf()` re-signs from `pdf_path` on click (5-min TTL); legacy fallback for old rows
- **delete-report.js** — uses `pdf_path` directly for storage deletion (no more URL string parsing)

#### Logo Path Privatization (v6.9.35)
- **New `projects.logo_path` column** — stores durable storage path (e.g., `{projectId}.png`)
- **Migration 013** — adds column + backfills from existing `logo_url` signed URLs
- **media-utils.js** — `uploadLogoToStorage()` returns `{signedUrl, storagePath}` instead of just URL
- **project-config/form.js** — stores `logoPath` on project alongside `logoUrl`; clears both on remove
- **supabase-utils.js** — maps `logo_path ↔ logoPath` in both converter directions
- **data-layer.js** — new `resignProjectLogo()` helper re-signs logos on every project load (both batch and single). Report headers, previews, and PDF generator always get fresh URLs.

#### Photo URL Hardening (v6.9.36)
- **cloud-photos.js** — new `resignPhotoUrls()` utility re-signs locally-cached photos from their durable `storagePath` (parallel, non-blocking via `Promise.allSettled`)
- **data-loading.js** — calls `resignPhotoUrls()` after loading photos from local cache, so all report tabs (form, original-notes, preview, PDF generator) get fresh signed URLs
- Photos already had `storage_path` as source of truth — this closes the stale-URL gap for locally-cached photos

#### Private Buckets + Org-Scoped RLS (v6.9.37)
- **Migration 014** — drops all 12 old anon CRUD policies, flips all 3 buckets to `public = false`, adds 12 new authenticated + org-scoped policies
- **report-photos** & **report-pdfs** — extract `reportId` from storage path → join `reports.org_id` → verify `get_user_org_id()`
- **project-logos** — extract `projectId` from filename → join `projects.org_id` → verify `get_user_org_id()`
- Old public URLs now return HTTP 400 — signed URLs are the only access method
- Only authenticated users in the same org can upload, modify, or delete storage objects

### Security Audit
- **Codex 5.3 storage privatization audit** — full lifecycle trace of all 3 buckets with file:line evidence → `docs/CODEX_STORAGE_PRIVATIZATION_AUDIT.md`

### RLS Auth Hardening (v6.9.33)
- **auth.js** — fixed race condition where pages could load before auth session resolves, causing RLS-protected queries to fail silently
- **Service worker cache bump** to clear stale cached JS

---

## v6.9.32 — 2026-02-20

### Crew Extraction & Report Editor
- **Crew sub-cards in report editor** — `renderWorkSummary()` now shows per-crew narrative textareas when a contractor has crews defined. Each crew gets its own no-work toggle and auto-saving textarea. Contractors without crews keep the existing flat card layout.
- **Crew-aware AI refine workflow** — Updated n8n "FieldVoice - Refine Report - v6.9" (`s2SuH3Xklenn04Mq`):
  - Both guided and freeform prompts now return `crewActivities[]` per contractor when crews exist
  - Guided prompt parses `work_<contractorId>_crew_<crewId>` entry keys into per-crew narratives
  - Freeform prompt attempts crew name-matching from raw notes against project crew definitions
  - Omits `crewActivities` entirely for contractors with no crews (backward-compatible)
- **maxTokens bumped to 8192** on both Claude nodes (was 4096) to handle larger reports
- **Crew mapping from PDF import** — `document-import.js` `populateFormWithExtractedData()` now maps extracted crews with proper `id`, `contractorId`, `name`, `status`, `sortOrder`. Handles both string arrays and object arrays from the Project Extractor.
- **n8n Project Extractor prompt updated** — Added rule #7 for crew extraction from Daily Work Summary, added `crews` array to contractor schema, removed broken Google Sheets logging node, set `maxTokens: 4096` on Analyze Document node (was truncating)

### Storage Audit
- Completed full 20-chunk storage audit of the entire codebase → `docs/STORAGE_AUDIT.md`
- Covers: Supabase schema + RLS, IndexedDB stores, localStorage keys, all JS modules' storage operations
- Includes ERDs, data flow diagrams, duplicate analysis, orphan detection, prioritized recommendations

### Repo Cleanup
- Removed stale `www/js/shared/sync-merge.js` (deleted from root but lingered in www/ and Xcode)

---

## v6.9.31 — 2026-02-18

### Cross-Device Sync Hardening
- **Fixed report page infinite reload loop** when opening a report on a different device than where it was created
- **Fixed interview cross-device sync** — always checks cloud freshness before loading local data
- **Fixed report load** — always checks cloud freshness (Option A pattern)
- **Prevented sync ping-pong loop** when two devices have the same report open
- **Never delete local-only reports during cloud sync** — protects unsubmitted work

### Dead Code Removal (3-batch cleanup)
- Batch 1: Archived old sync code, removed sync-merge.js, stripped realtime-sync
- Batch 2: Stripped sync from report autosave, interview persistence, and both main.js files
- Batch 3: Removed remaining dead code, bumped SW to v6.9.27

### Dashboard
- **Submitted report dismissal** — soft-hide with cross-device sync

### Auto-Save & Report Editing
- **Blur handlers** now use shared save path (local + cloud), added `saveNow()`, auto-switch tab on refined transition
- **Report cross-device sync** — update base hash after flush, expanded field map
- **Replace silent catches** with `console.warn` for debug visibility

### Photos
- **Photo pipeline fix** — preserve GPS/date/time in backups, fix accuracy, fix `_undefined` filename
- **Photo re-sign on demand**, desktop refresh button, promoted error log levels
- **Upsert photo metadata** to photos table on background upload
- **Render photos** in both guided and minimal mode on sync merge

### Infrastructure
- **Pull-to-refresh** on all main pages
- **Error log monitoring script** (`scripts/check-errors.sh`)
- **SW cache fix** — added missing files to STATIC_ASSETS (pull-to-refresh, broadcast, data-store, sync-merge, console-capture, cloud-photos, photo-measure, scan-viewer)

### Sync Engine
- **Merge engine hardening** — protected fields, tombstones, recursive item merge
- **Delete reliability** + sync hardening (8-point audit fixes)

---

## v6.9.22 and earlier

See git log for full history: `git log --oneline`
