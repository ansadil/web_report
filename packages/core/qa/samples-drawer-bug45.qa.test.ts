/**
 * BUG-45: in the playground, the «عينات» / "Samples" button in the designer title bar opens
 * the sample drawer. On 7f14c5e `aside.sidebar` uses `grid-area: drawer`, which `#app` never
 * defines, so the drawer lands in an implicit row (~491px wide on the left) and squeezes
 * <reports-builder> into a 280px column at the top; the canvas is clipped out of view.
 *
 * Expected: a ~280px drawer, either as an overlay or as a side column, with the designer kept
 * at full size (overlay) or shrunk by no more than the drawer's own width (side column), and
 * the canvas still visible. Escape closes the drawer and restores the original layout.
 * Runs against a production build (`vite build` + `vite preview`) in Arabic (default) and
 * English. Skipped when no Chromium/Chrome is installed. EXPECTED TO FAIL until BUG-45 is fixed.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const playground = fileURLToPath(new URL('../../../apps/playground/', import.meta.url));
const PORT = 5197; // 5198 = BUG-35 preview, 5199 = designer-network dev server
const ORIGIN = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };
const executablePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome'].find((p) => existsSync(p));
const hasBrowser = !!executablePath || existsSync(chromium.executablePath());

/** Layout thresholds (CSS px at a 1440x900 viewport). */
const DRAWER_WIDTH = 280; // nominal drawer width from the spec
const DRAWER_WIDTH_TOLERANCE = 40; // accept 240..320px
const TOLERANCE = 2; // sub-pixel rounding / borders
const MIN_CANVAS_VISIBLE_RATIO = 0.5; // canvas keeps >= 50% of its closed-state visible area

type Box = { x: number; y: number; width: number; height: number };

type Layout = {
  lang: string;
  samplesLabel: string;
  drawerOpen: boolean;
  drawer: Box;
  builder: Box;
  canvas: Box;
  /** Canvas rect clipped by the viewport and every overflow-clipping ancestor (across shadow roots), minus the drawer. */
  canvasVisible: Box;
  /** Canvas element hit by elementFromPoint at the centre of `canvasVisible` (null if none). */
  canvasHit: boolean;
};

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

/** Runs in the page. Kept self-contained (no closures) so Playwright can serialise it. */
function measure(): Layout {
  const box = (r: DOMRect | { x: number; y: number; width: number; height: number }) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  });
  const intersect = (a: Box, b: Box): Box => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const r = Math.min(a.x + a.width, b.x + b.width);
    const btm = Math.min(a.y + a.height, b.y + b.height);
    return { x, y, width: Math.max(0, r - x), height: Math.max(0, btm - y) };
  };
  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };

  const host = document.querySelector('reports-builder') as HTMLElement;
  const root = host.shadowRoot!;
  const drawerEl = document.getElementById('sample-drawer')!;
  const canvasEl = root.querySelector('[data-testid="canvas"]') as HTMLElement;
  const drawerCs = getComputedStyle(drawerEl);
  const drawer = box(drawerEl.getBoundingClientRect());
  const drawerOpen = drawerCs.display !== 'none' && drawerCs.visibility !== 'hidden' && drawer.width > 0 && drawer.height > 0;

  const canvas = box(canvasEl.getBoundingClientRect());
  let visible = intersect(canvas, { x: 0, y: 0, width: innerWidth, height: innerHeight });
  for (let a = parentOf(canvasEl); a; a = parentOf(a)) {
    const cs = getComputedStyle(a);
    if (cs.display === 'none' || cs.visibility === 'hidden') visible = { ...visible, width: 0, height: 0 };
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') visible = intersect(visible, box(a.getBoundingClientRect()));
  }
  // An overlay drawer may cover part of the canvas: drop the covered strip (drawer spans full height in a sane layout).
  if (drawerOpen && visible.width > 0) {
    const overlap = intersect(visible, drawer);
    if (overlap.width > 0 && overlap.height > 0) {
      const leftFree = Math.max(0, overlap.x - visible.x);
      const rightFree = Math.max(0, visible.x + visible.width - (overlap.x + overlap.width));
      visible = leftFree >= rightFree
        ? { ...visible, width: leftFree }
        : { ...visible, x: overlap.x + overlap.width, width: rightFree };
    }
  }
  let canvasHit = false;
  if (visible.width > 0 && visible.height > 0) {
    const cx = visible.x + visible.width / 2;
    const cy = visible.y + visible.height / 2;
    const hit = root.elementFromPoint(cx, cy);
    canvasHit = !!hit && (hit === canvasEl || canvasEl.contains(hit));
  }

  return {
    lang: document.documentElement.lang,
    samplesLabel: (root.querySelector('[data-testid="btn-samples"]')?.textContent ?? '').trim(),
    drawerOpen,
    drawer,
    builder: box(host.getBoundingClientRect()),
    canvas,
    canvasVisible: visible,
    canvasHit,
  };
}

const area = (b: Box) => b.width * b.height;

async function openPlayground(browser: Browser, locale: 'ar' | 'en'): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(ORIGIN);
  await page.waitForFunction(() => !!document.querySelector('reports-builder')?.shadowRoot?.querySelector('[data-testid="canvas"]'), undefined, { timeout: 15_000 });
  if (locale === 'en') {
    await page.locator('reports-builder [data-testid="btn-en"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'en', undefined, { timeout: 5_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return page;
}

describe.skipIf(!hasBrowser)('BUG-45: the samples drawer does not squeeze the designer', () => {
  let outDir: string;
  let preview: ChildProcess;
  let browser: Browser;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), 'rw-bug45-'));
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

  for (const [locale, label] of [['ar', 'عينات'], ['en', 'Samples']] as const) {
    it(`${locale}: opening «${label}» keeps the designer size and the canvas visible; Escape restores the layout`, async () => {
      const page = await openPlayground(browser, locale);
      try {
        const before = await page.evaluate(measure);
        expect(before.lang).toBe(locale);
        expect(before.samplesLabel).toBe(label);
        expect(before.drawerOpen, 'drawer starts closed').toBe(false);
        expect(area(before.canvasVisible), 'canvas visible before opening the drawer').toBeGreaterThan(0);

        await page.locator('reports-builder [data-testid="btn-samples"]').click();
        await page.waitForFunction(() => document.getElementById('sample-drawer')?.classList.contains('open'), undefined, { timeout: 5_000 });
        await page.waitForTimeout(300); // let any slide-in transition settle
        const open = await page.evaluate(measure);
        const detail = JSON.stringify({ before, open });

        // Soft assertions: report every broken aspect of the open layout in one run.
        // (1) Designer not squeezed: same height; width either unchanged (overlay) or reduced by
        // at most the drawer's own width (side column).
        expect.soft(Math.abs(open.builder.height - before.builder.height), `designer height unchanged\n${detail}`).toBeLessThanOrEqual(TOLERANCE);
        expect.soft(open.builder.width, `designer width >= ${before.builder.width} - drawer ${open.drawer.width} - ${TOLERANCE}\n${detail}`).toBeGreaterThanOrEqual(before.builder.width - open.drawer.width - TOLERANCE);

        // (2) Canvas still on screen: non-zero, inside the viewport, not clipped away, and actually hit-testable.
        expect.soft(open.canvas.width, `canvas width > 0\n${detail}`).toBeGreaterThan(0);
        expect.soft(open.canvas.height, `canvas height > 0\n${detail}`).toBeGreaterThan(0);
        expect.soft(area(open.canvasVisible), `canvas keeps >= ${MIN_CANVAS_VISIBLE_RATIO * 100}% of its visible area\n${detail}`).toBeGreaterThanOrEqual(area(before.canvasVisible) * MIN_CANVAS_VISIBLE_RATIO);
        expect.soft(open.canvasHit, `canvas is the topmost element at the centre of its visible area\n${detail}`).toBe(true);

        // Drawer: visible, about 280px wide, full height.
        expect.soft(open.drawerOpen, `drawer visible\n${detail}`).toBe(true);
        expect.soft(Math.abs(open.drawer.width - DRAWER_WIDTH), `drawer width ≈ ${DRAWER_WIDTH}±${DRAWER_WIDTH_TOLERANCE}px\n${detail}`).toBeLessThanOrEqual(DRAWER_WIDTH_TOLERANCE);

        // Escape closes the drawer and the layout returns to the original one.
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('sample-drawer')?.classList.contains('open'), undefined, { timeout: 5_000 });
        await page.waitForTimeout(300);
        const closed = await page.evaluate(measure);
        const detail2 = JSON.stringify({ before, closed });
        expect(closed.drawerOpen, `drawer hidden after Escape\n${detail2}`).toBe(false);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(closed.builder[key] - before.builder[key]), `designer ${key} restored\n${detail2}`).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(closed.canvasVisible[key] - before.canvasVisible[key]), `canvas ${key} restored\n${detail2}`).toBeLessThanOrEqual(TOLERANCE);
        }
      } finally {
        await page.close();
      }
    });
  }
});
