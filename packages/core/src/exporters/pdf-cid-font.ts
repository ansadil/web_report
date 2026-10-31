/**
 * Minimal Type0 / CIDFontType2 writer for pre-shaped text.
 *
 * pdf-lib's own `embedFont` re-shapes every string with fontkit (`font.layout`), which is
 * exactly what reversed our Arabic. Here the shaper (HarfBuzz) has already produced glyph
 * ids and positions, so we only need a font object that draws *those* glyphs:
 *
 * - A CID is allocated per distinct (glyph id, advance, text) triple. The CID's /W width is
 *   the exact distance to the next glyph, so a whole run is one `Tj` string that lands every
 *   glyph where HarfBuzz put it (kerning, mark x-offsets included) without any re-layout.
 * - /CIDToGIDMap maps CIDs to glyphs of a subset font program (fontkit `TTFSubset`); a
 *   format-4 cmap is added back to the subset so the program stays a standalone font.
 * - /ToUnicode maps each CID to the logical characters of its cluster (lam-alef → «لا»,
 *   contextual forms → base letters) so copy/paste and search give the logical text.
 * - CID 0 is always glyph 0 (.notdef), so a missing glyph stays visible as `0000`.
 */
import type { PDFDocument, PDFRef } from 'pdf-lib';
import { PDFHexString, PDFNumber, PDFString } from 'pdf-lib';
import type { Font as FontkitFont } from '@pdf-lib/fontkit';

/** Code points always kept in the subset in addition to the drawn glyphs (e.g. Basic Latin). */
export type KeepCodePoints = readonly number[];

/** One source font of a merged PDF font. The first source is the primary (metrics, hinting). */
export interface CidFontSource {
  readonly font: FontkitFont;
  readonly keep?: KeepCodePoints;
}

/**
 * One PDF font for several source fonts (e.g. Noto Sans Arabic + Noto Sans as Latin fallback).
 *
 * The glyphs of all sources are merged into a single TrueType program, so a mixed line such
 * as «منتج ABC-123 (إصدار 2)» is a single `Tj` string. Text extractors (pdf.js, poppler) apply
 * their bidi pass per string, so splitting a line at every font change would make them reorder
 * each piece on its own and return the pieces in visual instead of logical order.
 */
export class CidFontWriter {
  readonly ref: PDFRef;
  private readonly cids = new Map<string, number>();
  /** Index = CID. */
  private readonly entries: { src: number; gid: number; width: number; text: string }[] = [
    { src: 0, gid: 0, width: 0, text: '' },
  ];

  constructor(
    private readonly pdf: PDFDocument,
    private readonly sources: readonly CidFontSource[],
  ) {
    if (sources.length === 0) throw new Error('PDF font: no source font');
    this.ref = pdf.context.nextRef();
  }

  /** CID for glyph `gid` of source `src` whose advance (1/1000 em) inside the run is `width`. */
  cid(src: number, gid: number, width: number, text: string): number {
    if (gid === 0) {
      this.entries[0] = { src: 0, gid: 0, width, text: this.entries[0]!.text || text };
      return 0;
    }
    const key = `${src}|${gid}|${width}|${text}`;
    let cid = this.cids.get(key);
    if (cid === undefined) {
      cid = this.entries.length;
      if (cid > 0xffff) throw new Error('PDF font: too many distinct glyphs');
      this.entries.push({ src, gid, width, text });
      this.cids.set(key, cid);
    }
    return cid;
  }

  /** Write font program, descriptor, CID font and Type0 dictionaries. Call once, before save. */
  async finalize(): Promise<void> {
    const { pdf, sources } = this;
    const ctx = pdf.context;
    const primary = sources[0]!.font;

    // 1. Subset every source font that is used (the primary always, for metrics/.notdef).
    const parts: ParsedTrueType[] = [];
    /** Per source: original gid → gid in the merged program. */
    const gidMaps: Map<number, number>[] = [];
    let nextGid = 0;
    for (let si = 0; si < sources.length; si++) {
      const { font, keep = [] } = sources[si]!;
      const used = this.entries.filter((e) => e.src === si && e.gid !== 0);
      const local = new Map<number, number>();
      gidMaps.push(local);
      if (si > 0 && used.length === 0) continue;
      const subset = font.createSubset();
      subset.includeGlyph(0);
      const sub = new Map<number, number>([[0, 0]]);
      const include = (gid: number): void => {
        if (!sub.has(gid)) sub.set(gid, subset.includeGlyph(gid));
      };
      for (const e of used) include(e.gid);
      for (const cp of keep) {
        const g = font.glyphForCodePoint(cp);
        if (g && g.id !== 0) include(g.id);
      }
      const parsed = parseTrueType(await encodeSubset(subset));
      // Secondary sources drop their .notdef; their glyphs follow the previous ones.
      const offset = si === 0 ? 0 : nextGid - 1;
      for (const [orig, sg] of sub) {
        if (si > 0 && sg === 0) continue;
        local.set(orig, sg + offset);
      }
      parts.push(si === 0 ? parsed : { ...parsed, glyphs: parsed.glyphs.slice(1), metrics: parsed.metrics.slice(1), gidOffset: offset });
      nextGid += si === 0 ? parsed.glyphs.length : parsed.glyphs.length - 1;
    }

    // 2. cmap: every code point whose nominal glyph made it into the merged program.
    const cmap = new Map<number, number>();
    sources.forEach(({ font }, si) => {
      for (const cp of font.characterSet) {
        if (cp > 0xffff || cmap.has(cp)) continue;
        const g = font.glyphForCodePoint(cp);
        const ng = g ? gidMaps[si]!.get(g.id) : undefined;
        if (ng !== undefined && ng !== 0) cmap.set(cp, ng);
      }
    });
    const program = mergeTrueType(parts, buildCmapFormat4(cmap));

    const tag = uniqueSubsetTag(pdf, [
      ...sources.map(({ font }) => `${font.postscriptName ?? ''}/${font.numGlyphs}/${font.unitsPerEm}`),
      ...this.entries.map((e) => `${e.src}:${e.gid}`),
    ].join(','));
    const baseName = `${tag}+${(primary.postscriptName ?? 'Font').replace(/[^A-Za-z0-9-]/g, '')}`;
    const s = 1000 / primary.unitsPerEm;
    const r = (n: number): number => Math.round(n * s);

    const fontFile = ctx.register(ctx.flateStream(program, { Length1: program.length }));
    const descriptor = ctx.register(
      ctx.obj({
        Type: 'FontDescriptor',
        FontName: baseName,
        Flags: 4,
        FontBBox: [r(primary.bbox.minX), r(primary.bbox.minY), r(primary.bbox.maxX), r(primary.bbox.maxY)],
        ItalicAngle: primary.italicAngle,
        Ascent: r(primary.ascent),
        Descent: r(primary.descent),
        CapHeight: r(primary.capHeight || primary.ascent),
        StemV: 80,
        FontFile2: fontFile,
      }),
    );

    const cidToGid = new Uint8Array(this.entries.length * 2);
    this.entries.forEach((e, cid) => {
      const g = gidMaps[e.src]?.get(e.gid) ?? 0;
      cidToGid[cid * 2] = g >> 8;
      cidToGid[cid * 2 + 1] = g & 0xff;
    });
    const cidToGidRef = ctx.register(ctx.flateStream(cidToGid));

    const widths = ctx.obj([]);
    for (let cid = 0; cid < this.entries.length; ) {
      const run: number[] = [];
      const start = cid;
      while (cid < this.entries.length && run.length < 500) run.push(this.entries[cid++]!.width);
      widths.push(PDFNumber.of(start));
      widths.push(ctx.obj(run));
    }

    const cidFont = ctx.register(
      ctx.obj({
        Type: 'Font',
        Subtype: 'CIDFontType2',
        BaseFont: baseName,
        CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
        FontDescriptor: descriptor,
        DW: 0,
        W: widths,
        CIDToGIDMap: cidToGidRef,
      }),
    );
    const toUnicode = ctx.register(ctx.flateStream(buildToUnicode(this.entries.map((e) => e.text))));
    ctx.assign(
      this.ref,
      ctx.obj({
        Type: 'Font',
        Subtype: 'Type0',
        BaseFont: baseName,
        Encoding: 'Identity-H',
        DescendantFonts: [cidFont],
        ToUnicode: toUnicode,
      }),
    );
  }
}

/** Hex string operand for a sequence of CIDs (Identity-H: two bytes each). */
export function cidHex(cids: readonly number[]): PDFHexString {
  return PDFHexString.of(cids.map((c) => c.toString(16).padStart(4, '0')).join(''));
}

interface SubsetLike {
  encodeStream(): { on(ev: 'data', cb: (chunk: Uint8Array) => void): void; on(ev: 'end', cb: () => void): void };
}

function encodeSubset(subset: unknown): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Uint8Array[] = [];
      const stream = (subset as SubsetLike).encodeStream();
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let o = 0;
        for (const c of chunks) {
          out.set(c, o);
          o += c.length;
        }
        resolve(out);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/** Subset tags already used per document: ISO 32000-1 §9.6.4 wants a distinct tag per subset. */
const usedTags = new WeakMap<PDFDocument, Set<string>>();

/**
 * Subset tag (`ABCDEF`) for one embedded subset, unique within `pdf` (BUG-22). The seed holds
 * the source fonts' identity (PostScript name, glyph count, units/em) and the used glyphs, so
 * e.g. Cairo-Regular and Cairo-Bold drawing the same glyph ids no longer share a tag; a
 * remaining collision in the same document is re-hashed.
 */
function uniqueSubsetTag(pdf: PDFDocument, seed: string): string {
  let used = usedTags.get(pdf);
  if (!used) usedTags.set(pdf, (used = new Set()));
  let tag = subsetTag(seed);
  for (let n = 1; used.has(tag); n++) tag = subsetTag(`${seed}#${n}`);
  used.add(tag);
  return tag;
}

function subsetTag(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  let tag = '';
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (h % 26));
    h = Math.floor(h / 26) + i * 7919;
  }
  return tag;
}

const ZWSP = '\u200B';

function utf16Hex(text: string): string {
  let s = '';
  for (let i = 0; i < text.length; i++) s += text.charCodeAt(i).toString(16).padStart(4, '0');
  return s;
}

/** ToUnicode CMap (bfchar entries, ≤100 per block as the spec requires). */
export function buildToUnicode(texts: readonly string[]): string {
  const pairs: string[] = [];
  texts.forEach((t, cid) => {
    // Never an empty target (BUG-23): pdf.js treats `<cid> <>` as "no mapping" and falls back
    // to the CID as a character code. Glyphs without characters of their own (surplus glyphs
    // of a decomposed cluster) map to U+200B ZERO WIDTH SPACE instead. CID 0 (.notdef) without
    // text is left unmapped.
    if (cid === 0 && !t) return;
    pairs.push(`<${cid.toString(16).padStart(4, '0')}> <${utf16Hex(t || ZWSP)}>`);
  });
  const blocks: string[] = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100);
    blocks.push(`${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <ffff>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

/** A `cmap` table (one Windows Unicode BMP format-4 subtable). */
export function buildCmapFormat4(map: ReadonlyMap<number, number>): Uint8Array {
  const cps = [...map.keys()].filter((c) => c < 0xffff).sort((a, b) => a - b);
  // Segments of consecutive code points with consecutive glyph ids share one idDelta.
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const cp of cps) {
    const delta = (map.get(cp)! - cp) & 0xffff;
    const last = segs[segs.length - 1];
    if (last && last.end === cp - 1 && last.delta === delta) last.end = cp;
    else segs.push({ start: cp, end: cp, delta });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const subLen = 16 + n * 8;
  const buf = new DataView(new ArrayBuffer(12 + subLen));
  buf.setUint16(0, 0); // version
  buf.setUint16(2, 1); // numTables
  buf.setUint16(4, 3); // platform: Windows
  buf.setUint16(6, 1); // encoding: Unicode BMP
  buf.setUint32(8, 12);
  const o = 12;
  let p = 1;
  let e = 0;
  while (p * 2 <= n) {
    p *= 2;
    e++;
  }
  buf.setUint16(o, 4);
  buf.setUint16(o + 2, subLen);
  buf.setUint16(o + 4, 0);
  buf.setUint16(o + 6, n * 2);
  buf.setUint16(o + 8, p * 2);
  buf.setUint16(o + 10, e);
  buf.setUint16(o + 12, n * 2 - p * 2);
  const endO = o + 14;
  const startO = endO + n * 2 + 2;
  const deltaO = startO + n * 2;
  const rangeO = deltaO + n * 2;
  segs.forEach((s, i) => {
    buf.setUint16(endO + i * 2, s.end);
    buf.setUint16(startO + i * 2, s.start);
    buf.setUint16(deltaO + i * 2, s.delta);
    buf.setUint16(rangeO + i * 2, 0);
  });
  return new Uint8Array(buf.buffer);
}

function checksum(data: Uint8Array): number {
  const padded = new Uint8Array((data.length + 3) & ~3);
  padded.set(data);
  const v = new DataView(padded.buffer);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return sum;
}

/** Return a copy of an sfnt font with `cmap` added (or replaced). */
export function addCmapTable(font: Uint8Array, cmap: Uint8Array): Uint8Array {
  const tables = readTables(font);
  tables.set('cmap', cmap);
  return writeSfnt(tables);
}

/* ------------------------------------------------------------------------------------------ */
/* TrueType merging                                                                             */
/* ------------------------------------------------------------------------------------------ */

interface ParsedTrueType {
  readonly tables: ReadonlyMap<string, Uint8Array>;
  /** Raw `glyf` data per glyph (may be empty). */
  readonly glyphs: readonly Uint8Array[];
  /** [advanceWidth, leftSideBearing] per glyph. */
  readonly metrics: readonly (readonly [number, number])[];
  /** Added to component glyph ids of composite glyphs when merging. */
  readonly gidOffset?: number;
}

function readTables(font: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const numTables = dv.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(font[rec]!, font[rec + 1]!, font[rec + 2]!, font[rec + 3]!);
    const off = dv.getUint32(rec + 8);
    const len = dv.getUint32(rec + 12);
    tables.set(tag, font.subarray(off, off + len));
  }
  return tables;
}

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Parse the glyph outlines and horizontal metrics of a TrueType (glyf-based) font. */
export function parseTrueType(font: Uint8Array): ParsedTrueType {
  const tables = readTables(font);
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const loca = tables.get('loca');
  const glyf = tables.get('glyf');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  if (!head || !maxp || !loca || !glyf || !hhea || !hmtx) throw new Error('PDF font: not a TrueType font');
  const numGlyphs = view(maxp).getUint16(4);
  const longLoca = view(head).getInt16(50) === 1;
  const lv = view(loca);
  const off = (i: number): number => (longLoca ? lv.getUint32(i * 4) : lv.getUint16(i * 2) * 2);
  const glyphs: Uint8Array[] = [];
  for (let i = 0; i < numGlyphs; i++) glyphs.push(glyf.subarray(off(i), off(i + 1)));
  const numH = view(hhea).getUint16(34);
  const hv = view(hmtx);
  const metrics: [number, number][] = [];
  let lastAdvance = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numH) {
      lastAdvance = hv.getUint16(i * 4);
      metrics.push([lastAdvance, hv.getInt16(i * 4 + 2)]);
    } else {
      metrics.push([lastAdvance, hv.getInt16(numH * 4 + (i - numH) * 2)]);
    }
  }
  return { tables, glyphs, metrics };
}

/** Copy of a composite glyph with every component glyph id shifted by `offset`. */
function shiftComposite(glyph: Uint8Array, offset: number): Uint8Array {
  if (offset === 0 || glyph.length < 10 || view(glyph).getInt16(0) >= 0) return glyph;
  const out = glyph.slice();
  const dv = view(out);
  let p = 10;
  for (;;) {
    const flags = dv.getUint16(p);
    dv.setUint16(p + 2, dv.getUint16(p + 2) + offset);
    p += 4 + (flags & 0x0001 ? 4 : 2);
    if (flags & 0x0008) p += 2;
    else if (flags & 0x0040) p += 4;
    else if (flags & 0x0080) p += 8;
    if (!(flags & 0x0020)) break;
  }
  return out;
}

/**
 * Concatenate the glyphs of several TrueType fonts into one program. Global tables (head,
 * hhea, hinting programs) come from the first font; glyphs of the others must not depend on
 * those programs (the Latin fallback is shipped unhinted).
 */
export function mergeTrueType(parts: readonly ParsedTrueType[], cmap: Uint8Array): Uint8Array {
  const first = parts[0]!;
  const glyphs: Uint8Array[] = [];
  const metrics: (readonly [number, number])[] = [];
  for (const p of parts) {
    for (const g of p.glyphs) glyphs.push(shiftComposite(g, p.gidOffset ?? 0));
    metrics.push(...p.metrics);
  }
  const n = glyphs.length;
  if (n > 0xffff) throw new Error('PDF font: too many glyphs');

  let glyfLen = 0;
  for (const g of glyphs) glyfLen += (g.length + 3) & ~3;
  const glyf = new Uint8Array(glyfLen);
  const loca = new Uint8Array((n + 1) * 4);
  const locaV = view(loca);
  let o = 0;
  glyphs.forEach((g, i) => {
    locaV.setUint32(i * 4, o);
    glyf.set(g, o);
    o += (g.length + 3) & ~3;
  });
  locaV.setUint32(n * 4, o);

  const hmtx = new Uint8Array(n * 4);
  const hmtxV = view(hmtx);
  let maxAdvance = 0;
  metrics.forEach(([adv, lsb], i) => {
    hmtxV.setUint16(i * 4, adv);
    hmtxV.setInt16(i * 4 + 2, lsb);
    if (adv > maxAdvance) maxAdvance = adv;
  });

  const head = first.tables.get('head')!.slice();
  view(head).setUint32(8, 0); // checkSumAdjustment: recomputed by nobody, 0 is accepted
  view(head).setInt16(50, 1); // long loca
  const hhea = first.tables.get('hhea')!.slice();
  view(hhea).setUint16(10, maxAdvance);
  view(hhea).setUint16(34, n);
  // maxp: field-wise maximum of the profile values, so every glyph's needs are covered.
  const maxp = first.tables.get('maxp')!.slice();
  const mv = view(maxp);
  mv.setUint16(4, n);
  if (maxp.length >= 32) {
    for (const p of parts.slice(1)) {
      const other = p.tables.get('maxp');
      if (!other || other.length < 32) continue;
      const ov = view(other);
      for (let f = 6; f < 32; f += 2) mv.setUint16(f, Math.max(mv.getUint16(f), ov.getUint16(f)));
    }
  }

  const tables = new Map<string, Uint8Array>();
  for (const [tag, data] of first.tables) {
    if (['cvt ', 'fpgm', 'prep', 'name', 'OS/2', 'post'].includes(tag)) tables.set(tag, data);
  }
  tables.set('head', head);
  tables.set('hhea', hhea);
  tables.set('maxp', maxp);
  tables.set('loca', loca);
  tables.set('glyf', glyf);
  tables.set('hmtx', hmtx);
  tables.set('cmap', cmap);
  return writeSfnt(tables);
}

function writeSfnt(tables: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let size = 12 + n * 16;
  for (const t of tags) size += (tables.get(t)!.length + 3) & ~3;
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, 0x00010000);
  let p = 1;
  let e = 0;
  while (p * 2 <= n) {
    p *= 2;
    e++;
  }
  ov.setUint16(4, n);
  ov.setUint16(6, p * 16);
  ov.setUint16(8, e);
  ov.setUint16(10, n * 16 - p * 16);
  let off = 12 + n * 16;
  tags.forEach((t, i) => {
    const data = tables.get(t)!;
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[rec + k] = t.charCodeAt(k);
    ov.setUint32(rec + 4, checksum(data));
    ov.setUint32(rec + 8, off);
    ov.setUint32(rec + 12, data.length);
    out.set(data, off);
    off += (data.length + 3) & ~3;
  });
  return out;
}
