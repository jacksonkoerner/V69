# 🔄 Handoff Doc — Feb 18, 2026 (Morning Session)

> Written at 2:05 AM CST after a deep late-night session.
> **Goal:** Get George (or any AI) fully up to speed on FieldVoice Pro's current state, what we've done, what's next, and Jackson's full wishlist.

---

## 📍 Where We Are

**Repo:** `~/projects/V69/` → https://github.com/jacksonkoerner/V69 (branch: `main`)
**Supabase:** `bdqfpemylkqnmeqaoere` (FieldVoice-Pro-v69 sandbox)
**Live:** GitHub Pages (auto-deploy on push to main)
**Stack:** Vanilla JS (no frameworks), Supabase JS v2, Capacitor (iOS wrapper)

---

## 🔧 What We Fixed Tonight (Feb 17-18 Late Session)

### Commits Pushed (chronological):
| Commit | What |
|--------|------|
| `a17defa` | Dashboard delete resurrection fix — deleted reports no longer come back |
| `789d085` | `await deleteReportFull()` before navigation on report.html + quick-interview.html; removed dead `deleteReportFromSupabase()`; `withTimeout()` cleanup |
| `fe79238` | **THE BIG ONE** — Realtime was poisoning IDB cache with null `ai_generated`/`original_input` (Supabase strips JSONB >64 bytes from Realtime payloads). Neutered `_handleReportDataChange()` to metadata-only. Made `loadReport()` detect null content and fall through to REST. |
| `b2575b6` | Step 1: Fixed dirty-flag data loss bug in `flushInterviewBackup()`, standardized `window.idb` → `window.dataStore` in `getReport()`, re-dirty on flush failure |
| `6d0bd43` | Step 2: Added sync metadata (`device_id`, `session_id`, `revision`) to every `interview_backup` payload |
| `c517db6` | Steps 3-4: Durable IDB outbound queue (survives iOS kills via localStorage stale flags + IDB replay) + reduced interview_backup debounce from 5s → 2s |

### Why This Matters
The core data flow is now **significantly more reliable**:
- Deleted reports stay deleted (no resurrection)
- Cross-device report viewing works (IDB cache can't be poisoned by Realtime)
- Interview draft backups won't silently drop data on flush failure
- iOS kills are survivable (outbound queue replays on next page load)
- Cross-device data staleness window cut from 5s to 2s

---

## 🏗️ Data Architecture (Current State)

### The Three Layers
```
┌─────────────────────────────────────────────────────┐
│                    USER TYPES                        │
├─────────────────┬───────────────┬───────────────────┤
│  IndexedDB      │  Supabase     │  Supabase         │
│  (dataStore)    │  interview_   │  Realtime          │
│                 │  backup       │  (notifications)   │
│  LOCAL CACHE    │  CLOUD TRUTH  │  CHANGE SIGNALS    │
│  500ms debounce │  2s debounce  │  metadata only     │
│  Instant        │  Network      │  Never write data  │
└─────────────────┴───────────────┴───────────────────┘
```

### Key Principle: Realtime = Notification Layer, NOT Data Transport
Supabase Realtime has a 1MB payload limit and strips large JSONB columns. **Never trust Realtime payloads for content.** Use them as "something changed" signals, then fetch full data via REST API.

### Interview Draft Persistence Chain
```
User edits → saveReport()
  → _syncRevision++ (monotonic counter)
  → IDB save (500ms debounce) + mark backup stale
  → Supabase interview_backup (2s debounce)
  → On success: clear stale flag
  → On failure: re-dirty flag, next save cycle retries

Page kill recovery:
  → pageshow/online/init → drainPendingBackups()
  → Reads stale flags from localStorage
  → Loads draft from IDB → flushes to Supabase
```

### Report Data (report.html) Flow
```
Load report → IDB check → if ai_generated AND original_input both null → REST fallback
Realtime → metadata only (status, captureMode, userEdits) → never writes content
Save edits → IDB + Supabase report_data (via autosave)
```

### Supabase Tables (Key Ones)
| Table | Purpose | Written By |
|-------|---------|-----------|
| `reports` | Report metadata (id, project, date, status) | interview/persistence.js, report/autosave.js |
| `report_data` | AI-generated content + user edits | finish-processing.js (after AI refine) |
| `interview_backup` | Draft page_state snapshots | interview/persistence.js (2s debounce) |
| `report_backup` | Report page state snapshots | report/autosave.js |
| `projects` | Project config + contractors (JSONB) | project-config.html |
| `photos` | Photo metadata | interview/persistence.js |
| `debug_logs` | Console capture logs | console-capture.js |

### Sync Metadata (NEW — Step 2)
Every `interview_backup` now includes `page_state._sync`:
```json
{
  "_sync": {
    "device_id": "abc123...",     // persistent per browser (localStorage)
    "session_id": "sess_17714...", // unique per page load
    "revision": 42                 // monotonic, increments on every saveReport()
  }
}
```
This is the foundation for conflict detection in the Broadcast sync (Steps 5-6).

---

## 🎯 Next Steps: Cross-Device Real-Time Sync (Steps 5-8)

### Background
Jackson wants real-time cross-device sync for the quick-interview page — edit on iPhone, see changes live on desktop. We audited this with both George and Codex (GPT-5.3). Both agree on a hybrid approach.

### The Plan (Codex-recommended, Jackson-approved)
| Step | Status | Description |
|------|--------|-------------|
| 1 | ✅ DONE | Fix baseline (dirty flag, window.dataStore, re-dirty on failure) |
| 2 | ✅ DONE | Add sync metadata (device_id, session_id, revision) |
| 3 | ✅ DONE | Durable IDB outbound queue (survives iOS kills) |
| 4 | ✅ DONE | Reduce debounce 5s → 2s |
| 5 | 🔜 NEXT | **Broadcast channel per report** — Supabase Broadcast on topic `interview:<reportId>`, send compact patch + revision + device_id |
| 6 | 🔜 | **Inbound merge engine** — ignore own messages, apply only if revision is newer, detect gaps and fetch full snapshot |
| 7 | 💡 Optional | Subscribe to `interview_backup` via postgres_changes as fallback invalidation trigger |
| 8 | 🔜 | **Instrument and test** — metrics, device-switch tests, offline→online tests |

### Risks to Watch (from Codex audit)
- **Echo loops:** Must tag messages with device_id to ignore self
- **Out-of-order delivery:** Need monotonic revision counter (already in place)
- **Reconnect gaps:** Device can miss broadcasts while offline — must detect gap and fetch full snapshot
- **UX clobber:** Applying remote changes to focused textarea disrupts cursor
- **Rate limits:** Supabase Realtime has payload/rate constraints — keep patches compact

### Audit Docs
- `~/projects/V69/docs/AUDIT_DELETE_AND_TIMEOUTS.md` — George's delete/timeout audit
- `~/projects/V69/docs/CODEX_AUDIT_DELETE_TIMEOUTS.md` — Codex audit of same
- `~/projects/V69/docs/CODEX_AUDIT_REPORT_DATA_SYNC.md` — Codex report_data sync audit (found the 1MB Realtime limit issue)

---

## 📋 Jackson's Full Wishlist (Captured Feb 18, 2:00 AM)

### High Priority — Core Functionality
1. **Steps 5-8:** Broadcast real-time sync (see above)
2. **Job Calendar page** — Supabase-backed, cross-device compatible
3. **Messages page** — Supabase-backed, cross-device compatible
4. **AI Assistant improvements:**
   - Add a "clear chat" button (currently no way to reset conversation)
   - Make it conversational (maintain context across messages, not one-shot)

### Medium Priority — UX/UI Fixes
5. **Remove "Edit Report" button** on bottom of report.html
6. **Add more photos** capability on report.html (currently can only add during interview)
7. **Dashboard project cards redesign** — Jackson wants to explore a different scrolling mechanism; current layout doesn't feel right. **⚠️ BE CAREFUL** — do not break core functionality around project cards
8. **App icon (PWA)** — icon exists but isn't displaying properly when saved to home screen on iOS. May need Apple-specific icon conversion.

### Low Priority — Permissions & New Features
9. **Permissions page rework** — may need additional permission screens for:
   - Compass access
   - AR camera/measuring tool
10. **Remove AI agent from permissions pages** — not necessary, pages may be redesigned anyway

### 🔥 EXCITING — AR Camera Feature
11. **AR measuring/camera tool** — Jackson is very excited about this. Wants to:
    - Integrate AR measuring capability directly into the app
    - There's existing Swift code on GitHub for AR measurement
    - Wants to demo this in a meeting soon
    - Potential approach: embed Swift AR code via Capacitor plugin or WebXR
    - **This is a showcase feature** — Jackson wants to impress people with it
    - We may work on a proof-of-concept tonight/soon

---

## ⚙️ Key Files Reference

### Core Interview Persistence
- `js/interview/persistence.js` — Draft save/load/flush, outbound queue, sync metadata
- `js/interview/main.js` — Init, lifecycle hooks, drain triggers
- `js/interview/state-mgmt.js` — Interview state namespace, entries, toggles
- `js/shared/realtime-sync.js` — Supabase Realtime subscriptions (reports, report_data, projects)
- `js/shared/broadcast.js` — BroadcastChannel for cross-tab sync (local only, not cross-device)
- `js/shared/data-store.js` — All IDB operations (reports, drafts, photos, projects)
- `js/shared/supabase-retry.js` — Exponential backoff retry wrapper

### Report Viewing/Editing
- `js/report/autosave.js` — Report page autosave to Supabase
- `js/report/submit.js` — Final submission flow
- `js/index/report-cards.js` — Dashboard report card rendering
- `js/index/cloud-recovery.js` — Cross-device report recovery on dashboard load

### Config
- `js/storage-keys.js` — All localStorage key constants + `getDeviceId()`
- `js/data-layer.js` — Data access layer (projects, settings, cloud sync)

---

## 🚫 Rules (ALWAYS ACTIVE)

1. **NEVER commit/push/deploy without Jackson's explicit approval**
2. **Present changes as numbered proposals FIRST, then WAIT**
3. **Use sub-agents (Codex, Claude Code) for implementation when appropriate**
4. **Deploy workflow:** `rsync www/` → `cap sync ios` → build → deploy
5. **Jackson is a vibe coder** — works through prompts, not direct coding
6. **Supabase sandbox only** (`bdqfpemylkqnmeqaoere`) — NEVER touch production (`wejwhplqnhciyxbinivx`)

---

## 🧑‍💻 How We Work Together

- Jackson describes what he wants in natural language
- George (AI) proposes a numbered plan
- Jackson approves/modifies
- George implements (or delegates to Codex/sub-agent)
- George commits with descriptive messages
- Jackson tests on device
- Iterate

**Communication style:** Direct, practical, no fluff. Jackson likes proactive suggestions but wants final say on all changes.

**Testing approach:** George runs audits (both his own analysis + Codex second opinions), presents findings, Jackson decides what to fix. Always get a second opinion on complex changes.

---

## 📊 Session Stats

Tonight's session covered:
- 4 bug fixes (delete resurrection, navigation await, Realtime poisoning, dirty flag)
- 4 infrastructure improvements (sync metadata, outbound queue, debounce reduction, standardized IDB API)
- 2 independent audits (George + Codex) on cross-device sync architecture
- 6 commits pushed to main
- Foundation laid for real-time Broadcast sync (Steps 5-8 ready to go)
