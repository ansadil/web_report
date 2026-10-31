// @vitest-environment node
/**
 * BUG-25: text extractors keep the whole line. /W widths follow what extractors advance over:
 * glyphs mapped to format characters (U+200B dots of decomposed clusters) or non-spacing
 * marks get a width <= 0 that pdf.js ignores (negative for poppler's reading order, BUG-26),
 * every other glyph a width >= 0; `Td` keeps every glyph where HarfBuzz placed it. Before,
 * pdf.js skipped the (mostly negative) widths of Noto Naskh's dot glyphs, its pen drifted to
 * the right and it dropped the glyphs past the page edge: the first words of long RTL lines.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { exportPdf } from './pdf.js';
import { advancelessForExtractors } from './pdf-cid-font.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

const LINES = {
  dotted: 'بيت ثابت جنة خشب شجن نية يثبت تخت بيت ثابت جنة خشب شجن نية',
  dotted2: 'تثبيت الشجن في بيت ثابت ينتج نتيجة ثابتة بين جنة وخشب',
  latin: 'The quick brown fox jumps over the lazy dog 0123456789 again',
  mixedRtl: 'تقرير المبيعات ABC-123 بتاريخ 2026 ثابت شجن (إصدار 2) نية',
  mixedLtr: 'Invoice #42 for بيت ثابت paid on 2026-10-31 by شجن نية',
  zw: 'بب ب\u200Cب ع\u200D ـ ثابت\u200Fجنة \u200Eخشب يثبت تخت',
  tashkeel: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ مُحَمَّدٌ يَكْتُبُ',
} as const;
type LineId = keyof typeof LINES;
const IDS = Object.keys(LINES) as LineId[];
const FACES: [string | undefined, boolean][] = [
  ['Noto Naskh Arabic', false],
  ['Noto Naskh Arabic', true],
  ['Cairo', false],
  ['Cairo', true],
  ['Tajawal', false],
  ['Tajawal', true],
  [undefined, false],
  [undefined, true],
];
const ROW_MM = 12;
const ROW = (ROW_MM * 72) / 25.4;

function schema(family: string | undefined, bold: boolean, dir: 'rtl' | 'ltr'): ReportSchemaV1 {
  const elements = IDS.map((id, i) => ({
    id,
    kind: 'text',
    value: LINES[id],
    style: { fontSize: 16, bold, ...(family ? { font: family } : {}) },
    pos: { x: 0, y: i * ROW_MM, w: 186, h: 11 },
  }));
  const r = validateReport({
    version: '1',
    id: 'b25',
    meta: { name: 'b25', locale: dir === 'rtl' ? 'ar' : 'en', dir },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 'x' },
    fields: [],
    bands: { reportHeader: { height: IDS.length * ROW_MM, elements }, detail: { height: 0, elements: [] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const cache = new Map<string, Promise<Uint8Array>>();
const pdfOf = (family: string | undefined, bold: boolean, dir: 'rtl' | 'ltr'): Promise<Uint8Array> => {
  const key = `${family}|${bold}|${dir}`;
  if (!cache.has(key)) {
    cache.set(key, exportPdf({ schema: schema(family, bold, dir), rows: [] }).then(async (b) => new Uint8Array(await b.arrayBuffer())));
  }
  return cache.get(key)!;
};

const N = (s: string): string => s.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();
const bag = (s: string): string => [...N(s)].filter((c) => !/\s/.test(c)).sort().join('');

/** pdf.js text of each report row (items sorted in reading order, as a viewer's copy sees them). */
async function pdfjsRows(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false, verbosity: 0 })
    .promise;
  const page = await doc.getPage(1);
  const top = page.view[3]!;
  const items = ((await page.getTextContent()).items as { str?: string; dir?: string; transform: number[] }[]).filter((i) => i.str?.trim());
  await doc.destroy();
  const b0 = Math.min(...items.filter((i) => i.str!.length >= 3).map((i) => top - i.transform[5]!));
  const rows: (typeof items)[] = [];
  for (const it of items) (rows[Math.round((top - it.transform[5]! - b0) / ROW)] ??= []).push(it);
  return rows.map((its) => {
    const rtl = its.filter((i) => i.dir === 'rtl').length > its.length / 2;
    return N(its.sort((a, b) => (rtl ? b.transform[4]! - a.transform[4]! : a.transform[4]! - b.transform[4]!)).map((i) => i.str).join(' '));
  });
}

/** Every CIDFont's widths (cid → width) and ToUnicode text (cid → string). */
async function cidFonts(bytes: Uint8Array): Promise<{ widths: Map<number, number>; text: Map<number, string> }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { widths: Map<number, number>; text: Map<number, string> }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Subtype')) !== PDFName.of('Type0')) continue;
    const desc = doc.context.lookup((obj.get(PDFName.of('DescendantFonts')) as PDFArray).get(0)) as PDFDict;
    const w = doc.context.lookup(desc.get(PDFName.of('W'))) as PDFArray;
    const widths = new Map<number, number>();
    const num = (o: unknown): number => (o as PDFNumber).asNumber();
    for (let i = 0; i < w.size(); ) {
      const first = num(w.get(i));
      const next = w.get(i + 1);
      if (next instanceof PDFArray) {
        for (let k = 0; k < next.size(); k++) widths.set(first + k, num(next.get(k)));
        i += 2;
      } else {
        for (let c = first; c <= num(next); c++) widths.set(c, num(w.get(i + 2)));
        i += 3;
      }
    }
    const tu = doc.context.lookup(obj.get(PDFName.of('ToUnicode'))) as PDFRawStream;
    const cmap = new TextDecoder().decode(decodePDFRawStream(tu).decode());
    const text = new Map<number, string>();
    const hex = (h: string): string => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map((u) => parseInt(u, 16)));
    for (const sec of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const m of sec[1]!.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]*)>/g)) text.set(parseInt(m[1]!, 16), hex(m[2]!));
    }
    for (const sec of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const m of sec[1]!.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4})>/g)) {
        const lo = parseInt(m[1]!, 16);
        for (let c = lo; c <= parseInt(m[2]!, 16); c++) text.set(c, String.fromCharCode(parseInt(m[3]!, 16) + c - lo));
      }
    }
    out.push({ widths, text });
  }
  return out;
}

const HAS_PDFTOTEXT = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const tmp = mkdtempSync(join(tmpdir(), 'wr-fonts-b25-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const label = (f: string | undefined, b: boolean): string => `${f ?? 'default'} ${b ? 'Bold' : 'Regular'}`;

describe('BUG-25: advanceless glyphs for extractors', () => {
  it('format characters and non-spacing marks are advanceless; letters, digits and spaces are not', () => {
    for (const t of ['\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\u064E', '\u0651', '\u0670', 'هَّلل']) expect(advancelessForExtractors(t), t).toBe(true);
    for (const t of ['ب', 'a', '1', '٣', ' ', 'لا', '', 'ـ']) expect(advancelessForExtractors(t), JSON.stringify(t)).toBe(t === '');
  });
});

describe.each(FACES.map(([f, b]) => [label(f, b), f, b] as const))('BUG-25 %s: text extractors keep long lines', (_name, family, bold) => {
  it.each(['rtl', 'ltr'] as const)('%s: only U+200B / mark CIDs have a negative width; most of them do', async (dir) => {
    const fonts = await cidFonts(await pdfOf(family, bold, dir));
    expect(fonts.length).toBeGreaterThan(0);
    let advanceless = 0;
    let negative = 0;
    for (const { widths, text } of fonts) {
      for (const [cid, w] of widths) {
        const t = text.get(cid);
        if (cid !== 0 && t !== undefined && advancelessForExtractors(t)) {
          advanceless++;
          if (w < 0) negative++;
          expect(w, `${label(family, bold)} cid ${cid} ${JSON.stringify(t)}`).toBeLessThanOrEqual(0);
        } else expect(w, `${label(family, bold)} cid ${cid}`).toBeGreaterThanOrEqual(0);
      }
    }
    expect(advanceless).toBeGreaterThan(0); // the tashkeel line has marks in every face
    expect(negative).toBeGreaterThan(0);
  });

  it.each(['rtl', 'ltr'] as const)('%s: pdf.js extracts every line with exactly the source characters', async (dir) => {
    const rows = await pdfjsRows(await pdfOf(family, bold, dir));
    expect(rows.map(bag)).toEqual(IDS.map((id) => bag(LINES[id])));
  });

  it.each(['rtl', 'ltr'] as const)('%s: pdf.js extracts the dotted, Latin and same-direction lines word for word', async (dir) => {
    const rows = await pdfjsRows(await pdfOf(family, bold, dir));
    const exact: LineId[] = ['dotted', 'dotted2', 'latin', ...(dir === 'rtl' ? (['mixedRtl', 'zw'] as const) : (['mixedLtr'] as const))];
    for (const id of exact) expect(rows[IDS.indexOf(id)], id).toBe(N(LINES[id]));
  });

  it.skipIf(!HAS_PDFTOTEXT).each(['rtl', 'ltr'] as const)('%s: poppler pdftotext -raw extracts exactly the source characters', async (dir) => {
    const f = join(tmp, `${label(family, bold).replace(/\s+/g, '-')}-${dir}.pdf`);
    writeFileSync(f, await pdfOf(family, bold, dir));
    const out = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8' });
    expect(bag(out)).toBe(bag(IDS.map((id) => LINES[id]).join('')));
  });
});
