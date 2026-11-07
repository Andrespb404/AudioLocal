// Componentes de terceros que llegan al navegador. La página de licencias lee estos archivos al compilar:
// si una dependencia cambia de sitio su licencia, el build falla en vez de publicar un aviso incompleto.
const pdfjs = 'node_modules/pdfjs-dist';

export const components = [
  {
    name: 'lamejs (LAME)',
    version: '1.2.1',
    license: 'LGPL-3.0',
    links: ['https://lame.sourceforge.io/', 'https://github.com/zhuker/lamejs', 'https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz'],
    files: ['src/data/licenses/lamejs-LICENSE.txt', 'src/data/licenses/lgpl-3.0.txt', 'src/data/licenses/gpl-3.0.txt'],
  },
  { name: 'Mediabunny', pkg: 'mediabunny', license: 'MPL-2.0', links: ['https://github.com/Vanilagy/mediabunny'], files: ['node_modules/mediabunny/LICENSE'] },
  { name: 'PDF.js', pkg: 'pdfjs-dist', license: 'Apache-2.0', links: ['https://github.com/mozilla/pdf.js'], files: [`${pdfjs}/LICENSE`] },
  { name: 'OpenJPEG', license: 'BSD-2-Clause', links: ['https://github.com/uclouvain/openjpeg'], files: [`${pdfjs}/wasm/LICENSE_OPENJPEG`, `${pdfjs}/wasm/LICENSE_PDFJS_OPENJPEG`] },
  { name: 'JBIG2 (PDFium)', license: 'BSD-3-Clause', links: ['https://pdfium.googlesource.com/pdfium/'], files: [`${pdfjs}/wasm/LICENSE_JBIG2`, `${pdfjs}/wasm/LICENSE_PDFJS_JBIG2`] },
  { name: 'Foxit fonts (PDFium)', license: 'BSD-3-Clause', links: ['https://pdfium.googlesource.com/pdfium/'], files: [`${pdfjs}/standard_fonts/LICENSE_FOXIT`] },
  { name: 'Liberation Fonts', license: 'GPL-2.0 + font exception', links: ['https://github.com/liberationfonts/liberation-fonts'], files: [`${pdfjs}/standard_fonts/LICENSE_LIBERATION`] },
  { name: 'Adobe CMap Resources', license: 'BSD-3-Clause', links: ['https://github.com/adobe-type-tools/cmap-resources'], files: [`${pdfjs}/cmaps/LICENSE`] },
  { name: 'pdf-lib (@cantoo)', pkg: '@cantoo/pdf-lib', license: 'MIT', links: ['https://github.com/cantoo-scribe/pdf-lib'], files: ['node_modules/@cantoo/pdf-lib/LICENSE.md'] },
  { name: 'fflate', pkg: 'fflate', license: 'MIT', links: ['https://github.com/101arrowz/fflate'], files: ['node_modules/fflate/LICENSE'] },
  { name: 'culori', pkg: 'culori', license: 'MIT', links: ['https://github.com/Evercoder/culori'], files: ['node_modules/culori/LICENSE'] },
  { name: 'tslib', pkg: 'tslib', license: '0BSD', links: ['https://github.com/microsoft/tslib'], files: ['node_modules/tslib/LICENSE.txt'] },
  { name: 'Instrument Sans', pkg: '@fontsource-variable/instrument-sans', license: 'OFL-1.1', links: ['https://github.com/Instrument/instrument-sans'], files: ['node_modules/@fontsource-variable/instrument-sans/LICENSE'] },
];
