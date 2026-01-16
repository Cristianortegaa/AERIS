const CACHE_NAME = 'aeris-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/logo.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Plus+Jakarta+Sans:wght@500;700&display=swap'
];

// 1. INSTALACIÓN (Guardar archivos básicos)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. ACTIVACIÓN (Limpiar cachés viejas si actualizas)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

// 3. INTERCEPTAR PETICIONES (Estrategia: Network First para API, Cache First para estáticos)
self.addEventListener('fetch', (event) => {
  // Si es una llamada a la API (/api/...), intentamos Red primero, si falla, nada (o fallback)
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si no hay internet, podríamos devolver un JSON de error o datos guardados
        return new Response(JSON.stringify({ error: "Sin conexión" }));
      })
    );
    return;
  }

  // Para el resto (HTML, CSS, JS, Imágenes), buscamos en Caché primero
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});