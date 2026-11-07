import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import { stripScripts } from "../src/scripts/pdf-clean.js";

const A = PDFName.of("A");

test("quita el JavaScript de las anotaciones y conserva los enlaces", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage();
  const { context } = source;
  const annotation = (action) => context.register(context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], A: action, AA: {} }));
  const script = annotation({ S: "JavaScript", JS: PDFString.of("app.alert(1)") });
  const link = annotation({ S: "URI", URI: PDFString.of("https://example.com") });
  page.node.set(PDFName.of("Annots"), context.obj([script, link]));

  const output = await PDFDocument.create();
  const [copy] = await output.copyPages(await PDFDocument.load(await source.save()), [0]);
  stripScripts(copy);

  const annotations = copy.node.Annots();
  const [first, second] = [annotations.lookup(0), annotations.lookup(1)];
  assert.equal(first.get(A), undefined);
  assert.equal(first.get(PDFName.of("AA")), undefined);
  assert.ok(second.get(A));
});

test("una página sin anotaciones no falla", async () => {
  const doc = await PDFDocument.create();
  assert.doesNotThrow(() => stripScripts(doc.addPage()));
});
