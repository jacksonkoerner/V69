// ============================================================
// js/interview/entries.js — Entry management (v6)
// Shared state namespace + CRUD for timestamped section entries
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
