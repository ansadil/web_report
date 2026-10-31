import { describe, expect, it } from 'vitest';
import { formatCursorMm, formatPageIndicator, formatSelectionSummary, formatZoomPercent } from './status-bar.js';

describe('designer status bar', () => {
  it('formats zoom as a whole percent', () => {
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(1.1)).toBe('110%');
    expect(formatZoomPercent(0.5)).toBe('50%');
  });

  it('formats the cursor in millimetres and an empty cursor as a dash', () => {
    expect(formatCursorMm(null)).toBe('—');
    expect(formatCursorMm({ x: 12, y: 3.26 })).toBe('12.0 × 3.3 mm');
  });

  it('formats the selected element name and size', () => {
    expect(formatSelectionSummary(null)).toBe('—');
    expect(formatSelectionSummary({ name: 'text-1', w: 30, h: 8 })).toBe('text-1 · 30.0 × 8.0 mm');
  });

  it('formats the page indicator as n / m', () => {
    expect(formatPageIndicator(1, 1)).toBe('1 / 1');
    expect(formatPageIndicator(2, 4)).toBe('2 / 4');
  });
});
