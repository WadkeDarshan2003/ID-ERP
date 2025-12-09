// Service Worker for offline CSS support
const CACHE_NAME = 'tailwind-css-v1';
const urlsToCache = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching Tailwind and fonts');
        return Promise.allSettled(
          urlsToCache.map(url =>
            fetch(url).then(response => {
              if (response.ok) {
                cache.put(url, response);
              }
            }).catch(err => console.log(`Failed to cache ${url}:`, err))
          )
        );
      })
  );
});

self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // Cache Tailwind and fonts
  if (url.includes('cdn.tailwindcss.com') || url.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request).then(res => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          return res;
        }))
        .catch(() => caches.match(event.request))
    );
  }
});
