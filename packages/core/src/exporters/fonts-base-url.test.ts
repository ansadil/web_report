// @vitest-environment node
/**
 * BUG-35: the default fonts folder is resolved from the module URL with URL resolution, so a
 * bundled module (`/assets/index-abc.js`) stays on its own origin instead of yielding
 * `http://assets/fonts/`.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_FONTS_BASE_URL, defaultFontsBaseUrlFor } from './fonts-manifest.js';

/** The pre-fix computation (regex-strip three path segments), for comparison. */
const legacy = (u: string): string => `${u.replace(/[?#].*$/, '').replace(/\/[^/]*\/[^/]*\/[^/]*$/, '')}/assets/fonts/`;

const PKG = fileURLToPath(new URL('../../', import.meta.url));

describe('defaultFontsBaseUrlFor (BUG-35)', () => {
  it.each([
    ['http://localhost:4173/assets/index-abc.js', 'http://localhost:4173/assets/fonts/'],
    ['https://madar.example/assets/index-abc.js?v=1#x', 'https://madar.example/assets/fonts/'],
    ['http://localhost:4173/index.js', 'http://localhost:4173/assets/fonts/'],
    ['https://cdn.example/app/static/js/chunk-1.js', 'https://cdn.example/app/assets/fonts/'],
    ['http://127.0.0.1:5173/@fs/w/packages/core/dist/exporters/fonts-manifest.js', 'http://127.0.0.1:5173/@fs/w/packages/core/assets/fonts/'],
  ])('bundled/served %s → same origin %s', (moduleUrl, expected) => {
    const got = defaultFontsBaseUrlFor(moduleUrl);
    expect(got).toBe(expected);
    expect(new URL(got).origin).toBe(new URL(moduleUrl).origin);
    expect(got).not.toMatch(/^https?:\/\/assets\//);
  });

  it('the old regex produced the bogus host for a bundled module', () => {
    expect(legacy('http://localhost:4173/assets/index-abc.js')).toBe('http://assets/fonts/');
  });

  it.each(['src', 'dist'])('file:// %s/exporters → <package>/assets/fonts/, same as before', (dir) => {
    const moduleUrl = pathToFileURL(`${PKG}${dir}/exporters/fonts-manifest.js`).href;
    const got = defaultFontsBaseUrlFor(moduleUrl);
    expect(got).toBe(pathToFileURL(`${PKG}assets/fonts/`).href);
    expect(got).toBe(legacy(moduleUrl));
  });

  it('unbundled http src/dist paths match the previous value', () => {
    for (const u of ['http://h:1/node_modules/@reports-web/core/dist/exporters/fonts-manifest.js', 'http://h:1/packages/core/src/exporters/fonts-manifest.ts']) {
      expect(defaultFontsBaseUrlFor(u)).toBe(legacy(u));
    }
  });

  it('DEFAULT_FONTS_BASE_URL is this module resolved the same way', () => {
    expect(DEFAULT_FONTS_BASE_URL).toBe(defaultFontsBaseUrlFor(new URL('./fonts-manifest.ts', import.meta.url).href));
    expect(fileURLToPath(DEFAULT_FONTS_BASE_URL)).toBe(`${PKG}assets/fonts/`);
  });
});
