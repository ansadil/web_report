import { describe, it, expect } from 'vitest';
import {
  linePosForOrientationChange,
  lineThicknessMm,
  normalizeLinePos,
} from './line-layout.js';

describe('line-layout', () => {
  it('sets cross-axis to thickness mm', () => {
    const pos = { x: 0, y: 0, w: 80, h: 12 };
    const h = normalizeLinePos('horizontal', 2, pos);
    expect(h.h).toBe(lineThicknessMm(2));
    expect(h.w).toBe(80);

    const v = normalizeLinePos('vertical', 1, pos);
    expect(v.w).toBe(lineThicknessMm(1));
    expect(v.h).toBe(12);
  });

  it('preserves length when orientation changes', () => {
    const pos = { x: 5, y: 5, w: 60, h: lineThicknessMm(1) };
    const vertical = linePosForOrientationChange('horizontal', 'vertical', 1, pos);
    expect(vertical.h).toBe(60);
    expect(vertical.w).toBe(lineThicknessMm(1));
  });
});
