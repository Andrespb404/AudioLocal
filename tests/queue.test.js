import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STATUS,
  conversionLabel,
  createItem,
  errorSummary,
  hasUnsavedResults,
  outputName,
  requeue,
  runQueue,
  uniqueName,
} from "../src/scripts/queue.js";

function pending(id) {
  const item = createItem(id, { name: `${id}.wav` });
  item.status = STATUS.PENDING;
  return item;
}

test("convierte de a uno y en orden", async () => {
  const items = [pending(1), pending(2)];
  let active = 0;
  const order = [];
  await runQueue(items, async (item) => {
    assert.equal(++active, 1);
    order.push(item.id);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return { url: "x" };
  });
  assert.deepEqual(order, [1, 2]);
  assert.ok(items.every((item) => item.status === STATUS.DONE && item.progress === 100));
});

test("un fallo no detiene la cola y se puede reintentar", async () => {
  const items = [pending(1), pending(2)];
  await runQueue(items, async (item) => {
    if (item.id === 1) throw new Error("dañado");
    return {};
  });
  assert.equal(items[0].status, STATUS.ERROR);
  assert.equal(items[0].error, "dañado");
  assert.equal(items[0].retryable, true);
  assert.equal(items[1].status, STATUS.DONE);

  requeue(items[0]);
  assert.equal(items[0].status, STATUS.PENDING);
  assert.equal(items[0].error, null);
});

test("cancelar devuelve el archivo en curso a pendiente y no sigue", async () => {
  const items = [pending(1), pending(2)];
  const controller = new AbortController();
  await runQueue(
    items,
    async () => {
      controller.abort();
      throw controller.signal.reason;
    },
    { signal: controller.signal },
  );
  assert.deepEqual(items.map((item) => item.status), [STATUS.PENDING, STATUS.PENDING]);
});

test("toma archivos agregados durante la ejecución", async () => {
  const items = [pending(1)];
  await runQueue(items, async (item) => {
    if (item.id === 1) items.push(pending(2));
    return {};
  });
  assert.equal(items[1].status, STATUS.DONE);
});

test("ignora archivos que no están pendientes", async () => {
  const analyzing = createItem(1, { name: "a.wav" });
  const rejected = createItem(2, { name: "b.txt" }, "Formato no válido");
  await runQueue([analyzing, rejected], async () => assert.fail("no debía convertir"));
  assert.equal(analyzing.status, STATUS.ANALYZING);
  assert.equal(rejected.status, STATUS.ERROR);
  assert.equal(rejected.retryable, false);
});

test("detecta resultados sin descargar", () => {
  const item = pending(1);
  assert.equal(hasUnsavedResults([item]), false);
  item.status = STATUS.DONE;
  assert.equal(hasUnsavedResults([item]), true);
  item.downloaded = true;
  assert.equal(hasUnsavedResults([item]), false);
});

test("el avance del lote cuenta el archivo en curso", () => {
  assert.equal(conversionLabel({ done: 0, converting: 1, pending: 0 }), "Convirtiendo");
  assert.equal(conversionLabel({ done: 0, converting: 1, pending: 2 }), "Convirtiendo 1 de 3");
  assert.equal(conversionLabel({ done: 1, converting: 1, pending: 1 }), "Convirtiendo 2 de 3");
  // Entre un archivo y el siguiente no hay ninguno en curso: no debe retroceder.
  assert.equal(conversionLabel({ done: 1, converting: 0, pending: 2 }), "Convirtiendo 2 de 3");
  assert.equal(conversionLabel({ done: 3, converting: 0, pending: 0 }), "Convirtiendo 3 de 3");
});

test("los nombres de salida no se repiten ni traen rutas", () => {
  assert.equal(outputName("tema.final.wav", "mp3"), "tema.final (Convertido).mp3");
  assert.equal(outputName("../../evil.wav", "mp3"), ".._.._evil (Convertido).mp3");
  const taken = new Set();
  assert.equal(uniqueName("a (Converted).mp3", taken), "a (Converted).mp3");
  assert.equal(uniqueName("A (Converted).MP3", taken), "A (Converted) 2.MP3");
  assert.equal(uniqueName("a (Converted).mp3", taken), "a (Converted) 3.mp3");
});

test("el resumen de errores da la causa sin repetirla", () => {
  const failed = (error) => ({ status: STATUS.ERROR, error });
  assert.equal(errorSummary([{ status: STATUS.DONE }]), "");
  assert.equal(errorSummary([failed("Dañado."), failed("Dañado."), failed("Muy grande.")]), "3 con error: Dañado. Muy grande.");
});
