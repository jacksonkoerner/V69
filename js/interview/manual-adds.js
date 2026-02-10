// ============================================================
// MANUAL ADD FUNCTIONS
// Functions for manually adding entries via "+" buttons
// Works with auto-save system - reuses entries if already created
// ============================================================

var IS = window.interviewState;

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
