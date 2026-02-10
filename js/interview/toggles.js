// ============================================================
// js/interview/toggles.js — Toggle state management
// ============================================================

var IS = window.interviewState;

/**
 * Set a toggle state (locks immediately)
 * @param {string} section - The section identifier
 * @param {boolean} value - true = Yes, false = No
 * @returns {boolean} Success status
 */
function setToggleState(section, value) {
    // Check if toggle can be changed using report-rules.js
    if (IS.currentReportId && typeof canChangeToggle === 'function') {
        const canChange = canChangeToggle(IS.currentReportId, section);
        if (!canChange.allowed) {
            showToast(`Toggle locked: already set`, 'warning');
            return false;
        }
    }

    if (!IS.report.toggleStates) IS.report.toggleStates = {};
    IS.report.toggleStates[section] = value;  // true = Yes, false = No

    saveReport();
    return true;
}

/**
 * Get toggle state for a section
 * @param {string} section - The section identifier
 * @returns {boolean|null} Toggle state: true, false, or null if not set
 */
function getToggleState(section) {
    return IS.report.toggleStates?.[section] ?? null;  // null = not set
}

/**
 * Check if a toggle is locked
 * @param {string} section - The section identifier
 * @returns {boolean} True if toggle is locked
 */
function isToggleLocked(section) {
    return IS.report.toggleStates?.[section] !== undefined && IS.report.toggleStates?.[section] !== null;
}

/**
 * Render a toggle button pair for a section
 * @param {string} section - The section identifier
 * @param {string} label - The display label
 * @returns {string} HTML string for toggle buttons
 */
function renderToggleButtons(section, label) {
    const state = getToggleState(section);
    const locked = isToggleLocked(section);

    const yesClass = state === true
        ? 'bg-safety-green text-white border-safety-green'
        : 'bg-white text-slate-600 border-slate-300 hover:border-safety-green';
    const noClass = state === false
        ? 'bg-red-500 text-white border-red-500'
        : 'bg-white text-slate-600 border-slate-300 hover:border-red-500';

    const disabledAttr = locked ? 'disabled' : '';
    const lockedIcon = locked ? '<i class="fas fa-lock text-xs ml-1"></i>' : '';

    return `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 mb-3">
            <span class="text-sm font-medium text-slate-700">${label}</span>
            <div class="flex gap-2">
                <button
                    onclick="handleToggle('${section}', true)"
                    class="px-4 py-1.5 text-xs font-bold uppercase border-2 ${yesClass} transition-colors"
                    ${disabledAttr}
                >Yes${state === true ? lockedIcon : ''}</button>
                <button
                    onclick="handleToggle('${section}', false)"
                    class="px-4 py-1.5 text-xs font-bold uppercase border-2 ${noClass} transition-colors"
                    ${disabledAttr}
                >No${state === false ? lockedIcon : ''}</button>
            </div>
        </div>
    `;
}

/**
 * Handle toggle button click
 * @param {string} section - The section identifier
 * @param {boolean} value - The selected value
 */
function handleToggle(section, value) {
    if (isToggleLocked(section)) {
        showToast('Toggle is locked after selection', 'warning');
        return;
    }

    const success = setToggleState(section, value);
    if (success) {
        // Map toggle section names to render section names
        const sectionMap = {
            'communications_made': 'communications',
            'qaqc_performed': 'qaqc',
            'visitors_present': 'visitors',
            'personnel_onsite': 'personnel'
        };
        const renderSectionName = sectionMap[section] || section;

        // Re-render the section to show locked state
        renderSection(renderSectionName);
        updateAllPreviews();
        updateProgress();

        // v6.6: Initialize auto-save if toggle was set to Yes
        if (value === true) {
            const autoSaveMap = {
                'communications_made': { textareaId: 'communications-input', section: 'communications' },
                'qaqc_performed': { textareaId: 'qaqc-input', section: 'qaqc' },
                'visitors_present': { textareaId: 'visitors-input', section: 'visitors' }
            };
            const config = autoSaveMap[section];
            if (config) {
                // Small delay to ensure DOM is updated
                setTimeout(() => {
                    initGuidedAutoSave(config.textareaId, config.section);
                }, 100);
            }
        }
    }
}
