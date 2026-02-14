// ============ STATE ============
let pendingUser = null; // Store user info after auth, before role pick

// ============ VIEW SWITCHING ============
function showView(view) {
    document.getElementById('signInView').classList.add('hidden');
    document.getElementById('signUpView').classList.add('hidden');
    document.getElementById('rolePickerView').classList.add('hidden');

    if (view === 'signIn') {
        document.getElementById('signInView').classList.remove('hidden');
    } else if (view === 'signUp') {
        document.getElementById('signUpView').classList.remove('hidden');
    } else if (view === 'rolePicker') {
        document.getElementById('rolePickerView').classList.remove('hidden');
    }
}

// ============ SIGN IN ============
async function handleSignIn() {
    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;
    const errorEl = document.getElementById('signInError');
    const btn = document.getElementById('signInBtn');

    errorEl.classList.add('hidden');

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password.';
        errorEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            errorEl.textContent = error.message || 'Sign in failed. Check your credentials.';
            errorEl.classList.remove('hidden');
            return;
        }

        console.log('[LOGIN] Sign in successful:', data.user.email);
        pendingUser = data.user;

        // Check if user has a profile with a role already
        const { data: profile } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .eq('auth_user_id', data.user.id)
            .maybeSingle();

        if (profile && profile.role) {
            // User already has a role — go straight to app
            localStorage.setItem(STORAGE_KEYS.AUTH_ROLE, profile.role);
            if (profile.id) {
                localStorage.setItem(STORAGE_KEYS.USER_ID, profile.id);
            }
            localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.full_name || '');
            localStorage.setItem(STORAGE_KEYS.USER_EMAIL, profile.email || '');
            localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, data.user.id);

            // Update device_id on this profile (informational, not for lookups)
            const deviceId = typeof getDeviceId === 'function' ? getDeviceId() : null;
            if (deviceId) {
                supabaseClient
                    .from('user_profiles')
                    .update({ device_id: deviceId })
                    .eq('auth_user_id', data.user.id)
                    .then(() => console.log('[LOGIN] Updated device_id on profile'));
            }

            window.location.href = 'index.html';
            return;
        }

        // Show role picker
        const displayName = profile?.full_name || data.user.email;
        document.getElementById('roleWelcomeName').textContent = `Welcome, ${displayName}`;
        showView('rolePicker');

    } catch (e) {
        console.error('[LOGIN] Sign in error:', e);
        errorEl.textContent = 'An unexpected error occurred. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
}

// ============ SIGN UP ============
async function handleSignUp() {
    const name = document.getElementById('signUpName').value.trim();
    const title = document.getElementById('signUpTitle').value.trim();
    const company = document.getElementById('signUpCompany').value.trim();
    const email = document.getElementById('signUpEmail').value.trim();
    const phone = document.getElementById('signUpPhone').value.trim();
    const password = document.getElementById('signUpPassword').value;
    const confirm = document.getElementById('signUpConfirm').value;
    const errorEl = document.getElementById('signUpError');
    const btn = document.getElementById('signUpBtn');

    errorEl.classList.add('hidden');

    // Validation
    if (!name) {
        errorEl.textContent = 'Full name is required.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (!email) {
        errorEl.textContent = 'Email is required.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (!password || password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.classList.remove('hidden');
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: name,
                    title: title,
                    company: company
                }
            }
        });

        if (error) {
            errorEl.textContent = error.message || 'Sign up failed.';
            errorEl.classList.remove('hidden');
            return;
        }

        console.log('[LOGIN] Sign up successful:', data.user.email);
        pendingUser = data.user;

        // Create user_profiles row
        const deviceId = typeof getDeviceId === 'function' ? getDeviceId() : null;
        const profileRow = {
            auth_user_id: data.user.id,
            full_name: name,
            title: title,
            company: company,
            email: email,
            phone: phone,
            updated_at: new Date().toISOString()
        };
        if (deviceId) profileRow.device_id = deviceId;

        const { data: profile, error: profileError } = await supabaseClient
            .from('user_profiles')
            .upsert(profileRow, { onConflict: 'auth_user_id' })
            .select()
            .single();

        if (profileError) {
            console.error('[LOGIN] Profile creation error:', profileError);
            // Don't block — auth succeeded, profile can be retried
        }

        if (profile && profile.id) {
            localStorage.setItem(STORAGE_KEYS.USER_ID, profile.id);
            localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.full_name || name);
            localStorage.setItem(STORAGE_KEYS.USER_EMAIL, profile.email || email);
            localStorage.setItem(STORAGE_KEYS.AUTH_USER_ID, data.user.id);
        }

        // Show role picker
        document.getElementById('roleWelcomeName').textContent = `Welcome, ${name}`;
        showView('rolePicker');

    } catch (e) {
        console.error('[LOGIN] Sign up error:', e);
        errorEl.textContent = 'An unexpected error occurred. Please try again.';
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
    }
}

// ============ ROLE SELECTION ============
async function selectRole(role) {
    if (role === 'admin') {
        // Show coming soon modal
        const modal = document.getElementById('adminModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        return;
    }

    // Store role locally
    localStorage.setItem(STORAGE_KEYS.AUTH_ROLE, role);

    // Update profile in Supabase
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            await supabaseClient
                .from('user_profiles')
                .update({ role: role })
                .eq('auth_user_id', user.id);
        }
    } catch (e) {
        console.warn('[LOGIN] Could not update role in profile:', e);
    }

    // Navigate to app
    window.location.href = 'index.html';
}

function hideAdminModal() {
    const modal = document.getElementById('adminModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ============ TOAST (minimal for login page) ============
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600',
        info: 'bg-blue-600'
    };

    const toast = document.createElement('div');
    toast.className = `${colors[type] || colors.info} text-white px-4 py-3 text-sm font-medium shadow-lg mb-2`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

// ============ INIT — check if already logged in ============
(async function checkExistingSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            console.log('[LOGIN] Already authenticated, redirecting to app');
            window.location.href = 'index.html';
        }
    } catch (e) {
        // No session, stay on login page
    }
})();

// Enter key submits forms
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const signInView = document.getElementById('signInView');
        const signUpView = document.getElementById('signUpView');
        if (!signInView.classList.contains('hidden')) {
            handleSignIn();
        } else if (!signUpView.classList.contains('hidden')) {
            handleSignUp();
        }
    }
});
