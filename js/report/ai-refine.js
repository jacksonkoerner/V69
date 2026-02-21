// ============================================================================
// FieldVoice Pro v6 - AI Refine (ai-refine.js)
//
// Uses: window.reportState (RS)
// ============================================================================

var RS = window.reportState;

var N8N_PROCESS_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report';
var N8N_REFINE_TEXT_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text';
var EDGE_REFINE_TEXT_URL = SUPABASE_URL + '/functions/v1/refine-text';

var SECTION_MAP = {
    'issuesText': 'issues',
    'qaqcText': 'inspections',
    'safetyText': 'safety',
    'communicationsText': 'activities',
    'visitorsText': 'visitors'
};

function checkPendingRefineStatus() {
    if (RS.report?.meta?.status === 'pending_refine') {
        document.getElementById('pendingRefineBanner').classList.remove('hidden');
    } else {
        document.getElementById('pendingRefineBanner').classList.add('hidden');
    }
}

async function retryRefineProcessing() {
    if (!navigator.onLine) {
        alert('Still offline - please connect to the internet and try again.');
        return;
    }

    var queued = RS.report?.meta?.offlineQueue?.find(function(q) { return q.type === 'refine'; });
    if (!queued) {
        alert('No pending processing found.');
        return;
    }

    var retryBtn = document.getElementById('retryRefine');
    var originalBtnHtml = retryBtn.innerHTML;
    retryBtn.disabled = true;
    retryBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Processing...';

    try {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

        var response = await fetch(N8N_PROCESS_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': N8N_WEBHOOK_API_KEY
            },
            body: JSON.stringify(queued.payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Webhook failed: ' + response.status);
        }

        var result = await response.json();

        if (result.refinedReport) {
            RS.report.aiGenerated = result.refinedReport;
            RS.report.originalInput = result.originalInput || null;
            RS.report.aiCaptureMode = result.captureMode || null;
        } else if (result.aiGenerated) {
            RS.report.aiGenerated = result.aiGenerated;
        }
        RS.report.meta.status = 'refined';

        RS.report.meta.offlineQueue = RS.report.meta.offlineQueue.filter(function(q) { return q.type !== 'refine'; });
        saveReport();

        document.getElementById('pendingRefineBanner').classList.add('hidden');
        alert('AI processing complete! Refreshing data...');
        location.reload();

    } catch (error) {
        console.error('Retry failed:', error);
        retryBtn.disabled = false;
        retryBtn.innerHTML = originalBtnHtml;
        alert('Processing failed. Please try again later.');
    }
}

async function refineTextField(textareaId) {
    var textarea = document.getElementById(textareaId);
    if (!textarea) {
        console.error('[REFINE] Textarea not found:', textareaId);
        return;
    }

    var originalText = textarea.value.trim();
    if (!originalText) {
        alert('Nothing to refine \u2014 enter some notes first.');
        return;
    }

    var btn = document.querySelector('[data-refine-for="' + textareaId + '"]');
    var originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Refining...';
    }

    try {
        var section = SECTION_MAP[textareaId] || 'additionalNotes';
        var payload = {
            originalText: originalText,
            section: section,
            reportContext: {
                projectName: RS.activeProject?.projectName || '',
                reporterName: RS.userSettings?.fullName || '',
                date: RS.report?.overview?.date || new Date().toISOString().split('T')[0]
            }
        };

        console.log('[REFINE] Sending to refine-text edge function:', { textareaId: textareaId, section: section });

        var sessionResult = await supabaseClient.auth.getSession();
        var accessToken = sessionResult?.data?.session?.access_token;
        if (!accessToken) {
            throw new Error('Not authenticated — please sign in again');
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 20000);

        var response = await fetch(EDGE_REFINE_TEXT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Webhook failed: ' + response.status);
        }

        var result = await response.json();
        var refinedText = result.refinedText;

        if (!refinedText || refinedText.includes('[not provided]')) {
            throw new Error('AI returned empty or invalid refined text');
        }

        console.log('[REFINE] Got refined text for', textareaId, ':', refinedText.substring(0, 100));

        textarea.value = refinedText;
        textarea.classList.add('user-edited');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        if (btn) {
            btn.innerHTML = '<i class="fas fa-check mr-1"></i>Done!';
            btn.classList.add('bg-green-600');
            setTimeout(function() {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
                btn.classList.remove('bg-green-600');
            }, 2000);
        }

    } catch (error) {
        console.error('[REFINE] Failed:', error);

        if (btn) {
            btn.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Failed';
            btn.classList.add('bg-red-600');
            setTimeout(function() {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
                btn.classList.remove('bg-red-600');
            }, 2000);
        }
    }
}

async function refineContractorNarrative(contractorId) {
    var textarea = document.getElementById('narrative_' + contractorId);
    if (!textarea) {
        console.error('[REFINE] Narrative textarea not found for contractor:', contractorId);
        return;
    }

    var originalText = textarea.value.trim();
    if (!originalText) {
        alert('Nothing to refine \u2014 enter work summary notes first.');
        return;
    }

    var btn = document.querySelector('[data-refine-for="narrative_' + contractorId + '"]');
    var originalBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Refining...';
    }

    try {
        var contractor = RS.projectContractors.find(function(c) { return c.id === contractorId; });
        var payload = {
            originalText: originalText,
            section: 'activities',
            reportContext: {
                projectName: RS.activeProject?.projectName || '',
                reporterName: RS.userSettings?.fullName || '',
                date: RS.report?.overview?.date || new Date().toISOString().split('T')[0],
                contractorName: contractor?.name || 'Unknown Contractor'
            }
        };

        console.log('[REFINE] Sending contractor narrative to refine-text edge function:', contractorId);

        var sessionResult = await supabaseClient.auth.getSession();
        var accessToken = sessionResult?.data?.session?.access_token;
        if (!accessToken) {
            throw new Error('Not authenticated — please sign in again');
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 20000);

        var response = await fetch(EDGE_REFINE_TEXT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Webhook failed: ' + response.status);
        }

        var result = await response.json();
        var refinedText = result.refinedText;

        if (!refinedText || refinedText.includes('[not provided]')) {
            throw new Error('AI returned empty or invalid refined text');
        }

        textarea.value = refinedText;
        textarea.classList.add('user-edited');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        if (btn) {
            btn.innerHTML = '<i class="fas fa-check mr-1"></i>Done!';
            btn.classList.add('bg-green-600');
            setTimeout(function() {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
                btn.classList.remove('bg-green-600');
            }, 2000);
        }

    } catch (error) {
        console.error('[REFINE] Contractor narrative refine failed:', error);
        if (btn) {
            btn.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>Failed';
            btn.classList.add('bg-red-600');
            setTimeout(function() {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
                btn.classList.remove('bg-red-600');
            }, 2000);
        }
    }
}

// Expose to window for HTML onclick handlers
window.retryRefineProcessing = retryRefineProcessing;
window.refineTextField = refineTextField;
window.refineContractorNarrative = refineContractorNarrative;
