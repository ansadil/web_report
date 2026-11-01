/**
 * BUG-19 / acceptance 25: the HTML viewer repeats page header and page footer on every page,
 * and page tokens are the number of that page.
 */
import { describe, expect, it } from 'vitest';
import { interpret } from '../src/engine/interpreter.js';
import { renderHtml } from '../src/engine/renderer-html.js';
import { validateReport } from '../src/schema/report-schema.js';

describe('BUG-19 HTML pages repeat the page header and footer', () => {
  it('each visual sheet has one header, one footer, and that page’s tokens', () => {
    const parsed = validateReport({
      version: '1',
      id: 'bug19-qa',
      meta: { name: 'BUG-19', locale: 'en', dir: 'ltr' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 'rows' },
      fields: [{ name: 'item', type: 'string' }],
      bands: {
        pageHeader: { height: 10, elements: [{ id: 'ph', kind: 'text', value: 'Header {page}', pos: { x: 0, y: 0, w: 160, h: 8 } }] },
        detail: { height: 40, elements: [{ id: 'd', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 160, h: 8 } }] },
        pageFooter: { height: 8, elements: [{ id: 'pf', kind: 'text', value: 'Page {page} of {pages}', pos: { x: 0, y: 0, w: 160, h: 6 } }] },
      },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const rows = Array.from({ length: 12 }, (_, i) => ({ item: `row ${i + 1}` }));
    const { html } = renderHtml(interpret({ schema: parsed.value, rows }), { visualPages: true, idPrefix: 'qa19' });
    const sheets = html.split('rw-page-visual-sheet').slice(1);
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    sheets.forEach((sheet, index) => {
      const page = index + 1;
      expect(sheet.split('data-band="pageHeader"').length - 1).toBe(1);
      expect(sheet.split('data-band="pageFooter"').length - 1).toBe(1);
      expect(sheet).toContain(`Header ${page}`);
      expect(sheet).toContain(`Page ${page} of ${sheets.length}`);
    });
  });
});
