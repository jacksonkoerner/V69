/**
 * archives.js - Report Archives Viewer
 * Displays submitted reports with project filtering and inline PDF viewing
 * Online-only - pulls directly from Supabase
 */

let allReports = [];
let allProjects = [];

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

async function init() {
    // Verify supabaseClient exists
    if (typeof supabaseClient === 'undefined') {
        console.error('[Archives] supabaseClient not initialized. Check config.js');
        showError('Database connection not available. Please refresh.');
        return;
    }

    // Check online status
    if (!navigator.onLine) {
        showOfflineWarning();
        return;
    }

    setupEventListeners();
    await loadProjects();
    await loadReports();
}

function setupEventListeners() {
    // Project filter
    document.getElementById('projectFilter').addEventListener('change', (e) => {
        loadReports(e.target.value || null);
    });

    // Online/offline listeners
    window.addEventListener('online', () => {
        hideOfflineWarning();
        init();
    });
    window.addEventListener('offline', showOfflineWarning);
}

// ============ Data Loading ============

async function loadProjects() {
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .select('id, project_name')
            .eq('status', 'active')
            .order('project_name');

        if (error) throw error;

        allProjects = data || [];
        populateProjectFilter();
    } catch (err) {
        console.error('[Archives] Failed to load projects:', err);
    }
}

function populateProjectFilter() {
    const select = document.getElementById('projectFilter');
    select.innerHTML = '<option value="">All Projects</option>';

    allProjects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.project_name;
        select.appendChild(option);
    });
}

async function loadReports(projectId = null) {
    showLoading();

    try {
        // Query reports with status = 'submitted'
        let query = supabaseClient
            .from('reports')
            .select(`
                id,
                project_id,
                report_date,
                status,
                submitted_at,
                created_at,
                projects (project_name)
            `)
            .eq('status', 'submitted')
            .order('report_date', { ascending: false });

        if (projectId) {
            query = query.eq('project_id', projectId);
        }

        const { data: reports, error: reportsError } = await query;
        if (reportsError) throw reportsError;

        if (!reports || reports.length === 0) {
            allReports = [];
            showEmpty();
            return;
        }

        // Get PDF URLs from final_reports table
        const reportIds = reports.map(r => r.id);
        const { data: finalReports, error: finalError } = await supabaseClient
            .from('final_reports')
            .select('report_id, pdf_url')
            .in('report_id', reportIds);

        if (finalError) {
            console.warn('[Archives] Could not fetch PDF URLs:', finalError);
        }

        // Create PDF URL lookup map
        const pdfMap = {};
        (finalReports || []).forEach(fr => {
            if (fr.pdf_url) pdfMap[fr.report_id] = fr.pdf_url;
        });

        // Merge data
        allReports = reports.map(r => ({
            id: r.id,
            projectId: r.project_id,
            projectName: r.projects?.project_name || 'Unknown Project',
            reportDate: r.report_date,
            submittedAt: r.submitted_at,
            pdfUrl: pdfMap[r.id] || null
        }));

        renderReports();
    } catch (err) {
        console.error('[Archives] Failed to load reports:', err);
        showError('Failed to load reports. Please check your connection.');
    }
}

// ============ Rendering ============

/**
 * Get reports submitted in the last 24 hours
 */
function getRecentReports() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    return allReports.filter(report => {
        if (!report.submittedAt) return false;
        const submittedTime = new Date(report.submittedAt).getTime();
        return submittedTime > oneDayAgo;
    }).sort((a, b) => {
        // Sort by submittedAt descending (most recent first)
        return new Date(b.submittedAt) - new Date(a.submittedAt);
    }).slice(0, 5);
}

function renderReports() {
    const container = document.getElementById('reportsList');
    const recentSection = document.getElementById('recentSection');
    const recentList = document.getElementById('recentReportsList');

    // Handle empty state
    if (allReports.length === 0) {
        showEmpty();
        recentSection.classList.add('hidden');
        return;
    }

    // Render recent reports (last 24 hours)
    const recentReports = getRecentReports();

    if (recentReports.length > 0) {
        recentSection.classList.remove('hidden');
        recentList.innerHTML = recentReports.map(report => `
            <div class="bg-white rounded-lg shadow-sm border border-green-200 p-3 cursor-pointer hover:shadow-md transition-shadow"
                 onclick="viewPdf('${report.id}')">
                <div class="flex justify-between items-center gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-gray-900 text-sm truncate">${escapeHtml(report.projectName)}</h3>
                        <p class="text-xs text-gray-500">${formatDate(report.reportDate, 'long')}</p>
                    </div>
                    <div class="flex-shrink-0">
                        ${report.pdfUrl
                            ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">View PDF</span>'
                            : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No PDF</span>'
                        }
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        recentSection.classList.add('hidden');
    }

    // Render all reports in main list
    container.innerHTML = allReports.map(report => `
        <div class="report-card bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:shadow-md"
             onclick="viewPdf('${report.id}')">
            <div class="flex justify-between items-start gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-900 truncate">${escapeHtml(report.projectName)}</h3>
                    <p class="text-sm text-gray-600 mt-1">${formatDate(report.reportDate, 'long')}</p>
                    ${report.submittedAt ? `<p class="text-xs text-gray-400 mt-2">Submitted ${formatDateTime(report.submittedAt)}</p>` : ''}
                </div>
                <div class="flex-shrink-0">
                    ${report.pdfUrl
                        ? '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">PDF Ready</span>'
                        : '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No PDF</span>'
                    }
                </div>
            </div>
        </div>
    `).join('');

    showContent();
}

// ============ PDF Viewer ============

function viewPdf(reportId) {
    const report = allReports.find(r => r.id === reportId);
    if (!report) return;

    if (!report.pdfUrl) {
        alert('PDF not available for this report.');
        return;
    }

    // Open PDF directly in a new tab — works in both browser and WebView
    window.open(report.pdfUrl, '_blank');
}

// ============ UI State Management ============

function showLoading() {
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('reportsList').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
}

function showContent() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('reportsList').classList.remove('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('errorState').classList.add('hidden');
}

function showEmpty() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('reportsList').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('errorState').classList.add('hidden');
    document.getElementById('recentSection').classList.add('hidden');
}

function showError(message) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('reportsList').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
    document.getElementById('errorMessage').textContent = message;
}

function showOfflineWarning() {
    document.getElementById('offlineWarning').classList.remove('hidden');
    document.getElementById('loadingState').classList.add('hidden');
}

function hideOfflineWarning() {
    document.getElementById('offlineWarning').classList.add('hidden');
}

function retryLoad() {
    if (navigator.onLine) {
        init();
    } else {
        showOfflineWarning();
    }
}

// ============ Utility Functions ============
// escapeHtml(), formatDate(), formatDateTime() now provided by ui-utils.js (loaded via script tag)
// Archives uses formatDate(dateStr, 'long') for full weekday names (e.g. "Monday, Jan 5, 2026")

// Make viewPdf available globally for onclick handlers
window.viewPdf = viewPdf;
window.retryLoad = retryLoad;
