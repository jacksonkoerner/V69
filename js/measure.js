// ============================================================================
// FieldVoice Pro - Distance Measure Tool (measure.js)
//
// Uses:
// - ui-utils.js: getLocationFromCache
// - Leaflet.js (CDN)
// ============================================================================

var measureState = {
    map: null,
    markers: [],
    polyline: null,
    polygon: null,
    labels: [],
    points: []
};

function openMeasure() {
    var overlay = document.getElementById('measureOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    // Hide emergency strip so it doesn't cover the overlay
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    var loc = getLocationFromCache();
    var lat = loc ? loc.lat : 39.8283;
    var lng = loc ? loc.lng : -98.5795;

    // Create fresh map container
    var wrapper = document.getElementById('measureMapContainer');
    if (!wrapper) return;
    wrapper.innerHTML = '<div id="measureMapView" style="width:100%;height:100%;"></div>';

    var map = L.map('measureMapView').setView([lat, lng], 17);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    }).addTo(map);

    // User location marker
    L.marker([lat, lng], {
        icon: L.divIcon({
            className: '',
            html: '<div style="width:12px;height:12px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.3);"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        })
    }).addTo(map);

    // Tap to place pins
    map.on('click', function(e) {
        addMeasurePoint(e.latlng.lat, e.latlng.lng);
    });

    measureState.map = map;
    measureState.markers = [];
    measureState.polyline = null;
    measureState.polygon = null;
    measureState.labels = [];
    measureState.points = [];

    updateMeasureTotal();
}

function closeMeasure() {
    var overlay = document.getElementById('measureOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    // Restore emergency strip
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');

    if (measureState.map) {
        measureState.map.remove();
        measureState.map = null;
    }
    measureState.markers = [];
    measureState.polyline = null;
    measureState.polygon = null;
    measureState.labels = [];
    measureState.points = [];
}

function clearMeasure() {
    if (!measureState.map) return;

    // Remove markers
    for (var i = 0; i < measureState.markers.length; i++) {
        measureState.map.removeLayer(measureState.markers[i]);
    }
    // Remove labels
    for (var j = 0; j < measureState.labels.length; j++) {
        measureState.map.removeLayer(measureState.labels[j]);
    }
    // Remove lines
    if (measureState.polyline) {
        measureState.map.removeLayer(measureState.polyline);
    }
    if (measureState.polygon) {
        measureState.map.removeLayer(measureState.polygon);
    }

    measureState.markers = [];
    measureState.polyline = null;
    measureState.polygon = null;
    measureState.labels = [];
    measureState.points = [];

    updateMeasureTotal();
}

function addMeasurePoint(lat, lng) {
    if (!measureState.map) return;

    var point = L.latLng(lat, lng);
    measureState.points.push(point);

    // Add numbered pin marker
    var pinNumber = measureState.points.length;
    var marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: '',
            html: '<div style="width:24px;height:24px;background:#ea580c;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold;">' + pinNumber + '</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(measureState.map);
    measureState.markers.push(marker);

    // Draw line segment and distance label if 2+ points
    if (measureState.points.length >= 2) {
        // Remove old polyline/polygon
        if (measureState.polyline) {
            measureState.map.removeLayer(measureState.polyline);
        }
        if (measureState.polygon) {
            measureState.map.removeLayer(measureState.polygon);
        }

        // Draw polyline
        measureState.polyline = L.polyline(measureState.points, {
            color: '#ea580c',
            weight: 3,
            opacity: 0.9,
            dashArray: '8, 6'
        }).addTo(measureState.map);

        // Add distance label for this segment
        var prev = measureState.points[measureState.points.length - 2];
        var curr = measureState.points[measureState.points.length - 1];
        var distMeters = prev.distanceTo(curr);
        var distFeet = distMeters * 3.28084;
        var labelText = distFeet >= 1000
            ? (distFeet / 5280).toFixed(2) + ' mi'
            : Math.round(distFeet) + ' ft';

        var midLat = (prev.lat + curr.lat) / 2;
        var midLng = (prev.lng + curr.lng) / 2;

        var label = L.marker([midLat, midLng], {
            icon: L.divIcon({
                className: '',
                html: '<div style="background:rgba(0,0,0,0.75);color:white;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold;white-space:nowrap;">' + labelText + '</div>',
                iconAnchor: [0, 0]
            }),
            interactive: false
        }).addTo(measureState.map);
        measureState.labels.push(label);

        // Draw polygon fill if 3+ points
        if (measureState.points.length >= 3) {
            measureState.polygon = L.polygon(measureState.points, {
                color: '#ea580c',
                weight: 0,
                fillColor: '#ea580c',
                fillOpacity: 0.15
            }).addTo(measureState.map);
        }
    }

    updateMeasureTotal();
}

function updateMeasureTotal() {
    var totalEl = document.getElementById('measureTotal');
    var areaEl = document.getElementById('measureArea');
    if (!totalEl) return;

    if (measureState.points.length < 2) {
        totalEl.textContent = 'Tap map to place pins';
        if (areaEl) areaEl.textContent = '';
        return;
    }

    // Calculate total distance
    var totalMeters = 0;
    for (var i = 1; i < measureState.points.length; i++) {
        totalMeters += measureState.points[i - 1].distanceTo(measureState.points[i]);
    }
    var totalFeet = totalMeters * 3.28084;

    var distText = totalFeet >= 5280
        ? (totalFeet / 5280).toFixed(2) + ' mi'
        : Math.round(totalFeet) + ' ft';
    totalEl.textContent = 'Total: ' + distText + ' (' + totalMeters.toFixed(1) + ' m)';

    // Calculate area if 3+ points
    if (areaEl) {
        if (measureState.points.length >= 3) {
            var areaSqM = calculatePolygonArea(measureState.points);
            var areaSqFt = areaSqM * 10.7639;
            var areaText;
            if (areaSqFt >= 43560) {
                areaText = (areaSqFt / 43560).toFixed(2) + ' acres';
            } else {
                areaText = Math.round(areaSqFt).toLocaleString() + ' sq ft';
            }
            areaEl.textContent = 'Area: ' + areaText;
        } else {
            areaEl.textContent = '';
        }
    }
}

function calculatePolygonArea(points) {
    // Shoelace formula using projected coordinates
    // Convert lat/lng to approximate meters using equirectangular projection
    if (points.length < 3) return 0;

    var refLat = points[0].lat * Math.PI / 180;
    var coords = [];
    for (var i = 0; i < points.length; i++) {
        var x = (points[i].lng - points[0].lng) * Math.PI / 180 * 6371000 * Math.cos(refLat);
        var y = (points[i].lat - points[0].lat) * Math.PI / 180 * 6371000;
        coords.push({ x: x, y: y });
    }

    var area = 0;
    for (var j = 0; j < coords.length; j++) {
        var k = (j + 1) % coords.length;
        area += coords[j].x * coords[k].y;
        area -= coords[k].x * coords[j].y;
    }

    return Math.abs(area) / 2;
}
