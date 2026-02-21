// ============================================================================
// js/shared/delete-report.js — Shared Supabase delete cascade
//
// Single-source cascade that deletes a report and all related data from
// Supabase.  Used by index/report-creation.js, interview/supabase.js,
// and report/delete-report.js.
// ============================================================================

/**
 * Delete a report and all related data from Supabase.
 * Runs the full cascade: photo storage → child tables → PDF storage →
 * final_reports → photos rows → parent reports row.
 *
 * Uses per-step try/catch so partial failures don't block the rest.
 * Uses .maybeSingle() on final_reports lookup (avoids 406 when no row exists).
 *
 * @param {string} reportId - The report UUID to delete
 * @returns {Promise<{success: boolean, errors: string[]}>}
 */
async function deleteReportCascade(reportId) {
    var errors = [];
    var client = supabaseClient;

    if (!reportId || !client) {
        return { success: false, errors: ['Missing reportId or supabaseClient'] };
    }

    // 1. Select photo storage paths
    var photoPaths = [];
    try {
        var photoResult = await client
            .from('photos')
            .select('storage_path')
            .eq('report_id', reportId);
        if (photoResult.data && photoResult.data.length > 0) {
            photoPaths = photoResult.data.map(function(p) { return p.storage_path; }).filter(Boolean);
        }
    } catch (e) {
        errors.push('photos select: ' + e.message);
    }

    // 2. Remove photos from storage bucket
    if (photoPaths.length > 0) {
        try {
            await client.storage.from('report-photos').remove(photoPaths);
        } catch (e) {
            errors.push('report-photos storage: ' + e.message);
        }
    }

    // 3. Delete child table rows
    var childTables = ['interview_backup', 'report_backup', 'ai_submissions', 'report_data'];
    for (var i = 0; i < childTables.length; i++) {
        try {
            await client.from(childTables[i]).delete().eq('report_id', reportId);
        } catch (e) {
            errors.push(childTables[i] + ': ' + e.message);
        }
    }

    // 4. Look up PDF path/url from reports table and remove from storage
    try {
        // Sprint 14: prefer pdf_path (durable); fall back to parsing pdf_url
        var reportResult = await client
            .from('reports')
            .select('pdf_path, pdf_url')
            .eq('id', reportId)
            .maybeSingle();

        var pdfPath = reportResult.data && reportResult.data.pdf_path;
        var pdfUrl = reportResult.data && reportResult.data.pdf_url;

        // Legacy fallback: check final_reports if neither path nor url on reports
        if (!pdfPath && !pdfUrl) {
            var finalResult = await client
                .from('final_reports')
                .select('pdf_url')
                .eq('report_id', reportId)
                .maybeSingle();
            pdfUrl = finalResult.data && finalResult.data.pdf_url;
        }

        // Resolve storage path: use pdf_path directly, or parse from signed URL
        var storagePath = pdfPath || null;
        if (!storagePath && pdfUrl) {
            var urlParts = pdfUrl.split('/report-pdfs/')[1];
            if (urlParts) {
                storagePath = decodeURIComponent(urlParts.split('?')[0]);
            }
        }

        if (storagePath) {
            await client.storage.from('report-pdfs').remove([storagePath]);
        }
    } catch (e) {
        errors.push('pdf cleanup: ' + e.message);
    }

    // 5. Delete final_reports row (legacy — table still exists but no longer written to)
    try {
        await client.from('final_reports').delete().eq('report_id', reportId);
    } catch (e) {
        errors.push('final_reports: ' + e.message);
    }

    // 6. Delete photos table rows
    try {
        await client.from('photos').delete().eq('report_id', reportId);
    } catch (e) {
        errors.push('photos delete: ' + e.message);
    }

    // 7. Delete the report itself (parent row — must be last)
    try {
        await client.from('reports').delete().eq('id', reportId);
    } catch (e) {
        errors.push('reports: ' + e.message);
    }

    return { success: errors.length === 0, errors: errors };
}

/**
 * Full local + cloud delete for a report.
 * Handles blocklist, localStorage cleanup, IDB cleanup, and Supabase cascade.
 * UI concerns (modals, animations, redirects) are NOT handled here — callers
 * manage their own UX.
 *
 * @param {string} reportId - The report UUID to delete
 * @returns {Promise<{success: boolean, errors: string[]}>}
 */
async function deleteReportFull(reportId) {
    var errors = [];

    if (!reportId) {
        return { success: false, errors: ['Missing reportId'] };
    }

    // 1. BLOCKLIST FIRST — prevents cloud recovery / realtime from resurrecting
    try {
        if (typeof addToDeletedBlocklist === 'function') addToDeletedBlocklist(reportId);
    } catch (e) {
        errors.push('blocklist: ' + e.message);
    }

    try {
        if (typeof getStorageItem === 'function' && typeof removeStorageItem === 'function') {
            var activeId = getStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID);
            if (activeId === reportId) removeStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID);
        }
    } catch (e) {
        errors.push('active-report-pointer: ' + e.message);
    }

    // 2. IDB cleanup (non-blocking, best-effort via Promise.allSettled)
    if (window.dataStore) {
        try {
            await Promise.allSettled([
                typeof window.dataStore.deleteReport === 'function'
                    ? window.dataStore.deleteReport(reportId).catch(function() {}) : Promise.resolve(),
                typeof window.dataStore.deletePhotosByReportId === 'function'
                    ? window.dataStore.deletePhotosByReportId(reportId).catch(function() {}) : Promise.resolve(),
                typeof window.dataStore.deleteDraftData === 'function'
                    ? window.dataStore.deleteDraftData(reportId).catch(function() {}) : Promise.resolve(),
                typeof window.dataStore.deleteReportData === 'function'
                    ? window.dataStore.deleteReportData(reportId).catch(function() {}) : Promise.resolve()
            ]);
        } catch (e) {
            errors.push('IDB cleanup: ' + e.message);
        }
    }

    // 4. Supabase soft-delete — online: apply now, offline: queue for reconnect push
    if (navigator.onLine) {
        if (typeof supabaseClient !== 'undefined' && supabaseClient && reportId.length === 36) {
            try {
                var updateResult = await supabaseClient
                    .from('reports')
                    .update({ status: 'deleted' })
                    .eq('id', reportId)
                    .select('id');
                if (updateResult.error) {
                    errors.push('soft-delete: ' + updateResult.error.message);
                } else if (!Array.isArray(updateResult.data) || updateResult.data.length === 0) {
                    errors.push('soft-delete: no report row updated for ' + reportId);
                }
            } catch (e) {
                errors.push('soft-delete: ' + e.message);
            }
        }
    } else if (typeof window.markReportDirty === 'function') {
        try {
            await window.markReportDirty(reportId, 'delete');
        } catch (e) {
            errors.push('queue-delete: ' + e.message);
        }
    } else if (window.dataStore && typeof window.dataStore.saveReport === 'function') {
        try {
            await window.dataStore.saveReport({
                id: reportId,
                status: 'deleted',
                updated_at: new Date().toISOString(),
                _pendingSync: {
                    op: 'delete',
                    dirtyAt: Date.now(),
                    attempts: 0
                }
            });
        } catch (e) {
            errors.push('queue-delete-fallback: ' + e.message);
        }
    }

    if (window.fvpBroadcast && typeof window.fvpBroadcast.send === 'function') {
        window.fvpBroadcast.send({ type: 'report-deleted', id: reportId });
    }

    return { success: errors.length === 0, errors: errors };
}

window.deleteReportCascade = deleteReportCascade;
window.deleteReportFull = deleteReportFull;
