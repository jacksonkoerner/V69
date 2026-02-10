// ============================================================================
// FieldVoice Pro v6 - Report Page: PDF Generator
// Extracted from report.js (lines ~3402-4139)
//
// Contains: generateVectorPDF, loadImageAsDataURL
// ============================================================================

var RS = window.reportState;

// ============ PDF GENERATION (VECTOR) ============
/**
 * Generate PDF with crisp vector text using jsPDF direct drawing.
 */
async function generateVectorPDF() {
    console.log('[PDF-VECTOR] Starting vector PDF generation');

    var jsPDFConstructor = (typeof jspdf !== 'undefined' && jspdf.jsPDF)
        || (typeof jsPDF !== 'undefined' && jsPDF)
        || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
        || (typeof window !== 'undefined' && window.jsPDF);

    if (!jsPDFConstructor) {
        throw new Error('jsPDF library not found.');
    }

    var doc = new jsPDFConstructor({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
        compress: true
    });

    // ── Constants ──
    var PW = 612, PH = 792, ML = 36, MR = 36, MT = 30;
    var CW = PW - ML - MR;
    var GREEN = [74, 124, 52];
    var GRAY_BG = [245, 245, 245];
    var BLACK = [0, 0, 0];
    var WHITE = [255, 255, 255];
    var DARK_BLUE = [30, 58, 95];

    var curY = MT;
    var pageNum = 1;

    var TITLE_SIZE = 18, SECTION_HEADER_SIZE = 10, LABEL_SIZE = 8, VALUE_SIZE = 9;
    var TABLE_HEADER_SIZE = 6, TABLE_CELL_SIZE = 8, BODY_SIZE = 9, FOOTER_SIZE = 8;

    // ── Helpers ──
    function setFont(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }
    function setTextColor(r, g, b) { doc.setTextColor(r, g, b); }
    function setDrawColor(r, g, b) { doc.setDrawColor(r, g, b); }
    function setFillColor(r, g, b) { doc.setFillColor(r, g, b); }

    function wrapText(text, maxWidth, fontSize, fontStyle) {
        if (!text) return [''];
        setFont(fontStyle || 'normal', fontSize || BODY_SIZE);
        var lines = doc.splitTextToSize(String(text), maxWidth);
        return lines.length > 0 ? lines : [''];
    }

    function checkPageBreak(neededHeight) {
        if (curY + neededHeight > PH - MT - 30) {
            drawPageFooter();
            doc.addPage();
            pageNum++;
            curY = MT;
            drawReportHeader();
            return true;
        }
        return false;
    }

    function drawPageFooter() {
        var footerY = PH - 25;
        setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(ML, footerY - 4, ML + CW, footerY - 4);
        setFont('normal', FOOTER_SIZE);
        setTextColor(102, 102, 102);
        doc.text(pageNum + ' of {{TOTAL}}', PW / 2, footerY, { align: 'center' });
    }

    // Pre-load logo image before drawing (if available)
    var logoDataUrl = null;
    var logoSrcUrl = RS.activeProject?.logoUrl || RS.activeProject?.logoThumbnail || RS.activeProject?.logo;
    if (logoSrcUrl) {
        try {
            logoDataUrl = await loadImageAsDataURL(logoSrcUrl);
        } catch (e) {
            console.warn('[PDF-VECTOR] Failed to pre-load logo:', e);
        }
    }

    function drawReportHeader() {
        if (logoDataUrl) {
            // Draw embedded logo image (max 50pt high, proportional width)
            try {
                doc.addImage(logoDataUrl, 'JPEG', ML, curY + 2, 0, 38); // auto-width, 38pt height
            } catch (e) {
                // Fallback to text if image fails
                setFont('bold', 9);
                setTextColor.apply(null, DARK_BLUE);
                doc.text('LOUIS ARMSTRONG', ML, curY + 12);
                doc.text('NEW ORLEANS', ML, curY + 22);
                doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
            }
        } else {
            setFont('bold', 9);
            setTextColor.apply(null, DARK_BLUE);
            doc.text('LOUIS ARMSTRONG', ML, curY + 12);
            doc.text('NEW ORLEANS', ML, curY + 22);
            doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
        }
        setFont('bold', TITLE_SIZE);
        setTextColor.apply(null, GREEN);
        doc.text('RPR DAILY REPORT', ML + CW, curY + 22, { align: 'right' });
        curY += 42;
        setDrawColor.apply(null, GREEN);
        doc.setLineWidth(2.5);
        doc.line(ML, curY, ML + CW, curY);
        curY += 8;
    }

    function drawSectionHeader(title) {
        var h = 20;
        checkPageBreak(h + 10);
        setFillColor.apply(null, GREEN);
        setDrawColor.apply(null, BLACK);
        doc.setLineWidth(0.5);
        doc.rect(ML, curY, CW, h, 'FD');
        setFont('bold', SECTION_HEADER_SIZE);
        setTextColor.apply(null, WHITE);
        doc.text(title.toUpperCase(), PW / 2, curY + 14, { align: 'center' });
        curY += h;
        setTextColor.apply(null, BLACK);
    }

    function drawCell(x, y, w, h, text, options) {
        var opts = Object.assign({ fill: null, bold: false, fontSize: VALUE_SIZE, align: 'left', padding: 4, border: true }, options);
        if (opts.fill) { setFillColor.apply(null, opts.fill); doc.rect(x, y, w, h, 'F'); }
        if (opts.border) { setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5); doc.rect(x, y, w, h, 'S'); }
        if (text !== undefined && text !== null) {
            setFont(opts.bold ? 'bold' : 'normal', opts.fontSize);
            setTextColor.apply(null, BLACK);
            var textX = opts.align === 'center' ? x + w / 2 : x + opts.padding;
            var textY = y + h / 2 + opts.fontSize * 0.3;
            var maxW = w - opts.padding * 2;
            doc.text(String(text), textX, textY, { align: opts.align === 'center' ? 'center' : undefined, maxWidth: maxW });
        }
    }

    function drawTextBox(text, x, y, w, options) {
        var opts = Object.assign({ fontSize: BODY_SIZE, fontStyle: 'normal', padding: 8, bulletPoints: false }, options);
        var innerW = w - opts.padding * 2;
        var lines;
        if (opts.bulletPoints && text) {
            var rawLines = String(text).split('\n').filter(function(l) { return l.trim(); });
            lines = [];
            rawLines.forEach(function(line) {
                var prefixed = line.startsWith('•') || line.startsWith('-') ? line : '• ' + line;
                lines = lines.concat(wrapText(prefixed, innerW, opts.fontSize, opts.fontStyle));
            });
        } else {
            lines = wrapText(text || 'N/A.', innerW, opts.fontSize, opts.fontStyle);
        }
        var lineH = opts.fontSize * 1.3;
        var footerReserve = 35;
        var maxPageY = PH - MT - footerReserve;

        // Check if entire box fits on current page
        var totalH = lines.length * lineH + opts.padding * 2;
        if (y + totalH <= maxPageY + MT) {
            // Fits on one page — draw normally
            setDrawColor.apply(null, BLACK);
            doc.setLineWidth(0.5);
            doc.line(x, y, x, y + totalH);
            doc.line(x + w, y, x + w, y + totalH);
            doc.line(x, y + totalH, x + w, y + totalH);
            setFont(opts.fontStyle, opts.fontSize);
            setTextColor.apply(null, BLACK);
            var textY = y + opts.padding + opts.fontSize;
            lines.forEach(function(line) { doc.text(line, x + opts.padding, textY); textY += lineH; });
            return totalH;
        }

        // Multi-page: draw lines progressively with page breaks
        var boxStartY = y;
        setFont(opts.fontStyle, opts.fontSize);
        setTextColor.apply(null, BLACK);
        var textY = y + opts.padding + opts.fontSize;

        for (var i = 0; i < lines.length; i++) {
            if (textY + lineH > maxPageY + MT) {
                // Close box on current page
                var boxH = textY - boxStartY + opts.padding;
                setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);
                doc.line(x, boxStartY, x, boxStartY + boxH);
                doc.line(x + w, boxStartY, x + w, boxStartY + boxH);
                doc.line(x, boxStartY + boxH, x + w, boxStartY + boxH);

                drawPageFooter(); doc.addPage(); pageNum++;
                curY = MT; drawReportHeader();
                boxStartY = curY;
                textY = curY + opts.padding + opts.fontSize;
                setFont(opts.fontStyle, opts.fontSize);
                setTextColor.apply(null, BLACK);
            }
            doc.text(lines[i], x + opts.padding, textY);
            textY += lineH;
        }

        // Close final box segment
        var finalH = textY - boxStartY + opts.padding;
        setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);
        doc.line(x, boxStartY, x, boxStartY + finalH);
        doc.line(x + w, boxStartY, x + w, boxStartY + finalH);
        doc.line(x, boxStartY + finalH, x + w, boxStartY + finalH);

        // Set curY to end of box; return 0 since we already updated curY
        curY = boxStartY + finalH;
        return 0; // curY already positioned correctly
    }

    // ── Gather data from current form state ──
    function formVal(id, fallback) {
        var el = document.getElementById(id);
        if (!el) return fallback || '';
        if (el.tagName === 'SELECT') {
            var val = el.value;
            return (val && val !== 'Select...') ? val : (fallback || '');
        }
        return el.value || el.textContent || fallback || '';
    }

    function pdfFormatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                var parts = dateStr.split('-');
                return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
            }
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        } catch (e) { return dateStr; }
    }

    function pdfFormatTime(timeStr) {
        if (!timeStr) return '';
        if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
        var parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
        if (isNaN(h) || isNaN(m)) return timeStr;
        return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
    }

    function pdfCalcShift(start, end) {
        if (!start || !end) return '';
        try {
            var sp = start.split(':'), ep = end.split(':');
            var diff = (parseInt(ep[0]) * 60 + (parseInt(ep[1]) || 0)) - (parseInt(sp[0]) * 60 + (parseInt(sp[1]) || 0));
            if (diff < 0) diff += 1440;
            return (diff / 60).toFixed(2) + ' hours';
        } catch (e) { return ''; }
    }

    function pdfFormatTradesAbbrev(trades) {
        if (!trades) return '-';
        var abbrevMap = {
            'construction management': 'CM', 'project management': 'PM',
            'pile driving': 'PLE', 'concrete': 'CONC', 'asphalt': 'ASP',
            'utilities': 'UTL', 'earthwork': 'ERTHWRK', 'electrical': 'ELEC',
            'communications': 'COMM', 'fence': 'FENCE', 'pavement markings': 'PVMNT MRK',
            'hauling': 'HAUL', 'pavement subgrade': 'PVMT SUB', 'demo': 'DEMO',
            'demolition': 'DEMO', 'general': 'GEN'
        };
        return trades.split(/[;,]/).map(function(t) {
            var lower = t.trim().toLowerCase();
            return abbrevMap[lower] || lower.substring(0, 6).toUpperCase();
        }).join('; ');
    }

    function pdfGetContractorName(contractorId, fallbackName) {
        var c = RS.projectContractors.find(function(c) { return c.id === contractorId; });
        if (c) return c.abbreviation || c.name.substring(0, 15).toUpperCase();
        if (fallbackName) return fallbackName.substring(0, 15).toUpperCase();
        return 'UNKNOWN';
    }

    function pdfFormatEquipNotes(status, hoursUsed) {
        if (!status || status.toLowerCase() === 'idle' || status === '0' || status === '0 hrs') return 'IDLE';
        var h = hoursUsed;
        if (!h && status) { var m = status.match(/(\d+(?:\.\d+)?)/); if (m) h = parseFloat(m[1]); }
        if (h && h > 0) return h + ' HRS UTILIZED';
        return 'IDLE';
    }

    var cleanW = function(v, d) { return (!v || v === '--' || v === 'Syncing...' || v === 'N/A' || String(v).trim() === '') ? (d || 'N/A') : v; };

    var ue = RS.report.userEdits || {};

    var projectName = formVal('projectName', RS.activeProject?.projectName || '');
    var reportDate = pdfFormatDate(formVal('reportDate'));
    var noabNo = formVal('noabProjectNo', RS.activeProject?.noabProjectNo || '');
    var location = formVal('projectLocation', RS.activeProject?.location || '');
    var cnoNo = formVal('cnoSolicitationNo', RS.activeProject?.cnoSolicitationNo || 'N/A');
    var engineer = formVal('engineer', RS.activeProject?.engineer || '');
    var ntpDate = RS.activeProject?.noticeToProceed ? pdfFormatDate(RS.activeProject.noticeToProceed) : '';
    var contractorName = formVal('contractor', RS.activeProject?.primeContractor || '');
    var duration = RS.activeProject?.contractDuration ? RS.activeProject.contractDuration + ' days' : '';
    var startTime = pdfFormatTime(formVal('startTime'));
    var endTime = pdfFormatTime(formVal('endTime'));
    var expectedCompletion = RS.activeProject?.expectedCompletion ? pdfFormatDate(RS.activeProject.expectedCompletion) : '';
    var shiftDuration = pdfCalcShift(formVal('startTime'), formVal('endTime'));
    var contractDayVal = formVal('contractDay');
    var weatherDays = formVal('weatherDaysCount', '0') + ' days';
    var completedBy = formVal('completedBy', RS.userSettings?.fullName || '');
    var weather = RS.report.overview?.weather || {};
    var highTemp = cleanW(formVal('weatherHigh'), 'N/A');
    var lowTemp = cleanW(formVal('weatherLow'), 'N/A');
    var precipitation = cleanW(formVal('weatherPrecip'), '0.00"');
    var generalCondition = cleanW(formVal('weatherCondition'), 'Not recorded');
    var jobSiteCondition = cleanW(formVal('weatherJobSite'), 'N/A');
    var adverseConditions = cleanW(formVal('weatherAdverse'), 'None');

    // ═══ PAGE 1: Header + Overview + Work Summary ═══
    curY = MT;
    drawReportHeader();
    drawSectionHeader('PROJECT OVERVIEW');

    var colW = [115, 155, 115, 155];
    var rowH = 16;
    var tableX = ML;

    function drawOverviewRow(l1, v1, l2, v2, opts) {
        var rh = opts?.height || rowH;
        var x = tableX;
        drawCell(x, curY, colW[0], rh, l1, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
        x += colW[0];
        drawCell(x, curY, colW[1], rh, v1, { fontSize: VALUE_SIZE });
        x += colW[1];
        drawCell(x, curY, colW[2], rh, l2, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
        x += colW[2];
        drawCell(x, curY, colW[3], rh, v2, Object.assign({ fontSize: VALUE_SIZE }, opts?.lastCell));
        curY += rh;
    }

    drawOverviewRow('PROJECT NAME:', projectName, 'DATE:', reportDate);
    drawOverviewRow('NOAB PROJECT NO.:', noabNo, 'LOCATION:', location);
    drawOverviewRow('CNO SOLICITATION NO.:', cnoNo, 'ENGINEER:', engineer);
    drawOverviewRow('NOTICE TO PROCEED:', ntpDate, 'CONTRACTOR:', contractorName);
    drawOverviewRow('CONTRACT DURATION:', duration, 'START TIME:', startTime);
    drawOverviewRow('EXPECTED COMPLETION:', expectedCompletion, 'END TIME:', endTime);
    drawOverviewRow('CONTRACT DAY #:', contractDayVal, 'SHIFT DURATION:', shiftDuration);
    drawOverviewRow('WEATHER DAYS:', weatherDays, 'COMPLETED BY:', completedBy);

    // Weather + Signature rows
    var weatherRowH = 13;
    var totalSigH = weatherRowH * 5;
    drawCell(tableX, curY, colW[0], totalSigH, 'WEATHER:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
    drawCell(tableX + colW[0] + colW[1], curY, colW[2], totalSigH, 'SIGNATURE:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });

    var sigX = tableX + colW[0] + colW[1] + colW[2];
    setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5); doc.rect(sigX, curY, colW[3], totalSigH, 'S');

    var sigName = completedBy;
    setFont('italic', 14); setTextColor.apply(null, DARK_BLUE);
    doc.text(sigName, sigX + colW[3] / 2, curY + totalSigH / 2 - 4, { align: 'center' });

    var sigCompany = formVal('signatureCompany', RS.userSettings?.company || '');
    var sigTitle = formVal('signatureTitle', RS.userSettings?.title || '');
    if (sigCompany || sigTitle) {
        setFont('normal', 6); setTextColor(102, 102, 102);
        doc.text('Digitally signed by ' + sigName, sigX + colW[3] / 2, curY + totalSigH / 2 + 8, { align: 'center' });
    }

    var weatherTexts = [
        'High Temp: ' + highTemp + '  Low Temp: ' + lowTemp,
        'Precipitation: ' + precipitation,
        'General Condition: ' + generalCondition,
        'Job Site Condition: ' + jobSiteCondition,
        'Adverse Conditions: ' + adverseConditions
    ];
    var weatherValX = tableX + colW[0];
    weatherTexts.forEach(function(wText, i) {
        var wy = curY + i * weatherRowH;
        setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5); doc.rect(weatherValX, wy, colW[1], weatherRowH, 'S');
        setFont('normal', VALUE_SIZE); setTextColor.apply(null, BLACK);
        doc.text(wText, weatherValX + 4, wy + weatherRowH / 2 + 3);
    });
    curY += totalSigH;

    // Daily Work Summary
    drawSectionHeader('DAILY WORK SUMMARY');
    var wsStartY = curY;
    var wsPadding = 8;
    var wsContentY = curY + wsPadding;

    setFont('bold', BODY_SIZE); setTextColor.apply(null, BLACK);
    doc.text('Construction Activities Performed and Observed on this Date:', ML + wsPadding, wsContentY + BODY_SIZE);
    wsContentY += BODY_SIZE + 8;

    var pdfDisplayDate = reportDate || 'this date';

    // Sort: contractors with work first, no-work at bottom
    var pdfSortedContractors = [].concat(RS.projectContractors).sort(function(a, b) {
        var actA = getContractorActivity(a.id);
        var actB = getContractorActivity(b.id);
        var noA = actA?.noWork === true || !(actA?.narrative || '').trim();
        var noB = actB?.noWork === true || !(actB?.narrative || '').trim();
        if (noA && !noB) return 1;
        if (!noA && noB) return -1;
        if (a.type === 'prime' && b.type !== 'prime') return -1;
        if (a.type !== 'prime' && b.type === 'prime') return 1;
        return 0;
    });

    pdfSortedContractors.forEach(function(contractor) {
        if (wsContentY > curY) curY = wsContentY;
        checkPageBreak(60);
        wsContentY = curY;

        var activity = getContractorActivity(contractor.id);
        var crews = contractor.crews || [];
        var typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
        var trades = contractor.trades ? ' (' + contractor.trades.toUpperCase() + ')' : '';
        var abbrev = contractor.abbreviation ? ' (' + contractor.abbreviation + ')' : '';

        setFont('bold', BODY_SIZE); setTextColor.apply(null, BLACK);
        var cTitle = contractor.name.toUpperCase() + abbrev + ' – ' + typeLabel + trades;
        wrapText(cTitle, CW - wsPadding * 2, BODY_SIZE, 'bold').forEach(function(line) {
            doc.text(line, ML + wsPadding, wsContentY + BODY_SIZE);
            wsContentY += BODY_SIZE * 1.3;
        });

        var narrative = activity?.narrative || '';
        var isNoWork = activity?.noWork === true || !narrative.trim();

        if (crews.length === 0) {
            if (isNoWork) {
                setFont('normal', BODY_SIZE);
                doc.text('No work performed', ML + wsPadding, wsContentY + BODY_SIZE);
                wsContentY += BODY_SIZE * 1.5;
            } else {
                narrative.split('\n').filter(function(l) { return l.trim(); }).forEach(function(line) {
                    var prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                    setFont('normal', BODY_SIZE);
                    wrapText(prefix + line.trim(), CW - wsPadding * 2 - 10, BODY_SIZE, 'normal').forEach(function(wl, i) {
                        if (wsContentY + BODY_SIZE > PH - 55) {
                            var boxH = wsContentY - wsStartY + wsPadding;
                            setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);
                            doc.line(ML, wsStartY, ML, wsStartY + boxH);
                            doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                            doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);
                            drawPageFooter(); doc.addPage(); pageNum++; curY = MT;
                            drawReportHeader(); wsContentY = curY + wsPadding;
                            wsStartY = curY; // Reset box start for new page
                        }
                        doc.text(i === 0 ? wl : '  ' + wl, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                        wsContentY += BODY_SIZE * 1.3;
                    });
                });
                wsContentY += 3;
            }
        } else {
            crews.forEach(function(crewObj) {
                var crewActivity = getCrewActivity(contractor.id, crewObj.id);
                var crewNarrative = crewActivity?.narrative || '';
                var crewIsNoWork = !crewNarrative.trim();

                if (wsContentY + 30 > PH - 55) {
                    var boxH = wsContentY - wsStartY + wsPadding;
                    setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);
                    doc.line(ML, wsStartY, ML, wsStartY + boxH);
                    doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                    doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);
                    drawPageFooter(); doc.addPage(); pageNum++; curY = MT;
                    drawReportHeader(); wsContentY = curY + wsPadding;
                    wsStartY = curY; // Reset box start for new page
                }

                setFont('bold', BODY_SIZE);
                doc.text(crewObj.name, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                wsContentY += BODY_SIZE * 1.4;

                if (crewIsNoWork) {
                    setFont('italic', BODY_SIZE);
                    doc.text('No work performed on ' + pdfDisplayDate + '.', ML + wsPadding + 10, wsContentY + BODY_SIZE);
                    wsContentY += BODY_SIZE * 1.5;
                } else {
                    crewNarrative.split('\n').filter(function(l) { return l.trim(); }).forEach(function(line) {
                        var prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                        setFont('normal', BODY_SIZE);
                        wrapText(prefix + line.trim(), CW - wsPadding * 2 - 15, BODY_SIZE, 'normal').forEach(function(wl, i) {
                            doc.text(i === 0 ? wl : '  ' + wl, ML + wsPadding + 10, wsContentY + BODY_SIZE);
                            wsContentY += BODY_SIZE * 1.3;
                        });
                    });
                    wsContentY += 3;
                }
            });
        }
        wsContentY += 4;
    });

    wsContentY += wsPadding;
    var wsBoxH = wsContentY - wsStartY;
    setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);
    doc.line(ML, wsStartY, ML, wsStartY + wsBoxH);
    doc.line(ML + CW, wsStartY, ML + CW, wsStartY + wsBoxH);
    doc.line(ML, wsStartY + wsBoxH, ML + CW, wsStartY + wsBoxH);
    curY = wsStartY + wsBoxH;

    // ═══ DAILY OPERATIONS TABLE ═══
    drawSectionHeader('DAILY OPERATIONS');
    var opsColWidths = [60, 70, 55, 55, 60, 85, 65, 90];
    var opsHeaders = ['CONTRACTOR', 'TRADE', 'SUPER(S)', 'FOREMAN', 'OPERATOR(S)', 'LABORER(S) /\nELECTRICIAN(S)', 'SURVEYOR(S)', 'OTHER(S)'];
    var opsHeaderH = 22;
    var ox = ML;
    opsHeaders.forEach(function(hdr, i) {
        drawCell(ox, curY, opsColWidths[i], opsHeaderH, hdr, { fill: GRAY_BG, bold: true, fontSize: TABLE_HEADER_SIZE, align: 'center' });
        ox += opsColWidths[i];
    });
    curY += opsHeaderH;

    RS.projectContractors.forEach(function(contractor) {
        checkPageBreak(18);
        var ops = getContractorOperations(contractor.id);
        var abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
        var trades = pdfFormatTradesAbbrev(contractor.trades);
        var opsRowH = 16;
        var rowData = [abbrev, trades, ops?.superintendents || 'N/A', ops?.foremen || 'N/A', ops?.operators || 'N/A', ops?.laborers || 'N/A', ops?.surveyors || 'N/A', ops?.others || 'N/A'];
        var rx = ML;
        rowData.forEach(function(val, i) {
            drawCell(rx, curY, opsColWidths[i], opsRowH, val, { fontSize: TABLE_CELL_SIZE, align: i < 2 ? 'left' : 'center' });
            rx += opsColWidths[i];
        });
        curY += opsRowH;
    });

    // ═══ EQUIPMENT TABLE ═══
    drawSectionHeader('MOBILIZED EQUIPMENT & DAILY UTILIZATION');
    var eqColWidths = [100, 240, 60, 140];
    var eqHeaders = ['CONTRACTOR', 'EQUIPMENT TYPE / MODEL #', 'QUANTITY', 'NOTES'];
    var eqHeaderH = 20;
    var ex = ML;
    eqHeaders.forEach(function(hdr, i) {
        drawCell(ex, curY, eqColWidths[i], eqHeaderH, hdr, { fill: GRAY_BG, bold: true, fontSize: TABLE_HEADER_SIZE, align: 'center' });
        ex += eqColWidths[i];
    });
    curY += eqHeaderH;

    var equipmentData = getEquipmentData();
    if (equipmentData.length === 0) {
        drawCell(ML, curY, CW, 16, 'No equipment mobilized', { fontSize: TABLE_CELL_SIZE, align: 'center' });
        curY += 16;
    } else {
        equipmentData.forEach(function(item, idx) {
            checkPageBreak(16);
            var cName = pdfGetContractorName(item.contractorId, item.contractorName);
            var eqNotes = pdfFormatEquipNotes(item.status, item.hoursUsed);
            var editKey = 'equipment_' + idx;
            var editedType = ue[editKey]?.type || item.type || '';
            var editedQty = ue[editKey]?.qty || item.qty || 1;
            var editedNotes = ue[editKey]?.notes || eqNotes;
            var rowData = [cName, editedType, String(editedQty), editedNotes];
            var rx = ML;
            rowData.forEach(function(val, i) {
                drawCell(rx, curY, eqColWidths[i], 16, val, { fontSize: TABLE_CELL_SIZE, align: i < 2 ? 'left' : 'center' });
                rx += eqColWidths[i];
            });
            curY += 16;
        });
    }

    // ═══ ISSUES ═══
    drawSectionHeader('GENERAL ISSUES; UNFORESEEN CONDITIONS; NOTICES GIVEN');
    var issuesText = formVal('issuesText', '');
    curY += drawTextBox(issuesText || 'N/A.', ML, curY, CW, { bulletPoints: !!issuesText });

    // ═══ COMMUNICATIONS ═══
    drawSectionHeader('COMMUNICATIONS WITH THE CONTRACTOR');
    var commsText = formVal('communicationsText', '');
    curY += drawTextBox(commsText || 'N/A.', ML, curY, CW, { bulletPoints: !!commsText });

    // ═══ QA/QC ═══
    drawSectionHeader('QA/QC TESTING AND/OR INSPECTIONS');
    var qaqcText = formVal('qaqcText', '');
    curY += drawTextBox(qaqcText || 'N/A.', ML, curY, CW, { bulletPoints: !!qaqcText });

    // ═══ SAFETY ═══
    drawSectionHeader('SAFETY REPORT');
    var hasIncident = document.getElementById('safetyHasIncident')?.checked || false;
    var safetyBoxStartY = curY;
    setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5);

    setFont('bold', BODY_SIZE); setTextColor.apply(null, BLACK);
    doc.text('Incident(s) on this Date:', ML + 8, curY + 14);

    var cbSize = 10, cbY = curY + 6, yesX = ML + CW - 120;
    doc.rect(yesX, cbY, cbSize, cbSize, 'S');
    if (hasIncident) { setFont('bold', 8); doc.text('X', yesX + 2.5, cbY + 8.5); }
    setFont('normal', BODY_SIZE); doc.text('Yes', yesX + cbSize + 4, curY + 14);

    var noX = yesX + 50;
    doc.rect(noX, cbY, cbSize, cbSize, 'S');
    if (!hasIncident) { setFont('bold', 8); doc.text('X', noX + 2.5, cbY + 8.5); }
    setFont('normal', BODY_SIZE); doc.text('No', noX + cbSize + 4, curY + 14);

    curY += 22;

    var safetyNotes = formVal('safetyText', '');
    var safetyLines = wrapText(safetyNotes || 'N/A.', CW - 16, BODY_SIZE, 'normal');
    var safetyLineH = BODY_SIZE * 1.3;
    var safetyTextH = safetyLines.length * safetyLineH + 8;
    setFont('normal', BODY_SIZE);
    var safetyTextY = curY + 4 + BODY_SIZE;
    safetyLines.forEach(function(line) { doc.text(line, ML + 8, safetyTextY); safetyTextY += safetyLineH; });
    curY += safetyTextH;

    doc.line(ML, safetyBoxStartY, ML, curY);
    doc.line(ML + CW, safetyBoxStartY, ML + CW, curY);
    doc.line(ML, curY, ML + CW, curY);

    // ═══ VISITORS ═══
    drawSectionHeader('VISITORS; DELIVERIES; ADDITIONAL CONTRACT AND/OR CHANGE ORDER ACTIVITIES; OTHER REMARKS');
    var visitorsText = formVal('visitorsText', '');
    curY += drawTextBox(visitorsText || 'N/A.', ML, curY, CW, { bulletPoints: !!visitorsText });

    drawPageFooter();

    // ═══ PHOTO PAGES ═══
    var photos = RS.report.photos || [];
    if (photos.length > 0) {
        var photosPerPage = 4;
        var totalPhotoPages = Math.ceil(photos.length / photosPerPage);

        for (var pp = 0; pp < totalPhotoPages; pp++) {
            doc.addPage(); pageNum++; curY = MT;
            drawReportHeader();
            drawSectionHeader(pp === 0 ? 'DAILY PHOTOS' : 'DAILY PHOTOS (CONTINUED)');

            var infoH = 30;
            setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5); doc.rect(ML, curY, CW, infoH, 'S');
            setFont('bold', VALUE_SIZE); setTextColor.apply(null, BLACK);
            doc.text('Project Name:', ML + 8, curY + 12);
            setFont('normal', VALUE_SIZE); doc.text(projectName, ML + 85, curY + 12);
            setFont('bold', VALUE_SIZE); doc.text('Project #:', ML + 8, curY + 24);
            setFont('normal', VALUE_SIZE); doc.text(noabNo, ML + 85, curY + 24);
            curY += infoH;

            var pagePhotos = photos.slice(pp * photosPerPage, (pp + 1) * photosPerPage);
            var photoCellW = CW / 2, photoCellH = 165, photoImgH = 120;

            for (var pi = 0; pi < pagePhotos.length; pi++) {
                var photo = pagePhotos[pi];
                var col = pi % 2, row = Math.floor(pi / 2);
                var cx = ML + col * photoCellW, cy = curY + row * photoCellH;

                setDrawColor.apply(null, BLACK); doc.setLineWidth(0.5); doc.rect(cx, cy, photoCellW, photoCellH, 'S');

                if (photo.url) {
                    try {
                        var imgData = await loadImageAsDataURL(photo.url);
                        if (imgData) {
                            var imgPad = 8, imgW = photoCellW - imgPad * 2, imgH = photoImgH - imgPad;
                            doc.addImage(imgData, 'JPEG', cx + imgPad, cy + imgPad, imgW, imgH);
                        }
                    } catch (imgErr) {
                        console.warn('[PDF-VECTOR] Failed to load photo:', imgErr);
                        setFont('italic', 8); setTextColor(150, 150, 150);
                        doc.text('Photo unavailable', cx + photoCellW / 2, cy + photoImgH / 2, { align: 'center' });
                    }
                }

                var metaY = cy + photoImgH + 4;
                setFont('bold', 7); setTextColor.apply(null, BLACK);
                doc.text('Date:', cx + 8, metaY);
                setFont('normal', 7);
                doc.text(photo.date || reportDate, cx + 30, metaY);

                if (photo.caption) {
                    setFont('italic', 7); setTextColor(51, 51, 51);
                    var capLines = wrapText(photo.caption, photoCellW - 16, 7, 'italic');
                    var capY = metaY + 10;
                    capLines.forEach(function(cl) { doc.text(cl, cx + 8, capY); capY += 9; });
                }
            }

            curY += Math.ceil(pagePhotos.length / 2) * photoCellH;
            drawPageFooter();
        }
    }

    // Fix total page count
    var numPages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= numPages; p++) {
        doc.setPage(p);
        var footerY = PH - 25;
        setFillColor.apply(null, WHITE);
        doc.rect(ML, footerY - 2, CW, 14, 'F');
        setFont('normal', FOOTER_SIZE);
        setTextColor(102, 102, 102);
        doc.text(p + ' of ' + numPages, PW / 2, footerY, { align: 'center' });
    }

    // Generate output
    var pName = (projectName || 'Report').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    var rDate = formVal('reportDate') || getReportDateStr() || getLocalDateString();
    var filename = pName + '_' + rDate + '.pdf';

    console.log('[PDF-VECTOR] PDF generation complete:', filename, '(' + numPages + ' pages)');

    var blob = doc.output('blob');
    console.log('[PDF-VECTOR] Blob size:', blob.size, 'bytes');

    return { blob: blob, filename: filename };
}

/**
 * Load an image URL as a data URL for embedding in jsPDF
 */
async function loadImageAsDataURL(url) {
    return new Promise(function(resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                var canvas = document.createElement('canvas');
                var maxDim = 800;
                var w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                    else { w = Math.round(w * maxDim / h); h = maxDim; }
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) { resolve(null); }
        };
        img.onerror = function() { resolve(null); };
        setTimeout(function() { resolve(null); }, 10000);
        img.src = url;
    });
}
