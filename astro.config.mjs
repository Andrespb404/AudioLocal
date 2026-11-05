import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://audiolocal.app',
  // Mantiene /about.html, /privacy.html y /terms.html, que ya están indexadas.
  build: { format: 'file', inlineStylesheets: 'never' },
  // Sin scripts inline: la CSP de vercel.json solo permite script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
