import type { FieldMeta, FieldType, Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from './types.js';

export interface StaticDataAdapterOptions {
  readonly tables: Readonly<Record<string, readonly Row[]>>;
}

function inferType(value: unknown): FieldType {
  if (value == null) return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'bool';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  return 'string';
}

export function createStaticAdapter(opts: StaticDataAdapterOptions): DataAdapter {
  return {
    id: 'static',
    async fetch(q: DataQuery): Promise<readonly Row[]> {
      const rows = opts.tables[q.source];
      if (!rows) throw new Error(`Static dataset not found: ${q.source}`);
      return rows;
    },
    async introspect(q: DataQuery): Promise<readonly FieldMeta[]> {
      const rows = opts.tables[q.source];
      if (!rows || rows.length === 0) return [];
      const first = rows[0]!;
      return Object.keys(first).map((name) => ({ name, type: inferType(first[name]) }));
    },
  };
}
