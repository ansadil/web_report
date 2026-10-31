import { describe, it, expect } from 'vitest';
import { formatNumber, formatDate, formatHijri, formatPageNumber, applyPattern, escapeHtml, isArabicLocale, resolveIntlLocale, resolveHijriLocale } from './format.js';

describe('formatNumber', () => {
  it('formats integers in English', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
  });
  it('returns empty for non-finite', () => {
    expect(formatNumber(Infinity, 'en')).toBe('');
    expect(formatNumber(NaN, 'en')).toBe('');
  });
  it('formats currency', () => {
    const out = formatNumber(99.5, 'en', { style: 'currency', currency: 'USD' });
    expect(out).toContain('99');
  });
});

describe('formatDate', () => {
  it('formats a Date', () => {
    const s = formatDate(new Date('2026-05-11T00:00:00Z'), 'en');
    expect(s.length).toBeGreaterThan(0);
  });
  it('returns empty for invalid date', () => {
    expect(formatDate('not-a-date' as unknown as string, 'en')).toBe('');
  });
});

describe('applyPattern', () => {
  it('applies decimal2 pattern', () => {
    expect(applyPattern(3.1, 'decimal2', 'en')).toBe('3.10');
  });
  it('applies integer pattern', () => {
    expect(applyPattern(3.9, 'integer', 'en')).toBe('4');
  });
  it('handles null gracefully', () => {
    expect(applyPattern(null, 'integer', 'en')).toBe('');
  });
  it('passes through strings without pattern', () => {
    expect(applyPattern('hello', undefined, 'en')).toBe('hello');
  });
  it('formats Date without pattern as datetime', () => {
    const s = applyPattern(new Date('2024-06-15T14:30:00Z'), undefined, 'en');
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain('2024-06-15T14:30:00');
  });
});

describe('escapeHtml', () => {
  it('escapes the five core entities', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('applyPattern date:hijri (Umm al-Qura)', () => {
  const H = (o: Intl.DateTimeFormatOptions, d: Date, l = 'ar-SA-u-ca-islamic-umalqura') => new Intl.DateTimeFormat(l, o).format(d);
  const d = new Date(2026, 9, 15, 12);
  it('defaults to Intl islamic-umalqura dateStyle medium', () => {
    expect(applyPattern(d, 'date:hijri', 'ar')).toBe(H({ dateStyle: 'medium' }, d));
    expect(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura').resolvedOptions().calendar).toBe('islamic-umalqura');
  });
  it('reads an ISO date as that local calendar day', () => {
    expect(applyPattern('2026-10-15', 'date:hijri', 'ar')).toBe(H({ dateStyle: 'medium' }, d));
  });
  it('honours options.dateStyle and the English locale', () => {
    expect(applyPattern(d, 'date:hijri', 'ar', { dateStyle: 'long' })).toBe(H({ dateStyle: 'long' }, d));
    expect(applyPattern(d, 'date:hijri', 'en', { dateStyle: 'full' })).toBe(H({ dateStyle: 'full' }, d, 'en-u-ca-islamic-umalqura'));
    expect(applyPattern('nope-not-date', 'date:hijri', 'ar')).toBe('nope-not-date');
  });
});

describe('BUG-13 Arabic locales use Arabic-Indic digits and Arabic separators', () => {
  const ARABIC = ['ar', 'ar-SA', 'ar-sa', 'AR-SA', 'ar-AE', 'ar-EG', 'ar-MA', 'ar-DZ', 'ar-TN', 'ar_SA'];
  it.each(ARABIC)('%s → ١٬٢٣٤٫٥٠', (loc) => {
    expect(applyPattern(1234.5, 'decimal2', loc)).toBe('١٬٢٣٤٫٥٠');
  });
  it('keeps the region instead of collapsing to ar-EG', () => {
    expect(resolveIntlLocale('ar-SA')).toBe('ar-SA-u-nu-arab');
    expect(resolveIntlLocale('ar-AE')).toBe('ar-AE-u-nu-arab');
    expect(resolveIntlLocale('ar')).toBe('ar-u-nu-arab');
    expect(resolveIntlLocale('en')).toBe('en-US');
  });
  it('respects an explicit nu extension', () => {
    expect(resolveIntlLocale('ar-SA-u-nu-latn')).toBe('ar-SA-u-nu-latn');
    expect(applyPattern(1234.5, 'decimal2', 'ar-SA-u-nu-latn')).toBe('1,234.50');
  });
  it('English and unknown/invalid tags stay Western', () => {
    expect(applyPattern(1234.5, 'decimal2', 'en')).toBe('1,234.50');
    expect(applyPattern(1234.5, 'decimal2', 'not a locale!!')).toBe('1,234.50');
  });
  it('matches Intl ar-SA for the QA expectation', () => {
    const expected = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5);
    expect(applyPattern(1234.5, 'decimal2', 'ar-SA')).toBe(expected);
  });
  it('isArabicLocale', () => {
    expect(isArabicLocale('ar')).toBe(true);
    expect(isArabicLocale('Ar-Sa')).toBe(true);
    expect(isArabicLocale('arn')).toBe(false);
    expect(isArabicLocale('en')).toBe(false);
    expect(isArabicLocale(undefined)).toBe(false);
  });
  it('Gregorian dates use Arabic-Indic digits for every Arabic locale', () => {
    for (const loc of ['ar', 'ar-SA', 'ar-AE', 'ar-MA']) {
      const s = formatDate(new Date(2026, 9, 15), loc, { dateStyle: 'short' });
      expect(s, loc).toMatch(/[\u0660-\u0669]/);
      expect(s, loc).not.toMatch(/[0-9]/);
    }
    expect(formatDate(new Date(2026, 9, 15), 'ar-SA-u-nu-latn', { dateStyle: 'short' })).toMatch(/2026/);
  });
  it('Hijri: ar keeps ar-SA Umm al-Qura; other Arabic regions keep their region with Arabic-Indic digits', () => {
    expect(resolveHijriLocale('ar')).toBe('ar-SA-u-ca-islamic-umalqura-nu-arab');
    expect(resolveHijriLocale('ar-AE')).toBe('ar-AE-u-ca-islamic-umalqura-nu-arab');
    expect(resolveHijriLocale('ar-SA-u-nu-latn')).toBe('ar-SA-u-ca-islamic-umalqura-nu-latn');
    expect(resolveHijriLocale('en')).toBe('en-u-ca-islamic-umalqura');
    const d = new Date(2026, 9, 15, 12);
    expect(formatHijri(d, 'ar')).toBe(new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { dateStyle: 'medium' }).format(d));
    expect(formatHijri(d, 'ar-MA')).toMatch(/[\u0660-\u0669]/);
    expect(formatHijri(d, 'ar-MA')).not.toMatch(/[0-9]/);
  });
  it('formatPageNumber follows the locale, without grouping, and can force latn', () => {
    expect(formatPageNumber(1234, 'ar')).toBe('١٢٣٤');
    expect(formatPageNumber(8, 'ar-SA')).toBe('٨');
    expect(formatPageNumber(1234, 'en')).toBe('1234');
    expect(formatPageNumber(8, 'ar', 'latn')).toBe('8');
    expect(formatPageNumber(8)).toBe('8');
  });
});
