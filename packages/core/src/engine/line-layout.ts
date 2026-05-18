/** Points to millimetres (1pt = 1/72 inch). */
export const PT_TO_MM = 25.4 / 72;

export function lineThicknessMm(thicknessPt: number): number {
  const pt = Math.max(0.25, Math.min(10, thicknessPt));
  return Math.round(pt * PT_TO_MM * 100) / 100;
}

/** Cross-axis size (h for horizontal, w for vertical) matches line thickness. */
export function normalizeLinePos(
  orientation: 'horizontal' | 'vertical',
  thicknessPt: number,
  pos: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const cross = Math.max(0.1, lineThicknessMm(thicknessPt));
  if (orientation === 'vertical') {
    return { ...pos, w: cross };
  }
  return { ...pos, h: cross };
}

/** When orientation flips, preserve line length on the long axis. */
export function linePosForOrientationChange(
  prevOrientation: 'horizontal' | 'vertical',
  nextOrientation: 'horizontal' | 'vertical',
  thicknessPt: number,
  pos: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const length = prevOrientation === 'horizontal' ? pos.w : pos.h;
  const cross = Math.max(0.1, lineThicknessMm(thicknessPt));
  if (nextOrientation === 'horizontal') {
    return { ...pos, w: Math.max(5, length), h: cross };
  }
  return { ...pos, h: Math.max(5, length), w: cross };
}
