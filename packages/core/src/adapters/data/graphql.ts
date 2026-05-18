import type { Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from './types.js';
import { logger } from '../../logging/logger.js';

export interface GraphQLAdapterOptions {
  readonly endpoint: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly buildQuery: (source: string, params: Readonly<Record<string, unknown>>) => { query: string; variables?: Readonly<Record<string, unknown>> };
  readonly extractRows?: (data: unknown, source: string) => readonly Row[];
  readonly timeoutMs?: number;
}

function defaultExtract(data: unknown, source: string): readonly Row[] {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const v = obj[source];
    if (Array.isArray(v)) return v as Row[];
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) return value as Row[];
    }
  }
  throw new Error('GraphQL adapter could not locate rows in the response');
}

export function createGraphQLAdapter(opts: GraphQLAdapterOptions): DataAdapter {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const extract = opts.extractRows ?? defaultExtract;
  return {
    id: 'graphql',
    async fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]> {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(new Error('GraphQL timeout')), timeoutMs);
      const onAbort = () => ctl.abort(signal?.reason);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        const { query, variables } = opts.buildQuery(q.source, q.params ?? {});
        const res = await fetch(opts.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers ?? {}) },
          body: JSON.stringify({ query, variables: variables ?? {} }),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
        const body = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
        if (body.errors && body.errors.length > 0) {
          throw new Error(`GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
        }
        return extract(body.data, q.source);
      } catch (e) {
        logger.error('graphql-adapter', 'fetch failed', { source: q.source, error: e instanceof Error ? e.message : String(e) });
        throw e;
      } finally {
        clearTimeout(t);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
