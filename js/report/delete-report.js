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

    // Await full cleanup (blocklist, IDB, Supabase soft-delete) before navigating
    var result = await deleteReportFull(_reportId);
    if (result.success) {
        console.log('[DELETE] Full delete complete');
    } else {
        console.warn('[DELETE] Delete had errors:', result.errors);
    }

    window.location.href = 'index.html';
}

// Expose to window for HTML onclick handlers
window.confirmDeleteReport = confirmDeleteReport;
window.hideDeleteModal = hideDeleteModal;
window.executeDeleteReport = executeDeleteReport;
