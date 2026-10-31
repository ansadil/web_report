import type { Row } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

export interface PdfExportInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
}

/**
 * Export a report to PDF.
 *
 * The renderer (pdf-lib, fontkit, HarfBuzz WASM, bidi tables, fonts) is loaded on first call
 * via dynamic `import()`, so none of it is part of the main bundle.
 */
export async function exportPdf(input: PdfExportInput): Promise<Blob> {
  const { renderPdf } = await import('./pdf-render.js');
  return renderPdf(input);
}
