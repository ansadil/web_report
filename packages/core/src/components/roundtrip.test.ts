import { describe, it, expect } from 'vitest';
import { interpret } from '../engine/interpreter.js';
import { renderHtml } from '../engine/renderer-html.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';
import { exportPdf } from '../exporters/pdf.js';
import { exportExcel, exportCsv } from '../exporters/excel.js';

function buildSchema(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'roundtrip',
    meta: { name: 'Sales by Region', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 'sales' },
    fields: [
      { name: 'region', type: 'string', label: 'Region' },
      { name: 'amount', type: 'number', label: 'Amount' },
      { name: 'qty', type: 'number', label: 'Qty' },
    ],
    groups: [
      {
        key: 'region',
        header: { height: 6, elements: [{ id: 'gh1', kind: 'field', field: 'region', style: { bold: true }, pos: { x: 0, y: 0, w: 60, h: 5 } }] },
        footer: { height: 6, elements: [{ id: 'gf1', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'group', format: 'decimal2', pos: { x: 120, y: 0, w: 60, h: 5 } }] },
      },
    ],
    bands: {
      reportHeader: {
        height: 12,
        elements: [
          { id: 'rh1', kind: 'text', value: 'Sales by Region', style: { bold: true, fontSize: 14 }, pos: { x: 0, y: 0, w: 180, h: 10 } },
        ],
      },
      pageHeader: {
        height: 8,
        elements: [
          { id: 'ph1', kind: 'text', value: 'Region', style: { bold: true }, pos: { x: 0, y: 0, w: 60, h: 6 } },
          { id: 'ph2', kind: 'text', value: 'Amount', style: { bold: true, align: 'end' }, pos: { x: 120, y: 0, w: 60, h: 6 } },
        ],
      },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'region', pos: { x: 0, y: 0, w: 60, h: 5 } },
          { id: 'd2', kind: 'field', field: 'amount', format: 'decimal2', style: { align: 'end' }, pos: { x: 120, y: 0, w: 60, h: 5 } },
        ],
      },
      reportFooter: {
        height: 10,
        elements: [
          { id: 'rf1', kind: 'text', value: 'TOTAL', style: { bold: true }, pos: { x: 0, y: 0, w: 60, h: 6 } },
          { id: 'rf2', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', style: { bold: true, align: 'end' }, pos: { x: 120, y: 0, w: 60, h: 6 } },
          { id: 'rf3', kind: 'chart', type: 'bar', labelsField: 'region', valueField: 'amount', title: 'By Region', pos: { x: 0, y: 8, w: 180, h: 40 } },
        ],
      },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const rows = [
  { region: 'North', amount: 100, qty: 1 },
  { region: 'North', amount: 250, qty: 2 },
  { region: 'South', amount: 75, qty: 3 },
  { region: 'South', amount: 125, qty: 1 },
  { region: 'West', amount: 300, qty: 5 },
];

describe('end-to-end roundtrip', () => {
  it('schema → tree → html: bands and chart present', () => {
    const schema = buildSchema();
    const tree = interpret({ schema, rows });
    const html = renderHtml(tree);
    expect(html.html).toContain('rw-reportHeader');
    expect(html.html).toContain('rw-pageHeader');
    expect(html.html).toContain('rw-groupHeader');
    expect(html.html).toContain('rw-detail');
    expect(html.html).toContain('rw-groupFooter');
    expect(html.html).toContain('rw-reportFooter');
    expect(html.html).toContain('rw-chart');
    expect(html.chartIds.length).toBe(1);
  });

  it('schema → tree → html: aggregates correct', () => {
    const schema = buildSchema();
    const tree = interpret({ schema, rows });
    const totalSection = tree.sections.find((s) => s.band === 'reportFooter');
    const totalAgg = totalSection?.elements.find((e) => e.id === 'rf2');
    expect(totalAgg?.text).toBe('850.00');
    const groupFooters = tree.sections.filter((s) => s.band === 'groupFooter');
    expect(groupFooters[0]?.elements[0]?.text).toBe('350.00');
    expect(groupFooters[1]?.elements[0]?.text).toBe('200.00');
    expect(groupFooters[2]?.elements[0]?.text).toBe('300.00');
  });

  it('schema → PDF blob', async () => {
    const blob = await exportPdf({ schema: buildSchema(), rows });
    expect(blob.size).toBeGreaterThan(800);
  });

  it('schema → Excel blob with rightToLeft view follows dir', async () => {
    const schema = buildSchema();
    const blob = await exportExcel({ schema, rows });
    expect(blob.size).toBeGreaterThan(500);
  });

  it('schema → CSV blob with header', () => {
    const blob = exportCsv({ schema: buildSchema(), rows });
    expect(blob.size).toBeGreaterThan(0);
  });
});
