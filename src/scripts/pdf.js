// Operaciones de PDF en el navegador: pdf.js dibuja las páginas aquí, y pdf-lib crea los archivos nuevos en un worker.
import { GlobalWorkerOptions, PasswordException, getDocument } from "pdfjs-dist/build/pdf.min.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { baseName } from "./pdf-edit.js";
import { t } from "./messages.js";
import { UserError } from "./shared-ui.js";

export { baseName };

GlobalWorkerOptions.workerSrc = workerUrl;

const POINTS_PER_INCH = 72;
const MAX_CANVAS_SIDE = 8000;
const isEncryptedError = (err) => err instanceof PasswordException || err?.name === "EncryptedPDFError" || /encrypted/i.test(err?.message ?? "");

function friendlyPdfError(err) {
  if (err instanceof UserError) return err;
  console.error(err);
  if (isEncryptedError(err)) return new UserError(t.pdfEncrypted);
  if (err instanceof RangeError) return new UserError(t.outOfMemory);
  return new UserError(t.pdfDamaged);
}

async function openWithPdfJs(file) {
  let task;
  try {
    task = getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      useWasm: false,
      wasmUrl: "/pdfjs/wasm/",
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    });
    return await task.promise;
  } catch (err) {
    task?.destroy(); // Cada documento abre su propio worker: uno fallido no debe quedar vivo.
    throw friendlyPdfError(err);
  }
}

export async function pageCount(file) {
  const pdf = await openWithPdfJs(file);
  try {
    return pdf.numPages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Cada página a JPG o PNG. Devuelve [{ name, blob }]. */
export async function pdfToImages(file, { format, dpi }, { onProgress = () => {}, signal } = {}) {
  const pdf = await openWithPdfJs(file);
  const base = baseName(file.name);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const images = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted();
      onProgress(Math.round(((number - 1) / pdf.numPages) * 100), t.renderingPage(number, pdf.numPages));
      const page = await pdf.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      // El tope evita agotar la memoria con páginas enormes, como planos.
      const scale = Math.min(dpi / POINTS_PER_INCH, MAX_CANVAS_SIDE / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff"; // JPG no tiene transparencia, y el fondo de un PDF se ve blanco.
      context.fillRect(0, 0, canvas.width, canvas.height);
      // "print" evita requestAnimationFrame, que se detiene en pestañas ocultas y pausaría la conversión.
      await page.render({ canvas, canvasContext: context, viewport, background: "rgb(255,255,255)", intent: "print" }).promise;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new RangeError("canvas"))), mime, 0.92);
      });
      page.cleanup();
      canvas.width = 0; // Libera la memoria del lienzo sin esperar al recolector.
      const suffix = String(number).padStart(String(pdf.numPages).length, "0");
      images.push({ name: `${base}-${suffix}.${format}`, blob });
    }
    return images;
  } catch (err) {
    if (signal?.aborted) throw err;
    throw friendlyPdfError(err);
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Ejecuta una operación de pdf-edit.js en un worker propio. Cancelar lo termina, aunque esté a mitad de un archivo. */
function inWorker(op, args, { onItem = () => {}, onProgress = () => {}, signal } = {}) {
  signal?.throwIfAborted();
  // El nombre lleva el idioma: el worker no tiene documento del que leerlo.
  const worker = new Worker(new URL("./pdf-worker.js", import.meta.url), { type: "module", name: t.locale });
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", stop);
      worker.terminate();
    };
    const stop = () => {
      finish();
      reject(signal.reason);
    };
    signal?.addEventListener("abort", stop, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "item") onItem(data.index);
      else if (data.type === "progress") onProgress(data.value, data.stage);
      else {
        finish();
        if (data.type === "done") resolve(data.result);
        else reject(new UserError(data.message ?? t.pdfDamaged));
      }
    };
    worker.onerror = (event) => {
      console.error(event.message);
      finish();
      reject(new UserError(t.outOfMemory));
    };
    worker.postMessage({ op, args });
  });
}

/** Un PDF por cada rango. Devuelve [{ name, blob }]. */
export const splitPdf = (file, ranges, report) => inWorker("splitPdf", [file, ranges], report);
/** Une los PDF en el orden recibido. `onItem` indica cuál se procesa, para señalarlo si falla. */
export const mergePdfs = (files, report) => inWorker("mergePdfs", [files], report);
/** Una página A4 por imagen, según su orientación, sin agrandarla ni deformarla. */
export const imagesToPdf = (files, report) => inWorker("imagesToPdf", [files], report);
/** Reordena, quita o gira páginas. Devuelve { name, blob }. */
export const organizePdf = (file, settings, report) => inWorker("organizePdf", [file, settings], report);
/** Recomprime las fotos del PDF. Devuelve { name, blob, before, note? }. */
export const compressPdf = (file, settings, report) => inWorker("compressPdf", [file, settings], report);
