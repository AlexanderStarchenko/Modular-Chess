/**
 * Chess Telemetry Client
 */
const ChessTelemetry = (() => {
    let serverUrl = '';

    const MAX_ERRORS_PER_MINUTE = 12;
    const RATE_WINDOW_MS = 60000;
    const MAX_SIGNATURES = 200;
    const MAX_MESSAGE_LEN = 500;
    const MAX_STACK_LEN = 3000;
    const MAX_KEEPALIVE_BYTES = 60000;

    let errorWindowStart = Date.now();
    let errorCountInWindow = 0;
    const sentErrorSignatures = new Set();

    function stripTrailingSlashes(url) {
        return typeof url === 'string' ? url.replace(/\/+$/, '') : '';
    }

    function safeToString(val, fallback = '') {
        if (val === null || val === undefined) return fallback;
        if (typeof val === 'string') return val;
        try {
            return String(val);
        } catch (e) {
            try {
                return Object.prototype.toString.call(val);
            } catch (_) {
                return fallback || '[Unserializable]';
            }
        }
    }

    function truncate(str, maxLen) {
        const s = safeToString(str, '');
        if (s.length <= maxLen) return s;
        return s.slice(0, maxLen) + '...';
    }

    function safeJsonStringify(obj) {
        try {
            const seen = new WeakSet();
            return JSON.stringify(obj, (key, value) => {
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                if (typeof value === 'object' && value !== null) {
                    if (seen.has(value)) return '[Circular]';
                    seen.add(value);
                }
                return value;
            });
        } catch (e) {
            return null;
        }
    }

    function getByteLength(str) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(str).length;
        }
        return str.length * 3;
    }

    function shouldAllowError(signature) {
        const now = Date.now();
        if (now - errorWindowStart >= RATE_WINDOW_MS) {
            errorWindowStart = now;
            errorCountInWindow = 0;
            sentErrorSignatures.clear();
        }

        if (errorCountInWindow >= MAX_ERRORS_PER_MINUTE) {
            return false;
        }

        if (signature && sentErrorSignatures.has(signature)) {
            return false;
        }

        if (signature) {
            if (sentErrorSignatures.size >= MAX_SIGNATURES) {
                const oldest = sentErrorSignatures.values().next().value;
                sentErrorSignatures.delete(oldest);
            }
            sentErrorSignatures.add(signature);
        }

        errorCountInWindow++;
        return true;
    }

    function getBaseUrl() {
        if (serverUrl) return serverUrl;

        const loc = (typeof window !== 'undefined' && window.location) || {};
        const protocol = loc.protocol || '';
        const origin = loc.origin || '';
        const hostname = loc.hostname || '';
        const ua = (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') ? navigator.userAgent : '';

        const isMobileApp = typeof window !== 'undefined' && (
            !!window.Capacitor ||
            protocol === 'capacitor:' ||
            origin.startsWith('capacitor://') ||
            (hostname === 'localhost' && /Android|webOS|iPhone|iPad|iPod/i.test(ua))
        );

        if (isMobileApp) {
            if (typeof MobileConfig !== 'undefined' && MobileConfig.serverUrl) {
                serverUrl = stripTrailingSlashes(String(MobileConfig.serverUrl));
                return serverUrl;
            }
            // Do not permanently cache fallback before MobileConfig loads
            return 'http://10.0.2.2:3000';
        }

        if (protocol === 'file:') {
            serverUrl = 'http://localhost:5000';
        } else {
            const validOrigin = (origin && origin !== 'null') ? stripTrailingSlashes(origin) : '';
            serverUrl = validOrigin || 'http://localhost:5000';
        }

        return serverUrl;
    }

    function send(payload) {
        const baseUrl = getBaseUrl();
        const url = `${baseUrl}/api/telemetry`;
        const safePayload = (payload && typeof payload === 'object') ? { ...payload } : {};

        if (safePayload.message !== undefined) safePayload.message = truncate(safePayload.message, MAX_MESSAGE_LEN);
        if (safePayload.stack !== undefined) safePayload.stack = truncate(safePayload.stack, MAX_STACK_LEN);
        if (safePayload.source !== undefined) safePayload.source = truncate(safePayload.source, MAX_MESSAGE_LEN);
        if (safePayload.category !== undefined) safePayload.category = truncate(safePayload.category, MAX_MESSAGE_LEN);
        if (safePayload.action !== undefined) safePayload.action = truncate(safePayload.action, MAX_MESSAGE_LEN);
        if (safePayload.label !== undefined) safePayload.label = truncate(safePayload.label, MAX_MESSAGE_LEN);

        const body = safeJsonStringify({
            ...safePayload,
            timestamp: Date.now(),
            client: typeof window !== 'undefined' && window.Capacitor
                ? 'mobile'
                : (typeof process !== 'undefined' && process.versions && process.versions.electron ? 'electron' : 'web'),
            userAgent: (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string')
                ? navigator.userAgent
                : 'unknown'
        });

        if (!body) return;

        const withinKeepaliveLimit = getByteLength(body) <= MAX_KEEPALIVE_BYTES;
        const isCapacitor = typeof window !== 'undefined' && !!window.Capacitor;
        const isSameOrigin = typeof window !== 'undefined' && window.location && window.location.origin === baseUrl;

        // Only use sendBeacon for same-origin web requests within the 64 KB limit
        if (
            withinKeepaliveLimit &&
            isSameOrigin &&
            !isCapacitor &&
            typeof navigator !== 'undefined' &&
            typeof navigator.sendBeacon === 'function' &&
            typeof Blob !== 'undefined'
        ) {
            try {
                const blob = new Blob([body], { type: 'application/json' });
                if (navigator.sendBeacon(url, blob)) return;
            } catch (e) {
                // Fallback to fetch
            }
        }

        if (typeof fetch !== 'function') return;

        try {
            const req = fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body,
                keepalive: withinKeepaliveLimit
            });
            if (req && typeof req.catch === 'function') {
                req.catch((err) => {
                    // Silent catch to prevent logging infinite loops
                    console.warn('[Telemetry] Failed to transmit:', err && err.message ? err.message : err);
                });
            }
        } catch (e) {
            // Silent catch for synchronous fetch errors
        }
    }

    function logError(message, source, lineno, colno, error) {
        const msgStr = truncate(safeToString(message, 'Unknown error'), MAX_MESSAGE_LEN);
        const srcStr = truncate(safeToString(source, ''), MAX_MESSAGE_LEN);
        const signature = `err:${msgStr}:${srcStr}:${lineno || 0}:${colno || 0}`;
        if (!shouldAllowError(signature)) return;

        send({
            type: 'error',
            message: msgStr,
            source: srcStr,
            line: lineno,
            col: colno,
            stack: error && error.stack ? truncate(safeToString(error.stack, ''), MAX_STACK_LEN) : ''
        });
    }

    function logPromiseRejection(reason) {
        let msg = 'Unknown rejection';
        if (reason !== null && reason !== undefined) {
            if (typeof reason === 'object') {
                if (typeof reason.message === 'string' && reason.message) {
                    msg = reason.message;
                } else {
                    const serialized = safeJsonStringify(reason);
                    msg = serialized || safeToString(reason, 'Unknown rejection');
                }
            } else {
                msg = safeToString(reason, 'Unknown rejection');
            }
        }

        const msgStr = truncate(msg, MAX_MESSAGE_LEN);
        const stackStr = (reason && typeof reason === 'object' && reason.stack)
            ? truncate(safeToString(reason.stack, ''), MAX_STACK_LEN)
            : '';
        const firstStackLine = stackStr ? stackStr.split('\n')[0] : '';
        const signature = `rej:${msgStr}:${firstStackLine}`;
        if (!shouldAllowError(signature)) return;

        send({
            type: 'promise_rejection',
            message: msgStr,
            stack: stackStr
        });
    }

    function logEvent(category, action, label = '', value = 0) {
        send({
            type: 'event',
            category,
            action,
            label,
            value
        });
    }

    function resetLimits() {
        errorWindowStart = Date.now();
        errorCountInWindow = 0;
        sentErrorSignatures.clear();
        serverUrl = '';
    }

    // Setup global listeners
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('error', (event) => {
            logError(event.message, event.filename, event.lineno, event.colno, event.error);
        });

        window.addEventListener('unhandledrejection', (event) => {
            logPromiseRejection(event.reason);
        });
    }

    return {
        logError,
        logPromiseRejection,
        logEvent,
        getBaseUrl,
        resetLimits
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessTelemetry;
}
