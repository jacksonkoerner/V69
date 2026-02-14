// ============================================================
// js/interview/ui-display.js — Weather + Previews + Progress
// Sprint 11: Consolidated from weather.js, previews.js
// ============================================================

var IS = window.interviewState;

async function fetchWeather() {
    try {
        // Always get fresh GPS for weather so it reflects current position
        const freshLoc = await getFreshLocation();
        if (!freshLoc) {
            console.log('[Weather] No location available, skipping weather fetch');
            return;
        }
        const latitude = freshLoc.lat;
        const longitude = freshLoc.lng;

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch`);
        const data = await response.json();
        const weatherCodes = { 0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 80: 'Showers', 95: 'Thunderstorm' };
        const precip = data.daily.precipitation_sum[0];
        IS.report.overview.weather = {
            highTemp: `${Math.round(data.daily.temperature_2m_max[0])}°F`,
            lowTemp: `${Math.round(data.daily.temperature_2m_min[0])}°F`,
            precipitation: `${precip.toFixed(2)}"`,
            generalCondition: weatherCodes[data.current_weather.weathercode] || 'Cloudy',
            jobSiteCondition: IS.report.overview.weather.jobSiteCondition || (precip > 0.1 ? 'Wet' : 'Dry'),
            adverseConditions: precip > 0.25 ? 'Rain impact possible' : 'N/A'
        };
        saveReport();
        updateWeatherDisplay();
        updateMinimalWeatherDisplay(); // Also update minimal mode weather
    } catch (error) {
        console.error('Weather fetch failed:', error);
    }
}

function updateWeatherDisplay() {
    const w = IS.report.overview.weather;
    const conditionEl = document.getElementById('weather-condition');
    const tempEl = document.getElementById('weather-temp');
    const precipEl = document.getElementById('weather-precip');
    const siteCondEl = document.getElementById('site-conditions-input');

    if (conditionEl) conditionEl.textContent = w.generalCondition;
    if (tempEl) tempEl.textContent = `${w.highTemp} / ${w.lowTemp}`;
    if (precipEl) precipEl.textContent = w.precipitation;
    if (siteCondEl) siteCondEl.value = w.jobSiteCondition || '';
}


// ============================================================
// Preview text and status icons (was previews.js)
// ============================================================

// ============ PREVIEWS & PROGRESS ============
function updateAllPreviews() {
// v6: All guided mode sections
const w = IS.report.overview.weather;
document.getElementById('weather-preview').textContent = w.jobSiteCondition || `${w.generalCondition}, ${w.highTemp}`;

// v6.6: Work Summary preview - contractor-based format
updateActivitiesPreview();

const naMarked = IS.report.meta.naMarked || {};

// v6: Personnel preview - check toggle and data
const personnelToggleVal = getToggleState('personnel_onsite');
const personnelPreviewEl = document.getElementById('personnel-preview');
if (personnelPreviewEl) {
if (personnelToggleVal === false) {
personnelPreviewEl.textContent = 'N/A - No contractors';
} else if (personnelToggleVal === true) {
const totalPersonnel = getTotalPersonnelCount();
personnelPreviewEl.textContent = totalPersonnel > 0 ? `${totalPersonnel} personnel` : 'Tap to add counts';
} else {
personnelPreviewEl.textContent = 'Tap to add';
}
}

// v6: Equipment preview
updateEquipmentPreview();

// v6: Issues preview - count both entry-based and legacy issues
const issueEntries = getEntriesForSection('issues');
const legacyIssueCount = (IS.report.generalIssues || []).length;
const totalIssues = issueEntries.length + legacyIssueCount;
document.getElementById('issues-preview').textContent =
naMarked.issues ? 'N/A - No issues' :
totalIssues > 0 ? `${totalIssues} issue${totalIssues > 1 ? 's' : ''}` :
'None reported';

// v6: Communications preview
const commsToggleVal = getToggleState('communications_made');
const commsPreviewEl = document.getElementById('communications-preview');
if (commsPreviewEl) {
if (commsToggleVal === false) {
commsPreviewEl.textContent = 'N/A - None';
} else if (commsToggleVal === true) {
const commsCount = getEntriesForSection('communications').length;
commsPreviewEl.textContent = commsCount > 0 ? `${commsCount} logged` : 'Tap to add';
} else {
commsPreviewEl.textContent = 'None recorded';
}
}

// v6: QA/QC preview
const qaqcToggleVal = getToggleState('qaqc_performed');
const qaqcPreviewEl = document.getElementById('qaqc-preview');
if (qaqcPreviewEl) {
if (qaqcToggleVal === false) {
qaqcPreviewEl.textContent = 'N/A - None';
} else if (qaqcToggleVal === true) {
const qaqcCount = getEntriesForSection('qaqc').length;
qaqcPreviewEl.textContent = qaqcCount > 0 ? `${qaqcCount} logged` : 'Tap to add';
} else {
qaqcPreviewEl.textContent = 'None recorded';
}
}

// v6: Safety preview - check report state and entries
const safetyEntryCount = getEntriesForSection('safety').length;
const legacySafetyCount = (IS.report.safety?.notes || []).length;
document.getElementById('safety-preview').textContent =
IS.report.safety.hasIncidents ? 'INCIDENT REPORTED' :
IS.report.safety.noIncidents ? 'No incidents (confirmed)' :
(safetyEntryCount + legacySafetyCount) > 0 ? 'Notes added' :
'Tap to confirm';

// v6: Visitors preview
const visitorsToggleVal = getToggleState('visitors_present');
const visitorsPreviewEl = document.getElementById('visitors-preview');
if (visitorsPreviewEl) {
if (visitorsToggleVal === false) {
visitorsPreviewEl.textContent = 'N/A - None';
} else if (visitorsToggleVal === true) {
const visitorsCount = getEntriesForSection('visitors').length;
visitorsPreviewEl.textContent = visitorsCount > 0 ? `${visitorsCount} logged` : 'Tap to add';
} else {
visitorsPreviewEl.textContent = 'None recorded';
}
}

document.getElementById('photos-preview').textContent = naMarked.photos ? 'N/A - No photos' : IS.report.photos.length > 0 ? `${IS.report.photos.length} photos` : 'No photos';

updateStatusIcons();
}

function updateStatusIcons() {
const naMarked = IS.report.meta.naMarked || {};
// Check if equipment has any rows (v6.6: check equipmentRows)
const hasEquipmentData = (IS.report.equipmentRows && IS.report.equipmentRows.length > 0) ||
IS.report.equipment?.some(e => e.hoursUtilized !== null && e.hoursUtilized > 0) || false;
// v6: Check toggle states and entries for new sections
const personnelToggle = getToggleState('personnel_onsite');
const commsToggle = getToggleState('communications_made');
const qaqcToggle = getToggleState('qaqc_performed');
const visitorsToggle = getToggleState('visitors_present');

// v6.9: Check if any contractor has work logged (including crew-level entries)
const hasContractorWork = IS.projectContractors?.some(contractor => {
const activity = getContractorActivity(contractor.id);
const crews = contractor.crews || [];
if (crews.length === 0) {
const entries = getContractorWorkEntries(contractor.id);
return (activity?.noWork) || entries.length > 0;
} else {
if (activity?.noWork) return true;
return crews.some(crew => getCrewWorkEntries(contractor.id, crew.id).length > 0);
}
}) || false;

// Sections with status icons
const sections = {
'weather': IS.report.overview.weather.jobSiteCondition,
'activities': hasContractorWork,
'personnel': personnelToggle !== null || hasOperationsData(),
'equipment': hasEquipmentData,
'issues': getEntriesForSection('issues').length > 0 || IS.report.generalIssues.length > 0 || naMarked.issues,
'communications': commsToggle !== null || getEntriesForSection('communications').length > 0,
'qaqc': qaqcToggle !== null || getEntriesForSection('qaqc').length > 0,
'safety': IS.report.safety.noIncidents || IS.report.safety.hasIncidents || IS.report.safety.notes.length > 0 || getEntriesForSection('safety').length > 0,
'visitors': visitorsToggle !== null || getEntriesForSection('visitors').length > 0,
'photos': IS.report.photos.length > 0 || naMarked.photos
};
Object.entries(sections).forEach(([section, hasData]) => {
const statusEl = document.getElementById(`${section}-status`);
if (!statusEl) return;
const card = document.querySelector(`[data-section="${section}"]`);
const isExpanded = card?.classList.contains('expanded');
if (hasData && !isExpanded) {
statusEl.innerHTML = '<i class="fas fa-check text-safety-green text-xs"></i>';
statusEl.className = 'w-8 h-8 bg-safety-green/20 border-2 border-safety-green flex items-center justify-center';
} else if (!isExpanded) {
statusEl.innerHTML = '<i class="fas fa-chevron-down text-slate-400 text-xs"></i>';
statusEl.className = 'w-8 h-8 border border-slate-300 flex items-center justify-center';
}
});
}

function updateProgress() {
const naMarked = IS.report.meta.naMarked || {};
let filled = 0;
let total = 10; // v6: All guided mode sections

// Weather - has site condition text
if (IS.report.overview.weather.jobSiteCondition) filled++;

// v6.9: Work Summary - contractor/crew work entries or all marked no work
if (IS.projectContractors && IS.projectContractors.length > 0) {
const anyAccountedFor = IS.projectContractors.some(contractor => {
const activity = getContractorActivity(contractor.id);
const crews = contractor.crews || [];
if (crews.length === 0) {
const entries = getContractorWorkEntries(contractor.id);
return (activity?.noWork) || entries.length > 0;
} else {
if (activity?.noWork) return true;
return crews.some(crew => getCrewWorkEntries(contractor.id, crew.id).length > 0);
}
});
if (anyAccountedFor) filled++;
}

// v6: Personnel - toggle answered OR has data
const personnelToggleVal = getToggleState('personnel_onsite');
if (personnelToggleVal !== null || hasOperationsData()) filled++;

// v6.6: Equipment - has equipment rows
if ((IS.report.equipmentRows || []).length > 0) filled++;

// v6: Issues - has entries OR legacy issues OR marked N/A
const issueEntryCount = getEntriesForSection('issues').length;
const legacyIssueCount = (IS.report.generalIssues || []).length;
if (issueEntryCount > 0 || legacyIssueCount > 0 || naMarked.issues) filled++;

// v6: Communications - toggle answered OR has entries
const commsToggleVal = getToggleState('communications_made');
if (commsToggleVal !== null || getEntriesForSection('communications').length > 0) filled++;

// v6: QA/QC - toggle answered OR has entries
const qaqcToggleVal = getToggleState('qaqc_performed');
if (qaqcToggleVal !== null || getEntriesForSection('qaqc').length > 0) filled++;

// v6: Safety - checkbox answered OR has entries OR legacy notes
const safetyEntryCount = getEntriesForSection('safety').length;
const legacySafetyCount = (IS.report.safety?.notes || []).length;
if (IS.report.safety.noIncidents === true ||
IS.report.safety.hasIncidents === true ||
safetyEntryCount > 0 ||
legacySafetyCount > 0) filled++;

// v6: Visitors - toggle answered OR has entries
const visitorsToggleVal = getToggleState('visitors_present');
if (visitorsToggleVal !== null || getEntriesForSection('visitors').length > 0) filled++;

// Photos - has photos OR marked N/A
if (IS.report.photos.length > 0 || naMarked.photos) filled++;

const percent = Math.round((filled / total) * 100);
document.getElementById('progressBar').style.width = `${percent}%`;
document.getElementById('progressText').textContent = `${percent}%`;
}
