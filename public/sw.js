const CACHE = 'asktrevor-v2';
const STATIC = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  // Never cache API calls or external requests - pass straight through
  if (e.request.url.includes('/api/') || 
      e.request.url.includes('anthropic.com') || 
      e.request.url.includes('googleapis') ||
      e.request.url.includes('script.google.com') ||
      e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }
  // For static assets, try cache first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
