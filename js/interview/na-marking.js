// ============================================================
// N/A MARKING
// Allows users to mark sections as "Not Applicable"
// ============================================================

var IS = window.interviewState;

function markNA(section) {
if (!IS.report.meta.naMarked) IS.report.meta.naMarked = {};
IS.report.meta.naMarked[section] = true;
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
btn.innerHTML = '<i class="fas fa-check mr-2"></i>Marked as N/A';
btn.className = 'w-full p-3 bg-safety-green/20 border-2 border-safety-green text-safety-green text-sm font-medium uppercase cursor-default';
btn.onclick = () => clearNA(section);
}
// Hide photo upload if photos section is marked N/A
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.add('hidden');
}
saveReport();
updateAllPreviews();
showToast('Marked as N/A');
}

function clearNA(section) {
if (IS.report.meta.naMarked) { delete IS.report.meta.naMarked[section]; }
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
const labels = { issues: 'No Issues - Mark as N/A', inspections: 'No Inspections - Mark as N/A', communications: 'No Communications - Mark as N/A', visitors: 'Nothing to Report - Mark as N/A', photos: 'No Photos - Mark as N/A' };
btn.innerHTML = `<i class="fas fa-ban mr-2"></i>${labels[section] || 'Mark as N/A'}`;
btn.className = 'w-full p-3 bg-slate-100 border border-slate-300 text-slate-600 hover:bg-slate-200 transition-colors text-sm font-medium uppercase';
btn.onclick = () => markNA(section);
}
// Show photo upload if photos section is cleared
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.remove('hidden');
}
saveReport();
updateAllPreviews();
showToast('N/A cleared');
}

function updateNAButtons() {
const naMarked = IS.report.meta.naMarked || {};
Object.keys(naMarked).forEach(section => {
if (naMarked[section]) {
const btn = document.getElementById(`${section}-na-btn`);
if (btn) {
btn.innerHTML = '<i class="fas fa-check mr-2"></i>Marked as N/A';
btn.className = 'w-full p-3 bg-safety-green/20 border-2 border-safety-green text-safety-green text-sm font-medium uppercase cursor-default';
btn.onclick = () => clearNA(section);
}
// Hide photo upload if photos is marked N/A
if (section === 'photos') {
const uploadLabel = document.getElementById('photos-upload-label');
if (uploadLabel) uploadLabel.classList.add('hidden');
}
}
});
}
