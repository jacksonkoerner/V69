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
                const projectName = project?.projectName || project?.project_name || '';

                localReports[row.id] = {
                    id: row.id,
                    project_id: row.project_id,
                    project_name: projectName,
                    date: row.report_date,
                    status: row.status || 'draft',
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
                recovered++;
            }

            if (recovered > 0) {
                setStorageItem(STORAGE_KEYS.CURRENT_REPORTS, localReports);
                console.log(`[RECOVERY] Recovered ${recovered} draft(s) from cloud`);
                renderReportCards();
            } else {
                console.log('[RECOVERY] All cloud drafts already in localStorage');
            }
        })
        .catch(err => console.error('[RECOVERY] Cloud draft recovery error:', err));
}
