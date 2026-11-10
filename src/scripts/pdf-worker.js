// Worker de las operaciones de pdf-lib: un PDF pesado ya no congela la página, y cancelar lo termina al instante.
import * as edit from "./pdf-edit.js";
import { UserError } from "./shared-ui.js";

const OPERATIONS = ["splitPdf", "mergePdfs", "imagesToPdf", "organizePdf", "compressPdf"];

self.onmessage = async ({ data: { op, args } }) => {
  const report = {
    onItem: (index) => postMessage({ type: "item", index }),
    onProgress: (value, stage) => postMessage({ type: "progress", value, stage }),
  };
  try {
    if (!OPERATIONS.includes(op)) throw new Error(`Operación desconocida: ${op}`);
    postMessage({ type: "done", result: await edit[op](...args, report) });
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    postMessage({ type: "error", message: err instanceof UserError ? err.message : null });
  }
};
