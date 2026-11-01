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
  it('reportDataArgs checks the shape of { source, params }', () => {
    expect(Object.keys(reportDataArgs).sort()).toEqual(['params', 'source']);
    expect(reportDataArgs.source.kind).toBe('string');
    expect(reportDataArgs.params.kind).toBe('record');
  });

  // BUG-55: `params` used to be v.any(): 'nope' (spread to {"0":"n",...}), null and nested objects were accepted.
  // convex-test 0.0.66 does not check `v.record` (its validator has no "record" case), so the rejections are checked
  // against the validator JSON that is pushed to the Convex backend, with the backend's rules for the kinds used here.
  type VJson = { type: string; value?: unknown; keys?: VJson; values?: { fieldType: VJson } };
  const conforms = (j: VJson, x: unknown): boolean => {
    const plain = (o: unknown): o is Record<string, unknown> =>
      typeof o === 'object' && o !== null && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
    switch (j.type) {
      case 'string': case 'number': case 'boolean': return typeof x === j.type;
      case 'null': return x === null;
      case 'array': return Array.isArray(x) && x.every((e) => conforms(j.value as VJson, e));
      case 'union': return (j.value as VJson[]).some((u) => conforms(u, x));
      case 'object': {
        const fields = j.value as Record<string, { fieldType: VJson; optional: boolean }>;
        return plain(x) && Object.keys(x).every((k) => k in fields) &&
          Object.entries(fields).every(([k, f]) => (x[k] === undefined ? f.optional : conforms(f.fieldType, x[k])));
      }
      case 'record':
        return plain(x) && Object.entries(x).every(([k, e]) => conforms(j.keys!, k) && conforms(j.values!.fieldType, e));
      default: throw new Error(`unexpected validator ${j.type}`);
    }
  };
  const paramsOk = (x: unknown) => conforms(reportDataArgs.params.json as VJson, x);

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['an array', ['a']],
    ['a nested object', { top: 'x', evil: { ne: 1 } }],
    ['an empty nested object', { top: {} }],
    ['an array of objects', { arr: [{ a: 1 }] }],
    ['a dateRange with a non-string end', { period: { from: 1 } }],
  ])('rejects params that are %s', (_label, params) => {
    expect(paramsOk(params)).toBe(false);
  });

  it('the params validator is a record of scalars, scalar arrays and non-empty { from?, to? }', () => {
    const scalar = { type: 'union', value: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'null' }] };
    expect(reportDataArgs.params.json).toEqual({
      type: 'record',
      keys: { type: 'string' },
      values: {
        optional: false,
        fieldType: {
          type: 'union',
          value: [
            scalar,
            { type: 'array', value: scalar },
            { type: 'object', value: { from: { fieldType: { type: 'string' }, optional: false }, to: { fieldType: { type: 'string' }, optional: true } } },
            { type: 'object', value: { to: { fieldType: { type: 'string' }, optional: false } } },
          ],
        },
      },
    });
  });

  it('accepts every value shape the adapter sends (backward compatible)', async () => {
    const t = convexTest(schema, modules);
    const params = {
      period: { from: '2026-10-01', to: '2026-10-31' },
      since: { from: '2026-01-01' },
      until: { to: '2026-12-31' },
      branch: 'ruh',
      top: 10,
      flag: true,
      none: null,
      ids: [1, 'a', null],
      at: '2026-10-31T21:30:00.000Z',
    };
    expect(paramsOk(params)).toBe(true);
    expect(paramsOk({})).toBe(true);
    expect(await t.query(rowsRef, { source: 's', params })).toEqual([{ source: 's', ...params }]);
    expect(await t.query(rowsRef, { source: 's', params: {} })).toEqual([{ source: 's' }]);
  });

  it('validated values (incl. a relative default) reach the Convex query args', async () => {
    const t = convexTest(schema, modules);
    const adapter = createConvexDataAdapter({ client: t, query: rowsRef });
    const query = buildDataQuery(report(), { branch: 'ruh' }, { now: new Date('2026-10-14T12:00:00+03:00') });
    expect(paramsOk({ ...query.params })).toBe(true);
    const rows = await adapter.fetch(query);
    expect(rows).toEqual([
      { source: 'sales', tenant: 't1', period: { from: '2026-10-01', to: '2026-10-31' }, branch: 'ruh', top: 10 },
    ]);
  });

  it('invalid values never reach Convex', () => {
    expect(() => buildDataQuery(report(), { branch: 'ruh', top: 500 })).toThrow(/top/);
  });
});
