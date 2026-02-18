# HANDOFF: FieldVoice Pro V69 — Data Layer Overhaul (Late Night)
**Date:** 2026-02-17 ~23:00 CST
**From:** George (main session, Opus 4.6)
**Context:** 83% consumed — starting fresh session

---

## 1. What We're Doing

Overhauling FieldVoice Pro's data layer. The old architecture had localStorage, IDB, and Supabase all writing independently with no ownership rules, causing race conditions and data loss.

### The Approved Architecture

**localStorage — Tiny pointers ONLY:**
- Active report ID, auth tokens, UI state, device ID, deleted report blocklist
- NO report content, NO interview data, NO project details

**IndexedDB — ALL structured data (local source of truth):**
- Report metadata (was `fvp_current_reports` shared map — THE BUG SOURCE)
- Report content (was `fvp_report_{id}` keys)
- Interview/draft data, project configs, photos, offline queue

**Supabase — Cloud source of truth:**
- Everything syncs IDB → Supabase (background, non-blocking)
- Supabase → IDB for incoming changes via Realtime
- Background sync, never blocking UI

### Data Flow
```
User Action → data-store.js writes IDB → UI updates from IDB
                                       → Background sync to Supabase
                                       → localStorage gets only pointer

Supabase Change → Realtime → data-store.js writes IDB → BroadcastChannel → UI updates
```

---

## 2. Current State of the Code

### Branch: `feature/data-layer-overhaul`

**Commits:**
1. `6d96a99` — Main overhaul (Codex 5.3): 19 files, +1188/-878 lines
2. `796dd3f` — Reverted unauthorized HTML edit (George was bad)
3. `0189dc4` — Console capture script (debug_logs to Supabase)

### New Files Created
- `js/shared/data-store.js` (588 lines) — Single IDB owner, connection pooling, 8s timeout, leaked handle fix, migration from localStorage→IDB
- `js/shared/broadcast.js` (49 lines) — BroadcastChannel wrapper for cross-page events
- `js/shared/console-capture.js` (115 lines) — Sends console.log/warn/error to Supabase `debug_logs` table

### Files Modified (17 total)
- `storage-keys.js` — Stripped from 540+ to 129 lines. Removed ALL read-modify-write functions on shared map
- `report/autosave.js` — Uses `dataStore` instead of localStorage
- `report/main.js` — visibilitychange/pagehide use `dataStore`
- `report/data-loading.js` — IDB-first loading with Supabase fallback
- `report/submit.js` — Uses `dataStore` for status updates
- `interview/persistence.js` — `confirmCancelReport` now calls `deleteReportFull`
- `interview/main.js` — pagehide calls `dataStore.closeAll()`
- `interview/finish-processing.js` — Uses `dataStore` for saves
- `index/main.js` — Dashboard reads from `dataStore.getAllReports()`
- `index/report-cards.js` — Reads from dataStore
- `index/cloud-recovery.js` — All writes through `dataStore`
- `index/report-creation.js` — Uses `dataStore`
- `shared/delete-report.js` — Uses `dataStore` + broadcasts deletion
- `shared/realtime-sync.js` — Writes to IDB, visibilitychange lifecycle, full DELETE handler
- `report-rules.js` — Async-aware report reading
- `indexeddb-utils.js` — Shimmed to delegate to `dataStore`
- `auth.js` — Minor updates

### Known Bug: Script Loading Race Condition
**`broadcast.js` and `data-store.js` are NOT in the HTML `<script>` tags yet.**
Codex tried to dynamically inject them via `ensureSharedScript()` in storage-keys.js, but that's a race condition — by the time they load, page scripts have already run with `window.dataStore` undefined.

**THE FIX (not yet applied — needs Jackson's approval):**
Add to all 4 HTML files (`index.html`, `report.html`, `quick-interview.html`, `archives.html`):
```html
<!-- After storage-keys.js, before realtime-sync.js -->
<script src="./js/shared/broadcast.js"></script>
<script src="./js/shared/data-store.js"></script>
```

This is why reports show "loading" — `dataStore.getReportData()` returns undefined because `dataStore` isn't loaded yet.

---

## 3. Debug Logging — NOW LIVE

### Supabase `debug_logs` table
- All console.log/warn/error from the app go here
- Batched every 3 seconds
- Catches unhandled errors and promise rejections
- Query with service role key:

```bash
SUPABASE_URL="https://bdqfpemylkqnmeqaoere.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcWZwZW15bGtxbm1lcWFvZXJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMTU2MCwiZXhwIjoyMDg2MTc3NTYwfQ.oN-mwTSrdM-ylvdwZfhG8s8TwICBc6r_5EsyMh5H4Bw"

# Recent logs
curl -s "$SUPABASE_URL/rest/v1/debug_logs?order=created_at.desc&limit=50" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool

# Errors only
curl -s "$SUPABASE_URL/rest/v1/debug_logs?level=eq.error&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" | python3 -m json.tool

# Clear all logs (reset between test sessions)
curl -s "$SUPABASE_URL/rest/v1/debug_logs" -X DELETE \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Prefer: return=minimal"
```

---

## 4. What Needs to Happen Next

### Immediate (fix the loading bug):
1. **Add `broadcast.js` and `data-store.js` to HTML script tags** — propose to Jackson, get approval, then edit
2. **Test on phone** — use debug_logs table to see what's happening
3. **Verify migration** — check that `fvp_current_reports` data moved to IDB correctly

### After loading fix works:
4. Test the delete bug (create 2 reports, delete one, verify other isn't blank)
5. Test background/resume (iOS app switch)
6. Test Realtime reconnection

### Outstanding issues from before the overhaul:
- Form function duplication (interview/ and report/ share 9+ functions)
- Cloud recovery doesn't write reportData to IDB (may be fixed now)
- Safe-area-inset CSS missing
- Accessibility issues (20+ unlabeled buttons)

---

## 5. CRITICAL RULES

- **NEVER commit/push/deploy code without Jackson's explicit approval**
- **Present changes as numbered proposals FIRST, then WAIT**
- **Jackson is a vibe coder — he works through prompts, not direct coding**
- **Use Codex 5.3 for implementation, George for orchestration**

---

## 6. Key Files Reference

| File | Purpose |
|------|---------|
| `js/shared/data-store.js` | NEW — Single IDB owner, all data operations |
| `js/shared/broadcast.js` | NEW — BroadcastChannel for cross-page events |
| `js/shared/console-capture.js` | NEW — Debug logging to Supabase |
| `js/storage-keys.js` | REFACTORED — Pointers/flags only, no data |
| `js/shared/delete-report.js` | Delete cascade (local + cloud) |
| `js/shared/realtime-sync.js` | Supabase Realtime with lifecycle management |
| `js/data-layer.js` | Project loading (unchanged, works correctly) |
| `js/indexeddb-utils.js` | Legacy shim (delegates to dataStore) |
| `docs/IMPLEMENTATION_SPEC.md` | Full spec for the overhaul |
| `docs/AUDIT_IDB_DELETE_FLOW.md` | Deep code audit with line numbers |
| `docs/HANDOFF_2026-02-17.md` | Earlier tonight's handoff |

## 7. Environment

- **Repo:** ~/projects/V69/ (branch: feature/data-layer-overhaul)
- **Supabase:** bdqfpemylkqnmeqaoere
- **Test account:** simtest@fieldvoice.dev / TestSim2026!
- **Phone:** iPhone 14, UDID 00008110-001A6D303446201E
- **Build:** `npx cap sync ios` then `xcodebuild` then `ios-deploy`
