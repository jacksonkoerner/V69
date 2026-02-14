# FieldVoice Pro V69 — Post-Audit Testing Plan

> **Created:** 2026-02-13
> **Purpose:** Verify all audit fixes across 5 sub-agent branches
> **Tester:** George (automated + browser verification)
> **App URL:** https://jacksonkoerner.github.io/V69/
> **Supabase:** bdqfpemylkqnmeqaoere (v69 sandbox)

---

## Testing Approach

### Phase 1: Static Verification (Code Review)
For each agent's changes, verify the fix matches the audit recommendation — no regressions, no syntax errors, no broken imports.

### Phase 2: Functional Testing (Browser)
Load the app in browser, walk through the full report lifecycle, verify each fix works in practice.

### Phase 3: Supabase Verification
Query Supabase tables directly to confirm data integrity — correct saves, no orphans, proper timestamps.

---

## Test Matrix

### 🔐 Agent 1: Webhook Security (v69-fix-webhook-security)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 1.1 | API key constant exists in config.js | `grep "N8N_WEBHOOK_API_KEY" js/config.js` | Constant defined, non-empty |
| 1.2 | All webhook fetches include X-API-Key header | `grep -A5 "fetch.*n8n" js/interview/finish-processing.js js/report/ai-refine.js js/shared/ai-assistant.js` | Every fetch has `X-API-Key` in headers |
| 1.3 | Webhook timeout increased to 60s | `grep "setTimeout.*abort\|AbortController" js/interview/finish-processing.js` | 60000ms, not 30000ms |
| 1.4 | Input sanitization on AI assistant | `grep -A10 "sanitize\|maxLength\|strip" js/shared/ai-assistant.js` | Control chars stripped, length capped at 10000 |
| 1.5 | **Browser test:** Submit a report and verify n8n webhook is called with auth header | DevTools Network tab → check request headers on AI processing call | `X-API-Key: fvp-n8n-webhook-key-2026` visible |
| 1.6 | **Browser test:** AI assistant chat sends sanitized input | Type a long message with control chars, verify payload is clean | No control chars in request body, message truncated if >10k |

### 🔗 Agent 2: Signed URLs (v69-fix-signed-urls)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 2.1 | No remaining `getPublicUrl` calls | `grep -r "getPublicUrl" js/` | Zero matches |
| 2.2 | PDF uses createSignedUrl | `grep -A3 "createSignedUrl\|signedUrl" js/report/submit.js` | Uses `createSignedUrl` with expiry |
| 2.3 | Photo uses createSignedUrl | `grep -A3 "createSignedUrl\|signedUrl" js/interview/persistence.js` | Uses `createSignedUrl` with expiry |
| 2.4 | **Browser test:** Submit report → PDF link works | Complete full submit flow, click PDF link | PDF loads correctly (signed URL) |
| 2.5 | **Browser test:** Photos display in report editor | Add photos to interview, navigate to report editor | Photos render (not broken image icons) |
| 2.6 | **Supabase check:** Verify storage bucket policies | `supabase` CLI or dashboard — check bucket `report-pdfs` and `report-photos` settings | Buckets still accessible via signed URLs |

### 📸 Agent 3: Photo Storage & Race Conditions (v69-fix-photo-storage)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 3.1 | Photo base64 NOT in localStorage | `grep -n "base64" js/interview/photos.js` | base64 stored to IndexedDB only, not in IS.report.photos |
| 3.2 | saveCurrentReport has lock/queue | `grep -A15 "saveCurrentReport\|_saveQueue\|_doSave" js/storage-keys.js` | Async queue pattern prevents concurrent saves |
| 3.3 | uploadPendingPhotos updates IS.report.photos | `grep -A10 "IS.report.photos\|storagePath\|\.url" js/interview/persistence.js` in uploadPendingPhotos | After upload, matching IS.report.photos entry has storagePath + url |
| 3.4 | **Browser test:** Capture 5+ photos → check localStorage size | Capture photos, then `localStorage.getItem('fvp_current_reports')` in console | No base64 strings in the value — metadata only |
| 3.5 | **Browser test:** Photos survive page reload | Add photos, reload page, verify photos display | Photos load from IndexedDB, not localStorage |
| 3.6 | **Browser test:** Rapid save stress test | Edit a report rapidly (type fast, trigger multiple saves) | Console shows serialized saves, no "concurrent save" warnings |
| 3.7 | **Supabase check:** Photos uploaded correctly | Query `photos` table for recent report | `storage_path` populated, matches file in `report-photos` bucket |
| 3.8 | **IndexedDB check:** Photos stored locally | DevTools → Application → IndexedDB → check photo store | Base64 data present in IndexedDB entries |

### 🔄 Agent 4: Sync & Reliability (v69-fix-sync-reliability)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 4.1 | Sync queue code removed | `grep -r "addToSyncQueue\|clearSyncQueueForReport\|SYNC_QUEUE" js/` | Zero matches (or minimal — only the constant removal itself) |
| 4.2 | supabase-retry.js exists | `cat js/shared/supabase-retry.js` | File exists with exponential backoff retry function |
| 4.3 | Critical saves use retry | `grep -r "supabaseRetry\|retrySupabase" js/interview/finish-processing.js js/interview/persistence.js js/report/autosave.js` | At least 3 call sites using retry wrapper |
| 4.4 | Cloud recovery compares timestamps | `grep -A10 "updated_at\|timestamp.*compare" js/index/cloud-recovery.js` | Compares cloud vs local `updated_at` before deciding which to keep |
| 4.5 | Realtime sync skips active edits | `grep -A5 "quick-interview\|report.html\|currently.*edit" js/shared/realtime-sync.js` | Guard check prevents overwrite during active editing |
| 4.6 | **Browser test:** Offline handling shows clear message | Disconnect network → try to finish a report | User sees toast: "Report saved to drafts. Retry when online." (not silent failure) |
| 4.7 | **Supabase check:** Interview backup saves with retry | Start interview, edit, check `interview_backup` table | Row exists with recent `updated_at`, `interview_state` populated |
| 4.8 | **Supabase check:** Cloud recovery pulls newer data | Manually update a report's `updated_at` in Supabase to be newer than local → reload dashboard | Local report updates to match cloud version |

### 🧹 Agent 5: Code Quality (v69-fix-code-quality)

| # | Test | How | Pass Criteria |
|---|------|-----|---------------|
| 5.1 | SW version updated | `grep "CACHE_VERSION" sw.js` | v6.9.15 or version.json-based |
| 5.2 | PDF box borders fixed | `grep -A10 "wsStartY\|top border\|page break" js/report/pdf-generator.js` near work summary | Top border drawn on new page after break |
| 5.3 | Deprecated function removed | `grep -r "loadActiveProject" js/` | Zero matches (or only the removal) |
| 5.4 | Duplicate formVal removed | `grep -rn "function formVal" js/report/` | Exactly 1 definition |
| 5.5 | Date formatting standardized | `grep -r "toLocaleDateString" js/` for storage contexts | No `toLocaleDateString()` used for data storage (display only) |
| 5.6 | Version comment fixed | `head -5 js/data-layer.js` | Says v6.9, not v6.6 |
| 5.7 | Session interval cleared on signout | `grep -A5 "signOut\|_sessionCheckInterval" js/auth.js` | `clearInterval(_sessionCheckInterval)` in signOut |
| 5.8 | **Browser test:** Generate PDF with multi-page work summary | Create report with 4+ contractors → generate PDF | Box borders render correctly across page break |
| 5.9 | **Browser test:** Sign out and sign back in | Sign out → sign back in → check for duplicate intervals | Only one session check interval running (verify in DevTools) |

---

## Integration Tests (Post-Merge)

After all agents complete and changes are committed:

| # | Test | Description | Pass Criteria |
|---|------|-------------|---------------|
| I.1 | **Full report lifecycle** | Dashboard → Create report → Interview (guided) → Add 3+ photos → Finish → Report editor → Submit | No JS errors, report appears in archives |
| I.2 | **localStorage size check** | After full lifecycle with photos | `JSON.stringify(localStorage).length` < 500KB |
| I.3 | **Supabase data integrity** | Query all tables for the test report | `reports` row exists, `report_data` populated, `photos` have storage_paths, `ai_submissions` logged |
| I.4 | **Cross-device recovery** | Clear localStorage → reload dashboard | Cloud recovery pulls reports from Supabase, photos load from storage |
| I.5 | **Offline → Online cycle** | Go offline → create report → go online | Report syncs to Supabase, photos upload |
| I.6 | **PDF generation** | Submit a report with photos, work summary, all sections | PDF renders correctly, photos included, box borders clean |
| I.7 | **Auth flow** | Sign out → sign in → verify clean state | No stale data, intervals cleaned up, fresh session |

---

## Supabase Direct Queries (Verification)

```sql
-- Check recent reports
SELECT id, status, updated_at, project_id 
FROM reports 
ORDER BY updated_at DESC LIMIT 5;

-- Check report_data integrity
SELECT rd.report_id, rd.updated_at, length(rd.interview_state::text) as state_size
FROM report_data rd
ORDER BY rd.updated_at DESC LIMIT 5;

-- Check photos have storage paths
SELECT id, report_id, storage_path, url, created_at
FROM photos
WHERE storage_path IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- Check interview backups are current
SELECT id, report_id, updated_at, org_id
FROM interview_backup
ORDER BY updated_at DESC LIMIT 5;

-- Check AI submissions logged
SELECT id, report_id, status, processing_time_ms, created_at
FROM ai_submissions
ORDER BY created_at DESC LIMIT 5;

-- Check for orphaned records (photos without valid reports)
SELECT p.id, p.report_id 
FROM photos p
LEFT JOIN reports r ON p.report_id = r.id
WHERE r.id IS NULL;
```

---

## Execution Order

1. ⏳ Wait for all 5 agents to complete
2. 📋 Run static verification (grep tests) for each agent
3. 🔀 Verify no file conflicts between agents (git status)
4. 🌐 Deploy to GitHub Pages (or test locally)
5. 🧪 Run browser tests (full lifecycle)
6. 🗄️ Run Supabase verification queries
7. ✅ Mark each test pass/fail
8. 🐛 File follow-up issues for any failures

---

*This plan covers all 47 audit findings across the 5 fix agents. Tests are designed to catch both the specific fix AND potential regressions.*
