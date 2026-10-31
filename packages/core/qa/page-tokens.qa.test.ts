// @vitest-environment happy-dom
/**
 * QA acceptance — BUG-15 shared page-token resolver (one core function used by PDF and HTML viewer).
 * ASSUMED NAME/SIGNATURE (not yet in the codebase):
 *   export function resolvePageTokens(text: string, ctx: { page: number; pages: number }): string
 * exported from the package root '@reports-web/core' (src/index.ts).
 * Tokens: {page} {pages} + Arabic aliases {صفحة} {صفحات}; replaced anywhere, every occurrence.
 * Digit shaping (Western vs Eastern) is left to the implementation: assertions normalise digits.
 */
import { describe, it, expect } from 'vitest';
import * as core from '../src/index.js';

type Resolver = (text: string, ctx: { page: number; pages: number }) => string;
const resolver = (): Resolver => {
  const fn = (core as Record<string, unknown>).resolvePageTokens;
  expect(typeof fn, 'core must export resolvePageTokens(text, { page, pages })').toBe('function');
  return fn as Resolver;
};
const west = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const r = (text: string, page = 3, pages = 12) => west(resolver()(text, { page, pages }));

describe('resolvePageTokens (assumed shared core export)', () => {
  it('BUG-15 resolvePageTokens is exported from @reports-web/core', () => { resolver(); });
  it('BUG-15 {page} → current page', () => expect(r('{page}')).toBe('3'));
  it('BUG-15 {pages} → total pages', () => expect(r('{pages}')).toBe('12'));
  it('BUG-15 alias {صفحة} → current page', () => expect(r('{صفحة}')).toBe('3'));
  it('BUG-15 alias {صفحات} → total pages', () => expect(r('{صفحات}')).toBe('12'));
  it('BUG-15 user template «صفحة {page} من {pages}»', () => expect(r('صفحة {page} من {pages}')).toBe('صفحة 3 من 12'));
  it('BUG-15 aliases template «صفحة {صفحة} من {صفحات}»', () => expect(r('صفحة {صفحة} من {صفحات}')).toBe('صفحة 3 من 12'));
  it('BUG-15 token mid-sentence', () => expect(r('Page {page} of the annual report')).toBe('Page 3 of the annual report'));
  it('BUG-15 multiple and repeated tokens in one string', () =>
    expect(r('{page}/{pages} · {صفحة}/{صفحات} · {page}')).toBe('3/12 · 3/12 · 3'));
  it('BUG-15 text without tokens and unknown tokens are left unchanged', () =>
    expect(r('الإجمالي {total} {Page} page')).toBe('الإجمالي {total} {Page} page'));
});
