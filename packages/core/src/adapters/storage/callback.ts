import type { ReportSchemaV1 } from '../../schema/report-schema.js';
import { validateReport } from '../../schema/report-schema.js';
import type { ReportSummary, StorageAdapter } from './types.js';

export interface CallbackStorageOptions {
  readonly id?: string;
  readonly load: (id: string) => Promise<unknown>;
  readonly save: (id: string, schema: ReportSchemaV1) => Promise<void>;
  readonly list?: () => Promise<readonly ReportSummary[]>;
  readonly delete?: (id: string) => Promise<void>;
}

export function createCallbackStorage(opts: CallbackStorageOptions): StorageAdapter {
  return {
    id: opts.id ?? 'callback',
    async load(id) {
      const raw = await opts.load(id);
      const r = validateReport(raw);
      if (!r.ok) throw new Error(r.error);
      return r.value;
    },
    save(id, schema) {
      return opts.save(id, schema);
    },
    ...(opts.list ? { list: opts.list } : {}),
    ...(opts.delete ? { delete: opts.delete } : {}),
  };
}
