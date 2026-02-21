// ============================================================================
// FieldVoice Pro v6 - Cloud Photo Rehydration (cloud-photos.js)
//
// Fetches photo metadata from Supabase `photos` table and generates
// proper public URLs from Supabase Storage. Enables cross-device photo
// display without requiring IndexedDB or localStorage.
//
// Uses:
// - config.js: supabaseClient
// ============================================================================

/**
 * Fetch photos from Supabase `photos` table for a given report.
 * Returns photo objects in the format expected by renderPhotos():
 *   { id, url, storagePath, caption, date, time, gps, timestamp, fileName }
 *
 * @param {string} reportId - The report UUID
 * @returns {Promise<Array>} Array of photo objects (empty if none found)
 */
async function fetchCloudPhotos(reportId) {
    if (!reportId || typeof supabaseClient === 'undefined' || !supabaseClient) return [];
    if (!navigator.onLine) return [];

    try {
        var result = await supabaseClient
            .from('photos')
            .select('id, report_id, photo_url, storage_path, caption, photo_type, filename, location_lat, location_lng, taken_at, created_at')
            .eq('report_id', reportId)
            .order('created_at', { ascending: true });

        if (result.error || !result.data || result.data.length === 0) {
            return [];
        }

        // SEC-04: Always generate a fresh signed URL from storage_path.
        // storage_path is the durable source of truth; photo_url may contain stale signed URLs.
        return Promise.all(result.data.map(async function(row) {
            var url = '';
            if (row.storage_path) {
                var urlResult = await supabaseClient.storage
                    .from('report-photos')
                    .createSignedUrl(row.storage_path, 3600); // 1 hour expiry
                url = urlResult.data?.signedUrl || '';
            } else {
                url = row.photo_url || '';
            }

            // Parse taken_at into date/time strings
            var dateStr = '--';
            var timeStr = '--';
            if (row.taken_at) {
                try {
                    var d = new Date(row.taken_at);
                    dateStr = d.toLocaleDateString();
                    timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                } catch (e) { /* ignore parse errors */ }
            }

            return {
                id: row.id,
                url: url,
                storagePath: row.storage_path || '',
                caption: row.caption || '',
                date: dateStr,
                time: timeStr,
                gps: (row.location_lat && row.location_lng)
                    ? { lat: parseFloat(row.location_lat), lng: parseFloat(row.location_lng) }
                    : null,
                timestamp: row.taken_at || row.created_at,
                fileName: row.filename || '',
                fileType: row.photo_type || ''
            };
        }));
    } catch (err) {
        console.error('[CLOUD-PHOTOS] Failed to fetch:', err);
        return [];
    }
}

/**
 * Re-sign photo URLs from their durable storage paths.
 * Use when photos are loaded from local cache (IDB/localStorage) and may have
 * expired signed URLs. Only re-signs photos that have a storagePath.
 * Photos without storagePath keep their existing url (base64 blobs, etc.).
 *
 * @param {Array} photos - Array of photo objects with {url, storagePath, ...}
 * @returns {Promise<Array>} Same array with refreshed url fields (mutated in place)
 */
async function resignPhotoUrls(photos) {
    if (!photos || photos.length === 0) return photos;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return photos;
    if (!navigator.onLine) return photos;

    await Promise.allSettled(photos.map(async function(photo) {
        if (!photo.storagePath) return;
        try {
            var result = await supabaseClient.storage
                .from('report-photos')
                .createSignedUrl(photo.storagePath, 3600);
            if (!result.error && result.data?.signedUrl) {
                photo.url = result.data.signedUrl;
            }
        } catch (e) {
            // Keep existing url on failure
        }
    }));

    return photos;
}

/**
 * Fetch photos for multiple report IDs at once (batch).
 * Returns a map of reportId → photo array.
 *
 * @param {string[]} reportIds - Array of report UUIDs
 * @returns {Promise<Object>} Map of reportId → Array of photo objects
 */
async function fetchCloudPhotosBatch(reportIds) {
    if (!reportIds || reportIds.length === 0) return {};
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return {};
    if (!navigator.onLine) return {};

    try {
        var result = await supabaseClient
            .from('photos')
            .select('id, report_id, photo_url, storage_path, caption, photo_type, filename, location_lat, location_lng, taken_at, created_at')
            .in('report_id', reportIds)
            .order('created_at', { ascending: true });

        if (result.error || !result.data || result.data.length === 0) {
            return {};
        }

        var photoMap = {};
        for (var i = 0; i < result.data.length; i++) {
            var row = result.data[i];
            if (!photoMap[row.report_id]) photoMap[row.report_id] = [];

            // SEC-04: Always generate a fresh signed URL from storage_path.
            // storage_path is the durable source of truth; photo_url may contain stale signed URLs.
            var url = '';
            if (row.storage_path) {
                var urlResult = await supabaseClient.storage
                    .from('report-photos')
                    .createSignedUrl(row.storage_path, 3600); // 1 hour expiry
                url = urlResult.data?.signedUrl || '';
            } else {
                url = row.photo_url || '';
            }

            var dateStr = '--';
            var timeStr = '--';
            if (row.taken_at) {
                try {
                    var d = new Date(row.taken_at);
                    dateStr = d.toLocaleDateString();
                    timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                } catch (e) { /* ignore */ }
            }

            photoMap[row.report_id].push({
                id: row.id,
                url: url,
                storagePath: row.storage_path || '',
                caption: row.caption || '',
                date: dateStr,
                time: timeStr,
                gps: (row.location_lat && row.location_lng)
                    ? { lat: parseFloat(row.location_lat), lng: parseFloat(row.location_lng) }
                    : null,
                timestamp: row.taken_at || row.created_at,
                fileName: row.filename || '',
                fileType: row.photo_type || ''
            });
        }
        return photoMap;
    } catch (err) {
        console.error('[CLOUD-PHOTOS] Batch fetch failed:', err);
        return {};
    }
}
