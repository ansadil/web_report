import { z } from 'zod';
import type { ParameterDef } from '@reports-web/shared';
import { isRelativeDatePreset } from '../engine/relative-dates.js';
import { canonicalizeLocaleTag, directionForLocale, type LocaleTag } from '@reports-web/shared';

export const PageSizeName = z.enum(['A4', 'A5', 'Letter']);
export type PageSizeName = z.infer<typeof PageSizeName>;

export const FieldType = z.enum(['string', 'number', 'date', 'bool', 'image']);
export type FieldType = z.infer<typeof FieldType>;

export const Direction = z.enum(['rtl', 'ltr']);
/**
 * Report locale: any valid BCP 47 tag ('ar', 'en', 'ar-SA', 'ar-SA-u-nu-latn', 'en-GB', ...),
 * checked with Intl.getCanonicalLocales and stored in canonical form ('AR-sa' -> 'ar-SA').
 */
export const Locale = z
  .string()
  .refine((s) => canonicalizeLocaleTag(s) !== null, { message: 'Invalid BCP 47 locale tag' })
  .transform((s): LocaleTag => canonicalizeLocaleTag(s)!);

export const PositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().min(0.1),
  h: z.number().min(0.1),
});
export type Position = z.infer<typeof PositionSchema>;

export const StyleSchema = z
  .object({
    font: z.string().optional(),
    fontSize: z.number().min(4).max(96).optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    color: z.string().optional(),
    background: z.string().optional(),
    align: z.enum(['start', 'center', 'end', 'justify']).optional(),
    valign: z.enum(['start', 'center', 'end']).optional(),
    border: z
      .object({
        top: z.number().min(0).optional(),
        right: z.number().min(0).optional(),
        bottom: z.number().min(0).optional(),
        left: z.number().min(0).optional(),
        color: z.string().optional(),
      })
      .optional(),
    padding: z.number().min(0).max(40).optional(),
  })
  .partial();
export type Style = z.infer<typeof StyleSchema>;

export const ConditionalFormatRule = z.object({
  when: z.string().min(1),
  style: StyleSchema,
});
export type ConditionalFormatRule = z.infer<typeof ConditionalFormatRule>;

const ElementBase = z.object({
  id: z.string().min(1),
  pos: PositionSchema,
  style: StyleSchema.optional(),
  visibleWhen: z.string().optional(),
  cond: z.array(ConditionalFormatRule).optional(),
});

export const TextElement = ElementBase.extend({
  kind: z.literal('text'),
  value: z.string(),
});
/** Options for `format` (currently the date style for 'date' / 'date:hijri'; default 'medium'). */
export const FormatOptions = z.object({
  dateStyle: z.enum(['full', 'long', 'medium', 'short']).optional(),
});
export const FieldElement = ElementBase.extend({
  kind: z.literal('field'),
  field: z.string().min(1),
  format: z.string().optional(),
  formatOptions: FormatOptions.optional(),
});
export const ImageElement = ElementBase.extend({
  kind: z.literal('image'),
  src: z.string().min(1),
  alt: z.string().optional(),
  fit: z.enum(['contain', 'cover', 'fill']).optional(),
});
export const AggregateElement = ElementBase.extend({
  kind: z.literal('aggregate'),
  fn: z.enum(['sum', 'count', 'avg', 'min', 'max']),
  field: z.string().min(1),
  scope: z.enum(['report', 'page', 'group']).default('report'),
  groupKey: z.string().optional(),
  format: z.string().optional(),
  formatOptions: FormatOptions.optional(),
});
export const ChartElement = ElementBase.extend({
  kind: z.literal('chart'),
  type: z.enum(['bar', 'line', 'pie', 'doughnut']),
  labelsField: z.string().min(1),
  valueField: z.string().min(1),
  title: z.string().optional(),
});
export const LineElement = ElementBase.extend({
  kind: z.literal('line'),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  thickness: z.number().min(0.25).max(10).default(1),
  color: z.string().optional(),
});
export const BoxElement = ElementBase.extend({
  kind: z.literal('box'),
});
export const ExpressionElement = ElementBase.extend({
  kind: z.literal('expr'),
  expression: z.string().min(1),
  format: z.string().optional(),
  formatOptions: FormatOptions.optional(),
});

export const QrElement = ElementBase.extend({
  kind: z.literal('qr'),
  value: z.string().default(''),
  field: z.string().optional(),
  expression: z.string().optional(),
  format: z.string().optional(),
  errorCorrectionLevel: z.enum(['L', 'M', 'Q', 'H']).default('M'),
});

export const BarcodeElement = ElementBase.extend({
  kind: z.literal('barcode'),
  value: z.string().default(''),
  field: z.string().optional(),
  expression: z.string().optional(),
  format: z.string().optional(),
  symbology: z.enum(['CODE128', 'CODE39', 'EAN13', 'EAN8', 'UPC', 'ITF14']).default('CODE128'),
  displayValue: z.boolean().default(true),
});

export const RichTextElement = ElementBase.extend({
  kind: z.literal('richtext'),
  mode: z.enum(['html', 'markdown']).default('html'),
  content: z.string().default(''),
  format: z.string().optional(),
});

export const Element = z.discriminatedUnion('kind', [
  TextElement,
  FieldElement,
  ImageElement,
  AggregateElement,
  ChartElement,
  LineElement,
  BoxElement,
  ExpressionElement,
  QrElement,
  BarcodeElement,
  RichTextElement,
]);
export type Element = z.infer<typeof Element>;

export const BandSchema = z.object({
  height: z.number().min(0),
  elements: z.array(Element).default([]),
  pageBreakBefore: z.boolean().optional(),
  pageBreakAfter: z.boolean().optional(),
});
export type Band = z.infer<typeof BandSchema>;

export const GroupSchema = z.object({
  key: z.string().min(1),
  header: BandSchema.optional(),
  footer: BandSchema.optional(),
  resetPageNumber: z.boolean().optional(),
});
export type Group = z.infer<typeof GroupSchema>;

export const FieldDeclaration = z.object({
  name: z.string().min(1),
  type: FieldType,
  label: z.string().optional(),
  /** UI-only dictionary folder. Omitted fields stay directly under the data source. */
  group: z.string().optional(),
});
export type FieldDeclaration = z.infer<typeof FieldDeclaration>;

/** `string` or a per-locale map such as `{ ar: '...', en: '...' }`. */
export const LocalizedTextSchema = z.union([z.string(), z.record(z.string())]);

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}([.,]\d{1,9})?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/i;

/** Shape check for `ParameterDef.min` / `max` against the parameter type; returns an error message or undefined. */
function parameterBoundError(type: string, v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  switch (type) {
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? undefined : 'number parameters need a numeric bound';
    case 'date':
    case 'dateRange':
      return typeof v === 'string' && (ISO_YMD.test(v) || isRelativeDatePreset(v))
        ? undefined
        : 'date bounds must be YYYY-MM-DD or a relative date preset';
    case 'datetime':
      return typeof v === 'string' && (v === 'now' || ISO_DATE_OR_DATE_TIME.test(v)) ? undefined : 'datetime bounds must be ISO 8601 or "now"';
    default:
      return undefined;
  }
}

export const ParameterType = z.enum(['string', 'number', 'date', 'datetime', 'dateRange', 'bool', 'select']);

const ParameterOptionSchema = z.object({
  value: z.unknown(),
  label: LocalizedTextSchema,
});

const ParameterOptionsSourceSchema = z.object({
  source: z.string().min(1),
  valueField: z.string().min(1),
  labelField: z.string().min(1),
});

export const ParameterDefSchema = z
  .object({
    name: z.string().min(1),
    label: LocalizedTextSchema.optional(),
    type: ParameterType,
    required: z.boolean().optional(),
    default: z.unknown().optional(),
    options: z.union([z.array(ParameterOptionSchema), ParameterOptionsSourceSchema]).optional(),
    description: LocalizedTextSchema.optional(),
    min: z.union([z.number(), z.string()]).optional(),
    max: z.union([z.number(), z.string()]).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.type === 'select' && p.options === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'select parameters require options' });
    }
    for (const key of ['min', 'max'] as const) {
      const msg = parameterBoundError(p.type, p[key]);
      if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: msg });
    }
    if (p.type === 'number' && typeof p.min === 'number' && typeof p.max === 'number' && p.min > p.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['min'], message: 'min must not be greater than max' });
    }
    if ((p.type === 'date' || p.type === 'dateRange') && typeof p.min === 'string' && typeof p.max === 'string'
      && ISO_YMD.test(p.min) && ISO_YMD.test(p.max) && p.min > p.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['min'], message: 'min must not be after max' });
    }
  });

const ParametersSchema = z.array(ParameterDefSchema).superRefine((params, ctx) => {
  const seen = new Set<string>();
  params.forEach((p, i) => {
    if (seen.has(p.name)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'name'], message: `duplicate parameter name "${p.name}"` });
    }
    seen.add(p.name);
  });
});

export const PageSchema = z.object({
  size: PageSizeName.default('A4'),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margins: z
    .object({
      top: z.number().min(0).default(15),
      right: z.number().min(0).default(15),
      bottom: z.number().min(0).default(15),
      left: z.number().min(0).default(15),
    })
    .default({ top: 15, right: 15, bottom: 15, left: 15 }),
});
export type Page = z.infer<typeof PageSchema>;

export const DatasetSchema = z.object({
  adapter: z.string().min(1),
  source: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});
export type Dataset = z.infer<typeof DatasetSchema>;

const TextWatermarkSchema = z.object({
  kind: z.literal('text'),
  text: z.string().min(1),
  expression: z.string().optional(),
  fontSize: z.number().min(8).max(300).default(72),
  color: z.string().default('#cccccc'),
  opacity: z.number().min(0).max(1).default(0.2),
  rotation: z.number().min(-180).max(180).default(-30),
});

const ImageWatermarkSchema = z.object({
  kind: z.literal('image'),
  src: z.string().min(1),
  opacity: z.number().min(0).max(1).default(0.15),
  rotation: z.number().min(-180).max(180).default(0),
  width: z.number().min(10).max(400).default(120),
});

export const WatermarkSchema = z.discriminatedUnion('kind', [TextWatermarkSchema, ImageWatermarkSchema]);
export type Watermark = z.infer<typeof WatermarkSchema>;

const ReportMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  locale: Locale.default('en'),
  /** When omitted, inferred from locale: RTL languages (ar, fa, he, ur, ... incl. ar-*) mean 'rtl'. */
  dir: Direction.optional(),
  /**
   * Digits for {page}/{pages} tokens: 'locale' (default) follows the report locale
   * (Arabic-Indic for Arabic), 'latn' forces Western digits.
   */
  pageNumberDigits: z.enum(['locale', 'latn']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).transform((m) => ({ ...m, dir: m.dir ?? directionForLocale(m.locale) }));

const BandsBlockSchema = z.object({
  reportHeader: BandSchema.optional(),
  pageHeader: BandSchema.optional(),
  detail: BandSchema,
  pageFooter: BandSchema.optional(),
  reportFooter: BandSchema.optional(),
});

export type ReportSchemaV1 = {
  version: '1';
  id: string;
  meta: z.infer<typeof ReportMetaSchema>;
  page: z.infer<typeof PageSchema>;
  dataset: z.infer<typeof DatasetSchema>;
  fields: z.infer<typeof FieldDeclaration>[];
  groups: z.infer<typeof GroupSchema>[];
  bands: z.infer<typeof BandsBlockSchema>;
  watermark?: z.infer<typeof WatermarkSchema>;
  parameters?: ParameterDef[];
};

export const ReportSchemaV1 = z.object({
  version: z.literal('1'),
  id: z.string().min(1),
  meta: ReportMetaSchema,
  page: PageSchema.default({
    size: 'A4',
    orientation: 'portrait',
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
  }),
  dataset: DatasetSchema,
  fields: z.array(FieldDeclaration).min(0),
  groups: z.array(GroupSchema).default([]),
  bands: BandsBlockSchema,
  watermark: WatermarkSchema.optional(),
  parameters: ParametersSchema.optional(),
}) as z.ZodType<ReportSchemaV1>;

export function validateReport(input: unknown): { ok: true; value: ReportSchemaV1 } | { ok: false; error: string } {
  const parsed = ReportSchemaV1.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .slice(0, 12)
    .join('; ');
  return { ok: false, error: `Invalid ReportSchemaV1: ${issues}` };
}
