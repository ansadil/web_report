// @vitest-environment node
/**
 * PDF font selection: `style.font` picks a family from fonts.json (case-insensitive, first
 * match of a CSS stack), bold picks its 700 face, unknown families fall back to Noto, and
 * `fontsBaseUrl` decides where fonts.json and the TTFs come from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { exportPdf } from './pdf.js';
import {
  DEFAULT_FONTS_BASE_URL,
  loadFontManifest,
  parseFontManifest,
  pickFontEntry,
  resolveFontFamily,
  resolveFontUrl,
  type FontManifestEntry,
} from './fonts-manifest.js';
import * as core from '../index.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

const FONTS_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));

type AnyObj = Record<string, unknown>;

function schema(elements: AnyObj[], meta: AnyObj = { name: 'T', locale: 'ar', dir: 'rtl' }): ReportSchemaV1 {
  const r = validateReport({
    version: '1',
    id: 't',
    meta,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'v', type: 'string' }],
    bands: { reportHeader: { height: elements.length * 9 + 2, elements }, detail: { height: 0, elements: [] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const text = (i: number, value: string, style: AnyObj = {}): AnyObj => ({
  id: `t${i}`,
  kind: 'text',
  value,
  pos: { x: 0, y: i * 9, w: 180, h: 8 },
  style,
});

/** BaseFont names of every font the pages use, without the subset tag. */
async function baseFonts(s: ReportSchemaV1, fontsBaseUrl?: string): Promise<string[]> {
  const blob = await exportPdf({ schema: s, rows: [], ...(fontsBaseUrl ? { fontsBaseUrl } : {}) });
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  const names = new Set<string>();
  for (const page of doc.getPages()) {
    const dict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [, ref] of dict?.entries() ?? []) {
      const f = doc.context.lookup(ref) as PDFDict;
      names.add(String(f.get(PDFName.of('BaseFont')) ?? '').replace(/^\/([A-Z]{6}\+)?/, ''));
    }
  }
  return [...names].sort();
}

const AR = 'تقرير المبيعات الشهري 2026';

describe('PDF font selection (style.font)', () => {
  it('embeds Cairo for fontFamily "Cairo", and Cairo-Bold for bold text', async () => {
    const fonts = await baseFonts(schema([text(0, AR, { font: 'Cairo' }), text(1, AR, { font: 'Cairo', bold: true })]));
    expect(fonts).toEqual(['Cairo-Bold', 'Cairo-Regular']);
  });

  it.each([
    ['Tajawal', 'Tajawal-Regular'],
    ['Noto Naskh Arabic', 'NotoNaskhArabic-Regular'],
  ])('embeds %s', async (family, expected) => {
    expect(await baseFonts(schema([text(0, AR, { font: family })]))).toEqual([expected]);
  });

  it('matches case-insensitively and takes the first known family of a CSS stack', async () => {
    const fonts = await baseFonts(
      schema([text(0, AR, { font: '"cAIRO", sans-serif' }), text(1, AR, { font: "'Unknown Font', TAJAWAL, Cairo" })]),
    );
    expect(fonts).toEqual(['Cairo-Regular', 'Tajawal-Regular']);
  });

  it('falls back to Noto Sans Arabic / Noto Sans for an unknown family', async () => {
    const fonts = await baseFonts(schema([text(0, AR, { font: 'Comic Sans MS' }), text(1, AR)]));
    // Same chain as no family at all: one merged font, Noto Sans Arabic first.
    expect(fonts).toEqual(['NotoSansArabic-Regular']);
  });

  it('a Latin-only report with a bundled family embeds it instead of Helvetica', async () => {
    const en = { name: 'T', locale: 'en', dir: 'ltr' };
    expect(await baseFonts(schema([text(0, 'Sales report', { font: 'Cairo' })], en))).toEqual(['Cairo-Regular']);
    expect(await baseFonts(schema([text(0, 'Sales report', { font: 'Comic Sans MS' })], en))).toEqual(['Helvetica']);
    expect(await baseFonts(schema([text(0, 'Sales report')], en))).toEqual(['Helvetica']);
  });
});

describe('fontsBaseUrl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads fonts.json and the TTFs from the given folder (file: URL)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wr-fonts-'));
    const manifest: FontManifestEntry[] = [
      { family: 'Brand', weight: 400, style: 'normal', ttf: 'Brand-Regular.ttf', woff2: 'Brand-Regular.woff2' },
      ...parseFontManifest(JSON.parse(await readFile(join(FONTS_DIR, 'fonts.json'), 'utf8'))).filter((e) =>
        e.family.startsWith('Noto Sans'),
      ),
    ];
    await writeFile(join(dir, 'fonts.json'), JSON.stringify(manifest));
    await copyFile(join(FONTS_DIR, 'Tajawal-Regular.ttf'), join(dir, 'Brand-Regular.ttf'));
    for (const e of manifest.slice(1)) await copyFile(join(FONTS_DIR, e.ttf), join(dir, e.ttf));

    const s = schema([text(0, AR, { font: 'Brand' })]);
    expect(await baseFonts(s, pathToFileURL(dir).href)).toEqual(['Tajawal-Regular']);
    // The bundled folder has no "Brand": the default fonts are used.
    expect(await baseFonts(s)).toEqual(['NotoSansArabic-Regular']);
  });

  it('fetches only fonts.json and the faces the report uses, only under fontsBaseUrl (http)', async () => {
    const base = 'https://cdn.example.test/report-fonts';
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (input: URL | string) => {
      const url = String(input);
      requested.push(url);
      if (!url.startsWith(`${base}/`)) return new Response(null, { status: 404 });
      const bytes = await readFile(join(FONTS_DIR, url.slice(base.length + 1)));
      return new Response(bytes);
    });
    expect(await baseFonts(schema([text(0, AR, { font: 'Cairo', bold: true })]), base)).toEqual(['Cairo-Bold']);
    expect(requested.sort()).toEqual(
      ['fonts.json', 'Cairo-Bold.ttf', 'NotoSansArabic-Bold.ttf', 'NotoSans-Bold.ttf'].map((f) => `${base}/${f}`).sort(),
    );
  });

  it('rejects when the folder has no fonts.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wr-fonts-empty-'));
    await expect(exportPdf({ schema: schema([text(0, AR)]), rows: [], fontsBaseUrl: pathToFileURL(dir).href })).rejects.toThrow();
  });
});

describe('font manifest helpers', () => {
  const m = parseFontManifest([
    { family: 'Cairo', weight: 400, style: 'normal', ttf: 'Cairo-Regular.ttf', woff2: 'Cairo-Regular.woff2' },
    { family: 'Cairo', weight: 700, style: 'normal', ttf: 'Cairo-Bold.ttf', woff2: 'Cairo-Bold.woff2' },
    { family: 'Noto Sans', weight: 400, style: 'normal', ttf: 'NotoSans-Regular.ttf', woff2: 'NotoSans-Regular.woff2' },
  ]);

  it('parseFontManifest accepts the schema and rejects malformed or unsafe entries', () => {
    expect(m).toHaveLength(3);
    const ok = { family: 'X', weight: 400, style: 'normal', ttf: 'X.ttf', woff2: 'X.woff2' };
    expect(() => parseFontManifest({})).toThrow();
    expect(() => parseFontManifest([{ ...ok, family: '' }])).toThrow();
    expect(() => parseFontManifest([{ ...ok, weight: '400' }])).toThrow();
    expect(() => parseFontManifest([{ ...ok, style: 'oblique-ish' }])).toThrow();
    expect(() => parseFontManifest([{ ...ok, ttf: '../etc/passwd' }])).toThrow();
    expect(() => parseFontManifest([{ ...ok, ttf: 'https://evil.test/x.ttf' }])).toThrow();
    expect(() => parseFontManifest([{ ...ok, woff2: 'sub/X.woff2' }])).toThrow();
  });

  it('resolveFontFamily: canonical name, CSS stacks, case-insensitive, null when unknown', () => {
    expect(resolveFontFamily('cairo', m)).toBe('Cairo');
    expect(resolveFontFamily(' "Segoe UI" , \'NOTO SANS\', sans-serif', m)).toBe('Noto Sans');
    expect(resolveFontFamily('serif', m)).toBeNull();
    expect(resolveFontFamily(undefined, m)).toBeNull();
    expect(resolveFontFamily('', m)).toBeNull();
  });

  it('pickFontEntry: nearest weight, requested style first', () => {
    expect(pickFontEntry(m, 'Cairo', 700)?.ttf).toBe('Cairo-Bold.ttf');
    expect(pickFontEntry(m, 'cairo')?.ttf).toBe('Cairo-Regular.ttf');
    expect(pickFontEntry(m, 'Cairo', 300)?.ttf).toBe('Cairo-Regular.ttf');
    expect(pickFontEntry(m, 'Cairo', 600)?.ttf).toBe('Cairo-Bold.ttf');
    expect(pickFontEntry(m, 'Cairo', 900)?.ttf).toBe('Cairo-Bold.ttf');
    expect(pickFontEntry(m, 'Noto Sans', 700)?.ttf).toBe('NotoSans-Regular.ttf');
    expect(pickFontEntry(m, 'Cairo', 400, 'italic')?.ttf).toBe('Cairo-Regular.ttf');
    expect(pickFontEntry(m, 'Nope')).toBeNull();
    const it2 = [...m, { family: 'Cairo', weight: 400, style: 'italic' as const, ttf: 'Cairo-Italic.ttf', woff2: 'Cairo-Italic.woff2' }];
    expect(pickFontEntry(it2, 'Cairo', 700, 'italic')?.ttf).toBe('Cairo-Italic.ttf');
  });
});

describe('public font helpers (DEFAULT_FONTS_BASE_URL, loadFontManifest, resolveFontUrl)', () => {
  it('are exported from the package index', () => {
    expect(core.DEFAULT_FONTS_BASE_URL).toBe(DEFAULT_FONTS_BASE_URL);
    expect(core.loadFontManifest).toBe(loadFontManifest);
    expect(core.resolveFontUrl).toBe(resolveFontUrl);
  });

  it('DEFAULT_FONTS_BASE_URL is the bundled assets/fonts/ folder', () => {
    expect(DEFAULT_FONTS_BASE_URL).toMatch(/\/assets\/fonts\/$/);
    expect(fileURLToPath(DEFAULT_FONTS_BASE_URL)).toBe(FONTS_DIR);
  });

  it('loadFontManifest reads the bundled fonts.json once (cached per base URL)', async () => {
    const a = await loadFontManifest();
    expect(a.map((e) => e.family)).toContain('Cairo');
    expect(await loadFontManifest()).toBe(a);
    expect(await loadFontManifest(DEFAULT_FONTS_BASE_URL)).toBe(a);
    expect(await loadFontManifest(DEFAULT_FONTS_BASE_URL.slice(0, -1))).toBe(a); // no trailing slash
  });

  it('resolveFontUrl: ttf/woff2 URL under the base, stack + case-insensitive, nearest weight, null if unknown', async () => {
    expect(await resolveFontUrl({ family: 'Cairo' }, { format: 'ttf' })).toBe(`${DEFAULT_FONTS_BASE_URL}Cairo-Regular.ttf`);
    expect(await resolveFontUrl({ family: '"cairo", sans-serif', weight: 800 }, { format: 'woff2' })).toBe(
      `${DEFAULT_FONTS_BASE_URL}Cairo-Bold.woff2`,
    );
    expect(await resolveFontUrl({ family: 'Unknown, TAJAWAL', weight: 500 }, { format: 'ttf' })).toBe(
      `${DEFAULT_FONTS_BASE_URL}Tajawal-Regular.ttf`,
    );
    expect(await resolveFontUrl({ family: 'noto naskh arabic', style: 'italic' }, { format: 'ttf' })).toBe(
      `${DEFAULT_FONTS_BASE_URL}NotoNaskhArabic-Regular.ttf`,
    );
    expect(await resolveFontUrl({ family: 'Comic Sans MS, serif' }, { format: 'ttf' })).toBeNull();
  });

  it('resolveFontUrl honours fontsBaseUrl (fetch, http)', async () => {
    const base = 'https://cdn.example.test/ui-fonts/';
    const json = await readFile(join(FONTS_DIR, 'fonts.json'));
    const fetchMock = vi.fn(async (url: string) => (url === `${base}fonts.json` ? new Response(json) : new Response(null, { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(await resolveFontUrl({ family: 'Tajawal', weight: 700 }, { format: 'woff2', fontsBaseUrl: base })).toBe(
        `${base}Tajawal-Bold.woff2`,
      );
      expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([`${base}fonts.json`]);
      await expect(loadFontManifest('https://cdn.example.test/missing/')).rejects.toThrow(/404/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('fontsBaseUrl: file:// (Node, offline) vs http(s)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A copy of the bundled folder in a fresh tmp dir (a fresh cache key per test). */
  async function folderCopy(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'wr-fonts-file-'));
    const manifest = parseFontManifest(JSON.parse(await readFile(join(FONTS_DIR, 'fonts.json'), 'utf8')));
    await copyFile(join(FONTS_DIR, 'fonts.json'), join(dir, 'fonts.json'));
    for (const e of manifest) await copyFile(join(FONTS_DIR, e.ttf), join(dir, e.ttf));
    return dir;
  }

  /** Any network access fails the test. */
  function noNetwork() {
    const fetchMock = vi.fn(async (input: unknown) => {
      throw new Error(`network disabled in this test: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('loadFontManifest + resolveFontUrl read a file:// folder from disk, never fetch', async () => {
    const dir = await folderCopy();
    const base = pathToFileURL(dir).href + '/';
    const fetchMock = noNetwork();
    const m = await loadFontManifest(base);
    expect(m.map((e) => e.family)).toContain('Tajawal');
    expect(await resolveFontUrl({ family: 'tajawal', weight: 700 }, { format: 'ttf', fontsBaseUrl: base })).toBe(`${base}Tajawal-Bold.ttf`);
    expect(await resolveFontUrl({ family: 'Cairo' }, { format: 'woff2', fontsBaseUrl: base.slice(0, -1) })).toBe(`${base}Cairo-Regular.woff2`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the PDF exporter embeds fonts from a file:// folder with fetch disabled', async () => {
    const dir = await folderCopy();
    const fetchMock = noNetwork();
    const s = schema([text(0, AR, { font: 'Cairo' }), text(1, AR, { font: 'Tajawal', bold: true }), text(2, AR)]);
    expect(await baseFonts(s, pathToFileURL(dir).href)).toEqual(['Cairo-Regular', 'NotoSansArabic-Regular', 'Tajawal-Bold']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the bundled default folder (file: in Node) works with fetch disabled', async () => {
    const fetchMock = noNetwork();
    expect(DEFAULT_FONTS_BASE_URL.startsWith('file:')).toBe(true);
    expect(await baseFonts(schema([text(0, AR, { font: 'Noto Naskh Arabic' })]))).toEqual(['NotoNaskhArabic-Regular']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('in Node a plain path (absolute or relative to cwd) is a file: folder', async () => {
    const dir = await folderCopy();
    const fetchMock = noNetwork();
    const want = `${pathToFileURL(dir).href}/Cairo-Bold.ttf`;
    expect(await resolveFontUrl({ family: 'Cairo', weight: 700 }, { format: 'ttf', fontsBaseUrl: dir })).toBe(want);
    expect(await resolveFontUrl({ family: 'Cairo', weight: 700 }, { format: 'ttf', fontsBaseUrl: relative(process.cwd(), dir) })).toBe(want);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a missing file:// folder rejects (no fetch fallback)', async () => {
    const fetchMock = noNetwork();
    await expect(loadFontManifest(pathToFileURL(join(tmpdir(), 'wr-fonts-missing-dir')).href)).rejects.toThrow(/ENOENT/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an http(s) base uses fetch (and only fetch)', async () => {
    const base = 'https://fonts.example.test/v1/';
    const json = await readFile(join(FONTS_DIR, 'fonts.json'));
    const fetchMock = vi.fn(async (url: string) => (url === `${base}fonts.json` ? new Response(json) : new Response(null, { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadFontManifest(base)).length).toBeGreaterThan(0);
    expect(await resolveFontUrl({ family: 'Noto Naskh Arabic' }, { format: 'woff2', fontsBaseUrl: base })).toBe(`${base}NotoNaskhArabic-Regular.woff2`);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([`${base}fonts.json`]);
  });
});
