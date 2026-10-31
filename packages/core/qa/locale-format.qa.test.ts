/**
 * QA acceptance — BUG-13: locale formatting is hard-coded to ar-EG; no Saudi locale / Hijri calendar.
 * NOTE: 'date:hijri' and meta locale 'ar-SA' are PROPOSED APIs (agree naming with the export engineer).
 */
import { describe, it, expect } from 'vitest';
import { applyPattern } from '@reports-web/shared';
import { validateReport } from '../src/schema/report-schema.js';
import { interpret } from '../src/engine/interpreter.js';
import { renderHtml } from '../src/engine/renderer-html.js';

const hijriSchema = (formatOptions?: Record<string, unknown>) => ({
  version: '1', id: 'qa-hijri', meta: { name: 'Hijri', locale: 'ar', dir: 'rtl' },
  dataset: { adapter: 'static', source: 't' }, fields: [{ name: 'd', type: 'date' }],
  bands: { detail: { height: 7, elements: [{ id: 'hd', kind: 'field', field: 'd', format: 'date:hijri', ...(formatOptions ? { formatOptions } : {}), pos: { x: 0, y: 0, w: 80, h: 6 } }] } },
});

// Approved API: pattern 'date:hijri' = Umm al-Qura via Intl calendar 'islamic-umalqura'.
// Expected values are ALWAYS computed with Intl for the same date — never hard-coded.
const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura';
const HIJRI_OPTS: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
const hijri = (d: Date) => new Intl.DateTimeFormat(HIJRI_LOCALE, HIJRI_OPTS).format(d);
const DATES = [new Date(2026, 9, 15, 12), new Date(2026, 2, 1, 12), new Date(2027, 0, 31, 12)];

describe('locale formatting', () => {
  for (const d of DATES) {
    it(`BUG-13 applyPattern(Date ${d.toISOString().slice(0, 10)}, "date:hijri", "ar") equals Intl ${HIJRI_LOCALE}`, () => {
      expect(String(applyPattern(d, 'date:hijri', 'ar'))).toBe(hijri(d));
    });
  }
  it('BUG-13 "date:hijri" also accepts an ISO date string (same result as the Date)', () => {
    const d = DATES[0]!;
    expect(String(applyPattern('2026-10-15', 'date:hijri', 'ar'))).toBe(hijri(d));
  });
  it('BUG-13 (sanity) Intl in this runtime really uses the Umm al-Qura calendar', () => {
    expect(new Intl.DateTimeFormat(HIJRI_LOCALE).resolvedOptions().calendar).toBe('islamic-umalqura');
  });
  // ASSUMED (not yet in the codebase): applyPattern gains a 4th arg `options` (Intl.DateTimeFormatOptions subset),
  // and field/aggregate elements gain `formatOptions: { dateStyle?: 'full'|'long'|'medium'|'short' }`.
  // Default for 'date:hijri' stays dateStyle 'medium'.
  it('BUG-13 applyPattern(date, "date:hijri", "ar", { dateStyle: "long" }) honours the non-default dateStyle', () => {
    const d = DATES[0]!;
    const long = new Intl.DateTimeFormat(HIJRI_LOCALE, { dateStyle: 'long' }).format(d);
    const ap = applyPattern as unknown as (v: unknown, p: string, l: string, o?: Intl.DateTimeFormatOptions) => string;
    expect(String(ap(d, 'date:hijri', 'ar', { dateStyle: 'long' }))).toBe(long);
  });
  it('BUG-13 schema keeps element property formatOptions.dateStyle', () => {
    const r = validateReport(hijriSchema({ dateStyle: 'full' }));
    expect(r.ok).toBe(true);
    const el = r.ok ? (r.value.bands.detail.elements[0] as unknown as { formatOptions?: { dateStyle?: string } }) : undefined;
    expect(el?.formatOptions?.dateStyle).toBe('full');
  });
  for (const style of ['medium', 'full', 'short'] as const) {
    it(`BUG-13 rendered field with format "date:hijri"${style === 'medium' ? ' (default, no formatOptions)' : ` + formatOptions.dateStyle="${style}"`} shows Intl ${style}`, () => {
      const d = DATES[0]!;
      const expected = new Intl.DateTimeFormat(HIJRI_LOCALE, { dateStyle: style }).format(d);
      const r = validateReport(hijriSchema(style === 'medium' ? undefined : { dateStyle: style }));
      if (!r.ok) throw new Error(r.error);
      const { html } = renderHtml(interpret({ schema: r.value, rows: [{ d: '2026-10-15' }] }));
      expect(html.replace(/<[^>]+>/g, ' ')).toContain(expected);
    });
  }
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
