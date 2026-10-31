/**
 * Non-fatal problems reported by {@link exportPdf} through `onWarning`. Tiny and dependency
 * free: part of the public API (main bundle), unlike the lazily loaded PDF renderer.
 */

/** `code` values of {@link PdfWarning}. */
export const PdfWarningCode = {
  /**
   * A `fonts.json` entry of a custom `fontsBaseUrl` points at a TTF that is missing or cannot
   * be loaded; the bundled face of the same family/weight is embedded instead (or, if the
   * bundled folder lacks the family, the bundled Noto Sans Arabic / Noto Sans fallbacks).
   * `family` = the family, `url` = the TTF that failed.
   */
  FONT_FILE_UNAVAILABLE: 'FONT_FILE_UNAVAILABLE',
  /**
   * A custom `fontsBaseUrl`'s `fonts.json` has no Noto Sans Arabic / Noto Sans face (the PDF
   * fallback fonts); the bundled one is embedded instead. `family` = the fallback family,
   * `url` = the custom folder's `fonts.json`.
   */
  FONT_FALLBACK_MISSING: 'FONT_FALLBACK_MISSING',
} as const;

export type PdfWarningCode = (typeof PdfWarningCode)[keyof typeof PdfWarningCode];

export interface PdfWarning {
  readonly code: PdfWarningCode;
  /** Human-readable, English. */
  readonly message: string;
  readonly family?: string;
  readonly url?: string;
}

/** Default `onWarning`: `console.warn`. */
export function defaultPdfWarning(w: PdfWarning): void {
  console.warn(`[reports-web pdf] ${w.code}: ${w.message}`, w);
}
