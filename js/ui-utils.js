// FieldVoice Pro - UI Utility Functions
// Shared helpers for escaping, ID generation, formatting, and notifications
// Single source of truth - do not duplicate in HTML files

/**
 * Escape HTML to prevent XSS
 * @param {string} str - Raw string
 * @returns {string} HTML-safe string
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Generate unique ID using crypto API
 * @returns {string} UUID string
 */
function generateId() {
    return crypto.randomUUID();
}

/**
 * Show toast notification
 * @param {string} message - Message to display (plain text; use innerHTML for rich content via durationMs+onClick)
 * @param {string} type - 'success', 'warning', 'error', or 'info'
 * @param {number} [durationMs=3000] - How long to show the toast
 * @param {Function} [onClick] - Optional click callback (makes toast tappable; message can include HTML)
 */
function showToast(message, type, durationMs, onClick) {
    if (type === undefined) type = 'success';
    if (!durationMs) durationMs = 3000;

    // Remove existing toast if any
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const colors = {
        success: 'bg-safety-green',
        warning: 'bg-dot-orange',
        error: 'bg-red-600',
        info: 'bg-dot-blue'
    };

    const icons = {
        success: 'fa-check',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast-msg fixed bottom-24 left-1/2 -translate-x-1/2 ${colors[type] || colors.success} text-white px-6 py-3 font-bold text-sm shadow-lg z-50 flex items-center gap-2 uppercase`;
    if (onClick) {
        toast.style.cursor = 'pointer';
        // Allow HTML in message for clickable toasts (undo link etc.)
        toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i>${message}`;
        toast.addEventListener('click', function() {
            toast.remove();
            onClick();
        });
    } else {
        toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i>${escapeHtml(message)}`;
    }
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), durationMs);
}

/**
 * Format date for display
 * @param {string} dateStr - Date string (ISO format or date-only)
 * @param {string} format - 'short' (Mon, Jan 1, 2026), 'long' (Monday, Jan 1, 2026), or 'numeric' (01/01/2026)
 * @returns {string} Formatted date string
 */
function formatDate(dateStr, format = 'short') {
    if (!dateStr) return 'Unknown date';

    // Add time component to avoid timezone issues with date-only strings
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');

    if (isNaN(date.getTime())) return dateStr;

    const options = {
        short: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
        long: { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' },
        numeric: { month: '2-digit', day: '2-digit', year: 'numeric' }
    };

    return date.toLocaleDateString('en-US', options[format] || options.short);
}

/**
 * Format date+time for display (e.g., "Jan 5, 3:30 PM")
 * @param {string} isoStr - ISO date string
 * @returns {string} Formatted date-time string
 */
function formatDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

/**
 * Format time for display
 * @param {string} timeStr - Time string (ISO format or HH:MM format)
 * @returns {string} Formatted time string (e.g., "6:00 AM")
 */
function formatTime(timeStr) {
    if (!timeStr) return '';

    // Handle already formatted time (e.g., "6:00 AM")
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
        return timeStr;
    }

    // Handle ISO format
    if (timeStr.includes('T')) {
        const date = new Date(timeStr);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    // Handle 24-hour format (e.g., "06:00")
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;

    const hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    return `${displayHours}:${minutes} ${ampm}`;
}

// ============ AUTO-EXPAND TEXTAREAS ============

/**
 * Auto-expand textarea to fit content
 * @param {HTMLTextAreaElement} textarea - The textarea element
 * @param {number} minHeight - Minimum height in pixels (default 72, ~3 lines)
 * @param {number} maxHeight - Maximum height in pixels (default 400)
 */
function autoExpand(textarea, minHeight = 72, maxHeight = 400) {
    if (!textarea) return;

    // Reset height to recalculate
    textarea.style.height = 'auto';

    // Calculate new height
    const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';

    // Toggle scrollable class based on whether content exceeds max
    if (textarea.scrollHeight > maxHeight) {
        textarea.classList.add('scrollable');
    } else {
        textarea.classList.remove('scrollable');
    }
}

/**
 * Initialize auto-expand behavior on a textarea
 * @param {HTMLTextAreaElement} textarea - The textarea element
 * @param {number} minHeight - Minimum height in pixels (default 72)
 * @param {number} maxHeight - Maximum height in pixels (default 400)
 */
function initAutoExpand(textarea, minHeight = 72, maxHeight = 400) {
    if (!textarea || textarea.dataset.autoExpandInit) return;

    textarea.dataset.autoExpandInit = 'true';

    // Add the auto-expand class if not already present
    if (!textarea.classList.contains('auto-expand')) {
        textarea.classList.add('auto-expand');
    }

    // Create bound resize function with the specified dimensions
    const resize = () => autoExpand(textarea, minHeight, maxHeight);

    // Listen for input events (typing, dictation, paste)
    textarea.addEventListener('input', resize);

    // Listen for change events (programmatic changes)
    textarea.addEventListener('change', resize);

    // On focus, expand to fit content
    textarea.addEventListener('focus', resize);

    // On blur, collapse to content size (remove empty space)
    textarea.addEventListener('blur', () => {
        // Small delay to ensure content is finalized
        setTimeout(resize, 10);
    });

    // Initial sizing
    resize();
}

/**
 * Initialize auto-expand on all textareas with .auto-expand class
 * @param {number} minHeight - Minimum height in pixels (default 72)
 * @param {number} maxHeight - Maximum height in pixels (default 400)
 */
function initAllAutoExpandTextareas(minHeight = 72, maxHeight = 400) {
    document.querySelectorAll('textarea.auto-expand').forEach(textarea => {
        initAutoExpand(textarea, minHeight, maxHeight);
    });
}

// ============ DATE UTILITIES ============

/**
 * Get local date string in YYYY-MM-DD format (timezone-safe)
 * Avoids UTC conversion issues with toISOString().split('T')[0]
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getLocalDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ============ LOCATION CACHING ============

/**
 * Get cached location from localStorage
 * @returns {{lat: number, lng: number, timestamp: number}|null} Cached location or null
 */
function getCachedLocation() {
    const granted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED);
    if (granted !== 'true') return null;

    const lat = localStorage.getItem(STORAGE_KEYS.LOC_LAT);
    const lng = localStorage.getItem(STORAGE_KEYS.LOC_LNG);
    const timestamp = localStorage.getItem(STORAGE_KEYS.LOC_TIMESTAMP);

    if (lat && lng) {
        return {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            timestamp: timestamp ? parseInt(timestamp, 10) : null
        };
    }
    return null;
}

/**
 * Cache location to localStorage
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
function cacheLocation(lat, lng) {
    localStorage.setItem(STORAGE_KEYS.LOC_LAT, lat.toString());
    localStorage.setItem(STORAGE_KEYS.LOC_LNG, lng.toString());
    localStorage.setItem(STORAGE_KEYS.LOC_TIMESTAMP, Date.now().toString());
    localStorage.setItem(STORAGE_KEYS.LOC_GRANTED, 'true');
}

/**
 * Clear cached location from localStorage
 */
function clearCachedLocation() {
    localStorage.removeItem(STORAGE_KEYS.LOC_LAT);
    localStorage.removeItem(STORAGE_KEYS.LOC_LNG);
    localStorage.removeItem(STORAGE_KEYS.LOC_TIMESTAMP);
    localStorage.removeItem(STORAGE_KEYS.LOC_GRANTED);
}

/**
 * Check if cached location is stale (older than maxAge in milliseconds)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default 1 hour)
 * @returns {boolean} True if location is stale or not cached
 */
function isLocationStale(maxAgeMs = 60 * 60 * 1000) {
    const cached = getCachedLocation();
    if (!cached || !cached.timestamp) return true;
    return (Date.now() - cached.timestamp) > maxAgeMs;
}

/**
 * Get location from cache if available and fresh
 * Does NOT prompt user - just returns cached data or null
 * @param {number} maxAgeMs - Maximum age in milliseconds (default 1 hour)
 * @returns {{lat: number, lng: number, timestamp: number}|null} Cached location or null
 */
function getLocationFromCache(maxAgeMs = 60 * 60 * 1000) {
    const cached = getCachedLocation();
    if (cached && !isLocationStale(maxAgeMs)) {
        return cached;
    }
    return null;
}

/**
 * Get fresh GPS location for any feature (weather, maps, measure, etc.).
 * Always attempts a live GPS read when permission is granted,
 * so every feature reflects the user's current position.
 * Falls back to cache only when the live read fails.
 *
 * FIX (2026-02-13): Browser permission is the real authority, not localStorage.
 * If the browser says 'granted', get GPS even if localStorage flag is missing
 * (e.g., after cache clear). localStorage LOC_GRANTED is now a hint, not a gate.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function getFreshLocation() {
    if (!navigator.geolocation) return null;

    // Check browser permission state FIRST — this is the real authority
    let browserPermissionState = 'prompt';
    if (navigator.permissions) {
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            browserPermissionState = result.state;
        } catch (e) {
            // Permissions API not available — fall through to localStorage check
        }
    }

    const localGranted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED) === 'true';

    if (browserPermissionState === 'denied') {
        // Browser explicitly denied — clear stale localStorage flag if present
        if (localGranted) clearCachedLocation();
        return null;
    }

    if (browserPermissionState === 'granted') {
        // Browser says yes — get GPS regardless of localStorage state.
        // cacheLocation() will re-set LOC_GRANTED automatically.
        return await _readGPS();
    }

    // browserPermissionState === 'prompt' (or Permissions API unavailable)
    if (localGranted) {
        // Our app previously granted — try GPS (may trigger a prompt on some browsers)
        return await _readGPS();
    }

    // No permission from browser or app — return cache if available, else null
    return getCachedLocation();
}

/**
 * Internal: read GPS position, cache result, return {lat, lng} or fall back to cache.
 */
async function _readGPS() {
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000 // accept readings up to 1 min old from the device
            });
        });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        cacheLocation(lat, lng); // also sets LOC_GRANTED = true
        console.log('[Location] Got fresh GPS position');
        return { lat, lng };
    } catch (geoError) {
        console.warn('[Location] Fresh GPS failed, falling back to cache:', geoError.message);
        if (geoError.code === 1) {
            // Permission denied at OS/browser level
            clearCachedLocation();
            return null;
        }
        // Timeout or other error — fall back to any cached location (even stale)
        return getCachedLocation();
    }
}
