// ============================================================================
// FieldVoice Pro v6 - Report Main / Initialization (main.js)
//
// Contains:
//   - DOMContentLoaded init handler
//   - switchTab
//   - updateHeaderDate
//   - goToFinalReview
//   - hideSubmitModal (referenced in HTML onclick)
//   - confirmSubmit (referenced in HTML onclick)
//   - visibilitychange and pagehide handlers
//   - window.__fvp_debug
//
// Uses: window.reportState (RS), all other report/*.js files
// ============================================================================

var RS = window.reportState;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Load project and user settings from Supabase
        var results = await Promise.all([
            window.dataLayer.loadActiveProject(),
            window.dataLayer.loadUserSettings()
        ]);
        RS.activeProject = results[0];
        RS.userSettings = results[1];
        if (RS.activeProject) {
            RS.projectContractors = RS.activeProject.contractors || [];
        }

        // Load report data from localStorage
        RS.report = await loadReport();

        // Initialize user edits tracking
        if (!RS.report.userEdits) RS.report.userEdits = {};
        RS.userEdits = RS.report.userEdits;

        // Mark report as viewed
        if (!RS.report.meta) RS.report.meta = {};
        RS.report.meta.reportViewed = true;
        await saveReportSilent();

        // Populate all fields
        populateAllFields();

        // Populate original notes view
        populateOriginalNotes();

        // Check for pending refine status
        checkPendingRefineStatus();

        // Setup auto-save listeners
        setupAutoSave();

        // Initialize auto-expand textareas
        initAllAutoExpandTextareas();

        // Update header date
        updateHeaderDate();

        // Initialize debug panel
        initializeDebugPanel();

        // Check for tab query param
        var urlParams = new URLSearchParams(window.location.search);
        var tabParam = urlParams.get('tab');
        if (tabParam === 'preview') {
            switchTab('preview');
        }

        // Re-scale preview on window resize
        window.addEventListener('resize', function() { scalePreviewToFit(); });

    } catch (err) {
        console.error('Failed to initialize report page:', err);
    }
});

// ============ TAB SWITCHING ============
function switchTab(tab) {
    RS.currentTab = tab;
    var tabFormView = document.getElementById('tabFormView');
    var tabOriginalNotes = document.getElementById('tabOriginalNotes');
    var tabPreview = document.getElementById('tabPreview');
    var formViewContent = document.getElementById('formViewContent');
    var originalNotesView = document.getElementById('originalNotesView');
    var previewContent = document.getElementById('previewContent');
    var previewBottomBar = document.getElementById('previewBottomBar');

    // Reset all tabs
    [tabFormView, tabOriginalNotes, tabPreview].forEach(function(btn) {
        if (btn) {
            btn.classList.remove('border-dot-orange', 'text-white');
            btn.classList.add('border-transparent', 'text-slate-400');
        }
    });

    // Hide all views
    formViewContent.classList.add('hidden');
    originalNotesView.classList.add('hidden');
    previewContent.classList.add('hidden');
    if (previewBottomBar) previewBottomBar.classList.add('hidden');

    if (tab === 'form') {
        tabFormView.classList.add('border-dot-orange', 'text-white');
        tabFormView.classList.remove('border-transparent', 'text-slate-400');
        formViewContent.classList.remove('hidden');
    } else if (tab === 'notes') {
        tabOriginalNotes.classList.add('border-dot-orange', 'text-white');
        tabOriginalNotes.classList.remove('border-transparent', 'text-slate-400');
        originalNotesView.classList.remove('hidden');
    } else if (tab === 'preview') {
        tabPreview.classList.add('border-dot-orange', 'text-white');
        tabPreview.classList.remove('border-transparent', 'text-slate-400');
        previewContent.classList.remove('hidden');
        if (previewBottomBar) previewBottomBar.classList.remove('hidden');
        // Force-save all contractor activities before rendering preview
        document.querySelectorAll('.contractor-narrative').forEach(function(el) {
            if (el.dataset.contractorId) updateContractorActivity(el.dataset.contractorId);
        });
        // Save text field edits
        saveTextFieldEdits();
        // Render the preview with live data
        renderPreview();
    }
}

// ============ UI HELPERS ============
function updateHeaderDate() {
    var dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    document.getElementById('headerDate').textContent = dateStr;
}

function goToFinalReview() {
    switchTab('preview');
    window.scrollTo(0, 0);
}

function hideSubmitModal() {
    document.getElementById('submitModal').classList.add('hidden');
}

function confirmSubmit() {
    goToFinalReview();
}

// ============ HARDENING: Emergency save on page hide ============
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && RS.currentReportId) {
        console.log('[HARDENING] visibilitychange → hidden, saving report...');
        saveReportToLocalStorage();
        flushReportBackup();
    }
});

window.addEventListener('pagehide', function(event) {
    if (RS.currentReportId) {
        console.log('[HARDENING] pagehide, saving report... (persisted:', event.persisted, ')');
        saveReportToLocalStorage();
        flushReportBackup();
    }
});

// Debug access for development
window.__fvp_debug = {
    get report() { return RS.report; },
    get activeProject() { return RS.activeProject; },
    get currentReportId() { return RS.currentReportId; },
    get userEdits() { return RS.userEdits; }
};

// ============ EXPOSE FUNCTIONS TO WINDOW ============
window.switchTab = switchTab;
window.goToFinalReview = goToFinalReview;
window.confirmSubmit = confirmSubmit;
window.hideSubmitModal = hideSubmitModal;
