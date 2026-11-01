import type { LocaleTag, Row } from '@reports-web/shared';
import type { ReportSchemaV1, DataAdapter, StorageAdapter, ChartAdapter, ParameterValues } from '@reports-web/core';

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
  /** Report parameter values (by `ParameterDef.name`), merged into `DataQuery.params`; changes trigger a refetch. */
  params?: ParameterValues;
  /**
   * IANA time zone for relative parameter presets and date coercion (default `'Asia/Riyadh'`). An unknown zone falls
   * back to the default and emits `time-zone-invalid` (`{ timeZone, fallback }`).
   */
  timeZone?: string;
  /** Base URL for the woff2 faces. Omitted leaves the element's default. */
  fontsBaseUrl?: string;
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
}
