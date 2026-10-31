/**
 * PDF text-correctness helpers for the QA acceptance suite.
 *
 * - extractPdfText(): uses pdfjs-dist (Node legacy build) and returns text items with
 *   position + a per-line reconstruction. pdf.js applies its own bidi pass, so a
 *   correctly drawn RTL PDF (glyphs in visual order) extracts in LOGICAL order.
 * - norm(): NFKC (folds Arabic Presentation Forms back to base letters, canonical
 *   mark order for tashkeel) + strips bidi controls + collapses whitespace.
 * - findNotdefGlyphs(): scans every page content stream for Identity-H glyph id 0000
 *   (.notdef) inside Tj/TJ strings — i.e. characters the embedded font cannot draw.
 * - embeddedFontsCoverage(): parses embedded FontFile2 programs with fontkit and
 *   reports whether at least one embedded font has a glyph for each code point.
 */
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, PDFRef, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface PdfTextItem {
  readonly page: number;
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly dir: string;
  /** font size in user units (from text matrix) */
  readonly size: number;
}

export interface PdfText {
  readonly numPages: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly items: PdfTextItem[];
  /** Items grouped by (page, rounded y), sorted visually; each line string normalised. */
  readonly lines: { page: number; y: number; text: string; items: PdfTextItem[] }[];
}

const BIDI_CONTROLS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g;

export function norm(s: string): string {
  return s.normalize('NFKC').replace(BIDI_CONTROLS, '').replace(/\s+/g, ' ').trim();
}

export async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  const items: PdfTextItem[] = [];
  let pageWidth = 0;
  let pageHeight = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pageWidth = vp.width;
    pageHeight = vp.height;
    const tc = await page.getTextContent();
    for (const it of tc.items as Array<{ str?: string; transform: number[]; width: number; dir: string }>) {
      if (typeof it.str !== 'string' || it.str.trim() === '') continue;
      items.push({ page: p, str: it.str, x: it.transform[4]!, y: it.transform[5]!, width: it.width, dir: it.dir, size: Math.hypot(it.transform[0]!, it.transform[1]!) });
    }
  }
  const byLine = new Map<string, PdfTextItem[]>();
  for (const it of items) {
    const key = `${it.page}|${Math.round(it.y)}`;
    const arr = byLine.get(key) ?? [];
    arr.push(it);
    byLine.set(key, arr);
  }
  const lines = [...byLine.entries()].map(([k, its]) => {
    const [page, y] = k.split('|').map(Number) as [number, number];
    // Line reconstruction: RTL lines read right-to-left, otherwise left-to-right.
    const rtl = its.filter((i) => i.dir === 'rtl').length > its.length / 2;
    const sorted = [...its].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    return { page, y, items: sorted, text: norm(sorted.map((i) => i.str).join(' ')) };
  });
  lines.sort((a, b) => a.page - b.page || b.y - a.y);
  await doc.destroy();
  return { numPages: doc.numPages, pageWidth, pageHeight, items, lines };
}

/** True when some single text item (one drawn run) or some reconstructed line contains `expected` (both normalised). */
export function containsLogical(t: PdfText, expected: string): boolean {
  const e = norm(expected);
  return t.items.some((i) => norm(i.str).includes(e)) || t.lines.some((l) => l.text.includes(e));
}

/** Short diagnostic: the normalised items that look closest to the expected string (shared chars). */
export function closest(t: PdfText, expected: string, n = 3): string[] {
  const e = new Set(norm(expected));
  return [...new Set(t.items.map((i) => norm(i.str)))]
    .map((s) => ({ s, score: [...s].filter((c) => e.has(c)).length / Math.max(s.length, e.size) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.s);
}

function resolve<T>(doc: PDFDocument, o: unknown): T {
  return (o instanceof PDFRef ? doc.context.lookup(o) : o) as T;
}

function pageContentBytes(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = resolve<PDFRawStream | PDFArray>(doc, page.node.get(PDFName.of('Contents')));
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) streams.push(resolve<PDFRawStream>(doc, contents.get(i)));
  } else if (contents) streams.push(contents);
  return streams.map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString('latin1')).join('\n');
}

/** Returns count of .notdef (GID 0) glyphs drawn via Identity-H hex strings, per page. */
export async function findNotdefGlyphs(bytes: Uint8Array): Promise<{ page: number; count: number }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { page: number; count: number }[] = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const content = pageContentBytes(doc, i);
    let count = 0;
    for (const m of content.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      const hex = m[1]!.replace(/\s+/g, '');
      if (hex.length % 4 !== 0) continue; // not a 2-byte CID string
      for (let k = 0; k < hex.length; k += 4) if (hex.slice(k, k + 4) === '0000') count++;
    }
    if (count > 0) out.push({ page: i + 1, count });
  }
  return out;
}

/** Collect every embedded TrueType/OpenType program in the PDF and check code-point coverage. */
export async function embeddedFontsCoverage(bytes: Uint8Array, codePoints: number[]): Promise<{ missing: number[]; fonts: string[] }> {
  const doc = await PDFDocument.load(bytes);
  const programs: { name: string; font: { hasGlyphForCodePoint(cp: number): boolean } }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj instanceof PDFRawStream) continue;
    if (obj.get(PDFName.of('Type'))?.toString() !== '/FontDescriptor') continue;
    const ff = resolve<PDFRawStream | undefined>(doc, obj.get(PDFName.of('FontFile2')) ?? obj.get(PDFName.of('FontFile3')));
    if (!ff) continue;
    const data = Buffer.from(decodePDFRawStream(ff).decode());
    try {
      const f = fontkit.create(data) as unknown as { hasGlyphForCodePoint(cp: number): boolean };
      programs.push({ name: obj.get(PDFName.of('FontName'))?.toString() ?? '?', font: f });
    } catch {
      /* subsetted programs without cmap: treated as not covering */
    }
  }
  const missing = codePoints.filter((cp) => !programs.some((p) => p.font.hasGlyphForCodePoint(cp)));
  return { missing, fonts: programs.map((p) => p.name) };
}

export async function pdfHasImageXObject(bytes: Uint8Array): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') return true;
  }
  return false;
}

export async function embeddedFontSummary(bytes: Uint8Array): Promise<{ name: string; programBytes: number }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { name: string; programBytes: number }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj instanceof PDFRawStream) continue;
    if (obj.get(PDFName.of('Type'))?.toString() !== '/FontDescriptor') continue;
    const ff = resolve<PDFRawStream | undefined>(doc, obj.get(PDFName.of('FontFile2')));
    out.push({ name: obj.get(PDFName.of('FontName'))?.toString() ?? '?', programBytes: ff ? decodePDFRawStream(ff).decode().byteLength : 0 });
  }
  return out;
}

/**
 * Visual-order check independent of any extractor's bidi heuristics: decodes every
 * `<hex> Tj` in the content streams, maps glyph ids back to code points with the
 * embedded font program (fontkit), and returns the runs in DRAWING order
 * (left-to-right on the page), NFKC-normalised.
 */
export async function drawnRuns(bytes: Uint8Array): Promise<{ page: number; text: string }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { page: number; text: string }[] = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const page = doc.getPage(i);
    const res = resolve<PDFDict>(doc, page.node.get(PDFName.of('Resources')));
    const fontDict = res ? resolve<PDFDict | undefined>(doc, res.get(PDFName.of('Font'))) : undefined;
    const fonts = new Map<string, Map<number, string> | null>();
    if (fontDict) {
      for (const [k, v] of fontDict.entries()) {
        const f = resolve<PDFDict>(doc, v);
        const tu = resolve<PDFRawStream | undefined>(doc, f.get(PDFName.of('ToUnicode')));
        fonts.set(k.toString(), tu ? parseToUnicode(new TextDecoder('latin1').decode(decodePDFRawStream(tu).decode())) : null);
      }
    }
    const content = pageContentBytes(doc, i);
    let current: string | null = null;
    for (const m of content.matchAll(/(\/[^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
      if (m[1]) { current = m[1]; continue; }
      const f = current ? fonts.get(current) : null;
      const hex = (m[2] ?? '').replace(/\s+/g, '');
      if (!f || hex.length % 4 !== 0) continue;
      let s = '';
      for (let k = 0; k < hex.length; k += 4) {
        const gid = parseInt(hex.slice(k, k + 4), 16);
        s += gid === 0 ? '\uFFFD' : (f.get(gid) ?? '\uFFFD');
      }
      out.push({ page: i + 1, text: s.normalize('NFKC') });
    }
  }
  return out;
}

function utf16hex(h: string): string {
  const units: number[] = [];
  for (let i = 0; i < h.length; i += 4) units.push(parseInt(h.slice(i, i + 4), 16));
  return String.fromCharCode(...units);
}
function parseToUnicode(cmap: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const blk of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const e of blk[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) m.set(parseInt(e[1]!, 16), utf16hex(e[2]!));
  for (const blk of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const e of blk[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/g)) {
      const lo = parseInt(e[1]!, 16), hi = parseInt(e[2]!, 16);
      if (e[3]!.startsWith('[')) {
        [...e[3]!.matchAll(/<([0-9A-Fa-f]+)>/g)].forEach((x, j) => m.set(lo + j, utf16hex(x[1]!)));
      } else {
        const base = utf16hex(e[3]!.slice(1, -1));
        for (let g = lo; g <= hi; g++) m.set(g, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (g - lo)));
      }
    }
  }
  return m;
}
