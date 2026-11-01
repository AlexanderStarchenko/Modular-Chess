const VERSION = '57';
const CACHE_NAME = `modular-chess-v${VERSION}`;

// Критические ресурсы: ядро игры. Если хоть один не скачается — установка воркера отменяется,
// чтобы не поломать работающий оффлайн-кэш предыдущей версии.
const CRITICAL_ASSETS = [
    './',
    'index.html',
    `css/output.css?v=${VERSION}`,
    `js/telemetry.js?v=${VERSION}`,
    `js/wasm_loader.js?v=${VERSION}`,
    `js/logic.js?v=${VERSION}`,
    `js/ai_shared.js?v=${VERSION}`,
    `js/ort.min.js?v=${VERSION}`,
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
    'build/release.wasm',
    // Базовые фигуры
    'pieces/wP.svg', 'pieces/wR.svg', 'pieces/wN.svg', 'pieces/wB.svg', 'pieces/wQ.svg', 'pieces/wK.svg',
    'pieces/bP.svg', 'pieces/bR.svg', 'pieces/bN.svg', 'pieces/bB.svg', 'pieces/bQ.svg', 'pieces/bK.svg'
];

// Некритические ресурсы: декорации, звуки, тяжелый Stockfish.js.
// Ошибка их загрузки при установке не блокирует работу игры.
const OPTIONAL_ASSETS = [
    `js/stockfish.js?v=${VERSION}`,
    `images/stockfish.png?v=${VERSION}`,
    'sounds/move.mp3',
    'sounds/capture.mp3',
    'sounds/low_time.mp3'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                // 1. Принудительно скачиваем критические ресурсы в обход HTTP-кэша браузера
                await Promise.all(
                    CRITICAL_ASSETS.map(asset => cache.add(new Request(asset, { cache: 'reload' })))
                );
                // 2. Скачиваем факультативные ресурсы без риска сорвать установку
                await Promise.allSettled(
                    OPTIONAL_ASSETS.map(asset => cache.add(new Request(asset, { cache: 'reload' })).catch(err => {
                        console.warn(`[SW] Optional asset failed to pre-cache ${asset}:`, err.message);
                    }))
                );
            })
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

    // 1. Фильтрация по происхождению (Origin):
    // Пропускаем сторонние домены, CDN и схемы браузерных расширений (chrome-extension://)
    if (url.origin !== self.location.origin) {
        return;
    }

    // 2. Не перехватываем POST-запросы, API и трафик вебсокетов Socket.IO
    if (
        req.method !== 'GET' ||
        url.pathname.startsWith('/socket.io/') ||
        url.pathname.startsWith('/api/')
    ) {
        return;
    }

    // 3. Для HTML, JS, CSS: Network-First с fallback на кэш.
    // Гарантирует, что при обычном обновлении (F5) всегда загружается свежий код,
    // но игра сохраняет 100% работоспособность офлайн.
    const isCodeAsset = req.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname === '/' ||
        url.pathname === '';

    if (isCodeAsset) {
        event.respondWith(
            fetch(req)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        // Не сохраняем в кэш ответы с no-store / private (защита приватных данных)
                        const cacheControl = networkResponse.headers.get('Cache-Control') || '';
                        if (!cacheControl.includes('no-store') && !cacheControl.includes('private')) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(req, responseToCache)).catch(() => {});
                        }
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    // 4. Для тяжелых неизменяемых ресурсов (.wasm, .onnx, .svg, .mp3): Cache-First с fallback на сеть.
    // Точное совпадение URL исключает риск Cache Poisoning и рассинхронизации версий.
    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(networkResponse => {
                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    networkResponse.type === 'basic'
                ) {
                    const cacheControl = networkResponse.headers.get('Cache-Control') || '';
                    if (!cacheControl.includes('no-store') && !cacheControl.includes('private')) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(req, responseToCache);
                        }).catch(() => {});
                    }
                }
                return networkResponse;
            });
        })
    );
});
