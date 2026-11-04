// Red primero, caché como respaldo: los usuarios siempre reciben la última versión si tienen conexión.
const CACHE_NAME = "audiolocal-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        throw err;
      }
    })(),
  );
});
