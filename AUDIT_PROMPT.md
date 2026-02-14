# FieldVoice Pro v6.9 — Full Codebase Audit

## Project Overview
FieldVoice Pro is a Progressive Web App (PWA) for DOT construction inspectors to capture daily field reports using voice notes, photos, and structured data. Reports are AI-processed via n8n webhooks into professional PDF daily reports.

**Stack:** Vanilla JavaScript (no framework), HTML, Tailwind CSS (CDN), Supabase (PostgreSQL + Auth + Storage + Realtime), IndexedDB + localStorage, GitHub Pages hosting.

**Pages:** Dashboard (index.html), Voice/text capture (quick-interview.html), AI-refined report editor (report.html), Archives (archives.html), Permissions onboarding (permissions.html), Project config (project-config.html), Settings (settings.html), Login (login.html).

**Key architecture:**
- Supabase is source of truth. IndexedDB is primary local cache. localStorage is for flags/settings only.
- Auth: Supabase Auth (email/password), org_id-based multi-tenancy.
- Organizations table + org_id on users, projects, reports for tenant isolation.
- Real-time sync via Supabase Realtime subscriptions.
- Photos upload in real-time during capture (not batched).
- Service Worker for offline capability.

## What Was Just Done (14 sprints in one day)
We just completed 14 sprints taking the functional spec from 95 open items to 0:
1. Fixed project_id swap bug
2. STORAGE_KEYS cleanup, standardized localStorage access
3. Deduplicated shared utilities
4. Cross-platform foundation (report_data table, Supabase read/write)
5. Removed ACTIVE_PROJECT_ID from interview/report pages
6. Code hygiene (cleanupLocalStorage, inline scripts, date fields)
7. Spec audit + interview_backup recovery
8. Organizations foundation (org_id on users/projects/reports)
9. Dashboard polish (submit redirect, dual field checks)
10. Data sync (fvp_current_reports to IndexedDB, device metadata)
11. Draft data to IndexedDB + Supabase, getReport recovery chain
12. Real-time photo upload, archive offline caching
13. Multi-device Realtime sync, merged final_reports into reports table
14. FK constraint reports→projects, SW scope fix, swipe-to-delete

## Your Task
Perform a comprehensive audit of this entire codebase. You have access to ALL files. Examine every JS module, every HTML page, every interaction pattern.

### Specifically evaluate:

**1. Bugs & Logic Errors**
- Race conditions (async operations, Supabase calls, IndexedDB operations)
- Null/undefined access patterns
- Edge cases in data flows (empty projects, no reports, offline mode)
- Auth edge cases (token expiry mid-session, stale sessions)
- Data loss scenarios (interrupted saves, failed uploads, quota exceeded)

**2. Architecture & Code Quality**
- Module dependencies and load order (no bundler — script tags matter)
- Global state management (window.interviewState, etc.)
- Error handling patterns (are catches actually handling or swallowing?)
- Memory leaks (event listeners not cleaned up, Realtime subscriptions)
- Code duplication across modules

**3. Security**
- XSS vectors (innerHTML usage, user input rendering)
- Auth bypass possibilities (page access without valid session)
- Data leakage between organizations (org_id filtering gaps)
- Exposed credentials or API keys in client code
- CORS and CSP concerns

**4. Mobile / PWA**
- iOS Safari quirks (storage eviction, permission handling, audio recording)
- Service Worker correctness (cache strategy, update flow, scope)
- Offline behavior (what works, what silently fails)
- Touch interaction issues
- Viewport and responsive layout problems

**5. Performance**
- Unnecessary re-renders or DOM operations
- Large synchronous operations blocking the UI
- Network waterfall issues (sequential fetches that could be parallel)
- Storage bloat (localStorage/IndexedDB growing unbounded)
- Bundle size concerns (CDN dependencies, unused libraries)

**6. Data Integrity**
- Supabase RLS policies (are they in place and correct?)
- Duplicate report/project creation scenarios
- Draft conflict resolution (multi-device edits)
- Photo orphaning (uploaded but never linked to a report)
- Migration safety (old data formats hitting new code)

### Output Format
Organize your findings as:
```
## CRITICAL (must fix before production)
- [Bug/Security/Data] Description — file:line — impact — suggested fix

## HIGH (should fix soon)
- ...

## MEDIUM (improvement opportunities)
- ...

## LOW (nice to have)
- ...

## ARCHITECTURE NOTES
- Observations about overall structure, patterns, recommendations
```

Be specific. Reference exact files and line numbers. Don't pad with generic advice — only report real issues you find in the actual code.
