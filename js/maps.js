// ============================================================================
// FieldVoice Pro - Maps Overlay (maps.js)
//
// Uses:
// - ui-utils.js: getLocationFromCache
// - api-keys.js: API_KEYS.OPENAIP
// - Leaflet.js (CDN)
// ============================================================================

var mapsState = {
    currentMap: null,
    currentType: null
};

function openMapsOverlay() {
    var overlay = document.getElementById('mapsOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    // Hide emergency strip so it doesn't cover the overlay
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    // Default to weather radar
    switchMap('weather');
}

function closeMapsOverlay() {
    var overlay = document.getElementById('mapsOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    // Restore emergency strip
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    if (mapsState.currentMap) {
        mapsState.currentMap.remove();
        mapsState.currentMap = null;
        mapsState.currentType = null;
    }
    // Clear container
    var wrapper = document.getElementById('mapContainer');
    if (wrapper) wrapper.innerHTML = '';
}

function switchMap(type) {
    if (type === mapsState.currentType) return;

    // Destroy existing map
    if (mapsState.currentMap) {
        mapsState.currentMap.remove();
        mapsState.currentMap = null;
    }

    mapsState.currentType = type;
    updateMapTabs(type);
    updateMapTitle(type);

    var loc = getLocationFromCache();
    var lat = loc ? loc.lat : 39.8283;
    var lng = loc ? loc.lng : -98.5795;

    // Create fresh inner div to avoid Leaflet "already initialized" error
    var wrapper = document.getElementById('mapContainer');
    if (!wrapper) return;
    wrapper.innerHTML = '<div id="mapView" style="width:100%;height:100%;"></div>';
    var container = document.getElementById('mapView');

    if (type === 'weather') createWeatherMap(container, lat, lng);
    else if (type === 'airspace') createAirspaceMap(container, lat, lng);
    else if (type === 'satellite') createSatelliteMap(container, lat, lng);
}

function updateMapTabs(activeType) {
    var icons = { weather: 'fa-cloud-rain', airspace: 'fa-plane-up', satellite: 'fa-satellite' };
    var types = ['weather', 'airspace', 'satellite'];
    for (var i = 0; i < types.length; i++) {
        var tab = document.getElementById('mapTab-' + types[i]);
        if (tab) {
            var icon = tab.querySelector('i');
            var label = tab.querySelector('span');
            if (types[i] === activeType) {
                tab.className = 'flex-1 py-2.5 flex flex-col items-center gap-0.5 bg-white text-dot-navy font-bold shadow-sm transition-colors';
                if (icon) icon.className = 'fas ' + icons[types[i]] + ' text-sm text-dot-navy';
                if (label) label.className = 'text-[10px] font-bold text-dot-navy';
            } else {
                tab.className = 'flex-1 py-2.5 flex flex-col items-center gap-0.5 bg-slate-100 text-slate-500 transition-colors';
                if (icon) icon.className = 'fas ' + icons[types[i]] + ' text-sm text-slate-400';
                if (label) label.className = 'text-[10px] font-medium text-slate-500';
            }
        }
    }
}

function updateMapTitle(type) {
    var titles = { weather: 'Weather Radar', airspace: 'Drone Airspace', satellite: 'Satellite' };
    var titleEl = document.getElementById('mapTitle');
    if (titleEl) titleEl.textContent = titles[type] || '';

    var types = ['weather', 'airspace', 'satellite'];
    for (var i = 0; i < types.length; i++) {
        var dot = document.getElementById('mapDot-' + i);
        if (dot) {
            dot.className = types[i] === type
                ? 'w-1.5 h-1.5 rounded-full bg-white'
                : 'w-1.5 h-1.5 rounded-full bg-white/40';
        }
    }
}

function addUserMarker(map, lat, lng) {
    L.marker([lat, lng], {
        icon: L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        })
    }).addTo(map);
}

// ============ MAP CREATORS ============

function createWeatherMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18
    }).addTo(map);

    addUserMarker(map, lat, lng);

    fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.radar && data.radar.past && data.radar.past.length > 0) {
                var latest = data.radar.past[data.radar.past.length - 1];
                L.tileLayer(data.host + latest.path + '/256/{z}/{x}/{y}/2/1_1.png', {
                    opacity: 0.6,
                    maxZoom: 18
                }).addTo(map);
            }
        })
        .catch(function(e) {
            console.warn('[Maps] RainViewer fetch failed:', e);
        });

    mapsState.currentMap = map;
}

function createAirspaceMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 18
    }).addTo(map);

    var apiKey = (typeof API_KEYS !== 'undefined' && API_KEYS.OPENAIP) ? API_KEYS.OPENAIP : '';
    if (apiKey) {
        L.tileLayer('https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=' + apiKey, {
            subdomains: 'abc',
            opacity: 0.7,
            minZoom: 7,
            maxZoom: 18
        }).addTo(map);
    } else {
        console.warn('[Maps] No OpenAIP API key found. Airspace overlay will not load.');
    }

    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}

function createSatelliteMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 15);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}
