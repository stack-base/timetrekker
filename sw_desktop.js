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

// Fetch: Serve from Cache first, then Network
self.addEventListener('fetch', event => {
    // Ignore Firestore/Firebase requests
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