/**
 * FieldVoice Pro v6.9 — Auth Module
 * 
 * Shared authentication module loaded on ALL pages.
 * Uses Supabase Auth for email/password authentication.
 * 
 * On page load:
 *   - Checks supabaseClient.auth.getSession()
 *   - If no session → redirect to login.html
 *   - If session exists → continue loading page
 * 
 * Provides: getCurrentUser(), signOut(), getAuthUserId()
 */

(function () {
    'use strict';

    /**
     * Check if user is authenticated. If not, redirect to login.
     * Call this on every protected page.
     */
    async function requireAuth() {
        try {
            const { data: { session }, error } = await supabaseClient.auth.getSession();

            if (error || !session) {
                console.log('[AUTH] No session found, redirecting to login');
                window.location.href = 'login.html';
                return null;
            }

            console.log('[AUTH] Session active for:', session.user.email);
            return session;
        } catch (e) {
            console.error('[AUTH] Error checking session:', e);
            window.location.href = 'login.html';
            return null;
        }
    }

    /**
     * Get the current authenticated user
     * @returns {Promise<Object|null>} The user object or null
     */
    async function getCurrentUser() {
        try {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            if (error || !user) return null;
            return user;
        } catch (e) {
            console.error('[AUTH] Error getting current user:', e);
            return null;
        }
    }

    /**
     * Get the auth user's UUID (for linking to user_profiles)
     * @returns {Promise<string|null>}
     */
    async function getAuthUserId() {
        const user = await getCurrentUser();
        return user ? user.id : null;
    }

    /**
     * Get the stored role (inspector or admin)
     * @returns {string} 'inspector' or 'admin'
     */
    function getAuthRole() {
        return localStorage.getItem(STORAGE_KEYS.AUTH_ROLE) || 'inspector';
    }

    /**
     * Set the user role
     * @param {string} role - 'inspector' or 'admin'
     */
    function setAuthRole(role) {
        localStorage.setItem(STORAGE_KEYS.AUTH_ROLE, role);
    }

    /**
     * Sign out the current user
     */
    async function signOut() {
        // Clear session check interval to prevent leaked timers (CQ-07)
        if (_sessionCheckInterval) {
            clearInterval(_sessionCheckInterval);
            _sessionCheckInterval = null;
        }

        try {
            await supabaseClient.auth.signOut();
        } catch (e) {
            console.error('[AUTH] Error signing out:', e);
        }

        // Clear ALL sensitive user data from localStorage
        // Prevents identity leakage on shared devices (enterprise-grade cleanup)
        const keysToRemove = [
            STORAGE_KEYS.AUTH_ROLE,
            STORAGE_KEYS.ORG_ID,
            STORAGE_KEYS.USER_ID,
            STORAGE_KEYS.USER_NAME,
            STORAGE_KEYS.USER_EMAIL,
            STORAGE_KEYS.AUTH_USER_ID,
            STORAGE_KEYS.CURRENT_REPORTS,
            STORAGE_KEYS.ONBOARDED,
            STORAGE_KEYS.PERMISSIONS_DISMISSED,
            STORAGE_KEYS.BANNER_DISMISSED,
            STORAGE_KEYS.BANNER_DISMISSED_DATE,
            STORAGE_KEYS.PROJECTS,
            'fvp_projects_cache_ts',
            STORAGE_KEYS.ACTIVE_PROJECT_ID
        ];
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // Clear all report drafts (fvp_report_*) to prevent data leakage
        Object.keys(localStorage)
            .filter(k => k.startsWith('fvp_report_') || k.startsWith('fvp_ai_conversation_'))
            .forEach(k => localStorage.removeItem(k));

        // Clear IndexedDB stores with user data
        if (window.idb) {
            try {
                await Promise.all([
                    window.idb.clearStore('currentReports'),
                    window.idb.clearStore('draftData'),
                    window.idb.clearStore('userProfile'),
                    window.idb.clearStore('projects')
                ]);
            } catch (e) {
                console.warn('[AUTH] Could not clear IndexedDB on sign-out:', e);
            }
        }

        console.log('[AUTH] User signed out — all user data cleared');
        window.location.href = 'login.html';
    }

    /**
     * Create or update user_profiles row linked to auth user
     * @param {Object} profileData - { fullName, title, company, email, phone }
     * @param {string} authUserId - UUID from Supabase Auth
     */
    async function upsertAuthProfile(profileData, authUserId) {
        const row = {
            auth_user_id: authUserId,
            full_name: profileData.fullName || '',
            title: profileData.title || '',
            company: profileData.company || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            updated_at: new Date().toISOString()
        };

        // Also link device_id if available
        const deviceId = typeof getDeviceId === 'function' ? getDeviceId() : null;
        if (deviceId) {
            row.device_id = deviceId;
        }

        const { data, error } = await supabaseClient
            .from('user_profiles')
            .upsert(row, { onConflict: 'auth_user_id' })
            .select()
            .single();

        if (error) {
            console.error('[AUTH] Failed to upsert profile:', error);
            throw error;
        }

        // Store profile info in localStorage (raw values, no JSON.stringify)
        if (data && data.id) {
            localStorage.setItem(STORAGE_KEYS.USER_ID, data.id);
            localStorage.setItem(STORAGE_KEYS.USER_NAME, data.full_name || '');
            localStorage.setItem(STORAGE_KEYS.USER_EMAIL, data.email || '');
            localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, authUserId);
        }

        return data;
    }

    /**
     * Load user profile by auth_user_id
     * @param {string} authUserId 
     * @returns {Promise<Object|null>}
     */
    async function loadAuthProfile(authUserId) {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('auth_user_id', authUserId)
            .maybeSingle();

        if (error) {
            console.error('[AUTH] Failed to load profile:', error);
            return null;
        }

        return data;
    }

    /**
     * Ensure org_id is cached in localStorage.
     * Fetches from user_profiles if not already cached.
     * Called on session restore (page load auth check).
     */
    async function ensureOrgIdCached(authUserId) {
        // Skip if already cached
        if (localStorage.getItem(STORAGE_KEYS.ORG_ID)) return;
        if (!authUserId) return;

        try {
            const { data: profile, error } = await supabaseClient
                .from('user_profiles')
                .select('org_id')
                .eq('auth_user_id', authUserId)
                .maybeSingle();

            if (!error && profile && profile.org_id) {
                localStorage.setItem(STORAGE_KEYS.ORG_ID, profile.org_id);
                console.log('[AUTH] Cached org_id from user profile:', profile.org_id);
            }
        } catch (e) {
            console.warn('[AUTH] Could not fetch org_id for caching:', e);
        }
    }

    // ── Session monitoring ────────────────────────────────────────────
    // Tracks whether we've already shown the expiry warning so we
    // don't spam the user with repeated toasts.
    let _sessionWarningShown = false;
    let _sessionCheckInterval = null;

    /**
     * Show a non-blocking warning that the session has expired.
     * Does NOT redirect — the user may have unsaved work.
     */
    function showSessionExpiredWarning() {
        if (_sessionWarningShown) return;
        _sessionWarningShown = true;

        if (typeof showToast === 'function') {
            showToast(
                'Your session has expired. Please save your work and sign in again.',
                'warning'
            );
        }
        console.warn('[AUTH] Session expired — user warned (no redirect)');
    }

    /**
     * Listen for Supabase auth state changes.
     *   TOKEN_REFRESHED → log (Supabase handles it)
     *   SIGNED_OUT       → clear data & redirect (same as signOut)
     *   Session gone      → warn user, don't redirect
     */
    function startAuthStateListener() {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            switch (event) {
                case 'TOKEN_REFRESHED':
                    console.log('[AUTH] Token refreshed successfully');
                    // Reset the warning flag — session is healthy again
                    _sessionWarningShown = false;
                    break;

                case 'SIGNED_OUT':
                    console.log('[AUTH] User signed out via auth state change');
                    signOut();   // handles cleanup + redirect
                    break;

                default:
                    // Any other event where session is missing → warn
                    if (!session) {
                        showSessionExpiredWarning();
                    }
                    break;
            }
        });

        console.log('[AUTH] Auth state listener started');
    }

    /**
     * Periodic session health check (every 5 min).
     * If the session is no longer valid, warn the user.
     */
    function startPeriodicSessionCheck() {
        const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

        _sessionCheckInterval = setInterval(async () => {
            try {
                const { data: { session }, error } = await supabaseClient.auth.getSession();

                if (error || !session) {
                    showSessionExpiredWarning();
                } else {
                    // Session still valid — clear any prior warning state
                    _sessionWarningShown = false;
                }
            } catch (e) {
                console.error('[AUTH] Periodic session check failed:', e);
                showSessionExpiredWarning();
            }
        }, INTERVAL_MS);

        console.log('[AUTH] Periodic session check started (every 5 min)');
    }

    // ── Page-load auth gate ────────────────────────────────────────────

    // Auto-run auth check on protected pages (not login.html)
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage !== 'login.html' && currentPage !== 'landing.html') {
        document.addEventListener('DOMContentLoaded', async () => {
            const session = await requireAuth();
            if (session) {
                // Inject sign-out button into header if it has a nav area
                injectSignOutButton();

                // Ensure org_id is cached (for org-scoped queries)
                ensureOrgIdCached(session.user.id);

                // Start session monitoring
                startAuthStateListener();
                startPeriodicSessionCheck();

                // Request persistent storage — prevents browser from evicting localStorage/IDB
                // Idempotent: safe to call every page load
                if (navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().then(granted => {
                        console.log(`[STORAGE] Persistent storage ${granted ? 'granted' : 'denied'}`);
                    });
                }
            }
        });
    }

    /**
     * Inject a small sign-out icon button into the page header
     */
    function injectSignOutButton() {
        // Look for header button area (most pages have a flex container in header with gap)
        const header = document.querySelector('header');
        if (!header) return;

        const btnContainer = header.querySelector('.flex.items-center.gap-2') || 
                             header.querySelector('.flex.justify-between .flex');
        
        if (btnContainer) {
            // Check if already injected
            if (document.getElementById('auth-signout-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'auth-signout-btn';
            btn.onclick = signOut;
            btn.title = 'Sign Out';
            btn.className = 'w-10 h-10 border border-slate-600 flex items-center justify-center text-slate-400 hover:bg-red-700 hover:text-white hover:border-red-700 transition-colors';
            btn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
            btnContainer.appendChild(btn);
        }
    }

    // Expose to window
    window.auth = {
        requireAuth,
        getCurrentUser,
        getAuthUserId,
        getAuthRole,
        setAuthRole,
        signOut,
        upsertAuthProfile,
        loadAuthProfile
    };

    console.log('[AUTH] Auth module loaded');
})();
