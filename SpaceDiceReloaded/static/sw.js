const CACHE = 'spacedice-v3';

const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/manifest.json',
    '/static/fonts/ibm-plex-mono-400.woff2',
    '/static/fonts/ibm-plex-mono-700.woff2',
    '/static/fonts/vt323-400.woff2',
    '/static/fonts/share-tech-mono-400.woff2',
    '/static/fonts/inconsolata-400.woff2',
    '/static/fonts/silkscreen-400.woff2',
    '/static/fonts/array-400.woff2',
    '/static/fonts/jetbrains-mono-400.woff2',
    '/static/fonts/rx100-400.woff2',
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (n) { return n !== CACHE; })
                     .map(function (n) { return caches.delete(n); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function (e) {
    // Network-first for API and HTML, cache-first for static assets
    if (e.request.url.includes('/api/') || e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(function () { return caches.match(e.request); })
        );
    } else {
        e.respondWith(
            caches.match(e.request).then(function (r) { return r || fetch(e.request); })
        );
    }
});
