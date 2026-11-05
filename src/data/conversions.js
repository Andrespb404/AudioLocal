// Una entrada por página de conversión. Cada una necesita contenido propio: evita agregar variantes casi iguales.
export const conversions = [
  {
    id: 'mp3-wav',
    format: 'wav',
    slugs: { es: 'mp3-a-wav', en: 'mp3-to-wav' },
    es: {
      name: 'MP3 a WAV',
      title: 'Convertir MP3 a WAV gratis y sin subir archivos | AudioLocal',
      description: 'Convierte MP3 a WAV en tu navegador, gratis y por lotes. Tus archivos no se suben a ningún servidor y funciona sin conexión.',
      h1: 'Convertir MP3 a WAV gratis, sin subir archivos',
      intro: 'Pasa tus MP3 a WAV sin instalar nada. La conversión ocurre en tu navegador, así que el audio nunca sale de tu equipo.',
      when: [
        'Tu editor de audio o video funciona mejor con WAV.',
        'Vas a seguir editando el audio y no quieres sumar otra compresión al exportar.',
        'Un equipo o programa solo acepta audio sin comprimir.',
      ],
      expect: 'El WAV pesa bastante más que el MP3, pero no recupera la calidad que el MP3 ya perdió al comprimirse: el resultado suena igual que el archivo original.',
      faq: [
        { question: '¿Convertir MP3 a WAV mejora la calidad?', answer: 'No. La compresión del MP3 descarta información que no se puede recuperar. El WAV solo evita perder más calidad en los pasos siguientes.' },
        { question: '¿Cuánto más pesa el WAV?', answer: 'Un minuto en estéreo a 44.100 Hz ocupa unos 10 MB, mientras que un MP3 a 128 kbps ocupa cerca de 1 MB.' },
      ],
    },
    en: {
      name: 'MP3 to WAV',
      title: 'Convert MP3 to WAV for free, with no uploads | AudioLocal',
      description: 'Convert MP3 to WAV in your browser, free and in batches. Your files are never uploaded, and it works offline.',
      h1: 'Convert MP3 to WAV for free, with no uploads',
      intro: 'Turn your MP3 files into WAV without installing anything. The conversion runs in your browser, so the audio never leaves your device.',
      when: [
        'Your audio or video editor works better with WAV.',
        'You plan to keep editing and don\'t want another round of compression on export.',
        'A device or program only accepts uncompressed audio.',
      ],
      expect: 'The WAV will be much larger than the MP3, but it won\'t restore what MP3 compression removed: it sounds the same as your original file.',
      faq: [
        { question: 'Does converting MP3 to WAV improve quality?', answer: 'No. MP3 compression discards information that can\'t be recovered. WAV only prevents further loss in later steps.' },
        { question: 'How much bigger is a WAV file?', answer: 'One minute of stereo audio at 44,100 Hz takes about 10 MB, while a 128 kbps MP3 takes about 1 MB.' },
      ],
    },
  },
  {
    id: 'wav-mp3',
    format: 'mp3',
    slugs: { es: 'wav-a-mp3', en: 'wav-to-mp3' },
    es: {
      name: 'WAV a MP3',
      title: 'Convertir WAV a MP3 gratis y sin subir archivos | AudioLocal',
      description: 'Convierte WAV a MP3 a 128, 256 o 320 kbps en tu navegador. Gratis, por lotes y sin subir tus archivos a ningún servidor.',
      h1: 'Convertir WAV a MP3 gratis, sin subir archivos',
      intro: 'Reduce el tamaño de tus grabaciones sin instalar nada. Elige la calidad y convierte varios archivos a la vez, directamente en tu navegador.',
      when: [
        'Tus WAV ocupan demasiado para enviarlos o guardarlos.',
        'Necesitas un archivo que se reproduzca en casi cualquier dispositivo.',
        'Terminaste de editar y quieres una versión final para compartir.',
      ],
      expect: 'El MP3 ocupa mucho menos porque descarta parte de la información. Conserva tu WAV si vas a seguir editando: a 320 kbps la diferencia es difícil de notar, pero no es reversible.',
      faq: [
        { question: '¿Qué calidad de MP3 elijo?', answer: '128 kbps suele alcanzar para voz, 256 kbps es un buen equilibrio para música y 320 kbps da la mayor calidad a cambio de más tamaño.' },
        { question: '¿Cuánto pesa el MP3 resultante?', answer: 'Un minuto a 128 kbps ocupa cerca de 1 MB y a 320 kbps cerca de 2,4 MB. AudioLocal muestra una estimación antes de convertir.' },
      ],
    },
    en: {
      name: 'WAV to MP3',
      title: 'Convert WAV to MP3 for free, with no uploads | AudioLocal',
      description: 'Convert WAV to MP3 at 128, 256 or 320 kbps in your browser. Free, in batches, and your files are never uploaded.',
      h1: 'Convert WAV to MP3 for free, with no uploads',
      intro: 'Shrink your recordings without installing anything. Pick a quality and convert several files at once, right in your browser.',
      when: [
        'Your WAV files are too big to send or store.',
        'You need a file that plays on almost any device.',
        'You finished editing and want a final version to share.',
      ],
      expect: 'MP3 takes far less space because it discards some information. Keep your WAV if you plan to edit further: at 320 kbps the difference is hard to hear, but it can\'t be undone.',
      faq: [
        { question: 'Which MP3 quality should I choose?', answer: '128 kbps is usually enough for speech, 256 kbps is a good balance for music, and 320 kbps gives the highest quality at a larger size.' },
        { question: 'How big will the MP3 be?', answer: 'One minute takes about 1 MB at 128 kbps and about 2.4 MB at 320 kbps. AudioLocal shows an estimate before converting.' },
      ],
    },
  },
  {
    id: 'm4a-mp3',
    format: 'mp3',
    slugs: { es: 'm4a-a-mp3', en: 'm4a-to-mp3' },
    es: {
      name: 'M4A a MP3',
      title: 'Convertir M4A a MP3 gratis y sin subir archivos | AudioLocal',
      description: 'Convierte M4A a MP3 en tu navegador, ideal para notas de voz y audios del celular. Gratis, por lotes y sin subir archivos.',
      h1: 'Convertir M4A a MP3 gratis, sin subir archivos',
      intro: 'Muchas grabadoras de celular guardan en M4A. Pásalos a MP3 sin enviar tus grabaciones a ningún servidor, algo importante cuando son conversaciones privadas.',
      when: [
        'Un programa, página o reproductor antiguo no acepta M4A.',
        'Quieres compartir una nota de voz en un formato que todos puedan abrir.',
        'Tus grabaciones son privadas y prefieres no subirlas a un servicio en línea.',
      ],
      expect: 'Como M4A y MP3 comprimen con pérdida, convertir entre ellos no mejora la calidad y puede reducirla un poco. Para voz, 128 kbps suele ser suficiente. Los archivos con protección DRM no se pueden convertir.',
      faq: [
        { question: '¿Puedo convertir notas de voz del iPhone?', answer: 'Sí, si las exportas como M4A a tu dispositivo y tu navegador puede leerlas. Si no puede, AudioLocal te lo indica en la lista.' },
        { question: '¿Mis grabaciones se suben a algún lado?', answer: 'No. El navegador hace toda la conversión en tu equipo. Puedes comprobarlo activando el modo avión con la página abierta.' },
      ],
    },
    en: {
      name: 'M4A to MP3',
      title: 'Convert M4A to MP3 for free, with no uploads | AudioLocal',
      description: 'Convert M4A to MP3 in your browser, ideal for voice memos and phone recordings. Free, in batches, and with no uploads.',
      h1: 'Convert M4A to MP3 for free, with no uploads',
      intro: 'Many phone recorders save as M4A. Turn those files into MP3 without sending your recordings to a server, which matters when they are private conversations.',
      when: [
        'An older program, website or player won\'t accept M4A.',
        'You want to share a voice memo in a format anyone can open.',
        'Your recordings are private and you would rather not upload them to an online service.',
      ],
      expect: 'M4A and MP3 are both lossy, so converting between them won\'t improve quality and may lower it slightly. For speech, 128 kbps is usually enough. DRM-protected files can\'t be converted.',
      faq: [
        { question: 'Can I convert iPhone voice memos?', answer: 'Yes, if you export them to your device as M4A and your browser can read them. If it can\'t, AudioLocal tells you in the list.' },
        { question: 'Are my recordings uploaded anywhere?', answer: 'No. Your browser does all the work on your device. You can check by turning on airplane mode with the page open.' },
      ],
    },
  },
  {
    id: 'flac-mp3',
    format: 'mp3',
    slugs: { es: 'flac-a-mp3', en: 'flac-to-mp3' },
    es: {
      name: 'FLAC a MP3',
      title: 'Convertir FLAC a MP3 gratis y sin subir archivos | AudioLocal',
      description: 'Convierte FLAC a MP3 de hasta 320 kbps en tu navegador. Gratis, por lotes y sin subir tu música a ningún servidor.',
      h1: 'Convertir FLAC a MP3 gratis, sin subir archivos',
      intro: 'Lleva tu música en FLAC a un formato más liviano y compatible, sin instalar programas y sin subirla a ningún sitio.',
      when: [
        'Tu teléfono o reproductor se queda sin espacio.',
        'Tu auto o equipo de música no reproduce FLAC.',
        'Quieres una copia liviana para escuchar y conservar el original.',
      ],
      expect: 'FLAC no tiene pérdida y MP3 sí, así que guarda tus FLAC originales. Cada archivo puede pesar hasta 150 MB, y las etiquetas como artista o carátula no se copian al MP3.',
      faq: [
        { question: '¿Qué calidad conviene para música?', answer: '320 kbps es la opción más cercana al original y 256 kbps ahorra algo más de espacio con una diferencia difícil de notar para la mayoría.' },
        { question: '¿Se conservan el artista y la carátula?', answer: 'No. AudioLocal convierte solo el audio, así que tendrás que volver a agregar esas etiquetas si las necesitas.' },
      ],
    },
    en: {
      name: 'FLAC to MP3',
      title: 'Convert FLAC to MP3 for free, with no uploads | AudioLocal',
      description: 'Convert FLAC to MP3 at up to 320 kbps in your browser. Free, in batches, and your music is never uploaded.',
      h1: 'Convert FLAC to MP3 for free, with no uploads',
      intro: 'Move your FLAC music to a lighter, more compatible format, with nothing to install and nothing to upload.',
      when: [
        'Your phone or player is running out of space.',
        'Your car or stereo won\'t play FLAC.',
        'You want a lightweight listening copy and plan to keep the original.',
      ],
      expect: 'FLAC is lossless and MP3 isn\'t, so keep your original FLAC files. Each file can be up to 150 MB, and tags such as artist or cover art are not copied to the MP3.',
      faq: [
        { question: 'What quality is best for music?', answer: '320 kbps is closest to the original, while 256 kbps saves a bit more space with a difference most people won\'t notice.' },
        { question: 'Are artist tags and cover art kept?', answer: 'No. AudioLocal converts only the audio, so you will need to add those tags again if you want them.' },
      ],
    },
  },
  {
    id: 'ogg-mp3',
    format: 'mp3',
    slugs: { es: 'ogg-a-mp3', en: 'ogg-to-mp3' },
    es: {
      name: 'OGG a MP3',
      title: 'Convertir OGG a MP3 gratis y sin subir archivos | AudioLocal',
      description: 'Convierte OGG a MP3 en tu navegador, incluidos muchos audios de apps de mensajería. Gratis, por lotes y sin subir archivos.',
      h1: 'Convertir OGG a MP3 gratis, sin subir archivos',
      intro: 'OGG es habitual en notas de voz de apps de mensajería y en algunos juegos, pero no todos los programas lo abren. Conviértelo a MP3 sin que el audio salga de tu equipo.',
      when: [
        'Descargaste una nota de voz en OGG y no se abre en tu reproductor.',
        'Un programa de edición o una página solo acepta MP3.',
        'El audio es personal y no quieres subirlo a un convertidor en línea.',
      ],
      expect: 'Ambos formatos comprimen con pérdida, así que la conversión no mejora la calidad. Algunos navegadores no leen todas las variantes de OGG; si ocurre, verás el aviso en la lista y puedes probar con otro navegador.',
      faq: [
        { question: '¿Sirve para notas de voz de mensajería?', answer: 'Sí, si el archivo está en OGG y tu navegador puede leerlo. Primero debes guardarlo en tu dispositivo.' },
        { question: '¿Por qué no se abre mi archivo OGG?', answer: 'La lectura depende del navegador. Si AudioLocal no puede leerlo, prueba con Chrome, Edge o Firefox en tu computadora.' },
      ],
    },
    en: {
      name: 'OGG to MP3',
      title: 'Convert OGG to MP3 for free, with no uploads | AudioLocal',
      description: 'Convert OGG to MP3 in your browser, including many voice messages from chat apps. Free, in batches, and with no uploads.',
      h1: 'Convert OGG to MP3 for free, with no uploads',
      intro: 'OGG is common in voice messages from chat apps and in some games, but not every program opens it. Convert it to MP3 without the audio leaving your device.',
      when: [
        'You saved a voice message as OGG and your player won\'t open it.',
        'An editing program or website only accepts MP3.',
        'The audio is personal and you don\'t want to upload it to an online converter.',
      ],
      expect: 'Both formats are lossy, so converting won\'t improve quality. Some browsers can\'t read every OGG variant; if that happens, you will see a notice in the list and can try another browser.',
      faq: [
        { question: 'Does it work with chat voice messages?', answer: 'Yes, if the file is in OGG and your browser can read it. You need to save it to your device first.' },
        { question: 'Why won\'t my OGG file open?', answer: 'Reading support depends on the browser. If AudioLocal can\'t read it, try Chrome, Edge or Firefox on a computer.' },
      ],
    },
  },
  {
    id: 'aac-mp3',
    format: 'mp3',
    slugs: { es: 'aac-a-mp3', en: 'aac-to-mp3' },
    es: {
      name: 'AAC a MP3',
      title: 'Convertir AAC a MP3 gratis y sin subir archivos | AudioLocal',
      description: 'Convierte AAC a MP3 en tu navegador para reproducirlo en más dispositivos. Gratis, por lotes y sin subir archivos.',
      h1: 'Convertir AAC a MP3 gratis, sin subir archivos',
      intro: 'AAC comprime muy bien, pero algunos equipos más antiguos no lo reconocen. Pásalo a MP3 sin instalar nada y sin subir tus archivos.',
      when: [
        'Un reproductor, radio de auto o programa antiguo no reconoce AAC.',
        'Necesitas entregar el audio en MP3 porque así lo pide una plataforma.',
        'Quieres convertir varios archivos de una vez, sin enviarlos a un servidor.',
      ],
      expect: 'Para no perder más calidad de la necesaria, usa 256 o 320 kbps: AAC y MP3 comprimen con pérdida, y convertir entre ellos no la recupera. El MP3 puede pesar más que el AAC de origen.',
      faq: [
        { question: '¿AAC es mejor que MP3?', answer: 'A igual bitrate, AAC suele sonar algo mejor. MP3 gana en compatibilidad, que normalmente es el motivo para convertir.' },
        { question: '¿Por qué mi MP3 pesa más que el AAC?', answer: 'El tamaño depende de la calidad elegida. Si eliges 320 kbps para un AAC de menor bitrate, el archivo crece sin que el audio mejore.' },
      ],
    },
    en: {
      name: 'AAC to MP3',
      title: 'Convert AAC to MP3 for free, with no uploads | AudioLocal',
      description: 'Convert AAC to MP3 in your browser so it plays on more devices. Free, in batches, and with no uploads.',
      h1: 'Convert AAC to MP3 for free, with no uploads',
      intro: 'AAC compresses very well, but some older devices don\'t recognize it. Turn it into MP3 with nothing to install and nothing to upload.',
      when: [
        'An older player, car stereo or program doesn\'t recognize AAC.',
        'A platform requires your audio as MP3.',
        'You want to convert several files at once without sending them to a server.',
      ],
      expect: 'To avoid losing more quality than necessary, use 256 or 320 kbps: AAC and MP3 are both lossy, and converting between them can\'t restore quality. The MP3 may be larger than the source AAC.',
      faq: [
        { question: 'Is AAC better than MP3?', answer: 'At the same bitrate, AAC usually sounds a little better. MP3 wins on compatibility, which is normally the reason to convert.' },
        { question: 'Why is my MP3 bigger than the AAC?', answer: 'Size depends on the quality you choose. Picking 320 kbps for a lower-bitrate AAC makes the file larger without improving the audio.' },
      ],
    },
  },
];

export function conversionPaths(lang) {
  return conversions.map((conversion) => ({ params: { slug: conversion.slugs[lang] }, props: { conversion, lang } }));
}

export const conversionPath = (conversion, lang) =>
  lang === 'en' ? `/en/${conversion.slugs.en}.html` : `/${conversion.slugs.es}.html`;
