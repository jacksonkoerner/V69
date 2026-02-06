// ============================================================================
// FieldVoice Pro v6 - Dashboard (index.js)
//
// Uses:
// - storage-keys.js: STORAGE_KEYS, getStorageItem, setStorageItem, getSyncQueue
// - report-rules.js: getTodayDateString, canStartNewReport, getReportsByUrgency
// - ui-utils.js: escapeHtml, formatDate
// - config.js: supabaseClient
// - supabase-utils.js: fromSupabaseProject
// ============================================================================

// ============ STATE ============
let projectsCache = [];
let activeProjectCache = null;
var panelLoaded = { weatherDetailsPanel: false, droneOpsPanel: false, emergencyPanel: false };
var weatherDataCache = null;
var sunriseSunsetCache = null;

// ============ PROJECT MANAGEMENT ============
/* DEPRECATED — now using window.dataLayer.loadProjects()
async function loadProjects() {
    const userId = getStorageItem(STORAGE_KEYS.USER_ID);

    // 1. Try IndexedDB first (local-first)
    try {
        const allLocalProjects = await window.idb.getAllProjects();
        const localProjects = userId
            ? allLocalProjects.filter(p => p.user_id === userId)
            : allLocalProjects;

        if (localProjects.length > 0) {
            projectsCache = localProjects.sort((a, b) =>
                (a.projectName || a.project_name || '').localeCompare(b.projectName || b.project_name || '')
            );

            // Also cache in localStorage for report-rules.js
            const projectsMap = {};
            projectsCache.forEach(p => { projectsMap[p.id] = p; });
            setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);

            console.log('[IDB] Loaded projects from IndexedDB:', projectsCache.length);
            return projectsCache;
        }
    } catch (e) {
        console.warn('[IDB] Failed to load from IndexedDB, falling back to Supabase:', e);
    }

    // If offline and no local data, return empty gracefully
    if (!navigator.onLine) {
        console.log('[OFFLINE] No local projects, returning empty');
        projectsCache = [];
        return projectsCache;
    }

    // 2. Fall back to Supabase (with user_id filter)
    try {
        let query = supabaseClient
            .from('projects')
            .select('*')
            .order('project_name', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[SUPABASE] Error loading projects:', error);
            return [];
        }

        projectsCache = data.map(fromSupabaseProject);

        // Cache to IndexedDB for future local-first access
        for (const project of data) {
            await window.idb.saveProject(project);
        }

        // Also cache in localStorage for report-rules.js
        const projectsMap = {};
        projectsCache.forEach(p => { projectsMap[p.id] = p; });
        setStorageItem(STORAGE_KEYS.PROJECTS, projectsMap);

        console.log('[SUPABASE] Loaded projects and cached to IndexedDB:', projectsCache.length);
        return projectsCache;
    } catch (e) {
        console.error('[SUPABASE] Failed to load projects:', e);
        return [];
    }
}
*/

function getProjects() {
    return projectsCache;
}

/* DEPRECATED — now using window.dataLayer.loadActiveProject()
async function loadActiveProject() {
    const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (!activeId) {
        activeProjectCache = null;
        return null;
    }

    const userId = getStorageItem(STORAGE_KEYS.USER_ID);

    // 1. Try IndexedDB first (local-first)
    try {
        const localProject = await window.idb.getProject(activeId);
        if (localProject && (!userId || localProject.user_id === userId)) {
            activeProjectCache = localProject;
            console.log('[IDB] Loaded active project from IndexedDB:', activeProjectCache.projectName || activeProjectCache.project_name);
            return activeProjectCache;
        }
    } catch (e) {
        console.warn('[IDB] Failed to load active project from IndexedDB:', e);
    }

    // If offline and no local data, return null gracefully
    if (!navigator.onLine) {
        console.log('[OFFLINE] No local active project, returning null');
        activeProjectCache = null;
        return null;
    }

    // 2. Fall back to Supabase (with user_id filter)
    try {
        let query = supabaseClient
            .from('projects')
            .select('*')
            .eq('id', activeId);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query.single();

        if (error) {
            console.error('[SUPABASE] Error loading active project:', error);
            activeProjectCache = null;
            return null;
        }

        activeProjectCache = fromSupabaseProject(data);

        // Cache to IndexedDB
        await window.idb.saveProject(data);

        console.log('[SUPABASE] Loaded active project:', activeProjectCache.projectName);
        return activeProjectCache;
    } catch (e) {
        console.error('[SUPABASE] Failed to load active project:', e);
        activeProjectCache = null;
        return null;
    }
}
*/

function getActiveProjectFromCache() {
    return activeProjectCache;
}

function openProjectConfig() {
    window.location.href = 'projects.html';
}

function updateActiveProjectCard() {
    const section = document.getElementById('activeProjectSection');
    const project = getActiveProjectFromCache();

    if (project) {
        section.innerHTML = `
            <div class="bg-white border-l-4 border-safety-green p-4 shadow-sm">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <div class="w-10 h-10 bg-safety-green flex items-center justify-center shrink-0">
                            <i class="fas fa-building text-white"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="text-[10px] font-bold text-safety-green uppercase tracking-wider">Active Project</p>
                            <p class="font-bold text-lg text-slate-800 truncate">${escapeHtml(project.projectName)}</p>
                            ${project.noabProjectNo ? `<p class="text-xs text-slate-500">#${escapeHtml(project.noabProjectNo)}</p>` : ''}
                        </div>
                    </div>
                    <a href="projects.html" class="text-dot-blue hover:text-dot-navy transition-colors shrink-0 ml-2" title="Change Project">
                        <i class="fas fa-exchange-alt"></i>
                    </a>
                </div>
            </div>
        `;
    } else {
        section.innerHTML = `
            <a href="projects.html" class="block bg-orange-50 border-2 border-dashed border-dot-orange p-4 shadow-sm hover:bg-orange-100 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-dot-orange/10 border-2 border-dot-orange flex items-center justify-center shrink-0">
                        <i class="fas fa-exclamation text-dot-orange"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-xs font-bold text-dot-orange uppercase tracking-wider">No Project Selected</p>
                        <p class="text-sm text-slate-600">Tap to configure a project</p>
                    </div>
                    <i class="fas fa-chevron-right text-dot-orange"></i>
                </div>
            </a>
        `;
    }
}

function beginDailyReport() {
    showProjectPickerModal();
}

function continueDailyReport() {
    // v6.6.16: Generate reportId here and pass via URL
    const newReportId = crypto.randomUUID();
    window.location.href = `quick-interview.html?reportId=${newReportId}`;
}

// ============ PROJECT PICKER MODAL ============
async function showProjectPickerModal() {
    const modal = document.getElementById('projectPickerModal');
    const listContainer = document.getElementById('projectPickerList');

    // Show loading state
    listContainer.innerHTML = `
        <div class="p-8 text-center">
            <i class="fas fa-spinner fa-spin text-slate-400 text-2xl mb-4"></i>
            <p class="text-sm text-slate-500">Loading projects...</p>
        </div>
    `;
    modal.classList.remove('hidden');

    // Load local projects first
    let projects = await window.dataLayer.loadProjects();

    // Always refresh from Supabase when online to get all projects
    if (navigator.onLine) {
        try {
            projects = await window.dataLayer.refreshProjectsFromCloud();
        } catch (e) {
            console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
            // Keep using local projects on error
        }
    }
    projectsCache = projects;
    const activeId = getStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID);

    if (projects.length === 0) {
        // No projects configured
        listContainer.innerHTML = `
            <div class="p-8 text-center">
                <div class="w-16 h-16 bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-folder-open text-slate-400 text-2xl"></i>
                </div>
                <p class="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">No Projects Configured</p>
                <p class="text-sm text-slate-500 mb-6">Create a project to start generating daily reports</p>
                <button onclick="goToProjectSetup()" class="w-full p-4 bg-safety-green hover:bg-green-700 text-white font-bold uppercase transition-colors flex items-center justify-center gap-2">
                    <i class="fas fa-plus"></i>
                    Create Project
                </button>
            </div>
        `;
    } else {
        // Check eligibility using report-rules.js
        const eligibilityMap = {};
        for (const project of projects) {
            eligibilityMap[project.id] = canStartNewReport(project.id);
        }

        // Render project list
        listContainer.innerHTML = projects.map(project => {
            const isActive = project.id === activeId;
            const eligibility = eligibilityMap[project.id];
            const canStart = eligibility.allowed;
            const reason = eligibility.reason;

            if (!canStart && reason !== 'CONTINUE_EXISTING') {
                // Project is blocked - show disabled state
                const reasonText = reason === 'UNFINISHED_PREVIOUS' ? 'Has Late Report'
                                 : reason === 'ALREADY_SUBMITTED_TODAY' ? 'Submitted Today'
                                 : 'Unavailable';
                const reasonIcon = reason === 'UNFINISHED_PREVIOUS' ? 'fa-exclamation-triangle'
                                 : reason === 'ALREADY_SUBMITTED_TODAY' ? 'fa-check-circle'
                                 : 'fa-lock';

                return `
                    <div class="w-full p-4 text-left border-b border-slate-200 last:border-b-0 bg-slate-50 opacity-60 cursor-not-allowed">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-400 flex items-center justify-center shrink-0">
                                <i class="fas ${reasonIcon} text-white"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <p class="font-bold text-slate-600 truncate">${escapeHtml(project.projectName)}</p>
                                    <span class="shrink-0 text-[10px] bg-slate-400 text-white px-2 py-0.5 font-bold uppercase">${reasonText}</span>
                                </div>
                                <p class="text-xs text-slate-500 truncate mt-0.5">
                                    ${project.noabProjectNo ? `#${escapeHtml(project.noabProjectNo)}` : ''}
                                    ${project.noabProjectNo && project.location ? ' • ' : ''}
                                    ${project.location ? escapeHtml(project.location) : ''}
                                    ${!project.noabProjectNo && !project.location ? 'No details' : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <button onclick="selectProjectAndProceed('${project.id}')" class="w-full p-4 text-left hover:bg-slate-50 transition-colors border-b border-slate-200 last:border-b-0 ${isActive ? 'bg-safety-green/5' : ''}">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 ${isActive ? 'bg-safety-green' : 'bg-dot-blue'} flex items-center justify-center shrink-0">
                            <i class="fas ${isActive ? 'fa-check' : 'fa-building'} text-white"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-slate-800 truncate">${escapeHtml(project.projectName)}</p>
                                ${isActive ? '<span class="shrink-0 text-[10px] bg-safety-green text-white px-2 py-0.5 font-bold uppercase">Active</span>' : ''}
                                ${reason === 'CONTINUE_EXISTING' ? '<span class="shrink-0 text-[10px] bg-dot-orange text-white px-2 py-0.5 font-bold uppercase">In Progress</span>' : ''}
                            </div>
                            <p class="text-xs text-slate-500 truncate mt-0.5">
                                ${project.noabProjectNo ? `#${escapeHtml(project.noabProjectNo)}` : ''}
                                ${project.noabProjectNo && project.location ? ' • ' : ''}
                                ${project.location ? escapeHtml(project.location) : ''}
                                ${!project.noabProjectNo && !project.location ? 'No details' : ''}
                            </p>
                        </div>
                        <i class="fas fa-chevron-right text-slate-400 shrink-0"></i>
                    </div>
                </button>
            `;
        }).join('');
    }
}

function closeProjectPickerModal() {
    document.getElementById('projectPickerModal').classList.add('hidden');
}

async function selectProjectAndProceed(projectId) {
    // Set as active project in localStorage using storage-keys helper
    setStorageItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, projectId);

    // Update cache
    activeProjectCache = await window.dataLayer.loadActiveProject();

    // Update the active project card on dashboard (visible when they return)
    updateActiveProjectCard();

    // Close modal and proceed
    closeProjectPickerModal();
    // v6.6.16: Generate reportId here and pass via URL
    const newReportId = crypto.randomUUID();
    window.location.href = `quick-interview.html?reportId=${newReportId}`;
}

function goToProjectSetup() {
    closeProjectPickerModal();
    window.location.href = 'project-config.html';
}

// ============ REPORT CARDS ============
function renderReportCards() {
    const container = document.getElementById('reportCardsSection');
    if (!container) return;

    const { late, todayDrafts, todayReady, todayReadyToSubmit, todaySubmitted } = getReportsByUrgency();

    // If no reports at all, hide the section
    if (late.length === 0 && todayDrafts.length === 0 && todayReady.length === 0 && todayReadyToSubmit.length === 0 && todaySubmitted.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // LATE reports (red warning, need immediate attention)
    if (late.length > 0) {
        html += `<div class="mb-3">
            <p class="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">
                <i class="fas fa-exclamation-triangle mr-1"></i>Late Reports
            </p>`;
        late.forEach(report => {
            html += renderReportCard(report, 'late');
        });
        html += '</div>';
    }

    // Today's drafts
    if (todayDrafts.length > 0) {
        html += `<div class="mb-3">
            <p class="text-xs font-bold text-dot-orange uppercase tracking-wider mb-2">In Progress</p>`;
        todayDrafts.forEach(report => {
            html += renderReportCard(report, 'draft');
        });
        html += '</div>';
    }

    // Today's ready for AI review (refined status)
    if (todayReady.length > 0) {
        html += `<div class="mb-3">
            <p class="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">AI Refine</p>`;
        todayReady.forEach(report => {
            html += renderReportCard(report, 'ready');
        });
        html += '</div>';
    }

    // Today's ready to submit (ready_to_submit status)
    if (todayReadyToSubmit.length > 0) {
        html += `<div class="mb-3">
            <p class="text-xs font-bold text-safety-green uppercase tracking-wider mb-2">Review and Submit</p>`;
        todayReadyToSubmit.forEach(report => {
            html += renderReportCard(report, 'ready_to_submit');
        });
        html += '</div>';
    }

    // Today's submitted (view only)
    if (todaySubmitted.length > 0) {
        html += `<div class="mb-3">
            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Submitted Today</p>`;
        todaySubmitted.forEach(report => {
            html += renderReportCard(report, 'submitted');
        });
        html += '</div>';
    }

    container.innerHTML = html;
}

function renderReportCard(report, type) {
    const projectName = report.project_name || 'Unknown Project';
    const date = formatDate(report.date, 'short');

    const styles = {
        late: { border: 'border-red-500', bg: 'bg-red-50', icon: 'fa-exclamation-circle', iconColor: 'text-red-500' },
        draft: { border: 'border-dot-orange', bg: 'bg-orange-50', icon: 'fa-pen', iconColor: 'text-dot-orange' },
        ready: { border: 'border-slate-400', bg: 'bg-slate-50', icon: 'fa-robot', iconColor: 'text-slate-600' },
        ready_to_submit: { border: 'border-safety-green', bg: 'bg-green-50', icon: 'fa-check-circle', iconColor: 'text-safety-green' },
        submitted: { border: 'border-slate-300', bg: 'bg-slate-50', icon: 'fa-archive', iconColor: 'text-slate-400' }
    };

    const style = styles[type] || styles.draft;

    // Route based on report status:
    // - submitted: archives (view only)
    // - ready_to_submit: finalreview.html (ready for final submission)
    // - refined: report.html (AI refine stage)
    // - draft/pending: quick-interview (needs more input or AI processing)
    let href;
    if (type === 'submitted') {
        href = `archives.html?id=${report.id}`;
    } else if (type === 'ready_to_submit' || report.status === 'ready_to_submit') {
        href = `finalreview.html?date=${report.report_date || report.reportDate || report.date}&reportId=${report.id}`;
    } else if (report.status === 'refined') {
        href = `report.html?date=${report.report_date || report.reportDate || report.date}&reportId=${report.id}`;
    } else {
        // v6.6.16: Pass existing reportId for draft reports
        href = `quick-interview.html?reportId=${report.id}`;
    }

    return `
        <a href="${href}" class="block ${style.bg} border-l-4 ${style.border} p-3 mb-2 hover:bg-opacity-80 transition-colors">
            <div class="flex items-center gap-3">
                <i class="fas ${style.icon} ${style.iconColor}"></i>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-slate-800 truncate">${escapeHtml(projectName)}</p>
                    <p class="text-xs text-slate-500">${date}</p>
                </div>
                <i class="fas fa-chevron-right text-slate-400"></i>
            </div>
        </a>
    `;
}

// ============ WEATHER ============
async function syncWeather() {
    const syncIcon = document.getElementById('syncIcon');
    syncIcon.classList.add('fa-spin');

    try {
        // Check if offline first
        if (!navigator.onLine) {
            document.getElementById('weatherCondition').textContent = 'Offline';
            document.getElementById('condBarWeatherIcon').className = 'fas fa-wifi-slash text-xl text-yellow-500';
            syncIcon.classList.remove('fa-spin');
            return;
        }

        // Try to get location - use cache first to avoid prompting user
        let latitude, longitude;
        const cachedLocation = getLocationFromCache();

        if (cachedLocation) {
            // Use cached location - no prompt needed
            latitude = cachedLocation.lat;
            longitude = cachedLocation.lng;
            console.log('[Weather] Using cached location');
        } else {
            // No cached location - check if permission was granted
            const granted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED) === 'true';
            if (!granted) {
                // Permission not granted - show message, don't prompt
                console.log('[Weather] Location permission not granted, skipping weather sync');
                document.getElementById('weatherCondition').textContent = 'Location needed';
                document.getElementById('condBarWeatherIcon').className = 'fas fa-location-dot text-xl text-slate-400';
                syncIcon.classList.remove('fa-spin');
                return;
            }

            // Permission was granted but cache expired/cleared - check browser permission before requesting
            if (!navigator.geolocation) {
                throw { code: -1, message: 'Geolocation not supported' };
            }

            // Check browser's ACTUAL permission state to avoid prompting
            let browserPermissionState = 'prompt';
            if (navigator.permissions) {
                try {
                    const result = await navigator.permissions.query({ name: 'geolocation' });
                    browserPermissionState = result.state;
                    console.log(`[Weather] Browser permission state: ${browserPermissionState}`);
                } catch (e) {
                    console.warn('[Weather] Permissions API not available');
                }
            }

            // Only call geolocation if browser permission is actually 'granted'
            if (browserPermissionState !== 'granted') {
                console.log('[Weather] Browser permission not granted, skipping weather sync');
                document.getElementById('weatherCondition').textContent = 'Location needed';
                document.getElementById('condBarWeatherIcon').className = 'fas fa-location-dot text-xl text-slate-400';
                syncIcon.classList.remove('fa-spin');
                return;
            }

            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        resolve,
                        reject,
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
                    );
                });
                latitude = position.coords.latitude;
                longitude = position.coords.longitude;
                // Update cache with fresh location
                cacheLocation(latitude, longitude);
                console.log('[Weather] Got fresh location and cached');
            } catch (geoError) {
                // Location failed - handle gracefully
                if (geoError.code === 1) {
                    // Permission denied - clear cached permission status
                    clearCachedLocation();
                    document.getElementById('weatherCondition').textContent = 'Location blocked';
                    document.getElementById('condBarWeatherIcon').className = 'fas fa-location-crosshairs text-xl text-red-500';
                } else {
                    document.getElementById('weatherCondition').textContent = 'GPS unavailable';
                    document.getElementById('condBarWeatherIcon').className = 'fas fa-location-crosshairs text-xl text-yellow-500';
                }
                syncIcon.classList.remove('fa-spin');
                return;
            }
        }

        // Fetch weather data (extended with hourly wind/UV/humidity and daily sunrise/sunset)
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=windspeed_10m,windgusts_10m,uv_index,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch&windspeed_unit=mph`
        );

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

        const weatherCodes = {
            0: { text: 'Clear', icon: 'fa-sun', color: 'text-dot-yellow' },
            1: { text: 'Mostly Clear', icon: 'fa-sun', color: 'text-dot-yellow' },
            2: { text: 'Partly Cloudy', icon: 'fa-cloud-sun', color: 'text-slate-500' },
            3: { text: 'Overcast', icon: 'fa-cloud', color: 'text-slate-500' },
            45: { text: 'Fog', icon: 'fa-smog', color: 'text-slate-400' },
            48: { text: 'Fog', icon: 'fa-smog', color: 'text-slate-400' },
            51: { text: 'Light Drizzle', icon: 'fa-cloud-rain', color: 'text-dot-blue' },
            53: { text: 'Drizzle', icon: 'fa-cloud-rain', color: 'text-dot-blue' },
            55: { text: 'Heavy Drizzle', icon: 'fa-cloud-showers-heavy', color: 'text-dot-blue' },
            61: { text: 'Light Rain', icon: 'fa-cloud-rain', color: 'text-dot-blue' },
            63: { text: 'Rain', icon: 'fa-cloud-showers-heavy', color: 'text-dot-blue' },
            65: { text: 'Heavy Rain', icon: 'fa-cloud-showers-heavy', color: 'text-blue-600' },
            80: { text: 'Showers', icon: 'fa-cloud-showers-heavy', color: 'text-dot-blue' },
            95: { text: 'Thunderstorm', icon: 'fa-bolt', color: 'text-dot-orange' }
        };

        const weatherInfo = weatherCodes[data.current_weather.weathercode] || { text: 'Cloudy', icon: 'fa-cloud', color: 'text-slate-400' };
        const highTemp = Math.round(data.daily.temperature_2m_max[0]);
        const lowTemp = Math.round(data.daily.temperature_2m_min[0]);
        const precip = data.daily.precipitation_sum[0].toFixed(2);

        // Update conditions bar UI
        document.getElementById('weatherCondition').textContent = weatherInfo.text;
        document.getElementById('condBarTemp').textContent = `${highTemp}°`;
        document.getElementById('condBarWeatherIcon').className = `fas ${weatherInfo.icon} text-xl ${weatherInfo.color}`;

        // Cache extended weather data for detail panels
        var currentHour = new Date().getHours();
        var hourIndex = data.hourly && data.hourly.time
            ? data.hourly.time.findIndex(function(t) { return new Date(t).getHours() === currentHour; })
            : -1;
        if (hourIndex === -1) hourIndex = 0;
        weatherDataCache = {
            lat: latitude,
            lon: longitude,
            windSpeed: data.hourly ? Math.round(data.hourly.windspeed_10m[hourIndex]) : null,
            windGusts: data.hourly ? Math.round(data.hourly.windgusts_10m[hourIndex]) : null,
            uvIndex: data.hourly ? data.hourly.uv_index[hourIndex] : null,
            humidity: data.hourly ? data.hourly.relative_humidity_2m[hourIndex] : null,
            sunrise: data.daily ? data.daily.sunrise[0] : null,
            sunset: data.daily ? data.daily.sunset[0] : null
        };
        console.log('[Weather] Extended data cached:', weatherDataCache);
        updateConditionsBar();
    } catch (error) {
        console.error('Weather sync failed:', error);
        document.getElementById('weatherCondition').textContent = 'Sync failed';
        document.getElementById('condBarWeatherIcon').className = 'fas fa-exclamation-triangle text-xl text-yellow-500';
    }

    const updatedSyncIcon = document.getElementById('syncIcon');
    if (updatedSyncIcon) {
        updatedSyncIcon.classList.remove('fa-spin');
    }
}

// ============ CONDITIONS BAR ============
function updateConditionsBar() {
    if (!weatherDataCache) return;

    var windEl = document.getElementById('condBarWind');
    var gustsEl = document.getElementById('condBarGusts');
    var statusEl = document.getElementById('condBarFlightStatus');

    if (windEl) windEl.textContent = (weatherDataCache.windSpeed !== null ? weatherDataCache.windSpeed + ' mph' : '-- mph');
    if (gustsEl) gustsEl.textContent = (weatherDataCache.windGusts !== null ? weatherDataCache.windGusts + ' mph' : '-- mph');

    if (statusEl) {
        var gusts = weatherDataCache.windGusts;
        if (gusts === null) {
            statusEl.textContent = '--';
            statusEl.className = 'text-[10px] font-bold px-2 py-1 rounded bg-slate-200 text-slate-500';
        } else if (gusts < 20) {
            statusEl.textContent = 'FLY';
            statusEl.className = 'text-[10px] font-bold px-2 py-1 rounded bg-safety-green text-white';
        } else if (gusts <= 25) {
            statusEl.textContent = 'CAUTION';
            statusEl.className = 'text-[10px] font-bold px-2 py-1 rounded bg-dot-orange text-white';
        } else {
            statusEl.textContent = 'NO FLY';
            statusEl.className = 'text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white';
        }

        // Refine with daylight check if sunrise data available
        if (sunriseSunsetCache) {
            var now = new Date();
            var withinWindow = now >= sunriseSunsetCache.sunrise && now <= sunriseSunsetCache.sunset;
            if (!withinWindow) {
                statusEl.textContent = 'NO FLY';
                statusEl.className = 'text-[10px] font-bold px-2 py-1 rounded bg-red-600 text-white';
            }
        }
    }
}

// ============ PANEL LAZY LOADING ============
function onPanelOpen(panelId) {
    if (panelLoaded[panelId]) return;
    panelLoaded[panelId] = true;
    if (panelId === 'weatherDetailsPanel') loadWeatherDetailsPanel();
    else if (panelId === 'droneOpsPanel') loadDroneOpsPanel();
    else if (panelId === 'emergencyPanel') loadEmergencyPanel();
}

async function fetchSunriseSunset(lat, lon) {
    if (sunriseSunsetCache) return sunriseSunsetCache;
    try {
        var resp = await fetch('https://api.sunrise-sunset.org/json?lat=' + lat + '&lng=' + lon + '&formatted=0');
        var json = await resp.json();
        if (json.status === 'OK') {
            sunriseSunsetCache = {
                sunrise: new Date(json.results.sunrise),
                sunset: new Date(json.results.sunset)
            };
        }
    } catch (e) {
        console.warn('[SunriseSunset] API failed, falling back to Open-Meteo:', e);
        if (weatherDataCache && weatherDataCache.sunrise) {
            sunriseSunsetCache = {
                sunrise: new Date(weatherDataCache.sunrise),
                sunset: new Date(weatherDataCache.sunset)
            };
        }
    }
    return sunriseSunsetCache;
}

async function loadWeatherDetailsPanel() {
    var panel = document.getElementById('weatherDetailsPanel');
    if (!panel) return;

    if (!navigator.onLine) {
        panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-wifi-slash mr-2"></i>Offline \u2014 data unavailable</p>';
        return;
    }

    panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Loading weather details...</p>';

    // Wait for weatherDataCache if syncWeather() is still running
    var attempts = 0;
    while (!weatherDataCache && attempts < 20) {
        await new Promise(function(r) { setTimeout(r, 500); });
        attempts++;
    }

    var loc = getLocationFromCache() || (weatherDataCache ? { lat: weatherDataCache.lat, lng: weatherDataCache.lon } : null);
    if (!loc) {
        panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-location-dot mr-2"></i>Location unavailable</p>';
        return;
    }

    // Fetch sunrise/sunset
    var ssData = await fetchSunriseSunset(loc.lat, loc.lng);
    var sunriseStr = '--:--';
    var sunsetStr = '--:--';
    if (ssData) {
        sunriseStr = ssData.sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        sunsetStr = ssData.sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    var windSpeed = weatherDataCache ? weatherDataCache.windSpeed : '--';
    var windGusts = weatherDataCache ? weatherDataCache.windGusts : '--';
    var uvIndex = weatherDataCache ? (weatherDataCache.uvIndex !== null ? weatherDataCache.uvIndex.toFixed(1) : '--') : '--';
    var humidity = weatherDataCache ? (weatherDataCache.humidity !== null ? weatherDataCache.humidity : '--') : '--';
    var gustWarning = weatherDataCache && weatherDataCache.windGusts > 20;

    var html = '';

    // Wind & conditions grid
    html += '<div class="grid grid-cols-2 gap-3 mb-4">';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-wind text-dot-blue text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + windSpeed + ' <span class="text-xs font-normal">mph</span></p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">Wind Speed</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-wind ' + (gustWarning ? 'text-dot-orange' : 'text-dot-blue') + ' text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold ' + (gustWarning ? 'text-dot-orange' : 'text-slate-800') + '">' + windGusts + ' <span class="text-xs font-normal">mph</span></p>';
    html += '<p class="text-[10px] ' + (gustWarning ? 'text-dot-orange' : 'text-slate-400') + ' uppercase">Gusts' + (gustWarning ? ' \u26A0' : '') + '</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-sun text-dot-yellow text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + uvIndex + '</p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">UV Index</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-droplet text-dot-blue text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + humidity + '<span class="text-xs font-normal">%</span></p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">Humidity</p>';
    html += '</div>';
    html += '</div>';

    // Sunrise/Sunset
    html += '<div class="flex items-center justify-between bg-slate-50 rounded-lg p-3 mb-4">';
    html += '<div class="flex items-center gap-2"><i class="fas fa-sunrise text-dot-orange"></i><span class="text-sm font-medium text-slate-700">' + sunriseStr + '</span></div>';
    html += '<div class="text-xs text-slate-400 uppercase font-bold">Daylight</div>';
    html += '<div class="flex items-center gap-2"><span class="text-sm font-medium text-slate-700">' + sunsetStr + '</span><i class="fas fa-sunset text-dot-blue"></i></div>';
    html += '</div>';

    // Windy.com radar iframe
    html += '<div class="rounded-lg overflow-hidden border border-slate-200">';
    html += '<iframe width="100%" height="250" frameborder="0" src="https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=10&overlay=rain&product=radar&level=surface&lat=' + loc.lat + '&lon=' + loc.lng + '"></iframe>';
    html += '</div>';

    panel.innerHTML = html;
}

async function loadDroneOpsPanel() {
    var panel = document.getElementById('droneOpsPanel');
    if (!panel) return;

    if (!navigator.onLine) {
        panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-wifi-slash mr-2"></i>Offline \u2014 data unavailable</p>';
        return;
    }

    panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>Loading drone ops data...</p>';

    // Wait for weatherDataCache if syncWeather() is still running
    var attempts = 0;
    while (!weatherDataCache && attempts < 20) {
        await new Promise(function(r) { setTimeout(r, 500); });
        attempts++;
    }

    var loc = getLocationFromCache() || (weatherDataCache ? { lat: weatherDataCache.lat, lng: weatherDataCache.lon } : null);
    if (!loc) {
        panel.innerHTML = '<p class="text-sm text-slate-500 text-center"><i class="fas fa-location-dot mr-2"></i>Location unavailable</p>';
        return;
    }

    // Fetch sunrise/sunset (cached — won't call twice)
    var ssData = await fetchSunriseSunset(loc.lat, loc.lng);

    // Refine conditions bar flight status now that sunrise data is available
    updateConditionsBar();

    // Fetch elevation and declination in parallel
    var elevationFt = '--';
    var declination = '--';
    var results = await Promise.allSettled([
        fetch('https://api.open-meteo.com/v1/elevation?latitude=' + loc.lat + '&longitude=' + loc.lng).then(function(r) { return r.json(); }),
        fetch('https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1=' + loc.lat + '&lon1=' + loc.lng + '&resultFormat=json').then(function(r) { return r.json(); })
    ]);

    if (results[0].status === 'fulfilled' && results[0].value.elevation) {
        var meters = results[0].value.elevation[0];
        elevationFt = Math.round(meters * 3.28084).toLocaleString();
    }
    if (results[1].status === 'fulfilled' && results[1].value.result && results[1].value.result.length > 0) {
        declination = results[1].value.result[0].declination.toFixed(2) + '\u00B0';
    }

    // Flight window logic
    var now = new Date();
    var withinWindow = false;
    var sunriseStr = '--:--';
    var sunsetStr = '--:--';
    if (ssData) {
        withinWindow = now >= ssData.sunrise && now <= ssData.sunset;
        sunriseStr = ssData.sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        sunsetStr = ssData.sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // Wind assessment
    var gusts = weatherDataCache ? weatherDataCache.windGusts : null;
    var windStatus, windColor, windIcon;
    if (gusts === null) {
        windStatus = 'Unknown'; windColor = 'text-slate-400'; windIcon = 'fa-question-circle';
    } else if (gusts < 20) {
        windStatus = 'FLY'; windColor = 'text-safety-green'; windIcon = 'fa-check-circle';
    } else if (gusts <= 25) {
        windStatus = 'CAUTION'; windColor = 'text-dot-orange'; windIcon = 'fa-exclamation-triangle';
    } else {
        windStatus = 'NO FLY'; windColor = 'text-red-600'; windIcon = 'fa-times-circle';
    }

    var html = '';

    // Flight window
    html += '<div class="flex items-center gap-3 p-3 rounded-lg ' + (withinWindow ? 'bg-green-50 border border-safety-green/30' : 'bg-red-50 border border-red-200') + ' mb-3">';
    html += '<i class="fas fa-clock ' + (withinWindow ? 'text-safety-green' : 'text-red-500') + ' text-lg"></i>';
    html += '<div class="flex-1">';
    html += '<p class="text-xs font-bold uppercase tracking-wider ' + (withinWindow ? 'text-safety-green' : 'text-red-600') + '">Legal Flight Window (Part 107)</p>';
    html += '<p class="text-sm font-medium text-slate-700">' + sunriseStr + ' \u2013 ' + sunsetStr + '</p>';
    html += '</div>';
    html += '<span class="text-xs font-bold px-2 py-1 rounded ' + (withinWindow ? 'bg-safety-green text-white' : 'bg-red-600 text-white') + '">' + (withinWindow ? 'ACTIVE' : 'CLOSED') + '</span>';
    html += '</div>';

    // Wind & site data grid (mirrors weather panel style)
    var windSpd = weatherDataCache ? weatherDataCache.windSpeed : '--';
    var gustWarning = gusts !== null && gusts > 20;

    html += '<div class="grid grid-cols-2 gap-3 mb-3">';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-wind text-dot-blue text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + windSpd + ' <span class="text-xs font-normal">mph</span></p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">Wind Speed</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-wind ' + (gustWarning ? 'text-dot-orange' : 'text-dot-blue') + ' text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold ' + (gustWarning ? 'text-dot-orange' : 'text-slate-800') + '">' + (gusts !== null ? gusts : '--') + ' <span class="text-xs font-normal">mph</span></p>';
    html += '<p class="text-[10px] ' + (gustWarning ? 'text-dot-orange' : 'text-slate-400') + ' uppercase">Gusts</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-mountain text-dot-blue text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + elevationFt + ' <span class="text-xs font-normal">ft</span></p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">Elevation</p>';
    html += '</div>';
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-compass text-dot-orange text-lg mb-1"></i>';
    html += '<p class="text-lg font-bold text-slate-800">' + declination + '</p>';
    html += '<p class="text-[10px] text-slate-400 uppercase">Mag Declination</p>';
    html += '</div>';
    html += '</div>';

    // Wind assessment status badge
    html += '<div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 mb-3">';
    html += '<i class="fas ' + windIcon + ' ' + windColor + ' text-lg"></i>';
    html += '<div class="flex-1">';
    html += '<p class="text-xs font-bold uppercase tracking-wider text-slate-500">Wind Assessment</p>';
    html += '</div>';
    html += '<span class="text-xs font-bold px-2 py-1 rounded ' + windColor + ' bg-white border">' + windStatus + '</span>';
    html += '</div>';

    // GPS coordinates
    html += '<div class="mt-3 p-3 bg-slate-50 rounded-lg">';
    html += '<p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1"><i class="fas fa-satellite mr-1"></i>GPS Coordinates</p>';
    html += '<p class="text-sm font-mono text-slate-700">' + loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6) + '</p>';
    html += '</div>';

    panel.innerHTML = html;
}

function loadEmergencyPanel() {
    var panel = document.getElementById('emergencyPanel');
    if (!panel) return;

    var loc = getLocationFromCache();
    var latStr = loc ? loc.lat.toFixed(6) : 'Unavailable';
    var lngStr = loc ? loc.lng.toFixed(6) : 'Unavailable';
    var mapsUrl = loc ? 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng : '';

    var html = '';

    // GPS coordinates prominent display
    html += '<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-center">';
    html += '<p class="text-xs font-bold text-red-600 uppercase tracking-wider mb-2"><i class="fas fa-satellite-dish mr-1"></i>Your GPS Coordinates</p>';
    html += '<p class="text-2xl font-mono font-bold text-slate-800">' + latStr + '</p>';
    html += '<p class="text-2xl font-mono font-bold text-slate-800">' + lngStr + '</p>';
    if (loc) {
        html += '<p class="text-xs text-slate-500 mt-2">Read these to emergency services</p>';
    } else {
        html += '<p class="text-xs text-red-500 mt-2">Enable location to see coordinates</p>';
    }
    html += '</div>';

    // Call 911 button
    html += '<a href="tel:911" class="block w-full bg-red-600 hover:bg-red-700 text-white text-center py-4 rounded-lg font-bold text-lg mb-3 transition-colors">';
    html += '<i class="fas fa-phone-alt mr-2"></i>Call 911';
    html += '</a>';

    // Share location button
    if (navigator.share && loc) {
        html += '<button onclick="shareEmergencyLocation()" class="block w-full bg-dot-blue hover:bg-dot-navy text-white text-center py-3 rounded-lg font-bold text-sm mb-3 transition-colors">';
        html += '<i class="fas fa-share-alt mr-2"></i>Share My Location';
        html += '</button>';
    } else if (loc) {
        html += '<a href="' + mapsUrl + '" target="_blank" rel="noopener" class="block w-full bg-dot-blue hover:bg-dot-navy text-white text-center py-3 rounded-lg font-bold text-sm mb-3 transition-colors">';
        html += '<i class="fas fa-map-marker-alt mr-2"></i>Open in Maps';
        html += '</a>';
    }

    // Nearest hospital placeholder
    html += '<div class="bg-slate-50 rounded-lg p-3 text-center">';
    html += '<i class="fas fa-hospital text-slate-400 mr-2"></i>';
    html += '<span class="text-sm text-slate-500">Nearest hospital: searching...</span>';
    html += '</div>';

    panel.innerHTML = html;
}

function shareEmergencyLocation() {
    var loc = getLocationFromCache();
    if (!loc || !navigator.share) return;
    var url = 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng;
    navigator.share({
        title: 'My Location - Emergency',
        text: 'My GPS coordinates: ' + loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6),
        url: url
    }).catch(function(e) { console.log('[Share] Cancelled or failed:', e); });
}

// ============ UI UPDATES ============
function updateReportStatus() {
    const statusSection = document.getElementById('reportStatusSection');

    // v6.6.17: Always show "Begin Daily Report" button
    // Users can start new reports even if drafts exist
    statusSection.innerHTML = `
        <div class="bg-white border-2 border-slate-200 p-6">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h2 class="text-lg font-bold text-dot-navy">Daily Field Report</h2>
                    <p class="text-sm text-slate-500">Create a new report for today</p>
                </div>
                <div class="w-12 h-12 bg-dot-navy/10 rounded-full flex items-center justify-center">
                    <i class="fas fa-clipboard-list text-dot-navy text-xl"></i>
                </div>
            </div>
            <button onclick="beginDailyReport()" class="block w-full bg-dot-navy hover:bg-dot-blue text-white p-4 transition-colors">
                <div class="flex items-center justify-center gap-3">
                    <i class="fas fa-plus text-dot-yellow"></i>
                    <span class="font-bold uppercase tracking-wide">Begin Daily Report</span>
                </div>
            </button>
        </div>
    `;
}

// ============ ACTIONS ============
function openSettings() {
    window.location.href = 'settings.html';
}

// ============ PERMISSIONS ============
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isIOSSafari = isIOS && isSafari;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function checkPermissionState() {
    const micGranted = localStorage.getItem(STORAGE_KEYS.MIC_GRANTED) === 'true';
    const locGranted = localStorage.getItem(STORAGE_KEYS.LOC_GRANTED) === 'true';
    const onboarded = localStorage.getItem(STORAGE_KEYS.ONBOARDED) === 'true';
    const bannerDismissed = localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED) === 'true';
    const bannerDismissedDate = localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED_DATE);

    if (bannerDismissedDate) {
        const dismissedTime = new Date(bannerDismissedDate).getTime();
        const now = new Date().getTime();
        const hoursSinceDismissal = (now - dismissedTime) / (1000 * 60 * 60);
        if (hoursSinceDismissal > 24) {
            localStorage.removeItem(STORAGE_KEYS.BANNER_DISMISSED);
            localStorage.removeItem(STORAGE_KEYS.BANNER_DISMISSED_DATE);
        }
    }

    return {
        micGranted,
        locGranted,
        onboarded,
        bannerDismissed: localStorage.getItem(STORAGE_KEYS.BANNER_DISMISSED) === 'true',
        allGranted: micGranted && locGranted
    };
}

function shouldShowOnboarding() {
    const state = checkPermissionState();
    if (isMobile && !state.onboarded && !state.allGranted) {
        return true;
    }
    return false;
}

function shouldShowBanner() {
    const state = checkPermissionState();
    if (isMobile && state.onboarded && !state.allGranted && !state.bannerDismissed) {
        return true;
    }
    return false;
}

function showPermissionsBanner() {
    const banner = document.getElementById('permissionsBanner');
    banner.classList.remove('hidden');
}

function dismissPermissionsBanner() {
    const banner = document.getElementById('permissionsBanner');
    banner.classList.add('hidden');
    localStorage.setItem(STORAGE_KEYS.BANNER_DISMISSED, 'true');
    localStorage.setItem(STORAGE_KEYS.BANNER_DISMISSED_DATE, new Date().toISOString());
}

async function dismissSubmittedBanner() {
    const banner = document.getElementById('submittedBanner');
    banner.classList.add('hidden');
    sessionStorage.setItem('fvp_submitted_banner_dismissed', 'true');

    // Refresh UI
    renderReportCards();
    updateReportStatus();
}

// ============ DRAFTS/OFFLINE QUEUE ============
function getOfflineQueueCount() {
    // Use getSyncQueue from storage-keys.js
    const queue = getSyncQueue();
    return queue.length;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    if (shouldShowOnboarding()) {
        window.location.href = 'permissions.html';
        return;
    }

    if (shouldShowBanner()) {
        showPermissionsBanner();
    }

    // Clean up old AI response caches (older than 24 hours)
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fvp_ai_response_')) {
            try {
                const cached = JSON.parse(localStorage.getItem(key));
                const cachedAt = new Date(cached.cachedAt);
                const hoursSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
                if (hoursSince > 24) {
                    localStorage.removeItem(key);
                    console.log(`[CLEANUP] Removed stale AI cache: ${key}`);
                }
            } catch (e) {
                // Invalid JSON, remove it
                localStorage.removeItem(key);
            }
        }
    }

    // Set current date immediately
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // ============ ONE-TIME MIGRATION: Clear stale IndexedDB projects (v1.13.0) ============
    // This fixes mobile PWA showing duplicate/stale projects from before user_id filtering
    const MIGRATION_KEY = 'fvp_migration_v113_idb_clear';
    if (!localStorage.getItem(MIGRATION_KEY)) {
        console.log('[MIGRATION v1.13.0] Clearing stale IndexedDB projects...');
        try {
            await window.idb.clearStore('projects');
            localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
            console.log('[MIGRATION v1.13.0] IndexedDB projects cleared successfully');
        } catch (migrationErr) {
            console.warn('[MIGRATION v1.13.0] Failed to clear IndexedDB:', migrationErr);
            // Still set the flag to avoid retrying on every load
            localStorage.setItem(MIGRATION_KEY, 'failed-' + new Date().toISOString());
        }
    }

    try {
        // Initialize sync manager
        initSyncManager();

        // Load local projects first
        let projects = await window.dataLayer.loadProjects();

        // Always refresh from Supabase when online to get all projects
        if (navigator.onLine) {
            try {
                console.log('[INDEX] Refreshing projects from cloud...');
                projects = await window.dataLayer.refreshProjectsFromCloud();
            } catch (e) {
                console.warn('[INDEX] Cloud refresh failed, using local projects:', e);
                // Keep using local projects on error
            }
        }

        // Cache projects for this page
        projectsCache = projects;

        // Load active project
        activeProjectCache = await window.dataLayer.loadActiveProject();

        // Update UI - reports come from localStorage now
        updateActiveProjectCard();
        renderReportCards();
        updateReportStatus();

        // Show submitted banner if there are submitted reports today and not dismissed this session
        const bannerDismissedThisSession = sessionStorage.getItem('fvp_submitted_banner_dismissed') === 'true';
        const { todaySubmitted } = getReportsByUrgency();
        if (todaySubmitted.length > 0 && !bannerDismissedThisSession) {
            document.getElementById('submittedBanner').classList.remove('hidden');
        }

        // Sync weather
        syncWeather();
    } catch (err) {
        console.error('Failed to initialize:', err);
        // Still update UI with whatever we have
        updateActiveProjectCard();
        renderReportCards();
        updateReportStatus();
        syncWeather();
    }
});
