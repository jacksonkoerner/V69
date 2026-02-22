# Device ID Investigation — Full System Audit

**Date:** 2026-02-22
**Auditor:** Codex 5.3
**Status:** Investigation only — no code changes made

## Part A: Supabase usage of `device_id`

### Tables with device_id

| Table | Column | Purpose | References |
|-------|--------|---------|------------|
| `user_profiles` | `device_id` | **Legacy** — stores last device. Being replaced by `user_devices` | `js/login/main.js:86`, `js/auth.js:160`, `js/settings/main.js:215` |
| `user_devices` | `device_id` | **Authoritative** multi-device tracking. `UNIQUE(user_id, device_id)` | `supabase/migrations/007_user_devices.sql:8,12` |
| `reports` | `device_id` | **Metadata** — which device created/edited this report | `js/index/report-creation.js:29`, `js/report/submit.js:143` |
| `debug_logs` | `device_id` | **Debugging** — which device generated this log | `js/shared/console-capture.js:56` |

### RLS policies using device_id? **None.** All RLS uses `auth_user_id` or `org_id`.

### Sent to Edge Functions/n8n?
- Only AI chat includes `deviceId` in context payload (`js/shared/ai-assistant.js:727`)
- Edge functions don't use it for any logic — just pass through to n8n
- Other 3 Edge Functions don't include device_id at all

## Part B: Frontend usage beyond profile caching

| Usage | Where | Purpose |
|-------|-------|---------|
| Report upserts | `report-creation.js:29`, `autosave.js:273`, `submit.js:143`, `persistence.js:1066`, `sync.js:166` | Metadata tag on report rows |
| Interview sync tag | `persistence.js:515, 769` | `_sync.device_id` — tagged but never read for conflict logic |
| Debug logging | `console-capture.js:56` | Attribution for error investigation |
| AI chat context | `ai-assistant.js:727` | Passed to n8n in payload |

**Key finding:** `device_id` is **never used for merge/conflict decisions**. It's write-only metadata everywhere except the `userProfile` IDB cache bug.

## Part C: device_id vs user identity relationship

### user_profiles table
- Has BOTH `auth_user_id` (unique) and `device_id` (legacy, single value)
- `auth_user_id` is the primary key for lookups: `js/data-layer.js:242`, `js/settings/main.js:219`
- `device_id` described as "informational/write-only": `js/settings/main.js:214`
- CODEBASE_REVIEW confirms: "device_id (singular text) is a legacy field — user_devices table now tracks multiple devices": `docs/CODEBASE_REVIEW.md:2337`

### Multi-device / shared device behavior
| Scenario | auth_user_id | device_id | Result |
|----------|-------------|-----------|--------|
| One user, multiple devices | Same | Different per device | `user_devices` tracks all; `user_profiles.device_id` = latest only |
| Shared device, multiple users | Different per user | Same | Both users share the `fvp_device_id` in localStorage (persists across sign-out) |
| New device login | Same | New UUID | `user_devices` gets new row; `user_profiles.device_id` overwritten |

## Part D: Fix approach evaluation

### Approach A: Change IDB keyPath to `authUserId` ⭐ RECOMMENDED
**Pros:**
- Aligns local cache with cloud identity (Supabase uses `auth_user_id` for all profile queries)
- Prevents shared-device cross-user cache confusion
- Consistent with the architecture's auth-first direction

**Cons:**
- Requires IDB version bump (store keyPath change)
- Need migration logic for existing cached data
- Pre-auth state needs fallback

**Risk:** Low — one-time migration, clear direction

### Approach B: Keep keyPath `deviceId`, fix reads to also use `deviceId`
**Pros:**
- Smallest code change, no IDB migration
- "Just make both sides match"

**Cons:**
- Keeps the legacy identity model
- Shared device = wrong profile if two accounts use same browser
- Goes against the codebase's auth-first direction

**Risk:** Medium — works today, creates future problems

### Approach C: Dual-key (store under both)
**Pros:**
- Backward compatible transition
- Both old and new code paths work

**Cons:**
- Complex (dual writes, dual reads, reconciliation)
- Stale divergence risk between keys
- Harder to reason about

**Risk:** High complexity for marginal benefit

## Bottom Line

`device_id` serves 3 clear roles in the system:
1. **Report metadata** — "which device made this" (write-only, never queried)
2. **Debug attribution** — log filtering in `scripts/check-errors.sh`
3. **Multi-device tracking** — via `user_devices` table (not `user_profiles`)

It is NOT used for profile identity, cache keying, merge logic, or RLS.

**The profile cache should be keyed by `authUserId` (Approach A).** The `device_id` field should remain on reports, logs, and `user_devices` as metadata — it just shouldn't be the IDB cache key for user profile data.
