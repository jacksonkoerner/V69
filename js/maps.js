// ============================================================================
// FieldVoice Pro - Maps Overlay (maps.js)
//
// Uses:
// - ui-utils.js: getLocationFromCache
// - Leaflet.js (CDN) — airspace & satellite maps
//
// Weather Radar: Windy.com embed iframe
// Drone Airspace: Custom Leaflet map with airports, restricted zones, NPS
// Satellite: Leaflet + Esri World Imagery tiles
// ============================================================================

var mapsState = {
    currentMap: null,       // Leaflet map instance
    currentType: null,
    airspaceWatchId: null   // GPS watchPosition ID for airspace live tracking
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
    // Clear GPS watcher
    clearAirspaceWatch();
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

function clearAirspaceWatch() {
    if (mapsState.airspaceWatchId !== null) {
        navigator.geolocation.clearWatch(mapsState.airspaceWatchId);
        mapsState.airspaceWatchId = null;
    }
}

function switchMap(type) {
    if (type === mapsState.currentType) return;

    // Clear GPS watcher when leaving airspace tab
    clearAirspaceWatch();

    // Destroy existing Leaflet map if one is active
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
        var darkSpinner = '<div id="mapSpinner" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,22,40,0.95);display:flex;align-items:center;justify-content:center;z-index:10;">' +
            '<div style="text-align:center;">' +
                '<i class="fas fa-circle-notch fa-spin text-3xl" style="color:#3b82f6;"></i>' +
                '<p style="margin-top:12px;font-size:12px;color:#94a3b8;font-weight:bold;">Loading airspace map\u2026</p>' +
            '</div></div>';
        wrapper.innerHTML = darkSpinner +
            '<div id="airspaceMapView" style="width:100%;height:100%;"></div>' +
            '<div style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);z-index:1000;">' +
                '<button onclick="openFullAirspaceCheck()" style="background:#1e3a5f;color:white;font-weight:600;border-radius:0.5rem;padding:12px 24px;border:none;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;gap:8px;">' +
                    '<i class="fas fa-external-link"></i> Open Full Airspace Check' +
                '</button>' +
            '</div>';
        createAirspaceMap(document.getElementById('airspaceMapView'), lat, lng);
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

// ============ AIRSPACE MAP ============

function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 3958.8; // Earth radius in miles
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

function fetchAirports(lat, lng, map) {
    var cacheKey = 'fvp_airportsCSV';
    var cached = null;
    try { cached = sessionStorage.getItem(cacheKey); } catch (e) { /* ignore */ }

    if (cached) {
        processAirports(cached, lat, lng, map);
        return;
    }

    fetch('https://ourairports.com/data/airports.csv')
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        })
        .then(function(csvText) {
            try { sessionStorage.setItem(cacheKey, csvText); } catch (e) {
                console.warn('Could not cache airports CSV in sessionStorage:', e.message);
            }
            processAirports(csvText, lat, lng, map);
        })
        .catch(function(err) {
            console.warn('Failed to fetch airport data:', err.message);
        });
}

function processAirports(csvText, userLat, userLng, map) {
    var lines = csvText.split('\n');
    if (lines.length < 2) return;

    var validTypes = { large_airport: 1, medium_airport: 1, small_airport: 1 };
    var colors = { large_airport: '#ef4444', medium_airport: '#f97316', small_airport: '#eab308' };
    var radii = { large_airport: 7, medium_airport: 5, small_airport: 4 };
    var typeLabels = { large_airport: 'Large Airport', medium_airport: 'Medium Airport', small_airport: 'Small Airport' };

    // Rough bounding box for pre-filter (~55 miles buffer)
    var latRange = 55 / 69;
    var lngRange = 55 / (69 * Math.cos(userLat * Math.PI / 180));
    var minLat = userLat - latRange;
    var maxLat = userLat + latRange;
    var minLng = userLng - lngRange;
    var maxLng = userLng + lngRange;

    // Parse header to find column indices
    var headers = parseCSVLine(lines[0]);
    var typeIdx = headers.indexOf('type');
    var nameIdx = headers.indexOf('name');
    var latIdx = headers.indexOf('latitude_deg');
    var lngIdx = headers.indexOf('longitude_deg');
    var identIdx = headers.indexOf('ident');

    if (typeIdx === -1 || latIdx === -1 || lngIdx === -1) {
        console.warn('Airport CSV has unexpected format');
        return;
    }

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (!line || line.indexOf('_airport') === -1) continue;

        var fields = parseCSVLine(line);
        var type = fields[typeIdx];
        if (!validTypes[type]) continue;

        var aptLat = parseFloat(fields[latIdx]);
        var aptLng = parseFloat(fields[lngIdx]);
        if (isNaN(aptLat) || isNaN(aptLng)) continue;

        // Bounding box pre-filter
        if (aptLat < minLat || aptLat > maxLat || aptLng < minLng || aptLng > maxLng) continue;

        // Precise distance check
        if (haversineDistance(userLat, userLng, aptLat, aptLng) > 50) continue;

        var name = fields[nameIdx] || 'Unknown';
        var ident = fields[identIdx] || 'N/A';

        L.circleMarker([aptLat, aptLng], {
            radius: radii[type],
            fillColor: colors[type],
            color: colors[type],
            weight: 1,
            opacity: 0.9,
            fillOpacity: 0.8
        }).bindPopup(
            '<div style="font-size:13px;">' +
                '<strong>' + name + '</strong><br>' +
                '<span style="color:#64748b;">ICAO: ' + ident + '</span><br>' +
                '<span style="color:#64748b;">' + typeLabels[type] + '</span>' +
            '</div>'
        ).addTo(map);
    }
}

function fetchFAAairspace(lat, lng, map) {
    // Build bounding box (~60 miles buffer in each direction)
    var degOffset = 60 / 69;
    var lngOffset = 60 / (69 * Math.cos(lat * Math.PI / 180));
    var bbox = (lng - lngOffset) + ',' + (lat - degOffset) + ',' + (lng + lngOffset) + ',' + (lat + degOffset);

    var baseParams = '?f=geojson&where=1%3D1&outFields=*' +
        '&geometry=' + encodeURIComponent(bbox) +
        '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326';

    // Prohibited areas (red)
    fetch('https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0/query' + baseParams)
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(geojson) {
            if (geojson && geojson.features && geojson.features.length > 0) {
                L.geoJSON(geojson, {
                    style: function() {
                        return { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.25, weight: 2 };
                    },
                    onEachFeature: function(feature, layer) {
                        var p = feature.properties || {};
                        var name = p.NAME || p.name || p.DESIGNATOR || 'Prohibited Area';
                        layer.bindPopup('<strong>' + name + '</strong><br><span style="color:#ef4444;">Prohibited Airspace</span>');
                    }
                }).addTo(map);
            }
        })
        .catch(function(err) {
            console.warn('Prohibited airspace layer unavailable:', err.message);
        });

    // Restricted areas (orange)
    fetch('https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Restricted_Areas/FeatureServer/0/query' + baseParams)
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(geojson) {
            if (geojson && geojson.features && geojson.features.length > 0) {
                L.geoJSON(geojson, {
                    style: function() {
                        return { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.2, weight: 2 };
                    },
                    onEachFeature: function(feature, layer) {
                        var p = feature.properties || {};
                        var name = p.NAME || p.name || p.DESIGNATOR || 'Restricted Area';
                        layer.bindPopup('<strong>' + name + '</strong><br><span style="color:#f97316;">Restricted Airspace</span>');
                    }
                }).addTo(map);
            }
        })
        .catch(function(err) {
            console.warn('Restricted airspace layer unavailable:', err.message);
        });
}

function fetchNPSboundaries(lat, lng, map) {
    var degOffset = 60 / 69;
    var lngOffset = 60 / (69 * Math.cos(lat * Math.PI / 180));
    var bbox = (lng - lngOffset) + ',' + (lat - degOffset) + ',' + (lng + lngOffset) + ',' + (lat + degOffset);

    var url = 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2/query' +
        '?f=geojson&where=1%3D1&outFields=UNIT_NAME,UNIT_TYPE' +
        '&geometry=' + encodeURIComponent(bbox) +
        '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326';

    fetch(url)
        .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(geojson) {
            if (geojson && geojson.features && geojson.features.length > 0) {
                L.geoJSON(geojson, {
                    style: function() {
                        return { color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.2, weight: 2 };
                    },
                    onEachFeature: function(feature, layer) {
                        var p = feature.properties || {};
                        var name = p.UNIT_NAME || p.unit_name || 'National Park';
                        layer.bindPopup('<strong>' + name + '</strong><br><span style="color:#16a34a;">National Park (No-Fly Zone)</span>');
                    }
                }).addTo(map);
            }
        })
        .catch(function(err) {
            console.warn('NPS boundary layer unavailable:', err.message);
        });
}

function createAirspaceMap(container, lat, lng) {
    var map = L.map(container, { zoomControl: true }).setView([lat, lng], 11);

    // CartoDB Dark Matter base tiles
    var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    tileLayer.on('load', function() { hideMapSpinner(); });

    // Pulsing blue dot user marker
    var userMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: '',
            html: '<div class="airspace-user-dot"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        }),
        zIndexOffset: 1000
    }).addTo(map);

    // Live GPS tracking
    if (navigator.geolocation) {
        mapsState.airspaceWatchId = navigator.geolocation.watchPosition(
            function(position) {
                var newLat = position.coords.latitude;
                var newLng = position.coords.longitude;
                userMarker.setLatLng([newLat, newLng]);
            },
            function(err) {
                console.warn('GPS tracking error:', err.message);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }

    // Fetch data layers — all with graceful fallback
    fetchAirports(lat, lng, map);
    fetchFAAairspace(lat, lng, map);
    fetchNPSboundaries(lat, lng, map);

    // Airport legend (bottom-left)
    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function() {
        var div = L.DomUtil.create('div', 'airspace-legend');
        div.innerHTML =
            '<div style="background:rgba(15,23,42,0.9);color:white;padding:10px 12px;border-radius:8px;font-size:11px;line-height:1.8;">' +
                '<div style="font-weight:bold;margin-bottom:2px;font-size:12px;">Airports</div>' +
                '<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ef4444;"></span> Large</div>' +
                '<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f97316;"></span> Medium</div>' +
                '<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#eab308;"></span> Small</div>' +
            '</div>';
        return div;
    };
    legend.addTo(map);

    mapsState.currentMap = map;
}

function openFullAirspaceCheck() {
    var loc = getLocationFromCache();
    var lat = loc ? loc.lat : 39.8283;
    var lng = loc ? loc.lng : -98.5795;
    window.open('https://opensky.wing.com/?lat=' + lat + '&lng=' + lng, '_blank');
}
