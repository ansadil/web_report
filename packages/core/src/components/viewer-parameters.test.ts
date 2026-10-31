import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './reports-viewer.js';
import type { ReportsViewerElement } from './reports-viewer.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter, DataQuery } from '../adapters/data/types.js';

function schemaWithParams() {
  const r = validateReport({
    version: '1',
    id: 'params',
    meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'custom', source: 'sales', params: { region: 'west', tenant: 't1' } },
    fields: [{ name: 'x', type: 'number' }],
    parameters: [
      { name: 'year', type: 'number', required: true },
      { name: 'region', type: 'string' },
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

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('reports-viewer parameters', () => {
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

  it('merges parameter values into DataQuery.params (explicit > default > static)', async () => {
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { year: '2026', region: 'east' };
    v.schema = schemaWithParams();
    await rendered;
    expect(calls.at(-1)).toEqual({ source: 'sales', params: { region: 'east', tenant: 't1', year: 2026, limit: 10 } });
  });

  it('refetches when parameter values change, but not for a structurally equal object', async () => {
    let rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.schema = schemaWithParams();
    v.params = { year: 2025 };
    await rendered;
    const before = calls.length;

    v.params = { year: 2025 }; // new object, same values
    await settle();
    expect(calls.length).toBe(before);

    rendered = nextEvent(v, 'report-rendered');
    v.params = { year: 2026 };
    await rendered;
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)!.params).toMatchObject({ year: 2026 });
  });

  it('does not fetch and reports a clear error when a required parameter is missing', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.schema = schemaWithParams();
    const e = await err;
    expect(calls.length).toBe(0);
    expect(e.detail.issues).toEqual([{ name: 'year', code: 'required', message: 'value is required' }]);
    expect(e.detail.error).toMatch(/year: value is required/);
    await v.updateComplete;
    expect(v.shadowRoot!.textContent).toMatch(/year: value is required/);

    const rendered = nextEvent(v, 'report-rendered');
    v.params = { year: 2026 };
    await rendered;
    expect(calls.length).toBe(1);
  });

  it('reports invalid values (type coercion failure) without fetching', async () => {
    const err = nextEvent(v, 'parameters-error');
    v.dataAdapter = adapter;
    v.params = { year: 'abc' };
    v.schema = schemaWithParams();
    const e = await err;
    expect(e.detail.issues[0]).toMatchObject({ name: 'year', code: 'invalid' });
    expect(calls.length).toBe(0);
  });

  it('BUG-20: impossible or non-ISO date strings are rejected without fetching', async () => {
    const base = schemaWithParams();
    const s = { ...base, parameters: [{ name: 'day', type: 'date' as const, required: true }] };
    for (const bad of ['2026-02-30', '2026-04-31', '2026-13-01', '1', 'hello 5', '10/01/2026']) {
      const err = nextEvent(v, 'parameters-error');
      v.dataAdapter = adapter;
      v.params = { day: bad };
      v.schema = { ...s };
      const e = await err;
      expect(e.detail.issues[0]).toMatchObject({ name: 'day', code: 'invalid' });
    }
    expect(calls.length).toBe(0);
    const rendered = nextEvent(v, 'report-rendered');
    v.params = { day: '2026-10-01' };
    await rendered;
    expect(calls.at(-1)!.params).toMatchObject({ day: '2026-10-01' });
  });

  it('ignores a stale response superseded by a newer parameter change', async () => {
    const resolvers: Array<(rows: { x: number }[]) => void> = [];
    const slow: DataAdapter = { id: 'slow', fetch: (q) => { calls.push(q); return new Promise((r) => resolvers.push(r)); } };
    const counts: number[] = [];
    v.addEventListener('report-rendered', (e) => counts.push((e as CustomEvent).detail.rows));
    v.dataAdapter = slow;
    v.schema = schemaWithParams();
    v.params = { year: 2025 };
    await settle();
    v.params = { year: 2026 };
    await settle();
    const first = resolvers[0]!;
    const last = resolvers.at(-1)!;
    last([{ x: 1 }, { x: 2 }]);
    await settle();
    first([{ x: 1 }]);
    await settle();
    expect(calls.at(-1)!.params).toMatchObject({ year: 2026 });
    expect(counts).toEqual([2]);
  });

  it('accepts datetime parameters in the schema and sends date/dateRange Dates as local calendar dates', async () => {
    const r = validateReport({
      version: '1', id: 'dates', meta: { name: 'D' },
      dataset: { adapter: 'custom', source: 't' },
      fields: [],
      parameters: [
        { name: 'day', type: 'date', required: true },
        { name: 'period', type: 'dateRange' },
        { name: 'at', type: 'datetime' },
      ],
      bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    const at = new Date(2026, 9, 1, 8, 15);
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.params = { day: new Date(2026, 9, 1), period: { from: new Date(2026, 9, 1) }, at };
    v.schema = r.value;
    await rendered;
    expect(calls.at(-1)!.params).toEqual({ day: '2026-10-01', period: { from: '2026-10-01' }, at: at.toISOString() });
  });

  it('old templates without parameters still fetch with static params', async () => {
    const r = validateReport({
      version: '1', id: 'old', meta: { name: 'O' },
      dataset: { adapter: 'custom', source: 't', params: { a: 1 } },
      fields: [], bands: { detail: { height: 5 } },
    });
    if (!r.ok) throw new Error(r.error);
    const rendered = nextEvent(v, 'report-rendered');
    v.dataAdapter = adapter;
    v.schema = r.value;
    await rendered;
    expect(calls.at(-1)).toEqual({ source: 't', params: { a: 1 } });
  });
});
