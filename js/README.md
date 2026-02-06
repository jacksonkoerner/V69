# FieldVoice Pro v6.6 - JavaScript Modules

Quick reference for development. Before adding a function to an HTML file, check if it exists here.

## Module Overview

| File | Purpose |
|------|---------|
| `config.js` | Supabase client initialization, API keys |
| `storage-keys.js` | localStorage key constants (STORAGE_KEYS object), helper functions |
| `data-layer.js` | Unified data access (IndexedDB-first, Supabase-fallback) |
| `ui-utils.js` | Shared UI helpers: escapeHtml, toast notifications, date formatting |
| `supabase-utils.js` | Supabase data converters (snake_case ↔ camelCase) |
| `report-rules.js` | Report status flow, validation, business rules enforcement |
| `sync-manager.js` | Real-time entry backup, offline sync queue management |
| `media-utils.js` | Photo capture, GPS geotagging, image compression |
| `indexeddb-utils.js` | IndexedDB database operations for local-first storage |
| `pwa-utils.js` | Service worker registration, offline detection, PWA navigation |
| `lock-manager.js` | Report locking to prevent multi-device edit conflicts |
| `index.js` | Dashboard page — report cards, project picker, begin report |
| `quick-interview.js` | Voice/text capture, guided + freeform modes, entry management |
| `report.js` | Report editing page — AI-refined content display, auto-save |
| `finalreview.js` | Final review — PDF generation with html2canvas + jsPDF, submit to Supabase |
| `archives.js` | Archives page — project filter, report list, Google Docs PDF viewer |
| `permissions.js` | Permission setup flow — mic, camera, location grants with error handling |
| `projects.js` | Projects list page — IndexedDB-first loading, Supabase sync |
| `project-config.js` | Project configuration — CRUD operations, document import, contractors |
| `settings.js` | Settings page — user profile management, scratch pad for unsaved changes |
| `sw.js` | Service worker — offline caching of static assets |

## Shared Modules (load in all pages)

### config.js
**Exports:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `supabaseClient`

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./js/config.js"></script>
```

### storage-keys.js
**Exports:** `STORAGE_KEYS`, `getDeviceId()`, `getStorageItem()`, `setStorageItem()`, `removeStorageItem()`, `getCurrentReport()`, `saveCurrentReport()`, `deleteCurrentReport()`, `getActiveProject()`, `addToSyncQueue()`, `getSyncQueue()`, `clearSyncQueue()`

```html
<script src="./js/storage-keys.js"></script>
```

### data-layer.js
**Exports:** `window.dataLayer` with methods:
- `loadProjects()` — Load all projects from IndexedDB
- `refreshProjectsFromCloud()` — Sync projects from Supabase
- `loadActiveProject()` — Get currently selected project
- `loadUserSettings()` — Load user profile
- `saveUserSettings()` — Save user profile

Storage strategy: IndexedDB-first, Supabase-fallback, cache on fetch.

```html
<script src="./js/data-layer.js"></script>
```

### ui-utils.js
**Exports:** `escapeHtml()`, `generateId()`, `showToast()`, `formatDate()`, `formatTime()`, `autoExpand()`, `initAutoExpand()`, `initAllAutoExpandTextareas()`

```html
<script src="./js/ui-utils.js"></script>
```

### supabase-utils.js
**Exports:** Data converters for each table:
- `fromSupabaseProject()` / `toSupabaseProject()`
- `fromSupabaseContractor()` / `toSupabaseContractor()`
- `fromSupabaseReport()` / `toSupabaseReport()`
- `fromSupabaseEntry()` / `toSupabaseEntry()`
- `fromSupabaseRawCapture()` / `toSupabaseRawCapture()`
- `fromSupabaseAIResponse()` / `toSupabaseAIResponse()`
- `fromSupabaseFinal()` / `toSupabaseFinal()`
- `fromSupabasePhoto()` / `toSupabasePhoto()`

```html
<script src="./js/supabase-utils.js"></script>
```

### report-rules.js
**Exports:**
- Constants: `REPORT_STATUS`, `CAPTURE_MODE`, `GUIDED_SECTIONS`, `TOGGLE_SECTIONS`
- Validation: `canStartNewReport()`, `canTransitionStatus()`, `isReportEditable()`, `validateReportForAI()`, `validateReportForSubmit()`
- Helpers: `getTodayDateString()`, `isReportFromToday()`, `isReportLate()`, `getReportsByUrgency()`

```html
<script src="./js/storage-keys.js"></script>
<script src="./js/report-rules.js"></script>
```

### sync-manager.js
**Exports:** `queueEntryBackup()`, `backupEntry()`, `backupAllEntries()`, `deleteEntry()`, `syncReport()`, `syncRawCapture()`, `processOfflineQueue()`, `initSyncManager()`, `destroySyncManager()`, `getPendingSyncCount()`

Note: Auto-sync is disabled by default — user controls sync via explicit buttons.

```html
<script src="./js/sync-manager.js"></script>
```

### media-utils.js
**Exports:** `readFileAsDataURL()`, `dataURLtoBlob()`, `compressImage()`, `compressImageToThumbnail()`, `uploadLogoToStorage()`, `deleteLogoFromStorage()`, `getHighAccuracyGPS()`

```html
<script src="./js/media-utils.js"></script>
```

### indexeddb-utils.js
**Exports:** `window.idb` with methods:
- `initDB()` — Initialize IndexedDB
- `getAllProjects()` / `getProject()` / `saveProject()` / `deleteProject()`
- `getAllReports()` / `getReport()` / `saveReport()` / `deleteReport()`
- `savePhoto()` / `getPhotosForReport()` / `deletePhoto()`
- `saveArchive()` / `getAllArchives()` / `getArchive()`

Database: `fieldvoice-pro`, stores: projects, reports, photos, archives

```html
<script src="./js/indexeddb-utils.js"></script>
```

### pwa-utils.js
**Exports:** `initPWA(options)`

Options: `{ onOnline, onOffline, skipServiceWorker }`

```html
<script src="./js/pwa-utils.js"></script>
<script>initPWA();</script>
```

### lock-manager.js
**Exports:** `window.lockManager` with methods:
- `checkLock()` — Check if report is locked by another device
- `acquireLock()` — Acquire lock for editing
- `releaseLock()` — Release lock when done
- `refreshLock()` — Heartbeat to keep lock alive

Lock timeout: 30 minutes without heartbeat.

```html
<script src="./js/lock-manager.js"></script>
```

## Page-Specific Modules

These modules attach to the DOM and don't export functions:

| Module | Page | Purpose |
|--------|------|---------|
| `index.js` | index.html | Dashboard logic, report cards, project selection |
| `quick-interview.js` | quick-interview.html | Field capture, entry management, AI webhook |
| `report.js` | report.html | AI report editing, auto-save, navigation |
| `finalreview.js` | finalreview.html | PDF generation, editable fields, submit |
| `archives.js` | archives.html | Report list, project filter, PDF viewer |
| `permissions.js` | permissions.html | Permission wizard, error handling |
| `projects.js` | projects.html | Project list, sync from Supabase |
| `project-config.js` | project-config.html | Project/contractor CRUD, document import |
| `settings.js` | settings.html | User profile, scratch pad |
| `sw.js` | (service worker) | Offline caching |

## Import Order

Standard import order for pages:

```html
<!-- CDN Dependencies -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Core Modules -->
<script src="./js/config.js"></script>
<script src="./js/storage-keys.js"></script>
<script src="./js/indexeddb-utils.js"></script>
<script src="./js/data-layer.js"></script>

<!-- Utility Modules -->
<script src="./js/supabase-utils.js"></script>
<script src="./js/ui-utils.js"></script>
<script src="./js/pwa-utils.js"></script>

<!-- Feature Modules (as needed) -->
<script src="./js/report-rules.js"></script>
<script src="./js/media-utils.js"></script>
<script src="./js/sync-manager.js"></script>
<script src="./js/lock-manager.js"></script>

<!-- Page Module -->
<script src="./js/[page].js"></script>

<!-- Initialize PWA -->
<script>initPWA();</script>
```

## Development Guidelines

1. **Check here first** before adding a function to an HTML file
2. **Function needed in 2+ files?** It belongs in /js/
3. **Never duplicate** Supabase config, converters, or utilities
4. **Use `escapeHtml()`** for any user-generated content in HTML
5. **Page modules don't export** — they attach to window/DOM
