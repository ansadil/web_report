import { describe, expect, it } from 'vitest';
import { interpret } from './interpreter.js';
import { formatPanelStamp, formatReportDate, formatReportHijri, parseReportDate, replaceReportTokens } from './report-tokens.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

const now = new Date('2026-11-01T09:00:00Z');
const parameters = [
  { name: 'from', type: 'date' as const, default: '2026-10-01' },
  { name: 'to', type: 'date' as const, default: '2026-10-31' },
  {
    name: 'branch',
    type: 'select' as const,
    default: 'all',
    options: [
      { value: 'all', label: { ar: 'جميع الفروع', en: 'All branches' } },
      { value: 'ruh', label: { ar: 'الرياض', en: 'Riyadh' } },
    ],
  },
];

describe('report locale dates', () => {
  it('BUG-63 formats an Arabic report date as Eastern digits with م', () => {
    expect(formatReportDate('2026-10-01', 'ar')).toBe('٠١/١٠/٢٠٢٦م');
    expect(formatReportDate('2026-10-01', 'ar-SA')).toBe('٠١/١٠/٢٠٢٦م');
    expect(formatReportDate('2026-10-01', 'en')).toBe('2026-10-01');
    expect(parseReportDate('٠١/١٠/٢٠٢٦م')).toBe('2026-10-01');
    expect(parseReportDate('2026-10-01')).toBe('2026-10-01');
  });

  it('BUG-64 formats generation and refresh stamps in the panel locale', () => {
    const when = new Date('2026-11-01T09:00:00Z');
    expect(formatPanelStamp(when, 'ar', 'Asia/Riyadh')).toBe('٠١/١١/٢٠٢٦م ١٢:٠٠');
    expect(formatPanelStamp(when, 'en', 'Asia/Riyadh')).toBe('2026-11-01 12:00');
  });

  it('BUG-64 puts the Hijri equivalent under the Gregorian day', () => {
    const hijri = formatReportHijri('2026-10-01', 'ar');
    expect(hijri.startsWith('الموافق ')).toBe(true);
    expect(hijri).not.toContain('2026');
  });

  it('BUG-70 formats the English Hijri line as day, month, year', () => {
    expect(formatReportHijri('2026-10-01', 'en')).toBe('20 Rabi\u02bb II 1448 AH');
    expect(formatReportHijri('2026-10-31', 'en')).toBe('20 Jumada I 1448 AH');
  });
});

describe('replaceReportTokens', () => {
  it('formats the period, the branch label, and both dates for Asia/Riyadh', () => {
    const text = replaceReportTokens('الفترة: {المعاملات.الفترة} — الفرع: {المعاملات.الفرع} | {التاريخ.هجري} — {التاريخ}', {
      locale: 'ar',
      timeZone: 'Asia/Riyadh',
      now,
      params: { from: '2026-10-01', to: '2026-10-31', branch: 'all' },
      parameters,
      paramsResolved: true,
    });
    expect(text).not.toMatch(/\{/);
    expect(text).toContain('جميع الفروع');
    expect(text).toContain('–');
    const hijri = replaceReportTokens('{التاريخ.هجري}', { locale: 'ar', timeZone: 'Asia/Riyadh', now, paramsResolved: true });
    const gregorian = replaceReportTokens('{التاريخ}', { locale: 'ar', timeZone: 'Asia/Riyadh', now, paramsResolved: true });
    expect(text).toContain(hijri);
    expect(text).toContain(gregorian);
    expect(hijri).not.toBe(gregorian);
  });

  it('uses a named branch label and params.period when present', () => {
    const text = replaceReportTokens('{المعاملات.الفترة} / {المعاملات.الفرع}', {
      locale: 'en',
      now,
      params: { period: { from: '2026-10-01', to: '2026-10-31' }, branch: 'ruh' },
      parameters,
      paramsResolved: true,
    });
    expect(text).toContain('Riyadh');
    expect(text).not.toContain('{');
  });

  it('replaces parameter tokens with — when the values are unresolved or invalid', () => {
    const missing = replaceReportTokens('{المعاملات.الفترة} {المعاملات.الفرع} {التاريخ}', {
      locale: 'ar',
      timeZone: 'Asia/Riyadh',
      now,
      paramsResolved: false,
    });
    expect(missing.startsWith('— — ')).toBe(true);
    expect(missing).not.toMatch(/\{/);
    const invalid = replaceReportTokens('{المعاملات.الفرع}', {
      locale: 'ar',
      now,
      params: { branch: 'nope' },
      parameters,
      paramsResolved: true,
    });
    expect(invalid).toBe('—');
  });
});

function schema(): ReportSchemaV1 {
  const result = validateReport({
    version: '1',
    id: 'tokens',
    meta: { name: 'T', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    dataset: { adapter: 'static', source: 'sales' },
    fields: [{ name: 'x', type: 'number' }],
    parameters,
    bands: {
      reportHeader: {
        height: 12,
        elements: [
          { id: 'sub', kind: 'text', value: 'الفترة: {المعاملات.الفترة} — الفرع: {المعاملات.الفرع}', pos: { x: 0, y: 0, w: 120, h: 6 } },
          { id: 'dt', kind: 'text', value: '{التاريخ.هجري} — {التاريخ}', pos: { x: 0, y: 6, w: 80, h: 6 } },
        ],
      },
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 40, h: 5 } }] },
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('interpret report header tokens', () => {
  it('resolves the sales header tokens and leaves no braces', () => {
    const tree = interpret({
      schema: schema(),
      rows: [{ x: 1 }],
      printedAt: now,
      timeZone: 'Asia/Riyadh',
      params: { from: '2026-10-01', to: '2026-10-31', branch: 'ruh' },
    });
    const header = tree.sections.find((section) => section.band === 'reportHeader');
    const text = header?.elements.map((element) => element.text).join(' ');
    expect(text).toContain('الرياض');
    expect(text).not.toMatch(/\{المعاملات|\{التاريخ/);
  });
});
