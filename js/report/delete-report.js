// ============================================================================
// FieldVoice Pro v6 - Delete Report (delete-report.js)
//
// Uses: window.reportState (RS), storage-keys.js, config.js
// ============================================================================

var RS = window.reportState;

function confirmDeleteReport() {
    var modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

function hideDeleteModal() {
    var modal = document.getElementById('deleteModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

async function executeDeleteReport() {
    hideDeleteModal();

    if (!RS.currentReportId) {
        console.warn('[DELETE] No current report ID');
        window.location.href = 'index.html';
        return;
    }

    console.log('[DELETE] Deleting report:', RS.currentReportId);

    try {
        // 1. Delete from localStorage
        deleteReportData(RS.currentReportId);

        // 2. Remove from current reports tracker
        var currentReports = JSON.parse(localStorage.getItem('fvp_current_reports') || '{}');
        delete currentReports[RS.currentReportId];
        localStorage.setItem('fvp_current_reports', JSON.stringify(currentReports));

        // 3. Delete from IndexedDB
        if (window.idb) {
            if (typeof window.idb.deleteReport === 'function') {
                try { await window.idb.deleteReport(RS.currentReportId); } catch(e) { console.warn('[DELETE] IDB report:', e); }
            }
            if (typeof window.idb.deletePhotosByReportId === 'function') {
                try { await window.idb.deletePhotosByReportId(RS.currentReportId); } catch(e) { console.warn('[DELETE] IDB photos:', e); }
            }
        }

        // 4. Delete from Supabase (if synced)
        if (window.supabaseClient) {
            try {
                var photosResult = await window.supabaseClient
                    .from('photos')
                    .select('storage_path')
                    .eq('report_id', RS.currentReportId);
                var photosToDelete = photosResult.data;

                if (photosToDelete && photosToDelete.length > 0) {
                    var paths = photosToDelete.map(function(p) { return p.storage_path; }).filter(Boolean);
                    if (paths.length > 0) {
                        await window.supabaseClient.storage
                            .from('report-photos')
                            .remove(paths);
                    }
                }

                await window.supabaseClient.from('interview_backup').delete().eq('report_id', RS.currentReportId);
                await window.supabaseClient.from('report_backup').delete().eq('report_id', RS.currentReportId);
                await window.supabaseClient.from('ai_submissions').delete().eq('report_id', RS.currentReportId);

                try {
                    var finalResult = await window.supabaseClient
                        .from('final_reports')
                        .select('pdf_url')
                        .eq('report_id', RS.currentReportId)
                        .single();
                    var finalData = finalResult.data;
                    if (finalData?.pdf_url) {
                        var pdfPath = finalData.pdf_url.split('/report-pdfs/')[1];
                        if (pdfPath) {
                            await window.supabaseClient.storage.from('report-pdfs').remove([decodeURIComponent(pdfPath)]);
                        }
                    }
                } catch (e) { /* no final_reports row = no PDF to clean */ }

                await window.supabaseClient.from('final_reports').delete().eq('report_id', RS.currentReportId);
                await window.supabaseClient.from('photos').delete().eq('report_id', RS.currentReportId);
                await window.supabaseClient.from('reports').delete().eq('id', RS.currentReportId);
                console.log('[DELETE] Supabase records deleted');
            } catch(e) {
                console.warn('[DELETE] Supabase cleanup error (may not have been synced):', e);
            }
        }

        console.log('[DELETE] Report deleted successfully');
    } catch(e) {
        console.error('[DELETE] Error:', e);
    }

    window.location.href = 'index.html';
}

// Expose to window for HTML onclick handlers
window.confirmDeleteReport = confirmDeleteReport;
window.hideDeleteModal = hideDeleteModal;
window.executeDeleteReport = executeDeleteReport;
