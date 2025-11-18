const CACHE_NAME = 'song-buddy-v5-offline-fix';

// Lokale Dateien, die statisch vorhanden sind
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './components/Prompter.tsx',
  './components/SongEditor.tsx',
  './components/SongList.tsx',
  './services/gemini.ts'
];

// Externe Bibliotheken (CDNs)
// WICHTIG: Hier müssen ALLE URLs exakt so stehen, wie der Browser sie anfordert.
// Auch Sub-Pfade wie /client oder /jsx-runtime müssen explizit gecacht werden.
const EXTERNAL_LIB_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react@^19.2.0/jsx-runtime', // Wird oft implizit vom Compiler benötigt
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client', // WICHTIG für createRoot
  'https://aistudiocdn.com/lucide-react@^0.554.0',
  'https://aistudiocdn.com/@google/genai@^1.30.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Zwingt den neuen Service Worker sofort aktiv zu werden
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching Local Assets...');
      await cache.addAll(LOCAL_ASSETS);
      
      console.log('[SW] Caching External Libs...');
      // Wir nutzen map & catch, damit ein einzelner Fehler nicht alles abbricht,
      // aber wir loggen Warnungen.
      const externalPromises = EXTERNAL_LIB_ASSETS.map(url => 
        fetch(url, { mode: 'cors' })
          .then(response => {
             if (response.ok) return cache.put(url, response);
             throw new Error(`Bad status ${response.status} for ${url}`);
          })
          .catch(e => console.warn(`[SW] Failed to cache external lib: ${url}`, e))
      );
      
      await Promise.allSettled(externalPromises);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new version...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API Calls ignorieren (Google Gemini)
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return; 
  }

  // 2. Externe Libs: Cache First, Fallback Network
  if (EXTERNAL_LIB_ASSETS.includes(event.request.url) || 
      url.hostname === 'aistudiocdn.com' || 
      url.hostname === 'cdn.tailwindcss.com') {
      
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Wenn nicht im Cache, versuche Netzwerk und speichere es für die Zukunft
        return fetch(event.request)
          .then((networkResponse) => {
             // Prüfen ob Response gültig ist
             if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
               return networkResponse;
             }
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => {
               cache.put(event.request, responseToCache);
             });
             return networkResponse;
          })
          .catch(() => new Response('Offline: Library missing', { status: 503 }));
      })
    );
    return;
  }

  // 3. Lokale Dateien: Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).catch(() => {
           // Fallback für Navigation (SPA Support offline)
           if (event.request.mode === 'navigate') {
             return caches.match('./index.html');
           }
        });
      })
    );
  }
});