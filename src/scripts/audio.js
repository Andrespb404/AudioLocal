// Decodificación, procesamiento y codificación de audio. Nada de esto toca el DOM.
/* global lamejs */
import { t } from "./messages.js";

export const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
export const MAX_DURATION_SECONDS = 20 * 60;
export const VALID_SAMPLE_RATES = [8000, 11025, 16000, 22050, 44100, 48000, 96000];
const MP3_MAX_SAMPLE_RATE = 48000;

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
  "audio/flac",
  "audio/x-flac",
];
const SUPPORTED_FILE_EXTENSIONS = ["mp3", "wav", "ogg", "aac", "m4a", "webm", "flac"];

export const FORMAT_MAP = {
  wav: { ext: "wav", type: "wav", bitrate: null },
  mp3_128: { ext: "mp3", type: "mp3", bitrate: 128 },
  mp3_256: { ext: "mp3", type: "mp3", bitrate: 256 },
  mp3_320: { ext: "mp3", type: "mp3", bitrate: 320 },
  ogg: {
    ext: "ogg",
    type: "ogg",
    bitrate: 128,
    realtime: true,
    mimeCandidates: ["audio/ogg; codecs=opus", "audio/ogg"],
  },
  aac: {
    ext: "m4a",
    type: "aac",
    bitrate: 128,
    realtime: true,
    mimeCandidates: ["audio/mp4; codecs=mp4a.40.2", "audio/x-m4a", "audio/aac"],
  },
};

let audioContext = null;
export function getAudioContext() {
  if (!audioContext || audioContext.state === "closed") {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
  }
  return audioContext;
}

function getFileExtension(file) {
  const match = file.name && file.name.match(/\.([^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

export function isSupportedAudioFile(file) {
  if (!file) return false;
  if (file.type && SUPPORTED_AUDIO_TYPES.includes(file.type.toLowerCase())) return true;
  return SUPPORTED_FILE_EXTENSIONS.includes(getFileExtension(file));
}

/** Motivo de rechazo de un archivo, o null si es válido. */
export function validateFile(file) {
  if (!isSupportedAudioFile(file)) return t.invalidFormat;
  if (file.size > MAX_FILE_SIZE) return t.tooLarge;
  return null;
}

export function getFileFormatLabel(file) {
  if (!file) return "-";
  const t = (file.type || "").toLowerCase();
  if (t.includes("mpeg") || t.includes("mp3")) return "MP3";
  if (t.includes("wav")) return "WAV";
  if (t.includes("ogg")) return "OGG";
  if (t.includes("aac") || t.includes("mp4") || t.includes("m4a")) return "AAC";
  const ext = getFileExtension(file);
  return ext ? ext.toUpperCase() : t.unknownFormat;
}

export function formatLabel(formatInfo) {
  return formatInfo.type === "aac" ? "AAC" : formatInfo.ext.toUpperCase();
}

export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / k ** i).toFixed(1)) + " " + sizes[i];
}

export function formatDuration(seconds) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

export const channelsLabel = (channels) => (channels === 1 ? t.mono : t.stereo);
export const sampleRateLabel = (rate) => `${rate.toLocaleString(t.locale)} Hz`;

/** Frecuencia final según los ajustes y lo que admite el formato. */
export function targetSampleRate(settings, bufferRate, formatInfo) {
  if (formatInfo.realtime) return bufferRate; // MediaRecorder usa la frecuencia del AudioContext
  const wanted =
    !settings.keepSampleRate && VALID_SAMPLE_RATES.includes(settings.sampleRate)
      ? settings.sampleRate
      : bufferRate;
  return formatInfo.type === "mp3" ? Math.min(wanted, MP3_MAX_SAMPLE_RATE) : wanted;
}

export function estimateOutputBytes(meta, settings) {
  const formatInfo = FORMAT_MAP[settings.format] ?? FORMAT_MAP.wav;
  if (formatInfo.bitrate) return Math.round((meta.duration * formatInfo.bitrate * 1000) / 8);
  const rate = targetSampleRate(settings, meta.sampleRate, formatInfo);
  return Math.round(meta.duration * rate * settings.channels * 2);
}

// shortcut: decodeAudioData remuestrea a la frecuencia del AudioContext, así que no conocemos la
// frecuencia real del archivo; para conservarla habría que leer el encabezado de cada contenedor.
export async function decodeFile(file) {
  return getAudioContext().decodeAudioData(await file.arrayBuffer());
}

// ==================== CODIFICADORES ====================

// WAV con muestras intercaladas (L,R,L,R...) según estándar
export function encodeWAV(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset++, str.charCodeAt(i));
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
  for (let ch = 0; ch < numChannels; ch++) channels.push(audioBuffer.getChannelData(ch));

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

const toInt16 = (sample) => Math.max(-1, Math.min(1, sample)) * 32767;

// MP3 con bitrate configurable vía lamejs local
async function encodeMP3(audioBuffer, bitrate, onProgress, signal) {
  const channels = audioBuffer.numberOfChannels;
  const mp3encoder = new lamejs.Mp3Encoder(channels, audioBuffer.sampleRate, bitrate);

  const mp3Data = [];
  const blockSize = 1152;
  const left = audioBuffer.getChannelData(0);
  const right = channels > 1 ? audioBuffer.getChannelData(1) : left;
  const totalBlocks = Math.ceil(left.length / blockSize);

  for (let b = 0; b < totalBlocks; b++) {
    const start = b * blockSize;
    const size = Math.min(blockSize, left.length - start);
    const leftChunk = new Int16Array(size);
    const rightChunk = new Int16Array(size);

    for (let j = 0; j < size; j++) {
      leftChunk[j] = toInt16(left[start + j]);
      rightChunk[j] = toInt16(right[start + j]);
    }

    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));

    if (b % 100 === 0) {
      onProgress(70 + Math.floor((b / totalBlocks) * 28), t.encoding("MP3"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
  }

  const final = mp3encoder.flush();
  if (final.length > 0) mp3Data.push(new Uint8Array(final));
  return new Blob(mp3Data, { type: "audio/mp3" });
}

function getSupportedMediaMime(formatInfo) {
  if (!formatInfo?.mimeCandidates || typeof MediaRecorder === "undefined") return null;
  return formatInfo.mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || null;
}

export function isOutputFormatSupported(formatKey) {
  const formatInfo = FORMAT_MAP[formatKey];
  if (!formatInfo) return false;
  if (formatInfo.type === "wav" || formatInfo.type === "mp3") return true;
  return Boolean(getSupportedMediaMime(formatInfo));
}

// MediaRecorder graba mientras el audio suena: tarda lo mismo que dura el archivo.
async function encodeWithMediaRecorder(audioBuffer, mimeType, onProgress, signal) {
  const ctx = getAudioContext();
  await ctx.resume();

  const destination = ctx.createMediaStreamDestination();
  destination.channelCount = audioBuffer.numberOfChannels;
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(destination);

  const recorder = new MediaRecorder(destination.stream, { mimeType });
  const chunks = [];
  const startedAt = ctx.currentTime;

  return new Promise((resolve, reject) => {
    const ticker = setInterval(() => {
      const done = Math.min(1, (ctx.currentTime - startedAt) / audioBuffer.duration);
      onProgress(70 + Math.floor(done * 28), t.encodingRealtime);
    }, 500);

    const stop = () => {
      clearInterval(ticker);
      if (recorder.state === "recording") recorder.stop();
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      clearInterval(ticker);
      reject(event.error || new Error("Error de MediaRecorder"));
    };
    recorder.onstop = () => {
      source.disconnect();
      destination.disconnect();
      resolve(new Blob(chunks, { type: mimeType }));
    };
    // Margen para que el codificador no corte el final del audio.
    source.onended = () => setTimeout(stop, 200);

    signal?.addEventListener(
      "abort",
      () => {
        reject(signal.reason);
        source.onended = null;
        stop(); // recorder.onstop desconecta la fuente
      },
      { once: true },
    );

    // Suena cuando el grabador ya escucha, para no perder el inicio del audio.
    recorder.onstart = () => source.start(0);
    recorder.start();
    // Respaldo por si onended no llega (pestaña suspendida).
    setTimeout(stop, audioBuffer.duration * 1000 + 1200);
  });
}

// ==================== PROCESAMIENTO ====================

function normalizeBuffer(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  let peak = 0;
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
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
async function resampleAudioBuffer(audioBuffer, rate) {
  const newLength = Math.ceil(audioBuffer.duration * rate);
  const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtor(audioBuffer.numberOfChannels, newLength, rate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return offlineCtx.startRendering();
}

// Conversión de canales: estéreo→mono (promedio) o mono→estéreo (duplicar)
function convertChannels(audioBuffer, targetChannels) {
  const result = getAudioContext().createBuffer(
    targetChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );

  if (targetChannels === 1) {
    const monoData = result.getChannelData(0);
    const numSrc = audioBuffer.numberOfChannels;
    for (let ch = 0; ch < numSrc; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) monoData[i] += data[i] / numSrc;
    }
  } else {
    // shortcut: un origen multicanal (5.1) a estéreo usa solo el primer canal; hacer un downmix real si hay pedidos.
    const srcData = audioBuffer.getChannelData(0);
    for (let ch = 0; ch < targetChannels; ch++) result.getChannelData(ch).set(srcData);
  }
  return result;
}

async function encode(buffer, formatInfo, onProgress, signal) {
  if (formatInfo.type === "wav") return encodeWAV(buffer);
  if (formatInfo.type === "mp3") return encodeMP3(buffer, formatInfo.bitrate, onProgress, signal);
  return encodeWithMediaRecorder(buffer, getSupportedMediaMime(formatInfo), onProgress, signal);
}

/** Convierte un archivo completo. El audio decodificado se libera al terminar. */
export async function convertFile(file, settings, { onProgress = () => {}, onWarning = () => {}, signal } = {}) {
  onProgress(5, t.reading);
  let buffer = await decodeFile(file);
  signal?.throwIfAborted();

  let formatInfo = FORMAT_MAP[settings.format] ?? FORMAT_MAP.wav;
  if (!isOutputFormatSupported(settings.format)) {
    onWarning(t.formatUnavailable(formatLabel(formatInfo)));
    formatInfo = FORMAT_MAP.wav;
  }

  if (settings.normalize) {
    onProgress(25, t.normalizing);
    buffer = normalizeBuffer(buffer);
  }

  const rate = targetSampleRate(settings, buffer.sampleRate, formatInfo);
  if (buffer.sampleRate !== rate) {
    onProgress(45, t.resampling);
    buffer = await resampleAudioBuffer(buffer, rate);
    signal?.throwIfAborted();
  }

  if (buffer.numberOfChannels !== settings.channels) {
    onProgress(60, t.adjustingChannels);
    buffer = convertChannels(buffer, settings.channels);
  }

  onProgress(70, t.encoding(formatLabel(formatInfo)));
  let blob;
  try {
    blob = await encode(buffer, formatInfo, onProgress, signal);
  } catch (err) {
    if (signal?.aborted || formatInfo.type === "wav") throw err;
    console.error(err);
    onWarning(t.encodeFailed(formatLabel(formatInfo)));
    formatInfo = FORMAT_MAP.wav;
    blob = encodeWAV(buffer);
  }

  return {
    blob,
    ext: formatInfo.ext,
    format: formatLabel(formatInfo),
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  };
}
