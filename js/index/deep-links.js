(function() {
    var params = new URLSearchParams(window.location.search);
    var tool = params.get('openTool');
    var panel = params.get('openPanel');
    var mapType = params.get('mapType');

    if (!tool && !panel) return;

    // Clean URL after reading params
    if (window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    // Wait for DOM + scripts to load
    window.addEventListener('load', function() {
        setTimeout(function() {
            if (tool) {
                var toolMap = {
                    'compass': function() { if (typeof openCompass === 'function') openCompass(); },
                    'calc': function() { if (typeof openCalc === 'function') openCalc(); },
                    'level': function() { if (typeof openLevel === 'function') openLevel(); },
                    'slope': function() { if (typeof openSlope === 'function') openSlope(); },
                    'maps': function() {
                        if (typeof openMapsOverlay === 'function') {
                            openMapsOverlay();
                            if (mapType && typeof switchMap === 'function') {
                                setTimeout(function() { switchMap(mapType); }, 500);
                            }
                        }
                    },
                    'qr': function() { if (typeof openQR === 'function') openQR(); },
                    'measure': function() { if (typeof openMeasure === 'function') openMeasure(); },
                    'ar': function() { if (typeof openARMeasure === 'function') openARMeasure(); },
                    'decibel': function() { if (typeof openDecibel === 'function') openDecibel(); },
                    'timer': function() { if (typeof openTimer === 'function') openTimer(); },
                    'flashlight': function() { if (typeof openFlashlight === 'function') openFlashlight(); },
                    'fieldtools': function() { if (typeof openFieldToolsModal === 'function') openFieldToolsModal(); }
                };
                if (toolMap[tool]) toolMap[tool]();
            }

            if (panel) {
                if (panel === 'emergencyPanel') {
                    var strip = document.getElementById('emergencyStrip');
                    if (strip) strip.click();
                } else {
                    var panelEl = document.getElementById(panel);
                    if (panelEl && panelEl.classList.contains('hidden')) {
                        var trigger = document.querySelector('[onclick*="' + panel + '"]');
                        if (trigger) {
                            trigger.click();
                            trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }
            }
        }, 600);
    });
})();
