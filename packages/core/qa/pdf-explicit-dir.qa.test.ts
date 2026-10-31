/**
 * QA — BUG-21 (fix/pdf-explicit-dir): an explicit meta.dir wins over the locale in PDF export.
 * Arabic locale + dir:'ltr' → LTR paragraph base and left alignment; dir unset → RTL from the locale.
 * Excel direction follows meta.dir as before. Expected to FAIL on main d400d01 (ar + ltr cases).
 * Set QA_EVIDENCE_DIR to write the exported PDFs there.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { validateReport, type ReportSchemaV1 } from '../src/schema/report-schema.js';
import { exportPdf } from '../src/exporters/pdf.js';
import { exportExcel } from '../src/exporters/excel.js';
import { drawnRuns, extractPdfText, norm } from './helpers/pdf-text.js';

type Meta = Record<string, unknown>;
const MIXED = 'منتج ABC-123 (إصدار 2)';
const SHORT = 'قصير';
/** Visual (left → right) glyph order of MIXED as drawn, per paragraph base direction. */
const VISUAL = { ltr: 'جتنم ABC-123 (2 رادصإ)', rtl: ')2 رادصإ( ABC-123 جتنم' } as const;

function build(meta: Meta): ReportSchemaV1 | null {
  const r = validateReport({
    version: '1',
    id: 'qa-bug21',
    meta: { name: 'تقرير', ...meta },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'item', type: 'string', label: 'الصنف' }, { name: 'qty', type: 'number', label: 'الكمية' }],
    bands: {
      reportHeader: {
        height: 30,
        elements: [
          { id: 'mixed', kind: 'text', value: MIXED, pos: { x: 0, y: 0, w: 180, h: 7 } },
          { id: 'short', kind: 'text', value: SHORT, pos: { x: 0, y: 10, w: 180, h: 7 } },
        ],
      },
      detail: {
        height: 7,
        elements: [
          { id: 'd1', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 90, h: 6 } },
          { id: 'd2', kind: 'field', field: 'qty', format: 'integer', pos: { x: 90, y: 0, w: 40, h: 6 } },
        ],
      },
    },
  });
  return r.ok ? r.value : null;
}
const ROWS = [{ item: 'قلم رصاص', qty: 3 }, { item: 'دفتر', qty: 12 }];

async function pdfLayout(meta: Meta, file: string) {
  const s = build(meta);
  if (!s) throw new Error('schema rejected');
  const bytes = new Uint8Array(await (await exportPdf({ schema: s, rows: ROWS })).arrayBuffer());
  if (process.env.QA_EVIDENCE_DIR) writeFileSync(join(process.env.QA_EVIDENCE_DIR, file), bytes);
  const runs = (await drawnRuns(bytes)).map((r) => r.text);
  const t = await extractPdfText(bytes);
  const short = t.items.find((i) => norm(i.str) === norm(SHORT));
  return { runs, shortX: short?.x, pageWidth: t.pageWidth };
}

async function expectPdfDir(meta: Meta, file: string, dir: 'ltr' | 'rtl') {
  const { runs, shortX, pageWidth } = await pdfLayout(meta, file);
  expect(runs, `mixed line drawn with ${dir} paragraph base`).toContain(VISUAL[dir]);
  expect(runs).not.toContain(VISUAL[dir === 'ltr' ? 'rtl' : 'ltr']);
  expect(shortX, 'short text drawn').toBeDefined();
  if (dir === 'ltr') expect(shortX!).toBeLessThan(15 * 2.8346 + 10); // left margin + inner padding
  else expect(shortX!).toBeGreaterThan(pageWidth / 2);
}

async function excelDir(meta: Meta) {
  const s = build(meta)!;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await (await exportExcel({ schema: s, rows: ROWS as never })).arrayBuffer()) as never);
  const ws = wb.worksheets[0]!;
  return (ws.views[0] as { rightToLeft?: boolean } | undefined)?.rightToLeft ?? false;
}

const bcp47 = build({ locale: 'ar-SA', dir: 'ltr' }) !== null;

describe('BUG-21: explicit dir wins over the locale in PDF export', () => {
  it("ar + dir:'ltr' → LTR paragraph base, text at the left margin", () =>
    expectPdfDir({ locale: 'ar', dir: 'ltr' }, 'bug21-ar-ltr.pdf', 'ltr'));
  it('ar + dir unset → RTL (locale default)', () => expectPdfDir({ locale: 'ar' }, 'bug21-ar-nodir.pdf', 'rtl'));
  it("ar + dir:'rtl' → RTL", () => expectPdfDir({ locale: 'ar', dir: 'rtl' }, 'bug21-ar-rtl.pdf', 'rtl'));
  it("en + dir:'rtl' → RTL", () => expectPdfDir({ locale: 'en', dir: 'rtl' }, 'bug21-en-rtl.pdf', 'rtl'));
  it("en + dir:'ltr' → LTR", () => expectPdfDir({ locale: 'en', dir: 'ltr' }, 'bug21-en-ltr.pdf', 'ltr'));
  it.skipIf(!bcp47)("ar-SA + dir:'ltr' → LTR (needs BCP 47 locales)", () =>
    expectPdfDir({ locale: 'ar-SA', dir: 'ltr' }, 'bug21-arSA-ltr.pdf', 'ltr'));
  it.skipIf(!bcp47)('ar-SA + dir unset → RTL (needs BCP 47 locales)', () =>
    expectPdfDir({ locale: 'ar-SA' }, 'bug21-arSA-nodir.pdf', 'rtl'));
});

describe('BUG-21: Excel direction unchanged (follows meta.dir)', () => {
  it("ar + dir:'ltr' → LTR sheet", async () => expect(await excelDir({ locale: 'ar', dir: 'ltr' })).toBe(false));
  it('ar + dir unset → RTL sheet', async () => expect(await excelDir({ locale: 'ar' })).toBe(true));
  it("en + dir:'rtl' → RTL sheet", async () => expect(await excelDir({ locale: 'en', dir: 'rtl' })).toBe(true));
  it('en + dir unset → LTR sheet', async () => expect(await excelDir({ locale: 'en' })).toBe(false));
});
