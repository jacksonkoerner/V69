// Photo handling functions for quick-interview
// Includes: handlePhotoInput, removePhoto, updatePhotoCaption, autoExpandCaption, savePhotoToIndexedDB

var IS = window.interviewState;

// ============ PHOTOS ============
/**
 * Handle photo input (full mode)
 * Photos are added immediately to the UI, then uploaded to Supabase in the background.
 * If offline or upload fails, the local blob is kept for retry at FINISH.
 */
async function handlePhotoInput(e) {
    console.log('[PHOTO] handlePhotoInput triggered');

    const files = e.target.files;
    if (!files || files.length === 0) {
        console.warn('[PHOTO] No files selected');
        showToast('No photo selected', 'warning');
        return;
    }

    console.log(`[PHOTO] Processing ${files.length} file(s)`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`[PHOTO] File ${i + 1}: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);

        // Validate file type
        if (!file.type.startsWith('image/')) {
            console.error(`[PHOTO] Invalid file type: ${file.type}`);
            showToast(`Invalid file type: ${file.type}`, 'error');
            continue;
        }

        // Validate file size (max 20MB)
        if (file.size > 20 * 1024 * 1024) {
            console.error(`[PHOTO] File too large: ${file.size} bytes`);
            showToast('Photo too large (max 20MB)', 'error');
            continue;
        }

        // Show processing indicator
        showToast('Processing photo...', 'info');

        // Get GPS coordinates (using multi-reading high accuracy)
        let gps = null;
        try {
            console.log('[PHOTO] Requesting GPS coordinates (multi-reading)...');
            gps = await getHighAccuracyGPS(true);
            if (gps) {
                console.log(`[PHOTO] GPS acquired: ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} (±${gps.accuracy}m)`);
            }
        } catch (err) {
            console.warn('[PHOTO] GPS failed:', err);
            // Continue without GPS - don't block the photo
        }

        try {
            // Create timestamp
            const now = new Date();
            const timestamp = now.toISOString();
            const date = getLocalDateString(now);
            const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

            const photoId = crypto.randomUUID();

            // Compress image
            showToast('Compressing photo...', 'info');
            console.log('[PHOTO] Reading file for compression...');
            const rawDataUrl = await readFileAsDataURL(file);
            const compressedDataUrl = await compressImage(rawDataUrl, 1200, 0.7);

            // Open photo markup overlay for annotation
            let finalDataUrl = compressedDataUrl;
            if (typeof openPhotoMarkup === 'function') {
                const markedUp = await openPhotoMarkup(compressedDataUrl, {
                    lat: gps ? gps.lat : null,
                    lon: gps ? gps.lng : null,
                    timestamp: Date.now(),
                    heading: null
                });
                if (markedUp === null) {
                    // User discarded — skip this photo
                    console.log('[PHOTO] Markup discarded, skipping photo');
                    continue;
                }
                finalDataUrl = markedUp;
            }

            // Create metadata-only photo object for IS.report.photos[]
            // base64 is stored ONLY in IndexedDB to avoid localStorage quota exhaustion (OFF-01, MEM-01)
            const photoObj = {
                id: photoId,
                url: finalDataUrl, // Show local data immediately (will be replaced by Supabase URL after upload)
                storagePath: null,
                uploadStatus: 'pending', // pending | uploading | uploaded | failed
                caption: '',
                timestamp: timestamp,
                date: date,
                time: time,
                gps: gps,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            };

            console.log('[PHOTO] Adding photo to report:', {
                id: photoObj.id,
                timestamp: photoObj.timestamp,
                gps: photoObj.gps
            });

            // Add metadata to local report — NO base64 in this object
            IS.report.photos.push(photoObj);

            // Save photo WITH base64 to IndexedDB only (local-first, large storage quota)
            await savePhotoToIndexedDB(photoObj, finalDataUrl);

            // Update UI immediately (photo visible with upload spinner)
            renderSection('photos');
            saveReport();

            // Background upload — non-blocking, reads base64 from IndexedDB
            backgroundUploadPhoto(photoObj, finalDataUrl);

            console.log(`[PHOTO] Success! Total photos: ${IS.report.photos.length}`);

        } catch (err) {
            console.error('[PHOTO] Failed to process photo:', err);
            showToast(`Photo error: ${err.message}`, 'error');
        }
    }

    // Reset the input so the same file can be selected again
    e.target.value = '';
}

/**
 * Upload a photo to Supabase Storage in the background.
 * Updates the photo object + UI with upload status (spinner → checkmark).
 * Non-blocking — does not freeze the UI.
 * base64 data is read from IndexedDB, NOT from IS.report.photos (OFF-01).
 */
async function backgroundUploadPhoto(photoObj, dataUrl) {
    if (!navigator.onLine) {
        console.log('[PHOTO] Offline — will upload at FINISH');
        photoObj.uploadStatus = 'failed';
        updatePhotoUploadIndicator(photoObj.id, 'failed');
        return;
    }

    try {
        photoObj.uploadStatus = 'uploading';
        updatePhotoUploadIndicator(photoObj.id, 'uploading');

        // Use the dataUrl passed in (from capture), or fall back to IndexedDB
        let uploadDataUrl = dataUrl;
        if (!uploadDataUrl) {
            const idbPhoto = await window.idb.getPhoto(photoObj.id);
            uploadDataUrl = idbPhoto?.base64;
        }
        if (!uploadDataUrl) {
            throw new Error('No base64 data available for upload');
        }

        const compressedBlob = await dataURLtoBlob(uploadDataUrl);
        console.log(`[PHOTO] Background uploading ${photoObj.id}...`);
        const result = await uploadPhotoToSupabase(compressedBlob, photoObj.id);

        // Update the metadata-only photo object in IS.report.photos
        photoObj.storagePath = result.storagePath;
        photoObj.url = result.publicUrl;
        photoObj.uploadStatus = 'uploaded';
        // No photoObj.base64 to clear — it was never stored here (OFF-01)

        // Update IndexedDB: set storagePath/url and clear base64 (uploaded successfully)
        const idbPhoto = await window.idb.getPhoto(photoObj.id);
        if (idbPhoto) {
            idbPhoto.storagePath = result.storagePath;
            idbPhoto.url = result.publicUrl;
            idbPhoto.base64 = null; // Free IndexedDB space — uploaded successfully
            idbPhoto.syncStatus = 'synced';
            await window.idb.savePhoto(idbPhoto);
        }

        updatePhotoUploadIndicator(photoObj.id, 'uploaded');
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
        saveReport();
        console.log('[PHOTO] Background upload complete:', photoObj.id);
    } catch (err) {
        console.warn('[PHOTO] Background upload failed:', err);
        photoObj.uploadStatus = 'failed';
        updatePhotoUploadIndicator(photoObj.id, 'failed');
        // base64 is preserved in IndexedDB — will retry at FINISH via uploadPendingPhotos()
    }
}

/**
 * Update the upload status indicator on a photo card.
 * @param {string} photoId - The photo UUID
 * @param {string} status - 'uploading' | 'uploaded' | 'failed'
 */
function updatePhotoUploadIndicator(photoId, status) {
    const indicator = document.getElementById(`upload-status-${photoId}`);
    if (!indicator) return;

    if (status === 'uploading') {
        indicator.innerHTML = '<i class="fas fa-spinner fa-spin text-white text-xs"></i>';
        indicator.className = 'absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg';
    } else if (status === 'uploaded') {
        indicator.innerHTML = '<i class="fas fa-check text-white text-xs"></i>';
        indicator.className = 'absolute top-2 left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg';
    } else if (status === 'failed') {
        indicator.innerHTML = '<i class="fas fa-cloud-arrow-up text-white text-xs"></i>';
        indicator.className = 'absolute top-2 left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg';
        indicator.title = 'Will upload on submit';
    }
}

async function removePhoto(index) {
    console.log(`[PHOTO] Removing photo at index ${index}`);
    const photo = IS.report.photos[index];
    if (!photo) return;

    // Immediately remove from UI for responsive feel
    const removedPhoto = IS.report.photos.splice(index, 1)[0];
    saveReport();
    renderSection('photos');

    // Show undo toast (3 second window)
    let undone = false;
    showToast('Photo removed — <b>tap to undo</b>', 'info', 3000, function() {
        undone = true;
        IS.report.photos.splice(index, 0, removedPhoto);
        saveReport();
        renderSection('photos');
        showToast('Photo restored', 'success');
    });

    // After undo window, actually delete from storage
    setTimeout(async function() {
        if (undone) return;
        try {
            await window.idb.deletePhoto(removedPhoto.id);
            console.log('[PHOTO] Deleted from IndexedDB:', removedPhoto.id);
        } catch (err) {
            console.warn('[PHOTO] Failed to delete from IndexedDB:', err);
        }
        if (removedPhoto.storagePath) {
            await deletePhotoFromSupabase(removedPhoto.id, removedPhoto.storagePath);
        }
    }, 3500);
}

// Update photo caption - save to localStorage and IndexedDB (Supabase on Submit)
async function updatePhotoCaption(index, value) {
    const maxLength = 500;
    const caption = value.slice(0, maxLength);
    if (IS.report.photos[index]) {
        IS.report.photos[index].caption = caption;
        saveReport();

        // Also update in IndexedDB
        const photo = IS.report.photos[index];
        if (photo.id) {
            try {
                const idbPhoto = await window.idb.getPhoto(photo.id);
                if (idbPhoto) {
                    idbPhoto.caption = caption;
                    await window.idb.savePhoto(idbPhoto);
                }
            } catch (err) {
                console.warn('[PHOTO] Failed to update caption in IndexedDB:', err);
            }
        }

        // Update character counter
        const counter = document.getElementById(`caption-counter-${index}`);
        if (counter) {
            const len = caption.length;
            if (len > 400) {
                counter.textContent = `${len}/${maxLength}`;
                counter.classList.remove('hidden');
                counter.classList.toggle('warning', len <= 480);
                counter.classList.toggle('limit', len > 480);
            } else {
                counter.classList.add('hidden');
            }
        }
    }
}

// Auto-expand caption textarea
// Auto-expand caption uses shared autoExpand with smaller max height
function autoExpandCaption(textarea) {
    autoExpand(textarea, 40, 128);
}

/**
 * Save photo to IndexedDB (local-first)
 * Photos are uploaded to Supabase only on explicit Submit.
 * base64 is stored ONLY in IndexedDB, never in IS.report.photos[] or localStorage (OFF-01).
 *
 * @param {Object} photo - Photo metadata object
 * @param {string} [base64Data] - Optional base64 data URL to store in IndexedDB
 */
async function savePhotoToIndexedDB(photo, base64Data) {
    try {
        const photoRecord = {
            id: photo.id,
            reportId: IS.currentReportId || 'pending',
            base64: base64Data || null, // base64 stored ONLY in IndexedDB (OFF-01)
            url: photo.url || null,
            storagePath: photo.storagePath || null,
            caption: photo.caption || '',
            gps: photo.gps || null,
            timestamp: photo.timestamp || new Date().toISOString(),
            fileName: photo.fileName || photo.id,
            syncStatus: 'pending', // Always pending until metadata saved to photos table
            createdAt: new Date().toISOString()
        };

        await window.idb.savePhoto(photoRecord);
        console.log('[PHOTO] Saved to IndexedDB:', photo.id);
    } catch (err) {
        console.error('[PHOTO] Failed to save to IndexedDB:', err);
    }
}
