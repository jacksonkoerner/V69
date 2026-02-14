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

    try {
        // Load local projects first
        let projects = await window.dataLayer.loadProjects();

        // Always refresh from Supabase when online to get all projects
        if (navigator.onLine) {
            try {
                console.log('[INDEX] Refreshing projects from cloud...');
                projects = await window.dataLayer.refreshProjectsFromCloud();
            } catch (e) {
                console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
                // Keep using local projects on error
            }
        }

        // Cache projects for this page
        projectsCache = projects;

        // Prune stale reports before rendering
        pruneCurrentReports();

        // Update UI - reports come from localStorage now
        renderReportCards();
        updateReportStatus();

        // Fire-and-forget: recover drafts missing from localStorage
        recoverCloudDrafts();

        // Show submitted banner if there are submitted reports today and not dismissed this session
        const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
        const { todaySubmitted } = getReportsByUrgency();
        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
            document.getElementById('submittedBanner').classList.remove('hidden');
        }

        // Sync weather
        syncWeather();
    } catch (err) {
        console.error('Failed to initialize:', err);
        // Still update UI with whatever we have
        renderReportCards();
        updateReportStatus();
        recoverCloudDrafts();
        syncWeather();
    }
});
