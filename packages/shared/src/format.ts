import type { Locale } from './types.js';

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export interface NumberFormatOptions {
  readonly style?: 'decimal' | 'currency' | 'percent';
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

export function formatNumber(value: number, locale: Locale, opts: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', opts);
    numberFormatterCache.set(key, f);
  }
  return f.format(value);
}

export function formatDate(value: Date | string | number, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = dateFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', opts);
    dateFormatterCache.set(key, f);
  }
  return f.format(d);
}

/** Per-element format options (schema `formatOptions`). */
export interface PatternOptions {
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short';
}

/**
 * Umm al-Qura (Saudi official) Hijri date via Intl calendar `islamic-umalqura`.
 * A date-only ISO string is read as that calendar day in local time (not UTC midnight),
 * so the Hijri day never shifts by the runtime's UTC offset.
 */
export function formatHijri(value: Date | string, locale: Locale, dateStyle: PatternOptions['dateStyle'] = 'medium'): string {
  let d: Date;
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  else d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const key = `hijri|${locale}|${dateStyle}`;
  let f = dateFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-u-ca-islamic-umalqura', { dateStyle });
    dateFormatterCache.set(key, f);
  }
  return f.format(d);
}

export function applyPattern(value: unknown, pattern: string | undefined, locale: Locale, options?: PatternOptions): string {
  if (value == null) return '';
  if (value instanceof Date) {
    if (!pattern) return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (!pattern) return String(value);
  if (typeof value === 'number') {
    if (pattern === 'integer') return formatNumber(value, locale, { maximumFractionDigits: 0 });
    if (pattern === 'decimal2') return formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (pattern === 'percent') return formatNumber(value, locale, { style: 'percent' });
    if (pattern.startsWith('currency:')) {
      const currency = pattern.slice('currency:'.length) || 'USD';
      return formatNumber(value, locale, { style: 'currency', currency });
    }
    return formatNumber(value, locale);
  }
  if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
    if (pattern === 'date:hijri') return formatHijri(value as Date | string, locale, options?.dateStyle ?? 'medium');
    if (pattern === 'date') return formatDate(value as Date | string, locale, { dateStyle: options?.dateStyle ?? 'medium' });
    if (pattern === 'date:short') return formatDate(value as Date | string, locale, { dateStyle: 'short' });
    if (pattern === 'date:long') return formatDate(value as Date | string, locale, { dateStyle: 'long' });
    if (pattern === 'datetime') return formatDate(value as Date | string, locale, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return String(value);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
