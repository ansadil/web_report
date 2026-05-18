import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { renderHtml } from './renderer-html.js';
import { exportPdf } from '../exporters/pdf.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function schemaWithBreaks(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'pb',
    meta: { name: 'PageBreaks', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: {
      reportHeader: { height: 10, pageBreakAfter: true, elements: [{ id: 'h', kind: 'text', value: 'Cover', pos: { x: 0, y: 0, w: 180, h: 8 } }] },
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] },
      reportFooter: { height: 10, pageBreakBefore: true, elements: [{ id: 'f', kind: 'text', value: 'End', pos: { x: 0, y: 0, w: 180, h: 8 } }] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('page break support', () => {
  it('propagates flags to render sections', () => {
    const tree = interpret({ schema: schemaWithBreaks(), rows: [{ x: 1 }] });
    const rh = tree.sections.find((s) => s.band === 'reportHeader');
    const rf = tree.sections.find((s) => s.band === 'reportFooter');
    expect(rh?.pageBreakAfter).toBe(true);
    expect(rf?.pageBreakBefore).toBe(true);
  });

  it('HTML renderer emits CSS break rules', () => {
    const tree = interpret({ schema: schemaWithBreaks(), rows: [{ x: 1 }] });
    const html = renderHtml(tree).html;
    expect(html).toMatch(/page-break-after:\s*always/);
    expect(html).toMatch(/page-break-before:\s*always/);
  });

  it('PDF exporter produces multi-page document with breaks', async () => {
    const blob = await exportPdf({ schema: schemaWithBreaks(), rows: [{ x: 1 }, { x: 2 }] });
    expect(blob.size).toBeGreaterThan(900);
  });
});
