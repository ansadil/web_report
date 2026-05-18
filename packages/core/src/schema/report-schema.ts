import { z } from 'zod';

export const PageSizeName = z.enum(['A4', 'A5', 'Letter']);
export type PageSizeName = z.infer<typeof PageSizeName>;

export const FieldType = z.enum(['string', 'number', 'date', 'bool']);
export type FieldType = z.infer<typeof FieldType>;

export const Direction = z.enum(['rtl', 'ltr']);
export const Locale = z.enum(['ar', 'en']);

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
    color: z.string().optional(),
    background: z.string().optional(),
    align: z.enum(['start', 'center', 'end', 'justify']).optional(),
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
export const FieldElement = ElementBase.extend({
  kind: z.literal('field'),
  field: z.string().min(1),
  format: z.string().optional(),
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
});
export type FieldDeclaration = z.infer<typeof FieldDeclaration>;

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
  dir: Direction.default('ltr'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

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
