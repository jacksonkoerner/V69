# Service Worker Routing Audit (`sw.js`)

**Date:** 2026-02-22
**Auditor:** Codex 5.3
**Status:** Audit only — no code changes made

## Scope
Audit of fetch routing behavior in `sw.js` for:
- Supabase Edge Functions:
  - `/functions/v1/refine-text`
  - `/functions/v1/ai-chat`
  - `/functions/v1/process-report`
  - `/functions/v1/extract-project`
- Other Supabase API traffic (Auth / REST / Storage) to `https://bdqfpemylkqnmeqaoere.supabase.co`

No source code modifications were made.

## 1) Fetch handler trace for the 4 Edge Function URLs

### Service worker routing logic (decision tree)
1. Navigation requests (`request.mode === 'navigate'`) go to `handleNavigationRequest` (`sw.js:200-205`).
2. Otherwise, `isApiCall` is computed from `API_PATTERNS.some(pattern => url.href.includes(pattern))` (`sw.js:207-210`).
3. If `isApiCall` is true, request goes to `handleApiRequest` (`sw.js:212-215`).
4. Else if same-origin `.js` file (`url.pathname.endsWith('.js') && url.origin === self.location.origin`), request goes to `handleJsRequest` (`sw.js:218-223`).
5. Everything else goes to `handleStaticRequest` (`sw.js:225-226`).

### Why Edge Function calls do NOT match API route today
Current API patterns are only:
- `api.open-meteo.com`
- `n8n`
- `webhook`
(`sw.js:137-141`)

All four Edge Function URLs are `https://bdqfpemylkqnmeqaoere.supabase.co/functions/v1/...` (defined in callers at `js/report/ai-refine.js:10`, `js/shared/ai-assistant.js:10`, `js/interview/finish-processing.js:9`, `js/project-config/document-import.js:6`).

Those URLs do not contain `api.open-meteo.com`, `n8n`, or `webhook`, so `isApiCall` is false (`sw.js:210`).

### Per-URL routing result
- `POST /functions/v1/refine-text` (`js/report/ai-refine.js:85-93`)
  Route: `handleStaticRequest` (`sw.js:225-226`)
  Why: not `navigate`, not matched by `API_PATTERNS`, not same-origin `.js` (`sw.js:200-226`).

- `POST /functions/v1/ai-chat` (`js/shared/ai-assistant.js:743-751`)
  Route: `handleStaticRequest` (`sw.js:225-226`)
  Why: same as above.

- `POST /functions/v1/process-report` (`js/interview/finish-processing.js:94-102`)
  Route: `handleStaticRequest` (`sw.js:225-226`)
  Why: same as above.

- `POST /functions/v1/extract-project` with `FormData` (`js/project-config/document-import.js:149-156`)
  Route: `handleStaticRequest` (`sw.js:225-226`)
  Why: same as above.

## 2) Trace for other Supabase API calls (Auth / REST / Storage)

Supabase client is initialized with `SUPABASE_URL = https://bdqfpemylkqnmeqaoere.supabase.co` (`js/config.js:4-8`).

Examples of Supabase API usage:
- Auth: `supabaseClient.auth.getSession()` (`js/auth.js:24`, `js/data-layer.js:207`)
- REST/table calls: `.from(...).select()/upsert()/delete()` (`js/data-layer.js:239-243`, `js/interview/finish-processing.js:170-172`, `js/shared/delete-report.js:31-34`)
- Storage: `.storage.from(...).remove(...)` (`js/shared/delete-report.js:45`, `js/shared/delete-report.js:93`)

For these requests, routing outcome is the same as Edge Functions:
- Not `navigate` in normal API fetch usage (`sw.js:200-205`)
- URL usually does not include current API pattern substrings (`sw.js:137-141`, `sw.js:210`)
- Not same-origin `.js` (`sw.js:220`)
- Therefore routed to `handleStaticRequest` (`sw.js:225-226`)

## 3) Problem scenarios

### A) Could a POST to an Edge Function ever be served from cache?
Effectively no in current code path: `handleStaticRequest` first does `caches.match(request)` (`sw.js:231`), and POST requests are not normal cache hits unless `ignoreMethod` is used (not used here).

### B) Could a POST response be cached and served to a future request?
No successful caching of POST responses.
`handleStaticRequest` tries `cache.put(request, networkResponse.clone())` for any `response.ok` (`sw.js:244-247`), but Cache API only stores GET requests. This throws and jumps to catch (`sw.js:250-269`).

**Critical side effect: a successful POST can still produce a SW-generated `503` because the thrown `cache.put` is treated as failure (`sw.js:250-269`), which breaks API behavior from the app's perspective.**

### C) Could the SW interfere with request headers (`Authorization`, `Content-Type`)?
- Direct header mutation: none in SW. Requests are forwarded with `fetch(request)` in `handleStaticRequest` and `handleApiRequest` (`sw.js:241`, `sw.js:330`).
- Indirect interference: yes. Misrouted POSTs can return SW `503` after upstream success due to `cache.put` throw (`sw.js:244-247`, `sw.js:250-269`), which breaks API behavior from the app's perspective.

### D) What happens to multipart/form-data requests (`extract-project` uses FormData)?
`extract-project` sends `FormData` with `Authorization` only (`js/project-config/document-import.js:135-156`), which is correct for browser-managed multipart boundary.

But routing is still `handleStaticRequest` (`sw.js:225-226`), so same POST cache-write failure applies:
- network fetch occurs (`sw.js:241`)
- `cache.put` on POST throws (`sw.js:244-247`)
- catch returns fallback `503` (`sw.js:250-269`)

So multipart requests are vulnerable to false failure responses.

## 4) API_PATTERNS check (`n8n` / `webhook`)

Current patterns (`sw.js:137-141`):
- `api.open-meteo.com`
- `n8n`
- `webhook`

Current Edge Function URLs are Supabase `/functions/v1/...` (`js/report/ai-refine.js:10`, `js/shared/ai-assistant.js:10`, `js/interview/finish-processing.js:9`, `js/project-config/document-import.js:6`), so `n8n`/`webhook` are dead patterns for present traffic.

## 5) Recommended fix for API_PATTERNS

To correctly identify all current API traffic, include Supabase API paths (or at minimum the Supabase domain).
Recommended concrete patterns:

**Add:**
- `bdqfpemylkqnmeqaoere.supabase.co/functions/v1/`
- `bdqfpemylkqnmeqaoere.supabase.co/auth/v1/`
- `bdqfpemylkqnmeqaoere.supabase.co/rest/v1/`
- `bdqfpemylkqnmeqaoere.supabase.co/storage/v1/`

**Keep:**
- `api.open-meteo.com`

**Remove (dead):**
- `n8n`
- `webhook`

This will force Edge/Auth/REST/Storage traffic through `handleApiRequest` (`sw.js:210-215`, `sw.js:328-331`) instead of `handleStaticRequest`.

## 6) Additional concern: `handleStaticRequest` catch block

Even with the API_PATTERNS fix, the broader architecture issue remains: `handleStaticRequest` has a try/catch structure where a `cache.put` failure on POST causes the catch block to execute and potentially return a `503` response instead of the actual successful network response (`sw.js:250-269`).

A more robust fix would also add a method guard early in the fetch handler:
- If `request.method !== 'GET'` and the request is not navigation, bypass all cache logic entirely and use network-only (similar to `handleApiRequest` behavior).

This would protect against any future API calls that might not match the pattern list.
