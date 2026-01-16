const CACHE_NAME = 'aeris-v2'; // ¡Cambiamos a V2!
const ASSETS_TO_CACHE = [
  '/logo.png', // Solo guardamos imágenes y librerías, NO el index.html
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Plus+Jakarta+Sans:wght@500;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Fuerza al SW nuevo a activarse inmediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
  self.clients.claim(); // Toma el control de la página inmediatamente
});

self.addEventListener('fetch', (event) => {
  // ESTRATEGIA: Network First para HTML y API (Siempre intenta descargar lo nuevo)
  if (event.request.mode === 'navigate' || event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request) || caches.match('/index.html');
      })
    );
    return;
  }

  // ESTRATEGIA: Cache First para imágenes y estilos (Para que cargue rápido)
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});