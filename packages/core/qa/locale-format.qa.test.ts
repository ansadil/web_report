/**
 * QA acceptance — BUG-13: locale formatting is hard-coded to ar-EG; no Saudi locale / Hijri calendar.
 * NOTE: 'date:hijri' and meta locale 'ar-SA' are PROPOSED APIs (agree naming with the export engineer).
 */
import { describe, it, expect } from 'vitest';
import { applyPattern } from '@reports-web/shared';

const D = '2026-10-15';
describe('locale formatting', () => {
  it('BUG-13 applyPattern(date, "date:hijri", "ar") formats with the Umm al-Qura calendar', () => {
    const expected = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'medium' }).format(new Date(D));
    expect(String(applyPattern(D, 'date:hijri' as never, 'ar'))).toBe(expected);
  });
  it('BUG-13 locale "ar-SA" is honoured (not forced to ar-EG)', () => {
    const expected = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5);
    expect(String(applyPattern(1234.5, 'decimal2', 'ar-SA' as never))).toBe(expected);
  });
});

describe('builder canvas (visual)', () => {
  // BUG-16: label overlap on the builder canvas in RTL is a real-layout/visual defect. happy-dom has no
  // layout engine (getBoundingClientRect is all zeros), so it cannot be asserted in this Node suite.
  // Verify manually or with a Playwright screenshot (see /workspace/qa/pw/shot.mjs).
  it.skip('BUG-16 builder canvas labels do not overlap in RTL (needs a real browser layout — manual/visual)', () => {});
});
