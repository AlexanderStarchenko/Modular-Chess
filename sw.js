const CACHE_NAME = 'modular-chess-v35';
const ASSETS = [
    '/',
    '/index.html',
    '/css/output.css?v=35',
    '/js/logic.js?v=35',
    '/js/ai_shared.js?v=35',
    '/js/ai_easy.js?v=35',
    '/js/ai_medium.js?v=35',
    '/js/ai_hard.js?v=35',
    '/js/ai_very_hard.js?v=35',
    '/js/ai_unreal.js?v=35',
    '/js/analysis_manager.js?v=35',
    '/js/wasm_loader.js?v=35',
    '/js/stockfish.js?v=35',
    '/build/release.wasm',
    '/js/network.js?v=35',
    '/js/transport_socket.js?v=35',
    '/js/ui.js?v=35'
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
