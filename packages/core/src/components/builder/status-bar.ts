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

export function formatPageIndicator(page: number, pages: number): string {
  const n = Math.max(1, Math.round(page));
  const m = Math.max(n, Math.round(pages));
  return `${n} / ${m}`;
}
