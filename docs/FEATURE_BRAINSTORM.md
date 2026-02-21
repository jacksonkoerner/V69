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

## 💡 WILD IDEAS (Long-Term / Exploratory)

- **AI Safety Observer** — use device camera + AI to detect PPE violations in real-time
- **Noise Monitoring Recorder** — extend decibel meter to log continuous noise levels (environmental compliance)
- **Traffic Control Monitor** — photo AI that checks sign placement, cone spacing
- **Spec Checker** — OCR a spec section → AI compares to field conditions in report
- **Time-Lapse Generator** — auto-capture a photo every X minutes from a fixed position, stitch into timelapse
- **Soil Color Identifier** — Munsell chart comparison via camera + color analysis
- **Rebar Counter** — AI counts rebar in a photo (computer vision)
