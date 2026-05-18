import { describe, it, expect } from 'vitest';
import { exportPdf } from './pdf.js';
import { exportExcel, exportCsv } from './excel.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

function schemaFor(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'r1',
    meta: { name: 'Sales Q1', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [
      { name: 'region', type: 'string', label: 'Region' },
      { name: 'amount', type: 'number', label: 'Amount' },
    ],
    bands: {
      reportHeader: { height: 10, elements: [{ id: 'h', kind: 'text', value: 'Sales Q1', pos: { x: 0, y: 0, w: 180, h: 8 } }] },
      detail: {
        height: 6,
        elements: [
          { id: 'd1', kind: 'field', field: 'region', pos: { x: 0, y: 0, w: 80, h: 5 } },
          { id: 'd2', kind: 'field', field: 'amount', format: 'decimal2', pos: { x: 90, y: 0, w: 80, h: 5 } },
        ],
      },
      reportFooter: {
        height: 8,
        elements: [{ id: 'f', kind: 'aggregate', fn: 'sum', field: 'amount', scope: 'report', format: 'decimal2', pos: { x: 90, y: 0, w: 80, h: 6 } }],
      },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const rows = [
  { region: 'N', amount: 100 },
  { region: 'S', amount: 200 },
];

describe('PDF exporter', () => {
  it('produces a non-empty PDF blob', async () => {
    const blob = await exportPdf({ schema: schemaFor(), rows });
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
    const buf = await blob.arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
    expect(head).toBe('%PDF');
  });

  it('embeds Arabic / Eastern Arabic numerals without WinAnsi errors', async () => {
    const r = validateReport({
      version: '1',
      id: 'ar-pdf',
      meta: { name: 'تقرير', locale: 'ar', dir: 'rtl' },
      page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
      dataset: { adapter: 'static', source: 't' },
      fields: [{ name: 'amount', type: 'number', label: 'المبلغ' }],
      bands: {
        reportHeader: {
          height: 10,
          elements: [
            {
              id: 'h',
              kind: 'text',
              value: 'Invoice فاتورة — Reports Web — ١٠/٠١/٢٠٢٦',
              pos: { x: 0, y: 0, w: 180, h: 8 },
            },
          ],
        },
        detail: {
          height: 6,
          elements: [{ id: 'd', kind: 'field', field: 'amount', format: 'decimal2', pos: { x: 0, y: 0, w: 80, h: 5 } }],
        },
      },
    });
    if (!r.ok) throw new Error(r.error);
    const blob = await exportPdf({ schema: r.value, rows: [{ amount: 1 }] });
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(2000);
    const buf = await blob.arrayBuffer();
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('%PDF');
  });
});

describe('Excel exporter', () => {
  it('produces an .xlsx blob with content', async () => {
    const blob = await exportExcel({ schema: schemaFor(), rows });
    expect(blob.type).toContain('spreadsheetml');
    expect(blob.size).toBeGreaterThan(500);
  });
});

describe('CSV exporter', () => {
  it('produces csv with header and rows', () => {
    const blob = exportCsv({ schema: schemaFor(), rows });
    expect(blob.type).toContain('text/csv');
  });
});
