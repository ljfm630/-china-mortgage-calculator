const CACHE_NAME = 'gjj-planner-pwa-v1'
const APP_SHELL = [
  './',
  './index.html',
  './icon.svg',
  './src/style.css?v=20261005-streamlined-ui',
  './src/entry-future-plan.js?v=2',
  './src/main.js?v=20261005-streamlined-ui',
  './src/mortgage.js',
  './src/payment-plan.js',
  './src/future-plan.js',
  './src/simulation-view.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
      return response
    }).catch(() => caches.match('./index.html')))
  )
})
