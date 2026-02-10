// Supabase storage functions for quick-interview
// Includes: getReport, createFreshReport, saveReportToSupabase, uploadPhotoToSupabase,
//           uploadPendingPhotos, deletePhotoFromSupabase, deleteReportFromSupabase, clearSyncQueueForReport

var IS = window.interviewState;

// ============ STORAGE (SUPABASE) ============
let saveReportTimeout = null;
let isSaving = false;

// getReportKey() removed in Task 3 — UUID-only payload

/**
 * Load report from Supabase
 * v6.6.15: Simplified - always create fresh reports
 * With the new composite report system, each session creates a new report,
 * so we don't lookup existing reports by project+date
 */
async function getReport() {
    // Clear any stale report ID - each session starts fresh
    IS.currentReportId = null;
    return createFreshReport();
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
 * @param {string} reportId - The report UUID to delete
 */
async function deleteReportFromSupabase(reportId) {
    if (!reportId || !supabaseClient) return;

    console.log('[CANCEL] Deleting report from Supabase:', reportId);

    try {
        // 1. Get photos to delete from storage
        const { data: photos } = await supabaseClient
            .from('photos')
            .select('id, storage_path')
            .eq('report_id', reportId);

        // 2. Delete photos from storage bucket
        if (photos && photos.length > 0) {
            const storagePaths = photos.map(p => p.storage_path).filter(Boolean);
            if (storagePaths.length > 0) {
                await supabaseClient.storage
                    .from('report-photos')
                    .remove(storagePaths);
            }
        }

        // 3. Delete from photos table
        await supabaseClient
            .from('photos')
            .delete()
            .eq('report_id', reportId);

        // 4. Delete from interview_backup
        await supabaseClient
            .from('interview_backup')
            .delete()
            .eq('report_id', reportId);

        // 5. Delete from ai_submissions
        await supabaseClient
            .from('ai_submissions')
            .delete()
            .eq('report_id', reportId);

        // 6. Delete from report_backup
        await supabaseClient
            .from('report_backup')
            .delete()
            .eq('report_id', reportId);

        // 7. Delete PDF from storage bucket (if submitted)
        try {
            const { data: finalData } = await supabaseClient
                .from('final_reports')
                .select('pdf_url')
                .eq('report_id', reportId)
                .single();
            if (finalData?.pdf_url) {
                const pdfPath = finalData.pdf_url.split('/report-pdfs/')[1];
                if (pdfPath) {
                    await supabaseClient.storage.from('report-pdfs').remove([decodeURIComponent(pdfPath)]);
                }
            }
        } catch (e) { /* no final_reports row = no PDF to clean */ }

        // 8. Delete from final_reports
        await supabaseClient
            .from('final_reports')
            .delete()
            .eq('report_id', reportId);

        // 9. Delete from reports (last, as it's the parent)
        await supabaseClient
            .from('reports')
            .delete()
            .eq('id', reportId);

        console.log('[CANCEL] Report deleted from Supabase');

    } catch (error) {
        console.error('[CANCEL] Supabase deletion error:', error);
        throw error;
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
