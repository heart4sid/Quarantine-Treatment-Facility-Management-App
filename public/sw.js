/**
 * Service Worker — App Shell Pre-caching and Offline Resilience.
 * TRD §9: "Service worker precaches the app shell and the user's task list;
 * stale-while-revalidate for reads."
 */

const CACHE_NAME = "quarantine-v1";
const PRECACHE_URLS = [
  "/",
  "/dashboard/nurse",
  "/dashboard/doctor",
  "/dashboard/beds",
  "/dashboard/waitlist",
  "/dashboard/discharge-queue",
  "/dashboard/facility",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Stale-while-revalidate for task list read APIs
  if (url.pathname.startsWith("/api/v1/tasks/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-first for mutating APIs; offline outbox handles writes
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Cache-first / Stale-while-revalidate for app shell and assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Revalidate in background
        fetch(event.request)
          .then((fresh) => {
            if (fresh.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, fresh));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request).then((res) => {
        if (res.ok && event.request.method === "GET") {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      });
    })
  );
});
