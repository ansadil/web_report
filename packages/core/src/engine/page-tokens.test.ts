import { describe, it, expect } from 'vitest';
import { hasPageTokens, replacePageTokens } from './page-tokens.js';

describe('replacePageTokens', () => {
  const ctx = { page: 2, pages: 5 };
  it('replaces tokens anywhere in the text', () => {
    expect(replacePageTokens('صفحة {page} من {pages}', ctx)).toBe('صفحة 2 من 5');
    expect(replacePageTokens('Page {page} of {pages}', ctx)).toBe('Page 2 of 5');
  });
  it('supports the Arabic aliases', () => {
    expect(replacePageTokens('{صفحة} / {صفحات}', ctx)).toBe('2 / 5');
  });
  it('keeps the legacy whole-text token working', () => {
    expect(replacePageTokens('{page}', ctx)).toBe('2');
  });
  it('leaves unknown braces alone', () => {
    expect(replacePageTokens('{total} {Page}', ctx)).toBe('{total} {Page}');
  });
  it('detects tokens', () => {
    expect(hasPageTokens('صفحة {page}')).toBe(true);
    expect(hasPageTokens('no tokens')).toBe(false);
    expect(hasPageTokens(undefined)).toBe(false);
  });
  it('follows the number locale when given: Arabic-Indic for ar / ar-*, Western for en', () => {
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 1, pages: 8, locale: 'ar' })).toBe('صفحة ١ من ٨');
    expect(replacePageTokens('{صفحة} / {صفحات}', { page: 12, pages: 1234, locale: 'ar-SA' })).toBe('١٢ / ١٢٣٤');
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 3, pages: 8, locale: 'AR-ae' })).toBe('صفحة ٣ من ٨');
    expect(replacePageTokens('Page {page} of {pages}', { page: 1, pages: 8, locale: 'en' })).toBe('Page 1 of 8');
    expect(replacePageTokens('Page {page} of {pages}', { page: 1, pages: 1234, locale: 'en' })).toBe('Page 1 of 1234');
  });
  it("digits: 'latn' forces Western digits; an explicit -u-nu-latn locale is respected", () => {
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 1, pages: 8, locale: 'ar', digits: 'latn' })).toBe('صفحة 1 من 8');
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 1, pages: 8, locale: 'ar-SA-u-nu-latn' })).toBe('صفحة 1 من 8');
    expect(replacePageTokens('صفحة {page} من {pages}', { page: 1, pages: 8, locale: 'ar', digits: 'locale' })).toBe('صفحة ١ من ٨');
  });
});
