// Operaciones de pdf-lib. Corren dentro de un worker (pdf-worker.js) para no congelar la página con PDF pesados;
// no tocan el DOM, así que también se pueden probar con node --test.
import { PDFArray, PDFDocument, PDFName, PDFRawStream, concatTransformationMatrix, degrees, popGraphicsState, pushGraphicsState } from "@cantoo/pdf-lib";
import { jpegOrientation, orientationMatrix, pngPixels } from "./exif.js";
import { t } from "./messages.js";
import { stripScripts } from "./pdf-clean.js";
import { parseRanges } from "./ranges.js";
import { UserError } from "./shared-ui.js";

const A4 = [595.28, 841.89];
// pdf-lib descomprime los PNG en memoria: uno de 0,2 MB puede ocupar gigas. Los JPG se incrustan sin decodificar.
const MAX_PNG_PIXELS = 64_000_000;
export const COMPRESSION = {
  low: { maxSide: 2400, quality: 0.8 },
  medium: { maxSide: 1600, quality: 0.65 },
  high: { maxSide: 1100, quality: 0.5 },
};

export const baseName = (name) => name.replace(/\.[^/.]+$/, "").replace(/[/\\]/g, "_");
const pdfBlob = (bytes) => new Blob([bytes], { type: "application/pdf" });
const isEncryptedError = (err) => err?.name === "EncryptedPDFError" || /encrypted/i.test(err?.message ?? "");

function friendlyPdfError(err) {
  if (err instanceof UserError) return err;
  console.error(err);
  if (isEncryptedError(err)) return new UserError(t.pdfEncrypted);
  if (err instanceof RangeError) return new UserError(t.outOfMemory);
  return new UserError(t.pdfDamaged);
}

async function openWithPdfLib(file) {
  try {
    return await PDFDocument.load(await file.arrayBuffer());
  } catch (err) {
    throw friendlyPdfError(err);
  }
}

async function copyPagesTo(output, source, indices) {
  const pages = await output.copyPages(source, indices);
  for (const page of pages) {
    stripScripts(page);
    output.addPage(page);
  }
  return pages;
}

/** Un PDF por cada rango. Devuelve [{ name, blob }]. */
export async function splitPdf(file, ranges, { onProgress = () => {} } = {}) {
  const source = await openWithPdfLib(file);
  const base = baseName(file.name);
  const outputs = [];
  try {
    for (const [index, range] of ranges.entries()) {
      onProgress(Math.round((index / ranges.length) * 100), t.renderingPart(index + 1, ranges.length));
      const output = await PDFDocument.create();
      await copyPagesTo(output, source, range.map((number) => number - 1));
      const label = range.length > 1 ? `${range[0]}-${range.at(-1)}` : range[0];
      outputs.push({ name: `${base}-${label}.pdf`, blob: pdfBlob(await output.save()) });
    }
    return outputs;
  } catch (err) {
    throw friendlyPdfError(err);
  }
}

/** Une los PDF en el orden recibido. `onItem` indica cuál se procesa, para señalarlo si falla. */
export async function mergePdfs(files, { onItem = () => {} } = {}) {
  const output = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
    onItem(index);
    const source = await openWithPdfLib(file);
    try {
      await copyPagesTo(output, source, source.getPageIndices());
    } catch (err) {
      throw friendlyPdfError(err);
    }
  }
  return pdfBlob(await output.save());
}

/** Una página A4 por imagen, según su orientación, sin agrandarla ni deformarla. */
export async function imagesToPdf(files, { onItem = () => {} } = {}) {
  const output = await PDFDocument.create();
  for (const [index, file] of files.entries()) {
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

/** Páginas en el orden pedido ("3, 1-2"), o todas si el texto está vacío. null si no es válido para ese PDF. */
export function pageOrder(text, pageCount) {
  return parseRanges(text, pageCount)?.flat() ?? null;
}

/** Reordena, quita, repite o gira páginas. Un PDF por archivo. */
export async function organizePdf(file, { order, rotate = 0 }, { onProgress = () => {} } = {}) {
  const source = await openWithPdfLib(file);
  const pages = pageOrder(order, source.getPageCount());
  if (!pages) throw new UserError(t.rangesInvalid(source.getPageCount()));
  onProgress(10, t.processing);
  try {
    const output = await PDFDocument.create();
    const copies = await copyPagesTo(output, source, pages.map((number) => number - 1));
    if (rotate) for (const page of copies) page.setRotation(degrees((page.getRotation().angle + rotate) % 360));
    return { name: `${baseName(file.name)}-${t.organizedSuffix}.pdf`, blob: pdfBlob(await output.save()) };
  } catch (err) {
    throw friendlyPdfError(err);
  }
}

/**
 * Datos de una imagen del PDF para decidir si se puede recomprimir. Solo JPEG de 8 bits en RGB o gris:
 * CMYK, paletas, máscaras o arreglos de color (Decode) se verían mal al pasar por un lienzo del navegador.
 */
export function describeImage(dict) {
  if (dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Image")) return null;
  const filter = dict.lookup(PDFName.of("Filter"));
  const filters = filter instanceof PDFArray ? filter.asArray().map((item) => item.toString()) : [filter?.toString()];
  let colorSpace = dict.lookup(PDFName.of("ColorSpace"));
  let components = { "/DeviceRGB": 3, "/DeviceGray": 1 }[colorSpace?.toString()];
  if (colorSpace instanceof PDFArray && colorSpace.lookup(0)?.toString() === "/ICCBased") {
    components = colorSpace.lookup(1)?.dict?.lookup(PDFName.of("N"))?.asNumber?.();
    colorSpace = "/ICCBased";
  }
  return {
    filters,
    components,
    bits: dict.lookup(PDFName.of("BitsPerComponent"))?.asNumber?.(),
    width: dict.lookup(PDFName.of("Width"))?.asNumber?.(),
    height: dict.lookup(PDFName.of("Height"))?.asNumber?.(),
    hasDecode: Boolean(dict.get(PDFName.of("Decode"))),
    isMask: dict.lookup(PDFName.of("ImageMask"))?.toString() === "true",
  };
}

export const canRecompress = (info) =>
  Boolean(info) && info.filters.length === 1 && info.filters[0] === "/DCTDecode" && (info.components === 3 || info.components === 1) && info.bits === 8 && !info.hasDecode && !info.isMask;

/** Tamaño reducido para que el lado mayor no pase de `maxSide`, sin agrandar nunca. */
export function targetSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const KEEP_KEYS = ["SMask", "Intent", "Interpolate", "Metadata", "OC"];

async function recompressImage(context, ref, stream, info, { maxSide, quality }) {
  // "none": el PDF ya coloca la imagen; aplicar la orientación EXIF del JPEG la giraría dos veces.
  const bitmap = await createImageBitmap(new Blob([stream.contents], { type: "image/jpeg" }), { imageOrientation: "none" });
  const { width, height } = targetSize(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer());
  if (bytes.length >= stream.contents.length) return 0;
  const replacement = context.stream(bytes, { Type: "XObject", Subtype: "Image", Width: width, Height: height, ColorSpace: "DeviceRGB", BitsPerComponent: 8, Filter: "DCTDecode" });
  for (const key of KEEP_KEYS) {
    const value = stream.dict.get(PDFName.of(key));
    if (value) replacement.dict.set(PDFName.of(key), value);
  }
  context.assign(ref, replacement);
  return stream.contents.length - bytes.length;
}

/** Recomprime las fotos JPEG del PDF. El texto y los vectores no cambian. Si no se gana nada, devuelve el original. */
export async function compressPdf(file, { level = "medium" }, { onProgress = () => {} } = {}) {
  const doc = await openWithPdfLib(file);
  const settings = COMPRESSION[level] ?? COMPRESSION.medium;
  const name = `${baseName(file.name)}-${t.compressedSuffix}.pdf`;
  try {
    const images = doc.context
      .enumerateIndirectObjects()
      .filter(([, object]) => object instanceof PDFRawStream && canRecompress(describeImage(object.dict)));
    for (const [index, [ref, stream]] of images.entries()) {
      onProgress(Math.round((index / images.length) * 90), t.compressingImage(index + 1, images.length));
      try {
        await recompressImage(doc.context, ref, stream, describeImage(stream.dict), settings);
      } catch (err) {
        console.warn("Imagen sin recomprimir:", err); // Una imagen que el navegador no lee se deja como estaba.
      }
    }
    onProgress(95, t.processing);
    const bytes = await doc.save({ useObjectStreams: true });
    if (bytes.length >= file.size) return { name, blob: new Blob([file], { type: "application/pdf" }), before: file.size, note: t.pdfAlreadyOptimized };
    return { name, blob: pdfBlob(bytes), before: file.size };
  } catch (err) {
    throw friendlyPdfError(err);
  }
}

