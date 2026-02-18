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
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'report_data'
            // NOTE: report_data has no user_id column, so we can't filter server-side.
            // RLS policies on Supabase MUST enforce tenant isolation for this channel.
            // Client-side guard in _handleReportDataChange filters by known report IDs.
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

function _handleReportChange(payload) {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        var report = payload.new;

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
                ]).catch(function() {});
            }
            if (window.fvpBroadcast && window.fvpBroadcast.send) {
                window.fvpBroadcast.send({ type: 'report-deleted', id: report.id });
            }
            if (typeof window.renderReportCards === 'function') {
                window.renderReportCards();
            }
            return;
        }

        // SYN-02 (Sprint 15): Skip realtime overwrites for the report currently being edited.
        // If user is on quick-interview.html or report.html editing this specific report,
        // a realtime event could reset local state (status, dates, etc.) mid-edit.
        var path = window.location.pathname;
        if (path.indexOf('quick-interview.html') !== -1 || path.indexOf('report.html') !== -1) {
            var urlParams = new URLSearchParams(window.location.search);
            var editingReportId = urlParams.get('reportId');
            if (editingReportId && editingReportId === report.id) {
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
                merged.updated_at = Date.now();
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
                ]).catch(function() {});
            }
            if (window.fvpBroadcast && window.fvpBroadcast.send) {
                window.fvpBroadcast.send({ type: 'report-deleted', id: deletedId });
            }
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

        console.log('[REALTIME] Report data change:', payload.eventType);

        // SYN-02: Skip if user is currently editing this report on report.html
        var path = window.location.pathname;
        if (path.indexOf('report.html') !== -1 || path.indexOf('quick-interview.html') !== -1) {
            var urlParams = new URLSearchParams(window.location.search);
            var editingReportId = urlParams.get('reportId');
            if (editingReportId && editingReportId === data.report_id) {
                console.log('[REALTIME] Skipping report_data update for actively-edited report:', data.report_id);
                return;
            }
        }

        // ONLY update lightweight metadata fields that Realtime reliably includes.
        // DO NOT write ai_generated or original_input from Realtime payloads —
        // Supabase Realtime has a 1MB payload limit and strips columns >64 bytes.
        // These large JSONB fields will always be null/missing in the payload.
        // Full content is fetched on-demand by loadReport() via REST API.
        if (window.dataStore && typeof window.dataStore.getReportData === 'function') {
            window.dataStore.getReportData(data.report_id)
                .then(function(existing) {
                    if (!existing) return; // Don't create entries from Realtime — let loadReport() handle first fetch

                    // Only update fields that are safe (small, reliably included in payload)
                    if (data.status) existing.status = data.status;
                    if (data.capture_mode) existing.captureMode = data.capture_mode;
                    if (data.user_edits && typeof data.user_edits === 'object' && Object.keys(data.user_edits).length > 0) {
                        existing.userEdits = data.user_edits;
                    }
                    existing.lastSaved = data.updated_at;

                    return window.dataStore.saveReportData(data.report_id, existing);
                })
                .catch(function(err) {
                    console.warn('[REALTIME] report_data merge failed:', err);
                });
        }

        // Notify other tabs that report data changed (notification only, no data)
        if (window.fvpBroadcast && window.fvpBroadcast.send) {
            window.fvpBroadcast.send({ type: 'report-data-updated', id: data.report_id });
        }
    }

    if (payload.eventType === 'DELETE') {
        var deletedReportId = payload.old && payload.old.report_id;
        if (deletedReportId && window.dataStore && typeof window.dataStore.deleteReportData === 'function') {
            window.dataStore.deleteReportData(deletedReportId).catch(function() {});
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

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        cleanupRealtimeSync();
    } else if (document.visibilityState === 'visible') {
        setTimeout(function() { initRealtimeSync(); }, 1000);
    }
});

// Expose for use in page init scripts
window.initRealtimeSync = initRealtimeSync;
window.cleanupRealtimeSync = cleanupRealtimeSync;
window.syncEngine = {
    initRealtimeSync: initRealtimeSync,
    cleanupRealtimeSync: cleanupRealtimeSync
};
