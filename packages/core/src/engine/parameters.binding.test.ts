import { describe, it, expect, vi } from 'vitest';
import type { ParameterDef } from '@reports-web/shared';
import {
  buildDataQuery,
  formatParameterIssue,
  getParameterDefinitions,
  loadParameterOptions,
  resolveParameterValues,
  validateParameterValues,
} from './parameters.js';
import { validateReport } from '../schema/report-schema.js';
import type { DataAdapter } from '../adapters/data/types.js';

const now = new Date('2026-10-14T12:00:00+03:00'); // Wed 2026-10-14, noon in the default zone Asia/Riyadh

const defs: ParameterDef[] = [
  { name: 'period', type: 'dateRange', label: { ar: 'الفترة', en: 'Period' }, required: true, default: 'thisMonth' },
  {
    name: 'branch',
    type: 'select',
    label: { ar: 'الفرع', en: 'Branch' },
    required: true,
    options: [
      { value: 'ruh', label: { ar: 'الرياض', en: 'Riyadh' } },
      { value: 'jed', label: { ar: 'جدة', en: 'Jeddah' } },
    ],
  },
  { name: 'minTotal', type: 'number', label: { ar: 'الحد الأدنى', en: 'Minimum total' }, min: 0, max: 1000 },
  { name: 'asOf', type: 'date', default: 'today', min: '2020-01-01', max: 'endOfYear' },
];

function report() {
  const r = validateReport({
    version: '1',
    id: 'sales',
    meta: { name: 'Sales', locale: 'ar-SA', dir: 'rtl' },
    dataset: { adapter: 'convex', source: 'sales', params: { tenant: 't1' } },
    fields: [{ name: 'total', type: 'number' }],
    parameters: defs,
    bands: { detail: { height: 6 } },
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('relative defaults and bounds in resolveParameterValues', () => {
  it('applies relative presets in defaults against `now`', () => {
    const r = resolveParameterValues(defs, { branch: 'ruh' }, { now });
    expect(r).toEqual({ ok: true, values: { period: { from: '2026-10-01', to: '2026-10-31' }, branch: 'ruh', asOf: '2026-10-14' } });
  });

  it('explicit values win over relative defaults and presets are not accepted as explicit values', () => {
    const ok = resolveParameterValues(defs, { branch: 'jed', period: { from: '2026-01-01', to: '2026-01-31' } }, { now });
    expect(ok.ok && ok.values.period).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    const bad = resolveParameterValues([{ name: 'd', type: 'date' }], { d: 'today' }, { now });
    expect(bad.ok).toBe(false);
  });

  it('datetime default "now" resolves to the reference instant', () => {
    const r = resolveParameterValues([{ name: 'at', type: 'datetime', default: 'now' }], {}, { now });
    expect(r.ok && r.values.at).toBe(now.toISOString());
  });

  it('enforces number min / max', () => {
    const lo = resolveParameterValues(defs, { branch: 'ruh', minTotal: -1 }, { now });
    expect(lo.ok).toBe(false);
    expect(!lo.ok && lo.issues).toEqual([{ name: 'minTotal', code: 'invalid', message: expect.stringMatching(/at least 0/) }]);
    const hi = resolveParameterValues(defs, { branch: 'ruh', minTotal: '1001' }, { now });
    expect(!hi.ok && hi.issues[0]!.message).toMatch(/at most 1000/);
    expect(resolveParameterValues(defs, { branch: 'ruh', minTotal: 1000 }, { now }).ok).toBe(true);
  });

  it('enforces date bounds (presets allowed in bounds) and checks both ends of a range', () => {
    expect(resolveParameterValues(defs, { branch: 'ruh', asOf: '2019-12-31' }, { now }).ok).toBe(false);
    expect(resolveParameterValues(defs, { branch: 'ruh', asOf: '2027-01-01' }, { now }).ok).toBe(false);
    expect(resolveParameterValues(defs, { branch: 'ruh', asOf: '2026-12-31' }, { now }).ok).toBe(true);
    const range: ParameterDef[] = [{ name: 'p', type: 'dateRange', min: '2026-01-01', max: '2026-12-31' }];
    expect(resolveParameterValues(range, { p: { from: '2025-12-31', to: '2026-02-01' } }).ok).toBe(false);
    expect(resolveParameterValues(range, { p: { from: '2026-02-01', to: '2027-01-01' } }).ok).toBe(false);
    expect(resolveParameterValues(range, { p: { from: '2026-02-01', to: '2026-03-01' } }).ok).toBe(true);
  });

  it('keeps the legacy issue shape for existing callers', () => {
    const r = resolveParameterValues(defs, {}, { now });
    expect(!r.ok && r.issues).toEqual([{ name: 'branch', code: 'required', message: 'value is required' }]);
  });
});

describe('buildDataQuery: validated params reach the data source', () => {
  it('merges dataset.params with resolved values incl. relative defaults', () => {
    expect(buildDataQuery(report(), { branch: 'jed' }, { now })).toEqual({
      source: 'sales',
      params: { tenant: 't1', period: { from: '2026-10-01', to: '2026-10-31' }, branch: 'jed', asOf: '2026-10-14' },
    });
  });
  it('throws ParameterValidationError before any fetch when invalid', () => {
    expect(() => buildDataQuery(report(), { branch: 'dammam' }, { now })).toThrow(/branch/);
  });
});

describe('getParameterDefinitions', () => {
  it('normalizes definitions for a panel in the report locale', () => {
    const d = getParameterDefinitions(report(), { now });
    expect(d.map((x) => x.name)).toEqual(['period', 'branch', 'minTotal', 'asOf']);
    expect(d[0]).toMatchObject({
      type: 'dateRange',
      label: 'الفترة',
      required: true,
      defaultPreset: 'thisMonth',
      defaultValue: { from: '2026-10-01', to: '2026-10-31' },
    });
    expect(d[1]).toMatchObject({ label: 'الفرع', required: true, options: [{ value: 'ruh', label: 'الرياض' }, { value: 'jed', label: 'جدة' }] });
    expect(d[1]!.defaultValue).toBeUndefined();
    expect(d[2]).toMatchObject({ required: false, min: 0, max: 1000 });
    expect(d[3]).toMatchObject({ label: 'asOf', defaultValue: '2026-10-14', min: '2020-01-01', max: '2026-12-31' });
    expect(d[0]!.def).toMatchObject({ name: 'period', default: 'thisMonth' });
  });

  it('honours an explicit locale, accepts a plain array and old templates', () => {
    const d = getParameterDefinitions(defs, { locale: 'en', now });
    expect(d[0]!.label).toBe('Period');
    expect(d[1]!.options![0]!.label).toBe('Riyadh');
    expect(getParameterDefinitions({ parameters: undefined })).toEqual([]);
    expect(getParameterDefinitions(undefined)).toEqual([]);
  });

  it('exposes an options source and a description', () => {
    const d = getParameterDefinitions(
      [{ name: 'b', type: 'select', description: { ar: 'اختر الفرع', en: 'Pick a branch' }, options: { source: 'branches', valueField: 'id', labelField: 'name' } }],
      { locale: 'ar' },
    );
    expect(d[0]).toMatchObject({ description: 'اختر الفرع', optionsSource: { source: 'branches', valueField: 'id', labelField: 'name' } });
    expect(d[0]!.options).toBeUndefined();
  });
});

describe('validateParameterValues', () => {
  it('ok with the resolved values', () => {
    const r = validateParameterValues(report(), { branch: 'ruh', minTotal: '5' }, { now });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.fieldErrors).toEqual({});
    expect(r.values).toMatchObject({ branch: 'ruh', minTotal: 5, period: { from: '2026-10-01', to: '2026-10-31' } });
  });

  it('returns per-field Arabic messages (report locale) with rules', () => {
    const r = validateParameterValues(report(), { period: { from: '2026-10-20', to: '2026-10-01' }, minTotal: 1500 }, { now });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.name, e.rule])).toEqual([
      ['period', 'range'],
      ['branch', 'required'],
      ['minTotal', 'max'],
    ]);
    expect(r.fieldErrors).toEqual({
      period: 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية',
      branch: 'يجب إدخال الفرع',
      minTotal: 'يجب ألا تزيد القيمة عن ١٬٠٠٠',
    });
    expect(r.errors[1]).toMatchObject({ code: 'required', label: 'الفرع' });
  });

  it('returns English messages for locale en', () => {
    const r = validateParameterValues(report(), { branch: 'x', minTotal: 'abc', period: { from: '2026-10-01' }, asOf: '2019-01-01' }, { locale: 'en', now });
    expect(r.fieldErrors).toEqual({
      branch: 'Choose one of the available options',
      minTotal: 'Enter a valid number',
      period: 'Enter both the start and the end date',
      asOf: 'Must not be before 2020-01-01',
    });
  });

  it('localizes date digits for Arabic and number digits via formatNumber', () => {
    const r = validateParameterValues(report(), { branch: 'ruh', asOf: '2019-01-01', minTotal: -3 }, { locale: 'ar', now });
    // date bound isolated (U+2068 ... U+2069) so it is not reordered inside the RTL sentence (BUG-54)
    expect(r.fieldErrors.asOf).toBe('يجب ألا يكون التاريخ قبل \u2068٢٠٢٠-٠١-٠١\u2069');
    expect(r.fieldErrors.minTotal).toBe('يجب ألا تقل القيمة عن ٠');
  });

  it('formatParameterIssue falls back to the parameter name as label', () => {
    expect(formatParameterIssue({ rule: 'required' }, { name: 'year', type: 'number' }, 'en')).toBe('year is required');
    expect(formatParameterIssue({ rule: 'type' }, { name: 'd', type: 'date' }, 'ar-EG')).toBe('أدخل تاريخًا صالحًا (YYYY-MM-DD)');
  });
});

describe('loadParameterOptions', () => {
  it('returns static options localized', async () => {
    expect(await loadParameterOptions(defs[1]!, null, { locale: 'ar' })).toEqual([
      { value: 'ruh', label: 'الرياض' },
      { value: 'jed', label: 'جدة' },
    ]);
  });

  it('fetches source options through the adapter and maps value / label fields', async () => {
    const fetch = vi.fn(async () => [
      { id: 'ruh', name: { ar: 'الرياض', en: 'Riyadh' } },
      { id: 'jed', name: 'Jeddah' },
      { id: 'ruh', name: 'dup' },
      { id: null, name: 'no value' },
      { id: 'dmm', meta: { title: 'x' } },
    ]);
    const adapter: DataAdapter = { id: 'spy', fetch };
    const def: ParameterDef = { name: 'b', type: 'select', options: { source: 'branches', valueField: 'id', labelField: 'name' } };
    const out = await loadParameterOptions(def, adapter, { locale: 'ar-SA', params: { tenant: 't1' } });
    expect(fetch).toHaveBeenCalledWith({ source: 'branches', params: { tenant: 't1' } }, undefined);
    expect(out).toEqual([
      { value: 'ruh', label: 'الرياض' },
      { value: 'jed', label: 'Jeddah' },
      { value: 'dmm', label: 'dmm' },
    ]);
  });

  it('supports dotted paths and requires an adapter for a source', async () => {
    const adapter: DataAdapter = { id: 's', fetch: async () => [{ b: { id: 1, t: 'One' } }] };
    const def: ParameterDef = { name: 'b', type: 'select', options: { source: 's', valueField: 'b.id', labelField: 'b.t' } };
    expect(await loadParameterOptions(def, adapter)).toEqual([{ value: 1, label: 'One' }]);
    await expect(loadParameterOptions(def, null)).rejects.toThrow(/needs a data adapter/);
  });
});
