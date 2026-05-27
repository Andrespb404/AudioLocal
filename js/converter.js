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
const origSize = document.getElementById("origSize");
const convertedSize = document.getElementById("convertedSize");
const toast = document.getElementById("toast");

let selectedFile = null;
let selectedBuffer = null;
let convertedBlob = null;
let convertedFormat = "wav";

let audioContext = null;
function getAudioContext() {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

let currentOriginalUrl = null;
let currentConvertedUrl = null;

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
const LAME_SCRIPT_URL = "js/lame.min.js";
const SUPPORTED_AUDIO_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/aac",
  "audio/x-aac",
];

// Carga lamejs dinámicamente si no está disponible
let lamejsLoading = null;
async function ensureLamejs() {
  if (typeof lamejs !== "undefined") return true;
  if (lamejsLoading) return lamejsLoading;

  lamejsLoading = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = LAME_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(typeof lamejs !== "undefined");
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return lamejsLoading;
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
  if (t.includes("aac")) return "AAC";
  // fallback to extension
  const m = file.name && file.name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : "Desconocido";
}

function updateInputFormatBadge(label) {
  let badge = document.getElementById("inputFormatBadge");
  if (!badge) {
    badge = document.createElement("span");
    badge.id = "inputFormatBadge";
    badge.className = "input-format-badge";
    // insert after the mode select
    modeSelect.parentElement.appendChild(badge);
  }
  badge.textContent = `Entrada: ${label}`;
}

function clearInputFormatBadge() {
  const badge = document.getElementById("inputFormatBadge");
  if (badge && badge.parentElement) badge.parentElement.removeChild(badge);
}

// Formatos disponibles: value → { label, ext, bitrate (solo MP3) }
// El HTML debe tener en #mode:
//   <option value="wav">WAV</option>
//   <option value="mp3_128">MP3 128 kbps</option>
//   <option value="mp3_256">MP3 256 kbps</option>
//   <option value="mp3_320">MP3 320 kbps</option>
const FORMAT_MAP = {
  wav: { ext: "wav", bitrate: null },
  mp3_128: { ext: "mp3", bitrate: 128 },
  mp3_256: { ext: "mp3", bitrate: 256 },
  mp3_320: { ext: "mp3", bitrate: 320 },
};

// ==================== UTILIDADES ====================
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(1)) + " " + sizes[i];
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

// MP3 con bitrate configurable via lamejs
async function encodeMP3(audioBuffer, bitrate = 128) {
  const loaded = await ensureLamejs();
  if (!loaded || typeof lamejs === "undefined") {
    showToast("No se pudo cargar el codificador MP3. Usando WAV.", "warning");
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

      // Crear chunks del tamaño exacto del fragmento, no de blockSize
      const leftChunk = new Int16Array(size);
      const rightChunk = new Int16Array(size);

      for (let j = 0; j < size; j++) {
        leftChunk[j] = Math.floor(left[start + j] * 32767);
        rightChunk[j] = Math.floor(right[start + j] * 32767);
      }

      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));

      // Ceder el hilo cada 100 bloques para no crashear
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
async function convertAudio() {
  if (!selectedBuffer)
    return showToast("Selecciona un archivo primero", "error");

  setBusy(true);
  try {
    showProgress();
    updateProgress(15, "Procesando audio...");

    // Validar sample rate
    const rawSampleRate = Number(smoothInput.value);
    const validSampleRates = [8000, 11025, 16000, 22050, 44100, 48000, 96000];
    const sampleRate = validSampleRates.includes(rawSampleRate)
      ? rawSampleRate
      : selectedBuffer.sampleRate;

    if (!validSampleRates.includes(rawSampleRate)) {
      showToast(`Sample rate inválido, usando ${sampleRate} Hz`, "warning");
    }

    const formatKey = modeSelect.value;
    const formatInfo = FORMAT_MAP[formatKey] ?? FORMAT_MAP["wav"];

    const options = {
      formatKey,
      formatInfo,
      channels: Number(colorsSelect.value),
      sampleRate,
      normalize: normalizeSelect ? normalizeSelect.value === "1" : false,
    };

    let buffer = selectedBuffer;
    const ctx = getAudioContext();
    await ctx.resume();

    if (options.normalize) {
      updateProgress(35, "Normalizando volumen...");
      buffer = normalizeBuffer(buffer);
    }

    if (buffer.sampleRate !== options.sampleRate) {
      updateProgress(50, `Remuestreando a ${options.sampleRate} Hz...`);
      buffer = await resampleAudioBuffer(buffer, options.sampleRate);
    }

    if (buffer.numberOfChannels !== options.channels) {
      updateProgress(
        65,
        `Convirtiendo a ${options.channels === 1 ? "Mono" : "Estéreo"}...`,
      );
      buffer = convertChannels(buffer, options.channels);
    }

    convertedFormat = formatInfo.ext;
    updateProgress(80, `Codificando ${formatKey.toUpperCase()}...`);

    if (formatInfo.bitrate !== null) {
      // Cualquier variante de MP3
      convertedBlob = await encodeMP3(buffer, formatInfo.bitrate);
    } else {
      // WAV
      convertedBlob = encodeWAV(buffer);
    }

    showResult();
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
}

function updateProgress(percent, text) {
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = text;
}

function hideProgress() {
  setTimeout(() => (progressWrap.hidden = true), 600);
}

function showResult() {
  if (currentConvertedUrl) URL.revokeObjectURL(currentConvertedUrl);
  currentConvertedUrl = URL.createObjectURL(convertedBlob);

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
}

// ==================== MANEJO DE ARCHIVOS ====================
function handleFile(file) {
  if (!file) return showToast("Selecciona un archivo de audio", "error");
  if (!file.type || !file.type.startsWith("audio/")) {
    return showToast("Archivo de audio no válido", "error");
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
      // actualiza badge de formato de entrada
      try {
        updateInputFormatBadge(getFileFormatLabel(file));
      } catch (e) {
        console.warn('No se pudo actualizar el badge de formato:', e);
      }

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
  origSize.textContent = "—";
  btnConvert.disabled = true;
  btnDownload.disabled = true;
  resetPreview();
  clearInputFormatBadge();
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

