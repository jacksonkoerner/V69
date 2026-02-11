// ============================================================================
// FieldVoice Pro - Compass Tool (compass.js)
//
// Uses DeviceOrientationEvent for heading data.
// iOS 13+ requires DeviceOrientationEvent.requestPermission().
// ============================================================================

var compassState = {
    active: false,
    heading: null,
    handler: null,
    permissionGranted: false,
    sensorTimeout: null,
    sensorReceived: false
};

function openCompass() {
    var overlay = document.getElementById('compassOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    // Hide emergency strip so it doesn't cover the overlay
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    // Check if we need permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function' &&
        !compassState.permissionGranted) {
        showCompassPermissionPrompt();
    } else {
        startCompass();
    }
}

function closeCompass() {
    var overlay = document.getElementById('compassOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    // Restore emergency strip
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    stopCompass();
}

function showCompassPermissionPrompt() {
    var display = document.getElementById('compassDisplay');
    if (!display) return;
    display.innerHTML =
        '<div class="flex flex-col items-center justify-center h-full gap-6">' +
            '<i class="fas fa-compass text-6xl text-slate-400"></i>' +
            '<p class="text-slate-400 text-sm text-center px-8">Compass requires access to your device\'s motion sensors</p>' +
            '<button onclick="requestCompassPermission()" class="px-6 py-3 bg-dot-blue text-white font-bold rounded-lg text-sm">' +
                '<i class="fas fa-lock-open mr-2"></i>Enable Compass' +
            '</button>' +
        '</div>';
}

function requestCompassPermission() {
    DeviceOrientationEvent.requestPermission()
        .then(function(response) {
            if (response === 'granted') {
                compassState.permissionGranted = true;
                startCompass();
            } else {
                var display = document.getElementById('compassDisplay');
                if (display) {
                    display.innerHTML =
                        '<div class="flex flex-col items-center justify-center h-full gap-4">' +
                            '<i class="fas fa-times-circle text-4xl text-red-400"></i>' +
                            '<p class="text-slate-400 text-sm text-center px-8">Permission denied. Enable motion sensors in Settings > Safari.</p>' +
                        '</div>';
                }
            }
        })
        .catch(function(e) {
            console.warn('[Compass] Permission request failed:', e);
        });
}

function startCompass() {
    var display = document.getElementById('compassDisplay');
    if (!display) return;

    // Build compass UI
    display.innerHTML =
        '<div class="flex flex-col items-center justify-center h-full">' +
            '<div id="compassRose" class="relative" style="width:280px;height:280px;">' +
                // Outer ring
                '<div class="absolute inset-0 rounded-full border-4 border-slate-600"></div>' +
                // Tick marks ring
                '<div class="absolute inset-2 rounded-full border-2 border-slate-700"></div>' +
                // North arrow (red triangle pointing up)
                '<div class="absolute left-1/2 top-3" style="transform:translateX(-50%);">' +
                    '<div style="width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:30px solid #ef4444;"></div>' +
                '</div>' +
                // South arrow (white triangle pointing down)
                '<div class="absolute left-1/2 bottom-3" style="transform:translateX(-50%);">' +
                    '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:24px solid #94a3b8;"></div>' +
                '</div>' +
                // Cardinal labels (counter-rotated to stay upright)
                '<span id="cardN" class="absolute top-8 left-1/2 -translate-x-1/2 text-red-500 font-bold text-xl" style="transition:transform 0.1s ease-out;">N</span>' +
                '<span id="cardS" class="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-400 font-bold text-lg" style="transition:transform 0.1s ease-out;">S</span>' +
                '<span id="cardW" class="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg" style="transition:transform 0.1s ease-out;">W</span>' +
                '<span id="cardE" class="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg" style="transition:transform 0.1s ease-out;">E</span>' +
                // Center dot
                '<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow"></div>' +
            '</div>' +
            // Heading readout
            '<div class="mt-8 text-center">' +
                '<p id="compassHeading" class="text-5xl font-bold text-white font-mono">---°</p>' +
                '<p id="compassCardinal" class="text-xl text-slate-400 mt-1 font-medium">--</p>' +
            '</div>' +
        '</div>';

    compassState.active = true;

    compassState.handler = function(event) {
        var heading = null;
        // iOS provides webkitCompassHeading
        if (event.webkitCompassHeading !== undefined) {
            heading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            // Android/other: alpha is degrees from north (reversed)
            heading = (360 - event.alpha) % 360;
        }

        if (heading !== null) {
            compassState.heading = Math.round(heading);
            updateCompassUI(compassState.heading);
        }
    };

    window.addEventListener('deviceorientation', compassState.handler, true);

    // Sensor timeout — show fallback after 5 seconds if no data received
    compassState.sensorReceived = false;
    compassState.sensorTimeout = setTimeout(function() {
        if (!compassState.sensorReceived && compassState.active) {
            var display = document.getElementById('compassDisplay');
            if (display) {
                display.innerHTML =
                    '<div class="flex flex-col items-center justify-center h-full gap-4 p-8">' +
                        '<i class="fas fa-compass text-5xl text-red-400"></i>' +
                        '<p class="text-slate-400 text-sm text-center">Orientation sensor not available on this device.</p>' +
                        '<p class="text-slate-500 text-xs text-center">Compass requires a device with a magnetometer (most phones and tablets).</p>' +
                    '</div>';
            }
        }
    }, 5000);
}

function stopCompass() {
    compassState.active = false;
    if (compassState.handler) {
        window.removeEventListener('deviceorientation', compassState.handler, true);
        compassState.handler = null;
    }
    if (compassState.sensorTimeout) {
        clearTimeout(compassState.sensorTimeout);
        compassState.sensorTimeout = null;
    }
}

function updateCompassUI(heading) {
    compassState.sensorReceived = true;

    var rose = document.getElementById('compassRose');
    if (rose) {
        rose.style.transform = 'rotate(' + (-heading) + 'deg)';
        rose.style.transition = 'transform 0.1s ease-out';
    }

    // Counter-rotate cardinal labels so they stay upright
    var labels = ['cardN', 'cardS', 'cardW', 'cardE'];
    for (var i = 0; i < labels.length; i++) {
        var el = document.getElementById(labels[i]);
        if (el) el.style.transform = 'translateX(-50%) rotate(' + heading + 'deg)';
    }
    // W and E use translateY instead of translateX
    var wEl = document.getElementById('cardW');
    if (wEl) wEl.style.transform = 'translateY(-50%) rotate(' + heading + 'deg)';
    var eEl = document.getElementById('cardE');
    if (eEl) eEl.style.transform = 'translateY(-50%) rotate(' + heading + 'deg)';

    var headingEl = document.getElementById('compassHeading');
    if (headingEl) headingEl.textContent = heading + '\u00B0';

    var cardinalEl = document.getElementById('compassCardinal');
    if (cardinalEl) cardinalEl.textContent = getCardinalDirection(heading);
}

function getCardinalDirection(deg) {
    var dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    var index = Math.round(deg / 22.5) % 16;
    return dirs[index];
}
