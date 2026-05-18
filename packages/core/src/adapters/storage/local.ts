import type { ReportSchemaV1 } from '../../schema/report-schema.js';
import { validateReport } from '../../schema/report-schema.js';
import type { ReportSummary, StorageAdapter } from './types.js';

const PREFIX = 'reports-web:';

function key(id: string): string {
  return PREFIX + id;
}

export function createLocalStorageAdapter(storage: Storage = globalThis.localStorage): StorageAdapter {
  if (!storage) throw new Error('localStorage not available');
  return {
    id: 'local',
    async load(id) {
      const raw = storage.getItem(key(id));
      if (raw == null) throw new Error(`Report not found: ${id}`);
      const r = validateReport(JSON.parse(raw));
      if (!r.ok) throw new Error(r.error);
      return r.value;
    },
    async save(id, schema: ReportSchemaV1) {
      storage.setItem(key(id), JSON.stringify(schema));
    },
    async list(): Promise<readonly ReportSummary[]> {
      const out: ReportSummary[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(PREFIX)) {
          try {
            const v = JSON.parse(storage.getItem(k) ?? '');
            out.push({ id: v.id ?? k.slice(PREFIX.length), name: v.meta?.name ?? '(unnamed)', updatedAt: v.meta?.updatedAt });
          } catch {
            // ignore corrupted entries
          }
        }
      }
      return out;
    },
    async delete(id) {
      storage.removeItem(key(id));
    },
  };
}
