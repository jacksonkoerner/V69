// ============================================================================
// Dashboard sync helpers (manual pull + reconnect push)
// ============================================================================

(function() {
    function _withTimeout(promise, ms, fallback, label) {
        var timerId;
        return Promise.race([
            promise.then(function(value) {
                clearTimeout(timerId);
                return value;
            }, function(err) {
                clearTimeout(timerId);
                throw err;
            }),
            new Promise(function(resolve) {
                timerId = setTimeout(function() {
                    console.warn('[INDEX SYNC] ' + label + ' timed out after ' + ms + 'ms');
                    resolve(fallback);
                }, ms);
            })
        ]);
    }

    async function pullFromSupabase() {
        if (!navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
            return null;
        }

        var userId = typeof getStorageItem === 'function'
            ? getStorageItem(STORAGE_KEYS.USER_ID)
            : localStorage.getItem(STORAGE_KEYS.USER_ID);
        if (!userId) return null;

        var result = await supabaseClient
            .from('reports')
            .select('id,status,project_id,report_date,created_at,updated_at,submitted_at,dashboard_dismissed_at')
            .eq('user_id', userId)
            .neq('status', 'deleted');

        if (result.error) throw result.error;

        var rows = Array.isArray(result.data) ? result.data : [];
        var reports = {};
        rows.forEach(function(row) {
            if (!row || !row.id) return;
            reports[row.id] = {
                id: row.id,
                status: row.status,
                project_id: row.project_id,
                report_date: row.report_date,
                reportDate: row.report_date,
                created_at: row.created_at || null,
                updated_at: row.updated_at || null,
                submitted_at: row.submitted_at || null,
                dashboard_dismissed_at: row.dashboard_dismissed_at || null
            };
        });

        if (window.dataStore && typeof window.dataStore.replaceAllReports === 'function') {
            await window.dataStore.replaceAllReports(reports);
        }

        window.currentReportsCache = Object.values(reports);

        if (window.dataLayer && typeof window.dataLayer.refreshProjectsFromCloud === 'function') {
            try {
                await _withTimeout(
                    window.dataLayer.refreshProjectsFromCloud(),
                    12000,
                    null,
                    'refreshProjectsFromCloud'
                );
            } catch (e) {
                console.warn('[INDEX SYNC] Project refresh during pull failed:', e);
            }
        }

        return window.currentReportsCache;
    }

    async function markReportDirty(reportId, op) {
        if (!reportId || !window.dataStore || typeof window.dataStore.saveReport !== 'function') {
            return false;
        }

        var existing = null;
        if (typeof window.dataStore.getReport === 'function') {
            try {
                existing = await window.dataStore.getReport(reportId);
            } catch (e) {
                existing = null;
            }
        }

        var nowIso = new Date().toISOString();
        var dirty = Object.assign({}, existing || { id: reportId }, {
            id: reportId,
            updated_at: (existing && existing.updated_at) || nowIso,
            _pendingSync: {
                op: op,
                dirtyAt: Date.now(),
                attempts: existing && existing._pendingSync && typeof existing._pendingSync.attempts === 'number'
                    ? existing._pendingSync.attempts
                    : 0
            }
        });

        if (op === 'delete') dirty.status = 'deleted';

        await window.dataStore.saveReport(dirty);
        return true;
    }

    async function pushLocalChanges() {
        if (!navigator.onLine || typeof supabaseClient === 'undefined' || !supabaseClient) {
            return [];
        }

        var userId = typeof getStorageItem === 'function'
            ? getStorageItem(STORAGE_KEYS.USER_ID)
            : localStorage.getItem(STORAGE_KEYS.USER_ID);
        if (!userId) return [];

        if (!window.dataStore || typeof window.dataStore.getAllReports !== 'function') {
            return [];
        }

        var reportMap = await window.dataStore.getAllReports();
        var pendingReports = [];
        reportMap.forEach(function(report) {
            if (report && report._pendingSync && report._pendingSync.op) {
                pendingReports.push(report);
            }
        });

        if (pendingReports.length === 0) {
            return [];
        }

        var orgId = typeof getStorageItem === 'function'
            ? getStorageItem(STORAGE_KEYS.ORG_ID)
            : localStorage.getItem(STORAGE_KEYS.ORG_ID);
        var deviceId = localStorage.getItem('fvp_device_id') || null;
        var nowIso = new Date().toISOString();
        var results = [];

        for (var i = 0; i < pendingReports.length; i++) {
            var report = pendingReports[i];
            var reportId = report && report.id;
            var op = report && report._pendingSync && report._pendingSync.op;
            if (!reportId || !op) continue;

            try {
                if (op === 'delete') {
                    var delResult = await supabaseClient
                        .from('reports')
                        .update({ status: 'deleted' })
                        .eq('id', reportId);
                    if (delResult.error) throw delResult.error;
                } else if (op === 'upsert') {
                    var upsertPayload = {
                        id: reportId,
                        project_id: report.project_id || null,
                        user_id: report.user_id || userId,
                        device_id: report.device_id || deviceId,
                        report_date: report.report_date || report.reportDate || null,
                        status: report.status || 'draft',
                        created_at: report.created_at || nowIso,
                        updated_at: report.updated_at || nowIso,
                        org_id: report.org_id || orgId || null
                    };
                    var upsertResult = await supabaseClient
                        .from('reports')
                        .upsert(upsertPayload);
                    if (upsertResult.error) throw upsertResult.error;
                }

                delete report._pendingSync;
                if (typeof window.dataStore.saveReport === 'function') {
                    await window.dataStore.saveReport(report);
                }
                results.push({ id: reportId, op: op, ok: true });
            } catch (e) {
                report._pendingSync.attempts = (report._pendingSync.attempts || 0) + 1;
                if (typeof window.dataStore.saveReport === 'function') {
                    try { await window.dataStore.saveReport(report); } catch (saveErr) {}
                }
                console.warn('[INDEX SYNC] Failed to push report', reportId, op, e);
                results.push({ id: reportId, op: op, ok: false, error: e && e.message ? e.message : String(e) });
            }
        }

        await pullFromSupabase();
        return results;
    }

    window.pullFromSupabase = pullFromSupabase;
    window.pushLocalChanges = pushLocalChanges;
    window.markReportDirty = markReportDirty;
})();
