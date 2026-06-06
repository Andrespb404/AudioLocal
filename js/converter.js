// ==================== ELEMENTOS DEL DOM ====================
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const btnBrowse = document.getElementById("btnBrowse");
const btnConvert = document.getElementById("btnConvert");
const btnDownload = document.getElementById("btnDownload");
const btnReset = document.getElementById("btnReset");

const origPreview = document.getElementById("origPreview");
const convertedPreview = document.getElementById("convertedPreview");
const previewSection = document.getElementById("previewSection");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

const modeSelect = document.getElementById("mode");
const colorsSelect = document.getElementById("colors");
const smoothInput = document.getElementById("smooth");
const normalizeSelect = document.getElementById("normalizeSelect");
const keepSampleRateCheckbox = document.getElementById("keepSampleRate");
const outputEstimateLabel = document.getElementById("outputEstimate");
const origSize = document.getElementById("origSize");
const convertedSize = document.getElementById("convertedSize");
const fileSummary = document.getElementById("fileSummary");
const fileNameLabel = document.getElementById("fileName");
const fileDurationLabel = document.getElementById("fileDuration");
const fileSampleRateLabel = document.getElementById("fileSampleRate");
const fileChannelsLabel = document.getElementById("fileChannels");
const origFormatLabel = document.getElementById("origFormat");
const origFormatPreview = document.getElementById("origFormatPreview");
const origDurationPreview = document.getElementById("origDuration");
const origSampleRatePreview = document.getElementById("origSampleRate");
const origChannelsPreview = document.getElementById("origChannels");
const convertedFormatLabel = document.getElementById("convertedFormat");
const convertedSampleRateLabel = document.getElementById("convertedSampleRate");
const convertedChannelsLabel = document.getElementById("convertedChannels");
const convertedSizePreview = document.getElementById("convertedSizePreview");
const toast = document.getElementById("toast");

let selectedFile = null;
let selectedBuffer = null;
let convertedBlob = null;
let convertedFormat = "wav";

let audioContext = null;
function getAudioContext() {
  if (!audioContext || audioContext.state === "closed") {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
  }
  return audioContext;
}

function getOfflineAudioContext(channels, length, sampleRate) {
  const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  return new OfflineCtor(channels, length, sampleRate);
}

let currentOriginalUrl = null;
let currentConvertedUrl = null;

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
const PLACEHOLDER_TEXT = "—";
const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/aac",
  "audio/x-aac",
  "audio/mp4",
  "audio/x-m4a",
];

const SUPPORTED_FILE_EXTENSIONS = ["mp3", "wav", "ogg", "aac", "m4a", "webm"];
const SETTINGS_STORE = "audiolocal-settings";

function getFileExtension(file) {
  const match = file.name && file.name.match(/\.([^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function isSupportedAudioFile(file) {
  if (!file) return false;
  if (file.type && SUPPORTED_AUDIO_TYPES.includes(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file);
  return SUPPORTED_FILE_EXTENSIONS.includes(ext);
}

function saveSettings() {
  const settings = {
    mode: modeSelect.value,
    colors: colorsSelect.value,
    smooth: smoothInput.value,
    normalize: normalizeSelect.value,
    keepSampleRate: keepSampleRateCheckbox.checked,
  };
  localStorage.setItem(SETTINGS_STORE, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_STORE);
    if (!stored) return;
    const settings = JSON.parse(stored);
    if (settings.mode) modeSelect.value = settings.mode;
    if (settings.colors) colorsSelect.value = settings.colors;
    if (settings.smooth) smoothInput.value = settings.smooth;
    if (settings.normalize) normalizeSelect.value = settings.normalize;
    if (typeof settings.keepSampleRate === "boolean")
      keepSampleRateCheckbox.checked = settings.keepSampleRate;
  } catch (err) {
    console.warn("No se pudieron cargar las preferencias guardadas:", err);
  }
}

function updateAvailableFormats() {
  if (!modeSelect) return;
  Array.from(modeSelect.options).forEach((option) => {
    option.disabled = !isOutputFormatSupported(option.value);
  });
  if (modeSelect.options[modeSelect.selectedIndex]?.disabled) {
    modeSelect.value = "wav";
  }
}

const FORMAT_MAP = {
  wav: { ext: "wav", type: "wav", bitrate: null },
  mp3_128: { ext: "mp3", type: "mp3", bitrate: 128 },
  mp3_256: { ext: "mp3", type: "mp3", bitrate: 256 },
  mp3_320: { ext: "mp3", type: "mp3", bitrate: 320 },
  ogg: {
    ext: "ogg",
    type: "ogg",
    bitrate: 128,
    mimeCandidates: ["audio/ogg; codecs=opus", "audio/ogg"],
  },
  aac: {
    ext: "m4a",
    type: "aac",
    bitrate: 128,
    mimeCandidates: ["audio/mp4; codecs=mp4a.40.2", "audio/x-m4a", "audio/aac"],
  },
};

function estimateOutputBytes() {
  if (!selectedBuffer) return 0;
  const formatKey = modeSelect.value;
  const formatInfo = FORMAT_MAP[formatKey] ?? FORMAT_MAP.wav;
  const duration = selectedBuffer.duration;
  if (formatInfo.bitrate) {
    return Math.max(0, Math.round((duration * formatInfo.bitrate * 1000) / 8));
  }

  const sampleRate = keepSampleRateCheckbox.checked
    ? selectedBuffer.sampleRate
    : Number(smoothInput.value);
  const channels = Number(colorsSelect.value);
  return Math.max(0, Math.round(duration * sampleRate * channels * 2));
}

function updateOutputEstimate() {
  if (!outputEstimateLabel) return;
  if (!selectedBuffer) {
    outputEstimateLabel.textContent = PLACEHOLDER_TEXT;
    return;
  }

  const bytes = estimateOutputBytes();
  const formatKey = modeSelect.value;
  const formatInfo = FORMAT_MAP[formatKey] ?? FORMAT_MAP.wav;
  const formatLabel = formatInfo.type === "aac" ? "AAC" : formatInfo.ext.toUpperCase();
  const label = `${formatLabel} ≈ ${formatBytes(bytes)}`;
  outputEstimateLabel.textContent = label;
}

function toggleSampleRateControl() {
  if (!smoothInput || !keepSampleRateCheckbox) return;
  smoothInput.disabled = keepSampleRateCheckbox.checked;
  if (keepSampleRateCheckbox.checked) {
    smoothInput.parentElement.classList.add("disabled");
  } else {
    smoothInput.parentElement.classList.remove("disabled");
  }
}

function setBusy(isBusy) {
  btnBrowse.disabled = isBusy;
  fileInput.disabled = isBusy;
  btnConvert.disabled = isBusy || !selectedBuffer;
  btnReset.disabled = isBusy;
  if (isBusy) {
    dropzone.classList.add("disabled");
  } else {
    dropzone.classList.remove("disabled");
  }
}

// --- UI: formato de archivo cargado (badge junto al select)
function getFileFormatLabel(file) {
  if (!file) return "-";
  const t = (file.type || "").toLowerCase();
  if (t.includes("mpeg") || t.includes("mp3")) return "MP3";
  if (t.includes("wav")) return "WAV";
  if (t.includes("ogg")) return "OGG";
  if (t.includes("aac") || t.includes("mp4") || t.includes("m4a")) return "AAC";
  // fallback to extension
  const m = file.name && file.name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : "Desconocido";
}

// Formatos disponibles: value → { label, ext, bitrate (solo MP3) }
// El HTML debe tener en #mode:
//   <option value="wav">WAV</option>
//   <option value="mp3_128">MP3 128 kbps</option>
//   <option value="mp3_256">MP3 256 kbps</option>
//   <option value="mp3_320">MP3 320 kbps</option>

// ==================== UTILIDADES ====================
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(1)) + " " + sizes[i];
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")} min`;
}

function updateFileSummary(file, audioBuffer) {
  if (!fileSummary) return;
  fileSummary.hidden = false;
  fileNameLabel.textContent = file.name;
  fileDurationLabel.textContent = formatDuration(audioBuffer.duration);
  fileSampleRateLabel.textContent = `${audioBuffer.sampleRate.toLocaleString()} Hz`;
  fileChannelsLabel.textContent = audioBuffer.numberOfChannels === 1 ? "Mono" : "Estéreo";
  origFormatLabel.textContent = getFileFormatLabel(file);
}

function updatePreviewMetadata(data) {
  if (!origFormatPreview) return;
  origFormatPreview.textContent = data.origFormat;
  origDurationPreview.textContent = data.duration;
  origSampleRatePreview.textContent = data.sampleRate;
  origChannelsPreview.textContent = data.channels;
  convertedFormatLabel.textContent = data.convertedFormat;
  convertedSampleRateLabel.textContent = data.convertedSampleRate;
  convertedChannelsLabel.textContent = data.convertedChannels;
  convertedSizePreview.textContent = data.convertedSize;
}

function resetFileSummary() {
  if (!fileSummary) return;
  fileSummary.hidden = true;
  fileNameLabel.textContent = PLACEHOLDER_TEXT;
  fileDurationLabel.textContent = PLACEHOLDER_TEXT;
  fileSampleRateLabel.textContent = PLACEHOLDER_TEXT;
  fileChannelsLabel.textContent = PLACEHOLDER_TEXT;
  origFormatLabel.textContent = PLACEHOLDER_TEXT;
}

function resetPreviewMetadata() {
  if (!convertedFormatLabel) return;
  origFormatPreview.textContent = PLACEHOLDER_TEXT;
  origDurationPreview.textContent = PLACEHOLDER_TEXT;
  origSampleRatePreview.textContent = PLACEHOLDER_TEXT;
  origChannelsPreview.textContent = PLACEHOLDER_TEXT;
  convertedFormatLabel.textContent = PLACEHOLDER_TEXT;
  convertedSampleRateLabel.textContent = PLACEHOLDER_TEXT;
  convertedChannelsLabel.textContent = PLACEHOLDER_TEXT;
  convertedSizePreview.textContent = PLACEHOLDER_TEXT;
}

function showToast(message, type = "info") {
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add("show");
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => toast.classList.remove("show"), 3000);
}

// normalizeSelect es un select con valores "0" (No) y "1" (Sí)

// ==================== CODIFICADORES ====================

// WAV con muestras intercaladas (L,R,L,R...) según estándar
function encodeWAV(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (str) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset++, str.charCodeAt(i));
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + length * numChannels * 2, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2; // PCM
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true);
  offset += 4;
  view.setUint16(offset, numChannels * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, length * numChannels * 2, true);
  offset += 4;

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++)
    channels.push(audioBuffer.getChannelData(ch));

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// MP3 con bitrate configurable vía lamejs local
async function encodeMP3(audioBuffer, bitrate = 128) {
  if (typeof lamejs === "undefined") {
    showToast("No se encontró el codificador MP3. Usando WAV.", "warning");
    convertedFormat = "wav";
    return encodeWAV(audioBuffer);
  }

  try {
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);

    const mp3Data = [];
    const blockSize = 1152;
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : left;
    const totalBlocks = Math.ceil(left.length / blockSize);

    for (let b = 0; b < totalBlocks; b++) {
      const start = b * blockSize;
      const end = Math.min(start + blockSize, left.length);
      const size = end - start;

      const leftChunk = new Int16Array(size);
      const rightChunk = new Int16Array(size);

      for (let j = 0; j < size; j++) {
        leftChunk[j] = Math.floor(left[start + j] * 32767);
        rightChunk[j] = Math.floor(right[start + j] * 32767);
      }

      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));

      if (b % 100 === 0) {
        const percent = 80 + Math.floor((b / totalBlocks) * 15);
        updateProgress(
          percent,
          `Codificando MP3... ${Math.floor((b / totalBlocks) * 100)}%`,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const final = mp3encoder.flush();
    if (final.length > 0) mp3Data.push(new Uint8Array(final));

    return new Blob(mp3Data, { type: "audio/mp3" });
  } catch (e) {
    console.error(e);
    showToast("Error al codificar MP3. Usando WAV.", "warning");
    convertedFormat = "wav";
    return encodeWAV(audioBuffer);
  }
}

// ==================== PROCESAMIENTO DE AUDIO ====================
function getSupportedMediaMime(formatInfo) {
  if (!formatInfo?.mimeCandidates || typeof MediaRecorder === "undefined") return null;
  return formatInfo.mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || null;
}

function isOutputFormatSupported(formatKey) {
  const formatInfo = FORMAT_MAP[formatKey];
  if (!formatInfo) return false;
  if (formatInfo.type === "wav" || formatInfo.type === "mp3") return true;
  return Boolean(getSupportedMediaMime(formatInfo));
}

async function encodeWithMediaRecorder(audioBuffer, mimeType) {
  const ctx = getAudioContext();
  await ctx.resume();

  const destination = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(destination);
  source.start(0);

  const recorder = new MediaRecorder(destination.stream, { type: mimeType });
  const chunks = [];

  return new Promise((resolve, reject) => {
    let stopped = false;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };

    recorder.onerror = (event) => reject(event.error || new Error("Error de MediaRecorder"));

    recorder.onstop = () => {
      stopped = true;
      source.disconnect();
      destination.disconnect();
      resolve(new Blob(chunks, { type: mimeType }));
    };

    source.onended = () => {
      if (recorder.state === "recording") recorder.stop();
    };

    recorder.start();
    setTimeout(() => {
      if (!stopped && recorder.state === "recording") recorder.stop();
    }, audioBuffer.duration * 1000 + 1200);
  });
}

async function encodeMediaFormat(audioBuffer, formatInfo) {
  if (formatInfo.type === "wav") return encodeWAV(audioBuffer);
  if (formatInfo.type === "mp3") return encodeMP3(audioBuffer, formatInfo.bitrate);
  const mimeType = getSupportedMediaMime(formatInfo);
  if (!mimeType) return null;
  return await encodeWithMediaRecorder(audioBuffer, mimeType);
}

function normalizeBuffer(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  let peak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++)
      peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak <= 0 || peak >= 1) return audioBuffer;

  const gain = 1 / peak;
  const normalized = getAudioContext().createBuffer(
    numChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );
  for (let ch = 0; ch < numChannels; ch++) {
    const source = audioBuffer.getChannelData(ch);
    const target = normalized.getChannelData(ch);
    for (let i = 0; i < source.length; i++) target[i] = source[i] * gain;
  }
  return normalized;
}

// Resampleo real usando OfflineAudioContext
async function resampleAudioBuffer(audioBuffer, targetSampleRate) {
  if (audioBuffer.sampleRate === targetSampleRate) return audioBuffer;

  const numChannels = audioBuffer.numberOfChannels;
  const newLength = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(
    numChannels,
    newLength,
    targetSampleRate,
  );
  if (offlineCtx.sampleRate !== targetSampleRate) {
    console.warn(
      `OfflineAudioContext no admite ${targetSampleRate} Hz, usando ${offlineCtx.sampleRate} Hz en su lugar.`,
    );
  }
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return await offlineCtx.startRendering();
}

// Conversión de canales: estéreo→mono (promedio) o mono→estéreo (duplicar)
function convertChannels(audioBuffer, targetChannels) {
  if (audioBuffer.numberOfChannels === targetChannels) return audioBuffer;

  const result = getAudioContext().createBuffer(
    targetChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  if (targetChannels === 1) {
    const monoData = result.getChannelData(0);
    const numSrc = audioBuffer.numberOfChannels;
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < numSrc; ch++)
        sum += audioBuffer.getChannelData(ch)[i];
      monoData[i] = sum / numSrc;
    }
  } else {
    const srcData = audioBuffer.getChannelData(0);
    for (let ch = 0; ch < targetChannels; ch++)
      result.getChannelData(ch).set(srcData);
  }

  return result;
}

// ==================== CONVERSIÓN PRINCIPAL ====================
function getConversionOptions() {
  const rawSampleRate = Number(smoothInput.value);
  const validSampleRates = [8000, 11025, 16000, 22050, 44100, 48000, 96000];
  const sampleRate = keepSampleRateCheckbox.checked
    ? selectedBuffer.sampleRate
    : validSampleRates.includes(rawSampleRate)
    ? rawSampleRate
    : selectedBuffer.sampleRate;

  return {
    formatKey: modeSelect.value,
    formatInfo: FORMAT_MAP[modeSelect.value] ?? FORMAT_MAP.wav,
    channels: Number(colorsSelect.value),
    sampleRate,
    normalize: normalizeSelect ? normalizeSelect.value === "1" : false,
    sampleRateWarning:
      !keepSampleRateCheckbox.checked && !validSampleRates.includes(rawSampleRate),
  };
}

async function convertAudio() {
  if (!selectedBuffer)
    return showToast("Selecciona un archivo primero", "error");

  setBusy(true);
  try {
    showProgress();
    updateProgress(15, "Procesando audio...");

    const options = getConversionOptions();
    let activeFormatInfo = options.formatInfo;

    if (options.sampleRateWarning) {
      showToast(`Sample rate inválido, usando ${options.sampleRate} Hz`, "warning");
    }

    if (!isOutputFormatSupported(options.formatKey)) {
      showToast(
        `El formato ${activeFormatInfo.type.toUpperCase()} no está disponible en este navegador. Se usará WAV.`,
        "warning",
      );
      activeFormatInfo = FORMAT_MAP.wav;
    }

    let buffer = selectedBuffer;
    const ctx = getAudioContext();
    await ctx.resume();

    if (options.normalize) {
      updateProgress(30, "Normalizando volumen...");
      buffer = normalizeBuffer(buffer);
    }

    if (buffer.sampleRate !== options.sampleRate) {
      updateProgress(45, `Remuestreando a ${options.sampleRate} Hz...`);
      buffer = await resampleAudioBuffer(buffer, options.sampleRate);
    }

    if (buffer.numberOfChannels !== options.channels) {
      updateProgress(
        55,
        `Convirtiendo a ${options.channels === 1 ? "Mono" : "Estéreo"}...`,
      );
      buffer = convertChannels(buffer, options.channels);
    }

    convertedFormat = activeFormatInfo.ext;
    updateProgress(
      70,
      `Codificando ${activeFormatInfo.type === "aac" ? "AAC" : activeFormatInfo.ext.toUpperCase()}...`,
    );

    convertedBlob = await encodeMediaFormat(buffer, activeFormatInfo);
    if (!convertedBlob) {
      showToast(
        `No se pudo codificar a ${activeFormatInfo.type.toUpperCase()}. Se generará WAV.`,
        "warning",
      );
      activeFormatInfo = FORMAT_MAP.wav;
      convertedFormat = activeFormatInfo.ext;
      convertedBlob = encodeWAV(buffer);
    }

    showResult(buffer, {
      origFormat: getFileFormatLabel(selectedFile),
      duration: formatDuration(selectedBuffer.duration),
      sampleRate: `${selectedBuffer.sampleRate.toLocaleString()} Hz`,
      channels: selectedBuffer.numberOfChannels === 1 ? "Mono" : "Estéreo",
      convertedFormat:
        activeFormatInfo.type === "aac"
          ? "AAC"
          : activeFormatInfo.ext.toUpperCase(),
      convertedSampleRate: `${buffer.sampleRate.toLocaleString()} Hz`,
      convertedChannels: options.channels === 1 ? "Mono" : "Estéreo",
      convertedSize: formatBytes(convertedBlob.size),
    });
  } catch (error) {
    console.error(error);
    showToast("Error durante la conversión: " + error.message, "error");
    hideProgress();
    setBusy(false);
  }
}

function showProgress() {
  progressWrap.hidden = false;
  updateProgress(0, "Iniciando conversión...");
  progressWrap.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateProgress(percent, text) {
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = text;
}

function hideProgress() {
  setTimeout(() => (progressWrap.hidden = true), 600);
}

function showResult(buffer, meta = {}) {
  if (currentConvertedUrl) URL.revokeObjectURL(currentConvertedUrl);
  currentConvertedUrl = URL.createObjectURL(convertedBlob);
  if (meta && Object.keys(meta).length) {
    updatePreviewMetadata(meta);
  }

  convertedPreview.innerHTML = "";
  const audioEl = document.createElement("audio");
  audioEl.controls = true;
  audioEl.src = currentConvertedUrl;
  convertedPreview.appendChild(audioEl);

  convertedSize.textContent = formatBytes(convertedBlob.size);
  previewSection.hidden = false;
  btnDownload.disabled = false;

  updateProgress(100, "¡Conversión completada!");
  hideProgress();
  setBusy(false);
  
  setTimeout(() => previewSection.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
}

// ==================== MANEJO DE ARCHIVOS ====================
function handleFile(file) {
  if (!file) return showToast("Selecciona un archivo de audio", "error");
  if (!isSupportedAudioFile(file)) {
    return showToast(
      "Archivo de audio no válido. Usa MP3, WAV, OGG, AAC o M4A.",
      "error",
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return showToast("El archivo es demasiado grande. Usa uno menor a 150 MB.", "error");
  }

  selectedFile = file;
  selectedBuffer = null;
  resetPreview();
  btnConvert.disabled = true;
  btnDownload.disabled = true;

  // Mostrar barra de carga
  showProgress();
  updateProgress(10, "Leyendo archivo...");

  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.floor((e.loaded / e.total) * 60);
      updateProgress(10 + percent, "Cargando archivo...");
    }
  };

  reader.onload = async (e) => {
    try {
      updateProgress(75, "Analizando audio...");
      selectedBuffer = await getAudioContext().decodeAudioData(e.target.result);

      // Duración máxima permitida: 20 minutos
      const maxSeconds = 20 * 60;
      if (selectedBuffer.duration > maxSeconds) {
        hideProgress();
        showToast("El archivo supera la duración máxima de 20 minutos.", "error");
        selectedBuffer = null;
        setBusy(false);
        return;
      }

      updateProgress(100, "¡Archivo cargado!");
      hideProgress();

      if (currentOriginalUrl) URL.revokeObjectURL(currentOriginalUrl);
      currentOriginalUrl = URL.createObjectURL(file);
      origPreview.src = currentOriginalUrl;
      origSize.textContent = formatBytes(file.size);
      btnConvert.disabled = false;
      updateFileSummary(file, selectedBuffer);
      updateOutputEstimate();

      // Toast de éxito con nombre del archivo
      showToast(`✓ ${file.name} cargado correctamente`, "success");
    } catch (err) {
      hideProgress();
      showToast("No se pudo leer el archivo de audio", "error");
    }
  };

  reader.onerror = () => {
    hideProgress();
    showToast("Error al leer el archivo", "error");
  };

  reader.readAsArrayBuffer(file);
}

function resetPreview() {
  previewSection.hidden = true;
  convertedPreview.innerHTML = "";
  if (currentConvertedUrl) {
    URL.revokeObjectURL(currentConvertedUrl);
    currentConvertedUrl = null;
  }
  convertedBlob = null;
}

function resetForm() {
  selectedFile = null;
  selectedBuffer = null;
  fileInput.value = "";
  origPreview.src = "";
  origSize.textContent = PLACEHOLDER_TEXT;
  btnConvert.disabled = true;
  btnDownload.disabled = true;
  resetPreview();
  resetFileSummary();
  resetPreviewMetadata();
  updateOutputEstimate();
  setBusy(false);
  showToast("Formulario reiniciado", "info");
}

// ==================== EVENTOS ====================
btnBrowse.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = null;
});

btnConvert.addEventListener("click", convertAudio);
btnDownload.addEventListener("click", () => {
  if (!convertedBlob)
    return showToast("No hay archivo para descargar", "error");

  const originalName = selectedFile.name.replace(/\.[^/.]+$/, "");
  const downloadName = `${originalName} (Converted).${convertedFormat}`;
  const url = URL.createObjectURL(convertedBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

btnReset.addEventListener("click", resetForm);

[modeSelect, colorsSelect, smoothInput, normalizeSelect, keepSampleRateCheckbox].forEach((element) => {
  if (!element) return;
  element.addEventListener("change", () => {
    toggleSampleRateControl();
    saveSettings();
    updateOutputEstimate();
  });
});

loadSettings();
updateAvailableFormats();
toggleSampleRateControl();
updateOutputEstimate();

// no hay input range; el select se usa directamente
btnDownload.disabled = true;

// Dropzone
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", () =>
  dropzone.classList.remove("drag-over"),
);
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

