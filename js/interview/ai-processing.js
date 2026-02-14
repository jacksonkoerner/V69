// AI processing and webhook functions for quick-interview
// Includes: buildProcessPayload, callProcessWebhook, saveAIResponse,
//           showNetworkErrorModal, hideNetworkErrorModal, handleOfflineProcessing

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

        reportDate: IS.report.overview?.date || new Date().toLocaleDateString(),
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
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(N8N_PROCESS_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
 * v6: Uses addToSyncQueue() from storage-keys.js for offline queue
 */
function handleOfflineProcessing(payload, redirectToDrafts = false) {
    // Sprint 5: Use the report's own project ID, not ACTIVE_PROJECT_ID
    const activeProjectId = IS.activeProject?.id;
    const todayStr = getTodayDateString();

    // v6: Use addToSyncQueue for offline operations
    const syncOperation = {
        type: 'report',
        action: 'upsert',
        data: {
            projectId: activeProjectId,
            projectName: IS.report.overview?.projectName || IS.activeProject?.projectName || 'Unknown Project',
            reportDate: todayStr,
            captureMode: IS.report.meta?.captureMode || 'guided',
            payload: payload,
            reportData: {
                meta: IS.report.meta,
                overview: IS.report.overview,
                weather: IS.report.overview?.weather,
                guidedNotes: IS.report.guidedNotes,
                fieldNotes: IS.report.fieldNotes,
                activities: IS.report.activities,
                operations: IS.report.operations,
                equipment: IS.report.equipment,
                photos: IS.report.photos,
                safety: IS.report.safety,
                generalIssues: IS.report.generalIssues,
                qaqcNotes: IS.report.qaqcNotes,
                contractorCommunications: IS.report.contractorCommunications,
                visitorsRemarks: IS.report.visitorsRemarks,
                additionalNotes: IS.report.additionalNotes,
                reporter: IS.report.reporter
            }
        },
        timestamp: Date.now()
    };

    // v6: Add to sync queue using storage-keys.js helper
    addToSyncQueue(syncOperation);
    console.log('[OFFLINE] Report added to sync queue');

    // Also update local meta status
    IS.report.meta.status = 'pending_refine';
    saveReport();

    showToast("You're offline. Report saved to drafts.", 'warning');

    // Redirect to index page if requested
    if (redirectToDrafts) {
        window.location.href = 'index.html';
    }
}
