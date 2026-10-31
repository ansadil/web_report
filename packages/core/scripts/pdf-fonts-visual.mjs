#!/usr/bin/env node
/**
 * Visual check for PDF font selection: one PDF + PNG per bundled family (and the default
 * Noto chain) with the same Arabic sample in regular and bold, for side-by-side review of
 * joining, lam-alef, marks, digits and the Noto fallback for code points a family lacks.
 *
 *   pnpm --filter @reports-web/core build
 *   node packages/core/scripts/pdf-fonts-visual.mjs [outDir=./visual-fonts]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { exportPdf } from '../dist/exporters/index.js';
import { validateReport } from '../dist/schema/report-schema.js';

const outDir = resolve(process.argv[2] ?? 'visual-fonts');
mkdirSync(outDir, { recursive: true });

const SAMPLE = [
  'تقرير المبيعات الشهري — فرع الرياض',
  'بسم الله الرحمن الرحيم · لا إله إلا الله',
  'مُحَمَّدٌ رَسُولُ اللَّهِ',
  'الإجمالي: ١٢٣٤٫٥٦ ريال (1,234.56 SAR) ﷼',
  'منتج ABC-123 (إصدار 2) — ١٥ رمضان ١٤٤٧ هـ',
  'ع عع ععع · ه هه ههه · ي يي ييي · سلام · لب لا',
];

const families = [
  ['default', undefined],
  ['cairo', 'Cairo'],
  ['tajawal', 'Tajawal'],
  ['noto-naskh-arabic', 'Noto Naskh Arabic'],
];

for (const [slug, font] of families) {
  const elements = [];
  let y = 0;
  elements.push({ id: 'h', kind: 'text', value: `fontFamily: ${font ?? '(none: default Noto Sans Arabic + Noto Sans)'}`, style: { fontSize: 9, align: 'start' }, pos: { x: 0, y, w: 180, h: 6 } });
  y += 8;
  for (const bold of [false, true]) {
    for (const [i, value] of SAMPLE.entries()) {
      elements.push({ id: `${bold ? 'b' : 'r'}${i}`, kind: 'text', value, style: { fontSize: 14, bold, ...(font ? { font } : {}) }, pos: { x: 0, y, w: 180, h: 9 } });
      y += 10;
    }
    y += 4;
  }
  const r = validateReport({
    version: '1',
    id: `fonts-${slug}`,
    meta: { name: `fonts ${slug}`, locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 'x' },
    fields: [],
    bands: { reportHeader: { height: y, elements }, detail: { height: 0, elements: [] } },
  });
  if (!r.ok) throw new Error(r.error);
  const pdf = `${outDir}/${slug}.pdf`;
  writeFileSync(pdf, Buffer.from(await (await exportPdf({ schema: r.value, rows: [] })).arrayBuffer()));
  try {
    execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', '-y', '0', '-H', String(Math.round(((y + 20) / 25.4) * 110)), '-W', '1000', '-x', '0', pdf, `${outDir}/${slug}`]);
    console.log(`wrote ${slug}.pdf, ${slug}.png`);
  } catch {
    console.log(`wrote ${slug}.pdf (install poppler-utils for the PNG)`);
  }
}
