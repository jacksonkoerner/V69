// ============================================================================
// FieldVoice Pro v6 - Panel Lazy Loading (panels.js)
//
// Uses:
// - location.js: getLocationFromCache, getCachedLocation, getFreshLocation
// - index/weather.js: weatherDataCache, sunriseSunsetCache, fetchSunriseSunset,
//                     updateConditionsBar
// ============================================================================

var panelLoaded = { weatherDetailsPanel: false, droneOpsPanel: false, emergencyPanel: false };

function onPanelOpen(panelId) {
    if (panelLoaded[panelId]) return;
    panelLoaded[panelId] = true;
    if (panelId === 'weatherDetailsPanel') loadWeatherDetailsPanel();
    else if (panelId === 'droneOpsPanel') loadDroneOpsPanel();
    else if (panelId === 'emergencyPanel') loadEmergencyPanel();
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

async function loadEmergencyPanel() {
    var panel = document.getElementById('emergencyPanel');
    if (!panel) return;

    // Use fresh GPS for emergency — accuracy matters most here
    var loc = await getFreshLocation() || getCachedLocation();
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

    // Find Nearest Hospital — opens Google Maps search (no API key needed)
    var hospitalUrl = 'https://www.google.com/maps/search/hospital+near+me/';
    html += '<a href="' + hospitalUrl + '" target="_blank" rel="noopener" class="block w-full bg-white border-2 border-red-300 hover:bg-red-50 text-red-700 text-center py-3 rounded-lg font-bold text-sm transition-colors">';
    html += '<i class="fas fa-hospital mr-2"></i>Find Nearest Hospital';
    html += '</a>';

    panel.innerHTML = html;
}

async function shareEmergencyLocation() {
    // Use fresh GPS for emergency sharing — accuracy matters most here
    var loc = await getFreshLocation() || getCachedLocation();
    if (!loc || !navigator.share) return;
    var url = 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng;
    navigator.share({
        title: 'My Location - Emergency',
        text: 'My GPS coordinates: ' + loc.lat.toFixed(6) + ', ' + loc.lng.toFixed(6),
        url: url
    }).catch(function(e) { console.log('[Share] Cancelled or failed:', e); });
}
