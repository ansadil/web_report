import { describe, it, expect, afterEach } from 'vitest';
import { canonicalizeLocaleTag, directionForLocale, isRtlLocale, isValidLocaleTag, primaryLanguage, uiLanguage } from './locale.js';

type Proto = { getTextInfo?: unknown; textInfo?: unknown };
const proto = Intl.Locale.prototype as unknown as Proto;
const saved = {
  getTextInfo: Object.getOwnPropertyDescriptor(proto, 'getTextInfo'),
  textInfo: Object.getOwnPropertyDescriptor(proto, 'textInfo'),
};
afterEach(() => {
  for (const k of ['getTextInfo', 'textInfo'] as const) {
    if (saved[k]) Object.defineProperty(proto, k, saved[k]!);
    else delete proto[k];
  }
});

describe('isRtlLocale', () => {
  it.each(['ar', 'ar-SA', 'ar-SA-u-nu-latn', 'fa-IR', 'he', 'he-IL', 'iw', 'ur', 'ur-PK', 'ps', 'sd', 'ckb', 'yi', 'dv'])('%s -> rtl', (tag) => {
    expect(isRtlLocale(tag)).toBe(true);
    expect(directionForLocale(tag)).toBe('rtl');
  });

  it.each(['en', 'en-GB', 'fr', 'de-DE', 'ja', 'arn', 'hea'])('%s -> ltr', (tag) => {
    expect(isRtlLocale(tag)).toBe(false);
    expect(directionForLocale(tag)).toBe('ltr');
  });

  it('uses Intl.Locale(tag).language, not a string prefix', () => {
    expect(primaryLanguage('ar-SA')).toBe('ar');
    expect(primaryLanguage('AR-sa')).toBe('ar');
    expect(primaryLanguage('arn-CL')).toBe('arn'); // Mapudungun: starts with "ar", is LTR
    expect(isRtlLocale('arn-CL')).toBe(false);
  });

  it.each(['xx_yy!!', 'ar_SA', '', 'x-private', '  '])('invalid tag %j falls back to ltr', (tag) => {
    expect(isRtlLocale(tag)).toBe(false);
    expect(directionForLocale(tag)).toBe('ltr');
  });

  it('null / undefined -> ltr', () => {
    expect(isRtlLocale(undefined)).toBe(false);
    expect(isRtlLocale(null)).toBe(false);
  });

  it('works without Intl.Locale#getTextInfo / textInfo (subtag list only)', () => {
    delete proto.getTextInfo;
    Object.defineProperty(proto, 'textInfo', { configurable: true, get: () => undefined });
    for (const tag of ['ar-SA', 'fa-IR', 'he', 'ur']) expect(isRtlLocale(tag)).toBe(true);
    for (const tag of ['en-GB', 'fr', 'az-Arab']) expect(isRtlLocale(tag)).toBe(false);
  });

  it('honors getTextInfo() for scripts outside the list (az-Arab)', () => {
    Object.defineProperty(proto, 'getTextInfo', { configurable: true, writable: true, value: () => ({ direction: 'rtl' }) });
    expect(isRtlLocale('az-Arab')).toBe(true);
  });

  it('honors the textInfo getter when getTextInfo() is absent', () => {
    delete proto.getTextInfo;
    Object.defineProperty(proto, 'textInfo', { configurable: true, get: () => ({ direction: 'rtl' }) });
    expect(isRtlLocale('az-Arab')).toBe(true);
  });

  it('required RTL languages stay rtl even if textInfo says ltr', () => {
    Object.defineProperty(proto, 'getTextInfo', { configurable: true, writable: true, value: () => ({ direction: 'ltr' }) });
    for (const tag of ['ar-SA', 'fa-IR', 'he', 'ur']) expect(isRtlLocale(tag)).toBe(true);
  });
});

describe('locale tag validation and UI language', () => {
  it('canonicalizes valid tags and rejects invalid ones', () => {
    expect(canonicalizeLocaleTag('AR-sa')).toBe('ar-SA');
    expect(canonicalizeLocaleTag('ar-SA-u-nu-latn')).toBe('ar-SA-u-nu-latn');
    expect(isValidLocaleTag('en-GB')).toBe(true);
    for (const bad of ['xx_yy!!', 'ar_SA', '', 42, null]) expect(isValidLocaleTag(bad)).toBe(false);
  });

  it('uiLanguage: ar / ar-* -> ar, everything else -> en', () => {
    expect(uiLanguage('ar')).toBe('ar');
    expect(uiLanguage('ar-SA')).toBe('ar');
    expect(uiLanguage('ar-EG-u-nu-latn')).toBe('ar');
    for (const tag of ['en', 'en-GB', 'fr', 'fa-IR', 'he', 'arn', 'xx_yy!!', undefined]) expect(uiLanguage(tag)).toBe('en');
  });
});
