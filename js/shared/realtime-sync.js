/**
 * realtime-sync.js — Supabase Realtime subscriptions for multi-device sync
 * Sprint 13: Enables phone + laptop to update in real-time
 *
 * Subscribes to postgres_changes on: reports, projects
 * Updates local caches (localStorage, IndexedDB) when changes arrive.
 * Cleans up subscriptions on page unload.
 *
 * Loaded on: index.html, report.html, quick-interview.html, archives.html
 */

var _realtimeChannels = [];
var _refineRedirectInProgress = false;

/**
 * Initialize Realtime subscriptions for the current user.
 * Safe to call multiple times — removes existing channels first.
 */
function initRealtimeSync() {
    // Dashboard uses manual pull-to-sync flow — skip realtime subscriptions.
    var path = (window.location && window.location.pathname ? window.location.pathname : '').toLowerCase();
    var file = path.split('/').pop();
    var isDashboardPath = path === '/' || file === '' || file === 'index.html';
    if (isDashboardPath && path.indexOf('quick-interview') === -1 && path.indexOf('report.html') === -1) {
        return;
    }

    // Guard: need Supabase client and network
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) return;

    var userId = typeof getStorageItem === 'function'
        ? getStorageItem(STORAGE_KEYS.USER_ID)
        : localStorage.getItem(STORAGE_KEYS.USER_ID);
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
        .subscribe(function(status) {
            console.log('[REALTIME] reports-sync status:', status);
        });
    _realtimeChannels.push(reportsChannel);

    // --- Projects channel (scoped to org) ---
    var orgId = typeof getStorageItem === 'function'
        ? getStorageItem(STORAGE_KEYS.ORG_ID)
        : localStorage.getItem(STORAGE_KEYS.ORG_ID);
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

/**
 * When a report transitions to 'refined' on another device, fetch the latest
 * report_data from Supabase, cache it locally, then navigate to the refined view.
 */
function _refreshCurrentReportAfterRefined(reportId, isInterviewPage) {
    function switchToRefinedView() {
        if (isInterviewPage) {
            window.location.href = 'report.html?reportId=' + encodeURIComponent(reportId);
        } else {
            window.location.reload();
        }
    }

    if (!navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
        switchToRefinedView();
        return;
    }

    supabaseClient
        .from('report_data')
        .select('*')
        .eq('report_id', reportId)
        .maybeSingle()
        .then(function(result) {
            if (result.error || !result.data) return;
            var cloud = result.data;
            if (window.dataStore && typeof window.dataStore.getReportData === 'function' && typeof window.dataStore.saveReportData === 'function') {
                return window.dataStore.getReportData(reportId).catch(function() { return null; }).then(function(existing) {
                    var merged = existing || {};
                    merged.aiGenerated = cloud.ai_generated || merged.aiGenerated || null;
                    merged.originalInput = cloud.original_input || merged.originalInput || null;
                    merged.userEdits = cloud.user_edits || {};
                    merged.captureMode = cloud.capture_mode || merged.captureMode || null;
                    merged.status = cloud.status || 'refined';
                    merged.createdAt = cloud.created_at || merged.createdAt || new Date().toISOString();
                    merged.lastSaved = cloud.updated_at || new Date().toISOString();
                    return window.dataStore.saveReportData(reportId, merged);
                });
            }
        })
        .catch(function(err) {
            console.warn('[REALTIME] Failed to fetch refined report_data before reload:', err);
        })
        .finally(function() {
            setTimeout(switchToRefinedView, 150);
        });
}

function _handleReportChange(payload) {
    var reportDismissedNow = false;

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        var report = payload.new;
        var cachedReport = null;
        if (Array.isArray(window.currentReportsCache) && report && report.id) {
            cachedReport = window.currentReportsCache.find(function(r) {
                return r && r.id === report.id;
            }) || null;
        }
        reportDismissedNow = payload.eventType === 'UPDATE' &&
            report &&
            report.dashboard_dismissed_at &&
            !(cachedReport && cachedReport.dashboard_dismissed_at);

        // Skip reports on the deleted blocklist (prevents resurrection during cascade)
        if (typeof isDeletedReport === 'function' && isDeletedReport(report.id)) {
            console.log('[REALTIME] Ignoring ' + payload.eventType + ' for report on deleted blocklist:', report.id);
            return;
        }

        // Soft-delete: if cloud status is 'deleted', remove locally instead of saving
        if (report.status === 'deleted') {
            console.log('[REALTIME] Report marked deleted in cloud, removing locally:', report.id);
            if (typeof addToDeletedBlocklist === 'function') addToDeletedBlocklist(report.id);
            if (window.dataStore) {
                Promise.allSettled([
                    window.dataStore.deleteReport ? window.dataStore.deleteReport(report.id) : Promise.resolve(),
                    window.dataStore.deleteReportData ? window.dataStore.deleteReportData(report.id) : Promise.resolve(),
                    window.dataStore.deleteDraftData ? window.dataStore.deleteDraftData(report.id) : Promise.resolve(),
                    window.dataStore.deletePhotosByReportId ? window.dataStore.deletePhotosByReportId(report.id) : Promise.resolve()
                ]).catch(function(e) { console.warn('[REALTIME] Soft-delete cleanup failed:', e); });
            }
            if (window.fvpBroadcast && window.fvpBroadcast.send) {
                window.fvpBroadcast.send({ type: 'report-deleted', id: report.id });
            }
            if (Array.isArray(window.currentReportsCache)) {
                window.currentReportsCache = window.currentReportsCache.filter(function(r) {
                    return r && r.id !== report.id;
                });
            }
            if (typeof window.renderReportCards === 'function') {
                window.renderReportCards(window.currentReportsCache);
            }
            return;
        }

        // Update in-memory cache immediately so dashboard re-renders are accurate
        if (Array.isArray(window.currentReportsCache) && report && report.id) {
            var _replaced = false;
            window.currentReportsCache = window.currentReportsCache.map(function(r) {
                if (!r || r.id !== report.id) return r;
                _replaced = true;
                return Object.assign({}, r, {
                    project_id: report.project_id,
                    status: report.status,
                    report_date: report.report_date,
                    reportDate: report.report_date,
                    updated_at: report.updated_at || r.updated_at,
                    submitted_at: report.submitted_at || r.submitted_at || null,
                    dashboard_dismissed_at: Object.prototype.hasOwnProperty.call(report, 'dashboard_dismissed_at')
                        ? report.dashboard_dismissed_at
                        : r.dashboard_dismissed_at
                });
            });

            if (!_replaced) {
                window.currentReportsCache.push({
                    id: report.id,
                    project_id: report.project_id,
                    status: report.status,
                    report_date: report.report_date,
                    reportDate: report.report_date,
                    created_at: report.created_at,
                    updated_at: report.updated_at || Date.now(),
                    submitted_at: report.submitted_at || null,
                    dashboard_dismissed_at: report.dashboard_dismissed_at || null
                });
            }
        }

        // SYN-02 (Sprint 15): Skip realtime overwrites for the report currently being edited.
        // Exception: if status transitions to 'refined', fetch latest content and switch view.
        var path = window.location.pathname;
        var isInterviewPage = path.indexOf('quick-interview.html') !== -1;
        var isReportPage = path.indexOf('report.html') !== -1;
        if (isInterviewPage || isReportPage) {
            var urlParams = new URLSearchParams(window.location.search);
            var editingReportId = urlParams.get('reportId');
            if (editingReportId && editingReportId === report.id) {
                var previousStatus = payload.old && payload.old.status;
                if (typeof previousStatus === 'undefined') {
                    previousStatus = isReportPage &&
                        typeof RS !== 'undefined' &&
                        RS.report &&
                        RS.report.meta &&
                        RS.report.meta.status;
                }
                if (typeof previousStatus === 'undefined') {
                    previousStatus = isInterviewPage &&
                        typeof IS !== 'undefined' &&
                        IS.report &&
                        IS.report.meta &&
                        IS.report.meta.status;
                }
                if (typeof previousStatus === 'undefined') {
                    previousStatus = report.status;
                }
                var transitionedToRefined = payload.eventType === 'UPDATE' &&
                    report.status === 'refined' &&
                    previousStatus !== 'refined';

                if (transitionedToRefined) {
                    if (_refineRedirectInProgress) {
                        return;
                    }
                    // Don't navigate if this page is already processing —
                    // finish-processing.js will handle its own redirect
                    var processingOverlay = document.getElementById('processingOverlay');
                    if (processingOverlay && !processingOverlay.classList.contains('hidden')) {
                        console.log('[REALTIME] Skipping refined redirect — processing overlay active');
                        return;
                    }
                    _refineRedirectInProgress = true;
                    console.log('[REALTIME] Active report transitioned to refined:', report.id);
                    if (typeof showToast === 'function') {
                        showToast('Refined version is ready. Loading latest report...', 'info');
                    }
                    _refreshCurrentReportAfterRefined(report.id, isInterviewPage);
                    return;
                }

                console.log('[REALTIME] Skipping update for actively-edited report:', report.id);
                return;
            }
        }

        if (window.dataStore && typeof window.dataStore.saveReport === 'function') {
            window.dataStore.getReport(report.id).catch(function() { return null; }).then(function(existing) {
                var merged = existing || {};
                merged.id = report.id;
                merged.project_id = report.project_id;
                merged.status = report.status;
                merged.reportDate = report.report_date;
                merged.report_date = report.report_date;
                merged.updated_at = report.updated_at || Date.now();
                merged.submitted_at = report.submitted_at || merged.submitted_at || null;
                if (Object.prototype.hasOwnProperty.call(report, 'dashboard_dismissed_at')) {
                    merged.dashboard_dismissed_at = report.dashboard_dismissed_at;
                }
                return window.dataStore.saveReport(merged);
            }).then(function() {
                if (window.fvpBroadcast && window.fvpBroadcast.send) {
                    window.fvpBroadcast.send({ type: 'report-updated', id: report.id });
                }
            }).catch(function(e) {
                console.warn('[REALTIME] Failed to persist report metadata:', e);
            });
        }
    }
    if (payload.eventType === 'DELETE') {
        var deletedId = payload.old && payload.old.id;
        if (deletedId) {
            if (typeof addToDeletedBlocklist === 'function') addToDeletedBlocklist(deletedId);
            if (window.dataStore) {
                Promise.allSettled([
                    window.dataStore.deleteReport ? window.dataStore.deleteReport(deletedId) : Promise.resolve(),
                    window.dataStore.deleteReportData ? window.dataStore.deleteReportData(deletedId) : Promise.resolve(),
                    window.dataStore.deleteDraftData ? window.dataStore.deleteDraftData(deletedId) : Promise.resolve(),
                    window.dataStore.deletePhotosByReportId ? window.dataStore.deletePhotosByReportId(deletedId) : Promise.resolve()
                ]).catch(function(e) { console.warn('[REALTIME] Hard-delete cleanup failed:', e); });
            }
            if (window.fvpBroadcast && window.fvpBroadcast.send) {
                window.fvpBroadcast.send({ type: 'report-deleted', id: deletedId });
            }
        }
    }
    // Refresh Dashboard UI if available
    // If a report was just dismissed, do a full re-render (card needs to disappear)
    if (reportDismissedNow && typeof window.renderReportCards === 'function') {
        window.renderReportCards(window.currentReportsCache);
        if (typeof window.updateReportStatus === 'function') window.updateReportStatus();
        return;
    }

    if (typeof window.updateReportCardStatus === 'function' && payload.new) {
        window.updateReportCardStatus(payload.new.id, payload.new);
    } else if (typeof window.renderReportCards === 'function') {
        window.renderReportCards();
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
    console.log('[REALTIME] Back online — full sync cycle');

    // 1. Re-init realtime subscriptions
    initRealtimeSync();

    // 2. Flush current state immediately
    var path = window.location.pathname;
    if (path.indexOf('quick-interview') !== -1 && typeof flushInterviewBackup === 'function') {
        flushInterviewBackup();
    }
    if (path.indexOf('report.html') !== -1 && typeof flushReportBackup === 'function') {
        flushReportBackup();
    }

    // 3. Drain any pending backups from IDB queue
    if (typeof drainPendingBackups === 'function') drainPendingBackups();

});

// Tear down when going offline (channels will error anyway)
window.addEventListener('offline', function() {
    console.log('[REALTIME] Went offline — cleaning up');
    cleanupRealtimeSync();
});

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        cleanupRealtimeSync();
    } else if (document.visibilityState === 'visible') {
        setTimeout(function() { initRealtimeSync(); }, 1000);
    }
});

// bfcache restore handler
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[SYNC] Restored from bfcache — re-syncing');
        initRealtimeSync();
        if (typeof drainPendingBackups === 'function') drainPendingBackups();
    }
});

// Expose for use in page init scripts
window.initRealtimeSync = initRealtimeSync;
window.cleanupRealtimeSync = cleanupRealtimeSync;
