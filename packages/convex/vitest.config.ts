import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@reports-web\/core\/(.*)$/, replacement: resolve(__dirname, '../core/src/$1.ts') },
      { find: '@reports-web/shared', replacement: resolve(__dirname, '../shared/src/index.ts') },
    ],
    conditions: ['@reports-web/source'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
