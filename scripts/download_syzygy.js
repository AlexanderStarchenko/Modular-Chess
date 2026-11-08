const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const SYZYGY_DIR = path.join(__dirname, '..', 'syzygy');
if (!fs.existsSync(SYZYGY_DIR)) {
    fs.mkdirSync(SYZYGY_DIR, { recursive: true });
}

// 3-piece Syzygy tablebases (WDL and DTZ)
const THREE_PIECE_FILES = [
    'KBvK.rtbw', 'KBvK.rtbz',
    'KNvK.rtbw', 'KNvK.rtbz',
    'KPvK.rtbw', 'KPvK.rtbz',
    'KQvK.rtbw', 'KQvK.rtbz',
    'KRvK.rtbw', 'KRvK.rtbz'
];

const BASE_URL = 'http://tablebase.sesse.net/syzygy/3-4-5/';

function downloadFile(fileName) {
    return new Promise((resolve, reject) => {
        const dest = path.join(SYZYGY_DIR, fileName);
        if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            console.log(`[Syzygy Downloader] Already exists: ${fileName} (${fs.statSync(dest).size} bytes)`);
            return resolve();
        }

        const url = BASE_URL + fileName;
        console.log(`[Syzygy Downloader] Downloading: ${fileName}...`);
        const fileStream = fs.createWriteStream(dest);

        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                fileStream.close();
                fs.unlinkSync(dest);
                return reject(new Error(`Failed to download ${fileName}: HTTP ${res.statusCode}`));
            }
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close(() => {
                    console.log(`[Syzygy Downloader] Finished: ${fileName} (${fs.statSync(dest).size} bytes)`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fileStream.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function run() {
    console.log(`Starting Syzygy 3-piece download into ${SYZYGY_DIR}...`);
    for (const f of THREE_PIECE_FILES) {
        try {
            await downloadFile(f);
        } catch (err) {
            console.error(`Error downloading ${f}:`, err.message);
        }
    }
    console.log('Syzygy download process completed successfully.');
}

if (require.main === module) {
    run();
}

module.exports = { run, THREE_PIECE_FILES, SYZYGY_DIR };
