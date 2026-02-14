# FieldVoice Pro v6.9

A Progressive Web App (PWA) for DOT construction inspectors to capture daily field reports using voice notes, photos, and structured data. Reports are processed by AI via n8n webhooks and generate professional PDF daily reports.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla JavaScript, HTML, Tailwind CSS (CDN) |
| Hosting | GitHub Pages |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI Processing | n8n webhook (advidere.app.n8n.cloud) |
| PDF Generation | html2canvas + jsPDF (client-side) |
| Storage Buckets | `report-photos`, `report-pdfs`, `project-logos` |
| Local Storage | IndexedDB (primary cache), localStorage (flags only) |

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Dashboard, report cards, project picker, field tools |
| `quick-interview.html` | Voice/text capture (guided + freeform modes) |
| `report.html` | AI-refined report editing, PDF preview, submit |
| `archives.html` | View submitted reports with project filter, offline caching |
| `permissions.html` | Onboarding, microphone/camera/location permissions |
| `projects.html` | Project listing and selection |
| `project-config.html` | Project configuration with document import, contractors/crews |
| `settings.html` | User profile settings (name, title, company, email, phone) |
| `login.html` | Email/password authentication via Supabase Auth |
| `landing.html` | Marketing/onboarding landing page |
| `permission-debug.html` | Permission debugging and troubleshooting |

## Report Lifecycle

```
1. index.html        -> Select project, begin report (generates unique reportId)
2. quick-interview   -> Capture field notes (voice/text/photos)
3. Press Finish      -> Confirmation dialog -> AI processing via n8n webhook (~15-20s)
4. report.html       -> Review/edit AI-refined report, generate PDF, submit
5. archives.html     -> View submitted PDFs by project
```

## Key Features

- **Two capture modes**: Guided interview (section-by-section) + Freeform quick notes
- **Offline-first**: Reports saved to IndexedDB, synced when online; archives cached for offline viewing
- **AI processing**: Field notes refined into professional DOT RPR format via n8n
- **PDF generation**: Client-side with html2canvas + jsPDF
- **Real-time photo upload**: Photos upload to Supabase Storage immediately after capture (background, non-blocking) with offline fallback
- **Multi-contractor support**: Contractors with crews, JSONB in projects table
- **Document import**: AI extraction from PDF/DOCX via n8n webhook
- **Organization support**: Multi-tenant org isolation with org_id on all data tables
- **Logo management**: Thumbnail + full URL (3-tier: logoUrl > logoThumbnail > logo legacy)
- **Cloud backup**: Autosave to Supabase every 5 seconds during editing
- **Cloud recovery**: Recover drafts from Supabase if local data is lost
- **Duplicate detection**: Warns on submit if another report exists for same project + date
- **AI Assistant**: Context-aware chat available on all pages
- **Field tools**: Calculator, compass, level, slope, measure, maps, QR scanner, timer, flashlight, decibel meter, photo markup

## Database Tables (Supabase)

### Active Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Org definitions for multi-tenant isolation | `id`, `name`, `created_at` |
| `projects` | Project definitions with contractors as JSONB | `id`, `org_id`, `project_name`, `report_date`, `contract_day_no` |
| `reports` | Report metadata, status, lifecycle, PDF URL | `id`, `org_id`, `project_id`, `report_date`, `pdf_url`, `inspector_name`, `submitted_at` |
| `report_data` | AI-generated + user-edited report content | `report_id`, `ai_generated`, `original_input`, `user_edits`, `capture_mode` |
| `photos` | Photo metadata + storage references | `id`, `report_id`, `storage_path`, `photo_url`, `location_lat/lng` |
| `user_profiles` | User info linked to Supabase Auth | `id`, `org_id`, `full_name`, `device_id`, `device_info` |
| `user_devices` | Multi-device tracking per user | `id`, `user_id`, `device_id`, `device_info`, `last_active` |
| `ai_submissions` | AI processing history (input + output) | `report_id`, `original_input`, `ai_response`, `processing_time_ms` |

### Backup / Deprecated Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `interview_backup` | Autosaved interview state (every 5s, used for cross-device draft recovery) | Active |
| `report_backup` | Was: autosaved report edit state | **Deprecated** (Sprint 13: report_data is authoritative) |
| `final_reports` | Was: submitted report PDF URL + metadata | **Deprecated** (Sprint 13: merged into reports table) |

### Storage Buckets

| Bucket | Purpose |
|--------|---------|
| `report-photos` | Photo files (JPEG/PNG), uploaded in real-time during capture |
| `report-pdfs` | Generated PDF reports |
| `project-logos` | Project logo images |

## Report Status Flow

```
draft -> pending_refine -> refined -> submitted
```

| Status | Description |
|--------|-------------|
| `draft` | Initial capture in progress |
| `pending_refine` | Sent to AI, waiting for response |
| `refined` | AI processing complete, ready for review |
| `submitted` | PDF generated and uploaded to archives |

## n8n Webhook Endpoints

| Endpoint | Used In | Purpose |
|----------|---------|---------|
| `fieldvoice-v69-refine-report` | quick-interview | AI refinement of field notes |
| `fieldvoice-v69-project-extractor` | project-config | Document extraction for project setup |
| `fieldvoice-image-upload` | report submit | Image upload to n8n for processing |

## Project Structure

```
/
├── index.html                  # Dashboard
├── quick-interview.html        # Field capture
├── report.html                 # AI report editing
├── archives.html               # Submitted reports viewer
├── permissions.html            # Permission setup
├── projects.html               # Project listing
├── project-config.html         # Project configuration
├── settings.html               # User profile
├── login.html                  # Authentication
├── landing.html                # Marketing page
├── permission-debug.html       # Debug utility
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker
│
├── js/                         # JavaScript modules
│   ├── config.js               # Supabase client initialization
│   ├── storage-keys.js         # localStorage constants + helpers
│   ├── indexeddb-utils.js      # IndexedDB CRUD operations (v6)
│   ├── data-layer.js           # Unified data access (IndexedDB-first)
│   ├── supabase-utils.js       # Data converters (snake_case <-> camelCase)
│   ├── ui-utils.js             # UI helpers (toast, date, escapeHtml)
│   ├── pwa-utils.js            # PWA features (offline, SW registration)
│   ├── report-rules.js         # Business logic (status flow, validation)
│   ├── media-utils.js          # Photo/GPS capture, logo upload
│   ├── auth.js                 # Auth flow (requireAuth, signOut)
│   │
│   ├── index/                  # Dashboard (11 modules)
│   │   ├── main.js             # Init, routing, page setup
│   │   ├── report-cards.js     # Report card rendering + status
│   │   ├── report-creation.js  # Project picker + report init
│   │   ├── cloud-recovery.js   # Recover drafts from Supabase
│   │   ├── weather.js          # Weather widget
│   │   ├── calendar.js         # Calendar integration
│   │   ├── field-tools.js      # Tool launcher
│   │   ├── panels.js           # Expandable panels
│   │   ├── toggle-panel.js     # Panel toggle logic
│   │   ├── messages.js         # Notifications
│   │   └── deep-links.js       # Deep link handling
│   │
│   ├── interview/              # Field capture (11 modules)
│   │   ├── main.js             # Init, project loading, resume
│   │   ├── state-mgmt.js       # Entries, toggles, N/A state
│   │   ├── persistence.js      # Draft storage, autosave, Supabase I/O
│   │   ├── finish-processing.js # AI processing + finish flow
│   │   ├── ui-flow.js          # Capture mode + processing overlay
│   │   ├── ui-display.js       # Weather, previews, progress
│   │   ├── guided-sections.js  # Guided mode section rendering
│   │   ├── freeform.js         # Freeform quick notes mode
│   │   ├── photos.js           # Photo capture + background upload
│   │   ├── contractors-personnel.js  # Contractor/crew work entries
│   │   └── equipment-manual.js # Equipment tracking
│   │
│   ├── report/                 # Report editing (11 modules)
│   │   ├── main.js, data-loading.js, autosave.js, submit.js
│   │   ├── form-fields.js, original-notes.js, preview.js
│   │   ├── ai-refine.js, pdf-generator.js
│   │   └── delete-report.js, debug.js
│   │
│   ├── project-config/         # Project CRUD (5 modules)
│   │   ├── main.js, crud.js, contractors.js, form.js
│   │   └── document-import.js
│   │
│   ├── tools/                  # Field tools (12 standalone modules)
│   ├── shared/                 # Multi-page shared (ai-assistant, delete-report, realtime-sync)
│   │
│   ├── archives/main.js        # Archives page + offline caching
│   ├── projects/main.js        # Projects list handler
│   ├── settings/main.js        # Settings page handler
│   ├── login/main.js           # Login page handler
│   ├── landing/main.js         # Landing page handler
│   ├── permissions/main.js     # Permission setup handler
│   └── permission-debug/main.js
│
├── css/output.css              # Compiled Tailwind CSS
├── icons/                      # PWA app icons (72-512px)
├── assets/                     # Favicon and brand images
├── supabase/                   # Database migrations
└── docs/                       # Specs and audit reports
    ├── FUNCTIONAL-SPEC.md      # Complete functional specification
    └── SYSTEM_MAP.md           # System architecture map
```

## Storage Architecture

```
IndexedDB (fieldvoice-pro, v6)
├── projects          # Cached projects with contractors (JSONB)
├── userProfile       # User settings (keyed by deviceId)
├── photos            # Photo metadata + base64 for offline
├── currentReports    # Active draft reports (durable backup of localStorage)
├── draftData         # Full draft interview data (replaces localStorage for large data)
└── cachedArchives    # Cached archive reports/projects for offline viewing

localStorage (flags only, fvp_* prefix)
├── fvp_active_project_id    # UI picker preference (not data-critical)
├── fvp_current_reports      # Active draft reports map (backed by IndexedDB)
├── fvp_report_{id}          # Per-report refined data (backed by Supabase report_data)
├── fvp_device_id            # Permanent device UUID
├── fvp_org_id               # Organization ID
├── fvp_user_id, fvp_user_name, fvp_user_email
├── fvp_auth_user_id, fvp_auth_role
├── fvp_*_granted            # Permission flags
├── fvp_loc_*                # Location cache
└── fvp_*_dismissed          # UI state flags

Supabase (source of truth)
├── organizations, projects, reports, report_data, final_reports
├── photos, user_profiles, ai_submissions
├── interview_backup, report_backup
├── report-photos bucket (real-time upload)
├── report-pdfs bucket
└── project-logos bucket
```

See `js/README.md` for the complete developer storage reference.

## Architecture Notes (Sprints 1–12)

### Data Integrity (Sprints 1, 5)
- **Project ID source fix**: Interview and report pages load project from the report's own `project_id` (set at creation), never from `ACTIVE_PROJECT_ID`. This fixed the project-swap bug where reports could end up under the wrong project.
- `ACTIVE_PROJECT_ID` is now a UI-only preference for the dashboard picker — not used by any data flow.

### Storage Resilience (Sprints 4, 7, 10, 11)
- **Three-tier storage**: Supabase (source of truth) → IndexedDB (durable offline cache) → localStorage (fast flags)
- **Cloud backup**: `interview_backup` syncs every 5s to Supabase during capture; `report_backup` during editing
- **Cloud recovery**: Dashboard can recover lost drafts from Supabase `reports` + `report_data` tables
- **Draft data in IndexedDB**: Large draft payloads stored in IDB `draftData` store (not localStorage)
- **Current reports write-through**: `fvp_current_reports` writes to both localStorage and IndexedDB

### Organization Support (Sprint 8)
- `org_id` column on `projects`, `reports`, `user_profiles` tables
- Sign-up flow validates org ID before creating account
- All data queries filtered by `org_id` (projects, reports, archives)

### Interview Consolidation (Sprint 11)
- Merged 16 interview JS files into 7 well-scoped modules
- Total script tags on quick-interview.html reduced from 34 to 25
- Clear module boundaries: state-mgmt, persistence, finish-processing, ui-flow, ui-display, guided-sections, freeform

### Photo Upload (Sprint 12)
- Photos upload to Supabase Storage in the background immediately after capture
- Upload status indicators on photo cards (spinner → checkmark)
- If offline, local blob preserved and uploaded at FINISH (graceful fallback)

### Archives Offline (Sprint 12)
- Successful archive loads cached to IndexedDB `cachedArchives` store
- Offline access shows cached reports with a subtle banner

### Multi-Device Sync (Sprint 13)
- **Supabase Realtime**: `reports`, `report_data`, `projects` tables publish changes via postgres_changes
- **realtime-sync.js**: Shared subscription manager loaded on Dashboard, Report Editor, Field Capture, Archives
- **user_devices table**: Tracks multiple devices per user (replaces single device_id on user_profiles)
- **Schema cleanup**: `report_backup` deprecated (report_data is authoritative); `final_reports` merged into `reports` (pdf_url, inspector_name, submitted_at columns added)

## Development

- **No build step required** — vanilla JS, script tags
- **Edit files directly**, push to deploy
- All page JS organized in subfolders following the pattern: `js/{page-name}/main.js`

### Testing Locally

```bash
python -m http.server 8000
# or
npx serve .
```

### PWA Installation

- **iOS**: Share -> Add to Home Screen
- **Android**: Menu -> Install app

### Service Worker

- Cache version: Check `CACHE_VERSION` in `sw.js`
- Cache-first for static assets
- Network-first for API calls
- Stale-while-revalidate background updates
