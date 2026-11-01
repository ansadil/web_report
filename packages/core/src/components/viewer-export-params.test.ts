/**
 * The viewer's PDF export gets the same resolved parameter values and time zone as the on-screen render, so
 * `{المعاملات.الفترة}`, `{المعاملات.الفرع}` and `params.<name>` print real values instead of the placeholder.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const exportPdf = vi.fn(async (_input: unknown) => new Blob(['%PDF']));
vi.mock('../exporters/pdf.js', () => ({ exportPdf }));

import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter } from '../adapters/data/types.js';

function schema() {
  const r = validateReport({
    version: '1',
    id: 'exp',
    meta: { name: 'E', locale: 'ar', dir: 'rtl' },
    dataset: { adapter: 'custom', source: 'sales', params: { tenant: 't1' } },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [
      { name: 'year', type: 'number', required: true },
      { name: 'limit', type: 'number', default: 10 },
    ],
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
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

describe('reports-viewer PDF export parameters', () => {
  let v: ReportsViewerElement;
  let adapter: DataAdapter;

  beforeEach(() => {
    exportPdf.mockClear();
    adapter = { id: 'spy', fetch: vi.fn(async () => [{ x: 1 }]) };
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  it('passes resolved params (static + defaults + coerced) and the time zone to exportPdf', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.timeZone = 'UTC';
    v.params = { year: '2026' };
    v.schema = schema();
    await rendered;
    const exported = nextEvent(v, 'export');
    await v.exportTo('pdf');
    await exported;
    expect(exportPdf).toHaveBeenCalledTimes(1);
    const input = exportPdf.mock.calls[0]![0] as { params?: Record<string, unknown>; timeZone?: string };
    expect(input.params).toEqual({ tenant: 't1', year: 2026, limit: 10 });
    expect(input.timeZone).toBe('UTC');
  });

  it('host rows: params are resolved the same way without fetching', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.rows = [{ x: 2 }];
    v.params = { year: 2025, limit: 3 };
    v.schema = schema();
    await rendered;
    await v.exportTo('pdf');
    const input = exportPdf.mock.calls[0]![0] as { params?: Record<string, unknown>; timeZone?: string };
    expect(input.params).toEqual({ tenant: 't1', year: 2025, limit: 3 });
    expect(input.timeZone).toBe('Asia/Riyadh');
    expect(adapter.fetch).not.toHaveBeenCalled();
  });
});
