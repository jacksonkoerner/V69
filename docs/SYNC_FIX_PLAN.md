# Sync Fix Plan — Atomic Commits

Based on CODEX_SYNC_AUDIT.md findings. Each fix is one clean commit.

---

## Fix Order (dependency-safe)

1. **Fix 1: Photo render mode mismatch** (no deps, high visibility)
2. **Fix 2: Photo metadata upsert on background upload** (no deps)
3. **Fix 3: Report.html sync — base snapshot + merge** (no deps)
4. **Fix 4: Pull-to-refresh shared utility** (no deps)
5. **Fix 5: Silent error cleanup** (no deps, lowest priority)

---

## Fix 1: Photo Render Mode Mismatch

**Problem:** `applyInterviewMerge` calls `renderSection('photos')` which only renders guided mode grid (`#photos-grid`). Minimal/freeform mode uses `renderMinimalPhotos()` targeting `#minimalPhotosGrid`.

**Files:**
- `js/interview/persistence.js` — function `applyInterviewMerge`, ~line 502

**Change:**
```js
// BEFORE (line ~502):
case 'photos':
    if (typeof renderSection === 'function') renderSection('photos');
    needsPreviewUpdate = true;
    needsProgressUpdate = true;
    break;

// AFTER:
case 'photos':
    if (typeof renderSection === 'function') renderSection('photos');
    // Also re-render minimal mode photo grid if active
    if (typeof renderMinimalPhotos === 'function') renderMinimalPhotos();
    needsPreviewUpdate = true;
    needsProgressUpdate = true;
    break;
```

**Why both?** `renderSection('photos')` is a no-op when guided grid is hidden; `renderMinimalPhotos()` is a no-op when minimal grid is hidden. Calling both is safe and mode-agnostic.

**Test:** Take photo on Device A in minimal mode → should appear on Device B in minimal mode without switching views.

**Commit:** `fix: render photos in both guided and minimal mode on sync merge`

---

## Fix 2: Photo Metadata Upsert on Background Upload

**Problem:** `backgroundUploadPhoto()` uploads to Storage and updates IDB, but never upserts the `photos` table. That only happens at Submit via `uploadPendingPhotos()`. Cross-device rehydration via `fetchCloudPhotos()` depends on the `photos` table.

**Files:**
- `js/interview/photos.js` — function `backgroundUploadPhoto`, ~line 170-187

**Change:** After successful upload (where `storagePath` and `url` are set), add:
```js
// Upsert photo metadata to photos table for cross-device visibility
if (IS.currentReportId) {
    supabaseClient.from('photos').upsert({
        id: photoObj.id,
        report_id: IS.currentReportId,
        org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || null,
        storage_path: result.storagePath,
        photo_url: result.publicUrl,
        caption: photoObj.caption || '',
        filename: photoObj.fileName || null,
        location_lat: photoObj.gps?.lat || null,
        location_lng: photoObj.gps?.lng || null,
        taken_at: photoObj.timestamp || new Date().toISOString(),
        created_at: new Date().toISOString()
    }, { onConflict: 'id' }).then(function(r) {
        if (r.error) console.warn('[PHOTO] photos table upsert failed:', r.error.message);
        else console.log('[PHOTO] photos table metadata saved:', photoObj.id);
    });
}
```

**Why:** Uses same schema as `uploadPendingPhotos()` (line ~1263-1301 in persistence.js). Not duplicating — that function handles retry-on-submit for failed uploads. This handles immediate upsert on success.

**Test:** Take photo on Device A → check Supabase `photos` table → row should appear immediately (not just on Submit).

**Commit:** `fix: upsert photo metadata to photos table on background upload`

---

## Fix 3: Report.html Cross-Device Sync

**Problem:** Three issues compound:
1. Base snapshot (`_syncBase`) only updates after remote merge, never after local save → stale base makes three-way merge see "both changed" → local wins → "no changes"
2. `flushReportBackup` writes full `user_edits` object (last-write-wins race)
3. `pathToFieldId` in `applyReportMerge` is missing some autosaved fields

**Files:**
- `js/report/autosave.js` — functions: `flushReportBackup`, `applyReportMerge`, `initReportSyncBase`

**Change A — Update base after local flush (line ~344-350):**
```js
// In flushReportBackup .then() callback, AFTER broadcast:
// Update sync base to match what we just flushed to cloud
window._syncBase = { userEdits: JSON.parse(JSON.stringify(RS.userEdits)) };
```

**Change B — Expand pathToFieldId map (line ~108-132):**
Add missing entries:
```js
'overview.noabProjectNo': 'noabProjectNo',
'overview.cnoSolicitationNo': 'cnoSolicitationNo',
'overview.location': 'projectLocation',
'guidedNotes.workSummary': 'generalWorkSummary',
'safety.hasIncident': null  // radio button, skip DOM update
```

**Change C — Reset `_lastAppliedRevision` on page load (line ~121):**
Currently initialized to `-1` globally but never reset if user navigates to a different report. Add reset in `initReportSyncBase`:
```js
_lastAppliedRevision = -1;
_lastMergeAt = null;
```
(These are in realtime-sync.js but should be reset when report changes.)

**Test:** Open same report on two devices, type in a field on Device A → text should appear on Device B within ~6 seconds (flush 5s + fetch delay).

**Commit:** `fix: report cross-device sync — update base after flush, expand field map`

---

## Fix 4: Pull-to-Refresh

**Problem:** No pull-to-refresh on any page.

**Files:**
- NEW: `js/shared/pull-to-refresh.js`
- `index.html` — add `<script>` tag
- `report.html` — add `<script>` tag
- `quick-interview.html` — add `<script>` tag
- `archives.html` — add `<script>` tag

**New shared module (`js/shared/pull-to-refresh.js`):**
```js
// Pull-to-refresh for mobile
// Touch gesture: pull down from top → show indicator → reload
(function() {
    var THRESHOLD = 80; // px to trigger
    var startY = 0;
    var pulling = false;
    var indicator = null;

    function createIndicator() {
        indicator = document.createElement('div');
        indicator.id = 'pullRefreshIndicator';
        indicator.style.cssText = 'position:fixed;top:0;left:0;right:0;height:0;background:rgba(249,115,22,0.15);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:hidden;transition:height 0.2s;';
        indicator.innerHTML = '<i class="fas fa-arrow-down" style="color:#f97316;font-size:1.2rem;"></i>';
        document.body.prepend(indicator);
    }

    document.addEventListener('touchstart', function(e) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (!pulling) return;
        var dy = e.touches[0].clientY - startY;
        if (dy > 0 && dy < THRESHOLD * 2) {
            if (!indicator) createIndicator();
            indicator.style.height = Math.min(dy * 0.5, THRESHOLD) + 'px';
        }
    }, { passive: true });

    document.addEventListener('touchend', function() {
        if (!pulling) return;
        pulling = false;
        if (indicator && parseInt(indicator.style.height) >= THRESHOLD * 0.8) {
            indicator.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#f97316;font-size:1.2rem;"></i>';
            // Flush pending work before reload
            if (typeof flushInterviewBackup === 'function') flushInterviewBackup();
            if (typeof flushReportBackup === 'function') flushReportBackup();
            setTimeout(function() { location.reload(); }, 300);
        } else if (indicator) {
            indicator.style.height = '0';
        }
    }, { passive: true });
})();
```

**Script tag placement:** After `ui-utils.js`, before page-specific scripts. Same position on all 4 pages.

**Test:** On mobile, scroll to top, pull down → orange indicator → release → page reloads.

**Commit:** `feat: add pull-to-refresh on all main pages`

---

## Fix 5: Silent Error Cleanup

**Problem:** Multiple `catch(function(){})` blocks swallow errors silently.

**Files:**
- `js/interview/persistence.js` lines 562, 565, 576
- `js/report/data-loading.js` line 198
- `js/shared/realtime-sync.js` lines 307, 365, 431

**Change:** Replace empty catches with `console.warn` calls:
```js
// BEFORE:
}).catch(function() {});

// AFTER:
}).catch(function(e) { console.warn('[SYNC] Operation failed:', e && e.message || e); });
```

Since console-capture.js already pipes `console.warn` to Supabase `debug_logs`, this immediately surfaces in the log table.

**Test:** Check `debug_logs` table after normal usage — should see any previously-hidden errors.

**Commit:** `fix: replace silent catches with console.warn for debug visibility`
