// ═══════════════════════════════════════════════════════════════
// SERVICE WORKER — Картка вогню
// Кешує тайли карти для повністю офлайн роботи
// Працює на GitHub Pages (/kartka/) і localhost
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'kartka-vognyu-tiles-v1';
const TILE_HOSTS = [
    'tile.opentopomap.org',
    'a.tile.opentopomap.org',
    'b.tile.opentopomap.org',
    'c.tile.opentopomap.org'
];

// Прозорий 1x1 PNG — повертається коли тайл не знайдено офлайн
const EMPTY_TILE = new Uint8Array([
    137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
    0,0,1,0,0,0,1,0,8,2,0,0,0,144,119,83,222,0,0,0,
    12,73,68,65,84,120,156,99,248,207,0,0,0,2,0,1,
    231,20,82,183,0,0,0,0,73,69,78,68,174,66,96,130
]);

// ── Встановлення ─────────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Встановлено, версія:', CACHE_NAME);
    self.skipWaiting(); // активуємо одразу без очікування
});

// ── Активація ────────────────────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Активовано');
    event.waitUntil(
        Promise.all([
            clients.claim(), // перехоплюємо всі вкладки одразу
            // Видаляємо старі версії кешу
            caches.keys().then(keys =>
                Promise.all(
                    keys
                        .filter(k => k !== CACHE_NAME)
                        .map(k => {
                            console.log('[SW] Видаляємо старий кеш:', k);
                            return caches.delete(k);
                        })
                )
            )
        ])
    );
});

// ── Перехоплення запитів ─────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Обробляємо тільки тайли карти
    const isTile = TILE_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
    if (!isTile) return;

    event.respondWith(handleTileRequest(event.request));
});

async function handleTileRequest(request) {
    const cache = await caches.open(CACHE_NAME);

    // 1. Перевіряємо кеш
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse; // ← повертаємо з кешу (офлайн)
    }

    // 2. Завантажуємо з мережі і кешуємо
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            // Зберігаємо копію в кеш
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // 3. Офлайн і тайл не в кеші — повертаємо порожній тайл
        console.log('[SW] Офлайн, тайл не в кеші:', request.url);
        return new Response(EMPTY_TILE, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
                'X-SW-Offline': 'true'
            }
        });
    }
}

// ── Обробка повідомлень від сторінки ─────────────────────────
self.addEventListener('message', async event => {
    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        event.ports[0].postMessage({ count: keys.length });
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        await caches.delete(CACHE_NAME);
        event.ports[0].postMessage({ ok: true });
    }
});