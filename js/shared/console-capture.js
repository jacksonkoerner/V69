/**
 * Console Capture — sends console.log/warn/error to Supabase debug_logs table
 * Load FIRST on every page (before all other scripts)
 * Ring buffer: keeps last 500 entries locally, flushes to Supabase in batches
 */
(function() {
    'use strict';

    var BATCH_SIZE = 10;
    var FLUSH_INTERVAL_MS = 3000;
    var MAX_MSG_LENGTH = 2000;
    var _buffer = [];
    var _page = window.location.pathname.split('/').pop() || 'unknown';
    var _deviceId = null;
    var _flushTimer = null;

    // Preserve originals
    var _origLog = console.log;
    var _origWarn = console.warn;
    var _origError = console.error;

    function _getDeviceId() {
        if (_deviceId) return _deviceId;
        try {
            _deviceId = localStorage.getItem('fvp_device_id') || 'unknown';
        } catch (e) {
            _deviceId = 'unknown';
        }
        return _deviceId;
    }

    function _serialize(args) {
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (typeof a === 'string') {
                parts.push(a);
            } else {
                try {
                    parts.push(JSON.stringify(a));
                } catch (e) {
                    parts.push(String(a));
                }
            }
        }
        var msg = parts.join(' ');
        if (msg.length > MAX_MSG_LENGTH) msg = msg.substring(0, MAX_MSG_LENGTH) + '…';
        return msg;
    }

    function _capture(level, args) {
        _buffer.push({
            level: level,
            message: _serialize(args),
            page: _page,
            device_id: _getDeviceId(),
            created_at: new Date().toISOString()
        });
        // Keep buffer bounded
        if (_buffer.length > 500) _buffer = _buffer.slice(-500);
    }

    function _flush() {
        if (_buffer.length === 0) return;
        if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) return;

        var batch = _buffer.splice(0, BATCH_SIZE);
        window.supabaseClient
            .from('debug_logs')
            .insert(batch)
            .then(function(result) {
                if (result.error) {
                    _origWarn.call(console, '[CAPTURE] flush error:', result.error.message);
                }
            })
            .catch(function() {
                // Put batch back on failure
                _buffer = batch.concat(_buffer);
                if (_buffer.length > 500) _buffer = _buffer.slice(-500);
            });
    }

    // Override console methods
    console.log = function() {
        _origLog.apply(console, arguments);
        _capture('log', arguments);
    };
    console.warn = function() {
        _origWarn.apply(console, arguments);
        _capture('warn', arguments);
    };
    console.error = function() {
        _origError.apply(console, arguments);
        _capture('error', arguments);
    };

    // Catch unhandled errors
    window.addEventListener('error', function(event) {
        _capture('error', ['[UNCAUGHT] ' + event.message + ' at ' + event.filename + ':' + event.lineno]);
    });

    window.addEventListener('unhandledrejection', function(event) {
        _capture('error', ['[UNHANDLED_PROMISE] ' + (event.reason && event.reason.message || event.reason || 'unknown')]);
    });

    // Flush on timer
    _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);

    // Flush on page hide (best effort)
    window.addEventListener('pagehide', function() { _flush(); });
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') _flush();
    });

    // Expose for manual flush/clear
    window.debugCapture = {
        flush: _flush,
        clear: function() { _buffer = []; },
        getBuffer: function() { return _buffer.slice(); }
    };
})();
