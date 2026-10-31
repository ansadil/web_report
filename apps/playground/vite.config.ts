import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** `@reports-web/core`'s fonts folder (fonts.json, TTF for PDF, WOFF2 for the UI). */
const FONTS_DIR = fileURLToPath(new URL('../../packages/core/assets/fonts/', import.meta.url));
const FONTS_ROUTE = '/assets/fonts/';

/**
 * Same-origin fonts (BUG-35): serve the core fonts folder at `/assets/fonts/` in dev, and copy
 * it to `dist/assets/fonts/` in the build (so `vite preview` and any static host serve it). main.ts passes that URL as
 * `fontsBaseUrl`, so nothing depends on where the bundler put the core module.
 */
function reportsFonts(): Plugin {
  const serve = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void): void => {
    const path = (req.url ?? '').split(/[?#]/)[0]!;
    if (!path.startsWith(FONTS_ROUTE)) return next();
    const file = normalize(join(FONTS_DIR, decodeURIComponent(path.slice(FONTS_ROUTE.length))));
    if (!file.startsWith(FONTS_DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
    const type = file.endsWith('.json') ? 'application/json' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
    res.setHeader('Content-Type', type);
    createReadStream(file).pipe(res);
  };
  let outDir = 'dist';
  return {
    name: 'reports-web-fonts',
    configResolved(c) {
      outDir = c.build.outDir.startsWith('/') ? c.build.outDir : join(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(serve);
    },
    writeBundle() {
      cpSync(FONTS_DIR, join(outDir, 'assets', 'fonts'), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [reportsFonts()],
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
