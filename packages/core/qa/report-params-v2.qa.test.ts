// @vitest-environment happy-dom
/**
 * QA (v2) — PR feat/report-parameters-fetch-v2, exercised through <reports-viewer>.params (happy-dom)
 * with a spy DataAdapter, plus the REST adapter for GET serialization.
 * Dates are explicit Riyadh instants (+03:00), so results do not depend on the machine TZ (UTC, Riyadh, New York).
 * TZ defaults to Asia/Riyadh if unset, before any Date is built.
 * Expected to FAIL on main 6bc6f5a.
 */
/** True when TZ was unset (or already Asia/Riyadh) before this file ran, i.e. the line below decides the machine zone. */
const SUITE_SET_TZ = !process.env.TZ || process.env.TZ === 'Asia/Riyadh';
process.env.TZ ||= 'Asia/Riyadh';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../src/components/reports-viewer.js';
import type { ReportsViewerElement } from '../src/components/reports-viewer.js';
import { validateReport } from '../src/schema/report-schema.js';
import { createRestAdapter } from '../src/adapters/data/index.js';
import type { DataAdapter, DataQuery } from '../src/adapters/data/types.js';

function schema(parameters: unknown[], datasetParams?: Record<string, unknown>) {
  const r = validateReport({
    version: '1', id: 'qa-params', meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'custom', source: 'sales', ...(datasetParams ? { params: datasetParams } : {}) },
    fields: [{ name: 'x', type: 'string' }],
    parameters,
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const riyadhOffset = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')!.value;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('report parameters via <reports-viewer> (v2, TZ=Asia/Riyadh)', () => {
  let v: ReportsViewerElement;
  let calls: DataQuery[];
  let errors: { error: string; issues: { name: string; code: string }[] }[];
  const adapter: DataAdapter = { id: 'spy', fetch: async (q) => { calls.push(q); return [{ x: 'ok' }]; } };

  /** Set params + schema, wait for render or parameters-error. */
  async function run(parameters: unknown[], params: Record<string, unknown> | null, datasetParams?: Record<string, unknown>) {
    v.dataAdapter = adapter;
    v.params = params;
    v.schema = schema(parameters, datasetParams);
    await settle();
  }

  beforeEach(() => {
    calls = [];
    errors = [];
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.addEventListener('parameters-error', (e) => errors.push((e as CustomEvent).detail));
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  // Precondition for the Riyadh expectations below. The product reads Dates in its own `timeZone` (default
  // Asia/Riyadh, BUG-52), not the machine zone, so: Asia/Riyadh must be UTC+3 for these instants, always; the machine
  // offset is checked only when this file's own TZ default is in effect (the runner does not set TZ).
  it('runtime is really UTC+3', () => {
    expect(riyadhOffset(new Date('2026-09-30T21:00:00Z'))).toBe('GMT+03:00');
    if (SUITE_SET_TZ) expect(new Date('2026-09-30T21:00:00Z').getTimezoneOffset()).toBe(-180);
  });

  it('date param from Date 2026-10-01 00:00 Riyadh is sent as "2026-10-01"', async () => {
    await run([{ name: 'day', type: 'date', required: true }], { day: new Date('2026-10-01T00:00:00+03:00') });
    expect(errors).toEqual([]);
    expect(calls.at(-1)!.params!.day).toBe('2026-10-01');
  });

  it('required dateRange with a missing side is rejected; no fetch', async () => {
    await run([{ name: 'period', type: 'dateRange', required: true }], { period: { from: new Date('2026-10-01T00:00:00+03:00') } });
    expect(calls).toHaveLength(0);
    expect(errors[0]?.issues[0]).toMatchObject({ name: 'period', code: 'invalid' });
  });

  it('optional dateRange sends only {from}', async () => {
    await run([{ name: 'period', type: 'dateRange' }], { period: { from: new Date('2026-10-01T00:00:00+03:00') } });
    expect(calls.at(-1)!.params!.period).toStrictEqual({ from: '2026-10-01' });
  });

  it('optional dateRange sends only {to}', async () => {
    await run([{ name: 'period', type: 'dateRange' }], { period: { to: new Date('2026-10-31T00:00:00+03:00') } });
    expect(calls.at(-1)!.params!.period).toStrictEqual({ to: '2026-10-31' });
  });

  it('datetime param is sent as a full ISO instant', async () => {
    await run([{ name: 'at', type: 'datetime' }], { at: new Date('2026-10-01T00:00:00+03:00') });
    expect(calls.at(-1)!.params!.at).toBe('2026-09-30T21:00:00.000Z');
  });

  it('precedence: explicit > default > dataset.params', async () => {
    await run(
      [
        { name: 'region', type: 'string', default: 'def' },
        { name: 'limit', type: 'number', default: 10 },
      ],
      { region: 'exp' },
      { region: 'static', limit: 1, tenant: 't1' },
    );
    expect(calls.at(-1)!.params).toStrictEqual({ region: 'exp', limit: 10, tenant: 't1' });
  });

  for (const bad of ['2026-13-01', '2026-02-30', '2026-04-31']) {
    it(`impossible date "${bad}" is rejected; no fetch`, async () => {
      await run([{ name: 'day', type: 'date', required: true }], { day: bad });
      expect(calls).toHaveLength(0);
      expect(errors[0]?.issues[0]).toMatchObject({ name: 'day', code: 'invalid' });
    });
  }

  it('stale response is ignored after params change (older response resolves last)', async () => {
    const pending: { q: DataQuery; resolve: (rows: { x: string }[]) => void }[] = [];
    const slow: DataAdapter = { id: 'slow', fetch: (q) => new Promise((resolve) => pending.push({ q, resolve })) };
    const rendered: number[] = [];
    v.addEventListener('report-rendered', (e) => rendered.push((e as CustomEvent).detail.rows));
    v.dataAdapter = slow;
    v.schema = schema([{ name: 'year', type: 'number', required: true }]);
    v.params = { year: 2025 };
    await settle();
    v.params = { year: 2026 };
    await settle();
    const a = pending.find((p) => p.q.params!.year === 2025)!;
    const b = pending.find((p) => p.q.params!.year === 2026)!;
    b.resolve([{ x: 'NEW-2026' }, { x: 'NEW-2026b' }]);
    await settle();
    a.resolve([{ x: 'OLD-2025' }]);
    await settle(60);
    await v.updateComplete;
    expect(rendered).toEqual([2]);
    const text = v.shadowRoot!.textContent ?? '';
    expect(text).toContain('NEW-2026');
    expect(text).not.toContain('OLD-2025');
  });
});

describe('REST GET serialization (v2)', () => {
  it('dateRange object is encoded as period[from]= / period[to]=', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await createRestAdapter({ baseUrl: 'http://api.test/reports', method: 'GET' }).fetch({
        source: 'sales',
        params: { period: { from: '2026-10-01', to: '2026-10-31' }, year: 2026 },
      });
      const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
      expect(url.search).toContain('period%5Bfrom%5D=2026-10-01');
      expect(url.searchParams.get('period[from]')).toBe('2026-10-01');
      expect(url.searchParams.get('period[to]')).toBe('2026-10-31');
      expect(url.search).not.toContain('object');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
