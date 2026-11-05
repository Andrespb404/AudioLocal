# AudioLocal
Convertidor de audio 100% local. Convierte MP3, WAV, OGG y AAC, de a uno o por lotes,
directamente en tu navegador sin subir archivos a ningún servidor. Funciona sin conexión
después de la primera visita.

## Stack
- Astro (sitio estático, sin frameworks de UI)
- Web Audio API para procesamiento
- lamejs para encoding MP3, fflate para el ZIP

## Desarrollo
Requiere Node 22.23.4 o superior.

    npm install
    npm run dev
    npm test
    npm run build

## Deploy
Vercel. `vercel.json` define el framework y los headers de seguridad, incluida la CSP.
