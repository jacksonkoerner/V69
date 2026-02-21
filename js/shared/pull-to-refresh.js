// Pull-to-refresh for mobile
// Touch gesture: pull down from top -> show indicator -> reload
(function() {
    var THRESHOLD = 80; // px to trigger
    var startY = 0;
    var pulling = false;
    var indicator = null;

    function createIndicator() {
        indicator = document.createElement('div');
        indicator.id = 'pullRefreshIndicator';
        indicator.style.cssText = 'position:fixed;top:0;left:0;right:0;height:0;background:rgba(249,115,22,0.15);display:flex;align-items:center;justify-content:center;z-index:9999;overflow:hidden;transition:height 0.2s;';
        indicator.innerHTML = '<i class="fas fa-arrow-down" style="color:#f97316;font-size:1.2rem;"></i>';
        document.body.prepend(indicator);
    }

    document.addEventListener('touchstart', function(e) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (!pulling) return;
        var dy = e.touches[0].clientY - startY;
        if (dy > 0 && dy < THRESHOLD * 2) {
            if (!indicator) createIndicator();
            indicator.style.height = Math.min(dy * 0.5, THRESHOLD) + 'px';
        }
    }, { passive: true });

    document.addEventListener('touchend', function() {
        if (!pulling) return;
        pulling = false;
        if (indicator && parseInt(indicator.style.height, 10) >= THRESHOLD * 0.8) {
            indicator.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#f97316;font-size:1.2rem;"></i>';
            // Flush pending work before refresh/reload
            if (typeof flushInterviewBackup === 'function') flushInterviewBackup();
            if (typeof flushReportBackup === 'function') flushReportBackup();
            setTimeout(function() {
                if (typeof window.manualRefresh === 'function') {
                    Promise.resolve(window.manualRefresh()).finally(function() {
                        if (indicator) {
                            indicator.style.height = '0';
                            indicator.innerHTML = '<i class="fas fa-arrow-down" style="color:#f97316;font-size:1.2rem;"></i>';
                        }
                    });
                } else {
                    location.reload();
                }
            }, 300);
        } else if (indicator) {
            indicator.style.height = '0';
        }
    }, { passive: true });

    // Desktop/laptop manual refresh button (hover-capable devices)
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
        function flushPendingBackups() {
            try {
                if (window.debugCapture && typeof window.debugCapture.flush === 'function') {
                    window.debugCapture.flush();
                }
            } catch (e) {}

            try {
                if (typeof window.drainPendingBackups === 'function') {
                    window.drainPendingBackups();
                }
            } catch (e) {}

            try {
                if (typeof flushReportBackup === 'function') {
                    flushReportBackup();
                }
            } catch (e) {}
        }

        function runManualRefresh() {
            flushPendingBackups();
            if (typeof window.manualRefresh === 'function') {
                window.manualRefresh();
            } else {
                location.reload();
            }
        }

        function injectDesktopRefreshButton() {
            if (document.getElementById('desktopRefreshButton')) return;

            var btn = document.createElement('button');
            btn.id = 'desktopRefreshButton';
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Refresh page');
            btn.innerHTML = '<i class="fas fa-sync-alt" aria-hidden="true"></i>';
            btn.style.cssText = [
                'position:fixed',
                'top:12px',
                'right:12px',
                'width:40px',
                'height:40px',
                'border:none',
                'border-radius:9999px',
                'background:#334155',
                'color:#fb923c',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'cursor:pointer',
                'z-index:9998',
                'box-shadow:0 6px 16px rgba(0,0,0,0.35)',
                'transition:transform 0.15s ease'
            ].join(';');

            btn.addEventListener('mouseenter', function() {
                btn.style.transform = 'scale(1.1)';
            });

            btn.addEventListener('mouseleave', function() {
                btn.style.transform = 'scale(1)';
            });

            btn.addEventListener('click', runManualRefresh);

            document.body.appendChild(btn);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectDesktopRefreshButton);
        } else {
            injectDesktopRefreshButton();
        }
    }
})();
