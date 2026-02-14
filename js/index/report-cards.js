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
        <div class="${bgColor} border-l-4 ${borderColor} mb-2 shadow-sm">
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

