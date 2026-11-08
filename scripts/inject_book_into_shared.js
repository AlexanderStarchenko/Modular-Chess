const fs = require('fs');
const path = require('path');

const bookPath = path.join(__dirname, 'generated_book.json');
const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8'));

const sharedPaths = [
    path.join(__dirname, '..', 'js', 'ai_shared.js'),
    path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'public', 'js', 'ai_shared.js')
];

const startMarker = '    const ChessOpeningBook = {';
const endMarker = '};\n\n    const ChessEndgameTablebase = {';

const bookJsonFormatted = JSON.stringify(bookData, null, 4)
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .trim();

const replacement = `    const ChessOpeningBook = {\n        ${bookJsonFormatted.split('\n').join('\n        ')}\n    };\n\n    const ChessEndgameTablebase = {`;

sharedPaths.forEach(targetPath => {
    if (!fs.existsSync(targetPath)) return;
    let content = fs.readFileSync(targetPath, 'utf-8');
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
        console.error(`Could not locate markers in ${targetPath}`);
        return;
    }

    const newContent = content.slice(0, startIdx) + replacement + content.slice(endIdx + endMarker.length);
    fs.writeFileSync(targetPath, newContent, 'utf-8');
    console.log(`Successfully updated ChessOpeningBook in ${targetPath} (${Object.keys(bookData).length} positions)`);
});
