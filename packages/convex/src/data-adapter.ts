import type { FunctionReference } from 'convex/server';
import type { Row } from '@reports-web/shared';
import type { DataAdapter, DataQuery } from '@reports-web/core/adapters/data/types';
import { toDescribeFn, type DescribeOption } from '@reports-web/core/adapters/data/describe';

/** Arguments the Convex query / HTTP action receives. */
export interface ConvexDataRequest {
  readonly source: string;
  /** Resolved report parameters; `Date`s are ISO strings, `undefined` values are dropped. */
  readonly params: Record<string, unknown>;
}

interface QueryClient {
  query(ref: FunctionReference<'query'>, args: Record<string, unknown>): Promise<unknown>;
}

interface BaseOptions {
  readonly id?: string;
  readonly describe?: DescribeOption;
  /** Pull rows out of the response. Default: an array, or `{ rows | data | items }`. */
  readonly extractRows?: (result: unknown) => readonly Row[];
}
export interface ConvexQueryDataAdapterOptions extends BaseOptions {
  readonly client: QueryClient;
  /** A query taking `{ source, params }` (see {@link ConvexDataRequest}). */
  readonly query: FunctionReference<'query'>;
}
export interface ConvexHttpDataAdapterOptions extends BaseOptions {
  /** URL of a Convex HTTP action (`https://<deployment>.convex.site/reports/data`); receives a JSON POST of {@link ConvexDataRequest}. */
  readonly httpUrl: string;
  readonly headers?: Readonly<Record<string, string>> | (() => Promise<Record<string, string>> | Record<string, string>);
  readonly fetch?: typeof globalThis.fetch;
}
export type ConvexDataAdapterOptions = ConvexQueryDataAdapterOptions | ConvexHttpDataAdapterOptions;

function serialize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v as Record<string, unknown>)) if (inner !== undefined) out[k] = serialize(inner);
    return out;
  }
  return v;
}

function defaultExtract(result: unknown): readonly Row[] {
  if (Array.isArray(result)) return result as Row[];
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const k of ['rows', 'data', 'items']) if (Array.isArray(o[k])) return o[k] as Row[];
  }
  throw new Error('response contains no rows (expected an array or { rows })');
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * {@link DataAdapter} that loads report rows from a Convex query (through a Convex client) or
 * from a Convex HTTP action. Errors are rethrown as `Error("Convex data source \"<source>\" failed: ...")`
 * with the original error as `cause`.
 */
export function createConvexDataAdapter(opts: ConvexDataAdapterOptions): DataAdapter {
  const extract = opts.extractRows ?? defaultExtract;
  const describe = opts.describe !== undefined ? toDescribeFn(opts.describe) : undefined;

  async function run(req: ConvexDataRequest, signal?: AbortSignal): Promise<unknown> {
    if ('query' in opts) {
      // Convex clients cannot cancel a one-shot query; ignore its result once aborted.
      const p = opts.client.query(opts.query, { source: req.source, params: req.params });
      if (!signal) return p;
      if (signal.aborted) throw abortError(signal);
      return await new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError(signal));
        signal.addEventListener('abort', onAbort, { once: true });
        p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
      });
    }
    const f = opts.fetch ?? globalThis.fetch;
    const extra = typeof opts.headers === 'function' ? await opts.headers() : (opts.headers ?? {});
    const res = await f(opts.httpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...extra },
      body: JSON.stringify(req),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
    }
    return res.json();
  }

  const adapter: DataAdapter = {
    id: opts.id ?? 'convex',
    async fetch(q: DataQuery, signal?: AbortSignal): Promise<readonly Row[]> {
      const req: ConvexDataRequest = { source: q.source, params: serialize(q.params ?? {}) as Record<string, unknown> };
      try {
        return extract(await run(req, signal));
      } catch (e) {
        if (signal?.aborted) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Convex data source "${q.source}" failed: ${msg}`, { cause: e });
      }
    },
    ...(describe ? { describe } : {}),
  };
  return adapter;
}

/** Alias kept for symmetry with `ConvexTemplateStore`. */
export const ConvexDataAdapter = createConvexDataAdapter;
