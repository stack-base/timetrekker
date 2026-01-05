// sw.js
const CACHE_NAME = 'timetrekker-desktop-v1';
const ASSETS_TO_CACHE = [
    './',
    './application.html',
    './script_desktop.js',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/@phosphor-icons/web',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png',
    // Cache sounds to save significant bandwidth
    'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
    'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg'
];

// Install: Cache all static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
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

// Fetch: Serve from Cache first, then Network
self.addEventListener('fetch', event => {
    // Ignore Firestore/Firebase requests (let the SDK handle them)
    if (event.request.url.includes('firestore.googleapis.com') || 
        event.request.url.includes('firebase') ||
        event.request.url.includes('google.com/identity')) {
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