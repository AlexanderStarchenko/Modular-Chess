const CACHE_NAME = 'modular-chess-v40';
const ASSETS = [
    './',
    'index.html',
    'css/output.css?v=40',
    'js/logic.js?v=40',
    'js/ai_shared.js?v=40',
    'js/ai_easy.js?v=40',
    'js/ai_medium.js?v=40',
    'js/ai_hard.js?v=40',
    'js/ai_very_hard.js?v=40',
    'js/ai_unreal.js?v=40',
    'js/analysis_manager.js?v=40',
    'js/wasm_loader.js?v=40',
    'js/telemetry.js?v=40',
    'js/stockfish.js?v=40',
    'build/release.wasm',
    'js/network.js?v=40',
    'js/transport_socket.js?v=40',
    'js/ui.js?v=40'
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
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
