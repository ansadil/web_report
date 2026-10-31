import { MM_TO_PX } from '@reports-web/shared';
import { BAND_HEAD_PX } from './metrics.js';

/** Millimetre marks along a ruler. Major marks (labeled) every `majorMm`. */
export function rulerMarks(lengthMm: number, majorMm = 10, minorMm = 5): { mm: number; major: boolean }[] {
  const end = Math.max(0, lengthMm);
  const marks: { mm: number; major: boolean }[] = [];
  const step = Math.max(1, minorMm);
  for (let mm = 0; mm <= end + 0.01; mm += step) {
    const rounded = Math.round(mm * 100) / 100;
    marks.push({ mm: rounded, major: rounded % majorMm === 0 });
  }
  return marks;
}

/** Pixel inset of a millimetre mark from the ruler's inline-start edge. */
export function rulerTickInsetPx(mm: number, zoom: number): number {
  return mm * MM_TO_PX * zoom;
}

/**
 * Top of a content millimetre on the vertical ruler.
 * Each band is preceded by a {@link BAND_HEAD_PX} header, so a continuous mm scale
 * drifts one header per band. Marks stay labeled in content millimetres.
 */
export function verticalRulerTickTopPx(contentMm: number, bandHeightsMm: readonly number[], zoom: number): number {
  let remaining = Math.max(0, contentMm);
  let top = 0;
  for (const height of bandHeightsMm) {
    top += BAND_HEAD_PX * zoom;
    if (remaining <= height) return top + remaining * MM_TO_PX * zoom;
    top += height * MM_TO_PX * zoom;
    remaining -= height;
  }
  return top + remaining * MM_TO_PX * zoom;
}

/**
 * The horizontal ruler's zero is the inline-start edge: left in LTR, right in RTL.
 * Pair this with `dir` on the ruler so `inset-inline-start` lands on that edge.
 */
export function horizontalRulerZeroEdge(dir: 'ltr' | 'rtl'): 'left' | 'right' {
  return dir === 'rtl' ? 'right' : 'left';
}
