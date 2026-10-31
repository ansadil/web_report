/**
 * Page-number tokens for static text in any band, shared by the HTML viewer and the PDF exporter.
 *
 *   {page}  / {صفحة}   current page number (1-based)
 *   {pages} / {صفحات}  total page count
 *
 * Tokens are replaced anywhere inside the text, so "صفحة {page} من {pages}" works.
 * Only template text should go through this; data values are never tokenized.
 *
 * Digits: with `locale` set, page numbers are formatted like body numbers for that locale
 * (Arabic-Indic for `ar` / `ar-*`, e.g. "صفحة ١ من ٨"; Western for `en`). `digits: 'latn'`
 * forces Western digits. Without `locale`, Western digits are used (backward compatible).
 */
import { formatPageNumber, type DigitsMode, type LocaleTag } from '@reports-web/shared';

export interface PageTokenContext {
  readonly page: number;
  readonly pages: number;
  /** Report number locale; page numbers follow it. Omit for plain Western digits. */
  readonly locale?: LocaleTag;
  /** `'locale'` (default) follows `locale`; `'latn'` forces Western digits 0-9. */
  readonly digits?: DigitsMode;
}

const TOKEN_RE = /\{(page|pages|صفحة|صفحات)\}/gu;

export function hasPageTokens(text: string | undefined | null): boolean {
  if (!text) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

export function replacePageTokens(text: string, ctx: PageTokenContext): string {
  return text.replace(TOKEN_RE, (_m, name: string) =>
    formatPageNumber(name === 'page' || name === 'صفحة' ? ctx.page : ctx.pages, ctx.locale, ctx.digits),
  );
}
