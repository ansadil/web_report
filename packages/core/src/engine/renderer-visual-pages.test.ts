import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function manyDetailRowsSchema(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'vp',
    meta: { name: 'VP', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: {
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('renderHtml visualPages', () => {
  it('default stacks sections into multiple sheet wrappers when visualPages is true', () => {
    const schema = manyDetailRowsSchema();
    const rows = Array.from({ length: 120 }, (_, i) => ({ x: i }));
    const tree = interpret({ schema, rows });
    const { html } = renderHtml(tree, { visualPages: true, idPrefix: 't' });
    expect(html).toContain('rw-visual-pages-root');
    expect(html).toContain('rw-page-visual-sheet');
    const sheets = html.split('rw-page-visual-sheet').length - 1;
    expect(sheets).toBeGreaterThanOrEqual(2);
  });

  it('single scroll article when visualPages is false', () => {
    const schema = manyDetailRowsSchema();
    const rows = Array.from({ length: 120 }, (_, i) => ({ x: i }));
    const tree = interpret({ schema, rows });
    const { html } = renderHtml(tree, { visualPages: false });
    expect(html).not.toContain('rw-visual-pages-root');
    expect(html).toMatch(/^<article class="rw-report"/);
  });

  it('renders one sheet for empty sections when visualPages is true', () => {
    const schema = manyDetailRowsSchema();
    const tree = interpret({ schema, rows: [] });
    const { html } = renderHtml(tree, { visualPages: true });
    expect(html).toContain('rw-visual-pages-root');
    expect(html.split('rw-page-visual-sheet').length - 1).toBe(1);
  });
});
