import { describe, it, expect } from 'vitest';
import { validateReport } from './report-schema.js';

const withParams = (parameters: unknown[]) =>
  validateReport({
    version: '1',
    id: 'p',
    meta: { name: 'P', locale: 'ar', dir: 'rtl' },
    dataset: { adapter: 'static', source: 'rows' },
    fields: [],
    parameters,
    bands: { detail: { height: 5 } },
  });

describe('ReportSchemaV1 parameters: description, min / max, relative defaults', () => {
  it('accepts description, numeric and date bounds, and relative presets', () => {
    const r = withParams([
      { name: 'n', type: 'number', description: { ar: 'وصف', en: 'desc' }, min: 0, max: 10, default: 5 },
      { name: 'd', type: 'date', min: '2020-01-01', max: 'endOfYear', default: 'today' },
      { name: 'p', type: 'dateRange', default: 'thisMonth', min: 'startOfYear' },
      { name: 't', type: 'datetime', default: 'now', min: '2026-01-01T00:00:00Z' },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.parameters![0]).toMatchObject({ min: 0, max: 10, description: { ar: 'وصف', en: 'desc' } });
  });

  it('rejects min > max and bounds of the wrong shape', () => {
    expect(withParams([{ name: 'n', type: 'number', min: 10, max: 1 }]).ok).toBe(false);
    expect(withParams([{ name: 'n', type: 'number', min: 'abc' }]).ok).toBe(false);
    expect(withParams([{ name: 'd', type: 'date', min: '2026-12-31', max: '2026-01-01' }]).ok).toBe(false);
    expect(withParams([{ name: 'd', type: 'date', max: '31/12/2026' }]).ok).toBe(false);
  });

  it('templates without the new keys are unchanged', () => {
    const r = withParams([{ name: 'y', type: 'number', required: true }]);
    expect(r.ok && r.value.parameters).toEqual([{ name: 'y', type: 'number', required: true }]);
  });
});
