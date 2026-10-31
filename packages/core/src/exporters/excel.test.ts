import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportExcel, excelNumFmt, toExcelDate } from './excel.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

type AnyObj = Record<string, unknown>;

function schema(meta: AnyObj = { name: 'تقرير', locale: 'ar', dir: 'rtl' }, extra: AnyObj = {}): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'x',
    meta,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [
      { name: 'item', type: 'string', label: 'الصنف' },
      { name: 'qty', type: 'number', label: 'الكمية' },
      { name: 'price', type: 'number', label: 'السعر' },
      { name: 'date', type: 'date', label: 'التاريخ' },
    ],
    bands: {
      detail: {
        height: 7,
        elements: [
          { id: 'd1', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 70, h: 6 } },
          { id: 'd2', kind: 'field', field: 'qty', format: 'integer', pos: { x: 70, y: 0, w: 30, h: 6 } },
          { id: 'd3', kind: 'field', field: 'price', format: 'decimal2', pos: { x: 100, y: 0, w: 35, h: 6 } },
          { id: 'd4', kind: 'field', field: 'date', format: 'date:short', pos: { x: 135, y: 0, w: 45, h: 6 } },
        ],
      },
      reportFooter: {
        height: 10,
        elements: [
          { id: 's1', kind: 'aggregate', fn: 'sum', field: 'price', scope: 'report', format: 'decimal2', pos: { x: 100, y: 0, w: 35, h: 6 } },
          { id: 's2', kind: 'aggregate', fn: 'sum', field: 'qty', scope: 'report', format: 'integer', pos: { x: 70, y: 0, w: 30, h: 6 } },
        ],
      },
    },
    ...extra,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const ROWS = [
  { item: 'قلم', qty: 3, price: 1234.56, date: '2026-10-01' },
  { item: 'دفتر', qty: 12, price: 23.5, date: '2026-10-15' },
];

async function sheet(s: ReportSchemaV1, rows: AnyObj[] = ROWS): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await (await exportExcel({ schema: s, rows: rows as never })).arrayBuffer()) as never);
  return wb.worksheets[0]!;
}

function findRow(ws: ExcelJS.Worksheet, first: unknown): ExcelJS.Row {
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getRow(r).values && (ws.getRow(r).values as unknown[]).includes(first)) return ws.getRow(r);
  throw new Error(`row with ${String(first)} not found`);
}

describe('Excel exporter (Arabic report)', () => {
  it('puts each report total under its own field column with the field format', async () => {
    const ws = await sheet(schema());
    const header = findRow(ws, 'السعر');
    const priceCol = (header.values as unknown[]).indexOf('السعر');
    const qtyCol = (header.values as unknown[]).indexOf('الكمية');
    const total = findRow(ws, 'الإجمالي');
    expect(total.getCell(priceCol).value).toBeCloseTo(1258.06, 6);
    expect(total.getCell(priceCol).numFmt).toBe('#,##0.00');
    expect(total.getCell(qtyCol).value).toBe(15);
    expect(total.getCell(qtyCol).numFmt).toBe('#,##0');
    expect(total.getCell(1).value).toBe('الإجمالي');
  });

  it('writes dates as real Date cells (UTC midnight of the ISO date) with a date numFmt', async () => {
    const ws = await sheet(schema());
    const row = findRow(ws, 'قلم');
    const c = row.getCell(4);
    expect(c.value).toBeInstanceOf(Date);
    expect((c.value as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(c.numFmt).toBe('dd/mm/yyyy');
    expect(row.getCell(3).numFmt).toBe('#,##0.00');
    expect(row.getCell(2).numFmt).toBe('#,##0');
  });

  it('labels the total "Total" in English and keeps the sheet LTR', async () => {
    const ws = await sheet(schema({ name: 'Sales', locale: 'en', dir: 'ltr' }));
    expect(() => findRow(ws, 'Total')).not.toThrow();
    expect((ws.views[0] as { rightToLeft?: boolean }).rightToLeft).toBe(false);
  });

  it('is right-to-left for dir=rtl', async () => {
    const ws = await sheet(schema());
    expect((ws.views[0] as { rightToLeft?: boolean }).rightToLeft).toBe(true);
  });

  describe('BUG-21: explicit dir wins over the locale', () => {
    const rtlView = (ws: ExcelJS.Worksheet) => (ws.views[0] as { rightToLeft?: boolean }).rightToLeft;
    const headerAlign = (ws: ExcelJS.Worksheet) => findRow(ws, 'الصنف').alignment?.horizontal;

    it('Arabic locale + dir ltr → LTR sheet and left-aligned headers', async () => {
      const ws = await sheet(schema({ name: 'تقرير', locale: 'ar', dir: 'ltr' }));
      expect(rtlView(ws)).toBe(false);
      expect(headerAlign(ws)).toBe('left');
    });

    it('Arabic locale + no dir → RTL sheet (locale default)', async () => {
      const ws = await sheet(schema({ name: 'تقرير', locale: 'ar' }));
      expect(rtlView(ws)).toBe(true);
      expect(headerAlign(ws)).toBe('right');
    });

    it('English locale + dir rtl → RTL sheet', async () => {
      const ws = await sheet(schema({ name: 'Sales', locale: 'en', dir: 'rtl' }));
      expect(rtlView(ws)).toBe(true);
      expect(headerAlign(ws)).toBe('right');
    });
  });

  it('group totals sit under their field column', async () => {
    const s = schema(undefined, {
      groups: [{ key: 'item', footer: { height: 6, elements: [{ id: 'g', kind: 'aggregate', fn: 'sum', field: 'price', scope: 'group', format: 'decimal2', pos: { x: 100, y: 0, w: 35, h: 6 } }] } }],
    });
    const ws = await sheet(s);
    const header = findRow(ws, 'السعر');
    const priceCol = (header.values as unknown[]).indexOf('السعر');
    const groupTotals: number[] = [];
    ws.eachRow((r) => {
      const label = String(r.getCell(1).value ?? '');
      if (label.startsWith('الإجمالي (')) groupTotals.push(r.getCell(priceCol).value as number);
    });
    expect(groupTotals.sort((a, b) => a - b)).toEqual([23.5, 1234.56]);
  });
});

describe('Excel helpers', () => {
  it('maps shared patterns to Excel number formats', () => {
    expect(excelNumFmt('decimal2', 'number')).toBe('#,##0.00');
    expect(excelNumFmt('integer', 'number')).toBe('#,##0');
    expect(excelNumFmt('percent', 'number')).toBe('0%');
    expect(excelNumFmt('currency:SAR', 'number')).toBe('#,##0.00 "SAR"');
    expect(excelNumFmt(undefined, 'date')).toBe('yyyy-mm-dd');
    expect(excelNumFmt(undefined, 'string')).toBeNull();
  });

  it('parses ISO dates without shifting the calendar day', () => {
    expect(toExcelDate('2026-10-15')?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(toExcelDate('2026-10-15T08:30')?.toISOString()).toBe('2026-10-15T08:30:00.000Z');
    expect(toExcelDate('2026-10-15T08:30:00+03:00')?.toISOString()).toBe('2026-10-15T05:30:00.000Z');
    expect(toExcelDate('not a date')).toBeNull();
  });
});
