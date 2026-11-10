// Lectura y conversión de video en el navegador. Se carga solo cuando hace falta, porque Mediabunny es grande.
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  StreamTarget,
  WavOutputFormat,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { FORMAT_MAP, formatLabel, id3HeaderSize, mp3StreamEncoder, targetSampleRate } from "./audio.js";
import { PART_SIZE, writeAt } from "./blob-parts.js";
import { t } from "./messages.js";
import { UserError } from "./shared-ui.js";

const QUALITIES = { high: QUALITY_HIGH, medium: QUALITY_MEDIUM, low: QUALITY_LOW };
// Dejar el índice al inicio ayuda al publicar en la web, pero obliga a tener todo el video en memoria: solo vale la pena si es pequeño.
const FAST_START_MAX = 256 * 1024 ** 2;
const CONTAINERS = {
  mp4: { ext: "mp4", mime: "video/mp4", label: "MP4", video: ["avc", "hevc", "vp9", "av1"], audio: ["aac", "opus"], format: (size) => new Mp4OutputFormat({ fastStart: size < FAST_START_MAX ? "in-memory" : false }) },
  webm: { ext: "webm", mime: "video/webm", label: "WebM", video: ["vp9", "vp8", "av1"], audio: ["opus"], format: () => new WebMOutputFormat() },
};

const openInput = (file) => new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

/** Traduce los errores conocidos a un mensaje claro; el detalle técnico queda en la consola. */
function friendlyError(err) {
  if (err instanceof UserError) return err;
  console.error(err);
  if (err instanceof RangeError) return new UserError(t.outOfMemory);
  return new UserError(t.conversionFailed);
}

/** Contenedores de salida que este navegador puede generar. */
export async function availableContainers() {
  const result = {};
  for (const [key, container] of Object.entries(CONTAINERS)) {
    result[key] = Boolean(await getFirstEncodableVideoCodec(container.video));
  }
  return result;
}

/** Datos del archivo sin decodificarlo: duración, tamaño de imagen y pistas. */
export async function probeMedia(file, tool) {
  const input = openInput(file);
  try {
    let videoTrack;
    let audioTrack;
    try {
      videoTrack = await input.getPrimaryVideoTrack();
      audioTrack = await input.getPrimaryAudioTrack();
    } catch (err) {
      console.error(err);
      throw new UserError(t.videoUnreadable);
    }
    if (tool === "video" && !videoTrack) throw new UserError(t.noVideoTrack);
    if (tool === "audio" && !audioTrack) throw new UserError(t.noAudioTrack);
    if (tool === "audio" && !(await audioTrack.canDecode())) throw new UserError(t.unreadable);
    return {
      duration: await input.computeDuration(),
      width: videoTrack?.displayWidth,
      height: videoTrack?.displayHeight,
      sampleRate: audioTrack?.sampleRate,
      channels: audioTrack?.numberOfChannels,
    };
  } finally {
    input.dispose();
  }
}

/** Frecuencia real del audio, leída del contenedor: decodeAudioData no la informa. */
export async function sourceSampleRate(file) {
  const input = openInput(file);
  try {
    return (await input.getPrimaryAudioTrack())?.sampleRate;
  } finally {
    input.dispose();
  }
}

/** Ejecuta una conversión con progreso y cancelación, y devuelve el archivo generado. */
async function runConversion({ format, ...options }, mime, { onProgress, signal, start = 0 }, stage) {
  const parts = [];
  const target = new StreamTarget(new WritableStream({ write: ({ data, position }) => writeAt(parts, data, position) }), { chunked: true, chunkSize: PART_SIZE });
  const conversion = await Conversion.init({ tracks: "primary", showWarnings: false, output: new Output({ format, target }), ...options });
  // Mediabunny da por válida una conversión sin imagen si conserva el audio: sin este control se entregaría un "video" vacío.
  const lostVideo = conversion.discardedTracks.some(({ track, reason }) => track.isVideoTrack() && reason !== "discarded_by_user");
  if (!conversion.isValid || lostVideo) {
    console.warn(conversion.discardedTracks);
    throw new UserError(t.cannotConvertVideo);
  }
  conversion.onProgress = (progress) => onProgress(Math.round(start + progress * (99 - start)), stage);
  const cancel = () => conversion.cancel();
  signal?.throwIfAborted(); // Cancelar durante la preparación: el evento ya pasó y no llegaría a la conversión.
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await conversion.execute();
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return { blob: new Blob(parts, { type: mime }), discarded: conversion.discardedTracks };
}

const even = (value) => Math.max(2, Math.round(value / 2) * 2);

export async function convertVideo(file, settings, { onProgress = () => {}, onWarning = () => {}, signal } = {}) {
  const input = openInput(file);
  try {
    const container = CONTAINERS[settings.container] ?? CONTAINERS.mp4;
    const track = await input.getPrimaryVideoTrack();
    const scale = settings.height && settings.height < track.displayHeight ? settings.height / track.displayHeight : 1;

    // "Igual" con un códec que el contenedor admite: se copia sin recodificar, y sin pérdida.
    const copy = scale === 1 && !QUALITIES[settings.quality] && container.video.includes(await track.getCodec());
    const audioTracks = await input.getAudioTracks();
    const copyAudio = copy && container.audio.includes(await audioTracks[0]?.getCodec());
    const video = copy ? {} : { codec: await getFirstEncodableVideoCodec(container.video) };
    const audio = copyAudio ? {} : { codec: await getFirstEncodableAudioCodec(container.audio) };

    // Nunca agranda, y deja ambos lados en números pares, que es lo que exigen los codificadores.
    const width = copy ? track.displayWidth : even(track.displayWidth * scale);
    const height = copy ? track.displayHeight : even(track.displayHeight * scale);
    if (width !== track.displayWidth || height !== track.displayHeight) Object.assign(video, { width, height, fit: "fill" });
    if (QUALITIES[settings.quality]) video.quality = QUALITIES[settings.quality];

    const format = container.format(file.size);
    const trim = settings.trim ? { trim: settings.trim } : {};
    const { blob, discarded } = await runConversion({ input, format, video, audio, ...trim }, container.mime, { onProgress, signal }, t.converting);
    if (discarded.some(({ track: lost, reason }) => lost.isAudioTrack() && reason !== "discarded_by_user")) onWarning(t.audioDropped);
    if (audioTracks.length > 1) onWarning(t.extraTracksDropped);
    return { blob, ext: container.ext, format: container.label, width, height };
  } catch (err) {
    if (signal?.aborted) throw err;
    throw friendlyError(err);
  } finally {
    input.dispose();
  }
}

/** Mayor valor absoluto del audio (o del fragmento recortado), para normalizar sin cargar el archivo en memoria. */
async function findPeak(track, onProgress, duration, signal, trim) {
  let peak = 0;
  for await (const sample of new AudioSampleSink(track).samples(trim?.start, trim?.end)) {
    for (let plane = 0; plane < sample.numberOfChannels; plane++) {
      const data = new Float32Array(sample.numberOfFrames);
      sample.copyTo(data, { planeIndex: plane, format: "f32-planar" });
      for (const value of data) peak = Math.max(peak, Math.abs(value));
    }
    onProgress(Math.round(((sample.timestamp - (trim?.start ?? 0)) / duration) * 30), t.normalizing);
    sample.close();
    signal?.throwIfAborted();
  }
  return peak > 0 && peak < 1 ? 1 / peak : 1;
}

function applyGain(sample, gain) {
  const frames = sample.numberOfFrames;
  const data = new Float32Array(frames * sample.numberOfChannels);
  for (let plane = 0; plane < sample.numberOfChannels; plane++) {
    const channel = new Float32Array(data.buffer, plane * frames * 4, frames);
    sample.copyTo(channel, { planeIndex: plane, format: "f32-planar" });
    for (let i = 0; i < frames; i++) channel[i] *= gain;
  }
  return new AudioSample({
    data,
    format: "f32-planar",
    numberOfChannels: sample.numberOfChannels,
    sampleRate: sample.sampleRate,
    timestamp: sample.timestamp,
  });
}

/** MP3 por partes con lamejs: el audio nunca se carga completo en memoria. */
async function encodeTrackToMp3(track, { channels, bitrate, gain, duration, start, onProgress, signal, trim }) {
  const encoder = mp3StreamEncoder(channels, track.sampleRate, bitrate);
  const from = trim?.start ?? 0;
  const to = trim?.end ?? Infinity;
  let lastPause = performance.now();
  for await (const sample of new AudioSampleSink(track).samples(trim?.start, trim?.end)) {
    // Los fragmentos del archivo no coinciden con el recorte: se descarta lo que cae fuera, muestra a muestra.
    const first = Math.max(0, Math.round((from - sample.timestamp) * sample.sampleRate));
    const last = Math.min(sample.numberOfFrames, Math.round((to - sample.timestamp) * sample.sampleRate));
    if (last <= first) {
      sample.close();
      continue;
    }
    const planes = [];
    for (let plane = 0; plane < Math.min(sample.numberOfChannels, 2); plane++) {
      const data = new Float32Array(sample.numberOfFrames);
      sample.copyTo(data, { planeIndex: plane, format: "f32-planar" });
      planes.push(data.subarray(first, last));
    }
    let left = planes[0];
    let right = planes[1] ?? left;
    if (channels === 1 && planes[1]) {
      left = left.map((value, i) => (value + right[i]) / 2);
      right = left;
    }
    encoder.push(left, right, gain);
    onProgress(Math.min(99, Math.round(start + ((sample.timestamp - from) / duration) * (99 - start))), t.encoding("MP3"));
    sample.close();
    signal?.throwIfAborted();
    // Cede el control cada 50 ms para mantener la interfaz fluida. Hacerlo en cada fragmento sumaba minutos de espera en audios largos.
    if (performance.now() - lastPause > 50) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastPause = performance.now();
    }
  }
  return encoder.finish();
}

/**
 * lamejs entrega el MP3 sin etiquetas. Mediabunny escribe un MP3 mínimo con las del original, y de ahí solo se toma
 * la cabecera ID3 para anteponerla: reescribir el archivo entero congelaba la página varios segundos en audios largos.
 * Si algo falla, queda el MP3 tal cual.
 */
async function tagMp3(blob, tags) {
  if (Object.keys(tags).length === 0) return blob;
  const untagged = openInput(blob);
  try {
    const packet = await new EncodedPacketSink(await untagged.getPrimaryAudioTrack()).getFirstPacket();
    const source = new EncodedAudioPacketSource("mp3");
    const output = new Output({ format: new Mp3OutputFormat({ xingHeader: false }), target: new BufferTarget() });
    output.addAudioTrack(source);
    output.setMetadataTags(tags);
    await output.start();
    await source.add(packet);
    await output.finalize();
    const bytes = new Uint8Array(output.target.buffer);
    return new Blob([bytes.subarray(0, id3HeaderSize(bytes)), blob], { type: blob.type });
  } catch (err) {
    console.warn("El MP3 queda sin etiquetas:", err);
    return blob;
  } finally {
    untagged.dispose();
  }
}

/** Convierte el audio de un archivo de audio o de video, leyéndolo por partes. */
export async function extractAudio(file, settings, { onProgress = () => {}, signal } = {}) {
  const input = openInput(file);
  let pcmInput = null;
  try {
    const formatInfo = FORMAT_MAP[settings.format] ?? FORMAT_MAP.mp3_256;
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new UserError(t.noAudioTrack);
    const { trim } = settings;
    const duration = trim ? trim.end - trim.start : await input.computeDuration();
    const trimOption = trim ? { trim } : {};
    const report = { onProgress, signal };

    onProgress(2, t.extracting);
    const gain = settings.normalize ? await findPeak(track, onProgress, duration, signal, trim) : 1;
    const start = settings.normalize ? 30 : 0;
    const rate = targetSampleRate(settings, track.sampleRate, formatInfo);
    const channels = settings.channels;
    // Opus siempre trabaja a 48 kHz.
    const result = { ext: formatInfo.ext, format: formatLabel(formatInfo), sampleRate: formatInfo.type === "ogg" ? 48000 : rate, channels };

    if (formatInfo.type === "mp3") {
      // Con otra frecuencia o con más de dos canales (5.1), primero pasa a WAV: lamejs solo recibe el audio
      // ya en su frecuencia final, y tomar dos canales de un 5.1 dejaría fuera la voz, que va en el central.
      let source = track;
      if (rate !== track.sampleRate || track.numberOfChannels > 2) {
        const { blob } = await runConversion(
          { input, format: new WavOutputFormat(), video: { discard: true }, audio: { sampleRate: rate, numberOfChannels: channels }, ...trimOption },
          "audio/wav",
          { onProgress: (progress, stage) => onProgress(Math.round(progress / 2), stage), signal, start },
          t.resampling,
        );
        pcmInput = openInput(blob);
        source = await pcmInput.getPrimaryAudioTrack();
      }
      // El WAV intermedio ya sale recortado: solo hay que recortar al leer directo del original.
      const mp3 = await encodeTrackToMp3(source, { channels, bitrate: formatInfo.bitrate, gain, duration, start: Math.max(start, source === track ? 0 : 50), onProgress, signal, trim: source === track ? trim : null });
      // `raw` son etiquetas en el formato de origen (por ejemplo, de FLAC): no valen para ID3.
      const { raw: _raw, ...tags } = await input.getMetadataTags();
      return { ...result, blob: await tagMp3(mp3, tags) };
    }

    const audio = { numberOfChannels: channels };
    if (gain !== 1) {
      audio.forceTranscode = true;
      audio.process = (sample) => applyGain(sample, gain);
    }
    let format;
    let mime;
    if (formatInfo.type === "wav") {
      format = new WavOutputFormat();
      mime = "audio/wav";
      audio.sampleRate = rate;
    } else if (formatInfo.type === "ogg") {
      format = new OggOutputFormat();
      mime = "audio/ogg";
      audio.codec = "opus";
    } else {
      format = new Mp4OutputFormat({ fastStart: "in-memory" });
      mime = "audio/mp4";
      audio.codec = "aac";
    }
    const { blob } = await runConversion({ input, format, video: { discard: true }, audio, ...trimOption }, mime, { ...report, start }, t.extracting);
    return { ...result, blob };
  } catch (err) {
    if (signal?.aborted) throw err;
    throw friendlyError(err);
  } finally {
    input.dispose();
    pcmInput?.dispose();
  }
}
