/**
 * Supabase Data Converters - FieldVoice Pro v6
 *
 * Converts between Supabase row format (snake_case) and JS object format (camelCase).
 * Single source of truth for all database schema mappings.
 *
 * @module supabase-utils
 */

// ============================================================================
// PROJECT CONVERTERS
// ============================================================================

/**
 * Convert Supabase project row to JS format
 *
 * DB columns: id, user_id, project_name, noab_project_no, cno_solicitation_no,
 *             location, engineer, prime_contractor, notice_to_proceed,
 *             contract_duration, expected_completion, default_start_time,
 *             default_end_time, weather_days, logo_thumbnail, logo_url,
 *             logo (legacy), status, created_at, updated_at
 *
 * NOTE: Database migration required to add logo_thumbnail and logo_url columns
 *
 * @param {Object} row - Supabase project row
 * @returns {Object} JS project object
 */
function fromSupabaseProject(row) {
    if (!row) return null;
    return {
        id: row.id,
        projectName: row.project_name || '',
        noabProjectNo: row.noab_project_no || '',
        cnoSolicitationNo: row.cno_solicitation_no || '',
        location: row.location || '',
        engineer: row.engineer || '',
        primeContractor: row.prime_contractor || '',
        noticeToProceed: row.notice_to_proceed || null,
        contractDuration: row.contract_duration || null,
        expectedCompletion: row.expected_completion || null,
        defaultStartTime: row.default_start_time || '',
        defaultEndTime: row.default_end_time || '',
        weatherDays: row.weather_days || null,
        // New logo fields
        logoThumbnail: row.logo_thumbnail || null,
        logoUrl: row.logo_url || null,
        // Legacy logo field for backwards compatibility
        logo: row.logo || null,
        status: row.status || 'active',
        userId: row.user_id || null,
        // Contractors + crews from JSONB (single table approach)
        contractors: (typeof row.contractors === 'string' ? JSON.parse(row.contractors) : row.contractors) || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

/**
 * Convert JS project object to Supabase format
 *
 * @param {Object} project - JS project object
 * @returns {Object} Supabase row format
 */
function toSupabaseProject(project) {
    if (!project) return null;
    const row = {
        project_name: project.projectName || project.name || '',
        noab_project_no: project.noabProjectNo || '',
        cno_solicitation_no: project.cnoSolicitationNo || '',
        location: project.location || '',
        engineer: project.engineer || '',
        prime_contractor: project.primeContractor || '',
        notice_to_proceed: project.noticeToProceed || null,
        contract_duration: project.contractDuration || null,
        expected_completion: project.expectedCompletion || null,
        default_start_time: project.defaultStartTime || '',
        default_end_time: project.defaultEndTime || '',
        weather_days: project.weatherDays || null,
        // New logo fields
        logo_thumbnail: project.logoThumbnail || null,
        logo_url: project.logoUrl || null,
        status: project.status || 'active',
        // Contractors + crews as JSONB blob (single table approach)
        contractors: JSON.stringify(project.contractors || [])
    };

    // Only include id if it exists (for updates/upserts)
    if (project.id) {
        row.id = project.id;
    }

    return row;
}

// ============================================================================
// USER PROFILE CONVERTERS
// ============================================================================

/**
 * Convert JS user profile to Supabase format
 */
function toSupabaseUserProfile(profile) {
    if (!profile) return null;
    const row = {
        device_id: profile.deviceId || null,
        full_name: profile.fullName || '',
        title: profile.title || '',
        company: profile.company || '',
        email: profile.email || '',
        phone: profile.phone || '',
        updated_at: new Date().toISOString()
    };

    // Include id for upserts
    if (profile.id) {
        row.id = profile.id;
    }

    return row;
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================
// Make functions globally available (loaded as regular script, not ES module)

window.fromSupabaseProject = fromSupabaseProject;
window.toSupabaseProject = toSupabaseProject;
window.toSupabaseUserProfile = toSupabaseUserProfile;
