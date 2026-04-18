const APP_CACHE = 'museum-app-shell-v1';
const API_CACHE = 'museum-api-read-v1';
const APP_ASSETS = ['/', '/index.html'];

const API_CACHEABLE_PATTERNS = [
  '/api/v1/catalog/search',
  '/api/v1/catalog/autocomplete',
  '/api/v1/catalog/hot-keywords',
  '/api/v1/routes/'
];

const isCacheableApi = (pathname) =>
  API_CACHEABLE_PATTERNS.some((pattern) => pathname.startsWith(pattern));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_CACHE, API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/api/v1/') || request.url.includes('/api/v1/')) {
    if (isCacheableApi(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(request).then((cached) => cached || new Response(
            JSON.stringify({ error: 'OFFLINE', message: 'You are offline and no cached data is available.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )))
      );
    } else {
      event.respondWith(
        fetch(request).catch(() => new Response(
          JSON.stringify({ error: 'OFFLINE', message: 'You are offline. This request requires connectivity.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        ))
      );
    }
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
