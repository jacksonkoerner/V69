// FieldVoice Pro - Final Review Page Logic
// DOT RPR Daily Report viewer with print-optimized layout
// v6.6.24: Fix date timezone bug - parse YYYY-MM-DD as local date in formatDisplayDate()
// v6.6.23: Editable no-work contractors, date timezone fix, expandable textareas
// v6.6.22: Show "No work performed on [date]" for inactive contractors instead of skipping
// v6.6.21: Comprehensive PDF styling overhaul - fix truncation, improve capture quality
// v6.6.14: Fix reports table - add project_id, device_id, user_id
// v6.6.12: Fix PDF pagination - add explicit page breaks to .page elements

// ============ STATE ============
let report = null;
let currentReportId = null; // Supabase report ID
let activeProject = null;
let projectContractors = [];
let userSettings = null;
let userEdits = {}; // Track user edits separately (v6.6.5)
let saveTimeout = null; // For debounced auto-save (v6.6.5)

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadActiveProject();
        await loadUserSettings();
        report = await loadReport();

        if (!report) {
            alert('No report found for this date.');
            window.location.href = 'index.html';
            return;
        }

        // Initialize userEdits from loaded report (v6.6.5)
        userEdits = report.userEdits || {};

        populateReport();
        updateTotalPages();
        checkSubmittedState();
        checkEmptyFields();

        // Setup auto-save listeners for editable fields (v6.6.5)
        setupAutoSave();

        // v6.6.23: Setup no-work toggle listeners
        setupNoWorkToggles();

        // Initialize auto-resize for textareas (v6.6.5)
        initAutoResize();
    } catch (err) {
        console.error('Failed to initialize:', err);
        alert('Failed to load report data. Please try again.');
    }
});

// ============ CHECK SUBMITTED STATE ============
function checkSubmittedState() {
    if (report && report.meta && report.meta.submitted) {
        const submitBtn = document.querySelector('.btn-submit');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-check"></i><span>Submitted</span>';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'default';
        }
    }
}

// ============ PROJECT LOADING ============
async function loadActiveProject() {
    const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (!activeId) {
        console.log('[SUPABASE] No active project ID found in localStorage');
        return null;
    }

    try {
        // Fetch project from Supabase
        const { data: projectRow, error: projectError } = await supabaseClient
            .from('projects')
            .select('*')
            .eq('id', activeId)
            .single();

        if (projectError) {
            console.error('[SUPABASE] Error fetching project:', projectError);
            return null;
        }

        activeProject = fromSupabaseProject(projectRow);

        // Contractors (with crews) come from JSONB column — already parsed
        // Sort contractors: prime first
        projectContractors = [...(activeProject.contractors || [])].sort((a, b) => {
            if (a.type === 'prime' && b.type !== 'prime') return -1;
            if (a.type !== 'prime' && b.type === 'prime') return 1;
            return 0;
        });

        console.log('[SUPABASE] Loaded project:', activeProject.projectName);
        return activeProject;
    } catch (e) {
        console.error('[SUPABASE] Failed to load project:', e);
        return null;
    }
}

// ============ USER SETTINGS LOADING ============
async function loadUserSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('user_profiles')
            .select('*')
            .limit(1)
            .single();

        if (error) {
            console.log('[SUPABASE] No user settings found:', error.message);
            return null;
        }

        userSettings = {
            fullName: data.full_name || '',
            company: data.company || '',
            title: data.title || '',
            email: data.email || '',
            phone: data.phone || ''
        };

        console.log('[SUPABASE] Loaded user settings');
        return userSettings;
    } catch (e) {
        console.error('[SUPABASE] Failed to load user settings:', e);
        return null;
    }
}

// ============ REPORT LOADING ============
function getReportDateStr() {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    // v6.6.23: Use getLocalDateString to avoid timezone issues
    return dateParam || getLocalDateString();
}

async function loadReport() {
    // Clear any stale report ID before loading
    currentReportId = null;

    const params = new URLSearchParams(window.location.search);
    const reportIdParam = params.get('reportId');
    const reportDateStr = getReportDateStr();

    // v6.6.2: Load from localStorage (same source as report.html)
    // This ensures userEdits made on report.html are available here
    if (!reportIdParam) {
        console.error('[FINAL] No reportId in URL params');
        return null;
    }

    // Load from localStorage using getReportData from storage-keys.js
    const reportData = getReportData(reportIdParam);

    if (!reportData) {
        console.error('[FINAL] No report data found in localStorage for:', reportIdParam);
        return null;
    }

    console.log('[FINAL] Loaded report from localStorage:', reportIdParam);

    // Store the report ID
    currentReportId = reportIdParam;

    // Extract data from localStorage structure
    const aiPayload = reportData.aiGenerated || {};
    const originalInput = reportData.originalInput || {};

    // Build the report object matching the expected structure
    const loadedReport = {
        overview: {
            projectName: activeProject?.projectName || '',
            noabProjectNo: activeProject?.noabProjectNo || '',
            date: reportData.reportDate || reportDateStr,
            startTime: originalInput.startTime || activeProject?.defaultStartTime || '',
            endTime: originalInput.endTime || activeProject?.defaultEndTime || '',
            completedBy: userSettings?.fullName || '',
            weather: originalInput.weather || {},
            location: activeProject?.location || '',
            cnoSolicitationNo: activeProject?.cnoSolicitationNo || 'N/A',
            engineer: activeProject?.engineer || '',
            contractor: activeProject?.primeContractor || '',
            contractDay: calculateContractDay(activeProject?.noticeToProceed, reportData.reportDate || reportDateStr),
            weatherDays: activeProject?.weatherDays || 0
        },
        meta: {
            status: reportData.status || 'refined',
            submitted: reportData.status === 'submitted',
            submittedAt: null,
            createdAt: reportData.createdAt,
            updatedAt: reportData.lastSaved
        },
        activities: [],
        operations: [],
        equipment: [],
        photos: [],
        aiGenerated: {},
        userEdits: reportData.userEdits || {},
        originalInput: originalInput,
        fieldNotes: originalInput.transcript || '',
        guidedNotes: originalInput.guidedNotes || {},
        issues: '',
        communications: '',
        qaqc: '',
        visitors: '',
        safety: { hasIncident: false, notes: '' }
    };

    // Process AI-generated content if available
    if (aiPayload) {
        // v6.6: Support both old and new field names for backwards compatibility
        loadedReport.aiGenerated = {
            activities: aiPayload.activities || [],
            operations: aiPayload.operations || [],
            equipment: aiPayload.equipment || [],
            // v6.6: Support both old (generalIssues) and new (issues_delays) field names
            issues_delays: aiPayload.issues_delays || aiPayload.generalIssues || [],
            qaqc_notes: aiPayload.qaqc_notes || aiPayload.qaqcNotes || [],
            safety: aiPayload.safety || { has_incidents: false, hasIncidents: false, noIncidents: true, summary: '', notes: '' },
            communications: aiPayload.communications || aiPayload.contractorCommunications || '',
            visitors_deliveries: aiPayload.visitors_deliveries || aiPayload.visitorsRemarks || '',
            // v6.6: New fields
            executive_summary: aiPayload.executive_summary || '',
            work_performed: aiPayload.work_performed || '',
            inspector_notes: aiPayload.inspector_notes || '',
            extraction_confidence: aiPayload.extraction_confidence || 'high',
            missing_data_flags: aiPayload.missing_data_flags || []
        };

        console.log('[FINAL] Loaded AI data from localStorage:', loadedReport.aiGenerated);

        // Copy AI text sections to report for easy access
        // v6.6: Handle both old and new field names
        const issuesData = aiPayload.issues_delays || aiPayload.generalIssues;
        if (Array.isArray(issuesData)) {
            loadedReport.issues = issuesData.join('\n');
        } else {
            loadedReport.issues = issuesData || '';
        }

        loadedReport.communications = aiPayload.communications || aiPayload.contractorCommunications || '';

        // Handle both array and string formats for qaqc
        const qaqcData = aiPayload.qaqc_notes || aiPayload.qaqcNotes;
        if (Array.isArray(qaqcData)) {
            loadedReport.qaqc = qaqcData.join('\n');
        } else {
            loadedReport.qaqc = qaqcData || '';
        }

        loadedReport.visitors = aiPayload.visitors_deliveries || aiPayload.visitorsRemarks || '';

        // Safety - handle different property names (has_incidents vs hasIncidents vs hasIncident)
        if (aiPayload.safety) {
            // v6.6: Support new safety.summary field alongside old safety.notes
            const safetyNotes = aiPayload.safety.summary ||
                (Array.isArray(aiPayload.safety.notes) ? aiPayload.safety.notes.join('\n') : (aiPayload.safety.notes || ''));
            loadedReport.safety = {
                hasIncident: aiPayload.safety.has_incidents || aiPayload.safety.hasIncidents || aiPayload.safety.hasIncident || false,
                noIncidents: aiPayload.safety.noIncidents || !aiPayload.safety.has_incidents || false,
                notes: safetyNotes
            };
        }
    }

    // Process photos from originalInput (these have URLs from Supabase storage)
    if (originalInput.photos && originalInput.photos.length > 0) {
        loadedReport.photos = originalInput.photos.map(photo => ({
            id: photo.id || '',
            url: photo.url || '',
            storagePath: photo.storagePath || '',
            fileName: photo.fileName || '',
            caption: photo.caption || '',
            date: photo.date || '',
            time: photo.time || '',
            gps: photo.gps || null
        }));
    }

    console.log('[FINAL] Report loaded with userEdits:', Object.keys(loadedReport.userEdits));
    return loadedReport;
}

function calculateContractDay(noticeToProceed, reportDate) {
    if (!noticeToProceed || !reportDate) return '';
    try {
        const ntpDate = new Date(noticeToProceed);
        const repDate = new Date(reportDate);
        const diffTime = repDate - ntpDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays > 0 ? diffDays : '';
    } catch (e) {
        return '';
    }
}

// ============ POPULATE REPORT ============
function populateReport() {
    const o = report.overview || {};
    const ai = report.aiGenerated || {};
    const userEdits = report.userEdits || {};

    // v6.6.4: Debug logging for userEdits
    console.log('[FINAL] populateReport() - userEdits keys:', Object.keys(userEdits));
    console.log('[FINAL] populateReport() - userEdits object:', JSON.stringify(userEdits, null, 2).substring(0, 500));

    // Helper to get value with priority
    function getValue(path, defaultVal = '') {
        if (userEdits[path] !== undefined) {
            console.log('[FINAL] getValue() - Using userEdit for', path, ':', userEdits[path]);
            return userEdits[path];
        }
        const aiVal = getNestedValue(ai, path);
        if (aiVal !== undefined && aiVal !== null && aiVal !== '') {
            if (Array.isArray(aiVal)) return aiVal.join('\n');
            return aiVal;
        }
        const reportVal = getNestedValue(report, path);
        if (reportVal !== undefined && reportVal !== null && reportVal !== '') {
            if (Array.isArray(reportVal)) return reportVal.join('\n');
            return reportVal;
        }
        return defaultVal;
    }

    function getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => (o || {})[k], obj);
    }

    // Update header date
    document.getElementById('headerDate').textContent = formatDisplayDate(o.date);

    // Project Overview
    document.getElementById('projectName').textContent = getValue('overview.projectName', activeProject?.projectName || '');
    document.getElementById('reportDate').textContent = formatDisplayDate(o.date);
    document.getElementById('noabProjectNo').textContent = getValue('overview.noabProjectNo', activeProject?.noabProjectNo || '');
    document.getElementById('location').textContent = getValue('overview.location', activeProject?.location || '');
    document.getElementById('cnoSolicitationNo').textContent = getValue('overview.cnoSolicitationNo', activeProject?.cnoSolicitationNo || 'N/A');
    document.getElementById('engineer').textContent = getValue('overview.engineer', activeProject?.engineer || '');

    // Notice to Proceed
    const ntpDate = activeProject?.noticeToProceed;
    document.getElementById('noticeToProceed').textContent = ntpDate ? formatDisplayDate(ntpDate) : '';

    document.getElementById('contractor').textContent = getValue('overview.contractor', activeProject?.primeContractor || '');

    // Contract Duration
    const duration = activeProject?.contractDuration;
    document.getElementById('contractDuration').textContent = duration ? `${duration} days` : '';

    // Times
    document.getElementById('startTime').textContent = formatTimeLocal(getValue('overview.startTime', activeProject?.defaultStartTime || ''));
    document.getElementById('endTime').textContent = formatTimeLocal(getValue('overview.endTime', activeProject?.defaultEndTime || ''));

    // Expected Completion
    const expectedDate = activeProject?.expectedCompletion;
    document.getElementById('expectedCompletion').textContent = expectedDate ? formatDisplayDate(expectedDate) : '';

    // Shift Duration
    const startTime = getValue('overview.startTime', activeProject?.defaultStartTime || '');
    const endTime = getValue('overview.endTime', activeProject?.defaultEndTime || '');
    document.getElementById('shiftDuration').textContent = calculateShiftDuration(startTime, endTime);

    // Contract Day
    const contractDay = getValue('overview.contractDay', '');
    if (contractDay && duration) {
        document.getElementById('contractDay').textContent = `${contractDay} of ${duration} days`;
    } else {
        document.getElementById('contractDay').textContent = contractDay;
    }

    // Weather Days
    document.getElementById('weatherDays').textContent = getValue('overview.weatherDays', activeProject?.weatherDays || '0') + ' days';

    // Completed By
    document.getElementById('completedBy').textContent = getValue('overview.completedBy', '');

    // Weather
    // v6.6.21: Improved fallback handling for placeholder values like "--" and "Syncing..."
    const weather = o.weather || {};

    // Helper to clean weather values - treats "--", "Syncing...", empty as N/A
    const cleanWeatherDisplay = (value, defaultVal = 'N/A') => {
        if (!value || value === '--' || value === 'Syncing...' || value === 'N/A' || value.trim() === '') {
            return defaultVal;
        }
        return value;
    };

    const highTemp = cleanWeatherDisplay(weather.highTemp);
    const lowTemp = cleanWeatherDisplay(weather.lowTemp);
    const precipitation = cleanWeatherDisplay(weather.precipitation, '0.00"');
    const generalCondition = cleanWeatherDisplay(weather.generalCondition, 'Not recorded');
    const jobSiteCondition = cleanWeatherDisplay(weather.jobSiteCondition);
    const adverseConditions = cleanWeatherDisplay(weather.adverseConditions, 'None');

    document.getElementById('weatherTemps').textContent = `High Temp: ${highTemp}${highTemp !== 'N/A' ? '' : ''} Low Temp: ${lowTemp}${lowTemp !== 'N/A' ? '' : ''}`;
    document.getElementById('weatherPrecip').textContent = `Precipitation: ${precipitation}`;
    document.getElementById('weatherCondition').textContent = `General Condition: ${generalCondition}`;
    document.getElementById('weatherJobSite').textContent = `Job Site Condition: ${jobSiteCondition}`;
    document.getElementById('weatherAdverse').textContent = `Adverse Conditions: ${adverseConditions}`;

    // Signature
    const sigName = getValue('signature.name', getValue('overview.completedBy', ''));
    const sigTitle = getValue('signature.title', '');
    const sigCompany = getValue('signature.company', '');
    document.getElementById('signatureName').textContent = sigName;

    let sigDetails = '';
    if (sigTitle || sigCompany) {
        // v6.6.23: Use getLocalDateString to avoid timezone issues
        sigDetails = `Digitally signed by ${sigName}\nDN: cn=${sigName}, c=US,\no=${sigCompany}, ou=${sigTitle},\nemail=${sigName.toLowerCase().replace(/\s/g, '')}@${sigCompany.toLowerCase().replace(/\s/g, '')}.com\nDate: ${getLocalDateString()}`;
    }
    document.getElementById('signatureDetails').innerHTML = sigDetails.replace(/\n/g, '<br>');

    // Render dynamic sections
    renderWorkSummary();
    renderOperationsTable();
    renderEquipmentTable();
    renderTextSections();
    renderSafetySection();
    renderPhotos();
    renderLogo();
}

// ============ LOGO RENDERING ============
function renderLogo() {
    // Check if activeProject has a logo
    // Priority: logoUrl (full quality) > logoThumbnail (compressed) > logo (legacy)
    const logoSrc = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;

    if (logoSrc) {
        // Update all logo containers across all pages
        const logoContainers = [
            { placeholder: 'logoPlaceholder', image: 'logoImage' },
            { placeholder: 'logoPlaceholder2', image: 'logoImage2' },
            { placeholder: 'logoPlaceholder3', image: 'logoImage3' },
            { placeholder: 'logoPlaceholder4', image: 'logoImage4' }
        ];

        logoContainers.forEach(container => {
            const placeholder = document.getElementById(container.placeholder);
            const image = document.getElementById(container.image);

            if (placeholder && image) {
                placeholder.style.display = 'none';
                image.src = logoSrc;
                image.style.display = 'block';
            }
        });
    }
}

// ============ WORK SUMMARY ============
// v6.9: Updated to support crews per contractor
function renderWorkSummary() {
    const container = document.getElementById('workSummaryContent');

    if (projectContractors.length === 0) {
        // No contractors - show general work summary with editable textarea (v6.6.5)
        const workText = getTextValue('guidedNotes.workSummary', 'issues', 'generalIssues', '');
        container.innerHTML = createEditableTextarea('guidedNotes.workSummary', workText, 'Enter work summary...');
        return;
    }

    // v6.9: Render contractor blocks with crew sub-sections
    let html = '';
    const reportDate = report.overview?.date || getReportDateStr();
    const displayDate = reportDate ? formatDisplayDate(reportDate) : 'this date';

    projectContractors.forEach(contractor => {
        const activity = getContractorActivity(contractor.id);
        const crews = contractor.crews || [];

        // Get content values
        const narrative = activity?.narrative || '';
        const equipment = activity?.equipmentUsed || '';
        const crew = activity?.crew || '';

        const typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
        const trades = contractor.trades ? ` (${contractor.trades.toUpperCase()})` : '';
        const activityPath = `activity_${contractor.id}`;

        // v6.6.22: Detect "no work" state - either explicit flag or all fields empty
        const isNoWork = activity?.noWork === true || (!narrative.trim() && !equipment.trim() && !crew.trim());

        if (crews.length === 0) {
            // === NO CREWS: render like before ===
            if (isNoWork) {
                const contractorId = contractor.id;
                html += `<div class="contractor-block" style="margin-bottom: 16px; page-break-inside: avoid;" data-contractor-id="${contractorId}">`;
                html += `<div class="contractor-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
                html += `<div class="contractor-name" style="font-weight: bold;">${escapeHtml(contractor.name)} – ${typeLabel}${trades}</div>`;
                html += `<label class="no-work-toggle" style="font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;">`;
                html += `<input type="checkbox" class="no-work-checkbox" data-contractor-id="${contractorId}" checked>`;
                html += `<span>No work performed</span>`;
                html += `</label>`;
                html += `</div>`;
                html += `<div class="contractor-fields" data-contractor-id="${contractorId}" style="display: none;">`;
                html += `<div class="contractor-narrative-container" style="margin-bottom: 8px;">`;
                html += `<textarea class="editable-field contractor-narrative" data-path="${activityPath}.narrative" data-contractor-id="${contractorId}" placeholder="Describe work performed..." style="width: 100%; min-height: 60px;"></textarea>`;
                html += `</div>`;
                html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">`;
                html += `<div><label style="font-size: 8pt; font-weight: bold; color: #666;">EQUIPMENT</label>`;
                html += `<textarea class="editable-field contractor-equipment" data-path="${activityPath}.equipmentUsed" data-contractor-id="${contractorId}" placeholder="Equipment used..." style="width: 100%; min-height: 40px;"></textarea></div>`;
                html += `<div><label style="font-size: 8pt; font-weight: bold; color: #666;">CREW</label>`;
                html += `<textarea class="editable-field contractor-crew" data-path="${activityPath}.crew" data-contractor-id="${contractorId}" placeholder="Crew count..." style="width: 100%; min-height: 40px;"></textarea></div>`;
                html += `</div></div>`;
                html += `<div class="no-work-message" data-contractor-id="${contractorId}" style="font-style: italic; color: #333; padding-left: 8px;">`;
                html += `No work performed on ${displayDate}.`;
                html += `</div>`;
                html += `</div>`;
            } else {
                html += `<div class="contractor-block" style="margin-bottom: 16px;">`;
                html += `<div class="contractor-name" style="font-weight: bold; margin-bottom: 8px;">${escapeHtml(contractor.name)} – ${typeLabel}${trades}</div>`;
                html += `<div class="contractor-narrative-container" style="margin-bottom: 8px;">
                    <textarea class="editable-field contractor-narrative" data-path="${activityPath}.narrative" data-contractor-id="${contractor.id}" placeholder="Describe work performed by ${escapeHtml(contractor.name)}...">${escapeHtml(narrative)}</textarea>
                </div>`;
                html += `<div class="contractor-details-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div><label style="font-size: 8pt; font-weight: bold; color: #666; text-transform: uppercase;">Equipment</label>
                    <textarea class="editable-field contractor-equipment" data-path="${activityPath}.equipmentUsed" data-contractor-id="${contractor.id}" placeholder="Equipment used...">${escapeHtml(equipment)}</textarea></div>
                    <div><label style="font-size: 8pt; font-weight: bold; color: #666; text-transform: uppercase;">Crew</label>
                    <textarea class="editable-field contractor-crew" data-path="${activityPath}.crew" data-contractor-id="${contractor.id}" placeholder="Crew count/description...">${escapeHtml(crew)}</textarea></div>
                </div>`;
                html += `</div>`;
            }
        } else {
            // === HAS CREWS: render contractor header + crew sub-sections ===
            html += `<div class="contractor-block" style="margin-bottom: 16px; page-break-inside: avoid;" data-contractor-id="${contractor.id}">`;
            html += `<div class="contractor-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
            html += `<div class="contractor-name" style="font-weight: bold;">${escapeHtml(contractor.name)} – ${typeLabel}${trades}</div>`;

            if (isNoWork) {
                html += `<label class="no-work-toggle" style="font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;">`;
                html += `<input type="checkbox" class="no-work-checkbox" data-contractor-id="${contractor.id}" checked>`;
                html += `<span>No work performed</span>`;
                html += `</label>`;
            }
            html += `</div>`;

            if (isNoWork) {
                // Hidden fields for when user unchecks
                html += `<div class="contractor-fields" data-contractor-id="${contractor.id}" style="display: none;">`;
                crews.forEach(crewObj => {
                    const crewActivityPath = `activity_${contractor.id}_crew_${crewObj.id}`;
                    const crewActivity = getCrewActivity(contractor.id, crewObj.id);
                    html += `<div style="margin-left: 12px; margin-bottom: 12px; border-left: 3px solid #ddd; padding-left: 10px;">`;
                    html += `<div style="font-weight: 600; font-size: 10pt; margin-bottom: 4px;">${escapeHtml(crewObj.name)}</div>`;
                    html += `<textarea class="editable-field" data-path="${crewActivityPath}.narrative" placeholder="Work performed by ${escapeHtml(crewObj.name)}..." style="width: 100%; min-height: 50px;">${escapeHtml(crewActivity?.narrative || '')}</textarea>`;
                    html += `</div>`;
                });
                html += `</div>`;
                html += `<div class="no-work-message" data-contractor-id="${contractor.id}" style="font-style: italic; color: #333; padding-left: 8px;">`;
                html += `No work performed on ${displayDate}.`;
                html += `</div>`;
            } else {
                // Render each crew sub-section
                crews.forEach(crewObj => {
                    const crewActivityPath = `activity_${contractor.id}_crew_${crewObj.id}`;
                    const crewActivity = getCrewActivity(contractor.id, crewObj.id);
                    const crewNarrative = crewActivity?.narrative || '';
                    const crewEquipment = crewActivity?.equipmentUsed || '';
                    const crewPersonnel = crewActivity?.crew || '';
                    const crewIsNoWork = !crewNarrative.trim() && !crewEquipment.trim() && !crewPersonnel.trim();

                    html += `<div style="margin-left: 12px; margin-bottom: 12px; border-left: 3px solid ${contractor.type === 'prime' ? '#16a34a' : '#1d4ed8'}; padding-left: 10px;">`;
                    html += `<div style="font-weight: 600; font-size: 10pt; margin-bottom: 4px;">${escapeHtml(crewObj.name)}</div>`;
                    
                    if (crewIsNoWork) {
                        html += `<div style="font-style: italic; color: #333; font-size: 9pt;">No work performed on ${displayDate}.</div>`;
                    } else {
                        html += `<textarea class="editable-field" data-path="${crewActivityPath}.narrative" placeholder="Work performed by ${escapeHtml(crewObj.name)}..." style="width: 100%; min-height: 50px;">${escapeHtml(crewNarrative)}</textarea>`;
                        if (crewEquipment || crewPersonnel) {
                            html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">`;
                            html += `<div><label style="font-size: 8pt; font-weight: bold; color: #666;">EQUIPMENT</label>`;
                            html += `<textarea class="editable-field" data-path="${crewActivityPath}.equipmentUsed" placeholder="Equipment..." style="width: 100%; min-height: 30px;">${escapeHtml(crewEquipment)}</textarea></div>`;
                            html += `<div><label style="font-size: 8pt; font-weight: bold; color: #666;">PERSONNEL</label>`;
                            html += `<textarea class="editable-field" data-path="${crewActivityPath}.crew" placeholder="Personnel..." style="width: 100%; min-height: 30px;">${escapeHtml(crewPersonnel)}</textarea></div>`;
                            html += `</div>`;
                        }
                    }
                    html += `</div>`;
                });
            }

            html += `</div>`;
        }
    });

    container.innerHTML = html;
}

/**
 * v6.9: Get crew-specific activity data
 * Checks userEdits > aiGenerated > report.activities
 */
function getCrewActivity(contractorId, crewId) {
    const userEdits = report.userEdits || {};
    const userEditKey = `activity_${contractorId}_crew_${crewId}`;
    if (userEdits[userEditKey]) {
        return userEdits[userEditKey];
    }

    // Check AI-generated activities for crew-level data
    if (report.aiGenerated?.activities) {
        const aiActivity = report.aiGenerated.activities.find(a =>
            a.contractorId === contractorId && a.crewId === crewId
        );
        if (aiActivity) return aiActivity;
    }

    // Fall back to report.activities
    if (report.activities) {
        return report.activities.find(a => a.contractorId === contractorId && a.crewId === crewId);
    }
    return null;
}

/**
 * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
 * v6.6.4: Added debug logging
 */
function getContractorActivity(contractorId) {
    const userEdits = report.userEdits || {};
    const userEditKey = `activity_${contractorId}`;
    if (userEdits[userEditKey]) {
        console.log('[FINAL] getContractorActivity() - Using userEdit for', userEditKey);
        return userEdits[userEditKey];
    }
    console.log('[FINAL] getContractorActivity() - No userEdit for', userEditKey, ', checking AI');

    // Get contractor name for freeform matching
    const contractor = projectContractors.find(c => c.id === contractorId);
    const contractorName = contractor?.name;

    if (report.aiGenerated?.activities) {
        // Try matching by contractorId first (guided mode)
        let aiActivity = report.aiGenerated.activities.find(a => a.contractorId === contractorId);
        
        // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
        if (!aiActivity && contractorName) {
            aiActivity = report.aiGenerated.activities.find(a => 
                a.contractorId === null && 
                a.contractorName?.toLowerCase() === contractorName.toLowerCase()
            );
        }
        
        if (aiActivity) return aiActivity;
    }

    if (report.activities) {
        return report.activities.find(a => a.contractorId === contractorId);
    }
    return null;
}

// ============ OPERATIONS TABLE ============
function renderOperationsTable() {
    const tbody = document.getElementById('operationsTableBody');

    if (projectContractors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#666;">No contractors defined</td></tr>`;
        return;
    }

    let html = '';
    projectContractors.forEach(contractor => {
        const ops = getContractorOperations(contractor.id);
        const abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
        const trades = formatTradesAbbrev(contractor.trades);
        const opsPath = `operations_${contractor.id}`;

        // Create editable input for each personnel field
        const createEditableCell = (field, value) => {
            const displayVal = value || '';
            return `<input type="text"
                class="editable-cell"
                data-path="${opsPath}.${field}"
                data-contractor-id="${contractor.id}"
                value="${escapeHtml(displayVal)}"
                placeholder="--">`;
        };

        html += `<tr>
            <td>${escapeHtml(abbrev)}</td>
            <td>${escapeHtml(trades)}</td>
            <td>${createEditableCell('superintendents', ops?.superintendents)}</td>
            <td>${createEditableCell('foremen', ops?.foremen)}</td>
            <td>${createEditableCell('operators', ops?.operators)}</td>
            <td>${createEditableCell('laborers', ops?.laborers)}</td>
            <td>${createEditableCell('surveyors', ops?.surveyors)}</td>
            <td>${createEditableCell('others', ops?.others)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

/**
 * v6.6: Supports matching by contractorName for freeform mode (when contractorId is null)
 */
function getContractorOperations(contractorId) {
    const userEdits = report.userEdits || {};
    const userEditKey = `operations_${contractorId}`;
    if (userEdits[userEditKey]) return userEdits[userEditKey];

    // Get contractor name for freeform matching
    const contractor = projectContractors.find(c => c.id === contractorId);
    const contractorName = contractor?.name;

    if (report.aiGenerated?.operations) {
        // Try matching by contractorId first (guided mode)
        let aiOps = report.aiGenerated.operations.find(o => o.contractorId === contractorId);
        
        // v6.6: Fallback to name matching for freeform mode (where contractorId is null)
        if (!aiOps && contractorName) {
            aiOps = report.aiGenerated.operations.find(o => 
                o.contractorId === null && 
                o.contractorName?.toLowerCase() === contractorName.toLowerCase()
            );
        }
        
        if (aiOps) return aiOps;
    }

    if (report.operations) {
        return report.operations.find(o => o.contractorId === contractorId);
    }
    return null;
}

function formatTradesAbbrev(trades) {
    if (!trades) return '-';
    // Common trade abbreviations
    const abbrevMap = {
        'construction management': 'CM',
        'project management': 'PM',
        'pile driving': 'PLE',
        'concrete': 'CONC',
        'asphalt': 'ASP',
        'utilities': 'UTL',
        'earthwork': 'ERTHWRK',
        'electrical': 'ELEC',
        'communications': 'COMM',
        'fence': 'FENCE',
        'pavement markings': 'PVMNT MRK',
        'hauling': 'HAUL',
        'pavement subgrade': 'PVMT SUB',
        'demo': 'DEMO',
        'demolition': 'DEMO',
        'general': 'GEN'
    };

    const parts = trades.split(/[;,]/).map(t => t.trim().toLowerCase());
    const abbrevs = parts.map(t => abbrevMap[t] || t.substring(0, 6).toUpperCase());
    return abbrevs.join('; ');
}

// ============ EQUIPMENT TABLE ============
function renderEquipmentTable() {
    const tbody = document.getElementById('equipmentTableBody');
    const equipmentData = getEquipmentData();

    if (equipmentData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#666;">No equipment mobilized</td></tr>`;
        return;
    }

    let html = '';
    equipmentData.forEach((item, index) => {
        // v6.6: Pass contractorName fallback for freeform mode
        const contractorName = getContractorName(item.contractorId, item.contractorName);
        // v6.6.6: Improved equipment notes parsing
        const notes = formatEquipmentNotes(item.status, item.hoursUsed);
        const equipPath = `equipment_${index}`;

        html += `<tr>
            <td>${escapeHtml(contractorName)}</td>
            <td><input type="text"
                class="editable-cell"
                data-path="${equipPath}.type"
                data-equipment-index="${index}"
                value="${escapeHtml(item.type || '')}"
                placeholder="Equipment type..."></td>
            <td><input type="text"
                class="editable-cell"
                data-path="${equipPath}.qty"
                data-equipment-index="${index}"
                value="${item.qty || 1}"
                placeholder="1"
                style="width: 40px;"></td>
            <td><input type="text"
                class="editable-cell"
                data-path="${equipPath}.notes"
                data-equipment-index="${index}"
                value="${escapeHtml(notes)}"
                placeholder="Notes..."></td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

/**
 * v6.6.6: Format equipment notes column properly
 * Shows "IDLE" when idle, "X HRS UTILIZED" when has hours
 */
function formatEquipmentNotes(status, hoursUsed) {
    // Check for explicit idle status
    if (!status || status.toLowerCase() === 'idle' || status === '0' || status === '0 hrs') {
        return 'IDLE';
    }
    
    // Extract hours from various formats
    let hours = hoursUsed;
    if (!hours && status) {
        // Try to extract number from status string (e.g., "8 hrs", "8", "8 hours")
        const match = status.match(/(\d+(?:\.\d+)?)/);
        if (match) {
            hours = parseFloat(match[1]);
        }
    }
    
    if (hours && hours > 0) {
        return `${hours} HRS UTILIZED`;
    }
    
    return 'IDLE';
}

/**
 * v6.6: Supports resolving contractorId from contractorName for freeform mode
 */
function getEquipmentData() {
    if (report.equipment && report.equipment.length > 0) {
        return report.equipment;
    }
    if (report.aiGenerated?.equipment && report.aiGenerated.equipment.length > 0) {
        return report.aiGenerated.equipment.map(item => {
            // v6.6: Resolve contractorId from contractorName for freeform mode
            let contractorId = item.contractorId || '';
            if (!contractorId && item.contractorName) {
                const matchedContractor = projectContractors.find(c => 
                    c.name?.toLowerCase() === item.contractorName?.toLowerCase()
                );
                if (matchedContractor) {
                    contractorId = matchedContractor.id;
                }
            }
            
            return {
                contractorId: contractorId,
                contractorName: item.contractorName || '',
                type: item.type || '',
                qty: item.qty || item.quantity || 1,
                status: item.status || (item.hoursUsed ? `${item.hoursUsed} hrs` : 'IDLE')
            };
        });
    }
    return [];
}

/**
 * v6.6: Updated to support contractorName fallback for freeform mode
 */
function getContractorName(contractorId, contractorNameFallback = null) {
    const contractor = projectContractors.find(c => c.id === contractorId);
    if (contractor) {
        return contractor.abbreviation || contractor.name.substring(0, 15).toUpperCase();
    }
    // v6.6: Use contractorName from AI response if no matching contractor found
    if (contractorNameFallback) {
        return contractorNameFallback.substring(0, 15).toUpperCase();
    }
    return 'UNKNOWN';
}

// ============ TEXT SECTIONS ============
function renderTextSections() {
    // v6.6: Updated to use new field names with fallback to old names
    // v6.6.5: Now renders editable textareas instead of static HTML

    // Issues
    const issues = getTextValueWithFallback('issues', 'issues_delays', 'generalIssues', 'guidedNotes.issues', '');
    document.getElementById('issuesContent').innerHTML = createEditableTextarea('issues', issues, 'Enter issues/delays...');

    // Communications
    const comms = getTextValueWithFallback('communications', 'communications', 'contractorCommunications', '', '');
    document.getElementById('communicationsContent').innerHTML = createEditableTextarea('communications', comms, 'Enter communications...');

    // QA/QC
    const qaqc = getTextValueWithFallback('qaqc', 'qaqc_notes', 'qaqcNotes', '', '');
    document.getElementById('qaqcContent').innerHTML = createEditableTextarea('qaqc', qaqc, 'Enter QA/QC notes...');

    // Visitors
    const visitors = getTextValueWithFallback('visitors', 'visitors_deliveries', 'visitorsRemarks', '', '');
    document.getElementById('visitorsContent').innerHTML = createEditableTextarea('visitors', visitors, 'Enter visitors/deliveries...');
}

/**
 * v6.6.5: Create an editable textarea for text sections
 */
function createEditableTextarea(path, value, placeholder) {
    const escapedValue = escapeHtml(value || '');
    return `<textarea
        class="editable-field"
        data-path="${path}"
        placeholder="${placeholder}"
    >${escapedValue}</textarea>`;
}

/**
 * v6.6: Get text value with support for both new and legacy AI field names
 * v6.6.4: Added debug logging
 */
function getTextValueWithFallback(reportPath, aiPath, legacyAiPath, fallbackPath, defaultVal) {
    const userEdits = report.userEdits || {};

    // User edits first
    if (userEdits[reportPath] !== undefined) {
        console.log('[FINAL] getTextValueWithFallback() - Using userEdit for', reportPath, ':', userEdits[reportPath]);
        return userEdits[reportPath];
    }
    console.log('[FINAL] getTextValueWithFallback() - No userEdit for', reportPath, ', checking AI/fallback');

    // AI generated - try new field name first, then legacy
    if (report.aiGenerated) {
        let aiVal = getNestedValueSimple(report.aiGenerated, aiPath);
        if ((aiVal === undefined || aiVal === null || aiVal === '') && legacyAiPath) {
            aiVal = getNestedValueSimple(report.aiGenerated, legacyAiPath);
        }
        if (aiVal !== undefined && aiVal !== null && aiVal !== '') {
            if (Array.isArray(aiVal)) return aiVal.join('\n');
            return aiVal;
        }
    }

    // Report value
    const reportVal = getNestedValueSimple(report, reportPath);
    if (reportVal !== undefined && reportVal !== null && reportVal !== '') {
        if (Array.isArray(reportVal)) return reportVal.join('\n');
        return reportVal;
    }

    // Fallback path
    if (fallbackPath) {
        const fallbackVal = getNestedValueSimple(report, fallbackPath);
        if (fallbackVal !== undefined && fallbackVal !== null && fallbackVal !== '') {
            if (Array.isArray(fallbackVal)) return fallbackVal.join('\n');
            return fallbackVal;
        }
    }

    return defaultVal;
}

function getTextValue(reportPath, aiPath, fallbackPath, defaultVal) {
    const userEdits = report.userEdits || {};

    // User edits first
    if (userEdits[reportPath] !== undefined) {
        console.log('[FINAL] getTextValue() - Using userEdit for', reportPath, ':', userEdits[reportPath]);
        return userEdits[reportPath];
    }
    console.log('[FINAL] getTextValue() - No userEdit for', reportPath, ', checking AI/fallback');

    // AI generated
    if (report.aiGenerated) {
        const aiVal = getNestedValueSimple(report.aiGenerated, aiPath);
        if (aiVal !== undefined && aiVal !== null && aiVal !== '') {
            if (Array.isArray(aiVal)) return aiVal.join('\n');
            return aiVal;
        }
    }

    // Report value
    const reportVal = getNestedValueSimple(report, reportPath);
    if (reportVal !== undefined && reportVal !== null && reportVal !== '') {
        if (Array.isArray(reportVal)) return reportVal.join('\n');
        return reportVal;
    }

    // Fallback path
    if (fallbackPath) {
        const fallbackVal = getNestedValueSimple(report, fallbackPath);
        if (fallbackVal !== undefined && fallbackVal !== null && fallbackVal !== '') {
            if (Array.isArray(fallbackVal)) return fallbackVal.join('\n');
            return fallbackVal;
        }
    }

    return defaultVal;
}

function getNestedValueSimple(obj, path) {
    return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

function formatTextSection(text) {
    if (!text || text.trim() === '') {
        return '<ul><li class="na-text">N/A.</li></ul>';
    }

    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
        return '<ul><li class="na-text">N/A.</li></ul>';
    }

    if (lines.length === 1) {
        return `<ul><li>${escapeHtml(lines[0])}</li></ul>`;
    }

    return '<ul>' + lines.map(line => `<li>${escapeHtml(line)}</li>`).join('') + '</ul>';
}

// ============ SAFETY SECTION ============
function renderSafetySection() {
    // v6.6: Support both old (hasIncidents) and new (has_incidents) field names
    const hasIncident = report.safety?.hasIncident ||
                        report.aiGenerated?.safety?.has_incidents ||
                        report.aiGenerated?.safety?.hasIncidents ||
                        false;
    const noIncident = !hasIncident;

    document.getElementById('checkYes').textContent = hasIncident ? 'X' : '';
    document.getElementById('checkYes').classList.toggle('checked', hasIncident);
    document.getElementById('checkNo').textContent = noIncident ? 'X' : '';
    document.getElementById('checkNo').classList.toggle('checked', noIncident);

    // v6.6: Support both old (safety.notes) and new (safety.summary) field names
    // v6.6.5: Now renders editable textarea instead of static HTML
    const safetyNotes = getTextValueWithFallback('safety.notes', 'safety.summary', 'safety.notes', 'guidedNotes.safety', '');
    document.getElementById('safetyContent').innerHTML = createEditableTextarea('safety.notes', safetyNotes, 'Enter safety observations...');
}

// ============ PHOTOS ============
function renderPhotos() {
    const photos = report.photos || [];
    const grid = document.getElementById('photosGrid');
    const projectName = report.overview?.projectName || activeProject?.projectName || '';
    const projectNo = report.overview?.noabProjectNo || activeProject?.noabProjectNo || '';

    document.getElementById('photoProjectName').textContent = projectName;
    document.getElementById('photoProjectNo').textContent = projectNo;

    // v6.6.6: Only render cells for actual photos, single message when empty
    if (photos.length === 0) {
        grid.innerHTML = `
            <div class="photo-cell no-photos-message" style="grid-column: 1 / -1; text-align: center; min-height: 100px; display: flex; align-items: center; justify-content: center;">
                <p style="color: #666; font-style: italic;">No photos documented for this date.</p>
            </div>
        `;
        return;
    }

    // Generate photo cells only for actual photos (no empty cells)
    // v6.6.5: Photo captions are now editable textareas
    let html = '';
    const displayPhotos = photos.slice(0, 4); // First 4 photos for page 4

    displayPhotos.forEach((photo, i) => {
        html += `
            <div class="photo-cell">
                <div class="photo-image">
                    <img src="${photo.url}" alt="Photo ${i + 1}">
                </div>
                <div class="photo-meta"><span>Date:</span> ${photo.date || formatDisplayDate(report.overview?.date)}</div>
                <textarea
                    class="editable-field photo-caption"
                    data-path="photos[${i}].caption"
                    data-photo-index="${i}"
                    placeholder="Add caption..."
                >${escapeHtml(photo.caption || '')}</textarea>
            </div>
        `;
    });

    grid.innerHTML = html;

    // If more than 4 photos, add additional photo pages
    if (photos.length > 4) {
        addAdditionalPhotoPages(photos.slice(4));
    }
}

function addAdditionalPhotoPages(remainingPhotos) {
    const container = document.querySelector('.page-container');
    let pageNum = 5;

    for (let i = 0; i < remainingPhotos.length; i += 4) {
        const pagePhotos = remainingPhotos.slice(i, i + 4);
        const page = document.createElement('div');
        page.className = 'page' + (i + 4 < remainingPhotos.length ? ' page-break' : '');

        // v6.6.6: Only render actual photos, no empty cells
        let photosHtml = '';
        pagePhotos.forEach((photo, j) => {
            const photoIndex = 4 + i + j; // Actual index in photos array (first 4 are on page 4)
            photosHtml += `
                <div class="photo-cell">
                    <div class="photo-image">
                        <img src="${photo.url}" alt="Photo">
                    </div>
                    <div class="photo-meta"><span>Date:</span> ${photo.date || formatDisplayDate(report.overview?.date)}</div>
                    <textarea
                        class="editable-field photo-caption"
                        data-path="photos[${photoIndex}].caption"
                        data-photo-index="${photoIndex}"
                        placeholder="Add caption..."
                    >${escapeHtml(photo.caption || '')}</textarea>
                </div>
            `;
        });

        // Determine logo HTML based on whether project has a logo
        // Priority: logoUrl (full quality) > logoThumbnail (compressed) > logo (legacy)
        const logoSrc = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;
        const logoHtml = logoSrc
            ? `<img src="${logoSrc}" class="report-logo" alt="Project Logo">`
            : `<div class="report-logo-placeholder">LOUIS ARMSTRONG<br>NEW ORLEANS<br>INTERNATIONAL AIRPORT</div>`;

        page.innerHTML = `
            <div class="report-header">
                <div>${logoHtml}</div>
                <div class="report-title">RPR DAILY REPORT</div>
            </div>
            <div class="section-header">Daily Photos (Continued)</div>
            <div class="photos-grid">${photosHtml}</div>
            <div class="page-footer">${pageNum} of <span class="total-pages">4</span></div>
        `;

        container.appendChild(page);
        pageNum++;
    }

    updateTotalPages();
}

function updateTotalPages() {
    const pages = document.querySelectorAll('.page');
    const totalPages = pages.length;
    document.querySelectorAll('.total-pages').forEach(el => {
        el.textContent = totalPages;
    });
}

// ============ UTILITY FUNCTIONS ============
function formatDisplayDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        // v6.6.24: Parse YYYY-MM-DD as local date to avoid UTC timezone shift
        // When parsing "2026-02-04" with new Date(), it's treated as UTC midnight,
        // which displays as 02/03/2026 in timezones behind UTC (e.g., EST, PST)
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-');
            const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        }
        // For other date formats (already formatted, ISO with time, etc.)
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

// Local formatTime to avoid conflict with ui-utils.js formatTime
function formatTimeLocal(timeStr) {
    if (!timeStr) return '';
    try {
        // Handle already formatted time (e.g., "6:00 AM")
        if (timeStr.includes('AM') || timeStr.includes('PM')) {
            return timeStr;
        }
        // Handle 24-hour format (e.g., "06:00")
        const parts = timeStr.split(':');
        if (parts.length < 2) return timeStr;
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return timeStr;
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
    } catch (e) {
        return timeStr;
    }
}

function calculateShiftDuration(startTime, endTime) {
    if (!startTime || !endTime) return '';
    try {
        // Handle already formatted times
        let startHours, startMinutes, endHours, endMinutes;

        if (startTime.includes(':')) {
            const startParts = startTime.split(':');
            startHours = parseInt(startParts[0], 10);
            startMinutes = parseInt(startParts[1], 10) || 0;
        } else {
            return '';
        }

        if (endTime.includes(':')) {
            const endParts = endTime.split(':');
            endHours = parseInt(endParts[0], 10);
            endMinutes = parseInt(endParts[1], 10) || 0;
        } else {
            return '';
        }

        if (isNaN(startHours) || isNaN(endHours)) return '';

        let diffMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
        if (diffMinutes < 0) diffMinutes += 24 * 60; // Handle overnight

        const hours = diffMinutes / 60;
        return `${hours.toFixed(2)} hours`;
    } catch (e) {
        return '';
    }
}

// ============ NAVIGATION ============
function goToEdit() {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam) {
        window.location.href = `report.html?date=${dateParam}`;
    } else {
        window.location.href = 'report.html';
    }
}

// ============ PDF GENERATION & SUBMIT FLOW ============

/**
 * v6.6.10: Wait for all images in an element to load
 * @param {HTMLElement} element - Element containing images
 * @param {number} timeout - Max wait time per image in ms
 */
async function waitForImages(element, timeout = 5000) {
    const images = element.querySelectorAll('img');
    if (images.length === 0) return;

    const promises = Array.from(images).map(img => {
        if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            const timer = setTimeout(resolve, timeout);
            img.onload = () => { clearTimeout(timer); resolve(); };
            img.onerror = () => { clearTimeout(timer); resolve(); };
        });
    });
    await Promise.all(promises);
}

/**
 * v6.6.21: Prepare DOM for PDF capture
 * - Forces textarea auto-resize
 * - Replaces textareas with divs for cleaner capture (textareas can render poorly in html2canvas)
 * - Waits for images to load
 */
async function prepareForPdfCapture() {
    console.log('[PDF] Preparing DOM for PDF capture...');

    // 1. Force all textareas to auto-resize and set overflow visible
    document.querySelectorAll('textarea.editable-field').forEach(textarea => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.style.overflow = 'visible';
    });

    // 2. Replace textareas with divs for cleaner capture
    // html2canvas sometimes has issues with textarea rendering
    document.querySelectorAll('.page').forEach(page => {
        page.querySelectorAll('textarea').forEach(textarea => {
            const div = document.createElement('div');
            div.className = textarea.className + ' textarea-replacement';

            // Copy computed styles
            const computedStyle = window.getComputedStyle(textarea);
            div.style.fontFamily = computedStyle.fontFamily;
            div.style.fontSize = computedStyle.fontSize;
            div.style.lineHeight = computedStyle.lineHeight;
            div.style.padding = computedStyle.padding;
            div.style.margin = computedStyle.margin;
            div.style.width = computedStyle.width;
            div.style.color = computedStyle.color;

            // Override problematic styles
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordWrap = 'break-word';
            div.style.overflow = 'visible';
            div.style.height = 'auto';
            div.style.minHeight = 'auto';
            div.style.border = 'none';
            div.style.background = 'transparent';

            // Set content
            div.textContent = textarea.value || textarea.placeholder || '';
            div.dataset.originalTextarea = 'true';
            div.dataset.path = textarea.dataset.path || '';

            // Hide original textarea, insert replacement
            textarea.style.display = 'none';
            textarea.parentNode.insertBefore(div, textarea);
        });
    });

    // 3. Wait for reflow to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // 4. Ensure all images are loaded
    const images = document.querySelectorAll('.page img');
    await Promise.all(Array.from(images).map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            setTimeout(resolve, 5000); // Max 5s per image
        });
    }));

    console.log('[PDF] DOM preparation complete');
}

/**
 * v6.6.21: Restore DOM after PDF capture
 * - Removes replacement divs
 * - Shows original textareas
 */
function restoreAfterPdfCapture() {
    console.log('[PDF] Restoring DOM after capture...');

    // Remove replacement divs and restore textareas
    document.querySelectorAll('.textarea-replacement').forEach(div => {
        const textarea = div.nextElementSibling;
        if (textarea && textarea.tagName === 'TEXTAREA') {
            textarea.style.display = '';
        }
        div.remove();
    });

    console.log('[PDF] DOM restored');
}

/**
 * Main submit function - orchestrates the complete submit flow
 * 1. Check online status
 * 2. Generate PDF from page content
 * 3. Upload PDF to Supabase Storage
 * 4. Save metadata to final_reports table
 * 5. Update reports table status to 'submitted'
 * 6. Clear local storage for this report
 * 7. Navigate to archives with success message
 */
async function submitReport() {
    // 1. Check online status
    if (!navigator.onLine) {
        showError('Cannot submit offline. Please connect to internet.');
        return;
    }

    if (!report) {
        showError('No report data found.');
        return;
    }

    if (!currentReportId) {
        showError('No report ID found. Cannot submit.');
        return;
    }

    // 2. Show loading state
    showSubmitLoading(true);

    try {
        console.log('[SUBMIT] Starting report submission for:', currentReportId);

        // 3. Generate PDF from page content (vector text rendering)
        console.log('[SUBMIT] Generating PDF...');
        const pdf = await generateVectorPDF();
        console.log('[SUBMIT] PDF generated:', pdf.filename);

        // 4. Upload PDF to Supabase Storage
        console.log('[SUBMIT] Uploading PDF to storage...');
        const pdfUrl = await uploadPDFToStorage(pdf);
        console.log('[SUBMIT] PDF uploaded:', pdfUrl);

        // 5. Ensure report exists in reports table (foreign key requirement)
        console.log('[SUBMIT] Ensuring report exists in reports table...');
        await ensureReportExists();
        console.log('[SUBMIT] Report record ensured');

        // 6. Save metadata to final_reports table
        console.log('[SUBMIT] Saving to final_reports...');
        await saveToFinalReports(pdfUrl);
        console.log('[SUBMIT] Saved to final_reports');

        // 7. Update reports table status to 'submitted'
        console.log('[SUBMIT] Updating report status...');
        await updateReportStatus('submitted', pdfUrl);
        console.log('[SUBMIT] Report status updated');

        // 8. Clear local storage for this report
        console.log('[SUBMIT] Cleaning up local storage...');
        await cleanupLocalStorage();
        console.log('[SUBMIT] Local storage cleaned up');

        // 9. Navigate to archives with success message
        console.log('[SUBMIT] Submit complete, navigating to archives...');
        window.location.href = 'archives.html?submitted=true';

    } catch (error) {
        console.error('[SUBMIT] Error:', error);
        showError('Submit failed: ' + error.message);
        showSubmitLoading(false);
    }
}

/**
 * v6.9: Generate PDF with crisp vector text using jsPDF direct drawing.
 * Replaces html2canvas rasterization with jsPDF text(), line(), rect() calls.
 * Matches Justin Cain's reference RPR report format exactly.
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
async function generateVectorPDF() {
    console.log('[PDF-VECTOR] Starting vector PDF generation');

    // Get jsPDF constructor
    const jsPDFConstructor = (typeof jspdf !== 'undefined' && jspdf.jsPDF)
        || (typeof jsPDF !== 'undefined' && jsPDF)
        || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
        || (typeof window !== 'undefined' && window.jsPDF);

    if (!jsPDFConstructor) {
        throw new Error('jsPDF library not found.');
    }

    // Create PDF (letter size)
    const doc = new jsPDFConstructor({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
        compress: true
    });

    // ── Constants ──
    const PW = 612;     // page width
    const PH = 792;     // page height
    const ML = 36;      // margin left (0.5 in)
    const MR = 36;      // margin right
    const MT = 30;      // margin top
    const CW = PW - ML - MR; // content width = 540
    const GREEN = [74, 124, 52];   // #4a7c34
    const GRAY_BG = [245, 245, 245]; // #f5f5f5
    const BLACK = [0, 0, 0];
    const WHITE = [255, 255, 255];
    const DARK_BLUE = [30, 58, 95]; // #1e3a5f for signature

    let curY = MT;   // current Y cursor
    let pageNum = 1;
    let totalPages = 3; // will recalculate at end

    // ── Font sizes (pt) ──
    const TITLE_SIZE = 18;
    const SECTION_HEADER_SIZE = 10;
    const LABEL_SIZE = 8;
    const VALUE_SIZE = 9;
    const TABLE_HEADER_SIZE = 6;
    const TABLE_CELL_SIZE = 8;
    const BODY_SIZE = 9;
    const FOOTER_SIZE = 8;
    const SMALL_SIZE = 7;

    // ── Collect all pages for total count ──
    const pageContents = []; // Array of functions that draw each page

    // ── Helper: set font ──
    function setFont(style, size) {
        doc.setFont('helvetica', style); // helvetica is jsPDF built-in closest to Arial
        doc.setFontSize(size);
    }

    // ── Helper: text color ──
    function setTextColor(r, g, b) {
        doc.setTextColor(r, g, b);
    }

    // ── Helper: draw color ──
    function setDrawColor(r, g, b) {
        doc.setDrawColor(r, g, b);
    }

    // ── Helper: fill color ──
    function setFillColor(r, g, b) {
        doc.setFillColor(r, g, b);
    }

    // ── Helper: wrap text to fit width, returns array of lines ──
    function wrapText(text, maxWidth, fontSize, fontStyle) {
        if (!text) return [''];
        setFont(fontStyle || 'normal', fontSize || BODY_SIZE);
        const lines = doc.splitTextToSize(String(text), maxWidth);
        return lines.length > 0 ? lines : [''];
    }

    // ── Helper: measure text height ──
    function textHeight(lines, fontSize) {
        const lineH = (fontSize || BODY_SIZE) * 1.25;
        return lines.length * lineH;
    }

    // ── Helper: check if we need a new page, add one if so ──
    function checkPageBreak(neededHeight) {
        const footerReserve = 30;
        if (curY + neededHeight > PH - MT - footerReserve) {
            drawPageFooter();
            doc.addPage();
            pageNum++;
            curY = MT;
            drawReportHeader();
            return true;
        }
        return false;
    }

    // ── Helper: draw page footer ──
    function drawPageFooter() {
        const footerY = PH - 25;
        setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(ML, footerY - 4, ML + CW, footerY - 4);
        setFont('normal', FOOTER_SIZE);
        setTextColor(102, 102, 102);
        doc.text(`${pageNum} of {{TOTAL}}`, PW / 2, footerY, { align: 'center' });
    }

    // Pre-load logo image before drawing (if available)
    let logoDataUrl = null;
    const logoSrcUrl = activeProject?.logoUrl || activeProject?.logoThumbnail || activeProject?.logo;
    if (logoSrcUrl) {
        try {
            logoDataUrl = await loadImageAsDataURL(logoSrcUrl);
        } catch (e) {
            console.warn('[PDF-VECTOR] Failed to pre-load logo:', e);
        }
    }

    // ── Helper: draw report header (logo area + title) ──
    function drawReportHeader() {
        if (logoDataUrl) {
            try {
                doc.addImage(logoDataUrl, 'JPEG', ML, curY + 2, 0, 38);
            } catch (e) {
                setFont('bold', 9);
                setTextColor(...DARK_BLUE);
                doc.text('LOUIS ARMSTRONG', ML, curY + 12);
                doc.text('NEW ORLEANS', ML, curY + 22);
                doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
            }
        } else {
            setFont('bold', 9);
            setTextColor(...DARK_BLUE);
            doc.text('LOUIS ARMSTRONG', ML, curY + 12);
            doc.text('NEW ORLEANS', ML, curY + 22);
            doc.text('INTERNATIONAL AIRPORT', ML, curY + 32);
        }
        // Title (right side)
        setFont('bold', TITLE_SIZE);
        setTextColor(...GREEN);
        doc.text('RPR DAILY REPORT', ML + CW, curY + 22, { align: 'right' });

        // Green line under header
        curY += 42;
        setDrawColor(...GREEN);
        doc.setLineWidth(2.5);
        doc.line(ML, curY, ML + CW, curY);
        curY += 8;
    }

    // ── Helper: draw green section header bar ──
    function drawSectionHeader(title) {
        const h = 20;
        checkPageBreak(h + 10);

        setFillColor(...GREEN);
        setDrawColor(...BLACK);
        doc.setLineWidth(0.5);
        doc.rect(ML, curY, CW, h, 'FD');

        setFont('bold', SECTION_HEADER_SIZE);
        setTextColor(...WHITE);
        doc.text(title.toUpperCase(), PW / 2, curY + 14, { align: 'center' });

        curY += h;
        setTextColor(...BLACK);
    }

    // ── Helper: draw a table cell ──
    function drawCell(x, y, w, h, text, options = {}) {
        const { fill, bold, fontSize, align, padding, border } = {
            fill: null,
            bold: false,
            fontSize: VALUE_SIZE,
            align: 'left',
            padding: 4,
            border: true,
            ...options
        };

        // Fill background
        if (fill) {
            setFillColor(...fill);
            doc.rect(x, y, w, h, 'F');
        }

        // Border
        if (border) {
            setDrawColor(...BLACK);
            doc.setLineWidth(0.5);
            doc.rect(x, y, w, h, 'S');
        }

        // Text
        if (text !== undefined && text !== null) {
            setFont(bold ? 'bold' : 'normal', fontSize);
            setTextColor(...BLACK);
            const textX = align === 'center' ? x + w / 2 : x + padding;
            const textY = y + h / 2 + fontSize * 0.3;
            const maxW = w - padding * 2;
            const displayText = String(text);

            if (align === 'center') {
                doc.text(displayText, textX, textY, { align: 'center', maxWidth: maxW });
            } else {
                doc.text(displayText, textX, textY, { maxWidth: maxW });
            }
        }
    }

    // ── Helper: draw multi-line text in a bordered box (with page break support) ──
    function drawTextBox(text, x, y, w, options = {}) {
        const { fontSize, fontStyle, padding, borderTop, bulletPoints } = {
            fontSize: BODY_SIZE,
            fontStyle: 'normal',
            padding: 8,
            borderTop: false,
            bulletPoints: false,
            ...options
        };

        const innerW = w - padding * 2;
        let lines;

        if (bulletPoints && text) {
            const rawLines = String(text).split('\n').filter(l => l.trim());
            lines = [];
            rawLines.forEach(line => {
                const prefixed = line.startsWith('•') || line.startsWith('-') ? line : `• ${line}`;
                const wrapped = wrapText(prefixed, innerW, fontSize, fontStyle);
                lines.push(...wrapped);
            });
        } else {
            lines = wrapText(text || 'N/A.', innerW, fontSize, fontStyle);
        }

        const lineH = fontSize * 1.3;
        const footerReserve = 35;
        const maxPageY = PH - MT - footerReserve;
        const totalH = lines.length * lineH + padding * 2;

        // Check if entire box fits on current page
        if (y + totalH <= maxPageY + MT) {
            // Fits on one page — draw normally
            setDrawColor(...BLACK);
            doc.setLineWidth(0.5);
            if (borderTop) {
                doc.rect(x, y, w, totalH, 'S');
            } else {
                doc.line(x, y, x, y + totalH);
                doc.line(x + w, y, x + w, y + totalH);
                doc.line(x, y + totalH, x + w, y + totalH);
            }
            setFont(fontStyle, fontSize);
            setTextColor(...BLACK);
            let textY = y + padding + fontSize;
            lines.forEach(line => { doc.text(line, x + padding, textY); textY += lineH; });
            return totalH;
        }

        // Multi-page: draw lines progressively with page breaks
        let boxStartY = y;
        setFont(fontStyle, fontSize);
        setTextColor(...BLACK);
        let textY = y + padding + fontSize;

        for (let i = 0; i < lines.length; i++) {
            if (textY + lineH > maxPageY + MT) {
                const boxH = textY - boxStartY + padding;
                setDrawColor(...BLACK); doc.setLineWidth(0.5);
                doc.line(x, boxStartY, x, boxStartY + boxH);
                doc.line(x + w, boxStartY, x + w, boxStartY + boxH);
                doc.line(x, boxStartY + boxH, x + w, boxStartY + boxH);

                drawPageFooter(); doc.addPage(); pageNum++;
                curY = MT; drawReportHeader();
                boxStartY = curY;
                textY = curY + padding + fontSize;
                setFont(fontStyle, fontSize);
                setTextColor(...BLACK);
            }
            doc.text(lines[i], x + padding, textY);
            textY += lineH;
        }

        // Close final box segment
        const finalH = textY - boxStartY + padding;
        setDrawColor(...BLACK); doc.setLineWidth(0.5);
        doc.line(x, boxStartY, x, boxStartY + finalH);
        doc.line(x + w, boxStartY, x + w, boxStartY + finalH);
        doc.line(x, boxStartY + finalH, x + w, boxStartY + finalH);
        curY = boxStartY + finalH;
        return curY - y;
    }

    // ── Gather data from report ──
    const o = report.overview || {};
    const ai = report.aiGenerated || {};
    const ue = report.userEdits || {};

    // Helper to get display value
    function getVal(path, fallback) {
        if (ue[path] !== undefined) return ue[path];
        const parts = path.split('.');
        let val = report;
        for (const p of parts) { val = (val || {})[p]; }
        if (val !== undefined && val !== null && val !== '') return val;
        return fallback || '';
    }

    // Project overview data
    const projectName = o.projectName || activeProject?.projectName || '';
    const reportDate = formatDisplayDate(o.date);
    const noabNo = o.noabProjectNo || activeProject?.noabProjectNo || '';
    const location = o.location || activeProject?.location || '';
    const cnoNo = o.cnoSolicitationNo || activeProject?.cnoSolicitationNo || 'N/A';
    const engineer = o.engineer || activeProject?.engineer || '';
    const ntpDate = activeProject?.noticeToProceed ? formatDisplayDate(activeProject.noticeToProceed) : '';
    const contractorName = o.contractor || activeProject?.primeContractor || '';
    const duration = activeProject?.contractDuration ? `${activeProject.contractDuration} days` : '';
    const startTime = formatTimeLocal(o.startTime || activeProject?.defaultStartTime || '');
    const endTime = formatTimeLocal(o.endTime || activeProject?.defaultEndTime || '');
    const expectedCompletion = activeProject?.expectedCompletion ? formatDisplayDate(activeProject.expectedCompletion) : '';
    const shiftDuration = calculateShiftDuration(o.startTime || activeProject?.defaultStartTime || '', o.endTime || activeProject?.defaultEndTime || '');
    const contractDay = o.contractDay || '';
    const durationDays = activeProject?.contractDuration || '';
    const contractDayDisplay = contractDay && durationDays ? `${contractDay} of ${durationDays} days` : String(contractDay);
    const weatherDays = (o.weatherDays !== undefined ? o.weatherDays : (activeProject?.weatherDays || 0)) + ' days';
    const completedBy = o.completedBy || userSettings?.fullName || '';
    const weather = o.weather || {};

    const cleanW = (v, d) => (!v || v === '--' || v === 'Syncing...' || v === 'N/A' || String(v).trim() === '') ? (d || 'N/A') : v;
    const highTemp = cleanW(weather.highTemp);
    const lowTemp = cleanW(weather.lowTemp);
    const precipitation = cleanW(weather.precipitation, '0.00"');
    const generalCondition = cleanW(weather.generalCondition, 'Not recorded');
    const jobSiteCondition = cleanW(weather.jobSiteCondition);
    const adverseConditions = cleanW(weather.adverseConditions, 'None');

    // ═══════════════════════════════════════
    // PAGE 1: Header + Overview + Work Summary
    // ═══════════════════════════════════════
    curY = MT;
    drawReportHeader();

    // ── PROJECT OVERVIEW section header ──
    drawSectionHeader('PROJECT OVERVIEW');

    // ── Overview table ──
    // Layout: 4 columns — label1 | value1 | label2 | value2
    const colW = [115, 155, 115, 155]; // widths for the 4 columns
    const rowH = 16;
    const tableX = ML;

    function drawOverviewRow(label1, val1, label2, val2, opts = {}) {
        const rh = opts.height || rowH;
        let x = tableX;
        drawCell(x, curY, colW[0], rh, label1, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
        x += colW[0];
        drawCell(x, curY, colW[1], rh, val1, { fontSize: VALUE_SIZE });
        x += colW[1];
        drawCell(x, curY, colW[2], rh, label2, { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });
        x += colW[2];
        drawCell(x, curY, colW[3], rh, val2, { fontSize: VALUE_SIZE, ...opts.lastCell });
        curY += rh;
    }

    drawOverviewRow('PROJECT NAME:', projectName, 'DATE:', reportDate);
    drawOverviewRow('NOAB PROJECT NO.:', noabNo, 'LOCATION:', location);
    drawOverviewRow('CNO SOLICITATION NO.:', cnoNo, 'ENGINEER:', engineer);
    drawOverviewRow('NOTICE TO PROCEED:', ntpDate, 'CONTRACTOR:', contractorName);
    drawOverviewRow('CONTRACT DURATION:', duration, 'START TIME:', startTime);
    drawOverviewRow('EXPECTED COMPLETION:', expectedCompletion, 'END TIME:', endTime);
    drawOverviewRow('CONTRACT DAY #:', contractDayDisplay, 'SHIFT DURATION:', shiftDuration);
    drawOverviewRow('WEATHER DAYS:', weatherDays, 'COMPLETED BY:', completedBy);

    // ── Weather + Signature rows ──
    // Weather block: 5 sub-rows on left, Signature spanning right
    const weatherRowH = 13;
    const weatherStartY = curY;
    const sigRowCount = 5;
    const totalSigH = weatherRowH * sigRowCount;

    // Weather label cell (spans all 5 rows)
    drawCell(tableX, curY, colW[0], totalSigH, 'WEATHER:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });

    // Signature label (spans all 5 rows)
    drawCell(tableX + colW[0] + colW[1], curY, colW[2], totalSigH, 'SIGNATURE:', { fill: GRAY_BG, bold: true, fontSize: LABEL_SIZE });

    // Signature value cell (spans all 5 rows)
    const sigX = tableX + colW[0] + colW[1] + colW[2];
    setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.rect(sigX, curY, colW[3], totalSigH, 'S');

    // Signature content (cursive name)
    const sigName = completedBy;
    setFont('italic', 14);
    setTextColor(...DARK_BLUE);
    doc.text(sigName, sigX + colW[3] / 2, curY + totalSigH / 2 - 4, { align: 'center' });

    // Signature details small text
    const sigCompany = userSettings?.company || '';
    const sigTitle = userSettings?.title || '';
    if (sigCompany || sigTitle) {
        setFont('normal', 6);
        setTextColor(102, 102, 102);
        const sigDetail = `Digitally signed by ${sigName}`;
        doc.text(sigDetail, sigX + colW[3] / 2, curY + totalSigH / 2 + 8, { align: 'center' });
    }

    // Weather sub-rows (value column only, col[1] width)
    const weatherValX = tableX + colW[0];
    const weatherTexts = [
        `High Temp: ${highTemp}  Low Temp: ${lowTemp}`,
        `Precipitation: ${precipitation}`,
        `General Condition: ${generalCondition}`,
        `Job Site Condition: ${jobSiteCondition}`,
        `Adverse Conditions: ${adverseConditions}`
    ];

    weatherTexts.forEach((wText, i) => {
        const wy = curY + i * weatherRowH;
        setDrawColor(...BLACK);
        doc.setLineWidth(0.5);
        doc.rect(weatherValX, wy, colW[1], weatherRowH, 'S');
        setFont('normal', VALUE_SIZE);
        setTextColor(...BLACK);
        doc.text(wText, weatherValX + 4, wy + weatherRowH / 2 + 3);
    });

    curY += totalSigH;

    // ── DAILY WORK SUMMARY ──
    drawSectionHeader('DAILY WORK SUMMARY');

    // "Construction Activities..." intro line
    const introBoxY = curY;
    setDrawColor(...BLACK);
    doc.setLineWidth(0.5);

    // We'll draw the work summary content then close the box
    let wsStartY = curY;
    const wsPadding = 8;
    let wsContentY = curY + wsPadding;

    setFont('bold', BODY_SIZE);
    setTextColor(...BLACK);
    doc.text('Construction Activities Performed and Observed on this Date:', ML + wsPadding, wsContentY + BODY_SIZE);
    wsContentY += BODY_SIZE + 8;

    // Render each contractor
    const reportDateStr = report.overview?.date || getReportDateStr();
    const displayDate = reportDateStr ? formatDisplayDate(reportDateStr) : 'this date';

    projectContractors.forEach(contractor => {
        // Check page break
        if (wsContentY > curY) curY = wsContentY; // sync cursor
        checkPageBreak(60);
        wsContentY = curY; // after potential page break

        const activity = getContractorActivity(contractor.id);
        const crews = contractor.crews || [];
        const typeLabel = contractor.type === 'prime' ? 'PRIME CONTRACTOR' : 'SUBCONTRACTOR';
        const trades = contractor.trades ? ` (${contractor.trades.toUpperCase()})` : '';
        const abbrev = contractor.abbreviation ? ` (${contractor.abbreviation})` : '';

        // Contractor header
        setFont('bold', BODY_SIZE);
        setTextColor(...BLACK);
        const contractorTitle = `${contractor.name.toUpperCase()}${abbrev} – ${typeLabel}${trades}`;
        const titleLines = wrapText(contractorTitle, CW - wsPadding * 2, BODY_SIZE, 'bold');
        titleLines.forEach(line => {
            doc.text(line, ML + wsPadding, wsContentY + BODY_SIZE);
            wsContentY += BODY_SIZE * 1.3;
        });

        // Check no-work state
        const narrative = activity?.narrative || '';
        const isNoWork = activity?.noWork === true || !narrative.trim();

        if (crews.length === 0) {
            // No crews — simple narrative or "No work performed"
            if (isNoWork) {
                setFont('normal', BODY_SIZE);
                doc.text(`No work performed`, ML + wsPadding, wsContentY + BODY_SIZE);
                wsContentY += BODY_SIZE * 1.5;
            } else {
                // Render narrative as bullet points
                const lines = narrative.split('\n').filter(l => l.trim());
                setFont('normal', BODY_SIZE);
                lines.forEach(line => {
                    const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                    const bulletLine = prefix + line.trim();
                    const wrapped = wrapText(bulletLine, CW - wsPadding * 2 - 10, BODY_SIZE, 'normal');
                    wrapped.forEach((wl, i) => {
                        if (wsContentY + BODY_SIZE > PH - 55) {
                            // Need new page mid-work-summary
                            // Close current box
                            const boxH = wsContentY - wsStartY + wsPadding;
                            setDrawColor(...BLACK);
                            doc.setLineWidth(0.5);
                            doc.line(ML, wsStartY, ML, wsStartY + boxH);
                            doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                            doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);

                            drawPageFooter();
                            doc.addPage();
                            pageNum++;
                            curY = MT;
                            drawReportHeader();
                            wsContentY = curY + wsPadding;
                            wsStartY = curY; // Reset box start for new page
                        }
                        doc.text(i === 0 ? wl : '  ' + wl, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                        wsContentY += BODY_SIZE * 1.3;
                    });
                });
                wsContentY += 3;
            }
        } else {
            // Has crews — render each crew sub-section
            crews.forEach(crewObj => {
                const crewActivity = getCrewActivity(contractor.id, crewObj.id);
                const crewNarrative = crewActivity?.narrative || '';
                const crewIsNoWork = !crewNarrative.trim();

                // Check page break for crew content
                if (wsContentY + 30 > PH - 55) {
                    const boxH = wsContentY - wsStartY + wsPadding;
                    setDrawColor(...BLACK);
                    doc.setLineWidth(0.5);
                    doc.line(ML, wsStartY, ML, wsStartY + boxH);
                    doc.line(ML + CW, wsStartY, ML + CW, wsStartY + boxH);
                    doc.line(ML, wsStartY + boxH, ML + CW, wsStartY + boxH);

                    drawPageFooter();
                    doc.addPage();
                    pageNum++;
                    curY = MT;
                    drawReportHeader();
                    wsContentY = curY + wsPadding;
                    wsStartY = curY; // Reset box start for new page
                }

                // Crew name as bold sub-header
                setFont('bold', BODY_SIZE);
                doc.text(crewObj.name, ML + wsPadding + 5, wsContentY + BODY_SIZE);
                wsContentY += BODY_SIZE * 1.4;

                if (crewIsNoWork) {
                    setFont('italic', BODY_SIZE);
                    doc.text(`No work performed on ${displayDate}.`, ML + wsPadding + 10, wsContentY + BODY_SIZE);
                    wsContentY += BODY_SIZE * 1.5;
                } else {
                    const lines = crewNarrative.split('\n').filter(l => l.trim());
                    setFont('normal', BODY_SIZE);
                    lines.forEach(line => {
                        const prefix = (line.startsWith('•') || line.startsWith('-')) ? '' : '• ';
                        const bulletLine = prefix + line.trim();
                        const wrapped = wrapText(bulletLine, CW - wsPadding * 2 - 15, BODY_SIZE, 'normal');
                        wrapped.forEach((wl, i) => {
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

    // Close the work summary box
    wsContentY += wsPadding;
    const wsBoxH = wsContentY - wsStartY;
    setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.line(ML, wsStartY, ML, wsStartY + wsBoxH); // left
    doc.line(ML + CW, wsStartY, ML + CW, wsStartY + wsBoxH); // right
    doc.line(ML, wsStartY + wsBoxH, ML + CW, wsStartY + wsBoxH); // bottom
    curY = wsStartY + wsBoxH;

    // ═══════════════════════════════════════
    // DAILY OPERATIONS TABLE
    // ═══════════════════════════════════════
    drawSectionHeader('DAILY OPERATIONS');

    // Column headers
    const opsColWidths = [60, 70, 55, 55, 60, 85, 65, 90]; // = 540
    const opsHeaders = ['CONTRACTOR', 'TRADE', 'SUPER(S)', 'FOREMAN', 'OPERATOR(S)', 'LABORER(S) /\nELECTRICIAN(S)', 'SURVEYOR(S)', 'OTHER(S)'];
    const opsHeaderH = 22;

    let ox = ML;
    opsHeaders.forEach((hdr, i) => {
        drawCell(ox, curY, opsColWidths[i], opsHeaderH, hdr, {
            fill: GRAY_BG,
            bold: true,
            fontSize: TABLE_HEADER_SIZE,
            align: 'center'
        });
        ox += opsColWidths[i];
    });
    curY += opsHeaderH;

    // Ops data rows
    projectContractors.forEach(contractor => {
        checkPageBreak(18);
        const ops = getContractorOperations(contractor.id);
        const abbrev = contractor.abbreviation || contractor.name.substring(0, 10).toUpperCase();
        const trades = formatTradesAbbrev(contractor.trades);
        const opsRowH = 16;

        const rowData = [
            abbrev,
            trades,
            ops?.superintendents || 'N/A',
            ops?.foremen || 'N/A',
            ops?.operators || 'N/A',
            ops?.laborers || 'N/A',
            ops?.surveyors || 'N/A',
            ops?.others || 'N/A'
        ];

        let rx = ML;
        rowData.forEach((val, i) => {
            const cellAlign = (i < 2) ? 'left' : 'center';
            drawCell(rx, curY, opsColWidths[i], opsRowH, val, { fontSize: TABLE_CELL_SIZE, align: cellAlign });
            rx += opsColWidths[i];
        });
        curY += opsRowH;
    });

    // ═══════════════════════════════════════
    // MOBILIZED EQUIPMENT & DAILY UTILIZATION
    // ═══════════════════════════════════════
    drawSectionHeader('MOBILIZED EQUIPMENT & DAILY UTILIZATION');

    const eqColWidths = [100, 240, 60, 140]; // = 540
    const eqHeaders = ['CONTRACTOR', 'EQUIPMENT TYPE / MODEL #', 'QUANTITY', 'NOTES'];
    const eqHeaderH = 20;

    let ex = ML;
    eqHeaders.forEach((hdr, i) => {
        drawCell(ex, curY, eqColWidths[i], eqHeaderH, hdr, {
            fill: GRAY_BG,
            bold: true,
            fontSize: TABLE_HEADER_SIZE,
            align: 'center'
        });
        ex += eqColWidths[i];
    });
    curY += eqHeaderH;

    // Equipment data rows
    const equipmentData = getEquipmentData();
    if (equipmentData.length === 0) {
        drawCell(ML, curY, CW, 16, 'No equipment mobilized', { fontSize: TABLE_CELL_SIZE, align: 'center' });
        curY += 16;
    } else {
        equipmentData.forEach((item, idx) => {
            checkPageBreak(16);
            const cName = getContractorName(item.contractorId, item.contractorName);
            const eqNotes = formatEquipmentNotes(item.status, item.hoursUsed);
            const eqRowH = 16;

            // Check userEdits for equipment overrides
            const editKey = `equipment_${idx}`;
            const editedType = ue[editKey]?.type || item.type || '';
            const editedQty = ue[editKey]?.qty || item.qty || 1;
            const editedNotes = ue[editKey]?.notes || eqNotes;

            const rowData = [cName, editedType, String(editedQty), editedNotes];

            let rx = ML;
            rowData.forEach((val, i) => {
                const cellAlign = (i < 2) ? 'left' : 'center';
                drawCell(rx, curY, eqColWidths[i], eqRowH, val, { fontSize: TABLE_CELL_SIZE, align: cellAlign });
                rx += eqColWidths[i];
            });
            curY += eqRowH;
        });
    }

    // ═══════════════════════════════════════
    // GENERAL ISSUES; UNFORESEEN CONDITIONS; NOTICES GIVEN
    // ═══════════════════════════════════════
    drawSectionHeader('GENERAL ISSUES; UNFORESEEN CONDITIONS; NOTICES GIVEN');

    const issuesText = getTextValueWithFallback('issues', 'issues_delays', 'generalIssues', 'guidedNotes.issues', '');
    const issuesH = drawTextBox(issuesText || 'N/A.', ML, curY, CW, { bulletPoints: !!issuesText });
    curY += issuesH;

    // ═══════════════════════════════════════
    // COMMUNICATIONS WITH THE CONTRACTOR
    // ═══════════════════════════════════════
    drawSectionHeader('COMMUNICATIONS WITH THE CONTRACTOR');

    const commsText = getTextValueWithFallback('communications', 'communications', 'contractorCommunications', '', '');
    const commsH = drawTextBox(commsText || 'N/A.', ML, curY, CW, { bulletPoints: !!commsText });
    curY += commsH;

    // ═══════════════════════════════════════
    // QA/QC TESTING AND/OR INSPECTIONS
    // ═══════════════════════════════════════
    drawSectionHeader('QA/QC TESTING AND/OR INSPECTIONS');

    const qaqcText = getTextValueWithFallback('qaqc', 'qaqc_notes', 'qaqcNotes', '', '');
    const qaqcH = drawTextBox(qaqcText || 'N/A.', ML, curY, CW, { bulletPoints: !!qaqcText });
    curY += qaqcH;

    // ═══════════════════════════════════════
    // SAFETY REPORT
    // ═══════════════════════════════════════
    drawSectionHeader('SAFETY REPORT');

    // Safety checkbox line
    const hasIncident = report.safety?.hasIncident ||
                        report.aiGenerated?.safety?.has_incidents ||
                        report.aiGenerated?.safety?.hasIncidents ||
                        false;

    const safetyBoxStartY = curY;
    setDrawColor(...BLACK);
    doc.setLineWidth(0.5);

    // "Incident(s) on this Date:" with checkboxes
    setFont('bold', BODY_SIZE);
    setTextColor(...BLACK);
    doc.text('Incident(s) on this Date:', ML + 8, curY + 14);

    // Yes checkbox
    const cbSize = 10;
    const cbY = curY + 6;
    const yesX = ML + CW - 120;
    doc.rect(yesX, cbY, cbSize, cbSize, 'S');
    if (hasIncident) {
        setFont('bold', 8);
        doc.text('X', yesX + 2.5, cbY + 8.5);
    }
    setFont('normal', BODY_SIZE);
    doc.text('Yes', yesX + cbSize + 4, curY + 14);

    // No checkbox
    const noX = yesX + 50;
    doc.rect(noX, cbY, cbSize, cbSize, 'S');
    if (!hasIncident) {
        setFont('bold', 8);
        doc.text('X', noX + 2.5, cbY + 8.5);
    }
    setFont('normal', BODY_SIZE);
    doc.text('No', noX + cbSize + 4, curY + 14);

    curY += 22;

    // Safety notes
    const safetyNotes = getTextValueWithFallback('safety.notes', 'safety.summary', 'safety.notes', 'guidedNotes.safety', '');
    const safetyLines = wrapText(safetyNotes || 'N/A.', CW - 16, BODY_SIZE, 'normal');
    const safetyLineH = BODY_SIZE * 1.3;
    const safetyTextH = safetyLines.length * safetyLineH + 8;

    setFont('normal', BODY_SIZE);
    let safetyTextY = curY + 4 + BODY_SIZE;
    safetyLines.forEach(line => {
        doc.text(line, ML + 8, safetyTextY);
        safetyTextY += safetyLineH;
    });

    curY += safetyTextH;

    // Draw safety box border
    const safetyTotalH = curY - safetyBoxStartY;
    doc.line(ML, safetyBoxStartY, ML, curY); // left
    doc.line(ML + CW, safetyBoxStartY, ML + CW, curY); // right
    doc.line(ML, curY, ML + CW, curY); // bottom

    // ═══════════════════════════════════════
    // VISITORS / DELIVERIES / OTHER REMARKS (from page 3 of HTML)
    // ═══════════════════════════════════════
    drawSectionHeader('VISITORS; DELIVERIES; ADDITIONAL CONTRACT AND/OR CHANGE ORDER ACTIVITIES; OTHER REMARKS');

    const visitorsText = getTextValueWithFallback('visitors', 'visitors_deliveries', 'visitorsRemarks', '', '');
    const visitorsH = drawTextBox(visitorsText || 'N/A.', ML, curY, CW, { bulletPoints: !!visitorsText });
    curY += visitorsH;

    // Draw page footer for last content page
    drawPageFooter();

    // ═══════════════════════════════════════
    // PHOTO PAGES
    // ═══════════════════════════════════════
    const photos = report.photos || [];
    if (photos.length > 0) {
        const photosPerPage = 4;
        const totalPhotoPages = Math.ceil(photos.length / photosPerPage);

        for (let pp = 0; pp < totalPhotoPages; pp++) {
            doc.addPage();
            pageNum++;
            curY = MT;
            drawReportHeader();

            const headerTitle = pp === 0 ? 'DAILY PHOTOS' : 'DAILY PHOTOS (CONTINUED)';
            drawSectionHeader(headerTitle);

            // Photo info header
            const infoH = 30;
            setDrawColor(...BLACK);
            doc.setLineWidth(0.5);
            doc.rect(ML, curY, CW, infoH, 'S');
            setFont('bold', VALUE_SIZE);
            setTextColor(...BLACK);
            doc.text('Project Name:', ML + 8, curY + 12);
            setFont('normal', VALUE_SIZE);
            doc.text(projectName, ML + 85, curY + 12);
            setFont('bold', VALUE_SIZE);
            doc.text('Project #:', ML + 8, curY + 24);
            setFont('normal', VALUE_SIZE);
            doc.text(noabNo, ML + 85, curY + 24);
            curY += infoH;

            // Render photos in 2x2 grid
            const startIdx = pp * photosPerPage;
            const pagePhotos = photos.slice(startIdx, startIdx + photosPerPage);

            const photoCellW = CW / 2;
            const photoCellH = 165;
            const photoImgH = 120;

            for (let pi = 0; pi < pagePhotos.length; pi++) {
                const photo = pagePhotos[pi];
                const col = pi % 2;
                const row = Math.floor(pi / 2);
                const cx = ML + col * photoCellW;
                const cy = curY + row * photoCellH;

                // Cell border
                setDrawColor(...BLACK);
                doc.setLineWidth(0.5);
                doc.rect(cx, cy, photoCellW, photoCellH, 'S');

                // Try to load and embed photo image
                if (photo.url) {
                    try {
                        // Load image via canvas for cross-origin
                        const imgData = await loadImageAsDataURL(photo.url);
                        if (imgData) {
                            const imgPad = 8;
                            const imgW = photoCellW - imgPad * 2;
                            const imgH = photoImgH - imgPad;
                            doc.addImage(imgData, 'JPEG', cx + imgPad, cy + imgPad, imgW, imgH);
                        }
                    } catch (imgErr) {
                        console.warn('[PDF-VECTOR] Failed to load photo:', imgErr);
                        setFont('italic', 8);
                        setTextColor(150, 150, 150);
                        doc.text('Photo unavailable', cx + photoCellW / 2, cy + photoImgH / 2, { align: 'center' });
                    }
                }

                // Date line
                const metaY = cy + photoImgH + 4;
                setFont('bold', 7);
                setTextColor(...BLACK);
                doc.text('Date:', cx + 8, metaY);
                setFont('normal', 7);
                doc.text(photo.date || formatDisplayDate(report.overview?.date), cx + 30, metaY);

                // Caption
                const caption = photo.caption || '';
                if (caption) {
                    setFont('italic', 7);
                    setTextColor(51, 51, 51);
                    const capLines = wrapText(caption, photoCellW - 16, 7, 'italic');
                    let capY = metaY + 10;
                    capLines.forEach(cl => {
                        doc.text(cl, cx + 8, capY);
                        capY += 9;
                    });
                }
            }

            const photoGridRows = Math.ceil(pagePhotos.length / 2);
            curY += photoGridRows * photoCellH;

            drawPageFooter();
        }
    }

    // ── Fix total page count in all footers ──
    totalPages = pageNum;

    // Replace {{TOTAL}} placeholder with actual page count
    // jsPDF doesn't support find/replace in rendered text, so we use putTotalPages
    // Actually we need a different approach — we'll use doc.internal.getNumberOfPages()
    const numPages = doc.internal.getNumberOfPages();

    // Re-render footers with correct total (jsPDF allows overwriting)
    for (let p = 1; p <= numPages; p++) {
        doc.setPage(p);
        // White out the old footer text area and redraw
        const footerY = PH - 25;
        setFillColor(...WHITE);
        doc.rect(ML, footerY - 2, CW, 14, 'F');
        setFont('normal', FOOTER_SIZE);
        setTextColor(102, 102, 102);
        doc.text(`${p} of ${numPages}`, PW / 2, footerY, { align: 'center' });
    }

    // ── Generate output ──
    const pName = getProjectName().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const rDate = getReportDate();
    const filename = `${pName}_${rDate}.pdf`;

    console.log('[PDF-VECTOR] PDF generation complete:', filename, '(' + numPages + ' pages)');

    const blob = doc.output('blob');
    console.log('[PDF-VECTOR] Blob size:', blob.size, 'bytes');

    return { blob, filename };
}

/**
 * v6.9: Load an image URL as a data URL for embedding in jsPDF
 * Uses a hidden canvas to convert the image.
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} Data URL or null on failure
 */
async function loadImageAsDataURL(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // Limit dimensions for PDF file size
                const maxDim = 800;
                let w = img.naturalWidth;
                let h = img.naturalHeight;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round(h * maxDim / w);
                        w = maxDim;
                    } else {
                        w = Math.round(w * maxDim / h);
                        h = maxDim;
                    }
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) {
                console.warn('[PDF-VECTOR] Canvas conversion failed:', e);
                resolve(null);
            }
        };
        img.onerror = () => {
            console.warn('[PDF-VECTOR] Image load failed:', url);
            resolve(null);
        };
        // Timeout
        setTimeout(() => resolve(null), 10000);
        img.src = url;
    });
}

/**
 * v6.6.13: LEGACY - Generate PDF using direct html2canvas + jsPDF (Option D)
 * v6.6.21: Enhanced with DOM preparation for cleaner capture
 * v6.9: Renamed to generatePDF_legacy() — kept as fallback
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
async function generatePDF_legacy() {
    console.log('[PDF] Starting PDF generation with direct html2canvas + jsPDF');

    const container = document.querySelector('.page-container');
    if (!container) {
        throw new Error('Page container not found');
    }

    const pages = container.querySelectorAll('.page');
    console.log('[PDF] Found', pages.length, 'pages to render');

    if (pages.length === 0) {
        throw new Error('No pages found to render');
    }

    // Get jsPDF constructor - try different access patterns
    const jsPDFConstructor = (typeof jspdf !== 'undefined' && jspdf.jsPDF)
        || (typeof jsPDF !== 'undefined' && jsPDF)
        || (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
        || (typeof window !== 'undefined' && window.jsPDF);

    if (!jsPDFConstructor) {
        throw new Error('jsPDF library not found. Please ensure jsPDF is loaded.');
    }

    // v6.6.21: Use try/finally to ensure DOM is always restored
    try {
        // v6.6.21: Prepare DOM for capture (replace textareas with divs, resize, etc.)
        await prepareForPdfCapture();

        // Create PDF (letter size: 8.5 x 11 inches = 612 x 792 points)
        const pdf = new jsPDFConstructor({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter',
            compress: true
        });

        // Letter size in points
        const pageWidth = 612;
        const pageHeight = 792;
        const margin = 18; // 0.25 inch margin in points

        // v6.6.21: Enhanced html2canvas options
        const html2canvasOptions = {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: 816,
            windowHeight: 1056,
            imageTimeout: 15000,
            onclone: (clonedDoc) => {
                // Ensure visibility in cloned document
                clonedDoc.querySelectorAll('.editable-field, textarea, .textarea-replacement').forEach(el => {
                    el.style.overflow = 'visible';
                    el.style.height = 'auto';
                });
            }
        };

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            console.log(`[PDF] Rendering page ${i + 1}/${pages.length}`);

            // Capture this page
            const canvas = await html2canvas(page, html2canvasOptions);
            console.log(`[PDF] Page ${i + 1} canvas: ${canvas.width}x${canvas.height}`);

            // Convert to image
            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            // Add new page (except for first)
            if (i > 0) {
                pdf.addPage();
            }

            // Calculate image dimensions to fit page with margins
            const contentWidth = pageWidth - (margin * 2);
            const contentHeight = pageHeight - (margin * 2);

            let imgWidth = contentWidth;
            let imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Scale down if image is too tall
            if (imgHeight > contentHeight) {
                imgHeight = contentHeight;
                imgWidth = (canvas.width * imgHeight) / canvas.height;
            }

            // Center horizontally if scaled down
            const xOffset = margin + (contentWidth - imgWidth) / 2;

            pdf.addImage(imgData, 'JPEG', xOffset, margin, imgWidth, imgHeight, undefined, 'FAST');
        }

        // Generate filename
        const projectName = getProjectName().replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        const reportDate = getReportDate();
        const filename = `${projectName}_${reportDate}.pdf`;

        console.log('[PDF] PDF generation complete:', filename);

        // Return blob and filename
        const blob = pdf.output('blob');
        console.log('[PDF] Blob size:', blob.size, 'bytes');

        // Validate blob size
        if (blob.size < 10000) {
            console.warn('[PDF] Warning: PDF blob is suspiciously small:', blob.size, 'bytes');
        }

        return { blob, filename };

    } finally {
        // v6.6.21: Always restore DOM after capture
        restoreAfterPdfCapture();
    }
}

/**
 * Upload PDF to Supabase Storage (report-pdfs bucket)
 * @param {Object} pdf - PDF object with blob and filename
 * @returns {Promise<string>} Public URL of the uploaded PDF
 */
async function uploadPDFToStorage(pdf) {
    const storagePath = `${currentReportId}/${pdf.filename}`;

    const { data, error } = await supabaseClient
        .storage
        .from('report-pdfs')
        .upload(storagePath, pdf.blob, {
            contentType: 'application/pdf',
            upsert: true
        });

    if (error) {
        throw new Error('PDF upload failed: ' + error.message);
    }

    // Get public URL
    const { data: urlData } = supabaseClient
        .storage
        .from('report-pdfs')
        .getPublicUrl(storagePath);

    return urlData.publicUrl;
}

/**
 * Ensure the report exists in the reports table (required for foreign key)
 * This upserts the report before we can insert into final_reports
 */
async function ensureReportExists() {
    const reportData = getReportData(currentReportId) || {};
    const reportDate = getReportDate();

    const reportRow = {
        id: currentReportId,
        project_id: activeProject?.id || null,
        device_id: getDeviceId(),
        user_id: getStorageItem(STORAGE_KEYS.USER_ID) || null,
        report_date: reportDate,
        status: 'draft', // Will be updated to 'submitted' after
        capture_mode: reportData.captureMode || 'guided',
        created_at: reportData.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    console.log('[SUBMIT] Report row:', {
        id: reportRow.id,
        project_id: reportRow.project_id,
        device_id: reportRow.device_id,
        user_id: reportRow.user_id
    });

    const { error } = await supabaseClient
        .from('reports')
        .upsert(reportRow, { onConflict: 'id' });

    if (error) {
        throw new Error('Failed to create report record: ' + error.message);
    }

    console.log('[SUBMIT] Report record ensured in reports table:', currentReportId);
}

/**
 * Save report metadata to final_reports table
 * @param {string} pdfUrl - URL of the uploaded PDF
 */
async function saveToFinalReports(pdfUrl) {
    const reportData = getReportData(currentReportId) || {};
    const weather = report.overview?.weather || {};
    const submittedAt = new Date().toISOString();

    // Helper to clean weather values - convert "--", "N/A", empty to null
    // Also extract numeric values from strings like "71°F", "39°F", "0.00""
    function cleanWeatherValue(val) {
        if (val === null || val === undefined || val === '' || val === '--' || val === 'N/A') {
            return null;
        }
        // Extract numeric value from strings like "71°F", "39°F", "0.00""
        const numMatch = String(val).match(/^[\d.]+/);
        if (numMatch) {
            const num = parseFloat(numMatch[0]);
            return isNaN(num) ? null : num;
        }
        return null;
    }

    const finalReportData = {
        report_id: currentReportId,
        pdf_url: pdfUrl,
        submitted_at: submittedAt,
        // Weather fields (cleaned to convert "--" to null for numeric columns)
        weather_high_temp: cleanWeatherValue(weather.highTemp),
        weather_low_temp: cleanWeatherValue(weather.lowTemp),
        weather_precipitation: cleanWeatherValue(weather.precipitation),
        weather_general_condition: cleanWeatherValue(weather.generalCondition),
        weather_job_site_condition: cleanWeatherValue(weather.jobSiteCondition),
        weather_adverse_conditions: cleanWeatherValue(weather.adverseConditions),
        // Text summary fields
        executive_summary: report.aiGenerated?.executive_summary || report.aiGenerated?.executiveSummary || '',
        work_performed: report.aiGenerated?.work_performed || report.aiGenerated?.workPerformed || '',
        safety_observations: report.safety?.notes || report.aiGenerated?.safety?.summary || '',
        delays_issues: report.issues || '',
        qaqc_notes: report.qaqc || '',
        communications_notes: report.communications || '',
        visitors_deliveries_notes: report.visitors || '',
        inspector_notes: report.aiGenerated?.inspector_notes || '',
        // Store structured data in JSONB columns
        contractors_json: report.aiGenerated?.activities || report.activities || [],
        personnel_json: report.aiGenerated?.operations || report.operations || [],
        equipment_json: report.aiGenerated?.equipment || report.equipment || [],
        // Boolean flags
        has_contractor_personnel: (report.aiGenerated?.activities?.length > 0) || (report.aiGenerated?.operations?.length > 0),
        has_equipment: (report.aiGenerated?.equipment?.length > 0) || (report.equipment?.length > 0),
        has_issues: !!report.issues,
        has_communications: !!report.communications,
        has_qaqc: !!report.qaqc,
        has_safety_incidents: report.safety?.hasIncident || report.aiGenerated?.safety?.has_incidents || false,
        has_visitors_deliveries: !!report.visitors,
        has_photos: report.photos?.length > 0
    };

    // Upsert to final_reports (insert or update if exists)
    const { error } = await supabaseClient
        .from('final_reports')
        .upsert(finalReportData, { onConflict: 'report_id' });

    if (error) {
        throw new Error('Failed to save report: ' + error.message);
    }
}

/**
 * Update reports table status
 * @param {string} status - New status (e.g., 'submitted')
 * @param {string} pdfUrl - URL of the uploaded PDF
 */
async function updateReportStatus(status, pdfUrl) {
    const submittedAt = new Date().toISOString();

    const { error } = await supabaseClient
        .from('reports')
        .update({
            status: status,
            submitted_at: submittedAt,
            updated_at: submittedAt,
            pdf_url: pdfUrl
        })
        .eq('id', currentReportId);

    if (error) {
        throw new Error('Failed to update status: ' + error.message);
    }

    // Update local state
    report.meta = report.meta || {};
    report.meta.submitted = true;
    report.meta.submittedAt = submittedAt;
    report.meta.status = 'submitted';
}

/**
 * Clean up local storage for this report after successful submit
 */
async function cleanupLocalStorage() {
    // Remove report data using storage-keys.js helper
    deleteReportData(currentReportId);

    // Remove from current reports list
    const currentReports = JSON.parse(localStorage.getItem('fvp_current_reports') || '{}');
    delete currentReports[currentReportId];
    localStorage.setItem('fvp_current_reports', JSON.stringify(currentReports));

    // Clear photos from IndexedDB for this report (if available)
    if (window.idb && typeof window.idb.deletePhotosByReportId === 'function') {
        try {
            await window.idb.deletePhotosByReportId(currentReportId);
            console.log('[SUBMIT] IndexedDB photos cleaned up for:', currentReportId);
        } catch (e) {
            console.warn('[SUBMIT] Could not clean IndexedDB photos:', e);
        }
    }

    console.log('[SUBMIT] Local storage cleaned up for:', currentReportId);
}

/**
 * Show/hide loading state on submit button
 * @param {boolean} show - Whether to show loading state
 */
function showSubmitLoading(show) {
    const btn = document.querySelector('.btn-submit');
    if (!btn) return;

    if (show) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        btn.style.cursor = 'wait';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i><span>Submit</span>';
        btn.style.cursor = 'pointer';
    }
}

/**
 * Show error message to user
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Create error toast/modal
    const existingToast = document.getElementById('errorToast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'errorToast';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc2626;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 90vw;
    `;
    toast.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="
            background: transparent;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px;
            margin-left: 8px;
        "><i class="fas fa-times"></i></button>
    `;
    document.body.appendChild(toast);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 8000);
}

/**
 * Get project name for PDF filename
 * @returns {string}
 */
function getProjectName() {
    return report?.overview?.projectName || activeProject?.projectName || 'Report';
}

/**
 * Get report date for PDF filename
 * @returns {string}
 */
function getReportDate() {
    // v6.6.23: Use getLocalDateString to avoid timezone issues
    return report?.overview?.date || getReportDateStr() || getLocalDateString();
}

function showSubmitSuccess() {
    // Create and show a success modal
    const modal = document.createElement('div');
    modal.id = 'submitSuccessModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            max-width: 400px;
            width: 100%;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
            <div style="
                background: #16a34a;
                padding: 20px;
                text-align: center;
            ">
                <i class="fas fa-check-circle" style="color: white; font-size: 48px;"></i>
            </div>
            <div style="padding: 24px; text-align: center;">
                <h3 style="
                    font-size: 18px;
                    font-weight: bold;
                    color: #1e293b;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                ">Report Submitted</h3>
                <p style="
                    color: #64748b;
                    font-size: 14px;
                    margin-bottom: 20px;
                ">Your report has been saved to the archives.</p>
                <div style="display: flex; gap: 12px;">
                    <button onclick="closeSubmitModal()" style="
                        flex: 1;
                        padding: 12px;
                        background: #f1f5f9;
                        border: 1px solid #e2e8f0;
                        color: #475569;
                        font-weight: bold;
                        text-transform: uppercase;
                        font-size: 12px;
                        cursor: pointer;
                    ">Close</button>
                    <button onclick="window.location.href='archives.html'" style="
                        flex: 1;
                        padding: 12px;
                        background: #0a1628;
                        border: none;
                        color: white;
                        font-weight: bold;
                        text-transform: uppercase;
                        font-size: 12px;
                        cursor: pointer;
                    ">View Archives</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Update the submit button to show submitted state
    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-check"></i><span>Submitted</span>';
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        submitBtn.style.cursor = 'default';
    }
}

function closeSubmitModal() {
    const modal = document.getElementById('submitSuccessModal');
    if (modal) {
        modal.remove();
    }
}

// ============ EMPTY FIELD HIGHLIGHTING ============
const PROJECT_OVERVIEW_FIELDS = [
    { id: 'projectName', label: 'Project Name' },
    { id: 'noabProjectNo', label: 'NOAB Project No.' },
    { id: 'cnoSolicitationNo', label: 'CNO Solicitation No.' },
    { id: 'location', label: 'Location' },
    { id: 'engineer', label: 'Engineer' },
    { id: 'contractor', label: 'Contractor' },
    { id: 'noticeToProceed', label: 'Notice to Proceed' },
    { id: 'contractDuration', label: 'Contract Duration' },
    { id: 'expectedCompletion', label: 'Expected Completion' },
    { id: 'contractDay', label: 'Contract Day #' },
    { id: 'weatherDays', label: 'Weather Days' },
    { id: 'reportDate', label: 'Report Date' },
    { id: 'startTime', label: 'Start Time' },
    { id: 'endTime', label: 'End Time' },
    { id: 'completedBy', label: 'Completed By' }
];

function checkEmptyFields() {
    let emptyCount = 0;

    PROJECT_OVERVIEW_FIELDS.forEach(field => {
        const element = document.getElementById(field.id);
        if (!element) return;

        const value = element.textContent.trim();
        const isEmpty = value === '' || value === '--' || value === 'N/A';

        if (isEmpty) {
            element.classList.add('missing-field');
            emptyCount++;
        } else {
            element.classList.remove('missing-field');
        }
    });

    // Update and show/hide banner
    const banner = document.getElementById('incompleteBanner');
    const bannerText = document.getElementById('incompleteBannerText');

    if (emptyCount > 0) {
        bannerText.textContent = `${emptyCount} field${emptyCount === 1 ? '' : 's'} incomplete in Project Overview`;
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

function dismissIncompleteBanner() {
    const banner = document.getElementById('incompleteBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// ============ AUTO-RESIZE (v6.6.5) ============
/**
 * v6.6.5: Auto-resize textarea to fit content
 */
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * v6.6.5: Initialize auto-resize for all editable fields
 */
function initAutoResize() {
    document.querySelectorAll('.editable-field').forEach(field => {
        if (field.tagName === 'TEXTAREA') {
            autoResize(field);
            field.addEventListener('input', () => autoResize(field));
        }
    });
}

// ============ NO-WORK TOGGLE (v6.6.23) ============
/**
 * v6.6.23: Setup event listeners for no-work toggle checkboxes
 * Allows users to toggle contractors between "no work" and "has work" states
 */
function setupNoWorkToggles() {
    document.querySelectorAll('.no-work-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const contractorId = this.dataset.contractorId;
            const fieldsDiv = document.querySelector(`.contractor-fields[data-contractor-id="${contractorId}"]`);
            const messageDiv = document.querySelector(`.no-work-message[data-contractor-id="${contractorId}"]`);

            if (this.checked) {
                // No work - hide fields, show message
                if (fieldsDiv) fieldsDiv.style.display = 'none';
                if (messageDiv) messageDiv.style.display = 'block';
                // Update userEdits
                userEdits[`activity_${contractorId}`] = {
                    ...userEdits[`activity_${contractorId}`],
                    noWork: true,
                    narrative: '',
                    equipmentUsed: '',
                    crew: ''
                };
            } else {
                // Has work - show fields, hide message
                if (fieldsDiv) fieldsDiv.style.display = 'block';
                if (messageDiv) messageDiv.style.display = 'none';
                // Update userEdits
                userEdits[`activity_${contractorId}`] = {
                    ...userEdits[`activity_${contractorId}`],
                    noWork: false
                };
                // Initialize auto-resize for the newly shown textareas
                fieldsDiv.querySelectorAll('textarea.editable-field').forEach(textarea => {
                    autoResize(textarea);
                });
            }
            report.userEdits = userEdits;
            scheduleSave();
        });
    });

    console.log('[FINAL] No-work toggle listeners attached to', document.querySelectorAll('.no-work-checkbox').length, 'checkboxes');
}

// ============ AUTO-SAVE (v6.6.5) ============
/**
 * v6.6.5: Setup auto-save listeners for all editable fields
 * Matches the pattern from report.js for consistency
 */
function setupAutoSave() {
    // Find all editable fields with data-path attribute
    document.querySelectorAll('[data-path]').forEach(field => {
        // Input event: update userEdits and schedule debounced save
        field.addEventListener('input', () => {
            const path = field.getAttribute('data-path');
            const value = field.value;

            // Handle special paths for photos and contractor activities
            if (path.startsWith('photos[')) {
                // Photo caption: photos[0].caption -> update report.photos[0].caption
                const match = path.match(/photos\[(\d+)\]\.caption/);
                if (match) {
                    const photoIndex = parseInt(match[1]);
                    if (report.photos && report.photos[photoIndex]) {
                        report.photos[photoIndex].caption = value;
                    }
                    // Also store in userEdits for persistence
                    userEdits[path] = value;
                    report.userEdits = userEdits;
                }
            } else if (path.startsWith('activity_')) {
                // Contractor activity: activity_uuid.narrative -> update userEdits as nested object
                // Path format: activity_{contractorId}.{field} (e.g., activity_abc123.narrative)
                const match = path.match(/^(activity_[^.]+)\.(.+)$/);
                if (match) {
                    const activityKey = match[1]; // e.g., "activity_abc123"
                    const fieldName = match[2];   // e.g., "narrative"

                    // Initialize the activity object if needed
                    if (!userEdits[activityKey]) {
                        userEdits[activityKey] = {};
                    }
                    userEdits[activityKey][fieldName] = value;
                } else {
                    // Simple activity path without nested field
                    userEdits[path] = value;
                }
                report.userEdits = userEdits;
            } else if (path.startsWith('operations_')) {
                // Operations table: operations_uuid.field -> update userEdits as nested object
                const match = path.match(/^(operations_[^.]+)\.(.+)$/);
                if (match) {
                    const opsKey = match[1];
                    const fieldName = match[2];

                    if (!userEdits[opsKey]) {
                        userEdits[opsKey] = {};
                    }
                    userEdits[opsKey][fieldName] = value;
                }
                report.userEdits = userEdits;
            } else if (path.startsWith('equipment_')) {
                // Equipment table: equipment_index.field -> update userEdits as nested object
                const match = path.match(/^(equipment_\d+)\.(.+)$/);
                if (match) {
                    const equipKey = match[1];
                    const fieldName = match[2];

                    if (!userEdits[equipKey]) {
                        userEdits[equipKey] = {};
                    }
                    userEdits[equipKey][fieldName] = value;
                }
                report.userEdits = userEdits;
            } else {
                // Standard text field
                userEdits[path] = value;
                report.userEdits = userEdits;
            }

            field.classList.add('user-edited');
            scheduleSave();
        });

        // Blur event: cancel pending debounce and save immediately
        field.addEventListener('blur', () => {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            saveReportToLocalStorage();
            showSaveIndicator();
        });
    });

    console.log('[FINAL] Auto-save listeners attached to', document.querySelectorAll('[data-path]').length, 'fields');
}

/**
 * v6.6.5: Schedule a debounced save (500ms delay)
 */
function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveReportToLocalStorage();
        showSaveIndicator();
    }, 500);
}

/**
 * v6.6.5: Save report data to localStorage using single key pattern
 * Key: fvp_report_{reportId}
 * Matches the pattern from report.js
 */
function saveReportToLocalStorage() {
    if (!currentReportId) {
        console.warn('[FINAL] No reportId, cannot save');
        return;
    }

    // Read current data to preserve fields we don't modify here
    const existingData = getReportData(currentReportId) || {};

    // Build the report object to save (matches spec structure)
    const reportToSave = {
        reportId: currentReportId,
        projectId: existingData.projectId || activeProject?.id,
        reportDate: existingData.reportDate || getReportDateStr(),
        status: report.meta?.status || existingData.status || 'refined',

        // From n8n webhook response (preserve original)
        aiGenerated: report.aiGenerated || existingData.aiGenerated || {},
        captureMode: report.aiCaptureMode || existingData.captureMode || 'minimal',

        // Original field notes (preserve original)
        originalInput: {
            ...existingData.originalInput,
            // Update photos with edited captions
            photos: report.photos || existingData.originalInput?.photos || []
        },

        // User edits - this is what we're updating
        userEdits: { ...existingData.userEdits, ...userEdits },

        // Metadata
        createdAt: existingData.createdAt || report.meta?.createdAt || new Date().toISOString(),
        lastSaved: new Date().toISOString()
    };

    // Use saveReportData from storage-keys.js
    const success = saveReportData(currentReportId, reportToSave);
    if (success) {
        console.log('[FINAL] Report saved to localStorage:', currentReportId);
    } else {
        console.error('[FINAL] Failed to save report to localStorage');
    }
}

/**
 * v6.6.5: Show brief save indicator
 */
function showSaveIndicator() {
    // Check if indicator already exists
    let indicator = document.getElementById('saveIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'saveIndicator';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #16a34a;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        indicator.textContent = 'Saved';
        document.body.appendChild(indicator);
    }

    // Show indicator
    indicator.style.opacity = '1';

    // Hide after 1.5 seconds
    setTimeout(() => {
        indicator.style.opacity = '0';
    }, 1500);
}

// ============ EXPOSE TO WINDOW FOR ONCLICK HANDLERS ============
window.goToEdit = goToEdit;
window.submitReport = submitReport;
window.dismissIncompleteBanner = dismissIncompleteBanner;
window.closeSubmitModal = closeSubmitModal;
