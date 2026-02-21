# Full Codebase Audit — Chunk 8: Supabase Edge Functions
Date: 2026-02-21

## Scope
Reviewed all requested files:
- `supabase/config.toml`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/refine-text/index.ts`
- `supabase/functions/refine-text/deno.json`
- `supabase/functions/ai-chat/index.ts`
- `supabase/functions/ai-chat/deno.json`
- `supabase/functions/process-report/index.ts`
- `supabase/functions/process-report/deno.json`
- `supabase/functions/extract-project/index.ts`
- `supabase/functions/extract-project/deno.json`

---

## 1) `supabase/config.toml`

### PURPOSE
Defines per-function Supabase Edge Function settings for four functions: `refine-text`, `ai-chat`, `process-report`, and `extract-project`. It enables all four, points each to an entrypoint, and attaches a per-function import map file. It also explicitly disables Supabase platform-level JWT verification (`verify_jwt = false`) for every function.

### AUTH
JWT is not validated by Supabase platform middleware because `verify_jwt = false` is set for all functions (`supabase/config.toml:3`, `supabase/config.toml:9`, `supabase/config.toml:15`, `supabase/config.toml:21`). This means auth depends entirely on in-handler validation in shared code.

### N8N INTEGRATION
No direct n8n call here. This file indirectly affects n8n access by controlling whether unauthenticated requests can reach function code paths that call n8n.

### ERROR HANDLING
No error handling in this file (config-only). Misconfiguration risk exists if entrypoints/import_map paths drift.

### ISSUES
- `WARNING`: `verify_jwt = false` everywhere creates a single-point dependency on custom auth logic. If a future function forgets to call `validateAuth`, it becomes publicly reachable.
- `INFO`: Import maps are configured per function even though each referenced `deno.json` currently has empty imports.

### DEPENDENCIES
None (TOML config only).

---

## 2) `supabase/functions/_shared/auth.ts`

### PURPOSE
Provides shared utilities used by all edge handlers: CORS headers, JSON response helpers, JWT validation (`validateAuth`), and n8n proxy fetch with timeout (`fetchN8n`). It centralizes common logic and reduces per-function duplication. It is the core security/control plane for this function set.

### AUTH
`validateAuth(req)` checks:
- Presence and `Bearer ` format of `Authorization` header (`supabase/functions/_shared/auth.ts:44-47`)
- Token validity by calling `supabase.auth.getClaims(token)` (`supabase/functions/_shared/auth.ts:55`)
- Presence of claims object (`supabase/functions/_shared/auth.ts:56-58`)

Claims actually enforced:
- Only that claims exist; no explicit checks for `iss`, `aud`, `role`, `exp` (beyond whatever `getClaims` enforces), `aal`, or app-specific claims.
- Returns `userId` from `claims.sub` without validating type/presence beyond cast (`supabase/functions/_shared/auth.ts:62`).

### N8N INTEGRATION
`fetchN8n(webhookPath, options)` calls:
- URL: `${N8N_BASE_URL}/webhook/${webhookPath}` (`supabase/functions/_shared/auth.ts:87`)
- Headers always include `X-API-Key: ${N8N_WEBHOOK_SECRET}` (`supabase/functions/_shared/auth.ts:91`), merged with caller headers.
- Default method `POST`, default timeout `120000ms` (`supabase/functions/_shared/auth.ts:80`, `supabase/functions/_shared/auth.ts:89`).

### ERROR HANDLING
- `validateAuth` throws structured `{ status, message }` objects for missing/invalid auth.
- `fetchN8n` converts abort timeout into `504` structured error (`supabase/functions/_shared/auth.ts:102-104`), rethrows other errors.
- Gaps:
  - Missing environment vars are non-null asserted (`!`) and not validated early; runtime failures become generic 500s.
  - Throws plain objects, not `Error` subclasses; this pattern is brittle and non-standard.

### ISSUES
- `WARNING`: CORS is wildcard (`Access-Control-Allow-Origin: *`) (`supabase/functions/_shared/auth.ts:9`). Works functionally, but broader than needed for authenticated endpoints.
- `WARNING`: No explicit claim hardening (issuer/audience/role checks, required `sub` validation) before trusting `X-User-Id` forwarding.
- `INFO`: `createClient(...)` runs per request (`supabase/functions/_shared/auth.ts:50-53`); acceptable but avoidable overhead.
- `INFO`: Header allow-list omits common custom headers like `x-api-key` lowercase variation from arbitrary clients, though current frontend requests are covered.

### DEPENDENCIES
Imports:
- `createClient` from `npm:@supabase/supabase-js@2` (`supabase/functions/_shared/auth.ts:5`)

Import correctness:
- Correct and resolvable in Deno Edge with npm specifier support.

---

## 3) `supabase/functions/refine-text/index.ts`

### PURPOSE
Implements the `refine-text` edge endpoint as a thin authenticated proxy from browser to n8n. It accepts JSON with `originalText` and `section`, forwards payload to n8n, and returns upstream response/status/content-type transparently. It relies entirely on shared auth/util modules for security and transport behaviors.

### AUTH
- Uses shared `validateAuth(req)` (`supabase/functions/refine-text/index.ts:21`).
- No additional claim checks in-handler.
- Effective claim enforcement is whatever `_shared/auth.ts` enforces.

### N8N INTEGRATION
Calls webhook path:
- `fieldvoice-v69-refine-text` (`supabase/functions/refine-text/index.ts:32`)

Sends headers:
- `Content-Type: application/json`
- `X-User-Id: <auth.userId>` (`supabase/functions/refine-text/index.ts:33-36`)
- Plus shared `X-API-Key` from `fetchN8n`.

### ERROR HANDLING
- Handles `OPTIONS`, enforces `POST`, validates required fields (`originalText`, `section`).
- Uses catch block pattern: structured errors with `.status` are returned as-is; unknown errors are logged and mapped to 500.
- Gap: malformed JSON body (`req.json()`) falls into generic 500 instead of 400 Bad Request.

### ISSUES
- `INFO`: Repetitive boilerplate pattern duplicated across all handlers.
- `WARNING`: No size guard on `originalText`; very large payloads could raise cost/latency.
- `INFO`: Trusts n8n response body/content-type entirely; no schema check.

### DEPENDENCIES
Imports:
- `jsr:@supabase/functions-js/edge-runtime.d.ts` (`supabase/functions/refine-text/index.ts:5`)
- Shared helpers from `../_shared/auth.ts` (`supabase/functions/refine-text/index.ts:6`)

Import correctness:
- Correct path and complete usage.

---

## 4) `supabase/functions/refine-text/deno.json`

### PURPOSE
Configured as import map target for `refine-text` in `config.toml`. Currently defines an empty imports object. It has no runtime behavioral effect in current form.

### AUTH
No auth logic.

### N8N INTEGRATION
None.

### ERROR HANDLING
None.

### ISSUES
- `INFO`: Appears unnecessary as-is (`{"imports": {}}`). Could be removed alongside `import_map` reference unless reserved intentionally for future aliases.

### DEPENDENCIES
No imports.

---

## 5) `supabase/functions/ai-chat/index.ts`

### PURPOSE
Implements the `ai-chat` edge endpoint as an authenticated proxy for assistant chat requests. It validates a minimal request shape (`message`), forwards to n8n, and returns n8n response/status/content-type. Like `refine-text`, it is intentionally thin and delegates auth/network details to shared utilities.

### AUTH
- Uses shared `validateAuth(req)` (`supabase/functions/ai-chat/index.ts:21`).
- No handler-level claim constraints.

### N8N INTEGRATION
Calls webhook path:
- `fieldvoice-v69-ai-chat` (`supabase/functions/ai-chat/index.ts:32`)

Sends headers:
- `Content-Type: application/json`
- `X-User-Id: <auth.userId>` (`supabase/functions/ai-chat/index.ts:33-36`)
- Plus shared `X-API-Key`.

### ERROR HANDLING
- Standard options/method guards + required field validation.
- Structured error passthrough from shared module; otherwise logs and 500.
- Gap: malformed JSON yields generic 500 rather than explicit 400.

### ISSUES
- `INFO`: Boilerplate nearly identical to `refine-text` and `process-report`; maintainability overhead.
- `WARNING`: Only validates `message` existence, not type/length.

### DEPENDENCIES
Imports:
- `jsr:@supabase/functions-js/edge-runtime.d.ts` (`supabase/functions/ai-chat/index.ts:5`)
- Shared helpers from `../_shared/auth.ts` (`supabase/functions/ai-chat/index.ts:6`)

Import correctness:
- Correct and consistent with other handlers.

---

## 6) `supabase/functions/ai-chat/deno.json`

### PURPOSE
Configured import map file for `ai-chat`. Contains only empty imports. No current behavioral contribution.

### AUTH
No auth logic.

### N8N INTEGRATION
None.

### ERROR HANDLING
None.

### ISSUES
- `INFO`: Potential config clutter; same pattern as other empty `deno.json` files.

### DEPENDENCIES
No imports.

---

## 7) `supabase/functions/process-report/index.ts`

### PURPOSE
Implements endpoint for full report AI post-processing. It authenticates, enforces `reportId` presence, forwards JSON payload to n8n, and relays n8n output to the caller. It is functionally the same proxy pattern as the other JSON handlers.

### AUTH
- Uses shared `validateAuth(req)` (`supabase/functions/process-report/index.ts:22`).
- No extra claim-level checks beyond shared module.

### N8N INTEGRATION
Calls webhook path:
- `fieldvoice-v69-refine-report` (`supabase/functions/process-report/index.ts:33`)

Sends headers:
- `Content-Type: application/json`
- `X-User-Id: <auth.userId>` (`supabase/functions/process-report/index.ts:34-37`)
- Plus shared `X-API-Key`.

### ERROR HANDLING
- OPTIONS + POST guard + required `reportId` validation.
- Structured status errors are returned; unknown errors logged + 500.
- Gap: malformed JSON leads to 500.

### ISSUES
- `INFO`: Comment at top says “Client timeout is 60s ... no issue” (`supabase/functions/process-report/index.ts:4`) but shared upstream timeout is 120s; this is not necessarily “no issue” because request lifetimes are mismatched.
- `WARNING`: No payload size/schema validation beyond `reportId`.

### DEPENDENCIES
Imports:
- `jsr:@supabase/functions-js/edge-runtime.d.ts` (`supabase/functions/process-report/index.ts:6`)
- Shared helpers from `../_shared/auth.ts` (`supabase/functions/process-report/index.ts:7`)

Import correctness:
- Correct.

---

## 8) `supabase/functions/process-report/deno.json`

### PURPOSE
Import map file referenced by `process-report` config. Currently empty imports only.

### AUTH
No auth logic.

### N8N INTEGRATION
None.

### ERROR HANDLING
None.

### ISSUES
- `INFO`: Appears unnecessary unless intentionally reserved for future aliasing.

### DEPENDENCIES
No imports.

---

## 9) `supabase/functions/extract-project/index.ts`

### PURPOSE
Implements authenticated file-upload proxy for project extraction (multipart form data). It validates that at least one `documents` file was provided, rebuilds `FormData`, forwards to n8n extractor webhook, and relays upstream response/status/content-type. This is the only handler in this set that processes multipart payloads.

### AUTH
- Uses shared `validateAuth(req)` (`supabase/functions/extract-project/index.ts:22`).
- No additional claims checks.

### N8N INTEGRATION
Calls webhook path:
- `fieldvoice-v69-project-extractor` (`supabase/functions/extract-project/index.ts:41`)

Sends headers:
- `X-User-Id: <auth.userId>` (`supabase/functions/extract-project/index.ts:42-44`)
- Does **not** set `Content-Type` (correct for multipart boundary auto-generation).
- Plus shared `X-API-Key`.

### ERROR HANDLING
- OPTIONS + POST guard + required `documents` check.
- Uses standard structured-error passthrough and generic 500 fallback.
- Gap: invalid multipart parsing (`req.formData()`) maps to 500, not a clearer 400.

### ISSUES
- `WARNING`: No file count/size/type enforcement server-side. Frontend filters extensions, but backend should enforce hard limits too.
- `INFO`: Reconstructing `FormData` duplicates memory usage for large uploads.

### DEPENDENCIES
Imports:
- `jsr:@supabase/functions-js/edge-runtime.d.ts` (`supabase/functions/extract-project/index.ts:6`)
- Shared helpers from `../_shared/auth.ts` (`supabase/functions/extract-project/index.ts:7`)

Import correctness:
- Correct.

---

## 10) `supabase/functions/extract-project/deno.json`

### PURPOSE
Import map file for `extract-project`; currently contains empty imports map.

### AUTH
No auth logic.

### N8N INTEGRATION
None.

### ERROR HANDLING
None.

### ISSUES
- `INFO`: Same empty import-map redundancy as the other function `deno.json` files.

### DEPENDENCIES
No imports.

---

## Special Attention Answers

### Is the shared auth module (`auth.ts`) correctly imported by all functions?
Yes. All four function entrypoints import from `../_shared/auth.ts` and use `validateAuth`/`fetchN8n` consistently:
- `supabase/functions/refine-text/index.ts:6`
- `supabase/functions/ai-chat/index.ts:6`
- `supabase/functions/process-report/index.ts:7`
- `supabase/functions/extract-project/index.ts:7`

### Are the `deno.json` import maps correct/needed?
They are syntactically correct but currently unnecessary. Each file is just:
```json
{ "imports": {} }
```
and provides no aliasing/value. Keeping them is harmless but adds config surface area and maintenance overhead.

### Is `getClaims()` the right approach or should we use jose JWKS?
`getClaims()` is a valid approach for Supabase JWT validation and is appropriate for this codebase because it centralizes verification with Supabase semantics. Moving to manual `jose` JWKS verification would add complexity and potential divergence unless you have a specific need (custom claim enforcement pipeline, issuer federation, or independent key lifecycle handling).

Recommendation: keep `getClaims()` but harden post-verification checks in `validateAuth`:
- assert `sub` exists and is a non-empty string
- enforce expected `aud`/`iss`/`role` constraints relevant to your app
- optionally reject tokens missing org/project-scoping claims if required by business rules

### Are there any security gaps in the auth flow?
Yes, mostly hardening gaps rather than outright bypasses:
- `verify_jwt = false` everywhere means every endpoint relies on developer discipline to call `validateAuth`.
- `validateAuth` trusts any token accepted by `getClaims` without additional app-specific claim constraints.
- Wildcard CORS allows any origin to send authenticated requests if a token is present (token theft still required, but origin scoping is absent).
- Backend lacks upload guardrails in `extract-project` (server-side size/count/mime limits).

### Does the CORS configuration match what the frontend needs?
Functionally yes for current frontend behavior. Frontend calls send `Authorization` and sometimes `Content-Type`, and preflight allows those (`supabase/functions/_shared/auth.ts:10-12`). Methods `POST, OPTIONS` match usage.

Security posture note: functional compatibility is good, but `Access-Control-Allow-Origin: *` is broader than necessary for authenticated APIs.

### Is the n8n timeout (120s) appropriate for each function?
Not ideal as a universal default:
- `refine-text` frontend timeout is 20s; edge waiting 120s is usually wasted.
- `ai-chat` frontend timeout is 20s; same mismatch.
- `process-report` frontend timeout is 60s; 120s may still be too long for UX expectations.
- `extract-project` frontend timeout is 60s; could reasonably need longer depending on file size, but should be explicit per endpoint.

Recommendation: set per-function timeout in `fetchN8n(..., { timeoutMs })` aligned to expected workloads and frontend abort budgets.

---

## CHUNK SUMMARY

### Key findings
- Shared auth module is consistently wired and centralizes JWT and n8n logic.
- Current auth verification works, but claim enforcement is minimal (claims existence only).
- CORS is functionally correct for frontend preflights but permissive (`*`).
- All function-specific import maps are empty and likely unnecessary.
- Timeout strategy is one-size-fits-all (120s) and mismatched with frontend timeouts.

### Issues by severity

#### CRITICAL
- None identified in the reviewed files.

#### WARNING
- `verify_jwt = false` for all functions increases blast radius if any future handler omits `validateAuth` (`supabase/config.toml:3`, `supabase/config.toml:9`, `supabase/config.toml:15`, `supabase/config.toml:21`).
- `validateAuth` lacks explicit app-level claim checks (`sub` validation robustness, issuer/audience/role/org checks) before trusting user identity (`supabase/functions/_shared/auth.ts:60-64`).
- Backend upload hardening missing in `extract-project` (server-side size/count/type constraints) (`supabase/functions/extract-project/index.ts:25-37`).
- Wildcard CORS for authenticated APIs is permissive (`supabase/functions/_shared/auth.ts:9`).

#### INFO
- Four empty `deno.json` import maps add config clutter with no present value.
- JSON parse/form-data parse errors are not mapped to explicit 400 responses.
- High duplication across handler entrypoints; could be reduced with a small wrapper factory.
- Comment in `process-report` about timeout being “no issue” is stale/oversimplified relative to actual 120s upstream timeout default.

### Cross-file concerns
- Security architecture depends entirely on shared custom auth because platform JWT verification is disabled globally for these functions.
- `X-User-Id` forwarding relies on un-hardened claim extraction (`claims.sub as string`) in one shared location; any weakness there affects all webhooks.
- Timeout and retry behavior is centralized in `fetchN8n`, but frontend timeout budgets differ significantly by feature.
- CORS policy is centralized and broad; tightening it would improve all endpoints at once.
