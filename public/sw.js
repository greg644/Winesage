const CACHE = 'asktrevor-v3';
const STATIC = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', e => {
  // Never cache API calls, sheets, or external requests
  if (e.request.url.includes('/api/') ||
      e.request.url.includes('/api/sheets') ||
      e.request.url.includes('anthropic.com') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('script.google.com') ||
      e.request.url.includes('upstash.io') ||
      e.request.method !== 'GET') {
    return; // Let the browser handle it natively — no respondWith
  }
  // Never cache version.json
  if (e.request.url.includes('version.json')) {
    return;
  }
  // For static assets, try cache first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
