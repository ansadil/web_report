/**
 * Lazily loaded PDF text assets: HarfBuzz (WASM) and the faces of the shared fonts folder.
 *
 * Only ever reached through a dynamic `import()` from {@link exportPdf}, so neither the WASM
 * shaper nor any font bytes are part of the main bundle. Which file a family/weight maps to is
 * decided by the public helpers in `fonts-manifest.ts` (same as the UI).
 */
import type { ShapedGlyph, ShapingFace } from './pdf-text-layout.js';
import fontkit from '@pdf-lib/fontkit';
import { loadFontManifest, readFontAsset, resolveFontUrl, resolveFontsBaseUrl, type FontManifestEntry } from './fonts-manifest.js';
import { InvalidFontError, validateTrueType } from './pdf-font-validate.js';
import { PdfWarningCode, type PdfWarning } from './pdf-warnings.js';

type HarfBuzz = typeof import('harfbuzzjs');

let hbPromise: Promise<HarfBuzz> | null = null;

/** Load (once) the HarfBuzz WASM module. */
export function loadHarfBuzz(): Promise<HarfBuzz> {
  if (!hbPromise) {
    hbPromise = import('harfbuzzjs').catch((err: unknown) => {
      hbPromise = null;
      throw err;
    });
  }
  return hbPromise;
}

export interface LoadedFace extends ShapingFace {
  /** File name in the fonts folder (e.g. `Cairo-Bold.ttf`). */
  readonly file: string;
  readonly bytes: Uint8Array;
}

class HarfBuzzFace implements LoadedFace {
  readonly id: string;
  private readonly coverage: Set<number>;
  private readonly upem: number;
  private readonly font: InstanceType<HarfBuzz['Font']>;

  constructor(
    private readonly hb: HarfBuzz,
    readonly file: string,
    readonly bytes: Uint8Array,
    id: string,
  ) {
    this.id = id;
    const blob = new hb.Blob(bytes);
    const face = new hb.Face(blob, 0);
    this.upem = face.upem;
    this.coverage = new Set(face.collectUnicodes());
    this.font = new hb.Font(face);
  }

  hasCodePoint(cp: number): boolean {
    return this.coverage.has(cp);
  }

  shape(text: string, start: number, end: number, rtl: boolean): readonly ShapedGlyph[] {
    const hb = this.hb;
    const buf = new hb.Buffer();
    buf.addText(text, start, end - start);
    buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    buf.guessSegmentProperties();
    // One cluster per character (marks keep their own cluster) so every glyph can be mapped
    // back to exactly the characters it draws (ToUnicode).
    buf.setClusterLevel(hb.ClusterLevel.MONOTONE_CHARACTERS);
    hb.shape(this.font, buf);
    const infos = buf.getGlyphInfos();
    const pos = buf.getGlyphPositions();
    const u = this.upem;
    return infos.map((g, i) => ({
      gid: g.codepoint,
      cluster: g.cluster,
      xAdvance: pos[i]!.xAdvance / u,
      xOffset: pos[i]!.xOffset / u,
      yOffset: pos[i]!.yOffset / u,
    }));
  }
}

/**
 * One fonts folder and the faces loaded from it, each fetched at most once and only when a
 * report asks for it. Nothing outside the folder is ever requested.
 */
export class FontLibrary {
  private readonly faces = new Map<string, Promise<LoadedFace>>();

  /** @param fontsBaseUrl folder URL (trailing slash optional); default: the bundled folder. */
  constructor(readonly fontsBaseUrl?: string) {}

  manifest(): Promise<FontManifestEntry[]> {
    return loadFontManifest(this.fontsBaseUrl);
  }

  /** HarfBuzz face for an absolute font URL; rejects if the file is missing or not a font. */
  loadFace(url: string): Promise<LoadedFace> {
    let p = this.faces.get(url);
    if (!p) {
      p = (async () => {
        const [hb, bytes] = await Promise.all([loadHarfBuzz(), readFontAsset(url)]);
        assertFont(bytes, url);
        return new HarfBuzzFace(hb, url.slice(url.lastIndexOf('/') + 1), bytes, url);
      })();
      p.catch(() => this.faces.delete(url));
      this.faces.set(url, p);
    }
    return p;
  }

  /** TTF URL of `family` (name or CSS stack) at 400/700, or `null` if the manifest lacks it. */
  faceUrl(family: string, bold: boolean): Promise<string | null> {
    return resolveFontUrl({ family, weight: bold ? 700 : 400 }, { format: 'ttf', fontsBaseUrl: this.fontsBaseUrl });
  }

  /** Face of `family` (name or CSS stack) at 400/700, or `null` if the manifest lacks it. */
  async loadFamily(family: string, bold: boolean): Promise<LoadedFace | null> {
    const url = await this.faceUrl(family, bold);
    return url ? this.loadFace(url) : null;
  }
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Rejects (with the URL in the message) a file that is not a structurally sound glyf-based
 * TrueType font, before fontkit or HarfBuzz touch it (BUG-24): see {@link validateTrueType}.
 * fontkit then parses it eagerly here, inside the caller's promise, so any remaining parse
 * error rejects instead of surfacing later.
 */
function assertFont(bytes: Uint8Array, url: string): void {
  try {
    validateTrueType(bytes);
    const font = fontkit.create(bytes);
    if (!(font.numGlyphs > 0)) throw new InvalidFontError('font has no glyphs');
    // Touch the tables the PDF writer reads later (metrics, cmap, outlines of .notdef).
    void font.unitsPerEm;
    void font.bbox;
    font.glyphForCodePoint(0x20);
    void font.getGlyph(0).advanceWidth;
  } catch (err) {
    throw new Error(`PDF font asset ${url} is not a usable TrueType font: ${errorText(err)}`);
  }
}


/**
 * The faces one PDF export uses: its {@link FontLibrary} plus the fallback to the bundled
 * fonts folder when a custom `fontsBaseUrl` cannot provide a face. Each fallback is reported
 * once per face (family + weight) through `onWarning`.
 */
export class FontSession {
  private readonly warned = new Set<string>();
  private customPromise: Promise<boolean> | null = null;

  constructor(
    readonly library: FontLibrary,
    private readonly onWarning: (w: PdfWarning) => void,
    private readonly bundled: FontLibrary = fontLibrary(),
  ) {}

  manifest(): Promise<FontManifestEntry[]> {
    return this.library.manifest();
  }

  /** Whether the library is a folder other than the bundled one (only those fall back). */
  private isCustom(): Promise<boolean> {
    if (!this.customPromise) {
      const base = this.library.fontsBaseUrl;
      this.customPromise = base
        ? Promise.all([resolveFontsBaseUrl(base), resolveFontsBaseUrl(this.bundled.fontsBaseUrl)]).then(([a, b]) => a.href !== b.href)
        : Promise.resolve(false);
    }
    return this.customPromise;
  }

  private warn(w: PdfWarning, bold: boolean): void {
    const key = `${w.code}|${(w.family ?? '').toLowerCase()}|${bold ? 700 : 400}`;
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.onWarning(w);
  }

  /**
   * Face of `family` at 400/700, `null` if the manifest lacks the family. If the folder lists
   * it but its TTF is missing/unloadable, a custom folder falls back to the bundled face of
   * the family (or `null`, i.e. the Noto fallbacks, if the bundled folder lacks it) with a
   * {@link PdfWarningCode.FONT_FILE_UNAVAILABLE} warning; the bundled folder itself rejects.
   */
  async loadFamily(family: string, bold: boolean): Promise<LoadedFace | null> {
    const url = await this.library.faceUrl(family, bold);
    if (!url) return null;
    try {
      return await this.library.loadFace(url);
    } catch (err) {
      if (!(await this.isCustom())) throw err;
      const face = await this.loadBundled(family, bold, err);
      this.warn(
        {
          code: PdfWarningCode.FONT_FILE_UNAVAILABLE,
          message:
            `Font file for "${family}" ${bold ? 700 : 400} could not be loaded (${errorText(err)}); ` +
            (face ? `using the bundled ${face.file} instead.` : 'the bundled fonts have no such family, using Noto Sans Arabic / Noto Sans.'),
          family,
          url,
        },
        bold,
      );
      return face;
    }
  }

  /**
   * One of the PDF fallback families (Noto Sans Arabic / Noto Sans). A custom folder without
   * it uses the bundled face, with a {@link PdfWarningCode.FONT_FALLBACK_MISSING} warning.
   */
  async loadFallback(family: string, bold: boolean): Promise<LoadedFace> {
    const face = await this.loadFamily(family, bold);
    if (face) return face;
    if (!(await this.isCustom())) throw new Error(`fonts.json has no "${family}" face (PDF fallback font)`);
    const bundled = await this.loadBundled(family, bold, null);
    if (!bundled) throw new Error(`bundled fonts.json has no "${family}" face (PDF fallback font)`);
    const manifestUrl = `${(await resolveFontsBaseUrl(this.library.fontsBaseUrl)).href}fonts.json`;
    this.warn(
      {
        code: PdfWarningCode.FONT_FALLBACK_MISSING,
        message: `${manifestUrl} has no "${family}" ${bold ? 700 : 400} face (PDF fallback font); using the bundled ${bundled.file}.`,
        family,
        url: manifestUrl,
      },
      bold,
    );
    return bundled;
  }

  /** Bundled face of `family`, `null` if the bundled folder lacks it; rejects if it fails to load. */
  private async loadBundled(family: string, bold: boolean, cause: unknown): Promise<LoadedFace | null> {
    try {
      return await this.bundled.loadFamily(family, bold);
    } catch (e) {
      const why = cause ? `${errorText(cause)}; ` : '';
      throw new Error(`PDF font "${family}" ${bold ? 700 : 400} unavailable: ${why}bundled fallback failed too: ${errorText(e)}`);
    }
  }
}

const libraries = new Map<string, FontLibrary>();

/** Shared {@link FontLibrary} per base URL (faces are cached across exports). */
export function fontLibrary(fontsBaseUrl?: string): FontLibrary {
  const key = fontsBaseUrl ?? '';
  let lib = libraries.get(key);
  if (!lib) libraries.set(key, (lib = new FontLibrary(fontsBaseUrl || undefined)));
  return lib;
}
