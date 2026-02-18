// ============================================================================
// FieldVoice Pro v6 - Report Page: Form Fields
// Extracted from report.js (lines ~1219-2144, plus getCrewActivity ~3376-3400)
//
// Contains: populateAllFields, calculateShiftDuration, markUserEditedFields,
//   pathToFieldId, renderWorkSummary, getContractorActivity, toggleNoWork,
//   setupContractorListeners, updateContractorActivity,
//   renderPersonnelTable (form tab), getContractorOperations,
//   updatePersonnelRow, updatePersonnelTotals, getEquipmentData,
//   renderEquipmentTable (form tab), setupEquipmentListeners,
//   updateEquipmentRow, addEquipmentRow, renderPhotos, handlePhotoLoad,
//   handlePhotoError, debounce, saveTextFieldEdits, getCrewActivity
// ============================================================================

var RS = window.reportState;

// ============ POPULATE FIELDS ============
function populateAllFields() {
    // Display project logo if exists
    // Priority: logoUrl (full quality) > logoThumbnail (compressed) > logo (legacy)
    var logoContainer = document.getElementById('projectLogoContainer');
    var logoImg = document.getElementById('projectLogo');
    var logoSrc = RS.activeProject?.logoUrl || RS.activeProject?.logoThumbnail || RS.activeProject?.logo;
    if (logoSrc) {
        logoImg.src = logoSrc;
        logoContainer.classList.remove('hidden');
    } else {
        logoContainer.classList.add('hidden');
    }

    // Project Overview - Left Column
    document.getElementById('projectName').value = getValue('overview.projectName', RS.activeProject?.projectName || '');
    document.getElementById('noabProjectNo').value = getValue('overview.noabProjectNo', RS.activeProject?.noabProjectNo || '');
    document.getElementById('cnoSolicitationNo').value = getValue('overview.cnoSolicitationNo', RS.activeProject?.cnoSolicitationNo || 'N/A');

    // Notice to Proceed (display only from project config)
    var ntpInput = document.getElementById('noticeToProceed');
    if (RS.activeProject?.noticeToProceed) {
        ntpInput.value = RS.activeProject.noticeToProceed;
    }

    // Contract Duration (display only)
    var durationInput = document.getElementById('contractDuration');
    if (RS.activeProject?.contractDuration) {
        durationInput.value = RS.activeProject.contractDuration + ' days';
    }

    // Expected Completion (display only from project config)
    var expectedInput = document.getElementById('expectedCompletion');
    if (RS.activeProject?.expectedCompletion) {
        expectedInput.value = RS.activeProject.expectedCompletion;
    }

    // Contract Day — auto-calculate from Notice to Proceed date
    var contractDayInput = document.getElementById('contractDay');
    var userContractDay = getValue('overview.contractDay', '');
    if (userContractDay) {
        // User manually set it
        contractDayInput.value = userContractDay;
    } else if (RS.activeProject?.noticeToProceed) {
        // Auto-calculate: days between NTP and report date
        try {
            var ntpParts = RS.activeProject.noticeToProceed.split('-');
            var ntpDateObj = new Date(ntpParts[0], ntpParts[1] - 1, ntpParts[2]);
            var reportDateStr = getReportDateStr();
            var rdParts = reportDateStr.split('-');
            var reportDateObj = new Date(rdParts[0], rdParts[1] - 1, rdParts[2]);
            var diffMs = reportDateObj - ntpDateObj;
            var dayNum = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // Day 1 = NTP date
            if (dayNum > 0) {
                var totalDays = RS.activeProject.contractDuration || '';
                contractDayInput.value = totalDays ? 'Day ' + dayNum + ' of ' + totalDays : 'Day ' + dayNum;
            }
        } catch (e) {
            console.warn('[CONTRACT DAY] Could not calculate:', e);
        }
    }

    // Weather Days (editable)
    document.getElementById('weatherDaysCount').value = getValue('overview.weatherDays', RS.activeProject?.weatherDays || 0);

    // Project Overview - Right Column
    // Date - v6.6.23: Use getLocalDateString to avoid timezone issues
    var dateStr = getValue('overview.date', getLocalDateString());
    var dateInput = document.getElementById('reportDate');
    try {
        var d = new Date(dateStr + 'T12:00:00'); // Add noon time to avoid timezone shift
        dateInput.value = getLocalDateString(d);
    } catch (e) {
        dateInput.value = getLocalDateString();
    }

    document.getElementById('projectLocation').value = getValue('overview.location', RS.activeProject?.location || '');
    document.getElementById('engineer').value = getValue('overview.engineer', RS.activeProject?.engineer || '');
    document.getElementById('contractor').value = getValue('overview.contractor', RS.activeProject?.primeContractor || '');

    // Start/End Time (editable, defaults from project config)
    document.getElementById('startTime').value = getValue('overview.startTime', RS.activeProject?.defaultStartTime || '06:00');
    document.getElementById('endTime').value = getValue('overview.endTime', RS.activeProject?.defaultEndTime || '16:00');

    // Calculate and display shift duration
    calculateShiftDuration();

    document.getElementById('completedBy').value = getValue('overview.completedBy', RS.userSettings?.fullName || '');

    // Weather
    document.getElementById('weatherHigh').value = getValue('overview.weather.highTemp', '');
    document.getElementById('weatherLow').value = getValue('overview.weather.lowTemp', '');
    document.getElementById('weatherPrecip').value = getValue('overview.weather.precipitation', '');
    document.getElementById('weatherCondition').value = getValue('overview.weather.generalCondition', '');
    document.getElementById('weatherJobSite').value = getValue('overview.weather.jobSiteCondition', '');
    document.getElementById('weatherAdverse').value = getValue('overview.weather.adverseConditions', '');

    // Text sections - check AI-generated paths with correct field names
    // Priority: userEdits > aiGenerated > guidedNotes/fieldNotes > report defaults
    // v6.6: Updated field names (issues_delays, qaqc_notes, communications, visitors_deliveries, safety.summary)
    document.getElementById('issuesText').value = getTextFieldValue('issues', 'issues_delays',
        RS.report.guidedNotes?.issues || '', 'generalIssues');
    document.getElementById('qaqcText').value = getTextFieldValue('qaqc', 'qaqc_notes', '', 'qaqcNotes');
    document.getElementById('safetyText').value = getTextFieldValue('safety.notes', 'safety.summary',
        RS.report.guidedNotes?.safety || '', 'safety.notes');
    document.getElementById('communicationsText').value = getTextFieldValue('communications',
        'communications', '', 'contractorCommunications');
    document.getElementById('visitorsText').value = getTextFieldValue('visitors', 'visitors_deliveries', '', 'visitorsRemarks');

    // Safety incident toggle
    // v6.6: Check both old (hasIncident/hasIncidents) and new (has_incidents) field names
    var hasIncident = getValue('safety.hasIncident', false) ||
                        RS.report.aiGenerated?.safety?.has_incidents ||
                        RS.report.aiGenerated?.safety?.hasIncidents ||
                        false;
    document.getElementById('safetyNoIncident').checked = !hasIncident;
    document.getElementById('safetyHasIncident').checked = hasIncident;

    // Signature — default to user settings if no manual entry
    document.getElementById('signatureName').value = getValue('signature.name', RS.userSettings?.fullName || '');
    document.getElementById('signatureTitle').value = getValue('signature.title', RS.userSettings?.title || '');
    document.getElementById('signatureCompany').value = getValue('signature.company', RS.userSettings?.company || '');
    document.getElementById('signatureDate').textContent = new Date().toLocaleDateString();

    // Render dynamic sections
    renderWorkSummary();
    renderPersonnelTable();
    renderEquipmentTable();
    renderPhotos();

    // Mark user-edited fields
    markUserEditedFields();
}

function calculateShiftDuration() {
    var startTime = document.getElementById('startTime').value;
    var endTime = document.getElementById('endTime').value;
    var durationInput = document.getElementById('shiftDuration');

    if (startTime && endTime) {
        var start = new Date('2000-01-01T' + startTime);
        var end = new Date('2000-01-01T' + endTime);
        var diffMs = end - start;

        // Handle overnight shifts
        if (diffMs < 0) {
            diffMs += 24 * 60 * 60 * 1000;
        }

        var hours = Math.floor(diffMs / (1000 * 60 * 60));
        var minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (minutes > 0) {
            durationInput.value = hours + 'h ' + minutes + 'm';
        } else {
            durationInput.value = hours + ' hours';
        }
    } else {
        durationInput.value = '';
    }
}

function markUserEditedFields() {
    Object.keys(RS.userEdits).forEach(function(path) {
        var fieldId = pathToFieldId(path);
        var field = document.getElementById(fieldId);
        if (field) {
            field.classList.add('user-edited');
        }
    });
}

function pathToFieldId(path) {
    // Convert paths like 'overview.projectName' to 'projectName'
    var mapping = {
        'overview.projectName': 'projectName',
        'overview.noabProjectNo': 'noabProjectNo',
        'overview.cnoSolicitationNo': 'cnoSolicitationNo',
        'overview.location': 'projectLocation',
        'overview.contractDay': 'contractDay',
        'overview.weatherDays': 'weatherDaysCount',
        'overview.engineer': 'engineer',
        'overview.contractor': 'contractor',
        'overview.startTime': 'startTime',
        'overview.endTime': 'endTime',
        'overview.completedBy': 'completedBy',
        'overview.weather.highTemp': 'weatherHigh',
        'overview.weather.lowTemp': 'weatherLow',
        'overview.weather.precipitation': 'weatherPrecip',
        'overview.weather.generalCondition': 'weatherCondition',
        'overview.weather.jobSiteCondition': 'weatherJobSite',
        'overview.weather.adverseConditions': 'weatherAdverse',
        'issues': 'issuesText',
        'qaqc': 'qaqcText',
        'safety.notes': 'safetyText',
        'communications': 'communicationsText',
        'visitors': 'visitorsText',
        'signature.name': 'signatureName',
        'signature.title': 'signatureTitle',
        'signature.company': 'signatureCompany'
    };
    return mapping[path] || path;
}

// ============ RENDER WORK SUMMARY ============
function renderWorkSummary() {
    var container = document.getElementById('workSummaryContainer');

    if (RS.projectContractors.length === 0) {
        // Show simplified work summary if no contractors defined
        container.innerHTML =
            '<div class="bg-slate-50 border border-slate-200 p-4 rounded">' +
                '<p class="text-xs font-bold text-slate-500 uppercase mb-2">Work Summary</p>' +
                '<textarea id="generalWorkSummary" class="editable-field auto-expand w-full px-3 py-2 text-sm"' +
                    ' placeholder="Describe all work performed today..."' +
                    ' data-path="guidedNotes.workSummary">' + escapeHtml(getValue('guidedNotes.workSummary', '')) + '</textarea>' +
                '<p class="text-xs text-slate-400 mt-1">No project contractors defined. Add contractors in Project Settings.</p>' +
            '</div>';
        initAllAutoExpandTextareas();
        return;
    }

    // Render contractor cards
    container.innerHTML = RS.projectContractors.map(function(contractor, index) {
        var activity = getContractorActivity(contractor.id);
        var noWork = activity?.noWork ?? true;
        var narrative = activity?.narrative || '';
        var equipment = activity?.equipmentUsed || '';
        var crew = activity?.crew || '';

        var typeLabel = contractor.type === 'prime' ? 'PRIME' : 'SUB';
        var borderColor = contractor.type === 'prime' ? 'border-safety-green' : 'border-dot-blue';
        var badgeBg = contractor.type === 'prime' ? 'bg-safety-green' : 'bg-dot-blue';

        return '<div class="contractor-card rounded ' + (noWork && !narrative ? 'no-work' : 'has-content') + '" data-contractor-id="' + contractor.id + '">' +
            '<div class="p-4">' +
                '<div class="flex items-center gap-3 mb-3">' +
                    '<span class="' + badgeBg + ' text-white text-[10px] font-bold px-2 py-0.5 uppercase">' + typeLabel + '</span>' +
                    '<span class="font-bold text-slate-800">' + escapeHtml(contractor.name) + '</span>' +
                    (contractor.trades ? '<span class="text-xs text-slate-500">(' + escapeHtml(contractor.trades) + ')</span>' : '') +
                '</div>' +

                '<label class="flex items-center gap-2 p-2 bg-slate-100 border border-slate-200 cursor-pointer mb-3">' +
                    '<input type="checkbox" class="w-4 h-4 no-work-checkbox"' +
                        ' data-contractor-id="' + contractor.id + '"' +
                        (noWork ? ' checked' : '') +
                        ' onchange="toggleNoWork(\'' + contractor.id + '\', this.checked)">' +
                    '<span class="text-sm text-slate-600">No work performed today</span>' +
                '</label>' +

                '<div class="work-fields ' + (noWork ? 'hidden' : '') + '" data-contractor-id="' + contractor.id + '">' +
                    '<div class="mb-3">' +
                        '<div class="flex items-center justify-between mb-1">' +
                            '<label class="block text-xs font-bold text-slate-500 uppercase">Work Narrative</label>' +
                            '<button data-refine-for="narrative_' + contractor.id + '" onclick="refineContractorNarrative(\'' + contractor.id + '\')" class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase transition-colors rounded flex items-center gap-1">' +
                                '<i class="fas fa-magic"></i> Refine' +
                            '</button>' +
                        '</div>' +
                        '<textarea id="narrative_' + contractor.id + '" class="editable-field auto-expand w-full px-3 py-2 text-sm contractor-narrative"' +
                            ' data-contractor-id="' + contractor.id + '"' +
                            ' placeholder="Describe work performed by ' + contractor.name + '...">' + escapeHtml(narrative) + '</textarea>' +
                    '</div>' +
                    '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                        '<div>' +
                            '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Equipment Used</label>' +
                            '<input type="text" class="editable-field w-full px-3 py-2 text-sm contractor-equipment"' +
                                ' data-contractor-id="' + contractor.id + '"' +
                                ' placeholder="e.g., Excavator (1), Dump Truck (2)"' +
                                ' value="' + escapeHtml(equipment) + '">' +
                        '</div>' +
                        '<div>' +
                            '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Crew</label>' +
                            '<input type="text" class="editable-field w-full px-3 py-2 text-sm contractor-crew"' +
                                ' data-contractor-id="' + contractor.id + '"' +
                                ' placeholder="e.g., Foreman (1), Laborers (4)"' +
                                ' value="' + escapeHtml(crew) + '">' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    initAllAutoExpandTextareas();
    setupContractorListeners();
}

/**
 * Get contractor activity with priority: userEdits > aiGenerated > report.activities
 * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
 */
function getContractorActivity(contractorId) {
    // Check if user has edited this contractor's activity
    var userEditKey = 'activity_' + contractorId;
    if (RS.userEdits[userEditKey]) {
        return RS.userEdits[userEditKey];
    }

    // Get contractor name for freeform matching
    var contractor = RS.projectContractors.find(function(c) { return c.id === contractorId; });
    var contractorName = contractor?.name;

    // Check AI-generated activities first
    if (RS.report.aiGenerated?.activities) {
        // Try matching by contractorId first (guided mode)
        var aiActivity = RS.report.aiGenerated.activities.find(function(a) { return a.contractorId === contractorId; });

        // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
        if (!aiActivity && contractorName) {
            aiActivity = RS.report.aiGenerated.activities.find(function(a) {
                return a.contractorId === null &&
                    a.contractorName?.toLowerCase() === contractorName.toLowerCase();
            });
        }

        if (aiActivity) {
            return {
                contractorId: contractorId,
                noWork: aiActivity.noWork ?? false,
                narrative: aiActivity.narrative || '',
                equipmentUsed: aiActivity.equipmentUsed || '',
                crew: aiActivity.crew || ''
            };
        }
    }

    // Fall back to report.activities
    if (!RS.report.activities) return null;
    return RS.report.activities.find(function(a) { return a.contractorId === contractorId; });
}

function toggleNoWork(contractorId, isNoWork) {
    var workFields = document.querySelector('.work-fields[data-contractor-id="' + contractorId + '"]');
    var card = document.querySelector('.contractor-card[data-contractor-id="' + contractorId + '"]');

    if (isNoWork) {
        workFields.classList.add('hidden');
        card.classList.add('no-work');
        card.classList.remove('has-content');
    } else {
        workFields.classList.remove('hidden');
        card.classList.remove('no-work');
        card.classList.add('has-content');
        // Focus narrative field
        var narrative = workFields.querySelector('.contractor-narrative');
        if (narrative) setTimeout(function() { narrative.focus(); }, 100);
    }

    updateContractorActivity(contractorId);
}

function setupContractorListeners() {
    // Narrative textareas - auto-save on input (debounced) AND blur (immediate)
    document.querySelectorAll('.contractor-narrative').forEach(function(el) {
        // Save to memory immediately on every keystroke, debounced persist
        el.addEventListener('input', function() {
            updateContractorActivity(el.dataset.contractorId);
            el.classList.add('user-edited');
            scheduleSave();
        });
        // Immediate save on blur (safety net)
        el.addEventListener('blur', function() {
            if (RS.saveTimeout) {
                clearTimeout(RS.saveTimeout);
                RS.saveTimeout = null;
            }
            updateContractorActivity(el.dataset.contractorId);
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    });

    // Equipment inputs - auto-save on input AND blur
    document.querySelectorAll('.contractor-equipment').forEach(function(el) {
        el.addEventListener('input', function() {
            updateContractorActivity(el.dataset.contractorId);
            scheduleSave();
        });
        el.addEventListener('blur', function() {
            if (RS.saveTimeout) {
                clearTimeout(RS.saveTimeout);
                RS.saveTimeout = null;
            }
            updateContractorActivity(el.dataset.contractorId);
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    });

    // Crew inputs - auto-save on input AND blur
    document.querySelectorAll('.contractor-crew').forEach(function(el) {
        el.addEventListener('input', function() {
            updateContractorActivity(el.dataset.contractorId);
            scheduleSave();
        });
        el.addEventListener('blur', function() {
            if (RS.saveTimeout) {
                clearTimeout(RS.saveTimeout);
                RS.saveTimeout = null;
            }
            updateContractorActivity(el.dataset.contractorId);
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    });
}

function updateContractorActivity(contractorId) {
    if (!RS.report.activities) RS.report.activities = [];

    var checkbox = document.querySelector('.no-work-checkbox[data-contractor-id="' + contractorId + '"]');
    var narrative = document.querySelector('.contractor-narrative[data-contractor-id="' + contractorId + '"]');
    var equipment = document.querySelector('.contractor-equipment[data-contractor-id="' + contractorId + '"]');
    var crew = document.querySelector('.contractor-crew[data-contractor-id="' + contractorId + '"]');

    var activity = RS.report.activities.find(function(a) { return a.contractorId === contractorId; });
    if (!activity) {
        activity = { contractorId: contractorId };
        RS.report.activities.push(activity);
    }

    activity.noWork = checkbox?.checked ?? true;
    activity.narrative = narrative?.value?.trim() || '';
    activity.equipmentUsed = equipment?.value?.trim() || '';
    activity.crew = crew?.value?.trim() || '';

    // Track in userEdits for persistence
    var userEditKey = 'activity_' + contractorId;
    RS.userEdits[userEditKey] = activity;
    RS.report.userEdits = RS.userEdits;

    // Add visual indicator to edited fields
    if (narrative) narrative.classList.add('user-edited');
    if (equipment) equipment.classList.add('user-edited');
    if (crew) crew.classList.add('user-edited');

    scheduleSave();
}

// ============ RENDER PERSONNEL TABLE ============
function renderPersonnelTable() {
    var tbody = document.getElementById('personnelTableBody');

    if (RS.projectContractors.length === 0) {
        tbody.innerHTML =
            '<tr>' +
                '<td colspan="9" class="text-center text-slate-400 py-4">' +
                    'No contractors defined. Add contractors in Project Settings.' +
                '</td>' +
            '</tr>';
        return;
    }

    tbody.innerHTML = RS.projectContractors.map(function(contractor) {
        var ops = getContractorOperations(contractor.id);
        return '<tr data-contractor-id="' + contractor.id + '">' +
            '<td class="font-medium text-xs">' + escapeHtml(contractor.abbreviation || contractor.name) + '</td>' +
            '<td class="text-xs">' + escapeHtml(contractor.trades || '-') + '</td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="superintendents" value="' + (ops?.superintendents || '') + '" min="0" placeholder="-"></td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="foremen" value="' + (ops?.foremen || '') + '" min="0" placeholder="-"></td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="operators" value="' + (ops?.operators || '') + '" min="0" placeholder="-"></td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="laborers" value="' + (ops?.laborers || '') + '" min="0" placeholder="-"></td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="surveyors" value="' + (ops?.surveyors || '') + '" min="0" placeholder="-"></td>' +
            '<td><input type="number" class="personnel-input" data-contractor-id="' + contractor.id + '" data-field="others" value="' + (ops?.others || '') + '" min="0" placeholder="-"></td>' +
            '<td class="text-center font-bold row-total">0</td>' +
        '</tr>';
    }).join('');

    // Setup listeners
    document.querySelectorAll('.personnel-input').forEach(function(input) {
        input.addEventListener('change', function() {
            updatePersonnelRow(input.dataset.contractorId);
            updatePersonnelTotals();
        });
    });

    updatePersonnelTotals();
}

/**
 * Get contractor operations/personnel with priority: userEdits > aiGenerated > report.operations
 * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
 */
function getContractorOperations(contractorId) {
    // Check if user has edited this contractor's operations
    var userEditKey = 'operations_' + contractorId;
    if (RS.userEdits[userEditKey]) {
        return RS.userEdits[userEditKey];
    }

    // Get contractor name for freeform matching
    var contractor = RS.projectContractors.find(function(c) { return c.id === contractorId; });
    var contractorName = contractor?.name;

    // Check AI-generated operations first
    if (RS.report.aiGenerated?.operations) {
        // Try matching by contractorId first (guided mode)
        var aiOps = RS.report.aiGenerated.operations.find(function(o) { return o.contractorId === contractorId; });

        // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
        if (!aiOps && contractorName) {
            aiOps = RS.report.aiGenerated.operations.find(function(o) {
                return o.contractorId === null &&
                    o.contractorName?.toLowerCase() === contractorName.toLowerCase();
            });
        }

        if (aiOps) {
            return {
                contractorId: contractorId,
                superintendents: aiOps.superintendents || null,
                foremen: aiOps.foremen || null,
                operators: aiOps.operators || null,
                laborers: aiOps.laborers || null,
                surveyors: aiOps.surveyors || null,
                others: aiOps.others || null
            };
        }
    }

    // Fall back to report.operations
    if (!RS.report.operations) return null;
    return RS.report.operations.find(function(o) { return o.contractorId === contractorId; });
}

function updatePersonnelRow(contractorId) {
    if (!RS.report.operations) RS.report.operations = [];

    var ops = RS.report.operations.find(function(o) { return o.contractorId === contractorId; });
    if (!ops) {
        ops = { contractorId: contractorId };
        RS.report.operations.push(ops);
    }

    var row = document.querySelector('tr[data-contractor-id="' + contractorId + '"]');
    var inputs = row.querySelectorAll('.personnel-input');

    var rowTotal = 0;
    inputs.forEach(function(input) {
        var value = parseInt(input.value) || 0;
        ops[input.dataset.field] = value || null;
        rowTotal += value;
        input.classList.add('user-edited');
    });

    // Track in userEdits for persistence
    var userEditKey = 'operations_' + contractorId;
    RS.userEdits[userEditKey] = ops;
    RS.report.userEdits = RS.userEdits;

    row.querySelector('.row-total').textContent = rowTotal || '-';
    scheduleSave();
}

function updatePersonnelTotals() {
    var fields = ['superintendents', 'foremen', 'operators', 'laborers', 'surveyors', 'others'];
    var totals = { superintendents: 0, foremen: 0, operators: 0, laborers: 0, surveyors: 0, others: 0 };
    var grandTotal = 0;

    document.querySelectorAll('.personnel-input').forEach(function(input) {
        var value = parseInt(input.value) || 0;
        totals[input.dataset.field] += value;
        grandTotal += value;
    });

    document.getElementById('totalSuper').textContent = totals.superintendents || '-';
    document.getElementById('totalForeman').textContent = totals.foremen || '-';
    document.getElementById('totalOperators').textContent = totals.operators || '-';
    document.getElementById('totalLaborers').textContent = totals.laborers || '-';
    document.getElementById('totalSurveyors').textContent = totals.surveyors || '-';
    document.getElementById('totalOthers').textContent = totals.others || '-';
    document.getElementById('totalAll').textContent = grandTotal || '-';
}

// ============ RENDER EQUIPMENT TABLE ============
/**
 * Get equipment data with priority: report.equipment (user edited) > aiGenerated.equipment
 * v6.6: Supports resolving contractorId from contractorName for freeform mode
 */
function getEquipmentData() {
    // If user has saved equipment data, use that
    if (RS.report.equipment && RS.report.equipment.length > 0) {
        return RS.report.equipment;
    }

    // Check AI-generated equipment
    if (RS.report.aiGenerated?.equipment && RS.report.aiGenerated.equipment.length > 0) {
        return RS.report.aiGenerated.equipment.map(function(aiItem) {
            // Try to match equipmentId to project config for type/model
            var type = aiItem.type || '';
            if (aiItem.equipmentId && RS.activeProject?.equipment) {
                var projectEquip = RS.activeProject.equipment.find(function(e) { return e.id === aiItem.equipmentId; });
                if (projectEquip) {
                    type = projectEquip.type || projectEquip.model || type;
                }
            }

            // v6.6: Resolve contractorId from contractorName for freeform mode
            var contractorId = aiItem.contractorId || '';
            if (!contractorId && aiItem.contractorName) {
                var matchedContractor = RS.projectContractors.find(function(c) {
                    return c.name?.toLowerCase() === aiItem.contractorName?.toLowerCase();
                });
                if (matchedContractor) {
                    contractorId = matchedContractor.id;
                }
            }

            return {
                contractorId: contractorId,
                contractorName: aiItem.contractorName || '',
                type: type,
                qty: aiItem.qty || aiItem.quantity || 1,
                status: aiItem.status || aiItem.hoursUsed ? aiItem.hoursUsed + ' hrs' : 'IDLE'
            };
        });
    }

    return [];
}

function renderEquipmentTable() {
    var tbody = document.getElementById('equipmentTableBody');
    var equipmentData = getEquipmentData();

    if (equipmentData.length === 0) {
        // Show empty state with one blank row
        tbody.innerHTML =
            '<tr data-equipment-index="0">' +
                '<td>' +
                    '<select class="equipment-contractor w-full text-xs p-1">' +
                        '<option value="">Select...</option>' +
                        RS.projectContractors.map(function(c) { return '<option value="' + c.id + '">' + escapeHtml(c.abbreviation || c.name) + '</option>'; }).join('') +
                    '</select>' +
                '</td>' +
                '<td><input type="text" class="equipment-type w-full text-xs" placeholder="e.g., CAT 320 Excavator"></td>' +
                '<td><input type="number" class="equipment-qty w-full text-xs text-center" value="1" min="1"></td>' +
                '<td>' +
                    '<select class="equipment-status w-full text-xs p-1">' +
                        '<option value="IDLE">IDLE</option>' +
                        [1,2,3,4,5,6,7,8,9,10].map(function(h) { return '<option value="' + h + ' hrs">' + h + ' hrs utilized</option>'; }).join('') +
                    '</select>' +
                '</td>' +
            '</tr>';
        setupEquipmentListeners();
        return;
    }

    tbody.innerHTML = equipmentData.map(function(item, index) {
        return '<tr data-equipment-index="' + index + '">' +
            '<td>' +
                '<select class="equipment-contractor w-full text-xs p-1">' +
                    '<option value="">Select...</option>' +
                    RS.projectContractors.map(function(c) { return '<option value="' + c.id + '"' + (item.contractorId === c.id ? ' selected' : '') + '>' + escapeHtml(c.abbreviation || c.name) + '</option>'; }).join('') +
                '</select>' +
            '</td>' +
            '<td><input type="text" class="equipment-type w-full text-xs" value="' + escapeHtml(item.type || '') + '" placeholder="e.g., CAT 320 Excavator"></td>' +
            '<td><input type="number" class="equipment-qty w-full text-xs text-center" value="' + (item.qty || 1) + '" min="1"></td>' +
            '<td>' +
                '<select class="equipment-status w-full text-xs p-1">' +
                    '<option value="IDLE"' + (item.status === 'IDLE' ? ' selected' : '') + '>IDLE</option>' +
                    [1,2,3,4,5,6,7,8,9,10].map(function(h) { return '<option value="' + h + ' hrs"' + (item.status === (h + ' hrs') ? ' selected' : '') + '>' + h + ' hrs utilized</option>'; }).join('') +
                '</select>' +
            '</td>' +
        '</tr>';
    }).join('');

    setupEquipmentListeners();
}

function setupEquipmentListeners() {
    document.querySelectorAll('#equipmentTableBody tr').forEach(function(row) {
        row.querySelectorAll('input, select').forEach(function(input) {
            input.addEventListener('change', function() { updateEquipmentRow(row); });
        });
    });
}

function updateEquipmentRow(row) {
    var index = parseInt(row.dataset.equipmentIndex);
    if (!RS.report.equipment) RS.report.equipment = [];

    var item = {
        contractorId: row.querySelector('.equipment-contractor').value,
        type: row.querySelector('.equipment-type').value.trim(),
        qty: parseInt(row.querySelector('.equipment-qty').value) || 1,
        status: row.querySelector('.equipment-status').value
    };

    if (index < RS.report.equipment.length) {
        RS.report.equipment[index] = item;
    } else {
        RS.report.equipment.push(item);
    }

    scheduleSave();
}

function addEquipmentRow() {
    var tbody = document.getElementById('equipmentTableBody');
    var newIndex = tbody.querySelectorAll('tr').length;

    var newRow = document.createElement('tr');
    newRow.dataset.equipmentIndex = newIndex;
    newRow.innerHTML =
        '<td>' +
            '<select class="equipment-contractor w-full text-xs p-1">' +
                '<option value="">Select...</option>' +
                RS.projectContractors.map(function(c) { return '<option value="' + c.id + '">' + escapeHtml(c.abbreviation || c.name) + '</option>'; }).join('') +
            '</select>' +
        '</td>' +
        '<td><input type="text" class="equipment-type w-full text-xs" placeholder="e.g., CAT 320 Excavator"></td>' +
        '<td><input type="number" class="equipment-qty w-full text-xs text-center" value="1" min="1"></td>' +
        '<td>' +
            '<select class="equipment-status w-full text-xs p-1">' +
                '<option value="IDLE">IDLE</option>' +
                [1,2,3,4,5,6,7,8,9,10].map(function(h) { return '<option value="' + h + ' hrs">' + h + ' hrs utilized</option>'; }).join('') +
            '</select>' +
        '</td>';

    tbody.appendChild(newRow);

    // Setup listeners for new row
    newRow.querySelectorAll('input, select').forEach(function(input) {
        input.addEventListener('change', function() { updateEquipmentRow(newRow); });
    });

    // Focus the type input
    newRow.querySelector('.equipment-type').focus();
}

// ============ RENDER PHOTOS ============
function renderPhotos() {
    var container = document.getElementById('photosContainer');
    var photos = RS.report.photos || [];
    var totalPhotos = photos.length;

    document.getElementById('photoCount').textContent = totalPhotos + ' photo' + (totalPhotos !== 1 ? 's' : '');

    if (totalPhotos === 0) {
        container.innerHTML =
            '<div class="text-center text-slate-400 py-12">' +
                '<i class="fas fa-images text-5xl mb-3"></i>' +
                '<p class="text-sm font-medium">No photos captured</p>' +
                '<p class="text-xs mt-1">Photos from field capture will appear here</p>' +
            '</div>';
        return;
    }

    container.innerHTML = photos.map(function(photo, index) {
        var photoNum = index + 1;
        var dateStr = photo.date || '--';
        var timeStr = photo.time || '--';
        var gpsStr = photo.gps
            ? photo.gps.lat.toFixed(5) + ', ' + photo.gps.lng.toFixed(5)
            : null;

        return '<div class="photo-card" data-photo-index="' + index + '">' +
            '<!-- Photo Header -->' +
            '<div class="photo-card-header">' +
                '<span>Photo ' + photoNum + ' of ' + totalPhotos + '</span>' +
            '</div>' +

            '<!-- Photo Image Container -->' +
            '<div class="photo-card-image" id="photo-container-' + index + '">' +
                '<!-- Loading state -->' +
                '<div class="photo-loading" id="photo-loading-' + index + '">' +
                    '<i class="fas fa-spinner fa-spin text-2xl text-slate-400"></i>' +
                '</div>' +
                '<!-- Image (hidden until loaded) -->' +
                '<img' +
                    ' src="' + photo.url + '"' +
                    ' alt="Progress photo ' + photoNum + '"' +
                    ' id="photo-img-' + index + '"' +
                    ' style="display: none;"' +
                    ' onload="handlePhotoLoad(' + index + ')"' +
                    ' onerror="handlePhotoError(' + index + ')"' +
                '>' +
            '</div>' +

            '<!-- Photo Footer with metadata and caption -->' +
            '<div class="photo-card-footer">' +
                '<!-- Metadata Row -->' +
                '<div class="photo-card-meta">' +
                    '<div class="photo-card-meta-item">' +
                        '<i class="fas fa-calendar-alt"></i>' +
                        '<span>' + dateStr + '</span>' +
                    '</div>' +
                    '<div class="photo-card-meta-item">' +
                        '<i class="fas fa-clock"></i>' +
                        '<span>' + timeStr + '</span>' +
                    '</div>' +
                    (gpsStr ? '<div class="photo-card-meta-item">' +
                        '<i class="fas fa-map-marker-alt"></i>' +
                        '<span>' + gpsStr + '</span>' +
                    '</div>' : '') +
                '</div>' +

                '<!-- Caption -->' +
                '<div>' +
                    '<label class="block text-xs font-bold text-slate-500 uppercase mb-1">Caption</label>' +
                    '<textarea' +
                        ' class="photo-card-caption auto-expand"' +
                        ' data-photo-index="' + index + '"' +
                        ' placeholder="Describe what this photo shows..."' +
                    '>' + escapeHtml(photo.caption || '') + '</textarea>' +
                '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    // Setup caption listeners
    document.querySelectorAll('.photo-card-caption').forEach(function(textarea) {
        textarea.addEventListener('blur', function() {
            var index = parseInt(textarea.dataset.photoIndex);
            if (RS.report.photos[index]) {
                RS.report.photos[index].caption = textarea.value.trim();
                scheduleSave();
            }
        });
        // Also save on input with debounce for better UX
        textarea.addEventListener('input', debounce(function() {
            var index = parseInt(textarea.dataset.photoIndex);
            if (RS.report.photos[index]) {
                RS.report.photos[index].caption = textarea.value.trim();
                scheduleSave();
            }
        }, 1000));
    });

    initAllAutoExpandTextareas();
}

/**
 * Handle successful photo load - detect orientation and show image
 */
function handlePhotoLoad(index) {
    var img = document.getElementById('photo-img-' + index);
    var container = document.getElementById('photo-container-' + index);
    var loading = document.getElementById('photo-loading-' + index);

    if (!img || !container) return;

    // Hide loading spinner
    if (loading) loading.style.display = 'none';

    // Detect orientation based on natural dimensions
    var isPortrait = img.naturalHeight > img.naturalWidth;
    container.classList.remove('portrait', 'landscape');
    container.classList.add(isPortrait ? 'portrait' : 'landscape');

    // Show the image
    img.style.display = 'block';
}

/**
 * Handle photo load error - attempt re-sign from storage_path before showing error
 */
async function handlePhotoError(index) {
    var container = document.getElementById('photo-container-' + index);
    var loading = document.getElementById('photo-loading-' + index);
    var img = document.getElementById('photo-img-' + index);

    if (!container) return;

    var photo = (RS && RS.report && RS.report.photos) ? RS.report.photos[index] : null;
    var storagePath = photo && photo.storagePath;
    var alreadyRetried = img && img.dataset && img.dataset.resignRetried === 'true';
    var client = (typeof supabaseClient !== 'undefined' && supabaseClient)
        ? supabaseClient
        : (typeof window !== 'undefined' ? window.supabaseClient : null);

    // Retry once with a fresh signed URL if possible
    if (img && !alreadyRetried && storagePath && client && client.storage) {
        img.dataset.resignRetried = 'true';

        try {
            var signResult = await client
                .storage
                .from('report-photos')
                .createSignedUrl(storagePath, 3600);

            if (!signResult.error && signResult.data && signResult.data.signedUrl) {
                img.src = signResult.data.signedUrl;
                return; // Give the photo a second chance to load
            }
        } catch (err) {
            console.warn('[PHOTOS] Failed to re-sign photo URL:', err);
        }
    }

    // Hide loading spinner
    if (loading) loading.style.display = 'none';

    // Show error message
    container.innerHTML =
        '<div class="photo-error">' +
            '<i class="fas fa-exclamation-triangle text-3xl mb-2"></i>' +
            '<p class="font-medium">Failed to load image</p>' +
            '<p class="text-xs mt-1">The photo may be corrupted or missing</p>' +
        '</div>';
}

/**
 * Simple debounce function
 */
function debounce(func, wait) {
    var timeout;
    return function() {
        var args = arguments;
        var context = this;
        var later = function() {
            clearTimeout(timeout);
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Force-capture current text field values into userEdits.
 * Called before preview render to ensure all data is fresh.
 */
function saveTextFieldEdits() {
    var textFields = {
        'issuesText': 'issues',
        'qaqcText': 'qaqc',
        'safetyText': 'safety.notes',
        'communicationsText': 'communications',
        'visitorsText': 'visitors'
    };

    Object.entries(textFields).forEach(function(entry) {
        var fieldId = entry[0];
        var path = entry[1];
        var field = document.getElementById(fieldId);
        if (field && field.value.trim()) {
            RS.userEdits[path] = field.value;
            RS.report.userEdits = RS.userEdits;
        }
    });
}

// ============ CREW ACTIVITY HELPER ============
/**
 * Get crew-specific activity data for preview/PDF
 * Checks userEdits > aiGenerated > report.activities
 */
function getCrewActivity(contractorId, crewId) {
    var userEditKey = 'activity_' + contractorId + '_crew_' + crewId;
    if (RS.userEdits[userEditKey]) {
        return RS.userEdits[userEditKey];
    }

    if (RS.report?.aiGenerated?.activities) {
        var aiActivity = RS.report.aiGenerated.activities.find(function(a) {
            return a.contractorId === contractorId;
        });
        if (aiActivity?.crewActivities) {
            var crewAct = aiActivity.crewActivities.find(function(ca) {
                return ca.crewId === crewId;
            });
            if (crewAct) {
                return {
                    contractorId: contractorId,
                    crewId: crewId,
                    noWork: crewAct.noWork ?? false,
                    narrative: crewAct.narrative || ''
                };
            }
        }
    }

    if (RS.report?.activities) {
        var activity = RS.report.activities.find(function(a) {
            return a.contractorId === contractorId;
        });
        if (activity?.crewActivities) {
            return activity.crewActivities.find(function(ca) {
                return ca.crewId === crewId;
            });
        }
    }
    return null;
}

// ============ EXPOSE TO WINDOW ============
window.toggleNoWork = toggleNoWork;
window.addEquipmentRow = addEquipmentRow;
window.handlePhotoLoad = handlePhotoLoad;
window.handlePhotoError = handlePhotoError;
