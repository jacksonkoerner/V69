// ============================================================
// js/interview/finish-processing.js — AI processing + Finish flow
// Sprint 11: Consolidated from ai-processing.js, finish.js
// ============================================================

var IS = window.interviewState;

// ============ AI PROCESSING WEBHOOK ============
var N8N_PROCESS_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report';

/**
 * Build the payload for AI processing
 */
function buildProcessPayload() {
    const todayStr = getTodayDateString();

    return {
        reportId: IS.currentReportId,
        captureMode: IS.report.meta.captureMode || 'guided',

        projectContext: {
            projectId: IS.activeProject?.id || null,
            projectName: IS.activeProject?.projectName || IS.report.project?.projectName || '',
            noabProjectNo: IS.activeProject?.noabProjectNo || '',
            location: IS.activeProject?.location || '',
            engineer: IS.activeProject?.engineer || '',
            primeContractor: IS.activeProject?.primeContractor || '',
            contractors: (IS.activeProject?.contractors || []).map(c => ({
                ...c,
                crews: c.crews || []
            })),
            equipment: IS.activeProject?.equipment || []
        },

        fieldNotes: IS.report.meta.captureMode === 'minimal'
            ? {
                // v6.6: Combine all freeform entries into single string for AI processing
                freeformNotes: (IS.report.freeform_entries || [])
                    .filter(e => e.content && e.content.trim())
                    .sort((a, b) => a.created_at - b.created_at)
                    .map(e => e.content.trim())
                    .join('\n\n') || IS.report.fieldNotes?.freeformNotes || '',
                // Also include raw entries for future AI improvements
                freeform_entries: IS.report.freeform_entries || []
              }
            : {
                workSummary: IS.report.guidedNotes?.workSummary || '',
                issues: IS.report.guidedNotes?.issues || '',
                safety: IS.report.guidedNotes?.safety || ''
              },

        weather: IS.report.overview?.weather || {},

        photos: (IS.report.photos || []).map(p => ({
            id: p.id,
            url: p.url,
            storagePath: p.storagePath,
            caption: p.caption || '',
            timestamp: p.timestamp,
            date: p.date,
            time: p.time,
            gps: p.gps
        })),

        reportDate: IS.report.overview?.date || getLocalDateString(),
        inspectorName: IS.report.overview?.completedBy || '',

        // v6.6: Structured data for AI processing
        operations: IS.report.operations || [],
        equipmentRows: IS.report.equipmentRows || [],
        activities: IS.report.activities || [],
        safety: IS.report.safety || { hasIncidents: false, noIncidents: true, notes: [] },

        // v6: Entry-based notes and toggle states
        entries: IS.report.entries || [],
        toggleStates: IS.report.toggleStates || {}
    };
}

/**
 * Call the AI processing webhook
 */
async function callProcessWebhook(payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch(N8N_PROCESS_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': N8N_WEBHOOK_API_KEY
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data.success && !data.aiGenerated) {
            console.error('Invalid webhook response:', data);
            throw new Error('Invalid response from AI processing');
        }

        // If aiGenerated is a string, try to parse it
        if (typeof data.aiGenerated === 'string') {
            try {
                data.aiGenerated = JSON.parse(data.aiGenerated);
            } catch (e) {
                console.error('Failed to parse aiGenerated string:', e);
            }
        }

        // Validate required fields in AI response
        const ai = data.aiGenerated;
        if (ai) {
            // Ensure arrays exist
            ai.activities = ai.activities || [];
            ai.operations = ai.operations || [];
            ai.equipment = ai.equipment || [];
            ai.generalIssues = ai.generalIssues || [];
            ai.qaqcNotes = ai.qaqcNotes || [];
            ai.safety = ai.safety || { hasIncidents: false, noIncidents: true, notes: '' };
        }

        // Log the AI response for debugging
        console.log('[AI] Received response:', JSON.stringify(data.aiGenerated, null, 2));

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Save AI submission to Supabase (both input and output)
 * @param {Object} originalPayload - The payload sent TO n8n
 * @param {Object} response - The response from n8n
 * @param {number} processingTimeMs - Round-trip time in ms
 */
async function saveAIResponse(originalPayload, response, processingTimeMs) {
    if (!IS.currentReportId) return;

    try {
        const submissionData = {
            report_id: IS.currentReportId,
            org_id: localStorage.getItem(STORAGE_KEYS.ORG_ID) || null,
            original_input: originalPayload || null,
            ai_response: response || null,
            model_used: 'n8n-fieldvoice-refine',
            processing_time_ms: processingTimeMs || null,
            submitted_at: new Date().toISOString()
        };

        // Use upsert to handle retries/reprocessing - prevents duplicate rows
        const { error } = await supabaseClient
            .from('ai_submissions')
            .upsert(submissionData, { onConflict: 'report_id' });

        if (error) {
            console.error('Error saving AI submission:', error);
        }
    } catch (err) {
        console.error('Failed to save AI submission:', err);
    }
}

// ============ NETWORK ERROR MODAL HELPERS ============
/**
 * Show network error modal with retry and drafts options
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {Function} onRetry - Callback when retry is clicked
 * @param {Function} onDrafts - Callback when save to drafts is clicked
 */
function showNetworkErrorModal(title, message, onRetry, onDrafts) {
    const modal = document.getElementById('network-error-modal');
    const titleEl = document.getElementById('network-modal-title');
    const messageEl = document.getElementById('network-modal-message');
    const retryBtn = document.getElementById('network-modal-retry');
    const draftsBtn = document.getElementById('network-modal-drafts');

    titleEl.textContent = title || 'Connection Issue';
    messageEl.textContent = message || 'Unable to submit report. Your data is safe.';

    // Remove old listeners by cloning buttons
    const newRetryBtn = retryBtn.cloneNode(true);
    const newDraftsBtn = draftsBtn.cloneNode(true);
    retryBtn.parentNode.replaceChild(newRetryBtn, retryBtn);
    draftsBtn.parentNode.replaceChild(newDraftsBtn, draftsBtn);

    // Add new listeners
    newRetryBtn.addEventListener('click', () => {
        hideNetworkErrorModal();
        if (onRetry) onRetry();
    });

    newDraftsBtn.addEventListener('click', () => {
        hideNetworkErrorModal();
        if (onDrafts) onDrafts();
    });

    modal.classList.remove('hidden');
}

/**
 * Hide network error modal
 */
function hideNetworkErrorModal() {
    const modal = document.getElementById('network-error-modal');
    modal.classList.add('hidden');
}

/**
 * Handle offline/error scenario for AI processing
 * Sprint 15 (OFF-02): Removed dead sync queue — reports are saved as drafts only.
 * User must manually retry when back online.
 */
function handleOfflineProcessing(payload, redirectToDrafts = false) {
    // Save report as draft in localStorage (primary offline storage)
    IS.report.meta.status = 'pending_refine';
    saveReport();

    console.log('[OFFLINE] Report saved to drafts. Sync queue removed — manual retry required.');

    showToast('Report saved to drafts. Please retry when back online.', 'warning');

    // Redirect to index page if requested
    if (redirectToDrafts) {
        window.location.href = 'index.html';
    }
}


// ============================================================
// Report finishing flow (was finish.js)
// ============================================================

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

        if (window.dataStore && typeof window.dataStore.saveReportData === 'function') {
            try {
                await window.dataStore.saveReportData(IS.currentReportId, reportDataPackage);
                console.log('[LOCAL] Report data saved to IndexedDB:', IS.currentReportId);
            } catch (idbErr) {
                console.warn('[LOCAL] IndexedDB save failed (non-blocking):', idbErr.message);
            }
        }

        // Sprint 4+15 (SUP-02): Sync report data to Supabase with retry
        var _finishReportId = IS.currentReportId;
        var _finishOrgId = localStorage.getItem(STORAGE_KEYS.ORG_ID) || null;
        var _finishPayload = {
            report_id: _finishReportId,
            org_id: _finishOrgId,
            ai_generated: reportDataPackage.aiGenerated || {},
            original_input: reportDataPackage.originalInput || {},
            user_edits: {},
            capture_mode: reportDataPackage.captureMode || 'minimal',
            status: 'refined'
        };

        // Sprint 16: Await Supabase report_data sync with bounded timeout
        // This ensures cloud data is ready if report.html needs the fallback
        try {
            await Promise.race([
                supabaseRetry(function() {
                    return supabaseClient
                        .from('report_data')
                        .upsert(_finishPayload, { onConflict: 'report_id' });
                }, 3, 'FINISH:report_data'),
                new Promise(function(_, reject) {
                    setTimeout(function() { reject(new Error('Supabase sync timeout')); }, 5000);
                })
            ]);
            console.log('[FINISH] Report data synced to Supabase:', _finishReportId);
        } catch (syncErr) {
            console.warn('[FINISH] Supabase sync failed/timed out (IDB fallback available):', syncErr.message);
        }


        // Persist refined metadata in IDB currentReports store
        if (window.dataStore && typeof window.dataStore.saveReport === 'function') {
            await window.dataStore.saveReport({
                id: IS.currentReportId,
                project_id: IS.activeProject?.id,
                project_name: IS.activeProject?.projectName || '',
                date: todayStr,
                reportDate: todayStr,
                report_date: todayStr,
                status: 'refined',
                created_at: IS.report.meta?.createdAt ? new Date(IS.report.meta.createdAt).getTime() : Date.now()
            });
            console.log('[LOCAL] Updated IDB report metadata with refined status:', IS.currentReportId);
        }

        // Verify report data was saved before redirecting
        var verifyData = null;
        if (window.dataStore && typeof window.dataStore.getReportData === 'function') {
            verifyData = await window.dataStore.getReportData(IS.currentReportId);
        }
        if (!verifyData) {
            console.error('[FINISH] Report data verification failed — re-saving...');
            if (window.dataStore && typeof window.dataStore.saveReportData === 'function') {
                window.dataStore.saveReportData(IS.currentReportId, reportDataPackage).catch(function() {});
            }
        }

        // === Show success and redirect ===
        setProcessingStep(4, 'complete');
        showProcessingSuccess();
        await new Promise(r => setTimeout(r, 800)); // Brief pause to show success
        hideProcessingOverlay();

        // Close IDB connections before navigating — prevents iOS Safari
        // from blocking the v7 upgrade on report.html (bfcache keeps old
        // connection alive and BLOCKS the new page's onupgradeneeded).
        if (window.dataStore && typeof window.dataStore.closeAll === 'function') {
            window.dataStore.closeAll();
        }

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
