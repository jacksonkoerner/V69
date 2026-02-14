// Guided mode section rendering and management
var IS = window.interviewState;

/**
 * Initialize the guided mode UI (existing functionality)
 */
function initGuidedModeUI() {
// Set date
const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
document.getElementById('currentDate').textContent = dateStr;

// v6: Initialize v6 structures if not present
if (!IS.report.entries) IS.report.entries = [];
if (!IS.report.toggleStates) IS.report.toggleStates = {};

renderAllSections();
updateAllPreviews();
updateProgress();
updateNAButtons();

// Work Summary entries are rendered by renderSection('activities')
// Input field starts empty for new entries

// Safety checkboxes - sync with report state
document.getElementById('no-incidents').checked = IS.report.safety?.noIncidents || false;
document.getElementById('has-incidents').checked = IS.report.safety?.hasIncidents || false;

// Initialize auto-expand for all textareas
initAllAutoExpandTextareas();

// v6.6: Initialize auto-save on typing for guided sections
initAllGuidedAutoSave();
}

function renderSection(section) {
switch (section) {
case 'activities':
// v6.6: Contractor work cards with timestamped entries
renderContractorWorkCards();
break;
case 'operations':
// Personnel cards are rendered by renderPersonnelCards()
renderPersonnelCards();
break;
case 'issues':
// v6: Use entry-based notes
const issueEntries = getEntriesForSection('issues');
// Also check legacy generalIssues array for backward compatibility
const legacyIssues = IS.report.generalIssues || [];

let issuesHtml = '';

// Render entry-based issues first
if (issueEntries.length > 0) {
issuesHtml += issueEntries.map(entry => `
<div class="bg-red-50 border border-red-200 p-3 flex items-start gap-3 group" data-entry-id="${entry.id}">
<i class="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
<div class="flex-1">
<p class="entry-content text-sm text-slate-700">${escapeHtml(entry.content)}</p>
<p class="text-[10px] text-slate-400 mt-1">${new Date(entry.timestamp).toLocaleTimeString()}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'issues')" class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteEntryById('${entry.id}'); renderSection('issues'); updateAllPreviews(); updateProgress();" class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
`).join('');
}

// Also render legacy issues (for backward compatibility)
if (legacyIssues.length > 0) {
issuesHtml += legacyIssues.map((issue, i) => `
<div class="bg-red-50 border border-red-200 p-3 flex items-start gap-3">
<i class="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
<p class="flex-1 text-sm text-slate-700">${escapeHtml(issue)}</p>
<button onclick="removeIssue(${i})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash text-xs"></i></button>
</div>
`).join('');
}

document.getElementById('issues-list').innerHTML = issuesHtml;
break;
case 'inspections':
document.getElementById('inspections-list').innerHTML = IS.report.qaqcNotes.map((note, i) => `
<div class="bg-violet-50 border border-violet-200 p-3 flex items-start gap-3">
<i class="fas fa-check-circle text-violet-500 mt-0.5"></i>
<p class="flex-1 text-sm text-slate-700">${escapeHtml(note)}</p>
<button onclick="removeInspection(${i})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash text-xs"></i></button>
</div>
`).join('') || '';
break;
case 'safety':
// v6: Use entry-based notes
const safetyEntries = getEntriesForSection('safety');
// Also check legacy safety.notes array for backward compatibility
const legacySafetyNotes = IS.report.safety?.notes || [];

let safetyEntriesHtml = '';

// Render entry-based safety notes
if (safetyEntries.length > 0) {
safetyEntriesHtml += safetyEntries.map(entry => `
<div class="bg-green-50 border border-green-200 p-3 flex items-start gap-3 group" data-entry-id="${entry.id}">
<i class="fas fa-shield-alt text-safety-green mt-0.5"></i>
<div class="flex-1">
<p class="entry-content text-sm text-slate-700">${escapeHtml(entry.content)}</p>
<p class="text-[10px] text-slate-400 mt-1">${new Date(entry.timestamp).toLocaleTimeString()}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'safety')" class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteEntryById('${entry.id}'); renderSection('safety'); updateAllPreviews(); updateProgress();" class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
`).join('');
}

// Also render legacy safety notes (for backward compatibility)
if (legacySafetyNotes.length > 0) {
safetyEntriesHtml += legacySafetyNotes.map((note, i) => `
<div class="bg-green-50 border border-green-200 p-3 flex items-start gap-3">
<i class="fas fa-shield-alt text-safety-green mt-0.5"></i>
<p class="flex-1 text-sm text-slate-700">${escapeHtml(note)}</p>
<button onclick="removeSafetyNote(${i})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash text-xs"></i></button>
</div>
`).join('');
}

document.getElementById('safety-list').innerHTML = safetyEntriesHtml;

// Sync checkboxes with report state
document.getElementById('has-incidents').checked = IS.report.safety.hasIncidents;
document.getElementById('no-incidents').checked = IS.report.safety.noIncidents;
break;
case 'personnel':
// Render toggle for contractors on site
const personnelToggle = renderToggleButtons('personnel_onsite', 'Any contractors on site today?');
const toggleContainer = document.getElementById('personnel-toggle-container');
if (toggleContainer) {
toggleContainer.innerHTML = personnelToggle;
}

// Show/hide personnel cards based on toggle state
const personnelToggleState = getToggleState('personnel_onsite');
if (personnelToggleState === true) {
renderPersonnelCards();
} else if (personnelToggleState === false) {
document.getElementById('personnel-list').innerHTML = `
<div class="bg-slate-100 border border-slate-200 p-3 text-center text-sm text-slate-500">
<i class="fas fa-ban mr-2"></i>Marked as N/A - No contractors on site
</div>
`;
document.getElementById('no-project-warning-ops').classList.add('hidden');
document.getElementById('personnel-totals').classList.add('hidden');
} else {
// Toggle not set - show cards for input
renderPersonnelCards();
}
break;
case 'equipment':
renderEquipmentSection();
break;
case 'communications':
// Render toggle
const commsToggle = renderToggleButtons('communications_made', 'Any communications with contractor today?');
const commsToggleContainer = document.getElementById('communications-toggle-container');
if (commsToggleContainer) {
commsToggleContainer.innerHTML = commsToggle;
}

// v6.6 iOS Safari fix: textarea always in DOM, toggle controls visibility
const commsToggleState = getToggleState('communications_made');
const commsNaMessage = document.getElementById('communications-na-message');
const commsInputArea = document.getElementById('communications-input-area');
const commsList = document.getElementById('communications-list');

// Always render existing entries
const commsEntries = getEntriesForSection('communications');
if (commsList) {
commsList.innerHTML = commsEntries.map(entry => `
<div class="bg-violet-50 border border-violet-200 p-3 flex items-start gap-3 group" data-entry-id="${entry.id}">
<i class="fas fa-comment text-violet-500 mt-0.5"></i>
<div class="flex-1">
<p class="entry-content text-sm text-slate-700">${escapeHtml(entry.content)}</p>
<p class="text-[10px] text-slate-400 mt-1">${new Date(entry.timestamp).toLocaleTimeString()}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'communications')" class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteEntryById('${entry.id}'); renderSection('communications'); updateAllPreviews(); updateProgress();" class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
`).join('');
}

// Toggle controls N/A message and input area visibility
if (commsToggleState === false) {
// N/A selected - show message, hide input
if (commsNaMessage) commsNaMessage.classList.remove('hidden');
if (commsInputArea) commsInputArea.classList.add('hidden');
} else {
// Yes selected or not yet answered - hide message, show input
if (commsNaMessage) commsNaMessage.classList.add('hidden');
if (commsInputArea) commsInputArea.classList.remove('hidden');
}
break;
case 'qaqc':
// Render toggle
const qaqcToggle = renderToggleButtons('qaqc_performed', 'Any QA/QC testing or inspections today?');
const qaqcToggleContainer = document.getElementById('qaqc-toggle-container');
if (qaqcToggleContainer) {
qaqcToggleContainer.innerHTML = qaqcToggle;
}

// v6.6 iOS Safari fix: textarea always in DOM, toggle controls visibility
const qaqcToggleState = getToggleState('qaqc_performed');
const qaqcNaMessage = document.getElementById('qaqc-na-message');
const qaqcInputArea = document.getElementById('qaqc-input-area');
const qaqcList = document.getElementById('qaqc-list');

// Always render existing entries
const qaqcEntries = getEntriesForSection('qaqc');
if (qaqcList) {
qaqcList.innerHTML = qaqcEntries.map(entry => `
<div class="bg-indigo-50 border border-indigo-200 p-3 flex items-start gap-3 group" data-entry-id="${entry.id}">
<i class="fas fa-clipboard-check text-indigo-500 mt-0.5"></i>
<div class="flex-1">
<p class="entry-content text-sm text-slate-700">${escapeHtml(entry.content)}</p>
<p class="text-[10px] text-slate-400 mt-1">${new Date(entry.timestamp).toLocaleTimeString()}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'qaqc')" class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteEntryById('${entry.id}'); renderSection('qaqc'); updateAllPreviews(); updateProgress();" class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
`).join('');
}

// Toggle controls N/A message and input area visibility
if (qaqcToggleState === false) {
// N/A selected - show message, hide input
if (qaqcNaMessage) qaqcNaMessage.classList.remove('hidden');
if (qaqcInputArea) qaqcInputArea.classList.add('hidden');
} else {
// Yes selected or not yet answered - hide message, show input
if (qaqcNaMessage) qaqcNaMessage.classList.add('hidden');
if (qaqcInputArea) qaqcInputArea.classList.remove('hidden');
}
break;
case 'visitors':
// Render toggle
const visitorsToggle = renderToggleButtons('visitors_present', 'Any visitors, deliveries, or other activity today?');
const visitorsToggleContainer = document.getElementById('visitors-toggle-container');
if (visitorsToggleContainer) {
visitorsToggleContainer.innerHTML = visitorsToggle;
}

// v6.6 iOS Safari fix: textarea always in DOM, toggle controls visibility
const visitorsToggleState = getToggleState('visitors_present');
const visitorsNaMessage = document.getElementById('visitors-na-message');
const visitorsInputArea = document.getElementById('visitors-input-area');
const visitorsList = document.getElementById('visitors-list');

// Always render existing entries
const visitorsEntries = getEntriesForSection('visitors');
if (visitorsList) {
visitorsList.innerHTML = visitorsEntries.map(entry => `
<div class="bg-teal-50 border border-teal-200 p-3 flex items-start gap-3 group" data-entry-id="${entry.id}">
<i class="fas fa-truck-loading text-teal-500 mt-0.5"></i>
<div class="flex-1">
<p class="entry-content text-sm text-slate-700">${escapeHtml(entry.content)}</p>
<p class="text-[10px] text-slate-400 mt-1">${new Date(entry.timestamp).toLocaleTimeString()}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'visitors')" class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteEntryById('${entry.id}'); renderSection('visitors'); updateAllPreviews(); updateProgress();" class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
`).join('');
}

// Toggle controls N/A message and input area visibility
if (visitorsToggleState === false) {
// N/A selected - show message, hide input
if (visitorsNaMessage) visitorsNaMessage.classList.remove('hidden');
if (visitorsInputArea) visitorsInputArea.classList.add('hidden');
} else {
// Yes selected or not yet answered - hide message, show input
if (visitorsNaMessage) visitorsNaMessage.classList.add('hidden');
if (visitorsInputArea) visitorsInputArea.classList.remove('hidden');
}
break;
case 'photos':
document.getElementById('photos-grid').innerHTML = IS.report.photos.map((p, i) => {
    // Upload indicator: spinner (uploading), checkmark (uploaded), cloud (pending/failed)
    let uploadIndicatorHtml = '';
    const status = p.uploadStatus || (p.storagePath ? 'uploaded' : 'pending');
    if (status === 'uploading') {
        uploadIndicatorHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><i class="fas fa-spinner fa-spin text-white text-xs"></i></div>`;
    } else if (status === 'uploaded') {
        uploadIndicatorHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg"><i class="fas fa-check text-white text-xs"></i></div>`;
    } else {
        uploadIndicatorHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg" title="Will upload on submit"><i class="fas fa-cloud-arrow-up text-white text-xs"></i></div>`;
    }
    return `
<div class="border-2 border-slate-300 overflow-hidden bg-slate-100">
<div class="relative">
<img src="${p.url}" class="w-full aspect-square object-cover" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23cbd5e1%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%2364748b%22 font-size=%2212%22>Error</text></svg>';">
${uploadIndicatorHtml}
<button onclick="removePhoto(${i})" class="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white text-xs flex items-center justify-center shadow-lg"><i class="fas fa-times"></i></button>
<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6">
<div class="flex items-center gap-1 text-white/90 mb-1">
<i class="fas fa-clock text-[8px]"></i>
<p class="text-[10px] font-medium">${p.date} ${p.time}</p>
</div>
${p.gps ? `
<div class="flex items-center gap-1 text-safety-green">
<i class="fas fa-map-marker-alt text-[8px]"></i>
<p class="text-[9px] font-mono">${p.gps.lat.toFixed(5)}, ${p.gps.lng.toFixed(5)}</p>
<span class="text-[8px] text-white/60">(±${p.gps.accuracy}m)</span>
</div>
` : `
<div class="flex items-center gap-1 text-dot-orange">
<i class="fas fa-location-crosshairs text-[8px]"></i>
<p class="text-[9px]">No GPS</p>
</div>
`}
</div>
</div>
<div class="p-2 bg-white">
<textarea
id="caption-input-${i}"
class="caption-textarea w-full text-xs border border-slate-200 rounded p-2 bg-slate-50 focus:bg-white focus:border-dot-blue focus:outline-none"
placeholder="Add caption..."
maxlength="500"
oninput="updatePhotoCaption(${i}, this.value); autoExpandCaption(this);"
onblur="updatePhotoCaption(${i}, this.value)"
></textarea>
<div id="caption-counter-${i}" class="caption-counter hidden mt-1"></div>
</div>
</div>
`;
}).join('') || '<p class="col-span-2 text-center text-slate-400 text-sm py-4">No photos yet</p>';
// Set caption values via DOM to prevent XSS
IS.report.photos.forEach((p, i) => {
    const ta = document.getElementById('caption-input-' + i);
    if (ta) ta.value = p.caption || '';
});
break;
}
}

function renderAllSections() {
// v6: All guided mode sections
['activities', 'personnel', 'equipment', 'issues', 'communications', 'qaqc', 'safety', 'visitors', 'photos'].forEach(renderSection);
updateWeatherDisplay();
updateEquipmentPreview();
}

function toggleSection(sectionId) {
const cards = document.querySelectorAll('.section-card');
cards.forEach(card => {
if (card.dataset.section === sectionId) {
card.classList.toggle('expanded');
const icon = card.querySelector('[id$="-status"] i');
if (card.classList.contains('expanded')) {
icon.className = 'fas fa-chevron-up text-dot-blue text-xs';
} else {
icon.className = 'fas fa-chevron-down text-slate-400 text-xs';
}
} else {
card.classList.remove('expanded');
const icon = card.querySelector('[id$="-status"] i');
if (icon) icon.className = 'fas fa-chevron-down text-slate-400 text-xs';
}
});
}

function dismissDictationHint() {
localStorage.setItem(STORAGE_KEYS.DICTATION_HINT_DISMISSED, 'true');
const banner = document.getElementById('dictationHintBanner');
if (banner) banner.classList.add('hidden');
}

function checkDictationHintBanner() {
const dismissed = localStorage.getItem(STORAGE_KEYS.DICTATION_HINT_DISMISSED) === 'true';
const banner = document.getElementById('dictationHintBanner');
if (banner && dismissed) {
banner.classList.add('hidden');
}
}
