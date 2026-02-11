function togglePanel(panelId, trigger) {
    var panel = document.getElementById(panelId);

    // Mutual exclusion for conditions bar panels
    var mutualPanels = { weatherDetailsPanel: 'droneOpsPanel', droneOpsPanel: 'weatherDetailsPanel' };
    if (mutualPanels[panelId]) {
        var otherPanel = document.getElementById(mutualPanels[panelId]);
        if (otherPanel && !otherPanel.classList.contains('hidden')) {
            otherPanel.classList.add('hidden');
            // Reset the other panel's trigger chevron
            var otherTrigger = document.querySelector('[onclick*="' + mutualPanels[panelId] + '"]');
            if (otherTrigger) {
                var otherChevron = otherTrigger.querySelector('.fa-chevron-down');
                if (otherChevron) otherChevron.style.transform = '';
            }
        }
    }

    panel.classList.toggle('hidden');
    var chevron = trigger ? trigger.querySelector('.fa-chevron-down') : null;
    if (chevron) {
        chevron.style.transform = panel.classList.contains('hidden') ? '' : 'rotate(180deg)';
    }
    // Lazy-load panel content on first open
    if (!panel.classList.contains('hidden') && typeof onPanelOpen === 'function') {
        onPanelOpen(panelId);
    }
}
