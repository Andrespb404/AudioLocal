// Utilidades de interfaz comunes a todas las herramientas.
import { Zip, ZipPassThrough } from "fflate";

export const ZIP_MAX_BYTES = 4 * 1024 ** 3;
const ZIP_FLUSH_BYTES = 32 * 1024 ** 2;
const ROW_LEAVE_MS = 220;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export const $ = (id) => document.getElementById(id);

export function setText(element, text) {
  // Evita que los lectores de pantalla repitan un estado que no cambió.
  if (element.textContent !== text) element.textContent = text;
}

export function showToast(message, type = "info") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => toast.classList.remove("show"), 4000);
}

export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// shortcut: fflate no escribe ZIP64, así que el total se limita a 4 GB; cambiar de librería si hace falta más.
export async function zipBlobs(files) {
  // Se lee y se escribe por partes: en Blobs, el navegador puede pasar a disco lo que no quepa en memoria.
  const parts = [];
  let chunks = [];
  let buffered = 0;
  const flush = () => {
    parts.push(new Blob(chunks));
    chunks = [];
    buffered = 0;
  };
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    chunks.push(chunk);
    buffered += chunk.length;
    if (buffered >= ZIP_FLUSH_BYTES) flush();
  });
  for (const { name, blob } of files) {
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    const reader = blob.stream().getReader();
    for (;;) {
      const { done, value } = await reader.read();
      entry.push(value ?? new Uint8Array(0), done);
      if (done) break;
    }
  }
  zip.end();
  flush();
  return new Blob(parts, { type: "application/zip" });
}

// Lee el token para que el JS y el CSS siempre coincidan sobre "reducir movimiento".
const motionEnabled = () => getComputedStyle(document.documentElement).getPropertyValue("--rise").trim() !== "0px";

// El DOM se limpia con un temporizador: si la pestaña no pinta, la animación no terminaría nunca.
export function animateRowOut(row) {
  row.inert = true;
  const style = getComputedStyle(row);
  const keyframes = { opacity: [1, 0] };
  if (motionEnabled()) {
    Object.assign(keyframes, {
      height: [`${row.offsetHeight}px`, "0px"],
      minHeight: [style.minHeight, "0px"],
      paddingTop: [style.paddingTop, "0px"],
      paddingBottom: [style.paddingBottom, "0px"],
      marginBottom: [style.marginBottom, "0px"],
    });
  }
  row.animate(keyframes, { duration: ROW_LEAVE_MS, easing: EASE, fill: "forwards" });
  setTimeout(() => row.remove(), ROW_LEAVE_MS);
}

// El texto visible va al inicio de la etiqueta, para que el control por voz lo encuentre.
export function setRowButton(button, label, fileName) {
  setText(button, label);
  button.setAttribute("aria-label", `${label} ${fileName}`);
}

/** Selector de archivos y arrastre en toda la página: soltar fuera de la tarjeta no debe navegar al archivo. */
export function bindFilePicker(onFiles, dropText) {
  const fileInput = $("fileInput");
  const title = $("dropzoneTitle");
  const openPicker = () => fileInput.click();
  $("dropzone").addEventListener("click", openPicker);
  $("btnAddMore").addEventListener("click", openPicker);
  fileInput.addEventListener("change", () => {
    onFiles(fileInput.files);
    fileInput.value = "";
  });

  let idleText = title.textContent;
  const setDragging = (dragging) => {
    // El texto puede cambiar según el modo: se recuerda el que había al empezar a arrastrar.
    if (dragging && !document.body.classList.contains("drag-over")) idleText = title.textContent;
    document.body.classList.toggle("drag-over", dragging);
    setText(title, dragging ? dropText : idleText);
  };
  const carriesFiles = (event) => event.dataTransfer?.types.includes("Files");
  document.addEventListener("dragover", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) setDragging(false);
  });
  document.addEventListener("drop", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    onFiles(event.dataTransfer.files);
  });
}

/** Error cuyo texto ya está pensado para mostrarse al usuario. */
export class UserError extends Error {}
