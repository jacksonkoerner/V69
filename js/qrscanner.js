// ============================================================================
// FieldVoice Pro - QR Code Scanner (qrscanner.js)
//
// Uses jsQR library (CDN) + getUserMedia for real-time QR scanning.
// Draws green overlay on detected codes, plays beep, vibrates.
// ============================================================================

var qrState = {
    stream: null,
    video: null,
    canvas: null,
    ctx: null,
    animFrame: null,
    scanning: false,
    lastResult: null,
    history: [],
    torchOn: false,
    torchTrack: null
};

function openQR() {
    var overlay = document.getElementById('qrOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    // Load history from sessionStorage
    try {
        var stored = sessionStorage.getItem('qrScanHistory');
        if (stored) qrState.history = JSON.parse(stored);
    } catch (e) {}

    renderQRUI();
    startQRCamera();
}

function closeQR() {
    var overlay = document.getElementById('qrOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    // Turn off torch if on
    if (qrState.torchOn) toggleQRTorch();
    stopQRCamera();
}

function toggleQRTorch() {
    var track = qrState.torchTrack;
    if (!track) return;
    var caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return;

    qrState.torchOn = !qrState.torchOn;
    track.applyConstraints({ advanced: [{ torch: qrState.torchOn }] }).catch(function() {});

    var btn = document.getElementById('qrTorchBtn');
    if (btn) {
        btn.className = qrState.torchOn
            ? 'w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-dot-yellow'
            : 'w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/60';
    }
}

function renderQRUI() {
    var content = document.getElementById('qrContent');
    if (!content) return;
    content.innerHTML =
        // Camera/canvas area
        '<div class="flex-1 relative bg-black overflow-hidden">' +
            '<video id="qrVideo" playsinline autoplay muted style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;"></video>' +
            '<canvas id="qrCanvas" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>' +
            // Viewfinder overlay
            '<div class="absolute inset-0 flex items-center justify-center pointer-events-none">' +
                '<div style="width:220px;height:220px;border:3px solid rgba(255,255,255,0.6);border-radius:16px;"></div>' +
            '</div>' +
            // Scanning indicator
            '<div class="absolute top-4 left-0 right-0 text-center">' +
                '<span id="qrScanStatus" class="bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full">' +
                    '<i class="fas fa-camera mr-1"></i>Scanning...</span>' +
            '</div>' +
        '</div>' +
        // Result bar
        '<div id="qrResultBar" class="hidden bg-white border-t border-slate-200 p-4 shrink-0">' +
            '<div class="flex items-center gap-3">' +
                '<i class="fas fa-qrcode text-safety-green text-xl"></i>' +
                '<div class="flex-1 min-w-0">' +
                    '<p id="qrResultText" class="text-sm font-bold text-slate-800 truncate"></p>' +
                    '<p id="qrResultType" class="text-[10px] text-slate-400 uppercase"></p>' +
                '</div>' +
                '<div id="qrResultActions"></div>' +
            '</div>' +
        '</div>' +
        // History (collapsed by default)
        '<div class="bg-slate-50 border-t border-slate-200 shrink-0" style="padding-bottom:max(env(safe-area-inset-bottom),8px);">' +
            '<div class="px-4 py-2 flex items-center justify-between cursor-pointer" onclick="toggleQRHistory()">' +
                '<span class="text-[10px] text-slate-400 uppercase font-bold"><i class="fas fa-history mr-1"></i>Scan History (' + qrState.history.length + ')</span>' +
                '<div class="flex items-center gap-2">' +
                    '<button onclick="event.stopPropagation();clearQRHistory();" class="text-[10px] text-slate-400 font-bold">Clear</button>' +
                    '<i id="qrHistoryChevron" class="fas fa-chevron-up text-slate-400 text-[10px] transition-transform duration-200"></i>' +
                '</div>' +
            '</div>' +
            '<div id="qrHistoryList" class="hidden" style="max-height:140px;overflow-y:auto;">' +
                '<div id="qrHistory">' + renderQRHistory() + '</div>' +
            '</div>' +
        '</div>';
}

function startQRCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
            qrState.stream = stream;
            qrState.torchTrack = stream.getVideoTracks()[0] || null;
            qrState.video = document.getElementById('qrVideo');
            qrState.canvas = document.getElementById('qrCanvas');
            if (!qrState.video || !qrState.canvas) return;
            qrState.ctx = qrState.canvas.getContext('2d', { willReadFrequently: true });
            qrState.video.srcObject = stream;
            qrState.video.play();
            qrState.scanning = true;
            qrState.video.addEventListener('loadedmetadata', function() {
                qrState.canvas.width = qrState.video.videoWidth;
                qrState.canvas.height = qrState.video.videoHeight;
                scanQRFrame();
            });
        })
        .catch(function(err) {
            console.warn('[QR] Camera access denied:', err);
            var content = document.getElementById('qrContent');
            if (content) {
                content.innerHTML =
                    '<div class="flex flex-col items-center justify-center h-full gap-4 p-8 bg-white">' +
                        '<i class="fas fa-camera-slash text-5xl text-red-400"></i>' +
                        '<p class="text-slate-400 text-sm text-center">Camera access denied. Enable it in your browser settings.</p>' +
                        '<button onclick="renderQRUI();startQRCamera();" class="px-6 py-3 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:44px;">Try Again</button>' +
                    '</div>';
            }
        });
}

function scanQRFrame() {
    if (!qrState.scanning) return;

    var video = qrState.video;
    var canvas = qrState.canvas;
    var ctx = qrState.ctx;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (typeof jsQR !== 'undefined') {
            var code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
                drawQROverlay(ctx, code.location);
                if (code.data !== qrState.lastResult) {
                    qrState.lastResult = code.data;
                    onQRDetected(code.data);
                }
            }
        }
    }

    qrState.animFrame = requestAnimationFrame(scanQRFrame);
}

function drawQROverlay(ctx, loc) {
    ctx.beginPath();
    ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#16a34a';
    ctx.stroke();
    ctx.fillStyle = 'rgba(22,163,74,0.1)';
    ctx.fill();
}

function onQRDetected(data) {
    // Beep
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        osc.frequency.value = 1000;
        var gain = ctx.createGain();
        gain.gain.value = 0.2;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(function() { osc.stop(); ctx.close(); }, 100);
    } catch (e) {}

    // Vibrate
    if (navigator.vibrate) navigator.vibrate(100);

    // Update status
    var statusEl = document.getElementById('qrScanStatus');
    if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>Code Found!';
        statusEl.className = 'bg-safety-green text-white text-xs font-bold px-3 py-1.5 rounded-full';
        setTimeout(function() {
            if (statusEl) {
                statusEl.innerHTML = '<i class="fas fa-camera mr-1"></i>Scanning...';
                statusEl.className = 'bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full';
            }
            qrState.lastResult = null; // Allow re-scan of same code
        }, 3000);
    }

    // Show result bar
    var bar = document.getElementById('qrResultBar');
    var textEl = document.getElementById('qrResultText');
    var typeEl = document.getElementById('qrResultType');
    var actEl = document.getElementById('qrResultActions');
    if (bar) bar.classList.remove('hidden');
    if (textEl) textEl.textContent = data;

    var isURL = /^https?:\/\//i.test(data);
    if (typeEl) typeEl.textContent = isURL ? 'URL' : 'Text';
    if (actEl) {
        if (isURL) {
            actEl.innerHTML = '<a href="' + escapeHtml(data) + '" target="_blank" rel="noopener" class="px-4 py-2 bg-dot-blue text-white font-bold rounded text-xs" style="min-height:44px;display:inline-flex;align-items:center;">Open Link</a>';
        } else {
            actEl.innerHTML = '<button onclick="copyQRResult()" class="px-4 py-2 bg-dot-blue text-white font-bold rounded text-xs" style="min-height:44px;">Copy</button>';
        }
    }

    // Add to history
    qrState.history.unshift({ data: data, time: new Date().toLocaleTimeString() });
    if (qrState.history.length > 50) qrState.history.pop();
    try { sessionStorage.setItem('qrScanHistory', JSON.stringify(qrState.history)); } catch (e) {}
    var histEl = document.getElementById('qrHistory');
    if (histEl) histEl.innerHTML = renderQRHistory();
}

function renderQRHistory() {
    if (!qrState.history.length) return '<p class="px-4 py-2 text-xs text-slate-400">No scans yet</p>';
    var html = '';
    for (var i = 0; i < Math.min(qrState.history.length, 20); i++) {
        var item = qrState.history[i];
        html += '<div class="px-4 py-2 border-t border-slate-100 flex items-center gap-2">' +
            '<i class="fas fa-qrcode text-xs text-slate-300"></i>' +
            '<span class="flex-1 text-xs text-slate-600 truncate">' + escapeHtml(item.data) + '</span>' +
            '<span class="text-[10px] text-slate-400 shrink-0">' + item.time + '</span></div>';
    }
    return html;
}

function toggleQRHistory() {
    var list = document.getElementById('qrHistoryList');
    var chevron = document.getElementById('qrHistoryChevron');
    if (!list) return;
    list.classList.toggle('hidden');
    if (chevron) {
        chevron.style.transform = list.classList.contains('hidden') ? '' : 'rotate(180deg)';
    }
}

function clearQRHistory() {
    qrState.history = [];
    try { sessionStorage.removeItem('qrScanHistory'); } catch (e) {}
    var histEl = document.getElementById('qrHistory');
    if (histEl) histEl.innerHTML = renderQRHistory();
}

function copyQRResult() {
    var textEl = document.getElementById('qrResultText');
    if (!textEl) return;
    navigator.clipboard.writeText(textEl.textContent).then(function() {
        var actEl = document.getElementById('qrResultActions');
        if (actEl) actEl.innerHTML = '<span class="text-xs text-safety-green font-bold"><i class="fas fa-check mr-1"></i>Copied!</span>';
    }).catch(function() {});
}

function stopQRCamera() {
    qrState.scanning = false;
    if (qrState.animFrame) { cancelAnimationFrame(qrState.animFrame); qrState.animFrame = null; }
    if (qrState.stream) {
        qrState.stream.getTracks().forEach(function(t) { t.stop(); });
        qrState.stream = null;
    }
    qrState.video = null;
    qrState.canvas = null;
    qrState.ctx = null;
    qrState.lastResult = null;
    qrState.torchOn = false;
    qrState.torchTrack = null;
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
