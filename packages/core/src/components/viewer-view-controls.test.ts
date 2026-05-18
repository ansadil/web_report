import { describe, it, expect, beforeEach } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
}

function minimalSchema() {
  const r = validateReport({
    version: '1',
    id: 'vzc',
    meta: { name: 'V', locale: 'en', dir: 'ltr' },
    page: { size: 'A4', orientation: 'portrait', margins: { top: 15, right: 15, bottom: 15, left: 15 } },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: {
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

async function waitRendered(v: ReportsViewerElement): Promise<void> {
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('report-rendered timeout')), 5000);
    v.addEventListener(
      'report-rendered',
      () => {
        clearTimeout(t);
        res();
      },
      { once: true },
    );
  });
}

describe('reports-viewer zoom + page navigation', () => {
  let v: ReportsViewerElement;

  beforeEach(() => {
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });

  it('renders zoom and page navigation controls', async () => {
    v.schema = minimalSchema();
    v.rows = [{ x: 1 }, { x: 2 }];
    await waitRendered(v);
    await flush(v);
    expect(v.shadowRoot!.querySelector('button[data-control="zoom-in"]')).toBeTruthy();
    expect(v.shadowRoot!.querySelector('button[data-control="zoom-out"]')).toBeTruthy();
    expect(v.shadowRoot!.querySelector('button[data-control="page-next"]')).toBeTruthy();
    expect(v.shadowRoot!.querySelector('.zoom-host')).toBeTruthy();
  });

  it('shows page count not band section count for single-page reports', async () => {
    v.schema = minimalSchema();
    v.rows = [{ x: 1 }];
    await waitRendered(v);
    await flush(v);
    const sections = v.shadowRoot!.querySelectorAll('.rw-report section.rw-section');
    const sheets = v.shadowRoot!.querySelectorAll('.rw-page-visual-sheet');
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sheets.length).toBe(1);
    const label = v.shadowRoot!.querySelector('.zoom-label')!.textContent!.trim();
    expect(label).toBe('1 / 1');
    expect(v.shadowRoot!.querySelector('button[data-control="page-prev"]')!.hasAttribute('disabled')).toBe(true);
    expect(v.shadowRoot!.querySelector('button[data-control="page-next"]')!.hasAttribute('disabled')).toBe(true);
  });

  it('changes zoom level when zoom-in is clicked', async () => {
    v.schema = minimalSchema();
    v.rows = [{ x: 1 }];
    await waitRendered(v);
    await flush(v);
    const host = v.shadowRoot!.querySelector('.zoom-host') as HTMLElement;
    const before = host.style.zoom || host.style.transform || '';
    v.shadowRoot!.querySelector<HTMLButtonElement>('button[data-control="zoom-in"]')!.click();
    await flush(v);
    const after = host.style.zoom || host.style.transform || '';
    expect(after).not.toEqual(before);
    if (host.style.zoom) expect(Number(host.style.zoom)).toBeGreaterThan(1);
    else expect(host.style.transform).toContain('scale');
  });

  it('hides view controls when hide-view-controls is set', async () => {
    v.hideViewControls = true;
    v.schema = minimalSchema();
    v.rows = [{ x: 1 }];
    await waitRendered(v);
    await flush(v);
    expect(v.shadowRoot!.querySelector('button[data-control="zoom-in"]')).toBeNull();
    expect(v.shadowRoot!.querySelectorAll('.toolbar button[data-action]').length).toBeGreaterThan(0);
  });

  it('shows stacked visual pages by default for long reports', async () => {
    v.schema = minimalSchema();
    v.rows = Array.from({ length: 100 }, (_, i) => ({ x: i }));
    await waitRendered(v);
    await flush(v);
    const sheets = v.shadowRoot!.querySelectorAll('.rw-page-visual-sheet');
    expect(sheets.length).toBeGreaterThanOrEqual(2);
  });

  it('uses continuous scroll when hide-page-boundaries is set', async () => {
    v.hidePageBoundaries = true;
    v.schema = minimalSchema();
    v.rows = Array.from({ length: 100 }, (_, i) => ({ x: i }));
    await waitRendered(v);
    await flush(v);
    expect(v.shadowRoot!.querySelector('.rw-visual-pages-root')).toBeNull();
    expect(v.shadowRoot!.querySelectorAll('.rw-report').length).toBe(1);
  });
});
