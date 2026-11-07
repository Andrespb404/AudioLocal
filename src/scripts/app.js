import {
  MAX_DURATION_SECONDS,
  channelsLabel,
  convertFile,
  decodeFile,
  estimateOutputBytes,
  formatBytes,
  formatDuration,
  getAudioContext,
  getFileFormatLabel,
  isVideoFile,
  sampleRateLabel,
  validateFile,
} from "./audio.js";
import {
  STATUS,
  conversionLabel,
  countByStatus,
  createItem,
  errorSummary,
  hasUnsavedResults,
  outputName,
  requeue,
  runQueue,
  uniqueName,
} from "./queue.js";
import { t } from "./messages.js";
import { audioSettings } from "./settings-audio.js";
import { videoSettings } from "./settings-video.js";
import { $, UserError, ZIP_MAX_BYTES, animateRowOut, bindFilePicker, saveFile, setRowButton, setText, showToast, zipBlobs } from "./shared-ui.js";

const ZIP_DONE_MS = 2200;
const TOOL = document.querySelector("[data-tool]").dataset.tool;
const settings = TOOL === "video" ? videoSettings : audioSettings;

// Mediabunny es grande: se descarga solo al tratar un video. Sin WebCodecs, un video se decodifica como un audio.
// Si falla, suele ser una pestaña abierta antes de un despliegue: ese archivo ya no existe.
const loadVideoModule = () =>
  import("./video.js").catch((err) => {
    console.error(err);
    throw new UserError(t.reloadNeeded);
  });
const usesVideoModule = (file) => TOOL === "video" || (isVideoFile(file) && typeof AudioDecoder !== "undefined");

const queueList = $("queueList");
const rowTemplate = $("queueRowTemplate");
const btnConvert = $("btnConvert");
const btnCancel = $("btnCancel");
const btnZip = $("btnZip");
const btnAgain = $("btnAgain");
const btnClear = $("btnClear");

const audio = $("playerAudio");
const seek = $("playerSeek");
const sourceRadios = [...document.querySelectorAll('input[name="playerSource"]')];

const items = [];
const rows = new Map();
let nextId = 1;
let analysis = Promise.resolve();
let converting = null; // AbortController mientras la cola corre
let selected = null;
let zipLabel = null; // Texto temporal del botón: "Preparando ZIP…" o "Descargado"
let zipLabelTimer = null;

// ==================== FILAS DE LA COLA ====================
function rowMeta(item, current) {
  if (item.status === STATUS.ERROR) return item.error;
  if (item.status === STATUS.ANALYZING) return t.analyzing;
  if (item.status === STATUS.CONVERTING) return `${item.stage || t.converting}… ${item.progress}%`;

  const duration = formatDuration(item.meta.duration);
  if (item.status === STATUS.DONE) {
    const { format, blob, warnings } = item.result;
    return [`${format} · ${duration} · ${formatBytes(blob.size)} (${t.before(formatBytes(item.file.size))})`, ...warnings].join(" · ");
  }
  const source = `${getFileFormatLabel(item.file)} · ${duration} · ${formatBytes(item.file.size)}`;
  if (TOOL === "video") return `${getFileFormatLabel(item.file)} · ${duration} · ${item.meta.width}×${item.meta.height} · ${formatBytes(item.file.size)}`;
  return `${source} → ≈ ${formatBytes(estimateOutputBytes(item.meta, current))}`;
}

function createRow(item, order = 0) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  const { name } = item.file;
  row.dataset.id = item.id;
  row.style.setProperty("--i", Math.min(order, 8)); // Entrada escalonada, con tope para lotes grandes
  const nameField = row.querySelector('[data-field="name"]');
  nameField.textContent = name;
  nameField.title = name;
  row.querySelector('[data-field="progress"]').setAttribute("aria-label", t.progressOf(name));
  setRowButton(row.querySelector('[data-action="retry"]'), t.retry, name);
  setRowButton(row.querySelector('[data-action="remove"]'), t.remove, name);
  rows.set(item.id, row);
  queueList.append(row);
  return row;
}

/** Un PDF en audio o video no es un error del archivo: lleva a la herramienta que lo admite. */
function pdfToolLink() {
  const link = document.createElement("a");
  link.href = document.querySelector('a[href$="/pdf.html"]').href;
  link.textContent = t.openPdfTool;
  return link;
}

function updateRow(item, current = settings.get()) {
  const row = rows.get(item.id) ?? createRow(item);
  const { name } = item.file;
  const busy = item.status === STATUS.CONVERTING;
  const isError = item.status === STATUS.ERROR;
  const isDone = item.status === STATUS.DONE;
  const playing = item === selected && !audio.paused;

  row.classList.toggle("is-busy", busy);
  row.classList.toggle("is-done", isDone);
  row.classList.toggle("is-error", isError);
  row.classList.toggle("is-selected", item === selected);
  row.classList.toggle("is-playing", playing);
  row.classList.toggle("is-warned", isDone && item.result.warnings.length > 0);
  row.style.setProperty("--p", item.progress / 100);
  const meta = row.querySelector('[data-field="meta"]');
  meta.textContent = rowMeta(item, current);
  if (isError && /\.pdf$/i.test(name)) meta.append(" ", pdfToolLink());
  row.querySelector('[data-field="eq"]').hidden = !(busy || playing || item.status === STATUS.ANALYZING);

  const progress = row.querySelector('[data-field="progress"]');
  progress.hidden = !busy;
  progress.value = item.progress;

  const action = (actionName) => row.querySelector(`[data-action="${actionName}"]`);
  action("play").hidden = !item.meta;
  setRowButton(action("play"), playing ? t.pause : TOOL === "video" ? t.watch : t.listen, name);
  action("download").hidden = !isDone;
  action("download").classList.toggle("is-saved", item.downloaded);
  setRowButton(action("download"), item.downloaded ? t.downloaded : t.download, name);
  action("retry").hidden = !(isError && item.retryable);
  action("remove").disabled = busy;
}

function updateAllRows() {
  const current = settings.get();
  items.forEach((item) => updateRow(item, current));
}

// ==================== ESTADO DE LA PÁGINA ====================
/** Decide qué se muestra: una sola acción principal por estado. */
function updateState() {
  const counts = countByStatus(items);
  const running = Boolean(converting);
  const hasWork = counts.pending + counts.analyzing > 0;

  let state = "queue";
  if (items.length === 0) state = "empty";
  else if (counts.done > 0 && !hasWork && !running) state = "done";
  document.body.dataset.state = state;

  $("dropzone").hidden = state !== "empty";
  $("trustLine").hidden = state !== "empty";
  $("filesSection").hidden = state === "empty";
  $("optionsSection").hidden = state !== "queue" || running;
  $("actions").hidden = state === "empty";

  btnConvert.hidden = running || state === "done";
  btnConvert.disabled = counts.pending === 0;
  let convertLabel = t.convert;
  if (counts.pending > 1) convertLabel = t.convertMany(counts.pending);
  else if (counts.pending === 1) convertLabel = t.convertOne;
  else if (counts.analyzing > 0) convertLabel = t.analyzing;
  setText(btnConvert, convertLabel);

  btnCancel.hidden = !running;
  btnZip.hidden = counts.done === 0 || running;
  btnZip.classList.toggle("btn-primary", state === "done");
  btnZip.classList.toggle("btn-wide", state === "done");
  setText($("zipLabel"), zipLabel ?? (counts.done === 1 ? t.download : t.downloadAll));
  btnAgain.hidden = state !== "done";
  btnClear.hidden = running;

  let title = t.files;
  if (state === "done") title = counts.done === 1 ? t.oneReady : t.manyReady(counts.done);
  setText($("filesTitle"), title);

  const parts = [];
  if (running) {
    parts.push(conversionLabel(counts));
  } else {
    if (counts.analyzing) parts.push(t.analyzingCount(counts.analyzing));
    if (counts.pending) parts.push(t.pendingCount(counts.pending));
    if (counts.done && state !== "done") parts.push(t.readyCount(counts.done));
  }
  if (counts.error) parts.push(errorSummary(items));
  setText($("queueStatus"), parts.join(" · "));
  $("statusEq").hidden = !(running || counts.analyzing);
}

// ==================== AGREGAR Y ANALIZAR ====================
async function analyze(item) {
  if (!items.includes(item)) return;
  try {
    if (usesVideoModule(item.file)) {
      const { probeMedia } = await loadVideoModule();
      Object.assign(item, { status: STATUS.PENDING, meta: await probeMedia(item.file, TOOL) });
    } else {
      const buffer = await decodeFile(item.file);
      if (buffer.duration > MAX_DURATION_SECONDS) {
        Object.assign(item, { status: STATUS.ERROR, error: t.tooLong });
      } else {
        Object.assign(item, {
          status: STATUS.PENDING,
          meta: { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels },
        });
      }
    }
  } catch (err) {
    console.error(err);
    Object.assign(item, { status: STATUS.ERROR, error: err instanceof UserError ? err.message : t.unreadable });
  }
  if (!items.includes(item)) return;
  updateRow(item);
  updateState();
}

function addFiles(files) {
  const wasEmpty = items.length === 0;
  [...files].forEach((file, order) => {
    const rejection = validateFile(file, TOOL);
    const item = createItem(nextId++, file, rejection);
    items.push(item);
    createRow(item, order);
    updateRow(item);
    // Uno a la vez: decodificar en paralelo varios archivos grandes puede agotar la memoria.
    if (!rejection) analysis = analysis.then(() => analyze(item));
  });
  updateState();
  // El botón que abrió el selector ya no está visible: el foco no debe perderse.
  if (wasEmpty && items.length) $("filesTitle").focus();
}

function releaseUrls(item) {
  if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.result?.url) URL.revokeObjectURL(item.result.url);
  item.originalUrl = null;
}

function removeItem(item) {
  const row = rows.get(item.id);
  const hadFocus = row.contains(document.activeElement);
  items.splice(items.indexOf(item), 1);
  rows.delete(item.id);
  animateRowOut(row);
  if (item === selected) selectItem(null);
  releaseUrls(item);
  updateState();
  if (hadFocus) (items.length ? $("filesTitle") : $("btnBrowse")).focus();
}

// ==================== CONVERTIR ====================
async function startConversion() {
  const hadFocus = document.activeElement === btnConvert;
  converting = new AbortController();
  const { signal } = converting;
  const current = settings.get();
  updateState();
  if (hadFocus) btnCancel.focus();
  // Debe pedirse durante el clic; sin await porque solo OGG y AAC necesitan el contexto en marcha.
  if (TOOL === "audio") getAudioContext().resume().catch(console.warn);

  await runQueue(
    items,
    async (item) => {
      // Además del aviso pasajero, quedan en la fila: cambian lo que el usuario se lleva.
      const warnings = [];
      const warn = (message) => {
        warnings.push(message);
        showToast(message, "warning");
      };
      const report = {
        signal,
        onWarning: warn,
        onProgress: (progress, stage) => {
          item.progress = progress;
          item.stage = stage;
          updateRow(item);
        },
      };
      let result;
      if (TOOL === "video") result = await (await loadVideoModule()).convertVideo(item.file, current, report);
      else if (usesVideoModule(item.file) || (current.format === "ogg" && current.opusEncoder)) result = await (await loadVideoModule()).extractAudio(item.file, current, report);
      else result = await convertFile(item.file, current, report);
      // Con margen: cambiar de contenedor sin recodificar puede sumar unos pocos KB, y eso no merece un aviso.
      if (TOOL === "video" && result.blob.size > item.file.size * 1.05) warn(t.largerResult);
      return { ...result, warnings, url: URL.createObjectURL(result.blob), name: outputName(item.file.name, result.ext) };
    },
    {
      signal,
      onChange: (item) => {
        updateRow(item);
        updateState();
        if (item === selected) renderPlayer();
      },
    },
  );

  const focusLost = document.activeElement === btnCancel;
  converting = null;
  updateAllRows();
  updateState();
  if (focusLost) (document.body.dataset.state === "done" ? btnZip : btnConvert).focus();
  if (signal.aborted) showToast(t.cancelled);
}

function convertAgain() {
  if (hasUnsavedResults(items) && !confirm(t.confirmReconvert)) return;
  for (const item of items) {
    if (item.status !== STATUS.DONE) continue;
    URL.revokeObjectURL(item.result.url);
    requeue(item);
  }
  updateAllRows();
  updateState();
  if (selected) renderPlayer();
  $("formatTitle").focus();
}

// ==================== DESCARGAS ====================
function downloadItem(item) {
  saveFile(item.result.blob, item.result.name);
  item.downloaded = true;
  updateRow(item);
}

function setZipLabel(text, clearAfter = 0) {
  clearTimeout(zipLabelTimer);
  zipLabel = text;
  updateState();
  if (clearAfter) zipLabelTimer = setTimeout(() => setZipLabel(null), clearAfter);
}

async function downloadAll() {
  const done = items.filter((item) => item.status === STATUS.DONE);
  if (done.length === 1) {
    downloadItem(done[0]);
    return setZipLabel(t.downloaded, ZIP_DONE_MS);
  }

  const total = done.reduce((sum, item) => sum + item.result.blob.size, 0);
  if (total >= ZIP_MAX_BYTES) return showToast(t.zipTooLarge, "error");

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

// ==================== REPRODUCTOR ====================
const source = () => sourceRadios.find((radio) => radio.checked).value;

function playerMetaText(item) {
  if (source() === "converted" && item.result) {
    const { format, sampleRate, channels, blob, width, height } = item.result;
    if (TOOL === "video") return `${format} · ${width}×${height} · ${formatBytes(blob.size)}`;
    return `${format} · ${sampleRateLabel(sampleRate)} · ${channelsLabel(channels)} · ${formatBytes(blob.size)}`;
  }
  if (TOOL === "video") return `${getFileFormatLabel(item.file)} · ${item.meta.width}×${item.meta.height} · ${formatBytes(item.file.size)}`;
  return `${getFileFormatLabel(item.file)} · ${channelsLabel(item.meta.channels)} · ${formatBytes(item.file.size)}`;
}

/** Actualiza textos y controles sin interrumpir lo que esté sonando. */
function renderPlayer() {
  const item = selected;
  $("player").hidden = !item;
  if (!item) return;

  if (!item.result && source() === "converted") {
    sourceRadios[0].checked = true;
    loadAudio();
  }
  $("playerCompare").hidden = !item.result;
  $("playerName").textContent = item.file.name;
  $("playerName").title = item.file.name;
  $("playerMeta").textContent = playerMetaText(item);
}

function loadAudio(time = 0, resume = false) {
  const item = selected;
  if (!item) {
    audio.removeAttribute("src");
    audio.load();
    return;
  }
  if (source() === "converted" && item.result) {
    audio.src = item.result.url;
  } else {
    item.originalUrl ??= URL.createObjectURL(item.file);
    audio.src = item.originalUrl;
  }
  audio.addEventListener(
    "loadedmetadata",
    () => {
      audio.currentTime = Math.min(time, audio.duration || 0);
      if (resume) audio.play().catch(() => {});
    },
    { once: true },
  );
}

function selectItem(item, { play = false } = {}) {
  const previous = selected;
  selected = item;
  sourceRadios[item?.result ? 1 : 0].checked = true;
  seek.value = 0;
  seek.style.setProperty("--pos", "0%");
  $("playerCurrent").textContent = "0:00";
  loadAudio(0, play);
  renderPlayer();
  if (previous && rows.has(previous.id)) updateRow(previous);
  if (item) updateRow(item);
}

function togglePlay() {
  if (audio.paused) {
    audio.play().catch((err) => {
      console.error(err);
      showToast(t.cannotPlay, "error");
    });
  } else {
    audio.pause();
  }
}

function syncPlayState() {
  const paused = audio.paused;
  $("iconPlay").toggleAttribute("hidden", !paused);
  $("iconPause").toggleAttribute("hidden", paused);
  $("btnPlay").setAttribute("aria-label", paused ? t.play : t.pause);
  if (selected) updateRow(selected);
}

// ==================== EVENTOS ====================
bindFilePicker(addFiles, t.dropHere);

settings.controls.forEach((element) => {
  element.addEventListener("change", () => {
    settings.sync();
    settings.save();
    updateAllRows();
  });
});

queueList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = items.find((candidate) => candidate.id === Number(button.closest("li").dataset.id));
  if (!item) return;

  switch (button.dataset.action) {
    case "play":
      if (item === selected) togglePlay();
      else selectItem(item, { play: true });
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
    case "remove":
      if (!hasUnsavedResults([item]) || confirm(t.confirmRemove)) removeItem(item);
      break;
  }
});

btnConvert.addEventListener("click", startConversion);
// Cancelar aparece bajo el cursor al convertir: el segundo clic de un doble clic no debe cancelar.
btnCancel.addEventListener("click", (event) => {
  if (event.detail < 2) converting?.abort();
});
btnZip.addEventListener("click", downloadAll);
btnAgain.addEventListener("click", convertAgain);
btnClear.addEventListener("click", () => {
  if (hasUnsavedResults(items) && !confirm(t.confirmRestart)) return;
  [...items].forEach(removeItem);
  setZipLabel(null);
  $("btnBrowse").focus();
});

$("btnPlay").addEventListener("click", togglePlay);
$("btnPlayerClose").addEventListener("click", () => {
  const row = selected && rows.get(selected.id);
  selectItem(null);
  row?.querySelector('[data-action="play"]').focus();
});

sourceRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    loadAudio(audio.currentTime, !audio.paused);
    renderPlayer();
  });
});

function syncSeekFill() {
  const position = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  seek.style.setProperty("--pos", `${position}%`);
}

seek.addEventListener("input", () => {
  audio.currentTime = Number(seek.value);
  syncSeekFill();
});
audio.addEventListener("loadedmetadata", () => {
  seek.max = audio.duration || 0;
  $("playerTotal").textContent = formatDuration(audio.duration || 0);
});
audio.addEventListener("timeupdate", () => {
  seek.value = audio.currentTime;
  syncSeekFill();
  const current = formatDuration(audio.currentTime);
  $("playerCurrent").textContent = current;
  seek.setAttribute("aria-valuetext", current);
});
["play", "pause", "ended"].forEach((name) => audio.addEventListener(name, syncPlayState));
audio.addEventListener("error", () => {
  if (audio.getAttribute("src")) showToast(t.browserCannotPlay, "warning");
});

addEventListener("beforeunload", (event) => {
  if (converting || hasUnsavedResults(items)) event.preventDefault();
});

// ==================== INICIO ====================
settings.load();
settings.prepare().catch(console.warn).finally(() => {
  settings.sync();
  updateAllRows();
});
settings.sync();
updateState();
