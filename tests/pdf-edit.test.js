import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { canRecompress, describeImage, organizePdf, pageOrder, targetSize } from "../src/scripts/pdf-edit.js";

/** PDF de prueba: cada página tiene un ancho distinto (100, 200, 300…) para reconocerla después. */
async function samplePdf(pages) {
  const doc = await PDFDocument.create();
  for (let index = 1; index <= pages; index++) doc.addPage([index * 100, 500]);
  return new File([await doc.save()], "muestra.pdf", { type: "application/pdf" });
}

test("el orden de páginas acepta rangos, repetidos y vacío", () => {
  assert.deepEqual(pageOrder("3, 1-2", 3), [3, 1, 2]);
  assert.deepEqual(pageOrder("", 3), [1, 2, 3]);
  assert.deepEqual(pageOrder("2, 2", 3), [2, 2]);
  assert.equal(pageOrder("4", 3), null);
});

test("organizar reordena, quita y gira las páginas", async () => {
  const result = await organizePdf(await samplePdf(4), { order: "3, 1", rotate: 90 });
  assert.equal(result.name, "muestra-organizado.pdf");
  const doc = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.deepEqual(doc.getPages().map((page) => page.getWidth()), [300, 100]);
  assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [90, 90]);
});

test("organizar rechaza páginas que no existen", async () => {
  await assert.rejects(organizePdf(await samplePdf(2), { order: "5" }), /2 páginas/);
});

test("solo se recomprimen JPEG de 8 bits en RGB o gris, sin máscaras ni Decode", async () => {
  const { context } = await PDFDocument.create();
  const image = (entries) => context.stream(new Uint8Array(4), { Type: "XObject", Subtype: "Image", Width: 800, Height: 600, BitsPerComponent: 8, ...entries }).dict;

  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: "DeviceRGB" }))), true);
  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: "DeviceGray" }))), true);
  assert.equal(canRecompress(describeImage(image({ Filter: ["DCTDecode"], ColorSpace: "DeviceRGB" }))), true);
  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: "DeviceCMYK" }))), false);
  assert.equal(canRecompress(describeImage(image({ Filter: "FlateDecode", ColorSpace: "DeviceRGB" }))), false);
  assert.equal(canRecompress(describeImage(image({ Filter: ["FlateDecode", "DCTDecode"], ColorSpace: "DeviceRGB" }))), false);
  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: "DeviceRGB", Decode: [1, 0, 1, 0, 1, 0] }))), false);

  const icc = context.register(context.stream(new Uint8Array(4), { N: 3 }));
  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: [PDFName.of("ICCBased"), icc] }))), true);
  const cmykIcc = context.register(context.stream(new Uint8Array(4), { N: 4 }));
  assert.equal(canRecompress(describeImage(image({ Filter: "DCTDecode", ColorSpace: [PDFName.of("ICCBased"), cmykIcc] }))), false);

  assert.equal(describeImage(context.obj({ Type: "XObject", Subtype: "Form" })), null);
});

test("reduce el lado mayor sin agrandar nunca", () => {
  assert.deepEqual(targetSize(3200, 2400, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(targetSize(1000, 3000, 1500), { width: 500, height: 1500 });
  assert.deepEqual(targetSize(800, 600, 1600), { width: 800, height: 600 });
});
