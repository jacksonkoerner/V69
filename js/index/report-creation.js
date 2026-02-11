// ============================================================================
// FieldVoice Pro v6 - Report Creation (report-creation.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem,
//                     deleteCurrentReport, deleteReportData
// - report-rules.js: getTodayDateString, canStartNewReport, REPORT_STATUS
// - ui-utils.js: escapeHtml, formatDate
// - config.js: supabaseClient
// - idb.js: window.idb
// - device-id.js: getDeviceId
// - data-layer.js: window.dataLayer
// - index/main.js: projectsCache, activeProjectCache, getActiveProjectFromCache
// - index/report-cards.js: updateActiveProjectCard
// ============================================================================

/**
 * Create a draft row in Supabase reports table when a new report UUID is
 * generated on the dashboard. Returns a promise so callers can await it
 * before navigating away.
 */
function createSupabaseReportRow(reportId, projectId) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return Promise.resolve();
    const now = new Date().toISOString();
    return supabaseClient
        .from('reports')
        .upsert({
            id: reportId,
            project_id: projectId,
            user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
            device_id: getDeviceId(),
            report_date: getTodayDateString(),
            status: 'draft',
            created_at: now,
            updated_at: now
        }, { onConflict: 'id' })
        .then(({ error }) => {
            if (error) console.error('[INDEX] Failed to create Supabase report row:', error);
            else console.log('[INDEX] Supabase report row created:', reportId);
        })
        .catch(err => console.error('[INDEX] Supabase report row error:', err));
}

function beginDailyReport() {
    showProjectPickerModal();
}

async function continueDailyReport() {
    // v6.9: Duplicate check before proceeding
    const activeProjectId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (activeProjectId) {
        const today = getTodayDateString();
        const reports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};
        const existing = Object.values(reports).find(
            r => r.project_id === activeProjectId &&
                 r.date === today &&
                 r.status !== REPORT_STATUS.SUBMITTED
        );
        if (existing) {
            const projectName = existing.project_name || getActiveProjectFromCache()?.projectName || 'this project';
            showDuplicateReportModal(projectName, today, existing.id, activeProjectId);
            return;
        }
    }

    const newReportId = crypto.randomUUID();
    await createSupabaseReportRow(newReportId, getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID));
    window.location.href = `quick-interview.html?reportId=${newReportId}`;
}

// ============ PROJECT PICKER MODAL ============
async function showProjectPickerModal() {
    const modal = document.getElementById('projectPickerModal');
    const listContainer = document.getElementById('projectPickerList');

    // Show loading state
    listContainer.innerHTML = `
        <div class="p-8 text-center">
            <i class="fas fa-spinner fa-spin text-slate-400 text-2xl mb-4"></i>
            <p class="text-sm text-slate-500">Loading projects...</p>
        </div>
    `;
    modal.classList.remove('hidden');

    // Load local projects first
    let projects = await window.dataLayer.loadProjects();

    // Always refresh from Supabase when online to get all projects
    if (navigator.onLine) {
        try {
            projects = await window.dataLayer.refreshProjectsFromCloud();
        } catch (e) {
            console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
            // Keep using local projects on error
        }
    }
    projectsCache = projects;
    const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);

    if (projects.length === 0) {
        // No projects configured
        listContainer.innerHTML = `
            <div class="p-8 text-center">
                <div class="w-16 h-16 bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-folder-open text-slate-400 text-2xl"></i>
                </div>
                <p class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">No Projects Configured</p>
                <p class="text-sm text-slate-500 mb-6">Create a project to start generating daily reports</p>
                <button onclick="goToProjectSetup()" class="w-full p-4 bg-safety-green hover:bg-green-700 text-white font-bold uppercase transition-colors flex items-center justify-center gap-2">
                    <i class="fas fa-plus"></i>
                    Create Project
                </button>
            </div>
        `;
    } else {
        // Check eligibility using report-rules.js
        const eligibilityMap = {};
        for (const project of projects) {
            eligibilityMap[project.id] = canStartNewReport(project.id);
        }

        // Render project list
        listContainer.innerHTML = projects.map(project => {
            const isActive = project.id === activeId;
            const eligibility = eligibilityMap[project.id];
            const canStart = eligibility.allowed;
            const reason = eligibility.reason;

            if (!canStart && reason !== 'CONTINUE_EXISTING') {
                // Project is blocked - show disabled state
                const reasonText = reason === 'UNFINISHED_PREVIOUS' ? 'Has Late Report'
                                 : reason === 'ALREADY_SUBMITTED_TODAY' ? 'Submitted Today'
                                 : 'Unavailable';
                const reasonIcon = reason === 'UNFINISHED_PREVIOUS' ? 'fa-exclamation-triangle'
                                 : reason === 'ALREADY_SUBMITTED_TODAY' ? 'fa-check-circle'
                                 : 'fa-lock';

                return `
                    <div class="w-full p-4 text-left border-b border-slate-200 last:border-b-0 bg-slate-50 opacity-60 cursor-not-allowed">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-400 flex items-center justify-center shrink-0">
                                <i class="fas ${reasonIcon} text-white"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="font-bold text-slate-600 truncate">${escapeHtml(project.projectName)}</p>
                                    <span class="shrink-0 text-[10px] bg-slate-400 text-white px-2 py-0.5 font-bold uppercase">${reasonText}</span>
                                </div>
                                <p class="text-xs text-slate-500 truncate mt-0.5">
                                    ${project.noabProjectNo ? `#${escapeHtml(project.noabProjectNo)}` : ''}
                                    ${project.noabProjectNo && project.location ? ' • ' : ''}
                                    ${project.location ? escapeHtml(project.location) : ''}
                                    ${!project.noabProjectNo && !project.location ? 'No details' : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <button onclick="selectProjectAndProceed('${project.id}')" class="w-full p-4 text-left hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-b-0 ${isActive ? 'bg-safety-green/5' : ''}">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 ${isActive ? 'bg-safety-green' : 'bg-dot-blue'} flex items-center justify-center shrink-0">
                            <i class="fas ${isActive ? 'fa-check' : 'fa-building'} text-white"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-slate-800 truncate">${escapeHtml(project.projectName)}</p>
                                ${isActive ? '<span class="shrink-0 text-[10px] bg-safety-green text-white px-2 py-0.5 font-bold uppercase">Active</span>' : ''}
                                ${reason === 'CONTINUE_EXISTING' ? '<span class="shrink-0 text-[10px] bg-dot-orange text-white px-2 py-0.5 font-bold uppercase">In Progress</span>' : ''}
                            </div>
                            <p class="text-xs text-slate-500 truncate mt-0.5">
                                ${project.noabProjectNo ? `#${escapeHtml(project.noabProjectNo)}` : ''}
                                ${project.noabProjectNo && project.location ? ' • ' : ''}
                                ${project.location ? escapeHtml(project.location) : ''}
                                ${!project.noabProjectNo && !project.location ? 'No details' : ''}
                            </p>
                        </div>
                        <i class="fas fa-chevron-right text-slate-400 shrink-0"></i>
                    </div>
                </button>
            `;
        }).join('');
    }
}

function closeProjectPickerModal() {
    document.getElementById('projectPickerModal').classList.add('hidden');
}

async function selectProjectAndProceed(projectId) {
    // Set as active project in localStorage using storage-keys helper
    setStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);

    // Update cache
    activeProjectCache = await window.dataLayer.loadActiveProject();

    // Update the active project card on dashboard (visible when they return)
    updateActiveProjectCard();

    // Close project picker modal
    closeProjectPickerModal();

    // v6.9: Duplicate report check — look for existing report for this project + today
    const today = getTodayDateString();
    const reports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};
    const existing = Object.values(reports).find(
        r => r.project_id === projectId &&
             r.date === today &&
             r.status !== REPORT_STATUS.SUBMITTED
    );

    if (existing) {
        // Show duplicate report dialog
        const projectName = existing.project_name || getActiveProjectFromCache()?.projectName || 'this project';
        showDuplicateReportModal(projectName, today, existing.id, projectId);
        return;
    }

    // No duplicate — proceed with new UUID
    const newReportId = crypto.randomUUID();
    await createSupabaseReportRow(newReportId, projectId);
    window.location.href = `quick-interview.html?reportId=${newReportId}`;
}

// ============ DUPLICATE REPORT CHECK ============
function showDuplicateReportModal(projectName, date, existingReportId, projectId) {
    const modal = document.getElementById('duplicateReportModal');
    const messageEl = document.getElementById('duplicateReportMessage');
    const goBtn = document.getElementById('duplicateGoToReportBtn');
    const deleteBtn = document.getElementById('duplicateDeleteAndNewBtn');
    const cancelBtn = document.getElementById('duplicateCancelBtn');

    // Format date for display
    const displayDate = formatDate(date, 'short');
    messageEl.textContent = `You already have a report in progress for ${projectName} on ${displayDate}. Go to that report, or delete it and start fresh?`;

    // Wire up buttons
    goBtn.onclick = () => {
        closeDuplicateReportModal();
        window.location.href = `quick-interview.html?reportId=${existingReportId}`;
    };

    deleteBtn.onclick = async () => {
        // Show loading state
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...';

        try {
            // Delete from Supabase if it exists (UUID format, 36 chars)
            if (existingReportId && existingReportId.length === 36 && typeof supabaseClient !== 'undefined' && supabaseClient) {
                const result = await deleteReportCascade(existingReportId);
                if (result.success) {
                    console.log('[DUPLICATE] Deleted existing report from Supabase:', existingReportId);
                } else {
                    console.warn('[DUPLICATE] Supabase delete had errors (continuing):', result.errors);
                }
            }

            // Delete from IndexedDB
            if (window.idb) {
                try { await window.idb.deleteReport(existingReportId); } catch(e) { /* ok */ }
                try { await window.idb.deletePhotosByReportId(existingReportId); } catch(e) { /* ok */ }
            }

            // Delete from localStorage: fvp_current_reports entry
            deleteCurrentReport(existingReportId);
            // Delete orphaned report data: fvp_report_{uuid}
            deleteReportData(existingReportId);
            console.log('[DUPLICATE] Deleted existing report from localStorage:', existingReportId);

            closeDuplicateReportModal();

            // Proceed with new UUID
            const newReportId = crypto.randomUUID();
            await createSupabaseReportRow(newReportId, projectId);
            window.location.href = `quick-interview.html?reportId=${newReportId}`;
        } catch (e) {
            console.error('[DUPLICATE] Error deleting report:', e);
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Delete & Start Fresh';
            alert('Failed to delete existing report. Please try again.');
        }
    };

    cancelBtn.onclick = () => {
        closeDuplicateReportModal();
    };

    modal.classList.remove('hidden');
}

function closeDuplicateReportModal() {
    const modal = document.getElementById('duplicateReportModal');
    modal.classList.add('hidden');

    // Reset delete button state
    const deleteBtn = document.getElementById('duplicateDeleteAndNewBtn');
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fas fa-trash mr-2"></i>Delete & Start Fresh';
}

function goToProjectSetup() {
    closeProjectPickerModal();
    window.location.href = 'project-config.html';
}
