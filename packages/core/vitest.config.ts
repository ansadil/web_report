import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@reports-web/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
    conditions: ['@reports-web/source'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
