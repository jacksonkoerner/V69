// ============================================================
// PROCESSING OVERLAY
// Full-screen overlay shown during report submission
// Blocks all user interaction while processing
// ============================================================

var IS = window.interviewState;

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
const overlay = document.getElementById('processingOverlay');
if (!overlay) return;

overlay.classList.add('hidden');

window.removeEventListener('beforeunload', _blockUnload);
document.removeEventListener('keydown', _blockKeys, true);
overlay.removeEventListener('touchstart', _blockTouch, true);
overlay.removeEventListener('touchmove', _blockTouch, true);
overlay.removeEventListener('touchend', _blockTouch, true);
overlay.removeEventListener('click', _blockTouch, true);
overlay.removeEventListener('mousedown', _blockTouch, true);
overlay.removeEventListener('contextmenu', _blockTouch, true);
}

// Private helper functions for blocking
function _blockUnload(e) {
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
