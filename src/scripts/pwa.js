const CACHE_NAME = "audiolocal-v1";
const PAGES = ["/", "/about.html", "/privacy.html", "/terms.html"];

// Los recursos de esta primera carga se pidieron antes de que existiera el service worker, y se
// puede entrar por cualquier página: se guardan todas con sus assets para funcionar sin conexión.
async function cacheSite() {
  const cache = await caches.open(CACHE_NAME);
  const urls = new Set([...PAGES, "/js/lame.min.js"]);

  for (const entry of performance.getEntriesByType("resource")) {
    const url = new URL(entry.name);
    if (url.origin === location.origin) urls.add(url.pathname);
  }
  for (const page of PAGES) {
    const html = await (await fetch(page)).text();
    for (const [asset] of html.matchAll(/\/_astro\/[^"'\s)]+/g)) urls.add(asset);
  }

  const results = await Promise.allSettled([...urls].map((url) => cache.add(url)));

  // Los assets llevan un hash en el nombre: los de versiones anteriores ya no se usan.
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/_astro/") && !urls.has(pathname)) await cache.delete(request);
  }
  return results.every((result) => result.status === "fulfilled");
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const status = document.getElementById("offlineStatus");
  addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (await cacheSite()) status.textContent = "Listo sin conexión";
    } catch (err) {
      console.warn("Modo sin conexión no disponible:", err);
    }
  });
}
