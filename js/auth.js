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

    const AUTH_ROLE_KEY = 'fvp_auth_role';

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
        return localStorage.getItem(AUTH_ROLE_KEY) || 'inspector';
    }

    /**
     * Set the user role
     * @param {string} role - 'inspector' or 'admin'
     */
    function setAuthRole(role) {
        localStorage.setItem(AUTH_ROLE_KEY, role);
    }

    /**
     * Sign out the current user
     */
    async function signOut() {
        try {
            await supabaseClient.auth.signOut();
            localStorage.removeItem(AUTH_ROLE_KEY);
            console.log('[AUTH] User signed out');
            window.location.href = 'login.html';
        } catch (e) {
            console.error('[AUTH] Error signing out:', e);
            // Force redirect even on error
            window.location.href = 'login.html';
        }
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
            localStorage.setItem('fvp_user_id', data.id);
            localStorage.setItem('fvp_user_name', data.full_name || '');
            localStorage.setItem('fvp_user_email', data.email || '');
            localStorage.setItem('fvp_auth_user_id', authUserId);
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

    // Auto-run auth check on protected pages (not login.html)
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage !== 'login.html' && currentPage !== 'landing.html') {
        document.addEventListener('DOMContentLoaded', async () => {
            const session = await requireAuth();
            if (session) {
                // Inject sign-out button into header if it has a nav area
                injectSignOutButton();

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
