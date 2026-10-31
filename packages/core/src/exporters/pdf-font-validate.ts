/**
 * Up-front structural validation of a TrueType font file (BUG-24).
 *
 * fontkit and HarfBuzz parse tables lazily and trust the table directory, so a truncated or
 * corrupt file used to pass the old magic check and then throw later — partly from inside a
 * `nextTick` callback (fontkit's subset `encodeStream()`), outside any promise, which crashed
 * the process and left the export pending forever. Everything the PDF writer later reads is
 * checked here instead, so a bad file is rejected before it is used:
 *
 * - sfnt header and a table directory that fits in the file;
 * - every table's offset + length within the file;
 * - the tables the shaper and the CID writer need: `head`, `hhea`, `hmtx`, `maxp`, `cmap`,
 *   `loca` and `glyf` (CFF-flavoured OpenType, `OTTO`, is rejected: the merged CID font
 *   program is written as glyf-based TrueType);
 * - `head`/`hhea`/`maxp` fields in range, `hmtx` long enough for every glyph, `loca` with
 *   numGlyphs + 1 non-decreasing offsets inside `glyf`, every outline's header inside its
 *   slot and composite components pointing at existing glyphs;
 * - `cmap` subtable records inside the table.
 */

/** Thrown for a font file that fails {@link validateTrueType}. */
export class InvalidFontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFontError';
  }
}

const REQUIRED = ['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'loca', 'glyf'] as const;

const tagOf = (b: Uint8Array, o: number): string => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

/** Throws {@link InvalidFontError} unless `bytes` is a structurally sound glyf-based TrueType font. */
export function validateTrueType(bytes: Uint8Array): void {
  const fail = (why: string): never => {
    throw new InvalidFontError(why);
  };
  const size = bytes.byteLength;
  if (size < 12) fail(`file too short (${size} bytes)`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  const magic = dv.getUint32(0);
  if (magic === 0x4f54544f) fail('CFF-based OpenType (OTTO) fonts are not supported; use a TrueType (glyf) font');
  if (magic !== 0x00010000 && magic !== 0x74727565) fail('not a TrueType font (bad sfnt version)');
  const numTables = dv.getUint16(4);
  if (numTables === 0) fail('empty table directory');
  if (12 + numTables * 16 > size) fail(`table directory (${numTables} tables) exceeds the file length (${size} bytes)`);

  const tables = new Map<string, { off: number; len: number }>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = tagOf(bytes, rec);
    const off = dv.getUint32(rec + 8);
    const len = dv.getUint32(rec + 12);
    if (off + len > size) fail(`table '${tag}' (offset ${off}, length ${len}) exceeds the file length (${size} bytes)`);
    if (!tables.has(tag)) tables.set(tag, { off, len });
  }
  for (const tag of REQUIRED) if (!tables.has(tag)) fail(`required table '${tag}' is missing`);
  const table = (tag: string, min: number): { off: number; len: number } => {
    const t = tables.get(tag)!;
    if (t.len < min) fail(`table '${tag}' is too short (${t.len} bytes)`);
    return t;
  };

  const head = table('head', 54);
  if (dv.getUint32(head.off + 12) !== 0x5f0f3cf5) fail("bad 'head' magic number");
  const upem = dv.getUint16(head.off + 18);
  if (upem < 16 || upem > 16384) fail(`unitsPerEm out of range (${upem})`);
  const locFormat = dv.getInt16(head.off + 50);
  if (locFormat !== 0 && locFormat !== 1) fail(`bad indexToLocFormat (${locFormat})`);

  const maxp = table('maxp', 6);
  const numGlyphs = dv.getUint16(maxp.off + 4);
  if (numGlyphs === 0) fail('font has no glyphs');

  const hhea = table('hhea', 36);
  const numH = dv.getUint16(hhea.off + 34);
  if (numH === 0 || numH > numGlyphs) fail(`numberOfHMetrics out of range (${numH})`);
  table('hmtx', numH * 4 + (numGlyphs - numH) * 2);

  const glyf = table('glyf', 0);
  const loca = table('loca', (numGlyphs + 1) * (locFormat === 1 ? 4 : 2));
  const locaAt = (i: number): number =>
    locFormat === 1 ? dv.getUint32(loca.off + i * 4) : dv.getUint16(loca.off + i * 2) * 2;
  let prev = locaAt(0);
  for (let g = 0; g < numGlyphs; g++) {
    const next = locaAt(g + 1);
    if (next < prev || next > glyf.len) fail(`'loca' entry ${g + 1} (${next}) is outside 'glyf' (${glyf.len} bytes)`);
    if (next > prev) checkGlyph(dv, glyf.off + prev, next - prev, numGlyphs, g, fail);
    prev = next;
  }

  const cmap = table('cmap', 4);
  const numSub = dv.getUint16(cmap.off + 2);
  if (numSub === 0 || 4 + numSub * 8 > cmap.len) fail("'cmap' subtable directory is outside the table");
  for (let i = 0; i < numSub; i++) {
    const so = dv.getUint32(cmap.off + 4 + i * 8 + 4);
    if (so + 4 > cmap.len) fail(`'cmap' subtable ${i} is outside the table`);
    const format = dv.getUint16(cmap.off + so);
    if (format >= 8 && so + 8 > cmap.len) fail(`'cmap' subtable ${i} is outside the table`);
    const subLen = format >= 8 && format !== 14 ? dv.getUint32(cmap.off + so + 4) : format === 14 ? dv.getUint32(cmap.off + so + 2) : dv.getUint16(cmap.off + so + 2);
    if (so + subLen > cmap.len) fail(`'cmap' subtable ${i} (format ${format}) is outside the table`);
  }
}

/** Glyph header inside its slot; composite components inside the slot and pointing at real glyphs. */
function checkGlyph(dv: DataView, start: number, len: number, numGlyphs: number, gid: number, fail: (why: string) => never): void {
  if (len < 10) fail(`glyph ${gid} is truncated`);
  const contours = dv.getInt16(start);
  if (contours >= 0) {
    if (10 + contours * 2 + 2 > len) fail(`glyph ${gid} is truncated`);
    return;
  }
  let p = 10;
  for (;;) {
    if (p + 4 > len) fail(`composite glyph ${gid} is truncated`);
    const flags = dv.getUint16(start + p);
    const component = dv.getUint16(start + p + 2);
    if (component >= numGlyphs) fail(`composite glyph ${gid} references missing glyph ${component}`);
    p += 4 + (flags & 0x0001 ? 4 : 2);
    if (flags & 0x0008) p += 2;
    else if (flags & 0x0040) p += 4;
    else if (flags & 0x0080) p += 8;
    if (p > len) fail(`composite glyph ${gid} is truncated`);
    if (!(flags & 0x0020)) return;
  }
}
