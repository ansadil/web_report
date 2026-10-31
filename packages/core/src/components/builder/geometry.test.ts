import { describe, expect, it } from 'vitest';
import type { ReportSchemaV1 } from './api.js';
import {
  applyResize,
  bandBounds,
  clampElementPos,
  clampLinePos,
  clampZoom,
  marqueeRect,
  pageContentWidthMm,
  pointInBand,
  rectsIntersect,
  scalePxToMm,
} from './geometry.js';
import { schemaWithNormalizedLines } from './ops/elements.js';
import { MM_TO_PX } from '@reports-web/shared';

function page(size: 'A4' | 'A5' | 'Letter', orientation: 'portrait' | 'landscape', margins = { top: 15, right: 15, bottom: 15, left: 15 }) {
  return { size, orientation, margins };
}

describe('builder geometry', () => {
  it('computes page content width for portrait and landscape', () => {
    expect(pageContentWidthMm(page('A4', 'portrait'))).toBe(180);
    expect(pageContentWidthMm(page('A4', 'landscape'))).toBe(267);
    expect(pageContentWidthMm(page('Letter', 'landscape', { top: 10, right: 10, bottom: 10, left: 12 }))).toBeCloseTo(257.4);
  });

  it('converts css pixels to millimetres using the current zoom', () => {
    expect(scalePxToMm(MM_TO_PX, 1)).toBeCloseTo(1);
    expect(scalePxToMm(MM_TO_PX, 2)).toBeCloseTo(0.5);
  });

  it('clamps rectangles inside the band and keeps a minimum size', () => {
    const bounds = { maxW: 100, maxH: 20 };
    expect(clampElementPos({ x: -4, y: 3.2, w: 10.126, h: 2 }, bounds)).toEqual({ x: 0, y: 3, w: 10.13, h: 4 });
    expect(clampElementPos({ x: 90, y: 0, w: 40, h: 8 }, bounds)).toEqual({ x: 60, y: 0, w: 40, h: 8 });
    expect(clampElementPos({ x: 0, y: 0, w: 500, h: 80 }, bounds)).toEqual({ x: 0, y: 0, w: 100, h: 20 });
  });

  it('sizes a horizontal line cross-axis from its thickness', () => {
    const pos = clampLinePos(
      { id: 'l', kind: 'line', orientation: 'horizontal', thickness: 2, pos: { x: 1, y: 2, w: 30, h: 9 } },
      { x: 1, y: 2, w: 30, h: 9 },
      { maxW: 180, maxH: 40 },
    );
    expect(pos.w).toBe(30);
    expect(pos.h).toBeLessThan(2);
    expect(pos.y).toBe(2);
  });

  it('maps pointer position from the inline-start edge, including RTL', () => {
    const rect = { left: 10, right: 110, top: 20 };
    const ltr = pointInBand({ clientX: 30, clientY: 20 + MM_TO_PX }, rect, { rtl: false, zoom: 1, maxW: 100, maxH: 50 });
    const rtl = pointInBand({ clientX: 30, clientY: 20 }, rect, { rtl: true, zoom: 1, maxW: 100, maxH: 50 });
    expect(ltr.x).toBeCloseTo(scalePxToMm(20, 1));
    expect(ltr.y).toBeCloseTo(1);
    expect(rtl.x).toBeCloseTo(scalePxToMm(80, 1));
  });

  it('flips horizontal resize when the canvas is RTL', () => {
    const start = { x: 10, y: 4, w: 20, h: 8 };
    const bounds = { maxW: 180, maxH: 40 };
    const ltr = applyResize(start, 5, 0, 'e', false, bounds);
    const rtl = applyResize(start, 5, 0, 'e', true, bounds);
    expect(ltr.w).toBe(25);
    expect(rtl.w).toBe(15);
  });

  it('builds a marquee from unordered corners and detects overlap', () => {
    const rect = marqueeRect({ band: 'detail', start: { x: 10, y: 8 }, current: { x: 2, y: 1 } });
    expect(rect).toEqual({ x: 2, y: 1, w: 8, h: 7 });
    expect(rectsIntersect(rect, { x: 9, y: 7, w: 4, h: 4 })).toBe(true);
    expect(rectsIntersect(rect, { x: 10, y: 1, w: 4, h: 2 })).toBe(false);
  });

  it('normalizes incoming lines against the schema that is still on screen', () => {
    const current = {
      page: page('A4', 'portrait'),
      bands: { detail: { height: 10, elements: [] } },
    } as unknown as ReportSchemaV1;
    const next = {
      page: page('A4', 'landscape'),
      bands: {
        detail: {
          height: 40,
          elements: [{ id: 'l', kind: 'line', orientation: 'horizontal', thickness: 1, pos: { x: 0, y: 0, w: 400, h: 8 } }],
        },
      },
    } as unknown as ReportSchemaV1;
    const normalized = schemaWithNormalizedLines(current, next);
    const line = normalized.bands.detail.elements[0]!;
    expect(line.pos.w).toBe(pageContentWidthMm(current.page));
    expect(bandBounds(current, 'detail').maxH).toBe(10);
    expect(line.pos.h).toBeLessThanOrEqual(10);
  });

  it('clamps zoom to the builder range and to two decimals', () => {
    expect(clampZoom(3)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.5);
    expect(clampZoom(1.26)).toBe(1.26);
  });
});
