function openFieldToolsModal() {
    document.getElementById('fieldToolsModal').classList.remove('hidden');
}
function closeFieldToolsModal() {
    document.getElementById('fieldToolsModal').classList.add('hidden');
}
function fieldToolAction(fn) {
    closeFieldToolsModal();
    fn();
}
(function() {
    var carousel = document.getElementById('toolsCarousel');
    var track = document.getElementById('toolsTrack');
    if (!carousel || !track) return;
    var resumeTimer = null;

    function pauseCarousel() {
        track.classList.add('paused');
        if (resumeTimer) clearTimeout(resumeTimer);
    }

    function scheduleResume() {
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(function() {
            track.classList.remove('paused');
        }, 3000);
    }

    carousel.addEventListener('touchstart', pauseCarousel, { passive: true });
    carousel.addEventListener('pointerdown', pauseCarousel);
    carousel.addEventListener('touchend', scheduleResume, { passive: true });
    carousel.addEventListener('pointerup', scheduleResume);
})();
