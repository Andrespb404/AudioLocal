// Decodificación, procesamiento y codificación de audio. Nada de esto toca el DOM.
/* global lamejs */
import { t } from "./messages.js";

export const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
export const MAX_VIDEO_SIZE = 2 * 1024 ** 3; // 2 GB: se lee por partes, sin cargarlo completo en memoria
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
const SUPPORTED_FILE_EXTENSIONS = ["mp3", "wav", "ogg", "opus", "aac", "m4a", "flac"];
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "mkv", "webm", "ts"];
const UNSUPPORTED_VIDEO_TYPES = ["video/x-msvideo", "video/avi", "video/x-ms-wmv", "video/x-flv"];

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

export function isVideoFile(file) {
  if (UNSUPPORTED_VIDEO_TYPES.includes(file.type)) return false;
  return VIDEO_EXTENSIONS.includes(getFileExtension(file)) || file.type.startsWith("video/");
}

/**
 * Motivo de rechazo de un archivo, o null si es válido.
 * `streaming`: el navegador puede leer el archivo por partes. Sin eso, se decodifica completo en memoria.
 */
export function validateFile(file, tool = "audio", streaming = typeof AudioDecoder !== "undefined") {
  const video = isVideoFile(file);
  if (tool === "video") {
    if (!video) return t.videoInvalid;
    return file.size > MAX_VIDEO_SIZE ? t.videoTooLarge : null;
  }
  if (!video && !isSupportedAudioFile(file)) return t.invalidFormat;
  if (streaming) return file.size > MAX_VIDEO_SIZE ? t.videoTooLarge : null;
  return file.size > MAX_FILE_SIZE ? t.tooLarge : null;
}

export function getFileFormatLabel(file) {
  if (!file) return "-";
  const ext = getFileExtension(file);
  if (isVideoFile(file)) return ext ? ext.toUpperCase() : "VIDEO";
  const type = (file.type || "").toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return "MP3";
  if (type.includes("wav")) return "WAV";
  if (type.includes("ogg")) return "OGG";
  if (type.includes("aac") || type.includes("mp4") || type.includes("m4a")) return "AAC";
  return ext ? ext.toUpperCase() : t.unknownFormat;
}

export function formatLabel(formatInfo) {
  return formatInfo.type === "aac" ? "AAC" : formatInfo.ext.toUpperCase();
}

/** Largo de la cabecera ID3v2 con que empieza un MP3, o 0 si no la tiene. Su tamaño va en 4 bytes de 7 bits. */
export function id3HeaderSize(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  return 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
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
  const rate = targetSampleRate(settings, meta.sampleRate, formatInfo);
  if (formatInfo.bitrate) {
    // A baja frecuencia, MP3 no llega a los bitrates altos: la norma los limita a 64 o 160 kbps.
    const ceiling = formatInfo.type !== "mp3" || rate >= 32000 ? Infinity : rate >= 16000 ? 160 : 64;
    return Math.round((meta.duration * Math.min(formatInfo.bitrate, ceiling) * 1000) / 8);
  }
  return Math.round(meta.duration * rate * settings.channels * 2);
}

// decodeAudioData remuestrea a la frecuencia del contexto: uno con la del archivo la conserva.
export async function decodeFile(file) {
  const bytes = await file.arrayBuffer();
  try {
    const { sourceSampleRate } = await import("./video.js");
    const rate = await sourceSampleRate(file);
    if (rate) return await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.slice(0)); // decodeAudioData consume el buffer
  } catch (err) {
    console.warn("Se decodifica a la frecuencia del navegador:", err);
  }
  return getAudioContext().decodeAudioData(bytes);
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

/** Codificador MP3 por partes con lamejs. `gain` permite normalizar sin otra copia del audio. */
export function mp3StreamEncoder(channels, sampleRate, bitrate) {
  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, bitrate);
  const chunks = [];
  const keep = (data) => {
    if (data.length > 0) chunks.push(new Uint8Array(data));
  };
  return {
    push(left, right, gain = 1) {
      const leftChunk = new Int16Array(left.length);
      const rightChunk = new Int16Array(left.length);
      for (let i = 0; i < left.length; i++) {
        leftChunk[i] = toInt16(left[i] * gain);
        rightChunk[i] = toInt16(right[i] * gain);
      }
      keep(encoder.encodeBuffer(leftChunk, rightChunk));
    },
    finish() {
      keep(encoder.flush());
      return new Blob(chunks, { type: "audio/mp3" });
    },
  };
}

// MP3 con bitrate configurable vía lamejs local
async function encodeMP3(audioBuffer, bitrate, onProgress, signal) {
  const channels = audioBuffer.numberOfChannels;
  const encoder = mp3StreamEncoder(channels, audioBuffer.sampleRate, bitrate);
  const blockSize = 1152;
  const left = audioBuffer.getChannelData(0);
  const right = channels > 1 ? audioBuffer.getChannelData(1) : left;
  const totalBlocks = Math.ceil(left.length / blockSize);

  for (let b = 0; b < totalBlocks; b++) {
    const start = b * blockSize;
    const end = start + blockSize;
    encoder.push(left.subarray(start, end), right.subarray(start, end));

    if (b % 100 === 0) {
      onProgress(70 + Math.floor((b / totalBlocks) * 28), t.encoding("MP3"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
  }

  return encoder.finish();
}

/** Con WebCodecs, OGG y AAC se codifican con Mediabunny, sin grabar en tiempo real ni depender de MediaRecorder. */
export async function hasAudioEncoder(codec) {
  try {
    return (await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported;
  } catch {
    return false;
  }
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

// Resampleo real usando OfflineAudioContext. Con menos canales, mezcla según la norma de Web Audio.
async function resampleAudioBuffer(audioBuffer, rate, channels = audioBuffer.numberOfChannels) {
  const newLength = Math.ceil(audioBuffer.duration * rate);
  const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtor(channels, newLength, rate);
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
    // 5.1 y similares: tomar un solo canal perdería la voz, que va en el central.
    buffer = buffer.numberOfChannels > 2 ? await resampleAudioBuffer(buffer, buffer.sampleRate, settings.channels) : convertChannels(buffer, settings.channels);
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
    sampleRate: formatInfo.realtime ? getAudioContext().sampleRate : buffer.sampleRate,
    channels: buffer.numberOfChannels,
  };
}
