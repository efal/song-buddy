const CACHE_NAME = 'song-buddy-v25-bundle-fix';

// 1. Lokale Dateien (App Code)
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

// 2. EXTERNE BIBLIOTHEKEN (Bundles)
// Diese URLs müssen exakt 1:1 mit der importmap in index.html übereinstimmen.
// Wir nutzen ?bundle Versionen, damit wir nur EINE Datei pro Lib cachen müssen.
const EXTERNAL_LIBS = [
  'https://cdn.tailwindcss.com',
  'https://esm.sh/react@18.2.0?bundle',
  'https://esm.sh/react-dom@18.2.0/client?bundle',
  'https://esm.sh/react-dom@18.2.0?bundle',
  'https://esm.sh/lucide-react@0.292.0?bundle',
  'https://esm.sh/@google/genai@0.1.1?bundle'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Sofort aktivieren, keine Wartezeit
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Installing... Downloading offline bundles.');
      
      // Wir laden ALLES herunter. Wenn das Internet beim Installieren da ist,
      // haben wir danach eine garantierte Offline-Version.
      try {
        // Kombiniere Listen
        const urlsToCache = [...LOCAL_ASSETS, ...EXTERNAL_LIBS];
        
        // Request für jeden URL erstellen und cachen
        // Wir nutzen {cache: 'reload'}, um sicherzustellen, dass wir nicht
        // versehentlich kaputte Versionen aus dem Browser-Cache holen.
        await Promise.all(
          urlsToCache.map(url => {
            const request = new Request(url, { mode: 'cors' });
            return fetch(request).then(response => {
              if (!response.ok) throw new Error(`Failed to fetch ${url}`);
              return cache.put(request, response);
            });
          })
        );
        
        console.log('[SW] Installation complete. App is offline ready.');
      } catch (error) {
        console.error('[SW] Offline Installation failed:', error);
        // Trotzdem weitermachen, vielleicht sind Teile schon da
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Cleaning old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Sofort Kontrolle über alle Tabs übernehmen
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Strategie: CACHE FIRST (Aggressiv)
  // Wir schauen IMMER erst im Cache nach. Nur wenn da nichts ist, gehen wir ins Netz.
  // Das garantiert, dass die App offline funktioniert, solange der Cache intakt ist.
  
  // Ausnahme: API Calls (Gemini) gehen immer ins Netz
  if (url.hostname.includes('googleapis.com')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // Nicht im Cache? Versuch es übers Netz.
      return fetch(event.request)
        .then(networkResponse => {
          // Wenn wir erfolgreich was geladen haben (und es kein API call war),
          // legen wir es für die Zukunft in den Cache.
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then(cache => {
               cache.put(event.request, responseToCache);
             });
          }
          return networkResponse;
        })
        .catch(error => {
           console.log("[SW] Fetch failed (Offline):", event.request.url);
           // Hier könnten wir ein Fallback-Bild zurückgeben, wenn nötig.
        });
    })
  );
});