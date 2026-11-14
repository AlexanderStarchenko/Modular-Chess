const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const VIRTUAL_IFACE_REGEX = /docker|vbox|virtualbox|vethernet|wsl|vmware|hyper-v|loopback|tun|tap|tailscale|zerotier|hamachi|utun|wg\d*/i;

function copyPath(src, dest) {
    if (!fs.existsSync(src)) {
        throw new Error(`Source path does not exist: ${src}`);
    }
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        for (const entry of fs.readdirSync(src)) {
            copyPath(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        const parent = path.dirname(dest);
        if (!fs.existsSync(parent)) {
            fs.mkdirSync(parent, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

function getLocalIps(networkInterfaces = os.networkInterfaces()) {
    const ips = [];
    for (const [name, list] of Object.entries(networkInterfaces || {})) {
        if (VIRTUAL_IFACE_REGEX.test(name) || !Array.isArray(list)) {
            continue;
        }
        for (const iface of list) {
            const isIPv4 = iface && (iface.family === 'IPv4' || iface.family === 4);
            if (isIPv4 && !iface.internal && iface.address) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

function pickPreferredIp(ips) {
    if (!Array.isArray(ips) || ips.length === 0) return '10.0.2.2';
    // Prefer standard home/office LAN ranges before other private subnets (e.g. 172.16-31.*)
    const lanIp = ips.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'));
    return lanIp || ips[0];
}

function normalizeServerUrl(url) {
    if (typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
}

function generateMobileConfigContent(serverUrl) {
    const normalized = normalizeServerUrl(serverUrl);
    return `// Automatically generated during build. Do not modify.
const MobileConfig = {
    serverUrl: ${JSON.stringify(normalized)}
};
if (typeof window !== 'undefined') window.MobileConfig = MobileConfig;
if (typeof globalThis !== 'undefined') globalThis.MobileConfig = MobileConfig;
`;
}

function buildMobile(options = {}) {
    const srcDir = options.srcDir || __dirname;
    const destDir = options.destDir || path.join(srcDir, 'www');
    const skipCss = Boolean(options.skipCss);

    console.log('Building mobile assets...');

    // 1. Clean 'www' directory contents
    if (fs.existsSync(destDir)) {
        fs.readdirSync(destDir).forEach(file => {
            fs.rmSync(path.join(destDir, file), { recursive: true, force: true });
        });
    } else {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // 2. Build CSS anchored to srcDir so running from another cwd works reliably
    if (!skipCss) {
        console.log('Compiling CSS...');
        execSync('npm run build:css', { stdio: 'inherit', cwd: srcDir });
    }

    // 3. Copy required files
    console.log('Copying index.html...');
    copyPath(path.join(srcDir, 'index.html'), path.join(destDir, 'index.html'));

    console.log('Copying JS directory...');
    copyPath(path.join(srcDir, 'js'), path.join(destDir, 'js'));

    console.log('Copying CSS directory...');
    copyPath(path.join(srcDir, 'css'), path.join(destDir, 'css'));

    for (const dirName of ['pieces', 'sounds', 'images', 'models']) {
        const optionalSrc = path.join(srcDir, dirName);
        if (fs.existsSync(optionalSrc)) {
            console.log(`Copying ${dirName} directory...`);
            copyPath(optionalSrc, path.join(destDir, dirName));
        }
    }

    // Copy root ONNX model weights (*.onnx) unless explicitly skipped
    if (process.env.MOBILE_SKIP_ONNX !== '1') {
        const onnxFiles = fs.readdirSync(srcDir).filter(file => file.toLowerCase().endsWith('.onnx'));
        for (const onnxFile of onnxFiles) {
            console.log(`Copying ONNX model: ${onnxFile}...`);
            copyPath(path.join(srcDir, onnxFile), path.join(destDir, onnxFile));
        }
    }

    console.log('Copying compiled WebAssembly Core...');
    const wasmSrc = path.join(srcDir, 'build', 'release.wasm');
    if (!fs.existsSync(wasmSrc)) {
        throw new Error(`Compiled WebAssembly core not found at "${wasmSrc}". Please compile build/release.wasm first.`);
    }
    copyPath(wasmSrc, path.join(destDir, 'build', 'release.wasm'));

    // 4. Generate mobile config
    console.log('Generating mobile config with local IP address...');
    const localIps = getLocalIps();
    let serverUrl = process.env.MOBILE_SERVER_URL;
    if (!serverUrl) {
        const preferredIp = pickPreferredIp(localIps);
        serverUrl = `http://${preferredIp}:3000`;
    }
    const configContent = generateMobileConfigContent(serverUrl);
    fs.writeFileSync(path.join(destDir, 'js', 'mobile_config.js'), configContent);
    console.log(`Mobile config generated. Using server URL: ${normalizeServerUrl(serverUrl)}`);

    console.log('Mobile build complete. Assets ready in "www/" folder!');
}

if (require.main === module) {
    buildMobile();
}

module.exports = {
    VIRTUAL_IFACE_REGEX,
    copyPath,
    getLocalIps,
    pickPreferredIp,
    normalizeServerUrl,
    generateMobileConfigContent,
    buildMobile
};
