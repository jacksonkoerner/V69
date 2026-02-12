// ============================================================
// js/interview/draft-storage.js — Draft localStorage management
// ============================================================

var IS = window.interviewState;

// ============ STATE PROTECTION ============
/**
 * v6.6.15: Simplified - always allow page to load
 * With the new composite report system, each session creates a new report,
 * so we don't need to check for existing reports by project+date
 */
async function checkReportState() {
    // Always allow page to load - each session can create a new report
    return true;
}

// ============ CANCEL REPORT FUNCTIONS ============

/**
 * Show the cancel report confirmation modal
 */
function showCancelReportModal() {
    document.getElementById('cancelReportModal').classList.remove('hidden');
}

/**
 * Hide the cancel report confirmation modal
 */
function hideCancelReportModal() {
    document.getElementById('cancelReportModal').classList.add('hidden');
}

/**
 * Confirm cancellation and delete the report
 */
async function confirmCancelReport() {
    const confirmBtn = document.getElementById('confirmCancelBtn');
    const originalText = confirmBtn.textContent;

    try {
        // Show loading state
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...';

        if (!IS.currentReportId) throw new Error('No report ID — cannot cancel');

        // Delete from Supabase only if we have a real Supabase ID (UUID format, 36 chars)
        if (IS.currentReportId.length === 36) {
            await deleteReportFromSupabase(IS.currentReportId);
        }

        // v6.9: UUID-only — delete by currentReportId
        deleteCurrentReport(IS.currentReportId);

        // Also delete orphaned report data (fvp_report_{id})
        deleteReportData(IS.currentReportId);

        // Clear any sync queue items for this report
        clearSyncQueueForReport(IS.currentReportId);

        // Reset local state
        IS.currentReportId = null;
        IS.report = {};

        // Navigate to home
        window.location.href = 'index.html';

    } catch (error) {
        console.error('[CANCEL] Error canceling report:', error);
        alert('Error deleting report. Please try again.');
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
    }
}

// ============ LOCALSTORAGE DRAFT MANAGEMENT ============
// v6: Use STORAGE_KEYS from storage-keys.js for all localStorage operations
// Draft storage uses STORAGE_KEYS.CURRENT_REPORTS via getCurrentReport()/saveCurrentReport()
// Sync queue uses STORAGE_KEYS.SYNC_QUEUE via getSyncQueue()/addToSyncQueue()

/**
 * Save all form data to localStorage
 * This is called during editing - data only goes to Supabase on FINISH
 */
function saveToLocalStorage() {
    // Sprint 1 fix: Use the report's own project ID (from IS.activeProject, which is
    // loaded from the report's project_id), NOT from ACTIVE_PROJECT_ID localStorage.
    // This prevents the project_id swap bug.
    const reportProjectId = IS.activeProject?.id || getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    const todayStr = getTodayDateString();

    const data = {
        projectId: reportProjectId,
        reportDate: todayStr,
        captureMode: IS.report.meta?.captureMode || null,
        lastSaved: new Date().toISOString(),

        // Meta
        meta: {
            createdAt: IS.report.meta?.createdAt,
            version: IS.report.meta?.version || 2,
            naMarked: IS.report.meta?.naMarked || {},
            captureMode: IS.report.meta?.captureMode,
            status: 'draft'
        },

        // Weather data
        weather: IS.report.overview?.weather || {},

        // Minimal/Freeform mode - legacy single-string notes (for migration)
        freeformNotes: IS.report.fieldNotes?.freeformNotes || '',

        // v6.6: Freeform mode - timestamped entries + visual checklist
        freeform_entries: IS.report.freeform_entries || [],
        freeform_checklist: IS.report.freeform_checklist || {},

        // Guided mode sections
        workSummary: IS.report.guidedNotes?.workSummary || '',
        siteConditions: IS.report.overview?.weather?.jobSiteCondition || '',
        issuesNotes: IS.report.generalIssues || [],
        safetyNoIncidents: IS.report.safety?.noIncidents || false,
        safetyHasIncidents: IS.report.safety?.hasIncidents || false,
        safetyNotes: IS.report.safety?.notes || [],
        qaqcNotes: IS.report.qaqcNotes || [],
        communications: IS.report.contractorCommunications || '',
        visitorsRemarks: IS.report.visitorsRemarks || '',
        additionalNotes: IS.report.additionalNotes || '',

        // Contractor work (activities)
        activities: IS.report.activities || [],

        // Personnel/operations
        operations: IS.report.operations || [],

        // Equipment usage (legacy)
        equipment: IS.report.equipment || [],

        // v6.6: Structured equipment rows
        equipmentRows: IS.report.equipmentRows || [],

        // Photos (metadata only - actual files uploaded separately)
        photos: (IS.report.photos || []).map(p => ({
            id: p.id,
            storagePath: p.storagePath || '',
            url: p.url || '',
            caption: p.caption || '',
            timestamp: p.timestamp,
            date: p.date,
            time: p.time,
            gps: p.gps,
            fileName: p.fileName
        })),

        // Reporter info
        reporter: IS.report.reporter || {},

        // Overview
        overview: {
            date: IS.report.overview?.date,
            startTime: IS.report.overview?.startTime,
            completedBy: IS.report.overview?.completedBy,
            projectName: IS.report.overview?.projectName
        },

        // v6: Entry-based notes and toggle states
        entries: IS.report.entries || [],
        toggleStates: IS.report.toggleStates || {}
    };

    try {
        // v6.9: UUID-only — no draft key fallback
        if (!IS.currentReportId) throw new Error('Cannot save: no report ID');
        const reportData = {
            id: IS.currentReportId,
            project_id: reportProjectId,
            project_name: IS.activeProject?.projectName || IS.activeProject?.project_name || '',
            date: todayStr,
            status: 'draft',
            capture_mode: data.captureMode,
            created_at: IS.report.meta?.createdAt || Date.now(),
            // Store the full draft data in a nested object for compatibility
            _draft_data: data
        };
        saveCurrentReport(reportData);
        console.log('[LOCAL] Draft saved to localStorage via saveCurrentReport');
    } catch (e) {
        console.error('[LOCAL] Failed to save to localStorage:', e);
        // If localStorage is full, try to continue without local save
    }
}

/**
 * Load form data from localStorage
 * Returns null if no valid draft exists for current project/date
 */
function loadFromLocalStorage() {
    if (!IS.currentReportId) return null;

    try {
        // v6.9: UUID-only lookup — no draft key fallback
        const storedReport = getCurrentReport(IS.currentReportId);
        if (!storedReport) return null;

        // Extract draft data from stored report
        const data = storedReport._draft_data;
        if (!data) return null;

        console.log('[LOCAL] Found valid draft from', data.lastSaved);
        return data;
    } catch (e) {
        console.error('[LOCAL] Failed to parse stored draft:', e);
        deleteCurrentReport(IS.currentReportId);
        return null;
    }
}

/**
 * Restore report object from localStorage data
 */
function restoreFromLocalStorage(localData) {
    if (!localData) return false;

    console.log('[LOCAL] Restoring draft from localStorage');

    // Restore meta
    if (localData.meta) {
        IS.report.meta = { ...IS.report.meta, ...localData.meta };
    }
    if (localData.captureMode) {
        IS.report.meta.captureMode = localData.captureMode;
    }

    // Restore weather
    if (localData.weather) {
        IS.report.overview.weather = localData.weather;
    }

    // Restore freeform notes (minimal mode - legacy)
    if (localData.freeformNotes) {
        IS.report.fieldNotes.freeformNotes = localData.freeformNotes;
    }

    // v6.6: Restore freeform entries and checklist
    if (localData.freeform_entries && Array.isArray(localData.freeform_entries)) {
        IS.report.freeform_entries = localData.freeform_entries;
    }
    if (localData.freeform_checklist) {
        IS.report.freeform_checklist = localData.freeform_checklist;
    }

    // Restore guided sections
    if (localData.siteConditions) {
        IS.report.overview.weather.jobSiteCondition = localData.siteConditions;
    }
    if (localData.issuesNotes && Array.isArray(localData.issuesNotes)) {
        IS.report.generalIssues = localData.issuesNotes;
    }
    if (localData.safetyNoIncidents !== undefined) {
        IS.report.safety.noIncidents = localData.safetyNoIncidents;
    }
    if (localData.safetyHasIncidents !== undefined) {
        IS.report.safety.hasIncidents = localData.safetyHasIncidents;
    }
    if (localData.safetyNotes && Array.isArray(localData.safetyNotes)) {
        IS.report.safety.notes = localData.safetyNotes;
    }
    if (localData.qaqcNotes && Array.isArray(localData.qaqcNotes)) {
        IS.report.qaqcNotes = localData.qaqcNotes;
    }
    if (localData.communications) {
        IS.report.contractorCommunications = localData.communications;
    }
    if (localData.visitorsRemarks) {
        IS.report.visitorsRemarks = localData.visitorsRemarks;
    }
    if (localData.additionalNotes) {
        IS.report.additionalNotes = localData.additionalNotes;
    }

    // Restore contractor work
    if (localData.activities && Array.isArray(localData.activities)) {
        IS.report.activities = localData.activities;
    }

    // Restore operations/personnel
    if (localData.operations && Array.isArray(localData.operations)) {
        IS.report.operations = localData.operations;
    }

    // Restore equipment (legacy)
    if (localData.equipment && Array.isArray(localData.equipment)) {
        IS.report.equipment = localData.equipment;
    }

    // v6.6: Restore structured equipment rows
    if (localData.equipmentRows && Array.isArray(localData.equipmentRows)) {
        IS.report.equipmentRows = localData.equipmentRows;
    }

    // Restore photos
    if (localData.photos && Array.isArray(localData.photos)) {
        IS.report.photos = localData.photos;
    }

    // Restore reporter
    if (localData.reporter) {
        IS.report.reporter = { ...IS.report.reporter, ...localData.reporter };
    }

    // Restore overview
    if (localData.overview) {
        IS.report.overview = { ...IS.report.overview, ...localData.overview };
    }

    // v6: Restore entries and toggleStates
    if (localData.entries && Array.isArray(localData.entries)) {
        IS.report.entries = localData.entries;
    }
    if (localData.toggleStates) {
        IS.report.toggleStates = localData.toggleStates;
    }

    return true;
}

/**
 * Clear localStorage draft (called after successful FINISH)
 * Also removes from offline queue if present
 */
function clearLocalStorageDraft() {
    if (!IS.currentReportId) {
        console.warn('[LOCAL] No currentReportId — nothing to clear');
        return;
    }

    // v6.9: UUID-only — delete by currentReportId
    deleteCurrentReport(IS.currentReportId);

    console.log('[LOCAL] Draft cleared from localStorage');
}

// v6.9: Update localStorage report to 'refined' status — UUID-only
function updateLocalReportToRefined() {
    if (!IS.currentReportId) throw new Error('Cannot update to refined: no report ID');

    const existingReport = getCurrentReport(IS.currentReportId) || {};

    saveCurrentReport({
        ...existingReport,
        id: IS.currentReportId,
        project_id: IS.activeProject?.id,
        project_name: IS.activeProject?.projectName || IS.activeProject?.project_name,
        date: getTodayDateString(),
        report_date: getTodayDateString(),
        status: 'refined',
        created_at: existingReport.created_at || IS.report.meta?.createdAt || new Date().toISOString()
    });

    console.log('[LOCAL] Report updated to refined status in localStorage');
}
