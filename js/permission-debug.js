// ============ GLOBALS ============
const consoleLog = [];

// ============ LOGGING HELPERS ============
function log(message, type = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const entry = `[${timestamp}] ${message}`;
    consoleLog.push(entry);

    const rawConsole = document.getElementById('raw-console');
    const p = document.createElement('p');
    p.textContent = entry;
    if (type === 'error') p.className = 'text-red-400';
    else if (type === 'success') p.className = 'text-green-400';
    else if (type === 'warn') p.className = 'text-yellow-400';
    else p.className = 'text-blue-400';
    rawConsole.appendChild(p);
    rawConsole.scrollTop = rawConsole.scrollHeight;

    console.log(`[PermDebug] ${message}`);
}

function addLog(container, message, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-entry log-${type}`;
    div.textContent = message;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    log(message, type);
}

function copyConsole() {
    navigator.clipboard.writeText(consoleLog.join('\n'))
        .then(() => alert('Console copied to clipboard!'))
        .catch(err => alert('Copy failed: ' + err.message));
}

function clearConsole() {
    consoleLog.length = 0;
    document.getElementById('raw-console').innerHTML = '<p class="text-slate-500">// Console cleared</p>';
}

// ============ ENVIRONMENT DETECTION ============
function detectEnvironment() {
    const env = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        isLocalhost: ['localhost', '127.0.0.1', ''].includes(window.location.hostname),
        isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
        isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
        isChrome: /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent),
        isFirefox: /Firefox/.test(navigator.userAgent),
        isEdge: /Edg/.test(navigator.userAgent),
        isStandalone: window.navigator.standalone === true,
        displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        hasGeolocation: !!navigator.geolocation,
        hasSpeechRecognition: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        hasPermissionsAPI: !!(navigator.permissions && navigator.permissions.query),
    };

    // Determine iOS version if possible
    const iosMatch = navigator.userAgent.match(/OS (\d+)_(\d+)/);
    if (iosMatch) {
        env.iosVersion = `${iosMatch[1]}.${iosMatch[2]}`;
    }

    return env;
}

function renderEnvironment() {
    const env = detectEnvironment();
    const panel = document.getElementById('env-panel');
    panel.innerHTML = '';

    const checks = [
        {
            label: 'Secure Context (HTTPS)',
            value: env.isSecureContext,
            pass: env.isSecureContext,
            critical: true,
            failMsg: 'REQUIRED! Permission APIs only work on HTTPS or localhost'
        },
        {
            label: 'Standalone/PWA Mode',
            value: env.isStandalone,
            pass: !env.isStandalone,
            critical: true,
            failMsg: 'BLOCKED! getUserMedia does NOT work in standalone PWA mode on iOS!'
        },
        {
            label: 'Display Mode',
            value: env.displayMode,
            pass: env.displayMode === 'browser',
            critical: env.displayMode === 'standalone',
            failMsg: 'Running as standalone app - open in Safari browser instead'
        },
        {
            label: 'navigator.mediaDevices',
            value: env.hasMediaDevices ? 'EXISTS' : 'UNDEFINED',
            pass: env.hasMediaDevices,
            critical: true,
            failMsg: 'API missing - usually means standalone mode or insecure context'
        },
        {
            label: 'getUserMedia()',
            value: env.hasGetUserMedia ? 'EXISTS' : 'UNDEFINED',
            pass: env.hasGetUserMedia,
            critical: true,
            failMsg: 'API missing - camera/microphone will not work'
        },
        {
            label: 'navigator.geolocation',
            value: env.hasGeolocation ? 'EXISTS' : 'UNDEFINED',
            pass: env.hasGeolocation,
            critical: false,
            failMsg: 'Geolocation API not available'
        },
        {
            label: 'SpeechRecognition',
            value: env.hasSpeechRecognition ? 'EXISTS' : 'UNDEFINED',
            pass: env.hasSpeechRecognition,
            critical: false,
            failMsg: 'Speech Recognition not supported in this browser'
        },
        {
            label: 'Permissions API',
            value: env.hasPermissionsAPI ? 'EXISTS' : 'UNDEFINED',
            pass: env.hasPermissionsAPI,
            critical: false,
            failMsg: 'Permissions API not supported - cannot check permission states'
        },
        { label: 'Protocol', value: env.protocol, pass: env.protocol === 'https:', critical: false },
        { label: 'iOS Device', value: env.isIOS ? 'YES' : 'NO', pass: null },
        { label: 'iOS Version', value: env.iosVersion || 'N/A', pass: null },
        { label: 'Safari Browser', value: env.isSafari ? 'YES' : 'NO', pass: env.isSafari || !env.isIOS },
        { label: 'Chrome', value: env.isChrome ? 'YES' : 'NO', pass: null },
    ];

    // Check for critical failures
    let hasCriticalFailure = false;
    let criticalMsg = '';
    let criticalFix = '';

    for (const check of checks) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between py-1 border-b border-slate-700';

        const label = document.createElement('span');
        label.className = 'text-slate-400';
        label.textContent = check.label;

        const value = document.createElement('span');
        if (check.pass === true) {
            value.className = 'status-pass px-2 py-0.5 rounded text-xs font-bold';
            value.textContent = check.value;
        } else if (check.pass === false) {
            value.className = 'status-fail px-2 py-0.5 rounded text-xs font-bold';
            value.textContent = check.value;
            if (check.critical) {
                hasCriticalFailure = true;
                criticalMsg = check.failMsg;
                if (check.label.includes('Standalone')) {
                    criticalFix = 'Open this URL in Safari browser, not from home screen icon';
                } else if (check.label.includes('Secure')) {
                    criticalFix = 'Serve this site over HTTPS';
                } else if (check.label.includes('mediaDevices')) {
                    criticalFix = 'Check if running in standalone mode or WKWebView';
                }
            }
        } else if (check.pass === null) {
            value.className = 'status-unknown px-2 py-0.5 rounded text-xs font-bold';
            value.textContent = check.value;
        } else {
            value.className = 'text-slate-300';
            value.textContent = check.value;
        }

        row.appendChild(label);
        row.appendChild(value);
        panel.appendChild(row);
    }

    // User Agent (full)
    const uaRow = document.createElement('div');
    uaRow.className = 'pt-2 mt-2 border-t border-slate-600';
    uaRow.innerHTML = `<p class="text-slate-500 text-xs mb-1">User Agent:</p><p class="text-slate-400 text-xs break-all">${env.userAgent}</p>`;
    panel.appendChild(uaRow);

    // Show critical alert if needed
    if (hasCriticalFailure) {
        const alert = document.getElementById('critical-alert');
        document.getElementById('critical-alert-message').textContent = criticalMsg;
        document.getElementById('critical-alert-fix').textContent = 'FIX: ' + criticalFix;
        alert.classList.remove('hidden');
    }

    log('Environment detection complete');
    return env;
}

// ============ PERMISSION STATES ============
async function checkPermissionStates() {
    const panel = document.getElementById('permission-states');
    panel.innerHTML = '';

    const permissions = [
        { name: 'camera', displayName: 'Camera' },
        { name: 'microphone', displayName: 'Microphone' },
        { name: 'geolocation', displayName: 'Geolocation' },
    ];

    if (!navigator.permissions || !navigator.permissions.query) {
        panel.innerHTML = '<p class="text-red-400">Permissions API not supported in this browser</p>';
        log('Permissions API not supported', 'warn');
        return;
    }

    for (const perm of permissions) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between py-2 border-b border-slate-700';

        const label = document.createElement('span');
        label.className = 'text-slate-300';
        label.textContent = perm.displayName;

        const status = document.createElement('span');
        status.className = 'px-2 py-0.5 rounded text-xs font-bold';

        try {
            const result = await navigator.permissions.query({ name: perm.name });
            log(`${perm.name}: ${result.state}`);

            if (result.state === 'granted') {
                status.className += ' status-pass';
                status.textContent = 'GRANTED';
            } else if (result.state === 'denied') {
                status.className += ' status-fail';
                status.textContent = 'DENIED';
            } else if (result.state === 'prompt') {
                status.className += ' status-warn';
                status.textContent = 'PROMPT (will show dialog)';
            }

            // Listen for changes
            result.addEventListener('change', () => {
                log(`${perm.name} permission changed to: ${result.state}`, 'warn');
            });
        } catch (err) {
            status.className += ' status-unknown';
            status.textContent = 'NOT SUPPORTED';
            log(`${perm.name}: Permissions API query not supported - ${err.message}`, 'warn');
        }

        row.appendChild(label);
        row.appendChild(status);
        panel.appendChild(row);
    }

    // Add interpretation
    const note = document.createElement('div');
    note.className = 'mt-3 p-2 bg-slate-700 rounded text-xs text-slate-300';
    note.innerHTML = `
        <p><strong>GRANTED:</strong> Permission already given - no dialog will appear</p>
        <p><strong>DENIED:</strong> Permission already denied - no dialog will appear, instant rejection</p>
        <p><strong>PROMPT:</strong> User hasn't decided yet - native dialog SHOULD appear</p>
    `;
    panel.appendChild(note);
}

// ============ MICROPHONE TEST ============
async function testMicrophone() {
    const logEl = document.getElementById('mic-log');
    logEl.innerHTML = '';

    addLog(logEl, '=== MICROPHONE TEST STARTED ===', 'info');
    addLog(logEl, `Timestamp: ${new Date().toISOString()}`, 'info');
    addLog(logEl, `Secure context: ${window.isSecureContext}`, 'info');
    addLog(logEl, `Standalone mode: ${window.navigator.standalone}`, window.navigator.standalone ? 'error' : 'info');

    if (window.navigator.standalone === true) {
        addLog(logEl, '!!! RUNNING IN STANDALONE/PWA MODE !!!', 'error');
        addLog(logEl, 'getUserMedia is BLOCKED in this mode on iOS', 'error');
        addLog(logEl, 'FIX: Open this URL in Safari browser, not home screen app', 'warn');
        return;
    }

    if (!navigator.mediaDevices) {
        addLog(logEl, 'navigator.mediaDevices is UNDEFINED', 'error');
        addLog(logEl, 'This usually means:', 'warn');
        addLog(logEl, '  - Not on HTTPS', 'warn');
        addLog(logEl, '  - Running in standalone PWA mode', 'warn');
        addLog(logEl, '  - Running in WKWebView (non-Safari browser on iOS)', 'warn');
        return;
    }

    if (!navigator.mediaDevices.getUserMedia) {
        addLog(logEl, 'navigator.mediaDevices.getUserMedia is UNDEFINED', 'error');
        return;
    }

    addLog(logEl, 'getUserMedia() EXISTS - calling now...', 'success');
    addLog(logEl, '>>> Native dialog should appear NOW <<<', 'warn');
    addLog(logEl, 'Waiting for user response (30s timeout)...', 'info');

    const startTime = Date.now();

    try {
        const stream = await Promise.race([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT: No response after 30 seconds')), 30000)
            )
        ]);

        const elapsed = Date.now() - startTime;
        addLog(logEl, `SUCCESS after ${elapsed}ms`, 'success');
        addLog(logEl, `Got stream with ${stream.getTracks().length} track(s)`, 'success');

        stream.getTracks().forEach((track, i) => {
            addLog(logEl, `Track ${i}: ${track.kind}, label: "${track.label}", enabled: ${track.enabled}`, 'info');
            track.stop();
        });

        addLog(logEl, 'NATIVE DIALOG WORKED - Permission granted!', 'success');
        addLog(logEl, `Response time: ${elapsed}ms`, 'info');
        if (elapsed < 100) {
            addLog(logEl, 'Note: Very fast response suggests permission was already granted', 'warn');
        }

    } catch (err) {
        const elapsed = Date.now() - startTime;
        addLog(logEl, `FAILED after ${elapsed}ms`, 'error');
        addLog(logEl, `Error name: ${err.name}`, 'error');
        addLog(logEl, `Error message: ${err.message}`, 'error');

        // Interpret the error
        if (err.name === 'NotAllowedError') {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'User denied the permission OR it was already denied in Settings', 'warn');
            addLog(logEl, 'FIX: Tap aA in Safari > Website Settings > Set Microphone to Ask', 'warn');
        } else if (err.name === 'NotFoundError') {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'No microphone found on this device', 'warn');
        } else if (err.name === 'NotReadableError') {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'Microphone is in use by another app', 'warn');
            addLog(logEl, 'FIX: Close other apps using mic (Zoom, Teams, etc.)', 'warn');
        } else if (err.message.includes('TIMEOUT')) {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'The API call hung - no dialog appeared, no response', 'error');
            addLog(logEl, 'This typically happens in:', 'warn');
            addLog(logEl, '  - Standalone PWA mode', 'warn');
            addLog(logEl, '  - WKWebView (Chrome/Firefox on iOS)', 'warn');
            addLog(logEl, '  - Some edge cases where iOS blocks the request silently', 'warn');
        }
    }
}

// ============ CAMERA TEST ============
async function testCamera() {
    const logEl = document.getElementById('cam-log');
    logEl.innerHTML = '';

    addLog(logEl, '=== CAMERA TEST STARTED ===', 'info');
    addLog(logEl, `Timestamp: ${new Date().toISOString()}`, 'info');
    addLog(logEl, `Secure context: ${window.isSecureContext}`, 'info');
    addLog(logEl, `Standalone mode: ${window.navigator.standalone}`, window.navigator.standalone ? 'error' : 'info');

    if (window.navigator.standalone === true) {
        addLog(logEl, '!!! RUNNING IN STANDALONE/PWA MODE !!!', 'error');
        addLog(logEl, 'getUserMedia is BLOCKED in this mode on iOS', 'error');
        addLog(logEl, 'FIX: Open this URL in Safari browser, not home screen app', 'warn');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        addLog(logEl, 'mediaDevices.getUserMedia is UNDEFINED', 'error');
        addLog(logEl, 'Camera API not available in this context', 'error');
        return;
    }

    addLog(logEl, 'getUserMedia() EXISTS - calling now...', 'success');
    addLog(logEl, '>>> Native dialog should appear NOW <<<', 'warn');
    addLog(logEl, 'Waiting for user response (30s timeout)...', 'info');

    const startTime = Date.now();

    try {
        const stream = await Promise.race([
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT: No response after 30 seconds')), 30000)
            )
        ]);

        const elapsed = Date.now() - startTime;
        addLog(logEl, `SUCCESS after ${elapsed}ms`, 'success');
        addLog(logEl, `Got stream with ${stream.getTracks().length} track(s)`, 'success');

        stream.getTracks().forEach((track, i) => {
            addLog(logEl, `Track ${i}: ${track.kind}, label: "${track.label}"`, 'info');
            const settings = track.getSettings();
            if (settings.width) addLog(logEl, `  Resolution: ${settings.width}x${settings.height}`, 'info');
            if (settings.facingMode) addLog(logEl, `  Facing: ${settings.facingMode}`, 'info');
            track.stop();
        });

        addLog(logEl, 'NATIVE DIALOG WORKED - Permission granted!', 'success');
        if (elapsed < 100) {
            addLog(logEl, 'Note: Very fast response suggests permission was already granted', 'warn');
        }

    } catch (err) {
        const elapsed = Date.now() - startTime;
        addLog(logEl, `FAILED after ${elapsed}ms`, 'error');
        addLog(logEl, `Error name: ${err.name}`, 'error');
        addLog(logEl, `Error message: ${err.message}`, 'error');

        if (err.name === 'NotAllowedError') {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'User denied OR already denied in Settings', 'warn');
            addLog(logEl, 'FIX: Tap aA > Website Settings > Set Camera to Ask', 'warn');
        } else if (err.name === 'NotFoundError') {
            addLog(logEl, 'No camera found on this device', 'warn');
        } else if (err.message.includes('TIMEOUT')) {
            addLog(logEl, '--- INTERPRETATION ---', 'warn');
            addLog(logEl, 'API call hung - likely standalone/PWA mode issue', 'error');
        }
    }
}

// ============ LOCATION TEST ============
async function testLocation() {
    const logEl = document.getElementById('loc-log');
    logEl.innerHTML = '';

    addLog(logEl, '=== LOCATION TEST STARTED ===', 'info');
    addLog(logEl, `Timestamp: ${new Date().toISOString()}`, 'info');
    addLog(logEl, `Secure context: ${window.isSecureContext}`, 'info');

    if (!navigator.geolocation) {
        addLog(logEl, 'navigator.geolocation is UNDEFINED', 'error');
        addLog(logEl, 'Geolocation API not available', 'error');
        return;
    }

    addLog(logEl, 'Geolocation API EXISTS - calling getCurrentPosition...', 'success');
    addLog(logEl, '>>> Native dialog should appear NOW <<<', 'warn');
    addLog(logEl, 'Waiting for user response (30s timeout)...', 'info');

    const startTime = Date.now();

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const elapsed = Date.now() - startTime;
            addLog(logEl, `SUCCESS after ${elapsed}ms`, 'success');
            addLog(logEl, `Latitude: ${position.coords.latitude}`, 'info');
            addLog(logEl, `Longitude: ${position.coords.longitude}`, 'info');
            addLog(logEl, `Accuracy: ${position.coords.accuracy}m`, 'info');
            if (position.coords.altitude !== null) {
                addLog(logEl, `Altitude: ${position.coords.altitude}m`, 'info');
            }
            addLog(logEl, 'NATIVE DIALOG WORKED - Permission granted!', 'success');
            if (elapsed < 500) {
                addLog(logEl, 'Note: Fast response may indicate cached location or pre-granted permission', 'warn');
            }
        },
        (error) => {
            const elapsed = Date.now() - startTime;
            addLog(logEl, `FAILED after ${elapsed}ms`, 'error');
            addLog(logEl, `Error code: ${error.code}`, 'error');
            addLog(logEl, `Error message: ${error.message}`, 'error');

            if (error.code === 1) { // PERMISSION_DENIED
                addLog(logEl, '--- INTERPRETATION ---', 'warn');
                addLog(logEl, 'PERMISSION_DENIED: User denied OR already denied in Settings', 'warn');
                addLog(logEl, 'FIX: iOS Settings > Privacy & Security > Location Services > Safari', 'warn');
            } else if (error.code === 2) { // POSITION_UNAVAILABLE
                addLog(logEl, '--- INTERPRETATION ---', 'warn');
                addLog(logEl, 'POSITION_UNAVAILABLE: Location could not be determined', 'warn');
                addLog(logEl, 'This can happen indoors or with poor GPS signal', 'warn');
            } else if (error.code === 3) { // TIMEOUT
                addLog(logEl, '--- INTERPRETATION ---', 'warn');
                addLog(logEl, 'TIMEOUT: Location request took too long', 'warn');
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
        }
    );
}

// ============ SPEECH RECOGNITION TEST ============
async function testSpeechRecognition() {
    const logEl = document.getElementById('speech-log');
    logEl.innerHTML = '';

    addLog(logEl, '=== SPEECH RECOGNITION TEST STARTED ===', 'info');
    addLog(logEl, `Timestamp: ${new Date().toISOString()}`, 'info');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        addLog(logEl, 'SpeechRecognition API is UNDEFINED', 'error');
        addLog(logEl, 'This browser does not support speech recognition', 'error');
        addLog(logEl, 'Supported browsers: Safari, Chrome, Edge', 'warn');
        return;
    }

    addLog(logEl, 'SpeechRecognition API EXISTS', 'success');
    addLog(logEl, 'Creating recognition instance...', 'info');

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    addLog(logEl, 'Calling recognition.start()...', 'info');
    addLog(logEl, '>>> Say something when listening starts <<<', 'warn');

    let startTime = Date.now();

    recognition.onstart = () => {
        addLog(logEl, 'EVENT: onstart - Recognition started, listening...', 'success');
        startTime = Date.now();
    };

    recognition.onaudiostart = () => {
        addLog(logEl, 'EVENT: onaudiostart - Audio capture started', 'info');
    };

    recognition.onspeechstart = () => {
        addLog(logEl, 'EVENT: onspeechstart - Speech detected', 'info');
    };

    recognition.onresult = (event) => {
        const elapsed = Date.now() - startTime;
        addLog(logEl, `EVENT: onresult after ${elapsed}ms`, 'success');
        for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            const confidence = (result[0].confidence * 100).toFixed(1);
            addLog(logEl, `Transcript: "${transcript}" (${confidence}% confidence)`, 'success');
        }
        addLog(logEl, 'SPEECH RECOGNITION WORKING!', 'success');
    };

    recognition.onerror = (event) => {
        const elapsed = Date.now() - startTime;
        addLog(logEl, `EVENT: onerror after ${elapsed}ms`, 'error');
        addLog(logEl, `Error type: ${event.error}`, 'error');
        addLog(logEl, `Error message: ${event.message || 'No message'}`, 'error');

        if (event.error === 'service-not-allowed') {
            addLog(logEl, '--- iOS SPECIFIC ERROR ---', 'error');
            addLog(logEl, 'service-not-allowed means Siri/Dictation is disabled', 'warn');
            addLog(logEl, 'FIX: iOS Settings > Siri & Search > Enable Siri', 'warn');
            addLog(logEl, 'FIX: iOS Settings > General > Keyboard > Enable Dictation', 'warn');
        } else if (event.error === 'not-allowed') {
            addLog(logEl, 'Microphone permission denied', 'warn');
            addLog(logEl, 'FIX: Enable microphone permission first', 'warn');
        } else if (event.error === 'no-speech') {
            addLog(logEl, 'No speech was detected - but the API is working', 'warn');
            addLog(logEl, 'Try speaking louder next time', 'warn');
        }
    };

    recognition.onend = () => {
        const elapsed = Date.now() - startTime;
        addLog(logEl, `EVENT: onend after ${elapsed}ms`, 'info');
        addLog(logEl, 'Recognition session ended', 'info');
    };

    try {
        recognition.start();
        addLog(logEl, 'recognition.start() called successfully', 'success');

        // Auto-stop after 10 seconds
        setTimeout(() => {
            try {
                recognition.stop();
                addLog(logEl, 'Auto-stopped after 10 seconds', 'info');
            } catch (e) {}
        }, 10000);

    } catch (err) {
        addLog(logEl, `Failed to start: ${err.name}`, 'error');
        addLog(logEl, `Message: ${err.message}`, 'error');
    }
}

// ============ FULL DIAGNOSTICS ============
async function runFullDiagnostics() {
    const panel = document.getElementById('quick-diagnostics');
    panel.innerHTML = '<p class="pulse text-dot-orange">Running diagnostics...</p>';

    log('=== FULL DIAGNOSTICS STARTED ===');

    const env = detectEnvironment();
    const results = [];

    // Check 1: Secure Context
    results.push({
        name: 'Secure Context (HTTPS)',
        pass: env.isSecureContext,
        critical: true,
        value: env.isSecureContext ? 'YES' : 'NO',
        fix: 'Serve site over HTTPS or use localhost'
    });

    // Check 2: Standalone Mode
    results.push({
        name: 'NOT in Standalone/PWA Mode',
        pass: !env.isStandalone,
        critical: true,
        value: env.isStandalone ? 'IN PWA MODE (BAD!)' : 'Browser Mode (Good)',
        fix: 'Open this URL in Safari browser, not from home screen'
    });

    // Check 3: mediaDevices
    results.push({
        name: 'navigator.mediaDevices Available',
        pass: env.hasMediaDevices,
        critical: true,
        value: env.hasMediaDevices ? 'YES' : 'NO',
        fix: 'Check HTTPS and browser mode'
    });

    // Check 4: getUserMedia
    results.push({
        name: 'getUserMedia() Available',
        pass: env.hasGetUserMedia,
        critical: true,
        value: env.hasGetUserMedia ? 'YES' : 'NO',
        fix: 'Required for camera/microphone'
    });

    // Check 5: Geolocation
    results.push({
        name: 'Geolocation Available',
        pass: env.hasGeolocation,
        critical: false,
        value: env.hasGeolocation ? 'YES' : 'NO',
        fix: 'Location features unavailable'
    });

    // Check 6: Safari on iOS
    if (env.isIOS) {
        results.push({
            name: 'Using Safari Browser (iOS)',
            pass: env.isSafari,
            critical: true,
            value: env.isSafari ? 'YES' : 'NO (using ' + (env.isChrome ? 'Chrome' : 'Other') + ')',
            fix: 'On iOS, only Safari supports getUserMedia. Open in Safari.'
        });
    }

    // Render results
    panel.innerHTML = '';

    let overallPass = true;
    let criticalFail = null;

    for (const result of results) {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between py-2 border-b border-slate-700';

        const left = document.createElement('div');
        left.className = 'flex-1';
        left.innerHTML = `
            <span class="${result.pass ? 'text-green-400' : 'text-red-400'}">${result.pass ? '\u2713' : '\u2717'}</span>
            <span class="ml-2 text-slate-300">${result.name}</span>
        `;

        const right = document.createElement('span');
        right.className = `px-2 py-1 rounded text-xs font-bold ${result.pass ? 'status-pass' : 'status-fail'}`;
        right.textContent = result.value;

        row.appendChild(left);
        row.appendChild(right);
        panel.appendChild(row);

        if (!result.pass) {
            overallPass = false;
            if (result.critical && !criticalFail) {
                criticalFail = result;
            }
            // Show fix
            const fixRow = document.createElement('div');
            fixRow.className = 'text-xs text-yellow-400 pl-6 pb-2';
            fixRow.textContent = '\u21B3 FIX: ' + result.fix;
            panel.appendChild(fixRow);
        }

        log(`${result.name}: ${result.value} - ${result.pass ? 'PASS' : 'FAIL'}`);
    }

    // Overall summary
    const summary = document.createElement('div');
    summary.className = `mt-4 p-3 rounded text-center font-bold ${overallPass ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`;

    if (overallPass) {
        summary.innerHTML = '<i class="fas fa-check-circle mr-2"></i>ALL CHECKS PASSED - Native dialogs should work!';
        log('=== DIAGNOSTICS PASSED ===', 'success');
    } else {
        summary.innerHTML = `<i class="fas fa-times-circle mr-2"></i>ISSUES DETECTED - Fix the errors above`;
        log('=== DIAGNOSTICS FAILED ===', 'error');

        // Show critical alert
        if (criticalFail) {
            const alert = document.getElementById('critical-alert');
            document.getElementById('critical-alert-message').textContent = criticalFail.name + ': ' + criticalFail.value;
            document.getElementById('critical-alert-fix').textContent = 'FIX: ' + criticalFail.fix;
            alert.classList.remove('hidden');
        }
    }

    panel.appendChild(summary);
}

// ============ INIT ============
function init() {
    log('Permission Debug Page Loaded');
    log(`URL: ${window.location.href}`);
    log(`User Agent: ${navigator.userAgent}`);

    // Auto-run environment detection
    renderEnvironment();
}

document.addEventListener('DOMContentLoaded', init);
