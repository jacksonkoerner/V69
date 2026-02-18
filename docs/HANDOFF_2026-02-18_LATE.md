
## Late Night Session (02:00-03:07 CST) — Measurement Tools + Drone Vision

### What Got Built
- **Photo Measure tool** (js/tools/photo-measure.js, 501 lines) — camera capture → reference object calibration → tap-to-measure in ft/in + meters
- **3D Scan Viewer** (js/tools/scan-viewer.js, 731 lines) — import GLB/GLTF → Three.js orbit controls → raycast measurements with labels
- **Coming Soon badges** — Walk Measure, Laser Pair, LiDAR Scan added to Field Tools modal
- All committed & pushed to main

### What Jackson Wants Next

#### Drone Page (drones.html)
- Dedicated drone page accessible from the Drone Ops card on dashboard
- Click Drone Ops card → expands → click again or button → navigates to drones.html
- Landing page feel explaining the drone area of FieldVoice
- Coming Soon drone tools on the page:
  1. 🛸 Waypoint Planner — plan flight paths on map
  2. 🗺️ Ortho Map — upload/view drone orthomosaic overlays
  3. 📐 Aerial Measure — measure distances on drone imagery
  4. 🏗️ Site Progress — compare drone photos over time
- Reference QGroundControl (open source, GPLv3) for waypoint/map code
- Reference WebODM (open source) for photogrammetry processing

#### Measurement Tool Improvements
- 3D Scan: Should eventually scan WITH the camera (LiDAR/photogrammetry), not just upload files
- Walk Measure: Step counter / pace counting version is buildable now
- Laser Pair: Need physical Bluetooth laser distance meter to test
- LiDAR Scan: Capacitor + ARKit depth map plugin (iPhone Pro only)

### Codex Notes
- Codex 5.3 gets stuck in "thinking" phase on large multi-file tasks
- Breaking tasks into single-file focused prompts works much better
- --yolo flag (no sandbox) speeds things up
- heredoc for file creation can cause quote escaping artifacts in terminal output but actual files are clean
