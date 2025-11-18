const CACHE_NAME = 'song-buddy-v2'; // Version bumped to force update

// Lokale Dateien
const LOCAL_ASSETS = [
  './',
  './index.html',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './icon.svg',
  './components/Prompter.tsx',
  './components/SongEditor.tsx',
  './components/SongList.tsx',
  './services/gemini.ts'
];

// Externe Bibliotheken, die für den Offline-Start zwingend notwendig sind
// Diese URLs entsprechen genau den Einträgen in der index.html ImportMap
const EXTERNAL_LIB_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0',
  'https://aistudiocdn.com/lucide-react@^0.554.0',
  'https://aistudiocdn.com/@google/genai@^1.30.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate worker immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cache local files
      await cache.addAll(LOCAL_ASSETS);
      
      // 2. Attempt to pre-cache external libraries
      // We use Promise.allSettled because one failing CDN fetch shouldn't break the whole install
      // The 'fetch' handler will catch them later if this misses anything dynamic.
      const externalPromises = EXTERNAL_LIB_ASSETS.map(url => 
        fetch(url, { mode: 'cors' })
          .then(response => {
             if (response.ok) return cache.put(url, response);
             throw new Error(`Failed to fetch ${url}`);
          })
          .catch(e => console.warn('Pre-caching warning:', e))
      );
      
      await Promise.allSettled(externalPromises);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all clients immediately
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORE: API Calls to Google Gemini (Generative AI) should never be cached
  // and should simply fail if offline (handled by UI).
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return; 
  }

  // 2. CACHE FIRST: Handle External Libraries (CDNs)
  // React, Tailwind, Lucide, etc. must be served from cache if offline.
  if (url.hostname === 'aistudiocdn.com' || url.hostname === 'cdn.tailwindcss.com') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // If not in cache, fetch from network and cache it for next time (Runtime Caching)
        return fetch(event.request)
          .then((networkResponse) => {
            // Check if valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
              return networkResponse;
            }
            
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
            return networkResponse;
          })
          .catch(() => {
             // If offline and not in cache, we can't do much for external libs other than fail.
             // But step 1 (install) tries to mitigate this.
             return new Response('Offline library unavailable', { status: 503 });
          });
      })
    );
    return;
  }

  // 3. CACHE FIRST: Handle Local Files
  // Serves index.html, .js files, .svg, etc.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});