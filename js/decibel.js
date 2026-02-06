// ============================================================================
// FieldVoice Pro - Decibel Meter (decibel.js)
//
// Uses navigator.mediaDevices.getUserMedia + AudioContext + AnalyserNode
// to measure approximate dB SPL from microphone input.
// ============================================================================

var dbState = {
    audioCtx: null,
    analyser: null,
    stream: null,
    source: null,
    animFrame: null,
    monitoring: false,
    min: Infinity,
    max: -Infinity,
    sum: 0,
    count: 0,
    lastFrameTime: 0
};

function openDecibel() {
    var overlay = document.getElementById('decibelOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    renderDecibelUI();
}

function closeDecibel() {
    var overlay = document.getElementById('decibelOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    stopDecibel();
}

function renderDecibelUI() {
    var content = document.getElementById('decibelContent');
    if (!content) return;
    content.innerHTML =
        '<div class="flex-1 flex flex-col items-center justify-center p-6">' +
            '<div id="dbDisplay" class="w-full max-w-xs">' +
                // Main reading
                '<div id="dbBg" class="rounded-2xl p-8 text-center mb-6 bg-safety-green/10 border-2 border-safety-green/30 transition-colors duration-300">' +
                    '<p id="dbValue" class="text-6xl font-bold text-slate-800 font-mono">--</p>' +
                    '<p class="text-xs text-slate-500 uppercase mt-1">dB SPL</p>' +
                    '<p id="dbLabel" class="text-sm font-bold mt-2 text-safety-green">Ready</p>' +
                '</div>' +
                // Vertical meter
                '<div class="flex gap-4 mb-6">' +
                    '<div class="flex-1">' +
                        '<div class="relative bg-slate-200 rounded-full h-6 overflow-hidden">' +
                            // OSHA reference line at 85dB — 85/130 ≈ 65.4%
                            '<div class="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style="left:65.4%;"></div>' +
                            '<div id="dbBar" class="absolute top-0 left-0 bottom-0 rounded-full bg-safety-green transition-all duration-150" style="width:0%;"></div>' +
                        '</div>' +
                        '<div class="flex justify-between mt-1">' +
                            '<span class="text-[9px] text-slate-400">30</span>' +
                            '<span class="text-[9px] text-red-400 font-bold">85 OSHA</span>' +
                            '<span class="text-[9px] text-slate-400">130</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                // Stats
                '<div class="grid grid-cols-3 gap-3 mb-6">' +
                    '<div class="bg-white rounded-lg border border-slate-200 p-3 text-center">' +
                        '<p class="text-[10px] text-slate-400 uppercase">Min</p>' +
                        '<p id="dbMin" class="text-lg font-bold text-slate-800 font-mono">--</p>' +
                    '</div>' +
                    '<div class="bg-white rounded-lg border border-slate-200 p-3 text-center">' +
                        '<p class="text-[10px] text-slate-400 uppercase">Max</p>' +
                        '<p id="dbMax" class="text-lg font-bold text-slate-800 font-mono">--</p>' +
                    '</div>' +
                    '<div class="bg-white rounded-lg border border-slate-200 p-3 text-center">' +
                        '<p class="text-[10px] text-slate-400 uppercase">Avg</p>' +
                        '<p id="dbAvg" class="text-lg font-bold text-slate-800 font-mono">--</p>' +
                    '</div>' +
                '</div>' +
                // Buttons
                '<div class="flex gap-3 mb-4">' +
                    '<button id="dbStartBtn" onclick="startDecibel()" class="flex-1 py-4 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:48px;">' +
                        '<i class="fas fa-microphone mr-2"></i>Start Monitoring</button>' +
                    '<button onclick="resetDecibelStats()" class="px-4 py-4 bg-slate-100 text-slate-500 font-bold rounded-lg text-sm" style="min-height:48px;">' +
                        '<i class="fas fa-undo"></i></button>' +
                '</div>' +
                // Disclaimer
                '<p class="text-[10px] text-slate-400 text-center"><i class="fas fa-info-circle mr-1"></i>Measurements are approximate \u2014 uncalibrated mic</p>' +
            '</div>' +
        '</div>';
}

function startDecibel() {
    if (dbState.monitoring) {
        stopDecibel();
        var btn = document.getElementById('dbStartBtn');
        if (btn) btn.innerHTML = '<i class="fas fa-microphone mr-2"></i>Start Monitoring';
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            dbState.stream = stream;
            dbState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // Resume for iOS
            if (dbState.audioCtx.state === 'suspended') {
                dbState.audioCtx.resume();
            }
            dbState.analyser = dbState.audioCtx.createAnalyser();
            dbState.analyser.fftSize = 2048;
            dbState.analyser.smoothingTimeConstant = 0.3;
            dbState.source = dbState.audioCtx.createMediaStreamSource(stream);
            dbState.source.connect(dbState.analyser);
            dbState.monitoring = true;

            var btn = document.getElementById('dbStartBtn');
            if (btn) btn.innerHTML = '<i class="fas fa-stop mr-2"></i>Stop Monitoring';

            monitorDecibel();
        })
        .catch(function(err) {
            console.warn('[Decibel] Mic access denied:', err);
            var content = document.getElementById('decibelContent');
            if (content) {
                content.innerHTML =
                    '<div class="flex flex-col items-center justify-center h-full gap-4 p-8">' +
                        '<i class="fas fa-microphone-slash text-5xl text-red-400"></i>' +
                        '<p class="text-slate-400 text-sm text-center">Microphone access denied. Enable it in your browser settings.</p>' +
                        '<button onclick="renderDecibelUI()" class="px-6 py-3 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:44px;">Try Again</button>' +
                    '</div>';
            }
        });
}

function monitorDecibel(timestamp) {
    if (!dbState.monitoring || !dbState.analyser) return;

    // Throttle to ~20fps (50ms between frames)
    if (timestamp && timestamp - dbState.lastFrameTime < 50) {
        dbState.animFrame = requestAnimationFrame(monitorDecibel);
        return;
    }
    dbState.lastFrameTime = timestamp || 0;

    var bufLen = dbState.analyser.fftSize;
    var dataArray = new Float32Array(bufLen);
    dbState.analyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS
    var sumSq = 0;
    for (var i = 0; i < bufLen; i++) {
        sumSq += dataArray[i] * dataArray[i];
    }
    var rms = Math.sqrt(sumSq / bufLen);

    // Convert to approximate dB SPL (calibrated to typical range)
    // rms of 0 = silence, rms of 1 = max
    // Map to 30-130 dB range
    var db;
    if (rms < 0.00001) {
        db = 30;
    } else {
        db = 20 * Math.log10(rms) + 94; // 94 dB SPL = 1 Pa reference approximation
        db = Math.max(30, Math.min(130, db));
    }

    db = Math.round(db);

    // Update stats
    if (db > dbState.max) dbState.max = db;
    if (db < dbState.min) dbState.min = db;
    dbState.sum += db;
    dbState.count++;

    updateDecibelUI(db);

    dbState.animFrame = requestAnimationFrame(monitorDecibel);
}

function updateDecibelUI(db) {
    var valEl = document.getElementById('dbValue');
    var labelEl = document.getElementById('dbLabel');
    var bgEl = document.getElementById('dbBg');
    var barEl = document.getElementById('dbBar');
    var minEl = document.getElementById('dbMin');
    var maxEl = document.getElementById('dbMax');
    var avgEl = document.getElementById('dbAvg');

    if (valEl) valEl.textContent = db;

    // Color/label based on level
    var color, label, barColor;
    if (db < 70) {
        color = 'bg-safety-green/10 border-safety-green/30';
        label = 'Safe';
        barColor = '#16a34a';
    } else if (db < 85) {
        color = 'bg-yellow-50 border-yellow-300';
        label = 'Moderate';
        barColor = '#f59e0b';
    } else if (db < 100) {
        color = 'bg-orange-50 border-orange-300';
        label = 'Loud';
        barColor = '#ea580c';
    } else {
        color = 'bg-red-50 border-red-300';
        label = 'Dangerous — Hearing Protection Required';
        barColor = '#ef4444';
    }

    if (labelEl) {
        labelEl.textContent = label;
        labelEl.style.color = barColor;
    }
    if (bgEl) bgEl.className = 'rounded-2xl p-8 text-center mb-6 border-2 transition-colors duration-300 ' + color;
    if (barEl) {
        var pct = Math.max(0, Math.min(100, ((db - 30) / 100) * 100));
        barEl.style.width = pct + '%';
        barEl.style.background = barColor;
    }

    if (minEl && dbState.min !== Infinity) minEl.textContent = dbState.min;
    if (maxEl && dbState.max !== -Infinity) maxEl.textContent = dbState.max;
    if (avgEl && dbState.count > 0) avgEl.textContent = Math.round(dbState.sum / dbState.count);
}

function resetDecibelStats() {
    dbState.min = Infinity;
    dbState.max = -Infinity;
    dbState.sum = 0;
    dbState.count = 0;
    var minEl = document.getElementById('dbMin');
    var maxEl = document.getElementById('dbMax');
    var avgEl = document.getElementById('dbAvg');
    if (minEl) minEl.textContent = '--';
    if (maxEl) maxEl.textContent = '--';
    if (avgEl) avgEl.textContent = '--';
}

function stopDecibel() {
    dbState.monitoring = false;
    if (dbState.animFrame) {
        cancelAnimationFrame(dbState.animFrame);
        dbState.animFrame = null;
    }
    if (dbState.source) {
        dbState.source.disconnect();
        dbState.source = null;
    }
    if (dbState.analyser) {
        dbState.analyser = null;
    }
    if (dbState.audioCtx) {
        dbState.audioCtx.close().catch(function() {});
        dbState.audioCtx = null;
    }
    if (dbState.stream) {
        dbState.stream.getTracks().forEach(function(t) { t.stop(); });
        dbState.stream = null;
    }
}
