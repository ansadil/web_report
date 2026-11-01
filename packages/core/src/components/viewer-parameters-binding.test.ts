import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter, DataQuery } from '../adapters/data/types.js';

function schema(locale: 'ar' | 'en') {
  const r = validateReport({
    version: '1',
    id: 'bind',
    meta: { name: 'B', locale, dir: locale === 'ar' ? 'rtl' : 'ltr' },
    dataset: { adapter: 'custom', source: 'sales', params: { tenant: 't1' } },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [
      {
        name: 'branch',
        type: 'select',
        label: { ar: 'الفرع', en: 'Branch' },
        required: true,
        options: [{ value: 'ruh', label: { ar: 'الرياض', en: 'Riyadh' } }],
      },
      { name: 'top', type: 'number', min: 1, max: 50 },
    ],
    bands: {
      reportHeader: { height: 6, elements: [{ id: 'h', kind: 'expr', expression: 'params.branch', pos: { x: 0, y: 0, w: 60, h: 5 } }] },
      detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function nextEvent(el: HTMLElement, name: string): Promise<CustomEvent> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${name} timeout`)), 5000);
    el.addEventListener(name, (e) => { clearTimeout(t); res(e as CustomEvent); }, { once: true });
  });
}

describe('reports-viewer parameters binding', () => {
  let v: ReportsViewerElement;
  let calls: DataQuery[];
  let adapter: DataAdapter;

  beforeEach(() => {
    calls = [];
    adapter = { id: 'spy', fetch: vi.fn(async (q: DataQuery) => { calls.push(q); return [{ x: 1 }]; }) };
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  it('parameters-error carries localized fieldErrors (report locale) next to the legacy issues', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { top: 99 };
    v.schema = schema('ar');
    const e = await err;
    expect(calls.length).toBe(0);
    expect(e.detail.issues.map((i: { name: string }) => i.name)).toEqual(['branch', 'top']);
    expect(e.detail.fieldErrors).toEqual({ branch: 'يجب إدخال الفرع', top: 'يجب ألا تزيد القيمة عن ٥٠' });
  });

  it('English report -> English field errors', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { branch: 'jed' };
    v.schema = schema('en');
    const e = await err;
    expect(e.detail.fieldErrors).toEqual({ branch: 'Choose one of the available options' });
  });

  it('passes validated values to the adapter and exposes them as params.<name> in the template', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { branch: 'ruh', top: '10' };
    v.schema = schema('en');
    await rendered;
    expect(calls.at(-1)).toEqual({ source: 'sales', params: { tenant: 't1', branch: 'ruh', top: 10 } });
    await v.updateComplete;
    expect(v.shadowRoot!.textContent).toContain('ruh');
  });

  it('with host rows, params.<name> still resolves without fetching', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.rows = [{ x: 2 }];
    v.params = { branch: 'ruh' };
    v.schema = schema('en');
    await rendered;
    await v.updateComplete;
    expect(calls.length).toBe(0);
    expect(v.shadowRoot!.textContent).toContain('ruh');
  });
});
