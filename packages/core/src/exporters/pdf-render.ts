import {
  PDFDocument,
  PDFName,
  PDFOperator,
  StandardFonts,
  beginMarkedContent,
  beginText,
  degrees,
  endMarkedContent,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setGraphicsState,
  setTextMatrix,
  setTextRise,
  showText,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { MM_TO_PT, isRtlLocale } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { interpret } from '../engine/interpreter.js';
import type { RenderElement, RenderSection, RenderTree, RenderWatermark } from '../engine/interpreter.js';
import { logger } from '../logging/logger.js';
import { hasPageTokens, replacePageTokens } from '../engine/page-tokens.js';
import { stripHtmlToPlainText } from '../engine/template-fields.js';
import { TextLayouter, wrapText, type FaceChain, type LaidOutLine } from './pdf-text-layout.js';
import { FontSession, fontLibrary, type LoadedFace } from './pdf-fonts.js';
import { defaultPdfWarning } from './pdf-warnings.js';
import { FALLBACK_ARABIC_FAMILY, FALLBACK_LATIN_FAMILY, resolveFontFamily, type FontManifestEntry } from './fonts-manifest.js';
import { CidFontWriter, advancelessForExtractors, cidHex } from './pdf-cid-font.js';
import type { PdfExportInput } from './pdf.js';
import { drawBarcodeBars, drawImageContain, drawQr, embedRaster, encodeBarcode, loadImageBytes } from './pdf-graphics.js';

function toRgb(hex: string): RGB {
  const c = parseColor(hex);
  return rgb(c.r, c.g, c.b);
}

const imageCache = new WeakMap<PDFDocument, Map<string, Promise<PDFImage | null>>>();

/** Embed each distinct image source once per document. */
function cachedImage(pdf: PDFDocument, src: string): Promise<PDFImage | null> {
  let byDoc = imageCache.get(pdf);
  if (!byDoc) imageCache.set(pdf, (byDoc = new Map()));
  let hit = byDoc.get(src);
  if (!hit) {
    hit = loadImageBytes(src).then((b) => (b ? embedRaster(pdf, b) : null));
    byDoc.set(src, hit);
  }
  return hit;
}

function parseColor(hex?: string): { r: number; g: number; b: number } {
  if (!hex) return { r: 0, g: 0, b: 0 };
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const h = m[1]!;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

interface PageSpace {
  readonly width: number;
  readonly height: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  readonly marginLeft: number;
  readonly marginRight: number;
  readonly contentLeft: number;
  readonly contentTop: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

function pageDimsPt(size: 'A4' | 'A5' | 'Letter', orientation: 'portrait' | 'landscape'): { width: number; height: number } {
  const mm = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] }[size];
  const w = mm[0]! * MM_TO_PT;
  const h = mm[1]! * MM_TO_PT;
  return orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h };
}

function spaceFromSchema(schema: ReportSchemaV1): PageSpace {
  const { width, height } = pageDimsPt(schema.page.size, schema.page.orientation);
  const mt = schema.page.margins.top * MM_TO_PT;
  const mr = schema.page.margins.right * MM_TO_PT;
  const mb = schema.page.margins.bottom * MM_TO_PT;
  const ml = schema.page.margins.left * MM_TO_PT;
  return {
    width,
    height,
    marginTop: mt,
    marginBottom: mb,
    marginLeft: ml,
    marginRight: mr,
    contentLeft: ml,
    contentTop: mt,
    contentWidth: width - ml - mr,
    contentHeight: height - mt - mb,
  };
}

interface DrawCtx {
  readonly page: PDFPage;
  readonly space: PageSpace;
  readonly originYTop: number;
  readonly dir: 'rtl' | 'ltr';
  readonly text: TextEngine;
  /** 1-based number of `page`. */
  readonly pageNo: number;
  /** Final page count once known; static texts with page tokens wait for it. */
  readonly pages: number | null;
  /** Draw calls postponed until the page count is known. */
  readonly deferred: ((pages: number) => Promise<void>)[];
  /** Report locale and digit mode for {page}/{pages}. */
  readonly locale: RenderTree['locale'];
  readonly pageNumberDigits: 'locale' | 'latn';
}

/* ------------------------------------------------------------------------------------------ */
/* Text engines                                                                                */
/* ------------------------------------------------------------------------------------------ */

interface EngineLine {
  /** Logical text of the line. */
  readonly text: string;
  /** Width in points at the size it was laid out with. */
  readonly width: number;
}

interface LayoutOptions {
  readonly bold: boolean;
  /** CSS family / stack from `style.font`; unknown families use the Noto fallback. */
  readonly family?: string | undefined;
  readonly size: number;
  /** Available width in points (Infinity = no wrapping). */
  readonly maxWidth: number;
  readonly maxLines?: number;
}

interface DrawOptions {
  readonly x: number;
  /** Baseline y. */
  readonly y: number;
  readonly size: number;
  readonly bold: boolean;
  readonly color: RGB;
  readonly opacity?: number;
  /** Rotation (degrees, counter-clockwise) around (x, y). */
  readonly rotateDeg?: number;
}

interface TextEngine {
  /** Wrap + lay out logical text. Async so fonts can be embedded on first use. */
  layout(text: string, opts: LayoutOptions): Promise<EngineLine[]>;
  draw(page: PDFPage, line: EngineLine, opts: DrawOptions): void;
  /** Called once before `pdf.save()`. */
  finalize(): Promise<void>;
}

/** Helvetica (WinAnsi) engine for purely Latin reports: no shaping/bidi needed. */
class StandardFontEngine implements TextEngine {
  private constructor(
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  static async create(pdf: PDFDocument): Promise<StandardFontEngine> {
    return new StandardFontEngine(
      await pdf.embedFont(StandardFonts.Helvetica),
      await pdf.embedFont(StandardFonts.HelveticaBold),
    );
  }

  async layout(text: string, o: LayoutOptions): Promise<EngineLine[]> {
    const font = o.bold ? this.bold : this.regular;
    const measure = (s: string): number => font.widthOfTextAtSize(s, o.size);
    return wrapText(text, measure, o.maxWidth, o.maxLines).map((t) => ({ text: t, width: measure(t) }));
  }

  draw(page: PDFPage, line: EngineLine, o: DrawOptions): void {
    if (!line.text) return;
    page.drawText(line.text, {
      x: o.x,
      y: o.y,
      size: o.size,
      font: o.bold ? this.bold : this.regular,
      color: o.color,
      ...(o.opacity != null ? { opacity: o.opacity } : {}),
      ...(o.rotateDeg ? { rotate: degrees(o.rotateDeg) } : {}),
    });
  }

  async finalize(): Promise<void> {}
}

interface UnicodeLine extends EngineLine {
  readonly laid: LaidOutLine;
  /** Where each face of the line is written (its chain's merged PDF font). */
  readonly slots: ReadonlyMap<LoadedFace, FontSlot>;
}

interface FontSlot {
  readonly writer: CidFontWriter;
  /** Source index of the face inside the writer. */
  readonly src: number;
  readonly name: string;
}

interface ChainSet {
  readonly layouter: TextLayouter;
  readonly slots: ReadonlyMap<LoadedFace, FontSlot>;
}

/**
 * /W width (1/1000 em) of a glyph extractors do not advance over (non-spacing mark, format
 * character) drawn at `x`, followed by a glyph at `nextX` (BUG-26).
 *
 * pdf.js ignores this width: it never moves its pen over such a glyph (the caller follows it
 * with a `Td`). Poppler (pdftotext) cuts a line into fragments wherever a glyph is not where
 * the previous one ended, sorts the fragments by their left edge and re-joins neighbours that
 * were drawn one after the other. A mark is usually drawn before its base and over it, i.e.
 * to the right of the base's left edge (RTL), so a zero-width box sorted after its base and
 * scrambled the word; a width reaching exactly the next glyph left the two left edges tied,
 * resolved by floating-point noise. The box therefore ends at the glyph's own x and starts
 * one unit before whichever is further left, its own x or the next glyph's: strictly between
 * the previous fragment and the next one, so the fragments keep drawing order. Negative
 * widths only reverse the box in poppler; nothing is drawn differently. When the next glyph
 * starts exactly at `x` (a zero-width format character such as U+200F inside a run) the width
 * stays 0: the run is gap-free for every extractor and needs no `Td`, so it stays one string.
 */
export function advancelessWidth(x: number, nextX: number): number {
  return nextX === x ? 0 : Math.min(nextX - x, 0) - 1;
}

/**
 * HarfBuzz engine: bidi + shaping happen once in {@link TextLayouter}; this class only
 * writes the shaped glyphs through {@link CidFontWriter} (subset fonts, exact widths,
 * logical-text ToUnicode), so pdf-lib/fontkit never re-shape or re-order anything.
 */
class HarfBuzzEngine implements TextEngine {
  /** Chains per (family, weight), created on first use; key `family|bold`. */
  private readonly chains = new Map<string, Promise<ChainSet>>();
  private readonly allWriters: CidFontWriter[] = [];
  private readonly fontKeys = new WeakMap<PDFPage, Map<CidFontWriter, PDFName>>();
  private readonly gsKeys = new WeakMap<PDFPage, Map<number, PDFName>>();

  private constructor(
    private readonly pdf: PDFDocument,
    private readonly fonts: FontSession,
    private readonly manifest: readonly FontManifestEntry[],
    private readonly rtl: boolean,
  ) {}

  static async create(pdf: PDFDocument, rtl: boolean, fonts: FontSession): Promise<HarfBuzzEngine> {
    return new HarfBuzzEngine(pdf, fonts, await fonts.manifest(), rtl);
  }

  /**
   * Chain for a requested family: the family's face first (its own Latin, digits and
   * punctuation included), then Noto Sans Arabic and Noto Sans for whatever it lacks. Unknown
   * families — and the fallback families themselves — get the default Noto chain. Fonts are
   * loaded the first time a chain is needed, so a report only fetches the faces it uses.
   */
  private chainFor(family: string | undefined, bold: boolean): Promise<ChainSet> {
    const resolved = resolveFontFamily(family, this.manifest);
    const fam = resolved === FALLBACK_ARABIC_FAMILY || resolved === FALLBACK_LATIN_FAMILY ? null : resolved;
    const key = `${fam ?? ''}|${bold ? 1 : 0}`;
    let p = this.chains.get(key);
    if (!p) {
      p = this.buildChain(fam, bold);
      this.chains.set(key, p);
    }
    return p;
  }

  private async buildChain(family: string | null, bold: boolean): Promise<ChainSet> {
    const [primary, arabic, latin] = await Promise.all([
      family ? this.fonts.loadFamily(family, bold) : Promise.resolve(null),
      this.fonts.loadFallback(FALLBACK_ARABIC_FAMILY, bold),
      this.fonts.loadFallback(FALLBACK_LATIN_FAMILY, bold),
    ]);
    const faces: LoadedFace[] = primary ? [primary, arabic, latin] : [arabic, latin];
    // First face = metrics + hinting of the merged font; the Latin fallback always keeps Basic
    // Latin and common punctuation so the embedded program stays usable beyond drawn glyphs.
    const writer = new CidFontWriter(
      this.pdf,
      faces.map((f) => (f === latin ? { font: fontkit.create(f.bytes), keep: LATIN_KEEP } : { font: fontkit.create(f.bytes) })),
    );
    this.allWriters.push(writer);
    const name = faces[0]!.file.replace(/\.ttf$/, '');
    const slots = new Map<LoadedFace, FontSlot>(faces.map((f, src) => [f, { writer, src, name }]));
    const chain: FaceChain = primary ? { primary, arabic, latin } : { arabic, latin };
    return { layouter: new TextLayouter(chain), slots };
  }

  async layout(text: string, o: LayoutOptions): Promise<EngineLine[]> {
    const { layouter, slots } = await this.chainFor(o.family, o.bold);
    const lines = layouter.wrap(text, this.rtl, o.size, o.maxWidth, o.maxLines);
    return lines.map((laid): UnicodeLine => ({ text: laid.text, width: laid.width * o.size, laid, slots }));
  }

  private fontKey(page: PDFPage, w: CidFontWriter, name: string): PDFName {
    let m = this.fontKeys.get(page);
    if (!m) this.fontKeys.set(page, (m = new Map()));
    let key = m.get(w);
    if (!key) {
      key = page.node.newFontDictionary(name, w.ref);
      m.set(w, key);
    }
    return key;
  }

  private gsKey(page: PDFPage, opacity: number): PDFName {
    let m = this.gsKeys.get(page);
    if (!m) this.gsKeys.set(page, (m = new Map()));
    let key = m.get(opacity);
    if (!key) {
      key = page.node.newExtGState('GS', this.pdf.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }));
      m.set(opacity, key);
    }
    return key;
  }

  /**
   * A line is written in visual order: the Arabic face and the Latin fallback are glyph
   * sources of the same merged PDF font, so a mixed line never switches fonts, and the PDF
   * viewer never re-orders or re-shapes anything.
   *
   * Positions (BUG-25, BUG-26): a glyph whose ToUnicode text is a format character (ZWSP for
   * the extra glyphs of a decomposed cluster, ZWNJ...) or a non-spacing mark is one text
   * extractors such as pdf.js do not advance over: unless the next glyph starts at the same
   * x, it gets a small negative width that keeps poppler's reading order (see
   * {@link advancelessWidth}) and the next glyph is positioned with `Td`. Every other glyph spans to the next spacing glyph of the
   * line as HarfBuzz placed it (the last one: its advance), never negative, so an extractor
   * sees a gap-free run and inserts no fake spaces. Wherever the pen then differs from the
   * next glyph's position, the string is ended and `Td` moves to the exact position: viewers
   * draw every glyph exactly where HarfBuzz put it (same positions as before) and extractors
   * track the same pen. Before, ZWSP-mapped dots carried non-zero (mostly negative) widths
   * that pdf.js skips, so its pen drifted right and glyphs past the page edge — the first
   * words of long RTL lines — were dropped.
   * Marks with a vertical offset are raised/lowered with `Ts` (text rise) inside the same
   * text object. A line drawn mark-first is wrapped in a `/Span` marked-content sequence.
   */
  draw(page: PDFPage, line: EngineLine, o: DrawOptions): void {
    const { laid, slots } = line as UnicodeLine;
    if (!laid || laid.glyphs.length === 0) return;
    const rad = ((o.rotateDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const r = (n: number): number => Math.round(n * 1000) / 1000;
    const ops: PDFOperator[] = [];
    const useGs = o.opacity != null && o.opacity < 1;
    if (useGs) ops.push(pushGraphicsState(), setGraphicsState(this.gsKey(page, o.opacity!)));
    // pdf.js appends a non-spacing mark to the text item that is still open, i.e. the previous
    // line's, when no spacing glyph comes first (an RTL line ending with a haraka is drawn
    // mark-first). A marked-content span makes it start a new item; viewers ignore it.
    const markFirst = advancelessForExtractors(laid.glyphs[0]!.text);
    if (markFirst) ops.push(beginMarkedContent('Span'));
    ops.push(beginText(), setFillingColor(o.color));

    // Integer positions in 1/1000 em, so widths and moves add up exactly.
    const q = (n: number): number => Math.round(n * 1000);
    // Text-space distance of `units` 1/1000 em (exact up to 1e-6, no 1e-3 rounding drift).
    const dist = (units: number): number => Math.round(units * o.size * 1000) / 1e6;
    const glyphs = laid.glyphs;
    const slot = (k: number): FontSlot => slots.get(glyphs[k]!.face as LoadedFace)!;
    let currentWriter: CidFontWriter | null = null;
    let rise = 0;
    let lineX = 0; // x of the text line matrix (Tm / last Td), 1/1000 em
    let pen = 0; // where the next glyph of the current string will be drawn, 1/1000 em
    const cids: number[] = [];
    const flush = (): void => {
      if (cids.length) ops.push(showText(cidHex(cids)));
      cids.length = 0;
    };
    for (let k = 0; k < glyphs.length; k++) {
      const g = glyphs[k]!;
      const { writer, name, src } = slot(k);
      const x = q(g.x);
      if (writer !== currentWriter) {
        flush();
        ops.push(setFontAndSize(this.fontKey(page, writer, name), o.size));
        if (currentWriter === null) {
          const gx = (x / 1000) * o.size;
          ops.push(setTextMatrix(r(cos), r(sin), r(-sin), r(cos), r(o.x + gx * cos), r(o.y + gx * sin)));
          lineX = pen = x;
        }
        currentWriter = writer;
      }
      if (x !== pen) {
        flush();
        ops.push(moveText(dist(x - lineX), 0));
        lineX = pen = x;
      }
      const wantRise = r((q(g.y) / 1000) * o.size);
      if (wantRise !== rise) {
        flush();
        ops.push(setTextRise(wantRise));
        rise = wantRise;
      }
      // A spacing glyph spans to the next spacing glyph (as HarfBuzz placed it), so extractors
      // see one gap-free run; never negative: where the pen and the next glyph differ, `Td`
      // repositions. For an advanceless glyph see `advancelessWidth`.
      const advanceless = advancelessForExtractors(g.text);
      let width: number;
      if (advanceless) {
        width = advancelessWidth(x, k + 1 < glyphs.length ? q(glyphs[k + 1]!.x) : x + q(g.advance));
      } else {
        let j = k + 1;
        while (j < glyphs.length && advancelessForExtractors(glyphs[j]!.text)) j++;
        width = Math.max(0, j < glyphs.length ? q(glyphs[j]!.x) - x : q(g.advance));
      }
      const cid = writer.cid(src, g.gid, width, g.text);
      cids.push(cid);
      // pdf.js does not move its pen over an advanceless glyph whatever its width, so after a
      // non-zero one the next glyph always starts with a `Td` (exact position) to resync it.
      pen = advanceless && width !== 0 ? Number.NaN : x + writer.widthOf(cid);
    }
    flush();
    if (rise !== 0) ops.push(setTextRise(0));
    ops.push(endText());
    if (markFirst) ops.push(endMarkedContent());
    if (useGs) ops.push(popGraphicsState());
    page.pushOperators(...ops);
  }

  async finalize(): Promise<void> {
    for (const w of this.allWriters) await w.finalize();
  }
}

/** Basic Latin + common punctuation kept in the Latin fallback subset. */
const LATIN_KEEP: readonly number[] = [
  ...Array.from({ length: 0x7f - 0x20 }, (_, k) => 0x20 + k),
  ...Array.from('–—…«»‘’“”•°©®€£¥×÷±', (c) => c.codePointAt(0)!),
];

/** Horizontal text start for a line of `lineWidth` in a box [boxX, boxX + boxW] with 2pt padding. */
export function alignedX(
  align: 'start' | 'center' | 'end' | 'justify' | undefined,
  dir: 'rtl' | 'ltr',
  boxX: number,
  boxW: number,
  lineWidth: number,
): number {
  const pad = 2;
  if (align === 'center') return boxX + (boxW - lineWidth) / 2;
  const physicalRight = dir === 'rtl' ? align !== 'end' : align === 'end';
  return physicalRight ? boxX + boxW - lineWidth - pad : boxX + pad;
}

async function drawElement(ctx: DrawCtx, el: RenderElement, sectionTopMm: number, sectionHeightMm: number): Promise<void> {
  // Static template text may use {page}/{pages}; data values (field/aggregate/expr) never are.
  if (ctx.pages === null && (el.kind === 'text' || el.kind === 'richtext')) {
    const raw = el.kind === 'richtext' ? el.html : el.text;
    if (hasPageTokens(raw)) {
      ctx.deferred.push((pages) => drawElement({ ...ctx, pages }, el, sectionTopMm, sectionHeightMm));
      return;
    }
  }
  const x = el.pos.x * MM_TO_PT;
  const y = el.pos.y * MM_TO_PT;
  const w = el.pos.w * MM_TO_PT;
  const h = el.pos.h * MM_TO_PT;
  const isRtl = ctx.dir === 'rtl';
  const ptX = isRtl
    ? ctx.space.contentLeft + ctx.space.contentWidth - x - w
    : ctx.space.contentLeft + x;
  const ptYTop = ctx.originYTop - y;
  const ptYBottom = ptYTop - h;
  void sectionTopMm;
  void sectionHeightMm;

  if (el.style?.background) {
    const c = parseColor(el.style.background);
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, color: rgb(c.r, c.g, c.b) });
  }
  if (el.style?.border) {
    const b = el.style.border;
    const c = parseColor(b.color);
    if (b.top) ctx.page.drawLine({ start: { x: ptX, y: ptYTop }, end: { x: ptX + w, y: ptYTop }, thickness: b.top, color: rgb(c.r, c.g, c.b) });
    if (b.bottom) ctx.page.drawLine({ start: { x: ptX, y: ptYBottom }, end: { x: ptX + w, y: ptYBottom }, thickness: b.bottom, color: rgb(c.r, c.g, c.b) });
    if (b.left) ctx.page.drawLine({ start: { x: ptX, y: ptYBottom }, end: { x: ptX, y: ptYTop }, thickness: b.left, color: rgb(c.r, c.g, c.b) });
    if (b.right) ctx.page.drawLine({ start: { x: ptX + w, y: ptYBottom }, end: { x: ptX + w, y: ptYTop }, thickness: b.right, color: rgb(c.r, c.g, c.b) });
  }

  if (el.kind === 'text' || el.kind === 'field' || el.kind === 'aggregate' || el.kind === 'expr' || el.kind === 'richtext') {
    let text = el.kind === 'richtext' ? stripHtmlToPlainText(el.html ?? '') : (el.text ?? '');
    if (ctx.pages !== null && (el.kind === 'text' || el.kind === 'richtext')) {
      text = replacePageTokens(text, {
        page: ctx.pageNo,
        pages: ctx.pages,
        locale: ctx.locale,
        digits: ctx.pageNumberDigits,
      });
    }
    if (!text) return;
    const bold = !!el.style?.bold;
    const size = el.style?.fontSize ?? 10;
    const color = parseColor(el.style?.color);
    const lineHeight = size * 1.2;
    // First baseline sits `size + 2` below the box top; further lines every `lineHeight`.
    // Lines whose baseline would fall below the box bottom are clipped (at least one is drawn).
    const maxLines = Math.max(1, Math.floor((h - size - 2) / lineHeight) + 1);
    const lines = await ctx.text.layout(text, { bold, family: el.style?.font, size, maxWidth: Math.max(1, w - 4), maxLines });
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineY = ptYTop - size - i * lineHeight - 2;
      const textX = alignedX(el.style?.align, ctx.dir, ptX, w, line.width);
      ctx.text.draw(ctx.page, line, { x: textX, y: lineY, size, bold, color: rgb(color.r, color.g, color.b) });
    }
    return;
  }

  if (el.kind === 'line') {
    const line = el.line ?? { orientation: 'horizontal' as const, thickness: 1 };
    const c = parseColor(line.color);
    const stroke = rgb(c.r, c.g, c.b);
    const t = Math.max(0.25, line.thickness ?? 1);
    if (line.orientation === 'vertical') {
      const cx = ptX + w / 2;
      ctx.page.drawLine({
        start: { x: cx, y: ptYBottom },
        end: { x: cx, y: ptYTop },
        thickness: t,
        color: stroke,
      });
    } else {
      const cy = ptYBottom + h / 2;
      ctx.page.drawLine({
        start: { x: ptX, y: cy },
        end: { x: ptX + w, y: cy },
        thickness: t,
        color: stroke,
      });
    }
    return;
  }

  if (el.kind === 'box') {
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0.6, 0.6, 0.6) });
    return;
  }

  if (el.kind === 'image') {
    const img = el.src ? await cachedImage(ctx.page.doc, el.src) : null;
    if (img) {
      drawImageContain(ctx.page, img, { x: ptX, y: ptYBottom, w, h });
    } else {
      ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.25, borderColor: rgb(0.7, 0.7, 0.7) });
      if (el.src) logger.warn('pdf', 'image not embeddable (only PNG/JPEG data or URLs)', { id: el.id });
    }
    return;
  }

  if ((el.kind === 'qr' || el.kind === 'barcode') && el.code) {
    const box = { x: ptX, y: ptYBottom, w, h };
    const dark = el.style?.color ? toRgb(el.style.color) : undefined;
    const light = el.style?.background ? toRgb(el.style.background) : undefined;
    if (el.code.kind === 'qr') {
      drawQr(ctx.page, el.code.payload, box, {
        ...(el.code.errorCorrectionLevel ? { errorCorrectionLevel: el.code.errorCorrectionLevel } : {}),
        ...(dark ? { dark } : {}),
        ...(light ? { light } : {}),
      });
      return;
    }
    const enc = encodeBarcode(el.code.payload, el.code.symbology ?? 'CODE128');
    if (!enc) {
      logger.warn('pdf', 'barcode payload invalid for symbology', { id: el.id, symbology: el.code.symbology });
      return;
    }
    const showText = el.code.displayValue !== false && h >= 14;
    const textSize = Math.min(8, h * 0.25);
    drawBarcodeBars(ctx.page, enc.bars, box, showText ? textSize + 2 : 0, dark, light);
    if (showText) {
      const [line] = await ctx.text.layout(enc.text, { bold: false, family: el.style?.font, size: textSize, maxWidth: Math.max(1, w - 4), maxLines: 1 });
      if (line) {
        ctx.text.draw(ctx.page, line, {
          x: alignedX('center', 'ltr', ptX, w, line.width),
          y: ptYBottom + 1,
          size: textSize,
          bold: false,
          color: dark ?? rgb(0, 0, 0),
        });
      }
    }
    return;
  }

  if (el.kind === 'chart') {
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.25, borderColor: rgb(0.7, 0.7, 0.7) });
    const chart = el.chart;
    if (chart && chart.values.length > 0) {
      const max = Math.max(1, ...chart.values);
      const n = chart.values.length;
      const barW = (w - 8) / n;
      const baseY = ptYBottom + 4;
      const topY = ptYTop - 4;
      for (let i = 0; i < n; i++) {
        const v = chart.values[i]!;
        const bh = ((v / max) * (topY - baseY)) || 0;
        ctx.page.drawRectangle({ x: ptX + 4 + i * barW + 1, y: baseY, width: Math.max(0, barW - 2), height: Math.max(0, bh), color: rgb(0.15, 0.39, 0.92) });
      }
      if (chart.title) {
        await drawLabel(ctx, chart.title, ptX + 2, ptYTop - 10, w - 4, 8, true, rgb(0.2, 0.2, 0.2), el.style?.font);
      }
    }
    return;
  }
}

/** Single-line label (no wrap beyond the box; extra text is clipped to one line). */
async function drawLabel(ctx: DrawCtx, text: string, boxX: number, y: number, boxW: number, size: number, bold: boolean, color: RGB, family?: string): Promise<void> {
  const [line] = await ctx.text.layout(text, { bold, family, size, maxWidth: Math.max(1, boxW - 4), maxLines: 1 });
  if (!line) return;
  ctx.text.draw(ctx.page, line, { x: alignedX(undefined, ctx.dir, boxX, boxW, line.width), y, size, bold, color });
}

interface QueuedSection {
  readonly section: RenderSection;
  readonly heightPt: number;
}

/** Arabic / Arabic supplement / presentation forms / Arabic Extended-A (incl. Arabic-Indic digits). */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Characters Helvetica/WinAnsi can encode (Latin-1 + the CP1252 extras). Tab, LF, and CR are in that set. */
const NON_WINANSI_RE =
  // eslint-disable-next-line no-control-regex -- WinAnsi allows U+0009, U+000A, and U+000D
  /[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201A\u201C-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/;

function needsUnicodePdfFont(tree: RenderTree, schema: ReportSchemaV1): boolean {
  if (isRtlLocale(schema.meta.locale) || tree.dir === 'rtl') return true;
  const scan = (s: string | undefined): boolean => !!(s && (ARABIC_SCRIPT_RE.test(s) || NON_WINANSI_RE.test(s)));
  if (tree.watermark?.kind === 'text' && scan(tree.watermark.text)) return true;
  for (const s of tree.sections) {
    for (const el of s.elements) {
      if ('text' in el && scan(el.text)) return true;
      if (el.kind === 'richtext' && scan(stripHtmlToPlainText(el.html ?? ''))) return true;
      if (el.kind === 'chart') {
        const ch = el.chart;
        if (ch && scan(ch.title)) return true;
        if (ch?.labels?.some((lb) => scan(String(lb)))) return true;
      }
    }
  }
  return false;
}

/** `style.font` values of the text-bearing elements. */
function requestedFamilies(tree: RenderTree): string[] {
  const out = new Set<string>();
  for (const s of tree.sections) for (const el of s.elements) if (el.style?.font?.trim()) out.add(el.style.font);
  return [...out];
}

/**
 * A Latin-only report that names a family from fonts.json must still embed that family (not
 * Helvetica). The manifest is only read when some element sets `style.font`; if it cannot be
 * read the report keeps Helvetica.
 */
async function usesBundledFamily(tree: RenderTree, fonts: FontSession): Promise<boolean> {
  const families = requestedFamilies(tree);
  if (families.length === 0) return false;
  try {
    const manifest = await fonts.manifest();
    return families.some((f) => resolveFontFamily(f, manifest) !== null);
  } catch (e) {
    logger.warn('pdf', 'fonts.json unavailable; using the standard PDF font', { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export async function renderPdf({ schema, rows, fontsBaseUrl, onWarning }: PdfExportInput): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const tree = interpret({ schema, rows });
  const fonts = new FontSession(fontLibrary(fontsBaseUrl), onWarning ?? defaultPdfWarning);
  const useUnicode = needsUnicodePdfFont(tree, schema) || (await usesBundledFamily(tree, fonts));
  /**
   * Paragraph base direction for bidi and layout. An explicit template/host `dir` always wins (BUG-21: Arabic +
   * `dir: 'ltr'` must stay LTR). Validated schemas always carry `meta.dir` (the schema defaults it from the locale);
   * the locale fallback only covers unvalidated input where `dir` is missing.
   */
  const paragraphBaseDir: 'ltr' | 'rtl' =
    tree.dir ?? (isRtlLocale(schema.meta.locale) ? 'rtl' : 'ltr');
  const text: TextEngine = useUnicode
    ? await HarfBuzzEngine.create(pdf, paragraphBaseDir === 'rtl', fonts)
    : await StandardFontEngine.create(pdf);
  const space = spaceFromSchema(schema);
  const queued: QueuedSection[] = tree.sections.map((s) => ({ section: s, heightPt: s.height * MM_TO_PT }));

  const drawWatermark = async (target: PDFPage, wm: RenderWatermark): Promise<void> => {
    if (wm.kind === 'text') {
      const c = parseColor(wm.color);
      const size = wm.fontSize;
      const [line] = await text.layout(wm.text, { bold: true, size, maxWidth: Infinity, maxLines: 1 });
      if (!line) return;
      // Rotate around the page centre: start point = centre − R·(width/2, size/3).
      const rad = (wm.rotation * Math.PI) / 180;
      const dx = line.width / 2;
      const dy = size / 3;
      text.draw(target, line, {
        x: space.width / 2 - (dx * Math.cos(rad) - dy * Math.sin(rad)),
        y: space.height / 2 - (dx * Math.sin(rad) + dy * Math.cos(rad)),
        size,
        bold: true,
        color: rgb(c.r, c.g, c.b),
        opacity: wm.opacity,
        rotateDeg: wm.rotation,
      });
      return;
    }
    const img = await cachedImage(pdf, wm.src);
    if (!img) return;
    const w = wm.width * MM_TO_PT;
    const h = (img.height / img.width) * w;
    // Rotate around the image centre (same convention as the text watermark).
    const rad = (wm.rotation * Math.PI) / 180;
    target.drawImage(img, {
      x: space.width / 2 - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad),
      y: space.height / 2 - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad),
      width: w,
      height: h,
      opacity: wm.opacity,
      rotate: degrees(wm.rotation),
    });
  };

  let page = pdf.addPage([space.width, space.height]);
  let yTop = space.height - space.marginTop;
  let pageNumber = 1;
  /** Whether the page header has been placed on the current page. */
  let headerDrawn = false;
  const deferred: ((pages: number) => Promise<void>)[] = [];
  const ctxAt = (originYTop: number): DrawCtx => ({
    page,
    space,
    originYTop,
    dir: paragraphBaseDir,
    text,
    pageNo: pageNumber,
    pages: null,
    deferred,
    locale: tree.locale,
    pageNumberDigits: tree.pageNumberDigits ?? 'locale',
  });
  if (tree.watermark) await drawWatermark(page, tree.watermark);

  const pageHeader = queued.find((q) => q.section.band === 'pageHeader');
  const pageFooter = queued.find((q) => q.section.band === 'pageFooter');
  const headerHeight = pageHeader?.heightPt ?? 0;
  const footerHeight = pageFooter?.heightPt ?? 0;

  /** Page header goes at the current position: top of the page, or below the report header on page 1. */
  const placeHeader = async (): Promise<void> => {
    if (headerDrawn) return;
    headerDrawn = true;
    if (!pageHeader) return;
    const ctx = ctxAt(yTop);
    for (const el of pageHeader.section.elements) await drawElement(ctx, el, 0, pageHeader.section.height);
    yTop -= headerHeight;
  };

  const finishPage = async (): Promise<void> => {
    await placeHeader();
    if (pageFooter) {
      const ctx = ctxAt(space.marginBottom + footerHeight);
      for (const el of pageFooter.section.elements) await drawElement(ctx, el, 0, pageFooter.section.height);
    }
  };

  const newPage = async (): Promise<void> => {
    await finishPage();
    page = pdf.addPage([space.width, space.height]);
    yTop = space.height - space.marginTop;
    pageNumber++;
    headerDrawn = false;
    if (tree.watermark) await drawWatermark(page, tree.watermark);
  };

  const drawSection = async (q: QueuedSection): Promise<void> => {
    const availableBottom = space.marginBottom + footerHeight;
    const isReportHeader = q.section.band === 'reportHeader';
    const pending = !headerDrawn && !isReportHeader ? headerHeight : 0;
    if (q.section.pageBreakBefore || yTop - pending - q.heightPt < availableBottom) {
      await newPage();
    }
    // Report header comes first on page 1; the page header follows it (and tops every later page).
    if (!isReportHeader) await placeHeader();
    const ctx = ctxAt(yTop);
    for (const el of q.section.elements) await drawElement(ctx, el, 0, q.section.height);
    yTop -= q.heightPt;
    if (q.section.pageBreakAfter) await newPage();
  };

  for (const q of queued) {
    if (q.section.band === 'pageHeader' || q.section.band === 'pageFooter') continue;
    await drawSection(q);
  }
  await finishPage();
  // Page tokens need the final page count, so those texts are drawn last.
  const totalPages = pdf.getPageCount();
  for (const draw of deferred) await draw(totalPages);
  await text.finalize();

  const bytes = await pdf.save();
  logger.info('pdf-exporter', 'pdf generated', { pages: pdf.getPageCount(), bytes: bytes.byteLength });
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: 'application/pdf' });
}
