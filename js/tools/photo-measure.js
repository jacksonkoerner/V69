// ============================================================================
// FieldVoice Pro - Photo Measure Tool (photo-measure.js)
//
// Workflow:
// 1) Open camera and capture a photo
// 2) Pick a known reference object size
// 3) Tap two endpoints of that object to calibrate pixels-per-mm
// 4) Tap any two points to measure real-world distance
// ============================================================================

var photoMeasureState = {
    stream: null,
    photoCaptured: false,
    photoDataUrl: null,
    photoImage: null,
    canvas: null,
    ctx: null,
    calibrationPoints: [],
    measurePoints: [],
    pixelsPerMm: null,
    lastDistanceMm: null,
    referenceType: 'credit-card',
    referenceMm: 85.6,
    customReferenceMm: ''
};

var PHOTO_MEASURE_REFERENCES = {
    'credit-card': 85.6,
    'dollar-bill': 156,
    'hard-hat': 250,
    'traffic-cone': 460
};

function openPhotoMeasure() {
    var overlay = document.getElementById('photoMeasureOverlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    photoMeasureResetState();
    renderPhotoMeasureUI();
    startPhotoMeasureCamera();
}

function closePhotoMeasure() {
    var overlay = document.getElementById('photoMeasureOverlay');
    if (!overlay) return;

    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');

    stopPhotoMeasureCamera();
    photoMeasureResetState();

    var content = document.getElementById('photoMeasureContent');
    if (content) content.innerHTML = '';
}

function clearPhotoMeasure() {
    stopPhotoMeasureCamera();
    photoMeasureResetState();
    renderPhotoMeasureUI();
    startPhotoMeasureCamera();

    if (typeof showToast === 'function') showToast('Photo Measure cleared', 'info');
}

function photoMeasureResetState() {
    photoMeasureState.photoCaptured = false;
    photoMeasureState.photoDataUrl = null;
    photoMeasureState.photoImage = null;
    photoMeasureState.canvas = null;
    photoMeasureState.ctx = null;
    photoMeasureState.calibrationPoints = [];
    photoMeasureState.measurePoints = [];
    photoMeasureState.pixelsPerMm = null;
    photoMeasureState.lastDistanceMm = null;
    photoMeasureState.referenceType = 'credit-card';
    photoMeasureState.referenceMm = 85.6;
    photoMeasureState.customReferenceMm = '';
}

function renderPhotoMeasureUI() {
    var content = document.getElementById('photoMeasureContent');
    if (!content) return;

    var customRowClass = photoMeasureState.referenceType === 'custom' ? '' : 'hidden';
    var captureActions = photoMeasureState.photoCaptured
        ? '<button onclick="retakePhotoMeasure()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold" style="min-height:44px;">Retake</button>'
        : '<button onclick="snapPhotoMeasure()" class="px-4 py-2 bg-dot-orange text-white rounded-lg text-sm font-bold" style="min-height:44px;"><i class="fas fa-camera mr-2"></i>Snap Photo</button>';

    var html =
        '<div class="border-b border-slate-200 p-3 bg-slate-50 shrink-0">' +
            '<div class="flex items-center gap-2 mb-2">' +
                '<i class="fas fa-ruler-combined text-dot-blue"></i>' +
                '<span class="text-xs font-bold uppercase tracking-wider text-slate-500">Reference Object</span>' +
            '</div>' +
            '<select id="photoMeasureReference" onchange="setPhotoMeasureReference(this.value)" class="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-700 bg-white" style="min-height:44px;">' +
                '<option value="credit-card">Credit Card (85.6 mm)</option>' +
                '<option value="dollar-bill">Dollar Bill (156 mm)</option>' +
                '<option value="hard-hat">Hard Hat (250 mm)</option>' +
                '<option value="traffic-cone">Traffic Cone (460 mm)</option>' +
                '<option value="custom">Custom Length</option>' +
            '</select>' +
            '<div id="photoMeasureCustomRow" class="mt-2 ' + customRowClass + '">' +
                '<input id="photoMeasureCustomInput" type="number" inputmode="decimal" step="0.1" min="0" value="' + photoMeasureState.customReferenceMm + '" ' +
                    'oninput="setPhotoMeasureCustomValue(this.value)" placeholder="Custom length in mm" ' +
                    'class="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-700 bg-white" style="min-height:44px;">' +
            '</div>' +
            '<p id="photoMeasureInstruction" class="text-xs text-slate-500 mt-2"></p>' +
        '</div>' +
        '<div class="flex-1 bg-black/90 flex items-center justify-center p-2 overflow-hidden">' +
            (photoMeasureState.photoCaptured
                ? '<canvas id="photoMeasureCanvas" class="max-w-full max-h-full bg-black" style="touch-action:none;"></canvas>'
                : '<video id="photoMeasureVideo" autoplay playsinline muted class="max-w-full max-h-full bg-black"></video>') +
        '</div>' +
        '<div class="border-t border-slate-200 bg-white p-3 shrink-0" style="padding-bottom:max(env(safe-area-inset-bottom),12px);">' +
            '<p id="photoMeasureResult" class="text-sm font-bold text-slate-700 mb-3 min-h-[20px]"></p>' +
            '<div class="flex gap-2">' +
                captureActions +
                '<button onclick="clearPhotoMeasure()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold" style="min-height:44px;">Start Over</button>' +
            '</div>' +
        '</div>';

    content.innerHTML = html;

    var referenceSelect = document.getElementById('photoMeasureReference');
    if (referenceSelect) referenceSelect.value = photoMeasureState.referenceType;

    updatePhotoMeasureStatus();

    if (photoMeasureState.photoCaptured) {
        setupPhotoMeasureCanvas();
    }
}

function setPhotoMeasureReference(type) {
    var hadScale = photoMeasureState.pixelsPerMm !== null;

    photoMeasureState.referenceType = type;
    if (type === 'custom') {
        var customVal = parseFloat(photoMeasureState.customReferenceMm);
        photoMeasureState.referenceMm = customVal > 0 ? customVal : 0;
    } else {
        photoMeasureState.referenceMm = PHOTO_MEASURE_REFERENCES[type] || 85.6;
    }

    if (hadScale) {
        photoMeasureState.calibrationPoints = [];
        photoMeasureState.measurePoints = [];
        photoMeasureState.pixelsPerMm = null;
        photoMeasureState.lastDistanceMm = null;
        if (typeof showToast === 'function') showToast('Reference changed. Calibrate again.', 'info');
    }

    renderPhotoMeasureUI();
}

function setPhotoMeasureCustomValue(value) {
    photoMeasureState.customReferenceMm = value;

    if (photoMeasureState.referenceType !== 'custom') return;

    var mm = parseFloat(value);
    if (!isFinite(mm) || mm <= 0) {
        photoMeasureState.referenceMm = 0;
        updatePhotoMeasureStatus();
        return;
    }

    var hadScale = photoMeasureState.pixelsPerMm !== null;
    var changed = Math.abs(photoMeasureState.referenceMm - mm) > 0.0001;

    photoMeasureState.referenceMm = mm;

    if (hadScale && changed) {
        photoMeasureState.calibrationPoints = [];
        photoMeasureState.measurePoints = [];
        photoMeasureState.pixelsPerMm = null;
        photoMeasureState.lastDistanceMm = null;
        if (typeof showToast === 'function') showToast('Custom length updated. Calibrate again.', 'info');
        drawPhotoMeasureCanvas();
    }

    updatePhotoMeasureStatus();
}

function startPhotoMeasureCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof showToast === 'function') showToast('Camera not supported on this device', 'error');
        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: { ideal: 'environment' }
        }
    }).then(function(stream) {
        photoMeasureState.stream = stream;

        var video = document.getElementById('photoMeasureVideo');
        if (!video) return;

        video.srcObject = stream;
        video.play().catch(function() {});
    }).catch(function(err) {
        console.warn('[PhotoMeasure] Camera access failed:', err);
        if (typeof showToast === 'function') showToast('Camera access denied', 'error');
    });
}

function stopPhotoMeasureCamera() {
    if (photoMeasureState.stream) {
        var tracks = photoMeasureState.stream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
            tracks[i].stop();
        }
    }
    photoMeasureState.stream = null;
}

function snapPhotoMeasure() {
    var video = document.getElementById('photoMeasureVideo');
    if (!video || !video.videoWidth || !video.videoHeight) {
        if (typeof showToast === 'function') showToast('Camera not ready yet', 'info');
        return;
    }

    var captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;

    var captureCtx = captureCanvas.getContext('2d');
    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    photoMeasureState.photoDataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);
    photoMeasureState.photoImage = new Image();
    photoMeasureState.photoImage.onload = function() {
        photoMeasureState.photoCaptured = true;
        photoMeasureState.calibrationPoints = [];
        photoMeasureState.measurePoints = [];
        photoMeasureState.pixelsPerMm = null;
        photoMeasureState.lastDistanceMm = null;

        stopPhotoMeasureCamera();
        renderPhotoMeasureUI();

        if (typeof showToast === 'function') showToast('Photo captured. Tap reference endpoints to calibrate.', 'success');
    };
    photoMeasureState.photoImage.src = photoMeasureState.photoDataUrl;
}

function retakePhotoMeasure() {
    stopPhotoMeasureCamera();

    photoMeasureState.photoCaptured = false;
    photoMeasureState.photoDataUrl = null;
    photoMeasureState.photoImage = null;
    photoMeasureState.canvas = null;
    photoMeasureState.ctx = null;
    photoMeasureState.calibrationPoints = [];
    photoMeasureState.measurePoints = [];
    photoMeasureState.pixelsPerMm = null;
    photoMeasureState.lastDistanceMm = null;

    renderPhotoMeasureUI();
    startPhotoMeasureCamera();

    if (typeof showToast === 'function') showToast('Camera restarted', 'info');
}

function setupPhotoMeasureCanvas() {
    var canvas = document.getElementById('photoMeasureCanvas');
    if (!canvas || !photoMeasureState.photoImage) return;

    canvas.width = photoMeasureState.photoImage.width;
    canvas.height = photoMeasureState.photoImage.height;

    photoMeasureState.canvas = canvas;
    photoMeasureState.ctx = canvas.getContext('2d');

    canvas.addEventListener('click', onPhotoMeasureCanvasTap);
    canvas.addEventListener('touchstart', onPhotoMeasureCanvasTap, { passive: false });

    drawPhotoMeasureCanvas();
}

function onPhotoMeasureCanvasTap(event) {
    if (!photoMeasureState.canvas) return;

    if (event && event.type === 'touchstart') {
        event.preventDefault();
    }

    var point = getPhotoMeasureCanvasPoint(event);
    if (!point) return;

    if (!photoMeasureState.pixelsPerMm) {
        handlePhotoMeasureCalibrationTap(point);
    } else {
        handlePhotoMeasureMeasurementTap(point);
    }

    drawPhotoMeasureCanvas();
    updatePhotoMeasureStatus();
}

function getPhotoMeasureCanvasPoint(event) {
    var canvas = photoMeasureState.canvas;
    if (!canvas) return null;

    var rect = canvas.getBoundingClientRect();
    var clientX = 0;
    var clientY = 0;

    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    var x = (clientX - rect.left) * (canvas.width / rect.width);
    var y = (clientY - rect.top) * (canvas.height / rect.height);

    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return null;

    return { x: x, y: y };
}

function handlePhotoMeasureCalibrationTap(point) {
    var refMm = photoMeasureState.referenceMm;
    if (!isFinite(refMm) || refMm <= 0) {
        if (typeof showToast === 'function') showToast('Enter a valid reference length in mm', 'error');
        return;
    }

    if (photoMeasureState.calibrationPoints.length >= 2) {
        photoMeasureState.calibrationPoints = [];
    }

    photoMeasureState.calibrationPoints.push(point);

    if (photoMeasureState.calibrationPoints.length === 1) {
        if (typeof showToast === 'function') showToast('Tap the second end of the reference object', 'info');
        return;
    }

    var pxDistance = distanceBetween(photoMeasureState.calibrationPoints[0], photoMeasureState.calibrationPoints[1]);
    if (pxDistance < 8) {
        photoMeasureState.calibrationPoints = [];
        if (typeof showToast === 'function') showToast('Calibration points are too close together', 'error');
        return;
    }

    photoMeasureState.pixelsPerMm = pxDistance / refMm;
    photoMeasureState.measurePoints = [];
    photoMeasureState.lastDistanceMm = null;

    if (typeof showToast === 'function') {
        showToast('Calibrated. Now tap two points to measure.', 'success');
    }
}

function handlePhotoMeasureMeasurementTap(point) {
    if (photoMeasureState.measurePoints.length >= 2) {
        photoMeasureState.measurePoints = [];
    }

    photoMeasureState.measurePoints.push(point);

    if (photoMeasureState.measurePoints.length < 2) return;

    var pxDistance = distanceBetween(photoMeasureState.measurePoints[0], photoMeasureState.measurePoints[1]);
    photoMeasureState.lastDistanceMm = pxDistance / photoMeasureState.pixelsPerMm;

    if (typeof showToast === 'function') {
        showToast('Measured: ' + formatPhotoMeasureResult(photoMeasureState.lastDistanceMm), 'success');
    }
}

function drawPhotoMeasureCanvas() {
    var canvas = photoMeasureState.canvas;
    var ctx = photoMeasureState.ctx;
    var img = photoMeasureState.photoImage;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Calibration overlay (orange)
    if (photoMeasureState.calibrationPoints.length > 0) {
        drawPhotoMeasurePoint(ctx, photoMeasureState.calibrationPoints[0], '#f97316');
    }
    if (photoMeasureState.calibrationPoints.length > 1) {
        drawPhotoMeasurePoint(ctx, photoMeasureState.calibrationPoints[1], '#f97316');
        drawPhotoMeasureLine(ctx, photoMeasureState.calibrationPoints[0], photoMeasureState.calibrationPoints[1], '#f97316');
    }

    // Measurement overlay (blue)
    if (photoMeasureState.measurePoints.length > 0) {
        drawPhotoMeasurePoint(ctx, photoMeasureState.measurePoints[0], '#3b82f6');
    }
    if (photoMeasureState.measurePoints.length > 1) {
        drawPhotoMeasurePoint(ctx, photoMeasureState.measurePoints[1], '#3b82f6');
        drawPhotoMeasureLine(ctx, photoMeasureState.measurePoints[0], photoMeasureState.measurePoints[1], '#3b82f6');

        if (photoMeasureState.lastDistanceMm) {
            drawPhotoMeasureLabel(
                ctx,
                photoMeasureState.measurePoints[0],
                photoMeasureState.measurePoints[1],
                formatPhotoMeasureResult(photoMeasureState.lastDistanceMm)
            );
        }
    }
}

function drawPhotoMeasurePoint(ctx, point, color) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
}

function drawPhotoMeasureLine(ctx, p1, p2, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function drawPhotoMeasureLabel(ctx, p1, p2, text) {
    var x = (p1.x + p2.x) / 2;
    var y = (p1.y + p2.y) / 2;

    ctx.font = 'bold 18px sans-serif';
    var textWidth = ctx.measureText(text).width;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - (textWidth / 2) - 8, y - 18, textWidth + 16, 28);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x - (textWidth / 2), y + 2);
}

function updatePhotoMeasureStatus() {
    var instructionEl = document.getElementById('photoMeasureInstruction');
    var resultEl = document.getElementById('photoMeasureResult');

    if (instructionEl) {
        if (!photoMeasureState.photoCaptured) {
            instructionEl.textContent = 'Snap a photo first.';
        } else if (!photoMeasureState.pixelsPerMm) {
            instructionEl.textContent = 'Tap two ends of your selected reference object.';
        } else {
            instructionEl.textContent = 'Tap any two points on the photo to measure distance.';
        }
    }

    if (resultEl) {
        if (photoMeasureState.lastDistanceMm) {
            resultEl.textContent = 'Result: ' + formatPhotoMeasureResult(photoMeasureState.lastDistanceMm);
        } else if (photoMeasureState.pixelsPerMm) {
            resultEl.textContent = 'Calibrated. Ready to measure.';
        } else {
            resultEl.textContent = '';
        }
    }
}

function formatPhotoMeasureResult(mm) {
    if (!isFinite(mm) || mm <= 0) return '--';

    var totalInches = mm / 25.4;
    var feet = Math.floor(totalInches / 12);
    var inches = totalInches - (feet * 12);
    var meters = mm / 1000;

    return feet + ' ft ' + inches.toFixed(2) + ' in (' + meters.toFixed(3) + ' m)';
}

function distanceBetween(p1, p2) {
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}
