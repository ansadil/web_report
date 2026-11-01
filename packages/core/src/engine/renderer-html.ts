import { escapeHtml, MM_TO_PX } from '@reports-web/shared';
import type { Style } from '../schema/report-schema.js';
import type { RenderElement, RenderSection, RenderTree, RenderWatermark } from './interpreter.js';
import { replacePageTokens, type PageTokenContext } from './page-tokens.js';

function styleToCss(style: Style | undefined, pos: { x: number; y: number; w: number; h: number }): string {
  const css: string[] = [
    'position:absolute',
    `inset-inline-start:${pos.x}mm`,
    `top:${pos.y}mm`,
    `width:${pos.w}mm`,
    `height:${pos.h}mm`,
    'overflow:hidden',
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
  ];
  if (style) {
    if (style.font) css.push(`font-family:${style.font}`);
    if (style.fontSize) css.push(`font-size:${style.fontSize}pt`);
    if (style.bold) css.push('font-weight:700');
    if (style.italic) css.push('font-style:italic');
    if (style.underline) css.push('text-decoration:underline');
    if (style.color) css.push(`color:${style.color}`);
    if (style.background) css.push(`background:${style.background}`);
    if (style.align) css.push(`justify-content:${style.align === 'end' ? 'flex-end' : style.align === 'center' ? 'center' : style.align === 'justify' ? 'space-between' : 'flex-start'}`);
    if (style.padding != null) css.push(`padding:${style.padding}mm`);
    if (style.border) {
      const b = style.border;
      const color = b.color ?? '#000';
      if (b.top) css.push(`border-top:${b.top}pt solid ${color}`);
      if (b.right) css.push(`border-right:${b.right}pt solid ${color}`);
      if (b.bottom) css.push(`border-bottom:${b.bottom}pt solid ${color}`);
      if (b.left) css.push(`border-left:${b.left}pt solid ${color}`);
    }
  }
  return css.join(';');
}

function codeHostStyle(style: string): string {
  return `${style};align-items:center;justify-content:center`;
}

function richHostStyle(style: string, align?: Style['align']): string {
  return `${style};display:block;overflow:hidden;align-items:stretch;text-align:${align === 'end' ? 'right' : align === 'center' ? 'center' : align === 'justify' ? 'justify' : 'start'}`;
}

function renderRichHtml(el: RenderElement, style: string): string {
  const hostStyle = richHostStyle(style, el.style?.align);
  return `<div class="rw-el rw-richtext ${el.richMode === 'markdown' ? 'rw-markdown' : 'rw-html'} rw-rich" data-id="${escapeHtml(el.id)}" style="${hostStyle}"><div class="rw-rich-body">${el.html ?? ''}</div></div>`;
}

function renderElementToHtml(
  el: RenderElement,
  chartId: (id: string) => string,
  codeId: (id: string) => string,
  pageCtx?: PageTokenContext,
): string {
  const style = styleToCss(el.style, el.pos);
  switch (el.kind) {
    case 'text': {
      const text = pageCtx ? replacePageTokens(el.text ?? '', pageCtx) : (el.text ?? '');
      return `<div class="rw-el rw-${el.kind}" data-id="${escapeHtml(el.id)}" style="${style}"><span>${escapeHtml(text)}</span></div>`;
    }
    case 'field':
    case 'aggregate':
    case 'expr':
      return `<div class="rw-el rw-${el.kind}" data-id="${escapeHtml(el.id)}" style="${style}"><span>${escapeHtml(el.text ?? '')}</span></div>`;
    case 'image':
      return `<div class="rw-el rw-image" data-id="${escapeHtml(el.id)}" style="${style}"><img src="${escapeHtml(el.src ?? '')}" alt="" style="width:100%;height:100%;object-fit:contain" /></div>`;
    case 'chart':
      return `<div class="rw-el rw-chart" data-id="${escapeHtml(el.id)}" style="${style}"><canvas id="${chartId(el.id)}" data-chart='${escapeHtml(JSON.stringify(el.chart ?? {}))}' style="width:100%;height:100%"></canvas></div>`;
    case 'line': {
      const line = el.line ?? { orientation: 'horizontal' as const, thickness: 1 };
      const color = line.color ?? '#000';
      const hostStyle =
        styleToCss(el.style, el.pos) +
        ';display:flex;align-items:center;justify-content:center;padding:0;overflow:hidden';
      const strokeStyle = `width:100%;height:100%;background:${color};flex:none`;
      return `<div class="rw-el rw-line rw-line-${line.orientation}" data-id="${escapeHtml(el.id)}" style="${hostStyle}"><div class="rw-line-stroke" style="${strokeStyle}"></div></div>`;
    }
    case 'box': {
      const boxStyle = styleToCss(el.style, el.pos) + ';border:1pt solid #999';
      return `<div class="rw-el rw-box" data-id="${escapeHtml(el.id)}" style="${boxStyle}"></div>`;
    }
    case 'qr':
    case 'barcode': {
      if (!el.code) return '';
      const hostStyle = codeHostStyle(style);
      const codeColor = el.style?.color;
      const codeBackground = el.style?.background;
      const spec =
        el.code.kind === 'qr'
          ? {
              kind: 'qr' as const,
              payload: el.code.payload,
              errorCorrectionLevel: el.code.errorCorrectionLevel ?? 'M',
              ...(codeColor ? { color: codeColor } : {}),
              ...(codeBackground ? { background: codeBackground } : {}),
            }
          : {
              kind: 'barcode' as const,
              payload: el.code.payload,
              format: el.code.symbology ?? 'CODE128',
              displayValue: el.code.displayValue !== false,
              ...(codeColor ? { color: codeColor } : {}),
              ...(codeBackground ? { background: codeBackground } : {}),
            };
      const cid = codeId(el.id);
      return `<div class="rw-el rw-${el.kind}" data-id="${escapeHtml(el.id)}" style="${hostStyle}"><img id="${cid}" class="rw-code-host" data-rw-code='${escapeHtml(JSON.stringify(spec))}' alt="" style="width:100%;height:100%;object-fit:contain" /></div>`;
    }
    case 'richtext':
      return renderRichHtml(el, style);
    default:
      return '';
  }
}

function renderSection(
  s: RenderSection,
  contentWidth: number,
  chartId: (id: string) => string,
  codeId: (id: string) => string,
  pageCtx?: PageTokenContext,
): string {
  const breakRules: string[] = ['page-break-inside:avoid', 'break-inside:avoid'];
  if (s.pageBreakBefore) { breakRules.push('page-break-before:always', 'break-before:page'); }
  if (s.pageBreakAfter) { breakRules.push('page-break-after:always', 'break-after:page'); }
  const sectionStyle = `position:relative;width:${contentWidth}mm;height:${s.height}mm;${breakRules.join(';')}`;
  const body = s.elements.map((e) => renderElementToHtml(e, chartId, codeId, pageCtx)).join('');
  return `<section class="rw-section rw-${s.band}" data-band="${s.band}" style="${sectionStyle}">${body}</section>`;
}

/**
 * Page header and page footer are running bands: they are drawn on every page, not once in the flow.
 * The body budget shrinks by their heights so a page still fits the content area.
 */
function paginateWithRunningBands(sections: readonly RenderSection[], budgetMm: number): RenderSection[][] {
  let pageHeader: RenderSection | undefined;
  let pageFooter: RenderSection | undefined;
  const body: RenderSection[] = [];
  for (const section of sections) {
    if (section.band === 'pageHeader' && !pageHeader) pageHeader = section;
    else if (section.band === 'pageFooter' && !pageFooter) pageFooter = section;
    else body.push(section);
  }
  const chrome = (pageHeader?.height ?? 0) + (pageFooter?.height ?? 0);
  const bodyBudget = Math.max(1, budgetMm - chrome);
  const chunks = chunkSectionsForVisualPages(body, bodyBudget);
  return chunks.map((chunk) => {
    // A report header belongs above the repeating column header on the first page.
    const leading: RenderSection[] = [];
    const rest: RenderSection[] = [];
    let seenBody = false;
    for (const section of chunk) {
      if (!seenBody && section.band === 'reportHeader') leading.push(section);
      else {
        seenBody = true;
        rest.push(section);
      }
    }
    return [
      ...leading,
      ...(pageHeader ? [pageHeader] : []),
      ...rest,
      ...(pageFooter ? [pageFooter] : []),
    ];
  });
}

/** Split sections into visual pages using content-area height (page minus margins). Honors pageBreakBefore/After. */
function chunkSectionsForVisualPages(sections: readonly RenderSection[], budgetMm: number): RenderSection[][] {
  if (sections.length === 0) return [[]];
  const chunks: RenderSection[][] = [];
  let cur: RenderSection[] = [];
  let used = 0;

  const flush = (): void => {
    if (cur.length) {
      chunks.push(cur);
      cur = [];
      used = 0;
    }
  };

  for (const s of sections) {
    if (s.pageBreakBefore && cur.length > 0) flush();

    const h = s.height;
    if (h > budgetMm) {
      flush();
      chunks.push([s]);
      continue;
    }

    if (used + h > budgetMm && cur.length > 0) flush();

    cur.push(s);
    used += s.height;

    if (s.pageBreakAfter) flush();
  }
  flush();
  return chunks;
}

function renderWatermark(wm: RenderWatermark): string {
  const base = [
    'position:absolute',
    'top:50%',
    'left:50%',
    `transform:translate(-50%,-50%) rotate(${wm.rotation}deg)`,
    `opacity:${wm.opacity}`,
    'pointer-events:none',
    'user-select:none',
    'z-index:0',
  ];
  if (wm.kind === 'text') {
    base.push(`font-size:${wm.fontSize}pt`, `color:${wm.color}`, 'font-weight:700', 'white-space:nowrap');
    return `<div class="rw-watermark rw-watermark-text" style="${base.join(';')}">${escapeHtml(wm.text)}</div>`;
  }
  base.push(`width:${wm.width}mm`);
  return `<div class="rw-watermark rw-watermark-image" style="${base.join(';')}"><img src="${escapeHtml(wm.src)}" alt="" style="width:100%;height:auto;display:block" /></div>`;
}

export interface RenderedHtml {
  readonly html: string;
  readonly chartIds: string[];
  readonly codeIds: string[];
}

export function renderHtml(
  tree: RenderTree,
  opts: { idPrefix?: string; visualPages?: boolean } = {},
): RenderedHtml {
  const prefix = opts.idPrefix ?? `rw-${Math.random().toString(36).slice(2, 8)}`;
  const chartIds: string[] = [];
  const codeIds: string[] = [];
  const chartId = (id: string, pageNo: number): string => {
    const cid = `${prefix}-chart-${id}-p${pageNo}`;
    chartIds.push(cid);
    return cid;
  };
  const codeId = (id: string, pageNo: number): string => {
    const cid = `${prefix}-code-${id}-p${pageNo}`;
    codeIds.push(cid);
    return cid;
  };
  const contentWidth = Math.max(10, tree.width - tree.margins.left - tree.margins.right);
  const pageStyleScroll = [
    `width:${tree.width}mm`,
    `min-height:${tree.height}mm`,
    `padding:${tree.margins.top}mm ${tree.margins.right}mm ${tree.margins.bottom}mm ${tree.margins.left}mm`,
    'box-sizing:border-box',
    'background:#fff',
    'color:#111',
    'margin:0 auto 6mm',
    'box-shadow:0 2px 4px rgba(15,25,45,.08), 0 12px 34px rgba(15,25,45,.14)',
    `direction:${tree.dir}`,
    'position:relative',
    'overflow:hidden',
  ].join(';');
  const pageStyleSheet = [
    `width:${tree.width}mm`,
    `min-height:${tree.height}mm`,
    `padding:${tree.margins.top}mm ${tree.margins.right}mm ${tree.margins.bottom}mm ${tree.margins.left}mm`,
    'box-sizing:border-box',
    'background:#fff',
    'color:#111',
    'margin:0 auto',
    'box-shadow:0 2px 4px rgba(15,25,45,.08), 0 12px 34px rgba(15,25,45,.14)',
    `direction:${tree.dir}`,
    'position:relative',
    'overflow:hidden',
  ].join(';');

  const budgetMm = Math.max(10, tree.height - tree.margins.top - tree.margins.bottom);
  const chunks = paginateWithRunningBands(tree.sections, budgetMm);
  const pages = Math.max(1, chunks.length);

  if (!opts.visualPages) {
    // Continuous scroll: number each section by the visual page it would fall on.
    const sections = chunks
      .flatMap((chunkSecs, i) => {
        const pageNo = i + 1;
        return chunkSecs.map((s) => renderSection(s, contentWidth, (id) => chartId(id, pageNo), (id) => codeId(id, pageNo), { page: pageNo, pages, locale: tree.locale, digits: tree.pageNumberDigits ?? 'locale' }));
      })
      .join('');
    const watermark = tree.watermark ? renderWatermark(tree.watermark) : '';
    const html = `<article class="rw-report" data-locale="${tree.locale}" data-dir="${tree.dir}" style="${pageStyleScroll}">${watermark}${sections}</article>`;
    return { html, chartIds, codeIds };
  }

  const sheets = chunks
    .map((chunkSecs, i) => {
      const pageNo = i + 1;
      const secHtml = chunkSecs.map((s) => renderSection(s, contentWidth, (id) => chartId(id, pageNo), (id) => codeId(id, pageNo), { page: pageNo, pages, locale: tree.locale, digits: tree.pageNumberDigits ?? 'locale' })).join('');
      const watermark = tree.watermark ? renderWatermark(tree.watermark) : '';
      return `<div class="rw-page-visual-sheet"><article class="rw-report rw-report-page" data-locale="${tree.locale}" data-dir="${tree.dir}" style="${pageStyleSheet}">${watermark}${secHtml}</article></div>`;
    })
    .join('');
  const html = `<div class="rw-html-root rw-visual-pages-root">${sheets}</div>`;
  return { html, chartIds, codeIds };
}

export function pxFromMm(mm: number): number {
  return mm * MM_TO_PX;
}
