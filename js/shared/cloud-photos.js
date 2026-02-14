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

        return result.data.map(function(row) {
            // Generate public URL from storage_path if photo_url is missing or is a blob URL
            var url = row.photo_url || '';
            if ((!url || url.startsWith('blob:')) && row.storage_path) {
                var urlResult = supabaseClient.storage
                    .from('report-photos')
                    .getPublicUrl(row.storage_path);
                url = urlResult.data?.publicUrl || '';
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
        });
    } catch (err) {
        console.error('[CLOUD-PHOTOS] Failed to fetch:', err);
        return [];
    }
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

            var url = row.photo_url || '';
            if ((!url || url.startsWith('blob:')) && row.storage_path) {
                var urlResult = supabaseClient.storage
                    .from('report-photos')
                    .getPublicUrl(row.storage_path);
                url = urlResult.data?.publicUrl || '';
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
