// ============================================================================
// FieldVoice Pro v6 - Report Cards (report-cards.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem
// - report-rules.js: getTodayDateString, REPORT_STATUS
// - ui-utils.js: escapeHtml, formatDate
// - index/main.js: projectsCache (via getProjects), getActiveProjectFromCache
// ============================================================================

function renderReportCards() {
    const container = document.getElementById('reportCardsSection');
    if (!container) return;

    // Get ALL reports from localStorage
    const allReports = Object.values(getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {});

    // Get ALL projects (from cache or localStorage)
    const projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
    const allProjects = getProjects().length > 0
        ? getProjects()
        : Object.values(projectsMap);

    // Group reports by project_id
    const reportsByProject = {};
    const orphanReports = []; // reports with unknown project_id

    allReports.forEach(r => {
        if (r.project_id) {
            if (!reportsByProject[r.project_id]) reportsByProject[r.project_id] = [];
            reportsByProject[r.project_id].push(r);
        } else {
            orphanReports.push(r);
        }
    });

    // Sort reports within each group: newest date first, then by updated_at
    for (const pid of Object.keys(reportsByProject)) {
        reportsByProject[pid].sort((a, b) => {
            const dateCompare = (b.reportDate || '').localeCompare(a.reportDate || '');
            if (dateCompare !== 0) return dateCompare;
            return (b.updated_at || 0) - (a.updated_at || 0);
        });
    }

    // Build project sections: projects with reports first, then empty projects
    const projectsWithReports = [];
    const projectsWithoutReports = [];
    const knownProjectIds = new Set();

    allProjects.forEach(p => {
        const pid = p.id;
        knownProjectIds.add(pid);
        const reports = reportsByProject[pid];
        if (reports && reports.length > 0) {
            projectsWithReports.push({ project: p, reports });
        } else {
            projectsWithoutReports.push({ project: p, reports: [] });
        }
    });

    // Check for reports under unknown projects
    const unknownProjectReports = [];
    for (const pid of Object.keys(reportsByProject)) {
        if (!knownProjectIds.has(pid)) {
            unknownProjectReports.push(...reportsByProject[pid]);
        }
    }
    if (orphanReports.length > 0) unknownProjectReports.push(...orphanReports);

    // If no projects and no reports, show empty state
    if (allProjects.length === 0 && allReports.length === 0) {
        container.innerHTML = `
            <div class="bg-white border-2 border-dashed border-slate-300 p-8 text-center">
                <div class="w-16 h-16 bg-slate-100 border-2 border-slate-200 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-building text-slate-400 text-2xl"></i>
                </div>
                <p class="text-lg font-bold text-slate-600 mb-2">No projects yet</p>
                <p class="text-sm text-slate-400 mb-4">Create one to get started.</p>
                <a href="projects.html" class="inline-flex items-center gap-2 px-6 py-3 bg-dot-navy text-white font-bold uppercase tracking-wide hover:bg-dot-blue transition-colors text-sm">
                    <i class="fas fa-plus"></i> Create Project
                </a>
            </div>
        `;
        return;
    }

    let html = '';

    // Projects WITH active reports (expanded)
    projectsWithReports.forEach(({ project, reports }) => {
        html += renderProjectSection(project, reports, true);
    });

    // Projects WITHOUT active reports (collapsed)
    projectsWithoutReports.forEach(({ project }) => {
        html += renderProjectSection(project, [], false);
    });

    // Unknown project reports
    if (unknownProjectReports.length > 0) {
        html += renderProjectSection(
            { id: '_unknown', projectName: 'Unknown Project', project_name: 'Unknown Project' },
            unknownProjectReports,
            true
        );
    }

    container.innerHTML = html;

    // Initialize swipe-to-delete on the newly rendered cards
    initSwipeToDelete();
}

function renderProjectSection(project, reports, expanded) {
    const name = project.projectName || 'Unnamed Project';
    const projectNo = project.noabProjectNo || '';
    const pid = project.id;
    const hasReports = reports.length > 0;
    const sectionId = `project-section-${pid}`;

    let html = `<div class="mb-4">`;

    // Project header
    html += `
        <div class="flex items-center gap-2 px-1 mb-2 cursor-pointer select-none" onclick="toggleProjectSection('${sectionId}')">
            <i class="fas fa-chevron-${expanded ? 'down' : 'right'} text-xs text-dot-orange transition-transform" id="${sectionId}-chevron"></i>
            <div class="flex items-center gap-2 flex-1 min-w-0">
                <i class="fas fa-hard-hat text-dot-orange text-sm"></i>
                <span class="font-bold text-sm text-slate-800 uppercase tracking-wider truncate">${escapeHtml(name)}</span>
                ${projectNo ? `<span class="text-[10px] text-slate-400 shrink-0">#${escapeHtml(projectNo)}</span>` : ''}
            </div>
            ${!hasReports ? '<span class="text-[10px] text-slate-400 italic shrink-0">No active reports</span>' : `<span class="text-[10px] bg-dot-orange text-white px-1.5 py-0.5 font-bold shrink-0">${reports.length}</span>`}
        </div>`;

    // Report cards (collapsible)
    html += `<div id="${sectionId}" class="${expanded ? '' : 'hidden'}">`;

    if (hasReports) {
        reports.forEach(report => {
            html += renderReportCard(report);
        });
    }

    html += `</div></div>`;
    return html;
}

function toggleProjectSection(sectionId) {
    const section = document.getElementById(sectionId);
    const chevron = document.getElementById(sectionId + '-chevron');
    if (!section) return;

    const isHidden = section.classList.contains('hidden');
    section.classList.toggle('hidden');

    if (chevron) {
        chevron.classList.remove('fa-chevron-right', 'fa-chevron-down');
        chevron.classList.add(isHidden ? 'fa-chevron-down' : 'fa-chevron-right');
    }
}

function getReportHref(report) {
    const status = report.status;
    const reportDate = report.reportDate;

    if (status === REPORT_STATUS.SUBMITTED) {
        return `archives.html?id=${report.id}`;
    } else if (status === REPORT_STATUS.READY_TO_SUBMIT) {
        return `report.html?tab=preview&date=${reportDate}&reportId=${report.id}`;
    } else if (status === REPORT_STATUS.REFINED) {
        return `report.html?date=${reportDate}&reportId=${report.id}`;
    } else {
        return `quick-interview.html?reportId=${report.id}`;
    }
}

function getStatusBadge(status) {
    const badges = {
        'draft':            { text: 'Draft',           bg: 'bg-slate-500',    icon: 'fa-pen' },
        'pending_refine':   { text: 'Processing',      bg: 'bg-dot-blue',     icon: 'fa-spinner' },
        'refined':          { text: 'Refined',         bg: 'bg-dot-orange',   icon: 'fa-robot' },
        'ready_to_submit':  { text: 'Ready to Submit', bg: 'bg-safety-green', icon: 'fa-check-circle' },
        'submitted':        { text: 'Submitted',       bg: 'bg-safety-green', icon: 'fa-archive' }
    };
    const b = badges[status] || badges.draft;
    return `<span class="inline-flex items-center gap-1 text-[10px] ${b.bg} text-white px-2 py-0.5 font-bold uppercase tracking-wider"><i class="fas ${b.icon}"></i>${b.text}</span>`;
}

function formatTimestamp(ts) {
    if (!ts) return '\u2014';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function renderReportCard(report) {
    const href = getReportHref(report);
    const dateStr = formatDate(report.reportDate, 'long');
    const status = report.status || 'draft';
    const isLate = report.reportDate < getTodayDateString() && status !== REPORT_STATUS.SUBMITTED;
    const captureMode = report.capture_mode || report._draft_data?.captureMode || '\u2014';
    const uuid = report.id || '\u2014';
    const truncUuid = uuid.length > 12 ? uuid.substring(0, 8) + '\u2026' : uuid;
    const cardId = `card-meta-${uuid.replace(/[^a-z0-9]/gi, '')}`;

    // Border color based on status/lateness
    const borderColor = isLate ? 'border-red-500' :
        status === 'submitted' ? 'border-safety-green' :
        status === 'refined' ? 'border-dot-orange' :
        status === 'ready_to_submit' ? 'border-safety-green' :
        'border-slate-300';

    const bgColor = isLate ? 'bg-red-50' : 'bg-white';

    return `
        <div class="swipe-card-wrapper" data-report-id="${escapeHtml(uuid)}">
            <div class="swipe-delete-action" onclick="event.stopPropagation(); confirmDeleteReport('${uuid}');">
                <i class="fas fa-trash"></i><br>Delete
            </div>
            <div class="swipe-card-content ${bgColor} border-l-4 ${borderColor} mb-2 shadow-sm">
                <a href="${href}" class="block p-3 hover:bg-slate-50 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <p class="font-semibold text-sm text-slate-800">${isLate ? '<i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>' : ''}${escapeHtml(dateStr)}</p>
                        ${getStatusBadge(status)}
                    </div>
                    <div class="flex items-center gap-4 text-[11px] text-slate-500">
                        <span><i class="fas fa-play text-[9px] mr-1"></i>Started ${formatTimestamp(report.created_at)}</span>
                        <span><i class="fas fa-pencil text-[9px] mr-1"></i>Edited ${formatTimestamp(report.updated_at)}</span>
                    </div>
                </a>
                <div class="border-t border-slate-100">
                    <button onclick="event.preventDefault(); document.getElementById('${cardId}').classList.toggle('hidden'); this.querySelector('i.fa-chevron-down,i.fa-chevron-right').classList.toggle('fa-chevron-down'); this.querySelector('i.fa-chevron-down,i.fa-chevron-right').classList.toggle('fa-chevron-right');" class="w-full px-3 py-1.5 text-left text-[10px] text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1">
                        <i class="fas fa-chevron-right text-[8px]"></i> Details
                    </button>
                    <div id="${cardId}" class="hidden px-3 pb-2 text-[11px] text-slate-500 space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 w-14 shrink-0">UUID</span>
                            <code class="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded truncate">${escapeHtml(uuid)}</code>
                            <button onclick="event.preventDefault(); event.stopPropagation(); navigator.clipboard.writeText('${uuid}'); this.innerHTML='<i class=\\'fas fa-check\\'></i>'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i>', 1500);" class="text-slate-400 hover:text-dot-blue shrink-0" title="Copy UUID"><i class="fas fa-copy"></i></button>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 w-14 shrink-0">Mode</span>
                            <span class="capitalize">${escapeHtml(captureMode)}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 w-14 shrink-0">Project</span>
                            <span class="truncate">${escapeHtml(report.project_name || '\u2014')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateReportStatus() {
    const statusSection = document.getElementById('reportStatusSection');

    // v6.6.17: Always show "Begin Daily Report" button
    // Users can start new reports even if drafts exist
    statusSection.innerHTML = `
        <div class="bg-white border-2 border-slate-200 p-6">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h2 class="text-lg font-bold text-dot-navy">Daily Field Report</h2>
                    <p class="text-sm text-slate-500">Create a new report for today</p>
                </div>
                <div class="w-12 h-12 bg-dot-navy/10 rounded-full flex items-center justify-center">
                    <i class="fas fa-clipboard-list text-dot-navy text-xl"></i>
                </div>
            </div>
            <button onclick="beginDailyReport()" class="block w-full bg-dot-navy hover:bg-dot-blue text-white p-4 transition-colors">
                <div class="flex items-center justify-center gap-3">
                    <i class="fas fa-plus text-dot-yellow"></i>
                    <span class="font-bold uppercase tracking-wide">Begin Daily Report</span>
                </div>
            </button>
        </div>
    `;
}

// ============================================================================
// SWIPE-TO-DELETE
// ============================================================================

/**
 * Inject swipe-to-delete CSS styles (called once on init)
 */
function injectSwipeStyles() {
    if (document.getElementById('swipe-delete-styles')) return;
    const style = document.createElement('style');
    style.id = 'swipe-delete-styles';
    style.textContent = `
        .swipe-card-wrapper {
            position: relative;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }
        .swipe-card-content {
            position: relative;
            z-index: 1;
            transition: transform 0.3s ease;
            will-change: transform;
            margin-bottom: 0 !important;
        }
        .swipe-card-content.swiped {
            transform: translateX(-100px);
        }
        .swipe-card-content.dragging {
            transition: none;
        }
        .swipe-delete-action {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 100px;
            background: #ef4444;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 12px;
            gap: 4px;
            cursor: pointer;
            user-select: none;
            z-index: 0;
        }
        .swipe-delete-action i {
            font-size: 18px;
        }
        .swipe-card-wrapper.removing {
            transition: max-height 0.3s ease, opacity 0.3s ease;
            max-height: 0 !important;
            opacity: 0;
            overflow: hidden;
        }
        /* Delete confirmation modal */
        .delete-confirm-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .delete-confirm-modal {
            background: white;
            max-width: 360px;
            width: 100%;
            padding: 1.5rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Initialize swipe-to-delete on all report cards
 * Call after renderReportCards() to attach event listeners
 */
function initSwipeToDelete() {
    injectSwipeStyles();

    const wrappers = document.querySelectorAll('.swipe-card-wrapper');
    wrappers.forEach(wrapper => {
        const content = wrapper.querySelector('.swipe-card-content');
        if (!content || content._swipeInitialized) return;
        content._swipeInitialized = true;

        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let isDragging = false;
        let isHorizontal = null; // null = undecided, true = horizontal, false = vertical

        function onStart(x, y) {
            // Close any other swiped cards first
            document.querySelectorAll('.swipe-card-content.swiped').forEach(el => {
                if (el !== content) el.classList.remove('swiped');
            });

            startX = x;
            startY = y;
            currentX = 0;
            isDragging = true;
            isHorizontal = null;
            content.classList.add('dragging');
        }

        function onMove(x, y) {
            if (!isDragging) return;

            const dx = x - startX;
            const dy = y - startY;

            // Decide direction on first significant move
            if (isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                isHorizontal = Math.abs(dx) > Math.abs(dy);
                if (!isHorizontal) {
                    // Vertical scroll — abort swipe
                    isDragging = false;
                    content.classList.remove('dragging');
                    return;
                }
            }

            if (!isHorizontal) return;

            // Prevent vertical scroll while swiping horizontally
            // (handled by the touchmove preventDefault below)

            // Only allow swipe left (negative dx), or right to close
            const isSwiped = content.classList.contains('swiped');
            if (isSwiped) {
                // Swiped state: allow dragging right to close (offset from -100)
                currentX = Math.min(100, Math.max(0, dx));
                content.style.transform = `translateX(${-100 + currentX}px)`;
            } else {
                // Normal state: allow dragging left to reveal delete
                currentX = Math.min(0, dx);
                content.style.transform = `translateX(${currentX}px)`;
            }
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            content.classList.remove('dragging');
            content.style.transform = '';

            const isSwiped = content.classList.contains('swiped');

            if (isSwiped) {
                // Was swiped: close if dragged right enough
                if (currentX > 40) {
                    content.classList.remove('swiped');
                } 
                // else stays swiped
            } else {
                // Was normal: open if dragged left enough
                if (currentX < -80) {
                    content.classList.add('swiped');
                }
                // else snaps back
            }
        }

        // Touch events
        content.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            onStart(touch.clientX, touch.clientY);
        }, { passive: true });

        content.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];

            // If we decided it's horizontal, prevent scroll
            if (isHorizontal) {
                e.preventDefault();
            }

            onMove(touch.clientX, touch.clientY);
        }, { passive: false });

        content.addEventListener('touchend', onEnd);
        content.addEventListener('touchcancel', onEnd);

        // Mouse events (desktop)
        content.addEventListener('mousedown', (e) => {
            // Don't interfere with buttons/links
            if (e.target.closest('button, a')) return;
            e.preventDefault();
            onStart(e.clientX, e.clientY);

            const onMouseMove = (e2) => {
                onMove(e2.clientX, e2.clientY);
            };
            const onMouseUp = () => {
                onEnd();
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

/**
 * Show confirmation modal for deleting a report
 * @param {string} reportId - The report UUID to delete
 */
function confirmDeleteReport(reportId) {
    // Remove any existing modal
    const existing = document.getElementById('deleteConfirmOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'deleteConfirmOverlay';
    overlay.className = 'delete-confirm-overlay';
    overlay.innerHTML = `
        <div class="delete-confirm-modal">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                    <i class="fas fa-trash text-red-500"></i>
                </div>
                <div>
                    <h3 class="font-bold text-slate-800">Delete this report?</h3>
                    <p class="text-sm text-slate-500">This cannot be undone.</p>
                </div>
            </div>
            <div class="flex gap-3">
                <button id="deleteConfirmCancel" class="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-bold uppercase text-sm hover:bg-slate-50 transition-colors">
                    Cancel
                </button>
                <button id="deleteConfirmOk" class="flex-1 px-4 py-3 bg-red-500 text-white font-bold uppercase text-sm hover:bg-red-600 transition-colors">
                    <i class="fas fa-trash mr-1"></i> Delete
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Cancel
    document.getElementById('deleteConfirmCancel').onclick = () => {
        overlay.remove();
        // Reset the swiped card
        const wrapper = document.querySelector(`.swipe-card-wrapper[data-report-id="${reportId}"]`);
        if (wrapper) {
            const content = wrapper.querySelector('.swipe-card-content');
            if (content) content.classList.remove('swiped');
        }
    };

    // Close on overlay click (outside modal)
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            const wrapper = document.querySelector(`.swipe-card-wrapper[data-report-id="${reportId}"]`);
            if (wrapper) {
                const content = wrapper.querySelector('.swipe-card-content');
                if (content) content.classList.remove('swiped');
            }
        }
    };

    // Confirm delete
    document.getElementById('deleteConfirmOk').onclick = () => executeDeleteReport(reportId, overlay);
}

/**
 * Execute the full delete cascade for a report
 * @param {string} reportId - The report UUID
 * @param {HTMLElement} overlay - The modal overlay to update/remove
 */
async function executeDeleteReport(reportId, overlay) {
    const btn = document.getElementById('deleteConfirmOk');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Deleting...';

    try {
        // 1. Delete from Supabase (full cascade: photos, child tables, PDF, report)
        if (reportId.length === 36 && typeof deleteReportCascade === 'function' && typeof supabaseClient !== 'undefined') {
            const result = await deleteReportCascade(reportId);
            if (!result.success) {
                console.warn('[SWIPE-DELETE] Supabase cascade had errors:', result.errors);
            }
        }

        // 2. Delete from IndexedDB
        if (window.idb) {
            try { await window.idb.deleteCurrentReportIDB(reportId); } catch(e) { /* ok */ }
            try { await window.idb.deletePhotosByReportId(reportId); } catch(e) { /* ok */ }
            try { await window.idb.deleteDraftDataIDB(reportId); } catch(e) { /* ok */ }
        }

        // 3. Delete from localStorage
        if (typeof deleteCurrentReport === 'function') deleteCurrentReport(reportId);
        if (typeof deleteReportData === 'function') deleteReportData(reportId);

        console.log('[SWIPE-DELETE] Deleted report:', reportId);

        // 4. Close modal
        overlay.remove();

        // 5. Animate card removal, then full re-render to update project sections
        const wrapper = document.querySelector(`.swipe-card-wrapper[data-report-id="${reportId}"]`);
        if (wrapper) {
            // Set explicit max-height for animation
            wrapper.style.maxHeight = wrapper.offsetHeight + 'px';
            // Force reflow
            wrapper.offsetHeight;
            wrapper.classList.add('removing');
            setTimeout(() => {
                wrapper.remove();
                // Always re-render — updates project sections, report counts,
                // and removes empty project headers correctly
                renderReportCards();
                updateReportStatus();
            }, 350);
        } else {
            // Card not found in DOM (edge case) — re-render immediately
            renderReportCards();
            updateReportStatus();
        }
    } catch (e) {
        console.error('[SWIPE-DELETE] Error:', e);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash mr-1"></i> Delete';
        alert('Failed to delete report. Please try again.');
    }
}

// Expose to window for onclick handlers
window.confirmDeleteReport = confirmDeleteReport;

