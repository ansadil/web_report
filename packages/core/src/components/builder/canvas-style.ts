import type { ReportElement, Style } from './api.js';

export function styleBorderToCss(style: Style | undefined, opts: { boxFallback?: boolean } = {}): string {
  const b = style?.border;
  const color = b?.color ?? '#000';
  const parts: string[] = [];
  if (b?.top) parts.push(`border-top:${b.top}pt solid ${color}`);
  if (b?.right) parts.push(`border-right:${b.right}pt solid ${color}`);
  if (b?.bottom) parts.push(`border-bottom:${b.bottom}pt solid ${color}`);
  if (b?.left) parts.push(`border-left:${b.left}pt solid ${color}`);
  if (parts.length > 0) return parts.join(';');
  if (opts.boxFallback) return 'border:1px solid #94a3b8';
  return '';
}

export function builderCanvasStyleCss(el: ReportElement): string {
  const parts: string[] = [];
  if (el.style?.padding != null) parts.push(`padding:${el.style.padding}mm`);
  if (el.style?.underline) parts.push('text-decoration:underline');
  const borderCss = styleBorderToCss(el.style, { boxFallback: el.kind === 'box' });
  if (borderCss) parts.push(borderCss);
  return parts.join(';');
}
