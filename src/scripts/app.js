import { Zip, ZipPassThrough } from "fflate";
import {
  FORMAT_MAP,
  MAX_DURATION_SECONDS,
  channelsLabel,
  convertFile,
  decodeFile,
  estimateOutputBytes,
  formatBytes,
  formatDuration,
  getAudioContext,
  getFileFormatLabel,
  isOutputFormatSupported,
  sampleRateLabel,
  validateFile,
} from "./audio.js";
import {
  STATUS,
  conversionLabel,
  countByStatus,
  createItem,
  hasUnsavedResults,
  outputName,
  requeue,
  runQueue,
  uniqueName,
} from "./queue.js";
import { t } from "./messages.js";

const $ = (id) => document.getElementById(id);
const SETTINGS_STORE = "audiolocal-settings";
const ZIP_MAX_BYTES = 4 * 1024 ** 3;
const ROW_LEAVE_MS = 220;
const ZIP_DONE_MS = 2200;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const fileInput = $("fileInput");
const typeRadios = [...document.querySelectorAll('input[name="format"]')];
const qualityRadios = [...document.querySelectorAll('input[name="quality"]')];
const channelsSelect = $("channels");
const sampleRateSelect = $("sampleRate");
const normalizeSelect = $("normalize");
const keepSampleRateCheckbox = $("keepSampleRate");
const queueList = $("queueList");
const rowTemplate = $("queueRowTemplate");
const btnConvert = $("btnConvert");
const btnCancel = $("btnCancel");
const btnZip = $("btnZip");
const btnAgain = $("btnAgain");
const btnClear = $("btnClear");
const toast = $("toast");

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

// ==================== UTILIDADES DE UI ====================
function setText(element, text) {
  // Evita que los lectores de pantalla repitan un estado que no cambió.
  if (element.textContent !== text) element.textContent = text;
}

// Lee el token para que el JS y el CSS siempre coincidan sobre "reducir movimiento".
const motionEnabled = () => getComputedStyle(document.documentElement).getPropertyValue("--rise").trim() !== "0px";

function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => toast.classList.remove("show"), 4000);
}

function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ==================== AJUSTES ====================
function selectedFormat() {
  const type = typeRadios.find((radio) => radio.checked)?.value ?? "wav";
  if (type !== "mp3") return type;
  return `mp3_${qualityRadios.find((radio) => radio.checked)?.value ?? 256}`;
}

function getSettings() {
  return {
    format: selectedFormat(),
    channels: Number(channelsSelect.value),
    sampleRate: Number(sampleRateSelect.value),
    normalize: normalizeSelect.value === "1",
    keepSampleRate: keepSampleRateCheckbox.checked,
  };
}

// Las claves son las del sitio anterior, para conservar las preferencias ya guardadas.
function saveSettings() {
  const settings = {
    mode: selectedFormat(),
    colors: channelsSelect.value,
    smooth: sampleRateSelect.value,
    normalize: normalizeSelect.value,
    keepSampleRate: keepSampleRateCheckbox.checked,
  };
  try {
    localStorage.setItem(SETTINGS_STORE, JSON.stringify(settings));
  } catch (err) {
    console.warn("No se pudieron guardar las preferencias:", err);
  }
}

function setSelect(select, value) {
  if ([...select.options].some((option) => option.value === String(value))) select.value = value;
}

function checkRadio(radios, value) {
  const radio = radios.find((candidate) => candidate.value === value);
  if (radio) radio.checked = true;
}

function loadSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_STORE));
    if (!settings) return;
    const [type, quality] = String(settings.mode).split("_");
    checkRadio(typeRadios, type);
    checkRadio(qualityRadios, quality);
    setSelect(channelsSelect, settings.colors);
    setSelect(sampleRateSelect, settings.smooth);
    setSelect(normalizeSelect, settings.normalize);
    if (typeof settings.keepSampleRate === "boolean") keepSampleRateCheckbox.checked = settings.keepSampleRate;
  } catch (err) {
    console.warn("No se pudieron cargar las preferencias guardadas:", err);
  }
}

function syncSettingsControls() {
  const formatInfo = FORMAT_MAP[selectedFormat()];
  const isMp3 = formatInfo.type === "mp3";
  const option96k = [...sampleRateSelect.options].find((option) => option.value === "96000");
  option96k.disabled = isMp3; // MP3 no admite más de 48 kHz
  if (isMp3 && sampleRateSelect.value === "96000") sampleRateSelect.value = "48000";
  sampleRateSelect.disabled = keepSampleRateCheckbox.checked || Boolean(formatInfo.realtime);
  $("qualityField").hidden = !isMp3;
  $("formatNote").hidden = !formatInfo.realtime;
}

function markUnsupportedFormats() {
  for (const radio of typeRadios) {
    radio.disabled = radio.value !== "mp3" && !isOutputFormatSupported(radio.value);
    if (!radio.disabled) continue;
    radio.closest("label").querySelector("[data-detail]").textContent = t.unavailableHere;
    if (radio.checked) checkRadio(typeRadios, "mp3");
  }
}

// ==================== FILAS DE LA COLA ====================
function rowMeta(item, settings) {
  if (item.status === STATUS.ERROR) return item.error;
  if (item.status === STATUS.ANALYZING) return t.analyzing;
  if (item.status === STATUS.CONVERTING) return `${item.stage || t.converting}… ${item.progress}%`;

  const duration = formatDuration(item.meta.duration);
  if (item.status === STATUS.DONE) {
    const { format, blob } = item.result;
    return `${format} · ${duration} · ${formatBytes(blob.size)} (${t.before(formatBytes(item.file.size))})`;
  }
  const estimate = formatBytes(estimateOutputBytes(item.meta, settings));
  return `${getFileFormatLabel(item.file)} · ${duration} · ${formatBytes(item.file.size)} → ≈ ${estimate}`;
}

// El texto visible va al inicio de la etiqueta, para que el control por voz lo encuentre.
function setRowButton(button, label, fileName) {
  setText(button, label);
  button.setAttribute("aria-label", `${label} ${fileName}`);
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

function updateRow(item, settings = getSettings()) {
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
  row.style.setProperty("--p", item.progress / 100);
  row.querySelector('[data-field="meta"]').textContent = rowMeta(item, settings);
  row.querySelector('[data-field="eq"]').hidden = !(busy || playing || item.status === STATUS.ANALYZING);

  const progress = row.querySelector('[data-field="progress"]');
  progress.hidden = !busy;
  progress.value = item.progress;

  const action = (actionName) => row.querySelector(`[data-action="${actionName}"]`);
  action("play").hidden = !item.meta;
  setRowButton(action("play"), playing ? t.pause : t.listen, name);
  action("download").hidden = !isDone;
  action("download").classList.toggle("is-saved", item.downloaded);
  setRowButton(action("download"), item.downloaded ? t.downloaded : t.download, name);
  action("retry").hidden = !(isError && item.retryable);
  action("remove").disabled = busy;
}

// El DOM se limpia con un temporizador: si la pestaña no pinta, la animación no terminaría nunca.
function animateRowOut(row) {
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

function updateAllRows() {
  const settings = getSettings();
  items.forEach((item) => updateRow(item, settings));
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
  if (counts.error) parts.push(t.errorCount(counts.error));
  setText($("queueStatus"), parts.join(" · "));
  $("statusEq").hidden = !(running || counts.analyzing);
}

// ==================== AGREGAR Y ANALIZAR ====================
async function analyze(item) {
  if (!items.includes(item)) return;
  try {
    const buffer = await decodeFile(item.file);
    if (buffer.duration > MAX_DURATION_SECONDS) {
      Object.assign(item, { status: STATUS.ERROR, error: t.tooLong });
    } else {
      Object.assign(item, {
        status: STATUS.PENDING,
        meta: { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels },
      });
    }
  } catch (err) {
    console.error(err);
    Object.assign(item, { status: STATUS.ERROR, error: t.unreadable });
  }
  if (!items.includes(item)) return;
  updateRow(item);
  updateState();
}

function addFiles(files) {
  const wasEmpty = items.length === 0;
  [...files].forEach((file, order) => {
    const rejection = validateFile(file);
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
  const settings = getSettings();
  updateState();
  if (hadFocus) btnCancel.focus();
  // Debe pedirse durante el clic; sin await porque solo OGG y AAC necesitan el contexto en marcha.
  getAudioContext().resume().catch(console.warn);

  await runQueue(
    items,
    async (item) => {
      const result = await convertFile(item.file, settings, {
        signal,
        onWarning: (message) => showToast(message, "warning"),
        onProgress: (progress, stage) => {
          item.progress = progress;
          item.stage = stage;
          updateRow(item);
        },
      });
      return { ...result, url: URL.createObjectURL(result.blob), name: outputName(item.file.name, result.ext) };
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

// shortcut: fflate no escribe ZIP64, así que el total se limita a 4 GB; cambiar de librería si hace falta más.
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
    const parts = [];
    const zip = new Zip((err, chunk) => {
      if (err) throw err;
      parts.push(chunk);
    });
    const taken = new Set();
    for (const item of done) {
      const entry = new ZipPassThrough(uniqueName(item.result.name, taken));
      zip.add(entry);
      entry.push(new Uint8Array(await item.result.blob.arrayBuffer()), true);
    }
    zip.end();
    saveFile(new Blob(parts, { type: "application/zip" }), "AudioLocal.zip");
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
    const { format, sampleRate, channels, blob } = item.result;
    return `${format} · ${sampleRateLabel(sampleRate)} · ${channelsLabel(channels)} · ${formatBytes(blob.size)}`;
  }
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
const openPicker = () => fileInput.click();
$("dropzone").addEventListener("click", openPicker);
$("btnAddMore").addEventListener("click", openPicker);
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

const dropzoneTitle = $("dropzoneTitle");
const DROPZONE_TEXT = dropzoneTitle.textContent;

function setDragging(dragging) {
  document.body.classList.toggle("drag-over", dragging);
  setText(dropzoneTitle, dragging ? t.dropHere : DROPZONE_TEXT);
}

// La página entera recibe archivos: soltarlos fuera de la tarjeta no debe hacer que el navegador navegue a ellos.
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
  addFiles(event.dataTransfer.files);
});

[...typeRadios, ...qualityRadios, channelsSelect, sampleRateSelect, normalizeSelect, keepSampleRateCheckbox].forEach((element) => {
  element.addEventListener("change", () => {
    syncSettingsControls();
    saveSettings();
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
      removeItem(item);
      break;
  }
});

btnConvert.addEventListener("click", startConversion);
btnCancel.addEventListener("click", () => converting?.abort());
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
loadSettings();
// Las páginas por conversión fijan el destino sin tocar las preferencias guardadas.
checkRadio(typeRadios, document.querySelector("[data-preset]")?.dataset.preset);
markUnsupportedFormats();
syncSettingsControls();
updateState();
