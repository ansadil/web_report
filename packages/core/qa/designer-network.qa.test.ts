/**
 * The playground designer loads icons and woff2 faces from the local dev server only.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';

const playground = fileURLToPath(new URL('../../../apps/playground/', import.meta.url));
const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** True once Cairo 400 and 700 are both in document.fonts with status loaded. */
function cairoFacesLoaded(): boolean {
  const loaded = [...document.fonts].filter((face) => {
    const family = face.family.replace(/["']/g, '');
    return face.status === 'loaded' && family === 'Cairo';
  });
  const weights = new Set(loaded.map((face) => String(face.weight)));
  return weights.has('400') && weights.has('700');
}

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
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* vite still booting */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`playground did not start at ${url}`);
}

describe('playground designer stays on the local origin', () => {
  let vite: ChildProcess;
  let browser: Browser;

  beforeAll(async () => {
    vite = spawn('node_modules/.bin/vite', ['--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
      cwd: playground,
      stdio: 'ignore',
      env: { ...process.env, BROWSER: 'none' },
    });
    await waitForServer(ORIGIN);
    const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) => existsSync(p));
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-gpu'],
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    vite?.kill('SIGTERM');
  });

  it('requests nothing off-origin, renders icons, and loads Cairo', async () => {
    const page = await browser.newPage();
    const foreign: string[] = [];
    page.on('request', (req) => {
      if (!isLocal(req.url())) foreign.push(req.url());
    });
    await page.goto(ORIGIN);
    await page.click('#btn-samples');
    await page.waitForSelector('#reports-list .report-card');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => {
      const view = document.querySelector('#view-builder');
      const ribbon = document.querySelector('reports-builder')?.shadowRoot?.querySelector('[data-testid="ribbon"]');
      return view instanceof HTMLElement && view.hidden === false && !!ribbon && ribbon.getBoundingClientRect().width > 200;
    });
    await page.waitForFunction(cairoFacesLoaded, undefined, { timeout: 15_000 });
    const info = await page.evaluate(() => {
      const root = document.querySelector('reports-builder')?.shadowRoot;
      return {
        icons: root?.querySelectorAll('svg').length ?? 0,
        tool: !!root?.querySelector('[data-testid="tool-text"] svg'),
      };
    });
    expect(foreign).toEqual([]);
    expect(info.icons).toBeGreaterThan(0);
    expect(info.tool).toBe(true);
    await page.close();
  });

  it('BUG-27: Cairo text stays visible inside each text and field element', async () => {
    const page = await browser.newPage();
    await page.goto(ORIGIN);
    await page.click('#btn-ar');
    await page.click('#btn-samples');
    await page.waitForSelector('#reports-list .report-card');
    await page.locator('#reports-list .report-card').filter({ hasText: 'تقرير المبيعات الشهري' }).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(cairoFacesLoaded, undefined, { timeout: 15_000 });
    for (const file of ['Cairo-Regular.woff2', 'Cairo-Bold.woff2']) {
      const res = await page.request.get(`${ORIGIN}/assets/fonts/${file}`);
      expect(res.status(), file).toBe(200);
      expect(new URL(res.url()).origin).toBe(new URL(ORIGIN).origin);
    }
    const open = await page.evaluate(() => {
      const root = document.querySelector('reports-builder')?.shadowRoot;
      const cards = [...document.querySelectorAll('#reports-list .report-card .name')].map((n) => n.textContent ?? '');
      const kinds = [...(root?.querySelectorAll('.element .kind') ?? [])].map((n) => n.textContent);
      return { cards, kinds, dir: document.querySelector('reports-builder')?.getAttribute('dir') };
    });
    expect(open.dir).toBe('rtl');
    const measure = () => page.evaluate(() => {
      const root = document.querySelector('reports-builder')!.shadowRoot!;
      const rows: { kind: string; text: string; w: number; h: number; overflow: number; fontFamily: string }[] = [];
      for (const el of root.querySelectorAll<HTMLElement>('.element')) {
        const kind = el.getAttribute('data-kind') ?? '';
        if (kind !== 'text' && kind !== 'field') continue;
        const body = el.querySelector('.el-body');
        if (!body?.firstChild) {
          rows.push({ kind, text: '', w: 0, h: 0, overflow: 1, fontFamily: '' });
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(body);
        const host = el.getBoundingClientRect();
        let w = 0;
        let h = 0;
        for (const r of range.getClientRects()) {
          const iw = Math.min(r.right, host.right) - Math.max(r.left, host.left);
          const ih = Math.min(r.bottom, host.bottom) - Math.max(r.top, host.top);
          w = Math.max(w, iw);
          h = Math.max(h, ih);
        }
        const clip = getComputedStyle(body).overflowY;
        const fontFamily = getComputedStyle(body).fontFamily;
        rows.push({ kind, text: body.textContent ?? '', w, h, overflow: clip === 'hidden' ? 0 : 1, fontFamily });
      }
      return rows;
    });
    const resting = await measure();
    expect(resting.length).toBeGreaterThan(0);
    for (const row of resting) {
      expect(row.w, row.text).toBeGreaterThan(2);
      expect(row.h, row.text).toBeGreaterThan(2);
      expect(row.overflow, row.text).toBe(0);
      expect(row.fontFamily.replace(/["']/g, ''), row.text).toMatch(/^Cairo\b/);
    }
    await page.evaluate(() => {
      const el = document.querySelector('reports-builder')!.shadowRoot!.querySelector<HTMLElement>('.element');
      el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    const selected = await measure();
    for (const row of selected) expect(row.overflow, row.text).toBe(0);
    await page.close();
  });

  it('renders the File and Layout tabs and the Font and Alignment groups', async () => {
    const page = await browser.newPage();
    await page.goto(ORIGIN);
    await page.click('#btn-samples');
    await page.waitForSelector('#reports-list .report-card');
    await page.keyboard.press('Escape');
    const root = page.locator('reports-builder');
    await root.locator('[data-testid="ribbon"]').waitFor();
    const shown = (id: string) =>
      page.evaluate((testId) => {
        const el = document.querySelector('reports-builder')?.shadowRoot?.querySelector(`[data-testid="${testId}"]`);
        if (!(el instanceof HTMLElement)) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }, id);
    await root.locator('[data-testid="ribbon-tab-file"]').click();
    expect(await shown('ribbon-btn-new')).toBe(true);
    expect(await page.evaluate(() => !!document.querySelector('reports-builder')?.shadowRoot?.querySelector('[data-testid="ribbon-open-file"]'))).toBe(true);
    await root.locator('[data-testid="ribbon-tab-layout"]').click();
    expect(await shown('ribbon-btn-align-start')).toBe(true);
    await root.locator('[data-testid="ribbon-tab-home"]').click();
    for (const id of [
      'ribbon-font-family',
      'ribbon-font-size',
      'ribbon-font-bold',
      'ribbon-font-italic',
      'ribbon-font-underline',
      'ribbon-align-start',
      'ribbon-align-center',
      'ribbon-align-end',
      'ribbon-align-justify',
    ]) {
      expect(await shown(id), id).toBe(true);
    }
    expect(await shown('ribbon-font-bold')).toBe(true);
    const icons = await page.evaluate(() => {
      const q = (id: string) => document.querySelector('reports-builder')?.shadowRoot?.querySelector(`[data-testid="${id}"] svg`);
      return { bold: !!q('ribbon-font-bold'), align: !!q('ribbon-align-start') };
    });
    expect(icons).toEqual({ bold: true, align: true });
    await page.close();
  });
});
