// Supabase storage functions for quick-interview
// Includes: getReport, createFreshReport, saveReportToSupabase, uploadPhotoToSupabase,
//           uploadPendingPhotos, deletePhotoFromSupabase, deleteReportFromSupabase, clearSyncQueueForReport

var IS = window.interviewState;

// ============ STORAGE (SUPABASE) ============
let saveReportTimeout = null;
let isSaving = false;

// getReportKey() removed in Task 3 — UUID-only payload

/**
 * Load report — try localStorage → IDB → Supabase interview_backup → fresh
 * Sprint 11: Refactored to restore existing data before creating fresh.
 * Returns a populated report object if prior data exists, fresh otherwise.
 */
async function getReport() {
    const urlReportId = new URLSearchParams(window.location.search).get('reportId');

    // If we have a reportId, try to restore existing data first
    if (urlReportId) {
        // 1. Try localStorage (fast, sync)
        var localDraft = loadFromLocalStorage.call({ currentReportId: urlReportId } , urlReportId);
        // loadFromLocalStorage reads IS.currentReportId — temporarily set it
        var prevId = IS.currentReportId;
        IS.currentReportId = urlReportId;
        localDraft = loadFromLocalStorage();
        IS.currentReportId = prevId;

        if (localDraft) {
            console.log('[getReport] Restored from localStorage');
            var report = createFreshReport();
            restoreFromLocalStorage.call(null, localDraft);
            // restoreFromLocalStorage modifies IS.report, but IS.report isn't set yet.
            // Instead, build report from localDraft directly:
            report = createFreshReport();
            applyDraftToReport(report, localDraft);
            return report;
        }

        // 2. Try IndexedDB
        if (window.idb && window.idb.getDraftDataIDB) {
            try {
                var idbData = await window.idb.getDraftDataIDB(urlReportId);
                if (idbData) {
                    console.log('[getReport] Restored from IndexedDB');
                    var report = createFreshReport();
                    applyDraftToReport(report, idbData);
                    return report;
                }
            } catch (e) {
                console.warn('[getReport] IDB restore failed:', e);
            }
        }

        // 3. Try Supabase interview_backup (cross-device)
        if (navigator.onLine) {
            try {
                var result = await supabaseClient
                    .from('interview_backup')
                    .select('page_state, updated_at')
                    .eq('report_id', urlReportId)
                    .maybeSingle();

                if (!result.error && result.data && result.data.page_state) {
                    console.log('[getReport] Restored from Supabase interview_backup');
                    var report = createFreshReport();
                    var ps = result.data.page_state;
                    if (ps.captureMode) report.meta.captureMode = ps.captureMode;
                    if (ps.freeform_entries) report.freeform_entries = ps.freeform_entries;
                    if (ps.fieldNotes) report.fieldNotes = Object.assign(report.fieldNotes, ps.fieldNotes);
                    if (ps.guidedNotes) report.guidedNotes = Object.assign(report.guidedNotes, ps.guidedNotes);
                    if (ps.activities) report.activities = ps.activities;
                    if (ps.operations) report.operations = ps.operations;
                    if (ps.equipment) report.equipment = ps.equipment;
                    if (ps.equipmentRows) report.equipmentRows = ps.equipmentRows;
                    if (ps.overview) report.overview = Object.assign(report.overview, ps.overview);
                    if (ps.safety) report.safety = Object.assign(report.safety, ps.safety);
                    if (ps.generalIssues) report.generalIssues = ps.generalIssues;
                    if (ps.toggleStates) report.toggleStates = ps.toggleStates;
                    if (ps.entries) report.entries = ps.entries;
                    return report;
                }
            } catch (e) {
                console.warn('[getReport] Supabase interview_backup restore failed:', e);
            }
        }
    }

    // 4. Nothing found — create fresh
    IS.currentReportId = null;
    return createFreshReport();
}

/**
 * Apply draft data fields onto a fresh report object
 * Mirrors the field mapping from restoreFromLocalStorage but works on any report object
 */
function applyDraftToReport(report, data) {
    if (!data) return;
    if (data.meta) report.meta = Object.assign(report.meta, data.meta);
    if (data.captureMode) report.meta.captureMode = data.captureMode;
    if (data.weather) report.overview.weather = data.weather;
    if (data.freeformNotes) report.fieldNotes.freeformNotes = data.freeformNotes;
    if (data.freeform_entries && Array.isArray(data.freeform_entries)) report.freeform_entries = data.freeform_entries;
    if (data.freeform_checklist) report.freeform_checklist = data.freeform_checklist;
    if (data.siteConditions) report.overview.weather.jobSiteCondition = data.siteConditions;
    if (data.issuesNotes && Array.isArray(data.issuesNotes)) report.generalIssues = data.issuesNotes;
    if (data.safetyNoIncidents !== undefined) report.safety.noIncidents = data.safetyNoIncidents;
    if (data.safetyHasIncidents !== undefined) report.safety.hasIncidents = data.safetyHasIncidents;
    if (data.safetyNotes && Array.isArray(data.safetyNotes)) report.safety.notes = data.safetyNotes;
    if (data.qaqcNotes && Array.isArray(data.qaqcNotes)) report.qaqcNotes = data.qaqcNotes;
    if (data.communications) report.contractorCommunications = data.communications;
    if (data.visitorsRemarks) report.visitorsRemarks = data.visitorsRemarks;
    if (data.additionalNotes) report.additionalNotes = data.additionalNotes;
    if (data.activities && Array.isArray(data.activities)) report.activities = data.activities;
    if (data.operations && Array.isArray(data.operations)) report.operations = data.operations;
    if (data.equipment && Array.isArray(data.equipment)) report.equipment = data.equipment;
    if (data.equipmentRows && Array.isArray(data.equipmentRows)) report.equipmentRows = data.equipmentRows;
    if (data.photos && Array.isArray(data.photos)) report.photos = data.photos;
    if (data.reporter) report.reporter = Object.assign(report.reporter, data.reporter);
    if (data.overview) report.overview = Object.assign(report.overview, data.overview);
    if (data.entries && Array.isArray(data.entries)) report.entries = data.entries;
    if (data.toggleStates) report.toggleStates = data.toggleStates;
}

function createFreshReport() {
    return {
        meta: {
            createdAt: new Date().toISOString(),
            interviewCompleted: false,
            version: 2,
            naMarked: {},
            captureMode: null,
            status: 'draft'
        },
        reporter: {
            name: IS.userSettings?.full_name || ""
        },
        project: {
            projectName: IS.activeProject?.projectName || "",
            dayNumber: null
        },
        overview: {
            projectName: IS.activeProject?.projectName || "",
            date: new Date().toLocaleDateString(),
            startTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            completedBy: IS.userSettings?.full_name || "",
            weather: { highTemp: "--", lowTemp: "--", precipitation: "0.00\"", generalCondition: "Syncing...", jobSiteCondition: "", adverseConditions: "N/A" }
        },
        contractors: [], activities: [], operations: [], equipment: [], generalIssues: [], qaqcNotes: [],
        safety: { hasIncidents: false, noIncidents: false, notes: [] },
        contractorCommunications: "",
        visitorsRemarks: "",
        photos: [],
        additionalNotes: "",
        fieldNotes: { freeformNotes: "" },
        guidedNotes: { workSummary: "" },
        entries: [],           // v6: entry-based notes
        toggleStates: {},      // v6: locked toggle states (section -> true/false/null)
        equipmentRows: []      // v6.6: structured equipment rows
    };
}

/**
 * Actually save report to Supabase
 */
async function saveReportToSupabase() {
    if (isSaving || !IS.activeProject) return;
    isSaving = true;

    try {
        const todayStr = getTodayDateString();

        // 1. Upsert the main report record
        // v6.9: UUID-only — hard error if no report ID
        if (!IS.currentReportId) throw new Error('No report ID — cannot save to Supabase');
        const reportId = IS.currentReportId;

        const reportData = {
            id: reportId,
            project_id: IS.activeProject.id,
            user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
            device_id: getDeviceId(),
            report_date: todayStr,
            status: IS.report.meta?.status || 'draft',
            capture_mode: IS.report.meta?.captureMode || 'guided',
            updated_at: new Date().toISOString()
        };

        const { error: reportError } = await supabaseClient
            .from('reports')
            .upsert(reportData, { onConflict: 'id' });

        if (reportError) {
            console.error('Error saving report:', reportError);
            showToast('Failed to save report', 'error');
            isSaving = false;
            return;
        }

        IS.currentReportId = reportId;

        // interview_backup is now handled by debounced autosave (flushInterviewBackup)
        // Flush immediately since we're about to navigate away
        flushInterviewBackup();

        // Note: Photos are saved separately when uploaded via uploadPhotoToSupabase

        console.log('[SUPABASE] Report saved successfully');
    } catch (err) {
        console.error('[SUPABASE] Save failed:', err);
        showToast('Failed to save report', 'error');
    } finally {
        isSaving = false;
    }
}

/**
 * Upload photo to Supabase Storage
 */
async function uploadPhotoToSupabase(file, photoId) {
    if (!IS.currentReportId) {
        // Create report first if it doesn't exist
        await saveReportToSupabase();
    }

    const fileName = `${IS.currentReportId}/${photoId}_${file.name}`;

    try {
        const { data, error } = await supabaseClient.storage
            .from('report-photos')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Error uploading photo:', error);
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabaseClient.storage
            .from('report-photos')
            .getPublicUrl(fileName);

        return {
            storagePath: fileName,
            publicUrl: urlData?.publicUrl || ''
        };
    } catch (err) {
        console.error('Photo upload failed:', err);
        throw err;
    }
}

/**
 * Upload pending photos to Supabase (called on Submit)
 */
async function uploadPendingPhotos() {
    if (!IS.currentReportId) return;

    const pendingPhotos = await window.idb.getPhotosBySyncStatus('pending');
    const reportPhotos = pendingPhotos.filter(p => p.reportId === IS.currentReportId || p.reportId === 'pending');

    for (const photo of reportPhotos) {
        try {
            // If we have base64 but no storagePath, need to upload
            if (photo.base64 && !photo.storagePath) {
                showToast('Uploading photos...', 'info');
                const blob = await dataURLtoBlob(photo.base64);
                const { storagePath, publicUrl } = await uploadPhotoToSupabase(blob, photo.id);

                photo.storagePath = storagePath;
                photo.url = publicUrl;
            }

            // Save metadata to Supabase
            if (photo.storagePath) {
                const photoData = {
                    id: photo.id,
                    report_id: IS.currentReportId,
                    storage_path: photo.storagePath,
                    photo_url: photo.url || null,
                    caption: photo.caption || '',
                    photo_type: photo.fileType || photo.fileName || null,
                    filename: photo.fileName || photo.name || null,
                    location_lat: photo.gps?.lat || null,
                    location_lng: photo.gps?.lng || null,
                    taken_at: photo.timestamp || new Date().toISOString(),
                    created_at: photo.createdAt || new Date().toISOString()
                };

                const { error } = await supabaseClient
                    .from('photos')
                    .upsert(photoData, { onConflict: 'id' });

                if (error) {
                    console.error('[PHOTO] Supabase metadata error:', error);
                    continue;
                }
            }

            // Update IndexedDB with synced status and reportId
            photo.reportId = IS.currentReportId;
            photo.syncStatus = 'synced';
            await window.idb.savePhoto(photo);
            console.log('[PHOTO] Synced to Supabase:', photo.id);
        } catch (err) {
            console.error('[PHOTO] Failed to sync photo:', photo.id, err);
        }
    }
}

async function deletePhotoFromSupabase(photoId, storagePath) {
    try {
        // Delete from storage
        if (storagePath) {
            await supabaseClient.storage
                .from('report-photos')
                .remove([storagePath]);
        }

        // Delete metadata
        await supabaseClient
            .from('photos')
            .delete()
            .eq('id', photoId);
    } catch (err) {
        console.error('Failed to delete photo:', err);
    }
}

/**
 * Delete report and all related data from Supabase
 * Wrapper around shared deleteReportCascade
 * @param {string} reportId - The report UUID to delete
 */
async function deleteReportFromSupabase(reportId) {
    if (!reportId || !supabaseClient) return;

    console.log('[CANCEL] Deleting report from Supabase:', reportId);

    const result = await deleteReportCascade(reportId);
    if (result.success) {
        console.log('[CANCEL] Report deleted from Supabase');
    } else {
        console.error('[CANCEL] Supabase deletion errors:', result.errors);
        throw new Error('Delete cascade failed: ' + result.errors.join(', '));
    }
}

/**
 * Clear sync queue items for a specific report
 * @param {string} reportId - The report UUID
 */
function clearSyncQueueForReport(reportId) {
    if (!reportId) return;

    try {
        const queue = getStorageItem(STORAGE_KEYS.SYNC_QUEUE) || [];
        const filtered = queue.filter(item => item.reportId !== reportId);
        setStorageItem(STORAGE_KEYS.SYNC_QUEUE, filtered);
        console.log('[CANCEL] Cleared sync queue for report:', reportId);
    } catch (error) {
        console.error('[CANCEL] Error clearing sync queue:', error);
    }
}
