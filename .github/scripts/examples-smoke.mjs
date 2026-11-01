/**
 * Smoke test for one example app (examples/<EXAMPLE>): start its production server, open it in
 * Chromium, wait for <reports-viewer> to render, fail on any console error / page error, and save
 * one screenshot to artifacts/examples/<EXAMPLE>.png.
 *
 * Server command, in order of preference (from the example's package.json scripts):
 *   1. "start:ci"            - the example decides (must listen on $PORT)
 *   2. "preview" (vanilla)   - `pnpm run preview --port $PORT --strictPort`
 *   3. "start"   (next/nuxt) - `pnpm run start` with PORT set
 * The page opened is $EXAMPLE_PATH (default "/").
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const example = process.env.EXAMPLE;
if (!example) throw new Error('EXAMPLE is not set');
const root = resolve(import.meta.dirname, '..', '..');
const dir = join(root, 'examples', example);
const outDir = join(root, 'artifacts', 'examples');
mkdirSync(outDir, { recursive: true });

if (!existsSync(join(dir, 'package.json'))) {
  console.log(`examples/${example} is missing, skipped.`);
  process.exit(0);
}

// Playwright is a devDependency of @reports-web/core; resolve it from there.
const require = createRequire(join(root, 'packages', 'core', 'package.json'));
const { chromium } = require('playwright');

const PORT = String(process.env.PORT ?? 4300 + ['vanilla', 'next', 'nuxt'].indexOf(example) + 1);
const pagePath = process.env.EXAMPLE_PATH ?? '/';
const url = `http://127.0.0.1:${PORT}${pagePath}`;
const scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};

let args;
if (scripts['start:ci']) args = ['run', 'start:ci'];
else if (scripts.preview) args = ['run', 'preview', '--port', PORT, '--strictPort', '--host', '127.0.0.1'];
else if (scripts.start) args = ['run', 'start'];
else throw new Error(`examples/${example}/package.json needs a "start:ci", "preview" or "start" script`);

const serverLog = [];
const server = spawn('pnpm', args, {
  cwd: dir,
  env: { ...process.env, PORT, HOST: '127.0.0.1', NITRO_PORT: PORT, NITRO_HOST: '127.0.0.1', HOSTNAME: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
server.stdout.on('data', (d) => serverLog.push(String(d)));
server.stderr.on('data', (d) => serverLog.push(String(d)));

const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};

async function waitForServer(timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`server exited early with code ${server.exitCode}`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not answer on ${url} within ${timeoutMs} ms`);
}

let failed = false;
const errors = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'networkidle' });
  // <reports-viewer> is defined, attached, and has rendered something into its shadow root.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('reports-viewer');
      return !!el && !!customElements.get('reports-viewer') && !!el.shadowRoot && el.shadowRoot.childElementCount > 0;
    },
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(outDir, `${example}.png`), fullPage: true });

  if (errors.length > 0) {
    failed = true;
    console.error(`examples/${example}: ${errors.length} console/page error(s):\n${errors.join('\n')}`);
  } else {
    console.log(`examples/${example}: <reports-viewer> rendered with no console errors (${url}).`);
  }
} catch (err) {
  failed = true;
  console.error(`examples/${example}: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await browser?.close();
  stopServer();
  writeFileSync(join(outDir, `${example}-server.log`), serverLog.join(''));
  writeFileSync(join(outDir, `${example}-errors.log`), errors.join('\n'));
}
process.exit(failed ? 1 : 0);
