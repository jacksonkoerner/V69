// ============================================================
// js/interview/main.js — Init, permissions, lifecycle
// Orchestrator — loads last
// ============================================================
var IS = window.interviewState;

// v6.6.16: Read reportId from URL if passed from index.js
function getReportIdFromUrl() {
const params = new URLSearchParams(window.location.search);
return params.get('reportId');
}

// ============ UTILITIES ============
// getHighAccuracyGPS() moved to /js/media-utils.js

function dismissWarningBanner() { document.getElementById('permissionsWarningBanner').classList.add('hidden'); }

function checkAndShowWarningBanner() {
const micGranted = localStorage.getItem(STORAGE_KEYS.MIC_GRANTED) === 'true';
const locGranted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED) === 'true';
if (IS.isMobile && (!micGranted || !locGranted)) {
document.getElementById('permissionsWarningBanner').classList.remove('hidden');
}
}

// ============ PERMISSIONS ============
async function requestMicrophonePermission() {
const btn = document.getElementById('micPermissionBtn');
const status = document.getElementById('micPermissionStatus');
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
status.textContent = 'Testing...';
try {
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(track => track.stop());
localStorage.setItem(STORAGE_KEYS.MIC_GRANTED, 'true');
updatePermissionUI('mic', 'granted');
showToast('Microphone enabled!', 'success');
} catch (err) {
console.error('Microphone permission error:', err);
updatePermissionUI('mic', 'denied');
status.textContent = 'Blocked - check settings';
}
}

async function requestLocationPermission() {
const btn = document.getElementById('locPermissionBtn');
btn.disabled = true;
btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
try {
const position = await new Promise((resolve, reject) => {
navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
// Cache location so other pages don't need to prompt again
cacheLocation(position.coords.latitude, position.coords.longitude);
updatePermissionUI('loc', 'granted');
showToast('Location enabled!');
fetchWeather();
} catch (err) {
console.error('Location permission error:', err);
if (err.code === 1) { updatePermissionUI('loc', 'denied'); }
}
}

function updatePermissionUI(type, state) {
const btn = document.getElementById(`${type}PermissionBtn`);
const status = document.getElementById(`${type}PermissionStatus`);
const row = document.getElementById(`${type}PermissionRow`);
if (state === 'granted') {
btn.innerHTML = '<i class="fas fa-check"></i>';
btn.className = 'px-4 py-2 bg-safety-green text-white text-xs font-bold cursor-default';
btn.disabled = true;
status.textContent = type === 'mic' ? 'Verified Working' : 'Enabled';
status.className = 'text-xs text-safety-green';
row.className = 'bg-safety-green/10 border-2 border-safety-green p-4';
} else if (state === 'denied') {
btn.textContent = 'Denied';
btn.className = 'px-4 py-2 bg-red-500/50 text-white text-xs font-bold';
btn.disabled = true;
status.textContent = 'Blocked - check settings';
status.className = 'text-xs text-red-500';
row.className = 'bg-red-50 border-2 border-red-500 p-4';
}
}

function closePermissionsModal() {
document.getElementById('permissionsModal').classList.add('hidden');
localStorage.setItem(STORAGE_KEYS.PERMISSIONS_DISMISSED, 'true');
}

// ============ EVENT LISTENERS ============
// Site conditions input (Weather section)
document.getElementById('site-conditions-input').addEventListener('change', (e) => {
IS.report.overview.weather.jobSiteCondition = e.target.value;
saveReport();
});

// Safety checkboxes
document.getElementById('no-incidents').addEventListener('change', (e) => {
if (e.target.checked) { IS.report.safety.hasIncidents = false; IS.report.safety.noIncidents = true; document.getElementById('has-incidents').checked = false; }
else { IS.report.safety.noIncidents = false; }
saveReport();
updateAllPreviews();
updateProgress();
});

document.getElementById('has-incidents').addEventListener('change', (e) => {
IS.report.safety.hasIncidents = e.target.checked;
if (e.target.checked) { IS.report.safety.noIncidents = false; document.getElementById('no-incidents').checked = false; }
saveReport();
updateAllPreviews();
updateProgress();
});

// Photo input
document.getElementById('photoInput').addEventListener('change', handlePhotoInput);

// ============ INIT ============
function updateLoadingStatus(message) {
const statusEl = document.getElementById('loadingStatus');
if (statusEl) statusEl.textContent = message;
}

function hideLoadingOverlay() {
const overlay = document.getElementById('loadingOverlay');
if (overlay) {
overlay.style.transition = 'opacity 0.3s ease-out';
overlay.style.opacity = '0';
setTimeout(() => {
overlay.style.display = 'none';
}, 300);
}
}

document.addEventListener('DOMContentLoaded', async () => {
// Initialize PWA features (moved from inline script)
if (typeof initPWA === 'function') initPWA();

// === NEW: Wire up processing overlay error buttons ===
document.getElementById('processingRetryBtn')?.addEventListener('click', () => {
hideProcessingOverlay();
// Determine which mode to retry based on visible UI
const minimalApp = document.getElementById('minimalModeApp');
if (minimalApp && !minimalApp.classList.contains('hidden')) {
finishMinimalReport();
} else {
finishReport();
}
});

document.getElementById('processingSaveDraftBtn')?.addEventListener('click', () => {
hideProcessingOverlay();
window.location.href = 'index.html';
});

try {
if (window.dataStore && typeof window.dataStore.init === 'function') {
await window.dataStore.init();
}
// STATE PROTECTION: Check if report is already refined BEFORE any other initialization
// This must run first to redirect users away from editing refined reports
updateLoadingStatus('Checking report state...');
const canEdit = await checkReportState();
if (!canEdit) {
return; // Stop initialization if redirecting
}

// Load user settings from Supabase
updateLoadingStatus('Loading user settings...');
IS.userSettings = await window.dataLayer.loadUserSettings();

// Load report from Supabase (baseline)
updateLoadingStatus('Loading report data...');
IS.report = await getReport();

// v6.6.20: Read URL param AFTER getReport() since getReport() clears stale IDs
const urlReportId = getReportIdFromUrl();
if (urlReportId) {
IS.currentReportId = urlReportId;
console.log('[QUICK-INTERVIEW] Using reportId from URL:', IS.currentReportId);
}

// If still no reportId, generate one now (shouldn't happen — index.js always passes ?reportId)
if (!IS.currentReportId) {
IS.currentReportId = generateId();
console.warn('[QUICK-INTERVIEW] No reportId in URL — generated fallback:', IS.currentReportId);
}
setStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID, IS.currentReportId);

// Sprint 11: getReport() now handles the full recovery chain:
// localStorage → IndexedDB → Supabase interview_backup → create fresh
// The code below is a safety net: if getReport returned a fresh report but
// localStorage/IDB has data (e.g., currentReportId wasn't set yet during getReport),
// we still recover it here.
updateLoadingStatus('Checking for saved draft...');
let localDraft = loadFromLocalStorage();

// Sprint 11: If localStorage miss, try IndexedDB (survives iOS 7-day eviction)
if (!localDraft && IS.currentReportId) {
localDraft = await loadDraftFromIDB();
}

if (localDraft) {
console.log('[INIT] Found local draft, restoring...');
restoreFromLocalStorage(localDraft);
}

// Sprint 1 fix: Load project from the REPORT's project_id, not ACTIVE_PROJECT_ID.
// Sprint 5: Removed ACTIVE_PROJECT_ID fallback — project_id comes from URL or report data.
updateLoadingStatus('Loading project data...');
let reportProjectId = null;

// 1. Check URL params (set by report-creation.js at creation time)
const urlProjectId = new URLSearchParams(window.location.search).get('projectId');
if (urlProjectId) {
reportProjectId = urlProjectId;
console.log('[INIT] Got project_id from URL:', reportProjectId);
}

// 2. Check the localStorage draft for project_id (for in-progress reports)
if (!reportProjectId) {
let storedReport = null;
if (window.dataStore && typeof window.dataStore.getReport === 'function') {
storedReport = await window.dataStore.getReport(IS.currentReportId);
}
if (storedReport && storedReport.project_id) {
reportProjectId = storedReport.project_id;
console.log('[INIT] Got project_id from IDB report metadata:', reportProjectId);
}
}

// Load the project by its specific ID
if (reportProjectId) {
IS.activeProject = await window.dataLayer.loadProjectById(reportProjectId);
} else {
IS.activeProject = null;
console.warn('[INIT] No project_id found for this report');
}

if (IS.activeProject) {
IS.projectContractors = IS.activeProject.contractors || [];
}

// If user came back to edit a draft report that was marked completed but not yet refined,
// mark it as in-progress again. Note: Refined/submitted/finalized reports are blocked
// by checkReportState() above, so we only get here for draft status.
if (IS.report.meta?.interviewCompleted && IS.report.meta?.status === 'draft') {
IS.report.meta.interviewCompleted = false;
// Don't need to save here - we're just resetting local state
}

// Auto-populate project info from active project if not already set
if (IS.activeProject && !IS.report.project?.projectName) {
IS.report.project.projectName = IS.activeProject.projectName || '';
IS.report.overview.projectName = IS.activeProject.projectName || '';
// Don't save here - let regular auto-save handle it
}

// Auto-populate reporter name from user settings
if (IS.userSettings && !IS.report.reporter?.name) {
IS.report.reporter.name = IS.userSettings.full_name || '';
IS.report.overview.completedBy = IS.userSettings.full_name || '';
// Don't save here - let regular auto-save handle it
}

// Hide loading overlay
hideLoadingOverlay();

// Check if we need to show mode selection or jump to a specific mode
if (shouldShowModeSelection()) {
showModeSelectionScreen();
// Fetch weather in background for when user selects a mode
if (IS.report.overview.weather.generalCondition === 'Syncing...' || IS.report.overview.weather.generalCondition === '--') {
fetchWeather();
}
} else {
// Show the appropriate mode UI
const mode = IS.report.meta?.captureMode || 'guided';
showModeUI(mode);

// Fetch weather if needed
if (IS.report.overview.weather.generalCondition === 'Syncing...' || IS.report.overview.weather.generalCondition === '--') {
await fetchWeather();
// Update weather display in minimal mode if active
if (mode === 'minimal') {
updateMinimalWeatherDisplay();
}
}
}

checkAndShowWarningBanner();
checkDictationHintBanner();

// Start Realtime subscriptions for multi-device sync
if (typeof initRealtimeSync === 'function') initRealtimeSync();
} catch (error) {
console.error('Initialization failed:', error);
hideLoadingOverlay();
showToast('Failed to load data. Please refresh.', 'error');
}
});

// ============ HARDENING: Emergency save on page hide ============
// visibilitychange — fires when user switches tabs, locks phone, or switches apps
document.addEventListener('visibilitychange', () => {
if (document.visibilityState === 'hidden' && IS.currentReportId) {
console.log('[HARDENING] visibilitychange → hidden, saving...');
saveToLocalStorage();
flushInterviewBackup();
}
});

// pagehide — more reliable than beforeunload on iOS Safari
window.addEventListener('pagehide', (event) => {
if (IS.currentReportId) {
console.log('[HARDENING] pagehide, saving... (persisted:', event.persisted, ')');
saveToLocalStorage();
flushInterviewBackup();
}
if (window.dataStore && typeof window.dataStore.closeAll === 'function') {
window.dataStore.closeAll();
}
});
