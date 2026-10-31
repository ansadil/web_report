// @vitest-environment happy-dom
/**
 * QA — BUG-20 (feat/report-parameters-fetch-v2 @ 998b0db): strict date / datetime parameter strings,
 * exercised through <reports-viewer>.params with a spy DataAdapter. Every rejection must fire
 * `parameters-error` with code 'invalid' and must NOT call the adapter.
 * Run with TZ=Asia/Riyadh (set here if unset, before any Date is built). Expected to FAIL on main.
 */
process.env.TZ ||= 'Asia/Riyadh';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/components/reports-viewer.js';
import type { ReportsViewerElement } from '../src/components/reports-viewer.js';
import { validateReport } from '../src/schema/report-schema.js';
import type { DataAdapter, DataQuery } from '../src/adapters/data/types.js';

function schema(parameters: unknown[]) {
  const r = validateReport({
    version: '1', id: 'qa-bug20', meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'custom', source: 'sales' },
    fields: [{ name: 'x', type: 'string' }],
    parameters,
    bands: { detail: { height: 6, elements: [{ id: 'd', kind: 'field', field: 'x', pos: { x: 0, y: 0, w: 90, h: 5 } }] } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const DATE = [{ name: 'day', type: 'date', required: true }];
const RANGE = [{ name: 'period', type: 'dateRange', required: true }];
const RANGE_OPT = [{ name: 'period', type: 'dateRange' }];
const DT = [{ name: 'at', type: 'datetime', required: true }];

describe('BUG-20: strict date / datetime strings via <reports-viewer> (TZ=Asia/Riyadh)', () => {
  let v: ReportsViewerElement;
  let calls: DataQuery[];
  let errors: { error: string; issues: { name: string; code: string }[] }[];
  const adapter: DataAdapter = { id: 'spy', fetch: async (q) => { calls.push(q); return [{ x: 'ok' }]; } };

  async function run(parameters: unknown[], params: Record<string, unknown>) {
    v.dataAdapter = adapter;
    v.params = params;
    v.schema = schema(parameters);
    await settle();
  }
  const rejected = (name: string) => {
    expect(calls, 'adapter must not be called').toHaveLength(0);
    expect(errors[0]?.issues[0]).toMatchObject({ name, code: 'invalid' });
  };
  const sent = (name: string, value: unknown) => {
    expect(errors).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params![name]).toStrictEqual(value);
  };

  beforeEach(() => {
    calls = [];
    errors = [];
    v = document.createElement('reports-viewer') as ReportsViewerElement;
    v.addEventListener('parameters-error', (e) => errors.push((e as CustomEvent).detail));
    document.body.appendChild(v);
  });
  afterEach(() => v.remove());

  it('runtime is really UTC+3', () => expect(new Date(2026, 9, 1).getTimezoneOffset()).toBe(-180));

  for (const bad of ['2026-02-30', '2026-04-31', '2025-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '1', 'hello 5', '10/01/2026', '2026-10-01 10:00', '20261001', '2026-1-5', 'Thu, 01 Oct 2026 00:00:00 GMT', '2026-10-01T25:00:00Z', '2026-10-01T10:60:00Z', '2026-10-01T10:00:00+25:00']) {
    it(`date ${JSON.stringify(bad)} is rejected; no fetch`, async () => {
      await run(DATE, { day: bad });
      rejected('day');
    });
  }

  for (const [input, out] of [
    ['2024-02-29', '2024-02-29'],
    ['2000-02-29', '2000-02-29'],
    ['2026-10-01', '2026-10-01'],
    ['2026-09-30T21:30:00Z', '2026-10-01'],
    ['2026-09-30T20:59:59Z', '2026-09-30'],
    ['2026-10-01T00:30:00+03:00', '2026-10-01'],
    ['2026-09-30T23:30:00-02:00', '2026-10-01'],
    ['2026-09-30T23:30:00', '2026-09-30'],
  ] as const) {
    it(`date ${JSON.stringify(input)} is sent as "${out}"`, async () => {
      await run(DATE, { day: input });
      sent('day', out);
    });
  }

  it('dateRange: impossible from is rejected; no fetch', async () => {
    await run(RANGE, { period: { from: '2026-02-30', to: '2026-03-05' } });
    rejected('period');
  });
  it('dateRange: junk to is rejected; no fetch', async () => {
    await run(RANGE, { period: { from: '2026-10-01', to: 'hello 5' } });
    rejected('period');
  });
  it('dateRange: array form with "1" is rejected; no fetch', async () => {
    await run(RANGE, { period: ['1', '2026-10-02'] });
    rejected('period');
  });
  it('optional dateRange: open-ended {to:"2025-02-29"} is rejected; no fetch', async () => {
    await run(RANGE_OPT, { period: { to: '2025-02-29' } });
    rejected('period');
  });
  it('dateRange: ISO instants converted to local dates on both sides', async () => {
    await run(RANGE, { period: { from: '2026-09-30T21:30:00Z', to: '2026-10-31T20:59:00Z' } });
    sent('period', { from: '2026-10-01', to: '2026-10-31' });
  });
  it('dateRange: from after to (after conversion) is rejected', async () => {
    await run(RANGE, { period: { from: '2026-10-02', to: '2026-10-01T20:00:00Z' } });
    expect(calls).toHaveLength(0);
    expect(errors[0]?.issues[0]?.code).toBe('invalid');
  });

  for (const bad of ['1', 'hello 5', '10/01/2026', '2026-02-30T10:00:00Z', '2026-13-01T00:00:00Z', '2026-10-01T24:30:00Z', '2026-10-01 10:00', 'Thu, 01 Oct 2026 00:00:00 GMT']) {
    it(`datetime ${JSON.stringify(bad)} is rejected; no fetch`, async () => {
      await run(DT, { at: bad });
      rejected('at');
    });
  }
  for (const ok of ['2026-10-01T00:00:00+03:00', '2026-09-30T21:00:00.000Z', '2026-10-01T10:15']) {
    it(`datetime ${JSON.stringify(ok)} is accepted and sent as given`, async () => {
      await run(DT, { at: ok });
      sent('at', ok);
    });
  }

  it('valid → invalid change: no second fetch, error surfaced', async () => {
    await run(DATE, { day: '2026-10-01' });
    expect(calls).toHaveLength(1);
    v.params = { day: '2026-02-30' };
    await settle();
    expect(calls).toHaveLength(1);
    expect(errors.at(-1)?.issues[0]).toMatchObject({ name: 'day', code: 'invalid' });
    expect(v.shadowRoot!.textContent ?? '').toMatch(/day/);
  });
});
