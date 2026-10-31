/**
 * PDF exporter regressions: Arabic shaping + bidi, numbers, Latin fallback, wrapping, page tokens,
 * images/QR/barcodes. Text is read back from the content streams + ToUnicode maps (see
 * `readDrawnLines`), i.e. exactly what was drawn, left → right.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import bidiFactory from 'bidi-js';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { exportPdf } from './pdf.js';
import { alignedX } from './pdf-render.js';
import { encodeBarcode, loadImageBytes } from './pdf-graphics.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';
interface DrawnLine {
  readonly page: number;
  readonly y: number;
  /** Left edge (pt) of the leftmost run on the line. */
  readonly x: number;
  /** Concatenated ToUnicode text of the glyphs, left → right. */
  readonly visual: string;
  readonly fonts: readonly string[];
}

function parseToUnicode(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1]!.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      const hex = m[2]!;
      let s = '';
      for (let i = 0; i < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      map.set(m[1]!.toUpperCase(), s);
    }
  }
  return map;
}

function streamText(doc: PDFDocument, obj: PDFObject | undefined): string {
  const o = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (o instanceof PDFRawStream) return Buffer.from(decodePDFRawStream(o).decode()).toString('latin1');
  if (o instanceof PDFArray) return o.asArray().map((x) => streamText(doc, x)).join('\n');
  return '';
}

async function readDrawnLines(bytes: Uint8Array): Promise<DrawnLine[]> {
  const doc = await PDFDocument.load(bytes);
  const out: DrawnLine[] = [];
  doc.getPages().forEach((page, pi) => {
    const fonts = new Map<string, { name: string; uni: Map<string, string> }>();
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [k, ref] of fontDict?.entries() ?? []) {
      const f = doc.context.lookup(ref) as PDFDict;
      const tu = f.get(PDFName.of('ToUnicode'));
      fonts.set(k.asString(), {
        name: String(f.get(PDFName.of('BaseFont')) ?? ''),
        uni: tu ? parseToUnicode(streamText(doc, tu)) : new Map(),
      });
    }
    const content = streamText(doc, page.node.get(PDFName.of('Contents')));
    const runs: { x: number; y: number; text: string; font: string }[] = [];
    let font: { name: string; uni: Map<string, string> } | undefined;
    let cur: { x: number; y: number; text: string; font: string } | null = null;
    for (const m of content.matchAll(/(\/\S+)\s+[\d.]+\s+Tf|([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm|<([0-9a-fA-F]*)>\s*Tj|\bET\b/g)) {
      if (m[1]) font = fonts.get(m[1]);
      else if (m[2]) {
        cur = { x: +m[6]!, y: +m[7]!, text: '', font: font?.name ?? '' };
        runs.push(cur);
      } else if (m[8] !== undefined && cur && font) {
        const hex = m[8]!.toUpperCase();
        for (let i = 0; i < hex.length; i += 4) cur.text += font.uni.get(hex.slice(i, i + 4)) ?? '\uFFFD';
      } else if (m[0] === 'ET') cur = null;
    }
    const byY = new Map<number, typeof runs>();
    for (const r of runs) {
      const y = Math.round(r.y);
      byY.set(y, [...(byY.get(y) ?? []), r]);
    }
    for (const [y, rs] of [...byY].sort((a, b) => b[0] - a[0])) {
      rs.sort((a, b) => a.x - b.x);
      out.push({ page: pi + 1, y, x: rs[0]!.x, visual: rs.map((r) => r.text).join(' '), fonts: [...new Set(rs.map((r) => r.font))] });
    }
  });
  return out;
}

const bidi = bidiFactory();

/**
 * ToUnicode text a correct renderer draws left → right for logical `text` in a paragraph of
 * `dir`: UAX#9 reordering, but without mirroring (a mirrored glyph still maps to its source
 * character, so extractors that reverse RTL runs restore the logical text).
 */
function expectedVisual(text: string, dir: 'rtl' | 'ltr'): string {
  const chars = Array.from(text);
  if (chars.length !== text.length) throw new Error('BMP only');
  for (const [start, end] of bidi.getReorderSegments(text, bidi.getEmbeddingLevels(text, dir))) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  return chars.join('');
}

type AnyObj = Record<string, unknown>;

function schema(elements: AnyObj[], meta: AnyObj = { name: 'T', locale: 'ar', dir: 'rtl' }, bands: AnyObj = {}): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 't',
    meta,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'v', type: 'string' }],
    bands: { reportHeader: { height: elements.length * 9 + 2, elements }, detail: { height: 0, elements: [] }, ...bands },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const text = (id: string, value: string, i: number, extra: AnyObj = {}): AnyObj => ({
  id,
  kind: 'text',
  value,
  pos: { x: 0, y: i * 9, w: 180, h: 8 },
  ...extra,
});

async function pdfBytes(s: ReportSchemaV1, rows: AnyObj[] = []): Promise<Uint8Array> {
  return new Uint8Array(await (await exportPdf({ schema: s, rows: rows as never })).arrayBuffer());
}

const CORPUS = [
  'تقرير المبيعات الشهري',
  'لا إله إلا الله',
  'الإدارة',
  'مُحَمَّد',
  'منتج ABC-123 (إصدار 2)',
  'السعر 1234.56 ريال',
  '١٢٣٤٫٥٦',
  'المبلغ ١٢٣٤٫٥٦ ريال',
  '١٥ رمضان ١٤٤٧ هـ',
  '1234.56',
  'Hello, World — (Latin) 50%',
  'الفرع: الرياض / جدة',
];

describe('PDF Arabic text corpus (drawn order)', () => {
  let lines: DrawnLine[];
  beforeAll(async () => {
    lines = await readDrawnLines(await pdfBytes(schema(CORPUS.map((t, i) => text(`c${i}`, t, i)))));
  });

  it.each(CORPUS)('«%s» is drawn in correct visual order as one line', (t) => {
    const want = expectedVisual(t, 'rtl');
    expect(lines.map((l) => l.visual)).toContain(want);
  });

  it('no glyph is missing a ToUnicode entry and no .notdef text is drawn', () => {
    for (const l of lines) expect(l.visual).not.toContain('\uFFFD');
  });

  it('each line uses a single (merged Arabic+Latin) font', () => {
    for (const l of lines) expect(l.fonts, l.visual).toHaveLength(1);
  });
});

describe('BUG-21: explicit dir wins over the locale (PDF)', () => {
  /** Mixed strings whose visual order differs between an LTR and an RTL paragraph. */
  const MIXED = ['منتج ABC-123 (إصدار 2)', 'Total: الإجمالي 50', 'العميل Acme Corp'];
  const SHORT = 'قصير';
  const els = () => [...MIXED.map((t, i) => text(`m${i}`, t, i)), text('s', SHORT, MIXED.length)];
  const leftMarginPt = 15 * 2.8346;
  const pageWidthPt = 210 * 2.8346;

  async function draw(meta: AnyObj, mutate?: (s: ReportSchemaV1) => ReportSchemaV1) {
    const s = schema(els(), meta);
    return readDrawnLines(await pdfBytes(mutate ? mutate(s) : s));
  }
  const expectDir = (lines: DrawnLine[], dir: 'ltr' | 'rtl') => {
    const visuals = lines.map((l) => l.visual);
    for (const t of MIXED) {
      expect(expectedVisual(t, 'ltr')).not.toBe(expectedVisual(t, 'rtl'));
      expect(visuals).toContain(expectedVisual(t, dir));
    }
    const short = lines.find((l) => l.visual === expectedVisual(SHORT, dir))!;
    expect(short).toBeDefined();
    // Start alignment: LTR → at the left margin; RTL → flush right (well past the page centre).
    if (dir === 'ltr') {
      expect(short.x).toBeGreaterThanOrEqual(leftMarginPt);
      expect(short.x).toBeLessThan(leftMarginPt + 10); // margin + small inner padding
    }
    else expect(short.x).toBeGreaterThan(pageWidthPt / 2);
  };

  it('Arabic locale + dir ltr → LTR paragraphs and left alignment', async () => {
    expectDir(await draw({ name: 'T', locale: 'ar', dir: 'ltr' }), 'ltr');
  });

  it('Arabic locale + no dir → RTL (schema default from the locale)', async () => {
    expectDir(await draw({ name: 'T', locale: 'ar' }), 'rtl');
  });

  it('Arabic locale + dir missing on an unvalidated schema → RTL (locale fallback)', async () => {
    const strip = (s: ReportSchemaV1) => ({ ...s, meta: { ...s.meta, dir: undefined } }) as unknown as ReportSchemaV1;
    expectDir(await draw({ name: 'T', locale: 'ar' }, strip), 'rtl');
  });

  it('English locale + dir rtl → RTL', async () => {
    expectDir(await draw({ name: 'T', locale: 'en', dir: 'rtl' }), 'rtl');
  });
});

describe('PDF layout', () => {
  it('wraps long text and clips to the element height', async () => {
    const long = 'هذا نص طويل جدا '.repeat(30).trim();
    const bytes = await pdfBytes(schema([{ id: 'w', kind: 'text', value: long, pos: { x: 0, y: 0, w: 60, h: 14 } }]));
    const lines = await readDrawnLines(bytes);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it('BUG-18 alignedX: in RTL start = right, end = left; in LTR the opposite', () => {
    expect(alignedX('start', 'rtl', 0, 100, 20)).toBe(78);
    expect(alignedX('end', 'rtl', 0, 100, 20)).toBe(2);
    expect(alignedX(undefined, 'rtl', 0, 100, 20)).toBe(78);
    expect(alignedX('start', 'ltr', 0, 100, 20)).toBe(2);
    expect(alignedX('end', 'ltr', 0, 100, 20)).toBe(78);
    expect(alignedX('center', 'rtl', 0, 100, 20)).toBe(40);
  });
});

describe('PDF page tokens', () => {
  it('replaces {page}/{pages} with the final page count in static text', async () => {
    const s = schema([text('a', 'أ', 0)], { name: 'T', locale: 'ar', dir: 'rtl' }, {
      reportHeader: { height: 10, elements: [text('a', 'أ', 0)], pageBreakAfter: true },
      pageFooter: { height: 8, elements: [text('pf', 'صفحة {page} من {pages}', 0)] },
    });
    const lines = await readDrawnLines(await pdfBytes(s));
    const footers = lines.filter((l) => l.visual.includes('صفحة') || l.visual.includes('ةحفص'));
    expect(footers.map((l) => l.visual)).toEqual([expectedVisual('صفحة 1 من 2', 'rtl'), expectedVisual('صفحة 2 من 2', 'rtl')]);
  });

  it('never replaces tokens inside data values', async () => {
    const s = schema([{ id: 'f', kind: 'field', field: 'v', pos: { x: 0, y: 0, w: 100, h: 8 } }], { name: 'T', locale: 'ar', dir: 'rtl' }, {
      detail: { height: 9, elements: [{ id: 'f', kind: 'field', field: 'v', pos: { x: 0, y: 0, w: 100, h: 8 } }] },
    });
    const lines = await readDrawnLines(await pdfBytes(s, [{ v: 'رقم {page}' }]));
    expect(lines.map((l) => l.visual)).toContain(expectedVisual('رقم {page}', 'rtl'));
  });
});

describe('PDF non-text elements', () => {
  const PNG_1PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  async function xobjects(bytes: Uint8Array): Promise<number> {
    const doc = await PDFDocument.load(bytes);
    const x = doc.getPages()[0]!.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    return x?.entries().length ?? 0;
  }

  it('embeds PNG data URLs as image XObjects', async () => {
    const bytes = await pdfBytes(schema([{ id: 'i', kind: 'image', src: PNG_1PX, pos: { x: 0, y: 0, w: 20, h: 20 } }]));
    expect(await xobjects(bytes)).toBe(1);
    expect((await readDrawnLines(bytes)).map((l) => l.visual).join(' ')).not.toContain('[image]');
  });

  it('draws QR codes and barcodes as vectors (no placeholder text)', async () => {
    const bytes = await pdfBytes(
      schema([
        { id: 'q', kind: 'qr', value: 'HELLO', pos: { x: 0, y: 0, w: 25, h: 25 } },
        { id: 'b', kind: 'barcode', value: '12345678', pos: { x: 0, y: 30, w: 60, h: 20 } },
      ]),
    );
    const visual = (await readDrawnLines(bytes)).map((l) => l.visual).join(' ');
    expect(visual).not.toMatch(/\[(QR|barcode)\]/);
    expect(visual).toContain('12345678');
  });

  it('decodes data URLs and encodes barcodes', async () => {
    expect((await loadImageBytes(PNG_1PX))?.[1]).toBe(0x50);
    expect(encodeBarcode('12345678')?.bars).toMatch(/^[01]+$/);
    expect(encodeBarcode('abc', 'EAN13')).toBeNull();
  });
});
