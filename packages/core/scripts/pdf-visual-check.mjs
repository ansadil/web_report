#!/usr/bin/env node
/**
 * Visual check for the PDF exporter (Arabic shaping/bidi, numbers, Latin fallback, wrapping).
 * Renders an Arabic grouped report to <outDir>/out.pdf (+ out.xlsx) and, when poppler's
 * `pdftoppm` is installed, page 1 to <outDir>/after-p1.png for side-by-side review.
 *
 *   pnpm --filter @reports-web/core build
 *   node packages/core/scripts/pdf-visual-check.mjs [outDir=./visual-out]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { exportPdf, exportExcel } from '../dist/exporters/index.js';
import { getTemplate } from '../dist/templates/index.js';

const outDir = resolve(process.argv[2] ?? 'visual-out');
mkdirSync(outDir, { recursive: true });

const s = getTemplate('grouped').build();
s.meta = { name: 'تقرير المبيعات الشهري', locale: 'ar', dir: 'rtl' };
const rh = s.bands.reportHeader;
rh.elements[0].value = 'تقرير المبيعات - فرع الرياض (Riyadh Branch) لعام 2026';
s.bands.pageHeader.elements[0].value = 'اسم الصنف';
s.bands.pageHeader.elements[1].value = 'الكمية';
s.bands.pageHeader.elements[2].value = 'الإجمالي';
s.bands.pageHeader.elements[0].style = { bold: true, align: 'start' };
s.groups[0].footer.elements[0].value = 'المجموع الفرعي';
s.bands.reportFooter.elements[0].value = 'الإجمالي العام';
rh.elements.push(
  { id: 'd', kind: 'text', value: 'التاريخ: ١٠/٠١/٢٠٢٦ م — الموافق 1448/04/20 هـ — رقم الفاتورة INV-2026-0042', style: { fontSize: 10 }, pos: { x: 0, y: 12, w: 180, h: 6 } },
  { id: 'long', kind: 'text', value: 'ملاحظة: هذا نص عربي طويل جدا لاختبار التفاف الأسطر داخل العنصر عندما يتجاوز عرض الصندوق المحدد له في التصميم ولا يجب أن يخرج عن حدوده أبدا', style: { fontSize: 10 }, pos: { x: 0, y: 18, w: 90, h: 12 } },
  { id: 'tash', kind: 'text', value: 'مُحَمَّدٌ رَسُولُ اللَّهِ — لا إله إلا الله', style: { fontSize: 10 }, pos: { x: 95, y: 18, w: 85, h: 6 } },
  { id: 'mix', kind: 'text', value: 'منتج ABC-123 (إصدار 2) بسعر 1,250.50 ر.س', style: { fontSize: 10 }, pos: { x: 95, y: 24, w: 85, h: 6 } },
);
rh.height = 32;
s.bands.pageFooter = {
  height: 8,
  elements: [{ id: 'pf', kind: 'text', value: 'صفحة {page} من {pages}', style: { fontSize: 8, align: 'center' }, pos: { x: 0, y: 1, w: 180, h: 5 } }],
};

const cats = ['إلكترونيات', 'أثاث مكتبي', 'قرطاسية'];
const rows = [];
for (let i = 0; i < 120; i++) rows.push({ category: cats[i % 3], name: `صنف رقم ${i + 1} - Item ${i + 1}`, qty: (i % 7) + 1, total: ((i * 13.5) % 900) + 10 });
rows.sort((a, b) => a.category.localeCompare(b.category));

const pdf = `${outDir}/out.pdf`;
writeFileSync(pdf, Buffer.from(await (await exportPdf({ schema: s, rows })).arrayBuffer()));
writeFileSync(`${outDir}/out.xlsx`, Buffer.from(await (await exportExcel({ schema: s, rows })).arrayBuffer()));
try {
  execFileSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', pdf, `${outDir}/after-p1`]);
  console.log(`wrote ${outDir}/out.pdf, out.xlsx, after-p1.png`);
} catch {
  console.log(`wrote ${outDir}/out.pdf, out.xlsx (install poppler-utils for the PNG)`);
}
