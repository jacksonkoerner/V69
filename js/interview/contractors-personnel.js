// ============================================================
// js/interview/contractors-personnel.js — Contractors + Personnel
// Sprint 11: Consolidated from contractors.js, personnel.js
// ============================================================

var IS = window.interviewState;

function getContractorActivity(contractorId) {
if (!IS.report || !IS.report.activities) return null;
return IS.report.activities.find(a => a.contractorId === contractorId);
}

/**
 * v6.6: Initialize contractor activities (simplified - noWork flag only)
 */
function initializeContractorActivities() {
if (!IS.report.activities) IS.report.activities = [];

// Ensure each contractor has an activity entry (noWork flag only)
IS.projectContractors.forEach(contractor => {
const existing = IS.report.activities.find(a => a.contractorId === contractor.id);
if (!existing) {
IS.report.activities.push({
contractorId: contractor.id,
noWork: true
});
}
});
}

/**
 * v6.9: Build entries HTML for a set of work entries
 */
function buildEntriesHtml(entries) {
if (entries.length === 0) return '';
return entries.map(entry => {
const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
hour: 'numeric',
minute: '2-digit',
hour12: true
});
return `
<div class="bg-white border border-slate-200 p-3 relative group" data-entry-id="${entry.id}">
<div class="flex items-start justify-between gap-2">
<div class="flex-1">
<p class="text-[10px] font-medium text-slate-400 uppercase">${time}</p>
<p class="entry-content text-sm text-slate-700 mt-1">${escapeHtml(entry.content)}</p>
</div>
<div class="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
<button onclick="startEditEntry('${entry.id}', 'contractor-work')"
class="edit-btn text-slate-400 hover:text-dot-blue p-1">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteContractorWorkEntry('${entry.id}')"
class="text-red-400 hover:text-red-600 p-1">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
</div>
`;
}).join('');
}

/**
 * v6.6/v6.9: Render contractor work cards with timestamped entries
 * v6.9: If a contractor has crews, render one card per crew instead of one per contractor
 */
function renderContractorWorkCards() {
const container = document.getElementById('contractor-work-list');
const warningEl = document.getElementById('no-project-warning');
const footerEl = document.getElementById('contractor-work-footer');

if (!IS.activeProject || IS.projectContractors.length === 0) {
warningEl?.classList.remove('hidden');
footerEl?.classList.add('hidden');
container.innerHTML = '';
return;
}

warningEl?.classList.add('hidden');
footerEl?.classList.remove('hidden');
initializeContractorActivities();

const todayDate = getTodayDateFormatted();
let cardsHtml = '';

IS.projectContractors.forEach((contractor) => {
const crews = contractor.crews || [];
const activity = getContractorActivity(contractor.id) || { noWork: true };
const borderColor = contractor.type === 'prime' ? 'border-safety-green' : 'border-dot-blue';
const bgColor = contractor.type === 'prime' ? 'bg-safety-green' : 'bg-dot-blue';
const textColor = contractor.type === 'prime' ? 'text-safety-green' : 'text-dot-blue';
const typeLabel = contractor.type === 'prime' ? 'PRIME' : 'SUB';
const tradesText = contractor.trades ? ` • ${contractor.trades.toUpperCase()}` : '';

if (crews.length === 0) {
// === NO CREWS: render exactly like before (one card per contractor) ===
const entries = getContractorWorkEntries(contractor.id);
const hasWork = !activity.noWork || entries.length > 0;
const isExpanded = hasWork || !activity.noWork;
const headerText = `${contractor.name.toUpperCase()} – ${typeLabel}${tradesText}`;
const entriesHtml = buildEntriesHtml(entries);

let subtitleText = 'Tap to add work';
if (activity.noWork && entries.length === 0) {
subtitleText = 'No work performed';
} else if (entries.length > 0) {
subtitleText = `${entries.length} note${entries.length === 1 ? '' : 's'} logged`;
}

cardsHtml += `
<div class="contractor-work-card border-2 ${hasWork ? borderColor : 'border-slate-200'} rounded-lg overflow-hidden" data-contractor-id="${contractor.id}">
<button onclick="toggleContractorCard('${contractor.id}')" class="w-full p-3 flex items-center gap-3 text-left ${hasWork ? bgColor + '/10' : 'bg-slate-50'}">
<div class="w-8 h-8 ${hasWork ? bgColor : 'bg-slate-300'} rounded flex items-center justify-center shrink-0">
<i class="fas ${hasWork ? 'fa-hard-hat' : 'fa-minus'} text-white text-sm"></i>
</div>
<div class="flex-1 min-w-0">
<p class="text-xs font-bold ${hasWork ? textColor : 'text-slate-500'} uppercase leading-tight truncate">${escapeHtml(headerText)}</p>
<p class="text-[10px] text-slate-500 mt-0.5">${subtitleText}</p>
</div>
<i id="contractor-chevron-${contractor.id}" class="fas fa-chevron-down text-slate-400 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}"></i>
</button>
<div id="contractor-content-${contractor.id}" class="contractor-content ${isExpanded ? '' : 'hidden'} border-t border-slate-200 p-3 space-y-3">
<label class="flex items-center gap-3 p-3 bg-slate-100 border border-slate-300 rounded cursor-pointer hover:bg-slate-200 transition-colors">
<input type="checkbox" id="no-work-${contractor.id}" ${activity.noWork ? 'checked' : ''} onchange="toggleNoWork('${contractor.id}', this.checked)" class="w-5 h-5 accent-slate-600">
<span class="text-sm font-medium text-slate-600">No work performed on ${todayDate}</span>
</label>
<div id="work-fields-${contractor.id}" class="${activity.noWork ? 'hidden' : ''} space-y-3">
${entriesHtml ? `<div class="space-y-2">${entriesHtml}</div>` : ''}
<div class="flex items-start gap-2">
<textarea id="work-input-${contractor.id}" class="flex-1 bg-white border-2 border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-${contractor.type === 'prime' ? 'safety-green' : 'dot-blue'} rounded auto-expand" rows="2" placeholder="Describe work performed..."></textarea>
<button onclick="addContractorWorkEntry('${contractor.id}')" class="px-4 py-2 ${bgColor} hover:opacity-90 text-white font-bold rounded transition-colors"><i class="fas fa-plus"></i></button>
</div>
<p class="text-xs text-slate-400"><i class="fas fa-microphone mr-1"></i>Tap keyboard mic to dictate</p>
</div>
</div>
</div>
`;
} else {
// === HAS CREWS: render a master card with crew sub-cards ===
// Count total entries across all crews
let totalEntries = 0;
crews.forEach(crew => {
totalEntries += getCrewWorkEntries(contractor.id, crew.id).length;
});
const hasAnyWork = !activity.noWork || totalEntries > 0;
const isExpanded = hasAnyWork || !activity.noWork;
const headerText = `${contractor.name.toUpperCase()} – ${typeLabel}${tradesText}`;

let subtitleText = 'Tap to add work';
if (activity.noWork && totalEntries === 0) {
subtitleText = `No work performed (${crews.length} crew${crews.length > 1 ? 's' : ''})`;
} else if (totalEntries > 0) {
subtitleText = `${totalEntries} note${totalEntries === 1 ? '' : 's'} across ${crews.length} crew${crews.length > 1 ? 's' : ''}`;
} else {
subtitleText = `${crews.length} crew${crews.length > 1 ? 's' : ''} — tap to add work`;
}

// Build crew sub-cards
const crewCardsHtml = crews.map(crew => {
const crewSection = `work_${contractor.id}_crew_${crew.id}`;
const crewEntries = getCrewWorkEntries(contractor.id, crew.id);
// Each crew gets its own noWork tracking via activities
const crewActivity = IS.report.activities?.find(a => a.contractorId === contractor.id && a.crewId === crew.id);
const crewNoWork = crewActivity?.noWork ?? false;
const crewHasWork = !crewNoWork || crewEntries.length > 0;
const crewEntriesHtml = buildEntriesHtml(crewEntries);

return `
<div class="crew-work-card border border-slate-200 rounded-lg overflow-hidden ml-2 ${crewHasWork ? 'border-l-4 ' + borderColor.replace('border-', 'border-l-') : ''}">
<div class="p-2 bg-slate-50 flex items-center gap-2">
<i class="fas fa-users text-slate-400 text-xs"></i>
<span class="text-xs font-bold ${crewHasWork ? textColor : 'text-slate-500'} uppercase flex-1">${escapeHtml(crew.name)}</span>
<label class="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
<input type="checkbox" id="no-work-crew-${contractor.id}-${crew.id}" ${crewNoWork ? 'checked' : ''} onchange="toggleCrewNoWork('${contractor.id}', '${crew.id}', this.checked)" class="w-3.5 h-3.5 accent-slate-600">
<span>No work</span>
</label>
</div>
<div id="crew-work-fields-${contractor.id}-${crew.id}" class="${crewNoWork ? 'hidden' : ''} p-2 space-y-2">
${crewEntriesHtml ? `<div class="space-y-2">${crewEntriesHtml}</div>` : ''}
<div class="flex items-start gap-2">
<textarea id="work-input-${contractor.id}-crew-${crew.id}" class="flex-1 bg-white border-2 border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-${contractor.type === 'prime' ? 'safety-green' : 'dot-blue'} rounded auto-expand" rows="2" placeholder="Describe ${escapeHtml(crew.name)} work..."></textarea>
<button onclick="addContractorWorkEntry('${contractor.id}', '${crew.id}')" class="px-4 py-2 ${bgColor} hover:opacity-90 text-white font-bold rounded transition-colors"><i class="fas fa-plus"></i></button>
</div>
</div>
</div>
`;
}).join('');

cardsHtml += `
<div class="contractor-work-card border-2 ${hasAnyWork ? borderColor : 'border-slate-200'} rounded-lg overflow-hidden" data-contractor-id="${contractor.id}">
<button onclick="toggleContractorCard('${contractor.id}')" class="w-full p-3 flex items-center gap-3 text-left ${hasAnyWork ? bgColor + '/10' : 'bg-slate-50'}">
<div class="w-8 h-8 ${hasAnyWork ? bgColor : 'bg-slate-300'} rounded flex items-center justify-center shrink-0">
<i class="fas ${hasAnyWork ? 'fa-hard-hat' : 'fa-minus'} text-white text-sm"></i>
</div>
<div class="flex-1 min-w-0">
<p class="text-xs font-bold ${hasAnyWork ? textColor : 'text-slate-500'} uppercase leading-tight truncate">${escapeHtml(headerText)}</p>
<p class="text-[10px] text-slate-500 mt-0.5">${subtitleText}</p>
</div>
<i id="contractor-chevron-${contractor.id}" class="fas fa-chevron-down text-slate-400 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}"></i>
</button>
<div id="contractor-content-${contractor.id}" class="contractor-content ${isExpanded ? '' : 'hidden'} border-t border-slate-200 p-3 space-y-3">
<!-- Master No Work Toggle for entire contractor -->
<label class="flex items-center gap-3 p-3 bg-slate-100 border border-slate-300 rounded cursor-pointer hover:bg-slate-200 transition-colors">
<input type="checkbox" id="no-work-${contractor.id}" ${activity.noWork ? 'checked' : ''} onchange="toggleNoWork('${contractor.id}', this.checked)" class="w-5 h-5 accent-slate-600">
<span class="text-sm font-medium text-slate-600">No work performed on ${todayDate} (all crews)</span>
</label>
<div id="work-fields-${contractor.id}" class="${activity.noWork ? 'hidden' : ''} space-y-3">
${crewCardsHtml}
</div>
</div>
</div>
`;
}
});

container.innerHTML = cardsHtml;

// Initialize auto-expand for dynamically created textareas
initAllAutoExpandTextareas();

// v6.9: Initialize auto-save for contractor AND crew work entry textareas
IS.projectContractors.forEach(contractor => {
const crews = contractor.crews || [];
if (crews.length === 0) {
initContractorWorkAutoSave(contractor.id);
} else {
crews.forEach(crew => {
initContractorWorkAutoSave(contractor.id, crew.id);
});
}
});
}

/**
 * Toggle contractor card expand/collapse
 */
function toggleContractorCard(contractorId) {
const content = document.getElementById(`contractor-content-${contractorId}`);
const chevron = document.getElementById(`contractor-chevron-${contractorId}`);

if (content.classList.contains('hidden')) {
content.classList.remove('hidden');
chevron.classList.add('rotate-180');
} else {
content.classList.add('hidden');
chevron.classList.remove('rotate-180');
}
}

/**
 * v6.6: Toggle "no work performed" for a contractor
 */
function toggleNoWork(contractorId, isNoWork) {
const activity = IS.report.activities.find(a => a.contractorId === contractorId);
if (!activity) return;

activity.noWork = isNoWork;

const workFields = document.getElementById(`work-fields-${contractorId}`);
if (isNoWork) {
workFields?.classList.add('hidden');
} else {
workFields?.classList.remove('hidden');
// Focus the input field
setTimeout(() => {
document.getElementById(`work-input-${contractorId}`)?.focus();
}, 100);
}

saveReport();
renderContractorWorkCards();
updateAllPreviews();
}

/**
 * v6.9: Toggle "no work performed" for a specific crew
 */
function toggleCrewNoWork(contractorId, crewId, isNoWork) {
if (!IS.report.activities) IS.report.activities = [];

// Find or create crew-specific activity entry
let crewActivity = IS.report.activities.find(a => a.contractorId === contractorId && a.crewId === crewId);
if (!crewActivity) {
crewActivity = { contractorId, crewId, noWork: false };
IS.report.activities.push(crewActivity);
}
crewActivity.noWork = isNoWork;

const crewWorkFields = document.getElementById(`crew-work-fields-${contractorId}-${crewId}`);
if (isNoWork) {
crewWorkFields?.classList.add('hidden');
} else {
crewWorkFields?.classList.remove('hidden');
setTimeout(() => {
document.getElementById(`work-input-${contractorId}-crew-${crewId}`)?.focus();
}, 100);
}

saveReport();
renderContractorWorkCards();
updateAllPreviews();
}

/**
 * v6.6: Get work entries for a specific contractor
 * @param {string} contractorId - The contractor ID
 * @returns {Array} Array of entry objects for this contractor
 */
function getContractorWorkEntries(contractorId) {
return getEntriesForSection(`work_${contractorId}`);
}

/**
 * v6.9: Get work entries for a specific crew
 * @param {string} contractorId - The contractor ID
 * @param {string} crewId - The crew ID
 * @returns {Array} Array of entry objects for this crew
 */
function getCrewWorkEntries(contractorId, crewId) {
return getEntriesForSection(`work_${contractorId}_crew_${crewId}`);
}

/**
 * v6.6: Add a work entry for a specific contractor
 * v6.9: Also supports crew-level entries via optional crewId
 * @param {string} contractorId - The contractor ID
 * @param {string} [crewId] - Optional crew ID for crew-level entries
 */
function addContractorWorkEntry(contractorId, crewId) {
const inputId = crewId ? `work-input-${contractorId}-crew-${crewId}` : `work-input-${contractorId}`;
const input = document.getElementById(inputId);
if (!input) return;

const text = input.value.trim();
if (!text) return;

const stateKey = crewId ? `work_${contractorId}_crew_${crewId}` : `work_${contractorId}`;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState[stateKey]?.saved) {
input.value = '';
delete IS.autoSaveState[stateKey];  // Clear state for next entry
renderContractorWorkCards();
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry(stateKey, text);
input.value = '';
renderContractorWorkCards();
updateAllPreviews();
updateProgress();
}

/**
 * v6.6: Delete a contractor work entry
 * @param {string} entryId - The entry ID to delete
 */
function deleteContractorWorkEntry(entryId) {
deleteEntryById(entryId);
renderContractorWorkCards();
updateAllPreviews();
updateProgress();
}

/**
 * v6.6/v6.9: Update the activities section preview based on contractor work
 * Format: "X contractors, Y no work" or "Tap to add"
 */
function updateActivitiesPreview() {
const preview = document.getElementById('activities-preview');
const status = document.getElementById('activities-status');

if (!IS.projectContractors || IS.projectContractors.length === 0) {
preview.textContent = 'No contractors configured';
status.innerHTML = '<i class="fas fa-chevron-down text-slate-400 text-xs"></i>';
return;
}

// Count contractors with work logged (including crew-level entries)
let withWork = 0;
let noWork = 0;

IS.projectContractors.forEach(contractor => {
const activity = getContractorActivity(contractor.id);
const crews = contractor.crews || [];

if (crews.length === 0) {
// No crews: check contractor-level entries
const entries = getContractorWorkEntries(contractor.id);
if (activity?.noWork && entries.length === 0) {
noWork++;
} else if (entries.length > 0 || !activity?.noWork) {
withWork++;
}
} else {
// Has crews: check across all crews
let crewsWithWork = 0;
crews.forEach(crew => {
const crewEntries = getCrewWorkEntries(contractor.id, crew.id);
if (crewEntries.length > 0) crewsWithWork++;
});
if (activity?.noWork && crewsWithWork === 0) {
noWork++;
} else if (crewsWithWork > 0 || !activity?.noWork) {
withWork++;
}
}
});

if (withWork > 0 || noWork > 0) {
const parts = [];
if (withWork > 0) parts.push(`${withWork} with work`);
if (noWork > 0) parts.push(`${noWork} no work`);
preview.textContent = parts.join(', ');
status.innerHTML = '<i class="fas fa-check text-safety-green text-xs"></i>';
} else {
preview.textContent = 'Tap to add';
status.innerHTML = '<i class="fas fa-chevron-down text-slate-400 text-xs"></i>';
}
}


// ============================================================
// Personnel and operations (was personnel.js)
// ============================================================

function getTradeAbbreviation(trades) {
if (!trades) return '';
// Common trade abbreviations
const abbreviations = {
'pile driving': 'PLE',
'piling': 'PLE',
'concrete': 'CONC',
'concrete pvmt': 'CONC',
'asphalt': 'ASP',
'utilities': 'UTL',
'earthwork': 'ERTHWRK',
'grading': 'GRAD',
'demolition': 'DEMO',
'demo': 'DEMO',
'electrical': 'ELEC',
'plumbing': 'PLMB',
'mechanical': 'MECH',
'structural': 'STRUC',
'steel': 'STL',
'masonry': 'MASN',
'roofing': 'ROOF',
'painting': 'PAINT',
'landscaping': 'LNDSCP',
'survey': 'SURV',
'surveying': 'SURV',
'traffic': 'TRAF',
'signage': 'SIGN',
'drainage': 'DRAIN',
'cm/pm': 'CM/PM',
'general': 'GEN'
};

// Split by semicolon and abbreviate each trade
return trades.split(';').map(trade => {
const trimmed = trade.trim().toLowerCase();
// Check if we have a known abbreviation
for (const [key, abbr] of Object.entries(abbreviations)) {
if (trimmed.includes(key)) {
return abbr;
}
}
// If no match, use first 4 chars uppercase
return trimmed.substring(0, 4).toUpperCase();
}).join('; ');
}

function getContractorOperations(contractorId) {
if (!IS.report || !IS.report.operations) return null;
return IS.report.operations.find(o => o.contractorId === contractorId);
}

function initializeOperations() {
if (!IS.report.operations) IS.report.operations = [];

// Ensure each contractor has an operations entry
IS.projectContractors.forEach(contractor => {
const existing = IS.report.operations.find(o => o.contractorId === contractor.id);
if (!existing) {
IS.report.operations.push({
contractorId: contractor.id,
superintendents: null,
foremen: null,
operators: null,
laborers: null,
surveyors: null,
others: null
});
}
});
}

function renderPersonnelCards() {
const container = document.getElementById('personnel-list');
const warningEl = document.getElementById('no-project-warning-ops');
const totalsEl = document.getElementById('personnel-totals');

if (!IS.activeProject || IS.projectContractors.length === 0) {
warningEl.classList.remove('hidden');
totalsEl.classList.add('hidden');
container.innerHTML = '';
return;
}

warningEl.classList.add('hidden');
totalsEl.classList.remove('hidden');
initializeOperations();

container.innerHTML = IS.projectContractors.map((contractor) => {
const ops = getContractorOperations(contractor.id) || {
superintendents: null, foremen: null, operators: null,
laborers: null, surveyors: null, others: null
};
const typeLabel = contractor.type === 'prime' ? 'PRIME' : 'SUB';
const borderColor = contractor.type === 'prime' ? 'border-l-safety-green' : 'border-l-dot-blue';
const headerBg = contractor.type === 'prime' ? 'bg-safety-green/10' : 'bg-dot-blue/10';
const titleColor = contractor.type === 'prime' ? 'text-safety-green' : 'text-dot-blue';

// Check if contractor has any personnel data
const hasData = (ops.superintendents > 0) || (ops.foremen > 0) || (ops.operators > 0) ||
(ops.laborers > 0) || (ops.surveyors > 0) || (ops.others > 0);
const totalPersonnel = (ops.superintendents || 0) + (ops.foremen || 0) + (ops.operators || 0) +
(ops.laborers || 0) + (ops.surveyors || 0) + (ops.others || 0);
const summaryText = hasData ? `${totalPersonnel} personnel` : 'Tap to add';

return `
<div class="personnel-card bg-white border-2 ${hasData ? borderColor.replace('border-l-', 'border-') : 'border-slate-200'} ${borderColor} border-l-4" data-ops-contractor-id="${contractor.id}">
<!-- Card Header - Tap to expand -->
<button onclick="togglePersonnelCard('${contractor.id}')" class="w-full p-3 flex items-center gap-3 text-left ${hasData ? headerBg : 'bg-slate-50'}">
<div class="flex-1 min-w-0">
<div class="flex items-center gap-2">
<span class="text-lg font-bold ${hasData ? titleColor : 'text-slate-600'}">${escapeHtml(contractor.abbreviation)}</span>
<span class="text-[10px] font-medium text-slate-400 uppercase">${typeLabel}</span>
</div>
<p class="text-xs text-slate-500 truncate">${escapeHtml(contractor.name)}${contractor.trades ? ' • ' + escapeHtml(contractor.trades) : ''}</p>
<p class="text-[10px] ${hasData ? titleColor : 'text-slate-400'} mt-1">${summaryText}</p>
</div>
<i id="personnel-chevron-${contractor.id}" class="fas fa-chevron-down personnel-card-chevron text-slate-400 text-xs"></i>
</button>

<!-- Expandable Content -->
<div class="personnel-card-content">
<div class="p-3 border-t border-slate-200 bg-slate-50/50">
<!-- 2-column, 3-row grid for role inputs -->
<div class="grid grid-cols-2 gap-3">
<!-- Row 1: Superintendent, Foreman -->
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Superintendent</label>
<input type="number" min="0" max="99"
id="ops-supt-${contractor.id}"
value="${ops.superintendents || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Foreman</label>
<input type="number" min="0" max="99"
id="ops-frmn-${contractor.id}"
value="${ops.foremen || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
<!-- Row 2: Operator, Laborer -->
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Operator</label>
<input type="number" min="0" max="99"
id="ops-oper-${contractor.id}"
value="${ops.operators || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Laborer</label>
<input type="number" min="0" max="99"
id="ops-labr-${contractor.id}"
value="${ops.laborers || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
<!-- Row 3: Surveyor, Other -->
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Surveyor</label>
<input type="number" min="0" max="99"
id="ops-surv-${contractor.id}"
value="${ops.surveyors || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
<div>
<label class="text-xs font-bold text-slate-500 uppercase block mb-1">Other</label>
<input type="number" min="0" max="99"
id="ops-othr-${contractor.id}"
value="${ops.others || ''}"
onchange="updateOperations('${contractor.id}')"
class="w-full h-10 text-center text-base font-medium border-2 border-slate-300 focus:border-dot-blue focus:outline-none bg-white"
placeholder="0">
</div>
</div>
</div>
</div>
</div>
`;
}).join('');

updatePersonnelTotals();
}

function togglePersonnelCard(contractorId) {
const card = document.querySelector(`[data-ops-contractor-id="${contractorId}"]`);
if (!card) return;

card.classList.toggle('expanded');
}

function updateOperations(contractorId) {
const ops = IS.report.operations.find(o => o.contractorId === contractorId);
if (!ops) return;

const getValue = (id) => {
const input = document.getElementById(id);
if (!input) return null;
const val = parseInt(input.value);
return isNaN(val) ? null : val;
};

ops.superintendents = getValue(`ops-supt-${contractorId}`);
ops.foremen = getValue(`ops-frmn-${contractorId}`);
ops.operators = getValue(`ops-oper-${contractorId}`);
ops.laborers = getValue(`ops-labr-${contractorId}`);
ops.surveyors = getValue(`ops-surv-${contractorId}`);
ops.others = getValue(`ops-othr-${contractorId}`);

saveReport();
updatePersonnelTotals();
updatePersonnelCardStyle(contractorId);
updateAllPreviews();
}

function updatePersonnelCardStyle(contractorId) {
const ops = IS.report.operations.find(o => o.contractorId === contractorId);
const contractor = IS.projectContractors.find(c => c.id === contractorId);
if (!ops || !contractor) return;

const card = document.querySelector(`[data-ops-contractor-id="${contractorId}"]`);
if (!card) return;

const hasData = (ops.superintendents > 0) || (ops.foremen > 0) || (ops.operators > 0) ||
(ops.laborers > 0) || (ops.surveyors > 0) || (ops.others > 0);
const totalPersonnel = (ops.superintendents || 0) + (ops.foremen || 0) + (ops.operators || 0) +
(ops.laborers || 0) + (ops.surveyors || 0) + (ops.others || 0);

const borderColor = contractor.type === 'prime' ? 'border-safety-green' : 'border-dot-blue';
const headerBg = contractor.type === 'prime' ? 'bg-safety-green/10' : 'bg-dot-blue/10';
const titleColor = contractor.type === 'prime' ? 'text-safety-green' : 'text-dot-blue';

// Update card border
card.classList.remove('border-slate-200', 'border-safety-green', 'border-dot-blue');
card.classList.add(hasData ? borderColor : 'border-slate-200');

// Update header
const header = card.querySelector('button');
header.classList.remove('bg-slate-50', 'bg-safety-green/10', 'bg-dot-blue/10');
header.classList.add(hasData ? headerBg : 'bg-slate-50');

// Update abbreviation color
const abbr = header.querySelector('span.text-lg');
if (abbr) {
abbr.classList.remove('text-slate-600', 'text-safety-green', 'text-dot-blue');
abbr.classList.add(hasData ? titleColor : 'text-slate-600');
}

// Update summary text
const summaryP = header.querySelector('p.text-\\[10px\\]');
if (summaryP) {
summaryP.textContent = hasData ? `${totalPersonnel} personnel` : 'Tap to add';
summaryP.classList.remove('text-slate-400', 'text-safety-green', 'text-dot-blue');
summaryP.classList.add(hasData ? titleColor : 'text-slate-400');
}
}

function updatePersonnelTotals() {
if (!IS.report || !IS.report.operations) return;

let totals = {
superintendents: 0,
foremen: 0,
operators: 0,
laborers: 0,
surveyors: 0,
others: 0
};

IS.report.operations.forEach(ops => {
totals.superintendents += ops.superintendents || 0;
totals.foremen += ops.foremen || 0;
totals.operators += ops.operators || 0;
totals.laborers += ops.laborers || 0;
totals.surveyors += ops.surveyors || 0;
totals.others += ops.others || 0;
});

const grandTotal = totals.superintendents + totals.foremen + totals.operators +
totals.laborers + totals.surveyors + totals.others;

// Update the personnel total count element (v6 simplified UI)
const grandTotalEl = document.getElementById('personnel-total-count');
if (grandTotalEl) {
grandTotalEl.textContent = grandTotal || '0';
}
}

function hasOperationsData() {
if (!IS.report || !IS.report.operations) return false;
return IS.report.operations.some(ops =>
(ops.superintendents !== null && ops.superintendents > 0) ||
(ops.foremen !== null && ops.foremen > 0) ||
(ops.operators !== null && ops.operators > 0) ||
(ops.laborers !== null && ops.laborers > 0) ||
(ops.surveyors !== null && ops.surveyors > 0) ||
(ops.others !== null && ops.others > 0)
);
}

/**
 * Get total personnel count across all contractors
 * @returns {number} Total personnel count
 */
function getTotalPersonnelCount() {
if (!IS.report || !IS.report.operations) return 0;
let total = 0;
IS.report.operations.forEach(ops => {
total += (ops.superintendents || 0) + (ops.foremen || 0) +
(ops.operators || 0) + (ops.laborers || 0) +
(ops.surveyors || 0) + (ops.others || 0);
});
return total;
}
