// App-shell cache only.
//
// Calendar API responses are deliberately never cached here: a stale hour count
// is worse than a brief spinner, and the app already keeps its own week cache in
// localStorage with a known fetch time.

// Stamped at build time by the stamp-service-worker plugin in vite.config.js, so
// each deploy gets a fresh cache and activate() retires the previous one. With a
// fixed name the old cache would survive every deploy and keep serving its
// contents indefinitely.
const VERSION = '__SW_VERSION__'
const CACHE = `work-tracker-${VERSION}`

// Vite fingerprints everything under assets/, so those URLs are immutable and
// safe to serve straight from the cache. Everything else - the HTML shell, the
// manifest, the icons - keeps its filename across deploys, so it has to go to
// the network first. Cache-first on those means a deploy is invisible: the
// browser keeps handing out the copy it saved on the very first visit.
const IMMUTABLE = /\/assets\//

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

function save(request, response) {
  // Opaque and error responses are not worth keeping, and caching them would
  // mask a failure as a success on the next load.
  if (!response.ok || response.type !== 'basic') return response
  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy))
  return response
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  return save(request, await fetch(request))
}

async function networkFirst(request) {
  try {
    return save(request, await fetch(request))
  } catch (error) {
    // Offline: fall back to whatever was last seen, and for a navigation fall
    // back to the shell so the app still opens.
    const cached = (await caches.match(request)) || (await caches.match('./'))
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Same-origin only: never touch accounts.google.com or googleapis.com.
  if (url.origin !== self.location.origin) return

  event.respondWith(IMMUTABLE.test(url.pathname) ? cacheFirst(request) : networkFirst(request))
})
