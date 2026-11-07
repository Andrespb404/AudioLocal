// Operaciones de PDF en el navegador: pdf.js dibuja las páginas y pdf-lib crea los archivos nuevos.
import { PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState } from "@cantoo/pdf-lib";
import { GlobalWorkerOptions, PasswordException, getDocument } from "pdfjs-dist/build/pdf.min.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { jpegOrientation, orientationMatrix, pngPixels } from "./exif.js";
import { stripScripts } from "./pdf-clean.js";
import { t } from "./messages.js";
import { UserError } from "./shared-ui.js";

GlobalWorkerOptions.workerSrc = workerUrl;

const POINTS_PER_INCH = 72;
const MAX_CANVAS_SIDE = 8000;
const A4 = [595.28, 841.89];
// pdf-lib descomprime los PNG en memoria: uno de 0,2 MB puede ocupar gigas. Los JPG se incrustan sin decodificar.
const MAX_PNG_PIXELS = 64_000_000;
const isEncryptedError = (err) => err instanceof PasswordException || err?.name === "EncryptedPDFError" || /encrypted/i.test(err?.message ?? "");
export const baseName = (name) => name.replace(/\.[^/.]+$/, "").replace(/[/\\]/g, "_");
const pdfBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });

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

async function openWithPdfLib(file) {
  try {
    return await PDFDocument.load(await file.arrayBuffer());
  } catch (err) {
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

/** Un PDF por cada rango. Devuelve [{ name, blob }]. */
export async function splitPdf(file, ranges, { onProgress = () => {}, signal } = {}) {
  const source = await openWithPdfLib(file);
  const base = baseName(file.name);
  const outputs = [];
  try {
    for (const [index, range] of ranges.entries()) {
      signal?.throwIfAborted();
      onProgress(Math.round((index / ranges.length) * 100), t.renderingPart(index + 1, ranges.length));
      const output = await PDFDocument.create();
      const pages = await output.copyPages(source, range.map((number) => number - 1));
      pages.forEach((page) => {
        stripScripts(page);
        output.addPage(page);
      });
      const label = range.length > 1 ? `${range[0]}-${range.at(-1)}` : range[0];
      outputs.push({ name: `${base}-${label}.pdf`, blob: pdfBlob(await output.save()) });
    }
    return outputs;
  } catch (err) {
    if (signal?.aborted) throw err;
    throw friendlyPdfError(err);
  }
}

/** Une los PDF en el orden recibido. `onItem` indica cuál se procesa, para señalarlo si falla. */
export async function mergePdfs(files, { onItem = () => {}, signal } = {}) {
  const output = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    onItem(index);
    const source = await openWithPdfLib(file);
    try {
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => {
        stripScripts(page);
        output.addPage(page);
      });
    } catch (err) {
      throw friendlyPdfError(err);
    }
  }
  return pdfBlob(await output.save());
}

/** Una página A4 por imagen, según su orientación, sin agrandarla ni deformarla. */
export async function imagesToPdf(files, { onItem = () => {}, signal } = {}) {
  const output = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    signal?.throwIfAborted();
    onItem(index);
    let image;
    let orientation = 1;
    try {
      const bytes = await file.arrayBuffer();
      const isPng = new Uint8Array(bytes, 0, 1)[0] === 0x89;
      if (isPng && pngPixels(new Uint8Array(bytes)) > MAX_PNG_PIXELS) throw new UserError(t.imageTooLarge);
      if (!isPng) orientation = jpegOrientation(new Uint8Array(bytes));
      image = isPng ? await output.embedPng(bytes) : await output.embedJpg(bytes);
    } catch (err) {
      if (err instanceof UserError) throw err;
      console.error(err);
      throw new UserError(t.imageUnreadable);
    }
    const [short, long] = A4;
    const shownWidth = orientation >= 5 ? image.height : image.width;
    const shownHeight = orientation >= 5 ? image.width : image.height;
    const landscape = shownWidth > shownHeight;
    const pageWidth = landscape ? long : short;
    const pageHeight = landscape ? short : long;
    const fit = Math.min(pageWidth / shownWidth, pageHeight / shownHeight, 1);
    const x = (pageWidth - shownWidth * fit) / 2;
    const y = (pageHeight - shownHeight * fit) / 2;
    const [a, b, c, d, e, f] = orientationMatrix(orientation, image.width, image.height);
    const page = output.addPage([pageWidth, pageHeight]);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(fit * a, fit * b, fit * c, fit * d, x + fit * e, y + fit * f));
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    page.pushOperators(popGraphicsState());
  }
  return pdfBlob(await output.save());
}
