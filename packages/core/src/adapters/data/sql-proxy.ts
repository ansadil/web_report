import type { Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from './types.js';
import { logger } from '../../logging/logger.js';

export interface SqlProxyAdapterOptions {
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly buildBody?: (source: string, params: Readonly<Record<string, unknown>>) => unknown;
  readonly extractRows?: (json: unknown) => readonly Row[];
  readonly timeoutMs?: number;
}

function defaultBody(source: string, params: Readonly<Record<string, unknown>>): unknown {
  return { query: source, bindings: params };
}

function defaultExtract(json: unknown): readonly Row[] {
  if (Array.isArray(json)) return json as Row[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows as Row[];
    if (Array.isArray(obj.data)) return obj.data as Row[];
  }
  throw new Error('SQL-Proxy adapter could not locate rows');
}

export function createSqlProxyAdapter(opts: SqlProxyAdapterOptions): DataAdapter {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const buildBody = opts.buildBody ?? defaultBody;
  const extract = opts.extractRows ?? defaultExtract;
  return {
    id: 'sql-proxy',
    async fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]> {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(new Error('SQL-Proxy timeout')), timeoutMs);
      const onAbort = () => ctl.abort(signal?.reason);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetch(opts.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers ?? {}) },
          body: JSON.stringify(buildBody(q.source, q.params ?? {})),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`SQL-Proxy HTTP ${res.status}`);
        return extract(await res.json());
      } catch (e) {
        logger.error('sql-proxy-adapter', 'fetch failed', { source: q.source, error: e instanceof Error ? e.message : String(e) });
        throw e;
      } finally {
        clearTimeout(t);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
