// Recorte de un archivo: qué fragmento convertir. Sin DOM, para poder probarlo con node --test.

/** Fragmento más corto que se puede marcar: evita un recorte vacío por dos clics seguidos. */
export const MIN_TRIM_SECONDS = 0.5;
// A menos de esto de un extremo, se toma el extremo: el reproductor rara vez queda exactamente en 0.
const SNAP_SECONDS = 0.05;

/**
 * Nuevo recorte al marcar el inicio o el fin en `time`. Si el punto deja el fragmento demasiado corto,
 * el otro extremo vuelve al borde del archivo. Devuelve null cuando el recorte abarca todo el archivo.
 */
export function applyTrimPoint(trim, which, time, duration) {
  const point = Math.min(Math.max(time, 0), duration);
  let start = which === "start" ? point : (trim?.start ?? 0);
  let end = which === "end" ? point : (trim?.end ?? duration);
  if (end - start < MIN_TRIM_SECONDS) {
    if (which === "start") end = duration;
    else start = 0;
  }
  if (start < SNAP_SECONDS) start = 0;
  if (end > duration - SNAP_SECONDS) end = duration;
  if (end - start < MIN_TRIM_SECONDS) return trim ?? null;
  return start === 0 && end === duration ? null : { start, end };
}

/** Duración que tendrá el resultado. */
export const trimmedDuration = (trim, duration) => (trim ? trim.end - trim.start : duration);

/** Tiempo con décimas, como "1:05.3": el recorte necesita más precisión que la duración de la lista. */
export function formatTime(seconds) {
  const tenths = Math.round(seconds * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}
