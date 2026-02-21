// ============================================================================
// FieldVoice Pro v6 - Dashboard Main (main.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem
// - report-rules.js: getReportsByUrgency
// - data-layer.js: window.dataLayer
// - index/report-cards.js: renderReportCards, updateReportStatus,
//                          updateActiveProjectCard
// - index/weather.js: syncWeather
// ============================================================================

// Shared state — use var so other files can access via window.*
var projectsCache = [];
window.currentReportsCache = window.currentReportsCache || [];
var _autoDismissSubmittedTimer = null;

function getProjects() {
    return projectsCache;
}

function openProjectConfig() {
    window.location.href = 'projects.html';
}

function openSettings() {
    window.location.href = 'settings.html';
}

// ============ REPORT MAP PRUNING ============
async function pruneCurrentReports() {
    if (!window.dataStore || typeof window.dataStore.getAllReports !== 'function') return;
    var reportMap = await window.dataStore.getAllReports();
    var reports = {};
    reportMap.forEach(function(value, key) { reports[key] = value; });

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [id, report] of Object.entries(reports)) {
        // Keep locally-queued sync intents (for example offline deletes)
        if (report && report._pendingSync && report._pendingSync.op) {
            continue;
        }

        // Remove malformed entries (no id or no project_id)
        if (!report.id || !report.project_id) {
            delete reports[id];
            pruned++;
            continue;
        }

        // Remove submitted reports older than 7 days
        if (report.status === 'submitted') {
            const submitTime = report.submitted_at
                ? new Date(report.submitted_at).getTime()
                : (typeof report.updated_at === 'number' ? report.updated_at : new Date(report.updated_at || 0).getTime());

            if (now - submitTime > SEVEN_DAYS) {
                delete reports[id];
                pruned++;
            }
        }
    }

    if (pruned > 0) {
        await window.dataStore.replaceAllReports(reports);
        window.currentReportsCache = Object.values(reports);
        console.log(`[PRUNE] Pruned ${pruned} stale/malformed report(s) from local map`);
    }
}

// ============ PERMISSIONS ============
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isIOSSafari = isIOS && isSafari;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function checkPermissionState() {
    const micGranted = localStorage.getItem(STORAGE_KEYS.MIC_GRANTED) === 'true';
    const locGranted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED) === 'true';
    const onboarded = localStorage.getItem(STORAGE_KEYS.ONBOARDED) === 'true';
    const bannerDismissed = localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED) === 'true';
    const bannerDismissedDate = localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED_DATE);

    if (bannerDismissedDate) {
        const dismissedTime = new Date(bannerDismissedDate).getTime();
        const now = new Date().getTime();
        const hoursSinceDismissal = (now - dismissedTime) / (1000 * 60 * 60);
        if (hoursSinceDismissal > 24) {
            localStorage.removeItem(STORAGE_KEYS.BANNER_DISMISSED);
            localStorage.removeItem(STORAGE_KEYS.BANNER_DISMISSED_DATE);
        }
    }

    return {
        micGranted,
        locGranted,
        onboarded,
        bannerDismissed: localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED) === 'true',
        allGranted: micGranted && locGranted
    };
}

function shouldShowOnboarding() {
    const state = checkPermissionState();
    if (isMobile && !state.onboarded && !state.allGranted) {
        return true;
    }
    return false;
}

function shouldShowBanner() {
    const state = checkPermissionState();
    if (isMobile && state.onboarded && !state.allGranted && !state.bannerDismissed) {
        return true;
    }
    return false;
}

function showPermissionsBanner() {
    const banner = document.getElementById('permissionsBanner');
    banner.classList.remove('hidden');
}

function dismissPermissionsBanner() {
    const banner = document.getElementById('permissionsBanner');
    banner.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.BANNER_DISMISSED, 'true');
    localStorage.setItem(STORAGE_KEYS.BANNER_DISMISSED_DATE, new Date().toISOString());
}

async function dismissSubmittedBanner() {
    const banner = document.getElementById('submittedBanner');
    banner.classList.add('hidden');
    sessionStorage.setItem(STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED, 'true');

    // Refresh UI
    renderReportCards(window.currentReportsCache);
    updateReportStatus();
}

async function autoDismissSubmittedReportsFromToday() {
    const todaySubmitted = getReportsByUrgency(window.currentReportsCache).todaySubmitted
        .filter(function(report) { return report && !report.dashboard_dismissed_at; });

    if (todaySubmitted.length === 0) return 0;

    const dismissedAt = new Date().toISOString();
    let dismissedCount = 0;

    for (const report of todaySubmitted) {
        if (!report || !report.id) continue;

        if (typeof window.dismissReport === 'function') {
            const result = await window.dismissReport(report.id, {
                dismissedAt: dismissedAt,
                suppressRender: true,
                suppressToast: true
            });
            if (result && result.success) dismissedCount++;
        }
    }

    if (dismissedCount > 0) {
        const banner = document.getElementById('submittedBanner');
        if (banner) banner.classList.add('hidden');
        sessionStorage.setItem(STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED, 'true');

        renderReportCards(window.currentReportsCache);
        updateReportStatus();

        if (typeof showToast === 'function') {
            showToast('Report filed. Find it in Archives.', 'success', 2200);
        }
    }

    return dismissedCount;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[INDEX] DOMContentLoaded fired at', new Date().toISOString());
    let shouldAutoDismissSubmitted = false;

    // Initialize PWA features (moved from inline script in index.html)
    if (typeof initPWA === 'function') {
        initPWA({ onOnline: typeof updateDraftsSection === 'function' ? updateDraftsSection : function() {} });
    }

    if (window.dataStore && typeof window.dataStore.init === 'function') {
        try { await window.dataStore.init(); } catch (e) { console.warn('[INDEX] dataStore init failed:', e); }
    }

    // Check for submit success redirect param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('submitted') === 'true') {
        shouldAutoDismissSubmitted = true;

        // Remove the URL param so it doesn't persist on refresh
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        // Show success banner
        const banner = document.getElementById('submittedBanner');
        if (banner) {
            banner.innerHTML = `
                <div class="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
                    <i class="fas fa-check-circle"></i>
                    <p class="flex-1 text-sm font-medium">Report submitted successfully! <a href="archives.html" class="underline font-bold">View in Archives</a></p>
                    <button onclick="dismissSubmittedBanner()" class="text-white/80 hover:text-white">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            banner.classList.remove('hidden');
        }
    }

    if (shouldShowOnboarding()) {
        window.location.href = 'permissions.html';
        return;
    }

    if (shouldShowBanner()) {
        showPermissionsBanner();
    }

    // Clean up old AI response caches (older than 24 hours)
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fvp_ai_response_')) {
            try {
                const cached = JSON.parse(localStorage.getItem(key));
                const cachedAt = new Date(cached.cachedAt);
                const hoursSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSince > 24) {
                    localStorage.removeItem(key);
                    console.log(`[CLEANUP] Removed stale AI cache: ${key}`);
                }
            } catch (e) {
                // Invalid JSON, remove it
                localStorage.removeItem(key);
            }
        }
    }

    // Set current date immediately
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // IMMEDIATE RENDER from localStorage (no async, no IDB, no network)
    // This ensures the dashboard is never blank, even for a moment
    _renderFromLocalStorage();
    console.log('[INDEX] Immediate localStorage render complete');

    // ============ ONE-TIME MIGRATION: Clear stale IndexedDB projects (v1.13.0) ============
    // This fixes mobile PWA showing duplicate/stale projects from before user_id filtering
    const MIGRATION_KEY = STORAGE_KEYS.MIGRATION_V113_IDB_CLEAR;
    if (!localStorage.getItem(MIGRATION_KEY)) {
        console.log('[MIGRATION v1.13.0] Clearing stale IndexedDB projects...');
        try {
            if (window.dataStore && window.dataStore.clearStore) {
                await window.dataStore.clearStore('projects');
            }
            localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
            console.log('[MIGRATION v1.13.0] IndexedDB projects cleared successfully');
        } catch (migrationErr) {
            console.warn('[MIGRATION v1.13.0] Failed to clear IndexedDB:', migrationErr);
            // Still set the flag to avoid retrying on every load
            localStorage.setItem(MIGRATION_KEY, 'failed-' + new Date().toISOString());
        }
    }

    // Wait for auth to be ready before loading data.
    // auth.js registers its own DOMContentLoaded handler that calls requireAuth().
    // That handler fires before this one (auth.js is in <head>, main.js is at end of <body>).
    // But requireAuth() is async — we use auth.ready promise to coordinate.
    // Timeout after 5s to prevent indefinite hang if auth is stuck.
    try {
        var _authSession = await withTimeout(
            window.auth.ready,
            8000, null, 'auth.ready'
        );
        if (!_authSession) {
            console.warn('[INDEX] No auth session — auth.js will redirect or session timed out');
            // Don't return! Render what we can from localStorage even without auth.
            // If auth.js redirects to login, this code is harmless.
        } else {
            console.log('[INDEX] Auth session confirmed, proceeding with dashboard init');
        }
    } catch (_authErr) {
        console.warn('[INDEX] Auth check failed:', _authErr);
        // Continue anyway — refreshDashboard will do best-effort with localStorage
    }

    // Use the shared refreshDashboard() for all data loading + rendering
    await refreshDashboard('DOMContentLoaded');

    try {
        // Show submitted banner if there are submitted reports today and not dismissed this session
        const bannerDismissedThisSession = sessionStorage.getItem(STORAGE_KEYS.SUBMITTED_BANNER_DISMISSED) === 'true';
        const todaySubmitted = getReportsByUrgency(window.currentReportsCache).todaySubmitted
            .filter(function(report) { return report && !report.dashboard_dismissed_at; });
        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
            document.getElementById('submittedBanner').classList.remove('hidden');
        }

        // Auto-dismiss submitted reports 3 seconds after arriving from submit flow
        if (shouldAutoDismissSubmitted) {
            if (_autoDismissSubmittedTimer) clearTimeout(_autoDismissSubmittedTimer);
            _autoDismissSubmittedTimer = setTimeout(function() {
                autoDismissSubmittedReportsFromToday().catch(function(err) {
                    console.warn('[INDEX] Auto-dismiss submitted reports failed:', err);
                });
            }, 3000);
        }
    } catch (err) {
        console.error('Failed to initialize post-refresh tasks:', err);
    }

});

var _dashboardRefreshing = false;

/**
 * Race a promise against a timeout. Returns the promise result if it resolves
 * in time, or a fallback value on timeout.
 * @param {Promise} promise
 * @param {number} ms - timeout in milliseconds
 * @param {*} fallback - value to return on timeout
 * @param {string} label - for logging
 * @returns {Promise<*>}
 */
function withTimeout(promise, ms, fallback, label) {
    var timerId;
    return Promise.race([
        promise.then(
            function(v) { clearTimeout(timerId); return v; },
            function(e) { clearTimeout(timerId); throw e; }
        ),
        new Promise(function(resolve) {
            timerId = setTimeout(function() {
                console.warn('[INDEX] ' + label + ' timed out after ' + ms + 'ms, using fallback');
                resolve(fallback);
            }, ms);
        })
    ]);
}

async function loadReportsFromIDB() {
    if (!window.dataStore || typeof window.dataStore.getAllReports !== 'function') {
        window.currentReportsCache = [];
        return window.currentReportsCache;
    }
    try {
        var map = await window.dataStore.getAllReports();
        var reports = [];
        map.forEach(function(value) { reports.push(value); });
        window.currentReportsCache = reports;
        return reports;
    } catch (e) {
        console.warn('[INDEX] Failed to load reports from IDB:', e);
        window.currentReportsCache = [];
        return window.currentReportsCache;
    }
}

/**
 * Full dashboard data refresh.
 * @param {string} source - caller label for logging
 */
async function refreshDashboard(source) {
    if (_dashboardRefreshing) {
        console.log('[INDEX] refreshDashboard already running, skipping duplicate:', source);
        return;
    }

    _dashboardRefreshing = true;
    console.log('[INDEX] refreshDashboard triggered by:', source);

    try {
        // Step 0: Immediate render from IDB (instant paint, works offline)
        await loadReportsFromIDB();
        renderReportCards(window.currentReportsCache);
        updateReportStatus();

        // Step 1: If online, pull fresh from Supabase
        if (navigator.onLine && typeof pullFromSupabase === 'function') {
            try {
                await pullFromSupabase();
                renderReportCards(window.currentReportsCache);
                updateReportStatus();
            } catch (e) {
                console.warn('[INDEX] Pull from Supabase failed:', e);
            }
        }

        // Step 2: Load/refresh projects
        try {
            var projects = await window.dataLayer.loadProjects();
            if (navigator.onLine) {
                var cloudProjects = await withTimeout(
                    window.dataLayer.refreshProjectsFromCloud(),
                    12000, null, 'refreshProjectsFromCloud'
                );
                if (cloudProjects && cloudProjects.length > 0) projects = cloudProjects;
            }
            projectsCache = projects;
            if (projectsCache.length === 0) {
                var lsProjects = getStorageItem(STORAGE_KEYS.PROJECTS);
                if (lsProjects && typeof lsProjects === 'object') {
                    projectsCache = Object.values(lsProjects);
                }
            }
        } catch (e) {
            console.warn('[INDEX] Project load failed:', e);
        }

        // Step 3: Prune stale reports
        await pruneCurrentReports();

        // Step 4: Final render
        renderReportCards(window.currentReportsCache);
        updateReportStatus();

        // Step 5: Weather (fire-and-forget)
        if (typeof syncWeather === 'function') {
            syncWeather().catch(function(e) {
                console.warn('[INDEX] Weather failed:', e);
            });
        }
    } catch (err) {
        console.error('[INDEX] refreshDashboard error:', err);
        _renderFromLocalStorage();
    } finally {
        _dashboardRefreshing = false;
    }
}

/**
 * Fast localStorage pre-render.
 * Gives immediate paint while async refresh continues.
 */
function _renderFromLocalStorage() {
    try {
        if (!Array.isArray(projectsCache) || projectsCache.length === 0) {
            var fallbackProjects = getStorageItem(STORAGE_KEYS.PROJECTS);
            if (fallbackProjects && typeof fallbackProjects === 'object') {
                projectsCache = Object.values(fallbackProjects);
            }
        }
        renderReportCards(window.currentReportsCache);
        updateReportStatus();
        console.log('[INDEX] Fast localStorage pre-render complete');
    } catch (e) {
        console.error('[INDEX] Fast localStorage pre-render failed:', e);
    }
}

window.manualRefresh = async function() {
    if (!navigator.onLine) {
        if (typeof showToast === 'function') showToast("You're offline - showing cached data", 'info');
        return;
    }
    await refreshDashboard('manual-refresh');
};

window.addEventListener('online', function() {
    console.log('[INDEX] Back online — pushing local changes');
    if (typeof pushLocalChanges === 'function') {
        pushLocalChanges().catch(function(e) {
            console.warn('[INDEX] Push local changes failed:', e);
        });
    }
});
