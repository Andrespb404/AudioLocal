import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMAT_MAP } from "../src/scripts/audio.js";
import { messagesFor } from "../src/scripts/messages.js";
import { conversionPath, conversions } from "../src/data/conversions.js";
import { ui } from "../src/i18n/ui.js";

const shape = (value) =>
  typeof value === "object" && value !== null
    ? Object.fromEntries(Object.keys(value).map((key) => [key, Array.isArray(value[key]) ? value[key].length : shape(value[key])]))
    : typeof value;

test("los dos idiomas tienen las mismas claves", () => {
  assert.deepEqual(shape(messagesFor("en")), shape(messagesFor("es")));
  assert.deepEqual(shape(ui.en), shape(ui.es));
});

test("un idioma desconocido cae en español", () => {
  assert.equal(messagesFor(undefined).locale, "es");
  assert.equal(messagesFor("fr").locale, "es");
});

test("cada conversión tiene contenido completo y URL única en ambos idiomas", () => {
  const paths = new Set();
  const titles = new Set();
  for (const conversion of conversions) {
    if (conversion.tool === "audio") assert.ok(FORMAT_MAP[conversion.format === "mp3" ? "mp3_256" : conversion.format], conversion.id);
    assert.ok(["audio", "video", "pdf"].includes(conversion.tool), conversion.id);
    for (const lang of ["es", "en"]) {
      const page = conversion[lang];
      for (const field of ["name", "title", "description", "h1", "intro", "expect"]) assert.ok(page[field], `${conversion.id} ${lang} ${field}`);
      assert.ok(page.when.length >= 2);
      assert.ok(page.faq.length >= 2);
      assert.ok(page.title.length <= 70, `título largo: ${page.title}`);
      assert.ok(page.description.length <= 160, `descripción larga: ${page.description}`);
      paths.add(conversionPath(conversion, lang));
      titles.add(page.title);
    }
  }
  assert.equal(paths.size, conversions.length * 2);
  assert.equal(titles.size, conversions.length * 2);
});
