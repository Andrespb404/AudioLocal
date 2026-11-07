import assert from "node:assert/strict";
import { test } from "node:test";
import { writeAt } from "../src/scripts/blob-parts.js";

const bytes = async (parts) => [...new Uint8Array(await new Blob(parts).arrayBuffer())];

test("une escrituras fuera de orden y reescribe la cabecera", async () => {
  const parts = [];
  writeAt(parts, new Uint8Array([5, 6, 7, 8]), 4, 4); // La segunda parte llega primero.
  writeAt(parts, new Uint8Array([3, 4]), 2, 4); // La cabecera queda con un hueco.
  writeAt(parts, new Uint8Array([9]), 8, 4);
  assert.deepEqual(await bytes(parts), [0, 0, 3, 4, 5, 6, 7, 8, 9]);

  writeAt(parts, new Uint8Array([1, 2]), 0, 4); // Rellena el hueco sin mover el resto.
  writeAt(parts, new Uint8Array([70]), 6, 4); // Reescribe en medio de una parte.
  assert.deepEqual(await bytes(parts), [1, 2, 3, 4, 5, 6, 70, 8, 9]);
});
