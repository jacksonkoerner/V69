/**
 * FieldVoice Pro v6.6 — Data Layer
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
    // PROJECTS
    // ========================================

    /**
     * Load all projects from IndexedDB only (no Supabase fallback)
     * Use refreshProjectsFromCloud() to explicitly sync from Supabase
     * @returns {Promise<Array>} Array of project objects (JS format, camelCase)
     */
    async function loadProjects() {
        // Load from IndexedDB only - NO Supabase fallback
        // All users see all projects (no user_id filtering)
        try {
            const allLocalProjects = await window.idb.getAllProjects();

            if (allLocalProjects && allLocalProjects.length > 0) {
                console.log('[DATA] Loaded projects from IndexedDB:', allLocalProjects.length);
                // Convert to JS format in case raw Supabase data was cached
                const normalized = allLocalProjects.map(p => normalizeProject(p));

                // Also cache to localStorage for report-rules.js
                const projectsMap = {};
                normalized.forEach(p => { projectsMap[p.id] = p; });
                setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);

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
            // Fetch ALL projects (contractors + crews are in the JSONB column)
            // All users see all projects (no user_id filtering)
            const { data, error } = await supabaseClient
                .from('projects')
                .select('*')
                .order('project_name');

            if (error) throw error;

            // Convert to JS format (contractors already parsed from JSONB by fromSupabaseProject)
            const projects = (data || []).map(row => fromSupabaseProject(row));

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

            console.log('[DATA] Refreshed projects from Supabase:', projects.length);
            return projects;
        } catch (e) {
            console.error('[DATA] Supabase fetch failed:', e);
            throw e;
        }
    }

    /**
     * Load active project with contractors (IndexedDB-first, Supabase-fallback)
     * @returns {Promise<Object|null>} Project object with contractors, or null
     */
    async function loadActiveProject() {
        const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
        if (!activeId) {
            console.log('[DATA] No active project ID set');
            return null;
        }

        // 1. Try IndexedDB first (fast, offline-capable)
        try {
            const localProject = await window.idb.getProject(activeId);
            if (localProject) {
                console.log('[DATA] Loaded active project from IndexedDB:', activeId);
                const project = normalizeProject(localProject);
                // Contractors (with crews) come from JSONB — already structured
                project.contractors = localProject.contractors || [];
                return project;
            }
        } catch (e) {
            console.warn('[DATA] IndexedDB read failed:', e);
        }

        // 2. If offline, can't fetch from Supabase
        if (!navigator.onLine) {
            console.log('[DATA] Offline - cannot fetch active project from Supabase');
            return null;
        }

        // 3. Fallback to Supabase and cache locally
        try {
            console.log('[DATA] Active project not in IndexedDB, fetching from Supabase...');
            const { data, error } = await supabaseClient
                .from('projects')
                .select('*')
                .eq('id', activeId)
                .single();

            if (error || !data) {
                console.warn('[DATA] Could not fetch active project from Supabase:', error);
                return null;
            }

            // Convert from Supabase format (contractors parsed from JSONB)
            const normalized = fromSupabaseProject(data);

            await window.idb.saveProject(normalized);
            console.log('[DATA] Fetched and cached active project from Supabase:', activeId);

            return normalized;
        } catch (e) {
            console.error('[DATA] Supabase fallback failed:', e);
            return null;
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
            // Existing fields
            status: p.status || 'active',
            userId: p.userId || p.user_id || '',
            logoUrl: p.logoUrl || p.logo_url || null,
            logoThumbnail: p.logoThumbnail || p.logo_thumbnail || null,
            contractors: p.contractors || []
        };
    }

    /**
     * Normalize contractor object to consistent JS format
     */
    function normalizeContractor(c) {
        if (!c) return null;
        return {
            id: c.id,
            projectId: c.projectId || c.project_id || '',
            name: c.name || '',
            company: c.company || '',
            type: c.type || 'sub',
            status: c.status || 'active'
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
    // EXPORTS
    // ========================================

    window.dataLayer = {
        // Projects
        loadProjects,
        loadActiveProject,
        refreshProjectsFromCloud,

        // User Settings
        loadUserSettings,
        saveUserSettings
    };

    console.log('[DATA] Data layer initialized');

})();
