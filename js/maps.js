// ============================================================================
// FieldVoice Pro - Maps Overlay (maps.js)
//
// Uses:
// - ui-utils.js: getLocationFromCache
// - Leaflet.js (CDN) — satellite map only
//
// Weather Radar: Windy.com embed iframe
// Drone Airspace: FAA UAS Facility Map iframe
// Satellite: Leaflet + Esri World Imagery tiles
// ============================================================================

var mapsState = {
    currentMap: null,   // Leaflet map instance (satellite only)
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
    // Destroy Leaflet map if active
    if (mapsState.currentMap) {
        mapsState.currentMap.remove();
        mapsState.currentMap = null;
    }
    mapsState.currentType = null;
    // Clear container
    var wrapper = document.getElementById('mapContainer');
    if (wrapper) wrapper.innerHTML = '';
}

function switchMap(type) {
    if (type === mapsState.currentType) return;

    // Destroy existing Leaflet map if one is active (satellite)
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

    var wrapper = document.getElementById('mapContainer');
    if (!wrapper) return;

    // Loading spinner HTML
    var spinner = '<div id="mapSpinner" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;z-index:10;">' +
        '<div style="text-align:center;">' +
            '<i class="fas fa-circle-notch fa-spin text-3xl text-dot-blue"></i>' +
            '<p style="margin-top:12px;font-size:12px;color:#64748b;font-weight:bold;">Loading map\u2026</p>' +
        '</div></div>';

    if (type === 'weather') {
        wrapper.innerHTML = spinner + '<iframe src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=%C2%B0F&metricWind=mph&zoom=9&overlay=radar&product=radar&level=surface&lat=' + lat + '&lon=' + lng + '" style="width:100%;height:100%;border:none;" allowfullscreen onload="hideMapSpinner()"></iframe>';
    } else if (type === 'airspace') {
        wrapper.innerHTML = spinner + '<iframe src="https://faa.maps.arcgis.com/apps/webappviewer/index.html?id=9c2e4f7b9c264f9c96f8d8e89eb0ceb3&center=' + lng + ',' + lat + '&level=12" style="width:100%;height:100%;border:none;" allowfullscreen onload="hideMapSpinner()"></iframe>';
    } else if (type === 'satellite') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        var container = document.getElementById('mapView');
        createSatelliteMap(container, lat, lng);
    }
}

function hideMapSpinner() {
    var spinner = document.getElementById('mapSpinner');
    if (spinner) spinner.remove();
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

// ============ MAP CREATORS ============

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

function createSatelliteMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 15);

    var tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    // Hide spinner once initial tiles have loaded
    tileLayer.on('load', function() { hideMapSpinner(); });

    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}
