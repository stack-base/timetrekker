const CACHE_NAME = 'timetrekker-desktop-v1.0.6';
const ASSETS_TO_CACHE = [
    './',
    './application.html',
    './script_desktop.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png',
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
    // Force the waiting service worker to become the active service worker.
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

self.addEventListener('fetch', event => {
    // Only cache GET requests (ignore POST/PUT/etc.)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // 1. Return the cached version instantly if available
            if (cachedResponse) {
                return cachedResponse; 
            }
            
            // 2. Fetch from the network if not in cache
            return fetch(event.request).then(networkResponse => {
                // Ensure the response is valid before caching
                if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                    return networkResponse;
                }

                // 3. Clone the response and save it to the cache dynamically
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                // 4. Return the original network response to the browser
                return networkResponse;
            }).catch(error => {
                console.error('[Service Worker] Fetch failed for:', event.request.url, error);
            });
        })
    );
});

// --- BACKGROUND ALARM LOGIC ---
let alarmTimeout;

self.addEventListener('message', (event) => {
    if (event.data.type === 'START_ALARM') {
        clearTimeout(alarmTimeout);
        const timeRemaining = event.data.endTime - Date.now();
        
        if (timeRemaining > 0) {
            alarmTimeout = setTimeout(() => {
                self.registration.showNotification("Time's Up!", {
                    body: `Your ${event.data.mode} session is complete.`,
                    icon: 'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png',
                    vibrate: [200, 100, 200, 100, 200],
                    requireInteraction: true 
                });
            }, timeRemaining);
        }
    } else if (event.data.type === 'CLEAR_ALARM') {
        clearTimeout(alarmTimeout);
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            if (windowClients.length > 0) {
                windowClients[0].focus();
            } else {
                clients.openWindow('/');
            }
        })
    );
});