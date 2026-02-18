# FILE_MAP.md — Quick Reference Cheat Sheet

**FieldVoice Pro V69 — Feature → File(s) Lookup**  
For AI agents and developers to find what they need in seconds.

---

## 🔍 "I need to change..." → Go here

| Feature / Concept | File(s) | Notes |
|---|---|---|
| **Supabase credentials** | `js/config.js` | SUPABASE_URL, ANON_KEY, n8n webhook key |
| **localStorage keys** | `js/storage-keys.js` | All `fvp_*` key constants |
| **Report CRUD (localStorage)** | `js/storage-keys.js` | `saveCurrentReport()`, `deleteCurrentReport()`, `getReportData()` — also IDB write-through |
| **IndexedDB stores** | `js/indexeddb-utils.js` | 6 stores: projects, userProfile, photos, currentReports, draftData, cachedArchives |
| **Data access (IDB → Supabase)** | `js/data-layer.js` | `loadProjects()`, `refreshProjectsFromCloud()`, `loadProjectById()`, `loadUserSettings()` |
| **DB row ↔ JS object conversion** | `js/supabase-utils.js` | `fromSupabaseProject()`, `toSupabaseProject()` |
| **Authentication / sessions** | `js/auth.js` | `requireAuth()`, `signOut()`, session monitoring, auto-redirect |
| **UI helpers (toast, escape, format)** | `js/ui-utils.js` | `showToast()`, `escapeHtml()`, `formatDate()`, `autoExpand()` |
| **GPS / location** | `js/ui-utils.js` (bottom half) | `getFreshLocation()`, `getCachedLocation()`, `cacheLocation()` |
| **High-accuracy GPS (multi-read)** | `js/media-utils.js` | `getHighAccuracyGPS()` |
| **Photo compression** | `js/media-utils.js` | `compressImage()`, `compressImageToThumbnail()` |
| **Logo upload/delete** | `js/media-utils.js` | `uploadLogoToStorage()`, `deleteLogoFromStorage()` |
| **PWA / service worker** | `js/pwa-utils.js` + `sw.js` | `initPWA()`, offline banner, update detection |
| **Report business rules** | `js/report-rules.js` | Status flow, validation, eligibility, toggles |
| **Report status constants** | `js/report-rules.js` | `REPORT_STATUS`, `CAPTURE_MODE`, `GUIDED_SECTIONS` |
| **AI assistant (floating chat)** | `js/shared/ai-assistant.js` | Global overlay, n8n webhook |
| **Photo cloud URLs** | `js/shared/cloud-photos.js` | `fetchCloudPhotos()` — signed URLs from Supabase |
| **Delete report cascade (Supabase)** | `js/shared/delete-report.js` | `deleteReportCascade()` — full cloud cleanup |
| **Realtime multi-device sync** | `js/shared/realtime-sync.js` | Supabase Realtime subscriptions |
| **Retry with backoff** | `js/shared/supabase-retry.js` | `supabaseRetry(fn)` |

---

## 📄 Page → Files Map

### Dashboard (`index.html`)
| Concern | File |
|---------|------|
| Orchestrator / init | `js/index/main.js` |
| Report card rendering | `js/index/report-cards.js` |
| New report creation | `js/index/report-creation.js` |
| Cloud draft recovery | `js/index/cloud-recovery.js` |
| Weather | `js/index/weather.js` |
| Expandable panels | `js/index/panels.js` |
| Panel toggle logic | `js/index/toggle-panel.js` |
| Calendar | `js/index/calendar.js` |
| Field tools modal | `js/index/field-tools.js` |
| Deep link handling | `js/index/deep-links.js` |
| Demo messages (mock) | `js/index/messages.js` |
| All field tools | `js/tools/*.js` |

### Field Capture (`quick-interview.html`)
| Concern | File |
|---------|------|
| Orchestrator / init | `js/interview/main.js` |
| Shared state (`interviewState`) | `js/interview/state-mgmt.js` |
| Draft save / autosave / Supabase sync | `js/interview/persistence.js` |
| Mode selection (guided vs freeform) | `js/interview/ui-flow.js` |
| Freeform mode UI | `js/interview/freeform.js` |
| Guided sections rendering | `js/interview/guided-sections.js` |
| Contractor & personnel tracking | `js/interview/contractors-personnel.js` |
| Equipment tracking | `js/interview/equipment-manual.js` |
| Photo capture & storage | `js/interview/photos.js` |
| Weather fetch + section previews | `js/interview/ui-display.js` |
| AI processing + finish flow | `js/interview/finish-processing.js` |
| Photo markup overlay | `js/tools/photo-markup.js` |

### Report Editor (`report.html`)
| Concern | File |
|---------|------|
| Orchestrator / init | `js/report/main.js` |
| Shared state (`reportState`) + data loading | `js/report/data-loading.js` |
| Form field population | `js/report/form-fields.js` |
| AI text refinement | `js/report/ai-refine.js` |
| Auto-save | `js/report/autosave.js` |
| Report preview rendering | `js/report/preview.js` |
| PDF generation | `js/report/pdf-generator.js` |
| Submit flow | `js/report/submit.js` |
| Delete confirmation UI | `js/report/delete-report.js` |
| Original notes tab | `js/report/original-notes.js` |
| Debug panel | `js/report/debug.js` |

### Project Config (`project-config.html`)
| Concern | File |
|---------|------|
| Orchestrator / init | `js/project-config/main.js` |
| Supabase CRUD | `js/project-config/crud.js` |
| Contractor management | `js/project-config/contractors.js` |
| Form population + logo | `js/project-config/form.js` |
| Document import + AI extraction | `js/project-config/document-import.js` |

### Other Pages
| Page | File |
|------|------|
| Archives | `js/archives/main.js` |
| Project List | `js/projects/main.js` |
| Settings | `js/settings/main.js` |
| Login | `js/login/main.js` |
| Landing | `js/landing/main.js` |
| Permissions | `js/permissions/main.js` |
| Permission Debug | `js/permission-debug/main.js` |

---

## 🔗 Script Load Order (per page)

Every page follows this pattern:
```
1. CDN deps (Supabase, Leaflet, jsPDF, jsQR)
2. js/config.js
3. js/shared/*.js (as needed)
4. js/storage-keys.js
5. Core utils (indexeddb-utils, data-layer, supabase-utils, ui-utils, pwa-utils)
6. js/report-rules.js (if needed)
7. js/media-utils.js (if needed)
8. js/auth.js
9. Page feature files (js/{page}/*.js)
10. Page init file (js/{page}/main.js) — ALWAYS LAST
11. js/shared/ai-assistant.js (after everything)
```

---

## 🗄️ Data Flow Quick Reference

```
CREATE report:  index/report-creation.js → storage-keys.js → navigate to quick-interview.html
CAPTURE data:   interview/*.js → storage-keys.js (localStorage) + interview/persistence.js (Supabase)
FINISH capture: interview/finish-processing.js → n8n webhook → saves to fvp_report_{id}
EDIT report:    report/form-fields.js + report/autosave.js → storage-keys.js + Supabase report_data
SUBMIT report:  report/submit.js → report/pdf-generator.js → Supabase (final_reports, reports)
DELETE report:  report/delete-report.js (UI) → shared/delete-report.js (Supabase cascade)
VIEW archives:  archives/main.js → Supabase (reports + final_reports)
```

---

## ⚠️ Files with Name Collisions

| Name | Location 1 | Location 2 | Difference |
|------|-----------|-----------|------------|
| `delete-report.js` | `js/shared/` (Supabase cascade) | `js/report/` (UI confirmation) | Shared = cloud cleanup; Report = modal + local cleanup |
| `main.js` | 10 different folders | — | Each is a different page orchestrator |

---

## 📊 Largest Files (potential split candidates)

| File | Lines | Could Split Into |
|------|-------|------------------|
| `js/interview/persistence.js` | 1068 | autosave + supabase-sync + cancel-flow |
| `js/report/form-fields.js` | 981 | form-populate + contractor-tables + photo-display |
| `js/tools/photo-markup.js` | 930 | (self-contained, OK as-is) |
| `js/shared/ai-assistant.js` | 811 | (self-contained, OK as-is) |
| `js/indexeddb-utils.js` | 807 | (organized by store, OK as-is) |
| `js/permissions/main.js` | 791 | (single page, OK as-is) |
| `js/report/pdf-generator.js` | 765 | (single concern, OK as-is) |
| `js/interview/contractors-personnel.js` | 752 | (cohesive, OK as-is) |

---

## 🏗️ External Dependencies

| Dependency | CDN | Used By |
|-----------|-----|---------|
| Supabase JS v2 | `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` | All pages except landing, permission-debug |
| Leaflet 1.9.4 | `unpkg.com/leaflet@1.9.4` | index.html (maps tool) |
| jsQR 1.4.0 | `cdn.jsdelivr.net/npm/jsqr@1.4.0` | index.html (QR scanner) |
| jsPDF 2.5.1 | `cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1` | report.html (PDF generation) |
| Font Awesome | (via CSS link) | All pages (icons) |
| Tailwind CSS | `css/output.css` (built) | All pages |

---

## 🗃️ Supabase Tables Quick Reference

| Table | Primary Use | Key Writers | Key Readers |
|-------|------------|-------------|-------------|
| `projects` | Project definitions | project-config/crud.js | data-layer.js |
| `reports` | Report metadata + status | interview/persistence.js, report/submit.js | archives/main.js, cloud-recovery.js |
| `report_data` | AI content + user edits | report/autosave.js | report/data-loading.js |
| `final_reports` | Submitted report archive | report/submit.js | archives/main.js |
| `photos` | Photo metadata | interview/persistence.js | shared/cloud-photos.js |
| `user_profiles` | User accounts | auth.js, settings/main.js | data-layer.js |
| `interview_backup` | Autosave backup (write-only) | interview/persistence.js | (manual recovery only) |
| `organizations` | Org/team management | (admin) | auth.js (org_id filter) |

---

*Last updated: 2025-02-14*
