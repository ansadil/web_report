// @vitest-environment node
/**
 * BUG-24: truncated / corrupt TTFs are rejected up front (structural validation), never crash
 * the process and never leave the export pending. A custom folder falls back to the bundled
 * face with FONT_FILE_UNAVAILABLE; a corrupt bundled face rejects cleanly.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { exportPdf, type PdfWarning } from './pdf.js';
import { FontLibrary, FontSession } from './pdf-fonts.js';
import { InvalidFontError, validateTrueType } from './pdf-font-validate.js';
import { encodeSubset } from './pdf-cid-font.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

const FONTS_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

const cairo = (): Promise<Uint8Array> => readFile(join(FONTS_DIR, 'Cairo-Regular.ttf')).then((b) => new Uint8Array(b));

/** Copy of the bundled folder with Cairo-Regular.ttf replaced by `bytes`. */
async function folderWith(bytes: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wr-fonts-rb-'));
  dirs.push(dir);
  await cp(FONTS_DIR, dir, { recursive: true });
  await writeFile(join(dir, 'Cairo-Regular.ttf'), bytes);
  return pathToFileURL(dir).href;
}

function report(): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 'rb',
    meta: { name: 'rb', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 12, right: 12, bottom: 12, left: 12 } },
    dataset: { adapter: 'static', source: 'x' },
    fields: [],
    bands: {
      reportHeader: { height: 20, elements: [{ id: 'a', kind: 'text', value: 'بتث abc', style: { fontSize: 16, font: 'Cairo' }, pos: { x: 0, y: 0, w: 180, h: 9 } }] },
      detail: { height: 0, elements: [] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** Settles within `ms` or fails (the bug left the export pending forever). */
function settle<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`still pending after ${ms} ms`)), ms))]);
}

/** Mutable copy and its table directory. */
function tables(bytes: Uint8Array): { b: Uint8Array; dv: DataView; rec: (tag: string) => number } {
  const b = bytes.slice();
  const dv = new DataView(b.buffer);
  const n = dv.getUint16(4);
  return {
    b,
    dv,
    rec: (tag) => {
      for (let i = 0; i < n; i++) {
        const r = 12 + i * 16;
        if (String.fromCharCode(b[r]!, b[r + 1]!, b[r + 2]!, b[r + 3]!) === tag) return r;
      }
      throw new Error(`no ${tag}`);
    },
  };
}

describe('validateTrueType', () => {
  it('accepts every bundled TTF', async () => {
    for (const f of (await readdir(FONTS_DIR)).filter((n) => n.endsWith('.ttf'))) {
      const bytes = new Uint8Array(await readFile(join(FONTS_DIR, f)));
      expect(() => validateTrueType(bytes), f).not.toThrow();
    }
  });

  it.each([0, 11, 100, 2000, 20000, 60000, -1])('rejects Cairo-Regular truncated to %i bytes', async (n) => {
    const b = await cairo();
    expect(() => validateTrueType(b.subarray(0, n < 0 ? b.length + n : n))).toThrow(InvalidFontError);
  });

  it('rejects a table that extends past the end of the file', async () => {
    const t = tables(await cairo());
    t.dv.setUint32(t.rec('hmtx') + 12, t.b.length);
    expect(() => validateTrueType(t.b)).toThrow(/'hmtx'.*exceeds the file length/);
  });

  it.each(['head', 'hhea', 'hmtx', 'maxp', 'cmap', 'loca', 'glyf'])('rejects a font without %s', async (tag) => {
    const t = tables(await cairo());
    t.b.set([0x78, 0x78, 0x78, 0x78], t.rec(tag)); // rename to 'xxxx'
    expect(() => validateTrueType(t.b)).toThrow(new RegExp(`required table '${tag}' is missing`));
  });

  it('rejects loca offsets outside glyf and CFF (OTTO) fonts', async () => {
    const t = tables(await cairo());
    t.dv.setUint32(t.rec('glyf') + 12, 16);
    expect(() => validateTrueType(t.b)).toThrow(/'loca' entry/);
    const otto = (await cairo()).slice();
    otto.set([0x4f, 0x54, 0x54, 0x4f], 0);
    expect(() => validateTrueType(otto)).toThrow(/CFF-based OpenType/);
    expect(() => validateTrueType(new TextEncoder().encode('<html>404</html>'))).toThrow(InvalidFontError);
  });
});

describe('exportPdf with a corrupt custom font (BUG-24)', () => {
  it.each([2000, 20000, 60000])('truncated to %i bytes: resolves with FONT_FILE_UNAVAILABLE and the bundled face', async (n) => {
    const base = await folderWith((await cairo()).subarray(0, n));
    const warnings: PdfWarning[] = [];
    const blob = await settle(exportPdf({ schema: report(), rows: [], fontsBaseUrl: base, onWarning: (w) => warnings.push(w) }));
    expect(blob.size).toBeGreaterThan(1000);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'FONT_FILE_UNAVAILABLE', family: 'Cairo', url: `${base}/Cairo-Regular.ttf`, message: expect.stringContaining('bundled Cairo-Regular.ttf') }),
    ]);
  });

  it('a corrupt bundled face rejects cleanly (no crash, no pending promise)', async () => {
    const lib = new FontLibrary(await folderWith((await cairo()).subarray(0, 20000)));
    const session = new FontSession(lib, () => undefined, lib);
    await expect(settle(session.loadFamily('Cairo', false))).rejects.toThrow(/Cairo-Regular\.ttf is not a usable TrueType font/);
    const custom = new FontLibrary(await folderWith((await cairo()).subarray(0, 2000)));
    await expect(settle(new FontSession(custom, () => undefined, lib).loadFamily('Cairo', false))).rejects.toThrow(/bundled fallback failed too/);
  });

  it('an error thrown while fontkit encodes a subset rejects instead of escaping nextTick', async () => {
    const subset = fontkit.create(await cairo()).createSubset();
    (subset as unknown as { encode: () => void }).encode = () => {
      throw new TypeError('boom');
    };
    await expect(settle(encodeSubset(subset))).rejects.toThrow('boom');
  });
});
