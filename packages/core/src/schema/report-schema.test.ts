import { describe, it, expect } from 'vitest';
import { validateReport } from './report-schema.js';

const minimal = {
  version: '1',
  id: 'r1',
  meta: { name: 'Test', locale: 'en', dir: 'ltr' },
  dataset: { adapter: 'static', source: 'rows' },
  fields: [{ name: 'amount', type: 'number' }],
  bands: { detail: { height: 8, elements: [] } },
};

describe('validateReport', () => {
  it('accepts a minimal valid schema', () => {
    const r = validateReport(minimal);
    expect(r.ok).toBe(true);
  });

  it('rejects missing version', () => {
    const r = validateReport({ ...minimal, version: '2' });
    expect(r.ok).toBe(false);
  });

  it('rejects bands without detail', () => {
    const r = validateReport({ ...minimal, bands: {} });
    expect(r.ok).toBe(false);
  });

  it('accepts elements with valid discriminated kind', () => {
    const r = validateReport({
      ...minimal,
      bands: {
        detail: {
          height: 8,
          elements: [
            { id: 'e1', kind: 'field', field: 'amount', pos: { x: 0, y: 0, w: 50, h: 6 } },
            { id: 'e2', kind: 'text', value: 'Total:', pos: { x: 60, y: 0, w: 30, h: 6 } },
          ],
        },
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects unknown element kind', () => {
    const r = validateReport({
      ...minimal,
      bands: {
        detail: {
          height: 8,
          elements: [{ id: 'e1', kind: 'unknown', pos: { x: 0, y: 0, w: 1, h: 1 } }],
        },
      },
    });
    expect(r.ok).toBe(false);
  });

  it('returns a readable error string', () => {
    const r = validateReport({ version: '1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
  });
});
