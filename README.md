# FieldVoice Pro v6.6

A Progressive Web App (PWA) for DOT construction inspectors to capture daily field reports using voice notes, photos, and structured data. Reports are processed by AI via n8n webhooks and generate professional PDF daily reports.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla JavaScript, HTML, Tailwind CSS (CDN) |
| Hosting | GitHub Pages |
| Database | Supabase (project ID: wejwhplqnhciyxbinivx) |
| AI Processing | n8n webhook (advidere.app.n8n.cloud) |
| PDF Generation | html2canvas + jsPDF (client-side) |
| PDF Viewing | Google Docs Viewer (embedded) |
| Storage | Supabase Storage (report-pdfs bucket) |
| Local Storage | IndexedDB (primary), localStorage (flags only) |

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Dashboard, report cards, begin new reports |
| `quick-interview.html` | Voice/text capture (guided + freeform modes) |
| `report.html` | AI-refined report editing |
| `finalreview.html` | Final review, PDF generation, submit |
| `archives.html` | View submitted reports with project filter, inline PDF viewer |
| `permissions.html` | Onboarding, microphone/camera/location permissions |
| `projects.html` | Project listing and selection |
| `project-config.html` | Project configuration with document import, contractors |
| `settings.html` | User profile settings (name, title, company, email, phone) |
| `landing.html` | Marketing/onboarding landing page |
| `permission-debug.html` | Permission debugging and troubleshooting |
| `admin-debug.html` | Admin data investigation tool |

**Note:** `drafts.html` was removed in v6.6.23 (consolidated into index.html)

## Report Lifecycle

```
1. index.html        → Select project, begin report (generates unique reportId)
2. quick-interview   → Capture field notes (voice/text/photos)
3. Press Finish      → Confirmation dialog → AI processing via n8n webhook (~15-20s)
4. report.html       → Review/edit AI-refined report
5. finalreview.html  → Final review with editable fields, generate PDF, submit
6. archives.html     → View submitted PDFs by project
```

## Key Features

- **Two capture modes**: Guided interview + Freeform quick notes
- **Offline support**: Reports saved to IndexedDB, synced when online
- **AI processing**: Field notes refined into professional DOT RPR format
- **PDF generation**: Client-side with html2canvas + jsPDF
- **Photo capture**: GPS geotagging with location caching
- **Multi-contractor support**: Editable "no work performed" tracking
- **Click-proof processing**: Overlay with step-by-step progress
- **Confirmation dialog**: Live online/offline status
- **Archives**: Project filter and Google Docs PDF viewer
- **Recently Submitted**: Last 24 hours, max 5 reports on dashboard
- **Report locking**: Prevents multi-device edit conflicts

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `projects` | Project definitions (name, engineer, NTP, duration, etc.) |
| `contractors` | Linked to projects via project_id FK |
| `reports` | Report metadata, status tracking, lifecycle |
| `final_reports` | Submitted report content + PDF URL |
| `photos` | Uploaded photos with metadata |
| `user_profiles` | User info (full_name, title, company, email, phone) |

## localStorage Keys

Prefix: `fvp_`

| Key | Purpose |
|-----|---------|
| `fvp_active_project_id` | Currently selected project UUID |
| `fvp_user_id` | User identifier |
| `fvp_device_id` | Unique device identifier |
| `fvp_loc_granted` | Location permission status |
| `fvp_loc_lat`, `fvp_loc_lng` | Cached GPS coordinates |
| `fvp_loc_timestamp` | Location cache timestamp |
| `fvp_mic_granted` | Microphone permission status |
| `fvp_cam_granted` | Camera permission status |
| `fvp_sync_queue` | Offline sync operations queue |

**Note:** Large data (projects, reports, photos) stored in IndexedDB, not localStorage.

## Report Status Flow

```
draft → pending_refine → refined → ready_to_submit → submitted
```

| Status | Description |
|--------|-------------|
| `draft` | Initial capture in progress |
| `pending_refine` | Sent to AI, waiting for response |
| `refined` | AI processing complete |
| `ready_to_submit` | User reviewed, ready for final review |
| `submitted` | PDF generated and uploaded to archives |

## n8n Webhook Endpoints

| Endpoint | Used In | Purpose |
|----------|---------|---------|
| `fieldvoice-refine-v6.6` | quick-interview, report | AI refinement of field notes |
| `fieldvoice-project-extractor-6.5` | project-config | Document extraction for project setup |

## Development

- **Hosted on GitHub Pages** (auto-deploys from main branch)
- **No build step required**
- **Edit files directly**, push to main

### Testing Locally

```bash
python -m http.server 8000
# or
npx serve .
```

### PWA Installation

- **iOS**: Share → Add to Home Screen
- **Android**: Menu → Install app

### Service Worker

- Cache version: Check `CACHE_VERSION` in `js/sw.js`
- Cache-first for static assets
- Network-first for API calls

## Project Structure

```
/
├── index.html              # Dashboard
├── quick-interview.html    # Field capture
├── report.html             # AI report editing
├── finalreview.html        # Final review + PDF
├── archives.html           # Submitted reports viewer
├── permissions.html        # Permission setup
├── projects.html           # Project listing
├── project-config.html     # Project configuration
├── settings.html           # User profile
├── landing.html            # Marketing page
├── permission-debug.html   # Debug utility
├── admin-debug.html        # Admin debug tool
├── manifest.json           # PWA manifest
├── js/                     # Shared JavaScript modules
│   ├── config.js           # Supabase client
│   ├── storage-keys.js     # localStorage constants
│   ├── data-layer.js       # IndexedDB-first data access
│   ├── ui-utils.js         # UI helpers
│   ├── supabase-utils.js   # Data converters
│   ├── report-rules.js     # Business logic
│   ├── sync-manager.js     # Offline sync
│   ├── media-utils.js      # Photo/GPS utilities
│   ├── indexeddb-utils.js  # IndexedDB operations
│   ├── pwa-utils.js        # PWA features
│   ├── lock-manager.js     # Report locking
│   ├── index.js            # Dashboard page
│   ├── quick-interview.js  # Capture page
│   ├── report.js           # Report editing page
│   ├── finalreview.js      # Final review page
│   ├── archives.js         # Archives page
│   ├── permissions.js      # Permissions page
│   ├── projects.js         # Projects list page
│   ├── project-config.js   # Project config page
│   ├── settings.js         # Settings page
│   ├── sw.js               # Service worker
│   └── README.md           # Module documentation
├── icons/                  # PWA app icons
└── assets/                 # Favicon and browser icons
```

## Storage Architecture

```
IndexedDB (fieldvoice-pro)
├── projects          # Cached projects with contractors
├── reports           # Report data packages
├── photos            # Photo blobs
└── archives          # Submitted report data

localStorage (flags only)
├── fvp_active_project_id
├── fvp_user_id, fvp_device_id
├── fvp_*_granted (permissions)
└── fvp_loc_* (location cache)

Supabase (source of truth)
├── projects, contractors
├── reports, final_reports
├── photos, user_profiles
└── report-pdfs bucket (storage)
```
