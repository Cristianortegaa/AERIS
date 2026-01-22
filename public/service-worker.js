const CACHE_NAME = 'aeris-v3-pro'; 
const ASSETS_TO_CACHE = [
  '/', 
  '/index.html',
  '/logo.png', 
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Plus+Jakarta+Sans:wght@500;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); 
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keyList) => Promise.all(keyList.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); }))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate' || event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request) || caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});

// --- NOTIFICACIONES SUPER CURRADAS ---
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : { title: "Aeris", body: "Nueva info del tiempo" };
    
    const options = {
        body: data.body,
        icon: '/logo.png', // Logo grande
        badge: '/logo.png', // Icono pequeño barra estado
        vibrate: [200, 100, 200, 100, 200], // Vibración distintiva
        tag: 'aeris-rain', // Reemplaza alertas viejas
        renotify: true,
        data: { url: '/' },
        actions: [
            { action: 'open', title: '🌧️ Ver Ahora' },
            { action: 'radar', title: '📡 Radar' }
        ]
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === '/' && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});