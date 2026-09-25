// Al cambiar la versión se purgan las cachés antiguas en `activate`, de modo
// que un despliegue nuevo se vea de inmediato sin quedarse con bundles viejos.
const CACHE_NAME = 'skatecoreo-v5';
const STATIC_ASSETS = [
  './',
  './index.html',
  './favicon.ico',
  './favicon.svg',
  './apple-touch-icon.png',
  './site.webmanifest',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through non-GET requests
  if (event.request.method !== 'GET') return;

  // El endpoint propio de voz (`/api/*`) NUNCA se cachea: debe llegar siempre a
  // la función serverless y su respuesta depende de la credencial del servidor.
  try {
    const url = new URL(event.request.url);
    // El endpoint propio de voz nunca se cachea (depende de credencial de servidor).
    if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
    // Los módulos de DESARROLLO de Vite (sin hash) y su cliente HMR nunca se
    // cachean: si se sirviera una copia antigua, los cambios no se verían y el
    // HMR quedaría roto. En producción los bundles llevan hash, así que esta
    // regla no afecta al PWA.
    if (
      url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/@') ||
      url.pathname.includes('/node_modules/.vite/')
    ) {
      return;
    }
  } catch (e) {
    /* URL no parseable: se trata como recurso normal */
  }
  
  // Para navegaciones (HTML / index.html), estrategia NETWORK-FIRST:
  // Garantiza que los despliegues en producción sean inmediatamente visibles
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Fallback offline a la última versión en caché
          return caches.match(event.request)
            .then((cached) => cached || caches.match('./index.html') || caches.match('/'));
        })
    );
    return;
  }

  // Para otros recursos estáticos (CSS, JS con hash, imágenes), Stale-While-Revalidate:
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
