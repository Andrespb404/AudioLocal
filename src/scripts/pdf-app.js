// Interfaz de la herramienta de PDF. Reutiliza la cola y las filas de las demás herramientas.
import { formatBytes } from "./audio.js";
import { t } from "./messages.js";
import { baseName, imagesToPdf, mergePdfs, pageCount, pdfToImages, splitPdf } from "./pdf.js";
import { STATUS, conversionLabel, countByStatus, createItem, errorSummary, hasUnsavedResults, requeue, runQueue, uniqueName } from "./queue.js";
import { parseRanges } from "./ranges.js";
import { $, UserError, ZIP_MAX_BYTES, animateRowOut, bindFilePicker, saveFile, setRowButton, setText, showToast, zipBlobs } from "./shared-ui.js";

const MAX_PDF_SIZE = 200 * 1024 * 1024;
const ZIP_DONE_MS = 2200;
const STORE = "audiolocal-pdf";
const MODES = {
  "to-images": { accept: ".pdf,application/pdf", ordered: false, kind: "pdf" },
  "from-images": { accept: ".jpg,.jpeg,.png,image/jpeg,image/png", ordered: true, kind: "image" },
  merge: { accept: ".pdf,application/pdf", ordered: true, kind: "pdf" },
  split: { accept: ".pdf,application/pdf", ordered: false, kind: "pdf" },
};

const modeRadios = [...document.querySelectorAll('input[name="pdfMode"]')];
const imageFormatRadios = [...document.querySelectorAll('input[name="imageFormat"]')];
const dpiSelect = $("pdfDpi");
const rangesInput = $("pdfRanges");
const rangesHintText = $("rangesHint").textContent;
const queueList = $("queueList");
const rowTemplate = $("queueRowTemplate");
const btnConvert = $("btnConvert");
const btnCancel = $("btnCancel");
const btnZip = $("btnZip");
const btnClear = $("btnClear");
const btnAgain = $("btnAgain");

const items = [];
const rows = new Map();
let nextId = 1;
let analysis = Promise.resolve();
let converting = null;
let combined = null; // Resultado único de "unir" e "imágenes a PDF": { blob, name, downloaded }
let zipLabel = null;
let zipLabelTimer = null;
let parked = []; // Archivos que no sirven para el modo actual: vuelven si el usuario regresa a uno que los admita.

const currentMode = () => modeRadios.find((radio) => radio.checked).value;
const mode = () => MODES[currentMode()];

function validate(file) {
  if (mode().kind === "image") {
    const isImage = /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    return isImage ? null : t.imageInvalid;
  }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return t.pdfInvalid;
  return file.size > MAX_PDF_SIZE ? t.pdfTooLarge : null;
}

function rowMeta(item) {
  if (item.status === STATUS.ERROR) return item.error;
  if (item.status === STATUS.ANALYZING) return t.analyzing;
  if (item.status === STATUS.CONVERTING) return `${item.stage || t.converting}… ${item.progress}%`;
  const size = formatBytes(item.file.size);
  if (item.status === STATUS.DONE && item.result) return `${t.filesCreated(item.result.count)} · ${formatBytes(item.result.blob.size)}`;
  return item.meta?.pages ? `${t.pagesCount(item.meta.pages)} · ${size}` : size;
}

function createRow(item, order = 0) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  const { name } = item.file;
  row.dataset.id = item.id;
  row.style.setProperty("--i", Math.min(order, 8));
  const nameField = row.querySelector('[data-field="name"]');
  nameField.textContent = name;
  nameField.title = name;
  row.querySelector('[data-field="progress"]').setAttribute("aria-label", t.progressOf(name));
  row.querySelector('[data-action="play"]').hidden = true;
  setRowButton(row.querySelector('[data-action="retry"]'), t.retry, name);
  setRowButton(row.querySelector('[data-action="remove"]'), t.remove, name);
  setRowButton(row.querySelector('[data-action="up"]'), t.moveUp, name);
  rows.set(item.id, row);
  queueList.append(row);
  return row;
}

function updateRow(item) {
  const row = rows.get(item.id) ?? createRow(item);
  const busy = item.status === STATUS.CONVERTING;
  const isError = item.status === STATUS.ERROR;
  const hasOwnResult = item.status === STATUS.DONE && Boolean(item.result);

  row.classList.toggle("is-busy", busy);
  row.classList.toggle("is-done", item.status === STATUS.DONE);
  row.classList.toggle("is-error", isError);
  row.style.setProperty("--p", item.progress / 100);
  row.querySelector('[data-field="meta"]').textContent = rowMeta(item);
  row.querySelector('[data-field="eq"]').hidden = !(busy || item.status === STATUS.ANALYZING);

  const progress = row.querySelector('[data-field="progress"]');
  progress.hidden = !busy;
  progress.value = item.progress;

  const action = (name) => row.querySelector(`[data-action="${name}"]`);
  action("download").hidden = !hasOwnResult;
  action("download").classList.toggle("is-saved", item.downloaded);
  setRowButton(action("download"), item.downloaded ? t.downloaded : t.download, item.file.name);
  action("retry").hidden = !(isError && item.retryable);
  action("up").hidden = !mode().ordered || items.indexOf(item) === 0 || Boolean(converting) || Boolean(combined);
  // Unir toma la lista al empezar: quitar un archivo a mitad no lo sacaría del resultado.
  action("remove").disabled = busy || (Boolean(converting) && mode().ordered);
}

const updateAllRows = () => items.forEach(updateRow);

/** Una sola acción principal por estado, igual que en audio y video. */
function updateState() {
  const counts = countByStatus(items);
  const running = Boolean(converting);
  const hasWork = counts.pending + counts.analyzing > 0;
  let state = "queue";
  if (items.length === 0) state = "empty";
  else if ((counts.done > 0 || combined) && !hasWork && !running) state = "done";
  document.body.dataset.state = state;

  $("dropzone").hidden = state !== "empty";
  $("trustLine").hidden = state !== "empty";
  $("filesSection").hidden = state === "empty";
  $("actions").hidden = state === "empty";
  $("pdfModes").hidden = running || state === "done";
  $("btnAddMore").hidden = running && mode().ordered;

  const currentModeName = currentMode();
  $("optionsSection").hidden = state !== "queue" || running || !["to-images", "split"].includes(currentModeName);
  $("imageOptions").hidden = currentModeName !== "to-images";
  $("splitOptions").hidden = currentModeName !== "split";

  btnConvert.hidden = running || state === "done";
  const needsTwo = currentModeName === "merge" && counts.pending === 1;
  const badRanges = currentModeName === "split" && items.find((item) => item.status === STATUS.PENDING && !parseRanges(rangesInput.value, item.meta.pages));
  rangesInput.setAttribute("aria-invalid", String(Boolean(badRanges)));
  setText($("rangesHint"), badRanges ? t.rangesInvalid(badRanges.meta.pages) : rangesHintText);
  btnConvert.disabled = counts.pending === 0 || needsTwo || Boolean(badRanges);
  setText(btnConvert, needsTwo ? t.needTwo : counts.pending === 0 && counts.analyzing ? t.analyzing : t.pdfActions[currentModeName]);
  btnCancel.hidden = !running;

  const singleOutput = combined || (counts.done === 1 && items.find((item) => item.result));
  btnZip.hidden = (counts.done === 0 && !combined) || running;
  btnZip.classList.toggle("btn-primary", state === "done");
  btnZip.classList.toggle("btn-wide", state === "done");
  setText($("zipLabel"), zipLabel ?? (singleOutput ? t.download : t.downloadAll));
  btnClear.hidden = running;
  btnAgain.hidden = state !== "done";

  let title = t.files;
  if (state === "done") title = counts.done === 1 || combined ? t.oneReady : t.manyReady(counts.done);
  setText($("filesTitle"), title);

  const parts = [];
  if (running) parts.push(conversionLabel(counts));
  else {
    if (counts.analyzing) parts.push(t.analyzingCount(counts.analyzing));
    if (counts.pending) parts.push(t.pendingCount(counts.pending));
    if (counts.done && state !== "done") parts.push(t.readyCount(counts.done));
  }
  if (combined && !running) parts.push(`${combined.name} · ${formatBytes(combined.blob.size)}`);
  if (counts.error) parts.push(errorSummary(items));
  setText($("queueStatus"), parts.join(" · "));
  $("statusEq").hidden = !(running || counts.analyzing);
}

async function analyze(item) {
  if (!items.includes(item)) return;
  try {
    const pages = await pageCount(item.file);
    Object.assign(item, { status: STATUS.PENDING, meta: { pages } });
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    Object.assign(item, { status: STATUS.ERROR, error: err instanceof UserError ? err.message : t.pdfDamaged });
  }
  if (!items.includes(item)) return;
  updateRow(item);
  updateState();
}

function addFiles(files, { focus = true } = {}) {
  const wasEmpty = items.length === 0;
  dropCombined();
  [...files].forEach((file, order) => {
    const rejection = validate(file);
    const item = createItem(nextId++, file, rejection);
    items.push(item);
    createRow(item, order);
    if (!rejection && mode().kind === "image") Object.assign(item, { status: STATUS.PENDING, meta: {} });
    // Uno a la vez: abrir varios PDF grandes en paralelo puede agotar la memoria.
    if (!rejection && mode().kind === "pdf") analysis = analysis.then(() => analyze(item));
  });
  updateAllRows();
  updateState();
  if (focus && wasEmpty && items.length) $("filesTitle").focus();
}

function removeItem(item) {
  const row = rows.get(item.id);
  const hadFocus = row.contains(document.activeElement);
  items.splice(items.indexOf(item), 1);
  rows.delete(item.id);
  animateRowOut(row);
  dropCombined();
  updateAllRows();
  updateState();
  if (hadFocus) (items.length ? $("filesTitle") : $("btnBrowse")).focus();
}

/** Cambiar la lista invalida el PDF combinado: los archivos vuelven a estar pendientes. */
function dropCombined() {
  if (!combined) return;
  combined = null;
  for (const item of items) if (item.status === STATUS.DONE) requeue(item);
}

function moveUp(item) {
  const index = items.indexOf(item);
  if (index < 1) return;
  items.splice(index - 1, 0, items.splice(index, 1)[0]);
  rows.get(item.id).after(rows.get(items[index].id));
  updateAllRows();
  // Al llegar arriba, "Mover arriba" se oculta y el foco no debe perderse.
  const row = rows.get(item.id);
  const up = row.querySelector('[data-action="up"]');
  (up.hidden ? row.querySelector('[data-action="remove"]') : up).focus({ preventScroll: true });
}

const hasUnsaved = () => hasUnsavedResults(items.filter((item) => item.result)) || Boolean(combined && !combined.downloaded);

// ==================== CONVERTIR ====================
function settingsFor(name) {
  if (name === "to-images") return { format: imageFormatRadios.find((radio) => radio.checked).value, dpi: Number(dpiSelect.value) };
  return { ranges: rangesInput.value };
}

async function perFile(name, signal) {
  const settings = settingsFor(name);
  await runQueue(
    items,
    async (item) => {
      const report = {
        signal,
        onProgress: (progress, stage) => {
          item.progress = progress;
          item.stage = stage;
          updateRow(item);
        },
      };
      let outputs;
      if (name === "to-images") outputs = await pdfToImages(item.file, settings, report);
      else {
        const ranges = parseRanges(settings.ranges, item.meta.pages);
        if (!ranges) throw new UserError(t.rangesInvalid(item.meta.pages));
        outputs = await splitPdf(item.file, ranges, report);
      }
      if (outputs.length === 1) return { ...outputs[0], count: 1 };
      const taken = new Set();
      const entries = outputs.map((output) => ({ ...output, name: uniqueName(output.name, taken) }));
      return { name: `${baseName(item.file.name)}.zip`, blob: await zipBlobs(entries), count: outputs.length };
    },
    {
      signal,
      onChange: (item) => {
        updateRow(item);
        updateState();
      },
    },
  );
}

async function combine(name, signal) {
  const pending = items.filter((item) => item.status === STATUS.PENDING);
  let currentIndex = 0;
  const report = {
    signal,
    onItem: (index) => {
      pending.forEach((item, position) => {
        item.status = position <= index ? STATUS.CONVERTING : STATUS.PENDING;
        item.progress = Math.round((position < index ? 1 : 0) * 100);
        item.stage = position < index ? t.ready : t.processing;
        updateRow(item);
      });
      currentIndex = index;
      updateState();
    },
  };
  try {
    const files = pending.map((item) => item.file);
    const blob = name === "merge" ? await mergePdfs(files, report) : await imagesToPdf(files, report);
    pending.forEach((item) => Object.assign(item, { status: STATUS.DONE, progress: 100 }));
    combined = { blob, name: name === "merge" ? t.mergedName : t.imagesPdfName, downloaded: false };
  } catch (err) {
    pending.forEach((item) => Object.assign(item, { status: STATUS.PENDING, progress: 0 }));
    if (!signal.aborted) {
      // Solo este archivo queda en error: el usuario puede quitarlo y volver a intentar con los demás.
      Object.assign(pending[currentIndex], { status: STATUS.ERROR, retryable: false, error: err instanceof UserError ? err.message : t.pdfDamaged });
    }
  }
}

async function start() {
  const hadFocus = document.activeElement === btnConvert;
  converting = new AbortController();
  const { signal } = converting;
  const name = currentMode();
  updateAllRows();
  updateState();
  if (hadFocus) btnCancel.focus();
  if (mode().ordered) {
    await combine(name, signal);
    // Si llegó un archivo durante la ejecución (arrastrándolo), el resultado no lo incluye: no debe ofrecerse como completo.
    if (items.some((item) => item.status === STATUS.PENDING || item.status === STATUS.ANALYZING)) dropCombined();
  } else await perFile(name, signal);
  const focusLost = document.activeElement === btnCancel;
  converting = null;
  updateAllRows();
  updateState();
  if (focusLost) (document.body.dataset.state === "done" ? btnZip : btnConvert).focus();
  if (signal.aborted) showToast(t.cancelled);
}

// ==================== DESCARGAR ====================
function setZipLabel(text, clearAfter = 0) {
  clearTimeout(zipLabelTimer);
  zipLabel = text;
  updateState();
  if (clearAfter) zipLabelTimer = setTimeout(() => setZipLabel(null), clearAfter);
}

function downloadItem(item) {
  saveFile(item.result.blob, item.result.name);
  item.downloaded = true;
  updateRow(item);
}

async function downloadAll() {
  if (combined) {
    saveFile(combined.blob, combined.name);
    combined.downloaded = true;
    return setZipLabel(t.downloaded, ZIP_DONE_MS);
  }
  const done = items.filter((item) => item.status === STATUS.DONE && item.result);
  if (done.length === 1) {
    downloadItem(done[0]);
    return setZipLabel(t.downloaded, ZIP_DONE_MS);
  }
  if (done.reduce((sum, item) => sum + item.result.blob.size, 0) >= ZIP_MAX_BYTES) return showToast(t.zipTooLarge, "error");

  btnZip.disabled = true;
  $("zipEq").hidden = false;
  setZipLabel(t.zipPreparing);
  try {
    const taken = new Set();
    const zip = await zipBlobs(done.map((item) => ({ name: uniqueName(item.result.name, taken), blob: item.result.blob })));
    saveFile(zip, "AudioLocal.zip");
    done.forEach((item) => (item.downloaded = true));
    updateAllRows();
    setZipLabel(t.downloaded, ZIP_DONE_MS);
  } catch (err) {
    console.error(err);
    setZipLabel(null);
    showToast(t.zipFailed, "error");
  } finally {
    btnZip.disabled = false;
    $("zipEq").hidden = true;
  }
}

// ==================== AJUSTES Y EVENTOS ====================
function syncMode() {
  $("fileInput").accept = mode().accept;
  const dropTitle = $("dropzoneTitle");
  const meta = document.querySelector(".dropzone-meta");
  const copy = t.pdfDrop[currentMode()];
  setText(dropTitle, copy.title);
  setText(meta, copy.meta);
}

function saveSettings() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ dpi: dpiSelect.value, imageFormat: imageFormatRadios.find((radio) => radio.checked).value }));
  } catch (err) {
    console.warn("No se pudieron guardar las preferencias:", err);
  }
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE));
    if (!stored) return;
    if ([...dpiSelect.options].some((option) => option.value === stored.dpi)) dpiSelect.value = stored.dpi;
    const radio = imageFormatRadios.find((candidate) => candidate.value === stored.imageFormat);
    if (radio) radio.checked = true;
  } catch (err) {
    console.warn("No se pudieron cargar las preferencias guardadas:", err);
  }
}

/** Los archivos que no sirven para el nuevo modo se apartan, sin perderlos: un PDF no sirve para "imagen a PDF". */
function changeMode() {
  if (hasUnsaved() && !confirm(t.confirmRestart)) {
    modeRadios.find((radio) => radio.value === changeMode.previous).checked = true;
    return;
  }
  changeMode.previous = currentMode();
  combined = null;
  let newlyParked = 0;
  [...items].forEach((item) => {
    const invalid = validate(item.file);
    if (invalid || item.status === STATUS.ERROR) {
      if (invalid) {
        parked.push(item.file);
        newlyParked++;
      }
      const row = rows.get(item.id);
      items.splice(items.indexOf(item), 1);
      rows.delete(item.id);
      row.remove();
    } else if (item.status === STATUS.DONE) {
      requeue(item);
    } else if (item.status === STATUS.PENDING && mode().kind === "pdf" && !item.meta?.pages) {
      item.status = STATUS.ANALYZING;
      analysis = analysis.then(() => analyze(item));
    }
  });
  const usable = parked.filter((file) => !validate(file));
  parked = parked.filter((file) => validate(file));
  addFiles(usable, { focus: false });
  syncMode();
  updateAllRows();
  updateState();
  if (newlyParked) showToast(t.filesParked(newlyParked));
}

queueList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = items.find((candidate) => candidate.id === Number(button.closest("li").dataset.id));
  if (!item) return;
  switch (button.dataset.action) {
    case "up":
      moveUp(item);
      break;
    case "download":
      downloadItem(item);
      break;
    case "retry":
      requeue(item);
      item.retryable = false;
      updateRow(item);
      updateState();
      break;
    case "remove": {
      const losesResult = combined ? !combined.downloaded : hasUnsavedResults([item]);
      if (!losesResult || confirm(t.confirmRemove)) removeItem(item);
      break;
    }
  }
});

modeRadios.forEach((radio) => radio.addEventListener("change", changeMode));
imageFormatRadios.forEach((radio) => radio.addEventListener("change", saveSettings));
dpiSelect.addEventListener("change", saveSettings);
rangesInput.addEventListener("input", updateState);
btnConvert.addEventListener("click", start);
// Cancelar aparece bajo el cursor al convertir: el segundo clic de un doble clic no debe cancelar.
btnCancel.addEventListener("click", (event) => {
  if (event.detail < 2) converting?.abort();
});
btnZip.addEventListener("click", downloadAll);
btnAgain.addEventListener("click", () => {
  if (hasUnsaved() && !confirm(t.confirmReconvert)) return;
  combined = null;
  for (const item of items) if (item.status === STATUS.DONE) requeue(item);
  updateAllRows();
  updateState();
  modeRadios.find((radio) => radio.checked).focus();
});
btnClear.addEventListener("click", () => {
  if (hasUnsaved() && !confirm(t.confirmRestart)) return;
  combined = null;
  parked = [];
  [...items].forEach(removeItem);
  setZipLabel(null);
  $("btnBrowse").focus();
});

addEventListener("beforeunload", (event) => {
  if (converting || hasUnsaved()) event.preventDefault();
});

// ==================== INICIO ====================
loadSettings();
syncMode();
changeMode.previous = currentMode();
bindFilePicker(addFiles, t.dropHere);
updateState();
