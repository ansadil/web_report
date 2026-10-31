import { MM_TO_PX } from '@reports-web/shared';
import { lineThicknessMm, normalizeLinePos } from './api.js';
import type { Band, ReportElement, ReportSchemaV1 } from './api.js';
import {
  BAND_KEYS,
  MAX_BUILDER_ZOOM,
  MIN_BUILDER_ZOOM,
  type BandKey,
  type ClampBounds,
  type MarqueeState,
  type PosMm,
  type RectMm,
  type ResizeHandleKind,
} from './types.js';

export const PAGE_W_MM = { A4: 210, A5: 148, Letter: 215.9 } as const;
const LANDSCAPE_W_MM = { A4: 297, A5: 210, Letter: 279.4 } as const;

export function pageContentWidthMm(page: ReportSchemaV1['page']): number {
  const base = PAGE_W_MM[page.size];
  const w = page.orientation === 'landscape' ? LANDSCAPE_W_MM[page.size] : base;
  return w - page.margins.left - page.margins.right;
}

export function bandBounds(schema: ReportSchemaV1, band: BandKey): ClampBounds {
  return {
    maxW: pageContentWidthMm(schema.page),
    maxH: schema.bands[band]?.height ?? 0,
  };
}

export function scalePxToMm(px: number, zoom: number): number {
  return px / zoom / MM_TO_PX;
}

export function bandPixelHeight(b: Band | undefined): number {
  return Math.max(20, (b?.height ?? 10) * MM_TO_PX);
}

/** Visible data-header body, in millimetres, when the detail band has field columns. */
export function dataHeaderHeightMm(bands: ReportSchemaV1['bands']): number {
  return bands.detail?.elements.some((el) => el.kind === 'field') ? 8 : 0;
}

export function canvasHeightPx(bands: ReportSchemaV1['bands']): number {
  return BAND_KEYS.reduce((sum, key) => sum + bandPixelHeight(bands[key]), 0);
}

export function clampZoom(value: number): number {
  return Math.min(MAX_BUILDER_ZOOM, Math.max(MIN_BUILDER_ZOOM, Math.round(value * 100) / 100));
}

/** Keep an element rectangle inside the band (width = page content, height = band height). */
export function clampElementPos(
  pos: PosMm,
  bounds: ClampBounds,
  mins: { minW?: number; minH?: number } = {},
): PosMm {
  const minW = mins.minW ?? 5;
  const minH = mins.minH ?? 4;
  const { maxW, maxH } = bounds;
  let w = Math.max(minW, Math.round(pos.w * 100) / 100);
  let h = Math.max(minH, Math.round(pos.h * 100) / 100);
  let x = Math.round(pos.x);
  let y = Math.round(pos.y);
  if (w > maxW) w = Math.max(minW, maxW);
  if (h > maxH) h = Math.max(minH, maxH);
  x = Math.max(0, x);
  y = Math.max(0, y);
  if (x + w > maxW) x = Math.max(0, maxW - w);
  if (y + h > maxH) y = Math.max(0, maxH - h);
  return { x, y, w, h };
}

export function clampLinePos(
  el: Extract<ReportElement, { kind: 'line' }>,
  pos: PosMm,
  bounds: ClampBounds,
): PosMm {
  const cross = Math.max(0.1, lineThicknessMm(el.thickness ?? 1));
  const normalized = normalizeLinePos(el.orientation, el.thickness ?? 1, pos);
  const mins = el.orientation === 'horizontal' ? { minW: 5, minH: cross } : { minW: cross, minH: 5 };
  return clampElementPos(normalized, bounds, mins);
}

export interface PointInBandOptions {
  rtl: boolean;
  zoom: number;
  maxW: number;
  maxH: number;
}

export function pointInBand(
  client: { clientX: number; clientY: number },
  rect: { left: number; right: number; top: number },
  opts: PointInBandOptions,
): { x: number; y: number } {
  const xPx = opts.rtl ? rect.right - client.clientX : client.clientX - rect.left;
  const yPx = client.clientY - rect.top;
  const x = Math.min(opts.maxW, Math.max(0, scalePxToMm(xPx, opts.zoom)));
  const y = Math.min(opts.maxH, Math.max(0, scalePxToMm(yPx, opts.zoom)));
  return { x, y };
}

export function applyResize(
  start: PosMm,
  dx: number,
  dy: number,
  handle: ResizeHandleKind,
  isRtl: boolean,
  bounds: ClampBounds,
): PosMm {
  const rdx = isRtl ? -dx : dx;
  let { x, y, w, h } = start;
  switch (handle) {
    case 'se':
      w += rdx;
      h += dy;
      break;
    case 'e':
      w += rdx;
      break;
    case 's':
      h += dy;
      break;
    case 'sw':
      x += rdx;
      w -= rdx;
      h += dy;
      break;
    case 'w':
      x += rdx;
      w -= rdx;
      break;
    case 'n':
      y += dy;
      h -= dy;
      break;
    case 'ne':
      y += dy;
      h -= dy;
      w += rdx;
      break;
    case 'nw':
      x += rdx;
      w -= rdx;
      y += dy;
      h -= dy;
      break;
    default:
      break;
  }
  return clampElementPos({ x, y, w, h }, bounds);
}

export function marqueeRect(m: MarqueeState): RectMm {
  const x = Math.min(m.start.x, m.current.x);
  const y = Math.min(m.start.y, m.current.y);
  const w = Math.abs(m.current.x - m.start.x);
  const h = Math.abs(m.current.y - m.start.y);
  return { x, y, w, h };
}

export function rectsIntersect(a: RectMm, b: RectMm): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
