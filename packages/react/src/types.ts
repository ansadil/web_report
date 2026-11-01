import type { LocaleTag, Row } from '@reports-web/shared';
import type { ReportSchemaV1, DataAdapter, StorageAdapter, ChartAdapter, ParameterValues, ParameterIssue } from '@reports-web/core';

export type ExportKind = 'pdf' | 'excel' | 'csv' | 'png' | 'print';

export interface ExportPayload {
  kind: ExportKind;
  blob?: Blob;
  filename?: string;
}

export interface ReportViewerProps {
  schema: ReportSchemaV1 | null;
  rows?: readonly Row[];
  dataAdapter?: DataAdapter;
  chartAdapter?: ChartAdapter;
  /** BCP 47 tag ('ar', 'ar-SA', 'en-GB', ...). UI strings: ar / ar-* -> Arabic, else English. */
  locale?: LocaleTag;
  dir?: 'rtl' | 'ltr';
  noToolbar?: boolean;
  /** Hide zoom / section navigation (export toolbar stays visible unless `noToolbar`). */
  hideViewControls?: boolean;
  /** Continuous scroll without stacked page sheets (matches attribute `hide-page-boundaries`). */
  hidePageBoundaries?: boolean;
  /** Report parameter values (by `ParameterDef.name`), merged into `DataQuery.params`; changes trigger a refetch. */
  params?: ParameterValues;
  /**
   * IANA time zone for relative parameter presets and date coercion (default `'Asia/Riyadh'`). An unknown zone falls
   * back to the default and calls `onTimeZoneInvalid`.
   */
  timeZone?: string;
  /** Format shown in the "invalid date" parameter message (default `'YYYY-MM-DD'`); see `dateFormatHintFor(locale)`. */
  dateFormatHint?: string;
  /** Base URL for the woff2 faces. Omitted leaves the element's default. */
  fontsBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  onRendered?: (info: { sections: number; rows: number }) => void;
  onExport?: (payload: ExportPayload) => void;
  onExportError?: (error: { kind: ExportKind; error: string }) => void;
  /** Required/invalid parameter values; no fetch is made. */
  onParametersError?: (detail: { error: string; issues: readonly ParameterIssue[] }) => void;
  /** `timeZone` is not a known IANA zone; the viewer renders in `fallback` (`'Asia/Riyadh'`). Element event `time-zone-invalid`. */
  onTimeZoneInvalid?: (detail: { timeZone: string; fallback: string }) => void;
}

export interface ReportBuilderProps {
  schema?: ReportSchemaV1 | null;
  dataAdapter?: DataAdapter;
  storageAdapter?: StorageAdapter;
  sampleRows?: readonly Row[];
  /** BCP 47 tag ('ar', 'ar-SA', 'en-GB', ...). UI strings: ar / ar-* -> Arabic, else English. */
  locale?: LocaleTag;
  dir?: 'rtl' | 'ltr';
  /** Base URL for the woff2 faces. Omitted leaves the element's default. */
  fontsBaseUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  onSave?: (schema: ReportSchemaV1) => void;
  onSaveError?: (error: string) => void;
  onExportJson?: (payload: { blob: Blob; filename: string }) => void;
}
