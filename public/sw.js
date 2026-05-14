const CACHE = 'asktrevor-v3';
const STATIC = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  // Cache static assets but do NOT skipWaiting automatically
  // We wait for the user to tap "Update Now" before activating
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('activate', e => {
  // Clean up old caches when we activate
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Listen for SKIP_WAITING message from the app (sent by doUpdate())
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
  // Never cache version.json - always fetch fresh
  if (e.request.url.includes('version.json')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // For static assets, try cache first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
