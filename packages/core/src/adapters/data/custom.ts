import type { FieldMeta, Row } from '@reports-web/shared';
import type { DataAdapter, DataDictionaryDescription, DataQuery } from './types.js';

export interface CustomAdapterOptions {
  readonly fetch: (q: DataQuery, signal?: AbortSignal) => Promise<readonly Row[]>;
  readonly introspect?: (q: DataQuery, signal?: AbortSignal) => Promise<readonly FieldMeta[]>;
  readonly describe?: () => Promise<DataDictionaryDescription>;
  readonly id?: string;
}

export function createCustomAdapter(opts: CustomAdapterOptions): DataAdapter {
  return {
    id: opts.id ?? 'custom',
    fetch: opts.fetch,
    ...(opts.introspect ? { introspect: opts.introspect } : {}),
    ...(opts.describe ? { describe: opts.describe } : {}),
  };
}
