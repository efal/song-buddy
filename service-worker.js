const CACHE_NAME = 'song-buddy-v13-pwa-fix';

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
const EXTERNAL_LIB_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react@^19.2.0/jsx-runtime',
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client',
  'https://aistudiocdn.com/lucide-react@^0.554.0',
  'https://aistudiocdn.com/@google/genai@^1.30.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching Local Assets...');
      await cache.addAll(LOCAL_ASSETS);
      
      console.log('[SW] Caching External Libs...');
      const externalPromises = EXTERNAL_LIB_ASSETS.map(url => 
        fetch(url, { mode: 'cors' })
          .then(response => {
             if (response.ok) return cache.put(url, response);
             return Promise.resolve();
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
  // Nur http(s) Requests behandeln
  if (!event.request.url.startsWith('http')) {
    return;
  }

  let url;
  try {
    url = new URL(event.request.url);
  } catch (error) {
    return;
  }

  // API Calls ignorieren
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return; 
  }

  // Strategy: Cache First, falling back to Network (für Libs)
  if (EXTERNAL_LIB_ASSETS.includes(event.request.url) || 
      url.hostname === 'aistudiocdn.com' || 
      url.hostname === 'cdn.tailwindcss.com') {
      
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
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

  // Strategy: Stale-While-Revalidate or Network First for local app files
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached response immediately if available
        if (response) return response;
        
        // Fallback to network
        return fetch(event.request).catch(() => {
           // Offline Fallback für Navigation
           if (event.request.mode === 'navigate') {
             return caches.match('./index.html') || caches.match('./');
           }
        });
      })
    );
  }
});