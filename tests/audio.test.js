import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORMAT_MAP,
  encodeWAV,
  estimateOutputBytes,
  targetSampleRate,
  getFileFormatLabel,
  isVideoFile,
  validateFile,
} from "../src/scripts/audio.js";

function fakeBuffer(channels) {
  return {
    numberOfChannels: channels.length,
    sampleRate: 44100,
    length: channels[0].length,
    getChannelData: (ch) => Float32Array.from(channels[ch]),
  };
}

test("encodeWAV escribe encabezado correcto y muestras intercaladas y limitadas", async () => {
  const blob = encodeWAV(fakeBuffer([[0, 2], [-1, 0.5]]));
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset, size) => String.fromCharCode(...Array.from({ length: size }, (_, i) => view.getUint8(offset + i)));

  assert.equal(blob.type, "audio/wav");
  assert.equal(view.byteLength, 44 + 2 * 2 * 2);
  assert.equal(text(0, 4), "RIFF");
  assert.equal(text(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 32767); // 2 se limita a 1
});

test("targetSampleRate respeta los límites de cada formato", () => {
  const settings = { sampleRate: 96000, keepSampleRate: false };
  assert.equal(targetSampleRate(settings, 44100, FORMAT_MAP.wav), 96000);
  assert.equal(targetSampleRate(settings, 44100, FORMAT_MAP.mp3_320), 48000);
  assert.equal(targetSampleRate(settings, 44100, FORMAT_MAP.ogg), 44100);
  assert.equal(targetSampleRate({ sampleRate: 22050, keepSampleRate: true }, 44100, FORMAT_MAP.wav), 44100);
  assert.equal(targetSampleRate({ sampleRate: 12345, keepSampleRate: false }, 44100, FORMAT_MAP.wav), 44100);
});

test("la estimación de MP3 respeta el bitrate máximo de cada frecuencia", () => {
  const meta = { duration: 10, sampleRate: 44100, channels: 2 };
  const settings = { format: "mp3_320", channels: 2, keepSampleRate: false };
  assert.equal(estimateOutputBytes(meta, { ...settings, sampleRate: 44100 }), 400000);
  assert.equal(estimateOutputBytes(meta, { ...settings, sampleRate: 22050 }), 200000);
  assert.equal(estimateOutputBytes(meta, { ...settings, sampleRate: 8000 }), 80000);
});

test("estimateOutputBytes calcula por bitrate o por PCM", () => {
  const meta = { duration: 10, sampleRate: 44100 };
  const base = { keepSampleRate: true, sampleRate: 44100, channels: 2 };
  assert.equal(estimateOutputBytes(meta, { ...base, format: "mp3_128" }), 160000);
  assert.equal(estimateOutputBytes(meta, { ...base, format: "wav" }), 1764000);
});

test("validateFile rechaza formato y tamaño, sin exigir tipo MIME", () => {
  assert.equal(validateFile({ name: "a.mp3", type: "", size: 10 }), null);
  assert.equal(validateFile({ name: "a.flac", type: "", size: 10 }), null);
  assert.equal(validateFile({ name: "a.bin", type: "audio/flac", size: 10 }), null);
  assert.match(validateFile({ name: "a.txt", type: "text/plain", size: 10 }), /Formato/);
  assert.match(validateFile({ name: "a.wav", type: "audio/wav", size: 151 * 1024 * 1024 }), /150 MB/);
});

test("los videos se validan según la herramienta", () => {
  const mp4 = { name: "a.mp4", type: "video/mp4", size: 500 * 1024 * 1024 };
  const huge = { name: "a.mov", type: "", size: 3 * 1024 ** 3 };
  const avi = { name: "a.avi", type: "video/x-msvideo", size: 10 };
  const mp3 = { name: "a.mp3", type: "audio/mpeg", size: 10 };

  assert.equal(isVideoFile(mp4), true);
  assert.equal(isVideoFile(mp3), false);
  assert.equal(isVideoFile(avi), false);

  // En la herramienta de video.
  assert.equal(validateFile(mp4, "video"), null);
  assert.match(validateFile(huge, "video"), /2 GB/);
  assert.match(validateFile(mp3, "video"), /video/);
  assert.match(validateFile(avi, "video"), /video/);

  // En la de audio: se lee por partes si el navegador puede, y si no vuelve al límite de 150 MB.
  assert.equal(validateFile(mp4, "audio", true), null);
  assert.match(validateFile(mp4, "audio", false), /150 MB/);
  assert.match(validateFile(avi, "audio", true), /Formato/);
});

test("un video no se etiqueta como AAC", () => {
  assert.equal(getFileFormatLabel({ name: "a.mp4", type: "video/mp4" }), "MP4");
  assert.equal(getFileFormatLabel({ name: "a.m4a", type: "audio/mp4" }), "AAC");
  assert.equal(getFileFormatLabel({ name: "sin-extension", type: "" }), "Desconocido");
});
