import { t } from "./messages.js";

const CACHE_NAME = "audiolocal-v2";
const PAGES = ["/", "/about.html", "/privacy.html", "/terms.html", "/en.html", "/en/about.html", "/en/privacy.html", "/en/terms.html"];

// Los recursos de esta primera carga se pidieron antes de que existiera el service worker, y se
// puede entrar por cualquier página: se guardan con sus assets para funcionar sin conexión.
// Se siguen también las importaciones dinámicas y el worker de PDF: si no, la herramienta abierta
// aparecería lista sin conexión y fallaría al usarla.
async function cacheSite() {
  const cache = await caches.open(CACHE_NAME);
  const urls = new Set([...PAGES, location.pathname, "/js/lame.min.js"]);

  for (const entry of performance.getEntriesByType("resource")) {
    const url = new URL(entry.name);
    if (url.origin === location.origin) urls.add(url.pathname);
  }
  for (const page of PAGES) {
    const html = await (await fetch(page)).text();
    for (const [asset] of html.matchAll(/\/_astro\/[^"'\s)]+/g)) urls.add(asset);
  }
  // Los scripts se dividen en partes que el HTML no nombra: hay que seguir lo que referencian.
  // Se exige el hash del nombre: pdf.js también menciona "./pdf.worker.mjs", que no existe.
  const pending = [...urls].filter((url) => url.endsWith(".js") && url.startsWith("/_astro/"));
  for (const script of pending) {
    const code = await (await fetch(script)).text();
    for (const [, file] of code.matchAll(/["'`](?:\.\/|\/?_astro\/)([^"'`/]+\.[\w-]{8}\.m?js)["'`]/g)) {
      const chunk = `/_astro/${file}`;
      if (!urls.has(chunk)) {
        urls.add(chunk);
        if (chunk.endsWith(".js")) pending.push(chunk);
      }
    }
  }

  const results = await Promise.allSettled([...urls].map((url) => cache.add(url)));

  // Los assets llevan un hash: los que ya no existen en el servidor son de versiones anteriores.
  // No se borran por no estar en la lista, porque los de video y PDF se guardan al abrir esas herramientas.
  for (const request of await cache.keys()) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/_astro/") || urls.has(pathname)) continue;
    const response = await fetch(pathname, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (response?.status === 404) await cache.delete(request);
  }
  return results.every((result) => result.status === "fulfilled");
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const status = document.getElementById("offlineStatus");
  addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (await cacheSite()) status.textContent = t.offlineReady;
    } catch (err) {
      console.warn("Modo sin conexión no disponible:", err);
    }
  });
}
