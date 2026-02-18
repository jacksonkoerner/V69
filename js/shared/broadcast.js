(function() {
    'use strict';

    var fvpChannel = null;

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            fvpChannel = new BroadcastChannel('fieldvoice-sync');
        }
    } catch (e) {
        console.warn('[broadcast] BroadcastChannel not supported:', e && e.message ? e.message : e);
    }

    function send(message) {
        if (!fvpChannel) return;
        try {
            fvpChannel.postMessage(message);
        } catch (e) {
            console.warn('[broadcast] send failed:', e && e.message ? e.message : e);
        }
    }

    function listen(handler) {
        if (!fvpChannel || typeof handler !== 'function') return;
        fvpChannel.onmessage = function(event) {
            try {
                handler(event.data);
            } catch (e) {
                console.warn('[broadcast] listener failed:', e && e.message ? e.message : e);
            }
        };
    }

    function close() {
        if (!fvpChannel) return;
        try {
            fvpChannel.close();
        } catch (e) {
            // Ignore
        }
        fvpChannel = null;
    }

    window.fvpBroadcast = {
        send: send,
        listen: listen,
        close: close
    };
})();
