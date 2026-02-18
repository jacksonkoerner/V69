// ============================================================================
// FieldVoice Pro v6 - Report Page: Auto-Save
// Extracted from report.js (lines ~2146-2427)
//
// Contains: setupAutoSave, scheduleSave, saveReport, markReportBackupDirty,
//   flushReportBackup, saveReportToLocalStorage,
//   saveReportToSupabase, showSaveIndicator
// Sprint 13: Removed report_backup writes — report_data is now authoritative
// ============================================================================

var RS = window.reportState;

// Live sync: session ID and revision for broadcast layer
var _reportSyncSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
var _reportSyncRevision = 0;
if (!window.syncEngine) window.syncEngine = {};
window.syncEngine.getSessionId = function() { return _reportSyncSessionId; };
window.syncEngine.getRevision = function() { return _reportSyncRevision; };

// Section definitions for report page merge engine
var REPORT_SECTIONS = {
    'userEdits': { type: 'object' }
};
window.syncEngine.REPORT_SECTIONS = REPORT_SECTIONS;

/**
 * Initialize the base snapshot for three-way merge on report page.
 */
function initReportSyncBase() {
    try {
        if (typeof _lastAppliedRevision !== 'undefined') _lastAppliedRevision = -1;
        if (typeof _lastMergeAt !== 'undefined') _lastMergeAt = null;
        window._syncBase = {
            userEdits: JSON.parse(JSON.stringify(RS.userEdits || {}))
        };
        console.log('[SYNC] Report base snapshot initialized');
    } catch (e) {
        console.warn('[SYNC] Failed to init report base snapshot:', e);
        window._syncBase = { userEdits: {} };
    }
}
window.initReportSyncBase = initReportSyncBase;

/**
 * Deferred field update queue — apply when field loses focus.
 */
var _deferredUpdates = {};
function _deferFieldUpdate(fieldId, value) {
    _deferredUpdates[fieldId] = value;
    var el = document.getElementById(fieldId);
    if (el && !el._syncBlurListener) {
        el.addEventListener('blur', function onBlur() {
            if (_deferredUpdates[fieldId] !== undefined) {
                el.value = _deferredUpdates[fieldId];
                delete _deferredUpdates[fieldId];
                el.classList.add('sync-flash');
                setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
            }
            el._syncBlurListener = false;
        }, { once: true });
        el._syncBlurListener = true;
    }
}

/**
 * Apply remote merge results to report page.
 */
function applyReportMerge(remoteData) {
    if (!remoteData) return;

    var remoteUserEdits = remoteData.user_edits || {};
    var baseEdits = (window._syncBase && window._syncBase.userEdits) || {};

    var mergeResult = window.syncMergeUtils
        ? window.syncMergeUtils.mergeObjects(baseEdits, RS.userEdits, remoteUserEdits)
        : { merged: RS.userEdits, conflicts: [] };

    if (window.syncMergeUtils && window.syncMergeUtils.deepEqual(RS.userEdits, mergeResult.merged)) {
        console.log('[SYNC] Report merge: no changes needed');
        return;
    }

    // Determine which keys changed
    var changedKeys = [];
    var newEdits = mergeResult.merged;
    Object.keys(newEdits).forEach(function(key) {
        if (!window.syncMergeUtils.deepEqual(RS.userEdits[key], newEdits[key])) {
            changedKeys.push(key);
        }
    });

    // Apply merged userEdits
    RS.userEdits = mergeResult.merged;
    RS.report.userEdits = RS.userEdits;

    // Update base snapshot
    window._syncBase = { userEdits: JSON.parse(JSON.stringify(RS.userEdits)) };

    // Update AI-generated content if remote has newer
    if (remoteData.ai_generated && window.syncMergeUtils &&
        !window.syncMergeUtils.deepEqual(RS.report.aiGenerated, remoteData.ai_generated)) {
        RS.report.aiGenerated = remoteData.ai_generated;
    }

    // Selectively update DOM fields
    var hasContractorChanges = false;
    var hasPersonnelChanges = false;

    // Field path → DOM ID mapping (mirrors setupAutoSave)
    var pathToFieldId = {
        'overview.projectName': 'projectName',
        'overview.noabProjectNo': 'noabProjectNo',
        'overview.cnoSolicitationNo': 'cnoSolicitationNo',
        'overview.location': 'projectLocation',
        'overview.date': 'reportDate',
        'overview.contractDay': 'contractDay',
        'overview.weatherDays': 'weatherDaysCount',
        'overview.engineer': 'engineer',
        'overview.contractor': 'contractor',
        'overview.startTime': 'startTime',
        'overview.endTime': 'endTime',
        'overview.completedBy': 'completedBy',
        'overview.weather.highTemp': 'weatherHigh',
        'overview.weather.lowTemp': 'weatherLow',
        'overview.weather.precipitation': 'weatherPrecip',
        'overview.weather.generalCondition': 'weatherCondition',
        'overview.weather.jobSiteCondition': 'weatherJobSite',
        'overview.weather.adverseConditions': 'weatherAdverse',
        'issues': 'issuesText',
        'qaqc': 'qaqcText',
        'safety.notes': 'safetyText',
        'guidedNotes.workSummary': 'generalWorkSummary',
        'communications': 'communicationsText',
        'visitors': 'visitorsText',
        'signature.name': 'signatureName',
        'signature.title': 'signatureTitle',
        'signature.company': 'signatureCompany'
    };

    changedKeys.forEach(function(key) {
        if (key.indexOf('activity_') === 0) {
            hasContractorChanges = true;
            return;
        }
        if (key.indexOf('operations_') === 0) {
            hasPersonnelChanges = true;
            return;
        }

        var fieldId = pathToFieldId[key] || key;
        var el = document.getElementById(fieldId);
        if (!el) return;

        if (document.activeElement === el) {
            _deferFieldUpdate(fieldId, newEdits[key]);
        } else {
            el.value = newEdits[key];
            el.classList.add('sync-flash');
            setTimeout(function() { el.classList.remove('sync-flash'); }, 1500);
        }
    });

    // Re-render dynamic sections if needed
    if (hasContractorChanges && typeof renderWorkSummary === 'function') {
        if (!document.querySelector('.contractor-narrative:focus')) {
            renderWorkSummary();
        }
    }
    if (hasPersonnelChanges && typeof renderPersonnelTable === 'function') {
        if (!document.querySelector('.personnel-input:focus')) {
            renderPersonnelTable();
        }
    }

    if (typeof markUserEditedFields === 'function') markUserEditedFields();

    // Save to IDB silently (no re-broadcast)
    var wasDirty = _reportBackupDirty;
    saveReportToLocalStorage();
    _reportBackupDirty = wasDirty;

    // Toast (rate-limited)
    var now = Date.now();
    if (!window._lastReportSyncToast || now - window._lastReportSyncToast > 5000) {
        window._lastReportSyncToast = now;
        if (typeof showToast === 'function') showToast('📡 Updated from another device', 'info');
    }

    console.log('[SYNC] Report merge applied, changed keys:', changedKeys);
}
window.applyReportMerge = applyReportMerge;

// Backup timer state
var _reportBackupDirty = false;
var _reportBackupTimer = null;
var _reportSaveQueue = Promise.resolve();

// ============ AUTO-SAVE ============
function setupAutoSave() {
    // Field mappings for auto-save
    var fieldMappings = {
        'projectName': 'overview.projectName',
        'noabProjectNo': 'overview.noabProjectNo',
        'cnoSolicitationNo': 'overview.cnoSolicitationNo',
        'projectLocation': 'overview.location',
        'reportDate': 'overview.date',
        'contractDay': 'overview.contractDay',
        'weatherDaysCount': 'overview.weatherDays',
        'engineer': 'overview.engineer',
        'contractor': 'overview.contractor',
        'startTime': 'overview.startTime',
        'endTime': 'overview.endTime',
        'completedBy': 'overview.completedBy',
        'weatherHigh': 'overview.weather.highTemp',
        'weatherLow': 'overview.weather.lowTemp',
        'weatherPrecip': 'overview.weather.precipitation',
        'weatherCondition': 'overview.weather.generalCondition',
        'weatherJobSite': 'overview.weather.jobSiteCondition',
        'weatherAdverse': 'overview.weather.adverseConditions',
        'issuesText': 'issues',
        'qaqcText': 'qaqc',
        'safetyText': 'safety.notes',
        'communicationsText': 'communications',
        'visitorsText': 'visitors',
        'signatureName': 'signature.name',
        'signatureTitle': 'signature.title',
        'signatureCompany': 'signature.company'
    };

    Object.entries(fieldMappings).forEach(function(entry) {
        var fieldId = entry[0];
        var path = entry[1];
        var field = document.getElementById(fieldId);
        if (!field) return;

        // v6.6.3: Input event with debounce - saves 500ms after typing stops
        field.addEventListener('input', function() {
            // Update userEdits immediately so data isn't lost
            var value = field.value;
            setNestedValue(RS.report, path, value);
            RS.userEdits[path] = value;
            RS.report.userEdits = RS.userEdits;
            field.classList.add('user-edited');

            // Debounced save to localStorage
            scheduleSave();
        });

        // Safety net: blur cancels pending debounce and saves immediately
        field.addEventListener('blur', function() {
            if (RS.saveTimeout) {
                clearTimeout(RS.saveTimeout);
                RS.saveTimeout = null;
            }
            // Save immediately on blur
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    });

    // Recalculate shift duration when start/end time changes
    ['startTime', 'endTime'].forEach(function(fieldId) {
        var field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', calculateShiftDuration);
        }
    });

    // Safety incident toggle
    document.querySelectorAll('input[name="safetyIncident"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var hasIncident = document.getElementById('safetyHasIncident').checked;
            RS.report.safety = RS.report.safety || {};
            RS.report.safety.hasIncident = hasIncident;
            RS.userEdits['safety.hasIncident'] = hasIncident;
            RS.report.userEdits = RS.userEdits;
            scheduleSave();
        });
    });

    // General work summary (when no contractors)
    var generalSummary = document.getElementById('generalWorkSummary');
    if (generalSummary) {
        var path = 'guidedNotes.workSummary';

        // v6.6.3: Input event with debounce
        generalSummary.addEventListener('input', function() {
            var value = generalSummary.value;
            setNestedValue(RS.report, path, value);
            RS.userEdits[path] = value;
            RS.report.userEdits = RS.userEdits;
            generalSummary.classList.add('user-edited');
            scheduleSave();
        });

        // Safety net: blur saves immediately
        generalSummary.addEventListener('blur', function() {
            if (RS.saveTimeout) {
                clearTimeout(RS.saveTimeout);
                RS.saveTimeout = null;
            }
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    }
}

function scheduleSave() {
    if (RS.saveTimeout) clearTimeout(RS.saveTimeout);
    RS.saveTimeout = setTimeout(function() {
        saveReport();
    }, 500);
}

async function saveReport() {
    _reportSyncRevision++;
    // Save to localStorage (primary storage for report.html)
    saveReportToLocalStorage();
    showSaveIndicator();
    // Also mark Supabase backup as dirty (separate 5s debounce)
    markReportBackupDirty();
}

// ============ REPORT_BACKUP AUTOSAVE ============
function markReportBackupDirty() {
    _reportBackupDirty = true;
    if (_reportBackupTimer) clearTimeout(_reportBackupTimer);
    _reportBackupTimer = setTimeout(flushReportBackup, 5000); // 5s debounce
}

function flushReportBackup() {
    if (!_reportBackupDirty || !RS.currentReportId) return;
    _reportBackupDirty = false;

    // Sprint 13+15 (SUP-02): report_data is authoritative — retry with backoff
    var _autosaveReportId = RS.currentReportId;
    var _autosavePayload = {
        report_id: _autosaveReportId,
        org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || null,
        user_edits: RS.userEdits || {},
        status: RS.report?.meta?.status || 'refined',
        updated_at: new Date().toISOString()
    };

    supabaseRetry(function() {
        return supabaseClient
            .from('report_data')
            .upsert(_autosavePayload, { onConflict: 'report_id' });
    }, 3, 'AUTOSAVE:report_data')
    .then(function() {
        console.log('[AUTOSAVE] report_data synced');
        // Live sync: notify other devices
        if (window.syncEngine && window.syncEngine.broadcastSyncUpdate) {
            var changedSections = Object.keys(RS.userEdits || {}).length > 0 ? ['userEdits'] : [];
            window.syncEngine.broadcastSyncUpdate(_autosaveReportId, changedSections, 'report');
        }
        window._syncBase = { userEdits: JSON.parse(JSON.stringify(RS.userEdits)) };
    })
    .catch(function(err) {
        console.warn('[AUTOSAVE] report_data sync failed after retries:', err.message);
    });
}

/**
 * v6.6.2: Save report data to localStorage using single key pattern
 * Key: fvp_report_{reportId}
 */
function saveReportToLocalStorage() {
    if (!RS.currentReportId) {
        console.warn('[LOCAL] No reportId, cannot save');
        return;
    }

    _reportSaveQueue = _reportSaveQueue.then(function() {
        if (!window.dataStore) return;
        return window.dataStore.getReportData(RS.currentReportId).catch(function() { return null; }).then(function(existingData) {
            existingData = existingData || {};

            var reportToSave = {
                reportId: RS.currentReportId,
                projectId: existingData.projectId || RS.activeProject?.id,
                reportDate: existingData.reportDate || getReportDateStr(),
                status: RS.report.meta?.status || existingData.status || 'refined',
                aiGenerated: RS.report.aiGenerated || existingData.aiGenerated || {},
                captureMode: RS.report.aiCaptureMode || existingData.captureMode || 'minimal',
                originalInput: RS.report.originalInput || existingData.originalInput || {},
                userEdits: RS.report.userEdits || {},
                createdAt: existingData.createdAt || RS.report.meta?.createdAt || new Date().toISOString(),
                lastSaved: new Date().toISOString()
            };

            return Promise.all([
                window.dataStore.saveReportData(RS.currentReportId, reportToSave),
                window.dataStore.saveReport({
                    id: RS.currentReportId,
                    project_id: RS.activeProject?.id || existingData.projectId || null,
                    project_name: RS.activeProject?.projectName || null,
                    reportDate: reportToSave.reportDate,
                    report_date: reportToSave.reportDate,
                    status: reportToSave.status,
                    updated_at: Date.now()
                })
            ]).then(function() {
                console.log('[LOCAL] Report saved to IDB:', RS.currentReportId);
                if (window.fvpBroadcast && typeof window.fvpBroadcast.send === 'function') {
                    window.fvpBroadcast.send({ type: 'report-updated', id: RS.currentReportId });
                }
            });
        });
    }).catch(function(err) {
        console.error('[AUTOSAVE] IDB save failed:', err && err.message ? err.message : err);
    });
}

/**
 * Actually save report to Supabase
 */
async function saveReportToSupabase() {
    if (RS.isSaving || !RS.activeProject) return;
    RS.isSaving = true;

    try {
        var reportDateStr = getReportDateStr();

        // 1. Upsert the main report record
        // v6.6.15: reportId must come from URL params (set during load)
        // report.js is for editing existing reports, not creating new ones
        var reportId = RS.currentReportId;
        if (!reportId) {
            console.error('[REPORT] No reportId available - cannot save');
            RS.isSaving = false;
            return;
        }

        var reportData = {
            id: reportId,
            project_id: RS.activeProject.id,
            org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || RS.activeProject.orgId || null,
            user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
            device_id: getDeviceId(),
            report_date: reportDateStr,
            status: RS.report.meta?.status || 'draft',
            capture_mode: RS.report.meta?.captureMode || 'guided',
            updated_at: new Date().toISOString()
        };

        var result = await supabaseClient
            .from('reports')
            .upsert(reportData, { onConflict: 'id' });

        if (result.error) {
            console.error('Error saving report:', result.error);
            RS.isSaving = false;
            return;
        }

        RS.currentReportId = reportId;

        // report_data sync is handled by debounced autosave (flushReportBackup)
        // Mark dirty so it flushes on next 5s quiet period
        markReportBackupDirty();

        console.log('[SUPABASE] Report saved successfully');
    } catch (err) {
        console.error('[SUPABASE] Save failed:', err);
    } finally {
        RS.isSaving = false;
    }
}

function showSaveIndicator() {
    var indicator = document.getElementById('saveIndicator');
    indicator.classList.add('visible');
    setTimeout(function() {
        indicator.classList.remove('visible');
    }, 2000);
}

// ============ EXPOSE TO WINDOW ============
window.saveReport = saveReport;
