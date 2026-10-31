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
});
