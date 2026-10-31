import { describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { anyApi, type FunctionReference } from 'convex/server';
import schema from './test/convex/schema.js';
import { createConvexDataAdapter } from './index.js';

const modules = import.meta.glob('./test/convex/**/*.ts');
const rowsRef = (anyApi as unknown as { data: { rows: FunctionReference<'query'> } }).data.rows;

describe('createConvexDataAdapter (query)', () => {
  it('passes source and resolved params (Dates as ISO, undefined dropped) to the Convex query', async () => {
    const t = convexTest(schema, modules);
    const adapter = createConvexDataAdapter({ client: t, query: rowsRef });
    const rows = await adapter.fetch({ source: 'invoices', params: { from: new Date(Date.UTC(2026, 0, 1)), status: 'paid', skip: undefined, range: { to: '2026-02-01' } } });
    expect(rows).toEqual([{ source: 'invoices', from: '2026-01-01T00:00:00.000Z', status: 'paid', range: { to: '2026-02-01' } }]);
    expect(adapter.id).toBe('convex');
    expect(adapter.describe).toBeUndefined();
  });

  it('surfaces query errors with the source name and the original cause', async () => {
    const t = convexTest(schema, modules);
    const adapter = createConvexDataAdapter({ id: 'cx', client: t, query: rowsRef });
    const err = (await adapter.fetch({ source: 'boom' }).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/^Convex data source "boom" failed: .*source unavailable/);
    expect((err.cause as { data?: unknown }).data).toBe('source unavailable');
  });

  it('honours an aborted signal', async () => {
    const client = { query: () => new Promise<unknown>(() => {}) };
    const adapter = createConvexDataAdapter({ client, query: rowsRef });
    const ac = new AbortController();
    const p = adapter.fetch({ source: 's' }, ac.signal);
    ac.abort(new Error('cancelled'));
    await expect(p).rejects.toThrow('cancelled');
  });

  it('exposes describe() when given', async () => {
    const adapter = createConvexDataAdapter({ client: { query: async () => [] }, query: rowsRef, describe: { sources: [] } as never });
    expect(await adapter.describe!()).toEqual({ sources: [] });
  });
});

describe('createConvexDataAdapter (HTTP action)', () => {
  it('POSTs { source, params } as JSON and reads { rows }', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rows: [{ a: 1 }] }), { status: 200 }));
    const adapter = createConvexDataAdapter({ httpUrl: 'https://x.convex.site/reports/data', fetch, headers: async () => ({ authorization: 'Bearer t' }) });
    expect(await adapter.fetch({ source: 'orders', params: { d: new Date(0), n: 2 } })).toEqual([{ a: 1 }]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.convex.site/reports/data');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(init.body as string)).toEqual({ source: 'orders', params: { d: '1970-01-01T00:00:00.000Z', n: 2 } });
  });

  it('surfaces HTTP errors with status and body', async () => {
    const fetch = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const adapter = createConvexDataAdapter({ httpUrl: 'https://x.convex.site/d', fetch });
    await expect(adapter.fetch({ source: 'orders' })).rejects.toThrow('Convex data source "orders" failed: HTTP 403: forbidden');
  });

  it('rejects a payload without rows', async () => {
    const fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    const adapter = createConvexDataAdapter({ httpUrl: 'https://x.convex.site/d', fetch });
    await expect(adapter.fetch({ source: 'o' })).rejects.toThrow(/no rows/);
  });
});
