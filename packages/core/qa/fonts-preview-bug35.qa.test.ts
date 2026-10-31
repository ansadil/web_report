/**
 * BUG-35: in a production build of the playground (`vite build` + `vite preview`), fonts.json
 * and the Cairo woff2/ttf faces load with 200 from the page's own origin, with every
 * non-localhost request blocked. Before the fix the bundled default resolved to
 * `http://assets/fonts/` and no font loaded. Skipped when no Chromium/Chrome is installed.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';

const playground = fileURLToPath(new URL('../../../apps/playground/', import.meta.url));
const PORT = 5198;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) => existsSync(p));
const hasBrowser = !!executablePath || existsSync(chromium.executablePath());

function isLocal(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* preview still booting */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview did not start at ${url}`);
}

describe.skipIf(!hasBrowser)('BUG-35: production build loads fonts from its own origin', () => {
  let outDir: string;
  let preview: ChildProcess;
  let browser: Browser;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'rw-bug35-'));
    const build = spawnSync('node_modules/.bin/vite', ['build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: playground, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`playground build failed:\n${build.stderr}${build.stdout}`);
    preview = spawn('node_modules/.bin/vite', ['preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: playground, stdio: 'ignore' });
    await waitForServer(ORIGIN);
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    preview?.kill('SIGTERM');
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it('fonts.json and Cairo faces return 200 from the preview origin; nothing off-origin', async () => {
    const page = await browser.newPage();
    const foreign: string[] = [];
    const fonts = new Map<string, number>();
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (isLocal(url)) return route.continue();
      foreign.push(url);
      return route.abort();
    });
    page.on('response', (res) => {
      if (/\/fonts\/|\.woff2$|\.ttf$/.test(res.url())) fonts.set(res.url(), res.status());
    });
    await page.goto(ORIGIN);
    await page.click('#btn-samples');
    await page.waitForSelector('#reports-list .report-card');
    await page.click('#btn-ar');
    // PDF export through the viewer: same fonts folder, TTF faces (sample reports use the
    // default family, so Noto Sans/Noto Sans Arabic TTFs).
    await page.waitForFunction(() => !!document.querySelector('reports-viewer')?.shadowRoot?.querySelector('.rw-report, .rw-visual-pages-root'), undefined, { timeout: 15_000 });
    const exported = await page.evaluate(
      () =>
        new Promise<string>((done) => {
          const v = document.querySelector('reports-viewer') as HTMLElement & { exportTo(k: 'pdf'): Promise<void> };
          v.addEventListener('export', (e) => done((e as CustomEvent<{ kind: string }>).detail.kind), { once: true });
          v.addEventListener('export-error', (e) => done(`error: ${JSON.stringify((e as CustomEvent).detail)}`), { once: true });
          void v.exportTo('pdf');
        }),
    );
    expect(exported).toBe('pdf');
    expect([...fonts.keys()].some((u) => u.startsWith(`${ORIGIN}/assets/fonts/`) && u.endsWith('.ttf'))).toBe(true);
    // Designer canvas: Cairo woff2 via @font-face.
    await page.waitForFunction(() => document.fonts.check('16px Cairo') && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Cairo' && f.status === 'loaded'), undefined, { timeout: 15_000 });

    expect(foreign).toEqual([]);
    expect(fonts.get(`${ORIGIN}/assets/fonts/fonts.json`)).toBe(200);
    expect(fonts.get(`${ORIGIN}/assets/fonts/Cairo-Regular.woff2`)).toBe(200);
    for (const [url, status] of fonts) {
      expect(new URL(url).origin, url).toBe(ORIGIN);
      expect(status, url).toBe(200);
    }
    await page.close();
  });
});
