# CODEX Security Audit (Code-Only)

Scope audited: `js/**/*.js` excluding `js/outdated/`.

## 1) Supabase Query Audit (`supabaseClient.from(...)` only)

| File:line | Table | Operation | `org_id` passed? source | Data-layer or direct |
|---|---|---|---|---|
| `js/login/main.js:54` | `user_profiles` | `select` | No | Direct |
| `js/login/main.js:85` | `user_profiles` | `update` | No | Direct |
| `js/login/main.js:93` | `user_devices` | `upsert` | No | Direct |
| `js/login/main.js:174` | `organizations` | `select` | No | Direct |
| `js/login/main.js:237` | `user_profiles` | `upsert` | Yes (`profileRow.org_id = org.id` from org lookup at `js/login/main.js:173-177`) | Direct |
| `js/login/main.js:256` | `user_devices` | `upsert` | No | Direct |
| `js/login/main.js:305` | `user_profiles` | `update` | No | Direct |
| `js/report/data-loading.js:85` | `report_data` | `select` | No | Direct |
| `js/report/data-loading.js:136` | `reports` | `select` | No | Direct |
| `js/report/submit.js:39` | `reports` | `select` | No | Direct |
| `js/report/submit.js:152` | `reports` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || RS.activeProject?.orgId || null` at `js/report/submit.js:141`) | Direct |
| `js/report/submit.js:167` | `reports` | `update` | No (only writes `pdf_url`, `inspector_name`, `submitted_at`) | Direct |
| `js/report/submit.js:184` | `reports` | `update` | No (only writes status/timestamps) | Direct |
| `js/report/autosave.js:184` | `report_data` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || null` at `js/report/autosave.js:176`) | Direct |
| `js/report/autosave.js:281` | `reports` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || RS.activeProject.orgId || null` at `js/report/autosave.js:271`) | Direct |
| `js/index/cloud-recovery.js:31` | `reports` | `select` | No (`user_id` filter only) | Direct |
| `js/index/cloud-recovery.js:112` | `report_data` | `select` | No | Direct |
| `js/index/cloud-recovery.js:219` | `interview_backup` | `select` | No | Direct |
| `js/index/report-cards.js:606` | `reports` | `update` | No (optional `user_id` filter added, not org) | Direct |
| `js/index/report-creation.js:37` | `reports` | `upsert` | Conditional: yes if `orgId = getStorageItem(STORAGE_KEYS.ORG_ID)` exists (`js/index/report-creation.js:24,35`) | Direct |
| `js/project-config/crud.js:21` | `projects` | `upsert` | Via converter `toSupabaseProject()` (`js/supabase-utils.js:104-107`: `project.orgId || project.org_id || localStorage.getItem(STORAGE_KEYS.ORG_ID)`) | Direct |
| `js/project-config/crud.js:222` | `projects` | `delete` | No | Direct |
| `js/interview/photos.js:189` | `photos` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || null` at `js/interview/photos.js:192`) | Direct |
| `js/interview/persistence.js:431` | `interview_backup` | `upsert` | Yes (`orgId` from `localStorage.getItem(STORAGE_KEYS.ORG_ID)` at `js/interview/persistence.js:408`) | Direct |
| `js/interview/persistence.js:789` | `interview_backup` | `upsert` | Yes (`orgId` from `localStorage.getItem(STORAGE_KEYS.ORG_ID)` at `js/interview/persistence.js:785`) | Direct |
| `js/interview/persistence.js:851` | `interview_backup` | `select` | No | Direct |
| `js/interview/persistence.js:1075` | `reports` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || IS.activeProject.orgId || null` at `js/interview/persistence.js:1065`) | Direct |
| `js/interview/persistence.js:1189` | `photos` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || null` at `js/interview/persistence.js:1176`) | Direct |
| `js/interview/persistence.js:1232` | `photos` | `delete` | No | Direct |
| `js/interview/finish-processing.js:165` | `ai_submissions` | `upsert` | Yes (`localStorage.getItem(STORAGE_KEYS.ORG_ID) || null` at `js/interview/finish-processing.js:155`) | Direct |
| `js/interview/finish-processing.js:386` | `report_data` | `upsert` | Yes (`_finishOrgId = localStorage.getItem(STORAGE_KEYS.ORG_ID) || null` at `js/interview/finish-processing.js:369`) | Direct |
| `js/data-layer.js:81` | `projects` | `select` | Query filter conditional: `.eq('org_id', orgId)` if `orgId = getStorageItem(STORAGE_KEYS.ORG_ID)` exists (`js/data-layer.js:79,85-87`) | Through `data-layer.js` |
| `js/data-layer.js:211` | `user_profiles` | `select` | No | Through `data-layer.js` |
| `js/data-layer.js:321` | `projects` | `select` | No (`.eq('id', projectId)` only) | Through `data-layer.js` |
| `js/archives/main.js:65` | `projects` | `select` | Query filter conditional: `.eq('org_id', orgId)` if present (`js/archives/main.js:63,70-72`) | Direct |
| `js/archives/main.js:107` | `reports` | `select` | Query filter conditional: `.eq('org_id', orgId)` if present (`js/archives/main.js:105,122-124`) | Direct |
| `js/shared/cloud-photos.js:26` | `photos` | `select` | No (`report_id` filter only) | Direct |
| `js/shared/cloud-photos.js:94` | `photos` | `select` | No (`in(report_id, ...)` only) | Direct |
| `js/shared/data-store.js:611` | `reports` | `select` | No (`user_id` filter only) | Direct |
| `js/shared/data-store.js:730` | `reports` | `upsert` | Conditional: yes if `orgId = getStorageItem(STORAGE_KEYS.ORG_ID)` exists (`js/shared/data-store.js:726-728`) | Direct |
| `js/shared/console-capture.js:69` | `debug_logs` | `insert` | No | Direct |
| `js/shared/delete-report.js:169` | `reports` | `update` | No (status soft-delete only) | Direct |
| `js/shared/realtime-sync.js:109` | `report_data` | `select` | No | Direct |
| `js/auth.js:164` | `user_profiles` | `upsert` | No | Direct |
| `js/auth.js:192` | `user_profiles` | `select` | No | Direct |
| `js/auth.js:217` | `user_profiles` | `select` | No (`select('org_id')` read only) | Direct |
| `js/settings/main.js:218` | `user_profiles` | `upsert` | No | Direct |
| `js/settings/main.js:293` | `user_profiles` | `select` | No | Direct |
| `js/settings/main.js:367` | `user_profiles` | `select` | No | Direct |

## 2) Storage Operations Audit (`.storage.from(...)`)

| File:line | Bucket | Operation | URL/result stored? where | Signed URL expiry risk |
|---|---|---|---|---|
| `js/report/submit.js:109` | `report-pdfs` | `upload` | No URL from upload call | N/A |
| `js/report/submit.js:120` | `report-pdfs` | `createSignedUrl` | Yes: returned from `uploadPDFToStorage()` (`js/report/submit.js:125`), then stored in `reports.pdf_url` via `saveSubmittedReportData()` (`js/report/submit.js:169`) | Yes, 3600s |
| `js/report/form-fields.js:1008` | `report-photos` | `createSignedUrl` | Not persisted; assigned directly to `img.src` (`js/report/form-fields.js:1012`) on load error retry | Yes, 3600s, but re-signed on error path |
| `js/interview/persistence.js:1116` | `report-photos` | `upload` | No URL from upload call | N/A |
| `js/interview/persistence.js:1132` | `report-photos` | `createSignedUrl` | Yes: returned as `publicUrl` (`js/interview/persistence.js:1141`), then stored in photo objects/IDB (`js/interview/persistence.js:1167-1168`) and persisted to `photos.photo_url` (`js/interview/persistence.js:1178`) | Yes, 3600s |
| `js/interview/persistence.js:1226` | `report-photos` | `remove` | No | N/A |
| `js/media-utils.js:152` | `project-logos` | `upload` | No URL from upload call | N/A |
| `js/media-utils.js:165` | `project-logos` | `createSignedUrl` | Yes: returned from `uploadLogoToStorage()` (`js/media-utils.js:174`), then assigned to `currentProject.logoUrl` (`js/project-config/form.js:76-79`) and later persisted via projects save path | Yes, 3600s |
| `js/media-utils.js:200` | `project-logos` | `remove` | No | N/A |
| `js/shared/cloud-photos.js:41` | `report-photos` | `createSignedUrl` | In-memory returned photo object field `url` (`js/shared/cloud-photos.js:61`); may be cached into report data by callers (e.g., `js/index/cloud-recovery.js:167-173`) | Yes, 3600s |
| `js/shared/cloud-photos.js:113` | `report-photos` | `createSignedUrl` | In-memory batch map `photoMap[report_id].url` (`js/shared/cloud-photos.js:130-133`); caller may persist into cached report_data (`js/index/cloud-recovery.js:167-173`) | Yes, 3600s |
| `js/shared/delete-report.js:45` | `report-photos` | `remove` | No | N/A |
| `js/shared/delete-report.js:84` | `report-pdfs` | `remove` | No | N/A |

## 3) `org_id` Reliability

### Where `org_id` is set
- `js/login/main.js:71`: set from `profile.org_id` after login profile read.
- `js/login/main.js:271`: set from organization lookup result `org.id` during sign-up.
- `js/auth.js:223`: set in `ensureOrgIdCached()` from `user_profiles.org_id`.

### Where `org_id` is read (`localStorage.getItem(STORAGE_KEYS.ORG_ID)` exact calls)
- `js/report/autosave.js:176`
- `js/report/autosave.js:271`
- `js/report/submit.js:141`
- `js/supabase-utils.js:104`
- `js/shared/realtime-sync.js:53`
- `js/interview/photos.js:192`
- `js/interview/persistence.js:408`
- `js/interview/persistence.js:785`
- `js/interview/persistence.js:1065`
- `js/interview/persistence.js:1176`
- `js/interview/finish-processing.js:155`
- `js/interview/finish-processing.js:369`
- `js/auth.js:212`

### Fallback chains found in code
- Report save paths: `localStorage ORG_ID -> activeProject.orgId -> null`
  - `js/report/submit.js:141`
  - `js/report/autosave.js:271`
  - `js/interview/persistence.js:1065`
- Report/interview backup and AI submission writes: `localStorage ORG_ID -> null`
  - `js/report/autosave.js:176`
  - `js/interview/persistence.js:435`
  - `js/interview/persistence.js:793`
  - `js/interview/persistence.js:1176`
  - `js/interview/photos.js:192`
  - `js/interview/finish-processing.js:155`
  - `js/interview/finish-processing.js:369`
- Project conversion: `project.orgId -> project.org_id -> localStorage ORG_ID`
  - `js/supabase-utils.js:104`

### Operations that would be RLS-sensitive if `org_id` is null
These writes explicitly send `org_id: null` when cache/fallback is empty:
- `report_data` upserts: `js/report/autosave.js:184`, `js/interview/finish-processing.js:386`
- `reports` upserts: `js/report/submit.js:152`, `js/report/autosave.js:281`, `js/interview/persistence.js:1075`
- `interview_backup` upserts: `js/interview/persistence.js:431`, `js/interview/persistence.js:789`
- `photos` upserts: `js/interview/photos.js:189`, `js/interview/persistence.js:1189`
- `ai_submissions` upsert: `js/interview/finish-processing.js:165`
- `projects` upsert via converter when no org on object/cache: `js/project-config/crud.js:21` + `js/supabase-utils.js:104-107`

### Race condition: `auth.ready` vs cached `org_id`
- `auth.ready` resolves immediately after `requireAuth()` returns session (`js/auth.js:326-329`).
- `ensureOrgIdCached(session.user.id)` is called after resolve and is **not awaited** (`js/auth.js:335`).
- So code awaiting `window.auth.ready` can run before `STORAGE_KEYS.ORG_ID` is populated.
- Confirmed consumer: dashboard waits `window.auth.ready` (`js/index/main.js:281-284`) and then proceeds with cloud operations (`js/index/main.js:297-303`), while org cache may still be in-flight.

## 4) Breaking Change Analysis

### A) If storage buckets become private

#### Logo display
- Uses cached `logoUrl` directly as image source:
  - Project config preview: `js/project-config/form.js:29-31`
  - Report form header logo: `js/report/form-fields.js:23-26`
  - Report preview HTML: `js/report/preview.js:159-162`
  - PDF generation image preload: `js/report/pdf-generator.js:85-89`, `js/report/pdf-generator.js:763`
- `logoUrl` is currently a signed URL with 1h expiry (`js/media-utils.js:165-167`) and stored into project state (`js/project-config/form.js:76-79`), with no logo re-sign-on-demand path found.
- Breakage path: stale logo URLs after expiry.

#### PDF links
- Submit stores signed URL (1h) into `reports.pdf_url`: `js/report/submit.js:120-125`, `js/report/submit.js:167-172`.
- Archives opens stored URL directly: `js/archives/main.js:146`, `js/archives/main.js:251`.
- No re-sign logic before opening PDF in archives.
- Breakage path: submitted report PDFs become inaccessible after signed URL expiry.

#### Photo display
- Re-sign on demand exists in some paths:
  - Report page error handler re-signs from `storagePath` once: `js/report/form-fields.js:985-1013`.
  - Cloud photo fetch always re-signs from `storage_path`: `js/shared/cloud-photos.js:35-43`, `js/shared/cloud-photos.js:108-116`.
  - Interview load rehydrates/refreshed photo URLs from cloud: `js/interview/persistence.js:910-916`, `js/interview/persistence.js:943-960`.
- Cached URL usage without re-sign in renderers:
  - Guided photos use `img src="${p.url}"`: `js/interview/guided-sections.js:326`
  - Freeform photos use `img src="${p.url}"`: `js/interview/freeform.js:346`
- Breakage path: if `p.url` is stale and page does not refresh/rehydrate, image shows fallback error SVG.

### B) If `debug_logs` policy changes to authenticated-only

#### All `debug_logs` inserts
- Single insert site: `js/shared/console-capture.js:69-70`.

#### Does it fire before auth is established?
- Yes, possible.
- `console-capture.js` starts timer immediately (`js/shared/console-capture.js:107`) and flushes on timer/pagehide/visibility (`js/shared/console-capture.js:107,110-113`) without awaiting `auth.ready`.
- Script load order places `console-capture.js` before `auth.js` on pages:
  - `index.html:23` before `index.html:37`
  - `report.html:24` before `report.html:35`
  - `quick-interview.html:24` before `quick-interview.html:37`
  - `archives.html:84` before `archives.html:92`

#### Pages writing `debug_logs`
- `index.html`
- `report.html`
- `quick-interview.html`
- `archives.html`
(verified by script includes above)

### C) If n8n webhooks move behind Supabase Edge Functions

#### Webhook 1: refine report (`fieldvoice-v69-refine-report`)
- Endpoints referenced:
  - `js/interview/finish-processing.js:9`
  - `js/report/ai-refine.js:9`
- Request payload shape (primary path): `buildProcessPayload()` in `js/interview/finish-processing.js:14-77`:
  - `reportId`, `captureMode`
  - `projectContext` object (project metadata, contractors with crews, equipment)
  - `fieldNotes` object (minimal or guided variant)
  - `weather`
  - `photos[]` with `{ id, url, storagePath, caption, timestamp, date, time, gps }`
  - `reportDate`, `inspectorName`
  - `operations`, `equipmentRows`, `activities`, `safety`, `entries`, `toggleStates`
- Alternate request shape: retry path sends stored `queued.payload` as-is (`js/report/ai-refine.js:55`).
- Expected response shape in finish flow:
  - Must satisfy `data.success || data.aiGenerated` (`js/interview/finish-processing.js:107-110`)
  - `aiGenerated` may be object or JSON string (`js/interview/finish-processing.js:113-118`)
- Expected response shape in report retry flow:
  - Uses `result.refinedReport` OR `result.aiGenerated` (`js/report/ai-refine.js:67-73`)
  - Optional `result.originalInput`, `result.captureMode` (`js/report/ai-refine.js:69-70`)

#### Webhook 2: refine text (`fieldvoice-v69-refine-text`)
- Endpoint: `js/report/ai-refine.js:10`
- Request payload shape (`js/report/ai-refine.js:113-121` and `js/report/ai-refine.js:204-213`):
  - `originalText`
  - `section`
  - `reportContext` with `projectName`, `reporterName`, `date`, optional `contractorName`
- Expected response shape:
  - `result.refinedText` required (`js/report/ai-refine.js:145-149`, `js/report/ai-refine.js:237-241`)

#### Webhook 3: project document extractor (`fieldvoice-v69-project-extractor`)
- Endpoint: `js/project-config/document-import.js:5`
- Request payload shape:
  - `multipart/form-data`
  - repeated file field name `documents` (`js/project-config/document-import.js:134-137`)
- Expected response shape:
  - success path: `result.success && result.data` (`js/project-config/document-import.js:146`)
  - optional `result.extractionNotes[]` (`js/project-config/document-import.js:154`)
  - failure path uses `result.error` (`js/project-config/document-import.js:165`)
- FormData complication for Edge Functions:
  - Must support multipart parsing and repeated `documents` file parts (not JSON body).

#### Webhook 4: AI assistant chat (`fieldvoice-v69-ai-chat`)
- Endpoint: `js/shared/ai-assistant.js:10`
- Request payload shape (`js/shared/ai-assistant.js:719-731`):
  - `message`
  - `history[]` with `{ role, content }` (last 10 messages)
  - `context` with `currentPage`, `projectName`, `projectId`, `reportDate`, `deviceId`, `lat`, `lng`
- Expected response shape:
  - one of `data.response`, `data.message`, or `data.text` (`js/shared/ai-assistant.js:750`)

## 5) Missed Risks

### Supabase calls without explicit auth headers/gating
- All DB calls use `supabaseClient` (SDK-managed auth token), no manual `Authorization` header handling found.
- Multiple modules do not await `auth.ready` before querying/writing; they can execute with anon context if session not yet available.
  - Example timing risk: `console-capture` flush before auth (`js/shared/console-capture.js:107`), while auth initializes later (`js/auth.js:326-335`).

### Hardcoded URLs/secrets beyond n8n URLs
- Hardcoded Supabase anon credentials in client code:
  - `js/config.js:4` (`SUPABASE_URL`)
  - `js/config.js:5` (`SUPABASE_ANON_KEY`)
- Hardcoded webhook API key in client code:
  - `js/config.js:8` (`N8N_WEBHOOK_API_KEY`)
- Hardcoded n8n webhook endpoints in client code:
  - `js/interview/finish-processing.js:9`
  - `js/report/ai-refine.js:9-10`
  - `js/project-config/document-import.js:5`
  - `js/shared/ai-assistant.js:10`

### `service_role` key usage in client code
- No `service_role` key usage found in scanned JS (`rg` search for `service_role` returned none).

### API endpoints that bypass auth
- n8n webhook calls are direct `fetch(...)` from browser, not proxied through Supabase auth layer:
  - `js/interview/finish-processing.js:88`
  - `js/report/ai-refine.js:49`, `js/report/ai-refine.js:128`, `js/report/ai-refine.js:220`
  - `js/project-config/document-import.js:139`
  - `js/shared/ai-assistant.js:737`
- External third-party fetch endpoints also bypass app auth (weather/maps/etc), though not Supabase data paths:
  - e.g. `js/index/weather.js:42`, `js/interview/ui-display.js:19`, `js/tools/maps.js:398`

