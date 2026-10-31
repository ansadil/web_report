import type { Locale } from './types.js';

/**
 * Any locale accepted by the formatters: the schema's `'ar' | 'en'`, or a full BCP 47 tag
 * such as `'ar-SA'`, `'ar-AE-u-nu-latn'` or `'en-GB'`.
 */
export type LocaleTag = Locale | (string & {});

/** Digits used for numbers: `'locale'` follows the locale (Arabic-Indic for Arabic), `'latn'` forces 0-9. */
export type DigitsMode = 'locale' | 'latn';

const ARABIC_RE = /^ar(?:-|_|$)/i;

/** True for `'ar'` and every `'ar-*'` tag (case-insensitive). */
export function isArabicLocale(locale: string | undefined | null): boolean {
  return !!locale && ARABIC_RE.test(locale.trim());
}

const resolvedLocaleCache = new Map<string, string>();

/**
 * Map a report locale to the Intl locale used for numbers and Gregorian dates.
 *
 * - Arabic (`ar`, `ar-*`, any case): keeps the region and forces Arabic-Indic digits with
 *   `-u-nu-arab` (ICU defaults some Arabic regions, and bare `ar`, to Latin digits). An explicit
 *   `nu` extension in the tag (e.g. `ar-SA-u-nu-latn`) is respected.
 * - `'en'` maps to `'en-US'`; any other valid tag is passed through.
 * - Invalid tags fall back to `'en-US'` instead of throwing.
 */
export function resolveIntlLocale(locale: LocaleTag): string {
  const key = String(locale ?? '');
  const hit = resolvedLocaleCache.get(key);
  if (hit) return hit;
  let out: string;
  const tag = key.trim().replace(/_/g, '-');
  try {
    if (isArabicLocale(tag)) {
      const loc = new Intl.Locale(tag);
      out = (loc.numberingSystem ? loc : new Intl.Locale(tag, { numberingSystem: 'arab' })).toString();
    } else if (!tag || tag.toLowerCase() === 'en') {
      out = 'en-US';
    } else {
      out = new Intl.Locale(tag).toString();
    }
  } catch {
    out = 'en-US';
  }
  resolvedLocaleCache.set(key, out);
  return out;
}

/**
 * Locale for Umm al-Qura Hijri dates. Arabic keeps its region (bare `ar` becomes `ar-SA`), adds
 * `ca=islamic-umalqura`, and uses Arabic-Indic digits unless the tag sets `nu`.
 */
export function resolveHijriLocale(locale: LocaleTag): string {
  const tag = String(locale ?? '').trim().replace(/_/g, '-');
  try {
    if (isArabicLocale(tag)) {
      const base = new Intl.Locale(tag);
      const withRegion = base.region ? base : new Intl.Locale(tag, { region: 'SA' });
      return new Intl.Locale(withRegion.toString(), {
        calendar: 'islamic-umalqura',
        numberingSystem: base.numberingSystem ?? 'arab',
      }).toString();
    }
    if (!tag || tag.toLowerCase() === 'en') return 'en-u-ca-islamic-umalqura';
    return new Intl.Locale(tag, { calendar: 'islamic-umalqura' }).toString();
  } catch {
    return 'en-u-ca-islamic-umalqura';
  }
}

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export interface NumberFormatOptions {
  readonly style?: 'decimal' | 'currency' | 'percent';
  readonly currency?: string;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly useGrouping?: boolean;
}

export function formatNumber(value: number, locale: LocaleTag, opts: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = numberFormatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(resolveIntlLocale(locale), opts);
    numberFormatterCache.set(key, f);
  }
  return f.format(value);
}

export function formatDate(value: Date | string | number, locale: LocaleTag, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = dateFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(resolveIntlLocale(locale), opts);
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
export function formatHijri(value: Date | string, locale: LocaleTag, dateStyle: PatternOptions['dateStyle'] = 'medium'): string {
  let d: Date;
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  else d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const key = `hijri|${locale}|${dateStyle}`;
  let f = dateFormatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(resolveHijriLocale(locale), { dateStyle });
    dateFormatterCache.set(key, f);
  }
  return f.format(d);
}

export function applyPattern(value: unknown, pattern: string | undefined, locale: LocaleTag, options?: PatternOptions): string {
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

/**
 * Format a page number (no grouping) the same way body numbers are formatted for `locale`,
 * or with Western digits when `digits` is `'latn'`. Without a locale, Western digits are used.
 */
export function formatPageNumber(n: number, locale?: LocaleTag, digits: DigitsMode = 'locale'): string {
  if (!Number.isFinite(n)) return '';
  if (!locale || digits === 'latn') return String(Math.trunc(n));
  return formatNumber(Math.trunc(n), locale, { useGrouping: false, maximumFractionDigits: 0 });
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
