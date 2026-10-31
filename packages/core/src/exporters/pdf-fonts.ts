/**
 * Lazily loaded PDF text assets: HarfBuzz (WASM) and the faces of the shared fonts folder.
 *
 * Only ever reached through a dynamic `import()` from {@link exportPdf}, so neither the WASM
 * shaper nor any font bytes are part of the main bundle. Which file a family/weight maps to is
 * decided by the public helpers in `fonts-manifest.ts` (same as the UI).
 */
import type { ShapedGlyph, ShapingFace } from './pdf-text-layout.js';
import { loadFontManifest, readFontAsset, resolveFontUrl, type FontManifestEntry } from './fonts-manifest.js';

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

  /** HarfBuzz face for an absolute font URL. */
  private loadFace(url: string): Promise<LoadedFace> {
    let p = this.faces.get(url);
    if (!p) {
      p = (async () => {
        const [hb, bytes] = await Promise.all([loadHarfBuzz(), readFontAsset(url)]);
        return new HarfBuzzFace(hb, url.slice(url.lastIndexOf('/') + 1), bytes, url);
      })();
      p.catch(() => this.faces.delete(url));
      this.faces.set(url, p);
    }
    return p;
  }

  /** Face of `family` (name or CSS stack) at 400/700, or `null` if the manifest lacks it. */
  async loadFamily(family: string, bold: boolean): Promise<LoadedFace | null> {
    const url = await resolveFontUrl({ family, weight: bold ? 700 : 400 }, { format: 'ttf', fontsBaseUrl: this.fontsBaseUrl });
    return url ? this.loadFace(url) : null;
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
