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

const localYmd = (ms: number) => {
  const t = new Date(ms);
  return `${String(t.getFullYear()).padStart(4, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
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

  it('date -> local calendar date YYYY-MM-DD (TZ-independent: built from local components)', () => {
    const d: ParameterDef[] = [{ name: 'd', type: 'date' }];
    expect(ok(d, { d: '2026-10-01' })).toEqual({ d: '2026-10-01' });
    expect(ok(d, { d: ' 2026-10-01 ' })).toEqual({ d: '2026-10-01' });
    expect(ok(d, { d: new Date(2026, 9, 1) })).toEqual({ d: '2026-10-01' }); // local midnight, any TZ
    expect(ok(d, { d: new Date(2026, 9, 1, 23, 59, 59, 999) })).toEqual({ d: '2026-10-01' });
    expect(ok(d, { d: new Date(2026, 0, 2).getTime() })).toEqual({ d: '2026-01-02' }); // epoch ms
    expect(ok(d, { d: new Date(999, 0, 5) })).toEqual({ d: '0999-01-05' }); // zero-padded year
    // ISO date-time with an offset -> local calendar date of that instant (TZ-independent expectation)
    expect(ok(d, { d: '2026-10-01T00:00:00+03:00' })).toEqual({ d: localYmd(Date.UTC(2026, 8, 30, 21)) });
    expect(issues(d, { d: 'not a date' })[0]!.code).toBe('invalid');
    expect(issues(d, { d: '2026-13-01' })[0]!.code).toBe('invalid');
    expect(issues(d, { d: new Date('x') })[0]!.code).toBe('invalid');
  });

  it('datetime -> full ISO instant via toISOString()', () => {
    const d: ParameterDef[] = [{ name: 't', type: 'datetime' }];
    const local = new Date(2026, 9, 1, 0, 0, 0);
    expect(ok(d, { t: local })).toEqual({ t: local.toISOString() });
    expect(ok(d, { t: new Date(Date.UTC(2026, 9, 1, 12, 30)) })).toEqual({ t: '2026-10-01T12:30:00.000Z' });
    expect(ok(d, { t: Date.UTC(2026, 0, 2) })).toEqual({ t: '2026-01-02T00:00:00.000Z' });
    expect(ok(d, { t: '2026-10-01T08:00:00+03:00' })).toEqual({ t: '2026-10-01T08:00:00+03:00' });
    expect(issues(d, { t: 'nope' })[0]!.code).toBe('invalid');
    expect(issues(d, { t: new Date('x') })[0]!.code).toBe('invalid');
  });

  it('dateRange -> { from, to } as local calendar dates, boundaries included', () => {
    const d: ParameterDef[] = [{ name: 'p', type: 'dateRange' }];
    expect(ok(d, { p: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59, 59, 999) } })).toEqual({
      p: { from: '2026-10-01', to: '2026-10-31' },
    });
    expect(ok(d, { p: { from: '2026-01-01', to: new Date(2026, 0, 31) } })).toEqual({ p: { from: '2026-01-01', to: '2026-01-31' } });
    expect(ok(d, { p: [new Date(2026, 0, 1).getTime(), '2026-02-01'] })).toEqual({ p: { from: '2026-01-01', to: '2026-02-01' } });
    expect(ok(d, { p: { from: new Date(2026, 4, 5), to: new Date(2026, 4, 5, 18) } })).toEqual({ p: { from: '2026-05-05', to: '2026-05-05' } });
    expect(issues(d, { p: { from: '2026-02-01', to: '2026-01-01' } })[0]!.message).toBe('from must not be after to');
    expect(issues(d, { p: '2026-01-01' })[0]!.code).toBe('invalid');
  });

  it('dateRange: required rejects a missing end; optional accepts an open-ended range', () => {
    const req: ParameterDef[] = [{ name: 'p', type: 'dateRange', required: true }];
    expect(issues(req, { p: { from: '2026-01-01' } })[0]!.message).toBe('dateRange requires both from and to');
    expect(issues(req, { p: { to: new Date(2026, 0, 1) } })[0]!.message).toBe('dateRange requires both from and to');
    expect(issues(req, { p: { from: '', to: null } })[0]!.message).toBe('dateRange requires both from and to');
    expect(issues(req, {})[0]!.code).toBe('required');

    const opt: ParameterDef[] = [{ name: 'p', type: 'dateRange' }];
    expect(ok(opt, { p: { from: new Date(2026, 9, 1) } })).toEqual({ p: { from: '2026-10-01' } });
    expect(ok(opt, { p: { to: new Date(2026, 9, 31) } })).toEqual({ p: { to: '2026-10-31' } });
    expect(ok(opt, { p: [null, '2026-10-31'] })).toEqual({ p: { to: '2026-10-31' } });
    expect(Object.keys((ok(opt, { p: { from: '2026-10-01', to: '' } }) as { p: object }).p)).toEqual(['from']);
    expect(ok(opt, { p: { from: null, to: null } })).toEqual({});
    expect(ok(opt, {})).toEqual({});
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

describe('BUG-20: strict date / datetime string validation', () => {
  const d: ParameterDef[] = [{ name: 'day', type: 'date', required: true }];
  const t: ParameterDef[] = [{ name: 'at', type: 'datetime' }];
  const r: ParameterDef[] = [{ name: 'p', type: 'dateRange' }];

  it.each(['2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32', '2025-02-29', '2100-02-29'])(
    'date "%s" (impossible calendar date) is invalid',
    (bad) => {
      expect(issues(d, { day: bad })[0]).toMatchObject({ name: 'day', code: 'invalid' });
    },
  );

  it.each(['1', 'hello 5', '10/01/2026', '2026-10-01 10:00', '2026-1-01', '2026-10-1', '20261001', '2026-10', 'Oct 1 2026', '2026-10-01T', '2026-10-01T10', '+002026-10-01'])(
    'date "%s" (not YYYY-MM-DD / ISO 8601 date-time) is invalid',
    (bad) => {
      const i = issues(d, { day: bad })[0]!;
      expect(i).toMatchObject({ name: 'day', code: 'invalid' });
      expect(i.message).toBe('expected a valid YYYY-MM-DD or ISO 8601 date-time string');
    },
  );

  it('valid YYYY-MM-DD strings pass through, leap days included', () => {
    expect(ok(d, { day: '2026-10-01' })).toEqual({ day: '2026-10-01' });
    expect(ok(d, { day: '2024-02-29' })).toEqual({ day: '2024-02-29' });
    expect(ok(d, { day: '2000-02-29' })).toEqual({ day: '2000-02-29' });
    expect(ok(d, { day: '2026-04-30' })).toEqual({ day: '2026-04-30' });
  });

  it('ISO date-time strings with Z / offset become the local calendar date of the instant', () => {
    expect(ok(d, { day: '2026-10-01T12:00:00Z' })).toEqual({ day: localYmd(Date.UTC(2026, 9, 1, 12)) });
    expect(ok(d, { day: '2026-09-30T21:00:00.000Z' })).toEqual({ day: localYmd(Date.UTC(2026, 8, 30, 21)) });
    expect(ok(d, { day: '2026-10-01T08:30+0300' })).toEqual({ day: localYmd(Date.UTC(2026, 9, 1, 5, 30)) });
    expect(ok(d, { day: '2026-10-01T08:30:15.123456-05:00' })).toEqual({ day: localYmd(Date.UTC(2026, 9, 1, 13, 30, 15)) });
    expect(ok(d, { day: '2026-10-01t08:30z' })).toEqual({ day: localYmd(Date.UTC(2026, 9, 1, 8, 30)) });
  });

  it('ISO date-time strings without a zone are local time: their own date part is used', () => {
    expect(ok(d, { day: '2026-10-01T00:00' })).toEqual({ day: '2026-10-01' });
    expect(ok(d, { day: '2026-10-01T23:59:59.999' })).toEqual({ day: '2026-10-01' });
  });

  it.each([
    '2026-02-30T10:00:00Z', '2026-04-31T00:00', '2026-13-01T00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T10:60Z',
    '2026-10-01T10:00:60Z', '2026-10-01T10:00+24:00', '2026-10-01T10:00+03:60', '2026-10-01T10:00:00+3',
  ])('date-time "%s" with an invalid component is invalid', (bad) => {
    expect(issues(d, { day: bad })[0]).toMatchObject({ name: 'day', code: 'invalid' });
    expect(issues(t, { at: bad })[0]).toMatchObject({ name: 'at', code: 'invalid' });
  });

  it('dateRange: each end follows the date rules', () => {
    expect(issues(r, { p: { from: '2026-02-30', to: '2026-03-01' } })[0]).toMatchObject({ name: 'p', code: 'invalid' });
    expect(issues(r, { p: { from: '2026-03-01', to: '2026-04-31' } })[0]).toMatchObject({ name: 'p', code: 'invalid' });
    expect(issues(r, { p: { from: '1', to: '2026-03-01' } })[0]).toMatchObject({ name: 'p', code: 'invalid' });
    expect(issues(r, { p: ['2026-03-01', 'hello 5'] })[0]).toMatchObject({ name: 'p', code: 'invalid' });
    expect(issues(r, { p: { to: '10/01/2026' } })[0]).toMatchObject({ name: 'p', code: 'invalid' });
    expect(ok(r, { p: { from: '2026-10-01T00:00', to: '2026-10-31T23:59:59' } })).toEqual({ p: { from: '2026-10-01', to: '2026-10-31' } });
    expect(ok(r, { p: { from: '2026-10-01T12:00:00Z' } })).toEqual({ p: { from: localYmd(Date.UTC(2026, 9, 1, 12)) } });
  });

  it('datetime: Date / epoch -> toISOString(); valid ISO strings (or YYYY-MM-DD) kept as given; others invalid', () => {
    expect(ok(t, { at: Date.UTC(2026, 9, 1, 5) })).toEqual({ at: '2026-10-01T05:00:00.000Z' });
    expect(ok(t, { at: '2026-10-01T08:00:00+03:00' })).toEqual({ at: '2026-10-01T08:00:00+03:00' });
    expect(ok(t, { at: ' 2026-10-01T08:00Z ' })).toEqual({ at: '2026-10-01T08:00Z' });
    expect(ok(t, { at: '2026-10-01T08:00' })).toEqual({ at: '2026-10-01T08:00' });
    expect(ok(t, { at: '2026-10-01' })).toEqual({ at: '2026-10-01' });
    for (const bad of ['1', 'hello 5', '10/01/2026', '2026-02-30', '2026-04-31', '2026-13-01', 'Thu, 01 Oct 2026 08:00:00 GMT']) {
      expect(issues(t, { at: bad })[0]).toMatchObject({ name: 'at', code: 'invalid' });
    }
    expect(issues(t, { at: '1' })[0]!.message).toBe('expected a valid ISO 8601 date-time string');
  });
});
