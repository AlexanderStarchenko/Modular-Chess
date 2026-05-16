const CACHE_NAME = 'modular-chess-v31';
const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css?v=31',
    '/js/logic.js?v=31',
    '/js/ai_shared.js?v=31',
    '/js/ai_easy.js?v=31',
    '/js/ai_medium.js?v=31',
    '/js/ai_hard.js?v=31',
    '/js/ai_very_hard.js?v=31',
    '/js/ai_unreal.js?v=31',
    '/js/analysis_manager.js?v=31',
    '/js/network.js?v=31',
    '/js/transport_socket.js?v=31',
    '/js/ui.js?v=31'
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
