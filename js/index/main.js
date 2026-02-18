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
        // Start Realtime subscriptions for multi-device sync
        if (typeof initRealtimeSync === 'function') initRealtimeSync();

        if (window.fvpBroadcast && typeof window.fvpBroadcast.listen === 'function') {
            window.fvpBroadcast.listen(function(message) {
                if (!message || !message.type) return;
                if (message.type === 'report-deleted' || message.type === 'report-updated' || message.type === 'reports-recovered') {
                    refreshDashboard('broadcast');
                }
            });
        }

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

// ============ BACK-NAVIGATION / BFCACHE FIX ============
// When returning to the dashboard (bfcache restore, iOS app switch, or back-nav),
// we must reload ALL data before rendering — projectsCache and localStorage may
// be stale because other pages (interview, report editor) modified storage while
// the dashboard was frozen/cached.

var _dashboardRefreshing = false; // debounce flag
var _lastRefreshTime = 0;         // cooldown timestamp (ms)
var _lastRefreshSource = '';      // last refresh source (for cooldown scoping)
var _REFRESH_COOLDOWN = 2000;     // minimum ms between refreshes
var _pendingRefresh = false;      // coalesced rerun requested
var _pendingRefreshSource = '';
var _pendingRefreshBypass = false;
var _pendingRefreshTimer = null;

function _isBypassRefreshSource(source) {
    var s = String(source || '').toLowerCase();
    return s === '__pending_rerun__' || s.indexOf('broadcast') !== -1 || s.indexOf('delete') !== -1;
}

function _queuePendingRefresh(source, bypassCooldown) {
    _pendingRefresh = true;
    if (source) _pendingRefreshSource = source;
    _pendingRefreshBypass = _pendingRefreshBypass || !!bypassCooldown;

    if (_dashboardRefreshing || _pendingRefreshTimer) return;

    var waitMs = Math.max(0, _REFRESH_COOLDOWN - (Date.now() - _lastRefreshTime));
    _pendingRefreshTimer = setTimeout(function() {
        _pendingRefreshTimer = null;
        if (!_pendingRefresh) return;
        var rerunBypass = _pendingRefreshBypass;
        var rerunSource = _pendingRefreshSource || 'pending-rerun';
        _pendingRefresh = false;
        _pendingRefreshBypass = false;
        _pendingRefreshSource = '';
        refreshDashboard(rerunBypass ? '__pending_rerun__' : rerunSource);
    }, waitMs);
}

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
 * Full dashboard data refresh — reloads projects + reports, then re-renders.
 * Safe to call multiple times; concurrent calls are debounced and a 2s cooldown
 * prevents rapid-fire from multiple event sources (DOMContentLoaded + pageshow + visibilitychange).
 *
 * All async data loading has timeouts to prevent indefinite hangs (iOS IDB bug).
 * Rendering always happens, even if data loading fails — uses localStorage fallback.
 *
 * @param {string} source - caller label for logging
 */
async function refreshDashboard(source) {
    var bypassCooldown = _isBypassRefreshSource(source);

    // Skip if already running
    if (_dashboardRefreshing) {
        console.log('[INDEX] refreshDashboard already running, queueing rerun (' + source + ')');
        _queuePendingRefresh(source, bypassCooldown);
        return;
    }

    // Cooldown: skip if we just refreshed < 2s ago (prevents triple-fire from
    // pageshow + visibilitychange + focus which all fire on tab return)
    var now = Date.now();
    if (!bypassCooldown && source !== 'DOMContentLoaded' && (now - _lastRefreshTime) < _REFRESH_COOLDOWN) {
        console.log('[INDEX] refreshDashboard cooldown, queueing rerun (' + source + ', ' + (now - _lastRefreshTime) + 'ms since last)');
        _queuePendingRefresh(source, false);
        return;
    }

    if (_pendingRefreshTimer) {
        clearTimeout(_pendingRefreshTimer);
        _pendingRefreshTimer = null;
    }

    _dashboardRefreshing = true;
    _lastRefreshTime = now;
    _lastRefreshSource = source;
    console.log('[INDEX] refreshDashboard triggered by:', source);

    // Step 0: Render immediately from localStorage (instant, synchronous)
    _renderFromLocalStorage();

    try {
        // ── PHASE 1: Local data (IDB) — no auth/network needed ──────────
        // Run IDB hydration and loadProjects in parallel.
        // These only touch IndexedDB and don't need auth or network.
        // Timeout: 4s total for both (was 3+4=7s serial before).
        var _localDataStart = Date.now();

        var _loadReportsPromise = withTimeout(
            loadReportsFromIDB(),
            6000, [], 'loadReportsFromIDB'
        ).catch(function(e) {
            console.warn('[INDEX] IDB report load failed during refresh:', e);
            return [];
        });

        var _loadProjectsPromise = withTimeout(
            window.dataLayer.loadProjects(),
            6000, [], 'loadProjects'
        ).catch(function(e) {
            console.warn('[INDEX] loadProjects failed:', e);
            return [];
        });

        // Wait for both local operations together
        var _localResults = await Promise.all([_loadReportsPromise, _loadProjectsPromise]);
        var projects = _localResults[1] || [];

        console.log('[INDEX] Local data loaded in ' + (Date.now() - _localDataStart) + 'ms (' + projects.length + ' projects from IDB)');

        // Re-render after hydration (reports may have been updated from IDB)
        renderReportCards(window.currentReportsCache);
        updateReportStatus();

        // ── PHASE 2: Network data — runs in parallel, auth gates cloud ──
        // Cloud project refresh and weather sync run simultaneously.
        // Weather is fire-and-forget (never blocks dashboard).
        var _networkStart = Date.now();

        // Weather: fire-and-forget — don't await, don't block anything
        withTimeout(syncWeather(), 15000, undefined, 'syncWeather').catch(function(e) {
            console.warn('[INDEX] Weather sync failed:', e);
        });

        // Cloud project refresh (needs network + auth)
        if (navigator.onLine) {
            try {
                var cloudProjects = await withTimeout(
                    window.dataLayer.refreshProjectsFromCloud(),
                    12000, null, 'refreshProjectsFromCloud'
                );
                if (cloudProjects && cloudProjects.length > 0) {
                    projects = cloudProjects;
                    console.log('[INDEX] Refreshed', projects.length, 'projects from cloud in ' + (Date.now() - _networkStart) + 'ms');
                }
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
        await pruneCurrentReports();

        // 5. Cloud report sync — reconcile IDB with Supabase truth
        // This ensures cross-device consistency: reports created/deleted
        // on other devices are reflected here.
        var _cloudSyncRan = false;
        if (navigator.onLine && window.dataStore && typeof window.dataStore.syncReportsFromCloud === 'function') {
            try {
                var syncResult = await withTimeout(
                    window.dataStore.syncReportsFromCloud(),
                    10000, null, 'syncReportsFromCloud'
                );
                if (syncResult) {
                    _cloudSyncRan = true;
                    if (syncResult.added > 0 || syncResult.updated > 0 || syncResult.removed > 0) {
                        // Re-read from IDB after sync changed things
                        var syncedMap = await window.dataStore.getAllReports();
                        var syncedReports = [];
                        syncedMap.forEach(function(value) { syncedReports.push(value); });
                        window.currentReportsCache = syncedReports;
                        console.log('[INDEX] Reports reconciled with cloud: +' + syncResult.added +
                            ' ~' + syncResult.updated + ' -' + syncResult.removed +
                            ' (total: ' + syncResult.total + ')');
                    }
                }
            } catch (e) {
                console.warn('[INDEX] Cloud report sync failed:', e);
            }
        }

        // 5b. Clear stale deleted blocklist — now that cloud sync is the authority,
        // the blocklist only needs recent entries (last 24h) to prevent race conditions
        // during active deletion. Old entries just cause phantom removals on other devices.
        try {
            var rawBlocklist = localStorage.getItem(STORAGE_KEYS.DELETED_REPORT_IDS);
            if (rawBlocklist) {
                var parsedBlocklist = JSON.parse(rawBlocklist);
                if (Array.isArray(parsedBlocklist) && parsedBlocklist.length > 20) {
                    // Trim to last 20 entries max
                    localStorage.setItem(STORAGE_KEYS.DELETED_REPORT_IDS, JSON.stringify(parsedBlocklist.slice(-20)));
                }
            }
        } catch (e) { /* ignore */ }

        // 6. Render — ALWAYS reaches here thanks to timeouts above
        console.log('[INDEX] Rendering with', projectsCache.length, 'projects,',
            window.currentReportsCache.length, 'reports');
        renderReportCards(window.currentReportsCache);
        updateReportStatus();

        // 7. Recover any cloud drafts we don't have locally
        // Skip if cloud sync already ran — it handles the same job more thoroughly
        if (!_cloudSyncRan) {
            try { recoverCloudDrafts(); } catch (e) { /* non-critical */ }
        }

    } catch (err) {
        console.error('[INDEX] refreshDashboard error:', err);
        // Best-effort render with whatever data is available
        _renderFromLocalStorage();
    } finally {
        _dashboardRefreshing = false;
        if (_pendingRefresh) {
            var rerunBypass = _pendingRefreshBypass;
            var rerunSource = _pendingRefreshSource || 'pending-rerun';
            _pendingRefresh = false;
            _pendingRefreshBypass = false;
            _pendingRefreshSource = '';
            refreshDashboard(rerunBypass ? '__pending_rerun__' : rerunSource);
        }
    }
}

/**
 * Fast localStorage pre-render.
 * Gives immediate paint while async refresh continues.
 */
function _renderFromLocalStorage() {
    try {
        if (projectsCache.length === 0) {
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

// ---- EVENT LISTENERS: Three layers of coverage for iOS PWA ----
//
// iOS standalone PWA does NOT reliably fire pageshow with event.persisted on
// back-navigation. We use three complementary listeners:
//   1. pageshow — always (not gated on event.persisted), with cooldown + IDB reset
//   2. visibilitychange — covers iOS app switch / tab switch
//   3. focus — belt-and-suspenders for iOS PWA resume
// The cooldown prevents all three from triggering separate refreshes.

// 1. pageshow — fires on every navigation to this page (forward, back, bfcache)
//    NOT gated on event.persisted because iOS PWA often doesn't set it.
//    Resets IDB connection on bfcache restore to prevent stale connection errors.
window.addEventListener('pageshow', function(event) {
    console.log('[INDEX] pageshow fired (persisted=' + event.persisted + ')');

    // Reset IDB on bfcache restore — the old connection is likely dead.
    // We detect bfcache by checking if this pageshow is well after the last
    // DOMContentLoaded refresh (>2s gap means bfcache, not initial load).
    // Also trust event.persisted when it's true (some browsers set it correctly).
    var timeSinceLastRefresh = Date.now() - _lastRefreshTime;
    if (event.persisted || timeSinceLastRefresh > _REFRESH_COOLDOWN) {
        if (window.dataStore && window.dataStore.reset) {
            window.dataStore.reset();
        }
    }

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
