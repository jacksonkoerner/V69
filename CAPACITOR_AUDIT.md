# FieldVoice Pro v6.9 — Capacitor Readiness Audit

**Date:** 2026-02-07
**Scope:** Analysis only — no packages installed, no code changed

---

## 1. Package Setup

| Item | Status |
|------|--------|
| `package.json` | Exists — minimal. Only dependency: `sharp` (devDependency for icon generation) |
| `node_modules/` | Not present (never installed) |
| `package-lock.json` | Exists |
| Build tools | **None.** No webpack, vite, rollup, or TypeScript. Vanilla JS with zero build step |
| Capacitor config | **Does not exist.** No `capacitor.config.ts` or `capacitor.config.json` |

**Action needed:** The `package.json` needs `name`, `version`, `scripts`, and all Capacitor dependencies added. No existing npm setup will conflict.

---

## 2. File Structure

```
/ (repo root)
├── index.html                  ← 12 HTML files, all in root
├── quick-interview.html
├── report.html
├── finalreview.html
├── archives.html
├── permissions.html
├── projects.html
├── project-config.html
├── settings.html
├── landing.html
├── permission-debug.html
├── admin-debug.html
├── manifest.json               ← PWA manifest
├── package.json
│
├── js/                         ← 33 JS files (22,296 lines total)
│   ├── config.js               ← Supabase credentials
│   ├── sw.js                   ← Service worker
│   ├── pwa-utils.js
│   ├── quick-interview.js      ← 244K, largest file
│   ├── report.js               ← 110K
│   ├── finalreview.js          ← 84K
│   └── ... (30 more modules)
│
├── assets/                     ← Favicons, brand images (8 files)
├── icons/                      ← PWA icons (17 files, 72px–512px)
├── supabase/migrations/        ← 9 SQL migration files
└── sql/                        ← 1 query file
```

**Capacitor `webDir` assessment:** Everything is flat in the repo root. Capacitor's `webDir` can point to `.` (the root) since there's no build step producing an output folder. If a build step is added later, assets would need to be copied to a `dist/` or `www/` folder.

**No CSS files exist.** All styling comes from Tailwind CDN + inline Tailwind classes.

---

## 3. Findings by Risk Level

### WILL BREAK — Must fix before shipping

#### 3a. Tailwind CSS loaded via JIT CDN (all 12 HTML files)
```html
<script src="https://cdn.tailwindcss.com"></script>
```
The CDN version runs a JIT compiler in the browser at page load. This **will not work reliably** in a Capacitor WebView because:
- Offline: no network = no styles = blank unusable app
- Even online, the JIT compile adds 200–400ms latency on every page load
- The CDN script is a development tool, not production-ready

**Fix:** Pre-compile Tailwind to a static CSS file and bundle it locally.

#### 3b. `navigator.mediaDevices.getUserMedia` — camera & microphone (7 files, ~10 call sites)
| File | Line | Use |
|------|------|-----|
| `js/quick-interview.js` | 4861 | Microphone for voice capture |
| `js/decibel.js` | 105 | Microphone for dB measurement |
| `js/qrscanner.js` | 113 | Rear camera for QR scanning |
| `js/flashlight.js` | 97 | Camera stream to control torch |
| `js/permissions.js` | 290, 358, 669, 694 | Permission probing for mic & camera |

WebView does not natively prompt for camera/microphone permissions the way a browser does. On **iOS**, the WKWebView requires the native app's `Info.plist` to declare `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`, and the Capacitor app itself must request these permissions at the native level. On **Android**, `getUserMedia` works in WebView only if the native app grants `CAMERA` and `RECORD_AUDIO` permissions and the WebView's `onPermissionRequest` is properly wired.

**Fix:** Either use Capacitor plugins (`@capacitor/camera`, community microphone plugin) or ensure the native shell properly delegates WebView permission requests.

#### 3c. Flashlight via camera torch constraint (`js/flashlight.js:97`)
```javascript
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
// then: track.applyConstraints({ advanced: [{ torch: true }] })
```
The `torch` constraint is non-standard and **will not work** in most mobile WebViews. Android Chrome supports it but WKWebView (iOS) does not.

**Fix:** Use a Capacitor flashlight plugin (e.g., `@nickkelly/capacitor-flashlight` or similar community plugin).

#### 3d. Google Docs PDF Viewer in iframe (`js/archives.js:257`)
```javascript
`https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`
```
Google Docs Viewer embedded in an iframe **will fail** in Capacitor WebViews due to Google's X-Frame-Options restrictions and CORS policies on mobile WebViews.

**Fix:** Use a local PDF rendering solution (pdf.js or a Capacitor file-opener plugin).

#### 3e. Absolute path navigation in nuclear reset (`js/settings.js:467, 472`)
```javascript
window.location.href = '/index.html';
```
In Capacitor, the app is served from `capacitor://localhost` (iOS) or `http://localhost` (Android). An absolute path like `/index.html` resolves to the server root, which **may work** on Android but behaves inconsistently on iOS depending on the server scheme.

**Fix:** Change to relative path `./index.html`.

---

### MIGHT CAUSE ISSUES — Test carefully, likely need changes

#### 3f. `navigator.geolocation` (5 files, 5 call sites)
| File | Line |
|------|------|
| `js/media-utils.js` | 255 |
| `js/ui-utils.js` | 306 |
| `js/quick-interview.js` | 4879 |
| `js/permissions.js` | 426, 720 |

The web Geolocation API *does* work in Capacitor WebView, but:
- Permission prompts may not appear correctly without native-level permission setup
- iOS requires `NSLocationWhenInUseUsageDescription` in `Info.plist`
- Accuracy and battery behavior differ from browser

**Likely OK** if native permissions are configured. Consider `@capacitor/geolocation` for consistent cross-platform behavior.

#### 3g. `DeviceOrientationEvent.requestPermission()` — compass & level (`js/compass.js`, `js/level.js`)
```javascript
DeviceOrientationEvent.requestPermission().then(response => { ... })
```
This iOS 13+ API works in Safari but behavior in WKWebView (Capacitor) is inconsistent. On Android, `requestPermission` doesn't exist — the event just fires (or doesn't). The code does check for `requestPermission` existence before calling it, which is good, but the actual permission dialog may not appear in WebView.

**Likely needs** a Capacitor motion plugin or native permission bridging.

#### 3h. `navigator.share` — emergency location sharing (`js/index.js:899`)
```javascript
navigator.share({ title: '...', text: '...', url: '...' })
```
Web Share API has limited support in WebViews. On iOS WKWebView it may work; on Android WebView it typically does not.

**Fix:** Use `@capacitor/share` plugin as the primary path, with the web API as fallback.

#### 3i. `window.open()` — external links (`js/maps.js:205, 208`)
```javascript
window.open('https://opensky.wing.com', '_blank')
window.open('https://app.aloft.ai', '_blank')
```
In Capacitor WebView, `window.open` either does nothing or opens inside the WebView (no back button, traps the user). `target="_blank"` links behave the same way.

**Fix:** Use `@capacitor/browser` (`Browser.open()`) or `@capacitor/app-launcher` for external URLs.

#### 3j. `window.location.origin` check in PWA navigation (`js/pwa-utils.js:33`)
```javascript
if (link && link.href && link.href.startsWith(window.location.origin)) {
```
In Capacitor, `window.location.origin` is `capacitor://localhost` (iOS) or `http://localhost` (Android). Internal links in the HTML point to relative paths which resolve to these origins, so this *should* work. But any links constructed with the original domain (e.g., GitHub Pages URL) would fail this check.

**Test carefully** during integration.

#### 3k. Service worker scope and registration (`js/pwa-utils.js:48`)
```javascript
navigator.serviceWorker.register('./js/sw.js', { scope: '/' })
```
Service workers do work in Capacitor's WebView, but:
- On iOS, service worker support in WKWebView has been historically limited
- The cache-first strategy may interfere with Capacitor's asset serving — Capacitor serves files from the native filesystem, so the SW intercepting those requests can cause stale content after app updates
- The `SKIP_WAITING` and update banner flow is PWA-specific and irrelevant in a native app (updates come through the app store)

**Recommendation:** Disable the service worker in the Capacitor build. Use Capacitor's native asset handling instead. The `initPWA({ skipServiceWorker: true })` option already exists.

#### 3l. `localStorage` / `sessionStorage` — extensive usage (17 files, 100+ call sites)
Works in Capacitor WebView, but:
- **Storage quota** is lower in WebView (~5MB) vs modern browsers (~10MB)
- `js/quick-interview.js:3817` iterates over all localStorage keys to estimate size — this works but won't reflect actual WebView limits
- Clearing app data in device settings wipes localStorage
- The app already uses IndexedDB (`js/data-layer.js`, `js/indexeddb-utils.js`) for larger data, which is good

**Likely OK** for most use cases. The 244K quick-interview module's heavy localStorage use should be tested for quota limits.

#### 3m. External iframes — Windy & FAA ArcGIS
| Iframe | File | URL |
|--------|------|-----|
| Windy weather radar | `js/index.js:712` | `https://embed.windy.com/embed.html?...` |
| Windy weather radar | `js/maps.js:91` | `https://embed.windy.com/embed.html?...` |
| FAA airspace map | `js/maps.js:100` | `https://faa.maps.arcgis.com/apps/webappviewer/...` |
| PDF viewer | `archives.html:94` | Dynamic (Google Docs) — covered in 3d |

External iframes in Capacitor WebView may:
- Be blocked by Content-Security-Policy if not configured
- Fail to load due to the iframe source's X-Frame-Options headers
- Lose interactivity (pinch-zoom, scroll) inside WebView

Windy embeds are generally permissive with iframe embedding. FAA ArcGIS may have restrictions.

**Test thoroughly.** If blocked, replace with in-app browser overlays or native map SDKs.

#### 3n. `tel:911` link (`js/index.js:870`)
```html
<a href="tel:911">Call 911</a>
```
`tel:` links work in Capacitor because the native OS handles the URI scheme. However, the dialer behavior varies by platform. This is a safety-critical feature.

**Likely OK** but test on both platforms to confirm the dialer opens reliably.

---

### FINE AS-IS — No changes needed

#### 3o. Supabase backend (`js/config.js`)
```javascript
const SUPABASE_URL = 'https://wejwhplqnhciyxbinivx.supabase.co';
```
Standard HTTPS API endpoint. Fetch calls to Supabase will work identically in Capacitor. The Supabase JS client is loaded from CDN (`jsdelivr`) — this will work as long as the CDN dependency is resolved (see 4 below).

#### 3p. n8n webhook URLs (`js/project-config.js:2`, `js/report.js:26`, `js/quick-interview.js:2069`)
```
https://advidere.app.n8n.cloud/webhook/fieldvoice-project-extractor-6.5
https://advidere.app.n8n.cloud/webhook/fieldvoice-refine-v6.6
```
Standard HTTPS POST endpoints. These work the same in WebView as in a browser. No CORS issues since n8n webhooks typically return permissive CORS headers.

#### 3q. Relative page navigation (20+ instances across all JS files)
```javascript
window.location.href = 'index.html';
window.location.href = 'report.html?date=...&reportId=...';
```
All internal navigation uses relative paths (except the two `/index.html` cases noted in 3e). Relative navigation works correctly in Capacitor.

#### 3r. `URLSearchParams` usage (4+ files)
```javascript
const params = new URLSearchParams(window.location.search);
```
Works identically in Capacitor WebView.

#### 3s. IndexedDB data layer (`js/data-layer.js`, `js/indexeddb-utils.js`)
Well-implemented offline-first data layer using IndexedDB. This is fully compatible with Capacitor WebView and is the correct pattern for structured data storage in hybrid apps.

#### 3t. No `jacksonkoerner.github.io` URLs found
No hardcoded GitHub Pages URLs exist anywhere in the codebase. The app uses only relative paths for internal navigation.

#### 3u. `navigator.onLine` / online-offline events (`js/pwa-utils.js`)
These events fire correctly in Capacitor WebView on both iOS and Android.

#### 3v. PWA manifest (`manifest.json`)
Ignored by Capacitor (the native app shell replaces all manifest functionality). No conflict.

---

## 4. CDN Dependencies — Full Inventory

Every external resource the app loads over the network:

| Library | Version | CDN | Used In | Offline Risk |
|---------|---------|-----|---------|--------------|
| **Tailwind CSS** | latest (JIT) | cdn.tailwindcss.com | All 12 HTML files | **CRITICAL** — no styles without network |
| **Font Awesome** | 6.4.0 | cdnjs.cloudflare.com | All 12 HTML files | HIGH — no icons without network |
| **Supabase JS** | @2 | cdn.jsdelivr.net | 10 HTML files | HIGH — no auth/database without it |
| **Leaflet** | 1.9.4 | unpkg.com | index.html | MEDIUM — maps page broken |
| **Leaflet CSS** | 1.9.4 | unpkg.com | index.html | MEDIUM — maps unstyled |
| **jsQR** | 1.4.0 | cdn.jsdelivr.net | index.html | MEDIUM — QR scanner broken |
| **html2canvas** | 1.4.1 | cdnjs.cloudflare.com | finalreview.html | MEDIUM — PDF export broken |
| **jsPDF** | 2.5.1 | cdnjs.cloudflare.com | finalreview.html | MEDIUM — PDF export broken |
| **Google Fonts (Inter)** | — | fonts.googleapis.com | landing.html | LOW — falls back to system font |
| **FA woff2 fonts** | 6.4.0 | cdnjs.cloudflare.com | (loaded by FA CSS) | Cached by SW |

The service worker (`js/sw.js`) caches only Tailwind and Font Awesome CSS/fonts. **Supabase JS, Leaflet, jsQR, html2canvas, and jsPDF are NOT cached** by the service worker and will fail on cold offline loads.

**Recommendation:** Bundle all CDN dependencies locally in a `vendor/` directory. This eliminates network dependency, improves load time, and makes the app self-contained inside the Capacitor binary.

---

## 5. Service Worker Assessment

| Property | Value |
|----------|-------|
| File | `js/sw.js` |
| Cache name | `fieldvoice-pro-v1.19.0` |
| Static assets cached | 22 files (HTML, some JS, icons, manifest) |
| CDN assets cached | 5 (Tailwind script, FA CSS, 3 FA font files) |
| Strategy (static) | Cache-first, stale-while-revalidate |
| Strategy (API) | Network-first, offline JSON fallback |
| Push notifications | Not implemented |
| Background sync | Not implemented |

**Capacitor conflict risk:** Moderate. Capacitor serves app files from the local filesystem via its own server (`capacitor://localhost` on iOS, `http://localhost` on Android). The service worker's fetch handler intercepts *all* requests, including these locally-served files. This means:

1. After an app store update with new HTML/JS, the SW may serve stale cached versions
2. The SW update flow (check for new SW → show banner → reload) doesn't apply in native apps
3. Cache storage adds redundant disk usage since Capacitor already has the files natively

**Recommendation:** Disable the service worker for Capacitor builds using the existing `initPWA({ skipServiceWorker: true })` option. Rely on Capacitor's native asset serving. Keep the SW for the web/PWA version only.

---

## 6. Summary

### Must fix (will break)
1. **Tailwind CDN JIT** → pre-compile to static CSS
2. **getUserMedia permission flow** → configure native permissions + consider Capacitor plugins
3. **Flashlight torch constraint** → use native plugin
4. **Google Docs PDF viewer iframe** → use local PDF renderer
5. **Absolute `/index.html` paths** → change to relative `./index.html`

### Should address (likely issues)
6. **Service worker** → disable in Capacitor builds
7. **DeviceOrientationEvent** → test in WebView, may need native bridge
8. **navigator.share** → use `@capacitor/share` plugin
9. **window.open for external URLs** → use `@capacitor/browser`
10. **All CDN dependencies** → bundle locally for offline reliability
11. **Windy/FAA iframes** → test for X-Frame-Options blocking

### Probably fine (verify during testing)
12. Geolocation (works if native permissions configured)
13. localStorage (works within WebView quota)
14. tel: links (OS handles the scheme)
15. Relative navigation (compatible)
16. Supabase & n8n API calls (standard HTTPS)
17. IndexedDB data layer (fully compatible)
18. URLSearchParams (fully compatible)
19. Online/offline events (fire correctly in WebView)
