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

        // 2. Remove from current reports tracker (uses helper for IndexedDB write-through)
        if (typeof deleteCurrentReport === 'function') {
            deleteCurrentReport(RS.currentReportId);
        }

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
            var result = await deleteReportCascade(RS.currentReportId);
            if (result.success) {
                console.log('[DELETE] Supabase records deleted');
            } else {
                console.warn('[DELETE] Supabase cleanup errors (may not have been synced):', result.errors);
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
