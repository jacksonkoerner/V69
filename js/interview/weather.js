// ============================================================
// js/interview/weather.js — Weather data fetching & display
// ============================================================

var IS = window.interviewState;

async function fetchWeather() {
    try {
        // Always get fresh GPS for weather so it reflects current position
        const freshLoc = await getFreshLocation();
        if (!freshLoc) {
            console.log('[Weather] No location available, skipping weather fetch');
            return;
        }
        const latitude = freshLoc.lat;
        const longitude = freshLoc.lng;

        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&temperature_unit=fahrenheit&precipitation_unit=inch`);
        const data = await response.json();
        const weatherCodes = { 0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle', 61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain', 80: 'Showers', 95: 'Thunderstorm' };
        const precip = data.daily.precipitation_sum[0];
        IS.report.overview.weather = {
            highTemp: `${Math.round(data.daily.temperature_2m_max[0])}°F`,
            lowTemp: `${Math.round(data.daily.temperature_2m_min[0])}°F`,
            precipitation: `${precip.toFixed(2)}"`,
            generalCondition: weatherCodes[data.current_weather.weathercode] || 'Cloudy',
            jobSiteCondition: IS.report.overview.weather.jobSiteCondition || (precip > 0.1 ? 'Wet' : 'Dry'),
            adverseConditions: precip > 0.25 ? 'Rain impact possible' : 'N/A'
        };
        saveReport();
        updateWeatherDisplay();
        updateMinimalWeatherDisplay(); // Also update minimal mode weather
    } catch (error) {
        console.error('Weather fetch failed:', error);
    }
}

function updateWeatherDisplay() {
    const w = IS.report.overview.weather;
    const conditionEl = document.getElementById('weather-condition');
    const tempEl = document.getElementById('weather-temp');
    const precipEl = document.getElementById('weather-precip');
    const siteCondEl = document.getElementById('site-conditions-input');

    if (conditionEl) conditionEl.textContent = w.generalCondition;
    if (tempEl) tempEl.textContent = `${w.highTemp} / ${w.lowTemp}`;
    if (precipEl) precipEl.textContent = w.precipitation;
    if (siteCondEl) siteCondEl.value = w.jobSiteCondition || '';
}
