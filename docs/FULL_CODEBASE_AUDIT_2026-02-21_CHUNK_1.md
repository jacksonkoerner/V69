# FULL CODEBASE AUDIT — 2026-02-21 — CHUNK 1: Core Infrastructure

Scope:
- `js/config.js`
- `js/auth.js`
- `js/storage-keys.js`
- `js/supabase-utils.js`
- `js/data-layer.js`
- `js/indexeddb-utils.js`

## `js/config.js`

### 1) PURPOSE
This file centralizes Supabase connection constants and initializes a global Supabase client. It acts as the bootstrap dependency for any module that needs `supabaseClient` access.

### 2) LOCALSTORAGE
- None.

### 3) INDEXEDDB
- None.

### 4) SUPABASE
- `SUPABASE_URL` constant for project endpoint (`js/config.js:4`)
- `SUPABASE_ANON_KEY` constant (`js/config.js:5`)
- `supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` (`js/config.js:8`)

### 5) N8N/WEBHOOKS
- No n8n/webhook URL references.
- API key present:
  - Supabase anon key literal in source (`js/config.js:5`)

### 6) ISSUES
- `WARNING`: Hardcoded backend credentials in a committed JS file (`js/config.js:4-5`). Supabase anon keys are intended for client use, but hardcoding still complicates rotation and environment separation.
- `INFO`: No environment-switch pattern (dev/stage/prod) visible in this file.

### 7) DEPENDENCIES
Depends on:
- Global `supabase` object from `@supabase/supabase-js` being loaded before this script (`js/config.js:7-8`).

Depended on by:
- Direct script inclusion across app pages (for example `index.html:22`, `projects.html:22`, `report.html:23`, `settings.html:22`, `quick-interview.html:23`, `archives.html:83`, `project-config.html:24`, `login.html:22`).
- Any module using global `supabaseClient` (for example `js/auth.js`, `js/data-layer.js`, `js/login/main.js`, `js/shared/realtime-sync.js`).

---

## `js/auth.js`

### 1) PURPOSE
This file enforces protected-page authentication, exposes shared auth helpers, and orchestrates auth lifecycle behaviors (session checks, auth state listening, periodic health checks). It also handles logout cleanup across localStorage and IndexedDB-backed stores and caches org context on session restore.

### 2) LOCALSTORAGE
Reads:
- `STORAGE_KEYS.AUTH_ROLE` (`js/auth.js:70`)
- `STORAGE_KEYS.ORG_ID` (`js/auth.js:212`)
- Prefix scan for `STORAGE_KEYS.AI_CONVERSATION` keys (`js/auth.js:119`)

Writes:
- `STORAGE_KEYS.AUTH_ROLE` (`js/auth.js:78`)
- `STORAGE_KEYS.USER_ID` (`js/auth.js:176`)
- `STORAGE_KEYS.USER_NAME` (`js/auth.js:177`)
- `STORAGE_KEYS.USER_EMAIL` (`js/auth.js:178`)
- `STORAGE_KEYS.AUTH_USER_ID` (`js/auth.js:179`)
- `STORAGE_KEYS.ORG_ID` (`js/auth.js:223`)

Removes (via `keysToRemove` + loop):
- `STORAGE_KEYS.AUTH_ROLE` (`js/auth.js:100`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.ORG_ID` (`js/auth.js:101`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.USER_ID` (`js/auth.js:102`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.USER_NAME` (`js/auth.js:103`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.USER_EMAIL` (`js/auth.js:104`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.AUTH_USER_ID` (`js/auth.js:105`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.ACTIVE_REPORT_ID` (`js/auth.js:106`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.ONBOARDED` (`js/auth.js:107`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.PERMISSIONS_DISMISSED` (`js/auth.js:108`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.BANNER_DISMISSED` (`js/auth.js:109`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.BANNER_DISMISSED_DATE` (`js/auth.js:110`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.PROJECTS` (`js/auth.js:111`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.PROJECTS_CACHE_TS` (`js/auth.js:112`, removed at `js/auth.js:115`)
- `STORAGE_KEYS.ACTIVE_PROJECT_ID` (`js/auth.js:113`, removed at `js/auth.js:115`)
- All keys matching `STORAGE_KEYS.AI_CONVERSATION*` (`js/auth.js:118-120`)

### 3) INDEXEDDB
Uses `window.dataStore.clearStore(...)` on sign-out:
- `currentReports` (`js/auth.js:126`)
- `draftData` (`js/auth.js:127`)
- `reportData` (`js/auth.js:128`)
- `userProfile` (`js/auth.js:129`)
- `projects` (`js/auth.js:130`)

### 4) SUPABASE
Auth calls:
- `supabaseClient.auth.getSession()` (`js/auth.js:24`, `js/auth.js:295`)
- `supabaseClient.auth.getUser()` (`js/auth.js:47`)
- `supabaseClient.auth.signOut()` (`js/auth.js:92`)
- `supabaseClient.auth.onAuthStateChange(...)` (`js/auth.js:261`)

Table calls:
- `user_profiles` upsert/select/single (`js/auth.js:163-167`)
- `user_profiles` select by `auth_user_id` (`js/auth.js:191-195`)
- `user_profiles` select `org_id` by `auth_user_id` (`js/auth.js:216-220`)

### 5) N8N/WEBHOOKS
- No n8n/webhook URLs.
- No API keys declared directly in this file.

### 6) ISSUES
- `WARNING`: Potential duplicate-signout pattern: auth state listener handles `SIGNED_OUT` by calling `signOut()`, and `signOut()` itself calls `supabaseClient.auth.signOut()` (`js/auth.js:92`, `js/auth.js:269-272`). This can trigger redundant sign-out flows.
- `WARNING`: Sign-out IDB cleanup depends on `window.dataStore` only (`js/auth.js:123-131`), not `window.idb`; if `dataStore` is unavailable or not loaded yet, cleanup is skipped.
- `INFO`: Global side effects (auto auth gate on DOMContentLoaded, redirects) make this module hard to unit test in isolation.

### 7) DEPENDENCIES
Depends on:
- `supabaseClient` from `js/config.js` (`js/auth.js:24`, `js/auth.js:47`, `js/auth.js:92`).
- `STORAGE_KEYS` and `getDeviceId` from `js/storage-keys.js` (`js/auth.js:70`, `js/auth.js:158`).
- Optional globals `showToast`, `window.dataStore` (`js/auth.js:245`, `js/auth.js:123`).

Depended on by:
- Script includes on protected pages (`index.html:37`, `projects.html:29`, `report.html:35`, `settings.html:29`, `quick-interview.html:37`, `archives.html:92`, `project-config.html:28`).
- `settings.html` sign-out button calls `window.auth.signOut()` (`settings.html:183`).
- `js/settings/main.js` uses `window.auth.ready` and `window.auth.getCurrentUser()` (`js/settings/main.js:559`, `js/settings/main.js:568-569`).
- `js/index/main.js` coordinates with `auth.ready` (`js/index/main.js:282-283`).

---

## `js/storage-keys.js`

### 1) PURPOSE
This file defines canonical storage key constants and shared localStorage helper functions. It also exposes convenience functions for deleted-report blocklisting, device ID generation, and per-user AI conversation key construction.

### 2) LOCALSTORAGE
Specific keys read/written directly:
- `STORAGE_KEYS.DELETED_REPORT_IDS`
  - Read (`js/storage-keys.js:58`, `js/storage-keys.js:68`, `js/storage-keys.js:74`)
  - Write (`js/storage-keys.js:62`, `js/storage-keys.js:76`)
- `STORAGE_KEYS.DEVICE_ID`
  - Read (`js/storage-keys.js:86`)
  - Write (`js/storage-keys.js:89`)

Generic/localStorage-wide helpers:
- Reads arbitrary key via `getStorageItem(key)` (`js/storage-keys.js:94-101`)
- Writes arbitrary key via `setStorageItem(key, value)` (`js/storage-keys.js:104-107`)
- Removes arbitrary key via `removeStorageItem(key)` (`js/storage-keys.js:114-115`)

Declared key namespace (constants) in this file:
- `PROJECTS`, `ACTIVE_PROJECT_ID`, `ACTIVE_REPORT_ID`, `DEVICE_ID`, `USER_ID`, `AUTH_ROLE`, `USER_NAME`, `USER_EMAIL`, `AUTH_USER_ID`, `MIC_GRANTED`, `MIC_TIMESTAMP`, `CAM_GRANTED`, `LOC_GRANTED`, `LOC_LAT`, `LOC_LNG`, `LOC_TIMESTAMP`, `SPEECH_GRANTED`, `ONBOARDED`, `BANNER_DISMISSED`, `BANNER_DISMISSED_DATE`, `DICTATION_HINT_DISMISSED`, `PERMISSIONS_DISMISSED`, `ORG_ID`, `DELETED_REPORT_IDS`, `PROJECTS_CACHE_TS`, `SETTINGS_SCRATCH`, `AI_CONVERSATION`, `SUBMITTED_BANNER_DISMISSED`, `MIGRATION_V113_IDB_CLEAR`, `MARKUP_PHOTO` (`js/storage-keys.js:23-54`).

### 3) INDEXEDDB
- No direct IndexedDB operations.
- Dynamically attempts to load shared IDB abstraction script:
  - `./js/shared/data-store.js` (`js/storage-keys.js:20`).

### 4) SUPABASE
- None.

### 5) N8N/WEBHOOKS
- None.

### 6) ISSUES
- `WARNING`: Dynamic script injection (`ensureSharedScript`) does not await load completion (`js/storage-keys.js:9-16`), which can create race conditions for globals like `window.dataStore`.
- `INFO`: Mixed serialization contract: `setStorageItem` always JSON-stringifies (`js/storage-keys.js:106`) while other modules also use raw `localStorage.setItem(...)`, increasing cross-module inconsistency risk.
- `INFO`: This file injects both `broadcast.js` and `data-store.js` as side effects (`js/storage-keys.js:19-20`), coupling storage key definitions to runtime bootstrapping.

### 7) DEPENDENCIES
Depends on:
- Browser globals: `window`, `document`, `localStorage`, `crypto.randomUUID`.
- Optional script paths `./js/shared/broadcast.js` and `./js/shared/data-store.js` (`js/storage-keys.js:19-20`).

Depended on by:
- Included on nearly all app pages (for example `index.html:26`, `projects.html:25`, `report.html:28`, `settings.html:23`, `quick-interview.html:28`, `archives.html:85`, `project-config.html:25`, `login.html:23`).
- Consumed broadly by modules using `STORAGE_KEYS`/helpers (for example `js/data-layer.js`, `js/auth.js`, `js/settings/main.js`, `js/shared/realtime-sync.js`, `js/report-rules.js`, `js/index/*.js`).

---

## `js/supabase-utils.js`

### 1) PURPOSE
This file provides schema conversion helpers between Supabase row shape (snake_case) and frontend model shape (camelCase). It centralizes transformations for project and user profile payloads and exports them globally for non-module scripts.

### 2) LOCALSTORAGE
Reads:
- `STORAGE_KEYS.ORG_ID` fallback during project conversion (`js/supabase-utils.js:106`)

Writes:
- None.

### 3) INDEXEDDB
- None.

### 4) SUPABASE
Runtime calls:
- None (no direct `.from(...)`/`.auth...` invocation).

Schema/table references encoded in converters:
- Project schema fields aligning to `projects` table (`js/supabase-utils.js:17-22`, mapping logic `js/supabase-utils.js:31-65`, `js/supabase-utils.js:76-109`).
- User profile payload fields aligning to `user_profiles` writes (`js/supabase-utils.js:121-131`).

### 5) N8N/WEBHOOKS
- None.

### 6) ISSUES
- `WARNING`: `toSupabaseProject` serializes `contractors` with `JSON.stringify(...)` (`js/supabase-utils.js:97`) while comments describe JSONB; this can lead to mixed stored types if other writers send native JSON.
- `INFO`: Converter has hidden environment dependency (`localStorage` + `STORAGE_KEYS`) (`js/supabase-utils.js:106`), reducing purity/reusability.
- `INFO`: Comment mentions migration for logo columns (`js/supabase-utils.js:23-24`) but there is no runtime capability check.

### 7) DEPENDENCIES
Depends on:
- Global `STORAGE_KEYS` and `localStorage` (`js/supabase-utils.js:106`).
- Browser `window` for global exports (`js/supabase-utils.js:146-148`).

Depended on by:
- Included on pages that need conversions (`index.html:31`, `projects.html:27`, `report.html:33`, `settings.html:24`, `quick-interview.html:34`, `project-config.html:26`).
- `js/data-layer.js` uses `fromSupabaseProject` (`js/data-layer.js:119`, `js/data-layer.js:362`).
- `js/project-config/crud.js` uses `toSupabaseProject` (`js/project-config/crud.js:12`).
- `js/settings/main.js` uses `toSupabaseUserProfile` (`js/settings/main.js:212`).

---

## `js/data-layer.js`

### 1) PURPOSE
This file is the centralized data-access facade for projects and user settings. It implements an IndexedDB-first strategy with explicit Supabase refresh paths and caches project pointers in localStorage for legacy consumers.

### 2) LOCALSTORAGE
(Indirect via storage helper wrappers in this file)

Reads:
- `STORAGE_KEYS.ORG_ID` (`js/data-layer.js:55`, `js/data-layer.js:104`)
- `STORAGE_KEYS.PROJECTS_CACHE_TS` (`js/data-layer.js:75`)
- `STORAGE_KEYS.DEVICE_ID` (`js/data-layer.js:214`)

Writes:
- `STORAGE_KEYS.PROJECTS` (`js/data-layer.js:72`, `js/data-layer.js:144`)
- `STORAGE_KEYS.PROJECTS_CACHE_TS` (`js/data-layer.js:76`, `js/data-layer.js:147`)

### 3) INDEXEDDB
Uses `window.idb`:
- `getAllProjects()` from `projects` store (`js/data-layer.js:57`)
- `clearStore('projects')` (`js/data-layer.js:127`)
- `saveProject(project)` into `projects` store (`js/data-layer.js:135`, `js/data-layer.js:365`)
- `getUserProfile(cacheKey)` from `userProfile` store (`js/data-layer.js:217`)
- `saveUserProfile(settings)` into `userProfile` store (`js/data-layer.js:258`, `js/data-layer.js:285`)
- `getProject(projectId)` from `projects` store (`js/data-layer.js:329`)

### 4) SUPABASE
Storage bucket:
- `project-logos` with `createSignedUrl(path, 3600)` (`js/data-layer.js:33-34`)

Auth:
- `supabaseClient.auth.getSession()` (`js/data-layer.js:207`)

Tables:
- `projects` select/order/filter (`js/data-layer.js:106-112`, query execute `js/data-layer.js:114`)
- `projects` select by `id` (`js/data-layer.js:352-355`)
- `user_profiles` select by `auth_user_id` (`js/data-layer.js:240-243`)

### 5) N8N/WEBHOOKS
- None.

### 6) ISSUES
- `CRITICAL`: `loadUserSettings()` attempts IDB lookup by `authUserId` first (`js/data-layer.js:214`), but `userProfile` store keyPath is `deviceId` (defined in `js/indexeddb-utils.js:103`) and save path writes by `deviceId` (`js/data-layer.js:258`, `js/data-layer.js:285`). This key-model mismatch causes cache misses and inconsistent offline behavior.
- `WARNING`: Local cache is duplicated across IndexedDB (`projects` store) and localStorage (`STORAGE_KEYS.PROJECTS`) (`js/data-layer.js:57`, `js/data-layer.js:72`, `js/data-layer.js:135`, `js/data-layer.js:144`), increasing consistency risk.
- `INFO`: `normalizeProject()` duplicates conversion concerns already handled in `fromSupabaseProject`, creating two parallel shape-normalization paths (`js/data-layer.js:165-193` vs `js/supabase-utils.js:28-66`).

### 7) DEPENDENCIES
Depends on:
- `supabaseClient` from `js/config.js` (`js/data-layer.js:32`, `js/data-layer.js:105`, `js/data-layer.js:207`, `js/data-layer.js:239`, `js/data-layer.js:351`).
- `window.idb` from `js/indexeddb-utils.js` (`js/data-layer.js:57`, `js/data-layer.js:217`, etc.).
- `fromSupabaseProject` from `js/supabase-utils.js` (`js/data-layer.js:119`, `js/data-layer.js:362`).
- Storage helpers/constants from `js/storage-keys.js` (`js/data-layer.js:55`, `js/data-layer.js:72`).

Depended on by:
- `window.dataLayer` consumers: `js/projects/main.js`, `js/index/main.js`, `js/index/report-creation.js`, `js/report/main.js`, `js/interview/main.js`, `js/settings/main.js`, `js/report-rules.js`, `js/shared/realtime-sync.js`.

---

## `js/indexeddb-utils.js`

### 1) PURPOSE
This file manages IndexedDB schema creation, connection lifecycle, and CRUD helpers for all local-first stores. It exports a `window.idb` API and includes a compatibility shim that forwards several operations to `window.dataStore` when available.

### 2) LOCALSTORAGE
- None.

### 3) INDEXEDDB
Database:
- DB name/version: `fieldvoice-pro`, `DB_VERSION = 7` (`js/indexeddb-utils.js:9-10`)
- `indexedDB.open(DB_NAME, DB_VERSION)` (`js/indexeddb-utils.js:54`)

Stores and operations:
- `projects`
  - create store (`js/indexeddb-utils.js:96-99`)
  - put/get/getAll/delete (`js/indexeddb-utils.js:172-174`, `js/indexeddb-utils.js:198`, `js/indexeddb-utils.js:221`, `js/indexeddb-utils.js:245`)
- `userProfile`
  - create store keyPath `deviceId` (`js/indexeddb-utils.js:102-104`)
  - put/get (`js/indexeddb-utils.js:271-273`, `js/indexeddb-utils.js:297`)
- `photos`
  - create store + indexes `reportId`, `syncStatus` (`js/indexeddb-utils.js:109-112`)
  - put/get/getAll by index/delete/delete-by-report cursor (`js/indexeddb-utils.js:323-325`, `js/indexeddb-utils.js:349`, `js/indexeddb-utils.js:373-374`, `js/indexeddb-utils.js:398-399`, `js/indexeddb-utils.js:423`, `js/indexeddb-utils.js:448-454`)
- `currentReports`
  - create store + indexes `project_id`, `status` (`js/indexeddb-utils.js:123-126`)
  - getAll/put/delete/replace-all (`js/indexeddb-utils.js:485`, `js/indexeddb-utils.js:516`, `js/indexeddb-utils.js:541`, `js/indexeddb-utils.js:566`, `js/indexeddb-utils.js:569`)
- `draftData`
  - create store (`js/indexeddb-utils.js:130-132`)
  - put/get/delete (`js/indexeddb-utils.js:599-600`, `js/indexeddb-utils.js:625`, `js/indexeddb-utils.js:652`)
- `cachedArchives`
  - create store (`js/indexeddb-utils.js:136-138`)
  - put/get (`js/indexeddb-utils.js:682`, `js/indexeddb-utils.js:707`)
- `reportData`
  - create store (`js/indexeddb-utils.js:142-144`)
  - put/get/delete (`js/indexeddb-utils.js:742`, `js/indexeddb-utils.js:767`, `js/indexeddb-utils.js:794`)
- Removed legacy store:
  - `archives` deleted during upgrade if present (`js/indexeddb-utils.js:116-118`)

General ops:
- `clearStore(storeName)` (`js/indexeddb-utils.js:814-826`)
- connection reset/close (`js/indexeddb-utils.js:846-865`)
- Compatibility shim forwarding to `window.dataStore` (`js/indexeddb-utils.js:917-936`)

### 4) SUPABASE
- None direct.

### 5) N8N/WEBHOOKS
- None.

### 6) ISSUES
- `WARNING`: Compatibility shim overrides only a subset of `window.idb` methods (`js/indexeddb-utils.js:917-936`), creating mixed backends (native IDB for some calls, `dataStore` for others).
- `WARNING`: Multiple storage abstractions (`window.idb` and `window.dataStore`) are active in the codebase, increasing drift risk between implementations.
- `INFO`: Style and async pattern inconsistency (mix of arrow and function syntax, request callbacks vs transaction events) across the same module.
- `INFO`: No TODO/FIXME markers, but comments reference historical migration states; these should be periodically pruned.

### 7) DEPENDENCIES
Depends on:
- Browser IndexedDB APIs (`indexedDB`, transactions, stores/indexes).
- Optional `window.dataStore` for compatibility overrides (`js/indexeddb-utils.js:918`).

Depended on by:
- Script includes on core pages (`index.html:35`, `projects.html:26`, `report.html:32`, `settings.html:27`, `quick-interview.html:32`, `archives.html:91`, `project-config.html:537`).
- `js/data-layer.js` via `window.idb.*`.
- Additional consumers including `js/project-config/crud.js`, `js/interview/photos.js`, `js/interview/persistence.js`, `js/archives/main.js`, `js/projects/main.js`.

---

## CHUNK SUMMARY

### Key Findings
- Core infra is built around global-script coupling (`supabaseClient`, `window.auth`, `window.idb`, `window.dataLayer`, `STORAGE_KEYS`) and works via script load order rather than explicit module boundaries.
- Data persistence is intentionally hybrid (Supabase + IndexedDB + localStorage), but multiple abstraction layers overlap (`window.idb`, `window.dataStore`, storage helpers), which creates consistency and maintenance risk.
- Security-sensitive cleanup paths exist (sign-out localStorage + IDB clear), but backend/key/config and auth event handling patterns need tightening.

### Issues Ranked by Severity
CRITICAL:
- `js/data-layer.js` user settings cache key mismatch (`authUserId` lookup vs `userProfile.deviceId` keyPath) causing cache misses/offline inconsistency (`js/data-layer.js:214`, `js/indexeddb-utils.js:103`, `js/data-layer.js:258`).

WARNING:
- Hardcoded Supabase endpoint + anon key in client source (`js/config.js:4-5`) without visible env strategy.
- Possible redundant sign-out cycle from auth listener calling `signOut()` on `SIGNED_OUT` while `signOut()` also triggers auth sign-out (`js/auth.js:92`, `js/auth.js:269-272`).
- Mixed persistence backends (`window.idb` plus selective `window.dataStore` overrides) increase divergence risk (`js/indexeddb-utils.js:917-936`).
- Dynamic shared-script injection without readiness guarantees in `storage-keys.js` may race consumers (`js/storage-keys.js:9-16`).

INFO:
- Duplicate/overlapping project normalization paths (`js/supabase-utils.js` vs `js/data-layer.js:165-193`).
- Mixed localStorage serialization conventions (raw vs JSON stringified) across modules.
- No n8n/webhook references in audited chunk.

### Cross-File Concerns
- Duplicate logic:
  - Project conversion/normalization lives in both `js/supabase-utils.js` and `js/data-layer.js`.
  - IndexedDB operations duplicated between `js/indexeddb-utils.js` and `js/shared/data-store.js` (with runtime shim).
- Inconsistent keying model:
  - `userProfile` IDB store keyPath is `deviceId` (`js/indexeddb-utils.js:103`) while data-layer read path first tries `authUserId` (`js/data-layer.js:214`).
- Inconsistent data access patterns:
  - Some modules use direct `localStorage`, others use `getStorageItem`/`setStorageItem` helpers; conventions are not uniformly enforced.
