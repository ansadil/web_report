import type { Row } from '@reports-web/shared';
import { applyPattern, type LocaleTag } from '@reports-web/shared';
import type {
  Band,
  Element as ReportElement,
  ReportSchemaV1,
  Style,
  Watermark,
} from '../schema/report-schema.js';
import type { AggregateRequest } from './aggregator.js';
import { computeAggregates, groupRows } from './aggregator.js';
import { resolveCodePayload } from './code-payload.js';
import { tryEvaluate } from './expression.js';
import { markdownToHtml } from './markdown-html.js';
import { substituteFieldPlaceholders } from './template-fields.js';
import { logger } from '../logging/logger.js';

export type BandKind =
  | 'reportHeader'
  | 'pageHeader'
  | 'groupHeader'
  | 'detail'
  | 'groupFooter'
  | 'pageFooter'
  | 'reportFooter';

export interface RenderElement {
  readonly kind: ReportElement['kind'];
  readonly id: string;
  readonly pos: ReportElement['pos'];
  readonly style?: Style;
  readonly text?: string;
  readonly html?: string;
  readonly richMode?: 'html' | 'markdown';
  readonly src?: string;
  readonly chart?: { type: string; labels: unknown[]; values: number[]; title?: string };
  readonly code?: {
    readonly kind: 'qr' | 'barcode';
    readonly payload: string;
    readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    readonly symbology?: string;
    readonly displayValue?: boolean;
  };
  readonly line?: {
    readonly orientation: 'horizontal' | 'vertical';
    readonly thickness: number;
    readonly color?: string;
  };
}

export interface RenderSection {
  readonly band: BandKind;
  readonly height: number;
  readonly elements: RenderElement[];
  readonly groupKey?: string;
  readonly groupValue?: unknown;
  readonly pageBreakBefore?: boolean;
  readonly pageBreakAfter?: boolean;
}

export type RenderWatermark =
  | { kind: 'text'; text: string; fontSize: number; color: string; opacity: number; rotation: number }
  | { kind: 'image'; src: string; opacity: number; rotation: number; width: number };

export interface RenderTree {
  readonly width: number;
  readonly height: number;
  readonly margins: { top: number; right: number; bottom: number; left: number };
  readonly dir: 'rtl' | 'ltr';
  readonly locale: LocaleTag;
  /** Digits for page-number tokens (schema `meta.pageNumberDigits`, default 'locale'). */
  readonly pageNumberDigits?: 'locale' | 'latn';
  readonly sections: RenderSection[];
  readonly watermark?: RenderWatermark;
}

const PAGE_DIMENSIONS_MM = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
} as const;

function pageDims(size: 'A4' | 'A5' | 'Letter', orientation: 'portrait' | 'landscape'): { width: number; height: number } {
  const d = PAGE_DIMENSIONS_MM[size];
  return orientation === 'landscape' ? { width: d.height, height: d.width } : { width: d.width, height: d.height };
}

function collectAggregateRequests(schema: ReportSchemaV1): AggregateRequest[] {
  const requests: AggregateRequest[] = [];
  const seen = new Set<string>();
  const visit = (band?: Band) => {
    if (!band) return;
    for (const el of band.elements) {
      if (el.kind === 'aggregate' && el.scope === 'report') {
        const key = `${el.fn}_${el.field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        requests.push({ key, fn: el.fn, field: el.field });
      }
    }
  };
  visit(schema.bands.reportHeader);
  visit(schema.bands.pageHeader);
  visit(schema.bands.detail);
  visit(schema.bands.pageFooter);
  visit(schema.bands.reportFooter);
  for (const g of schema.groups) {
    visit(g.header);
    visit(g.footer);
  }
  return requests;
}

function evalCondition(expr: string | undefined, ctx: { row?: Row; aggregates?: Record<string, unknown>; vars?: Record<string, unknown> }): boolean {
  if (!expr) return true;
  const r = tryEvaluate(expr, ctx);
  if (!r.ok) {
    logger.warn('interpreter', 'visibleWhen failed', { expr, error: r.error });
    return true;
  }
  return Boolean(r.value);
}

function mergeStyle(base: Style | undefined, override: Style): Style {
  if (!base) return override;
  return { ...base, ...override, border: { ...(base.border ?? {}), ...(override.border ?? {}) } };
}

function applyConditional(el: ReportElement, ctx: { row?: Row; aggregates?: Record<string, unknown> }): Style | undefined {
  if (!el.cond || el.cond.length === 0) return el.style;
  let style = el.style;
  for (const rule of el.cond) {
    const r = tryEvaluate(rule.when, ctx);
    if (!r.ok) {
      logger.warn('interpreter', 'conditional rule failed', { expr: rule.when, error: r.error });
      continue;
    }
    if (r.value) style = mergeStyle(style, rule.style);
  }
  return style;
}

function renderElement(
  el: ReportElement,
  ctx: { row?: Row; aggregates?: Record<string, unknown>; vars?: Record<string, unknown>; locale: LocaleTag; groupRows?: readonly Row[] },
): RenderElement | null {
  if (!evalCondition(el.visibleWhen, ctx)) return null;
  const style = applyConditional(el, ctx);
  const base: RenderElement = { kind: el.kind, id: el.id, pos: el.pos, style };
  switch (el.kind) {
    case 'text':
      return { ...base, text: el.value };
    case 'field': {
      const v = ctx.row?.[el.field];
      return { ...base, text: applyPattern(v, el.format, ctx.locale, el.formatOptions) };
    }
    case 'image':
      return { ...base, src: el.src };
    case 'aggregate': {
      let value: number;
      if (el.scope === 'report') value = Number(ctx.aggregates?.[`${el.fn}_${el.field}`] ?? 0);
      else if (el.scope === 'group' && ctx.groupRows) {
        const map = computeAggregates(ctx.groupRows, [{ key: 'k', fn: el.fn, field: el.field }]);
        value = map.k ?? 0;
      } else {
        value = 0;
      }
      return { ...base, text: applyPattern(value, el.format, ctx.locale, el.formatOptions) };
    }
    case 'chart': {
      const data = (ctx.groupRows ?? (ctx.vars?.['__rows__'] as readonly Row[] | undefined) ?? []) as readonly Row[];
      const labels: unknown[] = [];
      const values: number[] = [];
      for (const row of data) {
        labels.push(row[el.labelsField]);
        const n = Number(row[el.valueField]);
        values.push(Number.isFinite(n) ? n : 0);
      }
      return { ...base, chart: { type: el.type, labels, values, title: el.title } };
    }
    case 'line':
      return {
        ...base,
        line: {
          orientation: el.orientation,
          thickness: el.thickness,
          color: el.color ?? el.style?.color,
        },
      };
    case 'box':
      return base;
    case 'expr': {
      const r = tryEvaluate(el.expression, ctx);
      const v = r.ok ? r.value : '';
      if (!r.ok) logger.warn('interpreter', 'expr eval failed', { expr: el.expression, error: r.error });
      return { ...base, text: applyPattern(v, el.format, ctx.locale, el.formatOptions) };
    }
    case 'qr': {
      const payload = resolveCodePayload(el, ctx);
      return {
        ...base,
        code: { kind: 'qr', payload, errorCorrectionLevel: el.errorCorrectionLevel },
      };
    }
    case 'barcode': {
      const payload = resolveCodePayload(el, ctx);
      return {
        ...base,
        code: {
          kind: 'barcode',
          payload,
          symbology: el.symbology,
          displayValue: el.displayValue,
        },
      };
    }
    case 'richtext': {
      const withFields = substituteFieldPlaceholders(el.content, ctx.row, ctx.locale, el.format);
      const html = el.mode === 'markdown' ? markdownToHtml(withFields) : withFields;
      return { ...base, html, richMode: el.mode };
    }
    default: {
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
}

function renderBand(
  band: Band | undefined,
  kind: BandKind,
  ctx: { row?: Row; aggregates?: Record<string, unknown>; vars?: Record<string, unknown>; locale: LocaleTag; groupRows?: readonly Row[] },
  groupInfo?: { key: string; value: unknown },
): RenderSection | null {
  if (!band) return null;
  const elements: RenderElement[] = [];
  for (const el of band.elements) {
    const rendered = renderElement(el, ctx);
    if (rendered) elements.push(rendered);
  }
  return {
    band: kind,
    height: band.height,
    elements,
    groupKey: groupInfo?.key,
    groupValue: groupInfo?.value,
    pageBreakBefore: band.pageBreakBefore,
    pageBreakAfter: band.pageBreakAfter,
  };
}

export interface InterpretInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
  /** When the report is rendered; defaults to current time. Used by `now()` / `printedAt`. */
  readonly printedAt?: Date | string | number;
  /**
   * Resolved report parameter values (see `resolveParameterValues`). When given, expressions can read them as
   * `params.<name>` (e.g. `params.period.from`, `params.branch`). Omitted -> no `params` variable (unchanged behavior).
   */
  readonly params?: Readonly<Record<string, unknown>>;
}

function resolvePrintedAt(input?: Date | string | number): Date {
  if (input == null) return new Date();
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function buildReportEvalVars(
  schema: ReportSchemaV1,
  rows: readonly Row[],
  printedAt?: Date | string | number,
  params?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    __rows__: rows,
    meta: schema.meta,
    dataset: schema.dataset,
    page: schema.page,
    printedAt: resolvePrintedAt(printedAt),
    ...(params ? { params } : {}),
  };
}

function resolveWatermark(
  wm: Watermark | undefined,
  ctx: { schema: ReportSchemaV1; aggregates: Record<string, unknown>; printedAt?: Date | string | number; params?: Readonly<Record<string, unknown>> },
): RenderWatermark | undefined {
  if (!wm) return undefined;
  if (wm.kind === 'image') {
    return { kind: 'image', src: wm.src, opacity: wm.opacity, rotation: wm.rotation, width: wm.width };
  }
  let text = wm.text;
  if (wm.expression && wm.expression.trim().length > 0) {
    const evalCtx = {
      vars: buildReportEvalVars(ctx.schema, [], ctx.printedAt, ctx.params),
      aggregates: ctx.aggregates,
    };
    const r = tryEvaluate(wm.expression, evalCtx);
    if (r.ok && r.value != null) text = String(r.value);
    else if (!r.ok) logger.warn('interpreter', 'watermark expression failed', { expr: wm.expression, error: r.error });
  }
  return { kind: 'text', text, fontSize: wm.fontSize, color: wm.color, opacity: wm.opacity, rotation: wm.rotation };
}

export function interpret({ schema, rows, printedAt, params }: InterpretInput): RenderTree {
  const t0 = performance.now();
  const aggRequests = collectAggregateRequests(schema);
  const aggregates = computeAggregates(rows, aggRequests);
  const dims = pageDims(schema.page.size, schema.page.orientation);
  const sections: RenderSection[] = [];
  const reportVars = buildReportEvalVars(schema, rows, printedAt, params);
  const baseCtx = { aggregates, vars: reportVars, locale: schema.meta.locale };
  const watermark = resolveWatermark(schema.watermark, { schema, aggregates, printedAt, params });

  const reportHeader = renderBand(schema.bands.reportHeader, 'reportHeader', baseCtx);
  if (reportHeader) sections.push(reportHeader);

  const pageHeader = renderBand(schema.bands.pageHeader, 'pageHeader', baseCtx);
  if (pageHeader) sections.push(pageHeader);

  if (schema.groups.length === 0) {
    for (const row of rows) {
      const det = renderBand(schema.bands.detail, 'detail', { ...baseCtx, row });
      if (det) sections.push(det);
    }
  } else {
    const primary = schema.groups[0]!;
    const grouped = groupRows(rows as Row[], primary.key);
    for (const g of grouped) {
      const gh = renderBand(primary.header, 'groupHeader', { ...baseCtx, groupRows: g.rows, row: g.rows[0] }, { key: primary.key, value: g.key });
      if (gh) sections.push(gh);
      for (const row of g.rows) {
        const det = renderBand(schema.bands.detail, 'detail', { ...baseCtx, row, groupRows: g.rows });
        if (det) sections.push(det);
      }
      const gf = renderBand(primary.footer, 'groupFooter', { ...baseCtx, groupRows: g.rows }, { key: primary.key, value: g.key });
      if (gf) sections.push(gf);
    }
  }

  const pageFooter = renderBand(schema.bands.pageFooter, 'pageFooter', baseCtx);
  if (pageFooter) sections.push(pageFooter);

  const reportFooter = renderBand(schema.bands.reportFooter, 'reportFooter', baseCtx);
  if (reportFooter) sections.push(reportFooter);

  logger.debug('interpreter', 'interpreted report', {
    sections: sections.length,
    rows: rows.length,
    aggregates: aggRequests.length,
    durationMs: Math.round(performance.now() - t0),
  });

  return {
    width: dims.width,
    height: dims.height,
    margins: schema.page.margins,
    dir: schema.meta.dir,
    locale: schema.meta.locale,
    ...(schema.meta.pageNumberDigits ? { pageNumberDigits: schema.meta.pageNumberDigits } : {}),
    sections,
    ...(watermark ? { watermark } : {}),
  };
}
