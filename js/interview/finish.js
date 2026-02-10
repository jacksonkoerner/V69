// Report finishing functions for quick-interview
// Includes: finishMinimalReport, finishReport, getTodayDateFormatted

var IS = window.interviewState;

/**
 * Finish the minimal mode report with AI processing
 */
// FINISH FLOW (minimal/freeform mode) — duplicate exists at finishReport() ~line 5004. Keep in sync.
async function finishMinimalReport() {
    // === NEW: Show confirmation dialog ===
    const confirmed = await showProcessConfirmation();
    if (!confirmed) return;

    // Early offline check - show modal when offline
    if (!navigator.onLine) {
        showNetworkErrorModal(
            'No Internet Connection',
            'You appear to be offline. Your report data is saved locally.',
            () => finishMinimalReport(),  // Retry
            () => {
                showToast('Report saved to drafts', 'info');
                window.location.href = 'index.html';
            }
        );
        return;
    }

    // Validate - check for at least one entry with content
    const entries = IS.report.freeform_entries || [];
    const hasContent = entries.some(e => e.content && e.content.trim());
    if (!hasContent) {
        showToast('Please add at least one field note entry', 'error');
        return;
    }

    // Get button reference for loading state
    const finishBtn = document.querySelector('#minimalModeScreen button[onclick="finishMinimalReport()"]');
    const originalBtnHtml = finishBtn ? finishBtn.innerHTML : '';

    // Show loading state
    if (finishBtn) {
        finishBtn.disabled = true;
        finishBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing with AI...';
    }
    showToast('Processing with AI...', 'info');

    // === NEW: Show processing overlay ===
    showProcessingOverlay();
    setProcessingStep(1, 'active');

    // Mark as interview completed
    IS.report.meta.interviewCompleted = true;
    IS.report.overview.endTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    // Ensure report is saved to Supabase first
    await saveReportToSupabase();
    setProcessingStep(1, 'complete');
    setProcessingStep(2, 'active');

    // Upload any pending photos and insert metadata into photos table
    await uploadPendingPhotos();
    setProcessingStep(2, 'complete');
    setProcessingStep(3, 'active');

    // Build payload
    const payload = buildProcessPayload();

    // Check if online
    if (!navigator.onLine) {
        hideProcessingOverlay();
        handleOfflineProcessing(payload, true);
        return;
    }

    const startTime = Date.now();

    // Call webhook
    try {
        const result = await callProcessWebhook(payload);
        setProcessingStep(3, 'complete');
        setProcessingStep(4, 'active');
        const processingTime = Date.now() - startTime;

        // Save AI submission to Supabase (input + output)
        await saveAIResponse(payload, result.aiGenerated, processingTime);

        // Save AI response to local report
        if (result.aiGenerated) {
            IS.report.aiGenerated = result.aiGenerated;
        }
        IS.report.meta.status = 'refined';
        await saveReportToSupabase();

        // v6.6.2: Save complete report package to single localStorage key
        // This is the source of truth for report.html
        const todayStr = getTodayDateString();
        const reportDataPackage = {
            reportId: IS.currentReportId,
            projectId: IS.activeProject?.id,
            reportDate: todayStr,
            status: 'refined',

            // From n8n webhook response
            aiGenerated: result.aiGenerated || {},
            captureMode: result.captureMode || IS.report.meta?.captureMode || 'minimal',

            // Original field notes (for "Original Notes" tab)
            originalInput: result.originalInput || payload,

            // User edits - initialize empty (will be populated on report.html)
            userEdits: {},

            // Metadata
            createdAt: IS.report.meta?.createdAt || new Date().toISOString(),
            lastSaved: new Date().toISOString()
        };

        const saveSuccess = saveReportData(IS.currentReportId, reportDataPackage);
        if (saveSuccess) {
            console.log('[LOCAL] Complete report package saved to localStorage:', IS.currentReportId);
        } else {
            console.warn('[LOCAL] Failed to save report package to localStorage');
        }

        // v6.9: Use saveCurrentReport helper (sets updated_at, validates)
        saveCurrentReport({
            id: IS.currentReportId,
            project_id: IS.activeProject?.id,
            project_name: IS.activeProject?.projectName || IS.activeProject?.project_name,
            date: todayStr,
            report_date: todayStr,
            status: 'refined',
            created_at: IS.report.meta?.createdAt ? new Date(IS.report.meta.createdAt).getTime() : Date.now()
        });
        console.log('[LOCAL] Updated fvp_current_reports with refined status:', IS.currentReportId);

        // === NEW: Show success and redirect ===
        setProcessingStep(4, 'complete');
        showProcessingSuccess();
        await new Promise(r => setTimeout(r, 800)); // Brief pause to show success
        hideProcessingOverlay();

        // Navigate to report with date and reportId parameters
        window.location.href = `report.html?date=${todayStr}&reportId=${IS.currentReportId}`;
    } catch (error) {
        console.error('AI processing failed:', error);

        // === NEW: Show error on overlay ===
        showProcessingError(error.message || 'Could not reach the server. Your data is safe.');

        // Restore button state
        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.innerHTML = originalBtnHtml;
        }

        // Show modal with retry/drafts options (hidden behind overlay error state)
        showNetworkErrorModal(
            'Submission Failed',
            'Could not reach the server. Your report data is safe.',
            () => {
                hideProcessingOverlay();
                finishMinimalReport();  // Retry
            },
            () => {
                hideProcessingOverlay();
                handleOfflineProcessing(payload, true);
            }
        );
    }
}

function getTodayDateFormatted() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// FINISH FLOW (guided mode) — duplicate exists at finishMinimalReport() ~line 2349. Keep in sync.
async function finishReport() {
    // === NEW: Show confirmation dialog ===
    const confirmed = await showProcessConfirmation();
    if (!confirmed) return;

    // Early offline check - show modal when offline
    if (!navigator.onLine) {
        showNetworkErrorModal(
            'No Internet Connection',
            'You appear to be offline. Your report data is saved locally.',
            () => finishReport(),  // Retry
            () => {
                showToast('Report saved to drafts', 'info');
                window.location.href = 'index.html';
            }
        );
        return;
    }

    // v6.9: Validate required fields - check contractor/crew work entries
    let hasWorkSummary = false;
    if (IS.projectContractors && IS.projectContractors.length > 0) {
        // Check if any contractor has work logged OR all marked as no work
        const allAccountedFor = IS.projectContractors.every(contractor => {
            const activity = getContractorActivity(contractor.id);
            const crews = contractor.crews || [];
            if (crews.length === 0) {
                const entries = getContractorWorkEntries(contractor.id);
                return (activity?.noWork && entries.length === 0) || entries.length > 0;
            } else {
                // For crew-based contractors: master no-work or at least one crew has entries
                if (activity?.noWork) return true;
                return crews.some(crew => getCrewWorkEntries(contractor.id, crew.id).length > 0);
            }
        });
        // Check if at least one has entries OR all are marked no work
        const anyWork = IS.projectContractors.some(contractor => {
            const crews = contractor.crews || [];
            if (crews.length === 0) {
                return getContractorWorkEntries(contractor.id).length > 0;
            } else {
                return crews.some(crew => getCrewWorkEntries(contractor.id, crew.id).length > 0);
            }
        });
        const allNoWork = IS.projectContractors.every(contractor => {
            const activity = getContractorActivity(contractor.id);
            return activity?.noWork;
        });
        hasWorkSummary = allAccountedFor && (anyWork || allNoWork);
    }
    const safetyAnswered = IS.report.safety.noIncidents === true || IS.report.safety.hasIncidents === true;

    if (!hasWorkSummary) {
        showToast('Work Summary is required - log work for each contractor or mark "No work"', 'error');
        // Open the activities section to show user where to fill
        const activitiesCard = document.querySelector('[data-section="activities"]');
        if (activitiesCard && !activitiesCard.classList.contains('expanded')) {
            toggleSection('activities');
        }
        return;
    }

    if (!safetyAnswered) {
        showToast('Please answer the Safety question', 'error');
        // Open the safety section
        const safetyCard = document.querySelector('[data-section="safety"]');
        if (safetyCard && !safetyCard.classList.contains('expanded')) {
            toggleSection('safety');
        }
        return;
    }

    // Get button reference for loading state
    const finishBtn = document.querySelector('button[onclick="finishReport()"]');
    const originalBtnHtml = finishBtn ? finishBtn.innerHTML : '';

    // Show loading state
    if (finishBtn) {
        finishBtn.disabled = true;
        finishBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Processing...';
    }
    showToast('Processing with AI...', 'info');

    // === NEW: Show processing overlay ===
    showProcessingOverlay();
    setProcessingStep(1, 'active');

    // Set up report data
    IS.report.overview.endTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    IS.report.meta.interviewCompleted = true;
    if (IS.report.overview.startTime) {
        const start = new Date(`2000/01/01 ${IS.report.overview.startTime}`);
        const end = new Date(`2000/01/01 ${IS.report.overview.endTime}`);
        const diffMs = end - start;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        IS.report.overview.shiftDuration = `${hours}.${String(mins).padStart(2, '0')} hours`;
    }
    if (IS.report.safety.notes.length === 0) { IS.report.safety.notes.push('No safety incidents reported.'); }

    // Store guided notes for AI processing
    IS.report.guidedNotes.issues = IS.report.generalIssues?.join('\n') || '';
    IS.report.guidedNotes.safety = IS.report.safety.noIncidents ? 'No incidents reported' : (IS.report.safety.hasIncidents ? 'INCIDENT REPORTED: ' + IS.report.safety.notes.join('; ') : '');

    // Upload any pending photos from IndexedDB before saving report
    if (navigator.onLine) {
        await uploadPendingPhotos();
    }
    setProcessingStep(1, 'complete');
    setProcessingStep(2, 'active');

    // Ensure report is saved to Supabase first
    await saveReportToSupabase();
    setProcessingStep(2, 'complete');
    setProcessingStep(3, 'active');

    // Build payload
    const payload = buildProcessPayload();

    // Check if online
    if (!navigator.onLine) {
        hideProcessingOverlay();
        handleOfflineProcessing(payload, true);
        return;
    }

    const startTime = Date.now();

    // Call webhook
    try {
        const result = await callProcessWebhook(payload);
        setProcessingStep(3, 'complete');
        setProcessingStep(4, 'active');
        const processingTime = Date.now() - startTime;

        // Save AI submission to Supabase (input + output)
        await saveAIResponse(payload, result.aiGenerated, processingTime);

        // Save AI response to local report
        if (result.aiGenerated) {
            IS.report.aiGenerated = result.aiGenerated;
        }
        IS.report.meta.status = 'refined';
        await saveReportToSupabase();

        // v6.6.2: Save complete report package to single localStorage key
        // This is the source of truth for report.html
        const todayStr = getTodayDateString();
        const reportDataPackage = {
            reportId: IS.currentReportId,
            projectId: IS.activeProject?.id,
            reportDate: todayStr,
            status: 'refined',

            // From n8n webhook response
            aiGenerated: result.aiGenerated || {},
            captureMode: result.captureMode || IS.report.meta?.captureMode || 'guided',

            // Original field notes (for "Original Notes" tab)
            originalInput: result.originalInput || payload,

            // User edits - initialize empty (will be populated on report.html)
            userEdits: {},

            // Metadata
            createdAt: IS.report.meta?.createdAt || new Date().toISOString(),
            lastSaved: new Date().toISOString()
        };

        const saveSuccess = saveReportData(IS.currentReportId, reportDataPackage);
        if (saveSuccess) {
            console.log('[LOCAL] Complete report package saved to localStorage:', IS.currentReportId);
        } else {
            console.warn('[LOCAL] Failed to save report package to localStorage');
        }

        // v6.9: Use saveCurrentReport helper (sets updated_at, validates)
        saveCurrentReport({
            id: IS.currentReportId,
            project_id: IS.activeProject?.id,
            project_name: IS.activeProject?.projectName || IS.activeProject?.project_name,
            date: todayStr,
            report_date: todayStr,
            status: 'refined',
            created_at: IS.report.meta?.createdAt ? new Date(IS.report.meta.createdAt).getTime() : Date.now()
        });
        console.log('[LOCAL] Updated fvp_current_reports with refined status:', IS.currentReportId);

        // === NEW: Show success and redirect ===
        setProcessingStep(4, 'complete');
        showProcessingSuccess();
        await new Promise(r => setTimeout(r, 800)); // Brief pause to show success
        hideProcessingOverlay();

        // Navigate to report with date and reportId parameters
        window.location.href = `report.html?date=${todayStr}&reportId=${IS.currentReportId}`;
    } catch (error) {
        console.error('AI processing failed:', error);

        // === NEW: Show error on overlay ===
        showProcessingError(error.message || 'Could not reach the server. Your data is safe.');

        // Restore button state
        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.innerHTML = originalBtnHtml;
        }

        // Show modal with retry/drafts options (hidden behind overlay error state)
        showNetworkErrorModal(
            'Submission Failed',
            'Could not reach the server. Your report data is safe.',
            () => {
                hideProcessingOverlay();
                finishReport();  // Retry
            },
            () => {
                hideProcessingOverlay();
                handleOfflineProcessing(payload, true);
            }
        );
    }
}
