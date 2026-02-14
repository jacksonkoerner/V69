// FieldVoice Pro Service Worker
// Enables offline functionality for PWA
//
// CACHE_VERSION must be bumped on every deploy to bust stale caches.
// The canonical version lives in version.json at the project root.
// Update version.json first, then mirror the value here.

const CACHE_VERSION = 'v6.9.21';
const CACHE_NAME = `fieldvoice-pro-${CACHE_VERSION}`;

// Files to cache for offline use
const STATIC_ASSETS = [
    './',
    // HTML pages
    './index.html',
    './quick-interview.html',
    './report.html',
    './permissions.html',
    './permission-debug.html',
    './settings.html',
    './landing.html',
    './login.html',
    './archives.html',
    './project-config.html',
    './projects.html',
    // Core modules (js/ root)
    './js/config.js',
    './js/storage-keys.js',
    './js/indexeddb-utils.js',
    './js/data-layer.js',
    './js/supabase-utils.js',
    './js/supabase-retry.js',
    './js/ui-utils.js',
    './js/pwa-utils.js',
    './js/report-rules.js',
    './js/media-utils.js',
    './js/auth.js',
    // Shared modules
    './js/shared/delete-report.js',
    './js/shared/ai-assistant.js',
    './js/shared/realtime-sync.js',
    // Index (dashboard) modules
    './js/index/report-cards.js',
    './js/index/report-creation.js',
    './js/index/panels.js',
    './js/index/toggle-panel.js',
    './js/index/calendar.js',
    './js/index/weather.js',
    './js/index/messages.js',
    './js/index/cloud-recovery.js',
    './js/index/field-tools.js',
    './js/index/deep-links.js',
    './js/index/main.js',
    // Interview modules (consolidated in Sprint 11)
    './js/interview/state-mgmt.js',
    './js/interview/persistence.js',
    './js/interview/ui-display.js',
    './js/interview/ui-flow.js',
    './js/interview/freeform.js',
    './js/interview/guided-sections.js',
    './js/interview/contractors-personnel.js',
    './js/interview/equipment-manual.js',
    './js/interview/photos.js',
    './js/interview/finish-processing.js',
    './js/interview/main.js',
    // Report modules
    './js/report/data-loading.js',
    './js/report/original-notes.js',
    './js/report/form-fields.js',
    './js/report/autosave.js',
    './js/report/ai-refine.js',
    './js/report/preview.js',
    './js/report/pdf-generator.js',
    './js/report/submit.js',
    './js/report/delete-report.js',
    './js/report/debug.js',
    './js/report/main.js',
    // Project config modules
    './js/project-config/crud.js',
    './js/project-config/contractors.js',
    './js/project-config/form.js',
    './js/project-config/document-import.js',
    './js/project-config/main.js',
    // Field tools modules
    './js/tools/ar-measure.js',
    './js/tools/calc.js',
    './js/tools/compass.js',
    './js/tools/decibel.js',
    './js/tools/flashlight.js',
    './js/tools/level.js',
    './js/tools/maps.js',
    './js/tools/measure.js',
    './js/tools/photo-markup.js',
    './js/tools/qrscanner.js',
    './js/tools/slope.js',
    './js/tools/timer.js',
    // Page modules (single-file subfolders)
    './js/archives/main.js',
    './js/permissions/main.js',
    './js/permission-debug/main.js',
    './js/projects/main.js',
    './js/settings/main.js',
    './js/login/main.js',
    './js/landing/main.js',
    // Assets
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png',
    './icons/icon-192x192-maskable.png',
    './icons/icon-512x512-maskable.png',
    './css/output.css'
];

// External CDN assets to cache
const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// API endpoints that need special offline handling
const API_PATTERNS = [
    'api.open-meteo.com',
    'n8n',
    'webhook'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets...');
                // Cache static assets
                const staticPromise = cache.addAll(STATIC_ASSETS).catch(err => {
                    console.warn('[SW] Some static assets failed to cache:', err);
                });

                // Cache CDN assets separately (they may fail due to CORS)
                const cdnPromises = CDN_ASSETS.map(url =>
                    fetch(url, { mode: 'cors' })
                        .then(response => {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                        })
                        .catch(err => console.warn('[SW] CDN asset failed:', url, err))
                );

                return Promise.all([staticPromise, ...cdnPromises]);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('fieldvoice-pro-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
    // Navigation requests: network-first with cache fallback for offline support
    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(event.request));
        return;
    }

    const url = new URL(event.request.url);

    // Check if this is an API call that needs special handling
    const isApiCall = API_PATTERNS.some(pattern => url.href.includes(pattern));

    if (isApiCall) {
        // Network-first for API calls, with offline fallback
        event.respondWith(handleApiRequest(event.request));
        return;
    }

    // JavaScript files: network-first with cache-busting so code updates take
    // effect immediately. (cache-first was causing stale JS after deployments)
    if (url.pathname.endsWith('.js') && url.origin === self.location.origin) {
        event.respondWith(handleJsRequest(event.request));
        return;
    }

    // Cache-first for other static assets (CSS, images, fonts, icons)
    event.respondWith(handleStaticRequest(event.request));
});

// Handle static asset requests (cache-first)
async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        // Return cached version and update cache in background
        updateCacheInBackground(request);
        return cachedResponse;
    }

    // Not in cache, try network
    try {
        const networkResponse = await fetch(request);

        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        // Network failed and not in cache
        console.warn('[SW] Network request failed:', request.url);

        // Return a basic offline page for navigation requests
        if (request.mode === 'navigate') {
            const cache = await caches.open(CACHE_NAME);
            const cachedIndex = await cache.match('./index.html');
            if (cachedIndex) {
                return cachedIndex;
            }
        }

        // Return a generic error response
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Handle JS file requests (network-first, bypasses browser HTTP cache)
// This ensures code updates reach users immediately after deployment.
async function handleJsRequest(request) {
    try {
        // cache: 'no-cache' tells the browser to revalidate with the server,
        // bypassing the HTTP disk cache that was causing stale JS delivery.
        const networkResponse = await fetch(request, { cache: 'no-cache' });
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Offline: fall back to SW cache
        console.warn('[SW] JS fetch failed (offline):', request.url);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        return new Response('// Offline - JS not available', {
            status: 503,
            headers: { 'Content-Type': 'application/javascript' }
        });
    }
}

// Handle navigation requests (network-first, cache fallback, index.html last resort)
async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        // Cache successful navigations for future offline use
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.warn('[SW] Navigation failed (offline):', request.url);
        const cache = await caches.open(CACHE_NAME);
        // Try the exact cached URL first
        const cachedPage = await cache.match(request);
        if (cachedPage) {
            return cachedPage;
        }
        // Last resort: serve cached index.html
        const cachedIndex = await cache.match('./index.html');
        if (cachedIndex) {
            return cachedIndex;
        }
        return new Response('Offline - Page not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Handle API requests (network-first with offline JSON response)
async function handleApiRequest(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (error) {
        console.warn('[SW] API request failed (offline):', request.url);

        // Return a JSON error response for API calls
        const offlineResponse = {
            error: true,
            offline: true,
            message: 'You are currently offline. This action will be available when you reconnect.',
            timestamp: new Date().toISOString()
        };

        return new Response(JSON.stringify(offlineResponse), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
                'Content-Type': 'application/json',
                'X-Offline-Response': 'true'
            }
        });
    }
}

// Update cache in background (stale-while-revalidate pattern)
async function updateCacheInBackground(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response);
        }
    } catch (error) {
        // Silent fail - we already served the cached version
    }
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});
