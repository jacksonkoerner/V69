# FieldVoice Pro V6.9 — Comprehensive App Review

**Date:** Saturday, February 14, 2026  
**Tester:** Automated QA (Clawdbot)  
**Test Account:** simtest@fieldvoice.dev  
**Environment:** Desktop browser (Chromium), GitHub Pages deployment  
**Screenshots:** `docs/screenshots/` (17 captures)

---

## 1. Executive Summary

FieldVoice Pro V6.9 is a well-structured mobile-first PWA for DOT-compliant field reporting. The app demonstrates **strong information architecture** — the dashboard is comprehensive, project management is solid, and the report creation flow is logical and efficient. The visual design uses a consistent construction-industry aesthetic (hazard stripes, hard-hat iconography, safety-orange accents) that's immediately recognizable.

**Key Strengths:**
- Clean, professional UI with consistent branding
- Excellent report creation flow (project select → capture mode → quick notes)
- Dashboard report cards with expandable details work well
- Comprehensive field tools section
- Settings page is thorough with good data pre-population

**Primary Concerns:**
- Multiple timeout warnings on dashboard load (IDB, projects, auth, weather)
- Duplicate projects appearing throughout the app
- Weather data perpetually shows "Unavailable" / "Syncing..."
- `report.html` redirects draft reports back to interview instead of showing editor
- Landing page has empty content sections (placeholder gaps)
- Several "Coming Soon" features that may confuse users

**Overall Rating:** 7/10 — Solid foundation with clear polish opportunities

---

## 2. Page-by-Page Analysis

### 2.1 Dashboard (index.html)
**Screenshot:** `01-dashboard.jpg`, `08-dashboard-with-report-card.jpg`, `16-dashboard-details-expanded.jpg`

#### Layout & Structure
The dashboard is the central hub and it's well-organized with a clear visual hierarchy:
1. **Header** — "RPR Inspection System" with hazard stripe, date, settings/projects buttons
2. **Weather + Drone Ops** — Two-column widget bar
3. **Project Cards** — List of active projects with report status
4. **"Begin Daily Report" CTA** — Prominent, dark button with + icon
5. **Field Tools** — Horizontal scroll carousel
6. **Report Archives** — Link card
7. **Emergency Info** — Red sticky banner (always visible)
8. **Additional Modules** — Job Calendar, Messages, Deliveries, Photo Log Map

#### What's Working Well
- **Visual hierarchy is excellent** — The big "BEGIN DAILY REPORT" button is the clear primary action
- **Report cards** with DRAFT badges, timestamps, and expandable Details are very informative
- **Delete button** on report cards is appropriately placed with trash icon
- **Field Tools carousel** has good icons and labels
- **Emergency Info banner** is always visible and appropriately attention-grabbing in red
- **Version number** (v6.9) in footer is good for debugging

#### UI Issues
- **Weather widget shows "--°" and "Unavailable"** — Even with fallback, this looks broken to users. Should show a more helpful message or last-known data
- **Drone Ops widget** shows "--" for everything — Same issue
- **Duplicate "Express Shuttle Connector Road"** projects appear — This is a data issue but creates confusion
- **All three projects show "#1291"** — Even different projects share the same project number
- **Field Tools carousel** items appear duplicated (the carousel seems to duplicate its content for infinite scroll, but you can see both sets at once on wider screens)
- **"Job Calendar - Coming Soon"** — Either hide or provide an ETA
- **Messages widget** shows hardcoded "Mike R: Concrete delivery moved to 2pm" with "2h ago" — This appears to be demo/placeholder data

#### UX Issues
- **No loading indicator** when weather is syncing on initial load
- **The Emergency Info bar** overlaps content when scrolling — it's position:fixed and covers the Messages section partially
- **Clicking project headers** toggles the report accordion but the tap target is small
- **"Details" toggle** reveals UUID, Mode, Project — useful for debugging but may confuse non-technical users

#### Console Warnings (Critical)
On every dashboard load, these timeouts fire in sequence:
```
[INDEX] IDB hydration timed out after 3000ms
[INDEX] loadProjects timed out after 4000ms
[INDEX] auth.ready timed out after 5000ms
[INDEX] refreshProjectsFromCloud timed out after 8000ms
[INDEX] syncWeather timed out after 15000ms
```
This suggests the app is falling back to local data on every load, which explains the stale weather data and potential sync issues.

---

### 2.2 Settings (settings.html)
**Screenshot:** `02-settings.jpg`

#### Layout & Structure
Well-organized vertical form with clear sections:
1. Personal Information (Name, Title, Company, Email, Phone)
2. Report Signature Preview
3. Manage Projects link
4. Setup & Permissions link
5. Troubleshooting (Refresh App)
6. Account (Sign Out)
7. Admin (Reset All Data)
8. Save Profile / Refresh from Cloud

#### What's Working Well
- **Profile is auto-populated** — "Sim Tester", "RPR", "Test Engineering Co", email all filled in ✅
- **Report Signature Preview** showing "Sim Tester, RPR (Test Engineering Co)" is a great touch
- **Section headers** with colored banners (green, navy, red) create clear visual separation
- **Helper text** under fields ("RPR = Resident Project Representative") is helpful
- **Destructive actions** (Reset, Sign Out) are appropriately styled in red/warning colors

#### UI Issues
- **Phone field** is empty but marked "(Optional)" — This is fine
- **"REFRESH APP" button** description is quite long and technical for the target audience
- **"RESET ALL DATA"** in red with warning triangle — Good but the description "Deletes all local data. Device will act like fresh install" should be bolder/scarier
- **Two bottom buttons** (Save Profile / Refresh from Cloud) — "Refresh from Cloud" note "(must Save to keep)" could be clearer
- **Back arrow (←)** in header is small — could be a larger tap target for mobile

#### UX Issues
- **No unsaved changes warning** — If a user changes their name and navigates away, changes are lost silently
- **"Manage Projects" and "Setup & Permissions"** are buried in the middle — These are important actions that could be more prominent

---

### 2.3 Projects (projects.html)
**Screenshot:** `03-projects.jpg`

#### Layout & Structure
Simple list view with project cards, each showing:
- Project name
- Project number
- Location
- Status badge (ACTIVE)
- Edit button (pencil icon)
- Collapsible contractor count

#### What's Working Well
- **Clean card layout** — Each project card has all essential info at a glance
- **ACTIVE status badge** in green is clear
- **Edit button** clearly separated from the card tap area
- **"+ NEW PROJECT" button** is prominent at the bottom
- **Contractor count** is collapsible to save space
- **Instruction text** ("Tap to select, use edit button to modify") is helpful

#### UI Issues
- **Duplicate projects** — "Express Shuttle Connector Road" appears twice with identical info (#1291, same location, 7 contractors each)
- **All projects share #1291** — Even "North-South Connector Road Phase 2" shows #1291
- **Refresh button (🔄)** in header — Purpose unclear without a label
- **Home button (🏠)** in header — Good but could have a label for accessibility

#### UX Issues
- **No search/filter** — With many projects, users would need search
- **No project status indicator** beyond ACTIVE — What about completed, on-hold?
- **Tapping a project card** vs **tapping the edit button** — The instruction helps but the UX could be more intuitive

---

### 2.4 Project Configuration (project-config.html)
**Screenshot:** `04-project-config.jpg`

#### Layout & Structure
Comprehensive form divided into sections:
1. Import From Existing Report (drag-drop file upload)
2. Project Details (name, number, location, engineer, contractor)
3. Contract Information (dates, durations, times)
4. Contractor Roster (list with edit/delete)

#### What's Working Well
- **Import from existing report** — Drag-and-drop file upload for PDF/DOCX is a powerful feature
- **Project logo** — Unique touch, shows the hard-hat mascot with construction equipment
- **Contract information** is thorough — Notice to Proceed, duration, weather days, contract day, expected completion, default times
- **Contractor roster** is well-organized — Shows name, abbreviation badge, type (Prime/Subcontractor), specialties, crew management
- **Color-coded delete buttons** (red trash) are clear
- **"+ Add Crew"** links under each contractor

#### UI Issues
- **"CNO Solicitation No."** — Abbreviation may not be clear to all users
- **Date pickers** use native browser controls — Works but looks inconsistent across browsers
- **Time pickers** (06:00 AM / 04:00 PM) — Good default values
- **Contractor abbreviation badges** (HGBM, BOH, KASS, etc.) could use more explanation
- **DELETE PROJECT button** is at the very bottom in red — This is appropriate placement for a destructive action

#### UX Issues
- **Very long form** — On mobile, this is a lot of scrolling. Consider tabbed sections
- **No progress indicator** — User doesn't know how far through the form they are
- **"Browse Files" button** for import — Good but no visual feedback after file selection
- **Contractor specialties** text is small and cramped (e.g., "PILE DRIVING; UTILITIES; CONCRETE PVMT; ASP PVMT; EARTHWORK")

---

### 2.5 Report Creation Flow
**Screenshots:** `05-project-selection-modal.jpg`, `06-capture-mode-selection.jpg`

#### Project Selection Modal
- Clean modal overlay with project list
- Each project shows icon, name, project number, location
- "Manage Projects" link at bottom
- Close (×) button in top-right

#### Capture Mode Selection
- Clear choice between **Quick Notes** and **Guided Sections**
- Good descriptions for each:
  - Quick Notes: "One text box + photos — Dictate everything freely. AI organizes it later."
  - Guided Sections: "Work • Issues • Safety • Photos — Light structure. Fill in each section."
- Header shows project name and date

#### What's Working Well
- **Two-step flow** (select project → choose mode) is logical and quick
- **Copy is excellent** — Descriptions make the difference between modes immediately clear
- **Back arrow and X button** in header give clear escape routes
- **Icons** (lightning bolt for Quick, list for Guided) are visually distinct

#### UI Issues
- **Project names truncated** in modal — "North-South Connector Road Pha..." is cut off
- **No search** in project selection modal — Fine for 3 projects, problematic for 20+
- **Lots of whitespace** on capture mode selection page — Works on mobile but feels empty on desktop

---

### 2.6 Quick Interview (quick-interview.html)
**Screenshot:** `07-quick-interview.jpg`, `09-quick-interview-reopened.jpg`

#### Layout & Structure
1. Header with project name and date
2. Weather widget (syncing)
3. Coverage Checklist (10 categories in 2-column grid)
4. Field Notes section with "+ Add Entry"
5. Progress Photos section
6. "FINISH & PROCESS" floating button (green)

#### What's Working Well
- **Coverage checklist** is a great feature — Weather, Work Performed, Contractors, Equipment, Issues, Communications, QA/QC, Safety, Visitors, Photos
- **Checklist layout** in 2-column grid is space-efficient
- **"+ Add Entry" button** with keyboard mic hint is good for the voice-first workflow
- **"FINISH & PROCESS"** is a prominent sticky CTA
- **Header** shows back arrow, cancel (X), project name, date, and a settings icon

#### UI Issues
- **Weather shows "Syncing..." permanently** with "--° / --°" — Geolocation blocked, so weather can never resolve
- **"TAP TO ADD PHOTOS" button** — Looks like a button but is just text; could be more prominent
- **"Use keyboard mic to dictate"** hint — Good but small and might be missed
- **No entries yet / No photos yet** — Empty state could be more engaging

#### UX Issues
- **Coverage checklist** checkboxes are passive — They don't seem to do anything beyond visual tracking. Are they saved?
- **"FINISH & PROCESS"** overlaps the bottom of the content area — Could hide the photo section
- **Back arrow (←)** vs **Cancel (×)** — What's the difference? Back saves, Cancel discards? Not clear
- **Settings icon** (⇌) in top-right — Purpose unclear

---

### 2.7 Report Editor (report.html)
**Screenshot:** `10-report-editor.jpg`

#### Key Finding
When navigating to `report.html?reportId=...` for a **draft** report, the app redirects back to `quick-interview.html`. Console warning confirms:
```
[LOAD] Report is in draft status — redirecting to interview for re-processing
```

This means `report.html` is only accessible for **submitted/finalized** reports, not drafts. This is a design choice, not a bug — but it means there's no intermediate "editor" view. Reports go: Interview → Finish & Process → Final Report (PDF).

When navigating to `report.html` without a reportId:
```
[LOAD] No reportId in URL params
```
The page silently redirects to the dashboard.

#### UX Concern
- **No error message or toast** when redirecting — User might not understand why they're on a different page
- Consider showing a brief "Draft reports are edited in the interview view" message

---

### 2.8 Archives (archives.html)
**Screenshot:** `11-archives.jpg`, `15-archives-selected.jpg`

#### Layout & Structure
1. Header with "← Dashboard" and "Report Archives" title
2. "Recently Submitted" section with View PDF links
3. Filter by Project dropdown
4. Report list with PDF Ready badges

#### What's Working Well
- **Clean, minimal design** — Green header stands out
- **"View PDF"** buttons are immediately accessible
- **"PDF Ready"** badges in green are clear
- **Filter by Project** dropdown works
- **Submission timestamps** provide accountability

#### UI Issues
- **Green header** is a different style from the dashboard's navy/hazard-stripe theme — Inconsistent
- **No pagination** — With many reports, this list will grow indefinitely
- **Report cards** have minimal info — Just name, date, submission time. No preview or summary
- **Selected report** gets a green left border but no expanded details or actions

#### UX Issues
- **"View PDF" opens in new tab** — No visual confirmation the click worked (might need to check another tab)
- **Clicking a report card** selects it (green border) but does nothing else — What's the expected action?
- **No delete/archive functionality** — Can users remove old reports?
- **"Recently Submitted"** section seems to duplicate the main list — Both show the same reports
- **Duplicate "Express Shuttle Connector Road"** entries again

---

### 2.9 Permissions (permissions.html)
**Screenshot:** `12-permissions.jpg`

#### Layout & Structure
Onboarding-style page with:
1. Hard-hat icon
2. "FieldVoice Pro" heading
3. Feature list (voice recording, photo documentation, location/weather, keyboard dictation)
4. "GET STARTED" button (orange)
5. "Skip to manual setup" link

#### What's Working Well
- **Clean, focused design** — Dark background with well-spaced feature items
- **Feature descriptions** are clear and benefit-oriented
- **Orange CTA** is prominent and inviting
- **"Skip to manual setup"** option respects user choice
- **Dark theme** is distinctive and matches the app's branding

#### UI Issues
- **Feature list items** have dark backgrounds on a dark page — Low contrast makes them feel flat
- **"We need a few permissions to enable these features"** — Honest and transparent
- **Footer** "DOT Compliant Field Documentation" is good but tiny

#### UX Issues
- **Accessible from settings at any time** — But doesn't show current permission status
- **No individual permission toggles** — It's all-or-nothing with "GET STARTED"
- **What happens after "Skip to manual setup"?** — Not clear where it navigates

---

### 2.10 Landing Page (landing.html)
**Screenshot:** `13-landing-full.jpg`, `17-landing-viewport.jpg`

#### Layout & Structure (Full Page)
1. Nav bar with logo, links, CTAs
2. Hero section — "Stop Writing Reports. Start Speaking Them."
3. Stats bar (90%, 1× hr, 10 yr, 100%)
4. "The Daily Reporting Problem" section
5. Construction project completion stat
6. "How FieldVoice Pro Works" section
7. "See It In Action" section (interactive demo)
8. "Everything You Need, Nothing You Don't" feature grid
9. "Comprehensive Documentation" mode comparison
10. "Traditional vs. FieldVoice Pro" comparison table
11. "What RPRs Are Saying" testimonials
12. "Ready to Transform Your Reporting?" pricing section
13. FAQ accordion
14. Final CTA section
15. Footer with links

#### What's Working Well
- **Headline is excellent** — "Stop Writing Reports. Start Speaking Them." is compelling
- **Stats bar** (90% Less Reporting Time, etc.) is persuasive
- **Feature grid** with icons is comprehensive and scannable
- **Comparison table** (Traditional vs FieldVoice) is a powerful sales tool
- **Testimonials** with names and titles add credibility
- **Pricing section** showing $0 and "Start Free Today" is compelling
- **FAQ section** addresses common concerns
- **Construction-themed design** is on-brand

#### UI Issues (Critical)
- **Empty content sections** — "The Daily Reporting Problem" and "How FieldVoice Pro Works" sections have headings but appear to have large blank areas (likely missing animated content or images that didn't load)
- **"See It In Action"** section is completely blank — Supposed to be an interactive demo
- **Stats bar numbers** are too small at full-page zoom to read the labels
- **Testimonial text** is very small and hard to read
- **FAQ section** only shows first question visible, rest are collapsed (expected but first should be expanded)
- **Footer** is dense and hard to read on dark background

#### UX Issues
- **"See Demo" button** in hero — Where does it go?
- **Multiple CTA buttons** ("Start Free", "See Demo", "Try FieldVoice Free", "Start Free Today") — Too many different CTAs could cause decision paralysis
- **Login vs Start Free** — Nav has both; relationship unclear
- **Pricing shows "$0"** — Is there a paid tier? If not, why show pricing at all?

---

### 2.11 Login Page (login.html)
**Note:** Could not screenshot because the page auto-redirects to the dashboard when already signed in. This is correct behavior.

#### From Source Code Review
The login page includes:
- Header with hard-hat icon
- Email/password fields
- Sign In button
- Sign Up toggle
- Role selection (for registration)
- Clean, professional design matching the app theme

#### UX Note
- **Auto-redirect when signed in** — Good behavior ✅
- No way to view the login page without signing out first (which we avoided per instructions)

---

## 3. UI Improvement Suggestions (Prioritized)

### P0 — Critical (Fix ASAP)
1. **Fix dashboard timeout cascade** — IDB hydration, loadProjects, auth.ready, refreshProjectsFromCloud, and syncWeather all timing out on every load suggests a fundamental connectivity or initialization issue
2. **Landing page empty sections** — "How FieldVoice Pro Works", "See It In Action", and "The Daily Reporting Problem" have blank content areas. This is the public-facing marketing page
3. **Duplicate projects** — Two identical "Express Shuttle Connector Road" entries confuse users

### P1 — High Priority
4. **Weather widget fallback** — Instead of showing "--°" and "Unavailable", show "Weather unavailable — tap to retry" or cache the last-known weather
5. **Update deprecated meta tag** — `apple-mobile-web-app-capable` → `mobile-web-app-capable` on all pages
6. **Archives: Clarify Recently Submitted vs main list** — Currently confusing duplication
7. **report.html no-reportId handling** — Show an error message or redirect with toast instead of silent redirect

### P2 — Medium Priority
8. **Field Tools carousel duplication** — Items appear twice due to infinite scroll implementation; consider using CSS-only approach or clamping
9. **Project selection modal truncation** — Long project names get cut off
10. **Quick Interview: Clarify back (←) vs cancel (×)** — Add tooltips or differentiate behavior clearly
11. **Settings: Add unsaved-changes warning** — Prevent accidental data loss
12. **Archives: Add report detail expansion** — Clicking a report card should show a preview or actions
13. **Permissions page: Show current permission status** — Let users see what's granted/denied

### P3 — Nice to Have
14. **Add search to project list and project selection modal** — Important as project count grows
15. **Add pagination to archives** — Future-proof for heavy usage
16. **Improve Drone Ops widget** — Currently always shows "--"
17. **Remove or timeline "Coming Soon" features** — Job Calendar, Photo Log Map
18. **Landing page: Reduce CTA variants** — Standardize to 1-2 button styles

---

## 4. UX Flow Issues

### Navigation Flow Test Results

| Step | Action | Result | Status |
|------|--------|--------|--------|
| 1 | Click "BEGIN DAILY REPORT" on dashboard | Project selection modal appears | ✅ |
| 2 | Select "North-South Connector Road Phase 2" | Capture mode selection appears | ✅ |
| 3 | Select "Quick Notes" | Quick Interview page loads | ✅ |
| 4 | Navigate back to dashboard | Dashboard loads with report card visible | ✅ **Bug fix confirmed** |
| 5 | Click report card link | Quick Interview reopens for that report | ✅ |
| 6 | Navigate back to dashboard | Report card persists with updated timestamps | ✅ |
| 7 | Expand "Details" on report card | Shows UUID, Mode (minimal), Project | ✅ |

### Flow Issues Identified
1. **report.html → quick-interview.html redirect for drafts** — Users navigating directly to report.html with a draft reportId get silently redirected. Consider a toast/notification explaining why.
2. **"Finish & Process" is a point of no return** — Once clicked, the report goes from draft to submitted. There should be a confirmation dialog.
3. **No way back from Guided Sections** — If you pick the wrong capture mode, you'd need to delete and recreate.
4. **Emergency Info banner** covers content at certain scroll positions — It's fixed position but doesn't account for scroll state properly.

---

## 5. Bug Observations

### Confirmed Bugs
1. **Console Error: `favicon.ico` 404** — `https://jacksonkoerner.github.io/favicon.ico` returns 404. The app's favicon is at `/V69/assets/favicon.ico` but the root favicon is missing.
2. **Console Warning: Report has no `project_id`** — `[REPORT] No project_id found for this report` fires when loading report.html for the draft we created. The report was created with a `projectId` URL param but it's not being stored correctly on the report object.
3. **Field Tools carousel shows duplicate items** — Infinite scroll implementation causes double rendering of all tool icons (Compass, Measure, Maps, Calc, Slope, Level, dB Meter, Timer, Light, QR Scan, AR Tape × 2).
4. **Weather perpetually "Syncing..."** — With geolocation blocked, the weather widget never resolves and doesn't show a proper fallback.

### Potential Bugs (Need Further Investigation)
5. **Duplicate projects in database** — "Express Shuttle Connector Road" appears twice with identical data. Could be a sync issue or accidental duplicate creation.
6. **All projects show "#1291"** — Even "North-South Connector Road Phase 2" shows #1291. This might be test data but could indicate a save/load bug.
7. **Archives "Recently Submitted" section** mirrors the main report list — Might be intentional (recent = pinned to top) but looks like a rendering bug.
8. **IDB hydration timeout on every page load** — 3000ms timeout consistently triggers. IndexedDB initialization may have a race condition.

---

## 6. What's Working Well

### Design & Branding
- **Construction-industry aesthetic is spot-on** — Hazard stripes, hard-hat logo, safety orange/navy blue color scheme
- **Consistent typography** — System font stack, good use of uppercase labels
- **Professional feel** — This looks like a real enterprise product, not a side project

### Core Functionality
- **Report creation flow is smooth** — 3 clicks from dashboard to capture mode
- **Quick Notes mode** — The voice-first, AI-organizes-later concept is compelling and well-executed
- **Coverage checklist** — Simple but effective accountability tool
- **Report cards on dashboard** — Shows status, timestamps, expandable details
- **Delete functionality** — Trash icon on report cards with confirmation

### Architecture
- **PWA support** — Manifest, service worker meta tags, offline-first design
- **Supabase integration** — Cloud sync, auth, real-time
- **Local-first with fallback** — IDB + localStorage with cloud sync
- **URL-based routing** — Report IDs in URL params enable deep linking

### Settings & Configuration
- **Profile auto-population from cloud** — Works perfectly
- **Signature preview** — Shows exactly how the inspector's name will appear
- **Comprehensive project config** — All contract details, contractor roster, file import

### Landing Page
- **Compelling copy** — "Stop Writing Reports. Start Speaking Them."
- **Strong value props** — 90% less time, GPS verification, legal protection
- **Comparison table** — Traditional vs FieldVoice Pro is very persuasive
- **Social proof** — Testimonials from RPRs with titles

---

## 7. Recommended Next Steps (Prioritized)

### Week 1 — Critical Fixes
1. **Fix dashboard initialization timeouts** — Investigate why IDB hydration, loadProjects, auth.ready, refreshProjectsFromCloud all timeout on every load. This is the #1 performance concern.
2. **Add root favicon.ico** or fix the reference to avoid 404
3. **Fix landing page empty sections** — Ensure "How FieldVoice Pro Works", "See It In Action", and other blank areas render their content (likely missing JS animations or embedded content)
4. **Update `apple-mobile-web-app-capable`** to `mobile-web-app-capable` across all HTML files

### Week 2 — Data & UX
5. **Investigate and fix duplicate projects** — Deduplicate and prevent future duplicates
6. **Fix `project_id` not saved on report** — Console warning indicates report-project relationship is broken
7. **Improve weather fallback** — Cache last-known weather, show "tap to retry" instead of perpetual "Syncing..."
8. **Add toast notifications** for silent redirects (report.html → interview, login → dashboard)

### Week 3 — Polish
9. **Fix Field Tools carousel** duplication
10. **Archives UX improvements** — Consolidate "Recently Submitted" with main list, add report actions on click
11. **Add confirmation dialog** to "FINISH & PROCESS"
12. **Add unsaved-changes warning** to Settings
13. **Permissions page** — Show current permission status, add individual toggles

### Week 4 — Landing Page & Marketing
14. **Fill in all landing page sections** with real content/animations
15. **Streamline CTAs** — Reduce to 2 variants (primary + secondary)
16. **Add real testimonials** if current ones are placeholders
17. **FAQ section** — Expand and pre-open first question

### Backlog
- Project search functionality
- Archives pagination
- Capture mode change (ability to switch Quick Notes ↔ Guided Sections)
- Remove or implement "Coming Soon" features (Job Calendar)
- Dark mode support for in-app pages (not just permissions/login)

---

*Report generated by automated testing. All screenshots saved to `docs/screenshots/`. No code changes were made during this review.*

---

## Appendix A: Mobile Viewport Analysis (iPhone 17 Pro — 393×852pt)

**Additional screenshots:** `18-dashboard-mobile-viewport.jpg`, `19-quick-interview-mobile.jpg`, `20-landing-mobile-full.jpg`

### Dashboard at Mobile Width
- Layout adapts well — single-column, stacked cards
- **Project names truncated** with "..." (e.g., "NORTH-SOUTH CONNECTOR RO...")
- Weather + Drone Ops side-by-side still works but feels cramped
- **Emergency Info bar** covers "Job Calendar" heading — overlap issue confirmed
- Field Tools carousel shows ~5 items visible, scrollable — good
- Report Archives card partially hidden behind the AI assistant FAB button

### Quick Interview at Mobile Width
- Clean, readable layout — 2-column checklist grid fits well
- **"FINISH & PROCESS" button** takes full width — very thumb-friendly
- **TAP TO ADD PHOTOS** area has enough touch target
- Weather "Syncing..." is prominent and concerning for users
- Back (←) and Cancel (×) buttons are small — might be hard to tap accurately

### Landing Page at Mobile Width
- Content flows well but text is very small in several sections
- Hero section is readable and compelling
- Feature grid stacks to 1-2 columns — works
- **Empty "See It In Action" section** creates a jarring blank gap
- Pricing section "$0" is readable and prominent
- FAQ accordion works at mobile width

### Key iPhone-Specific Concerns
1. **Safe area insets** — No `env(safe-area-inset-*)` CSS seen → content may be hidden behind iPhone notch/home indicator
2. **Position:fixed Emergency Info bar** — May bounce/jitter during iOS rubber-band scrolling
3. **Touch targets** — Some buttons (← back, × cancel) appear under 44pt minimum recommended by Apple HIG
4. **Keyboard behavior** — On iPhone, the keyboard pushes viewport up, potentially hiding coverage checklist during data entry

## Testing Log
| Time (CST) | Action | Notes |
|-------------|--------|-------|
| 02:00 | Session started | v6.9.22 fix confirmed working by Jackson |
| 02:08 | Overnight plan set | Browser testing + auditing cycle begins |
| 02:10 | Wave 1 complete | 17 screenshots, 532-line report, 7/10 rating |
| 02:20 | Mobile viewport testing | 3 additional screenshots at iPhone 393x852pt |
| 02:20 | Wave 2 launched | Deep Supabase + iOS PWA + code quality analysis running |

## Appendix B: CSS Safe Area Analysis

**Critical finding:** `viewport-fit=cover` is set on ALL 10 HTML pages, but there is **ZERO** usage of `env(safe-area-inset-*)` in the CSS.

### What this means for iPhone users:
- **Top:** Content may be hidden behind the Dynamic Island / notch
- **Bottom:** Interactive elements near the bottom edge may be covered by the home indicator bar
- **Affected elements:**
  - Emergency Info banner (position:fixed at bottom) — may overlap with home indicator
  - "FINISH & PROCESS" button on interview page — may be partially hidden
  - Footer text on all pages — may be cut off

### CSS Stack:
- Tailwind CSS v3.4.19 (compiled to single `output.css`)
- No custom safe-area handling
- `min-h-[44px]` class used in a few places (good for touch targets)
- The Tailwind build appears minified into a single line

### Recommended Fix:
Add to `tailwind.config.js` (or global CSS):
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
/* Or for specific fixed elements: */
.fixed-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

### Additional CSS Observations:
- Tailwind purge is working — only used classes are included
- Custom colors defined: `fv-blue`, `fv-orange`, `fv-green`, `fv-navy`, `fv-yellow`, `dot-blue`, `dot-navy`, `dot-orange`, `safety-green`
- Good use of responsive breakpoints (sm, md, lg)
- `user-scalable=no` on viewport meta prevents pinch-to-zoom — intentional for PWA but may be accessibility concern

---

## 10. Accessibility Audit (ARIA, Contrast, Screen Reader)

### 10.1 ARIA Labels & Roles

**Overall Score: Poor** — The app has almost zero explicit ARIA attributes. Only `aria-hidden="true"` appears (on Field Tools carousel items in index.html), and no `role=`, `aria-label`, `aria-labelledby`, or `aria-describedby` attributes exist on any interactive element.

#### Unlabeled Buttons (Critical)
**20+ buttons across the app have no accessible name** — no text content, no `aria-label`, no `title`. Screen readers will announce these as just "button" with no context. Affected patterns:

| Page | Count | Examples |
|------|-------|---------|
| Dashboard (index.html) | 20 | Close modals (×), dismiss banners, send message, close field tools, all close-overlay buttons |
| Quick Interview | 10 | Dismiss warnings, add issue/communication/QAQC/safety/visitor buttons (icon-only via Font Awesome), AI chat buttons |

**Most common offender:** Close/dismiss buttons that use `<i class="fas fa-times">` inside `<button>` — the icon font provides no accessible text.

**Fix:** Add `aria-label="Close"` or `aria-label="Dismiss"` to every icon-only button.

#### Unlabeled Form Inputs
**13+ inputs across main pages have no associated `<label for="...">` or `aria-label`:**

| Page | Inputs Missing Labels |
|------|----------------------|
| Dashboard | `messagesChatInput`, `aiChatInput` |
| Quick Interview | `site-conditions-input`, `issue-input`, `communications-input`, `qaqc-input`, `safety-input`, `visitors-input`, `no-incidents` checkbox, `has-incidents` checkbox, `aiChatInput` |

**Note:** `project-config.html` has `<label>` elements but **none use the `for=` attribute** — so while visually associated, they're not programmatically linked. All 20 labels in project-config are floating labels without `for=`.

#### Label-Input Association
- **0 of 69 total `<label>` elements** across the entire app use `for=` attribute
- Forms rely purely on visual proximity, not programmatic association
- Screen readers cannot auto-associate labels with their inputs

### 10.2 Color Contrast Issues (WCAG AA)

Tested via computed styles in the browser. Four failing contrast ratios found on dashboard:

| Element | Foreground | Background | Ratio | Required | Verdict |
|---------|-----------|------------|-------|----------|---------|
| "ENABLE" text | `#EA580C` (orange) | `#FFFFFF` (white) | 3.56:1 | 4.5:1 | ❌ FAIL |
| Drone ops "--" | `#64748B` (slate-500) | `#E2E8F0` (slate-200) | 3.86:1 | 4.5:1 | ❌ FAIL |
| Badge "1" | `#FFFFFF` (white) | `#EA580C` (orange) | 3.56:1 | 4.5:1 | ❌ FAIL |
| Badge "2 incoming" | `#FFFFFF` (white) | `#16A34A` (green-600) | 3.30:1 | 4.5:1 | ❌ FAIL |

**Common theme:** White text on orange (`dot-orange`) and green (`safety-green`) backgrounds fail WCAG AA for normal-size text. These are used throughout the app for badges, buttons, and status indicators.

**Fix suggestions:**
- Orange badges/buttons: darken to `#C2410C` (orange-700) or use dark text on orange background
- Green badges: darken to `#15803D` (green-700) or use dark text
- Slate-500 on slate-200: use `#475569` (slate-600) instead

### 10.3 Heading Hierarchy

✅ **Dashboard:** Clean hierarchy — H1 → H2 → H3, no skips
✅ **All pages use `lang="en"`** on `<html>` element
✅ **All `<img>` tags have `alt` attributes** — no missing alt text

### 10.4 Semantic HTML

**Moderate usage of semantic elements:**
- `<header>`, `<footer>`, `<section>`, `<main>` used in several pages
- `project-config.html` is the best example with proper `<header>`, `<main>`, `<section>`, `<footer>`
- `index.html` uses `<header>`, `<section>`, `<footer>` but no `<main>` wrapper
- `<nav>` element is **never used** — navigation is built with `<div>` + `<button>` patterns

**Missing landmarks:**
- No `<main>` on dashboard (index.html)
- No `<nav>` anywhere in the app
- No `role="navigation"` or `role="main"` fallbacks

### 10.5 Keyboard Navigation & Focus

- **No `tabindex` attributes** found in any HTML file
- **No custom focus styles** beyond Tailwind defaults (`:focus-visible` ring)
- **194 inline `onclick=` handlers** — these work on buttons (which are keyboard-accessible) but some are on `<div>` elements which are NOT keyboard-accessible
- `report.html` has custom `:focus` styles for editable fields — good

### 10.6 Zoom & Scaling

⚠️ **`user-scalable=no`** is set in viewport meta tags — this prevents pinch-to-zoom, which is a WCAG 2.1 Level AA failure (Success Criterion 1.4.4). While common in PWAs, it blocks users with low vision from zooming in.

### 10.7 Accessibility Priority Matrix

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 🔴 P0 | 20+ icon-only buttons with no label | Blind users cannot use modals/close buttons | Low — add aria-label to each |
| 🔴 P0 | 0 label-input associations (no `for=`) | Form fields unidentifiable by screen reader | Low — add `for=` to all labels |
| 🟠 P1 | White-on-orange/green contrast failures | Low vision users can't read badges/status | Low — darken background colors |
| 🟠 P1 | `user-scalable=no` blocks zoom | Low vision users can't enlarge content | Trivial — remove from viewport |
| 🟡 P2 | No `<nav>` landmark | Screen reader navigation harder | Low |
| 🟡 P2 | No `<main>` on dashboard | Landmark navigation incomplete | Trivial |
| 🟢 P3 | `onclick` on non-button elements | Keyboard-only users may miss interactive divs | Medium |

---

| Time | Action | Notes |
|------|--------|-------|
| 02:30 | Wave 2 complete | Supabase deep dive + iOS PWA + code quality (37KB report) |
| 02:35 | CSS analysis | Zero safe-area-inset handling found — critical for iPhone |
| 02:30 | Accessibility audit | 20+ unlabeled buttons, 0 label-for associations, 4 contrast failures, no nav landmarks |
| 03:00 | Large text stress test | 53K chars accepted, no maxlength, autosave to localStorage works (466KB), JSONB columns have no size limit |

---

## 11. Stress Test: Large Text Entry in Field Notes

### Test Setup
- **Page:** quick-interview.html (Guided Sections mode)
- **Fields tested:** All 6 textareas (site-conditions, issues, communications, qaqc, safety, visitors)
- **Test data:** Realistic construction field notes, progressively larger

### Results by Size

| Text Size | Chars | Textarea Behavior | Autosave | Time |
|-----------|-------|-------------------|----------|------|
| Moderate | 3,110 | ✅ Accepted, scrollable | ✅ Saved to localStorage | < 1ms |
| Large | 14,691 | ✅ Accepted, scrollable (7,224px scroll height) | ✅ Saved | < 1ms |
| Extreme | 53,092 | ✅ Accepted, scrollable (26,024px scroll height) | ✅ Saved (77KB delta) | 30ms |
| All fields filled | 180K+ total | ✅ All accepted | ✅ localStorage total 466KB | < 3s |

### Key Observations

#### ✅ No Crashes or Errors
- No JavaScript errors thrown at any text size
- No visible UI lag or jank even at 53K characters
- Autosave (via input/change events) fired correctly at all sizes

#### ⚠️ No Input Validation
- **No `maxlength` attribute** on any of the 6 textareas
- **No character counter** UI — users have no idea how much they've written
- **No JS-level length validation** — no truncation, no warning, nothing
- A user could paste an entire novel and it would be accepted

#### ⚠️ Textarea Height Behavior
- All textareas have `rows="3"` (default) with JS-set `height: 400px` when expanded
- Text scrolls inside the fixed-height box — the textarea does NOT auto-expand
- At 53K chars, only ~2% of content is visible at a time (396px client vs 26,024px scroll)
- **UX concern:** For dictation-heavy users (the primary use case), they can't see their full text without extensive scrolling

#### ✅ Storage Layer
- **localStorage:** 466KB after filling all fields — well under the ~5MB limit
- **Supabase:** `report_data` uses JSONB columns (ai_generated, original_input, user_edits) — PostgreSQL JSONB supports up to 1GB, so no truncation risk at the DB level
- **IndexedDB:** Also used for hydration; no observed issues

#### 📋 Recommendations
1. **Add `maxlength` or soft character limits** — 10,000 chars per field is generous for field notes and prevents abuse
2. **Add character counter** — Show "1,234 / 10,000" below each textarea to give feedback
3. **Consider auto-expanding textareas** — Instead of fixed 400px with scroll, let textareas grow to show full content (with a max-height cap)
4. **Add a total report size warning** — If total field text exceeds ~50KB, warn user about potential sync issues on slow connections

---

## 12. Stress Test: Rapid Report Create/Delete Cycles

### Test Setup
- **Page:** Dashboard (index.html)
- **Functions tested:** `createSupabaseReportRow()`, `deleteReportCascade()`, `deleteCurrentReport()`, `executeDeleteReport()`
- **Test project:** North-South Connector Road Phase 2 (48a43023...)

### Sequential Create/Delete (10 cycles)

| Metric | Min | Max | Avg |
|--------|-----|-----|-----|
| Create (Supabase upsert) | 96ms | 119ms | 107ms |
| Delete (7-step cascade) | 1,408ms | 1,716ms | 1,573ms |
| Total per cycle | 1,504ms | 2,349ms | 1,693ms |

- ✅ **10/10 cycles succeeded** — zero errors
- ✅ **No orphaned data** — localStorage, IDB, and Supabase all consistent after cleanup
- ✅ **Cascade delete is thorough** — 7 steps (photo storage → child tables → PDF → final_reports → photos → parent report)
- ✅ **Per-step try/catch** prevents partial failures from blocking subsequent steps

### Parallel Delete (3x same report)

- ✅ **3 parallel deletes of the same report all returned success:true**
- The cascade's `.delete().eq()` operations are idempotent — deleting an already-deleted row doesn't error
- No race conditions observed in the cascade logic

### Key Finding: `deleteReportCascade` Does NOT Clean localStorage

**The `deleteReportCascade()` function (shared/delete-report.js) only deletes from Supabase.** It does not call `deleteCurrentReport()` or `deleteReportData()` — the localStorage cleanup must be done separately by the caller.

This is handled correctly in `executeDeleteReport()` (report-cards.js) and the duplicate report modal flow, which both call:
```js
deleteCurrentReport(reportId);    // localStorage: fvp_current_reports
deleteReportData(reportId);       // localStorage: fvp_report_{uuid}
```

**Risk:** Any future code path that calls `deleteReportCascade()` without also cleaning localStorage will create orphaned localStorage entries. Consider making `deleteReportCascade()` a true "delete everything" function that includes localStorage/IDB cleanup.

### Double-Tap Protection

✅ **`executeDeleteReport` disables the delete button** during the async operation:
```js
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Deleting...';
```
This prevents the most common real-world race condition (user tapping Delete twice).

### Data Consistency After All Tests

| Layer | Report Count | Status |
|-------|-------------|--------|
| localStorage | 1 | ✅ Only original draft |
| IndexedDB | 1 | ✅ Matches localStorage |
| Supabase | 7 | ✅ Original + 6 from prior sessions (no test leaks) |

### Performance Notes

- **Delete is ~15x slower than create** (1,573ms vs 107ms) — expected given the 7-step cascade with multiple Supabase queries
- On slow connections, the delete cascade could easily take 5-10 seconds
- The UI shows a spinner during delete, which is good UX

### Recommendations

1. **Consolidate delete logic** — Move localStorage/IDB cleanup INTO `deleteReportCascade()` so it becomes a single "delete from everywhere" function. This would eliminate the current risk of partial cleanup.
2. **Add network timeout handling** — The cascade has no explicit timeout. On a degraded connection, a step could hang indefinitely.
3. **Consider optimistic UI** — Remove the card from the UI immediately, then delete from Supabase in the background. If Supabase fails, re-add the card with an error banner.
4. **Batch Supabase calls** — The 7-step cascade makes 7+ sequential network requests. Some could be parallelized (e.g., deleting child table rows simultaneously).
