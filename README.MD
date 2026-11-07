# AudioLocal
Convierte audio, video y PDF gratis, sin registro y sin anuncios, en español e inglés.
Hoy todas las herramientas funcionan en el navegador.

## Herramientas
- **Audio:** MP3, WAV, OGG, AAC, M4A y FLAC, en lotes. También saca el audio de un video.
- **Video:** convierte y comprime MP4, MOV, M4V, MKV, WebM y TS.
- **PDF:** PDF a imágenes, imágenes a PDF, unir y dividir.

## Stack
- Astro (sitio estático, sin frameworks de UI)
- Web Audio API y lamejs para audio
- Mediabunny (WebCodecs) para video
- pdf.js y pdf-lib para PDF
- fflate para los ZIP

## Desarrollo
Requiere Node 24.

    npm install
    npm run dev
    npm test
    npm run build

## Componentes copiados a mano
`public/js/lame.min.js` es `lame.min.js` de [lamejs 1.2.1](https://www.npmjs.com/package/lamejs/v/1.2.1), sin modificar. `tests/licenses.test.js` comprueba su hash. Las licencias de todos los componentes están en `/licenses.html`.

## Deploy
Vercel. `vercel.json` define el framework y los headers de seguridad, incluida la CSP.
