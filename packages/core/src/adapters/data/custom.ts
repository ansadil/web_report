import type { FieldMeta, Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from './types.js';

export interface CustomAdapterOptions {
  readonly fetch: (q: DataQuery, signal?: AbortSignal) => Promise<readonly Row[]>;
  readonly introspect?: (q: DataQuery, signal?: AbortSignal) => Promise<readonly FieldMeta[]>;
  readonly id?: string;
}

export function createCustomAdapter(opts: CustomAdapterOptions): DataAdapter {
  return {
    id: opts.id ?? 'custom',
    fetch: opts.fetch,
    ...(opts.introspect ? { introspect: opts.introspect } : {}),
  };
}
