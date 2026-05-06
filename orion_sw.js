const CACHE_NAME = 'orion-console-v1.0.0';

// Caching standard UI assets for Orion
const ASSETS_TO_CACHE = [
    './',
    './orion.html',
    'https://unpkg.com/@phosphor-icons/web',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://stack-base.github.io/media/brand/orion/orion_icon.png'
];

// Install: Cache all static UI assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Orion SW] Caching UI assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keyList => {
            return Promise.all(keyList.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
    return self.clients.claim();
});

// Fetch: Serve UI from Cache first, but ignore Firebase to maintain live data connection
self.addEventListener('fetch', event => {
    // Crucial for Admin Consoles: Never cache Firebase/Firestore requests
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('firebase')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(networkResponse => {
                return networkResponse;
            });
        })
    );
});