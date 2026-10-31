import { describe, it, expect } from 'vitest';
import { resolveDir, resolveLocale } from './direction.js';
import { validateReport } from '../schema/report-schema.js';
import './reports-viewer.js';
import './reports-builder.js';
import type { ReportsViewerElement } from './reports-viewer.js';

function schema(meta: Record<string, unknown>) {
  const r = validateReport({
    version: '1',
    id: 'dir',
    meta: { name: 'تقرير', ...meta },
    dataset: { adapter: 'static', source: 't' },
    fields: [{ name: 'x', type: 'number' }],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

async function rendered(v: ReportsViewerElement): Promise<void> {
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), 5000);
    v.addEventListener('report-rendered', () => { clearTimeout(t); res(); }, { once: true });
  });
  await (v as unknown as { updateComplete: Promise<unknown> }).updateComplete;
}

describe('resolveLocale / resolveDir', () => {
  it('host override wins', () => {
    expect(resolveLocale('en', { locale: 'ar' })).toBe('en');
    expect(resolveDir('ltr', { dir: 'rtl' })).toBe('ltr');
  });
  it('falls back to the template', () => {
    expect(resolveLocale(undefined, { locale: 'ar' })).toBe('ar');
    expect(resolveDir('', { dir: 'rtl' })).toBe('rtl');
  });
  it('infers rtl from Arabic when no dir anywhere', () => {
    expect(resolveDir(undefined, { locale: 'ar' })).toBe('rtl');
    expect(resolveDir(undefined, null, 'ar')).toBe('rtl');
    expect(resolveDir(undefined, null)).toBe('ltr');
  });
});

describe('schema meta.dir default', () => {
  it('Arabic template without dir validates as rtl', () => {
    expect(schema({ locale: 'ar' }).meta.dir).toBe('rtl');
  });
  it('English template without dir validates as ltr', () => {
    expect(schema({}).meta.dir).toBe('ltr');
  });
  it('explicit dir is kept', () => {
    expect(schema({ locale: 'ar', dir: 'ltr' }).meta.dir).toBe('ltr');
  });
});

describe('reports-viewer respects the template', () => {
  it('Arabic template renders rtl inside an ltr page with no host props', async () => {
    document.documentElement.dir = 'ltr';
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar', dir: 'rtl' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('rtl');
    v.remove();
  });
  it('host dir still overrides when set explicitly', async () => {
    const v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.dir = 'ltr';
    document.body.appendChild(v);
    v.schema = schema({ locale: 'ar', dir: 'rtl' });
    v.rows = [{ x: 1 }];
    await rendered(v);
    expect(v.shadowRoot!.querySelector('.surface')!.getAttribute('dir')).toBe('ltr');
    v.remove();
  });
});

describe('reports-builder canvas follows the template', () => {
  it('canvas is rtl for an Arabic template even with no host props', async () => {
    const b = document.createElement('reports-builder') as HTMLElement & { schema: unknown; updateComplete: Promise<unknown> };
    document.body.appendChild(b);
    b.schema = schema({ locale: 'ar' });
    await b.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await b.updateComplete;
    expect(b.shadowRoot!.querySelector('.canvas')!.getAttribute('dir')).toBe('rtl');
    b.remove();
  });
});
