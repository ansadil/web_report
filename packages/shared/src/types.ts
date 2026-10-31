export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export type FieldType = 'string' | 'number' | 'date' | 'bool' | 'image';

export type Row = Record<string, unknown>;

/**
 * Text that is either a plain string or a per-locale map, e.g. `{ ar: 'العميل', en: 'Customer' }`.
 * Keys are locale codes (not restricted to `Locale` so hosts can add more).
 */
export type LocalizedText = string | Readonly<Record<string, string>>;

/**
 * Metadata for one data field. Used by adapters (`introspect`) and, via `DictField`,
 * by the data dictionary panel. All dictionary-related properties are optional so
 * existing `{ name, type, label }` objects remain valid.
 */
export interface FieldMeta {
  /** Field identifier. Kept for backward compatibility; `path` defaults to `name` when absent. */
  readonly name: string;
  readonly type: FieldType;
  readonly label?: LocalizedText;
  /** Binding path, exactly what a `field` element stores (e.g. `customer.name`). Defaults to `name`. */
  readonly path?: string;
  /** Default format pattern, e.g. `decimal2`, `date:hijri`. */
  readonly format?: string;
  readonly description?: LocalizedText;
  /** Nested object/array fields, shown as a tree. */
  readonly children?: readonly FieldMeta[];
  /** Optional folder in the dictionary panel. */
  readonly group?: string;
  /** True = array of objects; dragging it creates a repeating table bound to `path`. */
  readonly isList?: boolean;
}

/** A dictionary field is the extended `FieldMeta`. */
export type DictField = FieldMeta;
export type DictFieldType = FieldType;

export interface DictSource {
  /** Programmatic identifier of the source (matches `DataQuery.source`). */
  readonly name: string;
  readonly label?: LocalizedText;
  readonly group?: string;
  readonly fields: readonly DictField[];
}

export interface DictRelation {
  readonly from: string;
  readonly fromField: string;
  readonly to: string;
  readonly toField: string;
  readonly name?: string;
}

export type ParameterType = 'string' | 'number' | 'date' | 'dateRange' | 'bool' | 'select';

export interface ParameterOption {
  readonly value: unknown;
  readonly label: LocalizedText;
}

export interface ParameterOptionsSource {
  readonly source: string;
  readonly valueField: string;
  readonly labelField: string;
}

export interface ParameterDef {
  readonly name: string;
  readonly label?: LocalizedText;
  readonly type: ParameterType;
  readonly required?: boolean;
  readonly default?: unknown;
  readonly options?: readonly ParameterOption[] | ParameterOptionsSource;
}

export interface SystemVar {
  readonly token: string;
  readonly label: LocalizedText;
  readonly type: DictFieldType;
}

export interface DataDictionary {
  readonly sources: readonly DictSource[];
  readonly relations?: readonly DictRelation[];
  readonly parameters?: readonly ParameterDef[];
  /** Provided by core, not by adapters. */
  readonly systemVariables: readonly SystemVar[];
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
