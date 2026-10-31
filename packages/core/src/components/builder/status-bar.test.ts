import { describe, expect, it } from 'vitest';
import { resolveIntlLocale } from '@reports-web/shared';
import { elementStatusName, formatCursorMm, formatLocalizedNumber, formatPageIndicator, formatSelectionSummary, formatZoomPercent } from './status-bar.js';

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
    expect(formatSelectionSummary({ name: 'Title', w: 30, h: 8 })).toBe('Title · 30.0 × 8.0 mm');
  });

  it('uses a label when the element has one, otherwise the kind', () => {
    expect(elementStatusName({ kind: 'text', value: 'Hello' })).toBe('Hello');
    expect(elementStatusName({ kind: 'text', value: '  ' })).toBe('Text');
    expect(elementStatusName({ kind: 'field', field: 'amount' })).toBe('amount');
    expect(elementStatusName({ kind: 'aggregate', fn: 'sum', field: 'amount' })).toBe('sum(amount)');
    expect(elementStatusName({ kind: 'line' })).toBe('Line');
    expect(elementStatusName({ kind: 'box' })).toBe('Box');
    expect(elementStatusName({ kind: 'text', value: '  ' }, 'ar')).toBe('نص');
    expect(elementStatusName({ kind: 'line' }, 'ar')).toBe('خط');
  });

  it('formats the page indicator as n / m', () => {
    expect(formatPageIndicator(1, 1)).toBe('1 / 1');
    expect(formatPageIndicator(2, 4)).toBe('2 / 4');
  });

  it('uses Intl digits for the UI locale and مم in Arabic', () => {
    const ar = { locale: 'ar', digits: 'locale' as const };
    const latn = { locale: 'ar-SA', digits: 'latn' as const };
    expect(formatLocalizedNumber(12, ar, 1)).toMatch(/[٠-٩]/);
    expect(formatCursorMm({ x: 12, y: 3.26 }, ar)).toBe(
      `${formatLocalizedNumber(12, ar, 1)} × ${formatLocalizedNumber(3.26, ar, 1)} مم`,
    );
    expect(formatCursorMm({ x: 12, y: 3.26 }, latn)).toBe('12.0 × 3.3 مم');
    expect(formatZoomPercent(1, ar)).toBe(new Intl.NumberFormat(resolveIntlLocale('ar'), { style: 'percent', maximumFractionDigits: 0, useGrouping: false }).format(1));
    expect(formatPageIndicator(2, 4, latn)).toBe('2 / 4');
    expect(formatSelectionSummary({ name: 'عنوان', w: 10, h: 5 }, latn)).toBe('عنوان · 10.0 × 5.0 مم');
  });
});
