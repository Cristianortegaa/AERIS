const CACHE_NAME = 'aeris-v18';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css?v=9',
    '/app.js?v=9',
    '/logo.png',
    '/icono-clima.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@400..600&display=swap'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) =>
            Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Red primero para navegación y API; fallback a caché
    if (event.request.mode === 'navigate' || event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match(event.request) || caches.match('/index.html')
            )
        );
        return;
    }
    // Caché primero para assets estáticos
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
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
