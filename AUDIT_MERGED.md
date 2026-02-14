# FieldVoice Pro v6.9 — Merged Audit (Opus 4.6 + GPT-5.3-Codex)

**Date:** 2026-02-13
**Models:** Claude Opus 4.6, GPT-5.3-Codex (via MCP)

## Agreement Matrix

Both models independently flagged these issues — high confidence:

| # | Issue | Opus | Codex | Severity |
|---|-------|------|-------|----------|
| 1 | No RLS policies — org isolation is client-side only | C1+C2 | ARCH | **CRITICAL** |
| 2 | Realtime sync on report_data has no filter | C3 | H3 | **CRITICAL** |
| 3 | Service Worker cache list stale (broken offline) | H1 | M1 | **HIGH** |
| 4 | No auth token refresh (mid-session expiry) | M2 | M5 | **HIGH** |
| 5 | Webhook URLs hardcoded, no auth | H5 | ARCH | **HIGH** |
| 6 | org_id/user_id from localStorage not JWT | C2 | M6 | **CRITICAL** |

## Codex-Only Finds (Opus missed)

| # | Issue | Severity | File |
|---|-------|----------|------|
| 7 | **XSS: QA/QC notes innerHTML unescaped** | CRITICAL | guided-sections.js:88-92 |
| 8 | **XSS: Photo captions in textarea innerHTML** | CRITICAL | guided-sections.js:312-356, freeform.js:332-376 |
| 9 | **XSS: Work summary innerHTML unescaped** | CRITICAL | report/form-fields.js:227-233 |
| 10 | **XSS: Weather fields innerHTML unescaped** | CRITICAL | report/original-notes.js:63-67 |
| 11 | Reports upserted without org_id → NULL rows | HIGH | autosave.js, persistence.js, submit.js |
| 12 | PDFs in public bucket (no signed URLs) | HIGH | report/submit.js:117-122 |
| 13 | Photo upload orphans storage on metadata fail | HIGH | interview/persistence.js:965-997 |
| 14 | Malformed contractors JSON can crash project load | MEDIUM | supabase-utils.js:54 |
| 15 | Archives re-attaches listeners on each init() | MEDIUM | archives/main.js:21-49 |
| 16 | SW ignores navigation requests (no offline page) | MEDIUM | sw.js:181-186 |

## Opus-Only Finds (Codex missed)

| # | Issue | Severity | File |
|---|-------|----------|------|
| 17 | Sign-out doesn't clear sensitive localStorage | CRITICAL | auth.js:67-68 |
| 18 | Sync queue written but never consumed (dead code) | HIGH | storage-keys.js:176-196 |
| 19 | Photo base64 in localStorage → quota exhaustion | HIGH | interview/photos.js, persistence.js |
| 20 | deleteReportCascade missing report_data table | HIGH | shared/delete-report.js:47 |
| 21 | Race condition in concurrent saveCurrentReport() | HIGH | storage-keys.js:161-181 |
| 22 | getReport() has dead .call() invocation | HIGH | interview/persistence.js:241-250 |
| 23 | AI Assistant uses wrong localStorage key | MEDIUM | shared/ai-assistant.js:349-361 |
| 24 | confirmDeleteReport name collision | MEDIUM | report-cards.js:368 vs delete-report.js:7 |
| 25 | AI conversation not namespaced per user | MEDIUM | shared/ai-assistant.js:6 |
| 26 | Three.js loaded on dashboard (600KB unused) | LOW | index.html:38 |

## Priority Fix Plan

### Phase 1: Security (do first)
1. XSS fixes — all innerHTML with user data (#7-10)
2. RLS policies on Supabase (#1, #6)
3. Sign-out cleanup (#17)
4. org_id on all report upserts (#11)
5. Realtime filter on report_data (#2)

### Phase 2: Data Integrity
6. deleteReportCascade add report_data (#20)
7. Photo storage orphan handling (#13)
8. Photo base64 out of localStorage (#19)

### Phase 3: Reliability
9. Service Worker cache list update (#3)
10. SW navigation handler / offline page (#16)
11. Auth token refresh (#4)
12. Malformed JSON try/catch (#14)

### Phase 4: Cleanup
13. Dead sync queue removal (#18)
14. Dead getReport code (#22)
15. AI assistant key fix (#23)
16. Archives listener dedup (#15)
17. Three.js lazy load (#26)
