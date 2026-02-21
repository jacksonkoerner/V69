/**
 * FieldVoice Pro v6.9 — Data Layer
 *
 * Single source of truth for all data operations.
 * All pages import from here instead of implementing their own loading logic.
 *
 * Storage Strategy:
 * - localStorage: Small flags only (active_project_id, device_id, user_id, permissions)
 * - IndexedDB: All cached data (projects, reports, photos, userProfile)
 * - Supabase: Source of truth, sync target
 *
 * Pattern: IndexedDB-first, Supabase-fallback, cache on fetch
 */

(function() {
    'use strict';

    // ========================================
    // LOGO RE-SIGN HELPER
    // ========================================

    /**
     * Re-sign a project's logo URL from its durable storage path.
     * If logoPath exists, generates a fresh signed URL (1h) and sets logoUrl.
     * If no logoPath but logoUrl starts with http, keeps it as-is (legacy).
     * Non-blocking — fails silently on error.
     * @param {Object} project - Normalized project object (mutated in place)
     */
    async function resignProjectLogo(project) {
        if (!project || !project.logoPath) return;
        try {
            var result = await supabaseClient.storage
                .from('project-logos')
                .createSignedUrl(project.logoPath, 3600);
            if (!result.error && result.data?.signedUrl) {
                project.logoUrl = result.data.signedUrl;
            }
        } catch (e) {
            console.warn('[DATA] Logo re-sign failed for', project.id, ':', e.message);
        }
    }

    // ========================================
    // PROJECTS
    // ========================================

    /**
     * Load all projects from IndexedDB only (no Supabase fallback)
     * Use refreshProjectsFromCloud() to explicitly sync from Supabase
     * @returns {Promise<Array>} Array of project objects (JS format, camelCase)
     */
    async function loadProjects() {
        // Load from IndexedDB only - NO Supabase fallback
        // Filter by org_id if available (backwards compatible: no org = load all)
        const orgId = getStorageItem(STORAGE_KEYS.ORG_ID);
        try {
            const allLocalProjects = await window.idb.getAllProjects();

            if (allLocalProjects && allLocalProjects.length > 0) {
                console.log('[DATA] Loaded projects from IndexedDB:', allLocalProjects.length);
                // Convert to JS format in case raw Supabase data was cached
                let normalized = allLocalProjects.map(p => normalizeProject(p));

                // Filter by org_id if set (backwards compatible — no org = all projects)
                if (orgId) {
                    normalized = normalized.filter(p => p.orgId === orgId || !p.orgId);
                }

                // Also cache to localStorage for report-rules.js
                const projectsMap = {};
                normalized.forEach(p => { projectsMap[p.id] = p; });
                setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);

                // Set cache timestamp if not already set
                if (!getStorageItem(STORAGE_KEYS.PROJECTS_CACHE_TS)) {
                    setStorageItem(STORAGE_KEYS.PROJECTS_CACHE_TS, Date.now());
                }

                return normalized;
            }
        } catch (e) {
            console.warn('[DATA] IndexedDB read failed:', e);
        }

        // Return empty array if IndexedDB is empty - caller should use refreshProjectsFromCloud()
        console.log('[DATA] No projects in IndexedDB');
        return [];
    }

    /**
     * Refresh projects from Supabase (explicit cloud sync with contractors)
     * Call this when user taps Refresh or on initial load when IndexedDB is empty
     * @returns {Promise<Array>} Array of project objects with contractors
     */
    async function refreshProjectsFromCloud() {
        if (!navigator.onLine) {
            console.log('[DATA] Offline, cannot refresh from cloud');
            return [];
        }

        try {
            // Fetch projects filtered by org_id if available
            // Backwards compatible: no org_id = load all projects
            const orgId = getStorageItem(STORAGE_KEYS.ORG_ID);
            let query = supabaseClient
                .from('projects')
                .select('*')
                .order('project_name');

            if (orgId) {
                query = query.eq('org_id', orgId);
            }

            const { data, error } = await query;

            if (error) throw error;

            // Convert to JS format (contractors already parsed from JSONB by fromSupabaseProject)
            const projects = (data || []).map(row => fromSupabaseProject(row));

            // Sprint 14: Re-sign logo URLs from durable paths (non-blocking, parallel)
            await Promise.allSettled(projects.map(p => resignProjectLogo(p)));

            // Clear IndexedDB projects store before caching to remove stale data
            // (e.g. projects from before org filtering)
            try {
                await window.idb.clearStore('projects');
            } catch (e) {
                console.warn('[DATA] Could not clear projects store:', e);
            }

            // Cache to IndexedDB (with contractors)
            for (const project of projects) {
                try {
                    await window.idb.saveProject(project);
                } catch (e) {
                    console.warn('[DATA] Failed to cache project:', e);
                }
            }

            // Also cache to localStorage for report-rules.js
            const projectsMap = {};
            projects.forEach(p => { projectsMap[p.id] = p; });
            setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);

            // Update cache timestamp for report-rules.js freshness check
            setStorageItem(STORAGE_KEYS.PROJECTS_CACHE_TS, Date.now());

            console.log('[DATA] Refreshed projects from Supabase:', projects.length);
            return projects;
        } catch (e) {
            console.error('[DATA] Supabase fetch failed:', e);
            throw e;
        }
    }

    // ========================================
    // NORMALIZERS (handle mixed formats)
    // ========================================

    /**
     * Normalize project object to consistent JS format
     * Handles: raw Supabase (snake_case), converted (camelCase), or mixed
     */
    function normalizeProject(p) {
        if (!p) return null;
        return {
            id: p.id,
            projectName: p.projectName || p.name || p.project_name || '',
            noabProjectNo: p.noabProjectNo || p.noab_project_no || '',
            cnoSolicitationNo: p.cnoSolicitationNo || p.cno_solicitation_no || '',
            location: p.location || '',
            primeContractor: p.primeContractor || p.prime_contractor || '',
            // v6.6.23: Add 7 missing fields for report.html compatibility
            engineer: p.engineer || '',
            noticeToProceed: p.noticeToProceed || p.notice_to_proceed || null,
            contractDuration: p.contractDuration || p.contract_duration || null,
            expectedCompletion: p.expectedCompletion || p.expected_completion || null,
            defaultStartTime: p.defaultStartTime || p.default_start_time || '',
            defaultEndTime: p.defaultEndTime || p.default_end_time || '',
            weatherDays: p.weatherDays || p.weather_days || 0,
            reportDate: p.reportDate || p.report_date || null,
            contractDayNo: p.contractDayNo || p.contract_day_no || null,
            // Existing fields
            status: p.status || 'active',
            userId: p.userId || p.user_id || '',
            logoUrl: p.logoUrl || p.logo_url || null,
            logoPath: p.logoPath || p.logo_path || null,
            logoThumbnail: p.logoThumbnail || p.logo_thumbnail || null,
            orgId: p.orgId || p.org_id || null,
            contractors: p.contractors || []
        };
    }

    // ========================================
    // USER SETTINGS
    // ========================================

    /**
     * Load user settings (IndexedDB-first, Supabase-fallback)
     * @returns {Promise<Object|null>} User settings object or null
     */
    async function loadUserSettings() {
        // Get auth_user_id from session (source of truth for identity)
        let authUserId = null;
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            authUserId = session?.user?.id;
        } catch (e) {
            console.warn('[DATA] Could not get auth session:', e);
        }

        // 1. Try IndexedDB first (keyed by auth_user_id, fallback to device_id)
        const cacheKey = authUserId || getStorageItem(STORAGE_KEYS.DEVICE_ID);
        if (cacheKey) {
            try {
                const localSettings = await window.idb.getUserProfile(cacheKey);
                if (localSettings) {
                    console.log('[DATA] Loaded user settings from IndexedDB');
                    return normalizeUserSettings(localSettings);
                }
            } catch (e) {
                console.warn('[DATA] IndexedDB read failed:', e);
            }
        }

        // 2. Check if offline or no auth
        if (!navigator.onLine) {
            console.log('[DATA] Offline, no cached user settings');
            return null;
        }
        if (!authUserId) {
            console.log('[DATA] No auth session, cannot load from Supabase');
            return null;
        }

        // 3. Fetch from Supabase by auth_user_id
        try {
            const { data, error } = await supabaseClient
                .from('user_profiles')
                .select('*')
                .eq('auth_user_id', authUserId)
                .maybeSingle();

            if (error) {
                console.warn('[DATA] Supabase user settings error:', error);
                return null;
            }

            if (!data) {
                console.log('[DATA] No user profile found for auth_user_id:', authUserId);
                return null;
            }

            // 4. Convert to JS format and cache to IndexedDB
            const settings = normalizeUserSettings(data);
            try {
                await window.idb.saveUserProfile(settings);
                console.log('[DATA] Cached user settings to IndexedDB');
            } catch (e) {
                console.warn('[DATA] Failed to cache user settings:', e);
            }

            console.log('[DATA] Loaded user settings from Supabase');
            return settings;
        } catch (e) {
            console.error('[DATA] Failed to load user settings:', e);
            return null;
        }
    }

    /**
     * Save user settings to IndexedDB
     * @param {Object} settings - User settings object
     * @returns {Promise<boolean>} Success status
     */
    async function saveUserSettings(settings) {
        const normalized = normalizeUserSettings(settings);
        if (!normalized || !normalized.deviceId) {
            console.error('[DATA] Cannot save user settings: missing deviceId');
            return false;
        }

        try {
            await window.idb.saveUserProfile(normalized);
            console.log('[DATA] User settings saved to IndexedDB');
            return true;
        } catch (e) {
            console.error('[DATA] Failed to save user settings:', e);
            return false;
        }
    }

    /**
     * Normalize user settings to consistent JS format
     */
    function normalizeUserSettings(s) {
        if (!s) return null;
        return {
            id: s.id,
            deviceId: s.deviceId || s.device_id || '',
            fullName: s.fullName || s.full_name || '',
            title: s.title || '',
            company: s.company || '',
            email: s.email || '',
            phone: s.phone || ''
        };
    }

    // ========================================
    // LOAD PROJECT BY ID (Sprint 1: project_id fix)
    // ========================================

    /**
     * Load a specific project by its ID (IndexedDB-first, Supabase-fallback).
     * Used by Field Capture and Report Editor to load the report's own project
     * instead of relying on ACTIVE_PROJECT_ID.
     * @param {string} projectId - The project UUID
     * @returns {Promise<Object|null>} Project object with contractors, or null
     */
    async function loadProjectById(projectId) {
        if (!projectId) {
            console.log('[DATA] No project ID provided to loadProjectById');
            return null;
        }

        // 1. Try IndexedDB first (fast, offline-capable)
        try {
            const localProject = await window.idb.getProject(projectId);
            if (localProject) {
                console.log('[DATA] Loaded project by ID from IndexedDB:', projectId);
                const project = normalizeProject(localProject);
                project.contractors = localProject.contractors || [];
                // Sprint 14: Re-sign logo if online and we have a path
                if (navigator.onLine) await resignProjectLogo(project);
                return project;
            }
        } catch (e) {
            console.warn('[DATA] IndexedDB read failed:', e);
        }

        // 2. If offline, can't fetch from Supabase
        if (!navigator.onLine) {
            console.log('[DATA] Offline - cannot fetch project from Supabase');
            return null;
        }

        // 3. Fallback to Supabase and cache locally
        try {
            console.log('[DATA] Project not in IndexedDB, fetching from Supabase:', projectId);
            const { data, error } = await supabaseClient
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (error || !data) {
                console.warn('[DATA] Could not fetch project from Supabase:', error);
                return null;
            }

            const normalized = fromSupabaseProject(data);
            // Sprint 14: Re-sign logo from durable path
            await resignProjectLogo(normalized);
            await window.idb.saveProject(normalized);
            console.log('[DATA] Fetched and cached project from Supabase:', projectId);
            return normalized;
        } catch (e) {
            console.error('[DATA] Supabase fallback failed:', e);
            return null;
        }
    }

    // ========================================
    // EXPORTS
    // ========================================

    window.dataLayer = {
        // Projects
        loadProjects,
        loadProjectById,
        refreshProjectsFromCloud,

        // User Settings
        loadUserSettings,
        saveUserSettings
    };

    console.log('[DATA] Data layer initialized');

})();
