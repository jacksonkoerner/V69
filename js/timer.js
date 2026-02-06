// ============================================================================
// FieldVoice Pro - Timer / Stopwatch (timer.js)
//
// Two modes: Stopwatch (count up with laps) and Timer (countdown with alarm).
// ============================================================================

var timerState = {
    mode: 'stopwatch', // 'stopwatch' or 'timer'
    // Stopwatch
    swRunning: false,
    swStartTime: 0,
    swElapsed: 0,
    swInterval: null,
    swLaps: [],
    // Timer
    tmRunning: false,
    tmStartTime: 0,
    tmDuration: 0,
    tmRemaining: 0,
    tmInterval: null,
    tmAlarmOsc: null,
    tmAlarmCtx: null,
    tmFlashInterval: null
};

function openTimer() {
    var overlay = document.getElementById('timerOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.add('hidden');
    var panel = document.getElementById('emergencyPanel');
    if (panel) panel.classList.add('hidden');
    timerState.mode = 'stopwatch';
    renderTimerUI();
}

function closeTimer() {
    var overlay = document.getElementById('timerOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    var strip = document.getElementById('emergencyStrip');
    if (strip) strip.classList.remove('hidden');
    stopTimerAlarm();
}

function switchTimerMode(mode) {
    timerState.mode = mode;
    renderTimerUI();
}

function renderTimerUI() {
    var content = document.getElementById('timerContent');
    if (!content) return;

    var isSW = timerState.mode === 'stopwatch';

    // Tab bar
    var html = '<div class="flex border-b border-slate-200 shrink-0">' +
        '<button onclick="switchTimerMode(\'stopwatch\')" class="flex-1 py-3 text-xs font-bold uppercase tracking-wider ' +
            (isSW ? 'text-dot-blue border-b-2 border-dot-blue bg-white' : 'text-slate-400 bg-slate-50') + '">Stopwatch</button>' +
        '<button onclick="switchTimerMode(\'timer\')" class="flex-1 py-3 text-xs font-bold uppercase tracking-wider ' +
            (!isSW ? 'text-dot-blue border-b-2 border-dot-blue bg-white' : 'text-slate-400 bg-slate-50') + '">Timer</button>' +
    '</div>';

    if (isSW) {
        html += renderStopwatchUI();
    } else {
        html += renderCountdownUI();
    }

    content.innerHTML = html;
}

// ============ STOPWATCH ============

function renderStopwatchUI() {
    var elapsed = timerState.swElapsed;
    if (timerState.swRunning) {
        elapsed = timerState.swElapsed + (Date.now() - timerState.swStartTime);
    }
    var display = formatTime(elapsed, true);

    var html = '<div class="flex-1 flex flex-col p-4">' +
        '<div class="text-center py-8">' +
            '<p id="swDisplay" class="text-4xl font-bold font-mono text-slate-800">' + display + '</p>' +
        '</div>' +
        '<div class="flex gap-3 mb-4">';

    if (!timerState.swRunning) {
        html += '<button onclick="swStart()" class="flex-1 bg-safety-green text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
            '<i class="fas fa-play mr-2"></i>Start</button>';
        if (timerState.swElapsed > 0) {
            html += '<button onclick="swReset()" class="flex-1 bg-slate-100 text-slate-500 font-bold rounded-lg text-sm" style="min-height:56px;">' +
                '<i class="fas fa-undo mr-2"></i>Reset</button>';
        }
    } else {
        html += '<button onclick="swStop()" class="flex-1 bg-red-500 text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
            '<i class="fas fa-stop mr-2"></i>Stop</button>';
        html += '<button onclick="swLap()" class="flex-1 bg-dot-blue text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
            '<i class="fas fa-flag mr-2"></i>Lap</button>';
    }

    html += '</div>';

    // Laps list
    if (timerState.swLaps.length > 0) {
        html += '<div class="flex-1 overflow-y-auto bg-white rounded-lg border border-slate-200">' +
            '<div class="px-3 py-2 border-b border-slate-100 flex text-[10px] text-slate-400 uppercase font-bold">' +
                '<span class="w-10">Lap</span><span class="flex-1">Lap Time</span><span class="flex-1 text-right">Total</span></div>';
        for (var i = timerState.swLaps.length - 1; i >= 0; i--) {
            html += '<div class="px-3 py-2 border-b border-slate-50 flex text-sm">' +
                '<span class="w-10 text-slate-400 font-bold">' + (i + 1) + '</span>' +
                '<span class="flex-1 font-mono font-bold text-slate-800">' + formatTime(timerState.swLaps[i].lap, false) + '</span>' +
                '<span class="flex-1 text-right font-mono text-slate-500">' + formatTime(timerState.swLaps[i].total, false) + '</span></div>';
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function swStart() {
    timerState.swStartTime = Date.now();
    timerState.swRunning = true;
    timerState.swInterval = setInterval(function() {
        var el = document.getElementById('swDisplay');
        if (el) {
            var elapsed = timerState.swElapsed + (Date.now() - timerState.swStartTime);
            el.textContent = formatTime(elapsed, true);
        }
    }, 50);
    renderTimerUI();
}

function swStop() {
    timerState.swElapsed += Date.now() - timerState.swStartTime;
    timerState.swRunning = false;
    clearInterval(timerState.swInterval);
    renderTimerUI();
}

function swLap() {
    var total = timerState.swElapsed + (Date.now() - timerState.swStartTime);
    var prevTotal = timerState.swLaps.length > 0 ? timerState.swLaps[timerState.swLaps.length - 1].total : 0;
    timerState.swLaps.push({ lap: total - prevTotal, total: total });
    renderTimerUI();
    // Restart the interval display since renderTimerUI rebuilds DOM
    if (timerState.swRunning) {
        clearInterval(timerState.swInterval);
        timerState.swInterval = setInterval(function() {
            var el = document.getElementById('swDisplay');
            if (el) {
                var elapsed = timerState.swElapsed + (Date.now() - timerState.swStartTime);
                el.textContent = formatTime(elapsed, true);
            }
        }, 50);
    }
}

function swReset() {
    timerState.swElapsed = 0;
    timerState.swRunning = false;
    timerState.swLaps = [];
    clearInterval(timerState.swInterval);
    renderTimerUI();
}

// ============ COUNTDOWN TIMER ============

function renderCountdownUI() {
    var html = '<div class="flex-1 flex flex-col p-4">';

    if (timerState.tmRunning || timerState.tmRemaining > 0) {
        // Show countdown
        var display = formatTime(timerState.tmRemaining, false);
        html += '<div id="tmBg" class="text-center py-8">' +
            '<p id="tmDisplay" class="text-4xl font-bold font-mono text-slate-800">' + display + '</p>' +
        '</div>';
        html += '<div class="flex gap-3 mb-4">';
        if (timerState.tmRunning) {
            html += '<button onclick="tmPause()" class="flex-1 bg-dot-yellow text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
                '<i class="fas fa-pause mr-2"></i>Pause</button>';
        } else {
            html += '<button onclick="tmResume()" class="flex-1 bg-safety-green text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
                '<i class="fas fa-play mr-2"></i>Resume</button>';
        }
        html += '<button onclick="tmCancel()" class="flex-1 bg-red-500 text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
            '<i class="fas fa-times mr-2"></i>Cancel</button>';
        html += '</div>';
    } else {
        // Show input
        html += '<div class="bg-white rounded-lg border border-slate-200 p-4 mb-4">' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">Set Duration</p>' +
            '<div class="flex gap-2 mb-4">' +
                '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Hours</label>' +
                '<input type="number" id="tmHours" value="0" min="0" max="23" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-center text-lg" style="min-height:48px;"></div>' +
                '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Minutes</label>' +
                '<input type="number" id="tmMinutes" value="0" min="0" max="59" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-center text-lg" style="min-height:48px;"></div>' +
                '<div class="flex-1"><label class="text-xs text-slate-500 uppercase mb-1 block">Seconds</label>' +
                '<input type="number" id="tmSeconds" value="0" min="0" max="59" class="w-full bg-slate-50 rounded-lg p-3 text-slate-800 font-bold text-center text-lg" style="min-height:48px;"></div>' +
            '</div>' +
            '<p class="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Quick Presets</p>' +
            '<div class="grid grid-cols-5 gap-2">' +
                '<button onclick="tmPreset(5)" class="py-3 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs" style="min-height:44px;">5m</button>' +
                '<button onclick="tmPreset(10)" class="py-3 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs" style="min-height:44px;">10m</button>' +
                '<button onclick="tmPreset(15)" class="py-3 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs" style="min-height:44px;">15m</button>' +
                '<button onclick="tmPreset(30)" class="py-3 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs" style="min-height:44px;">30m</button>' +
                '<button onclick="tmPreset(60)" class="py-3 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs" style="min-height:44px;">1h</button>' +
            '</div>' +
        '</div>' +
        '<button onclick="tmStart()" class="w-full py-4 bg-safety-green text-white font-bold rounded-lg text-sm" style="min-height:56px;">' +
            '<i class="fas fa-play mr-2"></i>Start Timer</button>';
    }

    html += '</div>';
    return html;
}

function tmPreset(minutes) {
    var mEl = document.getElementById('tmMinutes');
    var hEl = document.getElementById('tmHours');
    var sEl = document.getElementById('tmSeconds');
    if (minutes >= 60) {
        if (hEl) hEl.value = Math.floor(minutes / 60);
        if (mEl) mEl.value = minutes % 60;
    } else {
        if (hEl) hEl.value = 0;
        if (mEl) mEl.value = minutes;
    }
    if (sEl) sEl.value = 0;
}

function tmStart() {
    var h = parseInt(document.getElementById('tmHours').value) || 0;
    var m = parseInt(document.getElementById('tmMinutes').value) || 0;
    var s = parseInt(document.getElementById('tmSeconds').value) || 0;
    var total = (h * 3600 + m * 60 + s) * 1000;
    if (total <= 0) return;

    timerState.tmDuration = total;
    timerState.tmRemaining = total;
    timerState.tmStartTime = Date.now();
    timerState.tmRunning = true;

    timerState.tmInterval = setInterval(function() {
        var elapsed = Date.now() - timerState.tmStartTime;
        timerState.tmRemaining = Math.max(0, timerState.tmDuration - elapsed);
        var el = document.getElementById('tmDisplay');
        if (el) el.textContent = formatTime(timerState.tmRemaining, false);
        if (timerState.tmRemaining <= 0) {
            timerState.tmRunning = false;
            clearInterval(timerState.tmInterval);
            timerAlarm();
        }
    }, 100);

    renderTimerUI();
}

function tmPause() {
    timerState.tmRemaining = Math.max(0, timerState.tmDuration - (Date.now() - timerState.tmStartTime));
    timerState.tmRunning = false;
    clearInterval(timerState.tmInterval);
    renderTimerUI();
}

function tmResume() {
    timerState.tmDuration = timerState.tmRemaining;
    timerState.tmStartTime = Date.now();
    timerState.tmRunning = true;

    timerState.tmInterval = setInterval(function() {
        var elapsed = Date.now() - timerState.tmStartTime;
        timerState.tmRemaining = Math.max(0, timerState.tmDuration - elapsed);
        var el = document.getElementById('tmDisplay');
        if (el) el.textContent = formatTime(timerState.tmRemaining, false);
        if (timerState.tmRemaining <= 0) {
            timerState.tmRunning = false;
            clearInterval(timerState.tmInterval);
            timerAlarm();
        }
    }, 100);

    renderTimerUI();
}

function tmCancel() {
    timerState.tmRunning = false;
    timerState.tmRemaining = 0;
    clearInterval(timerState.tmInterval);
    stopTimerAlarm();
    renderTimerUI();
}

function timerAlarm() {
    // Play 500Hz beep for 2 seconds
    try {
        timerState.tmAlarmCtx = new (window.AudioContext || window.webkitAudioContext)();
        timerState.tmAlarmOsc = timerState.tmAlarmCtx.createOscillator();
        timerState.tmAlarmOsc.frequency.value = 500;
        timerState.tmAlarmOsc.type = 'square';
        var gain = timerState.tmAlarmCtx.createGain();
        gain.gain.value = 0.3;
        timerState.tmAlarmOsc.connect(gain);
        gain.connect(timerState.tmAlarmCtx.destination);
        timerState.tmAlarmOsc.start();
        setTimeout(function() { stopTimerAlarm(); }, 2000);
    } catch (e) {
        console.warn('[Timer] Audio alarm failed:', e);
    }

    // Flash screen
    var bg = document.getElementById('tmBg');
    if (bg) {
        var flash = true;
        timerState.tmFlashInterval = setInterval(function() {
            bg.style.background = flash ? '#ef4444' : '#ffffff';
            var disp = document.getElementById('tmDisplay');
            if (disp) disp.style.color = flash ? '#ffffff' : '#ef4444';
            flash = !flash;
        }, 300);
        setTimeout(function() {
            clearInterval(timerState.tmFlashInterval);
            if (bg) bg.style.background = '';
            var disp = document.getElementById('tmDisplay');
            if (disp) disp.style.color = '';
        }, 4000);
    }

    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
}

function stopTimerAlarm() {
    if (timerState.tmAlarmOsc) {
        try { timerState.tmAlarmOsc.stop(); } catch (e) {}
        timerState.tmAlarmOsc = null;
    }
    if (timerState.tmAlarmCtx) {
        timerState.tmAlarmCtx.close().catch(function() {});
        timerState.tmAlarmCtx = null;
    }
    if (timerState.tmFlashInterval) {
        clearInterval(timerState.tmFlashInterval);
        timerState.tmFlashInterval = null;
    }
}

// ============ HELPERS ============

function formatTime(ms, showMs) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var millis = Math.floor((ms % 1000) / 10);

    var parts = pad2(h) + ':' + pad2(m) + ':' + pad2(s);
    if (showMs) parts += '.' + pad2(millis);
    return parts;
}

function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
}
