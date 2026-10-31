import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@reports-web/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@reports-web/core': resolve(__dirname, '../core/src/index.ts'),
    },
    conditions: ['@reports-web/source'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
