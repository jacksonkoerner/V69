// ============================================================
// js/interview/state-mgmt.js — Entries + Toggles + N/A marking
// Sprint 11: Consolidated from entries.js, toggles.js, na-marking.js
// ============================================================

// Shared state namespace for quick-interview subfiles
window.interviewState = {
    currentSection: null,
    report: null,
    currentReportId: null,
    permissionsChecked: false,
    activeProject: null,
    projectContractors: [],
    userSettings: null,
    autoSaveState: {},
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    isIOSSafari: false,
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
};
window.interviewState.isIOSSafari = window.interviewState.isIOS && window.interviewState.isSafari;

var IS = window.interviewState;

/**
 * Create a new entry
 * @param {string} section - The section identifier (e.g., 'issues', 'safety', 'inspections')
 * @param {string} content - The entry content
 * @returns {Object} The created entry object
 */
function createEntry(section, content) {
    const entry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        section: section,
        content: content.trim(),
        timestamp: new Date().toISOString(),
        entry_order: getNextEntryOrder(section),
        is_deleted: false
    };

    if (!IS.report.entries) IS.report.entries = [];
    IS.report.entries.push(entry);

    saveReport();
    return entry;
}

/**
 * Get next entry order for a section
 * @param {string} section - The section identifier
 * @returns {number} The next order number
 */
function getNextEntryOrder(section) {
    if (!IS.report.entries) return 1;
    const sectionEntries = IS.report.entries.filter(e => e.section === section && !e.is_deleted);
    return sectionEntries.length + 1;
}

/**
 * Get all entries for a section (not deleted)
 * @param {string} section - The section identifier
 * @returns {Array} Array of entry objects sorted by entry_order
 */
function getEntriesForSection(section) {
    if (!IS.report.entries) return [];
    return IS.report.entries
        .filter(e => e.section === section && !e.is_deleted)
        .sort((a, b) => a.entry_order - b.entry_order);
}

/**
 * Update an entry's content
 * @param {string} entryId - The entry ID to update
 * @param {string} newContent - The new content
 * @returns {Object|null} The updated entry or null if not found
 */
function updateEntry(entryId, newContent) {
    const entry = IS.report.entries?.find(e => e.id === entryId);
    if (!entry) return null;

    entry.content = newContent.trim();

    saveReport();
    return entry;
}

/**
 * Delete an entry (soft delete)
 * @param {string} entryId - The entry ID to delete
 */
function deleteEntryById(entryId) {
    const entry = IS.report.entries?.find(e => e.id === entryId);
    if (!entry) return;

    entry.is_deleted = true;

    saveReport();
}

/**
 * v6.6: Start editing an entry (swap to textarea)
 * @param {string} entryId - The entry ID to edit
 * @param {string} sectionType - The section type for re-rendering
 */
function startEditEntry(entryId, sectionType) {
    const entry = IS.report.entries?.find(e => e.id === entryId);
    if (!entry) return;

    const entryDiv = document.querySelector(`[data-entry-id="${entryId}"]`);
    if (!entryDiv) return;

    const contentP = entryDiv.querySelector('.entry-content');
    const editBtn = entryDiv.querySelector('.edit-btn');

    if (contentP && editBtn) {
        const textarea = document.createElement('textarea');
        textarea.id = `edit-textarea-${entryId}`;
        textarea.className = 'entry-edit-textarea w-full text-sm text-slate-700 border border-slate-300 rounded p-2 bg-white focus:outline-none focus:border-dot-blue auto-expand';
        textarea.value = entry.content;
        textarea.rows = 2;

        let editSaveTimeout = null;
        textarea.addEventListener('input', () => {
            autoExpand(textarea);
            if (editSaveTimeout) clearTimeout(editSaveTimeout);
            editSaveTimeout = setTimeout(() => {
                const text = textarea.value.trim();
                if (text) {
                    updateEntry(entryId, text);
                    saveReport();
                    console.log('[EDIT AUTOSAVE] Entry saved:', entryId);
                }
            }, 500);
        });

        contentP.replaceWith(textarea);

        autoExpand(textarea);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        editBtn.innerHTML = '<i class="fas fa-check text-xs"></i>';
        editBtn.className = 'save-btn text-safety-green hover:text-green-700 p-1';
        editBtn.onclick = () => saveEditEntry(entryId, sectionType);
    }
}

/**
 * v6.6: Save edited entry and return to read-only
 * @param {string} entryId - The entry ID being edited
 * @param {string} sectionType - The section type for re-rendering
 */
function saveEditEntry(entryId, sectionType) {
    const textarea = document.getElementById(`edit-textarea-${entryId}`);
    if (!textarea) return;

    const newContent = textarea.value.trim();
    if (newContent) {
        updateEntry(entryId, newContent);
    }

    if (sectionType === 'contractor-work') {
        renderContractorWorkCards();
    } else {
        renderSection(sectionType);
    }

    updateAllPreviews();
    showToast('Entry updated', 'success');
}


// ============================================================
// Toggle state management (was toggles.js)
// ============================================================

/**
 * Set a toggle state (locks immediately)
 * @param {string} section - The section identifier
 * @param {boolean} value - true = Yes, false = No
 * @returns {boolean} Success status
 */
function setToggleState(section, value) {
    // Check if toggle can be changed using report-rules.js
    if (IS.currentReportId && typeof canChangeToggle === 'function') {
        const canChange = canChangeToggle(IS.currentReportId, section);
        if (!canChange.allowed) {
            showToast(`Toggle locked: already set`, 'warning');
            return false;
        }
    }

    if (!IS.report.toggleStates) IS.report.toggleStates = {};
    IS.report.toggleStates[section] = value;  // true = Yes, false = No

    saveReport();
    return true;
}

/**
 * Get toggle state for a section
 * @param {string} section - The section identifier
 * @returns {boolean|null} Toggle state: true, false, or null if not set
 */
function getToggleState(section) {
    return IS.report.toggleStates?.[section] ?? null;  // null = not set
}

/**
 * Check if a toggle is locked
 * @param {string} section - The section identifier
 * @returns {boolean} True if toggle is locked
 */
function isToggleLocked(section) {
    return IS.report.toggleStates?.[section] !== undefined && IS.report.toggleStates?.[section] !== null;
}

/**
 * Render a toggle button pair for a section
 * @param {string} section - The section identifier
 * @param {string} label - The display label
 * @returns {string} HTML string for toggle buttons
 */
function renderToggleButtons(section, label) {
    const state = getToggleState(section);
    const locked = isToggleLocked(section);

    const yesClass = state === true
        ? 'bg-safety-green text-white border-safety-green'
        : 'bg-white text-slate-600 border-slate-300 hover:border-safety-green';
    const noClass = state === false
        ? 'bg-red-500 text-white border-red-500'
        : 'bg-white text-slate-600 border-slate-300 hover:border-red-500';

    const disabledAttr = locked ? 'disabled' : '';
    const lockedIcon = locked ? '<i class="fas fa-lock text-xs ml-1"></i>' : '';

    return `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 mb-3">
            <span class="text-sm font-medium text-slate-700">${label}</span>
            <div class="flex gap-2">
                <button
                    onclick="handleToggle('${section}', true)"
                    class="px-4 py-1.5 text-xs font-bold uppercase border-2 ${yesClass} transition-colors"
                    ${disabledAttr}
                >Yes${state === true ? lockedIcon : ''}</button>
                <button
                    onclick="handleToggle('${section}', false)"
                    class="px-4 py-1.5 text-xs font-bold uppercase border-2 ${noClass} transition-colors"
                    ${disabledAttr}
                >No${state === false ? lockedIcon : ''}</button>
            </div>
        </div>
    `;
}

/**
 * Handle toggle button click
 * @param {string} section - The section identifier
 * @param {boolean} value - The selected value
 */
function handleToggle(section, value) {
    if (isToggleLocked(section)) {
        showToast('Toggle is locked after selection', 'warning');
        return;
    }

    const success = setToggleState(section, value);
    if (success) {
        // Map toggle section names to render section names
        const sectionMap = {
            'communications_made': 'communications',
            'qaqc_performed': 'qaqc',
            'visitors_present': 'visitors',
            'personnel_onsite': 'personnel'
        };
        const renderSectionName = sectionMap[section] || section;

        // Re-render the section to show locked state
        renderSection(renderSectionName);
        updateAllPreviews();
        updateProgress();

        // v6.6: Initialize auto-save if toggle was set to Yes
        if (value === true) {
            const autoSaveMap = {
                'communications_made': { textareaId: 'communications-input', section: 'communications' },
                'qaqc_performed': { textareaId: 'qaqc-input', section: 'qaqc' },
                'visitors_present': { textareaId: 'visitors-input', section: 'visitors' }
            };
            const config = autoSaveMap[section];
            if (config) {
                // Small delay to ensure DOM is updated
                setTimeout(() => {
                    initGuidedAutoSave(config.textareaId, config.section);
                }, 100);
            }
        }
    }
}


// ============================================================
// N/A marking (was na-marking.js)
// ============================================================

function markNA(section) {
if (!IS.report.meta.naMarked) IS.report.meta.naMarked = {};
IS.report.meta.naMarked[section] = true;
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
btn.innerHTML = '<i class="fas fa-check mr-2"></i>Marked as N/A';
btn.className = 'w-full p-3 bg-safety-green/20 border-2 border-safety-green text-safety-green text-sm font-medium uppercase cursor-default';
btn.onclick = () => clearNA(section);
}
// Hide photo upload if photos section is marked N/A
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.add('hidden');
}
saveReport();
updateAllPreviews();
showToast('Marked as N/A');
}

function clearNA(section) {
if (IS.report.meta.naMarked) { delete IS.report.meta.naMarked[section]; }
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
const labels = { issues: 'No Issues - Mark as N/A', inspections: 'No Inspections - Mark as N/A', communications: 'No Communications - Mark as N/A', visitors: 'Nothing to Report - Mark as N/A', photos: 'No Photos - Mark as N/A' };
btn.innerHTML = `<i class="fas fa-ban mr-2"></i>${labels[section] || 'Mark as N/A'}`;
btn.className = 'w-full p-3 bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-medium uppercase';
btn.onclick = () => markNA(section);
}
// Show photo upload if photos section is cleared
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.remove('hidden');
}
saveReport();
updateAllPreviews();
showToast('N/A cleared');
}

function updateNAButtons() {
const naMarked = IS.report.meta.naMarked || {};
Object.keys(naMarked).forEach(section => {
if (naMarked[section]) {
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
btn.innerHTML = '<i class="fas fa-check mr-2"></i>Marked as N/A';
btn.className = 'w-full p-3 bg-safety-green/20 border-2 border-safety-green text-safety-green text-sm font-medium uppercase cursor-default';
btn.onclick = () => clearNA(section);
}
// Hide photo upload if photos is marked N/A
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.add('hidden');
}
}
});
}
