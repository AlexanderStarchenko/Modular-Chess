const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const {
    copyPath,
    getLocalIps,
    pickPreferredIp,
    generateMobileConfigContent,
    buildMobile
} = require('../build-mobile.js');

describe('build-mobile.js', () => {
    test('getLocalIps filters virtual adapters and supports both string "IPv4" and numeric 4', () => {
        const mockIfaces = {
            'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.25.160.1' }],
            'docker0': [{ family: 'IPv4', internal: false, address: '172.17.0.1' }],
            'VirtualBox Host-Only Network': [{ family: 4, internal: false, address: '192.168.56.1' }],
            'VMware Network Adapter VMnet1': [{ family: 'IPv4', internal: false, address: '192.168.80.1' }],
            'tun0': [{ family: 'IPv4', internal: false, address: '10.8.0.2' }],
            'Loopback Pseudo-Interface 1': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
            'Wi-Fi': [
                { family: 'IPv6', internal: false, address: 'fe80::1' },
                { family: 4, internal: false, address: '192.168.1.42' }
            ],
            'Ethernet': [{ family: 'IPv4', internal: false, address: '172.20.0.5' }]
        };

        const ips = getLocalIps(mockIfaces);
        expect(ips).toEqual(['192.168.1.42', '172.20.0.5']);
        expect(pickPreferredIp(ips)).toBe('192.168.1.42');
        expect(pickPreferredIp(['172.20.0.5'])).toBe('172.20.0.5');
        expect(pickPreferredIp([])).toBe('10.0.2.2');
    });

    test('copyPath throws clear error when source path does not exist without creating dest dir', () => {
        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'build-mobile-copy-'));
        try {
            const missingSrc = path.join(tmpBase, 'missing', 'release.wasm');
            const targetDest = path.join(tmpBase, 'out', 'build', 'release.wasm');

            expect(() => copyPath(missingSrc, targetDest)).toThrow(/Source path does not exist/);
            expect(fs.existsSync(path.dirname(targetDest))).toBe(false);
        } finally {
            fs.rmSync(tmpBase, { recursive: true, force: true });
        }
    });

    test('generateMobileConfigContent strips trailing slashes, uses JSON.stringify, and sets window/globalThis', () => {
        const code = generateMobileConfigContent('https://chess.example.com///');
        const sandbox = { window: {}, globalThis: {} };
        vm.runInNewContext(code, sandbox);

        expect(sandbox.window.MobileConfig).toEqual({ serverUrl: 'https://chess.example.com' });
        expect(sandbox.globalThis.MobileConfig).toEqual({ serverUrl: 'https://chess.example.com' });
    });

    test('buildMobile copies .onnx models and fails cleanly if build/release.wasm is missing', () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'build-mobile-e2e-'));
        const srcDir = path.join(tmpRoot, 'src');
        const destDir = path.join(tmpRoot, 'www');
        try {
            fs.mkdirSync(path.join(srcDir, 'js'), { recursive: true });
            fs.mkdirSync(path.join(srcDir, 'css'), { recursive: true });
            fs.mkdirSync(path.join(srcDir, 'build'), { recursive: true });
            fs.writeFileSync(path.join(srcDir, 'index.html'), '<html></html>');
            fs.writeFileSync(path.join(srcDir, 'js', 'app.js'), '');
            fs.writeFileSync(path.join(srcDir, 'css', 'output.css'), '');
            fs.writeFileSync(path.join(srcDir, 'modular_chess_v1.onnx'), 'onnx-bytes');

            // Missing release.wasm -> clear error
            expect(() => buildMobile({ srcDir, destDir, skipCss: true })).toThrow(/release\.wasm/);

            // With release.wasm -> succeeds and copies .onnx + writes MobileConfig
            fs.writeFileSync(path.join(srcDir, 'build', 'release.wasm'), 'wasm-bytes');
            process.env.MOBILE_SERVER_URL = 'http://192.168.0.50:5000/';
            try {
                buildMobile({ srcDir, destDir, skipCss: true });
            } finally {
                delete process.env.MOBILE_SERVER_URL;
            }

            expect(fs.existsSync(path.join(destDir, 'modular_chess_v1.onnx'))).toBe(true);
            expect(fs.existsSync(path.join(destDir, 'build', 'release.wasm'))).toBe(true);
            const mobileConfigCode = fs.readFileSync(path.join(destDir, 'js', 'mobile_config.js'), 'utf8');
            expect(mobileConfigCode).toContain('"http://192.168.0.50:5000"');
            expect(mobileConfigCode).toContain('window.MobileConfig = MobileConfig');
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
