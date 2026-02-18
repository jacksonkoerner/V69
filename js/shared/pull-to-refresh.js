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
            // Flush pending work before reload
            if (typeof flushInterviewBackup === 'function') flushInterviewBackup();
            if (typeof flushReportBackup === 'function') flushReportBackup();
            setTimeout(function() { location.reload(); }, 300);
        } else if (indicator) {
            indicator.style.height = '0';
        }
    }, { passive: true });
})();
