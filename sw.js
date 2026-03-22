// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — Картка вогню
// Кешує: сторінку, бібліотеки, тайли карти
// Повністю офлайн після першого відкриття
// ═══════════════════════════════════════════════════════════════

const APP_CACHE   = 'kartka-app-v1';      // сторінка + бібліотеки
const TILE_CACHE  = 'kartka-tiles-v1';    // тайли карти

// Файли додатку — кешуються при першому відкритті
const APP_SHELL = [
    './',
    './index.html',
    './sw.js',
    // CDN бібліотеки — кешуємо з інтернету при першому запуску
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://unpkg.com/@turf/turf@6.5.0/turf.min.js',
];

const TILE_HOSTS = [
    'tile.opentopomap.org',
    'a.tile.opentopomap.org',
    'b.tile.opentopomap.org',
    'c.tile.opentopomap.org'
];

// Порожній прозорий PNG тайл для офлайн-заглушки
const EMPTY_TILE = new Uint8Array([
    137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
    0,0,1,0,0,0,1,0,8,2,0,0,0,144,119,83,222,0,0,0,
    12,73,68,65,84,120,156,99,248,207,0,0,0,2,0,1,
    231,20,82,183,0,0,0,0,73,69,78,68,174,66,96,130
]);

// ── ВСТАНОВЛЕННЯ: кешуємо app shell ──────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Встановлення...');
    event.waitUntil(
        caches.open(APP_CACHE).then(async cache => {
            // Кешуємо кожен файл окремо щоб помилка одного не зупиняла інші
            for (const url of APP_SHELL) {
                try {
                    await cache.add(url);
                    console.log('[SW] Кешовано:', url);
                } catch(e) {
                    console.warn('[SW] Не вдалось кешувати:', url, e.message);
                }
            }
        }).then(() => {
            console.log('[SW] App shell закешовано ✅');
            return self.skipWaiting();
        })
    );
});

// ── АКТИВАЦІЯ: видаляємо старі кеші ──────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Активація...');
    event.waitUntil(
        Promise.all([
            clients.claim(),
            caches.keys().then(keys =>
                Promise.all(
                    keys
                        .filter(k => k !== APP_CACHE && k !== TILE_CACHE)
                        .map(k => {
                            console.log('[SW] Видаляємо старий кеш:', k);
                            return caches.delete(k);
                        })
                )
            )
        ])
    );
});

// ── ПЕРЕХОПЛЕННЯ ЗАПИТІВ ──────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Тайли карти — Network First з кешем як fallback
    const isTile = TILE_HOSTS.some(h => url.hostname === h);
    if (isTile) {
        event.respondWith(handleTile(event.request));
        return;
    }

    // App shell — Cache First
    event.respondWith(handleApp(event.request));
});

// Тайли: спочатку мережа → потім кеш → потім порожній тайл
async function handleTile(request) {
    const cache = await caches.open(TILE_CACHE);

    // Спочатку кеш
    const cached = await cache.match(request);
    if (cached) return cached;

    // Потім мережа
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Офлайн — порожній тайл
        return new Response(EMPTY_TILE, {
            status: 200,
            headers: { 'Content-Type': 'image/png' }
        });
    }
}

// App shell: спочатку кеш → потім мережа
async function handleApp(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        // Зберігаємо нові ресурси в кеш
        if (response.ok) {
            const cache = await caches.open(APP_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Офлайн і нема в кеші — повертаємо index.html (SPA fallback)
        const fallback = await caches.match('./index.html');
        return fallback || new Response('Офлайн. Відкрийте спочатку з інтернетом.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// ── ПОВІДОМЛЕННЯ ВІД СТОРІНКИ ─────────────────────────────────
self.addEventListener('message', async event => {
    // Отримати кількість тайлів у кеші
    if (event.data?.type === 'GET_TILE_COUNT') {
        const cache = await caches.open(TILE_CACHE);
        const keys = await cache.keys();
        event.ports[0].postMessage({ count: keys.length });
    }
    // Очистити тайли
    if (event.data?.type === 'CLEAR_TILES') {
        await caches.delete(TILE_CACHE);
        event.ports[0].postMessage({ ok: true });
    }
    // Очистити все
    if (event.data?.type === 'CLEAR_ALL') {
        await caches.delete(TILE_CACHE);
        await caches.delete(APP_CACHE);
        event.ports[0].postMessage({ ok: true });
    }
});