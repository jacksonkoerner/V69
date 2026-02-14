// ============================================================================
// FieldVoice Pro v6 - Cloud Draft Recovery (cloud-recovery.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem
// - config.js: supabaseClient
// - index/report-cards.js: renderReportCards
// - index/main.js: projectsCache (via getProjects)
// ============================================================================

/**
 * Non-blocking: after the initial localStorage render, query Supabase for
 * draft/active reports that belong to this user but are missing locally.
 * Handles iOS 7-day eviction, cleared cache, and device switching.
 * Merges recovered reports into fvp_current_reports and re-renders.
 */
function recoverCloudDrafts() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    if (!navigator.onLine) return;

    const userId = getStorageItem(STORAGE_KEYS.USER_ID);
    if (!userId) return;

    supabaseClient
        .from('reports')
        .select('id, project_id, report_date, status, created_at, updated_at')
        .eq('user_id', userId)
        .neq('status', 'submitted')
        .then(({ data, error }) => {
            if (error) {
                console.error('[RECOVERY] Failed to query cloud drafts:', error);
                return;
            }
            if (!data || data.length === 0) {
                console.log('[RECOVERY] No cloud drafts found');
                return;
            }

            const localReports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};
            const projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
            let recovered = 0;

            for (const row of data) {
                if (localReports[row.id]) continue; // already in localStorage

                // Look up project name from cache or localStorage
                const project = projectsMap[row.project_id]
                    || getProjects().find(p => p.id === row.project_id);
                const projectName = project?.projectName || '';

                localReports[row.id] = {
                    id: row.id,
                    project_id: row.project_id,
                    project_name: projectName,
                    reportDate: row.report_date,
                    status: row.status || 'draft',
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
                recovered++;
            }

            if (recovered > 0) {
                setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, localReports);
                console.log(`[RECOVERY] Recovered ${recovered} draft(s) from cloud`);
                // Sync to IndexedDB after recovery
                syncCurrentReportsToIDB();
                renderReportCards();

                // Sprint 4: Also cache report_data for recovered reports
                // so clicking the card loads data without another Supabase round-trip
                const recoveredIds = Object.keys(localReports).filter(id => !getReportData(id));
                if (recoveredIds.length > 0) {
                    supabaseClient
                        .from('report_data')
                        .select('*')
                        .in('report_id', recoveredIds)
                        .then(function(rdResult) {
                            if (rdResult.error || !rdResult.data) return;
                            for (const rd of rdResult.data) {
                                var localData = {
                                    aiGenerated: rd.ai_generated,
                                    originalInput: rd.original_input,
                                    userEdits: rd.user_edits || {},
                                    captureMode: rd.capture_mode,
                                    status: rd.status,
                                    createdAt: rd.created_at,
                                    lastSaved: rd.updated_at,
                                    reportDate: localReports[rd.report_id]?.reportDate || null
                                };
                                saveReportData(rd.report_id, localData);
                                console.log('[RECOVERY] Cached report_data for:', rd.report_id);
                            }
                        })
                        .catch(function(err) {
                            console.warn('[RECOVERY] report_data cache failed:', err);
                        });
                }
                // Sprint 7: Also cache interview_backup for draft/pending_refine reports
                // so when user taps a recovered draft card, the Field Capture page has data
                var draftIds = data
                    .filter(function(r) { return r.status === 'draft' || r.status === 'pending_refine'; })
                    .map(function(r) { return r.id; });

                if (draftIds.length > 0) {
                    cacheInterviewBackups(draftIds, localReports);
                }
            } else {
                console.log('[RECOVERY] All cloud drafts already in localStorage');
            }
        })
        .catch(err => console.error('[RECOVERY] Cloud draft recovery error:', err));
}

/**
 * Sprint 7: Pre-cache interview_backup data for draft reports.
 * Queries Supabase interview_backup table and stores page_state as _draft_data
 * in fvp_current_reports so the Field Capture page loads instantly.
 * @param {string[]} reportIds - report IDs to check
 * @param {Object} localReports - current fvp_current_reports map
 */
function cacheInterviewBackups(reportIds, localReports) {
    // Only cache for reports that don't already have _draft_data
    var needsCache = reportIds.filter(function(id) {
        var report = localReports[id];
        return report && !report._draft_data;
    });

    if (needsCache.length === 0) return;

    supabaseClient
        .from('interview_backup')
        .select('report_id, page_state, updated_at')
        .in('report_id', needsCache)
        .then(function(result) {
            if (result.error || !result.data || result.data.length === 0) return;

            var currentReports = getStorageItem(STORAGE_KEYS.CURRENT_REPORTS) || {};

            for (var i = 0; i < result.data.length; i++) {
                var backup = result.data[i];
                if (!backup.page_state) continue;

                var ps = backup.page_state;
                var report = currentReports[backup.report_id];
                if (!report) continue;

                // Build _draft_data from page_state (matching saveToLocalStorage format)
                report._draft_data = {
                    captureMode: ps.captureMode || null,
                    lastSaved: backup.updated_at || ps.savedAt,
                    meta: { captureMode: ps.captureMode },
                    weather: ps.overview?.weather || {},
                    freeform_entries: ps.freeform_entries || [],
                    freeformNotes: ps.fieldNotes?.freeformNotes || '',
                    activities: ps.activities || [],
                    operations: ps.operations || [],
                    equipment: ps.equipment || [],
                    equipmentRows: ps.equipmentRows || [],
                    overview: ps.overview || {},
                    safety: ps.safety || {},
                    safetyNoIncidents: ps.safety?.noIncidents || false,
                    safetyHasIncidents: ps.safety?.hasIncidents || false,
                    safetyNotes: ps.safety?.notes || [],
                    generalIssues: ps.generalIssues || [],
                    issuesNotes: ps.generalIssues || [],
                    toggleStates: ps.toggleStates || {},
                    entries: ps.entries || [],
                    guidedNotes: ps.guidedNotes || {},
                    workSummary: ps.guidedNotes?.workSummary || '',
                    photos: []
                };

                currentReports[backup.report_id] = report;
                console.log('[RECOVERY] Cached interview_backup for:', backup.report_id);
            }

            setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, currentReports);
        })
        .catch(function(err) {
            console.warn('[RECOVERY] interview_backup cache failed:', err);
        });
}
