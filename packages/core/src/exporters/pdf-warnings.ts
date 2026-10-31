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

/**
 * One non-fatal problem. Each is reported once per export for the same `code`, `family`
 * (case-insensitive), `weight` and `url`.
 */
export interface PdfWarning {
  readonly code: PdfWarningCode;
  /** Human-readable, English. */
  readonly message: string;
  readonly family?: string;
  /** CSS weight of the face the PDF asked for (400 regular, 700 bold). */
  readonly weight?: number;
  /** CSS style of the face the PDF asked for (PDF text is always `normal`). */
  readonly style?: 'normal' | 'italic';
  readonly url?: string;
}

/**
 * Default `onWarning`: `console.warn`. A custom `onWarning` that throws does not fail the
 * export: the error is logged with `console.error`.
 */
export function defaultPdfWarning(w: PdfWarning): void {
  console.warn(`[reports-web pdf] ${w.code}: ${w.message}`, w);
}
