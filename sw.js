const CACHE_NAME = 'modular-chess-v39';
const ASSETS = [
    './',
    'index.html',
    'css/output.css?v=39',
    'js/logic.js?v=39',
    'js/ai_shared.js?v=39',
    'js/ai_easy.js?v=39',
    'js/ai_medium.js?v=39',
    'js/ai_hard.js?v=39',
    'js/ai_very_hard.js?v=39',
    'js/ai_unreal.js?v=39',
    'js/analysis_manager.js?v=39',
    'js/wasm_loader.js?v=39',
    'js/stockfish.js?v=39',
    'build/release.wasm',
    'js/network.js?v=39',
    'js/transport_socket.js?v=39',
    'js/ui.js?v=39'
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
