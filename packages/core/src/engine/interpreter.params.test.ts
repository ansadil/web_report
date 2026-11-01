import { describe, it, expect } from 'vitest';
import { interpret } from './interpreter.js';
import { validateReport } from '../schema/report-schema.js';

function schema(fields: { name: string; type: 'string' | 'number' }[] = []) {
  const r = validateReport({
    version: '1',
    id: 'p',
    meta: { name: 'P', locale: 'en', dir: 'ltr' },
    dataset: { adapter: 'static', source: 'rows' },
    fields,
    parameters: [
      { name: 'period', type: 'dateRange' },
      { name: 'branch', type: 'string' },
    ],
    bands: {
      reportHeader: {
        height: 8,
        elements: [
          { id: 'b', kind: 'expr', expression: 'params.branch', pos: { x: 0, y: 0, w: 40, h: 6 } },
          { id: 'f', kind: 'expr', expression: 'params.period.from', pos: { x: 40, y: 0, w: 40, h: 6 } },
          { id: 't', kind: 'expr', expression: 'params.period.to', pos: { x: 80, y: 0, w: 40, h: 6 } },
        ],
      },
      detail: { height: 5 },
    },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('interpret: params variable', () => {
  it('exposes resolved parameter values as params.<name> in expressions', () => {
    const t = interpret({ schema: schema(), rows: [], params: { branch: 'ruh', period: { from: '2026-10-01', to: '2026-10-31' } } });
    const h = t.sections.find((s) => s.band === 'reportHeader');
    expect(h?.elements.map((e) => e.text)).toEqual(['ruh', '2026-10-01', '2026-10-31']);
  });

  it('without params nothing changes (a row field named "params" is still reachable)', () => {
    const s = schema([{ name: 'params', type: 'string' }]);
    const r = validateReport({
      ...s,
      bands: { detail: { height: 5, elements: [{ id: 'd', kind: 'expr', expression: 'params', pos: { x: 0, y: 0, w: 50, h: 5 } }] } },
    });
    if (!r.ok) throw new Error(r.error);
    const t = interpret({ schema: r.value, rows: [{ params: 'row-value' }] });
    const d = t.sections.find((x) => x.band === 'detail');
    expect(d?.elements[0]?.text).toBe('row-value');
  });
});
