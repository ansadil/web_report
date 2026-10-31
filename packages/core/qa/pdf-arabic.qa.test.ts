/**
 * QA acceptance — Arabic PDF correctness (library's own exportPdf, text extracted with pdfjs-dist).
 * EXPECTED TO FAIL until BUG-01/02/03/05/10/11/12/15/17/18 are fixed. See /workspace/qa/web_report-baseline-ar.md.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { applyPattern } from '@reports-web/shared';
import { exportPdf } from '../src/exporters/pdf.js';
import {
  extractPdfText, toBytes, containsLogical, closest, findNotdefGlyphs, embeddedFontsCoverage,
  pdfHasImageXObject, embeddedFontSummary, norm, drawnRuns, type PdfText,
} from './helpers/pdf-text.js';
import { arabicSchema, CORPUS, ROWS, singleElementSchema, mustValidate } from './helpers/fixtures.js';
import { visualOrderRtl, drawnContainsVisual, inkOnly } from './helpers/visual-order.js';

const MM = 72 / 25.4;
let bytes: Uint8Array;
let text: PdfText;

beforeAll(async () => {
  bytes = await toBytes(await exportPdf({ schema: arabicSchema(), rows: ROWS }));
  text = await extractPdfText(bytes);
});

function expectLogical(expected: string): void {
  const ok = containsLogical(text, expected);
  expect(ok, `expected logical text «${norm(expected)}»; closest extracted: ${JSON.stringify(closest(text, expected))}`).toBe(true);
}

describe('PDF Arabic text extracts in logical order (NFKC)', () => {
  it('BUG-01 plain Arabic title «تقرير المبيعات الشهري»', () => expectLogical(CORPUS.title));
  it('BUG-01 bold Arabic line «الإجمالي العام للفرع»', () => expectLogical(CORPUS.boldLine));
  it('BUG-01 lam-alef «لا إله إلا الله»', () => expectLogical(CORPUS.lamAlef));
  it('BUG-01 lam-alef «الإدارة»', () => expectLogical(CORPUS.idara));
  it('BUG-01 tashkeel «مُحَمَّد»', () => expectLogical(CORPUS.tashkeel));
  it('BUG-01 column header «الصنف» (bold pageHeader)', () => expectLogical('الصنف'));
  it('BUG-01 detail field value «دفتر»', () => expectLogical('دفتر'));
  it('BUG-01/BUG-03 mixed bidi «منتج ABC-123 (إصدار 2)»', () => expectLogical(CORPUS.mixed));
});

describe('PDF numbers keep digit order', () => {
  it('BUG-02 Western literal 1234.56', () => expectLogical(CORPUS.western));
  it('BUG-02 Western literal 23.50', () => expectLogical(CORPUS.western2));
  it('BUG-02 Eastern Arabic literal ١٢٣٤٫٥٦', () => expectLogical(CORPUS.eastern));
  it('BUG-02 Hijri date string «١٥ رمضان ١٤٤٧ هـ»', () => expectLogical(CORPUS.hijri));
  it('BUG-02 formatted price field 1234.56 (decimal2, ar)', () => expectLogical(applyPattern(1234.56, 'decimal2', 'ar')));
  it('BUG-02 formatted price field 23.50 (decimal2, ar)', () => expectLogical(applyPattern(23.5, 'decimal2', 'ar')));
  // date:short in 'ar' contains U+200F RLM between the parts (Intl output). The RLMs are
  // invisible, so pdf.js cannot rebuild the logical string from the drawn glyphs; judge the
  // date by its actual drawing order (drawnRuns) against the UAX #9 visual order instead.
  // See evidence/after/claims (QA verification of fix/pdf-arabic-text).
  it('BUG-02 formatted date field 2026-10-15 (date:short, ar) is drawn in UAX#9 RTL visual order', async () => {
    const logical = applyPattern('2026-10-15', 'date:short', 'ar');
    const runs = (await drawnRuns(bytes)).map((r) => r.text);
    expect(
      drawnContainsVisual(runs, logical),
      `expected a drawn run «${visualOrderRtl(logical)}» (visual L→R of «${inkOnly(logical)}»); drawn: ${JSON.stringify(runs.map(inkOnly).filter((r) => /[0-9٠-٩]/.test(r)))}`,
    ).toBe(true);
  });
  it('BUG-02 formatted date field 2026-10-15 (date:short, ar): every digit group is extractable', () => {
    for (const part of inkOnly(applyPattern('2026-10-15', 'date:short', 'ar')).split(/[^0-9٠-٩]+/).filter(Boolean)) expectLogical(part);
  });
  it('BUG-02 report total sum(price) = 1258.06', () => expectLogical(applyPattern(1258.06, 'decimal2', 'ar')));
});

describe('PDF visual (drawing) order, independent of extractor bidi', () => {
  it('BUG-01 Arabic title glyphs are drawn right-to-left (L→R glyph sequence = reversed logical)', async () => {
    const runs = (await drawnRuns(bytes)).map((r) => r.text);
    expect(runs).toContain([...norm(CORPUS.title)].reverse().join(''));
  });
  it('BUG-02 Eastern digits ١٢٣٤٫٥٦ are drawn left-to-right', async () => {
    const runs = (await drawnRuns(bytes)).map((r) => r.text);
    expect(runs).toContain('١٢٣٤٫٥٦');
  });
});

describe('PDF glyph coverage', () => {
  it('BUG-03 no .notdef (GID 0) glyphs drawn anywhere', async () => {
    expect(await findNotdefGlyphs(bytes)).toEqual([]);
  });
  it('BUG-03 embedded fonts cover Latin A–Z, a–z, em dash and parentheses', async () => {
    const cps = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz—()'].map((c) => c.codePointAt(0)!);
    const cov = await embeddedFontsCoverage(bytes, cps);
    expect(cov.missing.map((c) => String.fromCodePoint(c)).join(''), `fonts: ${cov.fonts.join(', ')}`).toBe('');
  });
  it('BUG-03 Latin run "ABC-123" is extractable', () => expectLogical('ABC-123'));
});

describe('PDF layout', () => {
  it('BUG-05 locale "ar" without meta.dir lays out RTL (x=0 column drawn on the right half)', async () => {
    const schema = singleElementSchema(
      { id: 'a', kind: 'text', value: '777', pos: { x: 0, y: 0, w: 60, h: 7 } },
      { name: 'QA', locale: 'ar' },
    );
    const t = await extractPdfText(await toBytes(await exportPdf({ schema, rows: [] })));
    const it777 = t.items.find((i) => norm(i.str).includes('777'));
    expect(it777, 'text item 777 not found').toBeTruthy();
    expect(it777!.x).toBeGreaterThan(t.pageWidth / 2);
  });

  it('BUG-18 align "start" in RTL anchors to the right edge', async () => {
    const schema = singleElementSchema(
      { id: 'a', kind: 'text', value: '777', pos: { x: 0, y: 0, w: 180, h: 7 }, style: { align: 'start' } },
      { name: 'QA', locale: 'ar', dir: 'rtl' },
    );
    const t = await extractPdfText(await toBytes(await exportPdf({ schema, rows: [] })));
    const it777 = t.items.find((i) => norm(i.str).includes('777'))!;
    expect(it777.x).toBeGreaterThan(t.pageWidth / 2);
  });

  it('BUG-10 long text wraps inside its element width (≥2 lines, no overflow)', async () => {
    const left = 15 * MM;
    const w = 40 * MM;
    const schema = singleElementSchema({
      id: 'w', kind: 'text', value: 'The quick brown fox jumps over the lazy dog again and again and again',
      pos: { x: 0, y: 0, w: 40, h: 40 },
    });
    const t = await extractPdfText(await toBytes(await exportPdf({ schema, rows: [] })));
    const ys = new Set(t.items.map((i) => Math.round(i.y)));
    expect(ys.size, 'number of rendered lines').toBeGreaterThanOrEqual(2);
    for (const i of t.items) expect(i.x + i.width, `item «${i.str}» overflows`).toBeLessThanOrEqual(left + w + 1);
    expect(norm(t.items.map((i) => i.str).join(' '))).toContain('lazy dog');
  });

  it('BUG-17 page 1: report title is drawn above the repeating column header', () => {
    const p1 = text.items.filter((i) => i.page === 1).sort((a, b) => b.y - a.y);
    expect(Math.round(p1[0]!.size), 'top-most item on page 1 should be the 16pt title').toBe(16);
  });

  // Approved tokens: {page} (current page) and {pages} (total pages) are separate tokens that may appear
  // anywhere inside user text. Existing engine syntax: exact-match '{page}' (alias '{صفحة}') in pageFooter text only.
  const pnSchema = (value: string) => mustValidate({
    version: '1', id: 'qa-pn', meta: { name: 'QA', locale: 'ar', dir: 'rtl' },
    dataset: { adapter: 'static', source: 't' }, fields: [],
    bands: {
      reportHeader: { height: 10, pageBreakAfter: true, elements: [{ id: 't', kind: 'text', value: '777', pos: { x: 0, y: 0, w: 50, h: 6 } }] },
      detail: { height: 0, elements: [] },
      reportFooter: { height: 10, elements: [{ id: 'f', kind: 'text', value: '888', pos: { x: 0, y: 0, w: 50, h: 6 } }] },
      pageFooter: { height: 8, elements: [{ id: 'pn', kind: 'text', value, pos: { x: 0, y: 0, w: 180, h: 6 } }] },
    },
  });
  const footerTexts = async (value: string) => {
    const t = await extractPdfText(await toBytes(await exportPdf({ schema: pnSchema(value), rows: [] })));
    expect(t.numPages).toBe(2);
    return [1, 2].map((p) => t.lines.filter((l) => l.page === p).map((l) => l.text).join('\n'));
  };

  it('BUG-15 (guard) existing exact "{page}" token renders 1 and 2', async () => {
    const [p1, p2] = await footerTexts('{page}');
    expect(p1).toMatch(/(^|\n)[1١]($|\n)/);
    expect(p2).toMatch(/(^|\n)[2٢]($|\n)/);
  });
  it('BUG-15 "{page}" is replaced inside user text «صفحة {page}»', async () => {
    const [p1, p2] = await footerTexts('صفحة {page}');
    expect(p1 + p2).not.toContain('{page}');
    expect(p1).toMatch(/صفحة [1١]/);
    expect(p2).toMatch(/صفحة [2٢]/);
  });
  it('BUG-15 "{pages}" (total pages) token renders the page count «{pages}»', async () => {
    const [p1, p2] = await footerTexts('{pages}');
    expect(p1 + p2).not.toContain('{pages}');
    expect(p1).toMatch(/(^|\n)[2٢]($|\n)/);
    expect(p2).toMatch(/(^|\n)[2٢]($|\n)/);
  });
  it('BUG-15 user template «صفحة {page} من {pages}» renders «صفحة 1 من 2» / «صفحة 2 من 2»', async () => {
    const [p1, p2] = await footerTexts('صفحة {page} من {pages}');
    expect(p1 + p2).not.toMatch(/\{pages?\}/);
    expect(p1).toMatch(/صفحة [1١] من [2٢]/);
    expect(p2).toMatch(/صفحة [2٢] من [2٢]/);
  });
});

describe('PDF page tokens — approved: {page}/{pages} + aliases {صفحة}/{صفحات}, replaced anywhere in text', () => {
  const pn = (value: string) => mustValidate({
    version: '1', id: 'qa-pn2', meta: { name: 'QA', locale: 'ar', dir: 'rtl' },
    dataset: { adapter: 'static', source: 't' }, fields: [],
    bands: {
      reportHeader: { height: 10, pageBreakAfter: true, elements: [{ id: 't', kind: 'text', value: '777', pos: { x: 0, y: 0, w: 50, h: 6 } }] },
      detail: { height: 0, elements: [] },
      reportFooter: { height: 10, elements: [{ id: 'f', kind: 'text', value: '888', pos: { x: 0, y: 0, w: 50, h: 6 } }] },
      pageFooter: { height: 8, elements: [{ id: 'pn', kind: 'text', value, pos: { x: 0, y: 0, w: 180, h: 6 } }] },
    },
  });
  const pages = async (value: string) => {
    const t = await extractPdfText(await toBytes(await exportPdf({ schema: pn(value), rows: [] })));
    expect(t.numPages).toBe(2);
    return [1, 2].map((p) => t.lines.filter((l) => l.page === p).map((l) => l.text).join('\n'));
  };
  it('BUG-15 PDF Arabic aliases «صفحة {صفحة} من {صفحات}» → «صفحة 1 من 2» / «صفحة 2 من 2»', async () => {
    const [p1, p2] = await pages('صفحة {صفحة} من {صفحات}');
    expect(p1 + p2).not.toMatch(/[{}]/);
    expect(p1).toMatch(/صفحة [1١] من [2٢]/);
    expect(p2).toMatch(/صفحة [2٢] من [2٢]/);
  });
  it('BUG-15 PDF alias {صفحات} alone renders total pages', async () => {
    const [p1, p2] = await pages('{صفحات}');
    expect(p1).toMatch(/(^|\n)[2٢]($|\n)/);
    expect(p2).toMatch(/(^|\n)[2٢]($|\n)/);
  });
  it('BUG-15 PDF token mid-sentence «هذه الصفحة {page} من التقرير»', async () => {
    const [p1, p2] = await pages('هذه الصفحة {page} من التقرير');
    expect(p1 + p2).not.toMatch(/[{}]/);
    expect(p1).toMatch(/هذه الصفحة [1١] من التقرير/);
    expect(p2).toMatch(/هذه الصفحة [2٢] من التقرير/);
  });
  it('BUG-15 PDF multiple/mixed tokens in one string «{page} و {صفحة} من {pages} و {صفحات}»', async () => {
    // pdf.js classifies this digit-heavy line as LTR and re-orders it (extracts «2 و 1 من 2 و 1»
    // for a correctly drawn page 1), so the order is judged by drawnRuns against UAX #9 instead.
    const b = await toBytes(await exportPdf({ schema: pn('{page} و {صفحة} من {pages} و {صفحات}'), rows: [] }));
    const t = await extractPdfText(b);
    expect(t.numPages).toBe(2);
    expect(t.lines.map((l) => l.text).join('\n')).not.toMatch(/[{}]/);
    const runs = await drawnRuns(b);
    const ok = (page: number, logicalWestern: string) => {
      const onPage = runs.filter((r) => r.page === page).map((r) => r.text);
      const eastern = logicalWestern.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
      return {
        pass: drawnContainsVisual(onPage, logicalWestern) || drawnContainsVisual(onPage, eastern),
        msg: `page ${page}: expected drawn «${visualOrderRtl(logicalWestern)}» (or Eastern digits); drawn: ${JSON.stringify(onPage.map(inkOnly))}`,
      };
    };
    const r1 = ok(1, '1 و 1 من 2 و 2');
    const r2 = ok(2, '2 و 2 من 2 و 2');
    expect(r1.pass, r1.msg).toBe(true);
    expect(r2.pass, r2.msg).toBe(true);
  });
  it('QA oracle: visualOrderRtl matches UAX #9 / Chromium for pinned cases', () => {
    // Pinned from Chromium (ICU) rendering in dir=rtl — guards the oracle itself.
    expect(visualOrderRtl('1 و 1 من 2 و 2')).toBe('2 و 2 نم 1 و 1');
    expect(visualOrderRtl('١٥\u200f/١٠\u200f/٢٠٢٦')).toBe('٢٠٢٦/١٠/١٥');
    expect(visualOrderRtl('١٥/١٠/٢٠٢٦')).toBe('١٥/١٠/٢٠٢٦');
    expect(visualOrderRtl('صفحة 1 من 8')).toBe('8 نم 1 ةحفص');
    expect(visualOrderRtl('منتج ABC-123 (إصدار 2)')).toBe(')2 رادصإ( ABC-123 جتنم');
  });
});

describe('PDF non-text elements', () => {
  const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  const one = async (el: Record<string, unknown>) => {
    const b = await toBytes(await exportPdf({ schema: singleElementSchema(el), rows: [] }));
    return { b, t: await extractPdfText(b) };
  };
  it('BUG-11 image element embeds the actual image (no "[image]" placeholder)', async () => {
    const { b, t } = await one({ id: 'i', kind: 'image', src: PNG_1PX, pos: { x: 0, y: 0, w: 20, h: 20 } });
    expect(t.lines.map((l) => l.text).join(' ')).not.toContain('[image]');
    expect(await pdfHasImageXObject(b)).toBe(true);
  });
  it('BUG-11 QR element renders a code (no "[QR]" placeholder)', async () => {
    const { t } = await one({ id: 'q', kind: 'qr', value: 'HELLO', pos: { x: 0, y: 0, w: 25, h: 25 } });
    expect(t.lines.map((l) => l.text).join(' ')).not.toContain('[QR]');
  });
  it('BUG-11 barcode element renders bars (no "[barcode]" placeholder)', async () => {
    const { t } = await one({ id: 'bc', kind: 'barcode', value: '12345678', pos: { x: 0, y: 0, w: 60, h: 20 } });
    expect(t.lines.map((l) => l.text).join(' ')).not.toContain('[barcode]');
  });
});

describe('PDF size', () => {
  it('BUG-12 fonts are subset: one-line Arabic PDF < 100 KB and each embedded font program < 60 KB', async () => {
    const schema = singleElementSchema({ id: 'a', kind: 'text', value: 'مرحبا بالعالم', pos: { x: 0, y: 0, w: 100, h: 8 } }, { name: 'QA', locale: 'ar', dir: 'rtl' });
    const b = await toBytes(await exportPdf({ schema, rows: [] }));
    const fonts = await embeddedFontSummary(b);
    expect(b.byteLength, `pdf bytes; fonts=${JSON.stringify(fonts)}`).toBeLessThan(100_000);
    for (const f of fonts) expect(f.programBytes, f.name).toBeLessThan(60_000);
  });
});
