import assert from "node:assert/strict";
import { test } from "node:test";
import { jpegOrientation, orientationMatrix, pngPixels } from "../src/scripts/exif.js";

/** JPG mínimo: SOI, APP1 con una sola etiqueta Orientation y SOS. */
function jpeg(orientation, little = true) {
  const u16 = (value) => (little ? [value & 255, value >> 8] : [value >> 8, value & 255]);
  const u32 = (value) => (little ? [value & 255, 0, 0, 0] : [0, 0, 0, value & 255]);
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...app1, 0xff, 0xda, 0, 2]);
}

test("mide un PNG por su encabezado", () => {
  const png = new Uint8Array(24);
  new DataView(png.buffer).setUint32(16, 16000);
  new DataView(png.buffer).setUint32(20, 16000);
  assert.equal(pngPixels(png), 256_000_000);
  assert.equal(pngPixels(new Uint8Array(4)), 0);
});

test("lee la orientación en los dos órdenes de bytes", () => {
  assert.equal(jpegOrientation(jpeg(6)), 6);
  assert.equal(jpegOrientation(jpeg(8, false)), 8);
});

test("un archivo sin etiqueta, ajeno o cortado se usa tal cual", () => {
  assert.equal(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1);
  assert.equal(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 1);
  assert.equal(jpegOrientation(new Uint8Array(1)), 1);
  assert.equal(jpegOrientation(jpeg(6).subarray(0, 20)), 1);
  assert.equal(jpegOrientation(jpeg(99)), 1);
});

test("cada orientación deja la esquina superior izquierda donde corresponde", () => {
  const [w, h] = [40, 30];
  const place = (orientation) => {
    const [a, b, c, d, e, f] = orientationMatrix(orientation, w, h);
    // Esquina superior izquierda de la imagen guardada, con el eje Y hacia arriba.
    return [a * 0 + c * h + e, b * 0 + d * h + f];
  };
  assert.deepEqual(place(1), [0, 30]); // arriba izquierda
  assert.deepEqual(place(2), [40, 30]); // arriba derecha
  assert.deepEqual(place(3), [40, 0]); // abajo derecha
  assert.deepEqual(place(4), [0, 0]); // abajo izquierda
  assert.deepEqual(place(5), [0, 40]); // arriba izquierda, en un lienzo de 30×40
  assert.deepEqual(place(6), [30, 40]); // arriba derecha
  assert.deepEqual(place(7), [30, 0]); // abajo derecha
  assert.deepEqual(place(8), [0, 0]); // abajo izquierda
});
