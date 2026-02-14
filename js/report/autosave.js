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

// Backup timer state
var _reportBackupDirty = false;
var _reportBackupTimer = null;

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
        org_id: localStorage.getItem('fvp_org_id') || null,
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

    // Read current data to preserve fields we don't modify here
    var existingData = getReportData(RS.currentReportId) || {};

    // Build the report object to save (matches spec structure)
    var reportToSave = {
        reportId: RS.currentReportId,
        projectId: existingData.projectId || RS.activeProject?.id,
        reportDate: existingData.reportDate || getReportDateStr(),
        status: RS.report.meta?.status || existingData.status || 'refined',

        // From n8n webhook response (preserve original)
        aiGenerated: RS.report.aiGenerated || existingData.aiGenerated || {},
        captureMode: RS.report.aiCaptureMode || existingData.captureMode || 'minimal',

        // Original field notes (preserve original)
        originalInput: RS.report.originalInput || existingData.originalInput || {},

        // User edits - this is what we're updating
        userEdits: RS.report.userEdits || {},

        // Metadata
        createdAt: existingData.createdAt || RS.report.meta?.createdAt || new Date().toISOString(),
        lastSaved: new Date().toISOString()
    };

    // Use saveReportData from storage-keys.js
    var success = saveReportData(RS.currentReportId, reportToSave);
    if (success) {
        console.log('[LOCAL] Report saved to localStorage:', RS.currentReportId);
    } else {
        console.error('[LOCAL] Failed to save report to localStorage');
    }

    // Also update current_reports status so dashboard reflects correct state
    if (RS.currentReportId) {
        var currentReport = getCurrentReport(RS.currentReportId);
        if (currentReport) {
            currentReport.status = RS.report?.meta?.status || currentReport.status;
            currentReport.updated_at = Date.now();
            if (typeof saveCurrentReportSync === 'function') {
                saveCurrentReportSync(currentReport);
            } else {
                saveCurrentReport(currentReport);
            }
        }
    }
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
