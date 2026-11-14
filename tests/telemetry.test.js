describe('ChessTelemetry Client', () => {
    const originalWindow = global.window;
    const originalNavigator = global.navigator;
    const originalFetch = global.fetch;
    const originalMobileConfig = global.MobileConfig;
    const originalBlob = global.Blob;

    function loadTelemetry() {
        let mod;
        jest.isolateModules(() => {
            mod = require('../js/telemetry.js');
        });
        return mod;
    }

    afterEach(() => {
        global.window = originalWindow;
        global.navigator = originalNavigator;
        global.fetch = originalFetch;
        global.MobileConfig = originalMobileConfig;
        global.Blob = originalBlob;
    });

    test('deduplicates repeated error signatures and rate-limits error storms', () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
        global.window = {
            location: { protocol: 'http:', origin: 'http://localhost:5000', hostname: 'localhost' },
            addEventListener: jest.fn()
        };
        global.navigator = { userAgent: 'Jest' };

        const telemetry = loadTelemetry();

        // Same error signature repeated 5 times -> sent only once
        for (let i = 0; i < 5; i++) {
            telemetry.logError('Render loop boom', 'board.js', 10, 4, new Error('Render loop boom'));
        }
        expect(global.fetch).toHaveBeenCalledTimes(1);

        // Distinct errors beyond MAX_ERRORS_PER_MINUTE (12) -> capped at 12 total
        for (let i = 0; i < 20; i++) {
            telemetry.logError(`Unique err ${i}`, 'app.js', i, 1);
        }
        expect(global.fetch).toHaveBeenCalledTimes(12);
    });

    test('handles prototype-less objects in logPromiseRejection without crashing and handles circular/BigInt safely', () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
        global.window = {
            location: { protocol: 'http:', origin: 'http://localhost:5000', hostname: 'localhost' }
        };
        global.navigator = { userAgent: 'Jest' };

        const telemetry = loadTelemetry();

        const nullProto = Object.create(null);
        expect(() => telemetry.logPromiseRejection(nullProto)).not.toThrow();

        const nullProtoWithMsg = Object.create(null);
        nullProtoWithMsg.reason = 'custom';
        expect(() => telemetry.logPromiseRejection(nullProtoWithMsg)).not.toThrow();

        const circular = { type: 'event' };
        circular.self = circular;
        circular.big = BigInt(42);
        expect(() => telemetry.logEvent('test', 'circular', circular)).not.toThrow();
        expect(global.fetch).toHaveBeenCalled();
    });

    test('truncates long message/stack strings and respects keepalive byte limit', () => {
        const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
        global.fetch = fetchMock;
        global.window = {
            location: { protocol: 'http:', origin: 'http://localhost:5000', hostname: 'localhost' }
        };
        global.navigator = { userAgent: 'Jest' };

        const telemetry = loadTelemetry();
        const hugeMsg = 'M'.repeat(2000);
        const hugeStack = 'S'.repeat(10000);

        telemetry.logError(hugeMsg, 'file.js', 1, 1, { stack: hugeStack });

        const [, opts] = fetchMock.mock.calls[0];
        const parsed = JSON.parse(opts.body);
        expect(parsed.message.length).toBeLessThanOrEqual(503);
        expect(parsed.stack.length).toBeLessThanOrEqual(3003);
        expect(opts.keepalive).toBe(true);
    });

    test('does not use sendBeacon on file:// cross-origin protocol even if available', () => {
        const sendBeaconMock = jest.fn(() => true);
        const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
        global.fetch = fetchMock;
        global.Blob = class MockBlob {};
        global.window = {
            location: { protocol: 'file:', origin: 'file://', hostname: '' }
        };
        global.navigator = { userAgent: 'Electron', sendBeacon: sendBeaconMock };

        const telemetry = loadTelemetry();
        telemetry.logEvent('app', 'open');

        expect(sendBeaconMock).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('does not throw when navigator is undefined, strips trailing slash, and waits for MobileConfig', () => {
        global.navigator = undefined;
        global.MobileConfig = undefined;
        global.window = {
            Capacitor: {},
            location: { protocol: 'capacitor:', origin: 'capacitor://localhost', hostname: 'localhost' }
        };

        const telemetry = loadTelemetry();
        // Early call before MobileConfig loads returns fallback without permanently caching it
        expect(telemetry.getBaseUrl()).toBe('http://10.0.2.2:3000');

        global.MobileConfig = { serverUrl: 'https://api.example.com///' };
        expect(telemetry.getBaseUrl()).toBe('https://api.example.com');
    });

    test('prevents payload from overwriting system client/userAgent fields and attaches timestamp', () => {
        const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
        global.fetch = fetchMock;
        global.window = {
            location: { protocol: 'http:', origin: 'http://localhost:5000', hostname: 'localhost' }
        };
        global.navigator = { userAgent: 'RealAgent/1.0' };

        const telemetry = loadTelemetry();
        telemetry.logEvent('cat', 'act', { client: 'spoofed', userAgent: 'Fake/0.0' });

        // Also test via direct label and verify system fields stay intact
        const [, opts] = fetchMock.mock.calls[0];
        const parsed = JSON.parse(opts.body);
        expect(typeof parsed.timestamp).toBe('number');
        expect(parsed.userAgent).toBe('RealAgent/1.0');
        expect(['web', 'electron', 'mobile']).toContain(parsed.client);
    });

    test('falls back to localhost:5000 when location.origin is literal "null" (opaque/sandboxed origin)', () => {
        global.window = {
            location: { protocol: 'about:', origin: 'null', hostname: '' }
        };
        global.navigator = { userAgent: 'Jest' };

        const telemetry = loadTelemetry();
        expect(telemetry.getBaseUrl()).toBe('http://localhost:5000');
    });
});
