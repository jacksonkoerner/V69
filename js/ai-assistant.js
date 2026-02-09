/**
 * ai-assistant.js — Global AI Assistant (floating button + chat overlay)
 * Auto-injects into any page that loads this script.
 * Persists conversation in localStorage. Will connect to n8n webhook.
 */
(function () {
    'use strict';

    // ── Config ──
    const AI_WEBHOOK = 'https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-ai-chat';
    const STORAGE_KEY = 'fvp_ai_conversation';
    const MAX_HISTORY = 50;

    // ── State ──
    let conversation = loadConversation();
    let isOpen = false;
    let isProcessing = false;

    // ── Inject HTML ──
    function injectUI() {
        // Floating button (draggable, double-tap to open)
        const btn = document.createElement('div');
        btn.id = 'aiAssistantBtn';
        btn.innerHTML = `
            <div style="width:56px;height:56px;border-radius:50%;background:#1e3a5f;color:#fff;
                box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;
                cursor:grab;transition:transform 0.15s;user-select:none;-webkit-user-select:none;">
                <i class="fas fa-wand-magic-sparkles" style="font-size:20px;"></i>
            </div>`;
        btn.style.cssText = 'position:fixed;z-index:90;bottom:70px;right:16px;touch-action:none;';
        document.body.appendChild(btn);

        // Full-screen overlay
        const overlay = document.createElement('div');
        overlay.id = 'aiAssistantOverlay';
        overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:95;background:#fff;flex-direction:column;';
        overlay.innerHTML = `
            <!-- Top Bar -->
            <div style="background:#0f1c2e;padding:12px 16px;padding-top:max(env(safe-area-inset-top),12px);
                display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:8px;color:#fff;">
                    <i class="fas fa-wand-magic-sparkles" style="color:#f59e0b;"></i>
                    <span style="font-weight:bold;font-size:14px;">AI Assistant</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button id="aiHelpBtn" style="width:44px;height:44px;display:flex;align-items:center;
                        justify-content:center;color:#fff;background:none;border:none;cursor:pointer;"
                        title="What can I do?">
                        <i class="fas fa-circle-question" style="font-size:16px;"></i>
                    </button>
                    <button id="aiCloseBtn" style="width:44px;height:44px;display:flex;align-items:center;
                        justify-content:center;color:#fff;background:none;border:none;cursor:pointer;">
                        <i class="fas fa-times" style="font-size:18px;"></i>
                    </button>
                </div>
            </div>
            <!-- Chat Area -->
            <div id="aiChatScroll" style="flex:1;overflow-y:auto;padding:16px;">
                <div id="aiChatMessages" style="display:flex;flex-direction:column;gap:12px;"></div>
            </div>
            <!-- Input Bar -->
            <div style="padding:12px;padding-bottom:max(env(safe-area-inset-bottom),12px);
                border-top:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <input id="aiChatInput" type="text" placeholder="Ask me anything..."
                    style="flex:1;border:1px solid #cbd5e1;border-radius:9999px;padding:10px 16px;
                    font-size:14px;outline:none;">
                <button id="aiSendBtn" style="width:40px;height:40px;background:#1e3a5f;color:#fff;
                    border-radius:50%;border:none;display:flex;align-items:center;justify-content:center;
                    cursor:pointer;flex-shrink:0;">
                    <i class="fas fa-paper-plane" style="font-size:13px;"></i>
                </button>
            </div>`;
        document.body.appendChild(overlay);

        // ── Event Listeners ──
        document.getElementById('aiCloseBtn').addEventListener('click', closeAssistant);
        document.getElementById('aiHelpBtn').addEventListener('click', showHelp);
        document.getElementById('aiSendBtn').addEventListener('click', sendMessage);
        document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // ── Draggable + Double-Tap ──
        setupDraggable(btn);

        // Render existing conversation
        renderMessages();
    }

    function setupDraggable(btn) {
        let isDragging = false;
        let moved = false;
        let startX = 0, startY = 0;
        let btnX = 0, btnY = 0;
        let lastTap = 0;
        const DRAG_THRESHOLD = 8;

        function positionBtn() {
            btn.style.left = btnX + 'px';
            btn.style.top = btnY + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        }

        function snapToEdge() {
            const rect = btn.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const cx = rect.left + rect.width / 2;
            btnX = cx < vw / 2 ? 12 : vw - rect.width - 12;
            btnY = Math.max(12, Math.min(btnY, vh - rect.height - 80));
            btn.style.transition = 'left 0.25s ease, top 0.25s ease';
            positionBtn();
            setTimeout(() => btn.style.transition = '', 300);
        }

        // Touch events
        btn.addEventListener('touchstart', function (e) {
            const t = e.touches[0];
            const rect = btn.getBoundingClientRect();
            btnX = rect.left;
            btnY = rect.top;
            startX = t.clientX - btnX;
            startY = t.clientY - btnY;
            moved = false;
            isDragging = true;
            positionBtn();
        }, { passive: true });

        btn.addEventListener('touchmove', function (e) {
            if (!isDragging) return;
            const t = e.touches[0];
            const nx = t.clientX - startX;
            const ny = t.clientY - startY;
            if (Math.abs(nx - btnX) > DRAG_THRESHOLD || Math.abs(ny - btnY) > DRAG_THRESHOLD) {
                moved = true;
            }
            btnX = nx;
            btnY = ny;
            positionBtn();
            e.preventDefault();
        }, { passive: false });

        btn.addEventListener('touchend', function () {
            isDragging = false;
            if (moved) {
                snapToEdge();
                return;
            }
            // Double-tap detection
            const now = Date.now();
            if (now - lastTap < 350) {
                lastTap = 0;
                openAssistant();
            } else {
                lastTap = now;
                // Brief scale animation on single tap to hint "double-tap me"
                const inner = btn.firstElementChild;
                if (inner) {
                    inner.style.transform = 'scale(1.15)';
                    setTimeout(() => inner.style.transform = '', 200);
                }
            }
        }, { passive: true });

        // Mouse: double-click fallback for desktop
        btn.addEventListener('dblclick', function (e) {
            e.preventDefault();
            openAssistant();
        });
    }

    // ── Open / Close ──
    function openAssistant() {
        const overlay = document.getElementById('aiAssistantOverlay');
        const btn = document.getElementById('aiAssistantBtn');
        overlay.style.display = 'flex';
        btn.style.display = 'none';
        isOpen = true;
        // Hide emergency strip if it exists
        const emergency = document.getElementById('emergencyStrip');
        if (emergency) emergency.style.display = 'none';
        const emergencyPanel = document.getElementById('emergencyPanel');
        if (emergencyPanel) emergencyPanel.style.display = 'none';
        // Scroll to bottom
        requestAnimationFrame(() => {
            const scroll = document.getElementById('aiChatScroll');
            scroll.scrollTop = scroll.scrollHeight;
        });
        // Focus input
        setTimeout(() => document.getElementById('aiChatInput')?.focus(), 300);
    }

    function closeAssistant() {
        const overlay = document.getElementById('aiAssistantOverlay');
        const btn = document.getElementById('aiAssistantBtn');
        overlay.style.display = 'none';
        btn.style.display = '';
        isOpen = false;
        // Restore emergency strip
        const emergency = document.getElementById('emergencyStrip');
        if (emergency) emergency.style.display = '';
    }

    // ── Render Messages ──
    function renderMessages() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        if (conversation.length === 0) {
            // Welcome message
            container.innerHTML = makeBubble('assistant',
                "Hey! I'm your AI field assistant. I can open any tool, navigate anywhere, send messages, and answer questions about your project.\n\n" +
                "Try saying:\n" +
                "• \"Open compass\" or \"Open calculator\"\n" +
                "• \"Start a new report\"\n" +
                "• \"Send message to admin: running late\"\n" +
                "• \"Check messages\"\n\n" +
                "Say \"help\" for the full list!");
            return;
        }

        container.innerHTML = conversation.map(m => makeBubble(m.role, m.content)).join('');
    }

    function makeBubble(role, text) {
        const isUser = role === 'user';
        const align = isUser ? 'flex-end' : 'flex-start';
        const bg = isUser ? '#1e3a5f' : '#f1f5f9';
        const color = isUser ? '#fff' : '#1e293b';
        const radius = isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px';
        // Convert newlines to <br>
        const html = escapeHtml(text).replace(/\n/g, '<br>');
        return `<div style="display:flex;justify-content:${align};">
            <div style="background:${bg};color:${color};padding:12px 16px;border-radius:${radius};
                max-width:85%;font-size:14px;line-height:1.5;white-space:pre-wrap;">${html}</div>
        </div>`;
    }

    function addBubble(role, text) {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        container.insertAdjacentHTML('beforeend', makeBubble(role, text));
        const scroll = document.getElementById('aiChatScroll');
        scroll.scrollTop = scroll.scrollHeight;
    }

    function addLoadingBubble() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;
        container.insertAdjacentHTML('beforeend',
            `<div id="aiLoadingBubble" style="display:flex;justify-content:flex-start;">
                <div style="background:#f1f5f9;color:#94a3b8;padding:12px 16px;border-radius:16px 16px 16px 4px;
                    font-size:14px;">
                    <i class="fas fa-circle-notch fa-spin"></i> Thinking...
                </div>
            </div>`);
        const scroll = document.getElementById('aiChatScroll');
        scroll.scrollTop = scroll.scrollHeight;
    }

    function removeLoadingBubble() {
        document.getElementById('aiLoadingBubble')?.remove();
    }

    // ── Send Message ──
    async function sendMessage() {
        const input = document.getElementById('aiChatInput');
        const text = input.value.trim();
        if (!text || isProcessing) return;

        input.value = '';
        isProcessing = true;

        // Add user message
        conversation.push({ role: 'user', content: text, ts: Date.now() });
        addBubble('user', text);
        saveConversation();

        // Check for local commands first (returns false if not a command)
        const localResponse = handleLocalCommand(text);
        if (localResponse !== false) {
            if (localResponse) {  // Non-empty string = show response bubble
                conversation.push({ role: 'assistant', content: localResponse, ts: Date.now() });
                addBubble('assistant', localResponse);
                saveConversation();
            }
            // Empty string or '' = handled internally (clear chat, help)
            isProcessing = false;
            return;
        }

        // Call AI webhook
        addLoadingBubble();

        try {
            const response = await callAIWebhook(text);
            removeLoadingBubble();
            conversation.push({ role: 'assistant', content: response, ts: Date.now() });
            addBubble('assistant', response);
            saveConversation();
        } catch (err) {
            removeLoadingBubble();
            const errMsg = 'Sorry, I had trouble processing that. ' + (navigator.onLine ? 'Please try again.' : 'You appear to be offline.');
            conversation.push({ role: 'assistant', content: errMsg, ts: Date.now() });
            addBubble('assistant', errMsg);
            saveConversation();
        }

        isProcessing = false;
    }

    // ── Help / Feature List ──
    function showHelp() {
        const helpText = "Here's what I can do:\n\n" +
            "📋 Reports:\n" +
            "• \"Start a new report\" / \"New report\"\n" +
            "• \"Edit report\" / \"Continue report\"\n" +
            "• \"Open archives\" / \"Past reports\"\n" +
            "• \"Final review\" / \"Preview report\"\n\n" +
            "🧰 Field Tools:\n" +
            "• \"Open compass\" / \"Open calculator\"\n" +
            "• \"Open level\" / \"Open slope meter\"\n" +
            "• \"Open measure\" / \"AR tape\"\n" +
            "• \"Open QR scanner\" / \"Timer\"\n" +
            "• \"Decibel meter\" / \"Flashlight\"\n\n" +
            "🗺️ Maps:\n" +
            "• \"Open map\" / \"Weather radar\"\n" +
            "• \"FAA map\" / \"Satellite view\"\n" +
            "• \"Topo map\" / \"Flood zones\"\n" +
            "• \"Soil map\" / \"Parcels\" / \"Traffic\"\n\n" +
            "📍 Navigation:\n" +
            "• \"Home\" / \"Dashboard\"\n" +
            "• \"My profile\" / \"Settings\"\n" +
            "• \"New project\" / \"Manage projects\"\n" +
            "• \"Open admin\" / \"Admin dashboard\"\n" +
            "• \"Check weather\" / \"Drone ops\"\n" +
            "• \"Emergency info\"\n\n" +
            "💬 Messaging:\n" +
            "• \"Send message to admin: running late\"\n" +
            "• \"Message team: concrete pour done\"\n" +
            "• \"Tell admin: need materials\"\n" +
            "• \"Check messages\" / \"My messages\"\n\n" +
            "🤖 AI-Powered:\n" +
            "• Ask about your project or reports\n" +
            "• \"What work was done yesterday?\"\n" +
            "• \"Summarize this week\"\n\n" +
            "🔧 Utilities:\n" +
            "• \"New chat\" — clear conversation\n" +
            "• \"Help\" — show this message";

        conversation.push({ role: 'assistant', content: helpText, ts: Date.now() });
        addBubble('assistant', helpText);
        saveConversation();
    }

    // ── Local Commands (no API needed) ──
    function handleLocalCommand(text) {
        const lower = text.toLowerCase().trim();

        // ── Chat management ──
        if (lower.includes('clear chat') || lower.includes('clear conversation') || lower.includes('start new chat') || lower.includes('new chat') || lower.includes('reset chat')) {
            conversation = [];
            saveConversation();
            renderMessages();
            return ''; // Handled internally — don't add a bubble
        }
        if (lower === 'help' || lower === 'what can you do' || lower.includes('what can you do')) {
            showHelp();
            return ''; // Handled internally — showHelp adds the bubble
        }

        // ── Page Navigation commands ──
        if (lower.includes('new report') || lower.includes('start a report') || lower.includes('begin report') || lower.includes('start report')) {
            setTimeout(() => window.location.href = 'quick-interview.html', 500);
            return "Starting a new report! Redirecting you to the interview page...";
        }
        if (lower.includes('edit report') || lower.includes('continue report') || lower.includes('current report') || lower.includes('open report')) {
            setTimeout(() => window.location.href = 'report.html', 500);
            return "Opening the report editor...";
        }
        if (lower.includes('final review') || lower.includes('preview report') || lower.includes('review report')) {
            setTimeout(() => window.location.href = 'report.html?tab=preview', 500);
            return "Opening the report preview...";
        }
        if (lower.includes('my profile') || lower.includes('open settings') || lower.includes('go to settings') || lower.includes('user settings') || lower.includes('my settings')) {
            setTimeout(() => window.location.href = 'settings.html', 500);
            return "Opening your profile & settings...";
        }
        if (lower.includes('new project') || lower.includes('add project') || lower.includes('create project') || lower.includes('project config') || lower.includes('configure project')) {
            setTimeout(() => window.location.href = 'project-config.html', 500);
            return "Opening project configuration...";
        }
        if (lower.includes('manage project') || lower.includes('project settings') || lower.includes('project list') || lower.includes('my projects') || lower.includes('open project')) {
            setTimeout(() => window.location.href = 'projects.html', 500);
            return "Opening project manager...";
        }
        if (lower.includes('open archives') || lower.includes('past reports') || lower.includes('report history') || lower.includes('old reports') || lower.includes('submitted reports')) {
            setTimeout(() => window.location.href = 'archives.html', 500);
            return "Opening report archives...";
        }
        if (lower.includes('admin') || lower.includes('admin dashboard') || lower.includes('admin panel') || lower.includes('system health')) {
            setTimeout(() => window.location.href = 'admin.html', 500);
            return "Opening admin dashboard...";
        }
        if (lower === 'home' || lower === 'go home' || lower === 'dashboard' || lower === 'main' || lower === 'go to dashboard' || lower.includes('go home') || lower.includes('go to home')) {
            setTimeout(() => window.location.href = 'index.html', 500);
            return "Going to the dashboard...";
        }

        // ── Field Tools (on index.html) ──
        // If we're on index.html, call the function directly. Otherwise, redirect with ?openTool=
        const isOnDashboard = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');

        // Compass
        if (lower.includes('compass') || lower.includes('bearing') || lower.includes('heading') || lower.includes('north')) {
            if (isOnDashboard && typeof openCompass === 'function') {
                closeAssistant();
                setTimeout(() => openCompass(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=compass', 500);
            }
            return "🧭 Opening compass...";
        }

        // Calculator
        if (lower.includes('calculator') || lower.includes('calc') || (lower.includes('calculate') && !lower.includes('slope'))) {
            if (isOnDashboard && typeof openCalc === 'function') {
                closeAssistant();
                setTimeout(() => openCalc(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=calc', 500);
            }
            return "🔢 Opening construction calculator...";
        }

        // Level
        if (lower.includes('level') || lower.includes('inclinometer') || lower.includes('bubble level')) {
            if (isOnDashboard && typeof openLevel === 'function') {
                closeAssistant();
                setTimeout(() => openLevel(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=level', 500);
            }
            return "📐 Opening level...";
        }

        // Slope / Grade
        if (lower.includes('slope') || lower.includes('grade meter') || lower.includes('grade tool') || lower.includes('slope meter')) {
            if (isOnDashboard && typeof openSlope === 'function') {
                closeAssistant();
                setTimeout(() => openSlope(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=slope', 500);
            }
            return "📏 Opening slope & grade tool...";
        }

        // Weather Radar / Maps
        if (lower.includes('weather radar') || lower.includes('radar map')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('weather'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=weather', 500);
            }
            return "🌧️ Opening weather radar...";
        }
        if (lower.includes('faa map') || lower.includes('airspace') || lower.includes('flight map')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('airspace'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=airspace', 500);
            }
            return "✈️ Opening FAA airspace map...";
        }
        if (lower.includes('satellite') || lower.includes('satellite view') || lower.includes('aerial view')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('satellite'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=satellite', 500);
            }
            return "🛰️ Opening satellite view...";
        }
        if (lower.includes('topo') || lower.includes('topograph')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('topo'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=topo', 500);
            }
            return "🏔️ Opening topo map...";
        }
        if (lower.includes('flood') || lower.includes('flood map') || lower.includes('flood zone')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('flood'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=flood', 500);
            }
            return "🌊 Opening flood zone map...";
        }
        if (lower.includes('soil') || lower.includes('soil map')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('soils'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=soils', 500);
            }
            return "🏗️ Opening soils map...";
        }
        if (lower.includes('parcel') || lower.includes('property line') || lower.includes('lot line')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('parcels'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=parcels', 500);
            }
            return "📍 Opening parcel/property map...";
        }
        if (lower.includes('traffic') || lower.includes('traffic map')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => { openMapsOverlay(); switchMap('traffic'); }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps&mapType=traffic', 500);
            }
            return "🚦 Opening traffic map...";
        }
        // General map request
        if ((lower.includes('map') || lower.includes('show me the map') || lower.includes('open map')) && !lower.includes('photo')) {
            if (isOnDashboard && typeof openMapsOverlay === 'function') {
                closeAssistant();
                setTimeout(() => openMapsOverlay(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=maps', 500);
            }
            return "🗺️ Opening maps...";
        }

        // QR Scanner
        if (lower.includes('qr') || lower.includes('scan') || lower.includes('barcode')) {
            if (isOnDashboard && typeof openQR === 'function') {
                closeAssistant();
                setTimeout(() => openQR(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=qr', 500);
            }
            return "📷 Opening QR scanner...";
        }

        // Distance Measure
        if (lower.includes('distance') || lower.includes('measure') || lower.includes('tape measure')) {
            if (isOnDashboard && typeof openMeasure === 'function') {
                closeAssistant();
                setTimeout(() => openMeasure(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=measure', 500);
            }
            return "📏 Opening distance measurement tool...";
        }

        // AR Measure
        if (lower.includes('ar ') || lower.includes('augmented reality') || lower.includes('ar tape') || lower.includes('ar measure')) {
            if (isOnDashboard && typeof openARMeasure === 'function') {
                closeAssistant();
                setTimeout(() => openARMeasure(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=ar', 500);
            }
            return "📸 Opening AR measurement tool...";
        }

        // Decibel Meter
        if (lower.includes('decibel') || lower.includes('db meter') || lower.includes('noise') || lower.includes('sound level') || lower.includes('sound meter')) {
            if (isOnDashboard && typeof openDecibel === 'function') {
                closeAssistant();
                setTimeout(() => openDecibel(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=decibel', 500);
            }
            return "🔊 Opening decibel meter...";
        }

        // Timer / Stopwatch
        if (lower.includes('timer') || lower.includes('stopwatch') || lower.includes('countdown')) {
            if (isOnDashboard && typeof openTimer === 'function') {
                closeAssistant();
                setTimeout(() => openTimer(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=timer', 500);
            }
            return "⏱️ Opening timer...";
        }

        // Flashlight
        if (lower.includes('flashlight') || lower.includes('light') || lower.includes('torch')) {
            if (isOnDashboard && typeof openFlashlight === 'function') {
                closeAssistant();
                setTimeout(() => openFlashlight(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=flashlight', 500);
            }
            return "🔦 Opening flashlight...";
        }

        // Drone Ops
        if (lower.includes('drone') || lower.includes('uav') || lower.includes('flight status') || lower.includes('drone ops')) {
            if (isOnDashboard) {
                closeAssistant();
                setTimeout(() => {
                    var droneHeader = document.querySelector('[onclick*="droneOpsPanel"]');
                    if (droneHeader) droneHeader.click();
                    droneHeader && droneHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openPanel=droneOpsPanel', 500);
            }
            return "🚁 Opening drone operations info...";
        }

        // Weather (not radar, just weather info)
        if (lower.includes('weather') || lower.includes('forecast') || lower.includes('temperature') || lower.includes('check weather')) {
            if (isOnDashboard) {
                closeAssistant();
                setTimeout(() => {
                    var weatherHeader = document.querySelector('[onclick*="weatherDetailsPanel"]');
                    if (weatherHeader) weatherHeader.click();
                    weatherHeader && weatherHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openPanel=weatherDetailsPanel', 500);
            }
            return "🌤️ Opening weather details...";
        }

        // Emergency Info
        if (lower.includes('emergency') || lower.includes('911') || lower.includes('first aid') || lower.includes('safety info') || lower.includes('emergency info')) {
            if (isOnDashboard) {
                closeAssistant();
                setTimeout(() => {
                    var strip = document.getElementById('emergencyStrip');
                    if (strip) strip.click();
                }, 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openPanel=emergencyPanel', 500);
            }
            return "🚨 Opening emergency info...";
        }

        // Field Tools grid
        if (lower.includes('tools') || lower.includes('field tools') || lower.includes('open tools') || lower.includes('toolbox')) {
            if (isOnDashboard && typeof openFieldToolsModal === 'function') {
                closeAssistant();
                setTimeout(() => openFieldToolsModal(), 300);
            } else {
                setTimeout(() => window.location.href = 'index.html?openTool=fieldtools', 500);
            }
            return "🧰 Opening field tools...";
        }

        return false; // Not a local command → send to AI webhook
    }

    // ── AI Webhook ──
    async function callAIWebhook(userMessage) {
        // Build context
        const projectData = getProjectContext();
        const recentHistory = conversation.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        const payload = {
            message: userMessage,
            history: recentHistory,
            context: {
                currentPage: window.location.pathname,
                projectName: projectData?.projectName || null,
                projectId: projectData?.id || null,
                reportDate: new Date().toISOString().split('T')[0],
                deviceId: localStorage.getItem('fvp_device_id') || null
            }
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        try {
            const res = await fetch(AI_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data.response || data.message || data.text || 'I got a response but couldn\'t parse it.';
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw err;
        }
    }

    // ── Project Context Helper ──
    function getProjectContext() {
        try {
            const pid = localStorage.getItem('fvp_active_project');
            if (!pid) return null;
            // Try to find project data in any localStorage key
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.includes('project')) {
                    try {
                        const val = JSON.parse(localStorage.getItem(key));
                        if (val && val.id === pid) return val;
                    } catch (e) {}
                }
            }
            return { id: pid };
        } catch (e) {
            return null;
        }
    }

    // ── Persistence ──
    function loadConversation() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const msgs = JSON.parse(raw);
            return Array.isArray(msgs) ? msgs.slice(-MAX_HISTORY) : [];
        } catch (e) {
            return [];
        }
    }

    function saveConversation() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation.slice(-MAX_HISTORY)));
        } catch (e) {}
    }

    // ── Utilities ──
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Init ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectUI);
    } else {
        injectUI();
    }

    // Expose for other scripts
    window.openAIAssistant = openAssistant;
    window.closeAIAssistant = closeAssistant;

})();
