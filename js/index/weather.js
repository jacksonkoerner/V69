// ============================================================================
// FieldVoice Pro v6 - Weather (weather.js)
//
// Uses:
// - location.js: getFreshLocation, getLocationFromCache
// ============================================================================

var weatherDataCache = null;
var sunriseSunsetCache = null;

async function syncWeather() {

    try {
        // Check if offline first
        if (!navigator.onLine) {
            document.getElementById('weatherCondition').textContent = 'Offline';
            document.getElementById('condBarWeatherIcon').className = 'fas fa-wifi-slash text-3xl text-yellow-500';
            return;
        }

        // Always get fresh GPS for weather so it reflects current position
        const freshLoc = await getFreshLocation();
        if (!freshLoc) {
            console.log('[Weather] No location available, skipping weather sync');
            document.getElementById('weatherCondition').textContent = 'Location needed';
            document.getElementById('condBarWeatherIcon').className = 'fas fa-location-dot text-3xl text-slate-400';
            return;
        }
        const latitude = freshLoc.lat;
        const longitude = freshLoc.lng;

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
        document.getElementById('condBarTempLow').textContent = `L: ${lowTemp}°`;
        document.getElementById('condBarPrecip').textContent = `${precip}"`;
        document.getElementById('condBarWeatherIcon').className = `fas ${weatherInfo.icon} text-3xl ${weatherInfo.color}`;

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
        document.getElementById('condBarWeatherIcon').className = 'fas fa-exclamation-triangle text-3xl text-yellow-500';
    }

}

function updateConditionsBar() {
    if (!weatherDataCache) return;

    var windEl = document.getElementById('condBarWind');
    var gustsEl = document.getElementById('condBarGusts');
    var statusEl = document.getElementById('condBarFlightStatus');

    if (windEl) windEl.textContent = (weatherDataCache.windSpeed !== null ? weatherDataCache.windSpeed + ' mph' : '--');
    if (gustsEl) gustsEl.textContent = (weatherDataCache.windGusts !== null ? weatherDataCache.windGusts + ' mph' : '--');

    if (statusEl) {
        var gusts = weatherDataCache.windGusts;
        if (gusts === null) {
            statusEl.textContent = '--';
            statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap bg-slate-200 text-slate-500';
        } else if (gusts < 20) {
            statusEl.textContent = 'FLY';
            statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap bg-safety-green text-white';
        } else if (gusts <= 25) {
            statusEl.textContent = 'CAUTION';
            statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap bg-dot-orange text-white';
        } else {
            statusEl.textContent = 'NO FLY';
            statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap bg-red-600 text-white';
        }

        // Refine with daylight check if sunrise data available
        if (sunriseSunsetCache) {
            var now = new Date();
            var withinWindow = now >= sunriseSunsetCache.sunrise && now <= sunriseSunsetCache.sunset;
            if (!withinWindow) {
                statusEl.textContent = 'NO FLY';
                statusEl.className = 'text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap bg-red-600 text-white';
            }
        }
    }
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
