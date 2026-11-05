import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FORMAT_MAP,
  encodeWAV,
  estimateOutputBytes,
  targetSampleRate,
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

test("estimateOutputBytes calcula por bitrate o por PCM", () => {
  const meta = { duration: 10, sampleRate: 44100 };
  const base = { keepSampleRate: true, sampleRate: 44100, channels: 2 };
  assert.equal(estimateOutputBytes(meta, { ...base, format: "mp3_128" }), 160000);
  assert.equal(estimateOutputBytes(meta, { ...base, format: "wav" }), 1764000);
});

test("validateFile rechaza formato y tamaño, sin exigir tipo MIME", () => {
  assert.equal(validateFile({ name: "a.mp3", type: "", size: 10 }), null);
  assert.match(validateFile({ name: "a.txt", type: "text/plain", size: 10 }), /Formato/);
  assert.match(validateFile({ name: "a.wav", type: "audio/wav", size: 151 * 1024 * 1024 }), /150 MB/);
});
