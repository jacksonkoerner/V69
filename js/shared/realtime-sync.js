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
var _syncBroadcastChannel = null;  // Supabase Broadcast channel for live sync

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

    // --- Sync Broadcast channel (edit pages only) ---
    var reportId = new URLSearchParams(window.location.search).get('reportId');
    var path = window.location.pathname;
    if (reportId && (path.indexOf('quick-interview') !== -1 || path.indexOf('report.html') !== -1)) {
        _syncBroadcastChannel = supabaseClient
            .channel('sync:' + reportId)
            .on('broadcast', { event: 'sync_update' }, function(payload) {
                console.log('[SYNC-BC] Received broadcast:', payload);
                _handleSyncBroadcast(payload.payload);
            })
            .subscribe(function(status) {
                console.log('[SYNC-BC] sync:' + reportId + ' status:', status);
            });
        _realtimeChannels.push(_syncBroadcastChannel);
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
    _syncBroadcastChannel = null;
}

// --- Sync Broadcast handlers ---

var _lastMergeAt = null;  // Timestamp of last successful merge (staleness guard)
var _fetchMergePending = false;  // Prevents overlapping fetches
var _fetchMergeQueued = false;   // Coalesces one extra fetch while one is in-flight
var _queuedFetchPayload = null;
var _lastAppliedRevision = -1;

function _handleSyncBroadcast(payload) {
    // 1. Self-filter
    if (!payload || !window.syncEngine || !window.syncEngine.getSessionId) return;
    if (payload.session_id === window.syncEngine.getSessionId()) return;

    var reportId = payload.report_id;
    var path = window.location.pathname;
    var isInterview = path.indexOf('quick-interview') !== -1;
    var isReport = path.indexOf('report.html') !== -1;
    if (!isInterview && !isReport) return;

    // 2. Cross-page detection (interview sees report broadcast or vice versa)
    if (isInterview && payload.page === 'report') {
        if (typeof showToast === 'function') {
            showToast('⚠️ Refined report is being edited on another device', 'warning');
        }
        return;
    }
    if (isReport && payload.page === 'quick-interview') {
        if (typeof showToast === 'function') {
            showToast('⚠️ Draft is being edited on another device', 'warning');
        }
        return;
    }

    // Skip stale broadcast revisions (older than most recently applied).
    var incomingRevision = typeof payload.revision === 'number' ? payload.revision : 0;
    if (incomingRevision > 0 && incomingRevision < _lastAppliedRevision) {
        console.log('[SYNC-BC] Ignoring stale broadcast revision', incomingRevision, '<', _lastAppliedRevision);
        return;
    }

    // 3. Prevent overlapping fetches, but queue one rerun.
    if (_fetchMergePending) {
        _fetchMergeQueued = true;
        _queuedFetchPayload = payload;
        console.log('[SYNC-BC] Fetch already pending, queued one follow-up fetch');
        return;
    }
    _fetchMergePending = true;

    // 4. Delayed REST fetch with jitter (broadcast arrives before DB commit)
    var delay = 500 + Math.floor(Math.random() * 300);
    console.log('[SYNC-BC] Scheduling fetch in', delay, 'ms for', reportId);

    setTimeout(function() {
        _fetchAndMerge(reportId, payload.sections_changed, isInterview, incomingRevision)
            .finally(function() {
                _fetchMergePending = false;
                if (_fetchMergeQueued) {
                    var queuedPayload = _queuedFetchPayload || payload;
                    _fetchMergeQueued = false;
                    _queuedFetchPayload = null;
                    _handleSyncBroadcast(queuedPayload);
                }
            });
    }, delay);
}

/**
 * Fetch latest data from Supabase and invoke merge.
 */
function _fetchAndMerge(reportId, sectionsHint, isInterview, incomingRevision) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !navigator.onLine) {
        return Promise.resolve();
    }

    var fetchPromise;
    if (isInterview) {
        fetchPromise = supabaseClient
            .from('interview_backup')
            .select('page_state, updated_at')
            .eq('report_id', reportId)
            .maybeSingle();
    } else {
        fetchPromise = supabaseClient
            .from('report_data')
            .select('*')
            .eq('report_id', reportId)
            .maybeSingle();
    }

    return fetchPromise.then(function(result) {
        if (!result.data || result.error) {
            console.warn('[SYNC-BC] Fetch returned no data or error:', result.error);
            return;
        }

        // Staleness check
        var remoteUpdatedAt = result.data.updated_at;
        if (_lastMergeAt && remoteUpdatedAt <= _lastMergeAt) {
            console.log('[SYNC-BC] Remote data not newer than last merge, skipping');
            return;
        }
        _lastMergeAt = remoteUpdatedAt;
        if (typeof incomingRevision === 'number') {
            _lastAppliedRevision = Math.max(_lastAppliedRevision, incomingRevision);
        }

        console.log('[SYNC-BC] Fetched remote data, updated_at:', remoteUpdatedAt);

        // Merge: wire to merge engine (Sprint 8/9)
        if (isInterview) {
            var remotePageState = result.data.page_state;
            if (!remotePageState || typeof remotePageState !== 'object') return;
            var IS = window.interviewState;
            if (!IS || !IS.report) return;

            if (typeof syncMerge === 'function' && window.syncEngine.INTERVIEW_SECTIONS) {
                var mergeResult = syncMerge(
                    window._syncBase || {},
                    IS.report,
                    remotePageState,
                    sectionsHint,
                    window.syncEngine.INTERVIEW_SECTIONS
                );
                if (mergeResult.sectionsUpdated.length > 0) {
                    console.log('[SYNC-BC] Merge found updates in:', mergeResult.sectionsUpdated);
                    if (typeof window.applyInterviewMerge === 'function') {
                        window.applyInterviewMerge(mergeResult);
                    }
                } else {
                    console.log('[SYNC-BC] Merge: no changes needed');
                }
            }
        } else {
            // Report page merge
            if (typeof window.applyReportMerge === 'function') {
                window.applyReportMerge(result.data);
            }
        }
    }).catch(function(err) {
        console.warn('[SYNC-BC] Fetch failed:', err);
    });
}

/**
 * Send a sync_update broadcast to the sync:{reportId} channel.
 * Called after a successful Supabase upsert (never before).
 */
function _broadcastSyncUpdate(reportId, sectionsChanged, page) {
    if (!_syncBroadcastChannel) return;
    if (_syncBroadcastChannel.topic !== 'realtime:sync:' + reportId) return;

    var payload = {
        type: 'sync_update',
        session_id: window.syncEngine.getSessionId ? window.syncEngine.getSessionId() : 'unknown',
        report_id: reportId,
        page: page || 'unknown',
        updated_at: new Date().toISOString(),
        sections_changed: sectionsChanged || [],
        revision: window.syncEngine.getRevision ? window.syncEngine.getRevision() : 0
    };

    _syncBroadcastChannel.send({
        type: 'broadcast',
        event: 'sync_update',
        payload: payload
    });
    console.log('[SYNC-BC] Broadcast sent:', payload.sections_changed);
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
        reportDismissedNow = payload.eventType === 'UPDATE' &&
            report &&
            report.dashboard_dismissed_at &&
            !(payload.old && payload.old.dashboard_dismissed_at);

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
                var transitionedToRefined = payload.eventType === 'UPDATE' &&
                    report.status === 'refined' &&
                    previousStatus !== 'refined';

                if (transitionedToRefined) {
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
            window.dataStore.deleteReportData(deletedReportId).catch(function(e) { console.warn('[REALTIME] Report data delete failed:', e); });
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

    // 4. Fetch remote state and merge (may have missed changes while offline)
    var reportId = new URLSearchParams(window.location.search).get('reportId');
    if (reportId) {
        var isInterview = path.indexOf('quick-interview') !== -1;
        var isReport = path.indexOf('report.html') !== -1;
        if (isInterview || isReport) {
            setTimeout(function() {
                _fetchAndMerge(reportId, [], isInterview);
            }, 2000);  // 2s delay: let flush complete first
        }
    }
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

        // Unconditional REST fetch on resume (iOS may have missed broadcasts)
        var reportId = new URLSearchParams(window.location.search).get('reportId');
        var path = window.location.pathname;
        if (reportId) {
            var isInterview = path.indexOf('quick-interview') !== -1;
            var isReport = path.indexOf('report.html') !== -1;
            if (isInterview || isReport) {
                setTimeout(function() {
                    _fetchAndMerge(reportId, [], isInterview);
                }, 1500);  // 1.5s delay: let initRealtimeSync re-establish WS first
            }
        }
    }
});

// bfcache restore handler
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        console.log('[SYNC] Restored from bfcache — re-syncing');
        initRealtimeSync();
        var reportId = new URLSearchParams(window.location.search).get('reportId');
        var path = window.location.pathname;
        if (reportId) {
            var isInterview = path.indexOf('quick-interview') !== -1;
            var isReport = path.indexOf('report.html') !== -1;
            if (isInterview || isReport) {
                _fetchAndMerge(reportId, [], isInterview);
            }
        }
        if (typeof drainPendingBackups === 'function') drainPendingBackups();
    }
});

// Expose for use in page init scripts
window.initRealtimeSync = initRealtimeSync;
window.cleanupRealtimeSync = cleanupRealtimeSync;
window.syncEngine = Object.assign(window.syncEngine || {}, {
    initRealtimeSync: initRealtimeSync,
    cleanupRealtimeSync: cleanupRealtimeSync,
    broadcastSyncUpdate: function(reportId, sectionsChanged, page) {
        _broadcastSyncUpdate(reportId, sectionsChanged, page);
    }
});
