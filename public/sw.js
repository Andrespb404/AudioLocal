// Red primero, caché como respaldo: los usuarios siempre reciben la última versión si tienen conexión.
const CACHE_NAME = "audiolocal-v2";

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
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          // Por ruta, sin la query: "/?utm=x" y "/" son la misma página, y una copia vieja no debe sobrevivir a un despliegue.
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, copy)));
        }
        return response;
      } catch (err) {
        const cached = await caches.match(url.pathname);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const home = await caches.match(url.pathname.startsWith("/en") ? "/en.html" : "/");
          if (home) return home;
        }
        throw err;
      }
    })(),
  );
});
