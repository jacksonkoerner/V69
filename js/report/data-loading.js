// ============================================================================
// FieldVoice Pro v6 - Report Data Loading (data-loading.js)
//
// Shared state namespace: window.reportState
// All other report/*.js files read/write via window.reportState.*
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, getLocalDateString
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
 * Load report from IDB, with Supabase fallback
 * Fallback: report_data table in Supabase (Sprint 4)
 */
async function loadReport() {
    RS.currentReportId = null;

    var params = new URLSearchParams(window.location.search);
    var reportIdParam = params.get('reportId');
    var reportDateStr = getReportDateStr();

    console.log('[LOAD-DEBUG] loadReport called, reportId:', reportIdParam, 'date:', reportDateStr);

    if (!reportIdParam) {
        console.error('[LOAD] No reportId in URL params');
        showToast('Report not found. Redirecting to home.', 'error');
        setTimeout(function() { window.location.href = 'index.html'; }, 2000);
        return createFreshReport();
    }

    var reportData = null;
    if (window.dataStore && typeof window.dataStore.getReportData === 'function') {
        reportData = await window.dataStore.getReportData(reportIdParam);
    }
    console.log('[LOAD-DEBUG] IDB getReportData result:', reportData ? 'EXISTS' : 'NULL');
    if (reportData) {
        console.log('[LOAD-DEBUG] reportData keys:', Object.keys(reportData));
        console.log('[LOAD-DEBUG] reportData.aiGenerated:', reportData.aiGenerated ? 'EXISTS (keys: ' + Object.keys(reportData.aiGenerated).join(',') + ')' : 'NULL/MISSING');
        console.log('[LOAD-DEBUG] reportData.status:', reportData.status);
        console.log('[LOAD-DEBUG] reportData.captureMode:', reportData.captureMode);
    }

    // Sprint 4+: IDB-first load, then always check report_data in cloud when online.
    // Choose the newer source by timestamp; keep IDB if cloud is older/unavailable.
    if (navigator.onLine) {
        var _idbBeforeCloud = reportData;
        var _cloudTimedOut = false;

        try {
            console.log('[LOAD] Checking Supabase report_data for freshness...');

            var _abortController = new AbortController();
            var _timeoutId = setTimeout(function() {
                _cloudTimedOut = true;
                _abortController.abort();
            }, 2000);

            var rdResult = await supabaseClient
                .from('report_data')
                .select('*')
                .eq('report_id', reportIdParam)
                .abortSignal(_abortController.signal)
                .maybeSingle();

            clearTimeout(_timeoutId);

            if (rdResult.data && !rdResult.error) {
                var d = rdResult.data;

                function _parseTimeOrNull(ts) {
                    if (!ts) return null;
                    var ms = Date.parse(ts);
                    return isNaN(ms) ? null : ms;
                }

                var _idbTs = _idbBeforeCloud ? _parseTimeOrNull(_idbBeforeCloud.lastSaved) : null;
                var _cloudTs = _parseTimeOrNull(d.updated_at);

                var _cloudIsNewer = false;
                if (_cloudTs !== null && _idbTs === null) _cloudIsNewer = true;
                if (_cloudTs !== null && _idbTs !== null && _cloudTs > _idbTs) _cloudIsNewer = true;

                if (_cloudIsNewer || !_idbBeforeCloud) {
                    console.log('[LOAD] Cloud data is newer; applying and caching to IDB');

                    var _mergedAiGenerated = d.ai_generated;
                    if (!_mergedAiGenerated && _idbBeforeCloud && _idbBeforeCloud.aiGenerated) {
                        _mergedAiGenerated = _idbBeforeCloud.aiGenerated;
                    }

                    var _mergedOriginalInput = d.original_input;
                    if (!_mergedOriginalInput && _idbBeforeCloud && _idbBeforeCloud.originalInput) {
                        _mergedOriginalInput = _idbBeforeCloud.originalInput;
                    }

                    reportData = {
                        aiGenerated: _mergedAiGenerated,
                        originalInput: _mergedOriginalInput,
                        userEdits: d.user_edits || {},
                        captureMode: d.capture_mode,
                        status: d.status,
                        createdAt: d.created_at,
                        lastSaved: d.updated_at,
                        reportDate: null
                    };

                    // Get reportDate from reports table
                    try {
                        var metaResult = await supabaseClient
                            .from('reports')
                            .select('report_date')
                            .eq('id', reportIdParam)
                            .maybeSingle();
                        if (metaResult.data) reportData.reportDate = metaResult.data.report_date;
                    } catch (metaErr) {
                        console.warn('[LOAD] Could not fetch report_date:', metaErr);
                    }

                    // Cache to IDB
                    if (window.dataStore && typeof window.dataStore.saveReportData === 'function') {
                        window.dataStore.saveReportData(reportIdParam, reportData).catch(function(idbErr) {
                            console.warn('[LOAD] IDB cache-back failed:', idbErr);
                        });
                    }
                } else {
                    console.log('[LOAD] IDB data is current or newer; keeping local copy');
                    reportData = _idbBeforeCloud;
                }
            } else if (rdResult.error) {
                console.warn('[LOAD] Supabase report_data returned error; keeping IDB copy:', rdResult.error);
                reportData = _idbBeforeCloud;
            } else {
                console.log('[LOAD] No cloud report_data row found; keeping IDB copy');
                reportData = _idbBeforeCloud;
            }
        } catch (err) {
            if (_cloudTimedOut || (err && (err.name === 'AbortError' || String(err).indexOf('AbortError') !== -1))) {
                console.warn('[LOAD] Cloud freshness check timed out after 2s; keeping IDB copy');
            } else {
                console.error('[LOAD] Supabase freshness check failed:', err);
            }
            reportData = _idbBeforeCloud;
        }
    }

    // Sprint 13: report_backup fallback removed — report_data is now the authoritative
    // cloud source for report content. report_backup table is deprecated.

    if (!reportData) {
        // Check if the report exists but is pending_refine (interrupted AI processing)
        var reportMeta = null;
        if (window.dataStore && typeof window.dataStore.getReport === 'function') {
            reportMeta = await window.dataStore.getReport(reportIdParam);
        }
        if (reportMeta && (reportMeta.status === 'pending_refine' || reportMeta.status === 'draft')) {
            console.warn('[LOAD] Report is in', reportMeta.status, 'status — redirecting to interview for re-processing');
            showToast('Report needs processing. Redirecting to interview...', 'warning');
            setTimeout(function() { window.location.href = 'quick-interview.html?reportId=' + reportIdParam; }, 1500);
            return createFreshReport();
        }
        console.error('[LOAD] No report data found for:', reportIdParam);
        showToast('Report data not found. It may have been cleared.', 'error');
        setTimeout(function() { window.location.href = 'index.html'; }, 2000);
        return createFreshReport();
    }

    console.log('[LOAD] Report loaded for:', reportIdParam);
    console.log('[LOAD-DEBUG] === ASSEMBLING REPORT OBJECT ===');

    RS.currentReportId = reportIdParam;
    setStorageItem(STORAGE_KEYS.ACTIVE_REPORT_ID, reportIdParam);

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

    console.log('[LOAD-DEBUG] loadedReport.aiGenerated:', loadedReport.aiGenerated ? 'SET (activities: ' + (loadedReport.aiGenerated.activities?.length ?? 'none') + ', operations: ' + (loadedReport.aiGenerated.operations?.length ?? 'none') + ')' : 'NULL');
    console.log('[LOAD-DEBUG] loadedReport.originalInput:', loadedReport.originalInput ? 'SET' : 'NULL');
    console.log('[LOAD-DEBUG] loadedReport.userEdits:', Object.keys(loadedReport.userEdits).length, 'keys');

    if (reportData.originalInput?.weather) {
        loadedReport.overview.weather = reportData.originalInput.weather;
    }

    if (reportData.originalInput?.photos && reportData.originalInput.photos.length > 0) {
        loadedReport.photos = reportData.originalInput.photos;
    }

    // Sprint 14: Re-sign locally-cached photo URLs that may have expired
    if (loadedReport.photos && loadedReport.photos.length > 0 && navigator.onLine && typeof resignPhotoUrls === 'function') {
        try {
            await resignPhotoUrls(loadedReport.photos);
            console.log('[LOAD] Re-signed ' + loadedReport.photos.length + ' photo URL(s)');
        } catch (e) {
            console.warn('[LOAD] Photo URL re-sign failed:', e);
        }
    }

    // Sprint 15: If no photos loaded locally, try Supabase photos table (cross-device rehydration)
    if ((!loadedReport.photos || loadedReport.photos.length === 0) && navigator.onLine && typeof fetchCloudPhotos === 'function') {
        try {
            var cloudPhotos = await fetchCloudPhotos(reportIdParam);
            if (cloudPhotos && cloudPhotos.length > 0) {
                loadedReport.photos = cloudPhotos;
                console.log('[LOAD] Rehydrated ' + cloudPhotos.length + ' photo(s) from cloud');

                // Cache back to localStorage so we don't re-fetch next time
                if (reportData.originalInput) {
                    reportData.originalInput.photos = cloudPhotos;
                } else {
                    reportData.originalInput = { photos: cloudPhotos };
                }
                if (window.dataStore && typeof window.dataStore.saveReportData === 'function') {
                    window.dataStore.saveReportData(reportIdParam, reportData).catch(function(e) { console.warn('[LOAD] IDB photo cache-back failed:', e); });
                }
            }
        } catch (photoErr) {
            console.error('[LOAD] Cloud photo rehydration failed:', photoErr);
        }
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
            date: getLocalDateString(),
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
        // Silent mode: don't mark report_data dirty (prevents sync broadcast loop
        // when two devices have the same report open simultaneously)
        await saveReportToSupabase({ silent: true });
    } catch (err) {
        console.error('Failed to save report:', err);
    }
}
