import { html, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

const PATHS: Record<string, string> = {
  save: `<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M7 3v6h8V3"/><path d="M7 14h10v6H7z"/>`,
  json: `<path d="M8 3a3 3 0 0 0-3 3v3a2 2 0 0 1-2 2v0a2 2 0 0 1 2 2v3a3 3 0 0 0 3 3"/><path d="M16 3a3 3 0 0 1 3 3v3a2 2 0 0 0 2 2v0a2 2 0 0 0-2 2v3a3 3 0 0 1-3 3"/>`,
  print: `<path d="M7 3h10v5H7z"/><path d="M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2Z"/><path d="M7 14h10v6H7z"/>`,
  pdf: `<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>`,
  excel: `<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="m9 13 6 6M15 13l-6 6"/>`,
  image: `<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-5 5 5 3-3 3 3"/>`,
  csv: `<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="M9 13h2M9 16h6M9 19h4"/>`,
  trash: `<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v7M14 11v7"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  close: `<path d="m6 6 12 12M18 6 6 18"/>`,
  undo: `<path d="M9 7 4 12l5 5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>`,
  redo: `<path d="m15 7 5 5-5 5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>`,
  chevronLeft: `<path d="m14 6-6 6 6 6"/>`,
  chevronRight: `<path d="m10 6 6 6-6 6"/>`,
  panelLeft: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>`,
  panelRight: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>`,
  cog: `<circle cx="12" cy="12" r="3"/><path d="M19 12a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.5a1.7 1.7 0 0 0-1.5 1l-.5 1.5a2 2 0 0 1-3.5 1.5l-1-1a1.7 1.7 0 0 0-1.5 0L12 21l-.5-.5a1.7 1.7 0 0 0-1.5 0l-1 1a2 2 0 0 1-3.5-1.5L5 18.5a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.5a1.7 1.7 0 0 0 1.5-1L5 11a1.7 1.7 0 0 0 0-1.5l-1-1A2 2 0 0 1 5.5 5l1.5-.5a1.7 1.7 0 0 0 1-1.5L8.5 2a2 2 0 0 1 4 0l.5 1a1.7 1.7 0 0 0 1 1.5L15.5 5a2 2 0 0 1 2 3.5l-1 1a1.7 1.7 0 0 0 0 1.5Z"/>`,
  eye: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>`,
  download: `<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>`,
  zoomOut: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>`,
  zoomIn: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>`,
  fitWidth: `<path d="M9 9H5V5"/><path d="M15 9h4V5"/><path d="M9 15H5v4"/><path d="M15 15h4v4"/><path d="M9 12h6"/>`,
  sectionUp: `<path d="m18 15-6-6-6 6"/>`,
  sectionDown: `<path d="m6 9 6 6 6-6"/>`,
  cut: `<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>`,
  copy: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  paste: `<path d="M15 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2H9z"/><path d="M9 14h6M9 18h4"/>`,
  bringToFront: `<path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/><path d="m4 7 3-3 3 3"/><path d="M4 7v10"/>`,
  bringForward: `<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>`,
  sendToBack: `<path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/><path d="m20 17-3 3-3-3"/><path d="M20 17V7"/>`,
  sendBackward: `<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>`,
  toolText: `<path d="M4 7h16M4 12h10M4 17h14"/>`,
  toolField: `<path d="M7 5v14M17 5v14"/><path d="M9 12h6"/>`,
  toolHtml: `<path d="m7 8 5 4-5 4"/><path d="M17 8l-5 4 5 4"/>`,
  toolMarkdown: `<path d="M6 5v14"/><path d="M10 9h4l-4 4h4"/>`,
  toolChart: `<path d="M5 19V9M12 19V5M19 19v-7"/>`,
  toolAggregate: `<path d="M6 6h12l-6 6 6 6H6"/>`,
  toolExpr: `<path d="M5 10h14M5 14h8"/><circle cx="17" cy="12" r="2"/>`,
  toolLine: `<path d="M4 12h16"/>`,
  toolBox: `<rect x="5" y="5" width="14" height="14" rx="1"/>`,
  toolQr: `<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><path d="M13 13h3v3h-3zM16 16h4v4h-4z"/>`,
  toolBarcode: `<path d="M4 6v12M7 8v8M10 5v14M14 7v10M17 6v12M20 9v6"/>`,
};

const TOOL_ICON_BY_KIND: Record<string, string> = {
  text: 'toolText',
  field: 'toolField',
  html: 'toolHtml',
  markdown: 'toolMarkdown',
  image: 'image',
  chart: 'toolChart',
  aggregate: 'toolAggregate',
  expr: 'toolExpr',
  line: 'toolLine',
  box: 'toolBox',
  qr: 'toolQr',
  barcode: 'toolBarcode',
};

const ICON_SVG: Record<string, string> = Object.fromEntries(
  Object.entries(PATHS).map(([key, path]) => [
    key,
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">${path}</svg>`,
  ]),
);

export function icon(name: string): TemplateResult {
  const svg = ICON_SVG[name];
  if (!svg) return html`<span></span>`;
  return html`${unsafeSVG(svg)}`;
}

export function hasIcon(name: string): boolean {
  return name in PATHS;
}

export function toolIconForKind(kind: string): TemplateResult {
  return icon(TOOL_ICON_BY_KIND[kind] ?? 'plus');
}
