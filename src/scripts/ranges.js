/**
 * Convierte "1-3, 5" en [[1, 2, 3], [5]]: un archivo por cada parte separada por coma, punto y coma, "y" o "and".
 * Vacío significa una página por archivo. Devuelve null si el texto no es válido para ese PDF.
 */
export function parseRanges(text, pageCount) {
  const trimmed = text.trim();
  if (!trimmed) return Array.from({ length: pageCount }, (_, index) => [index + 1]);

  const ranges = [];
  for (const part of trimmed.split(/[,;]|\s(?:y|and)\s/i)) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return null;
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || last > pageCount || first > last) return null;
    ranges.push(Array.from({ length: last - first + 1 }, (_, index) => first + index));
  }
  return ranges;
}
