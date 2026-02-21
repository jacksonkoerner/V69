// ============================================================
// js/interview/ui-flow.js — Capture mode + Processing overlay
// Sprint 11: Consolidated from capture-mode.js, processing-overlay.js
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


// ============================================================
// Processing overlay (was processing-overlay.js)
// ============================================================

/**
 * Show confirmation dialog before processing
 * Returns a Promise that resolves true (confirmed) or false (cancelled)
 */
function showProcessConfirmation() {
return new Promise((resolve) => {
const dialog = document.getElementById('submitConfirmDialog');
const statusDot = document.getElementById('confirmStatusDot');
const statusText = document.getElementById('confirmStatusText');
const statusContainer = document.getElementById('confirmOnlineStatus');
const goBtn = document.getElementById('confirmGoBtn');
const cancelBtn = document.getElementById('processConfirmCancelBtn');

if (!dialog) { resolve(true); return; } // Fallback if HTML missing

// Update online status
function updateOnlineStatus() {
if (navigator.onLine) {
statusDot.className = 'w-3 h-3 rounded-full bg-green-500';
statusText.textContent = 'Connected — Ready to process';
statusText.className = 'text-sm text-green-700';
statusContainer.className = 'flex items-center gap-2 mb-5 p-3 rounded-lg bg-green-50';
goBtn.disabled = false;
goBtn.className = 'flex-1 py-3 px-4 rounded-xl bg-green-600 text-white font-semibold text-base';
} else {
statusDot.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse';
statusText.textContent = 'No internet connection';
statusText.className = 'text-sm text-red-700';
statusContainer.className = 'flex items-center gap-2 mb-5 p-3 rounded-lg bg-red-50';
goBtn.disabled = true;
goBtn.className = 'flex-1 py-3 px-4 rounded-xl bg-gray-300 text-gray-500 font-semibold text-base cursor-not-allowed';
}
}

updateOnlineStatus();

// Listen for online/offline changes while dialog is open
const onlineHandler = () => updateOnlineStatus();
const offlineHandler = () => updateOnlineStatus();
window.addEventListener('online', onlineHandler);
window.addEventListener('offline', offlineHandler);

function cleanup() {
window.removeEventListener('online', onlineHandler);
window.removeEventListener('offline', offlineHandler);
goBtn.removeEventListener('click', onConfirm);
cancelBtn.removeEventListener('click', onCancel);
dialog.classList.add('hidden');
}

function onConfirm() {
cleanup();
resolve(true);
}

function onCancel() {
cleanup();
resolve(false);
}

goBtn.addEventListener('click', onConfirm);
cancelBtn.addEventListener('click', onCancel);

dialog.classList.remove('hidden');
});
}

/**
 * Show the full-screen processing overlay
 * All clicks/taps/keyboard are blocked
 */
function showProcessingOverlay() {
const overlay = document.getElementById('processingOverlay');
const errorDiv = document.getElementById('processingError');

if (!overlay) return;

overlay.classList.remove('hidden');
errorDiv.classList.add('hidden');

document.getElementById('processingTitle').textContent = 'Processing Your Report';
document.getElementById('processingStatus').textContent = "Please wait, don't close this page...";
document.getElementById('processingBar').style.width = '0%';

// Reset all steps
document.querySelectorAll('#processingSteps .proc-step').forEach(step => {
step.className = 'proc-step flex items-center gap-4';
});

// Block back button / page close
_navigationAllowed = false;
window.addEventListener('beforeunload', _blockUnload);

// Block ALL keyboard input
document.addEventListener('keydown', _blockKeys, true);

// Block ALL touch/click on the overlay (redundant with CSS but extra safety)
overlay.addEventListener('touchstart', _blockTouch, { passive: false, capture: true });
overlay.addEventListener('touchmove', _blockTouch, { passive: false, capture: true });
overlay.addEventListener('touchend', _blockTouch, { passive: false, capture: true });
overlay.addEventListener('click', _blockTouch, true);
overlay.addEventListener('mousedown', _blockTouch, true);
overlay.addEventListener('contextmenu', _blockTouch, true);
}

/**
 * Update the active step in the overlay
 * @param {number} stepNum - 1-4
 * @param {string} state - 'active' or 'complete'
 */
function setProcessingStep(stepNum, state) {
const steps = document.querySelectorAll('#processingSteps .proc-step');
const bar = document.getElementById('processingBar');
if (!steps.length) return;

steps.forEach((step, index) => {
const num = index + 1;
if (num < stepNum) {
step.className = 'proc-step flex items-center gap-4 complete';
} else if (num === stepNum) {
step.className = `proc-step flex items-center gap-4 ${state}`;
} else {
step.className = 'proc-step flex items-center gap-4';
}
});

// Progress bar
const total = steps.length;
let pct = 0;
if (state === 'complete') {
pct = (stepNum / total) * 100;
} else if (state === 'active') {
pct = ((stepNum - 1) / total) * 100 + (1 / total) * 40;
}
if (bar) bar.style.width = pct + '%';
}

/**
 * Show success state on overlay before redirect
 */
function showProcessingSuccess() {
const title = document.getElementById('processingTitle');
const status = document.getElementById('processingStatus');
const bar = document.getElementById('processingBar');

if (title) title.textContent = 'Report Ready!';
if (status) status.textContent = 'Opening your report...';
if (bar) bar.style.width = '100%';

// Mark all steps complete
document.querySelectorAll('#processingSteps .proc-step').forEach(step => {
step.className = 'proc-step flex items-center gap-4 complete';
});
}

/**
 * Show error state on overlay
 * Re-enables buttons in the error div so user can interact
 */
function showProcessingError(message) {
const errorDiv = document.getElementById('processingError');
const errorMsg = document.getElementById('processingErrorMsg');
const title = document.getElementById('processingTitle');
const status = document.getElementById('processingStatus');

if (title) title.textContent = 'Processing Failed';
if (status) status.textContent = '';
if (errorMsg) errorMsg.textContent = message || 'Could not reach the server. Your data is safe.';
if (errorDiv) errorDiv.classList.remove('hidden');

// Mark current step as error
const activeStep = document.querySelector('#processingSteps .proc-step.active');
if (activeStep) activeStep.className = 'proc-step flex items-center gap-4 error';
}

/**
 * Hide the overlay and clean up all event listeners
 */
function hideProcessingOverlay() {
_navigationAllowed = true;
window.removeEventListener('beforeunload', _blockUnload);

const overlay = document.getElementById('processingOverlay');
if (!overlay) return;

overlay.classList.add('hidden');
document.removeEventListener('keydown', _blockKeys, true);
overlay.removeEventListener('touchstart', _blockTouch, true);
overlay.removeEventListener('touchmove', _blockTouch, true);
overlay.removeEventListener('touchend', _blockTouch, true);
overlay.removeEventListener('click', _blockTouch, true);
overlay.removeEventListener('mousedown', _blockTouch, true);
overlay.removeEventListener('contextmenu', _blockTouch, true);
}

// Flag to allow navigation after processing completes (belt-and-suspenders
// for browsers that fire beforeunload before removeEventListener propagates)
var _navigationAllowed = false;

// Private helper functions for blocking
function _blockUnload(e) {
if (_navigationAllowed) return;
e.preventDefault();
e.returnValue = 'Your report is being processed. Please wait.';
return e.returnValue;
}

function _blockKeys(e) {
// Block everything during processing
e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();
return false;
}

function _blockTouch(e) {
// Check if the click is on an error state button (those should work)
if (e.target && e.target.closest && e.target.closest('#processingError')) {
return; // Allow clicks on error buttons
}
e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();
return false;
}
