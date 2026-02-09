// ============================================================================
// FieldVoice Pro v6 - Report Page (report.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem
// - config.js: supabaseClient
// - supabase-utils.js: fromSupabaseProject, fromSupabaseContractor, fromSupabaseEquipment
// - ui-utils.js: escapeHtml
// ============================================================================

(function() {
    'use strict';

    // ============ STATE ============
    let report = null;
    let currentReportId = null; // Supabase report ID
    let activeProject = null;
    let projectContractors = [];
    let userEdits = {}; // Track user edits separately
    let userSettings = null;
    let saveTimeout = null;
    let isSaving = false;
    let isReadonly = false;
    let currentTab = 'form';

    const N8N_PROCESS_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report';
    const N8N_REFINE_TEXT_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text';

    // Section name mapping for refine-text API
    const SECTION_MAP = {
        'issuesText': 'issues',
        'qaqcText': 'inspections',
        'safetyText': 'safety',
        'communicationsText': 'activities',
        'visitorsText': 'visitors'
    };

    // ============ INITIALIZATION ============
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            // Load project and user settings from Supabase
            const [projectResult, settingsResult] = await Promise.all([
                window.dataLayer.loadActiveProject(),
                window.dataLayer.loadUserSettings()
            ]);
            activeProject = projectResult;
            userSettings = settingsResult;
            if (activeProject) {
                projectContractors = activeProject.contractors || [];
            }

            // Load report data from Supabase
            report = await loadReport();

            // Initialize user edits tracking
            if (!report.userEdits) report.userEdits = {};
            userEdits = report.userEdits;

            // Mark report as viewed
            if (!report.meta) report.meta = {};
            report.meta.reportViewed = true;
            await saveReportSilent();

            // Populate all fields
            populateAllFields();

            // Populate original notes view
            populateOriginalNotes();

            // Check for pending refine status
            checkPendingRefineStatus();

            // Setup auto-save listeners
            setupAutoSave();

            // Initialize auto-expand textareas
            initAllAutoExpandTextareas();

            // Update header date
            updateHeaderDate();

            // Initialize debug panel
            initializeDebugPanel();

            // Check for tab query param (e.g., from finalreview.html redirect)
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');
            if (tabParam === 'preview') {
                switchTab('preview');
            }

            // Re-scale preview on window resize
            window.addEventListener('resize', () => scalePreviewToFit());

        } catch (err) {
            console.error('Failed to initialize report page:', err);
        }
    });

    // ============ TAB SWITCHING ============
    function switchTab(tab) {
        currentTab = tab;
        const tabFormView = document.getElementById('tabFormView');
        const tabOriginalNotes = document.getElementById('tabOriginalNotes');
        const tabPreview = document.getElementById('tabPreview');
        const formViewContent = document.getElementById('formViewContent');
        const originalNotesView = document.getElementById('originalNotesView');
        const previewContent = document.getElementById('previewContent');
        const previewBottomBar = document.getElementById('previewBottomBar');

        // Reset all tabs
        [tabFormView, tabOriginalNotes, tabPreview].forEach(btn => {
            if (btn) {
                btn.classList.remove('border-dot-orange', 'text-white');
                btn.classList.add('border-transparent', 'text-slate-400');
            }
        });

        // Hide all views
        formViewContent.classList.add('hidden');
        originalNotesView.classList.add('hidden');
        previewContent.classList.add('hidden');
        if (previewBottomBar) previewBottomBar.classList.add('hidden');

        if (tab === 'form') {
            tabFormView.classList.add('border-dot-orange', 'text-white');
            tabFormView.classList.remove('border-transparent', 'text-slate-400');
            formViewContent.classList.remove('hidden');
        } else if (tab === 'notes') {
            tabOriginalNotes.classList.add('border-dot-orange', 'text-white');
            tabOriginalNotes.classList.remove('border-transparent', 'text-slate-400');
            originalNotesView.classList.remove('hidden');
        } else if (tab === 'preview') {
            tabPreview.classList.add('border-dot-orange', 'text-white');
            tabPreview.classList.remove('border-transparent', 'text-slate-400');
            previewContent.classList.remove('hidden');
            if (previewBottomBar) previewBottomBar.classList.remove('hidden');
            // Force-save all contractor activities before rendering preview
            // (in case user didn't blur a field)
            document.querySelectorAll('.contractor-narrative').forEach(el => {
                if (el.dataset.contractorId) updateContractorActivity(el.dataset.contractorId);
            });
            // Save text field edits
            saveTextFieldEdits();
            // Render the preview with live data
            renderPreview();
        }
    }

    // ============ ORIGINAL NOTES POPULATION ============
    /**
     * v6.6: Updated to use originalInput from n8n response when available
     * - If originalInput exists, use it as the source of original data sent to AI
     * - If aiCaptureMode is 'guided', render structured tables by section
     * - If aiCaptureMode is 'freeform', render chronological entry list
     * - Falls back to legacy report.fieldNotes/guidedNotes for older reports
     */
    function populateOriginalNotes() {
        if (!report) return;

        // v6.6: Use aiCaptureMode from n8n response, fall back to meta.captureMode
        const mode = report.aiCaptureMode || report.meta?.captureMode || 'guided';
        document.getElementById('captureModeBadge').textContent =
            mode === 'minimal' || mode === 'freeform' ? 'Quick Notes' : 'Guided';

        // v6.6: Use originalInput from n8n response when available
        const original = report.originalInput;

        if (mode === 'minimal' || mode === 'freeform') {
            // === FREEFORM MODE ===
            document.getElementById('minimalNotesSection').classList.remove('hidden');
            document.getElementById('guidedNotesSection').classList.add('hidden');

            let freeformContent = '';
            if (original?.fieldNotes?.freeform_entries?.length > 0) {
                freeformContent = original.fieldNotes.freeform_entries
                    .filter(e => e.content?.trim())
                    .sort((a, b) => new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0))
                    .map(e => {
                        const time = e.timestamp || e.created_at;
                        const timeStr = time ? new Date(time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                        return timeStr ? `[${timeStr}] ${e.content}` : e.content;
                    })
                    .join('\n\n');
            } else if (original?.fieldNotes?.freeformNotes) {
                freeformContent = original.fieldNotes.freeformNotes;
            } else if (report.fieldNotes?.freeformNotes) {
                freeformContent = report.fieldNotes.freeformNotes;
            }

            document.getElementById('originalFreeformNotes').textContent = freeformContent || 'None';

        } else {
            // === GUIDED MODE ===
            document.getElementById('minimalNotesSection').classList.add('hidden');
            document.getElementById('guidedNotesSection').classList.remove('hidden');

            // Build contractor lookup from projectContext
            const contractors = original?.projectContext?.contractors || [];
            const contractorMap = {};
            contractors.forEach(c => {
                contractorMap[c.id] = c.name || c.company || 'Unknown Contractor';
            });

            // --- WORK SUMMARY (per contractor) ---
            renderWorkByContractor(original, contractorMap);

            // --- PERSONNEL ---
            renderPersonnelTable(original, contractorMap);

            // --- EQUIPMENT ---
            renderEquipmentTable(original, contractorMap);

            // --- OTHER SECTIONS ---
            renderEntriesSection(original, 'issues', 'originalIssues');
            renderEntriesSection(original, 'qaqc', 'originalQaqc');
            renderEntriesSection(original, 'communications', 'originalCommunications');
            renderSafetySection(original);
            renderEntriesSection(original, 'visitors', 'originalVisitors');
        }

        // === WEATHER (both modes) ===
        const w = original?.weather || report.overview?.weather || {};
        const weatherHtml = (w.highTemp || w.lowTemp || w.generalCondition)
            ? `High: ${w.highTemp || 'N/A'} | Low: ${w.lowTemp || 'N/A'}<br>${w.generalCondition || 'N/A'} | Site: ${w.jobSiteCondition || 'N/A'}`
            : '<span class="text-slate-400 italic">None</span>';
        document.getElementById('originalWeather').innerHTML = weatherHtml;

        // === PHOTOS (both modes) ===
        // Always use report.photos for display - has URLs from Supabase
        // original.photos only has metadata (no URLs)
        const photos = report.photos || [];
        populateOriginalPhotos(photos);
    }

    // --- HELPER: Render Work Entries Grouped by Contractor ---
    // v6.9: Also handles crew-level entries (work_{contractorId}_crew_{crewId})
    function renderWorkByContractor(original, contractorMap) {
        const container = document.getElementById('originalWorkByContractor');
        const entries = original?.entries?.filter(e => e.section?.startsWith('work_') && !e.is_deleted) || [];

        if (entries.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic">None</p>';
            return;
        }

        // Build crew lookup from project context
        const contractors = original?.projectContext?.contractors || [];
        const crewMap = {};
        contractors.forEach(c => {
            (c.crews || []).forEach(crew => {
                crewMap[`${c.id}_${crew.id}`] = crew.name;
            });
        });

        // Group by contractor ID, then sub-group by crew
        const grouped = {};
        entries.forEach(e => {
            // Parse section: work_{contractorId} or work_{contractorId}_crew_{crewId}
            const crewMatch = e.section.match(/^work_(.+?)_crew_(.+)$/);
            let contractorId, crewId;
            if (crewMatch) {
                contractorId = crewMatch[1];
                crewId = crewMatch[2];
            } else {
                contractorId = e.section.replace('work_', '');
                crewId = null;
            }
            const groupKey = contractorId;
            if (!grouped[groupKey]) grouped[groupKey] = { entries: [], crewEntries: {} };
            if (crewId) {
                if (!grouped[groupKey].crewEntries[crewId]) grouped[groupKey].crewEntries[crewId] = [];
                grouped[groupKey].crewEntries[crewId].push(e);
            } else {
                grouped[groupKey].entries.push(e);
            }
        });

        let html = '';
        Object.keys(grouped).forEach(contractorId => {
            const contractorName = contractorMap[contractorId] || 'Unknown Contractor';
            const group = grouped[contractorId];

            html += `<div class="bg-slate-800/50 rounded-lg overflow-hidden mb-2">`;
            html += `<div class="bg-slate-700/50 px-3 py-2 font-medium text-white text-sm">${escapeHtml(contractorName)}</div>`;

            // Render contractor-level entries
            if (group.entries.length > 0) {
                const sorted = group.entries.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
                html += '<table class="w-full text-sm"><tbody>';
                sorted.forEach(e => {
                    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                    html += `<tr class="border-t border-slate-700/50"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">${time}</td><td class="px-3 py-2 text-slate-200">${escapeHtml(e.content || '')}</td></tr>`;
                });
                html += '</tbody></table>';
            }

            // Render crew-level entries
            Object.keys(group.crewEntries).forEach(crewId => {
                const crewName = crewMap[`${contractorId}_${crewId}`] || `Crew ${crewId.substring(0, 6)}`;
                const crewEntriesSorted = group.crewEntries[crewId].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
                html += `<div class="bg-slate-700/30 px-3 py-1 text-xs text-slate-300 font-medium border-t border-slate-700/50"><i class="fas fa-users mr-1 text-slate-400"></i>${escapeHtml(crewName)}</div>`;
                html += '<table class="w-full text-sm"><tbody>';
                crewEntriesSorted.forEach(e => {
                    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                    html += `<tr class="border-t border-slate-700/50"><td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">${time}</td><td class="px-3 py-2 text-slate-200">${escapeHtml(e.content || '')}</td></tr>`;
                });
                html += '</tbody></table>';
            });

            html += '</div>';
        });

        container.innerHTML = html;
    }

    // --- HELPER: Render Personnel Table ---
    function renderPersonnelTable(original, contractorMap) {
        const container = document.getElementById('originalPersonnelSection');
        const operations = original?.operations || [];

        if (operations.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic">None</p>';
            return;
        }

        let html = `
            <table class="w-full text-sm bg-slate-800/50 rounded-lg overflow-hidden">
                <thead class="bg-slate-700/50">
                    <tr>
                        <th class="px-3 py-2 text-left text-slate-300 font-medium">Contractor</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Supt</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Fore</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Oper</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Labor</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Surv</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Other</th>
                    </tr>
                </thead>
                <tbody>
        `;

        let hasAnyPersonnel = false;
        operations.forEach(op => {
            const name = contractorMap[op.contractorId] || op.contractorName || 'Unknown';
            const total = (op.superintendents || 0) + (op.foremen || 0) + (op.operators || 0) +
                          (op.laborers || 0) + (op.surveyors || 0) + (op.others || 0);
            if (total === 0) return; // Skip contractors with no personnel

            hasAnyPersonnel = true;
            html += `
                <tr class="border-t border-slate-700/50">
                    <td class="px-3 py-2 text-slate-200">${escapeHtml(name)}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.superintendents || 0}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.foremen || 0}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.operators || 0}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.laborers || 0}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.surveyors || 0}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${op.others || 0}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';

        if (!hasAnyPersonnel) {
            container.innerHTML = '<p class="text-slate-400 italic">None</p>';
        } else {
            container.innerHTML = html;
        }
    }

    // --- HELPER: Render Equipment Table ---
    function renderEquipmentTable(original, contractorMap) {
        const container = document.getElementById('originalEquipmentSection');
        const equipment = original?.equipmentRows || [];

        if (equipment.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic">None</p>';
            return;
        }

        let html = `
            <table class="w-full text-sm bg-slate-800/50 rounded-lg overflow-hidden">
                <thead class="bg-slate-700/50">
                    <tr>
                        <th class="px-3 py-2 text-left text-slate-300 font-medium">Contractor</th>
                        <th class="px-3 py-2 text-left text-slate-300 font-medium">Type</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Qty</th>
                        <th class="px-2 py-2 text-center text-slate-300 font-medium">Hours</th>
                    </tr>
                </thead>
                <tbody>
        `;

        equipment.forEach(eq => {
            const name = contractorMap[eq.contractorId] || eq.contractorName || 'Unspecified';
            html += `
                <tr class="border-t border-slate-700/50">
                    <td class="px-3 py-2 text-slate-200">${escapeHtml(name)}</td>
                    <td class="px-3 py-2 text-slate-200">${escapeHtml(eq.type || '')}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${eq.qty || 1}</td>
                    <td class="px-2 py-2 text-center text-slate-300">${eq.status || '-'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // --- HELPER: Render Generic Entry Section ---
    function renderEntriesSection(original, sectionName, elementId) {
        const container = document.getElementById(elementId);
        const entries = original?.entries?.filter(e => e.section === sectionName && !e.is_deleted) || [];

        if (entries.length === 0) {
            container.innerHTML = '<p class="text-slate-400 italic">None</p>';
            return;
        }

        const sorted = entries.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

        let html = '<div class="bg-slate-800/50 rounded-lg overflow-hidden"><table class="w-full text-sm"><tbody>';

        sorted.forEach((e, i) => {
            const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
            const borderClass = i > 0 ? 'border-t border-slate-700/50' : '';
            html += `
                <tr class="${borderClass}">
                    <td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">${time}</td>
                    <td class="px-3 py-2 text-slate-200">${escapeHtml(e.content || '')}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    // --- HELPER: Render Safety Section ---
    function renderSafetySection(original) {
        const container = document.getElementById('originalSafety');
        const entries = original?.entries?.filter(e => e.section === 'safety' && !e.is_deleted) || [];
        const safety = original?.safety || {};

        let html = '';

        // Show incident status
        if (safety.noIncidents) {
            html += '<div class="text-green-400 font-medium mb-2"><i class="fas fa-check-circle mr-2"></i>No Incidents Reported</div>';
        } else if (safety.hasIncidents) {
            html += '<div class="text-red-400 font-medium mb-2"><i class="fas fa-exclamation-triangle mr-2"></i>Incident Reported</div>';
        }

        // Show entries
        if (entries.length > 0) {
            const sorted = entries.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            html += '<div class="bg-slate-800/50 rounded-lg overflow-hidden"><table class="w-full text-sm"><tbody>';

            sorted.forEach((e, i) => {
                const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                const borderClass = i > 0 ? 'border-t border-slate-700/50' : '';
                html += `
                    <tr class="${borderClass}">
                        <td class="px-3 py-2 text-slate-400 whitespace-nowrap w-20">${time}</td>
                        <td class="px-3 py-2 text-slate-200">${escapeHtml(e.content || '')}</td>
                    </tr>
                `;
            });

            html += '</tbody></table></div>';
        } else if (!safety.noIncidents && !safety.hasIncidents) {
            html = '<p class="text-slate-400 italic">None</p>';
        }

        container.innerHTML = html;
    }

    function formatOriginalSafety(report) {
        if (report.safety?.noIncidents) {
            return 'No incidents reported';
        } else if (report.safety?.hasIncidents) {
            return 'INCIDENT REPORTED\n' + (report.safety?.notes?.join('\n') || '');
        } else if (report.safety?.notes?.length > 0) {
            return report.safety.notes.join('\n');
        }
        return 'No safety notes';
    }

    function populateOriginalPhotos(photos) {
        const container = document.getElementById('originalPhotosGrid');
        if (!photos || photos.length === 0) {
            container.innerHTML = '<p class="text-slate-500 col-span-2 text-center py-4">No photos captured</p>';
            return;
        }

        container.innerHTML = photos.map((photo, index) => `
            <div class="bg-white border border-slate-200 rounded overflow-hidden">
                <div class="aspect-square bg-slate-100">
                    <img src="${photo.url}" class="w-full h-full object-cover" alt="Photo ${index + 1}">
                </div>
                <div class="p-2">
                    <p class="text-xs text-slate-500">${photo.date || ''} ${photo.time || ''}</p>
                    <p class="text-sm text-slate-700 mt-1">${escapeHtml(photo.caption) || '<em class="text-slate-400">No caption</em>'}</p>
                </div>
            </div>
        `).join('');
    }

    // ============ PENDING REFINE HANDLING ============
    function checkPendingRefineStatus() {
        if (report.meta?.status === 'pending_refine') {
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

        const queued = report.meta?.offlineQueue?.find(q => q.type === 'refine');
        if (!queued) {
            alert('No pending processing found.');
            return;
        }

        const retryBtn = document.getElementById('retryRefine');
        const originalBtnHtml = retryBtn.innerHTML;
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Processing...';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(N8N_PROCESS_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(queued.payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }

            const result = await response.json();

            // Save AI response - handle new n8n response structure
            // New structure: { success, captureMode, originalInput, refinedReport }
            // Legacy structure: { aiGenerated }
            if (result.refinedReport) {
                report.aiGenerated = result.refinedReport;
                report.originalInput = result.originalInput || null;
                report.aiCaptureMode = result.captureMode || null;
            } else if (result.aiGenerated) {
                // Legacy fallback
                report.aiGenerated = result.aiGenerated;
            }
            report.meta.status = 'refined';

            // Remove from offline queue
            report.meta.offlineQueue = report.meta.offlineQueue.filter(q => q.type !== 'refine');
            saveReport();

            // Hide banner and refresh page to show new data
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

    // ============ AI REFINE TEXT (per-field) ============
    /**
     * Refine a single text field using the AI refine-text webhook.
     * Called from "✨ Refine" buttons next to each textarea.
     * @param {string} textareaId - The DOM id of the textarea to refine
     */
    async function refineTextField(textareaId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) {
            console.error('[REFINE] Textarea not found:', textareaId);
            return;
        }

        const originalText = textarea.value.trim();
        if (!originalText) {
            alert('Nothing to refine — enter some notes first.');
            return;
        }

        // Find the refine button and show loading state
        const btn = document.querySelector(`[data-refine-for="${textareaId}"]`);
        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Refining...';
        }

        try {
            const section = SECTION_MAP[textareaId] || 'additionalNotes';
            const payload = {
                originalText: originalText,
                section: section,
                reportContext: {
                    projectName: activeProject?.projectName || '',
                    reporterName: userSettings?.fullName || '',
                    date: report?.overview?.date || new Date().toISOString().split('T')[0]
                }
            };

            console.log('[REFINE] Sending to refine-text webhook:', { textareaId, section });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const response = await fetch(N8N_REFINE_TEXT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }

            const result = await response.json();
            const refinedText = result.refinedText;

            if (!refinedText || refinedText.includes('[not provided]')) {
                throw new Error('AI returned empty or invalid refined text');
            }

            console.log('[REFINE] Got refined text for', textareaId, ':', refinedText.substring(0, 100));

            // Update the textarea with refined text
            textarea.value = refinedText;

            // Mark as user-edited (so it persists)
            textarea.classList.add('user-edited');

            // Trigger auto-save
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            // Brief success indicator
            if (btn) {
                btn.innerHTML = '<i class="fas fa-check mr-1"></i>Done!';
                btn.classList.add('bg-green-600');
                setTimeout(() => {
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
                setTimeout(() => {
                    btn.innerHTML = originalBtnHtml;
                    btn.disabled = false;
                    btn.classList.remove('bg-red-600');
                }, 2000);
            }
        }
    }

    /**
     * Refine a contractor's work summary narrative.
     * @param {string} contractorId - The contractor UUID
     */
    async function refineContractorNarrative(contractorId) {
        const textarea = document.getElementById(`narrative_${contractorId}`);
        if (!textarea) {
            console.error('[REFINE] Narrative textarea not found for contractor:', contractorId);
            return;
        }

        const originalText = textarea.value.trim();
        if (!originalText) {
            alert('Nothing to refine — enter work summary notes first.');
            return;
        }

        const btn = document.querySelector(`[data-refine-for="narrative_${contractorId}"]`);
        const originalBtnHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Refining...';
        }

        try {
            const contractor = projectContractors.find(c => c.id === contractorId);
            const payload = {
                originalText: originalText,
                section: 'activities',
                reportContext: {
                    projectName: activeProject?.projectName || '',
                    reporterName: userSettings?.fullName || '',
                    date: report?.overview?.date || new Date().toISOString().split('T')[0],
                    contractorName: contractor?.name || 'Unknown Contractor'
                }
            };

            console.log('[REFINE] Sending contractor narrative to refine-text webhook:', contractorId);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const response = await fetch(N8N_REFINE_TEXT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }

            const result = await response.json();
            const refinedText = result.refinedText;

            if (!refinedText || refinedText.includes('[not provided]')) {
                throw new Error('AI returned empty or invalid refined text');
            }

            textarea.value = refinedText;
            textarea.classList.add('user-edited');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            if (btn) {
                btn.innerHTML = '<i class="fas fa-check mr-1"></i>Done!';
                btn.classList.add('bg-green-600');
                setTimeout(() => {
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
                setTimeout(() => {
                    btn.innerHTML = originalBtnHtml;
                    btn.disabled = false;
                    btn.classList.remove('bg-red-600');
                }, 2000);
            }
        }
    }

    // Save report without showing indicator (for silent updates)
    async function saveReportSilent() {
        try {
            await saveReportToSupabase();
        } catch (err) {
            console.error('Failed to save report:', err);
        }
    }

    // ============ PROJECT LOADING ============
    /* DEPRECATED — now using window.dataLayer.loadActiveProject()
    async function loadActiveProject() {
        const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
        if (!activeId) {
            activeProject = null;
            projectContractors = [];
            return null;
        }

        try {
            // Fetch project from Supabase
            const { data: projectRow, error: projectError } = await supabaseClient
                .from('projects')
                .select('*')
                .eq('id', activeId)
                .single();

            if (projectError || !projectRow) {
                console.error('Failed to load project from Supabase:', projectError);
                activeProject = null;
                projectContractors = [];
                return null;
            }

            activeProject = fromSupabaseProject(projectRow);

            // Contractors (with crews) come from JSONB column — already parsed
            // Sort: prime contractors first, then subcontractors
            projectContractors = [...(activeProject.contractors || [])].sort((a, b) => {
                if (a.type === 'prime' && b.type !== 'prime') return -1;
                if (a.type !== 'prime' && b.type === 'prime') return 1;
                return 0;
            });

            return activeProject;
        } catch (e) {
            console.error('Failed to load project:', e);
            activeProject = null;
            projectContractors = [];
            return null;
        }
    }
    */

    /* DEPRECATED — now using window.dataLayer.loadUserSettings()
    async function loadUserSettings() {
        try {
            const { data, error } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Failed to load user settings:', error);
                return null;
            }

            if (data) {
                userSettings = {
                    id: data.id,
                    full_name: data.full_name || '',
                    title: data.title || '',
                    company: data.company || '',
                    email: data.email || '',
                    phone: data.phone || ''
                };
                return userSettings;
            }
            return null;
        } catch (e) {
            console.error('Failed to load user settings:', e);
            return null;
        }
    }
    */

    // ============ REPORT LOADING ============
    function getReportDateStr() {
        const params = new URLSearchParams(window.location.search);
        const dateParam = params.get('date');
        // v6.6.23: Use getLocalDateString to avoid timezone issues
        return dateParam || getLocalDateString();
    }

    /**
     * v6.6.2: Load report from localStorage ONLY
     * Source of truth is now fvp_report_{reportId} key
     */
    async function loadReport() {
        // Clear any stale report ID before loading
        currentReportId = null;

        // Get reportId from URL params (required)
        const params = new URLSearchParams(window.location.search);
        const reportIdParam = params.get('reportId');
        const reportDateStr = getReportDateStr();

        if (!reportIdParam) {
            console.error('[LOAD] No reportId in URL params');
            showToast('Report not found. Redirecting to home.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return createFreshReport();
        }

        // Load from single localStorage key
        const reportData = getReportData(reportIdParam);

        if (!reportData) {
            console.error('[LOAD] No report data found in localStorage for:', reportIdParam);
            showToast('Report data not found. It may have been cleared.', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return createFreshReport();
        }

        console.log('[LOAD] Loaded report from localStorage:', reportIdParam);

        // Store the report ID
        currentReportId = reportIdParam;

        // Build the report object from localStorage data
        const loadedReport = createFreshReport();

        // Basic report info from localStorage
        loadedReport.meta = {
            createdAt: reportData.createdAt,
            lastSaved: reportData.lastSaved,
            version: 4,
            status: reportData.status || 'refined',
            captureMode: reportData.captureMode || 'minimal',
            reportViewed: true
        };

        loadedReport.overview.date = reportData.reportDate;

        // AI-generated content
        loadedReport.aiGenerated = reportData.aiGenerated || null;

        // Original input for "Original Notes" tab
        loadedReport.originalInput = reportData.originalInput || null;

        // Capture mode
        loadedReport.aiCaptureMode = reportData.captureMode || null;

        // User edits
        loadedReport.userEdits = reportData.userEdits || {};

        // Weather from originalInput
        if (reportData.originalInput?.weather) {
            loadedReport.overview.weather = reportData.originalInput.weather;
        }

        // Photos from originalInput (metadata only, URLs need to be resolved)
        if (reportData.originalInput?.photos) {
            loadedReport.photos = reportData.originalInput.photos;
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
                projectName: activeProject?.projectName || '',
                noabProjectNo: activeProject?.noabProjectNo || '',
                cnoSolicitationNo: activeProject?.cnoSolicitationNo || 'N/A',
                location: activeProject?.location || '',
                date: new Date().toLocaleDateString(),
                contractDay: activeProject?.contractDayNo || '',
                weatherDays: activeProject?.weatherDays || 0,
                engineer: activeProject?.engineer || '',
                contractor: activeProject?.primeContractor || '',
                startTime: activeProject?.defaultStartTime || '06:00',
                endTime: activeProject?.defaultEndTime || '16:00',
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
            // AI-generated content (populated by AI processing)
            aiGenerated: null,
            // v6.6: Original input sent to AI (for "Original Notes" view)
            originalInput: null,
            // v6.6: Capture mode from AI response ('guided' or 'freeform')
            aiCaptureMode: null,
            // User edits (tracked separately)
            userEdits: {},
            // Field notes from capture
            fieldNotes: { freeformNotes: '' },
            guidedNotes: { workSummary: '' }
        };
    }

    /**
     * Build a full report object from localStorage draft data
     * Used when no Supabase data exists yet
     */
    function buildReportFromLocalStorage(draftData, reportDateStr) {
        const loadedReport = createFreshReport();
        
        // Meta
        loadedReport.meta.captureMode = draftData.captureMode || draftData.meta?.captureMode || 'guided';
        loadedReport.meta.createdAt = draftData.meta?.createdAt;
        loadedReport.meta.status = 'draft';
        
        // Weather
        if (draftData.weather) {
            loadedReport.overview.weather = draftData.weather;
        }
        
        // Date
        loadedReport.overview.date = reportDateStr;
        
        // Build originalInput for Original Notes display
        loadedReport.originalInput = buildOriginalInputFromDraft(draftData);
        loadedReport.aiCaptureMode = loadedReport.meta.captureMode;
        
        // Activities
        if (draftData.activities) {
            loadedReport.activities = draftData.activities;
        }
        
        // Operations/Personnel
        if (draftData.operations) {
            loadedReport.operations = draftData.operations;
        }
        
        // Equipment
        if (draftData.equipmentRows) {
            loadedReport.equipmentRows = draftData.equipmentRows;
        }
        if (draftData.equipment) {
            loadedReport.equipment = draftData.equipment;
        }
        
        // Safety
        loadedReport.safety = {
            noIncidents: draftData.safetyNoIncidents || false,
            hasIncidents: draftData.safetyHasIncidents || false,
            notes: draftData.safetyNotes || []
        };
        
        // Photos
        if (draftData.photos) {
            loadedReport.photos = draftData.photos;
        }
        
        // Legacy notes
        if (draftData.freeformNotes) {
            loadedReport.fieldNotes = { freeformNotes: draftData.freeformNotes };
        }
        if (draftData.workSummary) {
            loadedReport.guidedNotes = { workSummary: draftData.workSummary };
        }
        
        return loadedReport;
    }

    /**
     * Build an originalInput object from localStorage draft data
     * This matches the structure that n8n would provide
     */
    function buildOriginalInputFromDraft(draftData) {
        return {
            // Weather
            weather: draftData.weather || {},
            
            // Entries (v6 format - for guided mode sections)
            entries: draftData.entries || [],
            
            // Operations/Personnel
            operations: draftData.operations || [],
            
            // Equipment rows
            equipmentRows: draftData.equipmentRows || [],
            
            // Safety status
            safety: {
                noIncidents: draftData.safetyNoIncidents || false,
                hasIncidents: draftData.safetyHasIncidents || false,
                notes: draftData.safetyNotes || []
            },
            
            // Toggle states
            toggleStates: draftData.toggleStates || {},
            
            // Freeform mode data
            fieldNotes: {
                freeformNotes: draftData.freeformNotes || '',
                freeform_entries: draftData.freeform_entries || []
            },
            
            // Project context (for contractor name lookups)
            projectContext: {
                contractors: activeProject?.contractors || projectContractors || []
            }
        };
    }

    // ============ DATA MERGING ============
    /**
     * Get value with priority: userEdits > aiGenerated > fieldNotes > defaults
     * Handles AI-generated arrays by joining them with newlines for text fields
     */
    function getValue(path, defaultValue = '') {
        // Check user edits first - user edits always win
        if (userEdits[path] !== undefined) {
            return userEdits[path];
        }

        // Check AI-generated content
        if (report.aiGenerated) {
            const aiValue = getNestedValue(report.aiGenerated, path);
            if (aiValue !== undefined && aiValue !== null && aiValue !== '') {
                // Handle arrays by joining with newlines (for text fields)
                if (Array.isArray(aiValue)) {
                    return aiValue.join('\n');
                }
                return aiValue;
            }
        }

        // Check existing report data (fieldNotes, guidedNotes, etc.)
        const reportValue = getNestedValue(report, path);
        if (reportValue !== undefined && reportValue !== null && reportValue !== '') {
            // Also handle arrays from regular report data
            if (Array.isArray(reportValue)) {
                return reportValue.join('\n');
            }
            return reportValue;
        }

        return defaultValue;
    }

    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o || {})[k], obj);
    }

    /**
     * Get value from AI-generated data with array handling
     * Arrays are joined with newlines, other values returned as-is
     */
    function getAIValue(path, defaultValue = '') {
        if (!report.aiGenerated) return defaultValue;
        const value = getNestedValue(report.aiGenerated, path);
        if (value === undefined || value === null) return defaultValue;
        if (Array.isArray(value)) return value.join('\n');
        return value;
    }

    /**
     * Get text field value with proper priority handling
     * Priority: userEdits > aiGenerated > fieldNotes/guidedNotes > defaults
     * @param {string} reportPath - Path in report object (e.g., 'issues')
     * @param {string} aiPath - Path in aiGenerated object (e.g., 'issues_delays')
     * @param {string} defaultValue - Fallback value if nothing found
     * @param {string} legacyAiPath - Legacy field name for backwards compatibility (e.g., 'generalIssues')
     */
    function getTextFieldValue(reportPath, aiPath, defaultValue = '', legacyAiPath = null) {
        // 1. Check user edits first - user edits always win
        if (userEdits[reportPath] !== undefined) {
            return userEdits[reportPath];
        }

        // 2. Check AI-generated data (try new field name first, then legacy)
        if (report.aiGenerated) {
            // Try new v6.6 field name
            let aiValue = getNestedValue(report.aiGenerated, aiPath);
            
            // Fallback to legacy field name for backwards compatibility
            if ((aiValue === undefined || aiValue === null || aiValue === '') && legacyAiPath) {
                aiValue = getNestedValue(report.aiGenerated, legacyAiPath);
            }
            
            if (aiValue !== undefined && aiValue !== null && aiValue !== '') {
                if (Array.isArray(aiValue)) {
                    return aiValue.join('\n');
                }
                return aiValue;
            }
        }

        // 3. Check existing report data
        const reportValue = getNestedValue(report, reportPath);
        if (reportValue !== undefined && reportValue !== null && reportValue !== '') {
            if (Array.isArray(reportValue)) {
                return reportValue.join('\n');
            }
            return reportValue;
        }

        // 4. Return default (which may come from guidedNotes/fieldNotes)
        return defaultValue;
    }

    function setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((o, k) => {
            if (!o[k]) o[k] = {};
            return o[k];
        }, obj);
        target[lastKey] = value;
    }

    // ============ POPULATE FIELDS ============
    function populateAllFields() {
        // Display project logo if exists
        // Priority: logoUrl (full quality) > logoThumbnail (compressed) > logo (legacy)
        const logoContainer = document.getElementById('projectLogoContainer');
        const logoImg = document.getElementById('projectLogo');
        const logoSrc = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;
        if (logoSrc) {
            logoImg.src = logoSrc;
            logoContainer.classList.remove('hidden');
        } else {
            logoContainer.classList.add('hidden');
        }

        // Project Overview - Left Column
        document.getElementById('projectName').value = getValue('overview.projectName', activeProject?.projectName || '');
        document.getElementById('noabProjectNo').value = getValue('overview.noabProjectNo', activeProject?.noabProjectNo || '');
        document.getElementById('cnoSolicitationNo').value = getValue('overview.cnoSolicitationNo', activeProject?.cnoSolicitationNo || 'N/A');

        // Notice to Proceed (display only from project config)
        const ntpInput = document.getElementById('noticeToProceed');
        if (activeProject?.noticeToProceed) {
            ntpInput.value = activeProject.noticeToProceed;
        }

        // Contract Duration (display only)
        const durationInput = document.getElementById('contractDuration');
        if (activeProject?.contractDuration) {
            durationInput.value = activeProject.contractDuration + ' days';
        }

        // Expected Completion (display only from project config)
        const expectedInput = document.getElementById('expectedCompletion');
        if (activeProject?.expectedCompletion) {
            expectedInput.value = activeProject.expectedCompletion;
        }

        // Contract Day — auto-calculate from Notice to Proceed date
        const contractDayInput = document.getElementById('contractDay');
        const userContractDay = getValue('overview.contractDay', '');
        if (userContractDay) {
            // User manually set it
            contractDayInput.value = userContractDay;
        } else if (activeProject?.noticeToProceed) {
            // Auto-calculate: days between NTP and report date
            try {
                const ntpParts = activeProject.noticeToProceed.split('-');
                const ntpDateObj = new Date(ntpParts[0], ntpParts[1] - 1, ntpParts[2]);
                const reportDateStr = getReportDateStr();
                const rdParts = reportDateStr.split('-');
                const reportDateObj = new Date(rdParts[0], rdParts[1] - 1, rdParts[2]);
                const diffMs = reportDateObj - ntpDateObj;
                const dayNum = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // Day 1 = NTP date
                if (dayNum > 0) {
                    const totalDays = activeProject.contractDuration || '';
                    contractDayInput.value = totalDays ? `Day ${dayNum} of ${totalDays}` : `Day ${dayNum}`;
                }
            } catch (e) {
                console.warn('[CONTRACT DAY] Could not calculate:', e);
            }
        }

        // Weather Days (editable)
        document.getElementById('weatherDaysCount').value = getValue('overview.weatherDays', activeProject?.weatherDays || 0);

        // Project Overview - Right Column
        // Date - v6.6.23: Use getLocalDateString to avoid timezone issues
        const dateStr = getValue('overview.date', getLocalDateString());
        const dateInput = document.getElementById('reportDate');
        try {
            const d = new Date(dateStr + 'T12:00:00'); // Add noon time to avoid timezone shift
            dateInput.value = getLocalDateString(d);
        } catch (e) {
            dateInput.value = getLocalDateString();
        }

        document.getElementById('projectLocation').value = getValue('overview.location', activeProject?.location || '');
        document.getElementById('engineer').value = getValue('overview.engineer', activeProject?.engineer || '');
        document.getElementById('contractor').value = getValue('overview.contractor', activeProject?.primeContractor || '');

        // Start/End Time (editable, defaults from project config)
        document.getElementById('startTime').value = getValue('overview.startTime', activeProject?.defaultStartTime || '06:00');
        document.getElementById('endTime').value = getValue('overview.endTime', activeProject?.defaultEndTime || '16:00');

        // Calculate and display shift duration
        calculateShiftDuration();

        document.getElementById('completedBy').value = getValue('overview.completedBy', userSettings?.fullName || '');

        // Weather
        document.getElementById('weatherHigh').value = getValue('overview.weather.highTemp', '');
        document.getElementById('weatherLow').value = getValue('overview.weather.lowTemp', '');
        document.getElementById('weatherPrecip').value = getValue('overview.weather.precipitation', '');
        document.getElementById('weatherCondition').value = getValue('overview.weather.generalCondition', '');
        document.getElementById('weatherJobSite').value = getValue('overview.weather.jobSiteCondition', '');
        document.getElementById('weatherAdverse').value = getValue('overview.weather.adverseConditions', '');

        // Text sections - check AI-generated paths with correct field names
        // Priority: userEdits > aiGenerated > guidedNotes/fieldNotes > report defaults
        // v6.6: Updated field names (issues_delays, qaqc_notes, communications, visitors_deliveries, safety.summary)
        document.getElementById('issuesText').value = getTextFieldValue('issues', 'issues_delays',
            report.guidedNotes?.issues || '', 'generalIssues');
        document.getElementById('qaqcText').value = getTextFieldValue('qaqc', 'qaqc_notes', '', 'qaqcNotes');
        document.getElementById('safetyText').value = getTextFieldValue('safety.notes', 'safety.summary',
            report.guidedNotes?.safety || '', 'safety.notes');
        document.getElementById('communicationsText').value = getTextFieldValue('communications',
            'communications', '', 'contractorCommunications');
        document.getElementById('visitorsText').value = getTextFieldValue('visitors', 'visitors_deliveries', '', 'visitorsRemarks');

        // Safety incident toggle
        // v6.6: Check both old (hasIncident/hasIncidents) and new (has_incidents) field names
        const hasIncident = getValue('safety.hasIncident', false) || 
                            report.aiGenerated?.safety?.has_incidents || 
                            report.aiGenerated?.safety?.hasIncidents || 
                            false;
        document.getElementById('safetyNoIncident').checked = !hasIncident;
        document.getElementById('safetyHasIncident').checked = hasIncident;

        // Signature — default to user settings if no manual entry
        document.getElementById('signatureName').value = getValue('signature.name', userSettings?.fullName || '');
        document.getElementById('signatureTitle').value = getValue('signature.title', userSettings?.title || '');
        document.getElementById('signatureCompany').value = getValue('signature.company', userSettings?.company || '');
        document.getElementById('signatureDate').textContent = new Date().toLocaleDateString();

        // Render dynamic sections
        renderWorkSummary();
        renderPersonnelTable();
        renderEquipmentTable();
        renderPhotos();

        // Mark user-edited fields
        markUserEditedFields();
    }

    function calculateShiftDuration() {
        const startTime = document.getElementById('startTime').value;
        const endTime = document.getElementById('endTime').value;
        const durationInput = document.getElementById('shiftDuration');

        if (startTime && endTime) {
            const start = new Date(`2000-01-01T${startTime}`);
            const end = new Date(`2000-01-01T${endTime}`);
            let diffMs = end - start;

            // Handle overnight shifts
            if (diffMs < 0) {
                diffMs += 24 * 60 * 60 * 1000;
            }

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (minutes > 0) {
                durationInput.value = `${hours}h ${minutes}m`;
            } else {
                durationInput.value = `${hours} hours`;
            }
        } else {
            durationInput.value = '';
        }
    }

    function markUserEditedFields() {
        Object.keys(userEdits).forEach(path => {
            const fieldId = pathToFieldId(path);
            const field = document.getElementById(fieldId);
            if (field) {
                field.classList.add('user-edited');
            }
        });
    }

    function pathToFieldId(path) {
        // Convert paths like 'overview.projectName' to 'projectName'
        const mapping = {
            'overview.projectName': 'projectName',
            'overview.noabProjectNo': 'noabProjectNo',
            'overview.cnoSolicitationNo': 'cnoSolicitationNo',
            'overview.location': 'projectLocation',
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
            'communications': 'communicationsText',
            'visitors': 'visitorsText',
            'signature.name': 'signatureName',
            'signature.title': 'signatureTitle',
            'signature.company': 'signatureCompany'
        };
        return mapping[path] || path;
    }

    // ============ RENDER WORK SUMMARY ============
    function renderWorkSummary() {
        const container = document.getElementById('workSummaryContainer');

        if (projectContractors.length === 0) {
            // Show simplified work summary if no contractors defined
            container.innerHTML = `
                <div class="bg-slate-50 border border-slate-200 p-4 rounded">
                    <p class="text-xs font-bold text-slate-500 uppercase mb-2">Work Summary</p>
                    <textarea id="generalWorkSummary" class="editable-field auto-expand w-full px-3 py-2 text-sm"
                        placeholder="Describe all work performed today..."
                        data-path="guidedNotes.workSummary">${getValue('guidedNotes.workSummary', '')}</textarea>
                    <p class="text-xs text-slate-400 mt-1">No project contractors defined. Add contractors in Project Settings.</p>
                </div>
            `;
            initAllAutoExpandTextareas();
            return;
        }

        // Render contractor cards
        container.innerHTML = projectContractors.map((contractor, index) => {
            const activity = getContractorActivity(contractor.id);
            const noWork = activity?.noWork ?? true;
            const narrative = activity?.narrative || '';
            const equipment = activity?.equipmentUsed || '';
            const crew = activity?.crew || '';

            const typeLabel = contractor.type === 'prime' ? 'PRIME' : 'SUB';
            const borderColor = contractor.type === 'prime' ? 'border-safety-green' : 'border-dot-blue';
            const badgeBg = contractor.type === 'prime' ? 'bg-safety-green' : 'bg-dot-blue';

            return `
                <div class="contractor-card rounded ${noWork && !narrative ? 'no-work' : 'has-content'}" data-contractor-id="${contractor.id}">
                    <div class="p-4">
                        <div class="flex items-center gap-3 mb-3">
                            <span class="${badgeBg} text-white text-[10px] font-bold px-2 py-0.5 uppercase">${typeLabel}</span>
                            <span class="font-bold text-slate-800">${escapeHtml(contractor.name)}</span>
                            ${contractor.trades ? `<span class="text-xs text-slate-500">(${escapeHtml(contractor.trades)})</span>` : ''}
                        </div>

                        <label class="flex items-center gap-2 p-2 bg-slate-100 border border-slate-200 cursor-pointer mb-3">
                            <input type="checkbox" class="w-4 h-4 no-work-checkbox"
                                data-contractor-id="${contractor.id}"
                                ${noWork ? 'checked' : ''}
                                onchange="toggleNoWork('${contractor.id}', this.checked)">
                            <span class="text-sm text-slate-600">No work performed today</span>
                        </label>

                        <div class="work-fields ${noWork ? 'hidden' : ''}" data-contractor-id="${contractor.id}">
                            <div class="mb-3">
                                <div class="flex items-center justify-between mb-1">
                                    <label class="block text-xs font-bold text-slate-500 uppercase">Work Narrative</label>
                                    <button data-refine-for="narrative_${contractor.id}" onclick="refineContractorNarrative('${contractor.id}')" class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase transition-colors rounded flex items-center gap-1">
                                        <i class="fas fa-magic"></i> Refine
                                    </button>
                                </div>
                                <textarea id="narrative_${contractor.id}" class="editable-field auto-expand w-full px-3 py-2 text-sm contractor-narrative"
                                    data-contractor-id="${contractor.id}"
                                    placeholder="Describe work performed by ${contractor.name}...">${escapeHtml(narrative)}</textarea>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Equipment Used</label>
                                    <input type="text" class="editable-field w-full px-3 py-2 text-sm contractor-equipment"
                                        data-contractor-id="${contractor.id}"
                                        placeholder="e.g., Excavator (1), Dump Truck (2)"
                                        value="${escapeHtml(equipment)}">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Crew</label>
                                    <input type="text" class="editable-field w-full px-3 py-2 text-sm contractor-crew"
                                        data-contractor-id="${contractor.id}"
                                        placeholder="e.g., Foreman (1), Laborers (4)"
                                        value="${escapeHtml(crew)}">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        initAllAutoExpandTextareas();
        setupContractorListeners();
    }

    /**
     * Get contractor activity with priority: userEdits > aiGenerated > report.activities
     * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
     */
    function getContractorActivity(contractorId) {
        // Check if user has edited this contractor's activity
        const userEditKey = `activity_${contractorId}`;
        if (userEdits[userEditKey]) {
            return userEdits[userEditKey];
        }

        // Get contractor name for freeform matching
        const contractor = projectContractors.find(c => c.id === contractorId);
        const contractorName = contractor?.name;

        // Check AI-generated activities first
        if (report.aiGenerated?.activities) {
            // Try matching by contractorId first (guided mode)
            let aiActivity = report.aiGenerated.activities.find(a => a.contractorId === contractorId);
            
            // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
            if (!aiActivity && contractorName) {
                aiActivity = report.aiGenerated.activities.find(a => 
                    a.contractorId === null && 
                    a.contractorName?.toLowerCase() === contractorName.toLowerCase()
                );
            }
            
            if (aiActivity) {
                return {
                    contractorId: contractorId,
                    noWork: aiActivity.noWork ?? false,
                    narrative: aiActivity.narrative || '',
                    equipmentUsed: aiActivity.equipmentUsed || '',
                    crew: aiActivity.crew || ''
                };
            }
        }

        // Fall back to report.activities
        if (!report.activities) return null;
        return report.activities.find(a => a.contractorId === contractorId);
    }

    function toggleNoWork(contractorId, isNoWork) {
        const workFields = document.querySelector(`.work-fields[data-contractor-id="${contractorId}"]`);
        const card = document.querySelector(`.contractor-card[data-contractor-id="${contractorId}"]`);

        if (isNoWork) {
            workFields.classList.add('hidden');
            card.classList.add('no-work');
            card.classList.remove('has-content');
        } else {
            workFields.classList.remove('hidden');
            card.classList.remove('no-work');
            card.classList.add('has-content');
            // Focus narrative field
            const narrative = workFields.querySelector('.contractor-narrative');
            if (narrative) setTimeout(() => narrative.focus(), 100);
        }

        updateContractorActivity(contractorId);
    }

    function setupContractorListeners() {
        // Narrative textareas - auto-save on input (debounced) AND blur (immediate)
        document.querySelectorAll('.contractor-narrative').forEach(el => {
            // Save to memory immediately on every keystroke, debounced persist
            el.addEventListener('input', () => {
                updateContractorActivity(el.dataset.contractorId);
                el.classList.add('user-edited');
                scheduleSave();
            });
            // Immediate save on blur (safety net)
            el.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                updateContractorActivity(el.dataset.contractorId);
                saveReportToLocalStorage();
                showSaveIndicator();
            });
        });

        // Equipment inputs - auto-save on input AND blur
        document.querySelectorAll('.contractor-equipment').forEach(el => {
            el.addEventListener('input', () => {
                updateContractorActivity(el.dataset.contractorId);
                scheduleSave();
            });
            el.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                updateContractorActivity(el.dataset.contractorId);
                saveReportToLocalStorage();
                showSaveIndicator();
            });
        });

        // Crew inputs - auto-save on input AND blur
        document.querySelectorAll('.contractor-crew').forEach(el => {
            el.addEventListener('input', () => {
                updateContractorActivity(el.dataset.contractorId);
                scheduleSave();
            });
            el.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                updateContractorActivity(el.dataset.contractorId);
                saveReportToLocalStorage();
                showSaveIndicator();
            });
        });
    }

    function updateContractorActivity(contractorId) {
        if (!report.activities) report.activities = [];

        const checkbox = document.querySelector(`.no-work-checkbox[data-contractor-id="${contractorId}"]`);
        const narrative = document.querySelector(`.contractor-narrative[data-contractor-id="${contractorId}"]`);
        const equipment = document.querySelector(`.contractor-equipment[data-contractor-id="${contractorId}"]`);
        const crew = document.querySelector(`.contractor-crew[data-contractor-id="${contractorId}"]`);

        let activity = report.activities.find(a => a.contractorId === contractorId);
        if (!activity) {
            activity = { contractorId };
            report.activities.push(activity);
        }

        activity.noWork = checkbox?.checked ?? true;
        activity.narrative = narrative?.value?.trim() || '';
        activity.equipmentUsed = equipment?.value?.trim() || '';
        activity.crew = crew?.value?.trim() || '';

        // Track in userEdits for persistence
        const userEditKey = `activity_${contractorId}`;
        userEdits[userEditKey] = activity;
        report.userEdits = userEdits;

        // Add visual indicator to edited fields
        if (narrative) narrative.classList.add('user-edited');
        if (equipment) equipment.classList.add('user-edited');
        if (crew) crew.classList.add('user-edited');

        scheduleSave();
    }

    // ============ RENDER PERSONNEL TABLE ============
    function renderPersonnelTable() {
        const tbody = document.getElementById('personnelTableBody');

        if (projectContractors.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-slate-400 py-4">
                        No contractors defined. Add contractors in Project Settings.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = projectContractors.map(contractor => {
            const ops = getContractorOperations(contractor.id);
            return `
                <tr data-contractor-id="${contractor.id}">
                    <td class="font-medium text-xs">${escapeHtml(contractor.abbreviation || contractor.name)}</td>
                    <td class="text-xs">${escapeHtml(contractor.trades || '-')}</td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="superintendents" value="${ops?.superintendents || ''}" min="0" placeholder="-"></td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="foremen" value="${ops?.foremen || ''}" min="0" placeholder="-"></td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="operators" value="${ops?.operators || ''}" min="0" placeholder="-"></td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="laborers" value="${ops?.laborers || ''}" min="0" placeholder="-"></td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="surveyors" value="${ops?.surveyors || ''}" min="0" placeholder="-"></td>
                    <td><input type="number" class="personnel-input" data-contractor-id="${contractor.id}" data-field="others" value="${ops?.others || ''}" min="0" placeholder="-"></td>
                    <td class="text-center font-bold row-total">0</td>
                </tr>
            `;
        }).join('');

        // Setup listeners
        document.querySelectorAll('.personnel-input').forEach(input => {
            input.addEventListener('change', () => {
                updatePersonnelRow(input.dataset.contractorId);
                updatePersonnelTotals();
            });
        });

        updatePersonnelTotals();
    }

    /**
     * Get contractor operations/personnel with priority: userEdits > aiGenerated > report.operations
     * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
     */
    function getContractorOperations(contractorId) {
        // Check if user has edited this contractor's operations
        const userEditKey = `operations_${contractorId}`;
        if (userEdits[userEditKey]) {
            return userEdits[userEditKey];
        }

        // Get contractor name for freeform matching
        const contractor = projectContractors.find(c => c.id === contractorId);
        const contractorName = contractor?.name;

        // Check AI-generated operations first
        if (report.aiGenerated?.operations) {
            // Try matching by contractorId first (guided mode)
            let aiOps = report.aiGenerated.operations.find(o => o.contractorId === contractorId);
            
            // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
            if (!aiOps && contractorName) {
                aiOps = report.aiGenerated.operations.find(o => 
                    o.contractorId === null && 
                    o.contractorName?.toLowerCase() === contractorName.toLowerCase()
                );
            }
            
            if (aiOps) {
                return {
                    contractorId: contractorId,
                    superintendents: aiOps.superintendents || null,
                    foremen: aiOps.foremen || null,
                    operators: aiOps.operators || null,
                    laborers: aiOps.laborers || null,
                    surveyors: aiOps.surveyors || null,
                    others: aiOps.others || null
                };
            }
        }

        // Fall back to report.operations
        if (!report.operations) return null;
        return report.operations.find(o => o.contractorId === contractorId);
    }

    function updatePersonnelRow(contractorId) {
        if (!report.operations) report.operations = [];

        let ops = report.operations.find(o => o.contractorId === contractorId);
        if (!ops) {
            ops = { contractorId };
            report.operations.push(ops);
        }

        const row = document.querySelector(`tr[data-contractor-id="${contractorId}"]`);
        const inputs = row.querySelectorAll('.personnel-input');

        let rowTotal = 0;
        inputs.forEach(input => {
            const value = parseInt(input.value) || 0;
            ops[input.dataset.field] = value || null;
            rowTotal += value;
            input.classList.add('user-edited');
        });

        // Track in userEdits for persistence
        const userEditKey = `operations_${contractorId}`;
        userEdits[userEditKey] = ops;
        report.userEdits = userEdits;

        row.querySelector('.row-total').textContent = rowTotal || '-';
        scheduleSave();
    }

    function updatePersonnelTotals() {
        const fields = ['superintendents', 'foremen', 'operators', 'laborers', 'surveyors', 'others'];
        const totals = { superintendents: 0, foremen: 0, operators: 0, laborers: 0, surveyors: 0, others: 0 };
        let grandTotal = 0;

        document.querySelectorAll('.personnel-input').forEach(input => {
            const value = parseInt(input.value) || 0;
            totals[input.dataset.field] += value;
            grandTotal += value;
        });

        document.getElementById('totalSuper').textContent = totals.superintendents || '-';
        document.getElementById('totalForeman').textContent = totals.foremen || '-';
        document.getElementById('totalOperators').textContent = totals.operators || '-';
        document.getElementById('totalLaborers').textContent = totals.laborers || '-';
        document.getElementById('totalSurveyors').textContent = totals.surveyors || '-';
        document.getElementById('totalOthers').textContent = totals.others || '-';
        document.getElementById('totalAll').textContent = grandTotal || '-';
    }

    // ============ RENDER EQUIPMENT TABLE ============
    /**
     * Get equipment data with priority: report.equipment (user edited) > aiGenerated.equipment
     * v6.6: Supports resolving contractorId from contractorName for freeform mode
     */
    function getEquipmentData() {
        // If user has saved equipment data, use that
        if (report.equipment && report.equipment.length > 0) {
            return report.equipment;
        }

        // Check AI-generated equipment
        if (report.aiGenerated?.equipment && report.aiGenerated.equipment.length > 0) {
            return report.aiGenerated.equipment.map(aiItem => {
                // Try to match equipmentId to project config for type/model
                let type = aiItem.type || '';
                if (aiItem.equipmentId && activeProject?.equipment) {
                    const projectEquip = activeProject.equipment.find(e => e.id === aiItem.equipmentId);
                    if (projectEquip) {
                        type = projectEquip.type || projectEquip.model || type;
                    }
                }
                
                // v6.6: Resolve contractorId from contractorName for freeform mode
                let contractorId = aiItem.contractorId || '';
                if (!contractorId && aiItem.contractorName) {
                    const matchedContractor = projectContractors.find(c => 
                        c.name?.toLowerCase() === aiItem.contractorName?.toLowerCase()
                    );
                    if (matchedContractor) {
                        contractorId = matchedContractor.id;
                    }
                }
                
                return {
                    contractorId: contractorId,
                    contractorName: aiItem.contractorName || '',
                    type: type,
                    qty: aiItem.qty || aiItem.quantity || 1,
                    status: aiItem.status || aiItem.hoursUsed ? `${aiItem.hoursUsed} hrs` : 'IDLE'
                };
            });
        }

        return [];
    }

    function renderEquipmentTable() {
        const tbody = document.getElementById('equipmentTableBody');
        const equipmentData = getEquipmentData();

        if (equipmentData.length === 0) {
            // Show empty state with one blank row
            tbody.innerHTML = `
                <tr data-equipment-index="0">
                    <td>
                        <select class="equipment-contractor w-full text-xs p-1">
                            <option value="">Select...</option>
                            ${projectContractors.map(c => `<option value="${c.id}">${escapeHtml(c.abbreviation || c.name)}</option>`).join('')}
                        </select>
                    </td>
                    <td><input type="text" class="equipment-type w-full text-xs" placeholder="e.g., CAT 320 Excavator"></td>
                    <td><input type="number" class="equipment-qty w-full text-xs text-center" value="1" min="1"></td>
                    <td>
                        <select class="equipment-status w-full text-xs p-1">
                            <option value="IDLE">IDLE</option>
                            ${[1,2,3,4,5,6,7,8,9,10].map(h => `<option value="${h} hrs">${h} hrs utilized</option>`).join('')}
                        </select>
                    </td>
                </tr>
            `;
            setupEquipmentListeners();
            return;
        }

        tbody.innerHTML = equipmentData.map((item, index) => `
            <tr data-equipment-index="${index}">
                <td>
                    <select class="equipment-contractor w-full text-xs p-1">
                        <option value="">Select...</option>
                        ${projectContractors.map(c => `<option value="${c.id}" ${item.contractorId === c.id ? 'selected' : ''}>${escapeHtml(c.abbreviation || c.name)}</option>`).join('')}
                    </select>
                </td>
                <td><input type="text" class="equipment-type w-full text-xs" value="${escapeHtml(item.type || '')}" placeholder="e.g., CAT 320 Excavator"></td>
                <td><input type="number" class="equipment-qty w-full text-xs text-center" value="${item.qty || 1}" min="1"></td>
                <td>
                    <select class="equipment-status w-full text-xs p-1">
                        <option value="IDLE" ${item.status === 'IDLE' ? 'selected' : ''}>IDLE</option>
                        ${[1,2,3,4,5,6,7,8,9,10].map(h => `<option value="${h} hrs" ${item.status === `${h} hrs` ? 'selected' : ''}>${h} hrs utilized</option>`).join('')}
                    </select>
                </td>
            </tr>
        `).join('');

        setupEquipmentListeners();
    }

    function setupEquipmentListeners() {
        document.querySelectorAll('#equipmentTableBody tr').forEach(row => {
            row.querySelectorAll('input, select').forEach(input => {
                input.addEventListener('change', () => updateEquipmentRow(row));
            });
        });
    }

    function updateEquipmentRow(row) {
        const index = parseInt(row.dataset.equipmentIndex);
        if (!report.equipment) report.equipment = [];

        const item = {
            contractorId: row.querySelector('.equipment-contractor').value,
            type: row.querySelector('.equipment-type').value.trim(),
            qty: parseInt(row.querySelector('.equipment-qty').value) || 1,
            status: row.querySelector('.equipment-status').value
        };

        if (index < report.equipment.length) {
            report.equipment[index] = item;
        } else {
            report.equipment.push(item);
        }

        scheduleSave();
    }

    function addEquipmentRow() {
        const tbody = document.getElementById('equipmentTableBody');
        const newIndex = tbody.querySelectorAll('tr').length;

        const newRow = document.createElement('tr');
        newRow.dataset.equipmentIndex = newIndex;
        newRow.innerHTML = `
            <td>
                <select class="equipment-contractor w-full text-xs p-1">
                    <option value="">Select...</option>
                    ${projectContractors.map(c => `<option value="${c.id}">${escapeHtml(c.abbreviation || c.name)}</option>`).join('')}
                </select>
            </td>
            <td><input type="text" class="equipment-type w-full text-xs" placeholder="e.g., CAT 320 Excavator"></td>
            <td><input type="number" class="equipment-qty w-full text-xs text-center" value="1" min="1"></td>
            <td>
                <select class="equipment-status w-full text-xs p-1">
                    <option value="IDLE">IDLE</option>
                    ${[1,2,3,4,5,6,7,8,9,10].map(h => `<option value="${h} hrs">${h} hrs utilized</option>`).join('')}
                </select>
            </td>
        `;

        tbody.appendChild(newRow);

        // Setup listeners for new row
        newRow.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', () => updateEquipmentRow(newRow));
        });

        // Focus the type input
        newRow.querySelector('.equipment-type').focus();
    }

    // ============ RENDER PHOTOS ============
    function renderPhotos() {
        const container = document.getElementById('photosContainer');
        const photos = report.photos || [];
        const totalPhotos = photos.length;

        document.getElementById('photoCount').textContent = `${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}`;

        if (totalPhotos === 0) {
            container.innerHTML = `
                <div class="text-center text-slate-400 py-12">
                    <i class="fas fa-images text-5xl mb-3"></i>
                    <p class="text-sm font-medium">No photos captured</p>
                    <p class="text-xs mt-1">Photos from field capture will appear here</p>
                </div>
            `;
            return;
        }

        container.innerHTML = photos.map((photo, index) => {
            const photoNum = index + 1;
            const dateStr = photo.date || '--';
            const timeStr = photo.time || '--';
            const gpsStr = photo.gps
                ? `${photo.gps.lat.toFixed(5)}, ${photo.gps.lng.toFixed(5)}`
                : null;

            return `
                <div class="photo-card" data-photo-index="${index}">
                    <!-- Photo Header -->
                    <div class="photo-card-header">
                        <span>Photo ${photoNum} of ${totalPhotos}</span>
                    </div>

                    <!-- Photo Image Container -->
                    <div class="photo-card-image" id="photo-container-${index}">
                        <!-- Loading state -->
                        <div class="photo-loading" id="photo-loading-${index}">
                            <i class="fas fa-spinner fa-spin text-2xl text-slate-400"></i>
                        </div>
                        <!-- Image (hidden until loaded) -->
                        <img
                            src="${photo.url}"
                            alt="Progress photo ${photoNum}"
                            id="photo-img-${index}"
                            style="display: none;"
                            onload="handlePhotoLoad(${index})"
                            onerror="handlePhotoError(${index})"
                        >
                    </div>

                    <!-- Photo Footer with metadata and caption -->
                    <div class="photo-card-footer">
                        <!-- Metadata Row -->
                        <div class="photo-card-meta">
                            <div class="photo-card-meta-item">
                                <i class="fas fa-calendar-alt"></i>
                                <span>${dateStr}</span>
                            </div>
                            <div class="photo-card-meta-item">
                                <i class="fas fa-clock"></i>
                                <span>${timeStr}</span>
                            </div>
                            ${gpsStr ? `
                            <div class="photo-card-meta-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${gpsStr}</span>
                            </div>
                            ` : ''}
                        </div>

                        <!-- Caption -->
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Caption</label>
                            <textarea
                                class="photo-card-caption auto-expand"
                                data-photo-index="${index}"
                                placeholder="Describe what this photo shows..."
                            >${escapeHtml(photo.caption || '')}</textarea>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Setup caption listeners
        document.querySelectorAll('.photo-card-caption').forEach(textarea => {
            textarea.addEventListener('blur', () => {
                const index = parseInt(textarea.dataset.photoIndex);
                if (report.photos[index]) {
                    report.photos[index].caption = textarea.value.trim();
                    scheduleSave();
                }
            });
            // Also save on input with debounce for better UX
            textarea.addEventListener('input', debounce(() => {
                const index = parseInt(textarea.dataset.photoIndex);
                if (report.photos[index]) {
                    report.photos[index].caption = textarea.value.trim();
                    scheduleSave();
                }
            }, 1000));
        });

        initAllAutoExpandTextareas();
    }

    /**
     * Handle successful photo load - detect orientation and show image
     */
    function handlePhotoLoad(index) {
        const img = document.getElementById(`photo-img-${index}`);
        const container = document.getElementById(`photo-container-${index}`);
        const loading = document.getElementById(`photo-loading-${index}`);

        if (!img || !container) return;

        // Hide loading spinner
        if (loading) loading.style.display = 'none';

        // Detect orientation based on natural dimensions
        const isPortrait = img.naturalHeight > img.naturalWidth;
        container.classList.remove('portrait', 'landscape');
        container.classList.add(isPortrait ? 'portrait' : 'landscape');

        // Show the image
        img.style.display = 'block';
    }

    /**
     * Handle photo load error - show error state
     */
    function handlePhotoError(index) {
        const container = document.getElementById(`photo-container-${index}`);
        const loading = document.getElementById(`photo-loading-${index}`);

        if (!container) return;

        // Hide loading spinner
        if (loading) loading.style.display = 'none';

        // Show error message
        container.innerHTML = `
            <div class="photo-error">
                <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                <p class="font-medium">Failed to load image</p>
                <p class="text-xs mt-1">The photo may be corrupted or missing</p>
            </div>
        `;
    }

    /**
     * Simple debounce function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Force-capture current text field values into userEdits.
     * Called before preview render to ensure all data is fresh.
     */
    function saveTextFieldEdits() {
        const textFields = {
            'issuesText': 'issues',
            'qaqcText': 'qaqc',
            'safetyText': 'safety.notes',
            'communicationsText': 'communications',
            'visitorsText': 'visitors'
        };

        Object.entries(textFields).forEach(([fieldId, path]) => {
            const field = document.getElementById(fieldId);
            if (field && field.value.trim()) {
                userEdits[path] = field.value;
                report.userEdits = userEdits;
            }
        });
    }

    // ============ AUTO-SAVE ============
    function setupAutoSave() {
        // Field mappings for auto-save
        const fieldMappings = {
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

        Object.entries(fieldMappings).forEach(([fieldId, path]) => {
            const field = document.getElementById(fieldId);
            if (!field) return;

            // v6.6.3: Input event with debounce - saves 500ms after typing stops
            field.addEventListener('input', () => {
                // Update userEdits immediately so data isn't lost
                const value = field.value;
                setNestedValue(report, path, value);
                userEdits[path] = value;
                report.userEdits = userEdits;
                field.classList.add('user-edited');

                // Debounced save to localStorage
                scheduleSave();
            });

            // Safety net: blur cancels pending debounce and saves immediately
            field.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                // Save immediately on blur
                saveReportToLocalStorage();
                showSaveIndicator();
            });
        });

        // Recalculate shift duration when start/end time changes
        ['startTime', 'endTime'].forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', calculateShiftDuration);
            }
        });

        // Safety incident toggle
        document.querySelectorAll('input[name="safetyIncident"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const hasIncident = document.getElementById('safetyHasIncident').checked;
                report.safety = report.safety || {};
                report.safety.hasIncident = hasIncident;
                userEdits['safety.hasIncident'] = hasIncident;
                report.userEdits = userEdits;
                scheduleSave();
            });
        });

        // General work summary (when no contractors)
        const generalSummary = document.getElementById('generalWorkSummary');
        if (generalSummary) {
            const path = 'guidedNotes.workSummary';

            // v6.6.3: Input event with debounce
            generalSummary.addEventListener('input', () => {
                const value = generalSummary.value;
                setNestedValue(report, path, value);
                userEdits[path] = value;
                report.userEdits = userEdits;
                generalSummary.classList.add('user-edited');
                scheduleSave();
            });

            // Safety net: blur saves immediately
            generalSummary.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                saveReportToLocalStorage();
                showSaveIndicator();
            });
        }
    }

    function scheduleSave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveReport();
        }, 500);
    }

    async function saveReport() {
        // Save to localStorage (primary storage for report.html)
        saveReportToLocalStorage();
        showSaveIndicator();
    }

    /**
     * v6.6.2: Save report data to localStorage using single key pattern
     * Key: fvp_report_{reportId}
     */
    function saveReportToLocalStorage() {
        if (!currentReportId) {
            console.warn('[LOCAL] No reportId, cannot save');
            return;
        }

        // Read current data to preserve fields we don't modify here
        const existingData = getReportData(currentReportId) || {};

        // Build the report object to save (matches spec structure)
        const reportToSave = {
            reportId: currentReportId,
            projectId: existingData.projectId || activeProject?.id,
            reportDate: existingData.reportDate || getReportDateStr(),
            status: report.meta?.status || existingData.status || 'refined',

            // From n8n webhook response (preserve original)
            aiGenerated: report.aiGenerated || existingData.aiGenerated || {},
            captureMode: report.aiCaptureMode || existingData.captureMode || 'minimal',

            // Original field notes (preserve original)
            originalInput: report.originalInput || existingData.originalInput || {},

            // User edits - this is what we're updating
            userEdits: report.userEdits || {},

            // Metadata
            createdAt: existingData.createdAt || report.meta?.createdAt || new Date().toISOString(),
            lastSaved: new Date().toISOString()
        };

        // Use saveReportData from storage-keys.js
        const success = saveReportData(currentReportId, reportToSave);
        if (success) {
            console.log('[LOCAL] Report saved to localStorage:', currentReportId);
        } else {
            console.error('[LOCAL] Failed to save report to localStorage');
        }
    }

    /**
     * Actually save report to Supabase
     */
    async function saveReportToSupabase() {
        if (isSaving || !activeProject) return;
        isSaving = true;

        try {
            const reportDateStr = getReportDateStr();

            // 1. Upsert the main report record
            // v6.6.15: reportId must come from URL params (set during load)
            // report.js is for editing existing reports, not creating new ones
            const reportId = currentReportId;
            if (!reportId) {
                console.error('[REPORT] No reportId available - cannot save');
                isSaving = false;
                return;
            }

            const reportData = {
                id: reportId,
                project_id: activeProject.id,
                user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
                device_id: getDeviceId(),
                report_date: reportDateStr,
                inspector_name: report.overview?.completedBy || userSettings?.fullName || '',
                status: report.meta?.status || 'draft',
                updated_at: new Date().toISOString()
            };

            const { error: reportError } = await supabaseClient
                .from('reports')
                .upsert(reportData, { onConflict: 'id' });

            if (reportError) {
                console.error('Error saving report:', reportError);
                isSaving = false;
                return;
            }

            currentReportId = reportId;

            // 2. Upsert raw capture data
            // Build user_edits array for storage in raw_data
            const userEditsArray = report.userEdits && Object.keys(report.userEdits).length > 0
                ? Object.entries(report.userEdits).map(([fieldPath, editedValue]) => ({
                    field_path: fieldPath,
                    edited_value: typeof editedValue === 'string' ? editedValue : JSON.stringify(editedValue),
                    edited_at: new Date().toISOString()
                }))
                : [];

            // Build contractor_work array for storage in raw_data
            const contractorWorkArray = report.activities && report.activities.length > 0
                ? report.activities.map(a => ({
                    contractor_id: a.contractorId,
                    no_work_performed: a.noWork || false,
                    narrative: a.narrative || '',
                    equipment_used: a.equipmentUsed || '',
                    crew: a.crew || ''
                }))
                : [];

            // Build personnel array for storage in raw_data
            const personnelArray = report.operations && report.operations.length > 0
                ? report.operations.map(o => ({
                    contractor_id: o.contractorId,
                    superintendents: o.superintendents || 0,
                    foremen: o.foremen || 0,
                    operators: o.operators || 0,
                    laborers: o.laborers || 0,
                    surveyors: o.surveyors || 0,
                    others: o.others || 0
                }))
                : [];

            // Build equipment_usage array for storage in raw_data
            const equipmentUsageArray = report.equipment && report.equipment.length > 0
                ? report.equipment.map(e => ({
                    equipment_id: e.equipmentId,
                    contractor_id: e.contractorId || '',
                    type: e.type || '',
                    qty: e.qty || 1,
                    status: e.status === 'IDLE' ? 'idle' : 'active',
                    hours_used: e.status && e.status !== 'IDLE' ? parseInt(e.status) || 0 : 0,
                    notes: ''
                }))
                : [];

            const rawCaptureData = {
                report_id: reportId,
                capture_mode: report.meta?.captureMode || 'guided',
                freeform_notes: report.fieldNotes?.freeformNotes || '',
                work_summary: report.guidedNotes?.workSummary || '',
                issues_notes: report.issues || report.guidedNotes?.issues || '',
                safety_notes: report.safety?.notes || report.guidedNotes?.safety || '',
                weather_data: report.overview?.weather || {},
                captured_at: new Date().toISOString(),
                // Store user_edits, contractor_work, personnel, and equipment_usage in raw_data JSONB
                raw_data: {
                    user_edits: userEditsArray,
                    contractor_work: contractorWorkArray,
                    personnel: personnelArray,
                    equipment_usage: equipmentUsageArray
                }
            };

            // Delete existing and insert new (simpler than upsert for child tables)
            await supabaseClient
                .from('report_raw_capture')
                .delete()
                .eq('report_id', reportId);

            await supabaseClient
                .from('report_raw_capture')
                .insert(rawCaptureData);

            // 3. Contractor work - now stored in raw_data.contractor_work (handled above in rawCaptureData)

            // 4. Personnel - now stored in raw_data.personnel (handled above in rawCaptureData)

            // 5. Equipment usage - now stored in raw_data.equipment_usage (handled above in rawCaptureData)

            // 6. User edits - now stored in raw_data.user_edits (handled above in rawCaptureData)

            // 7. Save text sections (issues, qaqc, communications, visitors, safety)
            // These are stored in the main report data, update via raw_capture or as separate fields

            console.log('[SUPABASE] Report saved successfully');
        } catch (err) {
            console.error('[SUPABASE] Save failed:', err);
        } finally {
            isSaving = false;
        }
    }

    function showSaveIndicator() {
        const indicator = document.getElementById('saveIndicator');
        indicator.classList.add('visible');
        setTimeout(() => {
            indicator.classList.remove('visible');
        }, 2000);
    }

    // initAllAutoExpandTextareas() replaced by initAllAutoExpandTextareas() from /js/ui-utils.js

    // ============ UI HELPERS ============
    function updateHeaderDate() {
        const dateStr = new Date().toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        document.getElementById('headerDate').textContent = dateStr;
    }

    // ============ FINAL REVIEW / PREVIEW ============
    function goToFinalReview() {
        // Instead of navigating away, switch to the Preview & Submit tab
        switchTab('preview');
        // Scroll to top
        window.scrollTo(0, 0);
    }

    function showSubmitModal() {
        goToFinalReview();
    }

    function hideSubmitModal() {
        document.getElementById('submitModal').classList.add('hidden');
    }

    function confirmSubmit() {
        goToFinalReview();
    }

    // ============ DEBUG TOOL ============
    let fieldMappingIssues = [];
    let debugBannerDismissed = false;

    /**
     * Detect field mapping mismatches between AI response and expected structure
     * Returns array of issue objects: { type: 'schema'|'empty'|'type'|'contractor', field: string, message: string }
     */
    function detectFieldMismatches() {
        const issues = [];
        const ai = report.aiGenerated;

        if (!ai) {
            return issues; // No AI data to check
        }

        // Expected top-level keys in aiGenerated
        const expectedTopLevelKeys = [
            'activities', 'generalIssues', 'qaqcNotes', 'safety',
            'contractorCommunications', 'visitorsRemarks', 'operations', 'equipment'
        ];

        // a) Schema mismatches - check for unexpected top-level keys
        Object.keys(ai).forEach(key => {
            if (!expectedTopLevelKeys.includes(key)) {
                issues.push({
                    type: 'schema',
                    field: `aiGenerated.${key}`,
                    message: `Unexpected top-level key "${key}" in AI response`
                });
            }
        });

        // Check activities structure
        if (ai.activities && Array.isArray(ai.activities)) {
            ai.activities.forEach((activity, index) => {
                const expectedActivityKeys = ['contractorId', 'narrative', 'noWork', 'equipmentUsed', 'crew'];
                Object.keys(activity).forEach(key => {
                    if (!expectedActivityKeys.includes(key)) {
                        issues.push({
                            type: 'schema',
                            field: `aiGenerated.activities[${index}].${key}`,
                            message: `Unexpected key "${key}" in activity at index ${index}`
                        });
                    }
                });
            });
        }

        // Check safety structure
        if (ai.safety && typeof ai.safety === 'object') {
            const expectedSafetyKeys = ['notes', 'hasIncident', 'noIncidents'];
            Object.keys(ai.safety).forEach(key => {
                if (!expectedSafetyKeys.includes(key)) {
                    issues.push({
                        type: 'schema',
                        field: `aiGenerated.safety.${key}`,
                        message: `Unexpected key "${key}" in safety section`
                    });
                }
            });
        }

        // Check operations structure
        if (ai.operations && Array.isArray(ai.operations)) {
            ai.operations.forEach((op, index) => {
                const expectedOpKeys = ['contractorId', 'superintendents', 'foremen', 'operators', 'laborers', 'surveyors', 'others'];
                Object.keys(op).forEach(key => {
                    if (!expectedOpKeys.includes(key)) {
                        issues.push({
                            type: 'schema',
                            field: `aiGenerated.operations[${index}].${key}`,
                            message: `Unexpected key "${key}" in operations at index ${index}`
                        });
                    }
                });
            });
        }

        // b) Empty responses - AI returned null/empty when fieldNotes had content
        const fieldNotes = report.fieldNotes || {};
        const guidedNotes = report.guidedNotes || {};

        // Check if AI generalIssues is empty but guidedNotes.issues has content
        if (guidedNotes.issues && guidedNotes.issues.trim()) {
            const aiIssues = ai.generalIssues;
            if (!aiIssues || (Array.isArray(aiIssues) && aiIssues.length === 0) || aiIssues === '') {
                issues.push({
                    type: 'empty',
                    field: 'aiGenerated.generalIssues',
                    message: 'AI returned empty generalIssues but guidedNotes.issues has content'
                });
            }
        }

        // Check if AI safety.notes is empty but guidedNotes.safety has content
        if (guidedNotes.safety && guidedNotes.safety.trim()) {
            const aiSafetyNotes = ai.safety?.notes;
            if (!aiSafetyNotes || (Array.isArray(aiSafetyNotes) && aiSafetyNotes.length === 0) || aiSafetyNotes === '') {
                issues.push({
                    type: 'empty',
                    field: 'aiGenerated.safety.notes',
                    message: 'AI returned empty safety.notes but guidedNotes.safety has content'
                });
            }
        }

        // Check if AI activities is empty but guidedNotes.workSummary has content
        if (guidedNotes.workSummary && guidedNotes.workSummary.trim()) {
            const aiActivities = ai.activities;
            if (!aiActivities || (Array.isArray(aiActivities) && aiActivities.length === 0)) {
                issues.push({
                    type: 'empty',
                    field: 'aiGenerated.activities',
                    message: 'AI returned empty activities but guidedNotes.workSummary has content'
                });
            }
        }

        // c) Type mismatches - expected array but got string or vice versa
        const arrayFields = ['generalIssues', 'qaqcNotes', 'activities', 'operations', 'equipment'];
        arrayFields.forEach(fieldName => {
            const value = ai[fieldName];
            if (value !== undefined && value !== null) {
                if (typeof value === 'string' && value.trim() !== '') {
                    issues.push({
                        type: 'type',
                        field: `aiGenerated.${fieldName}`,
                        message: `Expected array for "${fieldName}" but got string`
                    });
                }
            }
        });

        // Check safety.notes - should be array or string
        if (ai.safety?.notes !== undefined && ai.safety?.notes !== null) {
            // This is acceptable as either array or string, but flag if it's something else
            const notesType = typeof ai.safety.notes;
            if (notesType !== 'string' && !Array.isArray(ai.safety.notes)) {
                issues.push({
                    type: 'type',
                    field: 'aiGenerated.safety.notes',
                    message: `Expected array or string for "safety.notes" but got ${notesType}`
                });
            }
        }

        // d) ContractorId mismatches - AI contractorId doesn't match any project contractor
        const validContractorIds = projectContractors.map(c => c.id);

        if (ai.activities && Array.isArray(ai.activities)) {
            ai.activities.forEach((activity, index) => {
                if (activity.contractorId && !validContractorIds.includes(activity.contractorId)) {
                    issues.push({
                        type: 'contractor',
                        field: `aiGenerated.activities[${index}].contractorId`,
                        message: `ContractorId "${activity.contractorId}" doesn't match any project contractor`
                    });
                }
            });
        }

        if (ai.operations && Array.isArray(ai.operations)) {
            ai.operations.forEach((op, index) => {
                if (op.contractorId && !validContractorIds.includes(op.contractorId)) {
                    issues.push({
                        type: 'contractor',
                        field: `aiGenerated.operations[${index}].contractorId`,
                        message: `ContractorId "${op.contractorId}" doesn't match any project contractor`
                    });
                }
            });
        }

        if (ai.equipment && Array.isArray(ai.equipment)) {
            ai.equipment.forEach((equip, index) => {
                if (equip.contractorId && !validContractorIds.includes(equip.contractorId)) {
                    issues.push({
                        type: 'contractor',
                        field: `aiGenerated.equipment[${index}].contractorId`,
                        message: `ContractorId "${equip.contractorId}" doesn't match any project contractor`
                    });
                }
            });
        }

        return issues;
    }

    /**
     * Initialize debug panel with current data
     */
    function initializeDebugPanel() {
        // Detect issues
        fieldMappingIssues = detectFieldMismatches();

        // Update AI Response Data section
        const aiContent = document.getElementById('debugAIContent');
        if (report.aiGenerated) {
            aiContent.textContent = JSON.stringify(report.aiGenerated, null, 2);
        } else {
            aiContent.textContent = 'No AI response data';
        }

        // Update Field Notes section
        const fieldNotesContent = document.getElementById('debugFieldNotesContent');
        const fieldNotesData = {
            fieldNotes: report.fieldNotes || {},
            guidedNotes: report.guidedNotes || {}
        };
        fieldNotesContent.textContent = JSON.stringify(fieldNotesData, null, 2);

        // Update User Edits section
        const userEditsContent = document.getElementById('debugUserEditsContent');
        if (report.userEdits && Object.keys(report.userEdits).length > 0) {
            userEditsContent.textContent = JSON.stringify(report.userEdits, null, 2);
        } else {
            userEditsContent.textContent = 'No user edits';
        }

        // Update Current State section
        const currentStateContent = document.getElementById('debugCurrentStateContent');
        const currentState = {
            activities: report.activities || [],
            operations: report.operations || [],
            equipment: report.equipment || []
        };
        currentStateContent.textContent = JSON.stringify(currentState, null, 2);

        // Update Issues section
        updateDebugIssues();

        // Show/hide banner based on issues
        if (fieldMappingIssues.length > 0 && !debugBannerDismissed) {
            document.getElementById('debugIssueBanner').classList.remove('hidden');
        }
    }

    /**
     * Update the debug issues display
     */
    function updateDebugIssues() {
        const issuesContainer = document.getElementById('debugIssuesContent');
        const issueCount = document.getElementById('debugIssueCount');

        issueCount.textContent = fieldMappingIssues.length;

        if (fieldMappingIssues.length === 0) {
            issuesContainer.innerHTML = '<p class="text-sm text-green-600"><i class="fas fa-check-circle mr-1"></i>No issues detected</p>';
            issueCount.classList.remove('bg-yellow-500');
            issueCount.classList.add('bg-green-500');
        } else {
            issueCount.classList.remove('bg-green-500');
            issueCount.classList.add('bg-yellow-500');
            issuesContainer.innerHTML = fieldMappingIssues.map(issue => `
                <div class="debug-issue ${issue.type}">
                    <div class="debug-issue-type">${escapeHtml(issue.type)}</div>
                    <div class="font-medium text-slate-700">${escapeHtml(issue.field)}</div>
                    <div class="text-slate-600">${escapeHtml(issue.message)}</div>
                </div>
            `).join('');
        }
    }

    /**
     * Toggle debug panel expanded/collapsed
     */
    function toggleDebugPanel() {
        const panel = document.getElementById('debugPanel');
        const chevron = document.getElementById('debugPanelChevron');

        panel.classList.toggle('collapsed');
        panel.classList.toggle('expanded');

        if (panel.classList.contains('expanded')) {
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-up');
        } else {
            chevron.classList.remove('fa-chevron-up');
            chevron.classList.add('fa-chevron-down');
        }
    }

    /**
     * Toggle debug section expanded/collapsed
     */
    function toggleDebugSection(sectionName) {
        const section = document.getElementById(`debugSection${sectionName}`);
        const chevron = section.querySelector('.debug-chevron');

        section.classList.toggle('expanded');

        if (section.classList.contains('expanded')) {
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-up');
        } else {
            chevron.classList.remove('fa-chevron-up');
            chevron.classList.add('fa-chevron-down');
        }
    }

    /**
     * Scroll to debug panel and expand it
     */
    function scrollToDebugPanel() {
        const panel = document.getElementById('debugPanel');

        // Expand the panel if collapsed
        if (panel.classList.contains('collapsed')) {
            toggleDebugPanel();
        }

        // Scroll to panel
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /**
     * Dismiss the debug banner
     */
    function dismissDebugBanner(event) {
        event.stopPropagation();
        debugBannerDismissed = true;
        document.getElementById('debugIssueBanner').classList.add('hidden');
    }

    /**
     * Format timestamp for filenames
     */
    function formatDebugTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
    }

    /**
     * Download debug data as JSON
     */
    function downloadDebugJSON() {
        const debugData = {
            exportedAt: new Date().toISOString(),
            reportDate: report.overview?.date || '',
            projectName: activeProject?.projectName || '',
            aiGenerated: report.aiGenerated || null,
            fieldNotes: report.fieldNotes || {},
            guidedNotes: report.guidedNotes || {},
            userEdits: report.userEdits || {},
            currentState: {
                activities: report.activities || [],
                operations: report.operations || [],
                equipment: report.equipment || []
            },
            detectedIssues: fieldMappingIssues
        };

        const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const filename = `fieldvoice-debug-${formatDebugTimestamp()}.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Download debug data as Markdown
     */
    function downloadDebugMarkdown() {
        const timestamp = new Date().toISOString();
        const reportDate = report.overview?.date || 'Unknown';
        const projectName = activeProject?.projectName || 'Unknown';

        let md = `# FieldVoice Debug Export\n\n`;
        md += `**Exported:** ${timestamp}\n`;
        md += `**Report Date:** ${reportDate}\n`;
        md += `**Project:** ${projectName}\n\n`;

        // Detected Issues
        md += `## Detected Issues\n\n`;
        if (fieldMappingIssues.length === 0) {
            md += `No issues detected.\n\n`;
        } else {
            fieldMappingIssues.forEach((issue, index) => {
                md += `### Issue ${index + 1}: ${issue.type.toUpperCase()}\n`;
                md += `- **Field:** ${issue.field}\n`;
                md += `- **Message:** ${issue.message}\n\n`;
            });
        }

        // AI Generated Data
        md += `## AI Generated Data\n\n`;
        if (report.aiGenerated) {
            md += `\`\`\`json\n${JSON.stringify(report.aiGenerated, null, 2)}\n\`\`\`\n\n`;
        } else {
            md += `No AI response data.\n\n`;
        }

        // Raw Field Notes
        md += `## Raw Field Notes\n\n`;
        md += `### Field Notes\n`;
        md += `\`\`\`json\n${JSON.stringify(report.fieldNotes || {}, null, 2)}\n\`\`\`\n\n`;
        md += `### Guided Notes\n`;
        md += `\`\`\`json\n${JSON.stringify(report.guidedNotes || {}, null, 2)}\n\`\`\`\n\n`;

        // User Edits
        md += `## User Edits\n\n`;
        if (report.userEdits && Object.keys(report.userEdits).length > 0) {
            md += `\`\`\`json\n${JSON.stringify(report.userEdits, null, 2)}\n\`\`\`\n\n`;
        } else {
            md += `No user edits.\n\n`;
        }

        // Current Report State
        md += `## Current Report State\n\n`;
        md += `### Activities\n`;
        md += `\`\`\`json\n${JSON.stringify(report.activities || [], null, 2)}\n\`\`\`\n\n`;
        md += `### Operations\n`;
        md += `\`\`\`json\n${JSON.stringify(report.operations || [], null, 2)}\n\`\`\`\n\n`;
        md += `### Equipment\n`;
        md += `\`\`\`json\n${JSON.stringify(report.equipment || [], null, 2)}\n\`\`\`\n\n`;

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const filename = `fieldvoice-debug-${formatDebugTimestamp()}.md`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============ EXPORT ============
    function exportPDF() {
        // Use the preview tab for PDF export
        goToFinalReview();
    }

    // ============ PREVIEW RENDERING ============
    /**
     * Render the RPR Daily Report preview from live form data.
     * This reads from report, activeProject, projectContractors, userEdits, userSettings.
     */
    function renderPreview() {
        const container = document.getElementById('previewContent');
        if (!container) return;

        const o = report.overview || {};
        const ai = report.aiGenerated || {};
        const ue = report.userEdits || {};

        // Helper: clean weather display values
        function cleanW(value, defaultVal) {
            if (!value || value === '--' || value === 'Syncing...' || value === 'N/A' || String(value).trim() === '') {
                return defaultVal || 'N/A';
            }
            return value;
        }

        // Read current form field values directly from DOM for live preview
        function formVal(id, fallback) {
            const el = document.getElementById(id);
            if (!el) return fallback || '';
            // For select elements, use value directly (textContent includes all options)
            if (el.tagName === 'SELECT') {
                const val = el.value;
                return (val && val !== 'Select...') ? val : (fallback || '');
            }
            return el.value || el.textContent || fallback || '';
        }

        // Utility functions for preview
        function previewFormatDate(dateStr) {
            if (!dateStr) return 'N/A';
            try {
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [year, month, day] = dateStr.split('-');
                    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                }
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            } catch (e) { return dateStr; }
        }

        function previewFormatTime(timeStr) {
            if (!timeStr) return '';
            if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
            const parts = timeStr.split(':');
            if (parts.length < 2) return timeStr;
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (isNaN(hours) || isNaN(minutes)) return timeStr;
            const period = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
        }

        function previewCalcShift(start, end) {
            if (!start || !end) return '';
            try {
                let sH, sM, eH, eM;
                if (start.includes(':')) { const p = start.split(':'); sH = parseInt(p[0]); sM = parseInt(p[1]) || 0; } else return '';
                if (end.includes(':')) { const p = end.split(':'); eH = parseInt(p[0]); eM = parseInt(p[1]) || 0; } else return '';
                if (isNaN(sH) || isNaN(eH)) return '';
                let diff = (eH * 60 + eM) - (sH * 60 + sM);
                if (diff < 0) diff += 24 * 60;
                return `${(diff / 60).toFixed(2)} hours`;
            } catch (e) { return ''; }
        }

        function previewFormatText(text) {
            if (!text || text.trim() === '') return '<ul><li class="rpr-na">N/A.</li></ul>';
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length === 0) return '<ul><li class="rpr-na">N/A.</li></ul>';
            return '<ul>' + lines.map(l => `<li>${escapeHtml(l)}</li>`).join('') + '</ul>';
        }

        function previewFormatTradesAbbrev(trades) {
            if (!trades) return '-';
            const abbrevMap = {
                'construction management': 'CM', 'project management': 'PM',
                'pile driving': 'PLE', 'concrete': 'CONC', 'asphalt': 'ASP',
                'utilities': 'UTL', 'earthwork': 'ERTHWRK', 'electrical': 'ELEC',
                'communications': 'COMM', 'fence': 'FENCE', 'pavement markings': 'PVMNT MRK',
                'hauling': 'HAUL', 'pavement subgrade': 'PVMT SUB', 'demo': 'DEMO',
                'demolition': 'DEMO', 'general': 'GEN'
            };
            const parts = trades.split(/[;,]/).map(t => t.trim().toLowerCase());
            return parts.map(t => abbrevMap[t] || t.substring(0, 6).toUpperCase()).join('; ');
        }

        function previewGetContractorName(contractorId, fallbackName) {
            const c = projectContractors.find(c => c.id === contractorId);
            if (c) return c.abbreviation || c.name.substring(0, 15).toUpperCase();
            if (fallbackName) return fallbackName.substring(0, 15).toUpperCase();
            return 'UNKNOWN';
        }

        function previewFormatEquipNotes(status, hoursUsed) {
            if (!status || status.toLowerCase() === 'idle' || status === '0' || status === '0 hrs') return 'IDLE';
            let hours = hoursUsed;
            if (!hours && status) {
                const m = status.match(/(\d+(?:\.\d+)?)/);
                if (m) hours = parseFloat(m[1]);
            }
            if (hours && hours > 0) return `${hours} HRS UTILIZED`;
            return 'IDLE';
        }

        // Gather current form data
        const projectName = formVal('projectName', activeProject?.projectName || '');
        const reportDate = previewFormatDate(formVal('reportDate'));
        const noabNo = formVal('noabProjectNo', activeProject?.noabProjectNo || '');
        const location = formVal('projectLocation', activeProject?.location || '');
        const cnoNo = formVal('cnoSolicitationNo', activeProject?.cnoSolicitationNo || 'N/A');
        const engineer = formVal('engineer', activeProject?.engineer || '');
        const ntpDate = activeProject?.noticeToProceed ? previewFormatDate(activeProject.noticeToProceed) : '';
        const primeContractor = formVal('contractor', activeProject?.primeContractor || '');
        const duration = activeProject?.contractDuration ? `${activeProject.contractDuration} days` : '';
        const startTime = previewFormatTime(formVal('startTime'));
        const endTime = previewFormatTime(formVal('endTime'));
        const expectedCompletion = activeProject?.expectedCompletion ? previewFormatDate(activeProject.expectedCompletion) : '';
        const shiftDuration = previewCalcShift(formVal('startTime'), formVal('endTime'));
        const contractDayVal = formVal('contractDay');
        const weatherDaysVal = formVal('weatherDaysCount', '0') + ' days';
        const completedBy = formVal('completedBy', userSettings?.fullName || '');

        // Weather
        const highTemp = cleanW(formVal('weatherHigh'), 'N/A');
        const lowTemp = cleanW(formVal('weatherLow'), 'N/A');
        const precipitation = cleanW(formVal('weatherPrecip'), '0.00"');
        const generalCondition = cleanW(formVal('weatherCondition'), 'Not recorded');
        const jobSiteCondition = cleanW(formVal('weatherJobSite'), 'N/A');
        const adverseConditions = cleanW(formVal('weatherAdverse'), 'None');

        // Signature
        const sigName = formVal('signatureName', completedBy);
        const sigTitle = formVal('signatureTitle', userSettings?.title || '');
        const sigCompany = formVal('signatureCompany', userSettings?.company || '');
        let sigDetails = '';
        if (sigTitle || sigCompany) {
            sigDetails = `Digitally signed by ${sigName}<br>DN: cn=${sigName}, c=US,<br>o=${sigCompany}, ou=${sigTitle}`;
        }

        // Logo
        const logoSrc = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;
        const logoHtml = logoSrc
            ? `<img src="${logoSrc}" class="rpr-logo" alt="Project Logo">`
            : `<div class="rpr-logo-placeholder">LOUIS ARMSTRONG<br>NEW ORLEANS<br>INTERNATIONAL AIRPORT</div>`;

        // Helper for header on each page
        function pageHeader() {
            return `<div class="rpr-header">
                <div>${logoHtml}</div>
                <div class="rpr-title">RPR DAILY REPORT</div>
            </div>`;
        }

        // ────── PAGE 1: Overview + Work Summary ──────
        let page1 = `<div class="preview-page">${pageHeader()}`;

        // Section Header: Project Overview
        page1 += `<div class="rpr-section-header">Project Overview</div>`;

        // Overview table
        page1 += `<table class="rpr-overview-table">
            <tr><td class="rpr-label">PROJECT NAME:</td><td>${escapeHtml(projectName)}</td><td class="rpr-label">DATE:</td><td>${escapeHtml(reportDate)}</td></tr>
            <tr><td class="rpr-label">NOAB PROJECT NO.:</td><td>${escapeHtml(noabNo)}</td><td class="rpr-label">LOCATION:</td><td>${escapeHtml(location)}</td></tr>
            <tr><td class="rpr-label">CNO SOLICITATION NO.:</td><td>${escapeHtml(cnoNo)}</td><td class="rpr-label">ENGINEER:</td><td>${escapeHtml(engineer)}</td></tr>
            <tr><td class="rpr-label">NOTICE TO PROCEED:</td><td>${escapeHtml(ntpDate)}</td><td class="rpr-label">CONTRACTOR:</td><td>${escapeHtml(primeContractor)}</td></tr>
            <tr><td class="rpr-label">CONTRACT DURATION:</td><td>${escapeHtml(duration)}</td><td class="rpr-label">START TIME:</td><td>${escapeHtml(startTime)}</td></tr>
            <tr><td class="rpr-label">EXPECTED COMPLETION:</td><td>${escapeHtml(expectedCompletion)}</td><td class="rpr-label">END TIME:</td><td>${escapeHtml(endTime)}</td></tr>
            <tr><td class="rpr-label">CONTRACT DAY #:</td><td>${escapeHtml(contractDayVal)}</td><td class="rpr-label">SHIFT DURATION:</td><td>${escapeHtml(shiftDuration)}</td></tr>
            <tr><td class="rpr-label">WEATHER DAYS:</td><td>${escapeHtml(weatherDaysVal)}</td><td class="rpr-label">COMPLETED BY:</td><td>${escapeHtml(completedBy)}</td></tr>
            <tr>
                <td class="rpr-label" rowspan="5">WEATHER:</td>
                <td>High Temp: ${escapeHtml(highTemp)} Low Temp: ${escapeHtml(lowTemp)}</td>
                <td class="rpr-label" rowspan="5">SIGNATURE:</td>
                <td rowspan="5" style="text-align:center; vertical-align:middle;">
                    <div class="rpr-signature-name">${escapeHtml(sigName)}</div>
                    <div class="rpr-signature-details">${sigDetails}</div>
                </td>
            </tr>
            <tr><td style="padding-left:20px; background:#fafafa;">Precipitation: ${escapeHtml(precipitation)}</td></tr>
            <tr><td style="padding-left:20px; background:#fafafa;">General Condition: ${escapeHtml(generalCondition)}</td></tr>
            <tr><td style="padding-left:20px; background:#fafafa;">Job Site Condition: ${escapeHtml(jobSiteCondition)}</td></tr>
            <tr><td style="padding-left:20px; background:#fafafa;">Adverse Conditions: ${escapeHtml(adverseConditions)}</td></tr>
        </table>`;

        // Daily Work Summary
        page1 += `<div class="rpr-section-header">Daily Work Summary</div>`;
        page1 += `<div class="rpr-work-summary">`;
        page1 += `<p style="font-weight:bold; margin-bottom:8px;">Construction Activities Performed and Observed on this Date:</p>`;

        const displayDate = formVal('reportDate') ? previewFormatDate(formVal('reportDate')) : 'this date';

        if (projectContractors.length === 0) {
            const workText = getValue('guidedNotes.workSummary', '');
            page1 += workText ? `<p>${escapeHtml(workText)}</p>` : `<p class="rpr-na">N/A.</p>`;
        } else {
            // Sort contractors: those with work performed first, no-work at bottom
            const sortedContractors = [...projectContractors].sort((a, b) => {
                const actA = getContractorActivity(a.id);
                const actB = getContractorActivity(b.id);
                const noWorkA = actA?.noWork === true || !(actA?.narrative || '').trim();
                const noWorkB = actB?.noWork === true || !(actB?.narrative || '').trim();
                if (noWorkA && !noWorkB) return 1;   // a has no work → goes after b
                if (!noWorkA && noWorkB) return -1;   // a has work → goes before b
                // Same status: keep prime contractors first
                if (a.type === 'prime' && b.type !== 'prime') return -1;
                if (a.type !== 'prime' && b.type === 'prime') return 1;
                return 0;
            });

            sortedContractors.forEach(contractor => {
                const activity = getContractorActivity(contractor.id);
                const crews = contractor.crews || [];
                const typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
                const trades = contractor.trades ? ` (${contractor.trades.toUpperCase()})` : '';
                const narrative = activity?.narrative || '';
                const isNoWork = activity?.noWork === true || !narrative.trim();

                page1 += `<div class="rpr-contractor-block">`;
                page1 += `<div class="rpr-contractor-name">${escapeHtml(contractor.name)} – ${typeLabel}${escapeHtml(trades)}</div>`;

                if (crews.length === 0) {
                    if (isNoWork) {
                        page1 += `<p style="font-style:italic; color:#333;">No work performed on ${escapeHtml(displayDate)}.</p>`;
                    } else {
                        const lines = narrative.split('\n').filter(l => l.trim());
                        page1 += '<ul>';
                        lines.forEach(line => {
                            const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                            page1 += `<li>${escapeHtml(prefix + line.trim())}</li>`;
                        });
                        page1 += '</ul>';
                        if (activity?.equipmentUsed || activity?.crew) {
                            page1 += `<div style="font-size:8pt; text-transform:uppercase; margin-top:4px;">`;
                            if (activity.equipmentUsed) page1 += `EQUIPMENT: ${escapeHtml(activity.equipmentUsed)} `;
                            if (activity.crew) page1 += `CREW: ${escapeHtml(activity.crew)}`;
                            page1 += `</div>`;
                        }
                    }
                } else {
                    // Has crews
                    if (isNoWork) {
                        page1 += `<p style="font-style:italic; color:#333;">No work performed on ${escapeHtml(displayDate)}.</p>`;
                    } else {
                        crews.forEach(crewObj => {
                            const crewActivity = getCrewActivity(contractor.id, crewObj.id);
                            const crewNarrative = crewActivity?.narrative || '';
                            const crewIsNoWork = !crewNarrative.trim();

                            page1 += `<div style="margin-left:12px; margin-bottom:8px; border-left:3px solid ${contractor.type === 'prime' ? '#16a34a' : '#1d4ed8'}; padding-left:10px;">`;
                            page1 += `<div style="font-weight:600; font-size:10pt; margin-bottom:4px;">${escapeHtml(crewObj.name)}</div>`;

                            if (crewIsNoWork) {
                                page1 += `<p style="font-style:italic; color:#333; font-size:9pt;">No work performed on ${escapeHtml(displayDate)}.</p>`;
                            } else {
                                const cLines = crewNarrative.split('\n').filter(l => l.trim());
                                page1 += '<ul>';
                                cLines.forEach(line => {
                                    const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                                    page1 += `<li>${escapeHtml(prefix + line.trim())}</li>`;
                                });
                                page1 += '</ul>';
                            }
                            page1 += '</div>';
                        });
                    }
                }
                page1 += '</div>';
            });
        }

        page1 += `</div>`; // end work-summary
        page1 += `<div class="rpr-page-footer">Page 1</div>`;
        page1 += `</div>`; // end page 1

        // ────── PAGE 2: Operations + Equipment + Issues + Communications ──────
        let page2 = `<div class="preview-page">${pageHeader()}`;

        // Daily Operations
        page2 += `<div class="rpr-section-header">Daily Operations</div>`;
        page2 += `<table class="rpr-ops-table"><thead><tr>
            <th>CONTRACTOR</th><th>TRADE</th><th>SUPER(S)</th><th>FOREMAN</th>
            <th>OPERATOR(S)</th><th>LABORER(S)</th><th>SURVEYOR(S)</th><th>OTHER(S)</th>
        </tr></thead><tbody>`;

        if (projectContractors.length === 0) {
            page2 += `<tr><td colspan="8" style="text-align:center; color:#666;">No contractors defined</td></tr>`;
        } else {
            projectContractors.forEach(contractor => {
                const ops = getContractorOperations(contractor.id);
                const abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
                const trades = previewFormatTradesAbbrev(contractor.trades);
                page2 += `<tr>
                    <td>${escapeHtml(abbrev)}</td>
                    <td>${escapeHtml(trades)}</td>
                    <td>${ops?.superintendents || 'N/A'}</td>
                    <td>${ops?.foremen || 'N/A'}</td>
                    <td>${ops?.operators || 'N/A'}</td>
                    <td>${ops?.laborers || 'N/A'}</td>
                    <td>${ops?.surveyors || 'N/A'}</td>
                    <td>${ops?.others || 'N/A'}</td>
                </tr>`;
            });
        }
        page2 += `</tbody></table>`;

        // Equipment
        page2 += `<div class="rpr-section-header">Mobilized Equipment &amp; Daily Utilization</div>`;
        page2 += `<table class="rpr-equip-table"><thead><tr>
            <th>CONTRACTOR</th><th>EQUIPMENT TYPE / MODEL #</th><th>QTY</th><th>NOTES</th>
        </tr></thead><tbody>`;

        const equipData = getEquipmentData();
        if (equipData.length === 0) {
            page2 += `<tr><td colspan="4" style="text-align:center; color:#666;">No equipment mobilized</td></tr>`;
        } else {
            equipData.forEach((item, idx) => {
                const cName = previewGetContractorName(item.contractorId, item.contractorName);
                const eqNotes = previewFormatEquipNotes(item.status, item.hoursUsed);
                const editKey = `equipment_${idx}`;
                const editedType = ue[editKey]?.type || item.type || '';
                const editedQty = ue[editKey]?.qty || item.qty || 1;
                const editedNotes = ue[editKey]?.notes || eqNotes;
                page2 += `<tr>
                    <td>${escapeHtml(cName)}</td>
                    <td>${escapeHtml(editedType)}</td>
                    <td>${editedQty}</td>
                    <td>${escapeHtml(editedNotes)}</td>
                </tr>`;
            });
        }
        page2 += `</tbody></table>`;

        // Issues
        const issuesText = formVal('issuesText', '');
        page2 += `<div class="rpr-section-header">General Issues; Unforeseen Conditions; Notices Given</div>`;
        page2 += `<div class="rpr-text-section">${previewFormatText(issuesText)}</div>`;

        // Communications
        const commsText = formVal('communicationsText', '');
        page2 += `<div class="rpr-section-header">Communications with the Contractor</div>`;
        page2 += `<div class="rpr-text-section">${previewFormatText(commsText)}</div>`;

        page2 += `<div class="rpr-page-footer">Page 2</div>`;
        page2 += `</div>`; // end page 2

        // ────── PAGE 3: QA/QC + Safety + Visitors ──────
        let page3 = `<div class="preview-page">${pageHeader()}`;

        // QA/QC
        const qaqcText = formVal('qaqcText', '');
        page3 += `<div class="rpr-section-header">QA/QC Testing and/or Inspections</div>`;
        page3 += `<div class="rpr-text-section">${previewFormatText(qaqcText)}</div>`;

        // Safety
        const hasIncident = document.getElementById('safetyHasIncident')?.checked || false;
        const safetyText = formVal('safetyText', '');
        page3 += `<div class="rpr-section-header">Safety Report</div>`;
        page3 += `<div class="rpr-text-section">`;
        page3 += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">`;
        page3 += `<span style="font-weight:bold;">Incident(s) on this Date:</span>`;
        page3 += `<div class="rpr-safety-checkboxes">
            <span style="display:flex; align-items:center; gap:4px;">
                <span class="rpr-checkbox-box ${hasIncident ? 'checked' : ''}">${hasIncident ? 'X' : ''}</span> Yes
            </span>
            <span style="display:flex; align-items:center; gap:4px;">
                <span class="rpr-checkbox-box ${!hasIncident ? 'checked' : ''}">${!hasIncident ? 'X' : ''}</span> No
            </span>
        </div></div>`;
        page3 += previewFormatText(safetyText);
        page3 += `</div>`;

        // Visitors
        const visitorsText = formVal('visitorsText', '');
        page3 += `<div class="rpr-section-header">Visitors; Deliveries; Additional Contract and/or Change Order Activities; Other Remarks</div>`;
        page3 += `<div class="rpr-text-section">${previewFormatText(visitorsText)}</div>`;

        page3 += `<div class="rpr-page-footer">Page 3</div>`;
        page3 += `</div>`; // end page 3

        // ────── PAGE 4: Photos ──────
        const photos = report.photos || [];
        let photoPagesHtml = '';

        if (photos.length > 0) {
            const photosPerPage = 4;
            const totalPhotoPages = Math.ceil(photos.length / photosPerPage);

            for (let pp = 0; pp < totalPhotoPages; pp++) {
                const pagePhotos = photos.slice(pp * photosPerPage, (pp + 1) * photosPerPage);
                const headerTitle = pp === 0 ? 'Daily Photos' : 'Daily Photos (Continued)';
                const pageNum = 4 + pp;

                let photoPage = `<div class="preview-page">${pageHeader()}`;
                photoPage += `<div class="rpr-section-header">${headerTitle}</div>`;
                photoPage += `<div style="border:1px solid #000; border-bottom:none; padding:6px 10px; font-size:9pt;">
                    <table><tr><td style="font-weight:bold; padding-right:10px;">Project Name:</td><td>${escapeHtml(projectName)}</td></tr>
                    <tr><td style="font-weight:bold; padding-right:10px;">Project #:</td><td>${escapeHtml(noabNo)}</td></tr></table>
                </div>`;

                photoPage += `<div class="rpr-photos-grid">`;
                pagePhotos.forEach((photo, i) => {
                    photoPage += `<div class="rpr-photo-cell">
                        <div class="rpr-photo-image">
                            <img src="${photo.url}" alt="Photo">
                        </div>
                        <div style="font-size:8pt; margin-bottom:4px;"><span style="font-weight:bold;">Date:</span> ${photo.date || reportDate}</div>
                        <div style="font-size:8pt; font-style:italic; color:#333;">${escapeHtml(photo.caption || '')}</div>
                    </div>`;
                });
                photoPage += `</div>`;

                photoPage += `<div class="rpr-page-footer">Page ${pageNum}</div>`;
                photoPage += `</div>`;
                photoPagesHtml += photoPage;
            }
        }

        // Assemble all pages inside the scaler
        container.innerHTML = `<div class="preview-wrapper">
            <div id="previewScaler" class="preview-scaler">
                ${page1}
                ${page2}
                ${page3}
                ${photoPagesHtml}
            </div>
        </div>`;

        // Scale the preview to fit the viewport width
        requestAnimationFrame(() => scalePreviewToFit());
    }

    /**
     * Scale the preview pages to fit the viewport width exactly.
     * Pages render at 816px (8.5in), then CSS-scale to fit the screen.
     * Centered via left margin. Wrapper height adjusted to prevent dead space.
     */
    function scalePreviewToFit() {
        const scaler = document.getElementById('previewScaler');
        if (!scaler) return;

        const wrapper = scaler.parentElement;
        const pageWidthPx = 816;
        const availWidth = wrapper.clientWidth || window.innerWidth;
        const scale = Math.min(1, availWidth / pageWidthPx);

        // Center horizontally: offset = (availWidth - scaledWidth) / 2
        const scaledWidth = pageWidthPx * scale;
        const leftOffset = Math.max(0, (availWidth - scaledWidth) / 2);

        scaler.style.transform = `scale(${scale})`;
        scaler.style.transformOrigin = 'top left';
        scaler.style.marginLeft = `${leftOffset}px`;

        // Shrink the wrapper's effective height so no dead space below
        const scaledHeight = scaler.scrollHeight * scale;
        wrapper.style.height = `${scaledHeight + 16}px`; // +16 for padding
    }

    // ============ CREW ACTIVITY HELPER ============
    /**
     * Get crew-specific activity data for preview/PDF
     * Checks userEdits > aiGenerated > report.activities
     */
    function getCrewActivity(contractorId, crewId) {
        const userEditKey = `activity_${contractorId}_crew_${crewId}`;
        if (userEdits[userEditKey]) {
            return userEdits[userEditKey];
        }

        // Check AI-generated activities for crew-level data
        if (report.aiGenerated?.activities) {
            const aiActivity = report.aiGenerated.activities.find(a =>
                a.contractorId === contractorId && a.crewId === crewId
            );
            if (aiActivity) return aiActivity;
        }

        // Fall back to report.activities
        if (report.activities) {
            return report.activities.find(a => a.contractorId === contractorId && a.crewId === crewId);
        }
        return null;
    }

    // ============ PDF GENERATION (VECTOR) ============
    /**
     * Generate PDF with crisp vector text using jsPDF direct drawing.
     * Copied from finalreview.js with adaptations to use report.js scope variables.
     */
    async function generateVectorPDF() {
        console.log('[PDF-VECTOR] Starting vector PDF generation');

        const jsPDFConstructor = (typeof jspdf !== 'undefined' && jspdf.jsPDF)
            || (typeof jsPDF !== 'undefined' && jsPDF)
            || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
            || (typeof window !== 'undefined' && window.jsPDF);

        if (!jsPDFConstructor) {
            throw new Error('jsPDF library not found.');
        }

        const doc = new jsPDFConstructor({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter',
            compress: true
        });

        // ── Constants ──
        const PW = 612, PH = 792, ML = 36, MR = 36, MT = 30;
        const CW = PW - ML - MR;
        const GREEN = [74, 124, 52];
        const GRAY_BG = [245, 245, 245];
        const BLACK = [0, 0, 0];
        const WHITE = [255, 255, 255];
        const DARK_BLUE = [30, 58, 95];

        let curY = MT;
        let pageNum = 1;

        const TITLE_SIZE = 18, SECTION_HEADER_SIZE = 10, LABEL_SIZE = 8, VALUE_SIZE = 9;
        const TABLE_HEADER_SIZE = 6, TABLE_CELL_SIZE = 8, BODY_SIZE = 9, FOOTER_SIZE = 8;

        // ── Helpers ──
        function setFont(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
        function setTextColor(r, g, b) { doc.setTextColor(r, g, b); }
        function setDrawColor(r, g, b) { doc.setDrawColor(r, g, b); }
        function setFillColor(r, g, b) { doc.setFillColor(r, g, b); }

        function wrapText(text, maxWidth, fontSize, fontStyle) {
            if (!text) return [''];
            setFont(fontStyle || 'normal', fontSize || BODY_SIZE);
            const lines = doc.splitTextToSize(String(text), maxWidth);
            return lines.length > 0 ? lines : [''];
        }

        function checkPageBreak(neededHeight) {
            if (curY + neededHeight > PH - MT - 30) {
                drawPageFooter();
                doc.addPage();
                pageNum++;
                curY = MT;
                drawReportHeader();
                return true;
            }
            return false;
        }

        function drawPageFooter() {
            const footerY = PH - 25;
            setDrawColor(200, 200, 200);
            doc.setLineWidth(0.5);
            doc.line(ML, footerY - 4, ML + CW, footerY - 4);
            setFont('normal', FOOTER_SIZE);
            setTextColor(102, 102, 102);
            doc.text(`${pageNum} of {{TOTAL}}`, PW / 2, footerY, { align: 'center' });
        }

        // Pre-load logo image before drawing (if available)
        let logoDataUrl = null;
        const logoSrcUrl = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;
        if (logoSrcUrl) {
            try {
                logoDataUrl = await loadImageAsDataURL(logoSrcUrl);
            } catch (e) {
                console.warn('[PDF-VECTOR] Failed to pre-load logo:', e);
            }
        }

        function drawReportHeader() {
            if (logoDataUrl) {
                // Draw embedded logo image (max 50pt high, proportional width)
                try {
                    doc.addImage(logoDataUrl, 'JPEG', ML, curY + 2, 0, 38); // auto-width, 38pt height
                } catch (e) {
                    // Fallback to text if image fails
                    setFont('bold', 9);
                    setTextColor(...DARK_BLUE);
                    doc.text('LOUIS ARMSTRONG', ML, curY + 12);
                    doc.text('NEW ORLEANS', ML, curY + 22);
                    doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
                }
            } else {
                setFont('bold', 9);
                setTextColor(...DARK_BLUE);
                doc.text('LOUIS ARMSTRONG', ML, curY + 12);
                doc.text('NEW ORLEANS', ML, curY + 22);
                doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
            }
            setFont('bold', TITLE_SIZE);
            setTextColor(...GREEN);
            doc.text('RPR DAILY REPORT', ML + CW, curY + 22, { align: 'right' });
            curY += 42;
            setDrawColor(...GREEN);
            doc.setLineWidth(2.5);
            doc.line(ML, curY, ML + CW, curY);
            curY += 8;
        }

        function drawSectionHeader(title) {
            const h = 20;
            checkPageBreak(h + 10);
            setFillColor(...GREEN);
            setDrawColor(...BLACK);
            doc.setLineWidth(0.5);
            doc.rect(ML, curY, CW, h, 'FD');
            setFont('bold', SECTION_HEADER_SIZE);
            setTextColor(...WHITE);
            doc.text(title.toUpperCase(), PW / 2, curY + 14, { align: 'center' });
            curY += h;
            setTextColor(...BLACK);
        }

        function drawCell(x, y, w, h, text, options) {
            const opts = { fill: null, bold: false, fontSize: VALUE_SIZE, align: 'left', padding: 4, border: true, ...options };
            if (opts.fill) { setFillColor(...opts.fill); doc.rect(x, y, w, h, 'F'); }
            if (opts.border) { setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.rect(x, y, w, h, 'S'); }
            if (text !== undefined && text !== null) {
                setFont(opts.bold ? 'bold' : 'normal', opts.fontSize);
                setTextColor(...BLACK);
                const textX = opts.align === 'center' ? x + w / 2 : x + opts.padding;
                const textY = y + h / 2 + opts.fontSize * 0.3;
                const maxW = w - opts.padding * 2;
                doc.text(String(text), textX, textY, { align: opts.align === 'center' ? 'center' : undefined, maxWidth: maxW });
            }
        }

        function drawTextBox(text, x, y, w, options) {
            const opts = { fontSize: BODY_SIZE, fontStyle: 'normal', padding: 8, bulletPoints: false, ...options };
            const innerW = w - opts.padding * 2;
            let lines;
            if (opts.bulletPoints && text) {
                const rawLines = String(text).split('\n').filter(l => l.trim());
                lines = [];
                rawLines.forEach(line => {
                    const prefixed = line.startsWith('•') || line.startsWith('-') ? line : `• ${line}`;
                    lines.push(...wrapText(prefixed, innerW, opts.fontSize, opts.fontStyle));
                });
            } else {
                lines = wrapText(text || 'N/A.', innerW, opts.fontSize, opts.fontStyle);
            }
            const lineH = opts.fontSize * 1.3;
            const footerReserve = 35;
            const maxPageY = PH - MT - footerReserve;

            // Check if entire box fits on current page
            const totalH = lines.length * lineH + opts.padding * 2;
            if (y + totalH <= maxPageY + MT) {
                // Fits on one page — draw normally
                setDrawColor(...BLACK);
                doc.setLineWidth(0.5);
                doc.line(x, y, x, y + totalH);
                doc.line(x + w, y, x + w, y + totalH);
                doc.line(x, y + totalH, x + w, y + totalH);
                setFont(opts.fontStyle, opts.fontSize);
                setTextColor(...BLACK);
                let textY = y + opts.padding + opts.fontSize;
                lines.forEach(line => { doc.text(line, x + opts.padding, textY); textY += lineH; });
                return totalH;
            }

            // Multi-page: draw lines progressively with page breaks
            let boxStartY = y;
            setFont(opts.fontStyle, opts.fontSize);
            setTextColor(...BLACK);
            let textY = y + opts.padding + opts.fontSize;
            let totalDrawn = 0;

            for (let i = 0; i < lines.length; i++) {
                if (textY + lineH > maxPageY + MT) {
                    // Close box on current page
                    const boxH = textY - boxStartY + opts.padding;
                    setDrawColor(...BLACK); doc.setLineWidth(0.5);
                    doc.line(x, boxStartY, x, boxStartY + boxH);
                    doc.line(x + w, boxStartY, x + w, boxStartY + boxH);
                    doc.line(x, boxStartY + boxH, x + w, boxStartY + boxH);
                    totalDrawn += boxH;

                    drawPageFooter(); doc.addPage(); pageNum++;
                    curY = MT; drawReportHeader();
                    boxStartY = curY;
                    textY = curY + opts.padding + opts.fontSize;
                    setFont(opts.fontStyle, opts.fontSize);
                    setTextColor(...BLACK);
                }
                doc.text(lines[i], x + opts.padding, textY);
                textY += lineH;
            }

            // Close final box segment
            const finalH = textY - boxStartY + opts.padding;
            setDrawColor(...BLACK); doc.setLineWidth(0.5);
            doc.line(x, boxStartY, x, boxStartY + finalH);
            doc.line(x + w, boxStartY, x + w, boxStartY + finalH);
            doc.line(x, boxStartY + finalH, x + w, boxStartY + finalH);
            curY = boxStartY + finalH;
            return curY - y; // total height consumed from original y
        }

        // ── Gather data from current form state ──
        function formVal(id, fallback) {
            const el = document.getElementById(id);
            if (!el) return fallback || '';
            if (el.tagName === 'SELECT') {
                const val = el.value;
                return (val && val !== 'Select...') ? val : (fallback || '');
            }
            return el.value || el.textContent || fallback || '';
        }

        function pdfFormatDate(dateStr) {
            if (!dateStr) return 'N/A';
            try {
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [yr, mo, dy] = dateStr.split('-');
                    return new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy)).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
                }
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            } catch (e) { return dateStr; }
        }

        function pdfFormatTime(timeStr) {
            if (!timeStr) return '';
            if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
            const parts = timeStr.split(':');
            if (parts.length < 2) return timeStr;
            const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return timeStr;
            return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
        }

        function pdfCalcShift(start, end) {
            if (!start || !end) return '';
            try {
                const sp = start.split(':'), ep = end.split(':');
                let diff = (parseInt(ep[0]) * 60 + (parseInt(ep[1]) || 0)) - (parseInt(sp[0]) * 60 + (parseInt(sp[1]) || 0));
                if (diff < 0) diff += 1440;
                return `${(diff / 60).toFixed(2)} hours`;
            } catch (e) { return ''; }
        }

        function pdfFormatTradesAbbrev(trades) {
            if (!trades) return '-';
            const abbrevMap = {
                'construction management': 'CM', 'project management': 'PM',
                'pile driving': 'PLE', 'concrete': 'CONC', 'asphalt': 'ASP',
                'utilities': 'UTL', 'earthwork': 'ERTHWRK', 'electrical': 'ELEC',
                'communications': 'COMM', 'fence': 'FENCE', 'pavement markings': 'PVMNT MRK',
                'hauling': 'HAUL', 'pavement subgrade': 'PVMT SUB', 'demo': 'DEMO',
                'demolition': 'DEMO', 'general': 'GEN'
            };
            return trades.split(/[;,]/).map(t => {
                const lower = t.trim().toLowerCase();
                return abbrevMap[lower] || lower.substring(0, 6).toUpperCase();
            }).join('; ');
        }

        function pdfGetContractorName(contractorId, fallbackName) {
            const c = projectContractors.find(c => c.id === contractorId);
            if (c) return c.abbreviation || c.name.substring(0, 15).toUpperCase();
            if (fallbackName) return fallbackName.substring(0, 15).toUpperCase();
            return 'UNKNOWN';
        }

        function pdfFormatEquipNotes(status, hoursUsed) {
            if (!status || status.toLowerCase() === 'idle' || status === '0' || status === '0 hrs') return 'IDLE';
            let h = hoursUsed;
            if (!h && status) { const m = status.match(/(\d+(?:\.\d+)?)/); if (m) h = parseFloat(m[1]); }
            if (h && h > 0) return `${h} HRS UTILIZED`;
            return 'IDLE';
        }

        const cleanW = (v, d) => (!v || v === '--' || v === 'Syncing...' || v === 'N/A' || String(v).trim() === '') ? (d || 'N/A') : v;

        const ue = report.userEdits || {};

        const projectName = formVal('projectName', activeProject?.projectName || '');
        const reportDate = pdfFormatDate(formVal('reportDate'));
        const noabNo = formVal('noabProjectNo', activeProject?.noabProjectNo || '');
        const location = formVal('projectLocation', activeProject?.location || '');
        const cnoNo = formVal('cnoSolicitationNo', activeProject?.cnoSolicitationNo || 'N/A');
        const engineer = formVal('engineer', activeProject?.engineer || '');
        const ntpDate = activeProject?.noticeToProceed ? pdfFormatDate(activeProject.noticeToProceed) : '';
        const contractorName = formVal('contractor', activeProject?.primeContractor || '');
        const duration = activeProject?.contractDuration ? `${activeProject.contractDuration} days` : '';
        const startTime = pdfFormatTime(formVal('startTime'));
        const endTime = pdfFormatTime(formVal('endTime'));
        const expectedCompletion = activeProject?.expectedCompletion ? pdfFormatDate(activeProject.expectedCompletion) : '';
        const shiftDuration = pdfCalcShift(formVal('startTime'), formVal('endTime'));
        const contractDayVal = formVal('contractDay');
        const weatherDays = formVal('weatherDaysCount', '0') + ' days';
        const completedBy = formVal('completedBy', userSettings?.fullName || '');
        const weather = report.overview?.weather || {};
        const highTemp = cleanW(formVal('weatherHigh'), 'N/A');
        const lowTemp = cleanW(formVal('weatherLow'), 'N/A');
        const precipitation = cleanW(formVal('weatherPrecip'), '0.00"');
        const generalCondition = cleanW(formVal('weatherCondition'), 'Not recorded');
        const jobSiteCondition = cleanW(formVal('weatherJobSite'), 'N/A');
        const adverseConditions = cleanW(formVal('weatherAdverse'), 'None');

        // ═══ PAGE 1: Header + Overview + Work Summary ═══
        curY = MT;
        drawReportHeader();
        drawSectionHeader('PROJECT OVERVIEW');

        const colW = [115, 155, 115, 155];
        const rowH = 16;
        const tableX = ML;

        function drawOverviewRow(l1, v1, l2, v2, opts) {
            const rh = opts?.height || rowH;
            let x = tableX;
            drawCell(x, curY, colW[0], rh, l1, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
            x += colW[0];
            drawCell(x, curY, colW[1], rh, v1, { fontSize: VALUE_SIZE });
            x += colW[1];
            drawCell(x, curY, colW[2], rh, l2, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
            x += colW[2];
            drawCell(x, curY, colW[3], rh, v2, { fontSize: VALUE_SIZE, ...opts?.lastCell });
            curY += rh;
        }

        drawOverviewRow('PROJECT NAME:', projectName, 'DATE:', reportDate);
        drawOverviewRow('NOAB PROJECT NO.:', noabNo, 'LOCATION:', location);
        drawOverviewRow('CNO SOLICITATION NO.:', cnoNo, 'ENGINEER:', engineer);
        drawOverviewRow('NOTICE TO PROCEED:', ntpDate, 'CONTRACTOR:', contractorName);
        drawOverviewRow('CONTRACT DURATION:', duration, 'START TIME:', startTime);
        drawOverviewRow('EXPECTED COMPLETION:', expectedCompletion, 'END TIME:', endTime);
        drawOverviewRow('CONTRACT DAY #:', contractDayVal, 'SHIFT DURATION:', shiftDuration);
        drawOverviewRow('WEATHER DAYS:', weatherDays, 'COMPLETED BY:', completedBy);

        // Weather + Signature rows
        const weatherRowH = 13;
        const totalSigH = weatherRowH * 5;
        drawCell(tableX, curY, colW[0], totalSigH, 'WEATHER:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
        drawCell(tableX + colW[0] + colW[1], curY, colW[2], totalSigH, 'SIGNATURE:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });

        const sigX = tableX + colW[0] + colW[1] + colW[2];
        setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.rect(sigX, curY, colW[3], totalSigH, 'S');

        const sigName = completedBy;
        setFont('italic', 14); setTextColor(...DARK_BLUE);
        doc.text(sigName, sigX + colW[3] / 2, curY + totalSigH / 2 - 4, { align: 'center' });

        const sigCompany = formVal('signatureCompany', userSettings?.company || '');
        const sigTitle = formVal('signatureTitle', userSettings?.title || '');
        if (sigCompany || sigTitle) {
            setFont('normal', 6); setTextColor(102, 102, 102);
            doc.text(`Digitally signed by ${sigName}`, sigX + colW[3] / 2, curY + totalSigH / 2 + 8, { align: 'center' });
        }

        const weatherTexts = [
            `High Temp: ${highTemp}  Low Temp: ${lowTemp}`,
            `Precipitation: ${precipitation}`,
            `General Condition: ${generalCondition}`,
            `Job Site Condition: ${jobSiteCondition}`,
            `Adverse Conditions: ${adverseConditions}`
        ];
        const weatherValX = tableX + colW[0];
        weatherTexts.forEach((wText, i) => {
            const wy = curY + i * weatherRowH;
            setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.rect(weatherValX, wy, colW[1], weatherRowH, 'S');
            setFont('normal', VALUE_SIZE); setTextColor(...BLACK);
            doc.text(wText, weatherValX + 4, wy + weatherRowH / 2 + 3);
        });
        curY += totalSigH;

        // Daily Work Summary
        drawSectionHeader('DAILY WORK SUMMARY');
        let wsStartY = curY;
        const wsPadding = 8;
        let wsContentY = curY + wsPadding;

        setFont('bold', BODY_SIZE); setTextColor(...BLACK);
        doc.text('Construction Activities Performed and Observed on this Date:', ML + wsPadding, wsContentY + BODY_SIZE);
        wsContentY += BODY_SIZE + 8;

        const pdfDisplayDate = reportDate || 'this date';

        // Sort: contractors with work first, no-work at bottom
        const pdfSortedContractors = [...projectContractors].sort((a, b) => {
            const actA = getContractorActivity(a.id);
            const actB = getContractorActivity(b.id);
            const noA = actA?.noWork === true || !(actA?.narrative || '').trim();
            const noB = actB?.noWork === true || !(actB?.narrative || '').trim();
            if (noA && !noB) return 1;
            if (!noA && noB) return -1;
            if (a.type === 'prime' && b.type !== 'prime') return -1;
            if (a.type !== 'prime' && b.type === 'prime') return 1;
            return 0;
        });

        pdfSortedContractors.forEach(contractor => {
            if (wsContentY > curY) curY = wsContentY;
            checkPageBreak(60);
            wsContentY = curY;

            const activity = getContractorActivity(contractor.id);
            const crews = contractor.crews || [];
            const typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
            const trades = contractor.trades ? ` (${contractor.trades.toUpperCase()})` : '';
            const abbrev = contractor.abbreviation ? ` (${contractor.abbreviation})` : '';

            setFont('bold', BODY_SIZE); setTextColor(...BLACK);
            const cTitle = `${contractor.name.toUpperCase()}${abbrev} – ${typeLabel}${trades}`;
            wrapText(cTitle, CW - wsPadding * 2, BODY_SIZE, 'bold').forEach(line => {
                doc.text(line, ML + wsPadding, wsContentY + BODY_SIZE);
                wsContentY += BODY_SIZE * 1.3;
            });

            const narrative = activity?.narrative || '';
            const isNoWork = activity?.noWork === true || !narrative.trim();

            if (crews.length === 0) {
                if (isNoWork) {
                    setFont('normal', BODY_SIZE);
                    doc.text('No work performed', ML + wsPadding, wsContentY + BODY_SIZE);
                    wsContentY += BODY_SIZE * 1.5;
                } else {
                    narrative.split('\n').filter(l => l.trim()).forEach(line => {
                        const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                        setFont('normal', BODY_SIZE);
                        wrapText(prefix + line.trim(), CW - wsPadding * 2 - 10, BODY_SIZE, 'normal').forEach((wl, i) => {
                            if (wsContentY + BODY_SIZE > PH - 55) {
                                const boxH = wsContentY - wsStartY + wsPadding;
                                setDrawColor(...BLACK); doc.setLineWidth(0.5);
                                doc.line(ML, wsStartY, ML, wsStartY + boxH);
                                doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                                doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);
                                drawPageFooter(); doc.addPage(); pageNum++; curY = MT;
                                drawReportHeader(); wsContentY = curY + wsPadding;
                                wsStartY = curY; // Reset box start for new page
                            }
                            doc.text(i === 0 ? wl : '  ' + wl, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                            wsContentY += BODY_SIZE * 1.3;
                        });
                    });
                    wsContentY += 3;
                }
            } else {
                crews.forEach(crewObj => {
                    const crewActivity = getCrewActivity(contractor.id, crewObj.id);
                    const crewNarrative = crewActivity?.narrative || '';
                    const crewIsNoWork = !crewNarrative.trim();

                    if (wsContentY + 30 > PH - 55) {
                        const boxH = wsContentY - wsStartY + wsPadding;
                        setDrawColor(...BLACK); doc.setLineWidth(0.5);
                        doc.line(ML, wsStartY, ML, wsStartY + boxH);
                        doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                        doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);
                        drawPageFooter(); doc.addPage(); pageNum++; curY = MT;
                        drawReportHeader(); wsContentY = curY + wsPadding;
                        wsStartY = curY; // Reset box start for new page
                    }

                    setFont('bold', BODY_SIZE);
                    doc.text(crewObj.name, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                    wsContentY += BODY_SIZE * 1.4;

                    if (crewIsNoWork) {
                        setFont('italic', BODY_SIZE);
                        doc.text(`No work performed on ${pdfDisplayDate}.`, ML + wsPadding + 10, wsContentY + BODY_SIZE);
                        wsContentY += BODY_SIZE * 1.5;
                    } else {
                        crewNarrative.split('\n').filter(l => l.trim()).forEach(line => {
                            const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                            setFont('normal', BODY_SIZE);
                            wrapText(prefix + line.trim(), CW - wsPadding * 2 - 15, BODY_SIZE, 'normal').forEach((wl, i) => {
                                doc.text(i === 0 ? wl : '  ' + wl, ML + wsPadding + 10, wsContentY + BODY_SIZE);
                                wsContentY += BODY_SIZE * 1.3;
                            });
                        });
                        wsContentY += 3;
                    }
                });
            }
            wsContentY += 4;
        });

        wsContentY += wsPadding;
        const wsBoxH = wsContentY - wsStartY;
        setDrawColor(...BLACK); doc.setLineWidth(0.5);
        doc.line(ML, wsStartY, ML, wsStartY + wsBoxH);
        doc.line(ML + CW, wsStartY, ML + CW, wsStartY + wsBoxH);
        doc.line(ML, wsStartY + wsBoxH, ML + CW, wsStartY + wsBoxH);
        curY = wsStartY + wsBoxH;

        // ═══ DAILY OPERATIONS TABLE ═══
        drawSectionHeader('DAILY OPERATIONS');
        const opsColWidths = [60, 70, 55, 55, 60, 85, 65, 90];
        const opsHeaders = ['CONTRACTOR', 'TRADE', 'SUPER(S)', 'FOREMAN', 'OPERATOR(S)', 'LABORER(S) /\nELECTRICIAN(S)', 'SURVEYOR(S)', 'OTHER(S)'];
        const opsHeaderH = 22;
        let ox = ML;
        opsHeaders.forEach((hdr, i) => {
            drawCell(ox, curY, opsColWidths[i], opsHeaderH, hdr, { fill: GRAY_BG, bold: true, fontSize: TABLE_HEADER_SIZE, align: 'center' });
            ox += opsColWidths[i];
        });
        curY += opsHeaderH;

        projectContractors.forEach(contractor => {
            checkPageBreak(18);
            const ops = getContractorOperations(contractor.id);
            const abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
            const trades = pdfFormatTradesAbbrev(contractor.trades);
            const opsRowH = 16;
            const rowData = [abbrev, trades, ops?.superintendents || 'N/A', ops?.foremen || 'N/A', ops?.operators || 'N/A', ops?.laborers || 'N/A', ops?.surveyors || 'N/A', ops?.others || 'N/A'];
            let rx = ML;
            rowData.forEach((val, i) => {
                drawCell(rx, curY, opsColWidths[i], opsRowH, val, { fontSize: TABLE_CELL_SIZE, align: i < 2 ? 'left' : 'center' });
                rx += opsColWidths[i];
            });
            curY += opsRowH;
        });

        // ═══ EQUIPMENT TABLE ═══
        drawSectionHeader('MOBILIZED EQUIPMENT & DAILY UTILIZATION');
        const eqColWidths = [100, 240, 60, 140];
        const eqHeaders = ['CONTRACTOR', 'EQUIPMENT TYPE / MODEL #', 'QUANTITY', 'NOTES'];
        const eqHeaderH = 20;
        let ex = ML;
        eqHeaders.forEach((hdr, i) => {
            drawCell(ex, curY, eqColWidths[i], eqHeaderH, hdr, { fill: GRAY_BG, bold: true, fontSize: TABLE_HEADER_SIZE, align: 'center' });
            ex += eqColWidths[i];
        });
        curY += eqHeaderH;

        const equipmentData = getEquipmentData();
        if (equipmentData.length === 0) {
            drawCell(ML, curY, CW, 16, 'No equipment mobilized', { fontSize: TABLE_CELL_SIZE, align: 'center' });
            curY += 16;
        } else {
            equipmentData.forEach((item, idx) => {
                checkPageBreak(16);
                const cName = pdfGetContractorName(item.contractorId, item.contractorName);
                const eqNotes = pdfFormatEquipNotes(item.status, item.hoursUsed);
                const editKey = `equipment_${idx}`;
                const editedType = ue[editKey]?.type || item.type || '';
                const editedQty = ue[editKey]?.qty || item.qty || 1;
                const editedNotes = ue[editKey]?.notes || eqNotes;
                const rowData = [cName, editedType, String(editedQty), editedNotes];
                let rx = ML;
                rowData.forEach((val, i) => {
                    drawCell(rx, curY, eqColWidths[i], 16, val, { fontSize: TABLE_CELL_SIZE, align: i < 2 ? 'left' : 'center' });
                    rx += eqColWidths[i];
                });
                curY += 16;
            });
        }

        // ═══ ISSUES ═══
        drawSectionHeader('GENERAL ISSUES; UNFORESEEN CONDITIONS; NOTICES GIVEN');
        const issuesText = formVal('issuesText', '');
        curY += drawTextBox(issuesText || 'N/A.', ML, curY, CW, { bulletPoints: !!issuesText });

        // ═══ COMMUNICATIONS ═══
        drawSectionHeader('COMMUNICATIONS WITH THE CONTRACTOR');
        const commsText = formVal('communicationsText', '');
        curY += drawTextBox(commsText || 'N/A.', ML, curY, CW, { bulletPoints: !!commsText });

        // ═══ QA/QC ═══
        drawSectionHeader('QA/QC TESTING AND/OR INSPECTIONS');
        const qaqcText = formVal('qaqcText', '');
        curY += drawTextBox(qaqcText || 'N/A.', ML, curY, CW, { bulletPoints: !!qaqcText });

        // ═══ SAFETY ═══
        drawSectionHeader('SAFETY REPORT');
        const hasIncident = document.getElementById('safetyHasIncident')?.checked || false;
        const safetyBoxStartY = curY;
        setDrawColor(...BLACK); doc.setLineWidth(0.5);

        setFont('bold', BODY_SIZE); setTextColor(...BLACK);
        doc.text('Incident(s) on this Date:', ML + 8, curY + 14);

        const cbSize = 10, cbY = curY + 6, yesX = ML + CW - 120;
        doc.rect(yesX, cbY, cbSize, cbSize, 'S');
        if (hasIncident) { setFont('bold', 8); doc.text('X', yesX + 2.5, cbY + 8.5); }
        setFont('normal', BODY_SIZE); doc.text('Yes', yesX + cbSize + 4, curY + 14);

        const noX = yesX + 50;
        doc.rect(noX, cbY, cbSize, cbSize, 'S');
        if (!hasIncident) { setFont('bold', 8); doc.text('X', noX + 2.5, cbY + 8.5); }
        setFont('normal', BODY_SIZE); doc.text('No', noX + cbSize + 4, curY + 14);

        curY += 22;

        const safetyNotes = formVal('safetyText', '');
        const safetyLines = wrapText(safetyNotes || 'N/A.', CW - 16, BODY_SIZE, 'normal');
        const safetyLineH = BODY_SIZE * 1.3;
        const safetyTextH = safetyLines.length * safetyLineH + 8;
        setFont('normal', BODY_SIZE);
        let safetyTextY = curY + 4 + BODY_SIZE;
        safetyLines.forEach(line => { doc.text(line, ML + 8, safetyTextY); safetyTextY += safetyLineH; });
        curY += safetyTextH;

        doc.line(ML, safetyBoxStartY, ML, curY);
        doc.line(ML + CW, safetyBoxStartY, ML + CW, curY);
        doc.line(ML, curY, ML + CW, curY);

        // ═══ VISITORS ═══
        drawSectionHeader('VISITORS; DELIVERIES; ADDITIONAL CONTRACT AND/OR CHANGE ORDER ACTIVITIES; OTHER REMARKS');
        const visitorsText = formVal('visitorsText', '');
        curY += drawTextBox(visitorsText || 'N/A.', ML, curY, CW, { bulletPoints: !!visitorsText });

        drawPageFooter();

        // ═══ PHOTO PAGES ═══
        const photos = report.photos || [];
        if (photos.length > 0) {
            const photosPerPage = 4;
            const totalPhotoPages = Math.ceil(photos.length / photosPerPage);

            for (let pp = 0; pp < totalPhotoPages; pp++) {
                doc.addPage(); pageNum++; curY = MT;
                drawReportHeader();
                drawSectionHeader(pp === 0 ? 'DAILY PHOTOS' : 'DAILY PHOTOS (CONTINUED)');

                const infoH = 30;
                setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.rect(ML, curY, CW, infoH, 'S');
                setFont('bold', VALUE_SIZE); setTextColor(...BLACK);
                doc.text('Project Name:', ML + 8, curY + 12);
                setFont('normal', VALUE_SIZE); doc.text(projectName, ML + 85, curY + 12);
                setFont('bold', VALUE_SIZE); doc.text('Project #:', ML + 8, curY + 24);
                setFont('normal', VALUE_SIZE); doc.text(noabNo, ML + 85, curY + 24);
                curY += infoH;

                const pagePhotos = photos.slice(pp * photosPerPage, (pp + 1) * photosPerPage);
                const photoCellW = CW / 2, photoCellH = 165, photoImgH = 120;

                for (let pi = 0; pi < pagePhotos.length; pi++) {
                    const photo = pagePhotos[pi];
                    const col = pi % 2, row = Math.floor(pi / 2);
                    const cx = ML + col * photoCellW, cy = curY + row * photoCellH;

                    setDrawColor(...BLACK); doc.setLineWidth(0.5); doc.rect(cx, cy, photoCellW, photoCellH, 'S');

                    if (photo.url) {
                        try {
                            const imgData = await loadImageAsDataURL(photo.url);
                            if (imgData) {
                                const imgPad = 8, imgW = photoCellW - imgPad * 2, imgH = photoImgH - imgPad;
                                doc.addImage(imgData, 'JPEG', cx + imgPad, cy + imgPad, imgW, imgH);
                            }
                        } catch (imgErr) {
                            console.warn('[PDF-VECTOR] Failed to load photo:', imgErr);
                            setFont('italic', 8); setTextColor(150, 150, 150);
                            doc.text('Photo unavailable', cx + photoCellW / 2, cy + photoImgH / 2, { align: 'center' });
                        }
                    }

                    const metaY = cy + photoImgH + 4;
                    setFont('bold', 7); setTextColor(...BLACK);
                    doc.text('Date:', cx + 8, metaY);
                    setFont('normal', 7);
                    doc.text(photo.date || reportDate, cx + 30, metaY);

                    if (photo.caption) {
                        setFont('italic', 7); setTextColor(51, 51, 51);
                        const capLines = wrapText(photo.caption, photoCellW - 16, 7, 'italic');
                        let capY = metaY + 10;
                        capLines.forEach(cl => { doc.text(cl, cx + 8, capY); capY += 9; });
                    }
                }

                curY += Math.ceil(pagePhotos.length / 2) * photoCellH;
                drawPageFooter();
            }
        }

        // Fix total page count
        const numPages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= numPages; p++) {
            doc.setPage(p);
            const footerY = PH - 25;
            setFillColor(...WHITE);
            doc.rect(ML, footerY - 2, CW, 14, 'F');
            setFont('normal', FOOTER_SIZE);
            setTextColor(102, 102, 102);
            doc.text(`${p} of ${numPages}`, PW / 2, footerY, { align: 'center' });
        }

        // Generate output
        const pName = (projectName || 'Report').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const rDate = formVal('reportDate') || getReportDateStr() || getLocalDateString();
        const filename = `${pName}_${rDate}.pdf`;

        console.log('[PDF-VECTOR] PDF generation complete:', filename, '(' + numPages + ' pages)');

        const blob = doc.output('blob');
        console.log('[PDF-VECTOR] Blob size:', blob.size, 'bytes');

        return { blob, filename };
    }

    /**
     * Load an image URL as a data URL for embedding in jsPDF
     */
    async function loadImageAsDataURL(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const maxDim = 800;
                    let w = img.naturalWidth, h = img.naturalHeight;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                        else { w = Math.round(w * maxDim / h); h = maxDim; }
                    }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } catch (e) { resolve(null); }
            };
            img.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 10000);
            img.src = url;
        });
    }

    // ============ SUBMIT FLOW ============
    /**
     * Main submit handler - orchestrates PDF generation, upload, and finalization
     */
    async function handleSubmit() {
        if (!navigator.onLine) {
            showSubmitError('Cannot submit offline. Please connect to internet.');
            return;
        }

        if (!report) {
            showSubmitError('No report data found.');
            return;
        }

        if (!currentReportId) {
            showSubmitError('No report ID found. Cannot submit.');
            return;
        }

        // Show loading overlay
        showSubmitLoadingOverlay(true, 'Generating PDF...');

        try {
            console.log('[SUBMIT] Starting report submission for:', currentReportId);

            // Save current form data first
            saveReportToLocalStorage();

            // Generate PDF
            showSubmitLoadingOverlay(true, 'Generating PDF...');
            const pdf = await generateVectorPDF();
            console.log('[SUBMIT] PDF generated:', pdf.filename);

            // Upload PDF
            showSubmitLoadingOverlay(true, 'Uploading PDF...');
            const pdfUrl = await uploadPDFToStorage(pdf);
            console.log('[SUBMIT] PDF uploaded:', pdfUrl);

            // Ensure report exists
            showSubmitLoadingOverlay(true, 'Saving report...');
            await ensureReportExists();

            // Save to final_reports
            await saveToFinalReports(pdfUrl);

            // Update status
            await updateReportStatus('submitted', pdfUrl);

            // Cleanup
            showSubmitLoadingOverlay(true, 'Cleaning up...');
            await cleanupLocalStorage();

            console.log('[SUBMIT] Submit complete!');
            window.location.href = 'archives.html?submitted=true';

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
        const storagePath = `${currentReportId}/${pdf.filename}`;

        const { data, error } = await supabaseClient
            .storage
            .from('report-pdfs')
            .upload(storagePath, pdf.blob, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (error) throw new Error('PDF upload failed: ' + error.message);

        const { data: urlData } = supabaseClient
            .storage
            .from('report-pdfs')
            .getPublicUrl(storagePath);

        return urlData.publicUrl;
    }

    /**
     * Ensure report exists in reports table (foreign key requirement)
     */
    async function ensureReportExists() {
        const reportData = getReportData(currentReportId) || {};
        const reportDate = formVal('reportDate') || getReportDateStr();

        const reportRow = {
            id: currentReportId,
            project_id: activeProject?.id || null,
            device_id: getDeviceId(),
            user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
            report_date: reportDate,
            status: 'draft',
            capture_mode: reportData.captureMode || 'guided',
            created_at: reportData.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient
            .from('reports')
            .upsert(reportRow, { onConflict: 'id' });

        if (error) throw new Error('Failed to create report record: ' + error.message);
    }

    /**
     * Save report metadata to final_reports table
     */
    async function saveToFinalReports(pdfUrl) {
        const weather = report.overview?.weather || {};
        const submittedAt = new Date().toISOString();

        function cleanWeatherValue(val) {
            if (val === null || val === undefined || val === '' || val === '--' || val === 'N/A') return null;
            const numMatch = String(val).match(/^[\d.]+/);
            if (numMatch) { const num = parseFloat(numMatch[0]); return isNaN(num) ? null : num; }
            return null;
        }

        const finalReportData = {
            report_id: currentReportId,
            pdf_url: pdfUrl,
            submitted_at: submittedAt,
            weather_high_temp: cleanWeatherValue(formVal('weatherHigh')),
            weather_low_temp: cleanWeatherValue(formVal('weatherLow')),
            weather_precipitation: cleanWeatherValue(formVal('weatherPrecip')),
            weather_general_condition: cleanWeatherValue(formVal('weatherCondition')),
            weather_job_site_condition: cleanWeatherValue(formVal('weatherJobSite')),
            weather_adverse_conditions: cleanWeatherValue(formVal('weatherAdverse')),
            executive_summary: report.aiGenerated?.executive_summary || report.aiGenerated?.executiveSummary || '',
            work_performed: report.aiGenerated?.work_performed || report.aiGenerated?.workPerformed || '',
            safety_observations: formVal('safetyText', ''),
            delays_issues: formVal('issuesText', ''),
            qaqc_notes: formVal('qaqcText', ''),
            communications_notes: formVal('communicationsText', ''),
            visitors_deliveries_notes: formVal('visitorsText', ''),
            inspector_notes: report.aiGenerated?.inspector_notes || '',
            contractors_json: report.aiGenerated?.activities || report.activities || [],
            personnel_json: report.aiGenerated?.operations || report.operations || [],
            equipment_json: report.aiGenerated?.equipment || report.equipment || [],
            has_contractor_personnel: (report.aiGenerated?.activities?.length > 0) || (report.aiGenerated?.operations?.length > 0),
            has_equipment: (report.aiGenerated?.equipment?.length > 0) || (report.equipment?.length > 0),
            has_issues: !!formVal('issuesText'),
            has_communications: !!formVal('communicationsText'),
            has_qaqc: !!formVal('qaqcText'),
            has_safety_incidents: document.getElementById('safetyHasIncident')?.checked || false,
            has_visitors_deliveries: !!formVal('visitorsText'),
            has_photos: report.photos?.length > 0
        };

        const { error } = await supabaseClient
            .from('final_reports')
            .upsert(finalReportData, { onConflict: 'report_id' });

        if (error) throw new Error('Failed to save report: ' + error.message);
    }

    /**
     * Update reports table status
     */
    async function updateReportStatus(status, pdfUrl) {
        const submittedAt = new Date().toISOString();
        const { error } = await supabaseClient
            .from('reports')
            .update({
                status: status,
                submitted_at: submittedAt,
                updated_at: submittedAt,
                pdf_url: pdfUrl
            })
            .eq('id', currentReportId);

        if (error) throw new Error('Failed to update status: ' + error.message);

        report.meta = report.meta || {};
        report.meta.submitted = true;
        report.meta.submittedAt = submittedAt;
        report.meta.status = 'submitted';
    }

    /**
     * Clean up local storage after successful submit
     */
    async function cleanupLocalStorage() {
        deleteReportData(currentReportId);

        const currentReports = JSON.parse(localStorage.getItem('fvp_current_reports') || '{}');
        delete currentReports[currentReportId];
        localStorage.setItem('fvp_current_reports', JSON.stringify(currentReports));

        if (window.idb && typeof window.idb.deletePhotosByReportId === 'function') {
            try {
                await window.idb.deletePhotosByReportId(currentReportId);
            } catch (e) {
                console.warn('[SUBMIT] Could not clean IndexedDB photos:', e);
            }
        }
    }

    /**
     * Helper to read form field value (for submit/PDF functions)
     */
    function formVal(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback || '';
        if (el.tagName === 'SELECT') {
            const val = el.value;
            return (val && val !== 'Select...') ? val : (fallback || '');
        }
        return el.value || el.textContent || fallback || '';
    }

    /**
     * Show/hide submit loading overlay
     */
    function showSubmitLoadingOverlay(show, statusText) {
        let overlay = document.getElementById('submitLoadingOverlay');

        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'submitLoadingOverlay';
                overlay.className = 'submit-overlay';
                overlay.innerHTML = `
                    <div class="submit-spinner"><i class="fas fa-spinner fa-spin"></i></div>
                    <div class="submit-status" id="submitStatusText">${statusText || 'Processing...'}</div>
                `;
                document.body.appendChild(overlay);
            } else {
                const statusEl = document.getElementById('submitStatusText');
                if (statusEl) statusEl.textContent = statusText || 'Processing...';
                overlay.style.display = 'flex';
            }

            // Disable submit button
            const btn = document.getElementById('submitReportBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            }
        } else {
            if (overlay) overlay.style.display = 'none';

            // Re-enable submit button
            const btn = document.getElementById('submitReportBtn');
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
        const existingToast = document.getElementById('submitErrorToast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.id = 'submitErrorToast';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px;
            font-size: 14px; font-weight: 500; z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 12px; max-width: 90vw;
        `;
        toast.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${escapeHtml(message)}</span>
            <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:white; cursor:pointer; padding:4px; margin-left:8px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 8000);
    }

    // ============ EXPOSE FUNCTIONS TO WINDOW ============
    // Functions called from onclick handlers in HTML must be globally accessible
    window.saveReport = saveReport;
    window.exportPDF = exportPDF;
    window.goToFinalReview = goToFinalReview;
    window.switchTab = switchTab;
    window.retryRefineProcessing = retryRefineProcessing;
    window.refineTextField = refineTextField;
    window.refineContractorNarrative = refineContractorNarrative;
    window.scrollToDebugPanel = scrollToDebugPanel;
    window.dismissDebugBanner = dismissDebugBanner;
    window.addEquipmentRow = addEquipmentRow;
    window.toggleDebugPanel = toggleDebugPanel;
    window.toggleDebugSection = toggleDebugSection;
    window.downloadDebugJSON = downloadDebugJSON;
    window.downloadDebugMarkdown = downloadDebugMarkdown;
    window.confirmSubmit = confirmSubmit;
    window.hideSubmitModal = hideSubmitModal;
    window.toggleNoWork = toggleNoWork;
    window.handlePhotoLoad = handlePhotoLoad;
    window.handlePhotoError = handlePhotoError;
    window.handleSubmit = handleSubmit;
    window.renderPreview = renderPreview;

    // Debug access for development
    window.__fvp_debug = {
        get report() { return report; },
        get activeProject() { return activeProject; },
        get currentReportId() { return currentReportId; },
        get userEdits() { return userEdits; }
    };

})();
