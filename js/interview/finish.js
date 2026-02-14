// Report finishing functions for quick-interview
// Includes: finishMinimalReport, finishReport, finishReportFlow, getTodayDateFormatted

var IS = window.interviewState;

/**
 * Shared finish flow for both minimal and guided modes.
 * All mode-specific behavior is driven by the options parameter.
 *
 * @param {Object} options
 * @param {string} options.mode - 'minimal' or 'guided'
 * @param {string} options.buttonSelector - CSS selector for the finish button
 * @param {string} options.buttonLoadingHtml - HTML to show while processing
 * @param {Function} options.validate - Returns true if valid, false to abort
 * @param {Function} options.prepareReport - Mode-specific report preparation before save/upload
 * @param {Function} options.retryFn - Function to call on retry
 * @param {Function} options.preProcess - Runs save+upload in correct order, manages steps 1-2
 */
async function finishReportFlow(options) {
    // === Show confirmation dialog ===
    const confirmed = await showProcessConfirmation();
    if (!confirmed) return;

    // Early offline check - show modal when offline
    if (!navigator.onLine) {
        showNetworkErrorModal(
            'No Internet Connection',
            'You appear to be offline. Your report data is saved locally.',
            () => options.retryFn(),
            () => {
                showToast('Report saved to drafts', 'info');
                window.location.href = 'index.html';
            }
        );
        return;
    }

    // Mode-specific validation
    if (!options.validate()) return;

    // Get button reference for loading state
    const finishBtn = document.querySelector(options.buttonSelector);
    const originalBtnHtml = finishBtn ? finishBtn.innerHTML : '';

    // Show loading state
    if (finishBtn) {
        finishBtn.disabled = true;
        finishBtn.innerHTML = options.buttonLoadingHtml;
    }
    showToast('Processing with AI...', 'info');

    // === Show processing overlay ===
    showProcessingOverlay();
    setProcessingStep(1, 'active');

    // Mode-specific report preparation (set endTime, guided notes, etc.)
    options.prepareReport();

    // Mode-specific save/upload ordering (steps 1-2)
    await options.preProcess();

    setProcessingStep(3, 'active');

    // Build payload
    const payload = buildProcessPayload();

    // Check if online (may have gone offline during save/upload)
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
            captureMode: result.captureMode || IS.report.meta?.captureMode || options.mode,

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

        // Sprint 4: Sync report data to Supabase report_data table (fire-and-forget)
        try {
            supabaseClient
                .from('report_data')
                .upsert({
                    report_id: IS.currentReportId,
                    ai_generated: reportDataPackage.aiGenerated || {},
                    original_input: reportDataPackage.originalInput || {},
                    user_edits: {},
                    capture_mode: reportDataPackage.captureMode || 'minimal',
                    status: 'refined'
                }, { onConflict: 'report_id' })
                .then(function(res) {
                    if (res.error) console.warn('[FINISH] report_data sync failed:', res.error.message);
                    else console.log('[FINISH] Report data synced to Supabase:', IS.currentReportId);
                });
        } catch (rdErr) {
            console.warn('[FINISH] report_data sync error:', rdErr);
        }


        // v6.9: Use saveCurrentReport helper (sets updated_at, validates)
        saveCurrentReport({
            id: IS.currentReportId,
            project_id: IS.activeProject?.id,
            project_name: IS.activeProject?.projectName || '',
            date: todayStr,
            report_date: todayStr,
            status: 'refined',
            created_at: IS.report.meta?.createdAt ? new Date(IS.report.meta.createdAt).getTime() : Date.now()
        });
        console.log('[LOCAL] Updated fvp_current_reports with refined status:', IS.currentReportId);

        // === Show success and redirect ===
        setProcessingStep(4, 'complete');
        showProcessingSuccess();
        await new Promise(r => setTimeout(r, 800)); // Brief pause to show success
        hideProcessingOverlay();

        // Navigate to report with date and reportId parameters
        window.location.href = `report.html?date=${todayStr}&reportId=${IS.currentReportId}`;
    } catch (error) {
        console.error('AI processing failed:', error);

        // === Show error on overlay ===
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
                options.retryFn();
            },
            () => {
                hideProcessingOverlay();
                handleOfflineProcessing(payload, true);
            }
        );
    }
}

/**
 * Finish the minimal/freeform mode report with AI processing.
 * Thin wrapper around finishReportFlow() — preserves existing API.
 */
async function finishMinimalReport() {
    return finishReportFlow({
        mode: 'minimal',
        buttonSelector: '#minimalModeScreen button[onclick="finishMinimalReport()"]',
        buttonLoadingHtml: '<i class="fas fa-spinner fa-spin mr-2"></i>Processing with AI...',
        retryFn: finishMinimalReport,

        validate() {
            // Check for at least one entry with content
            const entries = IS.report.freeform_entries || [];
            const hasContent = entries.some(e => e.content && e.content.trim());
            if (!hasContent) {
                showToast('Please add at least one field note entry', 'error');
                return false;
            }
            return true;
        },

        prepareReport() {
            // Mark as interview completed
            IS.report.meta.interviewCompleted = true;
            IS.report.overview.endTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        },

        async preProcess() {
            // Minimal mode: save to Supabase first, then upload photos
            await saveReportToSupabase();
            setProcessingStep(1, 'complete');
            setProcessingStep(2, 'active');

            await uploadPendingPhotos();
            setProcessingStep(2, 'complete');
        }
    });
}

/**
 * Finish the guided mode report with AI processing.
 * Thin wrapper around finishReportFlow() — preserves existing API.
 */
async function finishReport() {
    return finishReportFlow({
        mode: 'guided',
        buttonSelector: 'button[onclick="finishReport()"]',
        buttonLoadingHtml: '<i class="fas fa-spinner fa-spin mr-1"></i>Processing...',
        retryFn: finishReport,

        validate() {
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
                return false;
            }

            if (!safetyAnswered) {
                showToast('Please answer the Safety question', 'error');
                // Open the safety section
                const safetyCard = document.querySelector('[data-section="safety"]');
                if (safetyCard && !safetyCard.classList.contains('expanded')) {
                    toggleSection('safety');
                }
                return false;
            }

            return true;
        },

        prepareReport() {
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
        },

        async preProcess() {
            // Guided mode: upload photos first (if online), then save to Supabase
            if (navigator.onLine) {
                await uploadPendingPhotos();
            }
            setProcessingStep(1, 'complete');
            setProcessingStep(2, 'active');

            await saveReportToSupabase();
            setProcessingStep(2, 'complete');
        }
    });
}

function getTodayDateFormatted() {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
