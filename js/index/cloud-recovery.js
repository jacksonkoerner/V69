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
 * Syncs active reports from Supabase `reports` table into local fvp_current_reports.
 * Covers the cross-device scenario: user creates a report on phone → opens laptop → sees it.
 * Queries reports WHERE status IN ('draft','pending_refine','refined','ready_to_submit').
 * Also runs interview_backup pre-caching for recovered draft reports.
 */
function recoverCloudDrafts() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
    if (!navigator.onLine) return;

    const userId = getStorageItem(STORAGE_KEYS.USER_ID);
    if (!userId) return;

    if (!window.dataStore) return;

    window.dataStore.getAllReports().then(function(reportMap) {
    var localReports = {};
    reportMap.forEach(function(value, key) { localReports[key] = value; });

    supabaseClient
        .from('reports')
        .select('id, project_id, report_date, status, created_at, updated_at')
        .eq('user_id', userId)
        .in('status', ['draft', 'pending_refine', 'refined', 'ready_to_submit'])
        .then(async ({ data, error }) => {
            if (error) {
                console.error('[RECOVERY] Failed to query cloud drafts:', error);
                return;
            }
            if (!data || data.length === 0) {
                console.log('[RECOVERY] No cloud drafts found');
                return;
            }

            const projectsMap = getStorageItem(STORAGE_KEYS.PROJECTS) || {};
            let recovered = 0;

            for (const row of data) {
                // Skip reports that are pending deletion (blocklist prevents zombie resurrection)
                if (typeof isDeletedReport === 'function' && isDeletedReport(row.id)) {
                    console.log('[RECOVERY] Skipping report on deleted blocklist:', row.id);
                    continue;
                }

                // SYN-01 (Sprint 15): Compare timestamps — cloud wins if newer
                const existing = localReports[row.id];
                if (existing) {
                    // Compare updated_at: cloud row uses ISO string, local may be epoch ms or ISO
                    const cloudTime = new Date(row.updated_at).getTime();
                    const localTime = typeof existing.updated_at === 'number'
                        ? existing.updated_at
                        : new Date(existing.updated_at).getTime();

                    if (!isNaN(cloudTime) && !isNaN(localTime) && cloudTime <= localTime) {
                        continue; // local version is same age or newer — keep it
                    }
                    // Cloud is newer — fall through to update local copy
                    console.log('[RECOVERY] Cloud version newer for report:', row.id,
                        '(cloud:', row.updated_at, 'vs local:', existing.updated_at, ')');
                }

                // Look up project name from cache or localStorage
                const project = projectsMap[row.project_id]
                    || getProjects().find(p => p.id === row.project_id);
                const projectName = project?.projectName || '';

                // Preserve local _draft_data if it exists (don't clobber unsaved edits)
                const preservedDraftData = existing?._draft_data || undefined;

                localReports[row.id] = {
                    ...(existing || {}),  // preserve any extra local fields
                    id: row.id,
                    project_id: row.project_id,
                    project_name: projectName,
                    reportDate: row.report_date,
                    status: row.status || 'draft',
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };

                // Restore _draft_data if we had local edits
                if (preservedDraftData) {
                    localReports[row.id]._draft_data = preservedDraftData;
                }

                recovered++;
            }

            if (recovered > 0) {
                await window.dataStore.replaceAllReports(localReports);
                window.currentReportsCache = Object.values(localReports);
                console.log(`[RECOVERY] Recovered ${recovered} draft(s) from cloud`);
                renderReportCards(window.currentReportsCache);

                // Sprint 4: Also cache report_data for recovered reports
                // so clicking the card loads data without another Supabase round-trip
                const recoveredIds = Object.keys(localReports);
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
                                if (window.dataStore && window.dataStore.saveReportData) {
                                    window.dataStore.saveReportData(rd.report_id, localData).catch(function() {});
                                }
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

                // Sprint 15: Rehydrate photos from Supabase photos table
                // Ensures cross-device photo display for recovered reports
                var allRecoveredIds = data.map(function(r) { return r.id; });
                if (allRecoveredIds.length > 0 && typeof fetchCloudPhotosBatch === 'function') {
                    fetchCloudPhotosBatch(allRecoveredIds)
                        .then(async function(photoMap) {
                            if (!photoMap || Object.keys(photoMap).length === 0) return;

                            // Inject photos into report_data in localStorage
                            for (var reportId in photoMap) {
                                var photos = photoMap[reportId];
                                if (!photos || photos.length === 0) continue;

                                // Update originalInput.photos in cached report data
                                var reportData = null;
                                if (window.dataStore && window.dataStore.getReportData) {
                                    reportData = await window.dataStore.getReportData(reportId);
                                }
                                if (reportData) {
                                    if (!reportData.originalInput) reportData.originalInput = {};
                                    if (!reportData.originalInput.photos || reportData.originalInput.photos.length === 0) {
                                        reportData.originalInput.photos = photos;
                                        if (window.dataStore && window.dataStore.saveReportData) {
                                            window.dataStore.saveReportData(reportId, reportData).catch(function() {});
                                        }
                                        console.log('[RECOVERY] Rehydrated ' + photos.length + ' photo(s) for:', reportId);
                                    }
                                }

                                // Also update _draft_data if it exists
                                var currentReport = await window.dataStore.getReport(reportId);
                                if (currentReport && currentReport._draft_data) {
                                    currentReport._draft_data.photos = photos;
                                    window.dataStore.saveReport(currentReport).catch(function() {});
                                }
                            }
                        })
                        .catch(function(err) {
                            console.warn('[RECOVERY] Photo rehydration failed:', err);
                        });
                }
                if (window.fvpBroadcast && typeof window.fvpBroadcast.send === 'function') {
                    window.fvpBroadcast.send({ type: 'reports-recovered', ids: Object.keys(localReports) });
                }
            } else {
                console.log('[RECOVERY] All cloud drafts already in localStorage');
            }
        })
        .catch(err => console.error('[RECOVERY] Cloud draft recovery error:', err));
    }).catch(function(err) {
        console.warn('[RECOVERY] Failed to load local reports from IDB:', err);
    });
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
        .then(async function(result) {
            if (result.error || !result.data || result.data.length === 0) return;

            var currentReports = {};
            if (window.dataStore && window.dataStore.getAllReports) {
                var reportMap = await window.dataStore.getAllReports();
                reportMap.forEach(function(value, key) { currentReports[key] = value; });
            }

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

            if (window.dataStore && window.dataStore.replaceAllReports) {
                window.dataStore.replaceAllReports(currentReports).catch(function() {});
            }
        })
        .catch(function(err) {
            console.warn('[RECOVERY] interview_backup cache failed:', err);
        });
}
