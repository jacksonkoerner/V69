# FieldVoice Pro v6.9 — Architecture Guide

> Living document. Updated as the app evolves.
> Last updated: 2026-02-13 (Sprint 14 — Security Audit Fixes)

---

## Overview

FieldVoice Pro is a voice-powered DOT-compliant daily field reporting system for RPRs (Resident Project Representatives). The app runs as a **PWA** (Progressive Web App) hosted on GitHub Pages with **Supabase** as the backend and **n8n** for AI processing workflows.

### Tech Stack
- **Frontend:** Vanilla JS (no framework), Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **AI Processing:** n8n webhooks → LLM refine/extract pipelines
- **Hosting:** GitHub Pages (jacksonkoerner.github.io/V69/)
- **Offline:** Service Worker with offline-first caching

---

## Page Map

| Page | File | Purpose |
|------|------|---------|
| Dashboard | `index.html` | Home screen — weather, projects, active reports, field tools |
| Login | `login.html` | Email/password auth via Supabase |
| Landing | `landing.html` | Marketing/info page |
| Interview | `quick-interview.html` | Capture field data (Quick Notes or Guided Sections) |
| Report Editor | `report.html` | View/edit AI-refined report, submit/export |
| Archives | `archives.html` | View submitted/past reports |
| Settings | `settings.html` | Inspector profile, sign-out, app refresh |
| Projects | `projects.html` | List/manage projects |
| Project Config | `project-config.html` | Edit project details, contractors, equipment |
| Permissions | `permissions.html` | Camera, mic, location access setup |
| Permission Debug | `permission-debug.html` | Troubleshoot permission issues |

---

## Data Flow: Report Lifecycle

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  Dashboard   │────▶│   Interview  │────▶│  AI Processing │────▶│ Report Editor│
│  (index)     │     │  (guided or  │     │  (n8n webhook)  │     │  (report)    │
│  Select      │     │   freeform)  │     │  Refines notes  │     │  View/edit   │
│  project     │     │  Capture     │     │  into DOT       │     │  refined     │
│              │     │  notes/photos│     │  format          │     │  report      │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
                                                                        │
                                                                        ▼
                                                                ┌──────────────┐
                                                                │   Submit     │
                                                                │  (PDF gen +  │
                                                                │   archive)   │
                                                                └──────────────┘
```

### Step by Step

1. **Dashboard** → User selects a project and clicks "+ Begin Daily Report"
2. **Interview** → User picks capture mode:
   - **Quick Notes** — freeform text + photos, AI organizes later
   - **Guided Sections** — structured: Weather, Work Summary, Contractors, Equipment, Issues, Communications, QA/QC, Safety, Visitors, Photos
3. **Autosave** — Interview data saves to:
   - `localStorage` (immediate, via `saveCurrentReport()`)
   - `IndexedDB` (local persistence)
   - `interview_backup` table in Supabase (cloud backup, every 5s debounced)
4. **Finish/Process** → Sends captured data to n8n AI webhook for refinement
5. **Report Editor** → AI-generated report stored in `report_data` table. User can edit fields, then submit.
6. **Submit** → Generates PDF, updates status to "submitted", moves to archives

---

## Data Storage Architecture

### Three-Tier Storage (Offline-First)

```
┌─────────────────────────────────────────────────────┐
│                     Supabase                         │
│  (Source of truth — synced when online)              │
│  Tables: reports, report_data, projects, etc.        │
├─────────────────────────────────────────────────────┤
│                    IndexedDB                         │
│  (Local persistence — survives page reloads)         │
│  Stores: currentReports, draftData, projects, etc.   │
├─────────────────────────────────────────────────────┤
│                   localStorage                       │
│  (Fast access — user prefs, active state)            │
│  Keys: fvp_user_id, fvp_org_id, fvp_projects, etc.  │
└─────────────────────────────────────────────────────┘
```

### Supabase Tables

| Table | Purpose | Has org_id | RLS |
|-------|---------|------------|-----|
| `reports` | Report metadata (status, dates, project_id) | ✅ | ✅ org-scoped |
| `report_data` | AI-generated content + user edits (JSONB) | ❌ (via JOIN) | ✅ report_id→reports |
| `interview_backup` | Draft interview state (cloud backup) | ✅ | ✅ org-scoped |
| `report_backup` | Deprecated — was report page state | ❌ (via JOIN) | ✅ report_id→reports |
| `projects` | Project definitions (name, number, contractors) | ✅ | ✅ org-scoped |
| `photos` | Photo metadata (storage_path, GPS, caption) | ❌ (via JOIN) | ✅ report_id→reports |
| `ai_submissions` | AI processing requests/responses | ❌ (via JOIN) | ✅ report_id→reports |
| `user_profiles` | Inspector info (name, title, company, device) | ✅ | ✅ org-scoped |
| `user_devices` | Multi-device tracking | ❌ | ✅ auth_user_id |
| `organizations` | Org definitions | ✅ (is PK) | ✅ SELECT only |
| `final_reports` | Legacy — merged into reports | ❌ (via JOIN) | ✅ report_id→reports |

### localStorage Keys (fvp_ prefix)

| Key | Purpose | Cleared on sign-out |
|-----|---------|-------------------|
| `fvp_user_id` | User profile UUID | ✅ |
| `fvp_auth_user_id` | Supabase auth UUID | ✅ |
| `fvp_user_name` | Display name | ✅ |
| `fvp_user_email` | Email | ✅ |
| `fvp_org_id` | Organization UUID | ✅ |
| `fvp_auth_role` | User role (inspector, admin) | ✅ |
| `fvp_active_project_id` | Selected project | ✅ |
| `fvp_projects` | Cached project list (JSON) | ✅ |
| `fvp_current_reports` | Active report IDs | ✅ |
| `fvp_report_{uuid}` | Draft report data | ✅ (wildcard) |
| `fvp_ai_conversation_{userId}` | AI assistant chat history | ✅ (wildcard) |
| `fvp_device_id` | Device identifier | ❌ (device-level) |

---

## Authentication & Security

### Auth Flow
1. User signs in via Supabase Auth (email/password)
2. JWT stored by Supabase client library
3. `auth.js` stores user metadata in localStorage
4. Auth state listener monitors for token changes/expiry
5. Periodic session check every 5 minutes

### Row-Level Security (RLS)
All 11 tables have RLS enabled. Policies use two helper functions:
- `get_user_org_id()` — returns the user's org_id from user_profiles
- `get_user_profile_id()` — returns the user's profile id

**Policy patterns:**
- **Direct org_id:** Tables with org_id column use `org_id = get_user_org_id()`
- **JOIN via reports:** Tables without org_id use `report_id IN (SELECT id FROM reports WHERE org_id = get_user_org_id())`
- **Auth-based:** user_devices uses `auth_user_id = auth.uid()`

### Sign-Out Security
Enterprise-grade cleanup:
- All `fvp_*` identity and data keys removed from localStorage
- All `fvp_report_*` and `fvp_ai_conversation_*` keys removed (wildcard)
- IndexedDB stores cleared: currentReports, draftData, userProfile, projects
- Supabase session terminated

### XSS Protection
User content is escaped via `escapeHtml()` before innerHTML injection in:
- QA/QC notes (`guided-sections.js`)
- Photo captions (`guided-sections.js`, `freeform.js`)
- Work summary (`form-fields.js`)
- Weather fields (`original-notes.js`)

---

## Offline Support

### Service Worker (`sw.js`)
- Cache version: `fieldvoice-pro-v{X.Y.Z}` (bump on every deploy)
- **Static assets:** Cache-first strategy (~80 files pre-cached)
- **Navigation:** Network-first → cache → index.html fallback
- **API calls:** Network-first → offline JSON error response
- **Activation:** `skipWaiting()` + `clients.claim()` for immediate takeover

### Offline Capabilities
- Dashboard loads from cache
- Interview can capture data offline (saves to localStorage + IndexedDB)
- Report viewing works if data is cached
- Cloud sync resumes automatically when back online

---

## AI Processing (n8n Webhooks)

| Webhook | Purpose | Trigger |
|---------|---------|---------|
| `fieldvoice-v69-refine-report` | Full report refinement | Interview "Finish" button |
| `fieldvoice-v69-project-extractor` | Extract project info from docs | Project config import |
| `fieldvoice-v69-refine-text` | Inline text refinement | Report editor AI assist |

### Processing Flow
1. Client POSTs interview data to n8n webhook
2. n8n pipeline sends to LLM for DOT-format refinement
3. Result stored in `report_data.ai_generated` (JSONB)
4. Client receives result and redirects to report editor

---

## Realtime Sync

Uses Supabase Realtime subscriptions for:
- **reports-sync** — detects new/updated reports across devices
- **projects-sync** — detects project changes across devices

Client-side guard in `_handleReportDataChange` rejects events for report IDs not belonging to the current user's known reports.

---

## JS Architecture

### Folder Structure
```
js/
├── auth.js                 # Auth module (sign-in/out, session monitoring)
├── config.js               # Supabase URL/keys
├── data-layer.js           # Unified data access (Supabase + IndexedDB + localStorage)
├── indexeddb-utils.js       # IndexedDB wrapper (CRUD for all stores)
├── media-utils.js           # Photo/camera utilities
├── pwa-utils.js             # Service Worker registration, install prompt
├── report-rules.js          # DOT compliance rules/validation
├── storage-keys.js          # Centralized localStorage key constants
├── supabase-utils.js        # Supabase query helpers, project/report mappers
├── ui-utils.js              # Toast notifications, date formatting, escapeHtml()
├── index/                   # Dashboard page modules
│   ├── main.js              # Dashboard init, project loading
│   ├── calendar.js          # Calendar widget
│   ├── cloud-recovery.js    # Recover drafts from cloud
│   ├── deep-links.js        # URL deep link handling
│   ├── field-tools.js       # Compass, measure, level, etc.
│   ├── messages.js          # Messages widget
│   ├── panels.js            # Panel layout management
│   ├── report-cards.js      # Report card rendering + swipe-to-delete
│   ├── report-creation.js   # "Begin Daily Report" flow + project picker
│   ├── toggle-panel.js      # Section expand/collapse
│   └── weather.js           # Weather widget (GPS → API)
├── interview/               # Interview page modules
│   ├── main.js              # Interview init, mode selection
│   ├── contractors-personnel.js  # Contractor section
│   ├── equipment-manual.js  # Equipment section
│   ├── finish-processing.js # "Finish" button → n8n webhook
│   ├── freeform.js          # Freeform capture mode
│   ├── guided-sections.js   # Guided sections capture mode
│   ├── persistence.js       # Save/load/backup interview data
│   ├── photos.js            # Photo capture + GPS tagging
│   ├── state-mgmt.js        # Interview state management
│   ├── ui-display.js        # Weather display, section rendering
│   └── ui-flow.js           # Section navigation, progress bar
├── report/                  # Report editor modules
│   ├── main.js              # Report editor init
│   ├── ai-refine.js         # AI text refinement in editor
│   ├── autosave.js          # Report autosave to Supabase
│   ├── data-loading.js      # Load report from localStorage/Supabase
│   ├── debug.js             # Debug panel
│   ├── delete-report.js     # Delete report from editor
│   ├── form-fields.js       # Report form field rendering
│   ├── original-notes.js    # Original interview notes panel
│   ├── pdf-generator.js     # PDF generation (jsPDF + html2canvas)
│   ├── preview.js           # Report preview panel
│   └── submit.js            # Submit report (PDF + status update)
├── shared/                  # Cross-page modules
│   ├── ai-assistant.js      # AI chat assistant (all pages)
│   ├── delete-report.js     # Cascade delete (Supabase + IDB + localStorage)
│   └── realtime-sync.js     # Supabase Realtime subscriptions
└── tools/                   # Field tool modules
    ├── ar-measure.js        # AR Tape (Three.js — lazy loaded)
    ├── calc.js, compass.js, decibel.js, flashlight.js,
    │   level.js, maps.js, measure.js, photo-markup.js,
    │   qrscanner.js, slope.js, timer.js
    └── (each tool is self-contained)
```

### Key Patterns
- **No framework** — vanilla JS with module pattern (IIFE + globals)
- **Data Layer** (`data-layer.js`) abstracts storage: tries IndexedDB first, falls back to localStorage, syncs to Supabase
- **Storage Keys** centralized in `storage-keys.js` — all keys use `fvp_` prefix
- **Escape HTML** via `escapeHtml()` in `ui-utils.js` for any user content in innerHTML

---

## Deployment

### GitHub Pages
- Push to `main` → auto-deploys to `jacksonkoerner.github.io/V69/`
- Service Worker updates on next page load (skipWaiting)
- Bump `CACHE_VERSION` in `sw.js` on every deploy

### Supabase Migrations
- Migration files in `supabase/migrations/` (numbered sequentially)
- Applied via Supabase Dashboard SQL editor or Management API
- Current migrations: 003-011

---

## Known Limitations (as of Sprint 14)

1. **No framework** — scaling will eventually need consideration
2. **Webhook URLs hardcoded** — no auth on n8n webhooks
3. **Photo base64 in localStorage** — can hit quota limits for many photos
4. **Sync queue not consumed** — `storage-keys.js` writes sync events that nothing reads
5. **Race condition** — concurrent `saveCurrentReport()` calls can overwrite each other
6. **PDFs in public bucket** — no signed URLs on Supabase Storage

---

## Configuration

### Supabase Project
- **Ref:** `bdqfpemylkqnmeqaoere`
- **Region:** East US (North Virginia)
- **Auth:** Email/password
- **Realtime:** Enabled for reports + projects tables

### n8n Webhooks
- **Instance:** `advidere.app.n8n.cloud`
- **See:** `V69_CONFIG.md` for full webhook URLs and API keys

---

*This document should be updated whenever significant architectural changes are made.*
