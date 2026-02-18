# HANDOFF: FieldVoice Pro V69 — Data Layer Fixes (Midnight Session)
**Date:** 2026-02-18 ~00:00 CST
**From:** George (main session, Opus 4.6)
**Context at handoff:** ~70%

---

## 1. What We Did Tonight

### Starting point
- Branch `feature/data-layer-overhaul` had the IDB-as-source-of-truth overhaul (from Codex 5.3)
- Known bug: `broadcast.js` and `data-store.js` not in HTML script tags
- Console logging (`console-capture.js`) not working

### Fixes applied (all committed to `main`, pushed to GitHub Pages + phone):

1. **Script tags fix** (`e806f8a`) — Added `broadcast.js` + `data-store.js` to all 4 HTML files
2. **Console capture fix** (`e806f8a`) — `window.supabaseClient` → `supabaseClient` (const doesn't attach to window)
3. **www/ directory sync** — Discovered Capacitor copies from `www/`, not repo root. All new files were missing from phone builds. Fixed by rsync root→www before `cap sync`.
4. **Cloud report sync** (`5fd38c9`) — Added `syncReportsFromCloud()` to `data-store.js` for cross-device consistency
5. **Timeout bumps** (`5fd38c9`) — IDB 4s→6s, auth 5s→8s, cloud projects 8s→12s
6. **Blocklist removal from sync** (`f9af929`) — Stopped deleted blocklist from interfering with cloud sync
7. **RLS query fix** (`02ad297`) — Removed `getSession()` wrapper, query directly like cloud-recovery does

### Merged feature branch → main
- `feature/data-layer-overhaul` fully merged to `main` at commit `e806f8a`
- All subsequent fixes are on `main` directly

---

## 2. Current State

### What's Working ✅
- IDB as source of truth — all pages initialize `dataStore` correctly
- Console capture → Supabase `debug_logs` table — logs flowing from both phone and desktop
- Supabase sync — reports save to `reports`, `report_data`, `interview_backup` tables
- Realtime subscriptions — SUBSCRIBED on all pages, properly skips self-echoes
- Cross-device sync — `syncReportsFromCloud()` pulls reports from Supabase on dashboard load
- PDF generation and submission working
- Auth working on both devices (`jackson@advidere.co`)

### What's Broken / In Progress 🔴
1. **User isolation** — `syncReportsFromCloud()` has no user_id filter, pulling ALL users' reports (21 instead of 8). Sub-agent fixing this NOW.
2. **Soft delete not implemented** — Old delete flow removed from localStorage only, never cleaned Supabase. Reports marked "deleted" locally keep resurrecting via cloud sync. Sub-agent implementing soft delete (status='deleted') NOW.
3. **Timeouts firing on EVERY page load** — All Promise.race timeouts fire even though data loads fine. The timeout promises resolve AFTER the actual data, meaning the data loads but the timeout warning also fires. Needs investigation — Jackson wants to consult ChatGPT on this.
4. **www/ directory not in git** — .gitignored, must manually rsync before `cap sync`

### Completed Sub-Agent Work (committed as 5cb0f0c)
- Soft delete implemented in delete-report.js
- User isolation + status filter in data-store.js syncReportsFromCloud()
- cloud-recovery.js verified — already excludes deleted

### Still Broken: Deletion UI Flow
- Soft delete IS updating Supabase (4 reports now show status='deleted')
- But Jackson reports deletion "not working" from the UI
- **NEXT SESSION MUST:** Check debug_logs for delete-related errors, trace the full delete flow from button tap → deleteReportFull() → Supabase update, and verify the dashboard re-renders after deletion

---

## 3. Architecture (Current)

```
User Action → data-store.js writes IDB → UI updates from IDB
                                       → Background sync to Supabase
                                       → localStorage gets only pointer

Dashboard Load → IDB local render (instant)
              → syncReportsFromCloud() reconciles IDB with Supabase
              → Re-render if changes found

Supabase Change → Realtime → data-store.js writes IDB
               → BroadcastChannel → other tabs update

Delete → data-store.js removes from IDB
       → Supabase UPDATE status='deleted' (soft delete) [PENDING]
       → localStorage blocklist (legacy, being phased out)
```

---

## 4. Key Decisions Made

1. **Supabase is the source of truth** for cross-device sync. IDB is the local cache.
2. **Soft delete** — reports get `status='deleted'` in Supabase, not hard DELETE. Preserves data for recovery.
3. **Deleted blocklist being phased out** — was device-local, caused cross-device conflicts. Cloud sync replaces its purpose.
4. **No code changes without Jackson's explicit approval** — propose → wait → implement.
5. **www/ must be synced** before `cap sync ios` — rsync command in deploy workflow.

---

## 5. Supabase State

### Reports (for jackson@advidere.co, user_id: 5252f131-ee42-4349-9d1d-4531f591a8e3)
| ID (short) | Status | Date |
|-----------|--------|------|
| fced90a0 | draft | 2026-02-17 |
| 0fe5bec1 | refined | 2026-02-17 |
| 43c31bf6 | submitted | 2026-02-17 |
| ac2ce3a9 | refined | 2026-02-17 |
| b6d9f944 | draft | 2026-02-17 |
| 772b0f45 | refined | 2026-02-17 |
| a0c07a0e | refined | 2026-02-17 |
| 760070ae | refined | 2026-02-11 |

### Other users also have reports — DO NOT clean up (needed for testing user isolation)

### debug_logs table
- Console capture working, anon INSERT allowed
- Clear with: `curl -X DELETE` (see HANDOFF_2026-02-17_LATE.md for commands)

---

## 6. Deploy Workflow

```bash
# 1. Sync www from root
cd ~/projects/V69
rsync -av --delete \
  --exclude='ios/' --exclude='www/' --exclude='node_modules/' \
  --exclude='.git/' --exclude='docs/' --exclude='.github/' \
  --exclude='package.json' --exclude='package-lock.json' \
  --exclude='capacitor.config.json' --exclude='tsconfig.json' \
  --exclude='README.md' --exclude='.gitignore' \
  --exclude='capacitor.config.ts' \
  ./ www/

# 2. Capacitor sync
npx cap sync ios

# 3. Build
cd ios/App && xcodebuild -project App.xcodeproj -scheme App \
  -destination 'id=00008110-001A6D303446201E' -configuration Debug build

# 4. Deploy to phone
ios-deploy --bundle ~/Library/Developer/Xcode/DerivedData/App-cvpqszcuxmlssvemhqpiateqzops/Build/Products/Debug-iphoneos/App.app \
  --id 00008110-001A6D303446201E --justlaunch

# 5. Push to GitHub Pages
git push origin main
```

---

## 7. Outstanding Issues (Future)

- **Timeout investigation** — all Promise.race timeouts fire on every load. Needs deeper analysis.
- **Form function duplication** — interview/ and report/ share 9+ functions, should extract to shared
- **Cloud recovery vs sync overlap** — cloud-recovery.js partially duplicates syncReportsFromCloud(). Should consolidate.
- **Safe-area-inset CSS** — zero safe-area handling despite viewport-fit=cover
- **Accessibility** — 20+ unlabeled buttons, 0 label-for, contrast fails

---

## 8. CRITICAL RULES

- **NEVER commit/push/deploy without Jackson's explicit approval**
- **Present changes as numbered proposals FIRST, then WAIT**
- **Jackson is a vibe coder — he works through prompts, not direct coding**
- **Use sub-agents for implementation, George for orchestration**
- **www/ must be rsynced before cap sync — it's gitignored**

---

## 9. Key Files

| File | Purpose |
|------|---------|
| `js/shared/data-store.js` | IDB owner, syncReportsFromCloud |
| `js/shared/broadcast.js` | BroadcastChannel for cross-page events |
| `js/shared/console-capture.js` | Debug logging to Supabase |
| `js/shared/delete-report.js` | Delete cascade (local + cloud) |
| `js/index/main.js` | Dashboard init, refreshDashboard |
| `js/index/cloud-recovery.js` | Cross-device draft recovery |
| `js/shared/realtime-sync.js` | Supabase Realtime subscriptions |
| `js/storage-keys.js` | Storage constants, pointers only |

## 10. Environment

- **Repo:** ~/projects/V69/ (branch: main)
- **Supabase:** bdqfpemylkqnmeqaoere
- **Test account:** simtest@fieldvoice.dev / TestSim2026!
- **Jackson's account:** jackson@advidere.co (user_id: 5252f131-ee42-4349-9d1d-4531f591a8e3)
- **Phone:** iPhone 14, UDID 00008110-001A6D303446201E
- **Desktop:** GitHub Pages (jacksonkoerner.github.io/V69)
