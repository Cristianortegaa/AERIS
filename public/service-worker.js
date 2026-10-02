const CACHE_NAME = 'aeris-v22';
// Lo propio es imprescindible: si falla, la instalación debe fallar.
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css?v=13',
    '/app.js?v=13',
    '/logo.png',
    '/icono-clima.png'
];
// Lo de CDNs es un extra para el modo sin conexión: si alguno no se puede
// guardar, se ignora. (Antes un solo fallo aquí tumbaba la instalación entera
// y el service worker nunca se activaba: sin él no hay notificaciones.)
const EXTRA_ASSETS = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
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
    // De otros dominios solo servimos lo que ya esté en caché; si no, el
    // navegador lo pide él mismo (así no dependemos de la CSP del worker).
    if (url.origin !== self.location.origin) {
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
        icon: data.icon || '/logo.png',
        badge: data.badge || '/logo.png',
        vibrate: [200, 100, 200],
        tag: 'aeris-alert',
        renotify: true,
        data: { url: '/' }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (new URL(client.url).origin === self.location.origin && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
