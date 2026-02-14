// ============================================================
// js/interview/equipment-manual.js — Equipment + Manual adds
// Sprint 11: Consolidated from equipment.js, manual-adds.js
// ============================================================

var IS = window.interviewState;

/**
 * v6.6: Render structured equipment rows
 */
function renderEquipmentSection() {
const container = document.getElementById('equipment-rows-list');
if (!container) return;

const rows = IS.report.equipmentRows || [];

// Build contractor options HTML
const contractorOptions = `
<option value="">-- Select Contractor --</option>
${IS.projectContractors.map(c => `
<option value="${c.id}">${escapeHtml(c.name)} (${c.type === 'prime' ? 'Prime' : 'Sub'})</option>
`).join('')}
`;

if (rows.length === 0) {
container.innerHTML = `
<p class="text-sm text-slate-400 text-center py-4">No equipment added yet. Click "+ Add Equipment" below.</p>
`;
return;
}

container.innerHTML = rows.map(row => {
// Build contractor options with correct selection
const contractorOptionsWithSelection = contractorOptions.replace(
`value="${row.contractorId}"`,
`value="${row.contractorId}" selected`
);

return `
<div class="equipment-row bg-orange-50 border border-orange-200 p-3 rounded" data-equipment-id="${row.id}">
<!-- Mobile: Stack vertically, Desktop: Grid -->
<div class="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center">
<!-- Contractor Dropdown -->
<select class="w-full sm:col-span-3 text-xs border border-slate-300 rounded px-2 py-2 bg-white"
onchange="updateEquipmentRow('${row.id}', 'contractorId', this.value)">
${contractorOptionsWithSelection}
</select>

<!-- Type/Model -->
<input type="text"
class="w-full sm:col-span-4 text-xs border border-slate-300 rounded px-2 py-2"
placeholder="Equipment type/model"
value="${escapeHtml(row.type || '')}"
onchange="updateEquipmentRow('${row.id}', 'type', this.value)">

<!-- Qty + Status + Delete row on mobile -->
<div class="flex gap-2 sm:contents">
<!-- Qty -->
<input type="number"
class="w-20 sm:w-full sm:col-span-2 text-xs border border-slate-300 rounded px-2 py-2 text-center"
placeholder="Qty" min="1" value="${row.qty || 1}"
onchange="updateEquipmentRow('${row.id}', 'qty', parseInt(this.value) || 1)">

<!-- Status Dropdown -->
<select class="flex-1 sm:flex-none sm:col-span-2 text-xs border border-slate-300 rounded px-2 py-2 bg-white"
onchange="updateEquipmentRow('${row.id}', 'status', this.value)">
<option value="Idle" ${row.status === 'Idle' ? 'selected' : ''}>Idle</option>
<option value="1hr" ${row.status === '1hr' ? 'selected' : ''}>1hr</option>
<option value="2hr" ${row.status === '2hr' ? 'selected' : ''}>2hr</option>
<option value="3hr" ${row.status === '3hr' ? 'selected' : ''}>3hr</option>
<option value="4hr" ${row.status === '4hr' ? 'selected' : ''}>4hr</option>
<option value="5hr" ${row.status === '5hr' ? 'selected' : ''}>5hr</option>
<option value="6hr" ${row.status === '6hr' ? 'selected' : ''}>6hr</option>
<option value="7hr" ${row.status === '7hr' ? 'selected' : ''}>7hr</option>
<option value="8hr" ${row.status === '8hr' ? 'selected' : ''}>8hr</option>
<option value="9hr" ${row.status === '9hr' ? 'selected' : ''}>9hr</option>
<option value="10hr" ${row.status === '10hr' ? 'selected' : ''}>10hr</option>
</select>

<!-- Delete -->
<button onclick="deleteEquipmentRow('${row.id}')"
class="px-3 py-2 sm:col-span-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
</div>
`;
}).join('');
}

/**
 * v6.6: Add a new equipment row
 */
function addEquipmentRow() {
const row = {
id: `eq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
contractorId: '',
type: '',
qty: 1,
status: 'Idle',
timestamp: new Date().toISOString()
};
if (!IS.report.equipmentRows) IS.report.equipmentRows = [];
IS.report.equipmentRows.push(row);
saveReport();
renderEquipmentSection();
updateEquipmentPreview();
updateProgress();
}

/**
 * v6.6: Update a field in an equipment row
 */
function updateEquipmentRow(rowId, field, value) {
const row = IS.report.equipmentRows?.find(r => r.id === rowId);
if (!row) return;
row[field] = value;
saveReport();
updateEquipmentPreview();
}

/**
 * v6.6: Delete an equipment row
 */
function deleteEquipmentRow(rowId) {
if (!IS.report.equipmentRows) return;
IS.report.equipmentRows = IS.report.equipmentRows.filter(r => r.id !== rowId);
saveReport();
renderEquipmentSection();
updateEquipmentPreview();
updateProgress();
}

/**
 * v6.6: Update equipment preview text based on row count
 */
function updateEquipmentPreview() {
const preview = document.getElementById('equipment-preview');
if (!preview) return;
const count = (IS.report.equipmentRows || []).length;
preview.textContent = count > 0 ? `${count} equipment logged` : 'Tap to add';
}

/**
 * v6.6: Check if equipment data exists
 */
function hasEquipmentData() {
return (IS.report.equipmentRows || []).length > 0;
}


// ============================================================
// Manual add functions (was manual-adds.js)
// ============================================================

function addIssue() {
const input = document.getElementById('issue-input');
const text = input.value.trim();
if (!text) return;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState['issues']?.saved) {
input.value = '';
delete IS.autoSaveState['issues'];  // Clear state for next entry
renderSection('issues');
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry('issues', text);
renderSection('issues');
input.value = '';
updateAllPreviews();
updateProgress();
}

function removeIssue(index) {
// Legacy function for backward compatibility with old array-based issues
if (IS.report.generalIssues && IS.report.generalIssues[index] !== undefined) {
IS.report.generalIssues.splice(index, 1);
saveReport();
renderSection('issues');
updateAllPreviews();
updateProgress();
}
}

function removeInspection(index) { IS.report.qaqcNotes.splice(index, 1); saveReport(); renderSection('inspections'); }

function addSafetyNote() {
const input = document.getElementById('safety-input');
const text = input.value.trim();
if (!text) return;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState['safety']?.saved) {
input.value = '';
delete IS.autoSaveState['safety'];  // Clear state for next entry
renderSection('safety');
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry('safety', text);
renderSection('safety');
input.value = '';
updateAllPreviews();
updateProgress();
}

function removeSafetyNote(index) {
// Legacy function for backward compatibility with old array-based notes
if (IS.report.safety?.notes && IS.report.safety.notes[index] !== undefined) {
IS.report.safety.notes.splice(index, 1);
saveReport();
renderSection('safety');
updateAllPreviews();
updateProgress();
}
}

function addCommunication() {
const input = document.getElementById('communications-input');
const text = input.value.trim();
if (!text) return;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState['communications']?.saved) {
input.value = '';
delete IS.autoSaveState['communications'];  // Clear state for next entry
renderSection('communications');
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry('communications', text);
renderSection('communications');
input.value = '';
updateAllPreviews();
updateProgress();
}

function addQAQC() {
const input = document.getElementById('qaqc-input');
const text = input.value.trim();
if (!text) return;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState['qaqc']?.saved) {
input.value = '';
delete IS.autoSaveState['qaqc'];  // Clear state for next entry
renderSection('qaqc');
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry('qaqc', text);
renderSection('qaqc');
input.value = '';
updateAllPreviews();
updateProgress();
}

function addVisitor() {
const input = document.getElementById('visitors-input');
const text = input.value.trim();
if (!text) return;

// If auto-save already created an entry for this content, just clear and render
if (IS.autoSaveState['visitors']?.saved) {
input.value = '';
delete IS.autoSaveState['visitors'];  // Clear state for next entry
renderSection('visitors');
updateAllPreviews();
updateProgress();
return;
}

// Otherwise create new entry (user clicked "+" before auto-save triggered)
createEntry('visitors', text);
renderSection('visitors');
input.value = '';
updateAllPreviews();
updateProgress();
}
