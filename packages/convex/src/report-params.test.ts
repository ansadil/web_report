import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi, type FunctionReference } from 'convex/server';
import { buildDataQuery, validateReport } from '@reports-web/core';
import schema from './test/convex/schema.js';
import { createConvexDataAdapter } from './index.js';
import { reportDataArgs } from './server.js';

const modules = import.meta.glob('./test/convex/**/*.ts');
const rowsRef = (anyApi as unknown as { data: { rows: FunctionReference<'query'> } }).data.rows;

function report() {
  const r = validateReport({
    version: '1',
    id: 'sales',
    meta: { name: 'Sales', locale: 'ar', dir: 'rtl' },
    dataset: { adapter: 'convex', source: 'sales', params: { tenant: 't1' } },
    fields: [],
    parameters: [
      { name: 'period', type: 'dateRange', required: true, default: 'thisMonth' },
      { name: 'branch', type: 'select', required: true, options: [{ value: 'ruh', label: 'Riyadh' }] },
      { name: 'top', type: 'number', min: 1, max: 100, default: 10 },
    ],
    bands: { detail: { height: 5 } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('report parameters -> Convex query args', () => {
  it('reportDataArgs validates { source, params }', () => {
    expect(Object.keys(reportDataArgs).sort()).toEqual(['params', 'source']);
    expect(reportDataArgs.source.kind).toBe('string');
  });

  it('validated values (incl. a relative default) reach the Convex query args', async () => {
    const t = convexTest(schema, modules);
    const adapter = createConvexDataAdapter({ client: t, query: rowsRef });
    const query = buildDataQuery(report(), { branch: 'ruh' }, { now: new Date(2026, 9, 14, 12) });
    const rows = await adapter.fetch(query);
    expect(rows).toEqual([
      { source: 'sales', tenant: 't1', period: { from: '2026-10-01', to: '2026-10-31' }, branch: 'ruh', top: 10 },
    ]);
  });

  it('invalid values never reach Convex', () => {
    expect(() => buildDataQuery(report(), { branch: 'ruh', top: 500 })).toThrow(/top/);
  });
});
