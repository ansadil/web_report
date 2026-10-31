import { describe, it, expect, expectTypeOf } from 'vitest';
import type { DataDictionary, DictField, FieldMeta, FieldType, LocalizedText, ParameterDef } from './types.js';

describe('data dictionary types', () => {
  it('legacy FieldMeta objects remain valid', () => {
    const legacy: FieldMeta = { name: 'amount', type: 'number', label: 'Amount' };
    expect(legacy.path).toBeUndefined();
  });

  it('FieldType includes image', () => {
    expectTypeOf<'image'>().toMatchTypeOf<FieldType>();
    const logo: FieldMeta = { name: 'logo', type: 'image' };
    expect(logo.type).toBe('image');
  });

  it('DictField is the extended FieldMeta with nested children', () => {
    expectTypeOf<DictField>().toEqualTypeOf<FieldMeta>();
    const f: DictField = {
      name: 'lines',
      path: 'lines',
      type: 'string',
      isList: true,
      group: 'Invoice',
      format: 'decimal2',
      description: { ar: 'بنود الفاتورة', en: 'Invoice lines' },
      children: [{ name: 'qty', path: 'lines.qty', type: 'number' }],
    };
    expect(f.children?.[0]?.path).toBe('lines.qty');
  });

  it('LocalizedText accepts string or locale map', () => {
    expectTypeOf<string>().toMatchTypeOf<LocalizedText>();
    expectTypeOf<{ ar: string; en: string }>().toMatchTypeOf<LocalizedText>();
  });

  it('DataDictionary / ParameterDef shapes', () => {
    const p: ParameterDef = {
      name: 'branch',
      type: 'select',
      required: true,
      options: { source: 'branches', valueField: 'id', labelField: 'name' },
    };
    const d: DataDictionary = {
      sources: [{ name: 'invoices', label: { ar: 'الفواتير', en: 'Invoices' }, fields: [{ name: 'total', type: 'number' }] }],
      relations: [{ from: 'invoices', fromField: 'customerId', to: 'customers', toField: 'id' }],
      parameters: [p],
      systemVariables: [{ token: '{page}', label: 'Page', type: 'number' }],
    };
    expect(d.sources[0]?.name).toBe('invoices');
  });
});
