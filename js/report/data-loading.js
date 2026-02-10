// ============================================================================
// FieldVoice Pro v6 - Report Data Loading (data-loading.js)
//
// Shared state namespace: window.reportState
// All other report/*.js files read/write via window.reportState.*
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, getReportData, getLocalDateString
// - ui-utils.js: showToast
// ============================================================================

// ============ SHARED STATE ============
// Exposed on window.reportState so all report subfiles can share state
window.reportState = {
    report: null,
    currentReportId: null,
    activeProject: null,
    projectContractors: [],
    userEdits: {},
    userSettings: null,
    saveTimeout: null,
    isSaving: false,
    isReadonly: false,
    currentTab: 'form'
};

// Convenience aliases used within this file
var RS = window.reportState;

// ============ REPORT LOADING ============
function getReportDateStr() {
    var params = new URLSearchParams(window.location.search);
    var dateParam = params.get('date');
    return dateParam || getLocalDateString();
}

/**
 * v6.6.2: Load report from localStorage ONLY
 * Source of truth is now fvp_report_{reportId} key
 */
async function loadReport() {
    RS.currentReportId = null;

    var params = new URLSearchParams(window.location.search);
    var reportIdParam = params.get('reportId');
    var reportDateStr = getReportDateStr();

    if (!reportIdParam) {
        console.error('[LOAD] No reportId in URL params');
        showToast('Report not found. Redirecting to home.', 'error');
        setTimeout(function() { window.location.href = 'index.html'; }, 2000);
        return createFreshReport();
    }

    var reportData = getReportData(reportIdParam);

    if (!reportData) {
        console.error('[LOAD] No report data found in localStorage for:', reportIdParam);
        showToast('Report data not found. It may have been cleared.', 'error');
        setTimeout(function() { window.location.href = 'index.html'; }, 2000);
        return createFreshReport();
    }

    console.log('[LOAD] Loaded report from localStorage:', reportIdParam);

    RS.currentReportId = reportIdParam;

    var loadedReport = createFreshReport();

    loadedReport.meta = {
        createdAt: reportData.createdAt,
        lastSaved: reportData.lastSaved,
        version: 4,
        status: reportData.status || 'refined',
        captureMode: reportData.captureMode || 'minimal',
        reportViewed: true
    };

    loadedReport.overview.date = reportData.reportDate;
    loadedReport.aiGenerated = reportData.aiGenerated || null;
    loadedReport.originalInput = reportData.originalInput || null;
    loadedReport.aiCaptureMode = reportData.captureMode || null;
    loadedReport.userEdits = reportData.userEdits || {};

    if (reportData.originalInput?.weather) {
        loadedReport.overview.weather = reportData.originalInput.weather;
    }

    if (reportData.originalInput?.photos) {
        loadedReport.photos = reportData.originalInput.photos;
    }

    return loadedReport;
}

function createFreshReport() {
    return {
        meta: {
            createdAt: new Date().toISOString(),
            version: 4
        },
        overview: {
            projectName: RS.activeProject?.projectName || '',
            noabProjectNo: RS.activeProject?.noabProjectNo || '',
            cnoSolicitationNo: RS.activeProject?.cnoSolicitationNo || 'N/A',
            location: RS.activeProject?.location || '',
            date: new Date().toLocaleDateString(),
            contractDay: RS.activeProject?.contractDayNo || '',
            weatherDays: RS.activeProject?.weatherDays || 0,
            engineer: RS.activeProject?.engineer || '',
            contractor: RS.activeProject?.primeContractor || '',
            startTime: RS.activeProject?.defaultStartTime || '06:00',
            endTime: RS.activeProject?.defaultEndTime || '16:00',
            completedBy: '',
            weather: {
                highTemp: '',
                lowTemp: '',
                precipitation: '',
                generalCondition: '',
                jobSiteCondition: '',
                adverseConditions: ''
            }
        },
        activities: [],
        operations: [],
        equipment: [],
        issues: '',
        qaqc: '',
        safety: {
            hasIncident: false,
            notes: ''
        },
        communications: '',
        visitors: '',
        photos: [],
        signature: {
            name: '',
            title: '',
            company: ''
        },
        aiGenerated: null,
        originalInput: null,
        aiCaptureMode: null,
        userEdits: {},
        fieldNotes: { freeformNotes: '' },
        guidedNotes: { workSummary: '' }
    };
}

// ============ DATA MERGING ============
function getValue(path, defaultValue) {
    if (defaultValue === undefined) defaultValue = '';
    if (RS.userEdits[path] !== undefined) {
        return RS.userEdits[path];
    }

    if (RS.report && RS.report.aiGenerated) {
        var aiValue = getNestedValue(RS.report.aiGenerated, path);
        if (aiValue !== undefined && aiValue !== null && aiValue !== '') {
            if (Array.isArray(aiValue)) {
                return aiValue.join('\n');
            }
            return aiValue;
        }
    }

    if (RS.report) {
        var reportValue = getNestedValue(RS.report, path);
        if (reportValue !== undefined && reportValue !== null && reportValue !== '') {
            if (Array.isArray(reportValue)) {
                return reportValue.join('\n');
            }
            return reportValue;
        }
    }

    return defaultValue;
}

function getNestedValue(obj, path) {
    return path.split('.').reduce(function(o, k) { return (o || {})[k]; }, obj);
}

function getAIValue(path, defaultValue) {
    if (defaultValue === undefined) defaultValue = '';
    if (!RS.report || !RS.report.aiGenerated) return defaultValue;
    var value = getNestedValue(RS.report.aiGenerated, path);
    if (value === undefined || value === null) return defaultValue;
    if (Array.isArray(value)) return value.join('\n');
    return value;
}

function getTextFieldValue(reportPath, aiPath, defaultValue, legacyAiPath) {
    if (defaultValue === undefined) defaultValue = '';
    if (legacyAiPath === undefined) legacyAiPath = null;

    if (RS.userEdits[reportPath] !== undefined) {
        return RS.userEdits[reportPath];
    }

    if (RS.report && RS.report.aiGenerated) {
        var aiValue = getNestedValue(RS.report.aiGenerated, aiPath);

        if ((aiValue === undefined || aiValue === null || aiValue === '') && legacyAiPath) {
            aiValue = getNestedValue(RS.report.aiGenerated, legacyAiPath);
        }

        if (aiValue !== undefined && aiValue !== null && aiValue !== '') {
            if (Array.isArray(aiValue)) {
                return aiValue.join('\n');
            }
            return aiValue;
        }
    }

    if (RS.report) {
        var reportValue = getNestedValue(RS.report, reportPath);
        if (reportValue !== undefined && reportValue !== null && reportValue !== '') {
            if (Array.isArray(reportValue)) {
                return reportValue.join('\n');
            }
            return reportValue;
        }
    }

    return defaultValue;
}

function setNestedValue(obj, path, value) {
    var keys = path.split('.');
    var lastKey = keys.pop();
    var target = keys.reduce(function(o, k) {
        if (!o[k]) o[k] = {};
        return o[k];
    }, obj);
    target[lastKey] = value;
}

// Save report without showing indicator (for silent updates)
async function saveReportSilent() {
    try {
        await saveReportToSupabase();
    } catch (err) {
        console.error('Failed to save report:', err);
    }
}
