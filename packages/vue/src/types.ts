import type { Row } from '@reports-web/shared';
import type { ReportSchemaV1, DataAdapter, StorageAdapter, ChartAdapter } from '@reports-web/core';

export interface ReportViewerProps {
  schema: ReportSchemaV1 | null;
  rows?: readonly Row[];
  dataAdapter?: DataAdapter;
  chartAdapter?: ChartAdapter;
  locale?: 'ar' | 'en';
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
  locale?: 'ar' | 'en';
  dir?: 'rtl' | 'ltr';
}
