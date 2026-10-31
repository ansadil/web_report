import { describe, it, expect } from 'vitest';
import type { ParameterDef } from '@reports-web/shared';
import { buildDataQuery, ParameterValidationError, parameterValuesEqual, resolveParameterValues } from './parameters.js';

const ok = (defs: ParameterDef[], values?: Record<string, unknown>) => {
  const r = resolveParameterValues(defs, values);
  if (!r.ok) throw new Error(r.error);
  return r.values;
};
const issues = (defs: ParameterDef[], values?: Record<string, unknown>) => {
  const r = resolveParameterValues(defs, values);
  if (r.ok) throw new Error('expected failure');
  return r.issues;
};

describe('resolveParameterValues: resolution', () => {
  it('returns empty values without definitions or values', () => {
    expect(ok([])).toEqual({});
    expect(resolveParameterValues(undefined, null)).toEqual({ ok: true, values: {} });
  });

  it('explicit value wins over default; default used when absent, null or blank', () => {
    const defs: ParameterDef[] = [{ name: 'year', type: 'number', default: 2025 }];
    expect(ok(defs, { year: 2026 })).toEqual({ year: 2026 });
    expect(ok(defs)).toEqual({ year: 2025 });
    expect(ok(defs, { year: null })).toEqual({ year: 2025 });
    expect(ok(defs, { year: '  ' })).toEqual({ year: 2025 });
  });

  it('keeps falsy explicit values (0, false)', () => {
    const defs: ParameterDef[] = [
      { name: 'n', type: 'number', default: 5 },
      { name: 'b', type: 'bool', default: true },
    ];
    expect(ok(defs, { n: 0, b: false })).toEqual({ n: 0, b: false });
  });

  it('omits optional parameters without value', () => {
    expect(ok([{ name: 'q', type: 'string' }])).toEqual({});
  });

  it('passes undeclared values through unchanged', () => {
    const d = new Date(0);
    expect(ok([{ name: 'a', type: 'number' }], { a: '1', extra: d, other: undefined })).toEqual({ a: 1, extra: d });
  });
});

describe('resolveParameterValues: required', () => {
  it('reports missing required params with a clear error', () => {
    const r = resolveParameterValues(
      [
        { name: 'from', type: 'date', required: true },
        { name: 'branch', type: 'string', required: true },
        { name: 'opt', type: 'string' },
      ],
      { branch: '' },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual([
      { name: 'from', code: 'required', message: 'value is required' },
      { name: 'branch', code: 'required', message: 'value is required' },
    ]);
    expect(r.error).toBe('Invalid report parameters: from: value is required; branch: value is required');
  });

  it('a default satisfies required', () => {
    expect(ok([{ name: 'n', type: 'number', required: true, default: 1 }])).toEqual({ n: 1 });
  });
});

describe('resolveParameterValues: coercion', () => {
  it('string', () => {
    expect(ok([{ name: 's', type: 'string' }], { s: 12 })).toEqual({ s: '12' });
    expect(issues([{ name: 's', type: 'string' }], { s: { a: 1 } })[0]!.code).toBe('invalid');
  });

  it('number', () => {
    expect(ok([{ name: 'n', type: 'number' }], { n: ' 42.5 ' })).toEqual({ n: 42.5 });
    expect(issues([{ name: 'n', type: 'number' }], { n: 'abc' })[0]).toEqual({ name: 'n', code: 'invalid', message: 'expected a number' });
    expect(issues([{ name: 'n', type: 'number' }], { n: Infinity })[0]!.code).toBe('invalid');
  });

  it('bool', () => {
    const d: ParameterDef[] = [{ name: 'b', type: 'bool' }];
    expect(ok(d, { b: 'true' })).toEqual({ b: true });
    expect(ok(d, { b: '0' })).toEqual({ b: false });
    expect(ok(d, { b: 1 })).toEqual({ b: true });
    expect(issues(d, { b: 'yes' })[0]!.message).toBe('expected a boolean');
  });

  it('date -> ISO string', () => {
    const d: ParameterDef[] = [{ name: 'd', type: 'date' }];
    expect(ok(d, { d: '2026-10-01' })).toEqual({ d: '2026-10-01' });
    expect(ok(d, { d: new Date(Date.UTC(2026, 9, 1)) })).toEqual({ d: '2026-10-01T00:00:00.000Z' });
    expect(ok(d, { d: Date.UTC(2026, 0, 2) })).toEqual({ d: '2026-01-02T00:00:00.000Z' });
    expect(issues(d, { d: 'not a date' })[0]!.code).toBe('invalid');
    expect(issues(d, { d: new Date('x') })[0]!.code).toBe('invalid');
  });

  it('dateRange -> { from, to }', () => {
    const d: ParameterDef[] = [{ name: 'p', type: 'dateRange' }];
    expect(ok(d, { p: { from: '2026-01-01', to: new Date(Date.UTC(2026, 0, 31)) } })).toEqual({
      p: { from: '2026-01-01', to: '2026-01-31T00:00:00.000Z' },
    });
    expect(ok(d, { p: ['2026-01-01', '2026-02-01'] })).toEqual({ p: { from: '2026-01-01', to: '2026-02-01' } });
    expect(issues(d, { p: { from: '2026-01-01' } })[0]!.message).toBe('dateRange requires both from and to');
    expect(issues(d, { p: { from: '2026-02-01', to: '2026-01-01' } })[0]!.message).toBe('from must not be after to');
    expect(issues(d, { p: '2026-01-01' })[0]!.code).toBe('invalid');
  });

  it('select with static options returns the option value', () => {
    const d: ParameterDef[] = [{ name: 's', type: 'select', options: [{ value: 1, label: 'One' }, { value: 'x', label: 'X' }] }];
    expect(ok(d, { s: 1 })).toEqual({ s: 1 });
    expect(ok(d, { s: '1' })).toEqual({ s: 1 });
    expect(issues(d, { s: 3 })[0]!.message).toBe('value is not one of the allowed options');
  });

  it('select with source options passes through', () => {
    const d: ParameterDef[] = [{ name: 's', type: 'select', options: { source: 'b', valueField: 'id', labelField: 'n' } }];
    expect(ok(d, { s: 'anything' })).toEqual({ s: 'anything' });
  });

  it('collects multiple issues', () => {
    expect(issues([{ name: 'a', type: 'number' }, { name: 'b', type: 'bool', required: true }], { a: 'x' }).map((i) => i.code)).toEqual(['invalid', 'required']);
  });
});

describe('buildDataQuery', () => {
  const schema = {
    dataset: { adapter: 'rest', source: 'sales', params: { region: 'west', year: 2020, fixed: true } },
    parameters: [
      { name: 'year', type: 'number', default: 2025 },
      { name: 'region', type: 'string' },
      { name: 'period', type: 'dateRange' },
    ] as ParameterDef[],
  };

  it('merges static dataset params with resolved values (defaults and explicit values win)', () => {
    expect(buildDataQuery(schema)).toEqual({ source: 'sales', params: { region: 'west', year: 2025, fixed: true } });
    expect(buildDataQuery(schema, { region: 'east', period: { from: '2026-01-01', to: '2026-01-31' } })).toEqual({
      source: 'sales',
      params: { region: 'east', year: 2025, fixed: true, period: { from: '2026-01-01', to: '2026-01-31' } },
    });
  });

  it('works for old templates without parameters', () => {
    expect(buildDataQuery({ dataset: { adapter: 's', source: 't' } })).toEqual({ source: 't', params: {} });
    expect(buildDataQuery({ dataset: { adapter: 's', source: 't' } }, { a: 1 })).toEqual({ source: 't', params: { a: 1 } });
  });

  it('throws ParameterValidationError with issues', () => {
    const s = { dataset: { adapter: 's', source: 't' }, parameters: [{ name: 'from', type: 'date', required: true }] as ParameterDef[] };
    try {
      buildDataQuery(s);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParameterValidationError);
      expect((e as ParameterValidationError).issues[0]!.name).toBe('from');
      expect((e as Error).message).toMatch(/from: value is required/);
    }
  });
});

describe('parameterValuesEqual', () => {
  it('compares structurally (key order, dates, nested)', () => {
    expect(parameterValuesEqual({ a: 1, b: { from: 'x', to: 'y' } }, { b: { to: 'y', from: 'x' }, a: 1 })).toBe(true);
    expect(parameterValuesEqual({ d: new Date(5) }, { d: new Date(5) })).toBe(true);
    expect(parameterValuesEqual({ d: new Date(5) }, { d: new Date(6) })).toBe(false);
    expect(parameterValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(parameterValuesEqual(null, undefined)).toBe(true);
    expect(parameterValuesEqual({ a: undefined }, {})).toBe(true);
    expect(parameterValuesEqual(null, {})).toBe(false);
  });
});
