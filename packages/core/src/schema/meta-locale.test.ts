import { describe, it, expect } from 'vitest';
import { validateReport, type ReportSchemaV1 } from './report-schema.js';
import { t } from '../i18n/strings.js';

const base = {
  version: '1',
  id: 'r',
  dataset: { adapter: 'static', source: 'rows' },
  fields: [],
  bands: { detail: { height: 8, elements: [] } },
};
const meta = (m: Record<string, unknown>): ReportSchemaV1['meta'] => {
  const r = validateReport({ ...base, meta: { name: 'T', ...m } });
  if (!r.ok) throw new Error(r.error);
  return r.value.meta;
};

describe('meta.locale accepts any valid BCP 47 tag', () => {
  it.each(['ar', 'en', 'ar-SA', 'ar-SA-u-nu-latn', 'en-GB', 'fa-IR', 'he', 'fr'])('accepts %s unchanged', (tag) => {
    expect(meta({ locale: tag }).locale).toBe(tag);
  });

  it('stores the canonical form', () => {
    expect(meta({ locale: 'AR-sa' }).locale).toBe('ar-SA');
  });

  it.each(['xx_yy!!', 'ar_SA', '', 'not a locale', 'x-private'])('rejects %j', (tag) => {
    const r = validateReport({ ...base, meta: { name: 'T', locale: tag } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('meta.locale');
  });

  it('rejects non-strings', () => {
    expect(validateReport({ ...base, meta: { name: 'T', locale: 42 } }).ok).toBe(false);
  });

  it('old templates (ar/en, with or without dir) validate unchanged', () => {
    expect(meta({ locale: 'en', dir: 'ltr' })).toMatchObject({ locale: 'en', dir: 'ltr' });
    expect(meta({ locale: 'ar', dir: 'rtl' })).toMatchObject({ locale: 'ar', dir: 'rtl' });
    expect(meta({})).toMatchObject({ locale: 'en', dir: 'ltr' });
  });
});

describe('meta.dir default is inferred from the locale (isRtlLocale)', () => {
  it.each(['ar', 'ar-SA', 'ar-SA-u-nu-latn', 'fa-IR', 'he', 'ur', 'ps', 'sd', 'ckb', 'yi', 'dv'])('%s -> rtl', (locale) => {
    expect(meta({ locale }).dir).toBe('rtl');
  });

  it.each(['en', 'en-GB', 'fr', 'de-DE'])('%s -> ltr', (locale) => {
    expect(meta({ locale }).dir).toBe('ltr');
  });

  it('an explicit meta.dir always wins', () => {
    expect(meta({ locale: 'ar-SA', dir: 'ltr' }).dir).toBe('ltr');
    expect(meta({ locale: 'he', dir: 'ltr' }).dir).toBe('ltr');
    expect(meta({ locale: 'en-GB', dir: 'rtl' }).dir).toBe('rtl');
    expect(meta({ locale: 'fr', dir: 'rtl' }).dir).toBe('rtl');
  });

  it('still rejects an invalid dir', () => {
    expect(validateReport({ ...base, meta: { name: 'T', locale: 'ar-SA', dir: 'up' } }).ok).toBe(false);
  });
});

describe('i18n UI strings map ar-* to Arabic, anything else to English', () => {
  it('ar / ar-SA / ar-EG -> Arabic', () => {
    expect(t('ar-SA', 'export')).toBe(t('ar', 'export'));
    expect(t('ar-EG-u-nu-latn', 'export')).toBe(t('ar', 'export'));
    expect(t('ar', 'export')).not.toBe(t('en', 'export'));
  });
  it('en-GB / fr / fa-IR / he / undefined -> English fallback', () => {
    for (const l of ['en-GB', 'fr', 'fa-IR', 'he', undefined]) expect(t(l, 'export')).toBe(t('en', 'export'));
  });
});
