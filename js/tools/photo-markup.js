// ============================================================================
// FieldVoice Pro - Photo Markup Module (photo-markup.js)
//
// Post-capture photo markup overlay with drawing tools.
// Call openPhotoMarkup(imageDataUrl, metadata) from anywhere after photo capture.
// Returns a Promise that resolves with the final composited image data URL,
// or null if the user discards.
// ============================================================================

var _markupState = {
    active: false,
    imageDataUrl: null,
    metadata: null,
    elements: [],
    currentTool: 'freehand',
    currentColor: '#ef4444',
    currentWidth: 3,
    isDrawing: false,
    startPoint: null,
    lastPoint: null,
    currentPoints: [],
    overlay: null,
    canvas: null,
    ctx: null,
    photoImg: null,
    resolvePromise: null,
    textInputActive: false,
    _textCoords: null
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Open photo markup overlay
 * @param {string} imageDataUrl - Base64 image data URL
 * @param {Object} metadata - { lat, lon, timestamp, heading } (any can be null)
 * @returns {Promise<string|null>} Resolves with marked-up image data URL, or null if discarded
 */
function openPhotoMarkup(imageDataUrl, metadata) {
    return new Promise(function(resolve) {
        if (_markupState.active) {
            resolve(null);
            return;
        }

        _markupState.active = true;
        _markupState.imageDataUrl = imageDataUrl;
        _markupState.metadata = metadata || {};
        _markupState.elements = [];
        _markupState.currentTool = 'freehand';
        _markupState.currentColor = '#ef4444';
        _markupState.currentWidth = 3;
        _markupState.isDrawing = false;
        _markupState.startPoint = null;
        _markupState.lastPoint = null;
        _markupState.currentPoints = [];
        _markupState.resolvePromise = resolve;
        _markupState.textInputActive = false;
        _markupState._textCoords = null;

        // Try to get heading if not provided
        if (_markupState.metadata.heading == null) {
            _tryGetHeading();
        }

        // If timestamp not provided, use now
        if (_markupState.metadata.timestamp == null) {
            _markupState.metadata.timestamp = Date.now();
        }

        // If GPS not provided, try to get it fresh
        if (_markupState.metadata.lat == null) {
            if (typeof getHighAccuracyGPS === 'function') {
                getHighAccuracyGPS(false).then(function(gps) {
                    if (gps && _markupState.active) {
                        _markupState.metadata.lat = gps.lat;
                        _markupState.metadata.lon = gps.lng;
                        _updateMetadataDisplay();
                    }
                }).catch(function() {});
            } else if (typeof getFreshLocation === 'function') {
                getFreshLocation().then(function(loc) {
                    if (loc && _markupState.active) {
                        _markupState.metadata.lat = loc.lat;
                        _markupState.metadata.lon = loc.lng;
                        _updateMetadataDisplay();
                    }
                }).catch(function() {});
            } else if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    if (_markupState.active) {
                        _markupState.metadata.lat = pos.coords.latitude;
                        _markupState.metadata.lon = pos.coords.longitude;
                        _updateMetadataDisplay();
                    }
                }, function() {}, { enableHighAccuracy: true, timeout: 10000 });
            }
        }

        _createMarkupOverlay();
        _loadPhotoAndInit();
    });
}

// ============================================================================
// HEADING HELPER
// ============================================================================

function _tryGetHeading() {
    if (typeof DeviceOrientationEvent === 'undefined') return;

    // iOS 13+ requires permission — don't prompt, only use if already granted
    if (typeof DeviceOrientationEvent.requestPermission === 'function') return;

    var headingHandler = function(event) {
        var heading = null;
        if (event.webkitCompassHeading !== undefined) {
            heading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            heading = (360 - event.alpha) % 360;
        }
        if (heading !== null && _markupState.active) {
            _markupState.metadata.heading = Math.round(heading);
            _updateMetadataDisplay();
        }
        window.removeEventListener('deviceorientation', headingHandler, true);
    };

    window.addEventListener('deviceorientation', headingHandler, true);
    setTimeout(function() {
        window.removeEventListener('deviceorientation', headingHandler, true);
    }, 3000);
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

function _markupFormatGPS(lat, lon) {
    if (lat == null || lon == null) return null;
    var latDir = lat >= 0 ? 'N' : 'S';
    var lonDir = lon >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '\u00B0' + latDir + ', ' + Math.abs(lon).toFixed(4) + '\u00B0' + lonDir;
}

function _markupFormatTimestamp(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var hours = d.getHours();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    var min = d.getMinutes();
    var minStr = min < 10 ? '0' + min : '' + min;
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() +
        ' \u2014 ' + hours + ':' + minStr + ' ' + ampm;
}

function _markupCardinalDir(deg) {
    if (deg == null) return '';
    var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function _markupFormatHeading(heading) {
    if (heading == null) return null;
    return 'Facing: ' + heading + '\u00B0 ' + _markupCardinalDir(heading);
}

// ============================================================================
// METADATA DISPLAY UPDATE (for async GPS/heading arrival)
// ============================================================================

function _updateMetadataDisplay() {
    var meta = _markupState.metadata;
    var gpsEl = document.getElementById('markupGPS');
    if (gpsEl && meta.lat != null) {
        gpsEl.textContent = _markupFormatGPS(meta.lat, meta.lon);
        gpsEl.className = 'text-[11px] font-mono text-white/90';
    }
    var headingEl = document.getElementById('markupHeading');
    if (headingEl && meta.heading != null) {
        headingEl.textContent = _markupFormatHeading(meta.heading);
        headingEl.className = 'text-[11px] text-white/90';
    }
}

// ============================================================================
// DOM CREATION
// ============================================================================

function _createMarkupOverlay() {
    var existing = document.getElementById('photoMarkupOverlay');
    if (existing) existing.remove();

    var meta = _markupState.metadata;
    var overlay = document.createElement('div');
    overlay.id = 'photoMarkupOverlay';
    overlay.className = 'fixed inset-0 z-[95] bg-white flex flex-col';
    overlay.style.cssText = 'touch-action:none;';

    // Top bar
    var html = '<div class="bg-dot-navy flex items-center justify-between px-4 shrink-0" style="min-height:52px;padding-top:env(safe-area-inset-top);">' +
        '<button onclick="_discardMarkup()" class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white"><i class="fas fa-times text-lg"></i></button>' +
        '<h2 class="text-white font-bold text-base">Photo Markup</h2>' +
        '<button onclick="_saveMarkup()" class="px-4 py-2 bg-safety-green text-white font-bold rounded-lg text-sm" style="min-height:36px;">Done</button>' +
    '</div>';

    // Photo area with canvas overlay
    var gpsText = meta.lat != null ? _markupFormatGPS(meta.lat, meta.lon) : 'No GPS';
    var gpsClass = meta.lat != null ? 'text-[11px] font-mono text-white/90' : 'text-[11px] font-mono text-white/50';
    var tsText = _markupFormatTimestamp(meta.timestamp) || '';
    var headText = meta.heading != null ? _markupFormatHeading(meta.heading) : '';
    var headClass = meta.heading != null ? 'text-[11px] text-white/90' : 'text-[11px] text-white/50';

    html += '<div id="markupPhotoArea" class="flex-1 relative bg-slate-100 overflow-hidden flex items-center justify-center">' +
        '<img id="markupPhotoImg" class="max-w-full max-h-full object-contain" style="user-select:none;-webkit-user-drag:none;" />' +
        '<canvas id="markupCanvas" class="absolute" style="touch-action:none;cursor:crosshair;"></canvas>' +
        '<div id="markupMetaStrip" class="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-2 pointer-events-none" style="backdrop-filter:blur(2px);">' +
            '<div class="flex flex-wrap gap-x-4 gap-y-0.5 items-center justify-center">' +
                '<span id="markupGPS" class="' + gpsClass + '">' + gpsText + '</span>' +
                '<span id="markupTimestamp" class="text-[11px] text-white/90">' + tsText + '</span>' +
                '<span id="markupHeading" class="' + headClass + '">' + headText + '</span>' +
            '</div>' +
        '</div>' +
    '</div>';

    // Toolbar
    var tools = [
        { tool: 'freehand', icon: 'fa-pen', label: 'Draw' },
        { tool: 'arrow', icon: 'fa-arrow-right', label: 'Arrow' },
        { tool: 'circle', icon: 'fa-circle', label: 'Circle' },
        { tool: 'rect', icon: 'fa-square', label: 'Rect' },
        { tool: 'text', icon: 'fa-font', label: 'Text' },
        { tool: 'undo', icon: 'fa-eraser', label: 'Undo' }
    ];

    var colors = [
        { hex: '#ef4444' },
        { hex: '#f97316' },
        { hex: '#eab308' },
        { hex: '#ffffff' },
        { hex: '#3b82f6' }
    ];

    html += '<div class="bg-dot-navy border-t border-white/10 px-3 py-2 shrink-0" style="padding-bottom:max(env(safe-area-inset-bottom),8px);">';

    // Tool buttons
    html += '<div class="flex items-center justify-center gap-1 mb-2">';
    for (var i = 0; i < tools.length; i++) {
        var t = tools[i];
        if (t.tool === 'undo') {
            html += '<button onclick="_undoMarkup()" class="w-11 h-11 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10">' +
                '<i class="fas ' + t.icon + ' text-sm"></i><span class="text-[9px] mt-0.5">' + t.label + '</span></button>';
        } else {
            var active = t.tool === _markupState.currentTool;
            html += '<button id="markupTool_' + t.tool + '" onclick="_setMarkupTool(\'' + t.tool + '\')" ' +
                'class="w-11 h-11 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-lg ' +
                (active ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10') + '">' +
                '<i class="fas ' + t.icon + ' text-sm"></i><span class="text-[9px] mt-0.5">' + t.label + '</span></button>';
        }
    }
    html += '</div>';

    // Color picker + width toggle
    html += '<div class="flex items-center justify-between">';
    html += '<div class="flex items-center gap-2">';
    for (var c = 0; c < colors.length; c++) {
        var col = colors[c].hex;
        var selected = col === _markupState.currentColor;
        var border = col === '#ffffff' ? 'border border-slate-400' : '';
        html += '<button onclick="_setMarkupColor(\'' + col + '\')" ' +
            'id="markupColor_' + col.replace('#','') + '" ' +
            'class="w-7 h-7 min-w-[28px] min-h-[28px] rounded-full ' + border + ' ' +
            (selected ? 'ring-2 ring-white ring-offset-1 ring-offset-dot-navy' : '') +
            '" style="background:' + col + ';"></button>';
    }
    html += '</div>';

    // Width toggle
    html += '<div class="flex items-center gap-1 bg-white/10 rounded-lg p-1">';
    var widths = [{ val: 3, label: 'Thin' }, { val: 6, label: 'Med' }, { val: 10, label: 'Thick' }];
    for (var w = 0; w < widths.length; w++) {
        var wItem = widths[w];
        var wActive = _markupState.currentWidth === wItem.val;
        html += '<button onclick="_setMarkupWidth(' + wItem.val + ')" id="markupWidth_' + wItem.val + '" ' +
            'class="px-2 py-1 rounded text-[10px] font-bold ' +
            (wActive ? 'bg-white/20 text-white' : 'text-white/50') + '">' + wItem.label + '</button>';
    }
    html += '</div></div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    _markupState.overlay = overlay;
}

// ============================================================================
// PHOTO LOADING & CANVAS INIT
// ============================================================================

function _loadPhotoAndInit() {
    var img = document.getElementById('markupPhotoImg');
    if (!img) return;

    img.onload = function() {
        _markupState.photoImg = img;
        // Double rAF to ensure layout settles before measuring
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                _initMarkupCanvas();
            });
        });
    };
    img.src = _markupState.imageDataUrl;
}

function _initMarkupCanvas() {
    var img = _markupState.photoImg;
    var canvas = document.getElementById('markupCanvas');
    if (!img || !canvas) return;

    _positionCanvasOverImage(img, canvas);

    // Internal resolution matches photo native size
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    _markupState.canvas = canvas;
    _markupState.ctx = canvas.getContext('2d');

    // Touch events
    canvas.addEventListener('touchstart', _onMarkupTouchStart, { passive: false });
    canvas.addEventListener('touchmove', _onMarkupTouchMove, { passive: false });
    canvas.addEventListener('touchend', _onMarkupTouchEnd, { passive: false });

    // Mouse events for desktop
    canvas.addEventListener('mousedown', _onMarkupMouseDown);
    canvas.addEventListener('mousemove', _onMarkupMouseMove);
    canvas.addEventListener('mouseup', _onMarkupMouseUp);

    window.addEventListener('resize', _repositionMarkupCanvas);
}

function _positionCanvasOverImage(img, canvas) {
    var imgRect = img.getBoundingClientRect();
    var areaEl = document.getElementById('markupPhotoArea');
    if (!areaEl) return;
    var areaRect = areaEl.getBoundingClientRect();

    canvas.style.left = (imgRect.left - areaRect.left) + 'px';
    canvas.style.top = (imgRect.top - areaRect.top) + 'px';
    canvas.style.width = imgRect.width + 'px';
    canvas.style.height = imgRect.height + 'px';
}

function _repositionMarkupCanvas() {
    if (!_markupState.active) return;
    var img = _markupState.photoImg;
    var canvas = _markupState.canvas;
    if (!img || !canvas) return;
    _positionCanvasOverImage(img, canvas);
}

// ============================================================================
// COORDINATE MAPPING
// ============================================================================

function _getMarkupCoords(clientX, clientY) {
    var canvas = _markupState.canvas;
    if (!canvas) return { x: 0, y: 0 };
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function _getScaledWidth(baseWidth) {
    var canvas = _markupState.canvas;
    if (!canvas) return baseWidth;
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return baseWidth;
    return baseWidth * (canvas.width / rect.width);
}

// ============================================================================
// TOUCH EVENT HANDLERS
// ============================================================================

function _onMarkupTouchStart(e) {
    e.preventDefault();
    if (_markupState.textInputActive) return;
    if (e.touches.length !== 1) return;
    var touch = e.touches[0];
    _handleDrawStart(_getMarkupCoords(touch.clientX, touch.clientY));
}

function _onMarkupTouchMove(e) {
    e.preventDefault();
    if (_markupState.textInputActive) return;
    if (e.touches.length !== 1) return;
    var touch = e.touches[0];
    _handleDrawMove(_getMarkupCoords(touch.clientX, touch.clientY));
}

function _onMarkupTouchEnd(e) {
    e.preventDefault();
    if (_markupState.textInputActive) return;
    _handleDrawEnd();
}

// ============================================================================
// MOUSE EVENT HANDLERS
// ============================================================================

function _onMarkupMouseDown(e) {
    if (_markupState.textInputActive) return;
    _handleDrawStart(_getMarkupCoords(e.clientX, e.clientY));
}

function _onMarkupMouseMove(e) {
    if (!_markupState.isDrawing) return;
    if (_markupState.textInputActive) return;
    _handleDrawMove(_getMarkupCoords(e.clientX, e.clientY));
}

function _onMarkupMouseUp(e) {
    if (_markupState.textInputActive) return;
    _handleDrawEnd();
}

// ============================================================================
// DRAWING LOGIC
// ============================================================================

function _handleDrawStart(coords) {
    var tool = _markupState.currentTool;

    if (tool === 'text') {
        _showTextInput(coords);
        return;
    }

    _markupState.isDrawing = true;
    _markupState.startPoint = coords;
    _markupState.lastPoint = coords;

    if (tool === 'freehand') {
        _markupState.currentPoints = [coords];
    }
}

function _handleDrawMove(coords) {
    if (!_markupState.isDrawing) return;
    _markupState.lastPoint = coords;

    var tool = _markupState.currentTool;

    if (tool === 'freehand') {
        _markupState.currentPoints.push(coords);
        _redrawMarkup();
        _drawFreehandPath(_markupState.ctx, _markupState.currentPoints,
            _markupState.currentColor, _getScaledWidth(_markupState.currentWidth));
    } else {
        _redrawMarkup();
        _drawShapePreview(_markupState.startPoint, coords, tool);
    }
}

function _handleDrawEnd() {
    if (!_markupState.isDrawing) return;
    _markupState.isDrawing = false;

    var tool = _markupState.currentTool;
    var start = _markupState.startPoint;
    var end = _markupState.lastPoint;

    if (tool === 'freehand' && _markupState.currentPoints.length > 1) {
        _markupState.elements.push({
            type: 'freehand',
            points: _markupState.currentPoints.slice(),
            color: _markupState.currentColor,
            width: _markupState.currentWidth
        });
    } else if ((tool === 'arrow' || tool === 'circle' || tool === 'rect') && start && end) {
        // Only add if there was meaningful drag distance
        var dx = end.x - start.x;
        var dy = end.y - start.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            _markupState.elements.push({
                type: tool,
                points: [start, end],
                color: _markupState.currentColor,
                width: _markupState.currentWidth
            });
        }
    }

    _markupState.startPoint = null;
    _markupState.lastPoint = null;
    _markupState.currentPoints = [];
    _redrawMarkup();
}

// ============================================================================
// SHAPE PREVIEW (while dragging)
// ============================================================================

function _drawShapePreview(start, end, tool) {
    var ctx = _markupState.ctx;
    if (!ctx) return;
    var sw = _getScaledWidth(_markupState.currentWidth);
    var color = _markupState.currentColor;

    ctx.globalAlpha = 0.7;
    if (tool === 'arrow') {
        _drawArrowShape(ctx, start, end, color, sw);
    } else if (tool === 'circle') {
        _drawEllipseShape(ctx, start, end, color, sw);
    } else if (tool === 'rect') {
        _drawRectShape(ctx, start, end, color, sw);
    }
    ctx.globalAlpha = 1.0;
}

// ============================================================================
// DRAWING PRIMITIVES
// ============================================================================

function _drawFreehandPath(ctx, pts, color, width) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

function _drawArrowShape(ctx, p1, p2, color, width) {
    var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    var headLen = Math.max(15, width * 4);

    // Shaft
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrowhead (filled triangle)
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6),
               p2.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6),
               p2.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function _drawEllipseShape(ctx, p1, p2, color, width) {
    var cx = (p1.x + p2.x) / 2;
    var cy = (p1.y + p2.y) / 2;
    var rx = Math.abs(p2.x - p1.x) / 2;
    var ry = Math.abs(p2.y - p1.y) / 2;
    if (rx < 1 || ry < 1) return;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function _drawRectShape(ctx, p1, p2, color, width) {
    var x = Math.min(p1.x, p2.x);
    var y = Math.min(p1.y, p2.y);
    var w = Math.abs(p2.x - p1.x);
    var h = Math.abs(p2.y - p1.y);
    if (w < 1 || h < 1) return;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function _drawTextElement(ctx, el, scaledWidth) {
    var pt = el.points[0];
    var fontSize = Math.max(28, Math.round((_markupState.canvas ? _markupState.canvas.width : 1200) * 0.035));
    if (el.width === 6) fontSize = Math.round(fontSize * 1.3);
    if (el.width === 10) fontSize = Math.round(fontSize * 1.7);

    ctx.font = 'bold ' + fontSize + 'px -apple-system, BlinkMacSystemFont, sans-serif';
    var text = el.text || '';
    var metrics = ctx.measureText(text);
    var pad = Math.round(fontSize * 0.25);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pt.x - pad, pt.y - pad, metrics.width + pad * 2, fontSize + pad * 2);

    // Text
    ctx.fillStyle = el.color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, pt.x, pt.y);
}

// ============================================================================
// REDRAW ALL ELEMENTS
// ============================================================================

function _redrawMarkup() {
    var ctx = _markupState.ctx;
    var canvas = _markupState.canvas;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < _markupState.elements.length; i++) {
        _drawMarkupElement(ctx, _markupState.elements[i]);
    }
}

function _drawMarkupElement(ctx, el) {
    var sw = _getScaledWidth(el.width);
    switch (el.type) {
        case 'freehand':
            _drawFreehandPath(ctx, el.points, el.color, sw);
            break;
        case 'arrow':
            _drawArrowShape(ctx, el.points[0], el.points[1], el.color, sw);
            break;
        case 'circle':
            _drawEllipseShape(ctx, el.points[0], el.points[1], el.color, sw);
            break;
        case 'rect':
            _drawRectShape(ctx, el.points[0], el.points[1], el.color, sw);
            break;
        case 'text':
            _drawTextElement(ctx, el, sw);
            break;
    }
}

// ============================================================================
// TOOL SWITCHING
// ============================================================================

function _setMarkupTool(tool) {
    _markupState.currentTool = tool;
    var toolNames = ['freehand', 'arrow', 'circle', 'rect', 'text'];
    for (var i = 0; i < toolNames.length; i++) {
        var btn = document.getElementById('markupTool_' + toolNames[i]);
        if (btn) {
            if (toolNames[i] === tool) {
                btn.className = 'w-11 h-11 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-lg bg-white/20 text-white';
            } else {
                btn.className = 'w-11 h-11 min-w-[44px] min-h-[44px] flex flex-col items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10';
            }
        }
    }
}

function _setMarkupColor(hex) {
    _markupState.currentColor = hex;
    var allColors = ['ef4444', 'f97316', 'eab308', 'ffffff', '3b82f6'];
    for (var i = 0; i < allColors.length; i++) {
        var btn = document.getElementById('markupColor_' + allColors[i]);
        if (btn) {
            var isWhite = allColors[i] === 'ffffff';
            var border = isWhite ? 'border border-slate-400' : '';
            if ('#' + allColors[i] === hex) {
                btn.className = 'w-7 h-7 min-w-[28px] min-h-[28px] rounded-full ' + border + ' ring-2 ring-white ring-offset-1 ring-offset-dot-navy';
            } else {
                btn.className = 'w-7 h-7 min-w-[28px] min-h-[28px] rounded-full ' + border;
            }
        }
    }
}

function _setMarkupWidth(val) {
    _markupState.currentWidth = val;
    var widthVals = [3, 6, 10];
    for (var i = 0; i < widthVals.length; i++) {
        var btn = document.getElementById('markupWidth_' + widthVals[i]);
        if (btn) {
            if (widthVals[i] === val) {
                btn.className = 'px-2 py-1 rounded text-[10px] font-bold bg-white/20 text-white';
            } else {
                btn.className = 'px-2 py-1 rounded text-[10px] font-bold text-white/50';
            }
        }
    }
}

// ============================================================================
// UNDO
// ============================================================================

function _undoMarkup() {
    if (_markupState.elements.length === 0) return;
    _markupState.elements.pop();
    _redrawMarkup();
}

// ============================================================================
// TEXT INPUT
// ============================================================================

function _showTextInput(coords) {
    _markupState.textInputActive = true;
    _markupState._textCoords = coords;

    var popup = document.createElement('div');
    popup.id = 'markupTextPopup';
    popup.className = 'fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4';
    popup.innerHTML =
        '<div class="bg-white rounded-xl p-4 w-full max-w-sm shadow-lg">' +
            '<p class="text-sm font-bold text-slate-800 mb-2">Add Text Label</p>' +
            '<input id="markupTextInput" type="text" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-dot-blue focus:outline-none" placeholder="Type text..." maxlength="100" />' +
            '<div class="flex gap-2 mt-3">' +
                '<button onclick="_cancelTextInput()" class="flex-1 px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-lg text-sm" style="min-height:44px;">Cancel</button>' +
                '<button onclick="_confirmTextInput()" class="flex-1 px-4 py-2 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:44px;">Add</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(popup);

    setTimeout(function() {
        var input = document.getElementById('markupTextInput');
        if (input) {
            input.focus();
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') _confirmTextInput();
            });
        }
    }, 100);
}

function _cancelTextInput() {
    var popup = document.getElementById('markupTextPopup');
    if (popup) popup.remove();
    _markupState.textInputActive = false;
}

function _confirmTextInput() {
    var input = document.getElementById('markupTextInput');
    var text = input ? input.value.trim() : '';

    if (text) {
        _markupState.elements.push({
            type: 'text',
            points: [_markupState._textCoords],
            color: _markupState.currentColor,
            width: _markupState.currentWidth,
            text: text
        });
        _redrawMarkup();
    }

    _cancelTextInput();
}

// ============================================================================
// COMPOSITE IMAGE (burn in markup + metadata)
// ============================================================================

function _compositeMarkupImage() {
    var img = _markupState.photoImg;
    var markupCanvas = _markupState.canvas;
    if (!img) return _markupState.imageDataUrl;

    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var meta = _markupState.metadata;

    // Build metadata text parts
    var parts = [];
    var gpsStr = _markupFormatGPS(meta.lat, meta.lon);
    if (gpsStr) parts.push(gpsStr);
    var tsStr = _markupFormatTimestamp(meta.timestamp);
    if (tsStr) parts.push(tsStr);
    var headStr = _markupFormatHeading(meta.heading);
    if (headStr) parts.push(headStr);

    var metaText = parts.join('   |   ');

    // Calculate strip dimensions
    var stripHeight = Math.max(50, Math.round(h * 0.055));
    var fontSize = Math.max(14, Math.round(stripHeight * 0.35));

    // Create composite canvas
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    var ctx = tempCanvas.getContext('2d');

    // 1. Draw the photo
    ctx.drawImage(img, 0, 0, w, h);

    // 2. Draw the markup canvas on top
    if (markupCanvas) {
        ctx.drawImage(markupCanvas, 0, 0, w, h);
    }

    // 3. Draw metadata strip at bottom
    if (metaText) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, h - stripHeight, w, stripHeight);

        ctx.font = fontSize + 'px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.textBaseline = 'middle';

        var textMetrics = ctx.measureText(metaText);
        var x = (w - textMetrics.width) / 2;
        if (x < 10) x = 10;
        var y = h - stripHeight / 2;

        ctx.fillText(metaText, x, y);
    }

    return tempCanvas.toDataURL('image/jpeg', 0.9);
}

// ============================================================================
// SAVE / DISCARD
// ============================================================================

function _saveMarkup() {
    var dataUrl = _compositeMarkupImage();

    // Save to sessionStorage as backup
    try {
        sessionStorage.setItem(STORAGE_KEYS.MARKUP_PHOTO, dataUrl);
    } catch (e) {
        console.warn('[MARKUP] sessionStorage save failed:', e);
    }

    var resolve = _markupState.resolvePromise;
    _closeMarkupOverlay();

    if (resolve) resolve(dataUrl);
}

function _discardMarkup() {
    // Show confirmation
    var popup = document.createElement('div');
    popup.id = 'markupDiscardPopup';
    popup.className = 'fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4';
    popup.innerHTML =
        '<div class="bg-white rounded-xl p-5 w-full max-w-xs shadow-lg text-center">' +
            '<p class="text-sm font-bold text-slate-800 mb-4">Discard markup?</p>' +
            '<div class="flex gap-3">' +
                '<button onclick="_cancelDiscard()" class="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg text-sm" style="min-height:44px;">Cancel</button>' +
                '<button onclick="_confirmDiscard()" class="flex-1 px-4 py-2.5 bg-red-500 text-white font-bold rounded-lg text-sm" style="min-height:44px;">Discard</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(popup);
}

function _cancelDiscard() {
    var popup = document.getElementById('markupDiscardPopup');
    if (popup) popup.remove();
}

function _confirmDiscard() {
    var popup = document.getElementById('markupDiscardPopup');
    if (popup) popup.remove();

    var resolve = _markupState.resolvePromise;
    _closeMarkupOverlay();

    if (resolve) resolve(null);
}

// ============================================================================
// CLEANUP
// ============================================================================

function _closeMarkupOverlay() {
    window.removeEventListener('resize', _repositionMarkupCanvas);

    var canvas = _markupState.canvas;
    if (canvas) {
        canvas.removeEventListener('touchstart', _onMarkupTouchStart);
        canvas.removeEventListener('touchmove', _onMarkupTouchMove);
        canvas.removeEventListener('touchend', _onMarkupTouchEnd);
        canvas.removeEventListener('mousedown', _onMarkupMouseDown);
        canvas.removeEventListener('mousemove', _onMarkupMouseMove);
        canvas.removeEventListener('mouseup', _onMarkupMouseUp);
    }

    var overlay = document.getElementById('photoMarkupOverlay');
    if (overlay) overlay.remove();

    var textPopup = document.getElementById('markupTextPopup');
    if (textPopup) textPopup.remove();

    var discardPopup = document.getElementById('markupDiscardPopup');
    if (discardPopup) discardPopup.remove();

    _markupState.active = false;
    _markupState.canvas = null;
    _markupState.ctx = null;
    _markupState.photoImg = null;
    _markupState.elements = [];
    _markupState.overlay = null;
    _markupState.resolvePromise = null;
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

window.openPhotoMarkup = openPhotoMarkup;
