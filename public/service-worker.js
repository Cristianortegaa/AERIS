const CACHE_NAME = 'aeris-v61';
// Lo propio es imprescindible: si falla, la instalación debe fallar.
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css?v=42',
    '/app.js?v=48',
    '/vendor/bootstrap-reboot.min.css',
    '/vendor/suncalc.js',
    '/weather-core.js?v=2',
    '/icons/meteocons/clear-day.svg?v=2',
    '/icons/meteocons/clear-night.svg?v=2',
    '/icons/meteocons/cloudy.svg?v=2',
    '/icons/meteocons/drizzle.svg?v=2',
    '/icons/meteocons/fog.svg?v=2',
    '/icons/meteocons/fog-day.svg?v=2',
    '/icons/meteocons/fog-night.svg?v=2',
    '/icons/meteocons/hail.svg?v=2',
    '/icons/meteocons/overcast.svg?v=2',
    '/icons/meteocons/overcast-day.svg?v=2',
    '/icons/meteocons/overcast-night.svg?v=2',
    '/icons/meteocons/partly-cloudy-day.svg?v=2',
    '/icons/meteocons/partly-cloudy-day-drizzle.svg?v=2',
    '/icons/meteocons/partly-cloudy-day-rain.svg?v=2',
    '/icons/meteocons/partly-cloudy-day-snow.svg?v=2',
    '/icons/meteocons/partly-cloudy-night.svg?v=2',
    '/icons/meteocons/partly-cloudy-night-drizzle.svg?v=2',
    '/icons/meteocons/partly-cloudy-night-rain.svg?v=2',
    '/icons/meteocons/partly-cloudy-night-snow.svg?v=2',
    '/icons/meteocons/rain.svg?v=2',
    '/icons/meteocons/sleet.svg?v=2',
    '/icons/meteocons/snow.svg?v=2',
    '/icons/meteocons/thunderstorms.svg?v=2',
    '/icons/meteocons/thunderstorms-day-rain.svg?v=2',
    '/icons/meteocons/thunderstorms-night-rain.svg?v=2',
    '/icons/meteocons/thunderstorms-rain.svg?v=2',
    '/icons/meteocons/thunderstorms-snow.svg?v=2',
    '/logo.png',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-512.png'
];
// Lo de CDNs es un extra para el modo sin conexión: si alguno no se puede
// guardar, se ignora. (Antes un solo fallo aquí tumbaba la instalación entera
// y el service worker nunca se activaba: sin él no hay notificaciones.)
const CDN_ORIGINS = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
const EXTRA_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
    'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@400..600&display=swap'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await cache.addAll(CORE_ASSETS);
            await Promise.all(EXTRA_ASSETS.map(url => cache.add(url).catch(() => {})));
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return; // POST (suscripción) va directo a la red

    const url = new URL(req.url);
    // De otros dominios solo se interceptan los CDN que se guardan para el modo
    // sin conexión. El resto (teselas del radar, APIs del tiempo...) va directo:
    // desde el worker, fetch() queda limitado por la CSP (connect-src) y las
    // imágenes de mapas fallarían.
    if (url.origin !== self.location.origin) {
        if (!CDN_ORIGINS.includes(url.origin)) return;
        event.respondWith(caches.match(req).then(r => r || fetch(req)));
        return;
    }
    // La API va directa a la red: la app ya gestiona los fallos y guarda
    // los últimos datos ella misma.
    if (url.pathname.startsWith('/api/')) return;
    // Red primero para navegación; si no hay red, lo guardado
    if (req.mode === 'navigate') {
        event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
        return;
    }
    // Caché primero para los assets estáticos propios
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
});

// --- NOTIFICACIONES PUSH ---
self.addEventListener('push', function (event) {
    // Siempre hay que mostrar una notificación: iOS retira el permiso a las
    // webs que reciben pushes "silenciosos". Si el contenido no se puede leer,
    // mostramos uno genérico en vez de nada.
    let data = { title: 'AERIS', body: 'Nuevo aviso del tiempo' };
    try { if (event.data) data = { ...data, ...event.data.json() }; }
    catch (e) { try { data.body = event.data.text() || data.body; } catch (e2) {} }
    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        vibrate: [200, 100, 200],
        // Una etiqueta por tipo: un aviso de lluvia ya no sustituye al
        // resumen de la mañana ni a un aviso oficial sin leer
        tag: data.tag || 'aeris-aviso',
        renotify: true,
        requireInteraction: !!data.requireInteraction,
        data: { url: data.url || '/', type: data.type || '' }
    };
    const jobs = [self.registration.showNotification(data.title, options)];
    // Aviso oficial: globo en el icono de la app (se quita al abrirla)
    if (data.type === 'aemet' && self.navigator.setAppBadge) jobs.push(self.navigator.setAppBadge(1).catch(() => {}));
    event.waitUntil(Promise.all(jobs));
});

// Al tocarla se abre la app en la ciudad (y la sección) del aviso
self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windowClients => {
            for (const client of windowClients) {
                if (new URL(client.url).origin !== self.location.origin) continue;
                if ('navigate' in client && client.url !== target) {
                    try { await client.navigate(target); } catch (e) {}
                }
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(target);
        })
    );
});
