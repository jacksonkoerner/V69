// Personnel and operations tracking
var IS = window.interviewState;

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
