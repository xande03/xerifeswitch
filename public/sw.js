// v13 (2026-09-18): bump para forçar update de TODOS os PWAs instalados —
// usuários com o app aberto desde antes das correções do player de vídeo
// (commits a138e29/1c5428f) continuavam rodando o bundle antigo em memória.
const STATIC_CACHE = 'xerife-static-v13';
const MEDIA_CACHE = 'xerife-media-v13';
const CACHES = [STATIC_CACHE, MEDIA_CACHE];

// ── Media Playback Session Tracking ──
// Keeps track of clients that are actively playing media so the SW can
// prioritise keeping them alive and avoid aggressive cache purging.
let activeMediaClients = new Set();

const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
];

const isExternalApiRequest = (url) => (
  url.hostname.includes('youtube.com') ||
  url.hostname.includes('googleapis.com') ||
  url.hostname.includes('googlevideo.com') ||
  url.hostname.includes('supabase.co') ||
  url.hostname.includes('i.ytimg.com') ||
  url.hostname.includes('yt3.ggpht.com') ||
  url.hostname.includes('gstatic.com')
);

const networkFirst = async (request, cacheName, timeoutMs = 4000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timeoutId);
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('network_failed');
  }
};

const cacheFirst = async (request, cacheName) => {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
};

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: clean old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !CACHES.includes(key)).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Allow force cache clear from client
  if (event.data?.type === 'CLEAR_CACHES') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
  // Media playback session tracking — keeps SW aware of active players
  if (event.data?.type === 'MEDIA_PLAYBACK_STATE') {
    const clientId = event.source?.id;
    if (clientId) {
      if (event.data.playing) {
        activeMediaClients.add(clientId);
      } else {
        activeMediaClients.delete(clientId);
      }
    }
  }
  // Heartbeat from background tab — keep the SW alive
  if (event.data?.type === 'HEARTBEAT') {
    // Simply acknowledging keeps the SW active
    event.source?.postMessage?.({ type: 'HEARTBEAT_ACK' });
  }
});

// Fetch: smart strategy per request type
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
    return;
  }

  const url = new URL(event.request.url);

  // Never cache OAuth redirects
  if (url.pathname.startsWith('/~oauth')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Never cache range requests (audio/video streaming)
  if (event.request.headers.get('range')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // External APIs (YouTube, Supabase, Google): always network, no cache
  if (isExternalApiRequest(url)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then(c => c || new Response('', { status: 503 })))
    );
    return;
  }

  // Navigation: network first with timeout for faster fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request, STATIC_CACHE, 5000).catch(async () => {
        const fallback = await caches.match('/');
        return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Hashed assets (contain hash in filename): cache first — they are immutable
  if (/\/assets\/.*\.[a-f0-9]{8,}\./.test(url.pathname)) {
    event.respondWith(
      cacheFirst(event.request, STATIC_CACHE)
    );
    return;
  }

  // Critical app assets: network first
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script'
  ) {
    event.respondWith(
      networkFirst(event.request, STATIC_CACHE, 4000).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // Media/static files: cache first
  if (
    event.request.destination === 'image' ||
    event.request.destination === 'font' ||
    event.request.destination === 'audio' ||
    event.request.destination === 'video'
  ) {
    event.respondWith(
      cacheFirst(event.request, MEDIA_CACHE)
    );
    return;
  }

  // Everything else: Network First with timeout
  event.respondWith(
    networkFirst(event.request, STATIC_CACHE, 4000).catch(() =>
      caches.match(event.request).then(c => c || new Response('', { status: 408 }))
    )
  );
});

// Background Sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(Promise.resolve());
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Xerife Switch', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'default',
      data: { url: data.url || '/' },
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
