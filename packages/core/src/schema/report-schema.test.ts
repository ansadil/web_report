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

describe('validateReport: data dictionary additions', () => {
  it('old templates without parameters validate unchanged', () => {
    const r = validateReport(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.parameters).toBeUndefined();
      expect(r.value.fields).toEqual(minimal.fields);
    }
  });

  it('accepts image field type', () => {
    const r = validateReport({ ...minimal, fields: [...minimal.fields, { name: 'logo', type: 'image' }] });
    expect(r.ok).toBe(true);
  });

  it('accepts valid parameters (static and source options, localized labels)', () => {
    const r = validateReport({
      ...minimal,
      parameters: [
        { name: 'from', type: 'date', required: true, label: { ar: 'من', en: 'From' } },
        { name: 'period', type: 'dateRange' },
        { name: 'active', type: 'bool', default: true },
        { name: 'status', type: 'select', options: [{ value: 'paid', label: { ar: 'مدفوعة', en: 'Paid' } }, { value: 'open', label: 'Open' }] },
        { name: 'branch', type: 'select', options: { source: 'branches', valueField: 'id', labelField: 'name' } },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.parameters).toHaveLength(5);
  });

  it('rejects unknown parameter type', () => {
    expect(validateReport({ ...minimal, parameters: [{ name: 'x', type: 'color' }] }).ok).toBe(false);
  });

  it('rejects parameter without name', () => {
    expect(validateReport({ ...minimal, parameters: [{ name: '', type: 'string' }] }).ok).toBe(false);
  });

  it('rejects select parameter without options', () => {
    const r = validateReport({ ...minimal, parameters: [{ name: 's', type: 'select' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/select parameters require options/);
  });

  it('rejects incomplete options source', () => {
    expect(validateReport({ ...minimal, parameters: [{ name: 's', type: 'select', options: { source: 'b', valueField: 'id' } }] }).ok).toBe(false);
  });

  it('rejects duplicate parameter names', () => {
    const r = validateReport({ ...minimal, parameters: [{ name: 'a', type: 'string' }, { name: 'a', type: 'number' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/duplicate parameter name/);
  });
});
