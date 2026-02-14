// ============================================================================
// FieldVoice Pro v6 - Report Page: Submit Flow
// Extracted from report.js (lines ~4141-4403)
//
// Contains: handleSubmit, uploadPDFToStorage, ensureReportExists,
//   saveToFinalReports, updateReportStatus, cleanupLocalStorage,
//   showSubmitLoadingOverlay, showSubmitError, formVal
// ============================================================================

var RS = window.reportState;

// ============ SUBMIT FLOW ============
/**
 * Main submit handler - orchestrates PDF generation, upload, and finalization
 */
async function handleSubmit() {
    if (!navigator.onLine) {
        showSubmitError('Cannot submit offline. Please connect to internet.');
        return;
    }

    if (!RS.report) {
        showSubmitError('No report data found.');
        return;
    }

    if (!RS.currentReportId) {
        showSubmitError('No report ID found. Cannot submit.');
        return;
    }

    // Sprint 11: Duplicate detection — warn if a report for same project+date already exists
    try {
        var dupProjectId = RS.activeProject?.id;
        var dupReportDate = formVal('reportDate') || getReportDateStr();
        if (dupProjectId && dupReportDate) {
            var dupResult = await supabaseClient
                .from('final_reports')
                .select('report_id')
                .eq('project_id', dupProjectId)
                .eq('report_date', dupReportDate)
                .neq('report_id', RS.currentReportId)
                .limit(1);

            if (!dupResult.error && dupResult.data && dupResult.data.length > 0) {
                var proceed = confirm(
                    'A report for this project on ' + dupReportDate + ' already exists. Submit anyway?'
                );
                if (!proceed) {
                    console.log('[SUBMIT] User cancelled due to duplicate warning');
                    return;
                }
            }
        }
    } catch (dupErr) {
        console.warn('[SUBMIT] Duplicate check failed (non-blocking):', dupErr);
        // Non-blocking — proceed with submit even if check fails
    }

    // Show loading overlay
    showSubmitLoadingOverlay(true, 'Generating PDF...');

    try {
        console.log('[SUBMIT] Starting report submission for:', RS.currentReportId);

        // Save current form data first
        saveReportToLocalStorage();

        // Generate PDF
        showSubmitLoadingOverlay(true, 'Generating PDF...');
        var pdf = await generateVectorPDF();
        console.log('[SUBMIT] PDF generated:', pdf.filename);

        // Upload PDF
        showSubmitLoadingOverlay(true, 'Uploading PDF...');
        var pdfUrl = await uploadPDFToStorage(pdf);
        console.log('[SUBMIT] PDF uploaded:', pdfUrl);

        // Ensure report exists
        showSubmitLoadingOverlay(true, 'Saving report...');
        await ensureReportExists();

        // Save to final_reports
        await saveToFinalReports(pdfUrl);

        // Update status
        await updateReportStatus('submitted');

        // Cleanup
        showSubmitLoadingOverlay(true, 'Cleaning up...');
        await cleanupLocalStorage();

        console.log('[SUBMIT] Submit complete!');
        window.location.href = 'index.html?submitted=true';

    } catch (error) {
        console.error('[SUBMIT] Error:', error);
        showSubmitLoadingOverlay(false);
        showSubmitError('Submit failed: ' + error.message);
    }
}

/**
 * Upload PDF to Supabase Storage
 */
async function uploadPDFToStorage(pdf) {
    var storagePath = RS.currentReportId + '/' + pdf.filename;

    var result = await supabaseClient
        .storage
        .from('report-pdfs')
        .upload(storagePath, pdf.blob, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (result.error) throw new Error('PDF upload failed: ' + result.error.message);

    var urlResult = supabaseClient
        .storage
        .from('report-pdfs')
        .getPublicUrl(storagePath);

    return urlResult.data.publicUrl;
}

/**
 * Ensure report exists in reports table (foreign key requirement)
 */
async function ensureReportExists() {
    var reportData = getReportData(RS.currentReportId) || {};
    var reportDate = formVal('reportDate') || getReportDateStr();

    var reportRow = {
        id: RS.currentReportId,
        project_id: RS.activeProject?.id || null,
        device_id: getDeviceId(),
        user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
        report_date: reportDate,
        status: 'draft',
        capture_mode: reportData.captureMode || 'guided',
        created_at: reportData.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    var result = await supabaseClient
        .from('reports')
        .upsert(reportRow, { onConflict: 'id' });

    if (result.error) throw new Error('Failed to create report record: ' + result.error.message);
}

/**
 * Save report metadata to final_reports table (lean — new schema)
 */
async function saveToFinalReports(pdfUrl) {
    var submittedAt = new Date().toISOString();
    var reportDateStr = RS.report.overview?.date || new Date().toISOString().split('T')[0];

    var finalReportData = {
        report_id: RS.currentReportId,
        project_id: RS.activeProject?.id || null,
        user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
        report_date: reportDateStr,
        inspector_name: RS.report.overview?.completedBy || RS.userSettings?.fullName || '',
        pdf_url: pdfUrl,
        submitted_at: submittedAt,
        status: 'submitted'
    };

    var result = await supabaseClient
        .from('final_reports')
        .upsert(finalReportData, { onConflict: 'report_id' });

    if (result.error) throw new Error('Failed to save report: ' + result.error.message);
}

/**
 * Update reports table status
 */
async function updateReportStatus(status) {
    var submittedAt = new Date().toISOString();
    var result = await supabaseClient
        .from('reports')
        .update({
            status: status,
            submitted_at: submittedAt,
            updated_at: submittedAt
        })
        .eq('id', RS.currentReportId);

    if (result.error) throw new Error('Failed to update status: ' + result.error.message);

    RS.report.meta = RS.report.meta || {};
    RS.report.meta.submitted = true;
    RS.report.meta.submittedAt = submittedAt;
    RS.report.meta.status = 'submitted';
}

/**
 * Clean up local storage after successful submit
 */
async function cleanupLocalStorage() {
    deleteReportData(RS.currentReportId);

    // v6.9: Keep entry in fvp_current_reports with submitted status + timestamp
    // Dashboard will show it for 24hrs, then pruning removes it
    var currentReports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};
    if (currentReports[RS.currentReportId]) {
        currentReports[RS.currentReportId].status = 'submitted';
        currentReports[RS.currentReportId].submitted_at = new Date().toISOString();
        currentReports[RS.currentReportId].updated_at = Date.now();
    }
    setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, currentReports);

    if (window.idb && typeof window.idb.deletePhotosByReportId === 'function') {
        try {
            await window.idb.deletePhotosByReportId(RS.currentReportId);
        } catch (e) {
            console.warn('[SUBMIT] Could not clean IndexedDB photos:', e);
        }
    }
}

/**
 * Helper to read form field value (for submit/PDF functions)
 */
function formVal(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback || '';
    if (el.tagName === 'SELECT') {
        var val = el.value;
        return (val && val !== 'Select...') ? val : (fallback || '');
    }
    return el.value || el.textContent || fallback || '';
}

/**
 * Show/hide submit loading overlay
 */
function showSubmitLoadingOverlay(show, statusText) {
    var overlay = document.getElementById('submitLoadingOverlay');

    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'submitLoadingOverlay';
            overlay.className = 'submit-overlay';
            overlay.innerHTML =
                '<div class="submit-spinner"><i class="fas fa-spinner fa-spin"></i></div>' +
                '<div class="submit-status" id="submitStatusText">' + (statusText || 'Processing...') + '</div>';
            document.body.appendChild(overlay);
        } else {
            var statusEl = document.getElementById('submitStatusText');
            if (statusEl) statusEl.textContent = statusText || 'Processing...';
            overlay.style.display = 'flex';
        }

        // Disable submit button
        var btn = document.getElementById('submitReportBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }
    } else {
        if (overlay) overlay.style.display = 'none';

        // Re-enable submit button
        var btn = document.getElementById('submitReportBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Report';
        }
    }
}

/**
 * Show error message
 */
function showSubmitError(message) {
    var existingToast = document.getElementById('submitErrorToast');
    if (existingToast) existingToast.remove();

    var toast = document.createElement('div');
    toast.id = 'submitErrorToast';
    toast.style.cssText =
        'position: fixed; top: 20px; left: 50%; transform: translateX(-50%);' +
        'background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px;' +
        'font-size: 14px; font-weight: 500; z-index: 10000;' +
        'box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 12px; max-width: 90vw;';
    toast.innerHTML =
        '<i class="fas fa-exclamation-circle"></i>' +
        '<span>' + escapeHtml(message) + '</span>' +
        '<button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:white; cursor:pointer; padding:4px; margin-left:8px;">' +
            '<i class="fas fa-times"></i>' +
        '</button>';
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentElement) toast.remove(); }, 8000);
}

// ============ EXPOSE TO WINDOW ============
window.handleSubmit = handleSubmit;
