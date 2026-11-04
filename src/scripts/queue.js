// Estado de la cola por lotes. Sin DOM ni audio, para poder probarlo con node --test.

export const STATUS = {
  ANALYZING: "analyzing",
  PENDING: "pending",
  CONVERTING: "converting",
  DONE: "done",
  ERROR: "error",
};

export function createItem(id, file, rejection = null) {
  return {
    id,
    file,
    status: rejection ? STATUS.ERROR : STATUS.ANALYZING,
    error: rejection,
    retryable: false,
    progress: 0,
    stage: "",
    meta: null,
    result: null,
    downloaded: false,
    originalUrl: null,
  };
}

/**
 * Convierte de a uno los archivos pendientes. Mira la lista en cada vuelta, así que los archivos
 * agregados durante la ejecución también entran. Un fallo no detiene a los demás.
 */
export async function runQueue(items, convert, { signal, onChange = () => {} } = {}) {
  while (!signal?.aborted) {
    const item = items.find((candidate) => candidate.status === STATUS.PENDING);
    if (!item) return;

    Object.assign(item, { status: STATUS.CONVERTING, progress: 0, error: null });
    onChange(item);
    try {
      const result = await convert(item);
      Object.assign(item, { status: STATUS.DONE, progress: 100, result, downloaded: false });
    } catch (err) {
      if (signal?.aborted) {
        Object.assign(item, { status: STATUS.PENDING, progress: 0 });
        onChange(item);
        return;
      }
      Object.assign(item, {
        status: STATUS.ERROR,
        progress: 0,
        retryable: true,
        error: err?.message || "No se pudo convertir",
      });
    }
    onChange(item);
  }
}

/** Devuelve el archivo a pendiente. El resultado anterior queda a cargo de quien llama. */
export function requeue(item) {
  Object.assign(item, { status: STATUS.PENDING, error: null, progress: 0, result: null, downloaded: false });
}

export function countByStatus(items) {
  const counts = Object.fromEntries(Object.values(STATUS).map((status) => [status, 0]));
  for (const item of items) counts[item.status]++;
  return counts;
}

/** Texto del avance del lote, a partir de countByStatus. */
export function conversionLabel(counts) {
  const total = counts[STATUS.DONE] + counts[STATUS.CONVERTING] + counts[STATUS.PENDING];
  if (total <= 1) return "Convirtiendo";
  return `Convirtiendo ${Math.min(total, counts[STATUS.DONE] + 1)} de ${total}`;
}

export const hasUnsavedResults = (items) =>
  items.some((item) => item.status === STATUS.DONE && !item.downloaded);

export function outputName(fileName, ext) {
  const base = fileName.replace(/\.[^/.]+$/, "").replace(/[/\\]/g, "_");
  return `${base} (Converted).${ext}`;
}

/** Evita nombres repetidos dentro del ZIP; sin distinguir mayúsculas porque Windows no lo hace. */
export function uniqueName(name, taken) {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} ${n}${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}
