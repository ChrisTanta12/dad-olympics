// Photo Drop service worker: keeps the app shell cached so it opens
// with no signal at the pub. Uploads themselves are queued in IndexedDB
// by the page and retried when the phone is back online.
const CACHE = 'photo-drop-v2';
const SHELL = [
  '/upload/',
  '/upload/manifest.webmanifest',
  '/upload/icon-192.png',
  '/upload/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for our own GETs (so a redeploy shows up), cache as fallback.
// Anything cross-origin (the Drive upload, Google Fonts) goes straight through.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
