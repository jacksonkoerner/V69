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

    var _reportId = RS.currentReportId;
    console.log('[DELETE] Deleting report:', _reportId);

    try {
        // 1. BLOCKLIST FIRST — prevents cloud recovery/realtime from resurrecting
        if (typeof addToDeletedBlocklist === 'function') addToDeletedBlocklist(_reportId);

        // 2. Delete from localStorage FIRST (instant)
        deleteReportData(_reportId);
        if (typeof deleteCurrentReport === 'function') {
            deleteCurrentReport(_reportId);
        }

        // 3. Delete from IndexedDB
        if (window.idb) {
            if (typeof window.idb.deleteCurrentReportIDB === 'function') {
                try { await window.idb.deleteCurrentReportIDB(_reportId); } catch(e) { /* ok */ }
            }
            if (typeof window.idb.deletePhotosByReportId === 'function') {
                try { await window.idb.deletePhotosByReportId(_reportId); } catch(e) { /* ok */ }
            }
            if (typeof window.idb.deleteDraftDataIDB === 'function') {
                try { await window.idb.deleteDraftDataIDB(_reportId); } catch(e) { /* ok */ }
            }
        }

        console.log('[DELETE] Local cleanup done, redirecting');
    } catch(e) {
        console.error('[DELETE] Error during local cleanup:', e);
    }

    // Navigate to home IMMEDIATELY
    window.location.href = 'index.html';

    // 4. Supabase cascade in background (non-blocking — local state already clean)
    if (window.supabaseClient && _reportId.length === 36) {
        deleteReportCascade(_reportId).then(function(result) {
            if (result.success) {
                console.log('[DELETE] Supabase cascade complete');
            } else {
                console.warn('[DELETE] Supabase cascade errors:', result.errors);
            }
        }).catch(function(e) {
            console.error('[DELETE] Supabase cascade failed:', e);
        });
    }
}

// Expose to window for HTML onclick handlers
window.confirmDeleteReport = confirmDeleteReport;
window.hideDeleteModal = hideDeleteModal;
window.executeDeleteReport = executeDeleteReport;
