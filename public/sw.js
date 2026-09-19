// App-shell cache only.
//
// Calendar API responses are deliberately never cached here: a stale hour count
// is worse than a brief spinner, and the app already keeps its own week cache in
// localStorage with a known fetch time.

const CACHE = 'work-tracker-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('./')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Same-origin only: never touch accounts.google.com or googleapis.com.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)

      // Cached shell first for an instant launch, refreshed in the background.
      return cached || network
    }),
  )
})
