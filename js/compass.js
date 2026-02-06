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
    permissionGranted: false
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
                // Cardinal labels
                '<span class="absolute top-8 left-1/2 -translate-x-1/2 text-red-500 font-bold text-xl">N</span>' +
                '<span class="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-400 font-bold text-lg">S</span>' +
                '<span class="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">W</span>' +
                '<span class="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">E</span>' +
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
}

function stopCompass() {
    compassState.active = false;
    if (compassState.handler) {
        window.removeEventListener('deviceorientation', compassState.handler, true);
        compassState.handler = null;
    }
}

function updateCompassUI(heading) {
    var rose = document.getElementById('compassRose');
    if (rose) {
        rose.style.transform = 'rotate(' + (-heading) + 'deg)';
        rose.style.transition = 'transform 0.1s ease-out';
    }

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
