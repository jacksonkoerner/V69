// ============================================================
// js/interview/persistence.js — Draft storage + Autosave
// Sprint 11: Consolidated from draft-storage.js, autosave.js
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

        // Sprint 15 (OFF-02): sync queue removed — no queue items to clear

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
    // Sprint 1+5 fix: Use the report's own project ID (from IS.activeProject, which is
    // loaded from the report's project_id at init). Never read from ACTIVE_PROJECT_ID.
    const reportProjectId = IS.activeProject?.id;
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
            status: IS.report.meta?.status || 'draft'
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
            project_name: IS.activeProject?.projectName || '',
            reportDate: todayStr,
            status: IS.report.meta?.status || 'draft',
            capture_mode: data.captureMode,
            created_at: IS.report.meta?.createdAt || Date.now(),
            // Store the full draft data in a nested object for compatibility
            _draft_data: data
        };
        // Use synchronous save to survive iOS pagehide (async queue may not complete)
        if (typeof saveCurrentReportSync === 'function') {
            saveCurrentReportSync(reportData);
        } else {
            saveCurrentReport(reportData);
        }
        console.log('[LOCAL] Draft saved to localStorage (sync emergency path)');

        // Sprint 11: Write-through draft data to IndexedDB for durability
        if (window.idb && window.idb.saveDraftDataIDB) {
            window.idb.saveDraftDataIDB(IS.currentReportId, data).catch(function(e) {
                console.warn('[LOCAL] IDB draft write-through failed:', e);
            });
        }
    } catch (e) {
        console.error('[LOCAL] Failed to save to localStorage:', e);
        // If localStorage is full, try IDB as fallback
        if (IS.currentReportId && window.idb && window.idb.saveDraftDataIDB) {
            window.idb.saveDraftDataIDB(IS.currentReportId, data).catch(function() {});
        }
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
 * Sprint 11: Async fallback — load draft data from IndexedDB
 * Called when localStorage has no draft (e.g., iOS 7-day eviction)
 * @returns {Promise<Object|null>}
 */
async function loadDraftFromIDB() {
    if (!IS.currentReportId) return null;
    if (!window.idb || !window.idb.getDraftDataIDB) return null;

    try {
        const idbData = await window.idb.getDraftDataIDB(IS.currentReportId);
        if (idbData) {
            console.log('[LOCAL] Found draft in IndexedDB, saved at:', idbData.lastSaved || idbData._idbSavedAt);
            // Re-cache to localStorage for fast sync reads
            const reportProjectId = idbData.projectId || IS.activeProject?.id;
            const reportData = {
                id: IS.currentReportId,
                project_id: reportProjectId,
                project_name: IS.activeProject?.projectName || '',
                reportDate: idbData.reportDate || getTodayDateString(),
                status: idbData.meta?.status || 'draft',
                capture_mode: idbData.captureMode,
                created_at: idbData.meta?.createdAt || Date.now(),
                _draft_data: idbData
            };
            saveCurrentReport(reportData);
            console.log('[LOCAL] Re-cached IDB draft to localStorage');
            return idbData;
        }
    } catch (e) {
        console.warn('[LOCAL] IDB draft load failed:', e);
    }
    return null;
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

    // Sprint 11: Also clean up IndexedDB draft data
    if (window.idb && window.idb.deleteDraftDataIDB) {
        window.idb.deleteDraftDataIDB(IS.currentReportId).catch(function(e) {
            console.warn('[LOCAL] IDB draft cleanup failed:', e);
        });
    }

    console.log('[LOCAL] Draft cleared from localStorage + IndexedDB');
}

// v6.9: Update localStorage report to 'refined' status — UUID-only
function updateLocalReportToRefined() {
    if (!IS.currentReportId) throw new Error('Cannot update to refined: no report ID');

    const existingReport = getCurrentReport(IS.currentReportId) || {};

    saveCurrentReport({
        ...existingReport,
        id: IS.currentReportId,
        project_id: IS.activeProject?.id,
        project_name: IS.activeProject?.projectName || '',
        reportDate: getTodayDateString(),
        status: 'refined',
        created_at: existingReport.created_at || IS.report.meta?.createdAt || new Date().toISOString()
    });

    console.log('[LOCAL] Report updated to refined status in localStorage');
}


// ============================================================
// Auto-save functionality (was autosave.js)
// ============================================================

// File-local variables for debouncing and backup management
let localSaveTimeout = null;
let _interviewBackupDirty = false;
let _interviewBackupTimer = null;

// Track active auto-save sessions to prevent duplicates
var guidedAutoSaveSessions = {};

/**
 * Initialize auto-save on typing for guided section textareas
 * Creates entry on first keystroke, updates on subsequent keystrokes
 * @param {string} textareaId - The textarea element ID
 * @param {string} section - The section identifier (e.g., 'communications', 'qaqc')
 */
function initGuidedAutoSave(textareaId, section) {
const textarea = document.getElementById(textareaId);
if (!textarea) return;

// Prevent duplicate initialization
if (textarea.dataset.autoSaveInit === 'true') return;
textarea.dataset.autoSaveInit = 'true';

let currentEntryId = null;
let saveTimeout = null;

textarea.addEventListener('input', () => {
if (saveTimeout) clearTimeout(saveTimeout);

saveTimeout = setTimeout(() => {
const text = textarea.value.trim();
if (!text) return;

if (!currentEntryId) {
// Create new entry on first meaningful keystroke
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);
currentEntryId = entry.id;

saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Created guided entry:', section, currentEntryId);
} else {
// Update existing entry
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry) {
entry.content = text;
saveReport();
// Keep shared state updated
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Updated guided entry:', section, currentEntryId);
}
}
}, 500);
});

// Save on blur as safety net
textarea.addEventListener('blur', () => {
if (saveTimeout) clearTimeout(saveTimeout);
const text = textarea.value.trim();
if (text && currentEntryId) {
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry && entry.content !== text) {
entry.content = text;
saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Guided entry saved on blur:', section, currentEntryId);
}
}
});

// Store session for potential cleanup
guidedAutoSaveSessions[textareaId] = { section, currentEntryId };
}

/**
 * Initialize auto-save for contractor work entry textareas
 * v6.9: Also supports crew-level textareas via optional crewId
 * @param {string} contractorId - The contractor ID
 * @param {string} [crewId] - Optional crew ID for crew-level entries
 */
function initContractorWorkAutoSave(contractorId, crewId) {
const textareaId = crewId ? `work-input-${contractorId}-crew-${crewId}` : `work-input-${contractorId}`;
const section = crewId ? `work_${contractorId}_crew_${crewId}` : `work_${contractorId}`;

const textarea = document.getElementById(textareaId);
if (!textarea) return;

// Prevent duplicate initialization
if (textarea.dataset.autoSaveInit === 'true') return;
textarea.dataset.autoSaveInit = 'true';

let currentEntryId = null;
let saveTimeout = null;

textarea.addEventListener('input', () => {
if (saveTimeout) clearTimeout(saveTimeout);

saveTimeout = setTimeout(() => {
const text = textarea.value.trim();
if (!text) return;

if (!currentEntryId) {
// Create new entry on first meaningful keystroke
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);
currentEntryId = entry.id;

saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Created contractor work entry:', contractorId, crewId || '', currentEntryId);
} else {
// Update existing entry
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry) {
entry.content = text;
saveReport();
// Keep shared state updated
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Updated contractor work entry:', contractorId, crewId || '', currentEntryId);
}
}
}, 500);
});

// Save on blur as safety net
textarea.addEventListener('blur', () => {
if (saveTimeout) clearTimeout(saveTimeout);
const text = textarea.value.trim();
if (text && !currentEntryId) {
// Create entry if there's text but no entry yet
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);

saveReport();
currentEntryId = entry.id;  // Track for subsequent updates
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Contractor work entry saved on blur:', contractorId, crewId || '');
}
});
}

/**
 * Initialize all guided section auto-save listeners
 * Called after sections are rendered
 */
function initAllGuidedAutoSave() {
// Init if toggle is Yes OR not yet answered (textarea visible in both cases)
// Only skip if toggle is explicitly No (false)
if (getToggleState('communications_made') !== false) {
initGuidedAutoSave('communications-input', 'communications');
}
if (getToggleState('qaqc_performed') !== false) {
initGuidedAutoSave('qaqc-input', 'qaqc');
}
if (getToggleState('visitors_present') !== false) {
initGuidedAutoSave('visitors-input', 'visitors');
}
// Issues and Safety don't have toggles - always visible
initGuidedAutoSave('issue-input', 'issues');
initGuidedAutoSave('safety-input', 'safety');
}

function saveReport() {
// Update local UI immediately
updateAllPreviews();
updateProgress();

// Debounce save to localStorage
if (localSaveTimeout) {
clearTimeout(localSaveTimeout);
}
localSaveTimeout = setTimeout(() => {
saveToLocalStorage();
}, 500); // 500ms debounce for localStorage

// Also mark Supabase backup as dirty (separate 5s debounce)
markInterviewBackupDirty();
}

function markInterviewBackupDirty() {
_interviewBackupDirty = true;
if (_interviewBackupTimer) clearTimeout(_interviewBackupTimer);
_interviewBackupTimer = setTimeout(flushInterviewBackup, 5000); // 5s debounce
}

function buildInterviewPageState() {
return {
captureMode: IS.report.meta?.captureMode || 'guided',
freeform_entries: IS.report.freeform_entries || [],
freeform_checklist: IS.report.freeform_checklist || {},
fieldNotes: IS.report.fieldNotes || {},
guidedNotes: IS.report.guidedNotes || {},
activities: IS.report.activities || [],
operations: IS.report.operations || [],
equipment: IS.report.equipment || [],
equipmentRows: IS.report.equipmentRows || [],
overview: IS.report.overview || {},
safety: IS.report.safety || {},
generalIssues: IS.report.generalIssues || [],
qaqcNotes: IS.report.qaqcNotes || [],
contractorCommunications: IS.report.contractorCommunications || '',
visitorsRemarks: IS.report.visitorsRemarks || '',
additionalNotes: IS.report.additionalNotes || '',
toggleStates: IS.report.toggleStates || {},
entries: IS.report.entries || [],
// Sprint 11: Include fields previously only in _draft_data
meta: {
    naMarked: IS.report.meta?.naMarked || {},
    createdAt: IS.report.meta?.createdAt,
    version: IS.report.meta?.version || 2,
    status: IS.report.meta?.status || 'draft'
},
reporter: IS.report.reporter || {},
photos: (IS.report.photos || []).map(function(p) {
    return { id: p.id, storagePath: p.storagePath || '', url: p.url || '', caption: p.caption || '', timestamp: p.timestamp, fileName: p.fileName };
}),
savedAt: new Date().toISOString()
};
}

function flushInterviewBackup() {
if (!_interviewBackupDirty || !IS.currentReportId) return;
_interviewBackupDirty = false;

const pageState = buildInterviewPageState();

// Fire and forget with retry — do NOT await, do NOT block UI (SUP-02)
const orgId = localStorage.getItem('fvp_org_id');
const reportId = IS.currentReportId;
supabaseRetry(function() {
    return supabaseClient
        .from('interview_backup')
        .upsert({
            report_id: reportId,
            page_state: pageState,
            org_id: orgId || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'report_id' });
}, 3, 'flushInterviewBackup').then(function() {
    console.log('[BACKUP] Interview backup saved');
}).catch(function(err) {
    console.warn('[BACKUP] Interview backup failed after retries:', err.message);
});
}
// ============================================================
// Supabase storage functions (was supabase.js)
// ============================================================

// ============ STORAGE (SUPABASE) ============
let saveReportTimeout = null;
let isSaving = false;

// getReportKey() removed in Task 3 — UUID-only payload

/**
 * Load report — try localStorage → IDB → Supabase interview_backup → fresh
 * Sprint 11: Refactored to restore existing data before creating fresh.
 * Returns a populated report object if prior data exists, fresh otherwise.
 */
async function getReport() {
    const urlReportId = new URLSearchParams(window.location.search).get('reportId');

    // If we have a reportId, try to restore existing data first
    if (urlReportId) {
        // 1. Try localStorage (fast, sync)
        var prevId = IS.currentReportId;
        IS.currentReportId = urlReportId;
        var localDraft = loadFromLocalStorage();
        IS.currentReportId = prevId;

        if (localDraft) {
            console.log('[getReport] Restored from localStorage');
            var report = createFreshReport();
            applyDraftToReport(report, localDraft);
            return report;
        }

        // 2. Try IndexedDB
        if (window.idb && window.idb.getDraftDataIDB) {
            try {
                var idbData = await window.idb.getDraftDataIDB(urlReportId);
                if (idbData) {
                    console.log('[getReport] Restored from IndexedDB');
                    var report = createFreshReport();
                    applyDraftToReport(report, idbData);
                    return report;
                }
            } catch (e) {
                console.warn('[getReport] IDB restore failed:', e);
            }
        }

        // 3. Try Supabase interview_backup (cross-device)
        if (navigator.onLine) {
            try {
                var result = await supabaseClient
                    .from('interview_backup')
                    .select('page_state, updated_at')
                    .eq('report_id', urlReportId)
                    .maybeSingle();

                if (!result.error && result.data && result.data.page_state) {
                    console.log('[getReport] Restored from Supabase interview_backup');
                    var report = createFreshReport();
                    var ps = result.data.page_state;
                    if (ps.captureMode) report.meta.captureMode = ps.captureMode;
                    if (ps.meta) report.meta = Object.assign(report.meta, ps.meta);
                    if (ps.freeform_entries) report.freeform_entries = ps.freeform_entries;
                    if (ps.freeform_checklist) report.freeform_checklist = ps.freeform_checklist;
                    if (ps.fieldNotes) report.fieldNotes = Object.assign(report.fieldNotes, ps.fieldNotes);
                    if (ps.guidedNotes) report.guidedNotes = Object.assign(report.guidedNotes, ps.guidedNotes);
                    if (ps.activities) report.activities = ps.activities;
                    if (ps.operations) report.operations = ps.operations;
                    if (ps.equipment) report.equipment = ps.equipment;
                    if (ps.equipmentRows) report.equipmentRows = ps.equipmentRows;
                    if (ps.overview) report.overview = Object.assign(report.overview, ps.overview);
                    if (ps.safety) report.safety = Object.assign(report.safety, ps.safety);
                    if (ps.generalIssues) report.generalIssues = ps.generalIssues;
                    if (ps.qaqcNotes) report.qaqcNotes = ps.qaqcNotes;
                    if (ps.contractorCommunications) report.contractorCommunications = ps.contractorCommunications;
                    if (ps.visitorsRemarks) report.visitorsRemarks = ps.visitorsRemarks;
                    if (ps.additionalNotes) report.additionalNotes = ps.additionalNotes;
                    if (ps.toggleStates) report.toggleStates = ps.toggleStates;
                    if (ps.entries) report.entries = ps.entries;
                    if (ps.reporter) report.reporter = Object.assign(report.reporter, ps.reporter);
                    if (ps.photos) report.photos = ps.photos;
                    return report;
                }
            } catch (e) {
                console.warn('[getReport] Supabase interview_backup restore failed:', e);
            }
        }
    }

    // 4. Nothing found — create fresh
    IS.currentReportId = null;
    return createFreshReport();
}

/**
 * Apply draft data fields onto a fresh report object
 * Mirrors the field mapping from restoreFromLocalStorage but works on any report object
 */
function applyDraftToReport(report, data) {
    if (!data) return;
    if (data.meta) report.meta = Object.assign(report.meta, data.meta);
    if (data.captureMode) report.meta.captureMode = data.captureMode;
    if (data.weather) report.overview.weather = data.weather;
    if (data.freeformNotes) report.fieldNotes.freeformNotes = data.freeformNotes;
    if (data.freeform_entries && Array.isArray(data.freeform_entries)) report.freeform_entries = data.freeform_entries;
    if (data.freeform_checklist) report.freeform_checklist = data.freeform_checklist;
    if (data.siteConditions) report.overview.weather.jobSiteCondition = data.siteConditions;
    if (data.issuesNotes && Array.isArray(data.issuesNotes)) report.generalIssues = data.issuesNotes;
    if (data.safetyNoIncidents !== undefined) report.safety.noIncidents = data.safetyNoIncidents;
    if (data.safetyHasIncidents !== undefined) report.safety.hasIncidents = data.safetyHasIncidents;
    if (data.safetyNotes && Array.isArray(data.safetyNotes)) report.safety.notes = data.safetyNotes;
    if (data.qaqcNotes && Array.isArray(data.qaqcNotes)) report.qaqcNotes = data.qaqcNotes;
    if (data.communications) report.contractorCommunications = data.communications;
    if (data.visitorsRemarks) report.visitorsRemarks = data.visitorsRemarks;
    if (data.additionalNotes) report.additionalNotes = data.additionalNotes;
    if (data.activities && Array.isArray(data.activities)) report.activities = data.activities;
    if (data.operations && Array.isArray(data.operations)) report.operations = data.operations;
    if (data.equipment && Array.isArray(data.equipment)) report.equipment = data.equipment;
    if (data.equipmentRows && Array.isArray(data.equipmentRows)) report.equipmentRows = data.equipmentRows;
    if (data.photos && Array.isArray(data.photos)) report.photos = data.photos;
    if (data.reporter) report.reporter = Object.assign(report.reporter, data.reporter);
    if (data.overview) report.overview = Object.assign(report.overview, data.overview);
    if (data.entries && Array.isArray(data.entries)) report.entries = data.entries;
    if (data.toggleStates) report.toggleStates = data.toggleStates;
}

function createFreshReport() {
    return {
        meta: {
            createdAt: new Date().toISOString(),
            interviewCompleted: false,
            version: 2,
            naMarked: {},
            captureMode: null,
            status: 'draft'
        },
        reporter: {
            name: IS.userSettings?.full_name || ""
        },
        project: {
            projectName: IS.activeProject?.projectName || "",
            dayNumber: null
        },
        overview: {
            projectName: IS.activeProject?.projectName || "",
            date: getLocalDateString(),
            startTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            completedBy: IS.userSettings?.full_name || "",
            weather: { highTemp: "--", lowTemp: "--", precipitation: "0.00\"", generalCondition: "Syncing...", jobSiteCondition: "", adverseConditions: "N/A" }
        },
        contractors: [], activities: [], operations: [], equipment: [], generalIssues: [], qaqcNotes: [],
        safety: { hasIncidents: false, noIncidents: false, notes: [] },
        contractorCommunications: "",
        visitorsRemarks: "",
        photos: [],
        additionalNotes: "",
        fieldNotes: { freeformNotes: "" },
        guidedNotes: { workSummary: "" },
        entries: [],           // v6: entry-based notes
        toggleStates: {},      // v6: locked toggle states (section -> true/false/null)
        equipmentRows: []      // v6.6: structured equipment rows
    };
}

/**
 * Actually save report to Supabase
 */
async function saveReportToSupabase() {
    if (isSaving || !IS.activeProject) return;
    isSaving = true;

    try {
        const todayStr = getTodayDateString();

        // 1. Upsert the main report record
        // v6.9: UUID-only — hard error if no report ID
        if (!IS.currentReportId) throw new Error('No report ID — cannot save to Supabase');
        const reportId = IS.currentReportId;

        const reportData = {
            id: reportId,
            project_id: IS.activeProject.id,
            org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || IS.activeProject.orgId || null,
            user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
            device_id: getDeviceId(),
            report_date: todayStr,
            status: IS.report.meta?.status || 'draft',
            capture_mode: IS.report.meta?.captureMode || 'guided',
            updated_at: new Date().toISOString()
        };

        const { error: reportError } = await supabaseClient
            .from('reports')
            .upsert(reportData, { onConflict: 'id' });

        if (reportError) {
            console.error('Error saving report:', reportError);
            showToast('Failed to save report', 'error');
            isSaving = false;
            return;
        }

        IS.currentReportId = reportId;

        // interview_backup is now handled by debounced autosave (flushInterviewBackup)
        // Flush immediately since we're about to navigate away
        flushInterviewBackup();

        // Note: Photos are saved separately when uploaded via uploadPhotoToSupabase

        console.log('[SUPABASE] Report saved successfully');
    } catch (err) {
        console.error('[SUPABASE] Save failed:', err);
        showToast('Failed to save report', 'error');
    } finally {
        isSaving = false;
    }
}

/**
 * Upload photo to Supabase Storage
 */
async function uploadPhotoToSupabase(file, photoId) {
    if (!IS.currentReportId) {
        // Create report first if it doesn't exist
        await saveReportToSupabase();
    }

    const fileName = `${IS.currentReportId}/${photoId}_${file.name}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from('report-photos')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Error uploading photo:', error);
            throw error;
        }

        // SEC-04: Use signed URL instead of public URL for security
        // NOTE: Signed URLs expire after 1 hour. Photos stored in IndexedDB/localStorage
        // with signed URLs may go stale and fail to load. Future consideration: implement
        // a URL refresh mechanism when displaying photos, or re-sign URLs on demand.
        const { data: urlData, error: urlError } = await supabaseClient.storage
            .from('report-photos')
            .createSignedUrl(fileName, 3600); // 1 hour expiry

        if (urlError) {
            console.error('Failed to create signed photo URL:', urlError);
        }

        return {
            storagePath: fileName,
            publicUrl: urlData?.signedUrl || ''
        };
    } catch (err) {
        console.error('Photo upload failed:', err);
        throw err;
    }
}

/**
 * Upload pending photos to Supabase (called on Submit)
 */
async function uploadPendingPhotos() {
    if (!IS.currentReportId) return;

    const pendingPhotos = await window.idb.getPhotosBySyncStatus('pending');
    const reportPhotos = pendingPhotos.filter(p => p.reportId === IS.currentReportId || p.reportId === 'pending');

    for (const photo of reportPhotos) {
        try {
            // If we have base64 but no storagePath, need to upload
            if (photo.base64 && !photo.storagePath) {
                showToast('Uploading photos...', 'info');
                const blob = await dataURLtoBlob(photo.base64);
                const { storagePath, publicUrl } = await uploadPhotoToSupabase(blob, photo.id);

                photo.storagePath = storagePath;
                photo.url = publicUrl;
            }

            // Save metadata to Supabase
            if (photo.storagePath) {
                const photoData = {
                    id: photo.id,
                    report_id: IS.currentReportId,
                    org_id: localStorage.getItem('fvp_org_id') || null,
                    storage_path: photo.storagePath,
                    photo_url: photo.url || null,
                    caption: photo.caption || '',
                    photo_type: photo.fileType || photo.fileName || null,
                    filename: photo.fileName || photo.name || null,
                    location_lat: photo.gps?.lat || null,
                    location_lng: photo.gps?.lng || null,
                    taken_at: photo.timestamp || new Date().toISOString(),
                    created_at: photo.createdAt || new Date().toISOString()
                };

                const { error } = await supabaseClient
                    .from('photos')
                    .upsert(photoData, { onConflict: 'id' });

                if (error) {
                    console.error('[PHOTO] Supabase metadata error:', error);
                    continue;
                }
            }

            // Update IndexedDB with synced status and reportId
            photo.reportId = IS.currentReportId;
            photo.syncStatus = 'synced';
            photo.base64 = null; // Clear base64 from IndexedDB after successful upload
            await window.idb.savePhoto(photo);

            // PHO-02: Also update the matching entry in IS.report.photos[]
            // so downstream code (buildProcessPayload, etc.) has correct URLs
            const isPhoto = (IS.report.photos || []).find(function(p) { return p.id === photo.id; });
            if (isPhoto) {
                isPhoto.storagePath = photo.storagePath;
                isPhoto.url = photo.url;
                isPhoto.uploadStatus = 'uploaded';
                console.log('[PHOTO] Updated IS.report.photos entry:', photo.id);
            }

            console.log('[PHOTO] Synced to Supabase:', photo.id);
        } catch (err) {
            console.error('[PHOTO] Failed to sync photo:', photo.id, err);
        }
    }
}

async function deletePhotoFromSupabase(photoId, storagePath) {
    try {
        // Delete from storage
        if (storagePath) {
            await supabaseClient.storage
                .from('report-photos')
                .remove([storagePath]);
        }

        // Delete metadata
        await supabaseClient
            .from('photos')
            .delete()
            .eq('id', photoId);
    } catch (err) {
        console.error('Failed to delete photo:', err);
    }
}

/**
 * Delete report and all related data from Supabase
 * Wrapper around shared deleteReportCascade
 * @param {string} reportId - The report UUID to delete
 */
async function deleteReportFromSupabase(reportId) {
    if (!reportId || !supabaseClient) return;

    console.log('[CANCEL] Deleting report from Supabase:', reportId);

    const result = await deleteReportCascade(reportId);
    if (result.success) {
        console.log('[CANCEL] Report deleted from Supabase');
    } else {
        console.error('[CANCEL] Supabase deletion errors:', result.errors);
        throw new Error('Delete cascade failed: ' + result.errors.join(', '));
    }
}

// clearSyncQueueForReport removed (Sprint 15, OFF-02) — sync queue no longer exists
