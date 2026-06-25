const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcDir = __dirname;
const destDir = path.join(__dirname, 'www');

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        // Ensure parent directory exists
        const parent = path.dirname(dest);
        if (!fs.existsSync(parent)) {
            fs.mkdirSync(parent, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

console.log('Building mobile assets...');

// 1. Clean 'www' directory contents
if (fs.existsSync(destDir)) {
    fs.readdirSync(destDir).forEach(file => {
        fs.rmSync(path.join(destDir, file), { recursive: true, force: true });
    });
} else {
    fs.mkdirSync(destDir, { recursive: true });
}

// 2. Build CSS
console.log('Compiling CSS...');
execSync('npm run build:css', { stdio: 'inherit' });

// 3. Copy files
console.log('Copying index.html...');
fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(destDir, 'index.html'));

console.log('Copying JS directory...');
copyRecursiveSync(path.join(srcDir, 'js'), path.join(destDir, 'js'));

console.log('Copying CSS directory...');
copyRecursiveSync(path.join(srcDir, 'css'), path.join(destDir, 'css'));

console.log('Copying compiled WebAssembly Core...');
copyRecursiveSync(path.join(srcDir, 'build', 'release.wasm'), path.join(destDir, 'build', 'release.wasm'));

console.log('Mobile build complete. Assets ready in "www/" folder!');
