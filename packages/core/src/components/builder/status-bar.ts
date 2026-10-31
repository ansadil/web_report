export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function formatCursorMm(point: { x: number; y: number } | null): string {
  if (!point) return '—';
  return `${point.x.toFixed(1)} × ${point.y.toFixed(1)} mm`;
}

export function formatSelectionSummary(input: { name: string; w: number; h: number } | null): string {
  if (!input) return '—';
  return `${input.name} · ${input.w.toFixed(1)} × ${input.h.toFixed(1)} mm`;
}

/** Status-bar name: a human label when the element has one, otherwise its kind. */
export function elementStatusName(el: {
  kind: string;
  value?: string;
  field?: string;
  fn?: string;
  expression?: string;
  type?: string;
  symbology?: string;
  mode?: string;
}): string {
  switch (el.kind) {
    case 'text':
      return el.value?.trim() || 'text';
    case 'field':
      return el.field?.trim() || 'field';
    case 'aggregate':
      return el.fn && el.field ? `${el.fn}(${el.field})` : 'aggregate';
    case 'expr':
      return el.expression?.trim() || 'expr';
    case 'chart':
      return el.type?.trim() || 'chart';
    case 'barcode':
      return el.symbology?.trim() || 'barcode';
    case 'richtext':
      return el.mode?.trim() || 'richtext';
    default:
      return el.kind;
  }
}

export function formatPageIndicator(page: number, pages: number): string {
  const n = Math.max(1, Math.round(page));
  const m = Math.max(n, Math.round(pages));
  return `${n} / ${m}`;
}
