import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRanges } from "../src/scripts/ranges.js";

test("vacío significa una página por archivo", () => {
  assert.deepEqual(parseRanges("", 3), [[1], [2], [3]]);
  assert.deepEqual(parseRanges("   ", 1), [[1]]);
});

test("cada parte separada por coma es un archivo", () => {
  assert.deepEqual(parseRanges("1-3, 5", 5), [[1, 2, 3], [5]]);
  assert.deepEqual(parseRanges("2 - 2,1", 2), [[2], [1]]);
});

test("acepta como se escribe de forma natural", () => {
  assert.deepEqual(parseRanges("2 y 3", 5), [[2], [3]]);
  assert.deepEqual(parseRanges("2 and 3-4; 5", 5), [[2], [3, 4], [5]]);
});

test("rechaza lo que no existe en el PDF o no se entiende", () => {
  for (const text of ["0", "6", "1-6", "3-1", "a", "1-", "1,,2", "-1", "1.5"]) {
    assert.equal(parseRanges(text, 5), null, text);
  }
});
