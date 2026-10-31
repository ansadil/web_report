import { describe, it, expect, vi } from 'vitest';
import type { DataDictionary, FieldMeta } from '@reports-web/shared';
import { buildDataDictionary, fieldPath, resolveLabel, SYSTEM_VARIABLES } from './dictionary.js';
import { createCustomAdapter } from '../adapters/data/custom.js';
import type { DataAdapter } from '../adapters/data/types.js';
import { createStaticAdapter } from '../adapters/data/static.js';
import { validateReport, type ReportSchemaV1 } from '../schema/report-schema.js';

const schema: Pick<ReportSchemaV1, 'dataset' | 'fields' | 'parameters'> = {
  dataset: { adapter: 'static', source: 'invoices' },
  fields: [
    { name: 'total', type: 'number', label: 'Total' },
    { name: 'logo', type: 'image' },
  ],
};

const described: Omit<DataDictionary, 'systemVariables'> = {
  sources: [
    {
      name: 'invoices',
      label: { ar: 'الفواتير', en: 'Invoices' },
      group: 'Sales',
      fields: [
        { name: 'customer', path: 'customer', type: 'string', children: [{ name: 'name', path: 'customer.name', type: 'string', label: { ar: 'اسم العميل', en: 'Customer name' } }] },
        {
          name: 'lines',
          path: 'lines',
          type: 'string',
          isList: true,
          children: [
            { name: 'qty', path: 'lines.qty', type: 'number', format: 'decimal2' },
            { name: 'photo', path: 'lines.photo', type: 'image' },
          ],
        },
      ],
    },
  ],
  relations: [{ from: 'invoices', fromField: 'customerId', to: 'customers', toField: 'id', name: 'customer' }],
};

describe('resolveLabel', () => {
  it('returns plain strings as-is', () => {
    expect(resolveLabel('Total', 'ar')).toBe('Total');
  });
  it('picks the requested locale', () => {
    expect(resolveLabel({ ar: 'الإجمالي', en: 'Total' }, 'ar')).toBe('الإجمالي');
    expect(resolveLabel({ ar: 'الإجمالي', en: 'Total' }, 'en')).toBe('Total');
  });
  it('falls back to en, then first value, then fallback', () => {
    expect(resolveLabel({ ar: 'الإجمالي', en: 'Total' }, 'fr')).toBe('Total');
    expect(resolveLabel({ ar: 'الإجمالي' }, 'en')).toBe('الإجمالي');
    expect(resolveLabel(undefined, 'en', 'total')).toBe('total');
    expect(resolveLabel({}, 'en', 'x')).toBe('x');
    expect(resolveLabel(undefined, 'en')).toBe('');
  });
});

describe('fieldPath', () => {
  it('defaults path to name', () => {
    expect(fieldPath({ name: 'amount' })).toBe('amount');
    expect(fieldPath({ name: 'name', path: 'customer.name' })).toBe('customer.name');
  });
});

describe('buildDataDictionary', () => {
  it('always provides system variables with ar/en labels', async () => {
    const d = await buildDataDictionary({ schema });
    expect(d.systemVariables.map((v) => v.token)).toEqual(['{page}', '{pages}', '{date}', '{reportName}']);
    for (const v of d.systemVariables) {
      expect(resolveLabel(v.label, 'ar')).not.toBe(resolveLabel(v.label, 'en'));
      expect(typeof v.label === 'object' && v.label['ar'] && v.label['en']).toBeTruthy();
    }
    expect(d.systemVariables).toBe(SYSTEM_VARIABLES);
  });

  it('falls back to schema.fields when no adapter', async () => {
    const d = await buildDataDictionary({ schema });
    expect(d.sources).toEqual([
      { name: 'invoices', fields: [{ name: 'total', type: 'number', label: 'Total' }, { name: 'logo', type: 'image' }] },
    ]);
    expect(d.relations).toBeUndefined();
    expect(d.parameters).toBeUndefined();
  });

  it('fallback merges adapter.introspect fields without duplicating schema fields', async () => {
    const adapter = createStaticAdapter({ tables: { invoices: [{ total: 5, date: '2026-01-01', paid: true }] } });
    const d = await buildDataDictionary({ schema, adapter });
    expect(d.sources[0]!.fields.map((f) => f.name)).toEqual(['total', 'logo', 'date', 'paid']);
    // schema declaration wins for an existing field
    expect(d.sources[0]!.fields[0]).toEqual({ name: 'total', type: 'number', label: 'Total' });
  });

  it('fallback passes dataset source/params and signal to introspect', async () => {
    const introspect = vi.fn(async (): Promise<readonly FieldMeta[]> => [{ name: 'x', type: 'string' }]);
    const adapter = createCustomAdapter({ fetch: async () => [], introspect });
    const ctl = new AbortController();
    await buildDataDictionary({
      schema: { ...schema, dataset: { adapter: 'custom', source: 'invoices', params: { year: 2026 } } },
      adapter,
      signal: ctl.signal,
    });
    expect(introspect).toHaveBeenCalledWith({ source: 'invoices', params: { year: 2026 } }, ctl.signal);
  });

  it('fallback survives introspect failure', async () => {
    const adapter = createCustomAdapter({ fetch: async () => [], introspect: async () => { throw new Error('boom'); } });
    const d = await buildDataDictionary({ schema, adapter });
    expect(d.sources[0]!.fields).toHaveLength(2);
  });

  it('uses adapter.describe() when present and preserves nested children / isList', async () => {
    const introspect = vi.fn(async (): Promise<readonly FieldMeta[]> => []);
    const adapter: DataAdapter = { id: 'meta', fetch: async () => [], introspect, describe: async () => described };
    const d = await buildDataDictionary({ schema, adapter });
    expect(introspect).not.toHaveBeenCalled();
    expect(d.sources).toEqual(described.sources);
    expect(d.relations).toEqual(described.relations);
    const lines = d.sources[0]!.fields[1]!;
    expect(lines.isList).toBe(true);
    expect(lines.children?.map(fieldPath)).toEqual(['lines.qty', 'lines.photo']);
    expect(lines.children?.[1]?.type).toBe('image');
    expect(resolveLabel(d.sources[0]!.fields[0]!.children?.[0]?.label, 'ar')).toBe('اسم العميل');
    expect(d.systemVariables).toHaveLength(4);
  });

  it('falls back to schema fields when describe() fails', async () => {
    const adapter: DataAdapter = { id: 'meta', fetch: async () => [], describe: async () => { throw new Error('nope'); } };
    const d = await buildDataDictionary({ schema, adapter });
    expect(d.sources[0]!.name).toBe('invoices');
    expect(d.sources[0]!.fields.map((f) => f.name)).toEqual(['total', 'logo']);
  });

  it('copies schema.parameters (validated template) and merges with described parameters (schema wins)', async () => {
    const v = validateReport({
      version: '1',
      id: 'r',
      meta: { name: 'R' },
      dataset: { adapter: 'static', source: 'invoices' },
      fields: [],
      bands: { detail: { height: 8 } },
      parameters: [
        { name: 'from', type: 'date', required: true },
        { name: 'branch', type: 'select', label: 'Branch (template)', options: { source: 'branches', valueField: 'id', labelField: 'name' } },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const plain = await buildDataDictionary({ schema: v.value });
    expect(plain.parameters).toEqual(v.value.parameters);

    const adapter: DataAdapter = {
      id: 'meta',
      fetch: async () => [],
      describe: async () => ({ ...described, parameters: [{ name: 'branch', type: 'string' }, { name: 'year', type: 'number' }] }),
    };
    const merged = await buildDataDictionary({ schema: v.value, adapter });
    expect(merged.parameters?.map((p) => p.name)).toEqual(['branch', 'year', 'from']);
    expect(merged.parameters?.find((p) => p.name === 'branch')?.label).toBe('Branch (template)');
  });

  it('rejects when the signal is already aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(buildDataDictionary({ schema, signal: ctl.signal })).rejects.toBeTruthy();
  });

  it('does not mutate inputs', async () => {
    const copy = structuredClone(schema);
    const adapter = createStaticAdapter({ tables: { invoices: [{ extra: 1 }] } });
    await buildDataDictionary({ schema, adapter });
    expect(schema).toEqual(copy);
  });
});
