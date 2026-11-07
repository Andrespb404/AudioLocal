// Datos del encabezado de una imagen, leídos sin decodificarla.
// Orientación de las fotos de celular: el JPG guarda la imagen de lado y una etiqueta EXIF dice cómo mostrarla.

/** Ancho por alto de un PNG, según su bloque IHDR; 0 si está cortado. */
export function pngPixels(bytes) {
  if (bytes.byteLength < 24) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) * view.getUint32(20);
}

/** Valor de la etiqueta Orientation (1-8) de un JPG; 1 si no la tiene o el archivo está mal formado. */
export function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (view.getUint16(0) !== 0xffd8) return 1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === 0xffda || marker >>> 8 !== 0xff) return 1; // Empiezan los datos de imagen: ya no hay etiquetas.
      const isExif = marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966; // "Exif"
      if (isExif) return tiffOrientation(view, offset + 10);
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err; // Un archivo cortado no debe impedir usar la imagen.
  }
  return 1;
}

function tiffOrientation(view, tiff) {
  const little = view.getUint16(tiff) === 0x4949;
  const directory = tiff + view.getUint32(tiff + 4, little);
  const entries = view.getUint16(directory, little);
  for (let index = 0; index < entries; index++) {
    const entry = directory + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    const value = view.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

/**
 * Matriz [a, b, c, d, e, f] de PDF (eje Y hacia arriba) que coloca una imagen de w×h, guardada tal cual,
 * en la posición en que debe verse. Con orientación 5 o más, ancho y alto se intercambian.
 */
export function orientationMatrix(orientation, w, h) {
  return {
    2: [-1, 0, 0, 1, w, 0],
    3: [-1, 0, 0, -1, w, h],
    4: [1, 0, 0, -1, 0, h],
    5: [0, -1, -1, 0, h, w],
    6: [0, -1, 1, 0, 0, w],
    7: [0, 1, 1, 0, 0, 0],
    8: [0, 1, -1, 0, h, 0],
  }[orientation] ?? [1, 0, 0, 1, 0, 0];
}
