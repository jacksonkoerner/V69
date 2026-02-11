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
| PDF Viewing | Google Docs Viewer (embedded) |
| Storage Buckets | `report-photos`, `report-pdfs`, `project-logos` |
| Local Storage | IndexedDB (primary cache), localStorage (flags only) |

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Dashboard, report cards, project picker, field tools |
| `quick-interview.html` | Voice/text capture (guided + freeform modes) |
| `report.html` | AI-refined report editing, PDF preview, submit |
| `archives.html` | View submitted reports with project filter, inline PDF viewer |
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
- **Offline-first**: Reports saved to IndexedDB, synced when online
- **AI processing**: Field notes refined into professional DOT RPR format via n8n
- **PDF generation**: Client-side with html2canvas + jsPDF
- **Photo capture**: GPS geotagging, compression, Supabase Storage upload
- **Multi-contractor support**: Contractors with crews, JSONB in projects table
- **Document import**: AI extraction from PDF/DOCX via n8n webhook
- **Logo management**: Thumbnail + full URL (3-tier: logoUrl > logoThumbnail > logo legacy)
- **Cloud backup**: Autosave to Supabase every 5 seconds during editing
- **Cloud recovery**: Recover drafts from Supabase if local data is lost
- **AI Assistant**: Context-aware chat available on all pages
- **Field tools**: Calculator, compass, level, slope, measure, maps, QR scanner, timer, flashlight, decibel meter, photo markup

## Database Tables (Supabase)

### Active Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project definitions with contractors as JSONB column |
| `reports` | Report metadata, status tracking, lifecycle |
| `final_reports` | Submitted report content + PDF URL |
| `photos` | Photo metadata + storage references |
| `user_profiles` | User info linked to Supabase Auth (full_name, title, company, email, phone) |
| `ai_submissions` | AI processing history (original input + refined output) |

### Backup Tables (write-only, no client restore path)

| Table | Purpose |
|-------|---------|
| `interview_backup` | Autosaved interview state (every 5s) |
| `report_backup` | Autosaved report edit state (every 5s) |

### Storage Buckets

| Bucket | Purpose |
|--------|---------|
| `report-photos` | Original photo files (JPEG/PNG) |
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
| `fieldvoice-refine-v6.6` | quick-interview | AI refinement of field notes |
| `fieldvoice-v69-project-extractor` | project-config | Document extraction for project setup |

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
│   ├── indexeddb-utils.js      # IndexedDB CRUD operations
│   ├── data-layer.js           # Unified data access (IndexedDB-first)
│   ├── supabase-utils.js       # Data converters (snake_case <-> camelCase)
│   ├── ui-utils.js             # UI helpers (toast, date, escapeHtml)
│   ├── pwa-utils.js            # PWA features (offline, SW registration)
│   ├── report-rules.js         # Business logic (status flow, validation)
│   ├── media-utils.js          # Photo/GPS capture, logo upload
│   ├── auth.js                 # Auth flow (requireAuth, signOut)
│   │
│   ├── index/                  # Dashboard (11 modules)
│   ├── interview/              # Field capture (20 modules)
│   ├── report/                 # Report editing (11 modules)
│   ├── project-config/         # Project CRUD (5 modules)
│   ├── tools/                  # Field tools (12 modules)
│   ├── shared/                 # Multi-page shared (ai-assistant, delete-report)
│   │
│   ├── archives/main.js        # Archives page handler
│   ├── permissions/main.js     # Permission setup handler
│   ├── permission-debug/main.js
│   ├── projects/main.js        # Projects list handler
│   ├── settings/main.js        # Settings page handler
│   ├── login/main.js           # Login page handler
│   └── landing/main.js         # Landing page handler
│
├── css/output.css              # Compiled Tailwind CSS
├── icons/                      # PWA app icons (72-512px)
├── assets/                     # Favicon and brand images
├── supabase/                   # Database migrations
└── docs/audits/                # Completed audit reports
```

## Storage Architecture

```
IndexedDB (fieldvoice-pro, v3)
├── projects          # Cached projects with contractors (JSONB)
├── userProfile       # User settings (keyed by deviceId)
└── photos            # Photo metadata + base64 for offline

localStorage (flags only, fvp_* prefix)
├── fvp_active_project_id    # Currently selected project
├── fvp_current_reports      # Active draft reports map
├── fvp_report_{id}          # Per-report refined data
├── fvp_device_id            # Permanent device UUID
├── fvp_user_id, fvp_user_name, fvp_user_email
├── fvp_auth_user_id, fvp_auth_role
├── fvp_*_granted            # Permission flags
├── fvp_loc_*                # Location cache
└── fvp_*_dismissed          # UI state flags

Supabase (source of truth)
├── projects, reports, final_reports
├── photos, user_profiles, ai_submissions
├── interview_backup, report_backup (write-only)
├── report-photos bucket
├── report-pdfs bucket
└── project-logos bucket
```

See `js/README.md` for the complete developer storage reference.

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

- Cache version: Check `CACHE_VERSION` in `sw.js` (currently v6.9.9)
- Cache-first for static assets
- Network-first for API calls
- Stale-while-revalidate background updates
