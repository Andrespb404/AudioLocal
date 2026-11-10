import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTrimPoint, formatTime, trimmedDuration } from "../src/scripts/trim.js";

test("marca inicio y fin por separado", () => {
  const trim = applyTrimPoint(null, "start", 10, 60);
  assert.deepEqual(trim, { start: 10, end: 60 });
  assert.deepEqual(applyTrimPoint(trim, "end", 45, 60), { start: 10, end: 45 });
  assert.deepEqual(applyTrimPoint(null, "end", 30, 60), { start: 0, end: 30 });
});

test("si el punto deja el fragmento demasiado corto, el otro extremo vuelve al borde", () => {
  assert.deepEqual(applyTrimPoint({ start: 10, end: 45 }, "start", 50, 60), { start: 50, end: 60 });
  assert.deepEqual(applyTrimPoint({ start: 10, end: 45 }, "end", 5, 60), { start: 0, end: 5 });
});

test("un recorte que abarca todo el archivo es ningún recorte", () => {
  assert.equal(applyTrimPoint(null, "start", 0.02, 60), null);
  assert.equal(applyTrimPoint({ start: 10, end: 60 }, "start", 0, 60), null);
  assert.equal(applyTrimPoint(null, "end", 59.99, 60), null);
});

test("los puntos fuera del archivo se ajustan y un fragmento imposible no cambia nada", () => {
  assert.deepEqual(applyTrimPoint(null, "end", 99, 60), null);
  assert.deepEqual(applyTrimPoint(null, "start", -5, 60), null);
  assert.equal(applyTrimPoint(null, "start", 0.2, 0.4), null);
});

test("calcula la duración y la muestra con décimas", () => {
  assert.equal(trimmedDuration({ start: 10, end: 45 }, 60), 35);
  assert.equal(trimmedDuration(null, 60), 60);
  assert.equal(formatTime(65.34), "1:05.3");
  assert.equal(formatTime(0), "0:00.0");
  assert.equal(formatTime(59.97), "1:00.0");
});
