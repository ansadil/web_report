/**
 * QA acceptance — shared fonts folder (A: packages/core/assets/fonts) and PDF font selection
 * (B: style.font / fontsBaseUrl, #17). On a tree without the fonts folder or without
 * `src/exporters/fonts-manifest.ts` (main before A/B) every block is SKIPPED, not failed.
 *
 * v5 (#17 head ffb99e3): BUG-22 (subset-tag collision) and BUG-23 (empty ToUnicode targets →
 * pdf.js CID junk for Noto Naskh Arabic) are fixed and asserted as regressions. A custom
 * `fontsBaseUrl` whose listed TTF is missing/unloadable, or that lacks Noto Sans Arabic /
 * Noto Sans, no longer rejects: the bundled face is used and `onWarning` (default
 * `console.warn`) reports FONT_FILE_UNAVAILABLE / FONT_FALLBACK_MISSING once per face per
 * export. A missing or 404 `fonts.json` still rejects.
 *
 * v6 (fix/pdf-font-robustness 12e15cb): BUG-25 fixed (asserted for all families); PdfWarning
 * carries the requested face's `weight` (400/700) and `style` ('normal'), asserted exactly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, mkdtempSync, cpSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportPdf } from '../src/exporters/pdf.js';
import { mustValidate } from './helpers/fixtures.js';
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { embeddedFontSummary, extractPdfText, containsLogical, findNotdefGlyphs, toBytes, drawnRuns, norm, type PdfText } from './helpers/pdf-text.js';
import { drawnContainsVisual, visualOrderRtl, inkOnly } from './helpers/visual-order.js';

const FONTS_DIR = resolve(__dirname, '../assets/fonts');
const MANIFEST_PATH = join(FONTS_DIR, 'fonts.json');
const HAS_FONTS = existsSync(MANIFEST_PATH);

type Entry = { family: string; weight: number; style: string; ttf: string; woff2: string };
type FontsManifestModule = {
  DEFAULT_FONTS_BASE_URL: string;
  loadFontManifest(base?: string): Promise<Entry[]>;
  resolveFontUrl(req: { family: string; weight?: number; style?: 'normal' | 'italic' }, opts: { format: 'ttf' | 'woff2'; fontsBaseUrl?: string }): Promise<string | null>;
};
// Variable specifier: the module does not exist on main, so it must not be resolved at transform time.
const FM_PATH = '../src/exporters/fonts-manifest.js';
const fm: FontsManifestModule | null = HAS_FONTS ? await import(/* @vite-ignore */ FM_PATH).catch(() => null) : null;
const HAS_API = fm !== null;

const manifest: Entry[] = HAS_FONTS ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : [];
const ARABIC_FAMILIES = ['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Noto Sans Arabic'] as const;
const SELECTABLE = ['Cairo', 'Tajawal', 'Noto Naskh Arabic'] as const;
const ttfOf = (family: string, weight: number) => manifest.find((e) => e.family === family && e.weight === weight)?.ttf;
const bytesOf = (file: string) => new Uint8Array(readFileSync(join(FONTS_DIR, file)));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---- minimal OpenType reader: cmap via HarfBuzz, GSUB/GPOS script → feature tags by hand ----
function tableDir(b: Uint8Array): Map<string, number> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint16(4);
  const m = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    m.set(String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!), v.getUint32(o + 8));
  }
  return m;
}
/** Feature tags reachable from `script` (default LangSys + all LangSys) in GSUB or GPOS. */
function layoutFeatures(b: Uint8Array, table: 'GSUB' | 'GPOS'): Map<string, Set<string>> {
  const off = tableDir(b).get(table);
  const out = new Map<string, Set<string>>();
  if (off === undefined) return out;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  const sl = off + v.getUint16(off + 4);
  const fl = off + v.getUint16(off + 6);
  const featTag = (i: number) => tag(fl + 2 + i * 6);
  const langSys = (o: number, into: Set<string>) => {
    const req = v.getUint16(o + 2);
    if (req !== 0xffff) into.add(featTag(req));
    const c = v.getUint16(o + 4);
    for (let k = 0; k < c; k++) into.add(featTag(v.getUint16(o + 6 + k * 2)));
  };
  for (let i = 0, n = v.getUint16(sl); i < n; i++) {
    const s = sl + v.getUint16(sl + 2 + i * 6 + 4);
    const set = new Set<string>();
    const def = v.getUint16(s);
    if (def) langSys(s + def, set);
    for (let k = 0, c = v.getUint16(s + 2); k < c; k++) langSys(s + v.getUint16(s + 4 + k * 6 + 4), set);
    out.set(tag(sl + 2 + i * 6), set);
  }
  return out;
}

type HB = typeof import('harfbuzzjs');
let hb: HB;
const hbFonts = new Map<string, { font: InstanceType<HB['Font']>; unicodes: Set<number> }>();
function hbFont(file: string) {
  let f = hbFonts.get(file);
  if (!f) {
    const face = new hb.Face(new hb.Blob(bytesOf(file)), 0);
    f = { font: new hb.Font(face), unicodes: new Set(face.collectUnicodes()) };
    hbFonts.set(file, f);
  }
  return f;
}
function shape(file: string, text: string): number[] {
  return shapeFull(file, text).map((g) => g.gid);
}
function shapeFull(file: string, text: string): { gid: number; cluster: number; adv: number }[] {
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(hbFont(file).font, buf);
  const pos = buf.getGlyphPositions();
  return buf.getGlyphInfos().map((g, i) => ({ gid: g.codepoint, cluster: g.cluster, adv: pos[i]!.xAdvance }));
}
/** Base (advancing) glyph per cluster, in logical order — Noto Naskh draws ب as dotless skeleton + dot. */
function bases(file: string, text: string): number[] {
  const by = new Map<number, number>();
  for (const g of shapeFull(file, text)) if (g.adv > 0 && !by.has(g.cluster)) by.set(g.cluster, g.gid);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, gid]) => gid);
}

describe.skipIf(!HAS_FONTS)('FONTS-A shared fonts folder (assets/fonts)', () => {
  beforeAll(async () => {
    hb = (await import('harfbuzzjs')) as HB;
  });

  it('fonts.json: entries are exactly {family,weight,style,ttf,woff2}, every ttf exists, every ttf is listed', () => {
    expect(Array.isArray(manifest)).toBe(true);
    for (const e of manifest) {
      expect(Object.keys(e).sort(), JSON.stringify(e)).toEqual(['family', 'style', 'ttf', 'weight', 'woff2']);
      expect(typeof e.family).toBe('string');
      expect([400, 700]).toContain(e.weight);
      expect(e.style).toBe('normal');
      expect(e.ttf).toMatch(/^[\w.-]+\.ttf$/);
      expect(e.woff2).toBe(e.ttf.replace(/\.ttf$/, '.woff2'));
      expect(existsSync(join(FONTS_DIR, e.ttf)), e.ttf).toBe(true);
    }
    const listed = new Set(manifest.map((e) => e.ttf));
    expect(readdirSync(FONTS_DIR).filter((f) => f.endsWith('.ttf')).filter((f) => !listed.has(f))).toEqual([]);
    for (const fam of [...ARABIC_FAMILIES, 'Noto Sans']) for (const w of [400, 700]) expect(ttfOf(fam, w), `${fam} ${w}`).toBeTruthy();
  });

  it('OFL notice present for every bundled family', () => {
    const ofl = readdirSync(FONTS_DIR).filter((f) => /^OFL.*\.txt$/.test(f));
    const text = ofl.map((f) => readFileSync(join(FONTS_DIR, f), 'utf8'));
    for (const t of text) {
      expect(t).toMatch(/SIL OPEN FONT LICENSE/i);
      expect(t).toMatch(/Version 1\.1/);
    }
    const all = text.join('\n');
    for (const fam of ['Cairo', 'Tajawal', 'Noto']) expect(all, fam).toMatch(new RegExp(`Copyright[^\\n]*|${fam}`));
    expect(ofl.map((f) => f.toLowerCase()).join(' ')).toMatch(/cairo/);
    expect(ofl.map((f) => f.toLowerCase()).join(' ')).toMatch(/tajawal/);
    expect(ofl.map((f) => f.toLowerCase()).join(' ')).toMatch(/naskh/);
  });

  describe.each(ARABIC_FAMILIES.flatMap((f) => [400, 700].map((w) => [f, w] as const)))('%s %i', (family, weight) => {
    const file = () => ttfOf(family, weight)!;

    it('GSUB arab: init/medi/fina/rlig (+liga, or rlig for lam-alef); GPOS arab|DFLT: mark/mkmk', () => {
      const b = bytesOf(file());
      expect(tableDir(b).has('GDEF')).toBe(true);
      const gsub = layoutFeatures(b, 'GSUB').get('arab');
      expect(gsub, 'GSUB has no arab script').toBeDefined();
      for (const f of ['init', 'medi', 'fina', 'rlig']) expect(gsub!.has(f), `GSUB ${f}`).toBe(true);
      // Known gap (PR doc): Cairo and Noto Sans Arabic have no `liga`; lam-alef comes from `rlig`.
      expect(gsub!.has('liga') || gsub!.has('rlig')).toBe(true);
      const gpos = layoutFeatures(b, 'GPOS');
      // Known: Tajawal registers its GPOS lookups only under DFLT (HarfBuzz falls back to it).
      const g = gpos.get('arab') ?? gpos.get('DFLT');
      expect(g, 'GPOS has neither arab nor DFLT').toBeDefined();
      for (const f of ['mark', 'mkmk']) expect(g!.has(f), `GPOS ${f}`).toBe(true);
    });

    it('cmap: Arabic letters + harakat, Eastern digits ٠-٩, Basic Latin', () => {
      const u = hbFont(file()).unicodes;
      const need = [...range(0x0621, 0x063a), ...range(0x0641, 0x064a), ...range(0x064b, 0x0652), ...range(0x0660, 0x0669)];
      expect(need.filter((c) => !u.has(c)).map((c) => c.toString(16))).toEqual([]);
      // Noto Sans Arabic is the Arabic fallback and carries only a few Latin glyphs (Noto Sans covers Latin).
      if (family !== 'Noto Sans Arabic') expect(range(0x20, 0x7e).filter((c) => !u.has(c)).map((c) => c.toString(16))).toEqual([]);
    });

    it('GSUB reaches contextual forms: ب isol/init/medi/fina differ; لا is shaped (ligature or contextual)', () => {
      const f = file();
      const [isol] = bases(f, 'ب');
      const [ini, med, fin] = bases(f, 'ببب');
      expect(new Set([isol, ini, med, fin]).size).toBe(4);
      expect([isol, ini, med, fin]).not.toContain(0);
      const lamAlef = shape(f, 'لا');
      const plain = [...shape(f, 'ل'), ...shape(f, 'ا')];
      expect(lamAlef.includes(0)).toBe(false);
      if (family === 'Noto Naskh Arabic') expect(lamAlef).not.toEqual([...plain].reverse()); // contextual, documented
      else expect(lamAlef.length).toBe(1);
    });
  });

  it('documented gaps are real and covered by the Noto Sans Arabic fallback', () => {
    const has = (fam: string, cp: number) => hbFont(ttfOf(fam, 400)!).unicodes.has(cp);
    expect(has('Tajawal', 0x066b) || has('Tajawal', 0x066c)).toBe(false);
    for (const cp of range(0x200c, 0x200f)) {
      expect(has('Cairo', cp) || has('Tajawal', cp)).toBe(false);
    }
    for (const cp of [0x066b, 0x066c, ...range(0x200c, 0x200f), 0x061c]) expect(has('Noto Sans Arabic', cp), cp.toString(16)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------
const LINES = {
  lamalef: 'لا إلا الإدارة',
  tashkeel: 'مُحَمَّد',
  mixed: '«منتج ABC-123 (إصدار 2)»',
  eastern: '١٢٣٤٫٥٦ و ١٬٢٣٤٫٥٠',
  hijri: '١٥ رمضان ١٤٤٧ هـ',
  latin: 'Latin: The quick brown fox 0123456789',
  zw: 'بب ب\u200Cب ع\u200D ـ A\u200EB\u200FC',
};
function report(font: string | undefined, bold: boolean, lines: Record<string, string> = LINES) {
  return mustValidate({
    version: '1',
    id: 'qa-fonts',
    meta: { name: 'QA fonts', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [],
    bands: {
      reportHeader: {
        height: 120,
        elements: Object.entries(lines).map(([id, value], i) => ({
          id, kind: 'text', value, pos: { x: 0, y: i * 12, w: 186, h: 10 },
          style: { fontSize: 16, ...(font ? { font } : {}), ...(bold ? { bold: true } : {}) },
        })),
      },
      detail: { height: 0, elements: [] },
    },
  });
}
const PS: Record<string, [string, string]> = {
  Cairo: ['Cairo-Regular', 'Cairo-Bold'],
  Tajawal: ['Tajawal-Regular', 'Tajawal-Bold'],
  'Noto Naskh Arabic': ['NotoNaskhArabic-Regular', 'NotoNaskhArabic-Bold'],
  // default face (no style.font) and the Arabic fallback
  'Noto Sans Arabic': ['NotoSansArabic-Regular', 'NotoSansArabic-Bold'],
};
const fontName = (n: string) => n.replace(/^\//, '');
const psOf = (n: string) => fontName(n).split('+')[1]!;
const tagOf = (n: string) => fontName(n).split('+')[0]!;

/** Report with one text element per [font, bold, value] (font undefined = default face). */
function multi(els: readonly (readonly [string | undefined, boolean, string?])[]) {
  return mustValidate({
    version: '1',
    id: 'qa-fonts-multi',
    meta: { name: 'QA fonts', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [],
    bands: {
      reportHeader: {
        height: Math.max(20, els.length * 12),
        elements: els.map(([font, bold, value], i) => ({
          id: `e${i}`, kind: 'text', value: value ?? 'الإدارة بتث 123', pos: { x: 0, y: i * 12, w: 186, h: 10 },
          style: { fontSize: 16, ...(font ? { font } : {}), ...(bold ? { bold: true } : {}) },
        })),
      },
      detail: { height: 0, elements: [] },
    },
  });
}

// ---- ToUnicode audit (BUG-23): every CMap entry, empty targets, per embedded font ----
async function toUnicodeAudit(bytes: Uint8Array): Promise<{ font: string; entries: number; empty: string[] }[]> {
  const doc = await PDFDocument.load(bytes);
  const out: { font: string; entries: number; empty: string[] }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type'))?.toString() !== '/Font') continue;
    const ref = obj.get(PDFName.of('ToUnicode'));
    if (!ref) continue;
    const tu = doc.context.lookup(ref);
    if (!(tu instanceof PDFRawStream)) continue;
    const cmap = new TextDecoder('latin1').decode(decodePDFRawStream(tu).decode());
    let entries = 0;
    const empty: string[] = [];
    for (const blk of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const e of blk[1]!.matchAll(/<([0-9A-Fa-f]*)>\s*<([0-9A-Fa-f]*)>/g)) {
        entries++;
        if (!e[2]) empty.push(`<${e[1]}> <>`);
      }
    }
    for (const blk of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const e of blk[1]!.matchAll(/<([0-9A-Fa-f]*)>\s*<([0-9A-Fa-f]*)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
        entries++;
        if (/<>/.test(e[3]!)) empty.push(`range <${e[1]}>-<${e[2]}> ${e[3]}`);
      }
    }
    out.push({ font: fontName(obj.get(PDFName.of('BaseFont'))?.toString() ?? '?'), entries, empty });
  }
  return out;
}
const ZWSP = /\u200B/g;
/** pdf.js text with U+200B (the fix's placeholder for glyphs without text) removed. */
const withoutZw = (t: PdfText): PdfText => ({
  ...t,
  items: t.items.map((i) => ({ ...i, str: i.str.replace(ZWSP, '') })),
  lines: t.lines.map((l) => ({ ...l, text: norm(l.text.replace(ZWSP, '')) })),
});
/** Order-independent character multiset (NFKC, no whitespace / ZWSP): catches junk and drops. */
/** C0 control (CID used as a char code) or U+FFFD; `layout` allows tab/newline/vt/ff/cr. */
const hasJunk = (s: string, layout = false) =>
  [...s].some((c) => { const n = c.codePointAt(0)!; return n === 0xfffd || (n < 0x20 && !(layout && n >= 0x09 && n <= 0x0d)); });
const charBag = (s: string) => [...norm(s.replace(ZWSP, ''))].filter((c) => !/\s/.test(c)).sort().join('');

describe.skipIf(!HAS_API)('FONTS-B PDF font selection (style.font / style.bold)', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeAll(() => { warn = vi.spyOn(console, 'warn'); });
  afterAll(() => warn.mockRestore());

  describe.each(SELECTABLE.flatMap((f) => [false, true].map((b) => [f, b] as const)))('%s bold=%s', (family, bold) => {
    let bytes: Uint8Array;
    beforeAll(async () => { bytes = await toBytes(await exportPdf({ schema: report(family, bold), rows: [] })); });

    it('exactly one embedded font: the requested face, subset (TAG+PSName, program smaller than the TTF)', async () => {
      const fonts = await embeddedFontSummary(bytes);
      const want = PS[family]![bold ? 1 : 0];
      expect(fonts.map((f) => fontName(f.name))).toEqual([expect.stringMatching(new RegExp(`^[A-Z]{6}\\+${want}$`))]);
      const full = statSync(join(FONTS_DIR, ttfOf(family, bold ? 700 : 400)!)).size;
      expect(fonts[0]!.programBytes).toBeGreaterThan(0);
      expect(fonts[0]!.programBytes).toBeLessThan(full);
    });

    it('no .notdef (tofu) glyphs drawn — incl. ٫ ٬ ZWNJ/ZWJ/LRM/RLM via the Noto fallback', async () => {
      expect(await findNotdefGlyphs(bytes)).toEqual([]);
    });

    it(`${family === 'Noto Naskh Arabic' ? 'BUG-23 regression: ' : ''}every line extracts back in pdf.js (lam-alef, tashkeel, mixed, Eastern digits, Hijri, Latin, ZWNJ/ZWJ/LRM/RLM lines)`, async () => {
      const t = withoutZw(await extractPdfText(bytes));
      for (const [k, v] of Object.entries(LINES)) if (k !== 'zw') expect(containsLogical(t, v), `${k}: ${JSON.stringify(t.lines.map((l) => l.text))}`).toBe(true);
      expect(t.lines.map((l) => l.text).filter((l) => hasJunk(l))).toEqual([]);
    });
  });

  it('unknown family falls back to Noto Sans Arabic, no throw, no warning', async () => {
    warn.mockClear();
    const bytes = await toBytes(await exportPdf({ schema: report('Comic Sans QA', false), rows: [] }));
    expect((await embeddedFontSummary(bytes)).map((f) => fontName(f.name))).toEqual([expect.stringMatching(/^[A-Z]{6}\+NotoSansArabic-Regular$/)]);
    expect(await findNotdefGlyphs(bytes)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------------------------
// BUG-23: glyphs without text of their own (Noto Naskh draws ب ت ث ج خ ش ن ي ة as skeleton +
// separate dot glyphs) used to get an EMPTY ToUnicode target `<cid> <>`; pdf.js then used the
// CID as a character code ('#', '%', 'Z', U+0001…). Fixed in d66ce3b (U+200B placeholder).
const DOTTED: Record<string, string> = {
  dotted: 'ب ت ث ج خ ش ن ي ة',
  joined: 'بتثجخشنية',
  words: 'بيت ثابت جنة خشب شجن نية يثبت تخت',
  tashkeel: 'بِسْمِ ثَبَتَ نِيَّة',
  hindi: '٠١٢٣٤٥٦٧٨٩',
  arabicDigits: 'رقم 0123456789',
  mixed: 'رقم ٣٤ و 56 ثبت',
};
// pdf.js re-applies its own bidi guess per item (see helpers/visual-order.ts); lines mixing
// Arabic letters and digit runs are judged by the drawn glyph order against UAX #9 instead.
// tashkeel: pdf.js inserts a space before a word-final haraka ("بِسْم ِ") on main, f688c68 and
// ffb99e3 alike (pre-existing positioning heuristic) — judged by the drawn-order oracle too.
const ORACLE = new Set(['arabicDigits', 'mixed', 'tashkeel']);
const FAMILIES_23 = [...SELECTABLE, undefined] as const;
// BUG-25 (found at ffb99e3, fixed in e2a66bc): Naskh dot glyphs had NEGATIVE /W advances, so
// pdf.js over-counted a Naskh line's width and dropped the first word(s) of long lines as
// off-page ("بيت ثابت … تخت" → "ت ثابت … تخت"). Now asserted as a regression for every family.
/** drawn-order oracle: one run equals the UAX #9 visual order, or — when GPOS mark positioning
 *  splits a line into one run per glyph (tashkeel) — the contiguous drawn sequence contains it. */
const drawnVisual = (runs: string[], logical: string) =>
  drawnContainsVisual(runs, logical) || inkOnly(runs.join('')).includes(visualOrderRtl(logical));
const HAS_PDFTOTEXT = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
/** every char of `got` (multiset) occurs in `want` — "no junk", independent of completeness */
const subBag = (got: string, want: string) => {
  const left = [...charBag(want)];
  for (const c of charBag(got)) { const i = left.indexOf(c); if (i < 0) return false; left.splice(i, 1); }
  return true;
};

describe.skipIf(!HAS_API)('BUG-23 ToUnicode / text extraction (dotted letters, Arabic + Hindi digits)', () => {
  describe.each(FAMILIES_23.flatMap((f) => [false, true].map((b) => [f ?? 'default (Noto Sans Arabic)', f, b] as const)))('%s bold=%s', (_label, family, bold) => {
    let bytes: Uint8Array;
    beforeAll(async () => { bytes = await toBytes(await exportPdf({ schema: report(family, bold, DOTTED), rows: [] })); });
    const SOURCE = Object.values(DOTTED).join(' ');

    it('ToUnicode of every embedded font has entries and NO empty targets; every drawn glyph is mapped', async () => {
      const audit = await toUnicodeAudit(bytes);
      const want = PS[family ?? 'Noto Sans Arabic']![bold ? 1 : 0];
      expect(audit.map((a) => psOf(a.font))).toEqual([want]);
      for (const a of audit) {
        expect(a.entries, a.font).toBeGreaterThan(10);
        expect(a.empty, a.font).toEqual([]);
      }
      const runs = await drawnRuns(bytes);
      expect(runs.length).toBeGreaterThan(0);
      expect(runs.filter((r) => r.text.includes('\uFFFD')).map((r) => r.text)).toEqual([]);
      // the drawn content (ToUnicode per glyph, drawn order) carries exactly the source characters
      expect(charBag(runs.map((r) => r.text).join(''))).toBe(charBag(SOURCE));
    });

    it('pdf.js: no CID junk — no C0 controls / U+FFFD, every extracted char is a source char', async () => {
      const t = withoutZw(await extractPdfText(bytes));
      const all = t.lines.map((l) => l.text).join(' ');
      expect(t.lines.map((l) => l.text).filter((l) => hasJunk(l))).toEqual([]);
      expect(subBag(all, SOURCE), JSON.stringify(t.lines.map((l) => l.text))).toBe(true);
    });

    it(`${family === 'Noto Naskh Arabic' ? 'BUG-25 regression: ' : ''}pdf.js: each line extracts back completely (U+200B ignored); digit/tashkeel lines match the drawn-order oracle`, async () => {
      const t = withoutZw(await extractPdfText(bytes));
      const dump = JSON.stringify(t.lines.map((l) => l.text));
      const runs = (await drawnRuns(bytes)).map((r) => r.text.replace(ZWSP, ''));
      for (const [k, v] of Object.entries(DOTTED)) {
        if (ORACLE.has(k)) expect(drawnVisual(runs, v), `${k} drawn: ${JSON.stringify(runs)}`).toBe(true);
        else expect(containsLogical(t, v), `${k}: ${dump}`).toBe(true);
      }
      expect(charBag(t.lines.map((l) => l.text).join(' '))).toBe(charBag(SOURCE));
    });

    it.skipIf(!HAS_PDFTOTEXT)('poppler pdftotext: exactly the source characters (no junk, nothing lost)', () => {
      const f = join(tmpdir(), `qa-bug23-${(family ?? 'default').replace(/\W/g, '')}-${bold ? 'b' : 'r'}-${process.pid}.pdf`);
      writeFileSync(f, bytes);
      let out: string;
      try { out = execFileSync('pdftotext', ['-raw', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }); } finally { rmSync(f, { force: true }); }
      out = out.replace(/[\u202a-\u202e\u200e\u200f]/g, '');
      expect(hasJunk(out, true), JSON.stringify(out)).toBe(false);
      expect(charBag(out)).toBe(charBag(SOURCE));
    });
  });
});

// ------------------------------------------------------------------------------------------
describe.skipIf(!HAS_API)('BUG-22 subset tags (ISO 32000-1 §9.6.4: distinct tag per subset)', () => {
  const tagsBy = async (schema: ReturnType<typeof multi>) =>
    (await embeddedFontSummary(await toBytes(await exportPdf({ schema, rows: [] }))))
      .map((f) => ({ ps: psOf(f.name), tag: tagOf(f.name) }))
      .sort((a, b) => a.ps.localeCompare(b.ps));

  it('Regular and Bold of one family in one PDF: distinct, well-formed tags', async () => {
    const got = await tagsBy(multi([['Cairo', false, 'الإدارة'], ['Cairo', true, 'الإدارة']]));
    expect(got.map((g) => g.ps)).toEqual(['Cairo-Bold', 'Cairo-Regular']);
    for (const g of got) expect(g.tag).toMatch(/^[A-Z]{6}$/);
    expect(got[0]!.tag).not.toBe(got[1]!.tag);
  });

  it('all families × Regular/Bold (+ default) in one PDF: 8 subsets, 8 distinct tags, deterministic across exports', async () => {
    const els = [...SELECTABLE, undefined].flatMap((f) => [[f, false], [f, true]] as const);
    const a = await tagsBy(multi(els));
    const b = await tagsBy(multi(els));
    expect(a.map((g) => g.ps)).toEqual(Object.values(PS).flat().sort((x, y) => x.localeCompare(y)));
    for (const g of a) expect(g.tag).toMatch(/^[A-Z]{6}$/);
    expect(new Set(a.map((g) => g.tag)).size).toBe(8);
    expect(b).toEqual(a);
  });
});

// ------------------------------------------------------------------------------------------
type Warning = { code: string; message: string; family?: string; weight?: number; style?: string; url?: string };
/** Expected PdfWarning: `weight`/`style` are those of the face the PDF asked for (12e15cb). */
const W = (code: string, family: string, weight: 400 | 700, url: string) => ({ code, family, weight, style: 'normal', url, message: expect.any(String) });

describe.skipIf(!HAS_API)('FONTS-B fontsBaseUrl', () => {
  let dir: string;
  let server: Server;
  let http: string;
  const requests: string[] = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'qa-fonts-'));
    const copy = (name: string) => { cpSync(FONTS_DIR, join(dir, name), { recursive: true }); return join(dir, name); };
    copy('ok');
    const miss = copy('missing-ttf');
    rmSync(join(miss, ttfOf('Cairo', 400)!));
    rmSync(join(miss, ttfOf('Cairo', 700)!));
    writeFileSync(join(copy('corrupt-ttf'), ttfOf('Cairo', 400)!), 'this is not a font');
    const noNsa = copy('no-noto-sans-arabic');
    writeFileSync(join(noNsa, 'fonts.json'), JSON.stringify(manifest.filter((e) => e.family !== 'Noto Sans Arabic')));
    rmSync(join(copy('no-json'), 'fonts.json'));
    server = createServer((req, res) => {
      requests.push(req.url ?? '');
      const p = join(dir, decodeURIComponent((req.url ?? '/').split('?')[0]!));
      if (!p.startsWith(dir) || !existsSync(p) || statSync(p).isDirectory()) { res.statusCode = 404; res.end('nope'); return; }
      res.end(readFileSync(p));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    http = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  const embedded = async (input: Parameters<typeof exportPdf>[0]) =>
    (await embeddedFontSummary(await toBytes(await exportPdf(input)))).map((f) => psOf(f.name));
  /** Export with a recording onWarning: sorted embedded fonts (PS + full name), warnings. */
  const run = async (schema: ReturnType<typeof multi>, fontsBaseUrl?: string) => {
    const warnings: Warning[] = [];
    const input = { schema, rows: [], fontsBaseUrl, onWarning: (w: Warning) => { warnings.push(w); } };
    const fonts = (await embeddedFontSummary(await toBytes(await exportPdf(input as Parameters<typeof exportPdf>[0])))).map((f) => fontName(f.name)).sort();
    return { fonts, ps: fonts.map(psOf), warnings: [...warnings].sort((a, b) => (a.url ?? '').localeCompare(b.url ?? '')) };
  };
  const CAIRO_RB = multi([['Cairo', false], ['Cairo', false], ['"cairo", sans-serif', false], ['Cairo', true], ['Cairo', true]]);

  describe('offline: file:// and plain paths never call fetch', () => {
    const fetchSpy = vi.fn(async () => { throw new Error('network blocked (QA)'); });
    beforeAll(() => { vi.stubGlobal('fetch', fetchSpy); });
    afterAll(() => { vi.unstubAllGlobals(); expect(fetchSpy).not.toHaveBeenCalled(); });

    it('default base is the bundled folder as a file: URL', async () => {
      expect(fm!.DEFAULT_FONTS_BASE_URL).toBe(pathToFileURL(FONTS_DIR).href + '/');
      expect(await embedded({ schema: report('Cairo', false), rows: [] })).toEqual(['Cairo-Regular']);
    });

    it('file:// folder: resolveFontUrl + full export', async () => {
      const base = pathToFileURL(join(dir, 'ok')).href;
      expect(await fm!.resolveFontUrl({ family: '"tajawal", sans-serif', weight: 700 }, { format: 'ttf', fontsBaseUrl: base })).toBe(`${base}/Tajawal-Bold.ttf`);
      expect(await embedded({ schema: report('Tajawal', true), rows: [], fontsBaseUrl: base })).toEqual(['Tajawal-Bold']);
    });

    it('plain absolute path works like file://', async () => {
      expect(await embedded({ schema: report('Noto Naskh Arabic', false), rows: [], fontsBaseUrl: join(dir, 'ok') })).toEqual(['NotoNaskhArabic-Regular']);
    });

    it('complete custom folder and the bundled folder given explicitly: no warnings', async () => {
      expect((await run(CAIRO_RB, pathToFileURL(join(dir, 'ok')).href)).warnings).toEqual([]);
      expect((await run(CAIRO_RB, fm!.DEFAULT_FONTS_BASE_URL)).warnings).toEqual([]);
    });

    it('missing family → resolveFontUrl null → Noto Sans Arabic, no warning', async () => {
      const base = pathToFileURL(join(dir, 'ok')).href;
      expect(await fm!.resolveFontUrl({ family: 'Nope Sans' }, { format: 'ttf', fontsBaseUrl: base })).toBeNull();
      const r = await run(multi([['Nope Sans', false]]), base);
      expect(r.ps).toEqual(['NotoSansArabic-Regular']);
      expect(r.warnings).toEqual([]);
    });

    it('missing folder (no fonts.json) still rejects with ENOENT, no warning', async () => {
      const base = pathToFileURL(join(dir, 'does-not-exist')).href;
      await expect(fm!.loadFontManifest(base)).rejects.toThrow(/ENOENT/);
      const onWarning = vi.fn();
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: base, onWarning } as Parameters<typeof exportPdf>[0])).rejects.toThrow(/ENOENT/);
      expect(onWarning).not.toHaveBeenCalled();
    });

    it('folder with TTFs but fonts.json missing still rejects (folder-level error), no warning', async () => {
      const onWarning = vi.fn();
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: pathToFileURL(join(dir, 'no-json')).href, onWarning } as Parameters<typeof exportPdf>[0])).rejects.toThrow(/ENOENT/);
      expect(onWarning).not.toHaveBeenCalled();
    });

    it('listed TTF missing: export succeeds with the bundled face; exactly one FONT_FILE_UNAVAILABLE per face (family + url), however often it is used', async () => {
      const base = pathToFileURL(join(dir, 'missing-ttf')).href;
      const bundled = await run(CAIRO_RB);
      const r = await run(CAIRO_RB, base);
      expect(r.ps).toEqual(['Cairo-Bold', 'Cairo-Regular']);
      expect(r.fonts).toEqual(bundled.fonts); // same tag ⇒ the bundled Cairo face was embedded
      expect(r.warnings).toEqual([
        W('FONT_FILE_UNAVAILABLE', 'Cairo', 700, `${base}/${ttfOf('Cairo', 700)}`),
        W('FONT_FILE_UNAVAILABLE', 'Cairo', 400, `${base}/${ttfOf('Cairo', 400)}`),
      ]);
      expect(r.warnings.every((w) => w.message.length > 0)).toBe(true);
    });

    it('listed TTF corrupt (not an sfnt): same fallback, one FONT_FILE_UNAVAILABLE', async () => {
      const base = pathToFileURL(join(dir, 'corrupt-ttf')).href;
      const r = await run(multi([['Cairo', false], ['Cairo', false]]), base);
      expect(r.ps).toEqual(['Cairo-Regular']);
      expect(r.warnings).toEqual([W('FONT_FILE_UNAVAILABLE', 'Cairo', 400, `${base}/${ttfOf('Cairo', 400)}`)]);
    });

    it('warnings are de-duplicated per export, not per process: a second export warns again', async () => {
      const base = pathToFileURL(join(dir, 'missing-ttf')).href;
      const s = multi([['Cairo', false], ['Cairo', false]]);
      expect((await run(s, base)).warnings).toHaveLength(1);
      expect((await run(s, base)).warnings).toHaveLength(1);
    });

    it('without onWarning the warning goes to console.warn (once per face, with the PdfWarning object)', async () => {
      const base = pathToFileURL(join(dir, 'missing-ttf')).href;
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await exportPdf({ schema: multi([['Cairo', false], ['Cairo', false], ['Cairo', false]]), rows: [], fontsBaseUrl: base });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0]![0]).toMatch(/^\[reports-web pdf\] FONT_FILE_UNAVAILABLE: /);
        expect(spy.mock.calls[0]![1]).toEqual(W('FONT_FILE_UNAVAILABLE', 'Cairo', 400, `${base}/${ttfOf('Cairo', 400)}`));
      } finally {
        spy.mockRestore();
      }
    });

    it('FONT_FALLBACK_MISSING: custom folder without Noto Sans Arabic → bundled Noto Sans Arabic, one warning (family + fonts.json url)', async () => {
      const base = pathToFileURL(join(dir, 'no-noto-sans-arabic')).href;
      const want = [W('FONT_FALLBACK_MISSING', 'Noto Sans Arabic', 400, `${base}/fonts.json`)];
      const cairo = await run(multi([['Cairo', false], ['Cairo', false]]), base);
      expect(cairo.ps).toEqual(['Cairo-Regular']);
      expect(cairo.warnings).toEqual(want);
      const dflt = await run(multi([[undefined, false], [undefined, false]]), base);
      expect(dflt.fonts).toEqual((await run(multi([[undefined, false], [undefined, false]]))).fonts); // bundled face
      expect(dflt.ps).toEqual(['NotoSansArabic-Regular']);
      expect(dflt.warnings).toEqual(want);
      expect(await findNotdefGlyphs(await toBytes(await exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: base, onWarning: () => {} } as Parameters<typeof exportPdf>[0])))).toEqual([]);
    });

    // BUG-24 (found in v5 QA): a TRUNCATED TTF with a valid sfnt header passes the font check,
    // then fontkit throws inside a timer while subsetting: uncaught exception (kills Node) and
    // the export promise never settles. Not asserted here because it would crash the worker;
    // repro: /workspace/qa/evidence/fonts-v2/bug24/repro.mjs.
    it.todo('BUG-24: truncated listed TTF → FONT_FILE_UNAVAILABLE fallback (today: uncaught error + hung export)');
  });

  describe('http', () => {
    it('http base: fonts.json + only the used TTFs are requested', async () => {
      requests.length = 0;
      expect(await fm!.resolveFontUrl({ family: 'Cairo', weight: 700 }, { format: 'woff2', fontsBaseUrl: `${http}ok` })).toBe(`${http}ok/Cairo-Bold.woff2`);
      expect(await embedded({ schema: report('Cairo', true), rows: [], fontsBaseUrl: `${http}ok/` })).toEqual(['Cairo-Bold']);
      expect([...new Set(requests)].sort()).toEqual(['/ok/Cairo-Bold.ttf', '/ok/NotoSans-Bold.ttf', '/ok/NotoSansArabic-Bold.ttf', '/ok/fonts.json']);
    });

    it('http missing family → Noto Sans Arabic', async () => {
      expect(await fm!.resolveFontUrl({ family: 'Nope Sans' }, { format: 'ttf', fontsBaseUrl: `${http}ok/` })).toBeNull();
      expect(await embedded({ schema: report('Nope Sans', true), rows: [], fontsBaseUrl: `${http}ok/` })).toEqual(['NotoSansArabic-Bold']);
    });

    it('http 404 for fonts.json (folder) still rejects, no warning', async () => {
      const onWarning = vi.fn();
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: `${http}nope/`, onWarning } as Parameters<typeof exportPdf>[0])).rejects.toThrow(/404/);
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: `${http}no-json/`, onWarning } as Parameters<typeof exportPdf>[0])).rejects.toThrow(/404/);
      expect(onWarning).not.toHaveBeenCalled();
    });

    it('http 404 for a listed TTF → bundled face, one FONT_FILE_UNAVAILABLE with the http url, requested once', async () => {
      requests.length = 0;
      const r = await run(multi([['Cairo', false], ['Cairo', false], ['Cairo', false]]), `${http}missing-ttf/`);
      expect(r.ps).toEqual(['Cairo-Regular']);
      expect(r.warnings).toEqual([W('FONT_FILE_UNAVAILABLE', 'Cairo', 400, `${http}missing-ttf/${ttfOf('Cairo', 400)}`)]);
      expect(requests.filter((u) => u === `/missing-ttf/${ttfOf('Cairo', 400)}`)).toHaveLength(1);
    });

    it('http FONT_FALLBACK_MISSING carries the http fonts.json url', async () => {
      const r = await run(multi([['Cairo', false]]), `${http}no-noto-sans-arabic/`);
      expect(r.warnings).toEqual([W('FONT_FALLBACK_MISSING', 'Noto Sans Arabic', 400, `${http}no-noto-sans-arabic/fonts.json`)]);
    });
  });
});

// ------------------------------------------------------------------------------------------
// PdfWarningCode / PdfWarning are public API of the package root (src/index.ts → exporters).
const WARN_PATH = '../src/exporters/pdf-warnings.js';
const ts = await import('typescript').then((m) => m.default ?? m).catch(() => null);
const HAS_WARNINGS = HAS_API && existsSync(resolve(__dirname, '../src/exporters/pdf-warnings.ts'));
describe.skipIf(!HAS_WARNINGS)('PdfWarningCode / PdfWarning exports', () => {
  const SRC_ROOT = resolve(__dirname, '../src/index.ts');
  const DIST_ROOT = resolve(__dirname, '../dist/index.d.ts');

  it('PdfWarningCode values (runtime), re-exported unchanged by the exporters barrel', async () => {
    const own = (await import(/* @vite-ignore */ WARN_PATH)) as { PdfWarningCode: Record<string, string> };
    const barrel = (await import('../src/exporters/index.js')) as unknown as { PdfWarningCode: Record<string, string> };
    expect(own.PdfWarningCode).toEqual({ FONT_FILE_UNAVAILABLE: 'FONT_FILE_UNAVAILABLE', FONT_FALLBACK_MISSING: 'FONT_FALLBACK_MISSING' });
    expect(barrel.PdfWarningCode).toBe(own.PdfWarningCode);
    expect(readFileSync(SRC_ROOT, 'utf8')).toMatch(/export \* from '\.\/exporters\/index\.js'/);
  });

  // Type-level: compile a consumer snippet against the package root (src, and dist .d.ts when built).
  const consumer = (spec: string) => `
import { exportPdf, PdfWarningCode, type PdfWarning, type PdfExportInput } from ${JSON.stringify(spec)};
const seen: PdfWarning[] = [];
const onWarning: NonNullable<PdfExportInput['onWarning']> = (w) => { seen.push(w); };
const a: PdfWarningCode = PdfWarningCode.FONT_FILE_UNAVAILABLE;
const b: PdfWarningCode = 'FONT_FALLBACK_MISSING';
export function describeWarning(w: PdfWarning): string {
  switch (w.code) {
    case PdfWarningCode.FONT_FILE_UNAVAILABLE: return \`\${w.family ?? ''} \${w.url ?? ''} \${w.message}\`;
    case PdfWarningCode.FONT_FALLBACK_MISSING: return w.url ?? '';
    default: { const never: never = w.code; return never; }
  }
}
void exportPdf; void onWarning; void a; void b;
`;
  const negative = (spec: string) => `
import { PdfWarningCode, type PdfWarning } from ${JSON.stringify(spec)};
export const bad: PdfWarningCode = 'NOT_A_CODE';
export function mutate(w: PdfWarning): void { (w as PdfWarning).code = PdfWarningCode.FONT_FALLBACK_MISSING; }
`;
  function diagnostics(src: string): string[] {
    const t = ts!;
    const d = mkdtempSync(join(tmpdir(), 'qa-types-'));
    try {
      const file = join(d, 'consumer.ts');
      writeFileSync(file, src);
      const program = t.createProgram([file], {
        strict: true, noEmit: true, skipLibCheck: true, target: t.ScriptTarget.ES2022, module: t.ModuleKind.ESNext,
        moduleResolution: t.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [],
        experimentalDecorators: true, useDefineForClassFields: false, noUncheckedIndexedAccess: true,
      });
      const sf = program.getSourceFile(file)!;
      return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)].map((x) => `TS${x.code}: ${t.flattenDiagnosticMessageText(x.messageText, ' ')}`);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }
  const roots = [['src/index.ts', SRC_ROOT.replace(/\.ts$/, '.js')], ['dist/index.d.ts', DIST_ROOT.replace(/\.d\.ts$/, '.js')]] as const;
  for (const [label, spec] of roots) {
    const present = label.startsWith('src') || existsSync(DIST_ROOT);
    it.skipIf(!ts || !present)(`types compile from the package root (${label}); wrong code / mutation are type errors`, () => {
      expect(diagnostics(consumer(spec))).toEqual([]);
      const neg = diagnostics(negative(spec));
      expect(neg.some((m) => m.startsWith('TS2322') && m.includes('NOT_A_CODE'))).toBe(true);
      expect(neg.some((m) => m.startsWith('TS2540'))).toBe(true); // readonly
    }, 60_000);
  }
});
