import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
  resolve: { dedupe: ['lit'] },
  optimizeDeps: {
    exclude: ['@reports-web/core', '@reports-web/shared'],
    esbuildOptions: { target: 'esnext' },
  },
  build: { target: 'esnext' },
});
