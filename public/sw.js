const CACHE_NAME = 'aeris-cache-v14';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@500;700&display=swap'
];

// 1. INSTALACIÓN: Cachear App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 Aeris SW: Cacheando App Shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. ACTIVACIÓN: Limpiar cachés viejas
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

// 3. FETCH: Estrategia Híbrida
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // A. Si es una llamada a la API (/api/weather), Network First (Intenta red, si falla, usa caché)
    // Nota: Tu backend ya hace caché, pero esto protege si el backend se cae o no hay red.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // B. Si es Windy o recursos externos pesados, Network Only (no cachear iframe pesado)
    if (url.hostname.includes('windy.com')) {
        return; 
    }

    // C. Para todo lo demás (HTML, CSS, JS), Stale-While-Revalidate
    // (Usa caché rápido, pero actualiza en segundo plano)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});