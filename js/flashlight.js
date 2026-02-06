// ============================================================================
// FieldVoice Pro - Flashlight (flashlight.js)
//
// Uses MediaDevices API torch constraint for rear camera flash.
// Falls back to full-white screen if torch API not supported.
// SOS and strobe modes.
// ============================================================================

var flState = {
    stream: null,
    track: null,
    torchOn: false,
    torchSupported: false,
    sosInterval: null,
    sosRunning: false,
    strobeInterval: null,
    strobeRunning: false
};

function openFlashlight() {
    var overlay = document.getElementById('flashlightOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    renderFlashlightUI();
}

function closeFlashlight() {
    var overlay = document.getElementById('flashlightOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    stopAllFlashModes();
    turnOffTorch();
    if (flState.stream) {
        flState.stream.getTracks().forEach(function(t) { t.stop(); });
        flState.stream = null;
        flState.track = null;
    }
    flState.torchSupported = false;
}

function renderFlashlightUI() {
    var content = document.getElementById('flashlightContent');
    if (!content) return;
    content.innerHTML =
        '<div id="flBg" class="flex-1 flex flex-col items-center justify-center p-6 transition-colors duration-200">' +
            // Power button
            '<button onclick="toggleFlashlight()" id="flPowerBtn" class="w-40 h-40 rounded-full border-4 border-slate-600 flex items-center justify-center mb-8 transition-all duration-200">' +
                '<i class="fas fa-power-off text-7xl text-slate-500"></i>' +
            '</button>' +
            '<p id="flStatus" class="text-sm font-bold text-slate-400 mb-8">Tap to turn on</p>' +
            // Mode buttons
            '<div class="flex gap-3 w-full max-w-xs">' +
                '<button onclick="toggleSOS()" id="flSOSBtn" class="flex-1 py-4 bg-slate-700 text-slate-300 font-bold rounded-lg text-sm" style="min-height:48px;">' +
                    '<i class="fas fa-signal mr-2"></i>SOS</button>' +
                '<button onclick="toggleStrobe()" id="flStrobeBtn" class="flex-1 py-4 bg-slate-700 text-slate-300 font-bold rounded-lg text-sm" style="min-height:48px;">' +
                    '<i class="fas fa-bolt mr-2"></i>Strobe</button>' +
            '</div>' +
            // Strobe speed slider (hidden by default)
            '<div id="flStrobeSlider" class="hidden w-full max-w-xs mt-4">' +
                '<label class="text-xs text-slate-400 uppercase block mb-1 text-center">Strobe Speed</label>' +
                '<input type="range" id="flStrobeSpeed" min="50" max="500" value="200" oninput="updateStrobeSpeed()" class="w-full fl-range-slider" style="min-height:44px;">' +
                '<div class="flex justify-between text-[10px] text-slate-500"><span>Fast</span><span>Slow</span></div>' +
            '</div>' +
            // Seizure warning (hidden by default, shown briefly on strobe activation)
            '<div id="flSeizureWarning" class="hidden w-full max-w-xs mt-4 bg-red-500/10 border border-red-400/30 rounded-lg p-3 text-center transition-opacity duration-500">' +
                '<p class="text-xs text-red-400 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>Photosensitive Seizure Warning</p>' +
                '<p class="text-[10px] text-red-400/80 mt-1">Strobe lights may trigger seizures in photosensitive individuals.</p>' +
            '</div>' +
        '</div>';
}

function toggleFlashlight() {
    if (flState.torchOn) {
        turnOffTorch();
        stopAllFlashModes();
        updateFlashlightVisual(false);
    } else {
        initTorch(function() {
            turnOnTorch();
            updateFlashlightVisual(true);
        });
    }
}

function initTorch(callback) {
    if (flState.track) {
        callback();
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
            flState.stream = stream;
            flState.track = stream.getVideoTracks()[0];
            // Check torch support
            var caps = flState.track.getCapabilities ? flState.track.getCapabilities() : {};
            flState.torchSupported = !!(caps.torch);
            callback();
        })
        .catch(function(err) {
            console.warn('[Flashlight] Camera access denied or unavailable:', err);
            flState.torchSupported = false;
            // Fallback: screen light
            callback();
        });
}

function turnOnTorch() {
    flState.torchOn = true;
    if (flState.torchSupported && flState.track) {
        flState.track.applyConstraints({ advanced: [{ torch: true }] }).catch(function() {});
    }
    // Screen fallback always active when on
    updateFlashlightVisual(true);
}

function turnOffTorch() {
    flState.torchOn = false;
    if (flState.torchSupported && flState.track) {
        flState.track.applyConstraints({ advanced: [{ torch: false }] }).catch(function() {});
    }
    updateFlashlightVisual(false);
}

function updateFlashlightVisual(on) {
    var bg = document.getElementById('flBg');
    var btn = document.getElementById('flPowerBtn');
    var status = document.getElementById('flStatus');
    if (bg) bg.style.background = on ? '#ffffff' : '';
    if (btn) {
        btn.className = on
            ? 'w-40 h-40 rounded-full border-4 border-dot-yellow flex items-center justify-center mb-8 transition-all duration-200 shadow-lg shadow-yellow-200'
            : 'w-40 h-40 rounded-full border-4 border-slate-600 flex items-center justify-center mb-8 transition-all duration-200';
        var icon = btn.querySelector('i');
        if (icon) icon.className = on ? 'fas fa-power-off text-7xl text-dot-yellow' : 'fas fa-power-off text-7xl text-slate-500';
    }
    if (status) {
        status.textContent = on ? (flState.torchSupported ? 'Torch ON' : 'Screen Light ON') : 'Tap to turn on';
        status.className = on ? 'text-sm font-bold text-slate-800 mb-8' : 'text-sm font-bold text-slate-400 mb-8';
    }
}

// ============ SOS ============

function toggleSOS() {
    if (flState.sosRunning) {
        stopAllFlashModes();
        return;
    }
    stopAllFlashModes();
    flState.sosRunning = true;
    var sosBtn = document.getElementById('flSOSBtn');
    if (sosBtn) sosBtn.className = 'flex-1 py-4 bg-red-500 text-white font-bold rounded-lg text-sm';
    var status = document.getElementById('flStatus');
    if (status) { status.textContent = 'SOS Mode'; status.className = 'text-sm font-bold text-red-500 mb-8'; }

    initTorch(function() { playSOS(); });
}

function playSOS() {
    if (!flState.sosRunning) return;
    // SOS: 3 short, 3 long, 3 short
    var pattern = [
        200, 200, 200, 200, 200, 400,  // 3 short (on, off, on, off, on, gap)
        600, 200, 600, 200, 600, 400,  // 3 long
        200, 200, 200, 200, 200, 1400  // 3 short + long pause
    ];
    var i = 0;
    function step() {
        if (!flState.sosRunning || i >= pattern.length) {
            if (flState.sosRunning) { i = 0; step(); } // Loop
            return;
        }
        var on = (i % 2 === 0);
        if (on) turnOnTorch(); else turnOffTorch();
        flState.sosInterval = setTimeout(function() { i++; step(); }, pattern[i]);
    }
    step();
}

// ============ STROBE ============

function toggleStrobe() {
    if (flState.strobeRunning) {
        stopAllFlashModes();
        return;
    }
    stopAllFlashModes();
    flState.strobeRunning = true;
    var strobeBtn = document.getElementById('flStrobeBtn');
    if (strobeBtn) strobeBtn.className = 'flex-1 py-4 bg-dot-yellow text-white font-bold rounded-lg text-sm';
    var slider = document.getElementById('flStrobeSlider');
    if (slider) slider.classList.remove('hidden');
    var status = document.getElementById('flStatus');
    if (status) { status.textContent = 'Strobe Mode'; status.className = 'text-sm font-bold text-dot-yellow mb-8'; }

    // Show seizure warning briefly
    var warn = document.getElementById('flSeizureWarning');
    if (warn) {
        warn.classList.remove('hidden');
        warn.style.opacity = '1';
        setTimeout(function() {
            warn.style.opacity = '0';
            setTimeout(function() { warn.classList.add('hidden'); warn.style.opacity = '1'; }, 500);
        }, 4000);
    }

    initTorch(function() { startStrobe(); });
}

function startStrobe() {
    var speed = parseInt(document.getElementById('flStrobeSpeed').value) || 200;
    var on = false;
    flState.strobeInterval = setInterval(function() {
        if (!flState.strobeRunning) return;
        on = !on;
        if (on) turnOnTorch(); else turnOffTorch();
    }, speed);
}

function updateStrobeSpeed() {
    if (!flState.strobeRunning) return;
    clearInterval(flState.strobeInterval);
    startStrobe();
}

function stopAllFlashModes() {
    flState.sosRunning = false;
    flState.strobeRunning = false;
    if (flState.sosInterval) { clearTimeout(flState.sosInterval); flState.sosInterval = null; }
    if (flState.strobeInterval) { clearInterval(flState.strobeInterval); flState.strobeInterval = null; }
    turnOffTorch();

    var sosBtn = document.getElementById('flSOSBtn');
    if (sosBtn) sosBtn.className = 'flex-1 py-4 bg-slate-700 text-slate-300 font-bold rounded-lg text-sm';
    var strobeBtn = document.getElementById('flStrobeBtn');
    if (strobeBtn) strobeBtn.className = 'flex-1 py-4 bg-slate-700 text-slate-300 font-bold rounded-lg text-sm';
    var slider = document.getElementById('flStrobeSlider');
    if (slider) slider.classList.add('hidden');
}
