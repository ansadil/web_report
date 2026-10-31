/**
 * QA acceptance — shared fonts folder (A: packages/core/assets/fonts) and PDF font selection
 * (B: style.font / fontsBaseUrl). On a tree without the fonts folder or without
 * `src/exporters/fonts-manifest.ts` (main before A/B) every block is SKIPPED, not failed.
 *
 * BUG-22 (subset-tag collision) and BUG-23 (pdf.js text of fonts that decompose clusters, i.e.
 * Noto Naskh Arabic, contains CID-fallback junk) are EXPECTED TO FAIL until fixed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, mkdtempSync, cpSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportPdf } from '../src/exporters/pdf.js';
import { mustValidate } from './helpers/fixtures.js';
import { embeddedFontSummary, extractPdfText, containsLogical, findNotdefGlyphs, toBytes } from './helpers/pdf-text.js';

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
};
const fontName = (n: string) => n.replace(/^\//, '');

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

    // BUG-23: glyphs that carry no characters of their own (Noto Naskh draws ب as skeleton + dot)
    // get an EMPTY ToUnicode target `<cid> <>`; pdf.js then falls back to the CID as a char code,
    // so copy/search yields '#', '%', 'Z', U+0001… Only Naskh decomposes among the bundled fonts.
    it(`${family === 'Noto Naskh Arabic' ? 'BUG-23: ' : ''}every line extracts back in pdf.js (lam-alef, tashkeel, mixed, Eastern digits, Hijri, Latin, ZWNJ/ZWJ/LRM/RLM lines)`, async () => {
      const t = await extractPdfText(bytes);
      for (const [k, v] of Object.entries(LINES)) if (k !== 'zw') expect(containsLogical(t, v), `${k}: ${JSON.stringify(t.lines.map((l) => l.text))}`).toBe(true);
      expect(t.lines.map((l) => l.text).filter((l) => /[\u0000-\u001f]/.test(l))).toEqual([]);
    });
  });

  it('unknown family falls back to Noto Sans Arabic, no throw, no warning', async () => {
    warn.mockClear();
    const bytes = await toBytes(await exportPdf({ schema: report('Comic Sans QA', false), rows: [] }));
    expect((await embeddedFontSummary(bytes)).map((f) => fontName(f.name))).toEqual([expect.stringMatching(/^[A-Z]{6}\+NotoSansArabic-Regular$/)]);
    expect(await findNotdefGlyphs(bytes)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('BUG-22: Regular and Bold of one family in one PDF get distinct subset tags (ISO 32000-1 §9.6.4)', async () => {
    const s = report('Cairo', false, { a: 'الإدارة' });
    const el = (s.bands.reportHeader!.elements[0]!) as unknown as Record<string, unknown>;
    s.bands.reportHeader!.elements.push({ ...el, id: 'b', pos: { x: 0, y: 12, w: 186, h: 10 }, style: { fontSize: 16, font: 'Cairo', bold: true } } as never);
    const names = (await embeddedFontSummary(await toBytes(await exportPdf({ schema: s, rows: [] })))).map((f) => fontName(f.name)).sort();
    expect(names.map((n) => n.split('+')[1])).toEqual(['Cairo-Bold', 'Cairo-Regular']);
    expect(new Set(names.map((n) => n.split('+')[0])).size).toBe(2);
  });
});

describe.skipIf(!HAS_API)('FONTS-B fontsBaseUrl', () => {
  let dir: string;
  let missingTtf: string;
  let server: Server;
  let http: string;
  const requests: string[] = [];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'qa-fonts-'));
    cpSync(FONTS_DIR, join(dir, 'ok'), { recursive: true });
    cpSync(FONTS_DIR, join(dir, 'missing-ttf'), { recursive: true });
    rmSync(join(dir, 'missing-ttf', ttfOf('Cairo', 400)!));
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
    (await embeddedFontSummary(await toBytes(await exportPdf(input)))).map((f) => fontName(f.name).split('+')[1]);

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

    it('missing family → resolveFontUrl null → Noto Sans Arabic', async () => {
      const base = pathToFileURL(join(dir, 'ok')).href;
      expect(await fm!.resolveFontUrl({ family: 'Nope Sans' }, { format: 'ttf', fontsBaseUrl: base })).toBeNull();
      expect(await embedded({ schema: report('Nope Sans', false), rows: [], fontsBaseUrl: base })).toEqual(['NotoSansArabic-Regular']);
    });

    it('missing folder rejects with ENOENT (no network fallback)', async () => {
      const base = pathToFileURL(join(dir, 'does-not-exist')).href;
      await expect(fm!.loadFontManifest(base)).rejects.toThrow(/ENOENT/);
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: base })).rejects.toThrow(/ENOENT/);
    });

    it('family listed but its TTF missing: export rejects (documented: no silent fallback)', async () => {
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: pathToFileURL(join(dir, 'missing-ttf')).href })).rejects.toThrow(/ENOENT/);
    });
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

    it('http 404 (folder or listed TTF) rejects', async () => {
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: `${http}nope/` })).rejects.toThrow(/404/);
      await expect(exportPdf({ schema: report('Cairo', false), rows: [], fontsBaseUrl: `${http}missing-ttf/` })).rejects.toThrow(/404/);
    });
  });
});
