import type { LocaleTag, Row } from '@reports-web/shared';
import type { ReportSchemaV1, DataAdapter, StorageAdapter, ChartAdapter } from '@reports-web/core';

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
  className?: string;
  style?: React.CSSProperties;
  onRendered?: (info: { sections: number; rows: number }) => void;
  onExport?: (payload: ExportPayload) => void;
  onExportError?: (error: { kind: ExportKind; error: string }) => void;
}

export interface ReportBuilderProps {
  schema?: ReportSchemaV1 | null;
  dataAdapter?: DataAdapter;
  storageAdapter?: StorageAdapter;
  sampleRows?: readonly Row[];
  /** BCP 47 tag ('ar', 'ar-SA', 'en-GB', ...). UI strings: ar / ar-* -> Arabic, else English. */
  locale?: LocaleTag;
  dir?: 'rtl' | 'ltr';
  className?: string;
  style?: React.CSSProperties;
  onSave?: (schema: ReportSchemaV1) => void;
  onSaveError?: (error: string) => void;
  onExportJson?: (payload: { blob: Blob; filename: string }) => void;
}
