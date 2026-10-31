import type { Row } from '@reports-web/shared';
import type { ReportSchemaV1 } from '../schema/report-schema.js';
import type { PdfWarning } from './pdf-warnings.js';

export { PdfWarningCode, type PdfWarning } from './pdf-warnings.js';

export interface PdfExportInput {
  readonly schema: ReportSchemaV1;
  readonly rows: readonly Row[];
  /**
   * Folder with `fonts.json` and the TTFs it lists. Default: the package's bundled
   * `assets/fonts/`. `file://` URLs (Node) are read from disk with no network; `http(s)` URLs
   * are fetched; a relative value resolves against the page in a browser and against
   * `process.cwd()` (as a path) in Node. Only `fonts.json` and the TTFs a report actually uses
   * are read, on the first PDF export, and only from this folder.
   *
   * A TTF the custom folder's `fonts.json` lists but that is missing or unloadable, and a
   * custom folder without Noto Sans Arabic / Noto Sans (the fallback fonts), do not fail the
   * export: the bundled faces are used instead and {@link onWarning} is called once per face.
   * The export fails only if the bundled fonts cannot be loaded either (or `fonts.json`
   * itself cannot be read).
   */
  readonly fontsBaseUrl?: string;
  /**
   * Non-fatal problems (codes: {@link PdfWarningCode}), e.g. a font that fell back to the
   * bundled one. Default: `console.warn`.
   */
  readonly onWarning?: (warning: PdfWarning) => void;
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
