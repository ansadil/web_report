import { html, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { LUCIDE_SVG } from './lucide-svg.js';

const TOOL_ICON_BY_KIND: Record<string, keyof typeof LUCIDE_SVG> = {
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

/** Single access point for builder and viewer icons. SVGs are inlined Lucide paths. */
export function icon(name: string): TemplateResult {
  const svg = LUCIDE_SVG[name as keyof typeof LUCIDE_SVG];
  if (!svg) return html`<span></span>`;
  return html`${unsafeSVG(svg)}`;
}

export function hasIcon(name: string): boolean {
  return name in LUCIDE_SVG;
}

export function toolIconForKind(kind: string): TemplateResult {
  return icon(TOOL_ICON_BY_KIND[kind] ?? 'plus');
}
