import type { Direction, Locale } from './types.js';

/**
 * Primary language subtags written right-to-left. ar, fa, he, ur are required by the spec; ps, sd,
 * ckb, yi, dv are also RTL. (`iw` is canonicalized to `he` by Intl.Locale.)
 */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ckb', 'yi', 'dv']);

/**
 * Canonical BCP 47 form of `tag` (via `Intl.getCanonicalLocales`), or `null` when it is not a
 * valid single language tag (e.g. `'xx_yy!!'`, `'ar_SA'`, `''`).
 */
export function canonicalizeLocaleTag(tag: unknown): string | null {
  if (typeof tag !== 'string' || tag.trim() === '') return null;
  try {
    const out = Intl.getCanonicalLocales(tag);
    return out.length === 1 ? out[0]! : null;
  } catch {
    return null;
  }
}

export function isValidLocaleTag(tag: unknown): tag is string {
  return canonicalizeLocaleTag(tag) !== null;
}

/**
 * Primary language subtag via `new Intl.Locale(tag).language` (`'ar-SA'` -> `'ar'`, `'iw'` -> `'he'`),
 * or `''` when `tag` is not a valid BCP 47 tag (Intl.Locale throws).
 */
export function primaryLanguage(tag: string | undefined | null): string {
  if (typeof tag !== 'string' || tag === '') return '';
  try {
    return new Intl.Locale(tag).language.toLowerCase();
  } catch {
    return '';
  }
}

type TextInfoLocale = Intl.Locale & {
  getTextInfo?: () => { direction?: string };
  textInfo?: { direction?: string };
};

/**
 * Whether `tag` is written right-to-left: its primary language (`new Intl.Locale(tag).language`)
 * is one of ar, fa, he, ur (+ ps, sd, ckb, yi, dv), or the runtime's `Intl.Locale#getTextInfo()` /
 * `textInfo` reports `'rtl'` (e.g. `'az-Arab'`). Invalid tags (Intl.Locale throws) are LTR.
 */
export function isRtlLocale(tag: string | undefined | null): boolean {
  if (typeof tag !== 'string' || tag === '') return false;
  let loc: TextInfoLocale;
  try {
    loc = new Intl.Locale(tag) as TextInfoLocale;
  } catch {
    return false;
  }
  if (RTL_LANGUAGES.has(loc.language.toLowerCase())) return true;
  try {
    const info = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
    return info?.direction === 'rtl';
  } catch {
    return false;
  }
}

/** Default text direction for a locale tag (`'ltr'` for invalid tags). */
export function directionForLocale(tag: string | undefined | null): Direction {
  return isRtlLocale(tag) ? 'rtl' : 'ltr';
}

/** UI-string language for a locale tag: `ar` / `ar-*` -> `'ar'`, anything else (or invalid) -> `'en'`. */
export function uiLanguage(tag: string | undefined | null): Locale {
  return primaryLanguage(tag) === 'ar' ? 'ar' : 'en';
}
