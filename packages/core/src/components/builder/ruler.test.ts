import { describe, expect, it } from 'vitest';
import { MM_TO_PX } from '@reports-web/shared';
import { BAND_HEAD_PX } from './metrics.js';
import { horizontalRulerZeroEdge, rulerMarks, rulerTickInsetPx, verticalRulerTickTopPx } from './ruler.js';

describe('designer rulers', () => {
  it('places the horizontal zero on the right edge in RTL', () => {
    expect(horizontalRulerZeroEdge('ltr')).toBe('left');
    expect(horizontalRulerZeroEdge('rtl')).toBe('right');
  });

  it('offsets a tick from the zero edge by millimetres times zoom', () => {
    expect(rulerTickInsetPx(10, 1)).toBeCloseTo(10 * MM_TO_PX);
    expect(rulerTickInsetPx(10, 2)).toBeCloseTo(20 * MM_TO_PX);
    expect(rulerTickInsetPx(0, 1.5)).toBe(0);
  });

  it('drops each vertical mark by one band header per band above it', () => {
    const bands = [10, 20];
    expect(verticalRulerTickTopPx(0, bands, 1)).toBe(BAND_HEAD_PX);
    expect(verticalRulerTickTopPx(10, bands, 1)).toBeCloseTo(BAND_HEAD_PX + 10 * MM_TO_PX);
    expect(verticalRulerTickTopPx(15, bands, 1)).toBeCloseTo(BAND_HEAD_PX * 2 + 15 * MM_TO_PX);
    expect(verticalRulerTickTopPx(15, bands, 2)).toBeCloseTo(BAND_HEAD_PX * 4 + 30 * MM_TO_PX);
  });

  it('labels every major millimetre and keeps a mark at zero', () => {
    const marks = rulerMarks(20, 10, 5);
    expect(marks[0]).toEqual({ mm: 0, major: true });
    expect(marks.filter((m) => m.major).map((m) => m.mm)).toEqual([0, 10, 20]);
    expect(marks.some((m) => m.mm === 5 && !m.major)).toBe(true);
  });
});
