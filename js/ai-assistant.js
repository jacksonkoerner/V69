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
        // Floating button
        const btn = document.createElement('div');
        btn.id = 'aiAssistantBtn';
        btn.innerHTML = `
            <div style="width:56px;height:56px;border-radius:50%;background:#1e3a5f;color:#fff;
                box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;
                cursor:pointer;transition:transform 0.2s;">
                <i class="fas fa-wand-magic-sparkles" style="font-size:20px;"></i>
            </div>`;
        btn.style.cssText = 'position:fixed;z-index:90;bottom:70px;right:16px;';
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
                <button id="aiCloseBtn" style="width:44px;height:44px;display:flex;align-items:center;
                    justify-content:center;color:#fff;background:none;border:none;cursor:pointer;">
                    <i class="fas fa-times" style="font-size:18px;"></i>
                </button>
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
        btn.addEventListener('click', openAssistant);
        document.getElementById('aiCloseBtn').addEventListener('click', closeAssistant);
        document.getElementById('aiSendBtn').addEventListener('click', sendMessage);
        document.getElementById('aiChatInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Render existing conversation
        renderMessages();
    }

    // ── Open / Close ──
    function openAssistant() {
        const overlay = document.getElementById('aiAssistantOverlay');
        const btn = document.getElementById('aiAssistantBtn');
        overlay.style.display = 'flex';
        btn.style.display = 'none';
        isOpen = true;
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
    }

    // ── Render Messages ──
    function renderMessages() {
        const container = document.getElementById('aiChatMessages');
        if (!container) return;

        if (conversation.length === 0) {
            // Welcome message
            container.innerHTML = makeBubble('assistant',
                "Hey! I'm your AI field assistant. Ask me about your project, reports, or say things like:\n\n" +
                "• \"Start a new report\"\n" +
                "• \"What work was done yesterday?\"\n" +
                "• \"Summarize this week's reports\"\n" +
                "• \"What's the weather forecast?\"\n" +
                "• \"Open project settings\"");
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

        // Check for local commands first
        const localResponse = handleLocalCommand(text);
        if (localResponse) {
            conversation.push({ role: 'assistant', content: localResponse, ts: Date.now() });
            addBubble('assistant', localResponse);
            saveConversation();
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

    // ── Local Commands (no API needed) ──
    function handleLocalCommand(text) {
        const lower = text.toLowerCase().trim();

        // Navigation commands
        if (lower.includes('new report') || lower.includes('start a report') || lower.includes('begin report')) {
            setTimeout(() => window.location.href = 'quick-interview.html', 500);
            return "Starting a new report! Redirecting you to the interview page...";
        }
        if (lower.includes('open settings') || lower.includes('go to settings')) {
            setTimeout(() => window.location.href = 'settings.html', 500);
            return "Opening settings...";
        }
        if (lower.includes('open project') || lower.includes('project settings') || lower.includes('project config')) {
            setTimeout(() => window.location.href = 'projects.html', 500);
            return "Opening project settings...";
        }
        if (lower.includes('open archives') || lower.includes('past reports') || lower.includes('report history')) {
            setTimeout(() => window.location.href = 'archives.html', 500);
            return "Opening report archives...";
        }
        if (lower === 'home' || lower === 'go home' || lower === 'dashboard') {
            setTimeout(() => window.location.href = 'index.html', 500);
            return "Going to the dashboard...";
        }
        if (lower.includes('clear chat') || lower.includes('clear conversation')) {
            conversation = [];
            saveConversation();
            renderMessages();
            return null; // Don't add a message, renderMessages shows welcome
        }

        return null; // Not a local command, send to AI
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
