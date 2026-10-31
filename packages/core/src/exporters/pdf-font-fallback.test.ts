// @vitest-environment node
/**
 * Fallback to the bundled fonts (tech-lead decision for #17): a custom `fontsBaseUrl` whose
 * fonts.json lists a TTF that is missing/unloadable, or that lacks Noto Sans Arabic / Noto
 * Sans, still exports — the bundled faces are embedded and `onWarning` (default
 * `console.warn`) is called once per face. Only a failing bundled folder rejects.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { exportPdf, PdfWarningCode, type PdfWarning } from './pdf.js';
import { FontLibrary, FontSession } from './pdf-fonts.js';
import * as core from '../index.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

/** Temp folders of this file, removed after its tests. */
const tempDirs: string[] = [];
afterAll(() => Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))));
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const FONTS_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const AR = 'تقرير المبيعات';
type AnyObj = Record<string, unknown>;
type Entry = { family: string; weight: number; style: string; ttf: string; woff2: string };

function schema(elements: AnyObj[]): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 't',
    meta: { name: 'T', locale: 'ar', dir: 'rtl' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'v', type: 'string' }],
    bands: { reportHeader: { height: elements.length * 9 + 2, elements }, detail: { height: 0, elements: [] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const text = (i: number, value: string, style: AnyObj = {}): AnyObj => ({ id: `t${i}`, kind: 'text', value, pos: { x: 0, y: i * 9, w: 180, h: 8 }, style });

/** Cairo regular + bold (twice each, to check de-duplication) and default-font text. */
const REPORT = schema([
  text(0, AR, { font: 'Cairo' }),
  text(1, AR, { font: 'Cairo', bold: true }),
  text(2, `${AR} 2`, { font: 'Cairo', bold: true }),
  text(3, `${AR} 3`, { font: 'Cairo' }),
  text(4, `${AR} Latin`),
]);

const manifest = async (): Promise<Entry[]> => JSON.parse(await readFile(join(FONTS_DIR, 'fonts.json'), 'utf8')) as Entry[];

/** Copy of the bundled folder: `entries` filter fonts.json, `drop` TTFs are not copied, `corrupt` TTFs are garbage. */
async function folder(o: { entries?: (e: Entry) => boolean; drop?: string[]; corrupt?: string[] } = {}): Promise<string> {
  const dir = await tempDir('wr-fonts-fb-');
  const all = await manifest();
  const kept = all.filter(o.entries ?? (() => true));
  await writeFile(join(dir, 'fonts.json'), JSON.stringify(kept));
  for (const e of kept) {
    if (o.drop?.includes(e.ttf)) continue;
    if (o.corrupt?.includes(e.ttf)) await writeFile(join(dir, e.ttf), 'not a font, e.g. an HTML 200 error page');
    else await copyFile(join(FONTS_DIR, e.ttf), join(dir, e.ttf));
  }
  return pathToFileURL(dir).href;
}

async function run(fontsBaseUrl: string, s = REPORT): Promise<{ warnings: PdfWarning[]; fonts: string[] }> {
  const warnings: PdfWarning[] = [];
  const blob = await exportPdf({ schema: s, rows: [], fontsBaseUrl, onWarning: (w) => warnings.push(w) });
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  const fonts = new Set<string>();
  for (const page of doc.getPages()) {
    const dict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [, ref] of dict?.entries() ?? []) {
      const f = doc.context.lookup(ref) as PDFDict;
      fonts.add(String(f.get(PDFName.of('BaseFont'))).replace(/^\/([A-Z]{6}\+)?/, ''));
    }
  }
  return { warnings, fonts: [...fonts].sort() };
}

afterEach(() => vi.restoreAllMocks());

describe('PdfWarningCode', () => {
  it('exports the exact codes from the package index', () => {
    expect(core.PdfWarningCode).toEqual({ FONT_FILE_UNAVAILABLE: 'FONT_FILE_UNAVAILABLE', FONT_FALLBACK_MISSING: 'FONT_FALLBACK_MISSING' });
  });
});

describe('FONT_FILE_UNAVAILABLE: listed TTF missing or unloadable', () => {
  it.each([
    ['missing', { drop: ['Cairo-Bold.ttf'] }],
    ['not a font', { corrupt: ['Cairo-Bold.ttf'] }],
  ])('%s → export succeeds with the bundled Cairo-Bold, one warning for that face', async (_, o) => {
    const base = await folder(o);
    const { warnings, fonts } = await run(base);
    expect(fonts).toEqual(['Cairo-Bold', 'Cairo-Regular', 'NotoSansArabic-Regular']);
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'FONT_FILE_UNAVAILABLE', family: 'Cairo', url: `${base}/Cairo-Bold.ttf`, message: expect.stringContaining('bundled Cairo-Bold.ttf') }),
    ]);
  });

  it('both weights missing → one warning per face (2), never per element', async () => {
    const { warnings, fonts } = await run(await folder({ drop: ['Cairo-Bold.ttf', 'Cairo-Regular.ttf'] }));
    expect(fonts).toEqual(['Cairo-Bold', 'Cairo-Regular', 'NotoSansArabic-Regular']);
    expect(warnings.map((w) => [w.code, w.family, w.url!.split('/').pop()])).toEqual([
      ['FONT_FILE_UNAVAILABLE', 'Cairo', 'Cairo-Regular.ttf'],
      ['FONT_FILE_UNAVAILABLE', 'Cairo', 'Cairo-Bold.ttf'],
    ]);
  });

  it('a listed fallback TTF (Noto Sans Arabic) missing → bundled Noto Sans Arabic', async () => {
    const { warnings, fonts } = await run(await folder({ drop: ['NotoSansArabic-Regular.ttf'] }), schema([text(0, AR)]));
    expect(fonts).toEqual(['NotoSansArabic-Regular']);
    expect(warnings).toEqual([expect.objectContaining({ code: PdfWarningCode.FONT_FILE_UNAVAILABLE, family: 'Noto Sans Arabic' })]);
  });

  it('a custom-only family whose TTF is missing → bundled Noto fallbacks, warning says so', async () => {
    const dir = fileURLToPath(await folder());
    const m = await manifest();
    await writeFile(join(dir, 'fonts.json'), JSON.stringify([...m, { family: 'Corporate Sans', weight: 400, style: 'normal', ttf: 'Corp.ttf', woff2: 'Corp.woff2' }]));
    const { warnings, fonts } = await run(pathToFileURL(dir).href, schema([text(0, AR, { font: 'Corporate Sans' })]));
    expect(fonts).toEqual(['NotoSansArabic-Regular']);
    expect(warnings).toEqual([expect.objectContaining({ code: 'FONT_FILE_UNAVAILABLE', family: 'Corporate Sans', message: expect.stringContaining('Noto Sans Arabic') })]);
  });

  it('http: a 404 TTF falls back (bundled faces read from disk, not fetched)', async () => {
    const files = new Map<string, Uint8Array>([['fonts.json', await readFile(join(FONTS_DIR, 'fonts.json'))]]);
    for (const f of ['Cairo-Regular.ttf', 'NotoSansArabic-Regular.ttf', 'NotoSans-Regular.ttf', 'NotoSansArabic-Bold.ttf', 'NotoSans-Bold.ttf']) files.set(f, await readFile(join(FONTS_DIR, f)));
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      seen.push(u);
      const body = files.get(u.split('/').pop()!);
      return body ? new Response(body) : new Response('nope', { status: 404, statusText: 'Not Found' });
    });
    try {
      const { warnings, fonts } = await run('https://cdn.example.test/fb-404/');
      expect(fonts).toEqual(['Cairo-Bold', 'Cairo-Regular', 'NotoSansArabic-Regular']);
      expect(warnings).toEqual([expect.objectContaining({ code: 'FONT_FILE_UNAVAILABLE', family: 'Cairo', url: 'https://cdn.example.test/fb-404/Cairo-Bold.ttf', message: expect.stringContaining('404') })]);
      expect(seen.every((u) => u.startsWith('https://cdn.example.test/fb-404/'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('FONT_FALLBACK_MISSING: custom folder without Noto Sans Arabic / Noto Sans', () => {
  it('uses the bundled fallbacks, one warning per fallback face', async () => {
    const base = await folder({ entries: (e) => e.family === 'Cairo' });
    const { warnings, fonts } = await run(base);
    expect(fonts).toEqual(['Cairo-Bold', 'Cairo-Regular', 'NotoSansArabic-Regular']);
    const key = (w: PdfWarning) => `${w.code} ${w.family} ${w.url}`;
    expect(warnings.map(key).sort()).toEqual(
      [
        // Noto Sans Arabic / Noto Sans at 400 (Cairo + default chains) and 700 (Cairo-Bold chain)
        ...['Noto Sans Arabic', 'Noto Sans'].flatMap((f) => [f, f]),
      ]
        .map((f) => `FONT_FALLBACK_MISSING ${f} ${base}/fonts.json`)
        .sort(),
    );
    expect(new Set(warnings.map((w) => w.message)).size).toBe(4);
  });

  it('warns again on the next export (once per face per export)', async () => {
    const base = await folder({ entries: (e) => e.family === 'Cairo' });
    const s = schema([text(0, AR, { font: 'Cairo' })]);
    expect((await run(base, s)).warnings).toHaveLength(2);
    expect((await run(base, s)).warnings).toHaveLength(2);
  });
});

describe('defaults and limits', () => {
  it('onWarning defaults to console.warn', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = await folder({ drop: ['Cairo-Bold.ttf'] });
    await exportPdf({ schema: REPORT, rows: [], fontsBaseUrl: base });
    const calls = spy.mock.calls.filter((c) => String(c[0]).includes('FONT_FILE_UNAVAILABLE'));
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toEqual(expect.objectContaining({ code: 'FONT_FILE_UNAVAILABLE', family: 'Cairo' }));
  });

  it('no warning with the bundled folder or a complete custom folder (unknown family included)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = schema([...REPORT.bands.reportHeader!.elements, text(5, AR, { font: 'Nope' })] as never);
    await exportPdf({ schema: s, rows: [] });
    expect((await run(await folder(), s)).warnings).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the bundled folder itself does not fall back: a broken bundled face rejects', async () => {
    const broken = new FontLibrary(await folder({ drop: ['Cairo-Bold.ttf'] }));
    const session = new FontSession(broken, () => {}, broken);
    await expect(session.loadFamily('Cairo', true)).rejects.toThrow(/Cairo-Bold\.ttf/);
  });

  it('rejects only when the bundled fallback fails too', async () => {
    const warn = vi.fn();
    const custom = new FontLibrary(await folder({ drop: ['Cairo-Bold.ttf'], entries: (e) => e.family === 'Cairo' }));
    const bundled = new FontLibrary(await folder({ corrupt: ['Cairo-Bold.ttf', 'NotoSans-Regular.ttf'] }));
    const session = new FontSession(custom, warn, bundled);
    await expect(session.loadFamily('Cairo', true)).rejects.toThrow(/bundled fallback failed too/);
    await expect(session.loadFallback('Noto Sans', false)).rejects.toThrow(/bundled fallback failed too/);
    await expect(session.loadFallback('Noto Sans Arabic', false)).resolves.toMatchObject({ file: 'NotoSansArabic-Regular.ttf' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a folder without fonts.json still rejects (not a per-face problem)', async () => {
    const dir = await tempDir('wr-fonts-none-');
    await expect(run(pathToFileURL(dir).href)).rejects.toThrow(/ENOENT/);
  });
});

describe('warning fields, de-duplication, a throwing onWarning', () => {
  it('carries the weight and style of the face the PDF asked for', async () => {
    const base = await folder({ drop: ['Cairo-Bold.ttf'] });
    expect((await run(base)).warnings).toEqual([
      { code: 'FONT_FILE_UNAVAILABLE', family: 'Cairo', weight: 700, style: 'normal', url: `${base}/Cairo-Bold.ttf`, message: expect.any(String) },
    ]);
    const fb = await folder({ entries: (e) => e.family === 'Cairo' });
    const { warnings } = await run(fb, schema([text(0, AR, { font: 'Cairo' }), text(1, AR, { font: 'Cairo', bold: true })]));
    expect(warnings.map((w) => `${w.family} ${w.weight} ${w.style}`).sort()).toEqual([
      'Noto Sans 400 normal',
      'Noto Sans 700 normal',
      'Noto Sans Arabic 400 normal',
      'Noto Sans Arabic 700 normal',
    ]);
  });

  it('once per code + family (any case) + weight + url', async () => {
    const base = await folder({ drop: ['Cairo-Bold.ttf'] });
    const s = schema([text(0, AR, { font: 'Cairo', bold: true }), text(1, AR, { font: 'cairo', bold: true }), text(2, AR, { font: '"CAIRO", sans-serif', bold: true })]);
    expect((await run(base, s)).warnings).toHaveLength(1);

    const got: PdfWarning[] = [];
    const session = new FontSession(new FontLibrary(base), (w) => got.push(w));
    const warn = (session as unknown as { warn(w: Omit<PdfWarning, 'weight' | 'style'>, bold: boolean): void }).warn.bind(session);
    const w = (family: string, url: string) => ({ code: PdfWarningCode.FONT_FILE_UNAVAILABLE, message: 'm', family, url });
    warn(w('Cairo', 'a.ttf'), true);
    warn(w('cairo', 'a.ttf'), true); // same family, other case
    warn(w('Cairo', 'b.ttf'), true); // other url
    warn(w('Cairo', 'a.ttf'), false); // other weight
    warn({ ...w('Cairo', 'a.ttf'), code: PdfWarningCode.FONT_FALLBACK_MISSING }, true); // other code
    expect(got.map((x) => `${x.code} ${x.family} ${x.weight} ${x.url}`)).toEqual([
      'FONT_FILE_UNAVAILABLE Cairo 700 a.ttf',
      'FONT_FILE_UNAVAILABLE Cairo 700 b.ttf',
      'FONT_FILE_UNAVAILABLE Cairo 400 a.ttf',
      'FONT_FALLBACK_MISSING Cairo 700 a.ttf',
    ]);
  });

  it('an onWarning that throws is logged with console.error; the export still resolves', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('listener bug');
    const base = await folder({ drop: ['Cairo-Bold.ttf', 'Cairo-Regular.ttf'] });
    const blob = await exportPdf({
      schema: REPORT,
      rows: [],
      fontsBaseUrl: base,
      onWarning: () => {
        throw boom;
      },
    });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
    expect(error).toHaveBeenCalledTimes(2); // one per warning, each still reported once
    expect(error.mock.calls.every((c) => c.includes(boom))).toBe(true);
  });
});
