// ============================================================================
// FieldVoice Pro - Level / Inclinometer (level.js)
//
// Mode 1: Bubble Level — visual bubble that moves with phone tilt
// Mode 2: Inclinometer — large degree readout + gauge arc
// Uses DeviceOrientationEvent with 5-reading moving average.
// iOS 13+ requires DeviceOrientationEvent.requestPermission().
// ============================================================================

var levelState = {
    active: false,
    mode: 'bubble', // 'bubble' or 'inclinometer'
    handler: null,
    permissionGranted: false,
    locked: false,
    lockedAngle: null,
    lockedGrade: null,
    // Moving average buffers (5 readings)
    betaBuf: [],
    gammaBuf: [],
    bufSize: 5
};

function openLevel() {
    var overlay = document.getElementById('levelOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    levelState.mode = 'bubble';
    levelState.locked = false;
    levelState.lockedAngle = null;
    levelState.betaBuf = [];
    levelState.gammaBuf = [];
    startLevel();
}

function closeLevel() {
    var overlay = document.getElementById('levelOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    stopLevel();
}

function switchLevelMode(mode) {
    levelState.mode = mode;
    levelState.locked = false;
    levelState.lockedAngle = null;

    // Toggle visibility instead of re-rendering
    var bubbleView = document.getElementById('lvBubbleView');
    var incView = document.getElementById('lvIncView');
    var bubbleBtn = document.getElementById('lvBubbleBtn');
    var incBtn = document.getElementById('lvIncBtn');

    if (bubbleView && incView) {
        if (mode === 'bubble') {
            bubbleView.classList.remove('hidden');
            incView.classList.add('hidden');
        } else {
            bubbleView.classList.add('hidden');
            incView.classList.remove('hidden');
        }
    }
    if (bubbleBtn) bubbleBtn.className = 'flex-1 py-3 rounded-lg font-bold text-sm ' + (mode === 'bubble' ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500');
    if (incBtn) incBtn.className = 'flex-1 py-3 rounded-lg font-bold text-sm ' + (mode === 'inclinometer' ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500');

    // Reset lock button if switching to inclinometer
    var lockBtn = document.getElementById('lockBtn');
    if (lockBtn) {
        lockBtn.innerHTML = '<i class="fas fa-lock-open mr-2"></i>Tap to Lock';
        lockBtn.className = 'mt-6 px-8 py-3 border-2 border-slate-500 text-slate-400 font-bold rounded-lg text-sm';
    }
}

function startLevel() {
    // Check iOS permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function' &&
        !levelState.permissionGranted) {
        showLevelPermissionPrompt();
        return;
    }
    renderLevelUI();
    attachLevelListener();
}

function stopLevel() {
    levelState.active = false;
    if (levelState.handler) {
        window.removeEventListener('deviceorientation', levelState.handler, true);
        levelState.handler = null;
    }
}

function showLevelPermissionPrompt() {
    var display = document.getElementById('levelContent');
    if (!display) return;
    display.innerHTML =
        '<div class="flex flex-col items-center justify-center h-full gap-6 p-8">' +
            '<i class="fas fa-ruler-horizontal text-6xl text-slate-400"></i>' +
            '<p class="text-slate-400 text-sm text-center">Level requires access to your device\'s motion sensors</p>' +
            '<button onclick="requestLevelPermission()" class="px-6 py-3 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:44px;">' +
                '<i class="fas fa-lock-open mr-2"></i>Enable Level' +
            '</button>' +
        '</div>';
}

function requestLevelPermission() {
    DeviceOrientationEvent.requestPermission()
        .then(function(response) {
            if (response === 'granted') {
                levelState.permissionGranted = true;
                renderLevelUI();
                attachLevelListener();
            } else {
                var display = document.getElementById('levelContent');
                if (display) {
                    display.innerHTML =
                        '<div class="flex flex-col items-center justify-center h-full gap-4">' +
                            '<i class="fas fa-times-circle text-4xl text-red-400"></i>' +
                            '<p class="text-slate-400 text-sm text-center px-8">Permission denied. Enable motion sensors in Settings \u003E Safari.</p>' +
                        '</div>';
                }
            }
        })
        .catch(function(e) { console.warn('[Level] Permission failed:', e); });
}

function attachLevelListener() {
    levelState.active = true;
    levelState.handler = function(event) {
        if (!levelState.active) return;
        var beta = event.beta;   // Front-to-back tilt (-180 to 180)
        var gamma = event.gamma; // Left-to-right tilt (-90 to 90)
        if (beta === null || gamma === null) return;

        // Moving average
        levelState.betaBuf.push(beta);
        levelState.gammaBuf.push(gamma);
        if (levelState.betaBuf.length > levelState.bufSize) levelState.betaBuf.shift();
        if (levelState.gammaBuf.length > levelState.bufSize) levelState.gammaBuf.shift();

        var avgBeta = avg(levelState.betaBuf);
        var avgGamma = avg(levelState.gammaBuf);

        if (levelState.mode === 'bubble') {
            updateBubbleUI(avgBeta, avgGamma);
        } else {
            updateInclinometerUI(avgBeta, avgGamma);
        }
    };
    window.addEventListener('deviceorientation', levelState.handler, true);
}

function avg(arr) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    return arr.length ? sum / arr.length : 0;
}

// ============ RENDER ============

function renderLevelUI() {
    var content = document.getElementById('levelContent');
    if (!content) return;

    var isBubble = levelState.mode === 'bubble';

    // Mode toggle buttons
    var html = '<div class="flex gap-2 p-4 pb-0">' +
        '<button id="lvBubbleBtn" onclick="switchLevelMode(\'bubble\')" class="flex-1 py-3 rounded-lg font-bold text-sm ' +
            (isBubble ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500') + '" style="min-height:44px;">' +
            '<i class="fas fa-bullseye mr-2"></i>Bubble Level</button>' +
        '<button id="lvIncBtn" onclick="switchLevelMode(\'inclinometer\')" class="flex-1 py-3 rounded-lg font-bold text-sm ' +
            (!isBubble ? 'bg-dot-blue text-white' : 'bg-slate-100 text-slate-500') + '" style="min-height:44px;">' +
            '<i class="fas fa-gauge-high mr-2"></i>Inclinometer</button>' +
    '</div>';

    // Pre-render BOTH views, toggle visibility
    // Bubble Level view
    html += '<div id="lvBubbleView" class="flex-1 flex flex-col items-center justify-center p-4' + (isBubble ? '' : ' hidden') + '">' +
        '<div id="bubbleArea" class="relative bg-slate-800 rounded-full" style="width:260px;height:260px;">' +
            '<div class="absolute inset-0 rounded-full border-4 border-slate-600"></div>' +
            '<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-px bg-slate-600"></div>' +
            '<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-20 bg-slate-600"></div>' +
            '<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-slate-600"></div>' +
            '<div id="levelBubble" class="absolute w-10 h-10 rounded-full shadow-lg" style="top:50%;left:50%;margin-left:-20px;margin-top:-20px;background:#16a34a;transition:transform 0.1s ease-out;transform:translate(0px,0px);"></div>' +
        '</div>' +
        '<div class="mt-6 text-center">' +
            '<p id="levelStatus" class="text-2xl font-bold text-safety-green">LEVEL</p>' +
            '<div class="flex gap-6 mt-2">' +
                '<div class="text-center"><p class="text-xs text-slate-500 uppercase">X-Axis</p>' +
                    '<p id="levelX" class="text-lg font-bold text-white font-mono">0.0\u00B0</p></div>' +
                '<div class="text-center"><p class="text-xs text-slate-500 uppercase">Y-Axis</p>' +
                    '<p id="levelY" class="text-lg font-bold text-white font-mono">0.0\u00B0</p></div>' +
            '</div>' +
        '</div>' +
    '</div>';

    // Inclinometer view
    html += '<div id="lvIncView" class="flex-1 flex flex-col items-center justify-center p-4' + (!isBubble ? '' : ' hidden') + '">' +
        '<div id="gaugeArea" class="relative" style="width:280px;height:160px;">' +
            buildGaugeArc(0) +
        '</div>' +
        '<div class="mt-4 text-center">' +
            '<p id="inclineDeg" class="text-5xl font-bold text-white font-mono">0.0\u00B0</p>' +
            '<p id="inclineGrade" class="text-xl text-slate-400 mt-1 font-medium">0.0% grade</p>' +
        '</div>' +
        '<button onclick="toggleLevelLock()" id="lockBtn" class="mt-6 px-8 py-3 border-2 border-slate-500 text-slate-400 font-bold rounded-lg text-sm" style="min-height:44px;">' +
            '<i class="fas fa-lock-open mr-2"></i>Tap to Lock</button>' +
    '</div>';

    content.innerHTML = html;
}

// ============ BUBBLE LEVEL ============

function updateBubbleUI(beta, gamma) {
    var bubble = document.getElementById('levelBubble');
    var statusEl = document.getElementById('levelStatus');
    var xEl = document.getElementById('levelX');
    var yEl = document.getElementById('levelY');
    if (!bubble) return;

    // Clamp tilt to +-15 degrees mapped to full container range
    var clampedGamma = Math.max(-15, Math.min(15, gamma));
    var clampedBeta = Math.max(-15, Math.min(15, beta));

    // Map to pixel offset (container 260px, bubble 40px, max travel ~100px from center)
    var maxOffset = 100;
    var xOff = (clampedGamma / 15) * maxOffset;
    var yOff = (clampedBeta / 15) * maxOffset;

    // Use transform for smooth movement (bubble is already centered via top/left/margin)
    bubble.style.transform = 'translate(' + xOff.toFixed(1) + 'px,' + yOff.toFixed(1) + 'px)';

    var isLevel = Math.abs(gamma) < 1 && Math.abs(beta) < 1;
    bubble.style.background = isLevel ? '#16a34a' : '#3b82f6';

    if (statusEl) {
        statusEl.textContent = isLevel ? 'LEVEL' : 'TILTED';
        statusEl.className = 'text-2xl font-bold ' + (isLevel ? 'text-safety-green' : 'text-dot-yellow');
    }
    if (xEl) xEl.textContent = gamma.toFixed(1) + '\u00B0';
    if (yEl) yEl.textContent = beta.toFixed(1) + '\u00B0';
}

// ============ INCLINOMETER ============

function updateInclinometerUI(beta, gamma) {
    if (levelState.locked) return;

    // Use the larger tilt axis as the primary angle
    var angle = Math.abs(beta) > Math.abs(gamma) ? beta : gamma;
    var absAngle = Math.abs(angle);
    var grade = Math.tan(absAngle * Math.PI / 180) * 100;

    var degEl = document.getElementById('inclineDeg');
    var gradeEl = document.getElementById('inclineGrade');
    var gaugeArea = document.getElementById('gaugeArea');

    // Color coding
    var color;
    if (absAngle <= 2) color = '#16a34a';      // green
    else if (absAngle <= 5) color = '#f59e0b';  // yellow
    else if (absAngle <= 15) color = '#ea580c';  // orange
    else color = '#ef4444';                      // red

    if (degEl) {
        degEl.textContent = absAngle.toFixed(1) + '\u00B0';
        degEl.style.color = color;
    }
    if (gradeEl) gradeEl.textContent = grade.toFixed(1) + '% grade';
    if (gaugeArea) gaugeArea.innerHTML = buildGaugeArc(absAngle);
}

function buildGaugeArc(angle) {
    // SVG semicircular gauge from 0 to 45 degrees
    var clampedAngle = Math.min(angle, 45);
    var pct = clampedAngle / 45;

    // Color based on angle
    var color;
    if (angle <= 2) color = '#16a34a';
    else if (angle <= 5) color = '#f59e0b';
    else if (angle <= 15) color = '#ea580c';
    else color = '#ef4444';

    // Arc path: semicircle from left to right, needle sweeps from left (0°) by angle
    var cx = 140, cy = 150, r = 120;
    // Tick marks and needle
    var svg = '<svg viewBox="0 0 280 160" style="width:100%;height:100%;">';

    // Background arc
    svg += '<path d="M 20 150 A 120 120 0 0 1 260 150" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round"/>';

    // Colored progress arc
    // Sweep from 180° to (180° - angle*4°) since we map 0-45° to the semicircle
    var sweepDeg = pct * 180;
    var endRad = Math.PI - (sweepDeg * Math.PI / 180);
    var endX = cx + r * Math.cos(endRad);
    var endY = cy - r * Math.sin(endRad);
    var largeArc = sweepDeg > 90 ? 1 : 0;
    if (sweepDeg > 1) {
        svg += '<path d="M 20 150 A 120 120 0 ' + largeArc + ' 1 ' + endX.toFixed(1) + ' ' + endY.toFixed(1) + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round"/>';
    }

    // Tick marks at 0°, 5°, 10°, 15°, 20°, 30°, 45°
    var ticks = [0, 5, 10, 15, 20, 30, 45];
    for (var i = 0; i < ticks.length; i++) {
        var tp = ticks[i] / 45;
        var tRad = Math.PI - (tp * Math.PI);
        var tx1 = cx + (r + 10) * Math.cos(tRad);
        var ty1 = cy - (r + 10) * Math.sin(tRad);
        var tx2 = cx + (r + 20) * Math.cos(tRad);
        var ty2 = cy - (r + 20) * Math.sin(tRad);
        svg += '<line x1="' + tx1.toFixed(1) + '" y1="' + ty1.toFixed(1) + '" x2="' + tx2.toFixed(1) + '" y2="' + ty2.toFixed(1) + '" stroke="#64748b" stroke-width="2"/>';
        // Label
        var lx = cx + (r + 32) * Math.cos(tRad);
        var ly = cy - (r + 32) * Math.sin(tRad);
        svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="#94a3b8" font-size="10" font-weight="bold">' + ticks[i] + '\u00B0</text>';
    }

    // Needle
    var needleRad = Math.PI - (pct * Math.PI);
    var nx = cx + (r - 15) * Math.cos(needleRad);
    var ny = cy - (r - 15) * Math.sin(needleRad);
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>';
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="' + color + '"/>';

    svg += '</svg>';
    return svg;
}

function toggleLevelLock() {
    levelState.locked = !levelState.locked;
    var btn = document.getElementById('lockBtn');
    if (!btn) return;

    if (levelState.locked) {
        btn.innerHTML = '<i class="fas fa-lock mr-2"></i>Locked \u2014 Tap to Unlock';
        btn.className = 'mt-6 px-8 py-3 bg-dot-orange border-2 border-dot-orange text-white font-bold rounded-lg text-sm';
    } else {
        btn.innerHTML = '<i class="fas fa-lock-open mr-2"></i>Tap to Lock';
        btn.className = 'mt-6 px-8 py-3 border-2 border-slate-500 text-slate-400 font-bold rounded-lg text-sm';
    }
}
