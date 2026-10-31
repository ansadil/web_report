/**
 * Inline Lucide icons (ISC) as SVG strings. One import per icon, no CDN.
 * Run from the repo root: `node scripts/inline-lucide.mjs`
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));

const map = {
  save: 'save',
  json: 'braces',
  print: 'printer',
  pdf: 'file-text',
  excel: 'table',
  image: 'image',
  csv: 'file-spreadsheet',
  trash: 'trash-2',
  plus: 'plus',
  close: 'x',
  undo: 'undo-2',
  redo: 'redo-2',
  chevronLeft: 'chevron-left',
  chevronRight: 'chevron-right',
  panelLeft: 'panel-left',
  panelRight: 'panel-right',
  cog: 'settings',
  eye: 'eye',
  download: 'download',
  zoomOut: 'zoom-out',
  zoomIn: 'zoom-in',
  fitWidth: 'unfold-horizontal',
  sectionUp: 'chevron-up',
  sectionDown: 'chevron-down',
  cut: 'scissors',
  copy: 'copy',
  paste: 'clipboard-paste',
  bringToFront: 'bring-to-front',
  bringForward: 'arrow-up',
  sendToBack: 'send-to-back',
  sendBackward: 'arrow-down',
  toolText: 'type',
  toolField: 'text-cursor-input',
  toolHtml: 'code-xml',
  toolMarkdown: 'file-code',
  toolChart: 'chart-column',
  toolAggregate: 'sigma',
  toolExpr: 'square-function',
  toolLine: 'minus',
  toolBox: 'square',
  toolQr: 'qr-code',
  toolBarcode: 'barcode',
  portrait: 'rectangle-vertical',
  landscape: 'rectangle-horizontal',
};

const entries = [];
for (const [name, file] of Object.entries(map)) {
  const p = require.resolve(`lucide/dist/esm/icons/${file}.js`);
  const mod = await import(pathToFileURL(p).href);
  const nodes = mod.default;
  const inner = nodes
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  entries.push([name, svg]);
}

const body = entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
const src = `/* Generated from lucide@0.545.0 (ISC) by scripts/inline-lucide.mjs. Do not edit by hand. */\nexport const LUCIDE_SVG = {\n${body}\n} as const;\n`;
writeFileSync(new URL('../packages/core/src/components/lucide-svg.ts', import.meta.url), src);
console.log(`wrote ${entries.length} icons`);
