// @vitest-environment node
import { describe, expect, it } from 'vitest';

describe('SSR import', () => {
  it('imports every package in Node without a DOM', async () => {
    expect(typeof window).toBe('undefined');
    await expect(import('@reports-web/shared')).resolves.toBeTruthy();
    await expect(import('./index.js')).resolves.toBeTruthy();
    await expect(import('../../react/src/index.ts')).resolves.toBeTruthy();
    await expect(import('../../vue/src/index.ts')).resolves.toBeTruthy();
    await expect(import('../../convex/src/index.ts')).resolves.toBeTruthy();
  });
});
