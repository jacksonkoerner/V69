// ============================================================================
// FieldVoice Pro v6 - AI Refine (ai-refine.js)
//
// Uses: window.reportState (RS)
// ============================================================================

var RS = window.reportState;

// Edge Function proxy URL
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

/**
 * Redirect to interview page to retry AI processing.
 * The old offlineQueue replay was removed (Sprint 15 OFF-02) —
 * the interview flow is the correct place to reprocess.
 */
function retryRefineProcessing() {
    var reportId = RS.currentReportId;
    if (!reportId) {
        alert('No report ID found.');
        return;
    }
    window.location.href = 'quick-interview.html?reportId=' + encodeURIComponent(reportId);
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
