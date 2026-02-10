// ============================================================
// js/interview/capture-mode.js — Capture mode selection & switching
// ============================================================

var IS = window.interviewState;

/**
 * Check if we should show mode selection screen
 * Show if: no captureMode set AND report is essentially empty
 */
function shouldShowModeSelection() {
    if (!IS.report) return true;
    if (IS.report.meta?.captureMode) return false;

    // Check if report has any meaningful data (besides default values)
    const hasPhotos = IS.report.photos?.length > 0;
    const hasActivities = IS.report.activities?.length > 0;
    const hasIssues = IS.report.generalIssues?.length > 0;
    const hasNotes = IS.report.additionalNotes?.trim().length > 0;
    const hasFieldNotes = IS.report.fieldNotes?.freeformNotes?.trim().length > 0 ||
                          (IS.report.freeform_entries?.length > 0 && IS.report.freeform_entries.some(e => e.content?.trim()));
    const hasReporterName = IS.report.reporter?.name?.trim().length > 0;

    // If any data exists, don't show mode selection
    return !(hasPhotos || hasActivities || hasIssues || hasNotes || hasFieldNotes || hasReporterName);
}

/**
 * Select a capture mode and show the appropriate UI
 */
function selectCaptureMode(mode) {
    IS.report.meta.captureMode = mode;
    saveReport();
    showModeUI(mode);
}

/**
 * Show the appropriate UI for the selected mode
 */
function showModeUI(mode) {
    const modeSelectionScreen = document.getElementById('modeSelectionScreen');
    const minimalModeApp = document.getElementById('minimalModeApp');
    const guidedModeApp = document.getElementById('app');

    modeSelectionScreen.classList.add('hidden');

    if (mode === 'minimal') {
        minimalModeApp.classList.remove('hidden');
        guidedModeApp.classList.add('hidden');
        initMinimalModeUI();
    } else {
        minimalModeApp.classList.add('hidden');
        guidedModeApp.classList.remove('hidden');
        initGuidedModeUI();
    }
}

/**
 * Show the mode selection screen
 */
function showModeSelectionScreen() {
    const modeSelectionScreen = document.getElementById('modeSelectionScreen');
    const minimalModeApp = document.getElementById('minimalModeApp');
    const guidedModeApp = document.getElementById('app');

    modeSelectionScreen.classList.remove('hidden');
    minimalModeApp.classList.add('hidden');
    guidedModeApp.classList.add('hidden');

    // Update mode selection header
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('modeSelectionDate').textContent = dateStr;

    if (IS.activeProject) {
        document.getElementById('modeSelectionProjectName').textContent = IS.activeProject.projectName;
    }
}

/**
 * Show confirmation modal for switching modes
 */
function showSwitchModeConfirm() {
    const modal = document.getElementById('switchModeModal');
    const warning = document.getElementById('switchModeWarning');
    const targetSpan = document.getElementById('switchModeTarget');
    const currentMode = IS.report.meta?.captureMode;

    // Set target mode text
    if (currentMode === 'minimal') {
        targetSpan.textContent = 'Guided Sections';
        // Show warning if there are freeform entries or legacy notes
        const hasEntries = IS.report.freeform_entries?.some(e => e.content?.trim());
        const hasLegacyNotes = IS.report.fieldNotes?.freeformNotes?.trim();
        if (hasEntries || hasLegacyNotes) {
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    } else {
        targetSpan.textContent = 'Quick Notes';
        warning.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

/**
 * Close the switch mode confirmation modal
 */
function closeSwitchModeModal() {
    document.getElementById('switchModeModal').classList.add('hidden');
}

/**
 * Confirm switching modes
 */
function confirmSwitchMode() {
    const currentMode = IS.report.meta?.captureMode;
    const newMode = currentMode === 'minimal' ? 'guided' : 'minimal';

    // Preserve data when switching
    if (currentMode === 'minimal' && newMode === 'guided') {
        // v6.6: Combine freeform entries into additionalNotes
        const entriesText = (IS.report.freeform_entries || [])
            .filter(e => e.content?.trim())
            .sort((a, b) => a.created_at - b.created_at)
            .map(e => e.content.trim())
            .join('\n\n');

        // Also check legacy freeformNotes
        const legacyNotes = IS.report.fieldNotes?.freeformNotes?.trim() || '';
        const allNotes = [entriesText, legacyNotes].filter(Boolean).join('\n\n');

        if (allNotes) {
            const existingNotes = IS.report.additionalNotes?.trim() || '';
            IS.report.additionalNotes = existingNotes
                ? `${existingNotes}\n\n--- Field Notes ---\n${allNotes}`
                : allNotes;
        }
    }

    // Photos and weather are always preserved (shared between modes)

    IS.report.meta.captureMode = newMode;
    saveReport();
    closeSwitchModeModal();
    showModeUI(newMode);
}
