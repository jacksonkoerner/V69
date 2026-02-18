// ============================================================================
// FieldVoice Pro - 3D Scan Viewer (scan-viewer.js)
//
// Uses:
// - Three.js + GLTFLoader + OrbitControls (loaded on demand)
// ============================================================================

var scanViewerState = {
    threeReady: false,
    loadingPromise: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    raycaster: null,
    pointer: null,
    contentEl: null,
    renderHostEl: null,
    fileInputEl: null,
    modelRoot: null,
    activeModel: null,
    clock: null,
    animationHandle: null,
    resizeHandler: null,
    pointerDownHandler: null,
    pointerUpHandler: null,
    pointerDownPos: null,
    measureMode: false,
    pendingPoint: null,
    pendingMarker: null,
    measurements: [],
    objectsToRaycast: [],
    importUrl: null
};

function openScanViewer() {
    var overlay = document.getElementById('scanViewerOverlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');

    scanViewerResetRuntime();
    renderScanViewerUI();
}

function closeScanViewer() {
    var overlay = document.getElementById('scanViewerOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');

    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');

    scanViewerTeardownThree();
    scanViewerResetRuntime();

    var content = document.getElementById('scanViewerContent');
    if (content) content.innerHTML = '';
}

function clearScanViewerMeasurements() {
    if (!scanViewerState.scene) return;

    for (var i = 0; i < scanViewerState.measurements.length; i++) {
        scanViewerRemoveMeasurement(scanViewerState.measurements[i]);
    }
    scanViewerState.measurements = [];

    if (scanViewerState.pendingMarker) {
        scanViewerState.scene.remove(scanViewerState.pendingMarker);
        scanViewerDisposeMesh(scanViewerState.pendingMarker);
        scanViewerState.pendingMarker = null;
    }
    scanViewerState.pendingPoint = null;

    updateScanViewerBottomInfo();
    if (typeof showToast === 'function') {
        showToast('3D measurements cleared', 'info');
    }
}

function scanViewerResetRuntime() {
    scanViewerState.scene = null;
    scanViewerState.camera = null;
    scanViewerState.renderer = null;
    scanViewerState.controls = null;
    scanViewerState.raycaster = null;
    scanViewerState.pointer = null;
    scanViewerState.contentEl = null;
    scanViewerState.renderHostEl = null;
    scanViewerState.fileInputEl = null;
    scanViewerState.modelRoot = null;
    scanViewerState.activeModel = null;
    scanViewerState.clock = null;
    scanViewerState.animationHandle = null;
    scanViewerState.resizeHandler = null;
    scanViewerState.pointerDownHandler = null;
    scanViewerState.pointerUpHandler = null;
    scanViewerState.pointerDownPos = null;
    scanViewerState.measureMode = false;
    scanViewerState.pendingPoint = null;
    scanViewerState.pendingMarker = null;
    scanViewerState.measurements = [];
    scanViewerState.objectsToRaycast = [];
    scanViewerReleaseImportUrl();
}

function renderScanViewerUI() {
    var content = document.getElementById('scanViewerContent');
    if (!content) return;
    scanViewerState.contentEl = content;

    var html =
        '<div class="border-b border-slate-200 p-3 bg-slate-50 shrink-0">' +
            '<div class="flex items-center gap-2 mb-2">' +
                '<i class="fas fa-cube text-dot-blue"></i>' +
                '<span class="text-xs font-bold uppercase tracking-wider text-slate-500">3D Scan Viewer</span>' +
            '</div>' +
            '<p id="scanViewerInstruction" class="text-xs text-slate-600">Import a .glb or .gltf file to begin.</p>' +
        '</div>' +
        '<div id="scanViewerRenderHost" class="flex-1 bg-slate-900 relative overflow-hidden">' +
            '<div id="scanViewerImportCard" class="absolute inset-0 flex items-center justify-center p-4">' +
                '<div class="bg-white rounded-xl border border-slate-200 p-4 w-full max-w-xs shadow-sm">' +
                    '<p class="text-sm font-semibold text-slate-700 mb-2">Import 3D model</p>' +
                    '<p class="text-xs text-slate-500 mb-3">Supported: .glb, .gltf</p>' +
                    '<input id="scanViewerFileInput" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="w-full text-xs text-slate-600">' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="border-t border-slate-200 bg-white p-3 shrink-0" style="padding-bottom:max(env(safe-area-inset-bottom),12px);">' +
            '<div class="flex gap-2 mb-2">' +
                '<button id="scanViewerMeasureBtn" onclick="toggleScanViewerMeasureMode()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold" style="min-height:44px;" disabled>' +
                    '<i class="fas fa-draw-polygon mr-1"></i>Measure' +
                '</button>' +
                '<button onclick="clearScanViewerMeasurements()" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold" style="min-height:44px;">Clear</button>' +
            '</div>' +
            '<p id="scanViewerBottomInfo" class="text-sm font-bold text-slate-700 min-h-[20px]">Import a model to start.</p>' +
        '</div>';

    content.innerHTML = html;

    scanViewerState.fileInputEl = document.getElementById('scanViewerFileInput');
    scanViewerState.renderHostEl = document.getElementById('scanViewerRenderHost');

    if (scanViewerState.fileInputEl) {
        scanViewerState.fileInputEl.addEventListener('change', onScanViewerFileSelected);
    }

    updateScanViewerBottomInfo();
}

function onScanViewerFileSelected(evt) {
    var input = evt && evt.target ? evt.target : null;
    var files = input && input.files ? input.files : null;
    if (!files || !files.length) return;

    var file = files[0];
    var lower = (file.name || '').toLowerCase();
    if (lower.indexOf('.glb') === -1 && lower.indexOf('.gltf') === -1) {
        if (typeof showToast === 'function') showToast('Please choose a .glb or .gltf file', 'error');
        return;
    }

    loadScanViewerModelFile(file);
}

function loadScanViewerModelFile(file) {
    var instruction = document.getElementById('scanViewerInstruction');
    if (instruction) instruction.textContent = 'Loading model...';

    ensureScanViewerThree()
        .then(function() {
            return setupScanViewerThree();
        })
        .then(function() {
            return importScanViewerModel(file);
        })
        .then(function() {
            if (instruction) {
                instruction.textContent = 'Rotate/zoom/pan with touch. Turn on Measure to tap two points.';
            }
            updateScanViewerBottomInfo();
        })
        .catch(function(err) {
            console.warn('[ScanViewer] Failed to load model:', err);
            if (instruction) instruction.textContent = 'Import failed. Try another file.';
            if (typeof showToast === 'function') {
                showToast('Could not load 3D model', 'error');
            }
        });
}

function ensureScanViewerThree() {
    if (scanViewerState.threeReady) {
        return Promise.resolve();
    }
    if (scanViewerState.loadingPromise) {
        return scanViewerState.loadingPromise;
    }

    scanViewerState.loadingPromise = new Promise(function(resolve, reject) {
        var tasks = [];

        if (typeof THREE === 'undefined') {
            tasks.push(scanViewerLoadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'));
        }

        Promise.all(tasks).then(function() {
            var postTasks = [];
            if (!THREE.GLTFLoader) {
                postTasks.push(scanViewerLoadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js'));
            }
            if (!THREE.OrbitControls) {
                postTasks.push(scanViewerLoadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js'));
            }
            Promise.all(postTasks).then(function() {
                scanViewerState.threeReady = true;
                resolve();
            }).catch(reject);
        }).catch(reject);
    }).finally(function() {
        scanViewerState.loadingPromise = null;
    });

    return scanViewerState.loadingPromise;
}

function scanViewerLoadScript(src) {
    return new Promise(function(resolve, reject) {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src === src) {
                if (scripts[i].getAttribute('data-loaded') === '1') {
                    resolve();
                    return;
                }
                scripts[i].addEventListener('load', function() { resolve(); });
                scripts[i].addEventListener('error', function() { reject(new Error('Failed: ' + src)); });
                return;
            }
        }

        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function() {
            script.setAttribute('data-loaded', '1');
            resolve();
        };
        script.onerror = function() {
            reject(new Error('Failed: ' + src));
        };
        document.head.appendChild(script);
    });
}

function setupScanViewerThree() {
    if (scanViewerState.renderer || !scanViewerState.renderHostEl) {
        return Promise.resolve();
    }

    scanViewerState.scene = new THREE.Scene();
    scanViewerState.scene.background = new THREE.Color(0x0f172a);

    scanViewerState.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5000);
    scanViewerState.camera.position.set(0, 1.2, 3.2);

    var ambient = new THREE.HemisphereLight(0xffffff, 0x223344, 1.15);
    scanViewerState.scene.add(ambient);
    var dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 4, 3);
    scanViewerState.scene.add(dir);

    scanViewerState.modelRoot = new THREE.Group();
    scanViewerState.scene.add(scanViewerState.modelRoot);

    scanViewerState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    scanViewerState.renderer.setPixelRatio(window.devicePixelRatio || 1);
    scanViewerState.renderer.outputColorSpace = THREE.SRGBColorSpace;

    scanViewerState.renderHostEl.appendChild(scanViewerState.renderer.domElement);

    scanViewerState.controls = new THREE.OrbitControls(scanViewerState.camera, scanViewerState.renderer.domElement);
    scanViewerState.controls.enableDamping = true;
    scanViewerState.controls.dampingFactor = 0.08;
    scanViewerState.controls.screenSpacePanning = true;

    scanViewerState.raycaster = new THREE.Raycaster();
    scanViewerState.pointer = new THREE.Vector2();
    scanViewerState.clock = new THREE.Clock();

    scanViewerState.resizeHandler = function() {
        resizeScanViewerRenderer();
    };
    window.addEventListener('resize', scanViewerState.resizeHandler);

    scanViewerState.pointerDownHandler = function(e) {
        scanViewerState.pointerDownPos = {
            x: e.clientX || 0,
            y: e.clientY || 0
        };
    };
    scanViewerState.pointerUpHandler = function(e) {
        onScanViewerPointerUp(e);
    };
    scanViewerState.renderer.domElement.addEventListener('pointerdown', scanViewerState.pointerDownHandler);
    scanViewerState.renderer.domElement.addEventListener('pointerup', scanViewerState.pointerUpHandler);

    resizeScanViewerRenderer();
    startScanViewerRenderLoop();

    return Promise.resolve();
}

function resizeScanViewerRenderer() {
    if (!scanViewerState.renderer || !scanViewerState.camera || !scanViewerState.renderHostEl) return;

    var width = scanViewerState.renderHostEl.clientWidth || 1;
    var height = scanViewerState.renderHostEl.clientHeight || 1;

    scanViewerState.renderer.setSize(width, height, false);
    scanViewerState.camera.aspect = width / height;
    scanViewerState.camera.updateProjectionMatrix();
}

function startScanViewerRenderLoop() {
    if (!scanViewerState.renderer) return;

    function tick() {
        if (!scanViewerState.renderer || !scanViewerState.scene || !scanViewerState.camera) return;
        if (scanViewerState.controls) scanViewerState.controls.update();
        scanViewerState.renderer.render(scanViewerState.scene, scanViewerState.camera);
        scanViewerState.animationHandle = window.requestAnimationFrame(tick);
    }

    if (scanViewerState.animationHandle) {
        window.cancelAnimationFrame(scanViewerState.animationHandle);
        scanViewerState.animationHandle = null;
    }

    tick();
}

function importScanViewerModel(file) {
    return new Promise(function(resolve, reject) {
        if (!scanViewerState.modelRoot) {
            reject(new Error('Model root missing'));
            return;
        }

        scanViewerClearModelOnly();
        scanViewerReleaseImportUrl();
        scanViewerState.importUrl = URL.createObjectURL(file);

        var loader = new THREE.GLTFLoader();
        loader.load(
            scanViewerState.importUrl,
            function(gltf) {
                var scene = gltf && gltf.scene ? gltf.scene : null;
                if (!scene) {
                    reject(new Error('No scene in file'));
                    return;
                }

                scanViewerState.activeModel = scene;
                scanViewerState.modelRoot.add(scene);

                scanViewerState.objectsToRaycast = [];
                scene.traverse(function(child) {
                    if (child && child.isMesh) {
                        scanViewerState.objectsToRaycast.push(child);
                    }
                });

                fitScanViewerCameraToModel(scene);

                var card = document.getElementById('scanViewerImportCard');
                if (card) card.classList.add('hidden');
                var measureBtn = document.getElementById('scanViewerMeasureBtn');
                if (measureBtn) measureBtn.disabled = false;

                scanViewerState.measureMode = false;
                scanViewerSetMeasureButton();
                clearScanViewerMeasurements();
                resolve();
            },
            undefined,
            function(err) {
                reject(err || new Error('GLTF load failed'));
            }
        );
    });
}

function scanViewerClearModelOnly() {
    if (!scanViewerState.modelRoot) return;
    if (scanViewerState.activeModel) {
        scanViewerState.modelRoot.remove(scanViewerState.activeModel);
        scanViewerDisposeObject(scanViewerState.activeModel);
        scanViewerState.activeModel = null;
    }
    scanViewerState.objectsToRaycast = [];
    clearScanViewerMeasurements();
}

function fitScanViewerCameraToModel(model) {
    if (!scanViewerState.camera || !scanViewerState.controls || !model) return;

    var box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;

    var size = new THREE.Vector3();
    box.getSize(size);
    var center = new THREE.Vector3();
    box.getCenter(center);

    var maxDim = Math.max(size.x, size.y, size.z);
    var fitDist = (maxDim / (2 * Math.tan((scanViewerState.camera.fov * Math.PI) / 360))) * 1.35;
    if (!isFinite(fitDist) || fitDist <= 0) fitDist = 3;

    scanViewerState.camera.position.set(center.x + fitDist * 0.65, center.y + fitDist * 0.35, center.z + fitDist * 0.95);
    scanViewerState.camera.near = Math.max(0.01, fitDist / 500);
    scanViewerState.camera.far = Math.max(1000, fitDist * 50);
    scanViewerState.camera.updateProjectionMatrix();

    scanViewerState.controls.target.copy(center);
    scanViewerState.controls.minDistance = Math.max(0.02, maxDim * 0.01);
    scanViewerState.controls.maxDistance = Math.max(10, maxDim * 20);
    scanViewerState.controls.update();
}

function toggleScanViewerMeasureMode() {
    if (!scanViewerState.activeModel) return;
    scanViewerState.measureMode = !scanViewerState.measureMode;

    if (!scanViewerState.measureMode) {
        if (scanViewerState.pendingMarker) {
            scanViewerState.scene.remove(scanViewerState.pendingMarker);
            scanViewerDisposeMesh(scanViewerState.pendingMarker);
            scanViewerState.pendingMarker = null;
        }
        scanViewerState.pendingPoint = null;
    }

    scanViewerSetMeasureButton();
    updateScanViewerBottomInfo();
}

function scanViewerSetMeasureButton() {
    var btn = document.getElementById('scanViewerMeasureBtn');
    if (!btn) return;

    if (scanViewerState.measureMode) {
        btn.className = 'px-4 py-2 bg-dot-orange text-white rounded-lg text-sm font-bold';
        btn.innerHTML = '<i class="fas fa-draw-polygon mr-1"></i>Measuring';
    } else {
        btn.className = 'px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold';
        btn.innerHTML = '<i class="fas fa-draw-polygon mr-1"></i>Measure';
    }
}

function onScanViewerPointerUp(evt) {
    if (!scanViewerState.measureMode) return;
    if (!scanViewerState.renderer || !scanViewerState.camera || !scanViewerState.raycaster) return;
    if (!scanViewerState.objectsToRaycast.length) return;

    var down = scanViewerState.pointerDownPos;
    if (down) {
        var dx = (evt.clientX || 0) - down.x;
        var dy = (evt.clientY || 0) - down.y;
        if (Math.sqrt(dx * dx + dy * dy) > 6) return;
    }

    var rect = scanViewerState.renderer.domElement.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    scanViewerState.pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    scanViewerState.pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    scanViewerState.raycaster.setFromCamera(scanViewerState.pointer, scanViewerState.camera);
    var hits = scanViewerState.raycaster.intersectObjects(scanViewerState.objectsToRaycast, true);
    if (!hits || !hits.length) return;

    var point = hits[0].point.clone();
    var marker = createScanViewerMarker(point);
    scanViewerState.scene.add(marker);

    if (!scanViewerState.pendingPoint) {
        scanViewerState.pendingPoint = point;
        scanViewerState.pendingMarker = marker;
        updateScanViewerBottomInfo();
        return;
    }

    var start = scanViewerState.pendingPoint.clone();
    var startMarker = scanViewerState.pendingMarker;
    var end = point.clone();
    var endMarker = marker;

    var measurement = createScanViewerMeasurement(start, end, startMarker, endMarker);
    scanViewerState.measurements.push(measurement);

    scanViewerState.pendingPoint = null;
    scanViewerState.pendingMarker = null;

    updateScanViewerBottomInfo(measurement.distanceMeters);
}

function createScanViewerMarker(point) {
    var geo = new THREE.SphereGeometry(0.015, 20, 20);
    var mat = new THREE.MeshBasicMaterial({ color: 0xea580c });
    var sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(point);
    return sphere;
}

function createScanViewerMeasurement(p1, p2, markerA, markerB) {
    var lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    var lineMat = new THREE.LineBasicMaterial({ color: 0xea580c });
    var line = new THREE.Line(lineGeo, lineMat);
    scanViewerState.scene.add(line);

    var distM = p1.distanceTo(p2);
    var labelPos = new THREE.Vector3(
        (p1.x + p2.x) / 2,
        (p1.y + p2.y) / 2,
        (p1.z + p2.z) / 2
    );
    var label = createScanViewerTextSprite(formatScanViewerDistance(distM));
    label.position.copy(labelPos);
    scanViewerState.scene.add(label);

    return {
        start: p1,
        end: p2,
        markerA: markerA,
        markerB: markerB,
        line: line,
        label: label,
        distanceMeters: distM
    };
}

function createScanViewerTextSprite(text) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    var material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    var sprite = new THREE.Sprite(material);
    sprite.scale.set(0.28, 0.105, 1);
    return sprite;
}

function scanViewerRemoveMeasurement(m) {
    if (!m || !scanViewerState.scene) return;

    if (m.markerA) {
        scanViewerState.scene.remove(m.markerA);
        scanViewerDisposeMesh(m.markerA);
    }
    if (m.markerB) {
        scanViewerState.scene.remove(m.markerB);
        scanViewerDisposeMesh(m.markerB);
    }
    if (m.line) {
        scanViewerState.scene.remove(m.line);
        scanViewerDisposeObject(m.line);
    }
    if (m.label) {
        scanViewerState.scene.remove(m.label);
        scanViewerDisposeSprite(m.label);
    }
}

function formatScanViewerDistance(meters) {
    var feet = meters * 3.28084;
    if (feet >= 5280) return (feet / 5280).toFixed(2) + ' mi';
    if (feet >= 1) return feet.toFixed(2) + ' ft';
    return (meters * 1000).toFixed(1) + ' mm';
}

function updateScanViewerBottomInfo(lastMeters) {
    var info = document.getElementById('scanViewerBottomInfo');
    if (!info) return;

    if (!scanViewerState.activeModel) {
        info.textContent = 'Import a model to start.';
        return;
    }

    if (!scanViewerState.measureMode) {
        info.textContent = scanViewerState.measurements.length
            ? (scanViewerState.measurements.length + ' measurements saved')
            : 'Model ready. Enable Measure to tap points.';
        return;
    }

    if (scanViewerState.pendingPoint) {
        info.textContent = 'First point set. Tap second point.';
        return;
    }

    if (typeof lastMeters === 'number' && isFinite(lastMeters)) {
        info.textContent = 'Measured: ' + formatScanViewerDistance(lastMeters) +
            ' (' + lastMeters.toFixed(3) + ' m) · ' + scanViewerState.measurements.length + ' total';
        return;
    }

    info.textContent = 'Measure mode on. Tap two points on the model.';
}

function scanViewerTeardownThree() {
    if (scanViewerState.animationHandle) {
        window.cancelAnimationFrame(scanViewerState.animationHandle);
        scanViewerState.animationHandle = null;
    }

    if (scanViewerState.renderer && scanViewerState.pointerDownHandler) {
        scanViewerState.renderer.domElement.removeEventListener('pointerdown', scanViewerState.pointerDownHandler);
    }
    if (scanViewerState.renderer && scanViewerState.pointerUpHandler) {
        scanViewerState.renderer.domElement.removeEventListener('pointerup', scanViewerState.pointerUpHandler);
    }

    if (scanViewerState.resizeHandler) {
        window.removeEventListener('resize', scanViewerState.resizeHandler);
    }

    for (var i = 0; i < scanViewerState.measurements.length; i++) {
        scanViewerRemoveMeasurement(scanViewerState.measurements[i]);
    }
    scanViewerState.measurements = [];

    if (scanViewerState.pendingMarker && scanViewerState.scene) {
        scanViewerState.scene.remove(scanViewerState.pendingMarker);
        scanViewerDisposeMesh(scanViewerState.pendingMarker);
    }
    scanViewerState.pendingMarker = null;
    scanViewerState.pendingPoint = null;

    if (scanViewerState.activeModel && scanViewerState.modelRoot) {
        scanViewerState.modelRoot.remove(scanViewerState.activeModel);
        scanViewerDisposeObject(scanViewerState.activeModel);
        scanViewerState.activeModel = null;
    }

    if (scanViewerState.scene) {
        while (scanViewerState.scene.children.length) {
            scanViewerState.scene.remove(scanViewerState.scene.children[0]);
        }
    }

    if (scanViewerState.controls) {
        scanViewerState.controls.dispose();
        scanViewerState.controls = null;
    }

    if (scanViewerState.renderer) {
        scanViewerState.renderer.dispose();
        if (scanViewerState.renderer.domElement && scanViewerState.renderer.domElement.parentNode) {
            scanViewerState.renderer.domElement.parentNode.removeChild(scanViewerState.renderer.domElement);
        }
    }

    scanViewerReleaseImportUrl();
}

function scanViewerReleaseImportUrl() {
    if (scanViewerState.importUrl) {
        try {
            URL.revokeObjectURL(scanViewerState.importUrl);
        } catch (e) {}
        scanViewerState.importUrl = null;
    }
}

function scanViewerDisposeObject(obj) {
    if (!obj) return;

    if (obj.traverse) {
        obj.traverse(function(child) {
            if (child && child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.normalMap) child.material.normalMap.dispose();
                    if (child.material.roughnessMap) child.material.roughnessMap.dispose();
                    if (child.material.metalnessMap) child.material.metalnessMap.dispose();
                    if (child.material.emissiveMap) child.material.emissiveMap.dispose();
                    if (child.material.aoMap) child.material.aoMap.dispose();
                    if (child.material.alphaMap) child.material.alphaMap.dispose();
                    if (child.material.dispose) child.material.dispose();
                }
            }
        });
    } else {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && obj.material.dispose) obj.material.dispose();
    }
}

function scanViewerDisposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material && mesh.material.dispose) mesh.material.dispose();
}

function scanViewerDisposeSprite(sprite) {
    if (!sprite) return;
    if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        if (sprite.material.dispose) sprite.material.dispose();
    }
}
