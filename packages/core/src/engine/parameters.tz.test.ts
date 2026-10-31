import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildDataQuery, resolveParameterValues } from './parameters.js';
import type { ParameterDef } from '@reports-web/shared';

// QA regression: in Asia/Riyadh (UTC+3) local 2026-10-01 00:00 is 2026-09-30T21:00Z; toISOString() made the period
// start a day early. Runs with TZ switched to Asia/Riyadh for this file (Node re-reads process.env.TZ on assignment).
describe('date parameters in Asia/Riyadh (UTC+3)', () => {
  const prevTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'Asia/Riyadh'; });
  afterAll(() => {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });

  it('runs in UTC+3', () => {
    expect(new Date(2026, 9, 1).getTimezoneOffset()).toBe(-180);
    expect(new Date(2026, 9, 1).toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('date: local midnight 2026-10-01 is sent as 2026-10-01 (not 2026-09-30)', () => {
    const defs: ParameterDef[] = [{ name: 'd', type: 'date' }];
    const r = resolveParameterValues(defs, { d: new Date(2026, 9, 1) });
    expect(r).toEqual({ ok: true, values: { d: '2026-10-01' } });
    // same instant given as epoch ms / UTC construction
    expect(resolveParameterValues(defs, { d: Date.UTC(2026, 8, 30, 21) })).toEqual({ ok: true, values: { d: '2026-10-01' } });
    // 2026-10-01 23:30 local = 20:30Z, still Oct 1 locally
    expect(resolveParameterValues(defs, { d: new Date(2026, 9, 1, 23, 30) })).toEqual({ ok: true, values: { d: '2026-10-01' } });
  });

  it('dateRange boundaries keep local calendar days; datetime stays a UTC ISO instant', () => {
    const q = buildDataQuery(
      {
        dataset: { adapter: 'custom', source: 's' },
        parameters: [
          { name: 'period', type: 'dateRange', required: true },
          { name: 'since', type: 'dateRange' },
          { name: 'at', type: 'datetime' },
        ],
      },
      {
        period: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59, 59, 999) },
        since: { from: new Date(2026, 0, 1) },
        at: new Date(2026, 9, 1),
      },
    );
    expect(q.params).toEqual({
      period: { from: '2026-10-01', to: '2026-10-31' },
      since: { from: '2026-01-01' },
      at: '2026-09-30T21:00:00.000Z',
    });
  });

  it('BUG-20: ISO date-time strings are converted to the local (Riyadh) calendar date', () => {
    const defs: ParameterDef[] = [{ name: 'd', type: 'date' }];
    const val = (d: string) => resolveParameterValues(defs, { d });
    expect(val('2026-09-30T21:00:00Z')).toEqual({ ok: true, values: { d: '2026-10-01' } }); // 00:00 local
    expect(val('2026-09-30T20:59:59Z')).toEqual({ ok: true, values: { d: '2026-09-30' } }); // 23:59:59 local
    expect(val('2026-10-01T00:00:00+03:00')).toEqual({ ok: true, values: { d: '2026-10-01' } });
    expect(val('2026-10-01T01:00:00+05:00')).toEqual({ ok: true, values: { d: '2026-09-30' } }); // 23:00 local
    expect(val('2026-10-01T00:30')).toEqual({ ok: true, values: { d: '2026-10-01' } }); // local, no zone
    expect(val('2026-02-30')).toMatchObject({ ok: false, issues: [{ name: 'd', code: 'invalid' }] });
    expect(val('hello 5')).toMatchObject({ ok: false, issues: [{ name: 'd', code: 'invalid' }] });
  });
});
