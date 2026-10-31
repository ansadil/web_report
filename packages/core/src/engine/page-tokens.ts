/**
 * Page-number tokens for static text in any band, shared by the HTML viewer and the PDF exporter.
 *
 *   {page}  / {صفحة}   current page number (1-based)
 *   {pages} / {صفحات}  total page count
 *
 * Tokens are replaced anywhere inside the text, so "صفحة {page} من {pages}" works.
 * Only template text should go through this; data values are never tokenized.
 */
export interface PageTokenContext {
  readonly page: number;
  readonly pages: number;
}

const TOKEN_RE = /\{(page|pages|صفحة|صفحات)\}/gu;

export function hasPageTokens(text: string | undefined | null): boolean {
  if (!text) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(text);
}

export function replacePageTokens(text: string, ctx: PageTokenContext): string {
  return text.replace(TOKEN_RE, (_m, name: string) =>
    name === 'page' || name === 'صفحة' ? String(ctx.page) : String(ctx.pages),
  );
}
