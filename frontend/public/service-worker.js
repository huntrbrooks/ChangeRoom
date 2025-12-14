const CACHE_NAME = 'change-room-pwa-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const isSameOrigin = request.url.startsWith(self.location.origin);
  const isGet = request.method === 'GET';

  if (!isGet || !isSameOrigin) {
    return;
  }

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(request);
        cache.put(request, response.clone());

        if (isNavigation) {
          cache.put(OFFLINE_URL, response.clone());
        }

        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        if (isNavigation) {
          const offlinePage = await cache.match(OFFLINE_URL);
          if (offlinePage) {
            return offlinePage;
          }
        }

        throw error;
      }
    }),
  );
});





