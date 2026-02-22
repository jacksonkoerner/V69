# Service Worker Routing Audit — Part 2 (Follow-Up)

**Date:** 2026-02-22
**Auditor:** Codex 5.3
**Status:** Audit only — no code changes made

---

## Part A: Exact failure path in `handleStaticRequest`

### Structure of handleStaticRequest (sw.js:230-269)
The function has ONE try/catch wrapping both the fetch and cache write:

```
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);  // sw.js:231
    if (cachedResponse) {                                  // sw.js:233
        updateCacheInBackground(request);                  // sw.js:235
        return cachedResponse;                             // sw.js:236
    }
    try {
        const networkResponse = await fetch(request);      // sw.js:241
        if (networkResponse.ok) {                          // sw.js:244
            const cache = await caches.open(CACHE_NAME);   // sw.js:245
            cache.put(request, networkResponse.clone());   // sw.js:246  <-- NO await
        }
        return networkResponse;                            // sw.js:248
    } catch (error) {
        // ... fallback 503 logic                          // sw.js:250-269
    }
}
```

### Critical finding: `cache.put` is NOT awaited

At `sw.js:246`, `cache.put(request, networkResponse.clone())` is called **without `await`**. This means:

1. `cache.put` returns a Promise that rejects asynchronously (Cache API rejects POST requests)
2. The rejection is **unhandled** — it does NOT enter the catch block at sw.js:250
3. Execution continues to `return networkResponse` at sw.js:248 **immediately**
4. The actual network response IS returned to the caller

**This means the 503 false-failure scenario from Audit Part 1 does NOT actually occur.**

The `cache.put` failure for POSTs is a silent unhandled promise rejection — it logs a console warning but does NOT prevent the real response from reaching the frontend.

### For POSTs: What actually happens
1. `caches.match(request)` at sw.js:231 → returns `undefined` (Cache API doesn't match POST)
2. Falls through to try block
3. `fetch(request)` at sw.js:241 → succeeds, gets real response from Edge Function
4. `cache.put(request, networkResponse.clone())` at sw.js:246 → fires async, rejects silently
5. `return networkResponse` at sw.js:248 → returns the real response ✅

### Verdict on Part A
**The misroute is real but currently non-breaking for POSTs.** The lack of `await` on `cache.put` accidentally saves us — the real response gets through. However:
- There's a silent unhandled promise rejection in the console for every Edge Function call
- The code is fragile — if someone adds `await` to cache.put, it would break immediately
- GET requests to Supabase (REST/Auth) ARE potentially affected differently (see Part C)

---

## Part B: Frontend error handling per caller

### 1) `js/report/ai-refine.js` — refineTextField() and refineContractorNarrative()

**refineTextField()** (sw.js:42-130):
- POST fetch at `js/report/ai-refine.js:85-93`
- Checks `response.ok` at `js/report/ai-refine.js:94` — throws on non-ok
- Has try/catch; catch shows toast: "Refinement failed" (`js/report/ai-refine.js:122-127`)
- Button text restored on failure

**refineContractorNarrative()** (sw.js:139-225):
- POST fetch at `js/report/ai-refine.js:183-191`
- Checks `response.ok` at `js/report/ai-refine.js:192` — throws on non-ok
- Has try/catch; catch shows toast: "Refinement failed" (`js/report/ai-refine.js:218-222`)

### 2) `js/shared/ai-assistant.js` — callAIWebhook()

- POST fetch at `js/shared/ai-assistant.js:743-751`
- Checks `res.ok` at `js/shared/ai-assistant.js:753` — throws on non-ok
- Caller `handleSend()` at `js/shared/ai-assistant.js:323` catches and shows error bubble in chat UI
- User sees: "Sorry, I couldn't process that. Please try again."

### 3) `js/interview/finish-processing.js` — callProcessWebhook()

- POST fetch at `js/interview/finish-processing.js:94-102`
- Checks `response.ok` at `js/interview/finish-processing.js:103` — throws on non-ok
- Has try/catch; catch throws to caller
- Caller `finishReportFlow()` catches and shows:
  - Processing overlay error text (`js/interview/finish-processing.js:451`)
  - Network modal with Retry / Save-to-drafts options (`js/interview/finish-processing.js:460-471`)

### 4) `js/project-config/document-import.js` — extractProjectData()

- POST fetch at `js/project-config/document-import.js:149-156`
- **Does NOT check `response.ok` before `response.json()`** (`js/project-config/document-import.js:160`)
- Uses `result.success` to branch UI (`js/project-config/document-import.js:162`, `179-184`)
- Has try/catch; catch shows generic network banner (`js/project-config/document-import.js:185-188`)

---

## Part C: Blast radius of routing Supabase traffic to `handleApiRequest`

### Direct fetch() calls to Supabase (Edge Functions)
All are POST, all currently misrouted:
- `js/report/ai-refine.js:85`, `js/report/ai-refine.js:183`
- `js/shared/ai-assistant.js:743`
- `js/interview/finish-processing.js:94`
- `js/project-config/document-import.js:149`

### Supabase SDK traffic (Auth/REST/Storage) — Full Inventory

**Auth calls (GET-like internally):**
- `js/auth.js:24` (getSession), `js/auth.js:47` (getUser), `js/auth.js:92` (signOut)
- `js/auth.js:261` (onAuthStateChange)
- `js/login/main.js:38` (signInWithPassword), `js/login/main.js:194` (signUp), `js/login/main.js:302` (getUser), `js/login/main.js:346` (getSession)
- `js/data-layer.js:207`, `js/report/ai-refine.js:76,174`, `js/interview/finish-processing.js:84`
- `js/shared/ai-assistant.js:733`, `js/project-config/document-import.js:140`
- `js/settings/main.js:166,278,360`

**REST table calls (mix of GET selects and POST upserts/updates/deletes):**
- `js/auth.js:165,193,218` (user_profiles select/upsert)
- `js/login/main.js:55,86,94,175,238,257,306` (user_profiles, organizations)
- `js/data-layer.js:107,241,353` (projects select)
- `js/archives/main.js:66,108` (reports select)
- `js/project-config/crud.js:22,223` (projects upsert/delete)
- `js/index/cloud-recovery.js:32,113,220` (reports, report_data, interview_backup select)
- `js/index/sync.js:37,158,175` (reports select/update/upsert)
- `js/index/report-cards.js:624` (reports update)
- `js/index/report-creation.js:38` (reports upsert)
- `js/shared/data-store.js:612,731` (reports select/upsert)
- `js/shared/delete-report.js:33,45,66,93,101,108,115,179` (cascade deletes)
- `js/shared/console-capture.js:70` (debug_logs insert)
- `js/report/autosave.js:185,282` (report_data/reports upsert)
- `js/report/data-loading.js:86,137` (reports/report_data select)
- `js/report/submit.js:40,154,181,194` (reports/report_data upsert/update)
- `js/interview/persistence.js:431,789,851,1075,1114,1132,1189,1232` (reports/interview_backup/photos upsert/select)
- `js/interview/photos.js:189` (photos upsert)

**Storage calls (POST uploads, POST signed-url creation, DELETE removes):**
- `js/shared/cloud-photos.js:42,99,145` (createSignedUrl for photos)
- `js/shared/delete-report.js:45,93` (storage remove)
- `js/media-utils.js:153,166,199` (upload, createSignedUrl, remove for logos)
- `js/report/submit.js:111,122` (upload, createSignedUrl for PDFs)
- `js/data-layer.js:34` (createSignedUrl for logos)
- `js/report/form-fields.js:1009` (createSignedUrl for photos)
- `js/archives/main.js:264` (createSignedUrl for PDFs)
- `js/interview/persistence.js:1132` (createSignedUrl for photos)

### Regression assessment

**Writes (POST/PATCH/DELETE/upload/signed-url creation):** LOW RISK — improved correctness. No invalid cache writes attempted.

**Reads (GET selects/auth lookups):** Behavior change is minimal:
- Today: goes through `handleStaticRequest` → cache miss (POST body/auth tokens prevent match) → fetch → try to cache → silent fail → return response. Effectively network-first already.
- After fix: goes through `handleApiRequest` → fetch → return response. Same outcome, cleaner path.
- Offline: Today returns generic text/plain 503. After fix returns proper JSON 503 with `offline: true` flag.

**Many flows already guard with `navigator.onLine` before cloud reads:**
- `js/index/cloud-recovery.js:19`
- `js/shared/cloud-photos.js:22,92,121`
- `js/index/sync.js:26`
- `js/report/data-loading.js:71`

**No explicit design intent for API cache-first was found.** Architecture comments indicate API should be network-first (`sw.js:209,213,327`).

---

## Part D: Edge cases

### 1) Supabase Realtime (WebSocket)
- App uses `supabaseClient.channel(...).subscribe(...)` (`js/shared/realtime-sync.js:42-55`)
- SW only handles `fetch` events (`sw.js:200-227`) — no WebSocket interception
- **No impact from the proposed fix**

### 2) Supabase JS SDK CDN import
- Already listed in `CDN_ASSETS`: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (`sw.js:128`)
- Cached during install, served cache-first via `handleStaticRequest`
- **Not affected** by API_PATTERNS change (different domain: jsdelivr.net, not supabase.co)

### 3) Signed URL asset fetches (photos/PDFs/logos)
- Signed URLs are **generated** via `createSignedUrl()` calls (POST to supabase.co/storage/v1/) — these should be API-routed
- Signed URL **consumption** (loading the actual image/PDF via `img.src` or `window.open`) goes to a supabase.co/storage/v1/object/sign/... URL
- These are GET requests that load binary data (images, PDFs)
- If `supabase.co/storage/v1/` is added to API_PATTERNS broadly, these image GETs would also go through `handleApiRequest` (network-first, no cache)
- **Potential concern:** Photo loading could be slightly slower without cache-first behavior, but since signed URLs expire (1hr), caching them is problematic anyway. Network-first is actually more correct.

---

## Summary & Revised Risk Assessment

| Finding | Severity | Notes |
|---------|----------|-------|
| Edge Function POSTs misrouted to handleStaticRequest | ⚠️ Warning (not Critical) | Non-awaited cache.put accidentally prevents 503; response gets through |
| Silent unhandled promise rejection on every Edge Function call | ⚠️ Warning | Console noise, fragile code path |
| Supabase REST/Auth/Storage also misrouted | ⚠️ Warning | Same non-breaking behavior due to non-awaited cache.put |
| Dead API_PATTERNS ('n8n', 'webhook') | 🔵 Info | Cleanup needed |
| document-import.js doesn't check response.ok | ⚠️ Warning | Separate bug, not SW-related |
| Code is fragile — adding await to cache.put would break everything | 🔴 Critical (latent) | One innocent change could cause all API calls to 503 |

### Recommended fix (refined from Part 1)

**Two-part approach:**

1. **Update API_PATTERNS** to include Supabase domain:
   - Add: `bdqfpemylkqnmeqaoere.supabase.co`
   - Keep: `api.open-meteo.com`
   - Remove: `n8n`, `webhook`
   
   (Using just the domain rather than specific paths is simpler and catches all current + future Supabase traffic)

2. **Add non-GET bypass** early in fetch handler:
   - If `request.method !== 'GET'` and not navigation → route to `handleApiRequest`
   - This is a safety net that protects against any future API URL that doesn't match patterns

**Blast radius of this fix: LOW.** No Supabase traffic currently benefits from cache-first behavior. All paths are effectively network-first already due to Cache API rejecting non-GET operations.
