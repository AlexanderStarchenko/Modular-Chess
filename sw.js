const VERSION = '56';
const CACHE_NAME = `modular-chess-v${VERSION}`;

const ASSETS = [
    './',
    'index.html',
    `css/output.css?v=${VERSION}`,
    `js/telemetry.js?v=${VERSION}`,
    `js/wasm_loader.js?v=${VERSION}`,
    `js/logic.js?v=${VERSION}`,
    `js/ai_shared.js?v=${VERSION}`,
    'js/ort.min.js',
    `js/ai_neural.js?v=${VERSION}`,
    `js/ai_easy.js?v=${VERSION}`,
    `js/ai_medium.js?v=${VERSION}`,
    `js/ai_hard.js?v=${VERSION}`,
    `js/ai_very_hard.js?v=${VERSION}`,
    `js/ai_unreal.js?v=${VERSION}`,
    `js/analysis_manager.js?v=${VERSION}`,
    `js/network.js?v=${VERSION}`,
    `js/lib/binary_protocol.js?v=${VERSION}`,
    'js/lib/socket.io.min.js',
    `js/mobile_config.js?v=${VERSION}`,
    `js/transport_socket.js?v=${VERSION}`,
    `js/storage.js?v=${VERSION}`,
    `js/audio.js?v=${VERSION}`,
    `js/ai_manager.js?v=${VERSION}`,
    `js/ui.js?v=${VERSION}`,
    `js/stockfish.js?v=${VERSION}`,
    'build/release.wasm'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // Не перехватываем POST-запросы, API и трафик Socket.IO
    if (
        req.method !== 'GET' ||
        url.pathname.startsWith('/socket.io/') ||
        url.pathname.startsWith('/api/')
    ) {
        return;
    }

    event.respondWith(
        caches.match(req)
            .then(cached => cached || caches.match(req, { ignoreSearch: true }))
            .then(cached => cached || fetch(req))
    );
});
