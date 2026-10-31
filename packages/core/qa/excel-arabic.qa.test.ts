/**
 * QA acceptance — Excel export (exceljs read-back). EXPECTED TO FAIL until BUG-05/06/07/15 are fixed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import { exportExcel } from '../src/exporters/excel.js';
import { arabicSchema, ROWS } from './helpers/fixtures.js';

async function load(blob: Blob): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
  return wb.worksheets[0]!;
}

/** Locates the header row (the row holding the field labels) and returns column index per label. */
function headerCols(ws: ExcelJS.Worksheet): { row: number; col: Record<string, number> } {
  for (let r = 1; r <= ws.rowCount; r++) {
    const vals = (ws.getRow(r).values as unknown[]).map((v) => String(v ?? ''));
    if (vals.includes('السعر')) {
      const col: Record<string, number> = {};
      vals.forEach((v, i) => { if (v) col[v] = i; });
      return { row: r, col };
    }
  }
  throw new Error('header row not found');
}

let ws: ExcelJS.Worksheet;
beforeAll(async () => { ws = await load(await exportExcel({ schema: arabicSchema(), rows: ROWS })); });

describe('Excel export', () => {
  it('BUG-06 report total sum(price)=1258.06 sits in the «السعر» column', () => {
    const { col } = headerCols(ws);
    const priceCol = col['السعر']!;
    const sums: { r: number; c: number; v: unknown }[] = [];
    ws.eachRow((row, r) => row.eachCell((cell, c) => { if (typeof cell.value === 'number' && Math.abs(cell.value - 1258.06) < 1e-6) sums.push({ r, c, v: cell.value }); }));
    expect(sums.length, 'total cell present').toBeGreaterThan(0);
    expect(sums.map((s) => s.c)).toContain(priceCol);
  });

  it('BUG-07 date field cells are real Excel dates (Date values), not text', () => {
    const { row, col } = headerCols(ws);
    const v = ws.getRow(row + 1).getCell(col['التاريخ']!).value;
    expect(v, `got ${JSON.stringify(v)}`).toBeInstanceOf(Date);
  });

  it('BUG-07 numeric field cells carry the schema number format (decimal2 → #,##0.00)', () => {
    const { row, col } = headerCols(ws);
    const c = ws.getRow(row + 1).getCell(col['السعر']!);
    expect(typeof c.value).toBe('number');
    expect(c.numFmt ?? 'General').toMatch(/0\.00/);
  });

  it('BUG-15 Arabic report total label is «الإجمالي», not "TOTAL"', () => {
    const all: string[] = [];
    ws.eachRow((row) => row.eachCell((cell) => all.push(String(cell.value))));
    expect(all).not.toContain('TOTAL');
    expect(all).toContain('الإجمالي');
  });

  it('BUG-05 sheet is right-to-left for locale "ar" without meta.dir', async () => {
    const w = await load(await exportExcel({ schema: arabicSchema({ dir: undefined }), rows: ROWS }));
    expect((w.views[0] as { rightToLeft?: boolean } | undefined)?.rightToLeft).toBe(true);
  });

  it('BUG-05 (control) sheet is right-to-left when meta.dir="rtl"', () => {
    expect((ws.views[0] as { rightToLeft?: boolean } | undefined)?.rightToLeft).toBe(true);
  });
});
