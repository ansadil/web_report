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

export class CidFontWriter {
  readonly ref: PDFRef;
  private readonly cids = new Map<string, number>();
  /** Index = CID. */
  private readonly entries: { gid: number; width: number; text: string }[] = [{ gid: 0, width: 0, text: '' }];
  private readonly scale: number;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly font: FontkitFont,
    private readonly bytes: Uint8Array,
    private readonly keep: KeepCodePoints = [],
  ) {
    this.ref = pdf.context.nextRef();
    this.scale = 1000 / font.unitsPerEm;
  }

  /** CID for glyph `gid` whose advance (1/1000 em) inside the run is `width`. */
  cid(gid: number, width: number, text: string): number {
    if (gid === 0) {
      this.entries[0] = { gid: 0, width, text: this.entries[0]!.text || text };
      return 0;
    }
    const key = `${gid}|${width}|${text}`;
    let cid = this.cids.get(key);
    if (cid === undefined) {
      cid = this.entries.length;
      if (cid > 0xffff) throw new Error('PDF font: too many distinct glyphs');
      this.entries.push({ gid, width, text });
      this.cids.set(key, cid);
    }
    return cid;
  }

  /** Write font program, descriptor, CID font and Type0 dictionaries. Call once, before save. */
  async finalize(): Promise<void> {
    const { pdf, font } = this;
    const ctx = pdf.context;

    const subset = font.createSubset();
    subset.includeGlyph(0);
    const newGid = new Map<number, number>([[0, 0]]);
    const include = (gid: number): void => {
      if (!newGid.has(gid)) newGid.set(gid, subset.includeGlyph(gid));
    };
    for (const e of this.entries) include(e.gid);
    for (const cp of this.keep) {
      const g = font.glyphForCodePoint(cp);
      if (g && g.id !== 0) include(g.id);
    }
    // Keep a cmap for every code point whose nominal glyph made it into the subset.
    const cmap = new Map<number, number>();
    for (const cp of font.characterSet) {
      if (cp > 0xffff) continue;
      const g = font.glyphForCodePoint(cp);
      const ng = g ? newGid.get(g.id) : undefined;
      if (ng !== undefined && ng !== 0) cmap.set(cp, ng);
    }
    const program = addCmapTable(await encodeSubset(subset), buildCmapFormat4(cmap));

    const tag = subsetTag(this.entries.map((e) => e.gid).join(','));
    const baseName = `${tag}+${(font.postscriptName ?? 'Font').replace(/[^A-Za-z0-9-]/g, '')}`;
    const s = this.scale;
    const r = (n: number): number => Math.round(n * s);

    const fontFile = ctx.register(ctx.flateStream(program, { Length1: program.length }));
    const descriptor = ctx.register(
      ctx.obj({
        Type: 'FontDescriptor',
        FontName: baseName,
        Flags: 4,
        FontBBox: [r(font.bbox.minX), r(font.bbox.minY), r(font.bbox.maxX), r(font.bbox.maxY)],
        ItalicAngle: font.italicAngle,
        Ascent: r(font.ascent),
        Descent: r(font.descent),
        CapHeight: r(font.capHeight || font.ascent),
        StemV: 80,
        FontFile2: fontFile,
      }),
    );

    const cidToGid = new Uint8Array(this.entries.length * 2);
    this.entries.forEach((e, cid) => {
      const g = newGid.get(e.gid) ?? 0;
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

function utf16Hex(text: string): string {
  let s = '';
  for (let i = 0; i < text.length; i++) s += text.charCodeAt(i).toString(16).padStart(4, '0');
  return s;
}

/** ToUnicode CMap (bfchar entries, ≤100 per block as the spec requires). */
export function buildToUnicode(texts: readonly string[]): string {
  const pairs: string[] = [];
  texts.forEach((t, cid) => {
    if (t) pairs.push(`<${cid.toString(16).padStart(4, '0')}> <${utf16Hex(t)}>`);
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
  tables.set('cmap', cmap);
  const tags = [...tables.keys()].sort();
  const n = tags.length;
  let size = 12 + n * 16;
  for (const t of tags) size += (tables.get(t)!.length + 3) & ~3;
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, dv.getUint32(0));
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

