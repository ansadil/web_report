import type { Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from './types.js';
import { toDescribeFn, type DescribeOption } from './describe.js';
import { logger } from '../../logging/logger.js';

export interface RestDataAdapterOptions {
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly extractRows?: (json: unknown) => readonly Row[];
  readonly method?: 'GET' | 'POST';
  readonly timeoutMs?: number;
  /** Optional data dictionary description (static object or async function, e.g. fetching a metadata endpoint). */
  readonly describe?: DescribeOption;
}

function defaultExtract(json: unknown): readonly Row[] {
  if (Array.isArray(json)) return json as Row[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Row[];
    if (Array.isArray(obj.rows)) return obj.rows as Row[];
    if (Array.isArray(obj.items)) return obj.items as Row[];
    if (Array.isArray(obj.results)) return obj.results as Row[];
  }
  throw new Error('REST adapter could not locate rows in the response payload');
}

/**
 * Serializes one query-string value. Dates become ISO strings; plain objects (e.g. a dateRange
 * `{ from, to }`) use bracket notation (`period[from]=...&period[to]=...`), which Laravel/PHP,
 * Rails and `qs` parse back into objects. Other values keep the previous `String(v)` behavior.
 */
function appendParam(sp: URLSearchParams, key: string, v: unknown): void {
  if (v == null) return;
  if (v instanceof Date) {
    sp.set(key, v.toISOString());
    return;
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, inner] of Object.entries(v as Record<string, unknown>)) appendParam(sp, `${key}[${k}]`, inner);
    return;
  }
  sp.set(key, String(v));
}

function buildUrl(baseUrl: string, q: DataQuery): string {
  const sep = baseUrl.endsWith('/') ? '' : '/';
  const url = new URL(`${baseUrl}${sep}${encodeURIComponent(q.source)}`, baseUrl.startsWith('http') ? undefined : 'http://placeholder');
  if (q.params) {
    for (const [k, v] of Object.entries(q.params)) appendParam(url.searchParams, k, v);
  }
  return baseUrl.startsWith('http') ? url.toString() : url.pathname + url.search;
}

export function createRestAdapter(opts: RestDataAdapterOptions): DataAdapter {
  const method = opts.method ?? 'GET';
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const extract = opts.extractRows ?? defaultExtract;
  return {
    id: 'rest',
    async fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]> {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(new Error('REST timeout')), timeoutMs);
      const onAbort = () => ctl.abort(signal?.reason);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        const url = method === 'GET' ? buildUrl(opts.baseUrl, q) : opts.baseUrl;
        const init: RequestInit = {
          method,
          headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
          signal: ctl.signal,
        };
        if (method === 'POST') {
          (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
          init.body = JSON.stringify({ source: q.source, params: q.params ?? {} });
        }
        const res = await fetch(url, init);
        if (!res.ok) throw new Error(`REST ${method} ${url} -> ${res.status}`);
        const json = (await res.json()) as unknown;
        return extract(json);
      } catch (e) {
        logger.error('rest-adapter', 'fetch failed', { source: q.source, error: e instanceof Error ? e.message : String(e) });
        throw e;
      } finally {
        clearTimeout(t);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    },
    ...(opts.describe ? { describe: toDescribeFn(opts.describe) } : {}),
  };
}
