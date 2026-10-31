// @vitest-environment happy-dom
/**
 * QA acceptance — viewer/builder honour schema meta.locale/meta.dir; viewer labels.
 * EXPECTED TO FAIL until BUG-04/05/15 are fixed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../src/components/reports-viewer.js';
import '../src/components/reports-builder.js';
import type { ReportsViewerElement } from '../src/components/reports-viewer.js';
import type { ReportsBuilderElement } from '../src/components/reports-builder.js';
import { validateReport } from '../src/schema/report-schema.js';
import { arabicSchema, ROWS, mustValidate } from './helpers/fixtures.js';

async function flush(el: HTMLElement): Promise<void> {
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  await new Promise((r) => setTimeout(r, 0));
}
function waitRendered(v: HTMLElement): Promise<void> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('report-rendered timeout')), 5000);
    v.addEventListener('report-rendered', () => { clearTimeout(t); res(); }, { once: true });
  });
}
function reportArticle(v: HTMLElement): Element | null {
  return v.shadowRoot?.querySelector('.rw-report') ?? v.querySelector('.rw-report');
}
async function mountViewer(schema = arabicSchema(), rows: unknown[] = ROWS): Promise<ReportsViewerElement> {
  const v = document.createElement('reports-viewer') as ReportsViewerElement;
  document.body.appendChild(v);
  const done = waitRendered(v);
  v.schema = schema;
  (v as unknown as { rows: unknown[] }).rows = rows;
  await done;
  await flush(v);
  return v;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('schema defaults', () => {
  it('BUG-05 validateReport: locale "ar" without dir defaults meta.dir to "rtl"', () => {
    const r = validateReport({
      version: '1', id: 'x', meta: { name: 'x', locale: 'ar' }, dataset: { adapter: 'static', source: 't' },
      fields: [], bands: { detail: { height: 5, elements: [] } },
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.meta.dir).toBe('rtl');
  });
});

describe('reports-viewer', () => {
  it('BUG-04 viewer without attributes keeps schema meta.dir="rtl" on the rendered report', async () => {
    const v = await mountViewer();
    expect(reportArticle(v)?.getAttribute('data-dir')).toBe('rtl');
  });
  it('BUG-04 viewer without attributes keeps schema meta.locale="ar" on the rendered report', async () => {
    const v = await mountViewer();
    expect(reportArticle(v)?.getAttribute('data-locale')).toBe('ar');
  });
  it('BUG-04 viewer host adopts dir="rtl" from the schema when no dir attribute is set', async () => {
    const v = await mountViewer();
    expect(v.getAttribute('dir') ?? (v as unknown as { dir: string }).dir).toBe('rtl');
  });
  it('BUG-04 viewer does not mutate the caller schema meta.locale/meta.dir', async () => {
    const s = arabicSchema();
    await mountViewer(s);
    expect([s.meta.locale, s.meta.dir]).toEqual(['ar', 'rtl']);
  });
  it('BUG-05 viewer renders RTL for locale "ar" with no meta.dir', async () => {
    const v = await mountViewer(arabicSchema({ dir: undefined }));
    expect(reportArticle(v)?.getAttribute('data-dir')).toBe('rtl');
  });
  it('BUG-04 (control) explicit dir="ltr" attribute on the viewer still overrides', async () => {
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.setAttribute('dir', 'ltr');
    document.body.appendChild(v);
    const done = waitRendered(v);
    v.schema = arabicSchema();
    (v as unknown as { rows: unknown[] }).rows = ROWS;
    await done; await flush(v);
    expect(reportArticle(v)?.getAttribute('data-dir')).toBe('ltr');
  });
  it('BUG-15 viewer replaces the "{page}" token in pageFooter (no literal "{page}")', async () => {
    const s = mustValidate({
      ...arabicSchema(),
      bands: {
        ...arabicSchema().bands,
        pageFooter: { height: 8, elements: [{ id: 'pn', kind: 'text', value: '{page}', pos: { x: 0, y: 0, w: 50, h: 6 } }] },
      },
    });
    const v = await mountViewer(s);
    const html = (v.shadowRoot?.innerHTML ?? '') + v.innerHTML;
    expect(html).toContain('rw-report');
    expect(html).not.toContain('{page}');
  });
});

describe('reports-builder', () => {
  it('BUG-04 builder without attributes adopts schema meta.dir="rtl" (host dir)', async () => {
    const b = document.createElement('reports-builder') as ReportsBuilderElement;
    b.schema = arabicSchema();
    document.body.appendChild(b);
    await flush(b);
    expect(b.getAttribute('dir') ?? (b as unknown as { dir: string }).dir).toBe('rtl');
  });
  it('BUG-04 builder keeps schema meta.locale="ar" (does not reset to "en")', async () => {
    const b = document.createElement('reports-builder') as ReportsBuilderElement;
    b.schema = arabicSchema();
    document.body.appendChild(b);
    await flush(b);
    const out = (b as unknown as { schema: { meta: { locale: string; dir: string } } }).schema;
    expect([out.meta.locale, out.meta.dir]).toEqual(['ar', 'rtl']);
  });
});
