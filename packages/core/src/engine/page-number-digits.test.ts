import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function schema(meta: Record<string, unknown>, footer: string): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'pn',
    meta: { name: 'PN', ...meta },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: {
      reportHeader: { height: 10, pageBreakAfter: true, elements: [{ id: 'h', kind: 'text', value: 'Cover', pos: { x: 0, y: 0, w: 180, h: 8 } }] },
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', format: 'decimal2', pos: { x: 0, y: 0, w: 90, h: 5 } }] },
      pageFooter: { height: 8, elements: [{ id: 'pf', kind: 'text', value: footer, pos: { x: 0, y: 0, w: 180, h: 6 } }] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

// The HTML viewer emits the pageFooter band once (on the last visual page), so the footer reads 2/2.
const html = (s: ReportSchemaV1, visualPages: boolean): string =>
  renderHtml(interpret({ schema: s, rows: [{ x: 1234.5 }] }), { visualPages }).html;

describe('HTML viewer page numbers follow the report number locale', () => {
  for (const visualPages of [false, true]) {
    it(`ar → Arabic-Indic, like body numbers (visualPages=${visualPages})`, () => {
      const out = html(schema({ locale: 'ar', dir: 'rtl' }, 'صفحة {page} من {pages}'), visualPages);
      expect(out).toContain('١٬٢٣٤٫٥٠');
      expect(out).toContain('صفحة ٢ من ٢');
      expect(out).not.toMatch(/صفحة \d/);
    });
    it(`en → Western (visualPages=${visualPages})`, () => {
      const out = html(schema({ locale: 'en', dir: 'ltr' }, 'Page {page} of {pages}'), visualPages);
      expect(out).toContain('Page 2 of 2');
      expect(out).not.toMatch(/[\u0660-\u0669]/);
    });
    it(`pageNumberDigits: 'latn' forces Western in ar (visualPages=${visualPages})`, () => {
      const out = html(schema({ locale: 'ar', dir: 'rtl', pageNumberDigits: 'latn' }, 'صفحة {صفحة} من {صفحات}'), visualPages);
      expect(out).toContain('صفحة 2 من 2');
      expect(out).toContain('١٬٢٣٤٫٥٠');
    });
  }
});

describe('HTML viewer with a BCP 47 Arabic locale (ar-SA, dir inferred)', () => {
  it('renders rtl and Arabic-Indic digits (body and page numbers)', () => {
    const s = schema({ locale: 'ar-SA' }, 'صفحة {page} من {pages}');
    expect(s.meta.dir).toBe('rtl');
    for (const visualPages of [false, true]) {
      const out = html(s, visualPages);
      expect(out).toContain('data-dir="rtl"');
      expect(out).toContain('data-locale="ar-SA"');
      expect(out).toContain('١٬٢٣٤٫٥٠');
      expect(out).toContain('صفحة ٢ من ٢');
      expect(out).not.toContain('1,234.50');
    }
  });
  it('en-GB stays ltr with Western digits', () => {
    const out = html(schema({ locale: 'en-GB' }, 'Page {page} of {pages}'), false);
    expect(out).toContain('data-dir="ltr"');
    expect(out).toContain('1,234.50');
    expect(out).not.toMatch(/[\u0660-\u0669]/);
  });
});
