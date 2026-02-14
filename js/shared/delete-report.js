// ============================================================================
// js/shared/delete-report.js — Shared Supabase delete cascade
//
// Single-source cascade that deletes a report and all related data from
// Supabase.  Used by index/report-creation.js, interview/supabase.js,
// and report/delete-report.js.
// ============================================================================

/**
 * Delete a report and all related data from Supabase.
 * Runs the full cascade: photo storage → child tables → PDF storage →
 * final_reports → photos rows → parent reports row.
 *
 * Uses per-step try/catch so partial failures don't block the rest.
 * Uses .maybeSingle() on final_reports lookup (avoids 406 when no row exists).
 *
 * @param {string} reportId - The report UUID to delete
 * @returns {Promise<{success: boolean, errors: string[]}>}
 */
async function deleteReportCascade(reportId) {
    var errors = [];
    var client = supabaseClient;

    if (!reportId || !client) {
        return { success: false, errors: ['Missing reportId or supabaseClient'] };
    }

    // 1. Select photo storage paths
    var photoPaths = [];
    try {
        var photoResult = await client
            .from('photos')
            .select('storage_path')
            .eq('report_id', reportId);
        if (photoResult.data && photoResult.data.length > 0) {
            photoPaths = photoResult.data.map(function(p) { return p.storage_path; }).filter(Boolean);
        }
    } catch (e) {
        errors.push('photos select: ' + e.message);
    }

    // 2. Remove photos from storage bucket
    if (photoPaths.length > 0) {
        try {
            await client.storage.from('report-photos').remove(photoPaths);
        } catch (e) {
            errors.push('report-photos storage: ' + e.message);
        }
    }

    // 3. Delete child table rows
    var childTables = ['interview_backup', 'report_backup', 'ai_submissions'];
    for (var i = 0; i < childTables.length; i++) {
        try {
            await client.from(childTables[i]).delete().eq('report_id', reportId);
        } catch (e) {
            errors.push(childTables[i] + ': ' + e.message);
        }
    }

    // 4. Look up PDF url from reports table (Sprint 13) and legacy final_reports, remove from storage
    try {
        // New: pdf_url on reports table
        var reportResult = await client
            .from('reports')
            .select('pdf_url')
            .eq('id', reportId)
            .maybeSingle();
        var pdfUrl = reportResult.data && reportResult.data.pdf_url;

        // Legacy fallback: check final_reports if reports.pdf_url is null
        if (!pdfUrl) {
            var finalResult = await client
                .from('final_reports')
                .select('pdf_url')
                .eq('report_id', reportId)
                .maybeSingle();
            pdfUrl = finalResult.data && finalResult.data.pdf_url;
        }

        if (pdfUrl) {
            var pdfPath = pdfUrl.split('/report-pdfs/')[1];
            if (pdfPath) {
                await client.storage.from('report-pdfs').remove([decodeURIComponent(pdfPath)]);
            }
        }
    } catch (e) {
        errors.push('pdf cleanup: ' + e.message);
    }

    // 5. Delete final_reports row (legacy — table still exists but no longer written to)
    try {
        await client.from('final_reports').delete().eq('report_id', reportId);
    } catch (e) {
        errors.push('final_reports: ' + e.message);
    }

    // 6. Delete photos table rows
    try {
        await client.from('photos').delete().eq('report_id', reportId);
    } catch (e) {
        errors.push('photos delete: ' + e.message);
    }

    // 7. Delete the report itself (parent row — must be last)
    try {
        await client.from('reports').delete().eq('id', reportId);
    } catch (e) {
        errors.push('reports: ' + e.message);
    }

    return { success: errors.length === 0, errors: errors };
}

window.deleteReportCascade = deleteReportCascade;
