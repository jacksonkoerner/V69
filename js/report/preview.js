// ============================================================================
// FieldVoice Pro v6 - Report Page: Preview Rendering
// Extracted from report.js (lines ~2909-3374)
//
// Contains: renderPreview, scalePreviewToFit
// ============================================================================

var RS = window.reportState;

// ============ PREVIEW RENDERING ============
/**
 * Render the RPR Daily Report preview from live form data.
 * This reads from RS.report, RS.activeProject, RS.projectContractors, RS.userEdits, RS.userSettings.
 */
function renderPreview() {
    var container = document.getElementById('previewContent');
    if (!container) return;

    var o = RS.report.overview || {};
    var ai = RS.report.aiGenerated || {};
    var ue = RS.report.userEdits || {};

    // Helper: clean weather display values
    function cleanW(value, defaultVal) {
        if (!value || value === '--' || value === 'Syncing...' || value === 'N/A' || String(value).trim() === '') {
            return defaultVal || 'N/A';
        }
        return value;
    }

    // Read current form field values directly from DOM for live preview
    function formVal(id, fallback) {
        var el = document.getElementById(id);
        if (!el) return fallback || '';
        // For select elements, use value directly (textContent includes all options)
        if (el.tagName === 'SELECT') {
            var val = el.value;
            return (val && val !== 'Select...') ? val : (fallback || '');
        }
        return el.value || el.textContent || fallback || '';
    }

    // Utility functions for preview
    function previewFormatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                var parts = dateStr.split('-');
                var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            }
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        } catch (e) { return dateStr; }
    }

    function previewFormatTime(timeStr) {
        if (!timeStr) return '';
        if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
        var parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return timeStr;
        var period = hours >= 12 ? 'PM' : 'AM';
        var displayHours = hours % 12 || 12;
        return displayHours + ':' + String(minutes).padStart(2, '0') + ' ' + period;
    }

    function previewCalcShift(start, end) {
        if (!start || !end) return '';
        try {
            var sH, sM, eH, eM;
            if (start.includes(':')) { var p = start.split(':'); sH = parseInt(p[0]); sM = parseInt(p[1]) || 0; } else return '';
            if (end.includes(':')) { var p = end.split(':'); eH = parseInt(p[0]); eM = parseInt(p[1]) || 0; } else return '';
            if (isNaN(sH) || isNaN(eH)) return '';
            var diff = (eH * 60 + eM) - (sH * 60 + sM);
            if (diff < 0) diff += 24 * 60;
            return (diff / 60).toFixed(2) + ' hours';
        } catch (e) { return ''; }
    }

    function previewFormatText(text) {
        if (!text || text.trim() === '') return '<ul><li class="rpr-na">N/A.</li></ul>';
        var lines = text.split('\n').filter(function(l) { return l.trim(); });
        if (lines.length === 0) return '<ul><li class="rpr-na">N/A.</li></ul>';
        return '<ul>' + lines.map(function(l) { return '<li>' + escapeHtml(l) + '</li>'; }).join('') + '</ul>';
    }

    function previewFormatTradesAbbrev(trades) {
        if (!trades) return '-';
        var abbrevMap = {
            'construction management': 'CM', 'project management': 'PM',
            'pile driving': 'PLE', 'concrete': 'CONC', 'asphalt': 'ASP',
            'utilities': 'UTL', 'earthwork': 'ERTHWRK', 'electrical': 'ELEC',
            'communications': 'COMM', 'fence': 'FENCE', 'pavement markings': 'PVMNT MRK',
            'hauling': 'HAUL', 'pavement subgrade': 'PVMT SUB', 'demo': 'DEMO',
            'demolition': 'DEMO', 'general': 'GEN'
        };
        var parts = trades.split(/[;,]/).map(function(t) { return t.trim().toLowerCase(); });
        return parts.map(function(t) { return abbrevMap[t] || t.substring(0, 6).toUpperCase(); }).join('; ');
    }

    function previewGetContractorName(contractorId, fallbackName) {
        var c = RS.projectContractors.find(function(c) { return c.id === contractorId; });
        if (c) return c.abbreviation || c.name.substring(0, 15).toUpperCase();
        if (fallbackName) return fallbackName.substring(0, 15).toUpperCase();
        return 'UNKNOWN';
    }

    function previewFormatEquipNotes(status, hoursUsed) {
        if (!status || status.toLowerCase() === 'idle' || status === '0' || status === '0 hrs') return 'IDLE';
        var hours = hoursUsed;
        if (!hours && status) {
            var m = status.match(/(\d+(?:\.\d+)?)/);
            if (m) hours = parseFloat(m[1]);
        }
        if (hours && hours > 0) return hours + ' HRS UTILIZED';
        return 'IDLE';
    }

    // Gather current form data
    var projectName = formVal('projectName', RS.activeProject?.projectName || '');
    var reportDate = previewFormatDate(formVal('reportDate'));
    var noabNo = formVal('noabProjectNo', RS.activeProject?.noabProjectNo || '');
    var location = formVal('projectLocation', RS.activeProject?.location || '');
    var cnoNo = formVal('cnoSolicitationNo', RS.activeProject?.cnoSolicitationNo || 'N/A');
    var engineer = formVal('engineer', RS.activeProject?.engineer || '');
    var ntpDate = RS.activeProject?.noticeToProceed ? previewFormatDate(RS.activeProject.noticeToProceed) : '';
    var primeContractor = formVal('contractor', RS.activeProject?.primeContractor || '');
    var duration = RS.activeProject?.contractDuration ? RS.activeProject.contractDuration + ' days' : '';
    var startTime = previewFormatTime(formVal('startTime'));
    var endTime = previewFormatTime(formVal('endTime'));
    var expectedCompletion = RS.activeProject?.expectedCompletion ? previewFormatDate(RS.activeProject.expectedCompletion) : '';
    var shiftDuration = previewCalcShift(formVal('startTime'), formVal('endTime'));
    var contractDayVal = formVal('contractDay');
    var weatherDaysVal = formVal('weatherDaysCount', '0') + ' days';
    var completedBy = formVal('completedBy', RS.userSettings?.fullName || '');

    // Weather
    var highTemp = cleanW(formVal('weatherHigh'), 'N/A');
    var lowTemp = cleanW(formVal('weatherLow'), 'N/A');
    var precipitation = cleanW(formVal('weatherPrecip'), '0.00"');
    var generalCondition = cleanW(formVal('weatherCondition'), 'Not recorded');
    var jobSiteCondition = cleanW(formVal('weatherJobSite'), 'N/A');
    var adverseConditions = cleanW(formVal('weatherAdverse'), 'None');

    // Signature
    var sigName = formVal('signatureName', completedBy);
    var sigTitle = formVal('signatureTitle', RS.userSettings?.title || '');
    var sigCompany = formVal('signatureCompany', RS.userSettings?.company || '');
    var sigDetails = '';
    if (sigTitle || sigCompany) {
        sigDetails = 'Digitally signed by ' + sigName + '<br>DN: cn=' + sigName + ', c=US,<br>o=' + sigCompany + ', ou=' + sigTitle;
    }

    // Logo
    var logoSrc = RS.activeProject?.logoUrl || RS.activeProject?.logoThumbnail || RS.activeProject?.logo;
    var logoHtml = logoSrc
        ? '<img src="' + logoSrc + '" class="rpr-logo" alt="Project Logo">'
        : '<div class="rpr-logo-placeholder">LOUIS ARMSTRONG<br>NEW ORLEANS<br>INTERNATIONAL AIRPORT</div>';

    // Helper for header on each page
    function pageHeader() {
        return '<div class="rpr-header">' +
            '<div>' + logoHtml + '</div>' +
            '<div class="rpr-title">RPR DAILY REPORT</div>' +
        '</div>';
    }

    // ────── PAGE 1: Overview + Work Summary ──────
    var page1 = '<div class="preview-page">' + pageHeader();

    // Section Header: Project Overview
    page1 += '<div class="rpr-section-header">Project Overview</div>';

    // Overview table
    page1 += '<table class="rpr-overview-table">' +
        '<tr><td class="rpr-label">PROJECT NAME:</td><td>' + escapeHtml(projectName) + '</td><td class="rpr-label">DATE:</td><td>' + escapeHtml(reportDate) + '</td></tr>' +
        '<tr><td class="rpr-label">NOAB PROJECT NO.:</td><td>' + escapeHtml(noabNo) + '</td><td class="rpr-label">LOCATION:</td><td>' + escapeHtml(location) + '</td></tr>' +
        '<tr><td class="rpr-label">CNO SOLICITATION NO.:</td><td>' + escapeHtml(cnoNo) + '</td><td class="rpr-label">ENGINEER:</td><td>' + escapeHtml(engineer) + '</td></tr>' +
        '<tr><td class="rpr-label">NOTICE TO PROCEED:</td><td>' + escapeHtml(ntpDate) + '</td><td class="rpr-label">CONTRACTOR:</td><td>' + escapeHtml(primeContractor) + '</td></tr>' +
        '<tr><td class="rpr-label">CONTRACT DURATION:</td><td>' + escapeHtml(duration) + '</td><td class="rpr-label">START TIME:</td><td>' + escapeHtml(startTime) + '</td></tr>' +
        '<tr><td class="rpr-label">EXPECTED COMPLETION:</td><td>' + escapeHtml(expectedCompletion) + '</td><td class="rpr-label">END TIME:</td><td>' + escapeHtml(endTime) + '</td></tr>' +
        '<tr><td class="rpr-label">CONTRACT DAY #:</td><td>' + escapeHtml(contractDayVal) + '</td><td class="rpr-label">SHIFT DURATION:</td><td>' + escapeHtml(shiftDuration) + '</td></tr>' +
        '<tr><td class="rpr-label">WEATHER DAYS:</td><td>' + escapeHtml(weatherDaysVal) + '</td><td class="rpr-label">COMPLETED BY:</td><td>' + escapeHtml(completedBy) + '</td></tr>' +
        '<tr>' +
            '<td class="rpr-label" rowspan="5">WEATHER:</td>' +
            '<td>High Temp: ' + escapeHtml(highTemp) + ' Low Temp: ' + escapeHtml(lowTemp) + '</td>' +
            '<td class="rpr-label" rowspan="5">SIGNATURE:</td>' +
            '<td rowspan="5" style="text-align:center; vertical-align:middle;">' +
                '<div class="rpr-signature-name">' + escapeHtml(sigName) + '</div>' +
                '<div class="rpr-signature-details">' + sigDetails + '</div>' +
            '</td>' +
        '</tr>' +
        '<tr><td style="padding-left:20px; background:#fafafa;">Precipitation: ' + escapeHtml(precipitation) + '</td></tr>' +
        '<tr><td style="padding-left:20px; background:#fafafa;">General Condition: ' + escapeHtml(generalCondition) + '</td></tr>' +
        '<tr><td style="padding-left:20px; background:#fafafa;">Job Site Condition: ' + escapeHtml(jobSiteCondition) + '</td></tr>' +
        '<tr><td style="padding-left:20px; background:#fafafa;">Adverse Conditions: ' + escapeHtml(adverseConditions) + '</td></tr>' +
    '</table>';

    // Daily Work Summary
    page1 += '<div class="rpr-section-header">Daily Work Summary</div>';
    page1 += '<div class="rpr-work-summary">';
    page1 += '<p style="font-weight:bold; margin-bottom:8px;">Construction Activities Performed and Observed on this Date:</p>';

    var displayDate = formVal('reportDate') ? previewFormatDate(formVal('reportDate')) : 'this date';

    if (RS.projectContractors.length === 0) {
        var workText = getValue('guidedNotes.workSummary', '');
        page1 += workText ? '<p>' + escapeHtml(workText) + '</p>' : '<p class="rpr-na">N/A.</p>';
    } else {
        // Sort contractors: those with work performed first, no-work at bottom
        var sortedContractors = [].concat(RS.projectContractors).sort(function(a, b) {
            var actA = getContractorActivity(a.id);
            var actB = getContractorActivity(b.id);
            var noWorkA = actA?.noWork === true || !(actA?.narrative || '').trim();
            var noWorkB = actB?.noWork === true || !(actB?.narrative || '').trim();
            if (noWorkA && !noWorkB) return 1;   // a has no work → goes after b
            if (!noWorkA && noWorkB) return -1;   // a has work → goes before b
            // Same status: keep prime contractors first
            if (a.type === 'prime' && b.type !== 'prime') return -1;
            if (a.type !== 'prime' && b.type === 'prime') return 1;
            return 0;
        });

        sortedContractors.forEach(function(contractor) {
            var activity = getContractorActivity(contractor.id);
            var crews = contractor.crews || [];
            var typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
            var trades = contractor.trades ? ' (' + contractor.trades.toUpperCase() + ')' : '';
            var narrative = activity?.narrative || '';
            var isNoWork = activity?.noWork === true || !narrative.trim();

            page1 += '<div class="rpr-contractor-block">';
            page1 += '<div class="rpr-contractor-name">' + escapeHtml(contractor.name) + ' – ' + typeLabel + escapeHtml(trades) + '</div>';

            if (crews.length === 0) {
                if (isNoWork) {
                    page1 += '<p style="font-style:italic; color:#333;">No work performed on ' + escapeHtml(displayDate) + '.</p>';
                } else {
                    var lines = narrative.split('\n').filter(function(l) { return l.trim(); });
                    page1 += '<ul>';
                    lines.forEach(function(line) {
                        var prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                        page1 += '<li>' + escapeHtml(prefix + line.trim()) + '</li>';
                    });
                    page1 += '</ul>';
                    if (activity?.equipmentUsed || activity?.crew) {
                        page1 += '<div style="font-size:8pt; text-transform:uppercase; margin-top:4px;">';
                        if (activity.equipmentUsed) page1 += 'EQUIPMENT: ' + escapeHtml(activity.equipmentUsed) + ' ';
                        if (activity.crew) page1 += 'CREW: ' + escapeHtml(activity.crew);
                        page1 += '</div>';
                    }
                }
            } else {
                // Has crews
                if (isNoWork) {
                    page1 += '<p style="font-style:italic; color:#333;">No work performed on ' + escapeHtml(displayDate) + '.</p>';
                } else {
                    crews.forEach(function(crewObj) {
                        var crewActivity = getCrewActivity(contractor.id, crewObj.id);
                        var crewNarrative = crewActivity?.narrative || '';
                        var crewIsNoWork = !crewNarrative.trim();

                        page1 += '<div style="margin-left:12px; margin-bottom:8px; border-left:3px solid ' + (contractor.type === 'prime' ? '#16a34a' : '#1d4ed8') + '; padding-left:10px;">';
                        page1 += '<div style="font-weight:600; font-size:10pt; margin-bottom:4px;">' + escapeHtml(crewObj.name) + '</div>';

                        if (crewIsNoWork) {
                            page1 += '<p style="font-style:italic; color:#333; font-size:9pt;">No work performed on ' + escapeHtml(displayDate) + '.</p>';
                        } else {
                            var cLines = crewNarrative.split('\n').filter(function(l) { return l.trim(); });
                            page1 += '<ul>';
                            cLines.forEach(function(line) {
                                var prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                                page1 += '<li>' + escapeHtml(prefix + line.trim()) + '</li>';
                            });
                            page1 += '</ul>';
                        }
                        page1 += '</div>';
                    });
                }
            }
            page1 += '</div>';
        });
    }

    page1 += '</div>'; // end work-summary
    page1 += '<div class="rpr-page-footer">Page 1</div>';
    page1 += '</div>'; // end page 1

    // ────── PAGE 2: Operations + Equipment + Issues + Communications ──────
    var page2 = '<div class="preview-page">' + pageHeader();

    // Daily Operations
    page2 += '<div class="rpr-section-header">Daily Operations</div>';
    page2 += '<table class="rpr-ops-table"><thead><tr>' +
        '<th>CONTRACTOR</th><th>TRADE</th><th>SUPER(S)</th><th>FOREMAN</th>' +
        '<th>OPERATOR(S)</th><th>LABORER(S)</th><th>SURVEYOR(S)</th><th>OTHER(S)</th>' +
    '</tr></thead><tbody>';

    if (RS.projectContractors.length === 0) {
        page2 += '<tr><td colspan="8" style="text-align:center; color:#666;">No contractors defined</td></tr>';
    } else {
        RS.projectContractors.forEach(function(contractor) {
            var ops = getContractorOperations(contractor.id);
            var abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
            var trades = previewFormatTradesAbbrev(contractor.trades);
            page2 += '<tr>' +
                '<td>' + escapeHtml(abbrev) + '</td>' +
                '<td>' + escapeHtml(trades) + '</td>' +
                '<td>' + (ops?.superintendents || 'N/A') + '</td>' +
                '<td>' + (ops?.foremen || 'N/A') + '</td>' +
                '<td>' + (ops?.operators || 'N/A') + '</td>' +
                '<td>' + (ops?.laborers || 'N/A') + '</td>' +
                '<td>' + (ops?.surveyors || 'N/A') + '</td>' +
                '<td>' + (ops?.others || 'N/A') + '</td>' +
            '</tr>';
        });
    }
    page2 += '</tbody></table>';

    // Equipment
    page2 += '<div class="rpr-section-header">Mobilized Equipment &amp; Daily Utilization</div>';
    page2 += '<table class="rpr-equip-table"><thead><tr>' +
        '<th>CONTRACTOR</th><th>EQUIPMENT TYPE / MODEL #</th><th>QTY</th><th>NOTES</th>' +
    '</tr></thead><tbody>';

    var equipData = getEquipmentData();
    if (equipData.length === 0) {
        page2 += '<tr><td colspan="4" style="text-align:center; color:#666;">No equipment mobilized</td></tr>';
    } else {
        equipData.forEach(function(item, idx) {
            var cName = previewGetContractorName(item.contractorId, item.contractorName);
            var eqNotes = previewFormatEquipNotes(item.status, item.hoursUsed);
            var editKey = 'equipment_' + idx;
            var editedType = ue[editKey]?.type || item.type || '';
            var editedQty = ue[editKey]?.qty || item.qty || 1;
            var editedNotes = ue[editKey]?.notes || eqNotes;
            page2 += '<tr>' +
                '<td>' + escapeHtml(cName) + '</td>' +
                '<td>' + escapeHtml(editedType) + '</td>' +
                '<td>' + editedQty + '</td>' +
                '<td>' + escapeHtml(editedNotes) + '</td>' +
            '</tr>';
        });
    }
    page2 += '</tbody></table>';

    // Issues
    var issuesText = formVal('issuesText', '');
    page2 += '<div class="rpr-section-header">General Issues; Unforeseen Conditions; Notices Given</div>';
    page2 += '<div class="rpr-text-section">' + previewFormatText(issuesText) + '</div>';

    // Communications
    var commsText = formVal('communicationsText', '');
    page2 += '<div class="rpr-section-header">Communications with the Contractor</div>';
    page2 += '<div class="rpr-text-section">' + previewFormatText(commsText) + '</div>';

    page2 += '<div class="rpr-page-footer">Page 2</div>';
    page2 += '</div>'; // end page 2

    // ────── PAGE 3: QA/QC + Safety + Visitors ──────
    var page3 = '<div class="preview-page">' + pageHeader();

    // QA/QC
    var qaqcText = formVal('qaqcText', '');
    page3 += '<div class="rpr-section-header">QA/QC Testing and/or Inspections</div>';
    page3 += '<div class="rpr-text-section">' + previewFormatText(qaqcText) + '</div>';

    // Safety
    var hasIncident = document.getElementById('safetyHasIncident')?.checked || false;
    var safetyText = formVal('safetyText', '');
    page3 += '<div class="rpr-section-header">Safety Report</div>';
    page3 += '<div class="rpr-text-section">';
    page3 += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
    page3 += '<span style="font-weight:bold;">Incident(s) on this Date:</span>';
    page3 += '<div class="rpr-safety-checkboxes">' +
        '<span style="display:flex; align-items:center; gap:4px;">' +
            '<span class="rpr-checkbox-box ' + (hasIncident ? 'checked' : '') + '">' + (hasIncident ? 'X' : '') + '</span> Yes' +
        '</span>' +
        '<span style="display:flex; align-items:center; gap:4px;">' +
            '<span class="rpr-checkbox-box ' + (!hasIncident ? 'checked' : '') + '">' + (!hasIncident ? 'X' : '') + '</span> No' +
        '</span>' +
    '</div></div>';
    page3 += previewFormatText(safetyText);
    page3 += '</div>';

    // Visitors
    var visitorsText = formVal('visitorsText', '');
    page3 += '<div class="rpr-section-header">Visitors; Deliveries; Additional Contract and/or Change Order Activities; Other Remarks</div>';
    page3 += '<div class="rpr-text-section">' + previewFormatText(visitorsText) + '</div>';

    page3 += '<div class="rpr-page-footer">Page 3</div>';
    page3 += '</div>'; // end page 3

    // ────── PAGE 4: Photos ──────
    var photos = RS.report.photos || [];
    var photoPagesHtml = '';

    if (photos.length > 0) {
        var photosPerPage = 4;
        var totalPhotoPages = Math.ceil(photos.length / photosPerPage);

        for (var pp = 0; pp < totalPhotoPages; pp++) {
            var pagePhotos = photos.slice(pp * photosPerPage, (pp + 1) * photosPerPage);
            var headerTitle = pp === 0 ? 'Daily Photos' : 'Daily Photos (Continued)';
            var pageNum = 4 + pp;

            var photoPage = '<div class="preview-page">' + pageHeader();
            photoPage += '<div class="rpr-section-header">' + headerTitle + '</div>';
            photoPage += '<div style="border:1px solid #000; border-bottom:none; padding:6px 10px; font-size:9pt;">' +
                '<table><tr><td style="font-weight:bold; padding-right:10px;">Project Name:</td><td>' + escapeHtml(projectName) + '</td></tr>' +
                '<tr><td style="font-weight:bold; padding-right:10px;">Project #:</td><td>' + escapeHtml(noabNo) + '</td></tr></table>' +
            '</div>';

            photoPage += '<div class="rpr-photos-grid">';
            pagePhotos.forEach(function(photo, i) {
                photoPage += '<div class="rpr-photo-cell">' +
                    '<div class="rpr-photo-image">' +
                        '<img src="' + photo.url + '" alt="Photo">' +
                    '</div>' +
                    '<div style="font-size:8pt; margin-bottom:4px;"><span style="font-weight:bold;">Date:</span> ' + (photo.date || reportDate) + '</div>' +
                    '<div style="font-size:8pt; font-style:italic; color:#333;">' + escapeHtml(photo.caption || '') + '</div>' +
                '</div>';
            });
            photoPage += '</div>';

            photoPage += '<div class="rpr-page-footer">Page ' + pageNum + '</div>';
            photoPage += '</div>';
            photoPagesHtml += photoPage;
        }
    }

    // Assemble all pages inside the scaler
    container.innerHTML = '<div class="preview-wrapper">' +
        '<div id="previewScaler" class="preview-scaler">' +
            page1 +
            page2 +
            page3 +
            photoPagesHtml +
        '</div>' +
    '</div>';

    // Scale the preview to fit the viewport width
    requestAnimationFrame(function() { scalePreviewToFit(); });
}

/**
 * Scale the preview pages to fit the viewport width exactly.
 * Pages render at 816px (8.5in), then CSS-scale to fit the screen.
 * Centered via left margin. Wrapper height adjusted to prevent dead space.
 */
function scalePreviewToFit() {
    var scaler = document.getElementById('previewScaler');
    if (!scaler) return;

    var wrapper = scaler.parentElement;
    var pageWidthPx = 816;
    var availWidth = wrapper.clientWidth || window.innerWidth;
    var scale = Math.min(1, availWidth / pageWidthPx);

    // Center horizontally: offset = (availWidth - scaledWidth) / 2
    var scaledWidth = pageWidthPx * scale;
    var leftOffset = Math.max(0, (availWidth - scaledWidth) / 2);

    scaler.style.transform = 'scale(' + scale + ')';
    scaler.style.transformOrigin = 'top left';
    scaler.style.marginLeft = leftOffset + 'px';

    // Shrink the wrapper's effective height so no dead space below
    var scaledHeight = scaler.scrollHeight * scale;
    wrapper.style.height = (scaledHeight + 16) + 'px'; // +16 for padding
}

// ============ EXPOSE TO WINDOW ============
window.renderPreview = renderPreview;
