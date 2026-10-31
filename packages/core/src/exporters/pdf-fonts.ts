/**
 * Lazily loaded PDF text assets: HarfBuzz (WASM) and the bundled OFL fonts.
 *
 * Only ever reached through a dynamic `import()` from {@link exportPdf}, so neither the
 * WASM shaper nor the font bytes are part of the main bundle. Works in Node (fs) and
 * browsers (fetch relative to `import.meta.url`).
 */
import type { ShapedGlyph, ShapingFace } from './pdf-text-layout.js';

export type PdfFontFile =
  | 'NotoSansArabic-Regular.ttf'
  | 'NotoSansArabic-Bold.ttf'
  | 'NotoSans-Regular.ttf'
  | 'NotoSans-Bold.ttf';

export async function loadFontBytes(fileName: PdfFontFile): Promise<Uint8Array> {
  const isNode = typeof process !== 'undefined' && process.versions?.node != null;
  if (isNode) {
    const { createRequire } = await import('node:module');
    const { readFile } = await import('node:fs/promises');
    const req = createRequire(import.meta.url);
    const resolved = req.resolve(`./fonts/${fileName}`);
    return new Uint8Array(await readFile(resolved));
  }
  const url = new URL(`./fonts/${fileName}`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load PDF font ${fileName}: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

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
  readonly file: PdfFontFile;
  readonly bytes: Uint8Array;
}

class HarfBuzzFace implements LoadedFace {
  readonly id: string;
  private readonly coverage: Set<number>;
  private readonly upem: number;
  private readonly font: InstanceType<HarfBuzz['Font']>;

  constructor(
    private readonly hb: HarfBuzz,
    readonly file: PdfFontFile,
    readonly bytes: Uint8Array,
  ) {
    this.id = file;
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

const faceCache = new Map<PdfFontFile, Promise<LoadedFace>>();

export function loadFace(file: PdfFontFile): Promise<LoadedFace> {
  let p = faceCache.get(file);
  if (!p) {
    p = (async () => {
      const [hb, bytes] = await Promise.all([loadHarfBuzz(), loadFontBytes(file)]);
      return new HarfBuzzFace(hb, file, bytes);
    })();
    p.catch(() => faceCache.delete(file));
    faceCache.set(file, p);
  }
  return p;
}
