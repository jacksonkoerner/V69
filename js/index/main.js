// ============================================================================
// FieldVoice Pro v6 - Dashboard Main (main.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem
// - report-rules.js: getReportsByUrgency
// - data-layer.js: window.dataLayer
// - index/report-cards.js: renderReportCards, updateReportStatus,
//                          updateActiveProjectCard
// - index/cloud-recovery.js: recoverCloudDrafts
// - index/weather.js: syncWeather
// ============================================================================

// Shared state — use var so other files can access via window.*
var projectsCache = [];

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
function pruneCurrentReports() {
    const reports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS);
    if (!reports || typeof reports !== 'object') return;

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [id, report] of Object.entries(reports)) {
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
        setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, reports);
        console.log(`[PRUNE] Pruned ${pruned} stale/malformed report(s) from local map`);
        // Sync pruned state to IndexedDB
        syncCurrentReportsToIDB();
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
    sessionStorage.setItem('fvp_submitted_banner_dismissed', 'true');

    // Refresh UI
    renderReportCards();
    updateReportStatus();
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[INDEX] DOMContentLoaded fired at', new Date().toISOString());

    // Initialize PWA features (moved from inline script in index.html)
    if (typeof initPWA === 'function') {
        initPWA({ onOnline: typeof updateDraftsSection === 'function' ? updateDraftsSection : function() {} });
    }

    // Check for submit success redirect param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('submitted') === 'true') {
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

    // ============ ONE-TIME MIGRATION: Clear stale IndexedDB projects (v1.13.0) ============
    // This fixes mobile PWA showing duplicate/stale projects from before user_id filtering
    const MIGRATION_KEY = 'fvp_migration_v113_idb_clear';
    if (!localStorage.getItem(MIGRATION_KEY)) {
        console.log('[MIGRATION v1.13.0] Clearing stale IndexedDB projects...');
        try {
            await window.idb.clearStore('projects');
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
    // But requireAuth() is async — we need to ensure auth session is active before
    // making Supabase queries that depend on the auth token.
    try {
        var _authResult = await supabaseClient.auth.getSession();
        if (!_authResult.data.session) {
            console.warn('[INDEX] No auth session during DOMContentLoaded — auth.js will redirect');
            return; // Don't try to load data without auth
        }
        console.log('[INDEX] Auth session confirmed, proceeding with dashboard init');
    } catch (_authErr) {
        console.warn('[INDEX] Auth check failed:', _authErr);
        // Continue anyway — refreshDashboard will do best-effort with IDB
    }

    // Use the shared refreshDashboard() for all data loading + rendering
    await refreshDashboard('DOMContentLoaded');

    try {
        // Start Realtime subscriptions for multi-device sync
        if (typeof initRealtimeSync === 'function') initRealtimeSync();

        // Show submitted banner if there are submitted reports today and not dismissed this session
        const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
        const { todaySubmitted } = getReportsByUrgency();
        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
            document.getElementById('submittedBanner').classList.remove('hidden');
        }
    } catch (err) {
        console.error('Failed to initialize post-refresh tasks:', err);
    }

    // ============ SAFETY NET: Verify render completed ============
    // If after 4 seconds the report cards section is still empty but we have
    // projects in localStorage, something went wrong — force a re-render.
    setTimeout(function() {
        var container = document.getElementById('reportCardsSection');
        var statusSection = document.getElementById('reportStatusSection');
        var hasRenderedCards = container && container.innerHTML.trim().length > 0;
        var hasRenderedStatus = statusSection && statusSection.innerHTML.trim().length > 0;

        if (!hasRenderedCards && !hasRenderedStatus) {
            console.warn('[INDEX] SAFETY NET: Dashboard appears blank after 4s, forcing re-render');
            // Try rendering from whatever data we have
            try {
                // Re-populate projectsCache from localStorage if empty
                if (projectsCache.length === 0) {
                    var projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
                    projectsCache = Object.values(projectsMap);
                    console.log('[INDEX] SAFETY NET: Recovered', projectsCache.length, 'projects from localStorage');
                }
                renderReportCards();
                updateReportStatus();
                console.log('[INDEX] SAFETY NET: Re-render complete');
            } catch (e) {
                console.error('[INDEX] SAFETY NET: Re-render failed:', e);
            }

            // Also trigger a full refresh
            _lastRefreshTime = 0; // Reset cooldown
            refreshDashboard('safety-net');
        }
    }, 4000);
});

// ============ BACK-NAVIGATION / BFCACHE FIX ============
// When returning to the dashboard (bfcache restore, iOS app switch, or back-nav),
// we must reload ALL data before rendering — projectsCache and localStorage may
// be stale because other pages (interview, report editor) modified storage while
// the dashboard was frozen/cached.

var _dashboardRefreshing = false; // debounce flag
var _lastRefreshTime = 0;         // cooldown timestamp (ms)
var _REFRESH_COOLDOWN = 2000;     // minimum ms between refreshes

/**
 * Full dashboard data refresh — reloads projects + reports, then re-renders.
 * Safe to call multiple times; concurrent calls are debounced and a 2s cooldown
 * prevents rapid-fire from multiple event sources (DOMContentLoaded + pageshow + visibilitychange).
 * @param {string} source - caller label for logging
 */
async function refreshDashboard(source) {
    // Skip if already running
    if (_dashboardRefreshing) {
        console.log('[INDEX] refreshDashboard already running, skipping (' + source + ')');
        return;
    }

    // Cooldown: skip if we just refreshed < 2s ago (prevents double-fire from
    // DOMContentLoaded + immediate pageshow or visibilitychange)
    var now = Date.now();
    if (source !== 'DOMContentLoaded' && (now - _lastRefreshTime) < _REFRESH_COOLDOWN) {
        console.log('[INDEX] refreshDashboard cooldown, skipping (' + source + ', ' + (now - _lastRefreshTime) + 'ms since last)');
        return;
    }

    _dashboardRefreshing = true;
    _lastRefreshTime = now;
    console.log('[INDEX] refreshDashboard triggered by:', source);

    try {
        // 1. Hydrate current reports from IndexedDB → localStorage
        //    (picks up reports created on other pages that wrote to IDB)
        try {
            await hydrateCurrentReportsFromIDB();
            console.log('[INDEX] IDB hydration complete');
        } catch (e) {
            console.warn('[INDEX] IDB hydration failed during refresh:', e);
        }

        // 2. Reload projects (IndexedDB first, then cloud if online)
        let projects = [];
        try {
            projects = await window.dataLayer.loadProjects();
            console.log('[INDEX] Loaded', projects.length, 'projects from IDB');
        } catch (e) {
            console.warn('[INDEX] loadProjects failed:', e);
        }

        if (navigator.onLine) {
            try {
                projects = await window.dataLayer.refreshProjectsFromCloud();
                console.log('[INDEX] Refreshed', projects.length, 'projects from cloud');
            } catch (e) {
                console.warn('[INDEX] Cloud project refresh failed:', e);
            }
        }

        // 3. Update the in-memory cache
        projectsCache = projects;

        // 3b. If projectsCache is still empty but localStorage has projects,
        //     fall back to localStorage (defensive for IDB/cloud failures)
        if (projectsCache.length === 0) {
            var lsProjects = getStorageItem(STORAGE_KEYS.PROJECTS);
            if (lsProjects && typeof lsProjects === 'object') {
                projectsCache = Object.values(lsProjects);
                console.log('[INDEX] Fell back to localStorage projects:', projectsCache.length);
            }
        }

        // 4. Prune stale reports
        pruneCurrentReports();

        // 5. Render
        console.log('[INDEX] Rendering with', projectsCache.length, 'projects,',
            Object.keys(getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {}).length, 'reports');
        renderReportCards();
        updateReportStatus();

        // 6. Recover any cloud drafts we don't have locally
        recoverCloudDrafts();

        // 7. Sync weather
        syncWeather();
    } catch (err) {
        console.error('[INDEX] refreshDashboard error:', err);
        // Best-effort render with whatever data is available
        try {
            // Recover projectsCache from localStorage
            if (projectsCache.length === 0) {
                var fallbackProjects = getStorageItem(STORAGE_KEYS.PROJECTS);
                if (fallbackProjects && typeof fallbackProjects === 'object') {
                    projectsCache = Object.values(fallbackProjects);
                }
            }
            renderReportCards();
            updateReportStatus();
        } catch (e) {
            console.error('[INDEX] Best-effort render also failed:', e);
        }
    } finally {
        _dashboardRefreshing = false;
    }
}

// ---- EVENT LISTENERS: Three layers of coverage for iOS PWA ----
//
// iOS standalone PWA does NOT reliably fire pageshow with event.persisted on
// back-navigation. We use three complementary listeners:
//   1. pageshow — always (not gated on event.persisted), with cooldown
//   2. visibilitychange — covers iOS app switch / tab switch
//   3. focus — belt-and-suspenders for iOS PWA resume
// The cooldown prevents all three from triggering separate refreshes.

// 1. pageshow — fires on every navigation to this page (forward, back, bfcache)
//    NOT gated on event.persisted because iOS PWA often doesn't set it.
window.addEventListener('pageshow', function(event) {
    console.log('[INDEX] pageshow fired (persisted=' + event.persisted + ')');
    refreshDashboard('pageshow');
});

// 2. visibilitychange — covers iOS app switch, tab switch, and PWA resume
//    from background where pageshow may not fire.
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        console.log('[INDEX] visibilitychange → visible');
        refreshDashboard('visibilitychange');
    }
});

// 3. focus — final fallback for iOS standalone PWA which sometimes only fires
//    a focus event on return without pageshow or visibilitychange.
window.addEventListener('focus', function() {
    console.log('[INDEX] window focus');
    refreshDashboard('focus');
});
