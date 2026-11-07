// Salida de video guardada por partes: el navegador puede pasar los Blob a disco, y un ArrayBuffer no.
export const PART_SIZE = 16 * 1024 ** 2;

/** Escribe `data` en su posición, encima de lo ya guardado. Los formatos reescriben sus cabeceras al terminar. `data` no cruza partes. */
export function writeAt(parts, data, position, partSize = PART_SIZE) {
  const index = Math.floor(position / partSize);
  const offset = position - index * partSize;
  const old = parts[index] ?? new Blob();
  parts[index] = new Blob([old.slice(0, offset), new Uint8Array(Math.max(0, offset - old.size)), data, old.slice(offset + data.length)]);
}
