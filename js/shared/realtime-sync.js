/**
 * realtime-sync.js — Supabase Realtime subscriptions for multi-device sync
 * Sprint 13: Enables phone + laptop to update in real-time
 *
 * Subscribes to postgres_changes on: reports, report_data, projects
 * Updates local caches (localStorage, IndexedDB) when changes arrive.
 * Cleans up subscriptions on page unload.
 *
 * Loaded on: index.html, report.html, quick-interview.html, archives.html
 */

var _realtimeChannels = [];

/**
 * Initialize Realtime subscriptions for the current user.
 * Safe to call multiple times — removes existing channels first.
 */
function initRealtimeSync() {
    // Guard: need Supabase client and network
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) return;

    var userId = typeof getStorageItem === 'function'
        ? getStorageItem(STORAGE_KEYS.USER_ID)
        : localStorage.getItem('fvp_user_id');
    if (!userId) return;

    // Tear down any existing subscriptions (idempotent)
    cleanupRealtimeSync();

    console.log('[REALTIME] Initializing subscriptions for user:', userId);

    // --- Reports channel ---
    var reportsChannel = supabaseClient
        .channel('reports-sync')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'reports',
            filter: 'user_id=eq.' + userId
        }, function(payload) {
            console.log('[REALTIME] Reports change:', payload.eventType);
            _handleReportChange(payload);
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'report_data'
        }, function(payload) {
            console.log('[REALTIME] Report data change:', payload.eventType);
            _handleReportDataChange(payload);
        })
        .subscribe(function(status) {
            console.log('[REALTIME] reports-sync status:', status);
        });
    _realtimeChannels.push(reportsChannel);

    // --- Projects channel (scoped to org) ---
    var orgId = typeof getStorageItem === 'function'
        ? getStorageItem(STORAGE_KEYS.ORG_ID)
        : localStorage.getItem('fvp_org_id');
    if (orgId) {
        var projectsChannel = supabaseClient
            .channel('projects-sync')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'projects',
                filter: 'org_id=eq.' + orgId
            }, function(payload) {
                console.log('[REALTIME] Projects change:', payload.eventType);
                _handleProjectChange(payload);
            })
            .subscribe(function(status) {
                console.log('[REALTIME] projects-sync status:', status);
            });
        _realtimeChannels.push(projectsChannel);
    }
}

/**
 * Remove all Realtime subscriptions. Called on page unload and before re-init.
 */
function cleanupRealtimeSync() {
    _realtimeChannels.forEach(function(ch) {
        try {
            supabaseClient.removeChannel(ch);
        } catch (e) {
            console.warn('[REALTIME] Error removing channel:', e);
        }
    });
    _realtimeChannels = [];
}

// --- Change handlers ---

function _handleReportChange(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        var report = payload.new;
        var reports = (typeof getStorageItem === 'function')
            ? getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {}
            : {};
        reports[report.id] = {
            ...(reports[report.id] || {}),
            id: report.id,
            project_id: report.project_id,
            status: report.status,
            reportDate: report.report_date,
            updated_at: Date.now()
        };
        if (typeof setStorageItem === 'function') {
            setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, reports);
        }
        if (typeof syncCurrentReportsToIDB === 'function') {
            syncCurrentReportsToIDB();
        }
    }
    if (payload.eventType === 'DELETE') {
        if (typeof deleteCurrentReport === 'function') {
            deleteCurrentReport(payload.old.id);
        }
    }
    // Refresh Dashboard UI if available
    if (typeof window.renderReportCards === 'function') {
        window.renderReportCards();
    }
}

function _handleReportDataChange(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        var data = payload.new;
        var reportData = {
            aiGenerated: data.ai_generated,
            originalInput: data.original_input,
            userEdits: data.user_edits || {},
            captureMode: data.capture_mode,
            status: data.status,
            lastSaved: data.updated_at
        };
        if (typeof saveReportData === 'function') {
            saveReportData(data.report_id, reportData);
        }
    }
}

function _handleProjectChange(payload) {
    // Refresh projects from Supabase via data layer
    if (window.dataLayer && typeof window.dataLayer.refreshProjectsFromCloud === 'function') {
        window.dataLayer.refreshProjectsFromCloud();
    }
}

// --- Lifecycle ---

// Clean up on page unload to prevent leaked connections
window.addEventListener('beforeunload', cleanupRealtimeSync);

// Re-init when coming back online
window.addEventListener('online', function() {
    console.log('[REALTIME] Back online — re-subscribing');
    initRealtimeSync();
});

// Tear down when going offline (channels will error anyway)
window.addEventListener('offline', function() {
    console.log('[REALTIME] Went offline — cleaning up');
    cleanupRealtimeSync();
});

// Expose for use in page init scripts
window.initRealtimeSync = initRealtimeSync;
window.cleanupRealtimeSync = cleanupRealtimeSync;
