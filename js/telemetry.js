/**
 * Chess Telemetry Client
 */
const ChessTelemetry = (() => {
    let serverUrl = '';

    function getBaseUrl() {
        if (serverUrl) return serverUrl;

        // Detect environment
        const loc = (typeof window !== 'undefined' && window.location) || {};
        const protocol = loc.protocol || '';
        const origin = loc.origin || '';
        const hostname = loc.hostname || '';

        const isMobileApp = typeof window !== 'undefined' && (
            !!window.Capacitor || 
            protocol === 'capacitor:' || 
            origin.startsWith('capacitor://') ||
            (hostname === 'localhost' && /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent))
        );

        if (isMobileApp) {
            if (typeof MobileConfig !== 'undefined' && MobileConfig.serverUrl) {
                serverUrl = MobileConfig.serverUrl;
            } else {
                // Default fallback IP for Android Emulator
                serverUrl = 'http://10.0.2.2:3000';
            }
        } else if (protocol === 'file:') {
            serverUrl = 'http://localhost:3000';
        } else {
            // Web / Electron running on localhost
            serverUrl = origin || 'http://localhost:3000';
        }

        return serverUrl;
    }

    function send(payload) {
        const url = `${getBaseUrl()}/api/telemetry`;
        const body = JSON.stringify({
            client: typeof window !== 'undefined' && window.Capacitor ? 'mobile' : (typeof process !== 'undefined' && process.versions && process.versions.electron ? 'electron' : 'web'),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            ...payload
        });

        // Use sendBeacon if available and not on mobile (since sendBeacon doesn't always support custom CORS/headers cleanly on capacitor), otherwise use fetch
        if (typeof navigator !== 'undefined' && navigator.sendBeacon && !window.Capacitor) {
            try {
                const blob = new Blob([body], { type: 'application/json' });
                if (navigator.sendBeacon(url, blob)) return;
            } catch (e) {
                // Fallback to fetch
            }
        }

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: body,
            keepalive: true
        }).catch((err) => {
            // Silent catch to prevent logging infinite loops
            console.warn('[Telemetry] Failed to transmit:', err.message);
        });
    }

    function logError(message, source, lineno, colno, error) {
        send({
            type: 'error',
            message: message,
            source: source,
            line: lineno,
            col: colno,
            stack: error && error.stack ? error.stack : ''
        });
    }

    function logPromiseRejection(reason) {
        send({
            type: 'promise_rejection',
            message: reason ? (reason.message || String(reason)) : 'Unknown rejection',
            stack: reason && reason.stack ? reason.stack : ''
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

    // Setup global listeners
    if (typeof window !== 'undefined') {
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
        getBaseUrl
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessTelemetry;
}
