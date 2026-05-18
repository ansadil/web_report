import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import { shapeArabicText } from 'naqqash';
import type { Row } from '@reports-web/shared';
import { applyPattern, MM_TO_PT } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import { interpret } from '../engine/interpreter.js';
import type { RenderElement, RenderSection, RenderTree, RenderWatermark } from '../engine/interpreter.js';
import { logger } from '../logging/logger.js';
import { tryEvaluate } from '../engine/expression.js';
import { stripHtmlToPlainText } from '../engine/template-fields.js';

export interface PdfExportInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
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
  readonly font: PDFFont;
  readonly fontBold: PDFFont;
  /** Logical → display string (Arabic contextual shaping when Unicode fonts are embedded). */
  readonly preparePdfText: (raw: string) => string;
}

const bidi = bidiFactory();

/**
 * pdf-lib draws TJ arrays as plain left-to-right glyph order. Arabic needs:
 * 1) contextual shaping (Naqqash → Presentation Forms-B)
 * 2) Unicode bidirectional reordering (bidi-js) so digits/Latin embed correctly — naive reversal breaks dates (١٠/٠١/٢٠٢٦).
 */
function preparedPdfText(raw: string, useUnicodeFonts: boolean, paragraphBaseDir: 'ltr' | 'rtl'): string {
  if (!useUnicodeFonts) return raw;
  const shaped = shapeArabicText(raw);
  const levels = bidi.getEmbeddingLevels(shaped, paragraphBaseDir);
  return bidi.getReorderedString(shaped, levels);
}

function textPreparer(useUnicodeFonts: boolean, paragraphBaseDir: 'ltr' | 'rtl'): (raw: string) => string {
  return (raw: string) => preparedPdfText(raw, useUnicodeFonts, paragraphBaseDir);
}

function drawElement(ctx: DrawCtx, el: RenderElement, sectionTopMm: number, sectionHeightMm: number): void {
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
    const font = el.style?.bold ? ctx.fontBold : ctx.font;
    const size = el.style?.fontSize ?? 10;
    const color = parseColor(el.style?.color);
    const lines = text.split('\n');
    const lineHeight = size * 1.2;
    for (let i = 0; i < lines.length; i++) {
      const line = ctx.preparePdfText(lines[i]!);
      let textX = ptX + 2;
      if (el.style?.align === 'center') {
        const tw = font.widthOfTextAtSize(line, size);
        textX = ptX + (w - tw) / 2;
      } else if (el.style?.align === 'end' || (isRtl && !el.style?.align)) {
        const tw = font.widthOfTextAtSize(line, size);
        textX = ptX + w - tw - 2;
      }
      const lineY = ptYTop - size - i * lineHeight - 2;
      if (lineY < ptYBottom) break;
      ctx.page.drawText(line, { x: textX, y: lineY, size, font, color: rgb(color.r, color.g, color.b) });
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
    const label = ctx.preparePdfText('[image]');
    ctx.page.drawText(label, { x: ptX + 2, y: ptYBottom + h / 2 - 4, size: 8, font: ctx.font, color: rgb(0.5, 0.5, 0.5) });
    return;
  }

  if (el.kind === 'qr' || el.kind === 'barcode') {
    ctx.page.drawRectangle({ x: ptX, y: ptYBottom, width: w, height: h, borderWidth: 0.25, borderColor: rgb(0.7, 0.7, 0.7) });
    const codeLabel = ctx.preparePdfText(el.kind === 'qr' ? '[QR]' : '[barcode]');
    ctx.page.drawText(codeLabel, { x: ptX + 2, y: ptYBottom + h / 2 - 4, size: 8, font: ctx.font, color: rgb(0.5, 0.5, 0.5) });
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
        const title = ctx.preparePdfText(chart.title);
        ctx.page.drawText(title, { x: ptX + 4, y: ptYTop - 10, size: 8, font: ctx.fontBold, color: rgb(0.2, 0.2, 0.2) });
      }
    }
    return;
  }
}

interface QueuedSection {
  readonly section: RenderSection;
  readonly heightPt: number;
}

/** Arabic / Arabic supplement / presentation forms / Arabic Extended-A (incl. Arabic-Indic digits). */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function needsUnicodePdfFont(tree: RenderTree, schema: ReportSchemaV1): boolean {
  if (schema.meta.locale === 'ar') return true;
  const scan = (s: string | undefined): boolean => !!(s && ARABIC_SCRIPT_RE.test(s));
  if (tree.watermark?.kind === 'text' && scan(tree.watermark.text)) return true;
  for (const s of tree.sections) {
    for (const el of s.elements) {
      if ('text' in el && scan(el.text)) return true;
      if (el.kind === 'chart') {
        const ch = el.chart;
        if (ch && scan(ch.title)) return true;
        if (ch?.labels?.some((lb) => scan(String(lb)))) return true;
      }
    }
  }
  return false;
}

async function loadFontBytes(fileName: string): Promise<Uint8Array> {
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

export async function exportPdf({ schema, rows }: PdfExportInput): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const tree = interpret({ schema, rows });
  const useUnicode = needsUnicodePdfFont(tree, schema);
  if (useUnicode) pdf.registerFontkit(fontkit);
  /** Paragraph embedding for bidi-js: pdf-lib paints glyphs LTR; Arabic invoices need RTL unless purely Latin. */
  const paragraphBaseDir: 'ltr' | 'rtl' =
    tree.dir === 'rtl' || schema.meta.locale === 'ar' ? 'rtl' : 'ltr';
  const preparePdfText = textPreparer(useUnicode, paragraphBaseDir);
  const font = useUnicode
    ? await pdf.embedFont(await loadFontBytes('NotoSansArabic-Regular.ttf'), { subset: false })
    : await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = useUnicode
    ? await pdf.embedFont(await loadFontBytes('NotoSansArabic-Bold.ttf'), { subset: false })
    : await pdf.embedFont(StandardFonts.HelveticaBold);
  const space = spaceFromSchema(schema);
  const queued: QueuedSection[] = tree.sections.map((s) => ({ section: s, heightPt: s.height * MM_TO_PT }));

  const drawWatermark = (target: PDFPage, wm: RenderWatermark): void => {
    if (wm.kind === 'text') {
      const c = parseColor(wm.color);
      const size = wm.fontSize;
      const txt = preparePdfText(wm.text);
      const tw = fontBold.widthOfTextAtSize(txt, size);
      target.drawText(txt, {
        x: space.width / 2 - tw / 2,
        y: space.height / 2 - size / 3,
        size,
        font: fontBold,
        color: rgb(c.r, c.g, c.b),
        opacity: wm.opacity,
        rotate: degrees(wm.rotation),
      });
    }
  };

  let page = pdf.addPage([space.width, space.height]);
  let yTop = space.height - space.marginTop;
  let pageNumber = 1;
  if (tree.watermark) drawWatermark(page, tree.watermark);

  const pageHeader = queued.find((q) => q.section.band === 'pageHeader');
  const pageFooter = queued.find((q) => q.section.band === 'pageFooter');

  const drawHeaderFooter = () => {
    if (pageHeader) {
      const ctx: DrawCtx = {
        page,
        space,
        originYTop: space.height - space.marginTop,
        dir: tree.dir,
        font,
        fontBold,
        preparePdfText,
      };
      for (const el of pageHeader.section.elements) drawElement(ctx, el, 0, pageHeader.section.height);
    }
    if (pageFooter) {
      const ctx: DrawCtx = {
        page,
        space,
        originYTop: space.marginBottom + pageFooter.heightPt,
        dir: tree.dir,
        font,
        fontBold,
        preparePdfText,
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
      for (const el of footerCopy.elements) drawElement(ctx, el, 0, pageFooter.section.height);
    }
  };

  const headerHeight = pageHeader?.heightPt ?? 0;
  const footerHeight = pageFooter?.heightPt ?? 0;

  const newPage = () => {
    drawHeaderFooter();
    page = pdf.addPage([space.width, space.height]);
    yTop = space.height - space.marginTop;
    pageNumber++;
    if (tree.watermark) drawWatermark(page, tree.watermark);
  };

  const drawSection = (q: QueuedSection) => {
    const availableBottom = space.marginBottom + footerHeight;
    if (q.section.pageBreakBefore || yTop - q.heightPt < availableBottom) {
      newPage();
      yTop -= headerHeight;
    }
    const ctx: DrawCtx = { page, space, originYTop: yTop, dir: tree.dir, font, fontBold, preparePdfText };
    for (const el of q.section.elements) drawElement(ctx, el, 0, q.section.height);
    yTop -= q.heightPt;
    if (q.section.pageBreakAfter) {
      newPage();
      yTop -= headerHeight;
    }
  };

  yTop -= headerHeight;
  for (const q of queued) {
    if (q.section.band === 'pageHeader' || q.section.band === 'pageFooter') continue;
    drawSection(q);
  }
  drawHeaderFooter();

  const bytes = await pdf.save();
  logger.info('pdf-exporter', 'pdf generated', { pages: pdf.getPageCount(), bytes: bytes.byteLength });
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: 'application/pdf' });
}
