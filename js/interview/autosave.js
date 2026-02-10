// ============================================================
// AUTO-SAVE FUNCTIONALITY
// Handles auto-save on typing for guided sections and contractor work
// Also manages localStorage and Supabase backup persistence
// ============================================================

var IS = window.interviewState;

// File-local variables for debouncing and backup management
let localSaveTimeout = null;
let _interviewBackupDirty = false;
let _interviewBackupTimer = null;

// Track active auto-save sessions to prevent duplicates
var guidedAutoSaveSessions = {};

/**
 * Initialize auto-save on typing for guided section textareas
 * Creates entry on first keystroke, updates on subsequent keystrokes
 * @param {string} textareaId - The textarea element ID
 * @param {string} section - The section identifier (e.g., 'communications', 'qaqc')
 */
function initGuidedAutoSave(textareaId, section) {
const textarea = document.getElementById(textareaId);
if (!textarea) return;

// Prevent duplicate initialization
if (textarea.dataset.autoSaveInit === 'true') return;
textarea.dataset.autoSaveInit = 'true';

let currentEntryId = null;
let saveTimeout = null;

textarea.addEventListener('input', () => {
if (saveTimeout) clearTimeout(saveTimeout);

saveTimeout = setTimeout(() => {
const text = textarea.value.trim();
if (!text) return;

if (!currentEntryId) {
// Create new entry on first meaningful keystroke
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);
currentEntryId = entry.id;

saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Created guided entry:', section, currentEntryId);
} else {
// Update existing entry
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry) {
entry.content = text;
saveReport();
// Keep shared state updated
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Updated guided entry:', section, currentEntryId);
}
}
}, 500);
});

// Save on blur as safety net
textarea.addEventListener('blur', () => {
if (saveTimeout) clearTimeout(saveTimeout);
const text = textarea.value.trim();
if (text && currentEntryId) {
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry && entry.content !== text) {
entry.content = text;
saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Guided entry saved on blur:', section, currentEntryId);
}
}
});

// Store session for potential cleanup
guidedAutoSaveSessions[textareaId] = { section, currentEntryId };
}

/**
 * Initialize auto-save for contractor work entry textareas
 * v6.9: Also supports crew-level textareas via optional crewId
 * @param {string} contractorId - The contractor ID
 * @param {string} [crewId] - Optional crew ID for crew-level entries
 */
function initContractorWorkAutoSave(contractorId, crewId) {
const textareaId = crewId ? `work-input-${contractorId}-crew-${crewId}` : `work-input-${contractorId}`;
const section = crewId ? `work_${contractorId}_crew_${crewId}` : `work_${contractorId}`;

const textarea = document.getElementById(textareaId);
if (!textarea) return;

// Prevent duplicate initialization
if (textarea.dataset.autoSaveInit === 'true') return;
textarea.dataset.autoSaveInit = 'true';

let currentEntryId = null;
let saveTimeout = null;

textarea.addEventListener('input', () => {
if (saveTimeout) clearTimeout(saveTimeout);

saveTimeout = setTimeout(() => {
const text = textarea.value.trim();
if (!text) return;

if (!currentEntryId) {
// Create new entry on first meaningful keystroke
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);
currentEntryId = entry.id;

saveReport();
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Created contractor work entry:', contractorId, crewId || '', currentEntryId);
} else {
// Update existing entry
const entry = IS.report.entries?.find(e => e.id === currentEntryId);
if (entry) {
entry.content = text;
saveReport();
// Keep shared state updated
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Updated contractor work entry:', contractorId, crewId || '', currentEntryId);
}
}
}, 500);
});

// Save on blur as safety net
textarea.addEventListener('blur', () => {
if (saveTimeout) clearTimeout(saveTimeout);
const text = textarea.value.trim();
if (text && !currentEntryId) {
// Create entry if there's text but no entry yet
const entry = {
id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
section: section,
content: text,
timestamp: new Date().toISOString(),
entry_order: getNextEntryOrder(section),
is_deleted: false
};

if (!IS.report.entries) IS.report.entries = [];
IS.report.entries.push(entry);

saveReport();
currentEntryId = entry.id;  // Track for subsequent updates
// Track in shared state so "+" button knows entry exists
IS.autoSaveState[section] = { entryId: currentEntryId, saved: true };
console.log('[AUTOSAVE] Contractor work entry saved on blur:', contractorId, crewId || '');
}
});
}

/**
 * Initialize all guided section auto-save listeners
 * Called after sections are rendered
 */
function initAllGuidedAutoSave() {
// Init if toggle is Yes OR not yet answered (textarea visible in both cases)
// Only skip if toggle is explicitly No (false)
if (getToggleState('communications_made') !== false) {
initGuidedAutoSave('communications-input', 'communications');
}
if (getToggleState('qaqc_performed') !== false) {
initGuidedAutoSave('qaqc-input', 'qaqc');
}
if (getToggleState('visitors_present') !== false) {
initGuidedAutoSave('visitors-input', 'visitors');
}
// Issues and Safety don't have toggles - always visible
initGuidedAutoSave('issue-input', 'issues');
initGuidedAutoSave('safety-input', 'safety');
}

function saveReport() {
// Update local UI immediately
updateAllPreviews();
updateProgress();

// Debounce save to localStorage
if (localSaveTimeout) {
clearTimeout(localSaveTimeout);
}
localSaveTimeout = setTimeout(() => {
saveToLocalStorage();
}, 500); // 500ms debounce for localStorage

// Also mark Supabase backup as dirty (separate 5s debounce)
markInterviewBackupDirty();
}

function markInterviewBackupDirty() {
_interviewBackupDirty = true;
if (_interviewBackupTimer) clearTimeout(_interviewBackupTimer);
_interviewBackupTimer = setTimeout(flushInterviewBackup, 5000); // 5s debounce
}

function buildInterviewPageState() {
return {
captureMode: IS.report.meta?.captureMode || 'guided',
freeform_entries: IS.report.freeform_entries || [],
fieldNotes: IS.report.fieldNotes || {},
guidedNotes: IS.report.guidedNotes || {},
activities: IS.report.activities || [],
operations: IS.report.operations || [],
equipment: IS.report.equipment || [],
equipmentRows: IS.report.equipmentRows || [],
overview: IS.report.overview || {},
safety: IS.report.safety || {},
generalIssues: IS.report.generalIssues || [],
toggleStates: IS.report.toggleStates || {},
entries: IS.report.entries || [],
savedAt: new Date().toISOString()
};
}

function flushInterviewBackup() {
if (!_interviewBackupDirty || !IS.currentReportId) return;
_interviewBackupDirty = false;

const pageState = buildInterviewPageState();

// Fire and forget — do NOT await, do NOT block UI
supabaseClient
.from('interview_backup')
.upsert({
report_id: IS.currentReportId,
page_state: pageState,
updated_at: new Date().toISOString()
}, { onConflict: 'report_id' })
.then(({ error }) => {
if (error) console.warn('[BACKUP] Interview backup failed:', error.message);
else console.log('[BACKUP] Interview backup saved');
});
}
