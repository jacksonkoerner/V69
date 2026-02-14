// ============================================================================
// FieldVoice Pro - AR Measure Tool (ar-measure.js)
//
// Uses:
// - WebXR Device API (immersive-ar with hit-test)
// - Three.js (CDN) for 3D rendering
// - measure.js: openMeasure (fallback)
// ============================================================================

var arMeasureState = {
    xrSession: null,
    gl: null,
    renderer: null,
    scene: null,
    camera: null,
    hitTestSource: null,
    reticle: null,
    points: [],
    pointMeshes: [],
    lineMesh: null,
    labelDiv: null,
    measurementMeters: 0,
    referenceSpace: null,
    animFrameHandle: null,
    log: []
};

// ── Open AR Measure ──────────────────────────────────────────────────────────

async function openARMeasure() {
    // Lazy-load Three.js if not already loaded
    if (typeof THREE === 'undefined') {
        try {
            await new Promise(function(resolve, reject) {
                var script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
                script.onload = resolve;
                script.onerror = function() { reject(new Error('Failed to load Three.js')); };
                document.head.appendChild(script);
            });
            console.log('[AR] Three.js loaded on demand');
        } catch (e) {
            console.error('[AR] Could not load Three.js:', e);
            if (typeof showToast === 'function') showToast('AR unavailable — library load failed', 'error');
            return;
        }
    }

    var overlay = document.getElementById('arMeasureOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');

    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    // Load saved log from sessionStorage
    try {
        var saved = sessionStorage.getItem('arMeasureLog');
        if (saved) arMeasureState.log = JSON.parse(saved);
    } catch (e) { /* ignore */ }

    // Try to start AR session directly — show fallback only if it actually fails
    try {
        await startARSession();
    } catch (e) {
        console.warn('AR session failed to start:', e);
        renderARFallback();
    }
}

// ── Close AR Measure ─────────────────────────────────────────────────────────

function closeARMeasure() {
    var overlay = document.getElementById('arMeasureOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');

    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');

    endARSession();
}

// ── Fallback Screen (no WebXR) ───────────────────────────────────────────────

function renderARFallback() {
    var content = document.getElementById('arMeasureContent');
    if (!content) return;

    content.innerHTML =
        '<div class="flex-1 flex flex-col items-center justify-center bg-white px-6">' +
            '<i class="fas fa-camera-rotate text-7xl text-slate-300 mb-6"></i>' +
            '<p class="text-xl font-bold text-slate-700 mb-2 text-center">AR Measurement Not Available</p>' +
            '<p class="text-sm text-slate-500 text-center mb-8 max-w-xs leading-relaxed">' +
                'This feature requires WebXR which is not supported on Safari or iOS browsers. It works on Chrome for Android.' +
            '</p>' +
            '<button onclick="closeARMeasureAndOpenMapMeasure()" ' +
                'class="px-6 py-3 bg-dot-blue text-white font-bold text-sm rounded-lg active:opacity-80 transition-opacity">' +
                '<i class="fas fa-map-pin mr-2"></i>Use Map Measure Instead' +
            '</button>' +
        '</div>';
}

function closeARMeasureAndOpenMapMeasure() {
    closeARMeasure();
    if (typeof openMeasure === 'function') {
        openMeasure();
    }
}

// ── Start AR Session ─────────────────────────────────────────────────────────

async function startARSession() {
    var content = document.getElementById('arMeasureContent');
    if (!content) return;

    // Build AR UI
    content.innerHTML =
        '<div style="position:relative;width:100%;flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
            '<canvas id="arCanvas" style="width:100%;flex:1;display:block;touch-action:none;"></canvas>' +
            // Measurement floating label
            '<div id="arMeasureLabel" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
                'background:rgba(0,0,0,0.7);color:white;padding:8px 16px;border-radius:8px;font-size:18px;font-weight:bold;' +
                'pointer-events:none;white-space:nowrap;z-index:10;"></div>' +
            // Reticle instruction
            '<div id="arInstruction" style="position:absolute;bottom:120px;left:50%;transform:translateX(-50%);' +
                'background:rgba(0,0,0,0.6);color:white;padding:6px 14px;border-radius:20px;font-size:13px;' +
                'pointer-events:none;white-space:nowrap;z-index:10;">Point at a surface &amp; tap to place point</div>' +
        '</div>' +
        // Bottom bar
        '<div id="arBottomBar" class="bg-white border-t border-slate-200 px-4 py-3 shrink-0">' +
            '<div id="arBottomMeasurement" class="text-center text-lg font-bold text-slate-700 mb-2" style="display:none;"></div>' +
            '<div class="flex gap-2">' +
                '<button onclick="arNewMeasurement()" class="flex-1 py-2.5 bg-slate-100 text-slate-700 font-bold text-sm rounded-lg active:bg-slate-200 transition-colors">' +
                    '<i class="fas fa-rotate-right mr-1"></i> New Measurement' +
                '</button>' +
                '<button onclick="arAddToLog()" id="arAddLogBtn" class="flex-1 py-2.5 bg-dot-orange text-white font-bold text-sm rounded-lg active:opacity-80 transition-opacity" style="display:none;">' +
                    '<i class="fas fa-plus mr-1"></i> Add to Log' +
                '</button>' +
            '</div>' +
            // Log section
            '<div id="arLogSection" class="mt-3">' +
                '<button onclick="toggleARLog()" class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider w-full">' +
                    '<i id="arLogChevron" class="fas fa-chevron-right text-[10px] transition-transform"></i>' +
                    'Measurement Log (<span id="arLogCount">0</span>)' +
                '</button>' +
                '<div id="arLogList" class="hidden mt-2 max-h-40 overflow-y-auto"></div>' +
            '</div>' +
        '</div>';

    updateARLogUI();

    var canvas = document.getElementById('arCanvas');

    // Request XR session
    var session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test']
    });
    arMeasureState.xrSession = session;

    // Set up Three.js renderer
    var renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true
    });
    renderer.autoClear = false;
    renderer.xr.enabled = true;
    renderer.setPixelRatio(window.devicePixelRatio);
    arMeasureState.renderer = renderer;

    // Update XR-compatible rendering
    await renderer.xr.setSession(session);

    // Scene & camera
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false;
    arMeasureState.scene = scene;
    arMeasureState.camera = camera;

    // GL context
    arMeasureState.gl = renderer.getContext();

    // Reference space
    var refSpace = await session.requestReferenceSpace('local');
    arMeasureState.referenceSpace = refSpace;

    // Hit test source (viewer ray)
    var viewerSpace = await session.requestReferenceSpace('viewer');
    var hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    arMeasureState.hitTestSource = hitTestSource;

    // Create reticle (orange ring)
    var reticleGeo = new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-Math.PI / 2);
    var reticleMat = new THREE.MeshBasicMaterial({ color: 0xea580c, side: THREE.DoubleSide });
    var reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.visible = false;
    reticle.matrixAutoUpdate = false;
    scene.add(reticle);
    arMeasureState.reticle = reticle;

    // Reset measurement state
    arMeasureState.points = [];
    arMeasureState.pointMeshes = [];
    arMeasureState.lineMesh = null;
    arMeasureState.measurementMeters = 0;

    // Tap handler — place points
    session.addEventListener('select', onARSelect);

    // Session end handler
    session.addEventListener('end', function() {
        arMeasureState.xrSession = null;
    });

    // Start render loop
    renderer.setAnimationLoop(function(timestamp, frame) {
        arRenderFrame(timestamp, frame);
    });
}

// ── End AR Session ───────────────────────────────────────────────────────────

function endARSession() {
    if (arMeasureState.xrSession) {
        try { arMeasureState.xrSession.end(); } catch (e) { /* ignore */ }
        arMeasureState.xrSession = null;
    }
    if (arMeasureState.renderer) {
        arMeasureState.renderer.setAnimationLoop(null);
        arMeasureState.renderer.dispose();
        arMeasureState.renderer = null;
    }
    if (arMeasureState.hitTestSource) {
        try { arMeasureState.hitTestSource.cancel(); } catch (e) { /* ignore */ }
        arMeasureState.hitTestSource = null;
    }
    // Clean up Three.js objects
    if (arMeasureState.scene) {
        while (arMeasureState.scene.children.length > 0) {
            var child = arMeasureState.scene.children[0];
            arMeasureState.scene.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        arMeasureState.scene = null;
    }
    arMeasureState.camera = null;
    arMeasureState.reticle = null;
    arMeasureState.points = [];
    arMeasureState.pointMeshes = [];
    arMeasureState.lineMesh = null;
    arMeasureState.referenceSpace = null;
    arMeasureState.gl = null;
}

// ── AR Render Loop ───────────────────────────────────────────────────────────

function arRenderFrame(timestamp, frame) {
    if (!frame || !arMeasureState.xrSession) return;

    var session = arMeasureState.xrSession;
    var refSpace = arMeasureState.referenceSpace;
    var renderer = arMeasureState.renderer;
    var scene = arMeasureState.scene;
    var camera = arMeasureState.camera;

    var pose = frame.getViewerPose(refSpace);
    if (!pose) return;

    // Update camera from XR view
    var view = pose.views[0];
    camera.matrix.fromArray(view.transform.matrix);
    camera.projectionMatrix.fromArray(view.projectionMatrix);
    camera.updateMatrixWorld(true);

    // Hit test — position reticle
    if (arMeasureState.hitTestSource) {
        var hitResults = frame.getHitTestResults(arMeasureState.hitTestSource);
        if (hitResults.length > 0) {
            var hit = hitResults[0];
            var hitPose = hit.getPose(refSpace);
            arMeasureState.reticle.visible = true;
            arMeasureState.reticle.matrix.fromArray(hitPose.transform.matrix);
        } else {
            arMeasureState.reticle.visible = false;
        }
    }

    // Render
    renderer.render(scene, camera);
}

// ── AR Tap Handler ───────────────────────────────────────────────────────────

function onARSelect() {
    if (!arMeasureState.reticle || !arMeasureState.reticle.visible) return;

    // Get reticle world position
    var pos = new THREE.Vector3();
    pos.setFromMatrixPosition(arMeasureState.reticle.matrix);

    // If we already have 2 points, start fresh
    if (arMeasureState.points.length >= 2) {
        arClearPoints();
    }

    arMeasureState.points.push(pos.clone());

    // Place an orange dot at the point
    var dotGeo = new THREE.SphereGeometry(0.015, 16, 16);
    var dotMat = new THREE.MeshBasicMaterial({ color: 0xea580c });
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(pos);
    arMeasureState.scene.add(dot);
    arMeasureState.pointMeshes.push(dot);

    if (arMeasureState.points.length === 1) {
        // First point placed
        var instruction = document.getElementById('arInstruction');
        if (instruction) instruction.textContent = 'Tap to place second point';
    }

    if (arMeasureState.points.length === 2) {
        // Second point — draw line and calculate
        var p1 = arMeasureState.points[0];
        var p2 = arMeasureState.points[1];

        // Draw line between points
        var lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        var lineMat = new THREE.LineBasicMaterial({ color: 0xea580c, linewidth: 2 });
        var line = new THREE.Line(lineGeo, lineMat);
        arMeasureState.scene.add(line);
        arMeasureState.lineMesh = line;

        // Calculate distance (XR coordinates are in meters)
        var dist = p1.distanceTo(p2);
        arMeasureState.measurementMeters = dist;

        var ftIn = metersToFeetInches(dist);
        var displayText = ftIn.text;

        // Show floating label
        var label = document.getElementById('arMeasureLabel');
        if (label) {
            label.textContent = displayText;
            label.style.display = 'block';
        }

        // Show bottom bar measurement
        var bottomMeas = document.getElementById('arBottomMeasurement');
        if (bottomMeas) {
            bottomMeas.textContent = displayText + '  (' + dist.toFixed(2) + ' m)';
            bottomMeas.style.display = 'block';
        }

        // Show Add to Log button
        var addBtn = document.getElementById('arAddLogBtn');
        if (addBtn) addBtn.style.display = '';

        // Update instruction
        var instruction = document.getElementById('arInstruction');
        if (instruction) instruction.textContent = 'Tap again for new measurement';
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function metersToFeetInches(meters) {
    var totalInches = meters * 39.3701;
    var feet = Math.floor(totalInches / 12);
    var inches = Math.round(totalInches % 12);
    if (inches === 12) { feet++; inches = 0; }
    var text = feet + ' ft ' + inches + ' in';
    return { feet: feet, inches: inches, text: text };
}

function arClearPoints() {
    // Remove point meshes
    for (var i = 0; i < arMeasureState.pointMeshes.length; i++) {
        var m = arMeasureState.pointMeshes[i];
        arMeasureState.scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
    }
    arMeasureState.pointMeshes = [];

    // Remove line
    if (arMeasureState.lineMesh) {
        arMeasureState.scene.remove(arMeasureState.lineMesh);
        if (arMeasureState.lineMesh.geometry) arMeasureState.lineMesh.geometry.dispose();
        if (arMeasureState.lineMesh.material) arMeasureState.lineMesh.material.dispose();
        arMeasureState.lineMesh = null;
    }

    arMeasureState.points = [];
    arMeasureState.measurementMeters = 0;

    // Hide labels
    var label = document.getElementById('arMeasureLabel');
    if (label) label.style.display = 'none';
    var bottomMeas = document.getElementById('arBottomMeasurement');
    if (bottomMeas) bottomMeas.style.display = 'none';
    var addBtn = document.getElementById('arAddLogBtn');
    if (addBtn) addBtn.style.display = 'none';
}

function arNewMeasurement() {
    arClearPoints();
    var instruction = document.getElementById('arInstruction');
    if (instruction) instruction.textContent = 'Point at a surface & tap to place point';
}

// ── Measurement Log ──────────────────────────────────────────────────────────

function arAddToLog() {
    if (arMeasureState.measurementMeters <= 0) return;

    var dist = arMeasureState.measurementMeters;
    var ftIn = metersToFeetInches(dist);

    // Prompt for description
    var desc = prompt('Description (optional):', '');
    if (desc === null) return; // cancelled

    arMeasureState.log.push({
        description: desc || 'Measurement',
        meters: dist,
        display: ftIn.text + ' (' + dist.toFixed(2) + ' m)',
        timestamp: new Date().toLocaleTimeString()
    });

    // Save to sessionStorage
    try {
        sessionStorage.setItem('arMeasureLog', JSON.stringify(arMeasureState.log));
    } catch (e) { /* ignore */ }

    updateARLogUI();
    arNewMeasurement();
}

function toggleARLog() {
    var list = document.getElementById('arLogList');
    var chevron = document.getElementById('arLogChevron');
    if (!list) return;

    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    } else {
        list.classList.add('hidden');
        if (chevron) chevron.style.transform = '';
    }
}

function updateARLogUI() {
    var countEl = document.getElementById('arLogCount');
    var listEl = document.getElementById('arLogList');
    if (countEl) countEl.textContent = arMeasureState.log.length;
    if (!listEl) return;

    if (arMeasureState.log.length === 0) {
        listEl.innerHTML = '<p class="text-xs text-slate-400 py-2">No measurements saved yet.</p>';
        return;
    }

    var html = '';
    for (var i = arMeasureState.log.length - 1; i >= 0; i--) {
        var entry = arMeasureState.log[i];
        html +=
            '<div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">' +
                '<div class="flex-1 min-w-0">' +
                    '<p class="text-sm font-medium text-slate-700 truncate">' + escapeHtml(entry.description) + '</p>' +
                    '<p class="text-xs text-slate-400">' + entry.timestamp + '</p>' +
                '</div>' +
                '<span class="text-sm font-bold text-dot-orange ml-2 shrink-0">' + escapeHtml(entry.display) + '</span>' +
            '</div>';
    }
    listEl.innerHTML = html;
}

// escapeHtml() provided by ui-utils.js (loaded before tool scripts in index.html)
