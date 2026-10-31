import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const fontsDir = fileURLToPath(new URL('../../packages/core/assets/fonts/', import.meta.url));

/** Serve the shared woff2/ttf folder at /assets/fonts without changing the font resolver. */
function serveReportFonts(): Plugin {
  return {
    name: 'serve-report-fonts',
    configureServer(server) {
      server.middlewares.use('/assets/fonts', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '').replace(/^\//, '');
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(woff2|ttf|json|txt)$/.test(name)) {
          next();
          return;
        }
        const file = join(fontsDir, name);
        if (!existsSync(file)) {
          next();
          return;
        }
        res.setHeader('Content-Type', name.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [serveReportFonts()],
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
