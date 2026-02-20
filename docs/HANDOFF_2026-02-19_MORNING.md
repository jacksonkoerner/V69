# FieldVoice Pro — Morning Handoff (2026-02-19)

## What Happened Today (Feb 18)

### Big Picture
We spent the day fixing cross-device sync bugs, then made a **major architectural decision**: ripped out the live broadcast sync system (it caused typing lag and ping-pong loops) and replaced it with a simpler **pull-to-refresh + cloud-freshness-check** model.

### Commits (newest first)
| Commit | What |
|--------|------|
| `3050537` | **Never delete local-only reports during cloud sync** — cloud recovery was wiping reports that only existed locally |
| `3f96054` | **Interview cross-device sync** — always check cloud freshness on interview load |
| `71cbe52` | **Report page cloud freshness** — always fetch latest from Supabase on report load |
| `6fb2dcd` | **Fix infinite reload loop** — report page was reloading endlessly when two devices had it open |
| `86bacd6` | Batch 3: remove dead sync code, bump SW to v6.9.27 |
| `a681d35` | Batch 2: strip broadcast sync from report autosave, interview persistence, both main.js |
| `de32040` | Batch 1: archive old sync code to `js/shared/_sync-live/`, remove sync-merge |
| `7f0e5db` | Fix sync ping-pong loop (pre-architecture change) |
| `cf87f18` | Dashboard submitted report dismissal (soft-hide + cross-device) |
| `8aedb21` | Blur handlers → cloud save, saveNow(), auto-switch on refined |
| `250d80e` | Photo pipeline: GPS/date/time in backups, accuracy fix, `_undefined` filename |
| `36f004f` | Error log monitoring script |

### Current Architecture (Post-Refactor)
- **NO live broadcast sync** — old code archived in `js/shared/_sync-live/`
- **Pull-to-refresh** on all pages (`js/shared/pull-to-refresh.js`)
- **Cloud freshness check on page load** — report.js and interview both fetch latest from Supabase when opening
- **Realtime still active** for status changes only (draft→refined→submitted, deleted)
- **Dashboard cloud recovery** still runs on load (fetches reports from Supabase)

### Current Version
- SW cache: **v6.9.27** (in `sw.js`)
- App version: check `version.json`

---

## Known Issues / Remaining Work

### 🔴 Critical — Needs Fix
1. **Cloud recovery may strip photo metadata** — `recoverReportsFromCloud()` builds stubs with `photos: []` (`js/index/cloud-recovery.js:262`). Recovered drafts can lose photo data.
2. **Missing `org_id` blocks drain uploads** — `interview_backup` RLS checks `org_id` (`supabase/migrations/011_interview_backup_org_id.sql:33`). If localStorage `org_id` is missing, drain silently fails.

### 🟡 Important — Should Fix
3. **Safe-area-inset handling** — ZERO CSS safe-area support despite `viewport-fit=cover` in meta tag. Notch/home-indicator overlap on iPhone.
4. **Accessibility gaps** — 20+ unlabeled buttons, 0 `label-for` pairings, 4 contrast failures, no landmarks.
5. **Large text no limit** — No `maxlength` or character counter on field notes (tested 53K chars, works but risky).
6. **145 vs 26 event listeners** — Potential memory leak from listener accumulation.

### 🟢 Nice to Have
7. **Desktop refresh button** — Was planned in pull-to-refresh.js (floating button, desktop-only via media query). Not sure if implemented yet.
8. **Performance logging** — Debug logs miss save timing, merge duration, UI responsiveness data.

### 🔵 Decision Pending
9. **Live sync future** — Code is archived, not deleted. Could re-enable later with proper debouncing/batching if needed. Current pull-to-refresh model is simpler and more reliable.

---

## Key Files to Know
| File | Purpose |
|------|---------|
| `js/report/data-loading.js` | Report page load + cloud freshness check |
| `js/interview/persistence.js` | Interview save/load + cloud freshness |
| `js/shared/data-store.js` | IDB wrapper (local storage layer) |
| `js/shared/realtime-sync.js` | Realtime subscription (status changes only now) |
| `js/shared/pull-to-refresh.js` | Pull-to-refresh on all pages |
| `js/index/cloud-recovery.js` | Dashboard cloud recovery (fetches from Supabase) |
| `js/shared/delete-report.js` | Delete flow (soft delete + IDB cleanup) |
| `js/shared/_sync-live/` | Archived broadcast sync code (for reference) |
| `docs/CODEX_SYNC_AUDIT.md` | Deep audit of sync system by Codex |
| `docs/SYNC_FIX_PLAN.md` | Fix plan with priority ordering |

## Supabase
- Project ref: `bdqfpemylkqnmeqaoere`
- Debug logs: `debug_logs` table (query with anon key from `js/config.js`)
- Jackson's phone device_id: `a8c4b150`

## iOS Deploy
```bash
cd ~/projects/V69
rsync -av --exclude=node_modules --exclude=.git --exclude=ios . www/
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'id=00008110-001A6D303446201E' build 2>&1 | tail -5
ios-deploy --bundle ios/App/build/Build/Products/Debug-iphoneos/App.app --id 00008110-001A6D303446201E
```
