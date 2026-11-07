// Un PDF unido o dividido conserva las anotaciones de sus páginas, y un visor podría ejecutar las que traen código.
import { PDFDict, PDFName } from "@cantoo/pdf-lib";

const DANGEROUS_ACTIONS = new Set(["/JavaScript", "/Launch"]);
const ACTION = PDFName.of("A");
const ADDITIONAL_ACTIONS = PDFName.of("AA");
const ACTION_TYPE = PDFName.of("S");

/** Quita de la página las acciones que ejecutan código. Los enlaces normales se conservan. */
export function stripScripts(page) {
  page.node.delete(ADDITIONAL_ACTIONS);
  const annotations = page.node.Annots();
  for (let index = 0; index < (annotations?.size() ?? 0); index++) {
    const annotation = annotations.lookupMaybe(index, PDFDict);
    if (!annotation) continue;
    annotation.delete(ADDITIONAL_ACTIONS);
    const action = annotation.lookupMaybe(ACTION, PDFDict);
    if (DANGEROUS_ACTIONS.has(action?.lookupMaybe(ACTION_TYPE, PDFName)?.toString())) annotation.delete(ACTION);
  }
}
