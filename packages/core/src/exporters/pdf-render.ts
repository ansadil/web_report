import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  beginText,
  degrees,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setGraphicsState,
  setTextMatrix,
  showText,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { MM_TO_PT } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { interpret } from '../engine/interpreter.js';
import type { RenderElement, RenderSection, RenderTree, RenderWatermark } from '../engine/interpreter.js';
import { logger } from '../logging/logger.js';
import { tryEvaluate } from '../engine/expression.js';
import { stripHtmlToPlainText } from '../engine/template-fields.js';
import { TextLayouter, wrapText, type FaceChain, type LaidOutLine } from './pdf-text-layout.js';
import { loadFace, type LoadedFace } from './pdf-fonts.js';
import { CidFontWriter, cidHex } from './pdf-cid-font.js';
import type { PdfExportInput } from './pdf.js';

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
}

/**
 * HarfBuzz engine: bidi + shaping happen once in {@link TextLayouter}; this class only
 * writes positioned glyph ids (Identity-H CIDs == glyph ids since fonts are not subset),
 * so pdf-lib/fontkit never re-shape or re-order anything. Each line is wrapped in a
 * `/Span <</ActualText …>> BDC … EMC` so copy/paste and text extraction yield the logical text.
 */
class HarfBuzzEngine implements TextEngine {
  private readonly layouters: { regular: TextLayouter; bold: TextLayouter };
  private readonly writers = new Map<LoadedFace, CidFontWriter>();
  private readonly fontKeys = new WeakMap<PDFPage, Map<CidFontWriter, PDFName>>();
  private readonly gsKeys = new WeakMap<PDFPage, Map<number, PDFName>>();

  private constructor(
    private readonly pdf: PDFDocument,
    chains: { regular: FaceChain; bold: FaceChain },
    private readonly latinFaces: ReadonlySet<LoadedFace>,
    private readonly rtl: boolean,
  ) {
    this.layouters = { regular: new TextLayouter(chains.regular), bold: new TextLayouter(chains.bold) };
  }

  static async create(pdf: PDFDocument, rtl: boolean): Promise<HarfBuzzEngine> {
    const [ar, arB, lat, latB] = await Promise.all([
      loadFace('NotoSansArabic-Regular.ttf'),
      loadFace('NotoSansArabic-Bold.ttf'),
      loadFace('NotoSans-Regular.ttf'),
      loadFace('NotoSans-Bold.ttf'),
    ]);
    return new HarfBuzzEngine(
      pdf,
      { regular: { arabic: ar, latin: lat }, bold: { arabic: arB, latin: latB } },
      new Set([lat, latB]),
      rtl,
    );
  }

  private writer(face: LoadedFace): CidFontWriter {
    let w = this.writers.get(face);
    if (!w) {
      // The Latin fallback always keeps Basic Latin + common punctuation so the embedded
      // program remains usable (e.g. by form fields / editors) beyond the drawn glyphs.
      const keep = this.latinFaces.has(face) ? LATIN_KEEP : [];
      w = new CidFontWriter(this.pdf, fontkit.create(face.bytes), face.bytes, keep);
      this.writers.set(face, w);
    }
    return w;
  }

  async layout(text: string, o: LayoutOptions): Promise<EngineLine[]> {
    const layouter = o.bold ? this.layouters.bold : this.layouters.regular;
    const lines = layouter.wrap(text, this.rtl, o.size, o.maxWidth, o.maxLines);
    return lines.map((laid): UnicodeLine => ({ text: laid.text, width: laid.width * o.size, laid }));
  }

  private fontKey(page: PDFPage, w: CidFontWriter, face: LoadedFace): PDFName {
    let m = this.fontKeys.get(page);
    if (!m) this.fontKeys.set(page, (m = new Map()));
    let key = m.get(w);
    if (!key) {
      key = page.node.newFontDictionary(face.file.replace(/\.ttf$/, ''), w.ref);
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
   * Glyphs are written in visual order as few `Tj` strings as possible: a run continues while
   * the face stays the same and glyphs sit on the baseline. Each glyph gets a CID whose width
   * equals the distance to the next glyph, so the PDF viewer reproduces HarfBuzz' positions
   * exactly and never re-orders or re-shapes anything. Marks with a vertical offset start a
   * new positioned string.
   */
  draw(page: PDFPage, line: EngineLine, o: DrawOptions): void {
    const laid = (line as UnicodeLine).laid;
    if (!laid || laid.glyphs.length === 0) return;
    const rad = ((o.rotateDeg ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const r = (n: number): number => Math.round(n * 1000) / 1000;
    const ops: PDFOperator[] = [];
    const useGs = o.opacity != null && o.opacity < 1;
    if (useGs) ops.push(pushGraphicsState(), setGraphicsState(this.gsKey(page, o.opacity!)));
    ops.push(beginText(), setFillingColor(o.color));

    // Integer positions in 1/1000 em, so run widths add up exactly.
    const q = (n: number): number => Math.round(n * 1000);
    const glyphs = laid.glyphs;
    let currentWriter: CidFontWriter | null = null;
    let i = 0;
    while (i < glyphs.length) {
      const first = glyphs[i]!;
      const face = first.face as LoadedFace;
      const writer = this.writer(face);
      const onBaseline = q(first.y) === 0;
      let j = i + 1;
      if (onBaseline) {
        while (j < glyphs.length && glyphs[j]!.face === face && q(glyphs[j]!.y) === 0) j++;
      }
      const cids: number[] = [];
      for (let k = i; k < j; k++) {
        const g = glyphs[k]!;
        // Last glyph of a run: its own advance (the next run is positioned explicitly).
        const width = k + 1 < j ? q(glyphs[k + 1]!.x) - q(g.x) : q(g.advance);
        cids.push(writer.cid(g.gid, width, g.text));
      }
      if (writer !== currentWriter) {
        ops.push(setFontAndSize(this.fontKey(page, writer, face), o.size));
        currentWriter = writer;
      }
      const gx = (q(first.x) / 1000) * o.size;
      const gy = (q(first.y) / 1000) * o.size;
      ops.push(
        setTextMatrix(r(cos), r(sin), r(-sin), r(cos), r(o.x + gx * cos - gy * sin), r(o.y + gx * sin + gy * cos)),
        showText(cidHex(cids)),
      );
      i = j;
    }
    ops.push(endText());
    if (useGs) ops.push(popGraphicsState());
    page.pushOperators(...ops);
  }

  async finalize(): Promise<void> {
    for (const w of this.writers.values()) await w.finalize();
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
    const text = el.kind === 'richtext' ? stripHtmlToPlainText(el.html ?? '') : (el.text ?? '');
    if (!text) return;
    const bold = !!el.style?.bold;
    const size = el.style?.fontSize ?? 10;
    const color = parseColor(el.style?.color);
    const lineHeight = size * 1.2;
    // First baseline sits `size + 2` below the box top; further lines every `lineHeight`.
    // Lines whose baseline would fall below the box bottom are clipped (at least one is drawn).
    const maxLines = Math.max(1, Math.floor((h - size - 2) / lineHeight) + 1);
    const lines = await ctx.text.layout(text, { bold, size, maxWidth: Math.max(1, w - 4), maxLines });
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
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.25, borderColor: rgb(0.7, 0.7, 0.7) });
    await drawLabel(ctx, '[image]', ptX, ptYBottom + h / 2 - 4, w, 8, false, rgb(0.5, 0.5, 0.5));
    return;
  }

  if (el.kind === 'qr' || el.kind === 'barcode') {
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.25, borderColor: rgb(0.7, 0.7, 0.7) });
    await drawLabel(ctx, el.kind === 'qr' ? '[QR]' : '[barcode]', ptX, ptYBottom + h / 2 - 4, w, 8, false, rgb(0.5, 0.5, 0.5));
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
        await drawLabel(ctx, chart.title, ptX + 2, ptYTop - 10, w - 4, 8, true, rgb(0.2, 0.2, 0.2));
      }
    }
    return;
  }
}

/** Single-line label (no wrap beyond the box; extra text is clipped to one line). */
async function drawLabel(ctx: DrawCtx, text: string, boxX: number, y: number, boxW: number, size: number, bold: boolean, color: RGB): Promise<void> {
  const [line] = await ctx.text.layout(text, { bold, size, maxWidth: Math.max(1, boxW - 4), maxLines: 1 });
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

/** Characters Helvetica/WinAnsi can encode (Latin-1 + the CP1252 extras). */
const NON_WINANSI_RE =
  /[^\u0009\u000A\u000D\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201A\u201C-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/;

function needsUnicodePdfFont(tree: RenderTree, schema: ReportSchemaV1): boolean {
  if (schema.meta.locale === 'ar' || tree.dir === 'rtl') return true;
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

export async function renderPdf({ schema, rows }: PdfExportInput): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const tree = interpret({ schema, rows });
  const useUnicode = needsUnicodePdfFont(tree, schema);
  /** Paragraph base direction for bidi. Arabic reports default to RTL. */
  const paragraphBaseDir: 'ltr' | 'rtl' =
    tree.dir === 'rtl' || schema.meta.locale === 'ar' ? 'rtl' : 'ltr';
  const text: TextEngine = useUnicode
    ? await HarfBuzzEngine.create(pdf, paragraphBaseDir === 'rtl')
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
    }
  };

  let page = pdf.addPage([space.width, space.height]);
  let yTop = space.height - space.marginTop;
  let pageNumber = 1;
  if (tree.watermark) await drawWatermark(page, tree.watermark);

  const pageHeader = queued.find((q) => q.section.band === 'pageHeader');
  const pageFooter = queued.find((q) => q.section.band === 'pageFooter');

  const drawHeaderFooter = async (): Promise<void> => {
    if (pageHeader) {
      const ctx: DrawCtx = {
        page,
        space,
        originYTop: space.height - space.marginTop,
        dir: tree.dir,
        text,
      };
      for (const el of pageHeader.section.elements) await drawElement(ctx, el, 0, pageHeader.section.height);
    }
    if (pageFooter) {
      const ctx: DrawCtx = {
        page,
        space,
        originYTop: space.marginBottom + pageFooter.heightPt,
        dir: tree.dir,
        text,
      };
      const footerCopy: RenderSection = {
        ...pageFooter.section,
        elements: pageFooter.section.elements.map((e) => {
          if (e.kind === 'expr') {
            const compiled = tryEvaluate(`"${pageNumber}"`, {});
            void compiled;
          }
          if (e.kind === 'text' && (e.text === '{page}' || e.text === '{صفحة}')) {
            return { ...e, text: String(pageNumber) };
          }
          return e;
        }),
      };
      for (const el of footerCopy.elements) await drawElement(ctx, el, 0, pageFooter.section.height);
    }
  };

  const headerHeight = pageHeader?.heightPt ?? 0;
  const footerHeight = pageFooter?.heightPt ?? 0;

  const newPage = async (): Promise<void> => {
    await drawHeaderFooter();
    page = pdf.addPage([space.width, space.height]);
    yTop = space.height - space.marginTop;
    pageNumber++;
    if (tree.watermark) await drawWatermark(page, tree.watermark);
  };

  const drawSection = async (q: QueuedSection): Promise<void> => {
    const availableBottom = space.marginBottom + footerHeight;
    if (q.section.pageBreakBefore || yTop - q.heightPt < availableBottom) {
      await newPage();
      yTop -= headerHeight;
    }
    const ctx: DrawCtx = { page, space, originYTop: yTop, dir: tree.dir, text };
    for (const el of q.section.elements) await drawElement(ctx, el, 0, q.section.height);
    yTop -= q.heightPt;
    if (q.section.pageBreakAfter) {
      await newPage();
      yTop -= headerHeight;
    }
  };

  yTop -= headerHeight;
  for (const q of queued) {
    if (q.section.band === 'pageHeader' || q.section.band === 'pageFooter') continue;
    await drawSection(q);
  }
  await drawHeaderFooter();
  await text.finalize();

  const bytes = await pdf.save();
  logger.info('pdf-exporter', 'pdf generated', { pages: pdf.getPageCount(), bytes: bytes.byteLength });
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: 'application/pdf' });
}
