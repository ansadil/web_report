import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['@reports-web/source'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
