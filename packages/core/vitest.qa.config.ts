import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * QA acceptance suite (run with `pnpm test:qa`). Tests here are EXPECTED TO FAIL
 * until the corresponding bug (see test name prefix BUG-xx) is fixed.
 * Kept out of the default `vitest run` (which only includes src/**).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@reports-web/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['qa/**/*.qa.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    // keep the summary readable: report every failure, never bail
    reporters: ['verbose'],
  },
});
