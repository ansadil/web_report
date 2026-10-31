import type { LocaleTag, Row } from '@reports-web/shared';
import type { ReportSchemaV1, DataAdapter, StorageAdapter, ChartAdapter } from '@reports-web/core';

export interface ReportViewerProps {
  schema: ReportSchemaV1 | null;
  rows?: readonly Row[];
  dataAdapter?: DataAdapter;
  chartAdapter?: ChartAdapter;
  /** BCP 47 tag ('ar', 'ar-SA', 'en-GB', ...). UI strings: ar / ar-* -> Arabic, else English. */
  locale?: LocaleTag;
  dir?: 'rtl' | 'ltr';
  noToolbar?: boolean;
  hideViewControls?: boolean;
  /** Continuous scroll without stacked page sheets (`hide-page-boundaries`). */
  hidePageBoundaries?: boolean;
}

export interface ReportBuilderProps {
  schema?: ReportSchemaV1 | null;
  dataAdapter?: DataAdapter;
  storageAdapter?: StorageAdapter;
  sampleRows?: readonly Row[];
  /** BCP 47 tag ('ar', 'ar-SA', 'en-GB', ...). UI strings: ar / ar-* -> Arabic, else English. */
  locale?: LocaleTag;
  dir?: 'rtl' | 'ltr';
}
