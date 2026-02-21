# FieldVoice Pro — Feature & Tool Brainstorm
**Author:** Thomas | **Date:** 2026-02-21

## Current Tool Inventory (14 tools)
1. Photo Markup (⭐⭐⭐⭐)
2. 3D Scan Viewer (⭐⭐⭐⭐)
3. AR Measure (⭐⭐⭐⭐)
4. Calculator (3 tabs: construction, fraction, converter)
5. Maps (6 tile providers + Leaflet)
6. Photo Measure (calibration-based)
7. Timer (stopwatch + countdown)
8. Level/Inclinometer
9. QR Scanner
10. Decibel Meter
11. GPS Measure (distance + area)
12. Slope & Grade
13. Flashlight (+ SOS)
14. Compass

---

## 🚁 DRONE OPERATIONS SUITE (Jackson's Priority)

### Tool 15: Drone Flight Planner / WaypointMap Integration
**Open Source:** [WaypointMap](https://www.waypointmap.com) — free DJI waypoint mapping tool
**Also:** [DJI-Mapper](https://github.com/YarosMallorca/DJI-Mapper) — Flutter-based, MIT license, supports DJI Mini 4/5 Pro, Mavic 3/4, Air 3
**Integration approach:**
- Embed WaypointMap as an iframe or link-out (simplest)
- Or: build a web-based waypoint planner using Leaflet (we already have Leaflet in maps.js) that exports DJI-compatible KMZ files
- Define survey grids over a project area polygon
- Calculate overlap, altitude, GSD parameters
- Save flight plans per project in Supabase
**Value:** RPRs using drones for progress photos could plan automated mapping flights right from FieldVoice

### Tool 16: Drone Flight Log
**Concept:** Log each drone flight with:
- Date, time, pilot name, drone model
- Takeoff/landing GPS coordinates
- Flight duration, max altitude, distance flown
- Weather conditions at time of flight (pull from existing weather integration)
- Pre-flight checklist (battery, props, firmware, airspace)
- Photos/videos captured (link to report)
- FAA Part 107 compliance notes
**Why:** DOT projects increasingly require drone documentation. Having flight logs attached to daily reports is huge for compliance.

### Tool 17: Airspace Checker
**Concept:** B4UFLY-style airspace awareness for the job site
- Show controlled airspace, TFRs, airports, restricted areas overlaid on project location
- Link to LAANC authorization via AirHub Portal API or similar
- Color-coded fly/no-fly/caution zones
**Open Source:** FAA provides airspace data via APIs. [AirHub Portal](https://portal.airspacelink.com/) is a free PWA we could link to or reference.
**Integration:** Could be a tab in the existing Maps tool — add an "Airspace" tile layer

### Tool 18: Drone Pre-Flight Checklist
**Concept:** Interactive checklist that must be completed before logging a flight
- Battery level check
- Propeller inspection
- Firmware version
- Memory card capacity
- Weather check (auto-pull from existing weather data)
- Airspace clearance confirmation
- Visual observer present (Y/N)
- Risk assessment rating
**Value:** Standardized pre-flight documentation for DOT project compliance

### Tool 19: Photogrammetry Viewer
**Open Source:** [OpenDroneMap](https://github.com/OpenDroneMap) — generates maps, point clouds, 3D models from drone images (5.9K ⭐ on GitHub)
- [WebODM](https://github.com/OpenDroneMap/WebODM) — web-based UI (3.7K ⭐)
- Process drone photos into orthomosaics, 3D models, DEMs
**Integration approach:**
- Long-term: self-hosted WebODM instance for processing
- Short-term: build a viewer for processed orthomosaics (2D map overlay) and 3D models (we already have Three.js in scan-viewer.js!)
- Upload drone photos → process via n8n webhook to WebODM → view results in FieldVoice
**Value:** Construction progress monitoring from drone imagery, directly in the daily report app

---

## 🔧 CONSTRUCTION-SPECIFIC TOOLS

### Tool 20: Concrete Calculator
**Concept:** Calculate concrete volume, rebar spacing, and mix requirements
- Slab calculator (L × W × D, with waste factor)
- Column/pier calculator (circular + rectangular)
- Footing calculator
- Steps calculator
- Rebar spacing calculator with weight tables
- Mix ratio reference (state DOT specs)
**Why:** The existing calculator has area/volume tabs but not concrete-specific. Construction workers calculate concrete constantly. **OmniCalculator** has web-based versions we can reference for formulas.

### Tool 21: Earthwork / Cut-Fill Calculator
**Concept:** Simple grid or cross-section cut/fill estimation
- Input existing grade + design grade
- Calculate net cut/fill volumes
- Export quantities for daily report (material moved today)
**Why:** RPRs document earthwork quantities daily. Currently done by hand or spreadsheet.

### Tool 22: Pipe Flow / Hydraulics Calculator
**Concept:** Manning's equation, Hazen-Williams, pipe sizing
- Select pipe material, diameter, slope
- Calculate flow rate, velocity, head loss
- Useful for storm drain, sewer, waterline inspections
**Why:** DOT projects heavily involve drainage. RPRs reference these calculations regularly.

### Tool 23: Rebar Identifier / Reference
**Concept:** Quick reference for rebar sizes, grades, and properties
- Bar size → diameter, weight, area cross-reference
- Splice length calculator (by bar size + concrete strength)
- Bend requirements (by bar size)
- Photo AI: snap a photo of rebar, AI estimates bar size from diameter
**Why:** RPRs inspect rebar placement constantly. Quick reference saves time and errors.

### Tool 24: Material Testing Log
**Concept:** Log field test results
- Concrete cylinder test (slump, air, temp, cylinder IDs)
- Compaction test (proctor density, moisture content, % compaction)
- Asphalt core results
- Soil classification
- Link test results to specific daily report sections
**Why:** RPRs document testing daily. Having a structured input that feeds directly into the daily report AI would be very valuable.

### Tool 25: Weather Station
**Concept:** Enhanced weather tool beyond current dashboard widget
- Current conditions (already have)
- Hourly forecast for work planning
- Wind speed/direction for crane operations and drone flights
- Precipitation probability timeline
- Heat index / cold stress calculations (OSHA reference)
- Lightning detection radius (construction safety requirement)
- Save weather snapshots to daily report automatically
**Why:** Weather documentation is a DOT daily report requirement. Making it automatic and detailed adds compliance value.

---

## 📋 REPORTING & DOCUMENTATION TOOLS

### Tool 26: Quantity Tracking
**Concept:** Track daily installed quantities
- Define pay items (from project config or DOT bid schedule)
- Log quantities installed per day (with station ranges)
- Running totals with % complete
- Auto-populate daily report with quantities installed
**Why:** This is THE most common daily report element after weather and personnel. Currently done manually in the freeform text area.

### Tool 27: Issue / Deficiency Tracker
**Concept:** Log and track construction deficiencies
- Photo + description + location
- Severity rating
- Assigned contractor
- Due date
- Status (open/in-progress/resolved)
- Auto-include open issues in daily report
**Why:** Non-conformance tracking is a core RPR responsibility. No competitor integrates this directly with daily reports.

### Tool 28: Document Scanner
**Concept:** Scan paper documents into PDFs
- Use camera to capture pages
- Auto-crop, perspective correction, contrast enhancement
- OCR for searchable text
- Attach scanned docs to project or report
**Open Source:** [OpenCV.js](https://docs.opencv.org/4.x/d0/d84/tutorial_js_usage.html) for perspective correction, [Tesseract.js](https://github.com/naptha/tesseract.js) (34K ⭐) for OCR
**Why:** RPRs receive paper submittals, delivery tickets, test reports in the field. Being able to scan and attach is a major workflow improvement.

### Tool 29: Voice Memo / Audio Recorder
**Concept:** Quick voice memos attached to reports
- Record audio clip (30s, 1m, 5m options)
- Auto-transcribe via browser SpeechRecognition API
- Tag to specific report section
- Store audio file in Supabase storage
**Why:** Sometimes faster than dictating into the full interview flow. Captures tone, context, ambient sounds.

---

## 🗺️ MAPPING & SPATIAL TOOLS

### Tool 30: Station Tracker
**Concept:** GPS-based station/chainage calculator
- Define a project alignment (polyline)
- Show current station based on GPS position
- Calculate offset from alignment
- Useful for: "At station 45+20, 15' right of centerline"
**Why:** Station references are fundamental to DOT reporting. Currently RPRs estimate or use separate apps.

### Tool 31: GPS Photo Map
**Concept:** Map view of all geotagged photos from current report
- Show photo locations on map with thumbnails
- Click to view full photo
- Filter by date, report, project
- Export as KML/KMZ for GIS integration
**Why:** The current "Photo Log Map" is a placeholder. This would make it real and extremely useful for project documentation.

### Tool 32: As-Built Markup
**Concept:** Load a plan sheet PDF/image, overlay markups
- Import plan sheets from project documents
- Draw as-built conditions over the plan (lines, polygons, dimensions)
- GPS-anchor the plan sheet to real-world coordinates
- Save markups per day → feed into daily report
**Why:** As-built documentation is a core inspection function. Doing it digitally on a plan sheet is a killer feature.

---

## 🛡️ SAFETY TOOLS

### Tool 33: Toolbox Talk Templates
**Concept:** Pre-built safety briefing templates
- OSHA top 10 hazards library
- Custom topics per project
- Attendance tracking (sign-in with name + photo)
- Auto-document in daily report
**Why:** Raken has this. It's table-stakes for construction apps.

### Tool 34: Incident Tracker
**Concept:** Document safety incidents
- Date, time, location
- Type (near miss, first aid, recordable, lost time)
- Description, photos
- Witness statements
- Root cause / corrective action
- OSHA 300 log integration
**Why:** Safety incidents must be documented immediately. Having it in the same app as daily reports is natural.

---

## 🔗 OPEN SOURCE PROJECTS TO EVALUATE

| Project | GitHub | Stars | License | Integration Fit |
|---|---|---|---|---|
| **DJI-Mapper** | YarosMallorca/DJI-Mapper | ~200 | MIT | Waypoint planning — Flutter, could port concepts to web |
| **OpenDroneMap/WebODM** | OpenDroneMap/WebODM | 3.7K | AGPL-3.0 | Drone photo → 3D models. Backend processing service. |
| **drone-flightplan** | hotosm/drone-flightplan | ~100 | BSD-3 | Python lib for waypoint generation — port to JS? |
| **Tesseract.js** | naptha/tesseract.js | 34K | Apache-2.0 | OCR for document scanner tool |
| **OpenCV.js** | OpenCV | Huge | Apache-2.0 | Image processing for doc scanner, photo enhancement |
| **Leaflet** | Leaflet/Leaflet | 41K | BSD-2 | Already in use — extend for airspace, station tracking |
| **Three.js** | mrdoob/three.js | 103K | MIT | Already in use — extend for drone 3D model viewing |
| **jsPDF** | parallax/jsPDF | 29K | MIT | Already in use — PDF generation |
| **Mapbox GL JS** | mapbox/mapbox-gl-js | 11K | BSD-3 | Alternative to Leaflet for more advanced mapping |
| **Turf.js** | Turfjs/turf | 9K | MIT | Geospatial analysis — offset, buffer, intersect for station tracking |

---

## 🎯 PRIORITIZED FEATURE ROADMAP (Thomas's Recommendation)

### Phase 1: Quick Wins (Next Sprint — High Impact, Low Effort)
1. **Concrete Calculator** — extend existing calc.js with concrete tab
2. **GPS Photo Map** — make the placeholder real (Leaflet + existing photo data)
3. **Drone Pre-Flight Checklist** — simple form, feeds into report
4. **Toolbox Talk Templates** — template library + attendance

### Phase 2: Drone Operations (Jackson's Priority)
5. **Drone Flight Log** — structured flight documentation
6. **Airspace Checker** — add tile layer to existing maps tool
7. **WaypointMap link/embed** — simplest integration first
8. **Flight Planner** — web-based with Leaflet if WaypointMap embed isn't enough

### Phase 3: High-Value Differentiators
9. **Quantity Tracking** — pay items with running totals
10. **Material Testing Log** — structured input → daily report AI
11. **Document Scanner** — Tesseract.js + OpenCV.js
12. **Issue/Deficiency Tracker** — non-conformance log

### Phase 4: Advanced
13. **Station Tracker** — GPS + alignment polyline
14. **As-Built Markup** — plan sheet overlay
15. **Photogrammetry Viewer** — OpenDroneMap integration
16. **Earthwork Calculator** — cut/fill volumes
17. **Pipe Flow Calculator** — Manning's / Hazen-Williams

---

---

## 📊 COMPETITOR DEEP DIVE: Raken (Closest Competitor, PE-Acquired Sep 2025)

### Raken's Full Feature Map (from rakenapp.com, Feb 2026)

**Daily Progress Reporting:**
| Feature | Raken | FieldVoice | Gap? |
|---|---|---|---|
| Daily Reports | ✅ Customizable templates | ✅ AI-generated DOT format | FieldVoice WINS (AI) |
| Collaborator Reports | ✅ Subs submit their own | ❌ | **GAP** — multi-user reporting |
| Segmented Daily Reports | ✅ Split by area/trade | ❌ | **GAP** — report segmentation |
| Photos & Videos | ✅ Timestamped | ✅ GPS + timestamp | Parity |
| Notes | ✅ General notes | ✅ Via freeform mode | Parity |
| Messaging | ✅ In-app messaging | ❌ Hardcoded demo | **GAP** — real messaging |
| Tasks | ✅ Assign/track tasks | ❌ | **GAP** — task management |

**Time & Production Tracking:**
| Feature | Raken | FieldVoice | Gap? |
|---|---|---|---|
| Time Tracking | ✅ Time cards + GPS | ❌ | **GAP** — crew time tracking |
| Production Tracking | ✅ Track quantities installed | ❌ (planned: IMPL-07) | **GAP** — in brainstorm |
| Material Tracking | ✅ Track material deliveries | ❌ | **GAP** |
| Equipment Tracking | ✅ Track equipment usage/location | ❌ | **GAP** |
| Budget Management | ✅ Cost tracking vs budget | ❌ | **GAP** |
| Production Insights | ✅ Automated dashboard | ❌ | **GAP** |
| Labor Management | ✅ Certifications, crew mgmt | ❌ | **GAP** |

**Safety & Quality:**
| Feature | Raken | FieldVoice | Gap? |
|---|---|---|---|
| Safety Management | ✅ Checklists + observations | ❌ | **GAP** |
| Quality Management | ✅ QC checklists | ❌ | **GAP** |
| Managed Checklists | ✅ 100+ pre-built | ❌ | **GAP** |
| Observations | ✅ Photo + notes | ❌ | **GAP** |
| Incidents | ✅ Incident capture | ❌ (planned: Tool 34) | **GAP** — in brainstorm |
| Toolbox Talks | ✅ 100+ library, EN/ES, scheduling | ❌ (planned: Tool 33) | **GAP** — in brainstorm |
| Safety Dashboards | ✅ Insights + compliance | ❌ | **GAP** |

**Document Management:**
| Feature | Raken | FieldVoice | Gap? |
|---|---|---|---|
| Forms | ✅ Custom form builder | ❌ | **GAP** |
| Document Storage | ✅ Cloud storage | ✅ Supabase storage | Parity |
| Integrations | ✅ Procore, Sage, QuickBooks, Box, Dropbox, Matterport | ❌ | **GAP** — no integrations |

**Where FieldVoice BEATS Raken:**
| Feature | FieldVoice | Raken |
|---|---|---|
| 🏆 AI Report Generation | ✅ Voice → DOT report via AI | ❌ None |
| 🎤 Voice-First Input | ✅ Dictation → structured capture | ❌ Type only |
| 📋 DOT-Specific Format | ✅ Built for DOT RPRs | ❌ Generic templates |
| 🔧 14 Field Tools | ✅ Compass, level, AR, markup, etc. | ❌ None |
| 🤖 AI Chat Assistant | ✅ Context-aware on every page | ❌ None |
| 📶 Full Offline Mode | ✅ Three-tier with crash recovery | ✅ Partial (last 5 projects) |
| 💰 Price | TBD (target $50-80/user) | ~$66/user/month |

### Gap Priority Analysis

**Critical gaps to close (Raken table-stakes features FieldVoice lacks):**
1. **Time Tracking** — Raken's #2 feature after daily reports. Simple crew time cards with cost codes.
2. **Toolbox Talks** — 100+ library in Raken. We need at least a basic template system.
3. **Safety Observations** — Photo + description + follow-up. Simple but essential.
4. **Collaborator/Sub Reports** — Subs submit their own daily logs. Multi-user reporting.

**Important but not urgent (differentiation over parity):**
5. Production/Quantity Tracking (already planned as IMPL-07)
6. Equipment Tracking
7. Material Tracking
8. Integrations (Procore, accounting)

**Lower priority (enterprise features):**
9. Budget Management
10. Forms Builder
11. Safety Dashboards
12. Labor/Certification Management

### Raken's Integrations (what FieldVoice should eventually connect to)
- **Accounting:** Sage 100/300, QuickBooks, Viewpoint Vista/Spectrum, Foundation, ComputerEase, CMiC
- **Project Management:** Procore, Oracle Aconex, Autodesk Build, Microsoft Project
- **Cloud Storage:** Box, Dropbox, Google Drive, OneDrive, Procore Drive
- **Reality Capture:** Matterport, DroneDeploy, OxBlue, TrueLook, Reconstruct

---

## 🔩 IMPLEMENTATION DETAILS (Deep Dives)

### IMPL-01: Concrete Calculator (extend calc.js)
**Effort:** Low (1–2 days) | **Dependencies:** None — pure math

**Current state:** `calc.js` has 3 tabs (Feet-Inch, Area/Volume, Converter) with a `switchCalcTab()` and `renderCalcUI()` pattern. Adding a 4th tab is straightforward.

**New tab: "Concrete"**
Sub-modes (like Area/Volume toggle):
1. **Slab** — L × W × D, with configurable waste factor (5-10%)
   - Formula: `volume_cy = (length_ft × width_ft × depth_in / 12) / 27`
   - Output: cubic yards + bags (80lb bags = 0.6 cu ft each)
2. **Column/Pier** — circular (πr²h) or rectangular
3. **Footing** — continuous or spread
4. **Stairs** — rise, run, width, number of steps
5. **Rebar** — slab dimensions + spacing → bar count, total length, weight
   - Rebar weight table: #3=0.376 lb/ft, #4=0.668, #5=1.043, #6=1.502, #7=2.044, #8=2.670

**Integration:**
- Add `{ id: 'concrete', label: 'Concrete' }` to tabs array in `renderCalcUI()`
- New function `renderConcreteCalc()` with mode toggle
- Results can be saved to localStorage and referenced in daily report
- Optional: "Add to Report" button that appends quantity to current report's material section

**No external libraries needed.** All formulas are basic geometry.

---

### IMPL-02: GPS Photo Map (replace placeholder)
**Effort:** Medium (2–3 days) | **Dependencies:** Leaflet (already loaded)

**Current state:** Dashboard has a "Photo Log Map" card that's a marketing placeholder with an "IN DEVELOPMENT" badge. Photos already capture GPS metadata (lat/lng) via `media-utils.js` → stored in IDB `photos` store with `latitude`, `longitude` fields.

**Implementation:**
1. New file: `js/tools/photo-map.js`
2. Use existing Leaflet instance pattern from `maps.js`
3. Query `window.dataStore.getAllPhotos()` → filter to current project
4. For each photo with GPS: add a Leaflet marker with thumbnail popup
5. Cluster markers with `Leaflet.markercluster` plugin (7KB gzipped, MIT license)
   - CDN: `https://unpkg.com/leaflet.markercluster@1.5.3/dist/`
6. Click marker → show full photo in existing photo viewer modal
7. Filter controls: by report, by date range
8. Optional: draw a polyline connecting photos in chronological order (shows inspection path)

**Data flow:**
```
IDB photos store → filter by project_id → extract lat/lng → Leaflet markers → cluster
```

**Bonus:** Export as KML/KMZ for GIS integration — `tokml` library (2KB, MIT) converts GeoJSON → KML

---

### IMPL-03: Drone Pre-Flight Checklist
**Effort:** Low (1 day) | **Dependencies:** None

**Implementation:**
1. New tool overlay (same pattern as other tools: `openDroneChecklist()`, overlay div)
2. Checklist items stored as a JSON template:
```json
{
  "sections": [
    {
      "title": "Aircraft",
      "items": [
        { "id": "props", "label": "Propellers — inspected, no damage", "required": true },
        { "id": "battery", "label": "Battery charged above 80%", "required": true },
        { "id": "firmware", "label": "Firmware up to date", "required": false },
        { "id": "memory", "label": "SD card inserted, sufficient space", "required": true },
        { "id": "gimbal", "label": "Gimbal and camera functional", "required": true }
      ]
    },
    {
      "title": "Environment",
      "items": [
        { "id": "wind", "label": "Wind speed acceptable (<20mph)", "required": true },
        { "id": "visibility", "label": "Visibility >3 statute miles", "required": true },
        { "id": "clouds", "label": "Cloud ceiling >400ft AGL", "required": true },
        { "id": "airspace", "label": "Airspace authorization confirmed", "required": true },
        { "id": "tfr", "label": "No active TFRs in area", "required": true }
      ]
    },
    {
      "title": "Operations",
      "items": [
        { "id": "vlos", "label": "Visual line of sight maintained", "required": true },
        { "id": "vo", "label": "Visual observer present (if required)", "required": false },
        { "id": "people", "label": "No people under flight path", "required": true },
        { "id": "remote_id", "label": "Remote ID broadcasting", "required": true }
      ]
    }
  ]
}
```
3. Auto-populate weather fields from existing weather data
4. Save completed checklists to IDB → link to drone flight log entry
5. "Sign Off" button captures timestamp + user name → generates PDF-embeddable record

**Supabase:** New `drone_flights` table with checklist JSON, or embed in existing report data

---

### IMPL-04: Airspace Checker Enhancement
**Effort:** Medium (2–3 days) | **Dependencies:** FAA data API

**Current state:** `maps.js` already has an "airspace" tab that loads an FAA UAS Facility Map via iframe from `faa.maps.arcgis.com`. It has a Leaflet fallback with ArcGIS tile layers if the iframe fails.

**Enhancement path:**
1. **Replace iframe with native Leaflet layers** (more control, better UX):
   - FAA UDDS (UAS Data Delivery System): `https://udds-faa.opendata.arcgis.com/` — free, open data
   - ArcGIS Feature Service URLs for: UAS Facility Maps, Controlled Airspace, Airports, TFRs
   - Load as GeoJSON or via Esri Leaflet plugin (`esri-leaflet`, 30KB, Apache-2.0)
2. **Color-coded zones:** Green (clear), Yellow (caution/LAANC needed), Red (restricted)
3. **Tap for details:** Show ceiling altitude, authorization requirements, nearest airport
4. **TFR overlay:** Pull active TFRs from FAA NOTAM API
5. **"Can I Fly Here?" summary:** Single-screen answer based on GPS location

**API:** FAA UAS data is FREE and public via ArcGIS REST services. No API key needed.
- Facility Maps: `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/`
- Supports GeoJSON output format

---

### IMPL-05: Drone Flight Log
**Effort:** Medium (3–4 days) | **Dependencies:** Supabase table

**Supabase schema:**
```sql
CREATE TABLE drone_flight_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  report_id UUID REFERENCES reports(id),  -- link to daily report
  
  -- Flight details
  flight_date DATE NOT NULL,
  pilot_name TEXT,
  drone_model TEXT,
  drone_serial TEXT,
  
  -- GPS
  takeoff_lat DOUBLE PRECISION,
  takeoff_lng DOUBLE PRECISION,
  landing_lat DOUBLE PRECISION,
  landing_lng DOUBLE PRECISION,
  max_altitude_ft INTEGER,
  
  -- Duration
  takeoff_time TIMESTAMPTZ,
  landing_time TIMESTAMPTZ,
  flight_duration_min INTEGER,
  
  -- Conditions
  wind_speed_mph INTEGER,
  temperature_f INTEGER,
  visibility TEXT,
  weather_conditions TEXT,
  
  -- Compliance
  part107_compliant BOOLEAN DEFAULT true,
  airspace_auth TEXT,  -- LAANC auth number if applicable
  remote_id_active BOOLEAN DEFAULT true,
  preflight_checklist JSONB,  -- completed checklist
  
  -- Media
  photo_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**UI:** Form overlay (same pattern as project-config). Auto-fill:
- Date/time from device
- Weather from existing weather integration
- GPS from device location
- Pilot name from user profile

**Integration with daily report:** "Attach Flight Log" button in interview/report that references the flight log entry and auto-generates a summary paragraph for the AI to include.

---

### IMPL-06: Document Scanner
**Effort:** Medium-High (4–5 days) | **Dependencies:** Tesseract.js, OpenCV.js (optional)

**Libraries:**
- **Tesseract.js** v5 — 34K ⭐, Apache-2.0, pure JS OCR
  - CDN: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
  - Size: ~170KB JS + downloads ~15MB language data on first use (cached after)
  - Supports 100+ languages, runs in web worker (non-blocking)
- **OpenCV.js** — Apache-2.0, image processing
  - Used for: perspective correction, auto-crop, contrast enhancement
  - Size: ~8MB WASM (heavy — consider loading on-demand only when scanner is opened)
  - Alternative: skip OpenCV, use simpler canvas-based crop/contrast

**Implementation (without OpenCV for v1):**
1. Open camera → capture photo
2. Manual crop with drag handles (use existing canvas patterns from photo-markup.js)
3. Apply contrast/brightness via canvas filters
4. Run Tesseract.js OCR → extract text
5. Display text preview → user edits if needed
6. Save: original image + extracted text to IDB/Supabase
7. "Attach to Report" → links scan to current daily report

**v2 enhancements (with OpenCV):**
- Auto-detect document edges
- Perspective warp to flatten
- Auto-enhance contrast for better OCR

---

### IMPL-07: Quantity Tracking
**Effort:** Medium (3–4 days) | **Dependencies:** Supabase table, integration with interview flow

**Concept:** Define pay items per project → log daily installed quantities → running totals

**Supabase schema:**
```sql
CREATE TABLE pay_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  item_number TEXT,           -- e.g., "401-1"
  description TEXT,           -- e.g., "Type A Asphalt"
  unit TEXT,                  -- e.g., "tons", "LF", "CY", "EA"
  contract_quantity NUMERIC,  -- total contract amount
  unit_price NUMERIC,         -- price per unit
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_quantities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pay_item_id UUID REFERENCES pay_items(id),
  report_id UUID REFERENCES reports(id),
  quantity_installed NUMERIC,
  station_from TEXT,          -- e.g., "45+20"
  station_to TEXT,            -- e.g., "52+80"
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**UI:** 
- In project config: define pay items (or import from CSV/spreadsheet)
- In interview: "Log Quantities" section → select pay item → enter quantity → auto-calculates running total and % complete
- In daily report AI: auto-include "Materials installed today: 45 CY Type A Concrete (Station 45+20 to 52+80)"

---

### IMPL-08: Crew Time Tracking (Critical Gap — Raken's #2 Feature)
**Effort:** Medium-High (4–5 days) | **Dependencies:** Supabase tables, interview integration

**Why critical:** Raken's time tracking is their second most-used feature. Every GC and sub needs time cards. Not having this is an immediate "nope" for many buyers.

**Supabase schema:**
```sql
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  report_id UUID REFERENCES reports(id),  -- link to daily report
  
  worker_name TEXT NOT NULL,
  trade TEXT,                    -- e.g., "Carpenter", "Laborer", "Iron Worker"
  classification TEXT,           -- e.g., "Journeyman", "Apprentice", "Foreman"
  cost_code TEXT,                -- project cost code
  
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER DEFAULT 30,
  total_hours NUMERIC,           -- auto-calculated
  overtime_hours NUMERIC DEFAULT 0,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crew_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,
  trade TEXT,
  classification TEXT,
  company TEXT,                   -- contractor/sub name
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**UI flow:**
1. **Crew roster** in project config — add workers with name, trade, company
2. **Daily time entry** during interview or as standalone tool:
   - Select workers present today (checkbox list from roster)
   - Bulk set times (most crews have same hours)
   - Individual overrides for overtime, half days, etc.
   - Cost code assignment (optional, from project config)
3. **Time summary** auto-generated for daily report:
   - "12 workers on site: 4 carpenters (32 hrs), 3 laborers (24 hrs), 5 iron workers (40 hrs)"
   - Total man-hours for the day
4. **Export** — CSV for payroll integration

**Integration with existing code:**
- `js/interview/contractors-personnel.js` already handles contractor/personnel management
- Add a "Time Cards" section to the guided interview or as a separate tool overlay
- Personnel data structure in `interviewState` already has `name`, `trade` fields — extend with hours

**Key difference from Raken:** FieldVoice can auto-summarize time data via AI into the daily report narrative. Raken just shows raw data. Our AI can write: "A crew of 12 worked 96 total man-hours today, including 8 hours of overtime for the concrete pour."

---

### IMPL-09: Toolbox Talk System (Critical Gap)
**Effort:** Medium (3–4 days) | **Dependencies:** Supabase storage for talk library

**Implementation:**

**Talk Library (bundled + custom):**
- Bundle 30–50 common construction safety talks as JSON/HTML:
  - Fall Protection, Scaffold Safety, Excavation Safety, Electrical Safety
  - PPE Requirements, Heat Stress, Cold Stress, Confined Spaces
  - Crane Safety, Rigging, Trenching, Fire Prevention
  - Hand/Power Tools, Silica Exposure, Noise Exposure, Back Safety
  - Ladder Safety, Housekeeping, Struck-By Hazards, Caught-In/Between
- Each talk: title, content (HTML), duration (5-15 min), category, language (EN/ES)
- Store in `public/talks/` as static JSON files (no API needed, works offline)
- Custom talks: user uploads PDF or types content → stored in Supabase storage

**Open source talk content:** OSHA publishes free safety fact sheets and toolbox talk outlines. Not copyrighted (federal government work = public domain). Available at:
- `https://www.osha.gov/publications` — free PDFs
- Many state DOTs publish toolbox talks for construction projects

**Supabase schema:**
```sql
CREATE TABLE toolbox_talks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  report_id UUID REFERENCES reports(id),  -- link to daily report
  
  talk_title TEXT NOT NULL,
  talk_content TEXT,              -- HTML content or reference to bundled talk
  talk_source TEXT,               -- "library", "custom", "uploaded"
  language TEXT DEFAULT 'en',
  
  presented_by TEXT,
  presented_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  
  attendees JSONB,               -- [{ name, signature_data, company }]
  photo_ids TEXT[],              -- photos of the meeting
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**UI flow:**
1. **Select talk** — browse library by category, or pick custom
2. **Present** — full-screen view of talk content (readable on phone at arm's length)
3. **Attendance** — crew members sign on phone screen (canvas signature capture — reuse pattern from photo-markup.js!) or just check names from crew roster
4. **Complete** — saves record, auto-includes in daily report: "Toolbox talk: Fall Protection presented to 8 workers at 7:00 AM"
5. **Compliance view** — which projects have talks this week, which are overdue

**Signature capture:** The photo-markup.js already has canvas drawing with touch support. Extracting the signature-capture pattern is straightforward — same canvas setup, just save the drawn strokes as a PNG blob.

---

### IMPL-10: Safety Observations (Quick Win)
**Effort:** Low-Medium (2 days) | **Dependencies:** Supabase table

**Concept:** "See something, snap it, note it" — simplest possible safety documentation.

**UI:** Single-screen form:
1. Take photo (use existing camera/media-utils.js)
2. Select type: Positive / Hazard / Near Miss
3. Category dropdown: Fall, Electrical, Housekeeping, PPE, Trenching, Traffic Control, Other
4. Description (text or voice dictation — reuse interview dictation!)
5. Severity: Low / Medium / High / Critical
6. Assigned to (select contractor from roster)
7. Due date for correction
8. Save → stored in Supabase, auto-included in daily report

**Supabase schema:**
```sql
CREATE TABLE safety_observations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  report_id UUID REFERENCES reports(id),
  
  type TEXT CHECK (type IN ('positive', 'hazard', 'near_miss')),
  category TEXT,
  description TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  photo_ids TEXT[],
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  
  assigned_to TEXT,              -- contractor name
  due_date DATE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**AI integration:** The daily report AI can auto-summarize: "2 safety observations documented: 1 positive observation (proper fall protection on scaffold), 1 hazard (missing barricade at excavation, assigned to ABC Contractors, due 2/22)."

---

## 💡 WILD IDEAS (Long-Term / Exploratory)

- **AI Safety Observer** — use device camera + AI to detect PPE violations in real-time
- **Noise Monitoring Recorder** — extend decibel meter to log continuous noise levels (environmental compliance)
- **Traffic Control Monitor** — photo AI that checks sign placement, cone spacing
- **Spec Checker** — OCR a spec section → AI compares to field conditions in report
- **Time-Lapse Generator** — auto-capture a photo every X minutes from a fixed position, stitch into timelapse
- **Soil Color Identifier** — Munsell chart comparison via camera + color analysis
- **Rebar Counter** — AI counts rebar in a photo (computer vision)
