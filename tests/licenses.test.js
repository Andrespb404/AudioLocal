import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { components } from "../src/data/licenses.js";

test("lame.min.js es el de lamejs 1.2.1, sin modificar", () => {
  // Git puede convertir los saltos de línea en Windows: el hash se calcula con LF.
  const code = readFileSync("public/js/lame.min.js", "latin1").replaceAll("\r", "");
  const hash = createHash("sha256").update(code, "latin1").digest("hex");
  assert.equal(hash, "15d285e2587b3bdbfd18a68de6ce07cc074f7480a82c3815da2dc1c348ec6df4");
});

test("cada componente tiene su licencia disponible", () => {
  for (const { name, files } of components) for (const file of files) assert.ok(existsSync(file), `${name}: ${file}`);
});
