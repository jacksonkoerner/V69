// ============================================================================
// FieldVoice Pro v6 - Report Page: Debug Tool
// Extracted from report.js (lines ~2461-2901)
//
// Contains: detectFieldMismatches, initializeDebugPanel, updateDebugIssues,
//   toggleDebugPanel, toggleDebugSection, scrollToDebugPanel,
//   dismissDebugBanner, formatDebugTimestamp, downloadDebugJSON,
//   downloadDebugMarkdown
// ============================================================================

var RS = window.reportState;

// State
var fieldMappingIssues = [];
var debugBannerDismissed = false;

// ============ DEBUG TOOL ============

/**
 * Detect field mapping mismatches between AI response and expected structure
 * Returns array of issue objects: { type: 'schema'|'empty'|'type'|'contractor', field: string, message: string }
 */
function detectFieldMismatches() {
    var issues = [];
    var ai = RS.report.aiGenerated;

    if (!ai) {
        return issues; // No AI data to check
    }

    // Expected top-level keys in aiGenerated
    var expectedTopLevelKeys = [
        'activities', 'generalIssues', 'qaqcNotes', 'safety',
        'contractorCommunications', 'visitorsRemarks', 'operations', 'equipment'
    ];

    // a) Schema mismatches - check for unexpected top-level keys
    Object.keys(ai).forEach(function(key) {
        if (!expectedTopLevelKeys.includes(key)) {
            issues.push({
                type: 'schema',
                field: 'aiGenerated.' + key,
                message: 'Unexpected top-level key "' + key + '" in AI response'
            });
        }
    });

    // Check activities structure
    if (ai.activities && Array.isArray(ai.activities)) {
        ai.activities.forEach(function(activity, index) {
            var expectedActivityKeys = ['contractorId', 'narrative', 'noWork', 'equipmentUsed', 'crew'];
            Object.keys(activity).forEach(function(key) {
                if (!expectedActivityKeys.includes(key)) {
                    issues.push({
                        type: 'schema',
                        field: 'aiGenerated.activities[' + index + '].' + key,
                        message: 'Unexpected key "' + key + '" in activity at index ' + index
                    });
                }
            });
        });
    }

    // Check safety structure
    if (ai.safety && typeof ai.safety === 'object') {
        var expectedSafetyKeys = ['notes', 'hasIncident', 'noIncidents'];
        Object.keys(ai.safety).forEach(function(key) {
            if (!expectedSafetyKeys.includes(key)) {
                issues.push({
                    type: 'schema',
                    field: 'aiGenerated.safety.' + key,
                    message: 'Unexpected key "' + key + '" in safety section'
                });
            }
        });
    }

    // Check operations structure
    if (ai.operations && Array.isArray(ai.operations)) {
        ai.operations.forEach(function(op, index) {
            var expectedOpKeys = ['contractorId', 'superintendents', 'foremen', 'operators', 'laborers', 'surveyors', 'others'];
            Object.keys(op).forEach(function(key) {
                if (!expectedOpKeys.includes(key)) {
                    issues.push({
                        type: 'schema',
                        field: 'aiGenerated.operations[' + index + '].' + key,
                        message: 'Unexpected key "' + key + '" in operations at index ' + index
                    });
                }
            });
        });
    }

    // b) Empty responses - AI returned null/empty when fieldNotes had content
    var fieldNotes = RS.report.fieldNotes || {};
    var guidedNotes = RS.report.guidedNotes || {};

    // Check if AI generalIssues is empty but guidedNotes.issues has content
    if (guidedNotes.issues && guidedNotes.issues.trim()) {
        var aiIssues = ai.generalIssues;
        if (!aiIssues || (Array.isArray(aiIssues) && aiIssues.length === 0) || aiIssues === '') {
            issues.push({
                type: 'empty',
                field: 'aiGenerated.generalIssues',
                message: 'AI returned empty generalIssues but guidedNotes.issues has content'
            });
        }
    }

    // Check if AI safety.notes is empty but guidedNotes.safety has content
    if (guidedNotes.safety && guidedNotes.safety.trim()) {
        var aiSafetyNotes = ai.safety?.notes;
        if (!aiSafetyNotes || (Array.isArray(aiSafetyNotes) && aiSafetyNotes.length === 0) || aiSafetyNotes === '') {
            issues.push({
                type: 'empty',
                field: 'aiGenerated.safety.notes',
                message: 'AI returned empty safety.notes but guidedNotes.safety has content'
            });
        }
    }

    // Check if AI activities is empty but guidedNotes.workSummary has content
    if (guidedNotes.workSummary && guidedNotes.workSummary.trim()) {
        var aiActivities = ai.activities;
        if (!aiActivities || (Array.isArray(aiActivities) && aiActivities.length === 0)) {
            issues.push({
                type: 'empty',
                field: 'aiGenerated.activities',
                message: 'AI returned empty activities but guidedNotes.workSummary has content'
            });
        }
    }

    // c) Type mismatches - expected array but got string or vice versa
    var arrayFields = ['generalIssues', 'qaqcNotes', 'activities', 'operations', 'equipment'];
    arrayFields.forEach(function(fieldName) {
        var value = ai[fieldName];
        if (value !== undefined && value !== null) {
            if (typeof value === 'string' && value.trim() !== '') {
                issues.push({
                    type: 'type',
                    field: 'aiGenerated.' + fieldName,
                    message: 'Expected array for "' + fieldName + '" but got string'
                });
            }
        }
    });

    // Check safety.notes - should be array or string
    if (ai.safety?.notes !== undefined && ai.safety?.notes !== null) {
        // This is acceptable as either array or string, but flag if it's something else
        var notesType = typeof ai.safety.notes;
        if (notesType !== 'string' && !Array.isArray(ai.safety.notes)) {
            issues.push({
                type: 'type',
                field: 'aiGenerated.safety.notes',
                message: 'Expected array or string for "safety.notes" but got ' + notesType
            });
        }
    }

    // d) ContractorId mismatches - AI contractorId doesn't match any project contractor
    var validContractorIds = RS.projectContractors.map(function(c) { return c.id; });

    if (ai.activities && Array.isArray(ai.activities)) {
        ai.activities.forEach(function(activity, index) {
            if (activity.contractorId && !validContractorIds.includes(activity.contractorId)) {
                issues.push({
                    type: 'contractor',
                    field: 'aiGenerated.activities[' + index + '].contractorId',
                    message: 'ContractorId "' + activity.contractorId + '" doesn\'t match any project contractor'
                });
            }
        });
    }

    if (ai.operations && Array.isArray(ai.operations)) {
        ai.operations.forEach(function(op, index) {
            if (op.contractorId && !validContractorIds.includes(op.contractorId)) {
                issues.push({
                    type: 'contractor',
                    field: 'aiGenerated.operations[' + index + '].contractorId',
                    message: 'ContractorId "' + op.contractorId + '" doesn\'t match any project contractor'
                });
            }
        });
    }

    if (ai.equipment && Array.isArray(ai.equipment)) {
        ai.equipment.forEach(function(equip, index) {
            if (equip.contractorId && !validContractorIds.includes(equip.contractorId)) {
                issues.push({
                    type: 'contractor',
                    field: 'aiGenerated.equipment[' + index + '].contractorId',
                    message: 'ContractorId "' + equip.contractorId + '" doesn\'t match any project contractor'
                });
            }
        });
    }

    return issues;
}

/**
 * Initialize debug panel with current data
 */
function initializeDebugPanel() {
    // Detect issues
    fieldMappingIssues = detectFieldMismatches();

    // Update AI Response Data section
    var aiContent = document.getElementById('debugAIContent');
    if (RS.report.aiGenerated) {
        aiContent.textContent = JSON.stringify(RS.report.aiGenerated, null, 2);
    } else {
        aiContent.textContent = 'No AI response data';
    }

    // Update Field Notes section
    var fieldNotesContent = document.getElementById('debugFieldNotesContent');
    var fieldNotesData = {
        fieldNotes: RS.report.fieldNotes || {},
        guidedNotes: RS.report.guidedNotes || {}
    };
    fieldNotesContent.textContent = JSON.stringify(fieldNotesData, null, 2);

    // Update User Edits section
    var userEditsContent = document.getElementById('debugUserEditsContent');
    if (RS.report.userEdits && Object.keys(RS.report.userEdits).length > 0) {
        userEditsContent.textContent = JSON.stringify(RS.report.userEdits, null, 2);
    } else {
        userEditsContent.textContent = 'No user edits';
    }

    // Update Current State section
    var currentStateContent = document.getElementById('debugCurrentStateContent');
    var currentState = {
        activities: RS.report.activities || [],
        operations: RS.report.operations || [],
        equipment: RS.report.equipment || []
    };
    currentStateContent.textContent = JSON.stringify(currentState, null, 2);

    // Update Issues section
    updateDebugIssues();

    // Show/hide banner based on issues
    if (fieldMappingIssues.length > 0 && !debugBannerDismissed) {
        document.getElementById('debugIssueBanner').classList.remove('hidden');
    }
}

/**
 * Update the debug issues display
 */
function updateDebugIssues() {
    var issuesContainer = document.getElementById('debugIssuesContent');
    var issueCount = document.getElementById('debugIssueCount');

    issueCount.textContent = fieldMappingIssues.length;

    if (fieldMappingIssues.length === 0) {
        issuesContainer.innerHTML = '<p class="text-sm text-green-600"><i class="fas fa-check-circle mr-1"></i>No issues detected</p>';
        issueCount.classList.remove('bg-yellow-500');
        issueCount.classList.add('bg-green-500');
    } else {
        issueCount.classList.remove('bg-green-500');
        issueCount.classList.add('bg-yellow-500');
        issuesContainer.innerHTML = fieldMappingIssues.map(function(issue) {
            return '<div class="debug-issue ' + issue.type + '">' +
                '<div class="debug-issue-type">' + escapeHtml(issue.type) + '</div>' +
                '<div class="font-medium text-slate-700">' + escapeHtml(issue.field) + '</div>' +
                '<div class="text-slate-600">' + escapeHtml(issue.message) + '</div>' +
            '</div>';
        }).join('');
    }
}

/**
 * Toggle debug panel expanded/collapsed
 */
function toggleDebugPanel() {
    var panel = document.getElementById('debugPanel');
    var chevron = document.getElementById('debugPanelChevron');

    panel.classList.toggle('collapsed');
    panel.classList.toggle('expanded');

    if (panel.classList.contains('expanded')) {
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-up');
    } else {
        chevron.classList.remove('fa-chevron-up');
        chevron.classList.add('fa-chevron-down');
    }
}

/**
 * Toggle debug section expanded/collapsed
 */
function toggleDebugSection(sectionName) {
    var section = document.getElementById('debugSection' + sectionName);
    var chevron = section.querySelector('.debug-chevron');

    section.classList.toggle('expanded');

    if (section.classList.contains('expanded')) {
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-up');
    } else {
        chevron.classList.remove('fa-chevron-up');
        chevron.classList.add('fa-chevron-down');
    }
}

/**
 * Scroll to debug panel and expand it
 */
function scrollToDebugPanel() {
    var panel = document.getElementById('debugPanel');

    // Expand the panel if collapsed
    if (panel.classList.contains('collapsed')) {
        toggleDebugPanel();
    }

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Dismiss the debug banner
 */
function dismissDebugBanner(event) {
    event.stopPropagation();
    debugBannerDismissed = true;
    document.getElementById('debugIssueBanner').classList.add('hidden');
}

/**
 * Format timestamp for filenames
 */
function formatDebugTimestamp() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');
    return year + '-' + month + '-' + day + '-' + hours + minutes + seconds;
}

/**
 * Download debug data as JSON
 */
function downloadDebugJSON() {
    var debugData = {
        exportedAt: new Date().toISOString(),
        reportDate: RS.report.overview?.date || '',
        projectName: RS.activeProject?.projectName || '',
        aiGenerated: RS.report.aiGenerated || null,
        fieldNotes: RS.report.fieldNotes || {},
        guidedNotes: RS.report.guidedNotes || {},
        userEdits: RS.report.userEdits || {},
        currentState: {
            activities: RS.report.activities || [],
            operations: RS.report.operations || [],
            equipment: RS.report.equipment || []
        },
        detectedIssues: fieldMappingIssues
    };

    var blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var filename = 'fieldvoice-debug-' + formatDebugTimestamp() + '.json';

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download debug data as Markdown
 */
function downloadDebugMarkdown() {
    var timestamp = new Date().toISOString();
    var reportDate = RS.report.overview?.date || 'Unknown';
    var projectName = RS.activeProject?.projectName || 'Unknown';

    var md = '# FieldVoice Debug Export\n\n';
    md += '**Exported:** ' + timestamp + '\n';
    md += '**Report Date:** ' + reportDate + '\n';
    md += '**Project:** ' + projectName + '\n\n';

    // Detected Issues
    md += '## Detected Issues\n\n';
    if (fieldMappingIssues.length === 0) {
        md += 'No issues detected.\n\n';
    } else {
        fieldMappingIssues.forEach(function(issue, index) {
            md += '### Issue ' + (index + 1) + ': ' + issue.type.toUpperCase() + '\n';
            md += '- **Field:** ' + issue.field + '\n';
            md += '- **Message:** ' + issue.message + '\n\n';
        });
    }

    // AI Generated Data
    md += '## AI Generated Data\n\n';
    if (RS.report.aiGenerated) {
        md += '```json\n' + JSON.stringify(RS.report.aiGenerated, null, 2) + '\n```\n\n';
    } else {
        md += 'No AI response data.\n\n';
    }

    // Raw Field Notes
    md += '## Raw Field Notes\n\n';
    md += '### Field Notes\n';
    md += '```json\n' + JSON.stringify(RS.report.fieldNotes || {}, null, 2) + '\n```\n\n';
    md += '### Guided Notes\n';
    md += '```json\n' + JSON.stringify(RS.report.guidedNotes || {}, null, 2) + '\n```\n\n';

    // User Edits
    md += '## User Edits\n\n';
    if (RS.report.userEdits && Object.keys(RS.report.userEdits).length > 0) {
        md += '```json\n' + JSON.stringify(RS.report.userEdits, null, 2) + '\n```\n\n';
    } else {
        md += 'No user edits.\n\n';
    }

    // Current Report State
    md += '## Current Report State\n\n';
    md += '### Activities\n';
    md += '```json\n' + JSON.stringify(RS.report.activities || [], null, 2) + '\n```\n\n';
    md += '### Operations\n';
    md += '```json\n' + JSON.stringify(RS.report.operations || [], null, 2) + '\n```\n\n';
    md += '### Equipment\n';
    md += '```json\n' + JSON.stringify(RS.report.equipment || [], null, 2) + '\n```\n\n';

    var blob = new Blob([md], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var filename = 'fieldvoice-debug-' + formatDebugTimestamp() + '.md';

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============ EXPOSE TO WINDOW ============
window.toggleDebugPanel = toggleDebugPanel;
window.toggleDebugSection = toggleDebugSection;
window.scrollToDebugPanel = scrollToDebugPanel;
window.dismissDebugBanner = dismissDebugBanner;
window.downloadDebugJSON = downloadDebugJSON;
window.downloadDebugMarkdown = downloadDebugMarkdown;
