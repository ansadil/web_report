import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DATE_FORMAT_HINT,
  dateFormatHintFor,
  formatParameterIssue,
  validateParameterValues,
} from './parameters.js';
import type { ParameterDef } from '@reports-web/shared';

// BUG-68: the "invalid date" message must name the format the date field shows, not always YYYY-MM-DD.
const FSI = '\u2068';
const PDI = '\u2069';
const AR_HINT = 'يوم/شهر/سنة، مثل ٠١/١٠/٢٠٢٦م';
const report = (locale: string) => ({
  meta: { locale },
  parameters: [{ name: 'from', type: 'date', label: { ar: 'الفترة من', en: 'From' } }] as ParameterDef[],
});

describe('dateFormatHint (BUG-68)', () => {
  it('dateFormatHintFor follows the report locale', () => {
    expect(dateFormatHintFor('ar')).toBe(AR_HINT);
    expect(dateFormatHintFor('ar-SA')).toBe(AR_HINT);
    expect(dateFormatHintFor('en')).toBe('YYYY-MM-DD');
    expect(dateFormatHintFor('en-US')).toBe('YYYY-MM-DD');
    expect(dateFormatHintFor()).toBe(DEFAULT_DATE_FORMAT_HINT);
  });

  it('default (no hint) keeps the existing YYYY-MM-DD messages unchanged', () => {
    const ar = validateParameterValues(report('ar'), { from: '31/02/2026' });
    expect(ar.ok).toBe(false);
    expect(ar.fieldErrors.from).toBe('أدخل تاريخًا صالحًا (YYYY-MM-DD)');
    const en = validateParameterValues(report('en'), { from: '31/02/2026' });
    expect(en.fieldErrors.from).toBe('Enter a valid date (YYYY-MM-DD)');
    expect(formatParameterIssue({ rule: 'type' }, { name: 'd', type: 'date' }, 'ar')).toBe('أدخل تاريخًا صالحًا (YYYY-MM-DD)');
  });

  it('31/02/2026 in Arabic with the locale hint names the field format, bidi-isolated', () => {
    const r = validateParameterValues(report('ar'), { from: '31/02/2026' }, { dateFormatHint: dateFormatHintFor('ar') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ name: 'from', rule: 'type' });
    expect(r.fieldErrors.from).toBe(`أدخل تاريخًا صالحًا (${FSI}${AR_HINT}${PDI})`);
    expect(r.fieldErrors.from).not.toContain('YYYY');
  });

  it('31/02/2026 in English with the locale hint stays YYYY-MM-DD', () => {
    const r = validateParameterValues(report('en'), { from: '31/02/2026' }, { dateFormatHint: dateFormatHintFor('en') });
    expect(r.fieldErrors.from).toBe('Enter a valid date (YYYY-MM-DD)');
  });

  it('a custom host hint is used as given; blank falls back to the default', () => {
    expect(formatParameterIssue({ rule: 'type' }, { name: 'd', type: 'date' }, 'en', { dateFormatHint: 'DD.MM.YYYY' })).toBe(
      'Enter a valid date (DD.MM.YYYY)',
    );
    expect(formatParameterIssue({ rule: 'type' }, { name: 'd', type: 'date' }, 'en', { dateFormatHint: '  ' })).toBe(
      'Enter a valid date (YYYY-MM-DD)',
    );
  });

  it('only the date type message uses the hint', () => {
    const opts = { dateFormatHint: AR_HINT };
    expect(formatParameterIssue({ rule: 'type' }, { name: 'n', type: 'number' }, 'ar', opts)).toBe('أدخل رقمًا صالحًا');
    expect(formatParameterIssue({ rule: 'required' }, { name: 'd', type: 'date', label: 'التاريخ' }, 'ar', opts)).toBe('يجب إدخال التاريخ');
  });
});
