// ═══════════════════════════════════════════════════════
// SERVICE WORKER — Кешування тайлів карти для офлайн роботи
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'kartka-vognyu-tiles-v1';
const TILE_HOSTS = ['tile.opentopomap.org', 'a.tile.opentopomap.org', 'b.tile.opentopomap.org', 'c.tile.opentopomap.org'];

// Встановлення SW
self.addEventListener('install', event => {
    console.log('[SW] Встановлено');
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[SW] Активовано — кешування тайлів увімкнено');
    event.waitUntil(clients.claim());
});

// Перехоплення запитів
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Кешуємо тільки тайли карти
    const isTile = TILE_HOSTS.some(h => url.hostname.includes(h));
    if (!isTile) return; // решту запитів не чіпаємо

    event.respondWith(
        caches.open(CACHE_NAME).then(async cache => {
            // 1. Шукаємо в кеші
            const cached = await cache.match(event.request);
            if (cached) {
                return cached; // ← повертаємо з кешу (офлайн)
            }

            // 2. Нема в кеші — завантажуємо і зберігаємо
            try {
                const response = await fetch(event.request);
                if (response.ok) {
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch (err) {
                // Офлайн і тайл не закешований — повертаємо порожній PNG
                return new Response(
                    // 1x1 прозорий PNG
                    new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,1,0,0,0,1,0,8,2,0,0,0,144,119,83,222,0,0,0,12,73,68,65,84,120,156,99,248,207,0,0,0,2,0,1,231,20,82,183,0,0,0,0,73,69,78,68,174,66,96,130]),
                    { headers: { 'Content-Type': 'image/png' } }
                );
            }
        })
    );
});

// Очищення старих кешів
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
});
