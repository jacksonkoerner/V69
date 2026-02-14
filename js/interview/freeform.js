// Freeform/minimal mode UI and functionality
var IS = window.interviewState;

/**
 * Checklist items for freeform mode (visual only, no functionality)
 */
const FREEFORM_CHECKLIST_ITEMS = [
'Weather', 'Work Performed', 'Contractors', 'Equipment', 'Issues',
'Communications', 'QA/QC', 'Safety', 'Visitors', 'Photos'
];

/**
 * Initialize the minimal mode UI
 */
function initMinimalModeUI() {
// Set date
const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
document.getElementById('minimalCurrentDate').textContent = dateStr;

// Migrate old freeformNotes string to entries array (one-time)
migrateFreeformNotesToEntries();

// Initialize freeform entries and checklist
initFreeformEntries();

// Update weather display
updateMinimalWeatherDisplay();

// Render photos
renderMinimalPhotos();

// Setup photo input handler
const photoInput = document.getElementById('minimalPhotoInput');
if (photoInput) {
photoInput.addEventListener('change', handleMinimalPhotoInput);
}
}

/**
 * Migrate old single-string freeformNotes to freeform_entries array
 */
function migrateFreeformNotesToEntries() {
// Check if there's old-style notes that need migration
const oldNotes = IS.report.fieldNotes?.freeformNotes;
if (oldNotes && oldNotes.trim() && (!IS.report.freeform_entries || IS.report.freeform_entries.length === 0)) {
// Create first entry from old notes
IS.report.freeform_entries = [{
id: crypto.randomUUID(),
content: oldNotes.trim(),
created_at: IS.report.meta?.createdAt || Date.now(),
updated_at: Date.now(),
synced: false
}];
// Clear old notes to prevent re-migration
IS.report.fieldNotes.freeformNotes = '';
saveReport();
console.log('[Freeform] Migrated old notes to entries array');
}
}

/**
 * Initialize freeform entries and checklist data structures
 */
function initFreeformEntries() {
if (!IS.report.freeform_entries) IS.report.freeform_entries = [];
if (!IS.report.freeform_checklist) {
IS.report.freeform_checklist = {};
FREEFORM_CHECKLIST_ITEMS.forEach(item => {
IS.report.freeform_checklist[item] = false;
});
}
renderFreeformEntries();
renderFreeformChecklist();
}

/**
 * Add a new freeform entry
 */
function addFreeformEntry() {
const entry = {
id: crypto.randomUUID(),
content: '',
created_at: Date.now(),
updated_at: Date.now(),
synced: false
};
IS.report.freeform_entries.push(entry);

renderFreeformEntries();
saveReport();
// Start editing the new entry immediately
startFreeformEdit(entry.id);
}

/**
 * Render all freeform entries in chronological order
 */
function renderFreeformEntries() {
const container = document.getElementById('freeformEntriesContainer');
const countEl = document.getElementById('freeformEntriesCount');
if (!container || !countEl) return;

const entries = IS.report.freeform_entries || [];

// Update count
countEl.textContent = entries.length === 0
? 'No entries yet'
: `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;

if (entries.length === 0) {
container.innerHTML = '<p class="text-slate-400 text-center py-4 text-sm">Tap "+ Add Entry" to start</p>';
return;
}

// Sort chronologically (oldest first)
const sorted = [...entries].sort((a, b) => a.created_at - b.created_at);

container.innerHTML = sorted.map(entry => {
const time = new Date(entry.created_at).toLocaleTimeString('en-US', {
hour: 'numeric',
minute: '2-digit'
});
const escapedContent = escapeHtml(entry.content);
const displayContent = escapedContent || '<span class="text-slate-400 italic">Empty entry</span>';

return `
<div class="freeform-entry border border-slate-200 rounded" data-freeform-entry-id="${entry.id}">
<div class="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
<span class="text-xs text-slate-500 font-medium">${time}</span>
<div class="flex items-center gap-3">
<button onclick="startFreeformEdit('${entry.id}')" class="freeform-edit-btn text-slate-400 hover:text-dot-blue p-1" title="Edit">
<i class="fas fa-pencil-alt text-xs"></i>
</button>
<button onclick="deleteFreeformEntry('${entry.id}')" class="text-slate-400 hover:text-red-500 p-1" title="Delete">
<i class="fas fa-trash text-xs"></i>
</button>
</div>
</div>
<div class="p-3">
<p class="freeform-entry-content whitespace-pre-wrap text-slate-700 text-sm">${displayContent}</p>
</div>
</div>
`;
}).join('');
}

/**
 * Start editing a freeform entry (inline edit pattern matching guided mode)
 */
function startFreeformEdit(entryId) {
const entry = IS.report.freeform_entries?.find(e => e.id === entryId);
if (!entry) return;

const entryDiv = document.querySelector(`[data-freeform-entry-id="${entryId}"]`);
if (!entryDiv) return;

const contentP = entryDiv.querySelector('.freeform-entry-content');
const editBtn = entryDiv.querySelector('.freeform-edit-btn');

if (contentP && editBtn) {
// Create textarea with current content
const textarea = document.createElement('textarea');
textarea.id = `freeform-edit-textarea-${entryId}`;
textarea.className = 'w-full text-sm text-slate-700 border border-slate-300 rounded p-2 bg-white focus:outline-none focus:border-dot-blue';
textarea.value = entry.content;
textarea.rows = 3;
textarea.placeholder = 'Enter your field notes...';

// v6.6: Auto-save on typing (debounced 500ms)
let freeformSaveTimeout = null;
textarea.addEventListener('input', () => {
if (freeformSaveTimeout) clearTimeout(freeformSaveTimeout);
freeformSaveTimeout = setTimeout(() => {
const entry = IS.report.freeform_entries?.find(e => e.id === entryId);
if (entry) {
entry.content = textarea.value.trim();
entry.updated_at = Date.now();
entry.synced = false;
saveReport();
console.log('[AUTOSAVE] Freeform entry saved:', entryId);
}
}, 500);
});

// v6.6: Also save on blur (safety net)
textarea.addEventListener('blur', () => {
if (freeformSaveTimeout) clearTimeout(freeformSaveTimeout);
const entry = IS.report.freeform_entries?.find(e => e.id === entryId);
if (entry) {
const newContent = textarea.value.trim();
if (newContent !== entry.content) {
entry.content = newContent;
entry.updated_at = Date.now();
entry.synced = false;
saveReport();
console.log('[AUTOSAVE] Freeform entry saved on blur:', entryId);
}
}
});

// Replace p with textarea
contentP.replaceWith(textarea);

// Auto-expand and focus
autoExpand(textarea);
textarea.focus();
textarea.setSelectionRange(textarea.value.length, textarea.value.length);

// Change edit button to save button (pencil → check)
editBtn.innerHTML = '<i class="fas fa-check text-xs"></i>';
editBtn.className = 'freeform-save-btn text-safety-green hover:text-green-700 p-1';
editBtn.title = 'Save';
editBtn.onclick = () => saveFreeformEdit(entryId);
}
}

/**
 * Save freeform entry edit
 */
function saveFreeformEdit(entryId) {
const textarea = document.getElementById(`freeform-edit-textarea-${entryId}`);
if (!textarea) return;

const newContent = textarea.value.trim();
const entry = IS.report.freeform_entries?.find(e => e.id === entryId);

if (entry) {
entry.content = newContent;
entry.updated_at = Date.now();
entry.synced = false;

saveReport();
}

renderFreeformEntries();
showToast('Entry saved', 'success');
}

/**
 * Delete a freeform entry
 */
function deleteFreeformEntry(entryId) {
if (!confirm('Delete this entry?')) return;

IS.report.freeform_entries = IS.report.freeform_entries.filter(e => e.id !== entryId);
saveReport();
renderFreeformEntries();
showToast('Entry deleted', 'success');
}

/**
 * Render the freeform checklist (visual only)
 */
function renderFreeformChecklist() {
const container = document.getElementById('freeformChecklist');
if (!container) return;

container.innerHTML = FREEFORM_CHECKLIST_ITEMS.map(item => {
const checked = IS.report.freeform_checklist?.[item] || false;
const checkedClass = checked ? 'bg-green-50 border-green-300' : 'bg-white';
return `
<label class="flex items-center gap-2 p-2 border border-slate-200 rounded cursor-pointer hover:bg-slate-50 transition-colors ${checkedClass}">
<input type="checkbox" ${checked ? 'checked' : ''}
onchange="toggleFreeformChecklistItem('${item}', this.checked)"
class="w-4 h-4 accent-safety-green rounded">
<span class="text-sm text-slate-700">${item}</span>
</label>
`;
}).join('');
}

/**
 * Toggle a freeform checklist item (visual only, no validation impact)
 */
function toggleFreeformChecklistItem(item, checked) {
if (!IS.report.freeform_checklist) IS.report.freeform_checklist = {};
IS.report.freeform_checklist[item] = checked;
renderFreeformChecklist();
saveReport();
}

/**
 * Update the weather display in minimal mode
 */
function updateMinimalWeatherDisplay() {
const weather = IS.report.overview?.weather;
if (!weather) return;

const conditionEl = document.getElementById('minimalWeatherCondition');
const tempEl = document.getElementById('minimalWeatherTemp');
const precipEl = document.getElementById('minimalWeatherPrecip');
const iconEl = document.getElementById('minimalWeatherIcon');

if (conditionEl) conditionEl.textContent = weather.generalCondition || '--';
if (tempEl) {
const high = weather.highTemp || '--';
const low = weather.lowTemp || '--';
tempEl.textContent = `${high}° / ${low}°`;
}
if (precipEl) precipEl.textContent = `Precip: ${weather.precipitation || '--'}`;

// Update icon based on condition
if (iconEl) {
const condition = (weather.generalCondition || '').toLowerCase();
let iconClass = 'fa-cloud-sun';
if (condition.includes('rain') || condition.includes('shower')) iconClass = 'fa-cloud-rain';
else if (condition.includes('cloud')) iconClass = 'fa-cloud';
else if (condition.includes('sun') || condition.includes('clear')) iconClass = 'fa-sun';
else if (condition.includes('snow')) iconClass = 'fa-snowflake';
else if (condition.includes('storm') || condition.includes('thunder')) iconClass = 'fa-bolt';
iconEl.className = `fas ${iconClass} text-white`;
}
}

/**
 * Render photos in minimal mode
 */
function renderMinimalPhotos() {
const grid = document.getElementById('minimalPhotosGrid');
const countEl = document.getElementById('minimalPhotosCount');

if (!grid) return;

const photos = IS.report.photos || [];
countEl.textContent = photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'No photos yet';

if (photos.length === 0) {
grid.innerHTML = '';
return;
}

grid.innerHTML = photos.map((p, idx) => {
    // Upload indicator
    const uploadStatus = p.uploadStatus || (p.storagePath ? 'uploaded' : 'pending');
    let uploadHtml = '';
    if (uploadStatus === 'uploading') {
        uploadHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg"><i class="fas fa-spinner fa-spin text-white text-xs"></i></div>`;
    } else if (uploadStatus === 'uploaded') {
        uploadHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg"><i class="fas fa-check text-white text-xs"></i></div>`;
    } else {
        uploadHtml = `<div id="upload-status-${p.id}" class="absolute top-2 left-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg" title="Will upload on submit"><i class="fas fa-cloud-arrow-up text-white text-xs"></i></div>`;
    }
    return `
<div class="border-2 border-slate-300 overflow-hidden bg-slate-100">
<div class="relative">
<img src="${p.url}" class="w-full aspect-square object-cover" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23cbd5e1%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%2364748b%22 font-size=%2212%22>Error</text></svg>';">
${uploadHtml}
<button onclick="deleteMinimalPhoto(${idx})" class="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white text-xs flex items-center justify-center shadow-lg"><i class="fas fa-times"></i></button>
<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-6">
<div class="flex items-center gap-1 text-white/90 mb-1">
<i class="fas fa-clock text-[8px]"></i>
<p class="text-[10px] font-medium">${p.date || ''} ${p.time || ''}</p>
</div>
${p.gps ? `
<div class="flex items-center gap-1 text-safety-green">
<i class="fas fa-map-marker-alt text-[8px]"></i>
<p class="text-[9px] font-mono">${p.gps.lat.toFixed(5)}, ${p.gps.lng.toFixed(5)}</p>
${p.gps.accuracy ? `<span class="text-[8px] text-white/60">(±${p.gps.accuracy}m)</span>` : ''}
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
class="w-full text-xs border border-slate-200 rounded p-2 bg-slate-50 focus:bg-white focus:border-dot-blue focus:outline-none resize-none"
placeholder="Add caption..."
maxlength="500"
rows="2"
oninput="updateMinimalPhotoCaption(${idx}, this.value)"
onblur="updateMinimalPhotoCaption(${idx}, this.value)"
></textarea>
</div>
</div>
`;
}).join('');

// Set caption values via DOM to prevent XSS
photos.forEach((p, idx) => {
    const ta = grid.querySelector(`textarea[oninput*="updateMinimalPhotoCaption(${idx}"]`);
    if (ta) ta.value = p.caption || '';
});
}

/**
 * Handle photo input in minimal mode
 * Saves to IndexedDB locally, uploads to Supabase on Submit
 */
async function handleMinimalPhotoInput(e) {
const files = e.target.files;
if (!files || files.length === 0) return;

for (const file of files) {
try {
showToast('Processing photo...', 'info');

// Get GPS if available (using multi-reading high accuracy)
let gps = null;
try {
gps = await getHighAccuracyGPS(true);
} catch (e) {
console.warn('[PHOTO] GPS failed:', e);
}

const photoId = crypto.randomUUID();
const now = new Date();

// Compress image
const rawDataUrl = await readFileAsDataURL(file);
const compressedDataUrl = await compressImage(rawDataUrl, 1200, 0.7);

// Open photo markup overlay for annotation
let finalDataUrl = compressedDataUrl;
if (typeof openPhotoMarkup === 'function') {
const markedUp = await openPhotoMarkup(compressedDataUrl, {
lat: gps ? gps.lat : null,
lon: gps ? gps.lng : null,
timestamp: Date.now(),
heading: null
});
if (markedUp === null) {
// User discarded — skip this photo
console.log('[PHOTO] Markup discarded, skipping photo');
continue;
}
finalDataUrl = markedUp;
}

// Create photo object immediately with local data (upload happens in background)
const photoObj = {
id: photoId,
url: finalDataUrl,
base64: finalDataUrl,
storagePath: null,
uploadStatus: 'pending',
caption: '',
timestamp: now.toISOString(),
date: now.toLocaleDateString(),
time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
gps: gps,
fileName: file.name,
fileSize: file.size,
fileType: file.type
};

IS.report.photos.push(photoObj);

// Save photo to IndexedDB (local-first)
await savePhotoToIndexedDB(photoObj);

// Update UI immediately (photo visible with upload spinner)
renderMinimalPhotos();
saveReport();

// Background upload — non-blocking
backgroundUploadPhoto(photoObj, finalDataUrl);
showToast('Photo saved', 'success');
} catch (err) {
console.error('Error adding photo:', err);
showToast('Failed to add photo', 'error');
}
}

// Reset input
e.target.value = '';
}

/**
 * Delete a photo in minimal mode
 */
async function deleteMinimalPhoto(idx) {
if (!confirm('Delete this photo?')) return;

const photo = IS.report.photos[idx];
if (photo) {
// Delete from IndexedDB first
try {
await window.idb.deletePhoto(photo.id);
console.log('[PHOTO] Deleted from IndexedDB:', photo.id);
} catch (err) {
console.warn('[PHOTO] Failed to delete from IndexedDB:', err);
}

// Delete from Supabase if it was uploaded
if (photo.storagePath) {
await deletePhotoFromSupabase(photo.id, photo.storagePath);
}
}

IS.report.photos.splice(idx, 1);
saveReport();
renderMinimalPhotos();
}

/**
 * Update photo caption in minimal/freeform mode
 */
function updateMinimalPhotoCaption(idx, caption) {
if (IS.report.photos[idx]) {
IS.report.photos[idx].caption = caption;
saveReport();
}
}
