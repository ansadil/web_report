export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export type FieldType = 'string' | 'number' | 'date' | 'bool';

export type Row = Record<string, unknown>;

export interface FieldMeta {
  readonly name: string;
  readonly type: FieldType;
  readonly label?: string;
}

export interface DatasetQuery {
  readonly source: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export type ExportKind = 'pdf' | 'excel' | 'png' | 'print' | 'csv';

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

export const PAGE_SIZES_MM: Readonly<Record<'A4' | 'A5' | 'Letter', PageSize>> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
};

export const MM_TO_PT = 2.834645669;
export const MM_TO_PX = 3.7795275591;
