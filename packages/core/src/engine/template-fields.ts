import type { Row } from '@reports-web/shared';
import { applyPattern, escapeHtml, type LocaleTag } from '@reports-web/shared';

/** Matches `<fieldName>` or `<parent.child>` field placeholders (not HTML tags with attributes). */
export const FIELD_PLACEHOLDER_RE = /<([A-Za-z_][\w.]*)>/g;

export function getRowFieldValue(row: Row | undefined, fieldPath: string): unknown {
  if (!row) return undefined;
  const parts = fieldPath.split('.');
  let cur: unknown = row;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function substituteFieldPlaceholders(
  template: string,
  row: Row | undefined,
  locale: LocaleTag,
  format?: string,
): string {
  if (!row) return template;
  return template.replace(FIELD_PLACEHOLDER_RE, (match, fieldName: string) => {
    const top = fieldName.split('.')[0]!;
    if (!(top in row)) return match;
    const value = getRowFieldValue(row, fieldName);
    if (value === undefined) return match;
    return escapeHtml(applyPattern(value, format, locale));
  });
}

export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
