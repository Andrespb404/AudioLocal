import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { defineConfig } from 'astro/config';

// pdf.js pide estos archivos en tiempo de ejecución: se copian para que vengan de este mismo dominio.
const pdfjsAssets = {
  name: 'pdfjs-assets',
  hooks: {
    'astro:config:setup': () => {
      const from = 'node_modules/pdfjs-dist';
      for (const folder of ['standard_fonts', 'cmaps']) cpSync(`${from}/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
      mkdirSync('public/pdfjs/wasm', { recursive: true });
      // Sin WASM para no abrir la CSP: solo hacen falta los decodificadores en JavaScript.
      for (const file of readdirSync(`${from}/wasm`).filter((name) => name.endsWith('_nowasm_fallback.js'))) {
        cpSync(`${from}/wasm/${file}`, `public/pdfjs/wasm/${file}`);
      }
    },
  },
};

export default defineConfig({
  site: 'https://audiolocal.app',
  integrations: [pdfjsAssets],
  // Mantiene /about.html, /privacy.html y /terms.html, que ya están indexadas.
  build: { format: 'file', inlineStylesheets: 'never' },
  // Sin scripts inline: la CSP de vercel.json solo permite script-src 'self'.
  vite: { build: { assetsInlineLimit: 0 } },
});
