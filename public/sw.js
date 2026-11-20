const CACHE_VERSION = "__CACHE_VERSION__";
const APP_CACHE = `techramen-timer-${CACHE_VERSION}`;
const FONT_CACHE = "techramen-timer-fonts-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("techramen-timer-") && key !== APP_CACHE && key !== FONT_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cache Google Fonts with stale-while-revalidate for offline tablet usage
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              void cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first, fallback to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(APP_CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(APP_CACHE);
          return (await cache.match("./index.html")) || (await cache.match("./"));
        }),
    );
    return;
  }

  // Static assets: cache-first, fallback to network and update cache
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
