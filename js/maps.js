// ============================================================================
// FieldVoice Pro - Maps Overlay (maps.js)
//
// Uses:
// - ui-utils.js: getFreshLocation
// - Leaflet.js (CDN) — for satellite, topo, soils, flood, parcels, historical maps
//
// 9 Map Tabs:
// Weather Radar: Windy.com embed iframe
// Drone Airspace: FAA UAS Facility Map iframe (dark-mode filtered)
// Satellite: Leaflet + Esri World Imagery tiles
// Topo: Leaflet + USGS topo tiles
// Soils: Leaflet + Esri satellite base + USDA WMS overlay
// Flood: Leaflet + FEMA flood zone overlay
// Parcels: Leaflet + Esri satellite base + parcel viewer link
// Historical: Leaflet + Esri Wayback imagery with date selector
// Traffic: Google Maps traffic iframe
// ============================================================================

var mapsState = {
    currentMap: null,   // Leaflet map instance
    currentType: null,
    _airspaceTimeout: null,
    _airspaceLoaded: false,
    _waybackConfig: null  // cached wayback config
};

var MAP_TYPES = ['weather', 'airspace', 'satellite', 'topo', 'soils', 'flood', 'parcels', 'historical', 'traffic'];

var MAP_ICONS = {
    weather: 'fa-cloud-rain',
    airspace: 'fa-plane-up',
    satellite: 'fa-satellite',
    topo: 'fa-mountain',
    soils: 'fa-mound',
    flood: 'fa-house-flood-water',
    parcels: 'fa-vector-square',
    historical: 'fa-clock-rotate-left',
    traffic: 'fa-traffic-light'
};

var MAP_TITLES = {
    weather: 'Weather Radar',
    airspace: 'Drone Airspace',
    satellite: 'Satellite',
    topo: 'Topographic',
    soils: 'Soil Survey',
    flood: 'Flood Zones',
    parcels: 'Parcels',
    historical: 'Historical Imagery',
    traffic: 'Traffic'
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
    // Clear airspace fallback timeout
    clearAirspaceTimeout();
    // Destroy Leaflet map if active
    destroyCurrentMap();
    mapsState.currentType = null;
    // Clear container
    var wrapper = document.getElementById('mapContainer');
    if (wrapper) wrapper.innerHTML = '';
}

function destroyCurrentMap() {
    if (mapsState.currentMap) {
        mapsState.currentMap.remove();
        mapsState.currentMap = null;
    }
}

function clearAirspaceTimeout() {
    if (mapsState._airspaceTimeout) {
        clearTimeout(mapsState._airspaceTimeout);
        mapsState._airspaceTimeout = null;
    }
    mapsState._airspaceLoaded = false;
}

async function switchMap(type) {
    if (type === mapsState.currentType) return;

    // Clear airspace fallback timeout when switching tabs
    clearAirspaceTimeout();

    // Destroy existing Leaflet map
    destroyCurrentMap();

    mapsState.currentType = type;
    updateMapTabs(type);
    updateMapTitle(type);

    // Always get fresh GPS so maps reflect the user's current position
    var loc = await getFreshLocation();
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
        var darkSpinner = '<div id="mapSpinner" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,22,40,0.95);display:flex;align-items:center;justify-content:center;z-index:10;">' +
            '<div style="text-align:center;">' +
                '<i class="fas fa-circle-notch fa-spin text-3xl" style="color:#3b82f6;"></i>' +
                '<p style="margin-top:12px;font-size:12px;color:#94a3b8;font-weight:bold;">Loading FAA Airspace Map\u2026</p>' +
            '</div></div>';
        wrapper.innerHTML = darkSpinner +
            '<div id="airspaceIframeWrap" style="width:100%;height:100%;overflow:hidden;border-radius:8px;">' +
                '<iframe id="airspaceIframe" src="https://faa.maps.arcgis.com/apps/webappviewer/index.html?id=9c2e4406710048e19806ebf6a06754ad&center=' + lng + ',' + lat + '&level=12" ' +
                    'style="width:100%;height:100%;border:none;filter:invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.1);" ' +
                    'allowfullscreen onload="onAirspaceIframeLoad()"></iframe>' +
            '</div>';
        // Fallback: if iframe hasn't signaled success within 15s, show fallback card
        mapsState._airspaceTimeout = setTimeout(function() {
            if (mapsState.currentType === 'airspace' && !mapsState._airspaceLoaded) {
                showAirspaceFallback();
            }
        }, 15000);
    } else if (type === 'satellite') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        createSatelliteMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'topo') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        createTopoMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'soils') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        createSoilsMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'flood') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        createFloodMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'parcels') {
        wrapper.innerHTML = spinner + '<div id="mapView" style="width:100%;height:100%;"></div>';
        createParcelsMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'historical') {
        wrapper.innerHTML = spinner + '<div id="waybackDateRow" style="position:absolute;top:0;left:0;right:0;z-index:10;background:rgba(10,22,40,0.85);padding:8px 12px;overflow-x:auto;white-space:nowrap;-ms-overflow-style:none;scrollbar-width:none;"></div>' +
            '<div id="mapView" style="width:100%;height:100%;"></div>';
        createHistoricalMap(document.getElementById('mapView'), lat, lng);
    } else if (type === 'traffic') {
        wrapper.innerHTML = spinner + '<iframe id="trafficIframe" src="https://www.google.com/maps/@' + lat + ',' + lng + ',14z/data=!5m1!1e1" ' +
            'style="width:100%;height:100%;border:none;filter:invert(1) hue-rotate(180deg) brightness(0.9) contrast(1.1);" ' +
            'allowfullscreen onload="onTrafficIframeLoad()"></iframe>';
        // Fallback if iframe blocked after 10s
        mapsState._trafficTimeout = setTimeout(function() {
            if (mapsState.currentType === 'traffic' && !mapsState._trafficLoaded) {
                showTrafficFallback(lat, lng);
            }
        }, 10000);
        mapsState._trafficLoaded = false;
    }
}

function hideMapSpinner() {
    var spinner = document.getElementById('mapSpinner');
    if (spinner) spinner.remove();
}

function updateMapTabs(activeType) {
    for (var i = 0; i < MAP_TYPES.length; i++) {
        var t = MAP_TYPES[i];
        var tab = document.getElementById('mapTab-' + t);
        if (!tab) continue;
        if (t === activeType) {
            tab.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-white text-dot-navy font-bold shadow-sm transition-colors';
        } else {
            tab.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 bg-slate-700/50 text-slate-300 transition-colors';
        }
    }
    // Scroll active tab into view
    var activeTab = document.getElementById('mapTab-' + activeType);
    if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function updateMapTitle(type) {
    var titleEl = document.getElementById('mapTitle');
    if (titleEl) titleEl.textContent = MAP_TITLES[type] || '';
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

function setupTileErrorFallback(tileLayer, map, fallbackUrl, fallbackLabel) {
    var errorCount = 0;
    tileLayer.on('tileerror', function() {
        errorCount++;
        if (errorCount > 5) {
            tileLayer.off('tileerror');
            showMapFallbackButton(map, fallbackUrl, fallbackLabel);
        }
    });
}

function showMapFallbackButton(map, url, label) {
    var container = map.getContainer();
    var existing = container.querySelector('.map-fallback-btn');
    if (existing) return;
    var btn = document.createElement('button');
    btn.className = 'map-fallback-btn';
    btn.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:1000;background:#1e3a5f;color:white;font-weight:600;border-radius:0.5rem;padding:12px 20px;border:none;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;';
    btn.innerHTML = '<i class="fas fa-up-right-from-square"></i> ' + label;
    btn.onclick = function() { window.open(url, '_blank'); };
    container.appendChild(btn);
}

// ---- Satellite ----
function createSatelliteMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 15);
    var tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);
    tileLayer.on('load', function() { hideMapSpinner(); });
    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}

// ---- Topo ----
function createTopoMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 14);
    var tileLayer = L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; USGS',
        maxZoom: 16
    }).addTo(map);
    tileLayer.on('load', function() { hideMapSpinner(); });
    setupTileErrorFallback(tileLayer, map, 'https://ngmdb.usgs.gov/topoview/', 'View in USGS TopoView');
    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}

// ---- Soils ----
function createSoilsMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 15);

    // Esri satellite base
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    // USDA Web Soil Survey WMS overlay
    var soilLayer = L.tileLayer.wms('https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms', {
        layers: 'mapunitpoly',
        format: 'image/png',
        transparent: true,
        attribution: '&copy; USDA NRCS',
        opacity: 0.6
    }).addTo(map);

    // Track if WMS loaded successfully
    var wmsErrorCount = 0;
    soilLayer.on('tileerror', function() {
        wmsErrorCount++;
        if (wmsErrorCount > 3) {
            soilLayer.off('tileerror');
            // Remove broken layer, show fallback
            map.removeLayer(soilLayer);
            showMapFallbackButton(map, 'https://websoilsurvey.nrcs.usda.gov/app/WebSoilSurvey.aspx', 'View Soils in Browser');
        }
    });

    hideMapSpinner();
    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}

// ---- Flood ----
function createFloodMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 14);

    // Light base tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    // FEMA NFHL flood zones via ArcGIS REST export
    var femaLayer = L.tileLayer('', {
        attribution: '&copy; FEMA',
        opacity: 0.55,
        maxZoom: 19
    });

    // Override getTileUrl for FEMA REST export
    femaLayer.getTileUrl = function(coords) {
        var tileSize = 256;
        var nw = map.unproject(L.point(coords.x * tileSize, coords.y * tileSize), coords.z);
        var se = map.unproject(L.point((coords.x + 1) * tileSize, (coords.y + 1) * tileSize), coords.z);
        var bbox = se.lng < nw.lng
            ? nw.lng + ',' + se.lat + ',' + (se.lng + 360) + ',' + nw.lat
            : nw.lng + ',' + se.lat + ',' + se.lng + ',' + nw.lat;
        return 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=' + bbox +
            '&bboxSR=4326&imageSR=4326&size=256,256&format=png32&transparent=true&f=image';
    };
    femaLayer.addTo(map);

    var femaErrorCount = 0;
    femaLayer.on('tileerror', function() {
        femaErrorCount++;
        if (femaErrorCount > 5) {
            femaLayer.off('tileerror');
            map.removeLayer(femaLayer);
            showMapFallbackButton(map, 'https://msc.fema.gov/portal/search?AddressQuery=' + lat + ',' + lng, 'View Flood Map in Browser');
        }
    });

    hideMapSpinner();
    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;
}

// ---- Parcels ----
function createParcelsMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 17);

    // Esri satellite base
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    hideMapSpinner();
    addUserMarker(map, lat, lng);

    // Floating "Open Parcel Viewer" button
    var btn = document.createElement('button');
    btn.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);z-index:1000;background:#1e3a5f;color:white;font-weight:600;border-radius:0.5rem;padding:12px 20px;border:none;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;';
    btn.innerHTML = '<i class="fas fa-up-right-from-square"></i> Open Parcel Viewer';
    btn.onclick = function() {
        window.open('https://www.google.com/maps/@' + lat + ',' + lng + ',17z/data=!1m1!1e1', '_blank');
    };
    container.appendChild(btn);

    mapsState.currentMap = map;
}

// ---- Historical (Esri Wayback) ----
function createHistoricalMap(container, lat, lng) {
    var map = L.map(container).setView([lat, lng], 16);

    // Default: current Esri imagery
    var currentTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    var tileLayer = L.tileLayer(currentTileUrl, {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    tileLayer.on('load', function() { hideMapSpinner(); });
    addUserMarker(map, lat, lng);
    mapsState.currentMap = map;

    // Fetch wayback config for date pills
    var dateRow = document.getElementById('waybackDateRow');
    if (!dateRow) return;

    if (mapsState._waybackConfig) {
        renderWaybackDates(dateRow, map, tileLayer, mapsState._waybackConfig);
    } else {
        dateRow.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Loading dates\u2026</span>';
        fetch('https://s3-us-west-2.amazonaws.com/world-imagery-wayback/config/config.json')
            .then(function(r) { return r.json(); })
            .then(function(config) {
                if (mapsState.currentType !== 'historical') return;
                mapsState._waybackConfig = config;
                renderWaybackDates(dateRow, map, tileLayer, config);
            })
            .catch(function() {
                if (mapsState.currentType !== 'historical') return;
                // Fallback: link to Wayback viewer
                dateRow.innerHTML = '';
                showMapFallbackButton(map, 'https://livingatlas.arcgis.com/wayback/#active=1000&mapCenter=' + lng + ',' + lat + ',16', 'View Historical Imagery');
            });
    }
}

function renderWaybackDates(dateRow, map, tileLayer, config) {
    dateRow.innerHTML = '';
    var items = config && config.length ? config : [];
    if (!items.length) return;

    // Extract unique years with their release info
    var seen = {};
    var releases = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var date = new Date(item.itemReleasedTime);
        var year = date.getFullYear();
        if (!seen[year]) {
            seen[year] = true;
            releases.push({
                year: year,
                url: item.itemURL + '/tile/{z}/{y}/{x}'
            });
        }
    }
    // Sort newest first
    releases.sort(function(a, b) { return b.year - a.year; });

    // Add "Current" pill first
    var currentPill = document.createElement('button');
    currentPill.textContent = 'Current';
    currentPill.className = 'wayback-pill active';
    currentPill.style.cssText = 'display:inline-block;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:700;border:none;cursor:pointer;margin-right:6px;background:white;color:#0a1628;';
    currentPill.onclick = function() {
        setActiveWaybackPill(dateRow, currentPill);
        tileLayer.setUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    };
    dateRow.appendChild(currentPill);

    for (var j = 0; j < releases.length; j++) {
        (function(rel) {
            var pill = document.createElement('button');
            pill.textContent = rel.year;
            pill.style.cssText = 'display:inline-block;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;border:none;cursor:pointer;margin-right:6px;background:rgba(100,116,139,0.5);color:#cbd5e1;';
            pill.onclick = function() {
                setActiveWaybackPill(dateRow, pill);
                tileLayer.setUrl(rel.url);
            };
            dateRow.appendChild(pill);
        })(releases[j]);
    }
}

function setActiveWaybackPill(container, activePill) {
    var pills = container.querySelectorAll('button');
    for (var i = 0; i < pills.length; i++) {
        pills[i].style.background = 'rgba(100,116,139,0.5)';
        pills[i].style.color = '#cbd5e1';
        pills[i].style.fontWeight = '600';
    }
    activePill.style.background = 'white';
    activePill.style.color = '#0a1628';
    activePill.style.fontWeight = '700';
}

// ---- Traffic ----
function onTrafficIframeLoad() {
    mapsState._trafficLoaded = true;
    if (mapsState._trafficTimeout) {
        clearTimeout(mapsState._trafficTimeout);
        mapsState._trafficTimeout = null;
    }
    hideMapSpinner();
}

function showTrafficFallback(lat, lng) {
    var wrapper = document.getElementById('mapContainer');
    if (!wrapper || mapsState.currentType !== 'traffic') return;
    var url = 'https://www.google.com/maps/@' + lat + ',' + lng + ',14z/data=!5m1!1e1';
    wrapper.innerHTML =
        '<div style="width:100%;height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;">' +
            '<div style="text-align:center;padding:32px;max-width:320px;">' +
                '<i class="fas fa-traffic-light" style="font-size:48px;color:#64748b;margin-bottom:16px;display:block;"></i>' +
                '<p style="color:white;font-size:18px;font-weight:700;margin-bottom:8px;">Traffic Map Unavailable</p>' +
                '<p style="color:#94a3b8;font-size:13px;margin-bottom:24px;">The embedded Google Maps traffic view could not be loaded. Open it in your browser instead.</p>' +
                '<button onclick="window.open(\'' + url + '\',\'_blank\')" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#1e3a5f;color:white;font-weight:600;border-radius:0.5rem;padding:12px 20px;border:none;font-size:15px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);">' +
                    '<i class="fas fa-up-right-from-square"></i> View Traffic in Google Maps' +
                '</button>' +
            '</div>' +
        '</div>';
}

// ---- Airspace (existing) ----
function onAirspaceIframeLoad() {
    mapsState._airspaceLoaded = true;
    if (mapsState._airspaceTimeout) {
        clearTimeout(mapsState._airspaceTimeout);
        mapsState._airspaceTimeout = null;
    }
    hideMapSpinner();
}

function showAirspaceFallback() {
    var wrapper = document.getElementById('mapContainer');
    if (!wrapper || mapsState.currentType !== 'airspace') return;
    wrapper.innerHTML =
        '<div style="width:100%;height:100%;background:#0f172a;display:flex;align-items:center;justify-content:center;">' +
            '<div style="text-align:center;padding:32px;max-width:320px;">' +
                '<i class="fas fa-plane-circle-exclamation" style="font-size:48px;color:#64748b;margin-bottom:16px;display:block;"></i>' +
                '<p style="color:white;font-size:18px;font-weight:700;margin-bottom:8px;">FAA Airspace Map Unavailable</p>' +
                '<p style="color:#94a3b8;font-size:13px;margin-bottom:24px;">The embedded FAA map could not be loaded. Use one of these services to check airspace restrictions.</p>' +
                '<button onclick="window.open(\'https://opensky.wing.com\',\'_blank\')" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:#1e3a5f;color:white;font-weight:600;border-radius:0.5rem;padding:12px 20px;border:none;font-size:15px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-bottom:12px;">' +
                    '<i class="fas fa-up-right-from-square"></i> Check Airspace in OpenSky' +
                '</button>' +
                '<button onclick="window.open(\'https://app.aloft.ai\',\'_blank\')" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:transparent;color:#94a3b8;font-weight:600;border-radius:0.5rem;padding:12px 20px;border:1px solid #334155;font-size:15px;cursor:pointer;">' +
                    '<i class="fas fa-up-right-from-square"></i> Check Airspace in Aloft' +
                '</button>' +
            '</div>' +
        '</div>';
}
