// @vitest-environment node
/**
 * The shared fonts folder (`packages/core/assets/fonts/`): manifest schema, files on disk,
 * OpenType layout kept by the subsetter, and real HarfBuzz shaping of the Arabic families.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadHarfBuzz } from './pdf-fonts.js';

const DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const PKG = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as { files: string[] };

interface Entry {
  family: string;
  weight: number;
  style: string;
  ttf: string;
  woff2: string;
}
const manifest = JSON.parse(readFileSync(`${DIR}fonts.json`, 'utf8')) as Entry[];

/** Feature tags of a GSUB/GPOS table (OpenType FeatureList). */
function featureTags(bytes: Uint8Array, table: 'GSUB' | 'GPOS'): Set<string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number): string => String.fromCharCode(...bytes.subarray(o, o + 4));
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    if (tag(rec) !== table) continue;
    const t = v.getUint32(rec + 8);
    const fl = t + v.getUint16(t + 6);
    const count = v.getUint16(fl);
    return new Set(Array.from({ length: count }, (_, k) => tag(fl + 2 + k * 6)));
  }
  return new Set();
}

const ARABIC_FAMILIES = ['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Noto Sans Arabic'];

describe('assets/fonts manifest', () => {
  it('is an array of { family, weight, style, ttf, woff2 } with plain relative file names', () => {
    expect(Array.isArray(manifest)).toBe(true);
    for (const e of manifest) {
      expect(Object.keys(e).sort()).toEqual(['family', 'style', 'ttf', 'weight', 'woff2']);
      expect(typeof e.family === 'string' && e.family.length > 0).toBe(true);
      expect([400, 700]).toContain(e.weight);
      expect(e.style).toBe('normal');
      expect(e.ttf).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.ttf$/);
      // woff2 is the expected UI file name; the files themselves come with the UI PR.
      expect(e.woff2).toBe(e.ttf.replace(/\.ttf$/, '.woff2'));
    }
  });

  it('lists every family at 400 and 700 exactly once, including the Noto PDF fallbacks', () => {
    const keys = manifest.map((e) => `${e.family}|${e.weight}|${e.style}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of ['Cairo', 'Tajawal', 'Noto Naskh Arabic', 'Noto Sans Arabic', 'Noto Sans']) {
      expect(keys).toContain(`${f}|400|normal`);
      expect(keys).toContain(`${f}|700|normal`);
    }
  });

  it('every ttf exists; every ttf in the folder is in the manifest; one OFL text per font project', () => {
    for (const e of manifest) expect(existsSync(DIR + e.ttf), e.ttf).toBe(true);
    const files = readdirSync(DIR);
    expect(files.filter((f) => f.endsWith('.ttf')).sort()).toEqual(manifest.map((e) => e.ttf).sort());
    expect(files.filter((f) => /^OFL-.+\.txt$/.test(f)).sort()).toEqual(['OFL-Cairo.txt', 'OFL-NotoNaskhArabic.txt', 'OFL-NotoSans.txt', 'OFL-Tajawal.txt']);
    for (const f of files.filter((x) => x.startsWith('OFL-'))) expect(readFileSync(DIR + f, 'utf8')).toContain('SIL Open Font License, Version 1.1');
  });

  it('the folder ships with the package', () => {
    expect(PKG.files).toContain('assets/fonts');
  });
});

describe.each(manifest.filter((e) => ARABIC_FAMILIES.includes(e.family)))('$ttf OpenType layout', (e) => {
  const bytes = new Uint8Array(readFileSync(DIR + e.ttf));

  it('GSUB keeps the Arabic joining forms and a required/standard ligature feature', () => {
    const gsub = featureTags(bytes, 'GSUB');
    for (const f of ['init', 'medi', 'fina']) expect(gsub, f).toContain(f);
    // `isol` only exists where the isolated form differs from the nominal glyph
    // (Noto Sans Arabic); Cairo, Tajawal and Noto Naskh have none in their sources either.
    expect(gsub.has('rlig') || gsub.has('liga'), 'rlig|liga').toBe(true);
  });

  it('GPOS keeps mark positioning (mark, mkmk) and kerning', () => {
    const gpos = featureTags(bytes, 'GPOS');
    for (const f of ['mark', 'mkmk', 'kern']) expect(gpos, f).toContain(f);
  });

  it('HarfBuzz shapes joined forms and the lam-alef ligature', async () => {
    const hb = await loadHarfBuzz();
    const font = new hb.Font(new hb.Face(new hb.Blob(bytes), 0));
    const shape = (s: string): { gid: number; cluster: number }[] => {
      const buf = new hb.Buffer();
      buf.addText(s);
      buf.guessSegmentProperties();
      hb.shape(font, buf);
      return buf.getGlyphInfos().map((g) => ({ gid: g.codepoint, cluster: g.cluster }));
    };
    /** Glyphs of each character (a font may draw ب as dotless body + dot mark). */
    const perChar = (s: string): string[] => {
      const m = new Map<number, number[]>();
      for (const g of shape(s)) m.set(g.cluster, [...(m.get(g.cluster) ?? []), g.gid]);
      return [...m.keys()].sort((x, y) => x - y).map((k) => m.get(k)!.join('+'));
    };
    const [isol] = perChar('ب');
    const [init, medi, fina] = perChar('ببب');
    expect(new Set([isol, init, medi, fina]).size, `isol/init/medi/fina differ: ${[isol, init, medi, fina].join(' ')}`).toBe(4);
    // Lam-alef: one ligature glyph (Cairo, Tajawal, Noto Sans Arabic), or — Noto Naskh's
    // design — contextual lam and alef forms that exist only in this pair.
    const la = perChar('لا');
    if (la.length !== 1) {
      expect(la[0], 'lam before alef ≠ initial lam').not.toBe(perChar('لب')[0]);
      expect(la[1], 'alef after lam ≠ final alef').not.toBe(perChar('با')[1]);
    }
    const salam = perChar('سلام');
    expect(salam.length === 3 || salam[1] !== perChar('سلب')[1], 'lam-alef inside سلام').toBe(true);
    for (const g of [...shape('ببب'), ...shape('لا'), ...shape('سلام')]) expect(g.gid).not.toBe(0);
  });
});
