import type { Row } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';

export interface PdfExportInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
  /**
   * Folder with `fonts.json` and the TTFs it lists. Default: the package's bundled
   * `assets/fonts/`. `file://` URLs (Node) are read from disk with no network; `http(s)` URLs
   * are fetched; a relative value resolves against the page in a browser and against
   * `process.cwd()` (as a path) in Node. Only `fonts.json` and the TTFs a report actually uses
   * are read, on the first PDF export, and only from this folder.
   */
  readonly fontsBaseUrl?: string;
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
