const CACHE_NAME = 'timetrekker-mobile-v1.0.7'; // Bumped version to force cache update
const OFFLINE_URL = './offline.html';

const ASSETS_TO_CACHE = [
    './',
    './application_mobile.html',
    './script_mobile.js',
    OFFLINE_URL, // Explicitly cache the offline page
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg',
    'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    'https://actions.google.com/sounds/v1/ambiences/forest_morning.ogg',
    'https://stack-base.github.io/media/brand/timetrekker/timetrekker-icon.png'
];

// Install: Cache all static assets including the offline page
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Caching assets');
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

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // 1. Return the cached version instantly if available
            if (cachedResponse) {
                return cachedResponse; 
            }
            
            // 2. Fetch from the network if not in cache
            return fetch(event.request).then(networkResponse => {
                if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                    return networkResponse;
                }

                // 3. Clone the response and save it to the cache dynamically
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(error => {
                console.warn('[Service Worker] Fetch failed for:', event.request.url, error);
                
                // 4. Offline Fallback Logic
                // If the user is requesting a page (navigation) and the network fails, show offline.html
                if (event.request.mode === 'navigate') {
                    return caches.match(OFFLINE_URL);
                }
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