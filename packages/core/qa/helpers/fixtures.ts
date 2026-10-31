import { validateReport, type ReportSchemaV1 } from '../../src/schema/report-schema.js';

type AnyObj = Record<string, unknown>;

export function mustValidate(input: unknown): ReportSchemaV1 {
  const r = validateReport(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

/** Fixed Arabic corpus. Each entry is drawn as its own text element (one PDF text run). */
export const CORPUS = {
  title: 'تقرير المبيعات الشهري',
  boldLine: 'الإجمالي العام للفرع',
  lamAlef: 'لا إله إلا الله',
  idara: 'الإدارة',
  tashkeel: 'مُحَمَّد',
  mixed: 'منتج ABC-123 (إصدار 2)',
  western: '1234.56',
  western2: '23.50',
  eastern: '١٢٣٤٫٥٦',
  hijri: '١٥ رمضان ١٤٤٧ هـ',
} as const;

const T = (id: string, value: string, y: number, extra: AnyObj = {}) => ({
  id,
  kind: 'text',
  value,
  pos: { x: 0, y, w: 180, h: 7 },
  ...extra,
});

export const ROWS = [
  { item: 'قلم', qty: 3, price: 1234.56, date: '2026-10-01' },
  { item: 'دفتر', qty: 12, price: 23.5, date: '2026-10-15' },
];

export interface ArabicSchemaOpts {
  dir?: 'rtl' | 'ltr' | undefined;
  locale?: 'ar' | 'en';
  rowsHeader?: boolean;
}

/** Arabic report: corpus in reportHeader, 4-column pageHeader, detail band, sum(price) in reportFooter. */
export function arabicSchema(opts: ArabicSchemaOpts = {}): ReportSchemaV1 {
  const meta: AnyObj = { name: CORPUS.title, locale: opts.locale ?? 'ar' };
  if (opts.dir !== undefined) meta.dir = opts.dir;
  else if (!('dir' in opts)) meta.dir = 'rtl';
  const keys = Object.keys(CORPUS) as (keyof typeof CORPUS)[];
  return mustValidate({
    version: '1',
    id: 'qa-ar',
    meta,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [
      { name: 'item', type: 'string', label: 'الصنف' },
      { name: 'qty', type: 'number', label: 'الكمية' },
      { name: 'price', type: 'number', label: 'السعر' },
      { name: 'date', type: 'date', label: 'التاريخ' },
    ],
    bands: {
      reportHeader: {
        height: keys.length * 8 + 2,
        elements: keys.map((k, i) =>
          T(`c_${k}`, CORPUS[k], i * 8, k === 'title' ? { style: { bold: true, fontSize: 16 } } : k === 'boldLine' ? { style: { bold: true } } : {}),
        ),
      },
      pageHeader: {
        height: 8,
        elements: [
          { id: 'h1', kind: 'text', value: 'الصنف', pos: { x: 0, y: 0, w: 70, h: 7 }, style: { bold: true } },
          { id: 'h2', kind: 'text', value: 'الكمية', pos: { x: 70, y: 0, w: 30, h: 7 }, style: { bold: true } },
          { id: 'h3', kind: 'text', value: 'السعر', pos: { x: 100, y: 0, w: 35, h: 7 }, style: { bold: true } },
          { id: 'h4', kind: 'text', value: 'التاريخ', pos: { x: 135, y: 0, w: 45, h: 7 }, style: { bold: true } },
        ],
      },
      detail: {
        height: 7,
        elements: [
          { id: 'd1', kind: 'field', field: 'item', pos: { x: 0, y: 0, w: 70, h: 6 } },
          { id: 'd2', kind: 'field', field: 'qty', format: 'integer', pos: { x: 70, y: 0, w: 30, h: 6 } },
          { id: 'd3', kind: 'field', field: 'price', format: 'decimal2', pos: { x: 100, y: 0, w: 35, h: 6 } },
          { id: 'd4', kind: 'field', field: 'date', format: 'date:short', pos: { x: 135, y: 0, w: 45, h: 6 } },
        ],
      },
      reportFooter: {
        height: 10,
        elements: [
          { id: 'sl', kind: 'text', value: 'الإجمالي', pos: { x: 0, y: 0, w: 70, h: 6 } },
          { id: 'sum', kind: 'aggregate', fn: 'sum', field: 'price', scope: 'report', format: 'decimal2', pos: { x: 100, y: 0, w: 35, h: 6 } },
        ],
      },
    },
  });
}

/** Minimal LTR English schema with one element, for engine-level (non-bidi) checks. */
export function singleElementSchema(el: AnyObj, meta: AnyObj = { name: 'QA', locale: 'en', dir: 'ltr' }, extraBands: AnyObj = {}): ReportSchemaV1 {
  return mustValidate({
    version: '1',
    id: 'qa-one',
    meta,
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: { reportHeader: { height: 60, elements: [el] }, detail: { height: 0, elements: [] }, ...extraBands },
  });
}
