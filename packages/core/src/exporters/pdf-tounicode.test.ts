// @vitest-environment node
/**
 * BUG-23: no empty ToUnicode targets — glyphs without characters of their own (Noto Naskh's
 * separate dot glyphs) map to U+200B, so pdf.js extracts the logical text, not raw CIDs.
 * BUG-22: every embedded subset in one PDF has its own subset tag (ISO 32000-1 §9.6.4).
 */
import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { exportPdf } from './pdf.js';
import { buildToUnicode } from './pdf-cid-font.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

type AnyObj = Record<string, unknown>;

function schema(elements: AnyObj[]): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 't',
    meta: { name: 'T', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'v', type: 'string' }],
    bands: { reportHeader: { height: elements.length * 10 + 2, elements }, detail: { height: 0, elements: [] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const text = (i: number, value: string, style: AnyObj): AnyObj => ({
  id: `t${i}`,
  kind: 'text',
  value,
  pos: { x: 0, y: i * 10, w: 180, h: 9 },
  style,
});

const LINES = [
  'لا إله إلا الله',
  'الإدارة',
  'تقرير المبيعات الشهري',
  'مُحَمَّد رَسُولُ اللَّهِ',
  'بيت ثابت نجيب شيء',
  'الإجمالي ١٢٣٤٫٥٦',
];

async function pdfOf(family: string, bold = false): Promise<Uint8Array> {
  const s = schema(LINES.map((t, i) => text(i, t, { font: family, bold })));
  return new Uint8Array(await (await exportPdf({ schema: s, rows: [] })).arrayBuffer());
}

/** Decoded ToUnicode CMaps and BaseFont names of every Type0 font. */
async function type0Fonts(bytes: Uint8Array): Promise<{ name: string; cmap: string }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { name: string; cmap: string }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Subtype')) !== PDFName.of('Type0')) continue;
    const tu = doc.context.lookup(obj.get(PDFName.of('ToUnicode'))) as PDFRawStream;
    out.push({
      name: String(obj.get(PDFName.of('BaseFont'))).replace(/^\//, ''),
      cmap: new TextDecoder().decode(decodePDFRawStream(tu).decode()),
    });
  }
  return out;
}

/** pdf.js text items, joined per line (as Firefox's copy/search sees them). */
async function pdfjsLines(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 })
    .promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const byY = new Map<number, string[]>();
  for (const it of tc.items as { str?: string; transform: number[] }[]) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]!);
    byY.set(y, [...(byY.get(y) ?? []), it.str]);
  }
  await doc.destroy();
  return [...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, s]) => s.join(''));
}

/** Characters pdf.js invents from raw CIDs when a ToUnicode target is empty (control chars, `#`, `%`, `Z` …). */
const stray = (s: string): string[] => [...s].filter((c) => c.charCodeAt(0) < 0x20 || '#%Z'.includes(c));
const visible = (s: string): string => s.normalize('NFKC').replace(/[\u200B\u200E\u200F\u061C]/g, '').trim();
/** Letters only: pdf.js puts raised/lowered harakat on a separate baseline, so compare without them. */
const skeleton = (s: string): string => visible(s).replace(/[\u064B-\u065F\u0670\s]/g, '');

describe('BUG-23: ToUnicode never maps a CID to an empty string', () => {
  it('buildToUnicode maps text-less glyphs to U+200B and leaves only an empty .notdef unmapped', () => {
    const cmap = buildToUnicode(['', 'a', '', 'لا']);
    expect(cmap).not.toMatch(/<[0-9a-f]{4}> <>/);
    expect(cmap).toContain('<0001> <0061>');
    expect(cmap).toContain('<0002> <200b>');
    expect(cmap).toContain('<0003> <06440627>');
    const bfchar = cmap.slice(cmap.indexOf('beginbfchar'), cmap.indexOf('endbfchar'));
    expect(bfchar).not.toContain('<0000>');
    expect(cmap).toContain('3 beginbfchar');
  });

  it.each(['Noto Naskh Arabic', 'Cairo', 'Tajawal', 'Noto Sans Arabic'])('%s: no empty ToUnicode target in the PDF', async (family) => {
    for (const bold of [false, true]) {
      const fonts = await type0Fonts(await pdfOf(family, bold));
      expect(fonts.length).toBeGreaterThan(0);
      for (const f of fonts) expect(f.cmap, f.name).not.toMatch(/<[0-9a-fA-F]+>\s*<>/);
    }
  });

  it('Noto Naskh draws dots as separate glyphs: those CIDs map to U+200B', async () => {
    const [naskh] = await type0Fonts(await pdfOf('Noto Naskh Arabic'));
    expect(naskh!.name).toMatch(/\+NotoNaskhArabic-Regular$/);
    expect(naskh!.cmap).toMatch(/<[0-9a-f]{4}> <200b>/);
  });

  const HARAKAT = 'مُحَمَّد رَسُولُ اللَّهِ';
  const PLAIN = LINES.filter((l) => l !== HARAKAT);
  const pdfOfLines = async (family: string, lines: string[]) =>
    new Uint8Array(await (await exportPdf({ schema: schema(lines.map((t, i) => text(i, t, { font: family }))), rows: [] })).arrayBuffer());

  it.each(['Noto Naskh Arabic', 'Cairo'])('%s: pdf.js extracts every line as the logical text (no stray CIDs)', async (family) => {
    const lines = await pdfjsLines(await pdfOfLines(family, PLAIN));
    for (const l of lines) expect(stray(l), JSON.stringify(l)).toEqual([]);
    expect(lines.map(visible)).toEqual(PLAIN.map(visible));
  });

  it.each(['Noto Naskh Arabic', 'Cairo'])('%s: fully vocalised line extracts all letters and harakat', async (family) => {
    // pdf.js reports raised/lowered marks on their own baseline, so compare letters and the
    // multiset of marks rather than one joined string.
    const got = (await pdfjsLines(await pdfOfLines(family, [HARAKAT]))).join('');
    expect(stray(got)).toEqual([]);
    expect(skeleton(got)).toBe(skeleton(HARAKAT));
    const marks = (s: string) => [...s].filter((c) => /[\u064B-\u065F\u0670]/.test(c)).sort();
    expect(marks(got)).toEqual(marks(HARAKAT));
  });

  it('Noto Naskh text extracts identical to Cairo', async () => {
    const [naskh, cairo] = await Promise.all([
      pdfjsLines(await pdfOfLines('Noto Naskh Arabic', PLAIN)),
      pdfjsLines(await pdfOfLines('Cairo', PLAIN)),
    ]);
    expect(naskh.map(visible)).toEqual(cairo.map(visible));
  });
});

describe('BUG-22: distinct subset tags per embedded font', () => {
  const both = (family: string) =>
    schema([text(0, LINES[1]!, { font: family }), text(1, LINES[1]!, { font: family, bold: true }), text(2, LINES[1]!, {})]);

  it.each(['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Noto Sans Arabic'])('%s Regular + Bold (+ default) in one PDF', async (family) => {
    const fonts = await type0Fonts(new Uint8Array(await (await exportPdf({ schema: both(family), rows: [] })).arrayBuffer()));
    const names = fonts.map((f) => f.name);
    for (const n of names) expect(n).toMatch(/^[A-Z]{6}\+[A-Za-z0-9-]+$/);
    expect(new Set(names.map((n) => n.slice(0, 6))).size).toBe(names.length);
    expect(names.some((n) => /-Bold$/.test(n))).toBe(true);
  });

  it('tags are deterministic across exports', async () => {
    const run = async () =>
      (await type0Fonts(new Uint8Array(await (await exportPdf({ schema: both('Cairo'), rows: [] })).arrayBuffer()))).map((f) => f.name).sort();
    expect(await run()).toEqual(await run());
  });
});
