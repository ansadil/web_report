import { describe, expect, it } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function schema(): ReportSchemaV1 {
  const result = validateReport({
    version: '1',
    id: 'bug19',
    meta: { name: 'BUG-19', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [{ name: 'item', type: 'string' }],
    bands: {
      pageHeader: {
        height: 10,
        elements: [{ id: 'ph', kind: 'text', value: 'رأس {page}', pos: { x: 0, y: 0, w: 160, h: 8 } }],
      },
      detail: {
        height: 40,
        elements: [{ id: 'd', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 160, h: 8 } }],
      },
      pageFooter: {
        height: 8,
        elements: [{ id: 'pf', kind: 'text', value: 'صفحة {page} من {pages}', pos: { x: 0, y: 0, w: 160, h: 6 } }],
      },
    },
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('BUG-19: page header and footer repeat on every HTML page', () => {
  it('puts the running bands and that page’s tokens on each visual sheet', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ item: `بند ${i + 1}` }));
    const { html } = renderHtml(interpret({ schema: schema(), rows }), { visualPages: true, idPrefix: 'b19' });
    const sheets = html.split('rw-page-visual-sheet').slice(1);
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    const ar = (n: number) => new Intl.NumberFormat('ar-EG', { useGrouping: false, numberingSystem: 'arab' }).format(n);
    sheets.forEach((sheet, index) => {
      const page = index + 1;
      expect(sheet.split('data-band="pageHeader"').length - 1).toBe(1);
      expect(sheet.split('data-band="pageFooter"').length - 1).toBe(1);
      expect(sheet).toContain(`رأس ${ar(page)}`);
      expect(sheet).toContain(`صفحة ${ar(page)} من ${ar(sheets.length)}`);
    });
    expect(html).not.toContain('{page}');
    expect(html).not.toContain('{pages}');
  });
});
